// Pure cliente derivation (ADR-0002). Given a client's STORED facts + today +
// this month's attendance count, derive estado / vence / diasRest / clasesRest /
// inicial at read. No I/O, no Supabase — unit-tested in derive.test.ts. The DAL
// fetches rows and the attendance counts, then maps each through here.

import { derivarEstado, diasRestantes, forfeit, renderPlantilla } from "@/domain/rules";
import type { Clases, EstadoCliente } from "@/domain/types";
import { DOW, fmtShort } from "@/lib/date";
import { fechaChihuahua, parseDay } from "@/lib/fecha";
import { firstName, iniciales, pesos } from "@/lib/format";

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
/** This-month asistencia rows the ficha renders (absolute date + check-in time). */
export interface FichaAsistRow {
  fecha: string;
  hora: string | null;
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

/** Everything the ficha derives at read, minus the I/O-sourced hoyIso + vecinos. */
export interface FichaDerivada {
  cliente: ClienteDerivado;
  totalClases: number | null;
  dayDenom: number;
  compradoDisplay: string;
  altaDisplay: string;
  presentHoy: boolean;
  horaHoy: string | null;
  historial: FichaAsistencia[];
  pagos: FichaPago[];
  ventasCount: number;
  waText: string;
}

/**
 * Shape the ficha from already-fetched rows. PURE — `hoy`/`hoyIso` are passed
 * in (Chihuahua-local), the recordatorio body + negocio are pre-fetched; no I/O.
 * `asistencias` is this month's rows (most-recent first); `ventas` is the full
 * history (most-recent first), so `ventas[0]` is the active package.
 */
export function shapeFicha(
  c: FichaClienteRow,
  asistencias: FichaAsistRow[],
  ventas: FichaVentaRow[],
  hoy: Date,
  hoyIso: string,
  recordatorioBody: string,
  negocio: string,
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

  const waText = renderPlantilla(recordatorioBody, {
    nombre: firstName(c.nombre),
    clases: cliente.clasesRest === "ilimitado" ? "clases ilimitadas" : `${cliente.clasesRest} clases`,
    paquete: cliente.paquete,
    vence: cliente.venceDisplay,
    negocio,
  });

  return {
    cliente,
    totalClases,
    dayDenom,
    compradoDisplay,
    altaDisplay,
    presentHoy,
    horaHoy,
    historial,
    pagos,
    ventasCount: ventas.length,
    waText,
  };
}
