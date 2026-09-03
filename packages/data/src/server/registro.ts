import "server-only";

import { z } from "zod";

import { createHmac } from "node:crypto";

import { isTelValido, telDigits } from "@gym/format";

import type { Database } from "../database.types";
import { enEsperaReenvio, registrarReenvio } from "./reenvio-limite";
import { createClient, type SupabaseServer } from "./supabase";

/**
 * Member self-registration + verified-email claim DAL (ADR-0009 as amended
 * 2026-07-02). The write seam behind the client app's unstyled `/registro` +
 * `/auth/confirm` flow: `registrarSocio` signs the person up (email+password) and
 * stashes their OWN name + phone in the auth user's metadata; the atomic definer
 * RPC `reclamar_o_crear_cliente` (invoked post-verification by `reclamarCliente`)
 * LINKS their VERIFIED email to an unclaimed `cliente` in the host-resolved gym and
 * writes the `gym_membership(member)` row in one transaction. Since R1 (2026-09-03)
 * it can do nothing else: no match is a refusal, never a fresh row. The gym is NEVER a field here: it is re-resolved server-side from
 * the host and passed to the RPC (ADR-0008/0009 server-authoritative gym).
 */

// One required checkbox stamps BOTH terms + privacy acceptance (ADR-0009); the DB
// rules it mirrors: nombre NOT NULL, and a tel of 10 digits when one is given
// (clientes_tel_10_digits_ck). The phone requirement below is THIS door's alone — the
// column is optional since #190 and the claim RPC no longer raises 'Teléfono requerido'
// (R1: it guarded a create branch that no longer exists). Kept here because a signup
// form is where a reachable number is worth asking for, not because anything downstream
// depends on one.
export const registroSchema = z.object({
  nombre: z.string().trim().min(3, "El nombre es demasiado corto"),
  email: z.string().trim().email("Correo inválido"),
  // Trimmed BEFORE the floor is measured, on the same rule `iniciarSesion` verifies with
  // (sesion.ts): a password stored with an autofilled trailing space could never be typed
  // back identically, so the member met a "wrong password" on a password that was right.
  password: z.string().trim().min(8, "La contraseña debe tener al menos 8 caracteres"),
  telefono: z.string().refine(isTelValido, "Teléfono inválido (10 dígitos)"),
  acepta: z
    .boolean()
    .refine((v) => v === true, "Debes aceptar los términos y el aviso de privacidad"),
});

export type RegistroInput = z.infer<typeof registroSchema>;

/** MX national 10-digit number → E.164 (`+52` + the stripped digits). */
export function telefonoAE164(telefono: string): string {
  return `+52${telDigits(telefono)}`;
}

/** An invite code as it rides the `?codigo=` query param: 8 chars from the
 *  A-Z/2-9 alphabet (ADR-0015), case-normalized. Kept private — the edges below
 *  validate through `parseCodigoInvitacion`. */
const codigoInvitacionSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/);

/** Normalize + validate an invite code from an untrusted query param; `null` when
 *  it isn't a well-formed code, so every entry point (registro page, confirm route,
 *  register action) degrades to a plain signup instead of throwing on junk input. */
export function parseCodigoInvitacion(raw: unknown): string | null {
  const parsed = codigoInvitacionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The claim RPC's row DTO, DERIVED from the generated types so it cannot drift
 *  from the migration's `returns table(cliente_id, reclamado)`. */
type ReclamoCliente =
  Database["public"]["Functions"]["reclamar_o_crear_cliente"]["Returns"][number];

/**
 * signUp outcome — a discriminated result so the action renders one message surface
 * without throwing on the expected validation/duplicate paths. The three `ok:true`
 * arms are the three DIFFERENT things GoTrue does, which this door used to collapse
 * into one identical "Revisa tu correo" screen (incident 2026-08-30, FC-02/FC-18):
 *
 * - `nuevo` — a first confirmation mail was sent.
 * - `yaEnviado` — the address already had a pending unconfirmed signup, so the mail
 *   GoTrue just sent REPLACED the previous link (`auth.one_time_tokens` is UNIQUE on
 *   `(user_id, token_type)`, so the older mail in that inbox is now dead). The screen
 *   has to say which mail to open; reporting plain success is what wedged a member.
 * - `cuentaExistente` — the address is already CONFIRMED and NO mail was sent at all.
 */
export type RegistroResultado =
  | { ok: true; estado: "nuevo"; requiereConfirmacion: boolean }
  | { ok: true; estado: "yaEnviado" }
  | { ok: true; estado: "cuentaExistente" }
  | { ok: false; error: string };

const DEMASIADOS_CORREOS =
  "Ya enviamos varios correos a esta dirección. Espera unos minutos antes de volver a intentarlo.";
const ERROR_GENERICO = "No pudimos crear tu cuenta. Inténtalo de nuevo en unos minutos.";

/** GoTrue codes → es-MX, the map `sesion.ts` already keeps for login (:16-25). Until now
 *  this door rendered `error.message` verbatim, so a Spanish signup form answered in
 *  English (FC-19). An unmapped code falls back rather than leaking the raw string. */
const ERRORES_SIGNUP: Record<string, string> = {
  over_email_send_rate_limit: DEMASIADOS_CORREOS,
  email_address_invalid: "Ese correo no es válido. Revísalo e inténtalo de nuevo.",
  weak_password: "Esa contraseña es muy débil. Usa al menos 8 caracteres y combina letras y números.",
  signup_disabled: "El registro está cerrado en este momento. Pide tu acceso en el gimnasio.",
};

function mensajeDeError(error: {
  code?: string | undefined;
  status?: number | undefined;
}): string {
  const mapeado = error.code ? ERRORES_SIGNUP[error.code] : undefined;
  if (mapeado) return mapeado;
  // Any other 429-class code the SDK adds later is still a throttle, not a bad password.
  if (error.status === 429) return DEMASIADOS_CORREOS;
  return ERROR_GENERICO;
}

/** How fresh `auth.users.created_at` has to be for the returned row to be the one this
 *  request just created. Wide enough to absorb clock skew between GoTrue and this
 *  process; landing on the wrong side of it only costs the more generic screen for a
 *  mail that was in fact just sent. */
const VENTANA_NUEVO_MS = 60 * 1000;

/**
 * Self-register a socio. Validates the intake, then `signUp` with the person's
 * name + E.164 phone in `options.data` (→ `auth.users.raw_user_meta_data`, which
 * the claim RPC reads on the create path). Confirm-email-required means no session
 * exists until verification, so `requiereConfirmacion` is `session === null`.
 * `client` is injectable for tests (ADR-0001).
 *
 * Reading WHICH outcome happened is the point (see `RegistroResultado`). GoTrue answers
 * an already-confirmed address with a freshly-minted fake user carrying no identities
 * and sends nothing (`sanitizeUser`); an already-pending one comes back verbatim, with
 * its original `created_at`, after the confirmation was re-sent and the previous token
 * rotated away. Both used to render as "Revisa tu correo".
 */
export async function registrarSocio(
  raw: unknown,
  opts: { emailRedirectTo: string },
  client?: SupabaseServer,
): Promise<RegistroResultado> {
  const parsed = registroSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const input = parsed.data;
  const ahora = Date.now();
  // A reload, a double-tap or an impatient resubmit is not a new intent. Answering it from
  // memory is what keeps the retry from rotating the link the member is already holding.
  // The counter is `./reenvio-limite`'s — the SAME one both resend doors spend, so this
  // door and `/entrar`'s rescue button cannot take turns doubling one address's budget.
  // Checked here and charged below rather than in one call: GoTrue answers an
  // already-confirmed address without mailing anything, and that arm must spend nothing.
  if (enEsperaReenvio(input.email, ahora)) return { ok: true, estado: "yaEnviado" };

  const supabase = client ?? (await createClient());

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: opts.emailRedirectTo,
      data: { full_name: input.nombre, phone_e164: telefonoAE164(input.telefono) },
    },
  });
  if (error) {
    // The member now gets a mapped message, so the raw code/status only survives here —
    // same structured shape `solicitarReset` uses, and never the address.
    console.warn(
      JSON.stringify({
        event: "registro-signup-error",
        code: error.code,
        status: error.status,
        error: error.message,
      }),
    );
    return { ok: false, error: mensajeDeError(error) };
  }
  // No mail was sent on this arm, so it must not spend the throttle either.
  if (data.user?.identities?.length === 0) return { ok: true, estado: "cuentaExistente" };

  registrarReenvio(input.email, ahora);
  const creado = Date.parse(data.user?.created_at ?? "");
  if (Number.isFinite(creado) && ahora - creado > VENTANA_NUEVO_MS) {
    return { ok: true, estado: "yaEnviado" };
  }
  return { ok: true, estado: "nuevo", requiereConfirmacion: data.session === null };
}

/**
 * The tenant firma (spec 2026-07-13 §1.5, ruling D2): HMAC-SHA256 over
 * `uid:gymId` with a key only the server and the DB (Vault) hold. The RPC
 * verifies it, so `p_gym_id` is bound to the HOST-RESOLVED tenant — a direct
 * PostgREST caller naming an arbitrary gym cannot forge the signature, which is
 * the only un-spoofable channel available (the DB cannot observe the host, and
 * headers/user-metadata are caller-controlled).
 */
function firmaTenant(userId: string, gymId: string): string {
  const key = process.env.TENANT_ASSERTION_KEY;
  if (!key) throw new Error("TENANT_ASSERTION_KEY no configurada");
  return createHmac("sha256", key).update(`${userId}:${gymId}`).digest("hex");
}

/**
 * Post-verification claim. `gymId` is the caller's host-resolved tenant,
 * passed by the confirm route — NEVER a client field (ADR-0009), and since D2 it is
 * accompanied by the server-only tenant firma the RPC verifies. The RPC re-checks
 * `email_confirmed_at` (defense-in-depth), matches on VERIFIED email only (phone never
 * claims), and commits the member membership atomically. LINK-ONLY since R1: a gym that
 * holds no unclaimed row for this address gets no cliente and no membership out of the
 * call — it raises, and the `intentar*` ceremony turns that into a value.
 *
 * `avisoVersion` (#257) is the aviso de privacidad version the caller ACTUALLY rendered
 * to the member (the caller must pass `AVISO_PRIVACIDAD_VERSION` from `@gym/domain/legal`
 * — never a hardcoded string here), or `null` when no aviso was rendered / the gym's legal
 * identity wasn't complete at render time (final review round, Important 1 — stamping the
 * constant unconditionally would fabricate consent evidence for text the member never saw).
 * The RPC stamps whichever value onto `clientes.privacy_aviso_version` alongside
 * `privacy_accepted_at`. There is no terms-of-service version (Gate 0.1 scope cut):
 * `terms_accepted_at` stays a bare timestamp. `?? undefined` at the RPC boundary: the
 * generated `p_aviso_version` arg type is optional-only (no `| null`), the same shape
 * `aceptarAcuerdo`'s `p_ip`/`p_user_agent` already use for a nullable optional param.
 *
 * PRIVATE: the throwing primitive. Doors go through `intentarReclamoPorEmail` below, so
 * "a refused claim never strands an authenticated member" is decided once, not per door.
 */
async function reclamarCliente(
  gymId: string,
  avisoVersion: string | null,
  client?: SupabaseServer,
): Promise<ReclamoCliente> {
  const supabase = client ?? (await createClient());
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) throw new Error("No autenticado");
  const { data, error } = await supabase
    .rpc("reclamar_o_crear_cliente", {
      p_gym_id: gymId,
      p_firma: firmaTenant(uid, gymId),
      p_aviso_version: avisoVersion ?? undefined,
    })
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo completar el registro");
  }
  return data;
}

/** The invite-code claim RPC's row DTO (the gym slug for the post-claim redirect),
 *  derived from the generated types so it can't drift from the migration. */
type ReclamoPorCodigo =
  Database["public"]["Functions"]["reclamar_por_codigo"]["Returns"][number];

/**
 * The activation firma (audit 2026-07-22 §3): HMAC-SHA256 over the domain-tagged
 * `activar:v1:${codigo}` with the tenant-assertion key only the server and the DB
 * (Vault) hold. The RPC verifies it, so `reclamar_por_codigo` can no longer be invoked
 * with just a code — a direct PostgREST caller (H1) or an attacker-appended `&codigo=`
 * with no matching firma (H2) fails closed. The `activar:v1:` prefix domain-separates
 * this from `reclamar_o_crear_cliente`'s `uid:gym_id` firma and the edge fn's
 * `codigo:email`. The caller passes the SAME (parsed/uppercased) code to both this and
 * `p_codigo`; the digest is over the literal code, no normalization here.
 */
export function firmaCodigo(codigo: string): string {
  const key = process.env.TENANT_ASSERTION_KEY;
  if (!key) throw new Error("TENANT_ASSERTION_KEY no configurada");
  return createHmac("sha256", key).update(`activar:v1:${codigo}`).digest("hex");
}

/**
 * Invite-token claim (ADR-0015 primary rail). Binds the caller's verified login to
 * the EXACT paid `clientes` row the code names — the code resolves the row, the row
 * resolves the gym, so no `gymId` (or host) is passed: gym is not an authz input.
 * `firma` is the server-minted `firmaCodigo` (audit §3), minted inline by the server-gated
 * callers that remain (`/activar`'s vincular short-circuit, the set-password step). The
 * URL-borne-firma door is gone with the magic-link rail (R2), so an unverified firma from
 * an untrusted query param no longer reaches this RPC at all. The definer RPC re-checks the verified email, overwrites the row
 * email, clears the code, and upserts membership; it THROWS on a bad firma / dead code /
 * already-owned row, so the caller (confirm route) swallows to keep a verified account
 * from stranding.
 *
 * `avisoVersion` (#257) is the aviso de privacidad version the caller ACTUALLY rendered
 * to the member (`AVISO_PRIVACIDAD_VERSION` from `@gym/domain/legal` — never hardcoded
 * here), or `null` when no aviso was rendered on this rail (final review round, Important 1)
 * — stamped onto `clientes.privacy_aviso_version` alongside `privacy_accepted_at`.
 * No terms-of-service version exists (Gate 0.1 scope cut): `terms_accepted_at` stays bare.
 *
 * PRIVATE: the throwing primitive. Doors go through `intentarReclamoPorCodigo` below.
 */
async function reclamarPorCodigo(
  codigo: string,
  firma: string,
  avisoVersion: string | null,
  client?: SupabaseServer,
): Promise<ReclamoPorCodigo> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .rpc("reclamar_por_codigo", { p_codigo: codigo, p_firma: firma, p_aviso_version: avisoVersion ?? undefined })
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo reclamar la invitación");
  }
  return data;
}

/**
 * El reclamo del socio — the claim ceremony, one home.
 *
 * The SQL is already centralized (`reclamar_o_crear_cliente`, `reclamar_por_codigo`); what
 * was re-decided at every door is the ceremony AROUND it: which rail, what to pass, and —
 * every single time — the same verdict on a refusal. `ReclamoResultado` makes that verdict a
 * VALUE: `ok:false` carries the RPC's own refusal message instead of a throw, so a door that
 * wants to act on a refusal can, without writing another bare `catch {}`.
 */
export type ReclamoResultado = { ok: true } | { ok: false; motivo: string };

/**
 * Run a claim best-effort. Every expected refusal is a value here, never a throw: a
 * dead/already-used code, a row the caller already owns in this gym, a bad or absent firma,
 * an unverified email, a missing `TENANT_ASSERTION_KEY`. That is the rule all five doors
 * already applied by hand (`/auth/confirm`, `/activar`'s vincular short-circuit,
 * `completarActivacion`'s set-password step, `/reservar`'s defense-in-depth retry): a claim
 * only ever runs for an ALREADY-authenticated caller, so a refused claim must never strand
 * them — they reach the app either way and an operator reconciles. Both RPCs are idempotent
 * (`reclamar_o_crear_cliente` re-upserts the membership and returns `reclamado:false`;
 * `reclamar_por_codigo` refuses a spent code), so re-entry is a success path, not a double
 * write. The claim callback is invoked INSIDE the catch's reach so firma minting refuses the
 * same way the RPC does — the shape every door already had.
 */
async function intentarReclamo(reclamo: () => Promise<unknown>): Promise<ReclamoResultado> {
  try {
    await reclamo();
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "No se pudo reclamar" };
  }
}

/**
 * Invite-code claim from a SERVER-GATED door (ADR-0015 primary rail): the firma is minted
 * HERE from the code, so only a caller holding `TENANT_ASSERTION_KEY` can produce one. Used
 * by `/activar`'s one-click vincular and by `completarActivacion`'s set-password step.
 * `avisoVersion` is the aviso the DOOR actually rendered, or `null` when it rendered none.
 */
export function intentarReclamoPorCodigo(
  codigo: string,
  avisoVersion: string | null,
  client?: SupabaseServer,
): Promise<ReclamoResultado> {
  return intentarReclamo(() => reclamarPorCodigo(codigo, firmaCodigo(codigo), avisoVersion, client));
}

/**
 * Verified-EMAIL claim in the host-resolved gym (ADR-0009 fallback rail). `gymId` is the
 * door's ALREADY-resolved tenant: the gym is a host fact each door resolves for itself
 * (`resolveTenant`, never a client field — ADR-0008/0009), and `/auth/confirm` needs the
 * resolved slug for its aviso lookup anyway, so resolution stays at the door. Since R2 the
 * client app funnels every caller through ONE door-side helper (`lib/reclamo.ts`), which runs
 * this at every session mint: login, `/auth/confirm` (recovery included), and the two
 * self-heal pages.
 */
export function intentarReclamoPorEmail(
  gymId: string,
  avisoVersion: string | null,
  client?: SupabaseServer,
): Promise<ReclamoResultado> {
  return intentarReclamo(() => reclamarCliente(gymId, avisoVersion, client));
}

/** The pre-signup invite projection DTO ({gym nombre, gym slug, cliente nombre}). */
export type InvitacionInfo =
  Database["public"]["Functions"]["invitacion_info"]["Returns"][number];

/**
 * Pre-signup lookup for `/activar?codigo=` — returns the {gym, member first name}
 * identity banner for a valid unclaimed code, or `null` for an unknown/dead code
 * (the page then degrades to a plain signup). Bearer-token disclosure by design
 * (ADR-0015): holding the code reveals a first name + gym, nothing more.
 */
export async function invitacionInfo(
  codigo: string,
  client?: SupabaseServer,
): Promise<InvitacionInfo | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .rpc("invitacion_info", { p_codigo: codigo })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
