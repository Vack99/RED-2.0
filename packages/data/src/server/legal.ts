import "server-only";

import { cache } from "react";

import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";

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
  // Truncate AFTER the caller's `|| null` empty-string collapse: `ip`'s check constraint is
  // `between 1 and 100` (so a real, non-empty value must survive) and `user_agent`'s is `<= 500`
  // (no minimum). A multi-hop x-forwarded-for or a verbose browser UA string is otherwise
  // unbounded — truncating here (once, in the DAL) means every future caller of this function
  // inherits the safety, not just #254's action.
  const ip = input.ip?.slice(0, 100) ?? null;
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
