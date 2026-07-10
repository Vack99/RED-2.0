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
import type { EstadoCliente, NivelUrgencia } from "@gym/domain/types";

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
  fecha: string; // timestamptz
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

/** Gather output (DAL → shaper). Carries raw DTOs; the shaper formats. */
export interface RespaldoData {
  generadoHoy: Date; // injected gym-local "today" — keeps the shaper pure & deterministic
  tz: string; // the resolved gym's IANA zone — every fechaEnZona call below uses this
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

/** Mirrors PaqueteDTO.vigencia: "todo el mes" for a mes package, "N días" otherwise. */
function vigenciaLabel(tipo: string, dias: number | null): string {
  return tipo === "mes" ? "todo el mes" : `${dias} días`;
}

// ── The shaper ──

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
  const headers = ["Folio", "Fecha", "Cliente", "Paquete", "Monto", "Método", "Vigencia"];
  const rows = data.ventas.map((v) => [
    v.folio,
    isoDay(fechaEnZona(v.fecha, data.tz)),
    nombreDe(v.cliente_id),
    v.paquete_nombre,
    v.monto, // raw NUMBER — peso-formatted in the workbook
    METODO_LABEL[v.metodo] ?? v.metodo,
    vigenciaLabel(v.vigencia_tipo, v.vigencia_dias),
  ]);
  return { name: "Ventas", headers, rows, money: [4] };
}

function shapeAsistencias(
  data: RespaldoData,
  nombreDe: (id: string) => string,
): RespaldoSheet {
  const headers = ["Fecha", "Hora", "Cliente"];
  const rows = data.asistencias.map((a) => [
    isoDay(parseDay(a.fecha.slice(0, 10))),
    a.hora ? a.hora.slice(0, 5) : EM_DASH,
    nombreDe(a.cliente_id),
  ]);
  return { name: "Asistencias", headers, rows };
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
