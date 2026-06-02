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
 * PostgREST caps a single response (commonly ~1000 rows). The two FULL-history
 * ledgers (ventas, asistencias) accumulate over years, so a single read would
 * silently truncate — and because the order is `fecha DESC`, it would drop the
 * OLDEST history first. The paginating readers below page through `.range()` to
 * gather the COMPLETE ledger. `clientes`/`paquetes` are naturally bounded (roster
 * + catalog size) and stay single reads.
 */
const PAGE = 1000;

/**
 * Read the WHOLE ventas ledger by paging through `.range(from, from + PAGE - 1)`
 * until a short page returns. NO date filter (FULL history); `.order("fecha",
 * { ascending: false })` preserved; throw-on-error; explicit row→DTO map into
 * `RespaldoVenta` (no stray columns). Empty table → `[]`.
 */
async function readAllVentas(supabase: SupabaseServer): Promise<RespaldoVenta[]> {
  const out: RespaldoVenta[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ventas")
      .select("folio, fecha, cliente_id, paquete_nombre, monto, metodo, vigencia_tipo, vigencia_dias")
      .order("fecha", { ascending: false }) // NO date filter — FULL history
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = data ?? [];
    out.push(
      ...page.map((v) => ({
        folio: v.folio,
        fecha: v.fecha,
        cliente_id: v.cliente_id,
        paquete_nombre: v.paquete_nombre,
        monto: v.monto,
        metodo: v.metodo,
        vigencia_tipo: v.vigencia_tipo,
        vigencia_dias: v.vigencia_dias,
      })),
    );
    if (page.length < PAGE) break;
  }
  return out;
}

/**
 * Read the WHOLE asistencias ledger by paging through `.range(from, from + PAGE - 1)`
 * until a short page returns. Soft-delete filter `.is("deleted_at", null)` ONLY (NO
 * date filter — FULL history); `.order("fecha", { ascending: false })` preserved;
 * throw-on-error; explicit row→DTO map into `RespaldoAsistencia`. Empty table → `[]`.
 */
async function readAllAsistencias(supabase: SupabaseServer): Promise<RespaldoAsistencia[]> {
  const out: RespaldoAsistencia[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("asistencias")
      .select("fecha, hora, cliente_id")
      .is("deleted_at", null) // soft-delete filter ONLY; NO date filter — FULL history
      .order("fecha", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = data ?? [];
    out.push(
      ...page.map((a) => ({
        fecha: a.fecha,
        hora: a.hora,
        cliente_id: a.cliente_id,
      })),
    );
    if (page.length < PAGE) break;
  }
  return out;
}

/**
 * The respaldo gather seam (ADR-0006): fetch the WHOLE gym record the operator's
 * weekly Excel backup is shaped from. Unlike the roster/ficha readers — which are
 * month-scoped or windowed — this is deliberately FULL HISTORY: ventas and
 * asistencias carry NO date filter, so the export is the complete ledger, not the
 * current month. Those two ledgers are PAGINATED (see readAll* above) so PostgREST's
 * per-response cap can't silently truncate the oldest history. The shaping/formatting
 * lives in the pure `buildRespaldoRows` (rows.ts); this layer only does I/O.
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

    const [clientesRes, ventas, asistencias, paquetesRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tel, email, birthday, paquete_nombre, clases_restantes, vence, created_at")
        .order("nombre"),
      readAllVentas(supabase), // paginated — FULL history
      readAllAsistencias(supabase), // paginated — FULL history
      supabase
        .from("paquetes")
        .select("nombre, precio, clases, vigencia_tipo, vigencia_dias, orden")
        .order("orden"),
    ]);

    if (clientesRes.error) throw clientesRes.error;
    if (paquetesRes.error) throw paquetesRes.error;

    // Explicit row→DTO maps (mirrors ventas.ts): name the exact contract fields,
    // map clientes.created_at → the `alta` field, and drop the `orden` sort-only
    // column from paquetes — no `as any`, no stray columns leaking into the shaper.
    // (ventas/asistencias are already mapped by their paginating readers.)
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
