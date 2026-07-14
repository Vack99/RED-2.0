import "server-only";

import { cache } from "react";

import { calcularCorteMes } from "@gym/domain/rules";
import type { AltaMes, AsistenciaResumen, CorteMes, MetodoPago, VentaMes } from "@gym/domain/types";
import { fechaEnZona, hoyEnZona, instanteEnZona, parseDay, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";
import { getOperatorGym } from "./gym";
import type {
  RespaldoAsistencia,
  RespaldoCliente,
  RespaldoData,
  RespaldoPaquete,
  RespaldoVenta,
} from "./export/rows";

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
/** The half-open window a gather applies to a ledger: `gte ≤ fecha < lt`.
 *  `lt: null` = no upper bound (the default últimos-24-meses mode). The VALUE
 *  types differ per ledger — instants for ventas, day strings for asistencias
 *  (the §1.8 asymmetry) — so the window carries pre-serialized strings. */
interface VentanaLedger {
  gte: string;
  lt: string | null;
}

async function readAllVentas(
  supabase: SupabaseServer,
  gymId: string,
  ventana: VentanaLedger,
): Promise<RespaldoVenta[]> {
  const out: RespaldoVenta[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("ventas")
      .select("folio, fecha, cliente_id, paquete_nombre, monto, metodo, vigencia_tipo, vigencia_dias")
      .eq("gym_id", gymId)
      .gte("fecha", ventana.gte); // INSTANT bound — ventas.fecha is a timestamptz (§1.8)
    if (ventana.lt !== null) q = q.lt("fecha", ventana.lt);
    const { data, error } = await q
      .order("fecha", { ascending: false })
      .order("folio", { ascending: false }) // unique tiebreaker: fecha ties must not reorder across pages (§1.4)
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
async function readAllAsistencias(
  supabase: SupabaseServer,
  gymId: string,
  ventana: VentanaLedger,
): Promise<RespaldoAsistencia[]> {
  const out: RespaldoAsistencia[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("asistencias")
      .select("fecha, hora, cliente_id")
      .eq("gym_id", gymId)
      .gte("fecha", ventana.gte); // DAY-STRING bound — asistencias.fecha is a `date` (§1.8)
    if (ventana.lt !== null) q = q.lt("fecha", ventana.lt);
    const { data, error } = await q
      .is("deleted_at", null) // soft-delete filter stays on every page
      .order("fecha", { ascending: false })
      .order("id") // unique tiebreaker: 15 live rows already share one fecha (§1.4)
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
 * RLS stays the hard boundary (ADR-0001); every read ALSO carries
 * `.eq("gym_id", gym.id)` — a SCOPE SELECTOR, not a boundary (spec 2026-07-13
 * §1.1). RLS answers "may I see this row?"; the export additionally needs "which
 * of the rows I may see belong to the gym whose name I'm stamping on this file?",
 * which RLS structurally cannot answer (its predicate is per-row-per-gym). The
 * `.eq` also flips the correlated-SubPlan seq scan into an index condition — the
 * difference between O(month) and O(everyone's history). The route handler does
 * the operator gate; `client` is the injectable trailing param (default: the real
 * per-request client) so the gather is testable with a fake (audit cluster 4);
 * wrapped in React `cache()` to share the result across one request's callers.
 *
 * `generadoHoy`/`tz` resolve the operator's gym via `getOperatorGym` (ADR-0013
 * membership, slice #25) so the "today" the export stamps is the GYM's local
 * calendar day, not a hardcoded zone (Forge's gym row IS America/Chihuahua, so
 * its behavior stays byte-identical).
 *
 * Soft-delete: only `asistencias` carries `deleted_at` (clientes/ventas do not), so
 * the soft-delete filter `.is("deleted_at", null)` is applied at THAT query alone —
 * the "excludes soft-deleted" guarantee lives here, not in the shaper.
 */
export const getRespaldoData = cache(
  async (client?: SupabaseServer, mes?: string): Promise<RespaldoData> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    const generadoHoy = hoyEnZona(tz);

    // Month bounds, module-private (spec §2.3 — they can't live in @gym/domain and
    // must not become a @gym/format export). Half-open windows; instants for ventas,
    // day strings for asistencias — the §1.8 asymmetry, three lines apart, deliberate.
    //   ?mes=  → [prev-month start, month end): one window spanning the prior month,
    //            exactly the resumen.ts precedent, so the corte's prior-month block
    //            has its rows and the fold re-buckets in gym-local dates. The SHEETS
    //            filter to the month in the pure shaper (the Altas pattern).
    //   default → últimos 24 meses (ADR-0006 as amended 2026-07-13): [current month
    //            − 23, ∞). The unbounded snapshot is retired — it 413s at ~3 years.
    const mesAncla = mes ? parseDay(`${mes}-01`) : null;
    const desde = mesAncla
      ? new Date(mesAncla.getFullYear(), mesAncla.getMonth() - 1, 1)
      : new Date(generadoHoy.getFullYear(), generadoHoy.getMonth() - 23, 1);
    const hasta = mesAncla ? new Date(mesAncla.getFullYear(), mesAncla.getMonth() + 1, 1) : null;
    const ventanaVentas: VentanaLedger = {
      gte: instanteEnZona(desde, "00:00", tz).toISOString(),
      lt: hasta ? instanteEnZona(hasta, "00:00", tz).toISOString() : null,
    };
    const ventanaAsistencias: VentanaLedger = {
      gte: toIsoDay(desde),
      lt: hasta ? toIsoDay(hasta) : null,
    };

    const [clientesRes, ventas, asistencias, paquetesRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tel, email, birthday, paquete_nombre, clases_restantes, vence, created_at")
        .eq("gym_id", gym.id)
        .order("nombre"),
      readAllVentas(supabase, gym.id, ventanaVentas), // paginated
      readAllAsistencias(supabase, gym.id, ventanaAsistencias), // paginated
      supabase
        .from("paquetes")
        .select("nombre, precio, clases, vigencia_tipo, vigencia_dias, orden")
        .eq("gym_id", gym.id)
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

    // Month mode: fold the fetched (month + prev) rows into the corte. Rows are
    // mapped to gym-local Dates at this boundary (mirrors resumen.ts); the fold
    // owns the math, the shaper only formats (spec §2.3).
    let corte: CorteMes | null = null;
    if (mesAncla) {
      const ventasMes: VentaMes[] = ventas.map((v) => ({
        fecha: fechaEnZona(v.fecha, tz),
        monto: Number(v.monto),
        metodo: v.metodo as MetodoPago,
      }));
      const asisMes: AsistenciaResumen[] = asistencias.map((a) => ({
        fecha: parseDay(a.fecha.slice(0, 10)),
      }));
      const altas: AltaMes[] = clientes.map((c) => ({ fecha: fechaEnZona(c.alta, tz) }));
      corte = calcularCorteMes(ventasMes, asisMes, altas, mesAncla, generadoHoy);
    }

    return { generadoHoy, tz, mes: mesAncla, corte, clientes, ventas, asistencias, paquetes };
  },
);

/** One picker option: `value` is the route's `?mes=` param, `label` es-MX display. */
export interface MesRespaldo {
  value: string; // "2026-07"
  label: string; // "Julio 2026"
}

/**
 * The months-with-data list for the Cuenta picker (spec §2.5), NEWEST first —
 * every month from the gym's first activity to the current one. TWO single-row
 * ordered index lookups, never `min()`: under this RLS an aggregate is a full
 * cross-tenant seq scan on every Cuenta render; with the §1.9 indexes each
 * lookup is one probe. Expansion to a month list happens here in JS, in the
 * gym's zone. A gym with no activity yet gets just the current month.
 */
export const getMesesRespaldo = cache(async (client?: SupabaseServer): Promise<MesRespaldo[]> => {
  const supabase = client ?? (await createClient());
  const gym = await getOperatorGym(supabase);
  const tz = gym.timezone;
  const hoy = hoyEnZona(tz);

  const [vRes, cRes] = await Promise.all([
    supabase
      .from("ventas")
      .select("fecha")
      .eq("gym_id", gym.id)
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("clientes")
      .select("created_at")
      .eq("gym_id", gym.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const primeros: Date[] = [];
  if (vRes.data?.fecha) primeros.push(fechaEnZona(vRes.data.fecha, tz));
  if (cRes.data?.created_at) primeros.push(fechaEnZona(cRes.data.created_at, tz));
  const mesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const inicio = primeros.length
    ? new Date(
        Math.min(...primeros.map((d) => new Date(d.getFullYear(), d.getMonth(), 1).getTime())),
      )
    : mesActual;

  const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long" });
  const out: MesRespaldo[] = [];
  for (
    let d = mesActual;
    d.getTime() >= inicio.getTime();
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  ) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const nombre = nombreMes.format(d);
    out.push({
      value: `${d.getFullYear()}-${mm}`,
      label: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d.getFullYear()}`,
    });
  }
  return out;
});
