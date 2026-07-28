import "server-only";

/* PROTOTYPE — throwaway (#89). Delete with the rest of _prototype/. */

import { getOperatorGym } from "@gym/data/server/gym";
import { createClient } from "@gym/data/server/supabase";
import { addDays, horaEnZona, instanteEnZona, parseDay } from "@gym/format";

export interface SesionProto {
  id: string;
  /** Gym-local "HH:MM". */
  hora: string;
  tipo: string;
  capacidad: number;
}

/**
 * Today's classes for the prototype's context chips.
 *
 * Deliberately NOT `getAgendaDia` — that one calls `ensure_week_materialized`,
 * which WRITES. A throwaway prototype pointed at the live database must not
 * create schedule rows as a side effect of being looked at, so this is a plain
 * read of the same table.
 */
export async function getSesionesDelDiaProto(fechaIso: string): Promise<SesionProto[]> {
  const supabase = await createClient();
  const { timezone: tz } = await getOperatorGym(supabase);

  const dia = parseDay(fechaIso);
  const low = instanteEnZona(dia, "00:00", tz);
  const high = instanteEnZona(addDays(dia, 1), "00:00", tz);

  const { data } = await supabase
    .from("class_session")
    .select("id, class_type_id, starts_at, capacity")
    .is("cancelled_at", null)
    .gte("starts_at", low.toISOString())
    .lt("starts_at", high.toISOString())
    .order("starts_at");

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: tipos } = await supabase
    .from("class_type")
    .select("id, name")
    .in("id", [...new Set(rows.map((r) => r.class_type_id))]);
  const nombrePorTipo = new Map((tipos ?? []).map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    id: r.id,
    hora: horaEnZona(new Date(r.starts_at), tz),
    tipo: nombrePorTipo.get(r.class_type_id) ?? "—",
    capacidad: r.capacity,
  }));
}

/**
 * Who has BOOKED each of today's sessions — `reservada` (booked, not yet marked)
 * and `asistida` (booked and already marked). Plain read; the prototype never writes.
 *
 * Returns `{ sessionId: clienteId[] }`, empty for a session nobody booked.
 */
export async function getReservasDelDiaProto(sessionIds: string[]): Promise<Record<string, string[]>> {
  if (sessionIds.length === 0) return {};
  const supabase = await createClient();

  const { data } = await supabase
    .from("reservation")
    .select("class_session_id, member_id, status")
    .in("class_session_id", sessionIds)
    .in("status", ["reservada", "asistida"]);

  const out: Record<string, string[]> = {};
  for (const r of data ?? []) {
    (out[r.class_session_id] ??= []).push(r.member_id);
  }
  return out;
}
