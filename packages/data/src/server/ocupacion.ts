import "server-only";

import type { SupabaseServer } from "./supabase";

/**
 * The STAFF/roster derived-occupancy seam (ADR-0010 §3): every active reservation
 * (`reservada | asistida`, walk-ins included) per session, keyed by session id.
 * Repoints slice #56's documented 0-projection to the real count — the staff
 * `agenda.ts` reader (roster headcount) AND the `reservar_clase` capacity guard
 * resolve availability through this one path.
 *
 * The count comes from the `contar_reservas_activas` RPC, SECURITY DEFINER because a
 * member may read only their OWN reservation rows under RLS yet must see a truthful
 * per-session total; the RPC returns only (session_id, count) and is gym-scoped by
 * `is_member_of`, so it leaks no PII and no cross-gym data. Sessions with zero active
 * reservations are absent from the result — callers default a missing key to 0.
 *
 * NOT the member-facing seam (see `contarActivosMiembro` below) — this one deliberately
 * counts walk-ins too, because it is the operator's real headcount (owner ruling
 * 2026-08-03: "17/15" is truth for her).
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

/**
 * The MEMBER-facing derived-occupancy seam (owner ruling 2026-08-03): active
 * reservations that actually consume BOOKABLE capacity — `is_walk_in = false`, the
 * one difference from `contarActivos` above. A staff walk-in mark (`pasar_lista_sesion`
 * writing `status = 'asistida', is_walk_in = true`) is a real body in the room the
 * operator already accounted for, not a spot a member could have booked; counting it
 * here would drive a member's `derivarEstadoSesion` to LLENO over headcount they were
 * never offered a seat against. Both member agenda readers (`agenda-miembro.ts`,
 * `clase-miembro.ts`) resolve occupancy through this seam — never `contarActivos`,
 * which stays the staff/roster/`reservar_clase` path, untouched.
 *
 * Backed by `contar_reservas_activas_miembro` (20260804110000) — same DEFINER +
 * `is_member_of` shape as `contar_reservas_activas`, filtered on `is_walk_in`.
 */
export async function contarActivosMiembro(
  supabase: SupabaseServer,
  sessionIds: string[],
): Promise<Map<string, number>> {
  if (sessionIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("contar_reservas_activas_miembro", {
    p_session_ids: sessionIds,
  });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.session_id, r.activos]));
}
