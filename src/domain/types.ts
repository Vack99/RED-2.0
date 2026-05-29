// ──────────────────────────────────────────────────────────────
// Forge domain types — the stack-agnostic vocabulary the rules
// operate on. Pure data shapes: NO React, NO Supabase, NO imports
// from src/components or src/app (enforced by .dependency-cruiser.cjs).
//
// These are the canonical domain types. The mock screens still use the
// legacy shapes in src/lib/data/types.ts; those converge onto these
// during the Supabase migration cycle (see docs/MIGRATION.md).
// ──────────────────────────────────────────────────────────────

/** A class count. Ilimitado packages have no numeric limit. */
export type Clases = number | "ilimitado";

/** A client's lifecycle state — DERIVED, never stored (ADR-0002). */
export type EstadoCliente = "activo" | "por_vencer" | "sin_clases";

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

/** Tokens available to WhatsApp templates; each maps to a {token} in a
 *  template body. See renderPlantilla. */
export interface PlantillaContext {
  nombre?: string;
  clases?: string;
  vence?: string;
  dias?: string;
  precios?: string;
  datos_pago?: string;
}
