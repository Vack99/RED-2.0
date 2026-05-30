import "server-only";

import { cache } from "react";

import { calcularResumenMes } from "@/domain/rules";
import type { AsistenciaResumen, ResumenMes, VentaResumen } from "@/domain/types";
import { fechaChihuahua, hoyChihuahua, parseDay, toIsoDay } from "@/lib/fecha";
import { createClient } from "@/lib/supabase/server";

/**
 * Monthly resumen for the inicio dashboard + cuenta "Resumen del mes".
 * Reads are RLS-scoped, so no explicit auth is needed at the DAL (ADR-0001).
 * Fetches ventas + non-deleted asistencias over a window covering the prior
 * month start → today, maps DB rows to the pure VentaResumen / AsistenciaResumen
 * shapes (Chihuahua-local dates at the boundary), then delegates the math to the
 * pure domain rule calcularResumenMes. Memoized per request.
 */
export const getResumenMes = cache(async (): Promise<ResumenMes> => {
  const supabase = await createClient();
  const hoy = hoyChihuahua();

  // Window: first day of the PRIOR calendar month (covers mes + prev + semana).
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const desdeIso = toIsoDay(desde);

  const [ventasRes, asisRes] = await Promise.all([
    supabase.from("ventas").select("fecha, monto").gte("fecha", desdeIso),
    supabase
      .from("asistencias")
      .select("fecha, deleted_at")
      .gte("fecha", desdeIso)
      .is("deleted_at", null),
  ]);
  if (ventasRes.error) throw ventasRes.error;
  if (asisRes.error) throw asisRes.error;

  // ventas.fecha is a timestamptz → resolve to its Chihuahua-local calendar day.
  const ventas: VentaResumen[] = (ventasRes.data ?? []).map((v) => ({
    fecha: fechaChihuahua(v.fecha),
    monto: Number(v.monto),
  }));

  // asistencias.fecha is an absolute `date` → parse as a local-midnight day.
  const asistencias: AsistenciaResumen[] = (asisRes.data ?? []).map((a) => ({
    fecha: parseDay(a.fecha.slice(0, 10)),
  }));

  return calcularResumenMes(ventas, asistencias, hoy);
});
