import "server-only";

import type { SupabaseServer } from "./supabase";

/**
 * The single derived-occupancy seam (ADR-0010 §3): active reservations
 * (`reservada | asistida`) per session, keyed by session id. Repoints slice #56's
 * documented 0-projection to the real count — BOTH agenda readers (staff `agenda.ts`
 * and member `agenda-miembro.ts`) and the `reservar_clase` capacity guard resolve
 * availability through this one path, so nothing can drift.
 *
 * The count comes from the `contar_reservas_activas` RPC, SECURITY DEFINER because a
 * member may read only their OWN reservation rows under RLS yet must see a truthful
 * per-session total; the RPC returns only (session_id, count) and is gym-scoped by
 * `is_member_of`, so it leaks no PII and no cross-gym data. Sessions with zero active
 * reservations are absent from the result — callers default a missing key to 0.
 */
export async function contarActivos(
  supabase: SupabaseServer,
  sessionIds: string[],
): Promise<Map<string, number>> {
  if (sessionIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("contar_reservas_activas", {
    p_session_ids: sessionIds,
  });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.session_id, r.activos]));
}
