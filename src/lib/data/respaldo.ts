import "server-only";

import { cache } from "react";

import { hoyChihuahua } from "@/lib/fecha";
import { createClient, type SupabaseServer } from "@/lib/supabase/server";
import type {
  RespaldoAsistencia,
  RespaldoCliente,
  RespaldoData,
  RespaldoPaquete,
  RespaldoVenta,
} from "@/lib/export/rows";

/**
 * The respaldo gather seam (ADR-0006): fetch the WHOLE gym record the operator's
 * weekly Excel backup is shaped from. Unlike the roster/ficha readers — which are
 * month-scoped or windowed — this is deliberately FULL HISTORY: ventas and
 * asistencias carry NO date filter, so the export is the complete ledger, not the
 * current month. The shaping/formatting lives in the pure `buildRespaldoRows`
 * (rows.ts); this layer only does I/O.
 *
 * RLS-scoped transparently (ADR-0001): the reads carry no explicit `user_id`
 * filter — RLS is the hard boundary. The route handler does the operator gate;
 * this DAL read relies on RLS. `client` is the injectable trailing param (default:
 * the real per-request client) so the gather is testable with a fake (audit cluster
 * 4); wrapped in React `cache()` to share the result across one request's callers.
 *
 * Soft-delete: only `asistencias` carries `deleted_at` (clientes/ventas do not), so
 * the soft-delete filter `.is("deleted_at", null)` is applied at THAT query alone —
 * the "excludes soft-deleted" guarantee lives here, not in the shaper.
 */
export const getRespaldoData = cache(
  async (client?: SupabaseServer): Promise<RespaldoData> => {
    const supabase = client ?? (await createClient());
    const generadoHoy = hoyChihuahua();

    const [clientesRes, ventasRes, asistRes, paquetesRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tel, email, birthday, paquete_nombre, clases_restantes, vence, created_at")
        .order("nombre"),
      supabase
        .from("ventas")
        .select("folio, fecha, cliente_id, paquete_nombre, monto, metodo, vigencia_tipo, vigencia_dias")
        .order("fecha", { ascending: false }), // NO date filter — FULL history
      supabase
        .from("asistencias")
        .select("fecha, hora, cliente_id")
        .is("deleted_at", null) // soft-delete filter ONLY; NO date filter — FULL history
        .order("fecha", { ascending: false }),
      supabase
        .from("paquetes")
        .select("nombre, precio, clases, vigencia_tipo, vigencia_dias, orden")
        .order("orden"),
    ]);

    if (clientesRes.error) throw clientesRes.error;
    if (ventasRes.error) throw ventasRes.error;
    if (asistRes.error) throw asistRes.error;
    if (paquetesRes.error) throw paquetesRes.error;

    // Explicit row→DTO maps (mirrors ventas.ts): name the exact contract fields,
    // map clientes.created_at → the `alta` field, and drop the `orden` sort-only
    // column from paquetes — no `as any`, no stray columns leaking into the shaper.
    const clientes: RespaldoCliente[] = (clientesRes.data ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tel: c.tel,
      email: c.email,
      birthday: c.birthday,
      paquete_nombre: c.paquete_nombre,
      clases_restantes: c.clases_restantes,
      vence: c.vence,
      alta: c.created_at,
    }));

    const ventas: RespaldoVenta[] = (ventasRes.data ?? []).map((v) => ({
      folio: v.folio,
      fecha: v.fecha,
      cliente_id: v.cliente_id,
      paquete_nombre: v.paquete_nombre,
      monto: v.monto,
      metodo: v.metodo,
      vigencia_tipo: v.vigencia_tipo,
      vigencia_dias: v.vigencia_dias,
    }));

    const asistencias: RespaldoAsistencia[] = (asistRes.data ?? []).map((a) => ({
      fecha: a.fecha,
      hora: a.hora,
      cliente_id: a.cliente_id,
    }));

    const paquetes: RespaldoPaquete[] = (paquetesRes.data ?? []).map((p) => ({
      nombre: p.nombre,
      precio: p.precio,
      clases: p.clases,
      vigencia_tipo: p.vigencia_tipo,
      vigencia_dias: p.vigencia_dias,
    }));

    return { generadoHoy, clientes, ventas, asistencias, paquetes };
  },
);
