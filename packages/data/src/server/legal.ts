import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createAnonClient, createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/**
 * Gate 0.1 click-wrap DAL (issue #254) — the thin read/write seam over `acuerdo_aceptacion`
 * (append-only evidence; `aceptar_acuerdo` is its SOLE write path — the table carries zero
 * write policies, see `supabase/migrations/20260808120000_acuerdo_aceptacion_gym_legal.sql`).
 * Generic over `documento`/`version` on purpose: the migration's own header notes the table is
 * meant for "a given version of a legal document (today: the Anexo…)", so #255/#256/#257 can
 * reuse this module for a future document without a new one. The anexo's OWN identity (which
 * document, which version, its text) lives in `@gym/domain/legal` — never here.
 */

/** Whether `gymId` already holds evidence for EXACTLY this `(documento, version)` pair — the
 *  layout gate's read (#254). Staff-scoped SELECT RLS (`is_staff_of`) already limits this to
 *  gyms the caller staffs; the explicit filters below pick the ONE gym-in-effect out of every
 *  gym a multi-gym operator might staff. A superseded version's row does NOT match (AC3): a
 *  version bump makes every prior acceptance stale by construction, no extra logic needed.
 *  Memoized per request, matching every other per-request DAL reader — cheap now, and #255's
 *  CUENTA legal editor will want the same read. */
export const getAcuerdoAceptado = cache(
  async (
    gymId: string,
    documento: string,
    version: string,
    client?: SupabaseServer,
  ): Promise<boolean> => {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("acuerdo_aceptacion")
      .select("id")
      .eq("gym_id", gymId)
      .eq("documento", documento)
      .eq("version", version)
      .maybeSingle();
    // Fail-closed is deliberate (the layout treats "unknown" the same as "unaccepted" — the
    // same posture its own getOperatorGyms().catch(() => []) already takes), but a read error
    // must not read as indistinguishable from "nobody has accepted yet". One structured line,
    // same shape as the tenant-crossing log (apps/admin/src/lib/tenant.ts) — the only sink that
    // exists (no log drain, no observability package anywhere in the repo).
    if (error) {
      console.warn(
        JSON.stringify({ event: "acuerdo-aceptado-read-error", gymId, documento, version, error: error.message }),
      );
    }
    return data != null;
  },
);

/** Every field is resolved SERVER-SIDE by the caller (the server action): `documento`/
 *  `version`/`contenido` from `@gym/domain/legal`'s constants, `ip`/`userAgent` from the real
 *  request headers — never trusted from the browser (#253/#254 binding decision). `ip` MUST be
 *  a real address or `null`, never `''` (the column's length check rejects an empty string).
 *  Neither is length-bounded by its source (a raw header value) — `aceptarAcuerdo` truncates
 *  both to the columns' own limits before the RPC call (review fix round 1: an untruncated
 *  `user_agent` over 500 chars, or an `x-forwarded-for` hop over 100, raised a check-constraint
 *  error on the ONE screen with no bypass, permanently bricking that gym's admin app). */
export interface AceptarAcuerdoInput {
  gymId: string;
  documento: string;
  version: string;
  contenido: string;
  ip: string | null;
  userAgent: string | null;
}

/** The RPC's return, camelCased. `contenidoHash` is always the STORED hash (even on a
 *  re-accept that passed different content) — a caller can detect "document edited without a
 *  version bump" by comparing it to a fresh hash of what it just sent. Unused by #254 today
 *  (the server-side constant content never drifts against itself); carried through because the
 *  RPC returns it and a future caller (#255's editor?) may want the drift check. */
export interface AceptarAcuerdoResult {
  id: string;
  yaExistia: boolean;
  contenidoHash: string;
}

/** Accept a legal document version on the caller's gym — the sole write path onto
 *  `acuerdo_aceptacion` (`aceptar_acuerdo`, SECURITY DEFINER, `has_role(gym,'owner')`-gated
 *  INSIDE the function — the real authority, ADR-0005's documented exception). `requireOperator`
 *  here is the same cheap defense-in-depth presence check every staff writer shares; it is NOT
 *  the authorization boundary — an operator (staff, not owner) reaches the RPC fine and is
 *  refused there, exactly like every other owner-only path in this codebase. */
export async function aceptarAcuerdo(
  input: AceptarAcuerdoInput,
  client?: SupabaseServer,
): Promise<AceptarAcuerdoResult> {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  // Truncate, THEN collapse empty→null with `||` (final review round, minor 4): `ip`'s check
  // constraint is `between 1 and 100` (a real, non-empty value must survive), so a `''` — not
  // just `null`/`undefined` — must never reach the RPC. This DAL function has no production
  // caller today, so its OWN contract is the only thing standing between a `''` and the check
  // constraint — `input.ip?.slice(0, 100) ?? null` alone only replaces `null`/`undefined`, so
  // `input.ip === ''` (or a value that slices down to `''`) would ride through unchanged and
  // raise the check constraint on whatever caller arrives next. `user_agent`'s check is `<= 500`
  // with NO minimum, so an empty string there is not a bug — `?? null` stays correct for it.
  const ip = input.ip?.slice(0, 100) || null;
  const userAgent = input.userAgent?.slice(0, 500) ?? null;
  const { data, error } = await supabase
    .rpc("aceptar_acuerdo", {
      p_gym_id: input.gymId,
      p_documento: input.documento,
      p_version: input.version,
      p_contenido: input.contenido,
      p_ip: ip ?? undefined,
      p_user_agent: userAgent ?? undefined,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo registrar la aceptación");
  return { id: data.id, yaExistia: data.ya_existia, contenidoHash: data.contenido_hash };
}

/**
 * The CUENTA legal-identity editor's DAL (issue #255) — `gym.legal_name` (razón social) plus the
 * `gym_legal` satellite's three columns (domicilio, contacto ARCO; #253). The DTO/domain shape
 * (`IdentidadLegalGym`, `identidadLegalCompleta`, the aviso merge/render) lives in `@gym/domain/
 * legal`, same split as the Anexo above: identity/completeness rules are pure, this is I/O only.
 */

export interface IdentidadLegalDTO {
  razonSocial: string | null;
  domicilio: string | null;
  emailArco: string | null;
  areaDatosPersonales: string | null;
}

/** The editor's read: `gym.legal_name` + `gym_legal`'s three columns, in ONE round trip via
 *  `obtener_identidad_legal` — a SECURITY DEFINER RPC, deliberately NOT a raw `.from("gym")`
 *  select. `gym`'s only SELECT policy is `gym_anon_select ... using (true)` (permissive, OR-
 *  combined with any sibling policy on the same command — ADR-0012's pre-auth host→brand lookup
 *  needs it and it stays untouched), so a plain column grant on `legal_name` would make it
 *  readable by ANY authenticated identity, not staff-only — denial-tested and confirmed against
 *  `supabase/tests/gym_tenant_anon_read.sql` (#213's own regression guard) while building this
 *  migration (20260808130000's "LIVE-MEASURED TRAP #2" comment has the full account). The RPC's
 *  own `is_staff_of` gate is the real boundary; `gym_legal`'s three columns ride along in the same
 *  call because that table's SELECT policy IS already staff-scoped from birth (no such workaround
 *  needed there) and bundling saves the editor a second query. Memoized per request. */
export const getIdentidadLegal = cache(
  async (client?: SupabaseServer): Promise<IdentidadLegalDTO> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const { data, error } = await supabase
      .rpc("obtener_identidad_legal", { p_gym_id: gym.id })
      .maybeSingle();
    // Fail-closed, matching getAcuerdoAceptado: an error reads as "nothing filled in yet" (the
    // editor's own empty state), never as a thrown page. A read error must still be visible in the
    // logs as distinct from the ordinary empty-gym case.
    if (error) {
      console.warn(JSON.stringify({ event: "identidad-legal-read-error", gymId: gym.id, error: error.message }));
    }
    return {
      razonSocial: data?.razon_social ?? null,
      domicilio: data?.domicilio ?? null,
      emailArco: data?.email_arco ?? null,
      areaDatosPersonales: data?.area_datos_personales ?? null,
    };
  },
);

/** A blank (empty or whitespace-only) input CLEARS the field (writes `null`), never `''` — matches
 *  `gym_legal`'s own CHECK constraints (`domicilio`/`area_datos_personales` reject a 0-length
 *  non-null string; `email_arco` requires >= 3 chars when not null) and the `ip`/`tel`-clearing
 *  idiom used elsewhere in this DAL (`aceptarAcuerdo`'s `?? null`, `actualizarCliente`'s tel). */
const campoOpcional = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable(),
  );

export const actualizarIdentidadLegalSchema = z.object({
  razonSocial: campoOpcional(200),
  domicilio: campoOpcional(300),
  // Same blank→null body as every other field (campoOpcional), plus a format check: a blank/null
  // value skips it (nothing to validate), a non-blank one must be a real email.
  emailArco: campoOpcional(160).refine((v) => v === null || z.string().email().safeParse(v).success, {
    message: "Correo ARCO inválido",
  }),
  areaDatosPersonales: campoOpcional(200),
});
export type ActualizarIdentidadLegalInput = z.infer<typeof actualizarIdentidadLegalSchema>;

/** Save the gym's legal identity: `gym.legal_name` via a direct RLS-gated UPDATE (staff-scoped
 *  policy, 20260808130000 — the table's FIRST update policy, nothing to OR against, so composition
 *  IS staff-scoped on this half, unlike the read) and the `gym_legal` satellite's three columns via
 *  upsert (staff-scoped insert/update policies, #253). Two writes to two tables, not one RPC —
 *  both are already directly RLS-writable, so no SECURITY DEFINER bypass is needed for either.
 *  Injectable client (ADR-0001). */
export async function actualizarIdentidadLegal(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarIdentidadLegalSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);

  const { data, error: gymError } = await supabase
    .from("gym")
    .update({ legal_name: input.razonSocial })
    .eq("id", gym.id)
    .select("id");
  if (gymError) throw new Error("No se pudo guardar la razón social");
  if (!data || data.length === 0) throw new Error("Gimnasio no encontrado");

  const { error: legalError } = await supabase
    .from("gym_legal")
    .upsert(
      {
        gym_id: gym.id,
        domicilio: input.domicilio,
        email_arco: input.emailArco,
        area_datos_personales: input.areaDatosPersonales,
      },
      { onConflict: "gym_id" },
    );
  if (legalError) throw new Error("No se pudo guardar el domicilio y el contacto ARCO");
}

/**
 * The PUBLIC legal-identity read (issue #256) — the client app's `/legal`, `/registro` and
 * `/activar/contrasena` pages read through this, never `getIdentidadLegal` above (that one is
 * staff-gated via `obtener_identidad_legal`, the opposite shape: this table's row is public-by-law
 * content, so it is a plain anon-scoped read, same posture as every reader in
 * packages/data/src/server/marketing.ts). `20260808140000` is the migration this reads against:
 * `gym.legal_name` via an incremental anon column grant (flat, unscoped by row — brand-seam
 * columns already work this way), `gym_legal`'s three columns via a request-scoped anon policy
 * (`gym_id = gym_en_peticion()`, the SAME per-gym scoping every other satellite in marketing.ts
 * uses, read through `createAnonClient(gymId)`'s `x-gym-id` header).
 */
export interface IdentidadLegalPublicaDTO {
  razonSocial: string | null;
  domicilio: string | null;
  emailArco: string | null;
  areaDatosPersonales: string | null;
}

/** The gym's public legal identity, anon + gym-scoped. Two independent reads (a `gym` row keyed
 *  by id, a `gym_legal` row keyed by the SAME id) rather than one join: `gym`'s anon read is flat
 *  (`using (true)`) while `gym_legal`'s is request-scoped, so they are two different grant/policy
 *  stories that happen to share a primary key — bundling them the way `obtener_identidad_legal`
 *  does would need a SECURITY DEFINER function, and there is no staff-authority reason for one
 *  here (unlike that RPC's whole point). Best-effort: a missing/errored row on either side reads
 *  as null fields, matching every other marketing reader's degrade-to-empty posture — never a
 *  thrown page for an incomplete or unmapped gym. Memoized per request. */
export const getIdentidadLegalPublica = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient(gymId)): Promise<IdentidadLegalPublicaDTO> => {
    const [{ data: gymRow, error: gymError }, { data: legalRow, error: legalError }] = await Promise.all([
      client.from("gym").select("legal_name").eq("id", gymId).maybeSingle(),
      client.from("gym_legal").select("domicilio, email_arco, area_datos_personales").eq("gym_id", gymId).maybeSingle(),
    ]);
    // Fail-soft is unchanged (still degrades to incomplete, never a thrown page) — but a read
    // error must be visible in the logs as distinct from the ordinary "gym hasn't filled this in
    // yet" empty case, same posture as every sibling reader in this module (getAcuerdoAceptado,
    // getIdentidadLegal). Two independent reads, so each gets its own event name.
    if (gymError) {
      console.warn(JSON.stringify({ event: "identidad-legal-publica-read-error", table: "gym", gymId, error: gymError.message }));
    }
    if (legalError) {
      console.warn(
        JSON.stringify({ event: "identidad-legal-publica-read-error", table: "gym_legal", gymId, error: legalError.message }),
      );
    }
    return {
      razonSocial: gymRow?.legal_name ?? null,
      domicilio: legalRow?.domicilio ?? null,
      emailArco: legalRow?.email_arco ?? null,
      areaDatosPersonales: legalRow?.area_datos_personales ?? null,
    };
  },
);
