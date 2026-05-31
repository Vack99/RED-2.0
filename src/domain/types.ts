// ──────────────────────────────────────────────────────────────
// Forge domain types — the stack-agnostic vocabulary the rules
// operate on. Pure data shapes: NO React, NO Supabase, NO imports
// from src/components or src/app (enforced by .dependency-cruiser.cjs).
//
// These are the canonical domain types — the single source of truth for the
// gym's vocabulary. The DAL (src/lib/data) maps DB rows to DTOs and calls the
// rules in rules.ts; nothing here imports React, Supabase, or a screen.
// ──────────────────────────────────────────────────────────────

/** A class count. Ilimitado packages have no numeric limit. */
export type Clases = number | "ilimitado";

/** A client's lifecycle state — DERIVED, never stored (ADR-0002). */
export type EstadoCliente = "activo" | "por_vencer" | "sin_clases";

/** Retention urgency level — DERIVED from saldo. Finer-grained than
 *  EstadoCliente's por_vencer; drives the directory's "por renovar" model. */
export type NivelUrgencia = "critico" | "urgente" | "pronto" | "ok";

/** A client's retention urgency: level + which dimension binds + a sort score.
 *  The single shape the roster/ficha consume so "running out" lives in one home. */
export interface Urgencia {
  nivel: NivelUrgencia;
  /** Whichever of clases|días lapses first. */
  vinculante: "clases" | "dias";
  /** Normalized distance to lapse (lower = sooner); drives the urgency sort. */
  score: number;
}

/** Payment method. "pendiente" == "por pagar" (optional, brief Q7). */
export type MetodoPago = "efectivo" | "transferencia" | "tarjeta" | "pendiente";

/** Validity window: a fixed number of days, or the remainder of the
 *  purchase calendar month ("mes", used by Ilimitado — brief Q1). */
export type Vigencia = number | "mes";

/** What a client has left of their active package. */
export interface Saldo {
  /** Classes remaining (or "ilimitado"). */
  clases: Clases;
  /** Whole days remaining until the package expires (negative once expired). */
  dias: number;
}

/** The classes + days a freshly-bought package contributes. */
export interface CompraPaquete {
  clases: Clases;
  dias: number;
}

/** A venta reduced to what the monthly resumen needs: when + how much.
 *  The DAL parses the DB row's timestamp to a Chihuahua-local Date. */
export interface VentaResumen {
  /** Chihuahua-local calendar date of the sale. */
  fecha: Date;
  monto: number;
}

/** An asistencia reduced to what the monthly resumen needs: when.
 *  The DAL parses the DB row's `date` to a Chihuahua-local Date. */
export interface AsistenciaResumen {
  /** Chihuahua-local calendar date of the attendance. */
  fecha: Date;
}

/** Dashboard / cuenta monthly aggregates — DERIVED at read from the ventas +
 *  asistencias ledgers (ADR-0002). Pure: `hoy` is passed into calcularResumenMes,
 *  never read from a clock. Prior-period fields let the screen show deltas. */
export interface ResumenMes {
  /** Sum of `monto` for ventas in the current calendar month. */
  ingresosMes: number;
  /** Count of ventas in the current calendar month. */
  ventasMes: number;
  /** Count of asistencias in the current calendar month. */
  asistMes: number;
  /** Same three totals for the PRIOR calendar month (for period-over-period deltas). */
  ingresosMesPrev: number;
  ventasMesPrev: number;
  asistMesPrev: number;
  /** Asistencias whose fecha === hoy. */
  asistenciasHoy: number;
  /** Asistencias whose fecha === hoy − 1 day. */
  asistenciasAyer: number;
  /** Sum of `monto` for ventas in the last 7 days (inclusive of hoy). */
  ingresosSemana: number;
  /** 7-element daily asistencia counts, oldest→newest, the last entry === hoy. */
  asistenciasSemana: number[];
}

/** Tokens available to WhatsApp templates; each maps to a {token} in a
 *  template body. See renderPlantilla. */
export interface PlantillaContext {
  nombre?: string;
  /** Pre-formatted display string (e.g. "5 clases" or "Ilimitado") — NOT a Clases count. */
  clases?: string;
  /** The package name, e.g. "Ilimitado" — used by the recordatorio template. */
  paquete?: string;
  vence?: string;
  dias?: string;
  precios?: string;
  datos_pago?: string;
  /** The operator's brand, sourced from perfil.negocio (e.g. "FORGE"). */
  negocio?: string;
}
