import "server-only";

import { z } from "zod";

import { createHmac } from "node:crypto";

import { isTelValido, telDigits } from "@gym/format";

import type { Database } from "../database.types";
import { createClient, type SupabaseServer } from "./supabase";

/**
 * Member self-registration + verified-email claim DAL (ADR-0009 as amended
 * 2026-07-02). The write seam behind the client app's unstyled `/registro` +
 * `/auth/confirm` flow: `registrarSocio` signs the person up (email+password) and
 * stashes their OWN name + phone in the auth user's metadata; the atomic definer
 * RPC `reclamar_o_crear_cliente` (invoked post-verification by `reclamarCliente`)
 * matches their VERIFIED email to an unclaimed `cliente` in the host-resolved gym
 * — else mints a fresh one — and writes the `gym_membership(member)` row in one
 * transaction. The gym is NEVER a field here: it is re-resolved server-side from
 * the host and passed to the RPC (ADR-0008/0009 server-authoritative gym).
 */

// One required checkbox stamps BOTH terms + privacy acceptance (ADR-0009); the DB
// rules it mirrors: nombre NOT NULL, tel = 10 digits (clientes_tel_10_digits_ck).
export const registroSchema = z.object({
  nombre: z.string().trim().min(3, "El nombre es demasiado corto"),
  email: z.string().trim().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
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
export type ReclamoCliente =
  Database["public"]["Functions"]["reclamar_o_crear_cliente"]["Returns"][number];

/** signUp outcome — a discriminated result so the action renders one message
 *  surface without throwing on the expected validation/duplicate paths. */
export type RegistroResultado =
  | { ok: true; requiereConfirmacion: boolean }
  | { ok: false; error: string };

/**
 * Self-register a socio. Validates the intake, then `signUp` with the person's
 * name + E.164 phone in `options.data` (→ `auth.users.raw_user_meta_data`, which
 * the claim RPC reads on the create path). Confirm-email-required means no session
 * exists until verification, so `requiereConfirmacion` is `session === null`.
 * `client` is injectable for tests (ADR-0001).
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
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: opts.emailRedirectTo,
      data: { full_name: input.nombre, phone_e164: telefonoAE164(input.telefono) },
    },
  });
  if (error) return { ok: false, error: error.message };
  const requiereConfirmacion = data.session === null;
  return { ok: true, requiereConfirmacion };
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
 * Post-verification claim-or-create. `gymId` is the caller's host-resolved tenant,
 * passed by the confirm route — NEVER a client field (ADR-0009), and since D2 it is
 * accompanied by the server-only tenant firma the RPC verifies. The RPC re-checks
 * `email_confirmed_at` (defense-in-depth), matches on VERIFIED email only (phone
 * never claims; ambiguous → create), and commits the member membership atomically.
 */
export async function reclamarCliente(
  gymId: string,
  client?: SupabaseServer,
): Promise<ReclamoCliente> {
  const supabase = client ?? (await createClient());
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) throw new Error("No autenticado");
  const { data, error } = await supabase
    .rpc("reclamar_o_crear_cliente", { p_gym_id: gymId, p_firma: firmaTenant(uid, gymId) })
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo completar el registro");
  }
  return data;
}

/** The invite-code claim RPC's row DTO (the gym slug for the post-claim redirect),
 *  derived from the generated types so it can't drift from the migration. */
export type ReclamoPorCodigo =
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
 * `firma` is the server-minted `firmaCodigo` (audit §3): server-gated callers mint it
 * inline; the `/auth/confirm` route forwards the URL's firma so a firma-less codigo
 * refuses at the RPC. The definer RPC re-checks the verified email, overwrites the row
 * email, clears the code, and upserts membership; it THROWS on a bad firma / dead code /
 * already-owned row, so the caller (confirm route) swallows to keep a verified account
 * from stranding.
 */
export async function reclamarPorCodigo(
  codigo: string,
  firma: string,
  client?: SupabaseServer,
): Promise<ReclamoPorCodigo> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .rpc("reclamar_por_codigo", { p_codigo: codigo, p_firma: firma })
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo reclamar la invitación");
  }
  return data;
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
