import "server-only";

import { cache } from "react";
import { z } from "zod";

import { hoyEnZona, iniciales, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/**
 * PostgREST silently caps a single response (commonly ~1000 rows). `getMarcadas`
 * reads the WHOLE active-attendance ledger — the day-strip + month calendar can
 * browse ANY past month, so it must be full history, not a date window — so a single
 * unbounded select would silently truncate once the gym passes ~1000 lifetime
 * check-ins, dropping attendance with no error. We page through `.range()` to gather
 * the complete ledger (mirrors respaldo's readAll* loops).
 */
const PAGE = 1000;

/**
 * Active attendance, as { "YYYY-MM-DD": clienteId[] }. Keyed by absolute
 * Chihuahua date (ADR-0003) — the offset grid is gone.
 *
 * Paginated (see PAGE above) so PostgREST's per-response cap can't silently drop
 * attendance. If check-in volume grows very large, a date-windowed read (only the
 * months the calendar actually browses) is the cost optimization — but that would
 * change the seam's full-history contract, so it's deliberately deferred.
 *
 * @returns the date→clienteIds map · best-effort: returns {} on error (error is
 * not destructured, so any failure reads as "no attendance").
 */
export const getMarcadas = cache(
  async (client?: SupabaseServer): Promise<Record<string, string[]>> => {
    const supabase = client ?? (await createClient());

    const map: Record<string, string[]> = {};
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("asistencias")
        .select("fecha, cliente_id")
        .is("deleted_at", null)
        .order("fecha")
        .range(from, from + PAGE - 1);
      const page = data ?? [];
      for (const row of page) {
        (map[row.fecha] ??= []).push(row.cliente_id);
      }
      if (page.length < PAGE) break;
    }
    return map;
  },
);

export const togglePaseSchema = z.object({
  clienteId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface TogglePaseResult {
  present: boolean;
  hora: string | null;
}

/**
 * Toggle a client's attendance for a given (absolute) day. Marking present
 * inserts a row and consumes a class (Ilimitado untouched; brief Q6 — same-day
 * duplicates each consume); unmarking soft-deletes the active row and restores a
 * class ONLY if one was actually consumed. Back-dated days are allowed (no time).
 *
 * The read-then-write toggle is one atomic transaction via the `toggle_pase`
 * RPC (ADR-0005): it makes the on/off decision, the guarded ±1 decrement, and
 * stamps the Chihuahua-local check-in time server-side. RLS scopes every row to
 * the operator (SECURITY INVOKER).
 */
export async function togglePase(
  raw: unknown,
  client?: SupabaseServer,
): Promise<TogglePaseResult> {
  const input = togglePaseSchema.parse(raw);
  const supabase = client ?? (await createClient());

  // Presence check only — the RPC stamps the operator server-side (SECURITY
  // INVOKER), so the sub is discarded here (matches prior behavior).
  await requireOperator(supabase);

  const { data, error } = await supabase
    .rpc("toggle_pase", { p_cliente_id: input.clienteId, p_fecha: input.fecha })
    .single();
  if (error || !data) throw new Error("No se pudo registrar la asistencia");

  return { present: data.present, hora: data.hora };
}

export interface AsistenciaHoy {
  cliente_id: string;
  nombre: string;
  inicial: string;
  paquete: string;
  /** "HH:MM" check-in time, or "" for a back-entered row with no time. */
  hora: string;
}

/**
 * Today's asistencia rows joined to clientes, ordered by time (most recent
 * first) — drives the inicio "Últimas asistencias" list. RLS-scoped read;
 * returns DTOs only (no raw rows cross the boundary, ADR-0001).
 *
 * @returns the DTO list (empty when no rows) · throws on DB error.
 */
export async function getAsistenciasHoy(client?: SupabaseServer): Promise<AsistenciaHoy[]> {
  const supabase = client ?? (await createClient());
  const { timezone: tz } = await getOperatorGym(supabase);
  const hoyIso = toIsoDay(hoyEnZona(tz));

  const { data: asis, error } = await supabase
    .from("asistencias")
    .select("cliente_id, hora")
    .eq("fecha", hoyIso)
    .is("deleted_at", null)
    .order("hora", { ascending: false });
  if (error) throw error;

  const rows = asis ?? [];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((a) => a.cliente_id))];
  const { data: clientes, error: cErr } = await supabase
    .from("clientes")
    .select("id, nombre, paquete_nombre")
    .in("id", ids);
  if (cErr) throw cErr;

  const byId = new Map(
    (clientes ?? []).map((c) => [
      c.id,
      { nombre: c.nombre, paquete: c.paquete_nombre ?? "Sin paquete" },
    ]),
  );

  return rows.map((a) => {
    const c = byId.get(a.cliente_id);
    const nombre = c?.nombre ?? "—";
    return {
      cliente_id: a.cliente_id,
      nombre,
      inicial: iniciales(nombre),
      paquete: c?.paquete ?? "Sin paquete",
      hora: (a.hora ?? "").slice(0, 5),
    };
  });
}
