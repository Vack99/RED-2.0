// Pure row-shaper for the respaldo export (ADR-0006). Given the gathered DTOs +
// the injected Chihuahua "today", produces the four worksheets the operator's
// weekly Excel backup needs. ALL formatting + derived columns live here; this is
// the contract anchor (the gather imports the types below with `import type`, and
// the thin workbook assembler consumes RespaldoRows). PURE — no I/O, no ExcelJS,
// fully unit-tested in rows.test.ts.
//
// Estado / urgencia are NEVER re-derived here: they come from the read-side
// derivation (derivarCliente / urgenciaCliente, ADR-0002), the single home for
// "how a client is doing". Money columns are emitted as raw numbers (summable in
// Excel — PRD US#7); the workbook applies the peso number format to `money` cols.
// Dates are shaped to TEXT here (no Excel timezone footguns): ledger dates that
// span years are ISO (isoDay), near-future / recurring dates are day-month (fmtShort).

import { derivarCliente } from "../derive";
import type { ClienteFacts } from "../derive";
import { fechaEnZona, fmtShort, isoDay, parseDay } from "@gym/format";
import { urgenciaCliente } from "@gym/domain/rules";
import type { CorteMes, EstadoCliente, NivelUrgencia } from "@gym/domain/types";

// ── The contract — RespaldoData (DAL → shaper) + RespaldoRows (shaper → workbook) ──

/** Full roster client facts + the extra contact/standing fields the Clientes sheet needs.
 *  ClienteFacts = { id, nombre, tel, paquete_nombre, clases_restantes, vence }. */
export interface RespaldoCliente extends ClienteFacts {
  email: string | null;
  birthday: string | null; // 'YYYY-MM-DD'
  alta: string; // created_at (timestamptz)
}

/** A ventas ledger row (full history). */
export interface RespaldoVenta {
  folio: number;
  fecha: string; // timestamptz — the sale's EFFECTIVE (possibly backdated) date
  created_at: string; // timestamptz — when the row was actually written (backdate marker, spec D5/F1)
  cliente_id: string;
  paquete_nombre: string;
  monto: number;
  metodo: string; // MetodoPago text
  vigencia_tipo: string; // "dias" | "mes"
  vigencia_dias: number | null;
}

/** An asistencia ledger row (full history, already soft-delete-filtered by the gather). */
export interface RespaldoAsistencia {
  fecha: string; // 'YYYY-MM-DD'
  hora: string | null; // 'HH:MM:SS' | null (back-entered)
  cliente_id: string;
}

/** A package catalog row. */
export interface RespaldoPaquete {
  nombre: string;
  precio: number;
  clases: number | null; // null = ilimitado
  vigencia_tipo: string; // "dias" | "mes"
  vigencia_dias: number | null;
}

/** Gather output (DAL → shaper). Carries raw DTOs; the shaper formats.
 *  Month mode (?mes=): `mes` anchors the requested month and `corte` carries the
 *  fold's numbers (computed in @gym/domain — the shaper only formats them); the
 *  ledgers then SPAN the prior month too (the corte's prev block needs it), and
 *  the month sheets filter in the shaper. Default (últimos 24 meses): both null. */
export interface RespaldoData {
  generadoHoy: Date; // injected gym-local "today" — keeps the shaper pure & deterministic
  tz: string; // the resolved gym's IANA zone — every fechaEnZona call below uses this
  mes: Date | null;
  corte: CorteMes | null;
  clientes: RespaldoCliente[];
  ventas: RespaldoVenta[];
  asistencias: RespaldoAsistencia[];
  paquetes: RespaldoPaquete[];
}

/** One worksheet's shaped output. `money` = 0-based column indices to peso-format in ExcelJS. */
export interface RespaldoSheet {
  name: string; // tab name
  headers: string[]; // Spanish headers
  rows: Array<Array<string | number>>;
  money?: number[];
  /** 0-based indices into `rows` to render bold (the Ventas TOTAL row, the Resumen
   *  title/section rows). The assembler stays dumb — it only applies the flag. */
  boldRows?: number[];
}

export interface RespaldoRows {
  clientes: RespaldoSheet;
  ventas: RespaldoSheet;
  asistencias: RespaldoSheet;
  paquetes: RespaldoSheet;
}

// ── Display label maps (no central map exists in the repo — see build-spec §3) ──

const ESTADO_LABEL: Record<EstadoCliente, string> = {
  activo: "Activo",
  por_vencer: "Por vencer",
  sin_clases: "Sin clases",
};

const URGENCIA_LABEL: Record<NivelUrgencia, string> = {
  critico: "Crítico",
  urgente: "Urgente",
  pronto: "Pronto",
  ok: "OK",
};

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

// ── Small shared formatters ──

const EM_DASH = "—";

/** "Ilimitado" / "1 clase" / "N clases" from a class count (null = ilimitado). */
function clasesLabel(n: number | null | "ilimitado"): string {
  if (n === null || n === "ilimitado") return "Ilimitado";
  return `${n} clase${n === 1 ? "" : "s"}`;
}

/** Mirrors PaqueteDTO.vigencia: "30 días" for a mes package (flat 30, ruling C1), "N días" otherwise. */
function vigenciaLabel(tipo: string, dias: number | null): string {
  return tipo === "mes" ? "30 días" : `${dias} días`;
}

/** True when `d` falls in the calendar month/year of `ref` (gym-local Dates).
 *  Mirrors @gym/domain's private mismoMes — deliberate sibling duplication, same
 *  as offsetMsEnZona (the packages are peers, not layered). */
function mismoMesLocal(d: Date, ref: Date): boolean {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

// ── The shaper ──

/**
 * The single sheet-list entry the workbook consumes, in tab order.
 * Default (últimos 24 meses): the classic 4 sheets. Month mode (`data.mes` +
 * `data.corte` set): Resumen first, month-filtered Ventas (with the bold TOTAL
 * row) + Asistencias, Altas (the roster filtered to the month's signups — the
 * roster itself stays full so cliente_id → nombre never renders "—"), Paquetes.
 */
export function buildRespaldoSheets(data: RespaldoData): RespaldoSheet[] {
  const rows = buildRespaldoRows(data);
  if (!data.mes || !data.corte) {
    return [rows.clientes, rows.ventas, rows.asistencias, rows.paquetes];
  }
  return [
    shapeResumen(data.mes, data.corte, data.generadoHoy),
    rows.ventas,
    rows.asistencias,
    shapeAltas(data),
    rows.paquetes,
  ];
}

export function buildRespaldoRows(data: RespaldoData): RespaldoRows {
  // Denormalize cliente_id → nombre for the Ventas + Asistencias sheets. An id not
  // in the roster (hard-deleted client) falls back to "—".
  const nombrePorId = new Map(data.clientes.map((c) => [c.id, c.nombre]));
  const nombreDe = (id: string) => nombrePorId.get(id) ?? EM_DASH;

  return {
    clientes: shapeClientes(data),
    ventas: shapeVentas(data, nombreDe),
    asistencias: shapeAsistencias(data, nombreDe),
    paquetes: shapePaquetes(data),
  };
}

function shapeClientes(data: RespaldoData): RespaldoSheet {
  const headers = [
    "Nombre",
    "Teléfono",
    "Email",
    "Cumpleaños",
    "Paquete",
    "Clases restantes",
    "Vence",
    "Estado",
    "Urgencia",
    "Alta",
  ];
  const rows = data.clientes.map((c) => {
    // REUSE the read-side derivation — never re-derive estado/urgencia (ADR-0002).
    // asistEsteMes is omitted from this sheet, so pass 0 (build-spec §0).
    const d = derivarCliente(c, data.generadoHoy, 0);
    const u = urgenciaCliente({ clases: d.clasesRest, dias: d.diasRest });
    return [
      c.nombre,
      c.tel,
      c.email ?? EM_DASH,
      c.birthday ? fmtShort(parseDay(c.birthday)) : EM_DASH,
      d.paquete,
      clasesLabel(d.clasesRest),
      d.venceDisplay,
      ESTADO_LABEL[d.estado],
      URGENCIA_LABEL[u.nivel],
      isoDay(fechaEnZona(c.alta, data.tz)),
    ];
  });
  return { name: "Clientes", headers, rows };
}

function shapeVentas(data: RespaldoData, nombreDe: (id: string) => string): RespaldoSheet {
  // "Registrado" is the backdate marker column (spec D5/F1): a sale whose Fecha
  // (effective date) differs from the day it was actually written reads "registrado
  // el DD mmm", so a re-exported month whose total changed — or a folio out of Fecha
  // order — is legible as intentional, not corruption. Blank for the 99% today-sale.
  const headers = ["Folio", "Fecha", "Cliente", "Paquete", "Monto", "Método", "Vigencia", "Registrado"];
  // Month mode: the gather's window spans the prior month (the corte's prev block
  // needs those rows) — the SHEET shows only the requested month (the Altas pattern).
  const enMes = data.mes
    ? data.ventas.filter((v) => mismoMesLocal(fechaEnZona(v.fecha, data.tz), data.mes!))
    : data.ventas;
  const rows: Array<Array<string | number>> = enMes.map((v) => {
    const fechaLocal = fechaEnZona(v.fecha, data.tz);
    const creadoLocal = fechaEnZona(v.created_at, data.tz);
    // Derived marker, zero new columns on the DB (spec F1): backdated iff the effective
    // day ≠ the write day, both in the gym's zone.
    const backdated = isoDay(fechaLocal) !== isoDay(creadoLocal);
    return [
      v.folio,
      isoDay(fechaLocal),
      nombreDe(v.cliente_id),
      v.paquete_nombre,
      v.monto, // raw NUMBER — peso-formatted in the workbook
      METODO_LABEL[v.metodo] ?? v.metodo,
      vigenciaLabel(v.vigencia_tipo, v.vigencia_dias),
      backdated ? `registrado el ${fmtShort(creadoLocal)}` : "",
    ];
  });
  if (!data.mes) return { name: "Ventas", headers, rows, money: [4] };
  // Month mode closes with a blank row + a bold TOTAL row: label in col A, the
  // count in the Paquete col, the sum in the Monto col (under the numbers it totals).
  const total = enMes.reduce((s, v) => s + Number(v.monto), 0);
  rows.push([]);
  rows.push(["TOTAL", "", "", `${enMes.length} venta${enMes.length === 1 ? "" : "s"}`, total, "", "", ""]);
  return { name: "Ventas", headers, rows, money: [4], boldRows: [rows.length - 1] };
}

function shapeAsistencias(
  data: RespaldoData,
  nombreDe: (id: string) => string,
): RespaldoSheet {
  const headers = ["Fecha", "Hora", "Cliente"];
  const enMes = data.mes
    ? data.asistencias.filter((a) => mismoMesLocal(parseDay(a.fecha.slice(0, 10)), data.mes!))
    : data.asistencias;
  const rows = enMes.map((a) => [
    isoDay(parseDay(a.fecha.slice(0, 10))),
    a.hora ? a.hora.slice(0, 5) : EM_DASH,
    nombreDe(a.cliente_id),
  ]);
  return { name: "Asistencias", headers, rows };
}

/** Altas del mes: the full-roster clientes sheet, filtered to signups whose
 *  `created_at` falls in the requested month — in the SHAPER, never the query
 *  (windowing the roster would blank names on the other sheets). Estado /
 *  Clases restantes / Urgencia have no history table, so the headers say (hoy). */
function shapeAltas(data: RespaldoData): RespaldoSheet {
  const base = shapeClientes({
    ...data,
    clientes: data.clientes.filter((c) => mismoMesLocal(fechaEnZona(c.alta, data.tz), data.mes!)),
  });
  const headers = base.headers.map((h) =>
    h === "Estado" || h === "Clases restantes" || h === "Urgencia" ? `${h} (hoy)` : h,
  );
  return { ...base, name: "Altas", headers };
}

/** The Resumen sheet: FORMATS the corte's numbers — never computes them (the fold
 *  in @gym/domain owns the math; spec §2.3). 3 columns so the peso format lands
 *  only on money and counts stay plain integers. */
function shapeResumen(mes: Date, corte: CorteMes, hoy: Date): RespaldoSheet {
  const mesLargo = new Intl.DateTimeFormat("es-MX", { month: "long" }).format(mes).toUpperCase();
  const titulo = `RESUMEN — ${mesLargo} ${mes.getFullYear()}${
    corte.parcial ? ` (parcial al ${fmtShort(hoy)})` : ""
  }`;
  const prevTitulo = corte.parcial ? `MES ANTERIOR (al día ${hoy.getDate()})` : "MES ANTERIOR (completo)";
  const rows: Array<Array<string | number>> = [
    [titulo, "", ""],
    [],
    ["Ingresos", corte.ingresos, ""],
    ["Ventas", "", corte.ventas],
    ["Ticket promedio", corte.ticketPromedio, ""],
    ["Efectivo", corte.porMetodo.efectivo, ""],
    ["Transferencia", corte.porMetodo.transferencia, ""],
    ["Tarjeta", corte.porMetodo.tarjeta, ""],
    ["Altas del mes", "", corte.altas],
    ["Asistencias del mes", "", corte.asistencias],
    [],
  ];
  const prevIdx = rows.length; // captured, not hardcoded — inserting a row above can't un-bold it
  rows.push(
    [prevTitulo, "", ""],
    ["Ingresos", corte.prev.ingresos, ""],
    ["Ventas", "", corte.prev.ventas],
    ["Asistencias", "", corte.prev.asistencias],
  );
  return {
    name: "Resumen",
    headers: ["Concepto", "Monto", "Cantidad"],
    rows,
    money: [1],
    boldRows: [0, prevIdx],
  };
}

function shapePaquetes(data: RespaldoData): RespaldoSheet {
  const headers = ["Paquete", "Clases", "Precio", "Vigencia"];
  const rows = data.paquetes.map((p) => [
    p.nombre,
    clasesLabel(p.clases),
    p.precio, // raw NUMBER — peso-formatted in the workbook
    vigenciaLabel(p.vigencia_tipo, p.vigencia_dias),
  ]);
  return { name: "Paquetes", headers, rows, money: [2] };
}
