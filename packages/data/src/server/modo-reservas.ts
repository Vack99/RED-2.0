import "server-only";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";
import { createClient, type SupabaseServer } from "./supabase";

/**
 * The Cuenta "Reservas en línea" switch's DAL seam (#331, spec #326) — thin, ADR-0005 shape:
 * the atomic RPC `cambiar_modo_reservas` owns the flip + cascade cancel, this seam only
 * resolves the caller's gym, calls it, and surfaces the cancelled count / the RPC's own
 * es-MX refusal verbatim. `client` injectable (ADR-0001).
 */

/**
 * How many still-`reservada` bookings of THIS gym have a class still ahead of them — the
 * confirm sheet's `N` before the owner commits to turning bookings off (a preview read, not
 * the RPC's own count, so the sheet can show it before any write happens). Filters on the
 * SAME two conditions `cambiar_modo_reservas` cancels on: `status = 'reservada'` (the only
 * future-capable active state — `asistida` never precedes `starts_at`, `no_show` is unwritten
 * in v1) and the embedded session's `starts_at > now()`, mirroring `clientes.ts`'s
 * `leerReservas` `!inner` idiom for filtering on a joined column.
 */
export async function contarReservasFuturas(client?: SupabaseServer): Promise<number> {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);
  // count: "exact", head: true — a server-side COUNT, not a row fetch: PostgREST's default
  // page cap (max_rows, 1000) truncates a row list long before that, silently under-reporting
  // this gym's true future-booking count once it crosses the cap.
  const { count, error } = await supabase
    .from("reservation")
    .select("id, class_session!inner(starts_at)", { count: "exact", head: true })
    .eq("gym_id", gym.id)
    .eq("status", "reservada")
    .gt("class_session.starts_at", new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}

/**
 * Flip the gym's booking mode. Returns the number of future reservations the RPC cancelled
 * (0 turning ON, 0 on a no-op re-call of the state already in effect). Throws the RPC's own
 * refusal message on error (`No autorizado` for a non-staff caller) — callers surface it as
 * a toast, same as every other Cuenta write action.
 */
export async function cambiarModoReservas(habilitar: boolean, client?: SupabaseServer): Promise<number> {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);
  const { data, error } = await supabase.rpc("cambiar_modo_reservas", {
    p_habilitar: habilitar,
    // Host-resolved tenant, the same multi-gym pin editarVenta/eliminarVenta send —
    // staff_gym()'s null-arm picks the caller's first staffed gym, which can be the WRONG
    // one for an operator viewing a second gym's host.
    p_gym_id: gym.id,
  });
  if (error) throw new Error(error.message);
  return data ?? 0;
}
