import "server-only";

import { cache } from "react";

import { calcularResumenMes } from "@gym/domain/rules";
import type { AsistenciaResumen, ResumenMes, VentaResumen } from "@gym/domain/types";
import { fechaEnZona, hoyEnZona, instanteEnZona, parseDay, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";
import { getOperatorGym } from "./gym";

/**
 * Monthly resumen for the inicio dashboard + cuenta "Resumen del mes".
 * The table reads are RLS-scoped (ADR-0001); `getOperatorGym` (slice #25) does
 * gate on the operator explicitly, since resolving the gym's timezone requires
 * knowing who they are. Fetches ventas + non-deleted asistencias over a window
 * covering the prior month start → today, maps DB rows to the pure VentaResumen
 * / AsistenciaResumen shapes (gym-local dates at the boundary), then delegates
 * the math to the pure domain rule calcularResumenMes. Memoized per request.
 */
export const getResumenMes = cache(
  async (client?: SupabaseServer): Promise<ResumenMes> => {
    const supabase = client ?? (await createClient());
    // Gym-scoped like every staff read (§1.1 — the .eq is a scope selector; RLS
    // stays the boundary): this is the inicio dashboard's hottest read, and the
    // 2026-07-13 senior audit caught it still riding the cross-tenant seq scan.
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    const hoy = hoyEnZona(tz);

    // Window: first day of the PRIOR calendar month (covers mes + prev + semana).
    // The two bounds are DELIBERATELY asymmetric (spec 2026-07-13 §1.8):
    // ventas.fecha is a timestamptz → its bound is the absolute INSTANT the window
    // starts in the gym's zone; asistencias.fecha is a `date` → a bare day string
    // IS the exact bound, and an instant would break it. Same column name, two
    // meanings — do not harmonize them.
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const desdeInstante = instanteEnZona(desde, "00:00", tz).toISOString();
    const desdeIso = toIsoDay(desde);

    const [ventasRes, asisRes] = await Promise.all([
      supabase.from("ventas").select("fecha, monto").eq("gym_id", gym.id).gte("fecha", desdeInstante),
      supabase
        .from("asistencias")
        .select("fecha, deleted_at")
        .eq("gym_id", gym.id)
        .gte("fecha", desdeIso)
        .is("deleted_at", null),
    ]);
    if (ventasRes.error) throw ventasRes.error;
    if (asisRes.error) throw asisRes.error;

    // ventas.fecha is a timestamptz → resolve to its Chihuahua-local calendar day.
    const ventas: VentaResumen[] = (ventasRes.data ?? []).map((v) => ({
      fecha: fechaEnZona(v.fecha, tz),
      monto: Number(v.monto),
    }));

    // asistencias.fecha is an absolute `date` → parse as a local-midnight day.
    const asistencias: AsistenciaResumen[] = (asisRes.data ?? []).map((a) => ({
      fecha: parseDay(a.fecha.slice(0, 10)),
    }));

    return calcularResumenMes(ventas, asistencias, hoy);
  },
);
