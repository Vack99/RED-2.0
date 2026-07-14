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

/** A client's retention urgency: level + which dimension binds.
 *  The single shape the roster/ficha consume so "running out" lives in one home. */
export interface Urgencia {
  nivel: NivelUrgencia;
  /** Whichever of clases|días lapses first. */
  vinculante: "clases" | "dias";
}

/** Roster lifecycle summary — counts derived from each cliente's estado (ADR-0002).
 *  The single shape the dashboard + directory consume so "who counts as vigente /
 *  as an active member" lives in one home (resumirRoster), never an inline filter. */
export interface ResumenRoster {
  /** Clientes whose package is fully active (estado === "activo"). */
  vigentes: number;
  /** Clientes who still count as members (estado !== "sin_clases") — the "/ N" denominator. */
  totalActivos: number;
}

/** Payment method. Every sale collects at COBRAR — there is no "por pagar"
 *  credit sale (ruling C2; prod had zero such rows, so the narrowing is clean). */
export type MetodoPago = "efectivo" | "transferencia" | "tarjeta";

/** Validity window: a fixed number of days, or "mes" — a flat 30 days from the
 *  purchase date (ruling C1, 2026-07-08; month-end semantics are gone). */
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

/** A venta as the month corte needs it: when + how much + how it was paid.
 *  Deliberately NOT a widening of VentaResumen — that would silently change the
 *  input contract of a live rule (spec 2026-07-13 §2.3). */
export interface VentaMes {
  /** Gym-local calendar date of the sale (DAL parses at the boundary). */
  fecha: Date;
  monto: number;
  metodo: MetodoPago;
}

/** An alta (client signup) reduced to when it happened, gym-local. */
export interface AltaMes {
  fecha: Date;
}

/** The month corte the respaldo's Resumen sheet consumes. Raw numbers only —
 *  Excel needs them summable; formatting is the shaper's job. */
export interface CorteMes {
  ingresos: number;
  ventas: number;
  /** ingresos / ventas, 0 when the month has no sales. */
  ticketPromedio: number;
  /** Desglose by the 3 payment methods (metodo='pendiente' cannot exist — DB CHECK). */
  porMetodo: Record<MetodoPago, number>;
  altas: number;
  asistencias: number;
  /** True when `mes` is the in-progress month: the prev block below is cut to the
   *  same day-of-month (like-for-like); a closed month compares FULL prev. */
  parcial: boolean;
  prev: {
    ingresos: number;
    ventas: number;
    asistencias: number;
  };
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
  /** Same three totals for the prior calendar month THROUGH the same day-of-month
   *  as hoy (prior-month-to-date) — equal elapsed slice, so the delta compares
   *  like-for-like from day 1. */
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

// ── Agenda scheduling types (Phase 5, ADR-0010) ──────────────────────────

/** A class_session's derived estado — DERIVED live, never stored (ADR-0010 §3,
 *  invariant §5.1). `termino`: starts_at has passed. `a_continuacion`: the
 *  day's first non-past session. `lleno`/`casi_lleno`: occupancy-driven (count
 *  >= capacity / ratio >= 0.85). `normal`: none of the above. A strict ladder —
 *  termino > a_continuacion > lleno > casi_lleno > normal — never combined. */
export type EstadoSesion = "termino" | "a_continuacion" | "lleno" | "casi_lleno" | "normal";

/** The minimal shape derivarEstadoSesion / derivarEstadosDia need per session. */
export interface SesionOcupacion {
  startsAt: Date;
  capacidad: number;
  activos: number;
}

/** A schedule_template's recurrence rule, reduced to what materializarSesion
 *  needs (ADR-0010 §1): weekday 0=Lunes..5=Sábado (the schema's Lun-Sáb
 *  convention — there is no Domingo class day) + a wall-clock start_time
 *  ("HH:MM"). `duration_min`/`capacity` live on the template row but don't
 *  participate in computing the instant. */
export interface PlantillaHorario {
  weekday: number;
  startTime: string;
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
