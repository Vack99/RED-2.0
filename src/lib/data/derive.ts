// Pure cliente derivation (ADR-0002). Given a client's STORED facts + today +
// this month's attendance count, derive estado / vence / diasRest / clasesRest /
// inicial at read. No I/O, no Supabase — unit-tested in derive.test.ts. The DAL
// fetches rows and the attendance counts, then maps each through here.

import { derivarEstado, diasRestantes, forfeit } from "@/domain/rules";
import type { Clases, EstadoCliente, PlantillaContext } from "@/domain/types";
import { DOW, fmtShort } from "@/lib/date";
import { fechaChihuahua, parseDay } from "@/lib/fecha";
import { firstName, iniciales, pesos } from "@/lib/format";

import { fmtClases, fmtDias, renderMensajes } from "./plantilla-ctx";
import type { MensajeDTO, PlantillaDTO } from "./plantillas";

export interface ClienteFacts {
  id: string;
  nombre: string;
  tel: string;
  paquete_nombre: string | null;
  clases_restantes: number | null; // NULL = ilimitado
  vence: string | null; // 'YYYY-MM-DD'
}

export interface ClienteDerivado {
  id: string;
  nombre: string;
  tel: string;
  inicial: string;
  paquete: string;
  estado: EstadoCliente;
  diasRest: number;
  venceDisplay: string; // "16 jun" or "—"
  clasesRest: number | "ilimitado"; // after read-time forfeit
  clasesRestLabel: string; // "∞" / "5" / "0"
  asistEsteMes: number;
}

export function derivarCliente(
  c: ClienteFacts,
  hoy: Date,
  asistEsteMes: number,
): ClienteDerivado {
  const tienePaquete = !!c.paquete_nombre && c.vence !== null;
  const venceDate = c.vence ? parseDay(c.vence) : null;
  const diasRest = venceDate ? diasRestantes(venceDate, hoy) : 0;

  const clasesBase: Clases = c.clases_restantes === null ? "ilimitado" : c.clases_restantes;
  // forfeit at read (brief Q2): an expired package shows 0 classes; ilimitado untouched.
  const clasesRest: Clases = tienePaquete ? forfeit(clasesBase, diasRest) : 0;

  const estado: EstadoCliente = tienePaquete
    ? derivarEstado({ clases: clasesRest, dias: diasRest })
    : "sin_clases";

  return {
    id: c.id,
    nombre: c.nombre,
    tel: c.tel,
    inicial: iniciales(c.nombre),
    paquete: c.paquete_nombre ?? "Sin paquete",
    estado,
    diasRest,
    venceDisplay: venceDate ? fmtShort(venceDate) : "—",
    clasesRest,
    clasesRestLabel: clasesRest === "ilimitado" ? "∞" : String(clasesRest),
    asistEsteMes,
  };
}

export interface PaseClienteDTO {
  id: string;
  nombre: string;
  inicial: string;
  paquete: string;
  /** Remaining-classes label, e.g. "Ilimitado", "5 clases", "Sin paquete". */
  clasesLabel: string;
  diasRest: number;
  /** Active package expiring soon. Derived through derivarEstado (ADR-0002), so it
   *  tracks por_vencer's BOTH dimensions (días <= 5 OR clases <= 2) — never a
   *  hand-inlined day threshold that silently drops the clases dimension. */
  porVencer: boolean;
}

/**
 * The pase de lista's slim per-client projection. Derives through derivarCliente
 * so `porVencer` is exactly derivarEstado's `por_vencer`; the pase shares the
 * directory's single definition of "expiring" instead of re-coining a `<= 5`.
 */
export function derivarPaseCliente(c: ClienteFacts, hoy: Date): PaseClienteDTO {
  const d = derivarCliente(c, hoy, 0);
  const clasesLabel = !c.paquete_nombre
    ? "Sin paquete"
    : c.clases_restantes === null
      ? "Ilimitado"
      : `${c.clases_restantes} clase${c.clases_restantes === 1 ? "" : "s"}`;
  return {
    id: d.id,
    nombre: d.nombre,
    inicial: d.inicial,
    paquete: d.paquete,
    clasesLabel,
    diasRest: d.diasRest,
    porVencer: d.estado === "por_vencer",
  };
}

// ── Ficha (client detail) derivation ───────────────────────────────
// The ficha's pure read-shaping, lifted out of the DAL's cache() closure so it
// is testable through its interface (the closure was the single largest impure
// derivation in the tree, with zero coverage). The DAL fetches the rows + the
// recordatorio body + negocio, then delegates here — mirrors resumen.ts →
// calcularResumenMes and clientes.ts → derivarPaseCliente. ADR-0002.

function metodoLabel(m: string): string {
  return m === "pendiente" ? "Por pagar" : m.charAt(0).toUpperCase() + m.slice(1);
}

// ── Saldo-gauge math (pure, unit-tested) ───────────────────────────
// The ficha's saldo bars are depletion gauges anchored to the last purchase:
// "full" at the moment they last bought, draining until the next purchase. The
// .tsx only renders the fill ratio + caption — all the math lives here.

/** Gauge fill ratio, clamped to [0, 1]. A non-positive denominator (no anchor /
 *  divide-by-zero) yields 0 — an empty bar — never NaN, Infinity, or a ratio > 1. */
export function gaugeFill(remaining: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / denom));
}

/** Clases-bar denominator: the balance granted at the last purchase = what's left
 *  now plus every class consumed since that purchase (`consumio` attendances). */
export function clasesDenom(clasesRest: number, attendedSincePurchase: number): number {
  return clasesRest + attendedSincePurchase;
}

/** Días-bar denominator: the full validity window granted at the last purchase =
 *  days from that purchase to `vence` (drains by calendar time). */
export function diasDenom(vence: Date, lastPurchaseDate: Date): number {
  return diasRestantes(vence, lastPurchaseDate);
}

export interface FichaAsistencia {
  dDisplay: string;
  hora: string | null;
  today: boolean;
}
export interface FichaPago {
  fechaDisplay: string;
  paquete: string;
  montoDisplay: string;
  metodo: string;
}

/** A cliente row with its alta timestamp — the ficha's stored facts. */
export interface FichaClienteRow extends ClienteFacts {
  created_at: string;
}
/** Asistencia rows the ficha renders (absolute date + check-in time). The window
 *  is the rolling last 30 days, widened back to the last purchase when older, so
 *  the same rows feed both the historial and `attendedSincePurchase` (`consumio`). */
export interface FichaAsistRow {
  fecha: string;
  hora: string | null;
  consumio: boolean;
}
/** A venta row reduced to what the ficha's pagos list + saldo gauges need. */
export interface FichaVentaRow {
  fecha: string;
  paquete_nombre: string;
  monto: number;
  metodo: string;
  clases: number | null;
  vigencia_tipo: string;
  vigencia_dias: number | null;
}

/** A saldo depletion gauge: the fill ratio (0–1) the bar renders. The clases gauge
 *  also carries `usadas` (the "usadas X" caption); the días caption is `venceDisplay`. */
export interface ClasesGauge {
  fill: number;
  usadas: number;
}
export interface DiasGauge {
  fill: number;
}

/** Everything the ficha derives at read, minus the I/O-sourced hoyIso + vecinos. */
export interface FichaDerivada {
  cliente: ClienteDerivado;
  /** @deprecated superseded by `clasesGauge` (depletion bar, no N/M fraction). */
  totalClases: number | null;
  /** @deprecated superseded by `diasGauge`. */
  dayDenom: number;
  /** Clases depletion bar, anchored to the last purchase. null = hide the bar
   *  (no ventas, or ilimitado clases — both render just the número). */
  clasesGauge: ClasesGauge | null;
  /** Días depletion bar, anchored to the last purchase. null = hide (no ventas). */
  diasGauge: DiasGauge | null;
  compradoDisplay: string;
  altaDisplay: string;
  presentHoy: boolean;
  horaHoy: string | null;
  historial: FichaAsistencia[];
  pagos: FichaPago[];
  ventasCount: number;
  mensajes: MensajeDTO[];
}

/**
 * Shape the ficha from already-fetched rows. PURE — `hoy`/`hoyIso` are passed
 * in (Chihuahua-local), the recordatorio body + negocio are pre-fetched; no I/O.
 * `asistencias` is the rolling 30-day window (widened to the last purchase when
 * older), most-recent first; `ventas` is the full history (most-recent first),
 * so `ventas[0]` is the active package / saldo anchor. `attendedSincePurchase`
 * is the exact count of consumed classes since that purchase, computed by the DAL
 * (which alone knows whether the windowed rows already cover the anchor date).
 */
export function shapeFicha(
  c: FichaClienteRow,
  asistencias: FichaAsistRow[],
  ventas: FichaVentaRow[],
  hoy: Date,
  hoyIso: string,
  plantillas: PlantillaDTO[],
  negocio: string,
  attendedSincePurchase: number,
  /** The two operator-wide tokens the cliente row can't supply — the package
   *  price list ({precios}) and how-to-pay ({datos_pago}). Optional + LAST so the
   *  pure unit tests keep their positional call shape; the DAL fills them in. */
  extras: { precios?: string; datos_pago?: string } = {},
): FichaDerivada {
  const historial: FichaAsistencia[] = asistencias
    // Today is rendered separately (the leaf re-prepends a HOY row); excluding it
    // here is load-bearing — without it the ficha would double-render today.
    .filter((a) => a.fecha !== hoyIso)
    .map((a) => {
      const d = parseDay(a.fecha);
      return {
        dDisplay: `${DOW[d.getDay()].toLowerCase()} ${d.getDate()}`,
        hora: a.hora ? a.hora.slice(0, 5) : null,
        today: false,
      };
    });
  const presentHoy = asistencias.some((a) => a.fecha === hoyIso);
  const horaHoy = asistencias.find((a) => a.fecha === hoyIso)?.hora?.slice(0, 5) ?? null;

  const pagos: FichaPago[] = ventas.map((v) => ({
    fechaDisplay: fmtShort(fechaChihuahua(v.fecha)),
    paquete: v.paquete_nombre,
    montoDisplay: pesos(v.monto),
    metodo: metodoLabel(v.metodo),
  }));

  const latest = ventas[0];
  const totalClases = latest?.clases ?? null;
  // `|| 30` (not `?? 30`): a stored vigencia_dias of 0 must also fall back, else
  // the days ring divides by zero (cliente-detalle.tsx renders diasRest / dayDenom).
  const dayDenom = latest ? (latest.vigencia_tipo === "mes" ? 30 : latest.vigencia_dias || 30) : 30;
  const compradoDisplay = latest ? fmtShort(fechaChihuahua(latest.fecha)) : "—";
  const altaDisplay = fmtShort(fechaChihuahua(c.created_at));

  const cliente = derivarCliente(c, hoy, asistencias.length);

  // Saldo depletion gauges, anchored to the last purchase (`ventas[0]`). No ventas
  // → no anchor → both null (UI renders just the números). Ilimitado clases → the
  // clases bar is meaningless (no decrement ever happens) → its gauge is null too.
  const lastPurchaseDate = latest ? fechaChihuahua(latest.fecha) : null;
  const venceDate = c.vence ? parseDay(c.vence) : null;

  const clasesGauge: ClasesGauge | null =
    lastPurchaseDate && cliente.clasesRest !== "ilimitado"
      ? {
          fill: gaugeFill(
            cliente.clasesRest,
            clasesDenom(cliente.clasesRest, attendedSincePurchase),
          ),
          usadas: attendedSincePurchase,
        }
      : null;

  const diasGauge: DiasGauge | null =
    lastPurchaseDate && venceDate
      ? { fill: gaugeFill(cliente.diasRest, diasDenom(venceDate, lastPurchaseDate)) }
      : null;

  const ctx: PlantillaContext = {
    nombre: firstName(c.nombre),
    clases: fmtClases(cliente.clasesRest),
    paquete: cliente.paquete,
    vence: cliente.venceDisplay,
    dias: fmtDias(cliente.diasRest),
    precios: extras.precios,
    datos_pago: extras.datos_pago,
    negocio,
  };
  const mensajes: MensajeDTO[] = renderMensajes(plantillas, ctx);

  return {
    cliente,
    totalClases,
    dayDenom,
    clasesGauge,
    diasGauge,
    compradoDisplay,
    altaDisplay,
    presentHoy,
    horaHoy,
    historial,
    pagos,
    ventasCount: ventas.length,
    mensajes,
  };
}
