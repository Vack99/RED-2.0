/**
 * Shared presentation logic for a scheduled session (`class_session`) across the
 * three agenda surfaces — the day-view card, the week-view row, and the
 * quick-glance sheet. Pure and token-only: the occupancy/time `EstadoSesion`
 * arrives already-derived (the domain tier owns the booked/cap/now math, ADR-0010
 * §derived-occupancy), and these helpers map it to brand-contract tokens + es-MX
 * labels. The mock's Forge gold is paint — every colour here is a `var(--*)`.
 */

/**
 * The occupancy/time state a session renders in. Derived elsewhere; the
 * next-upcoming and evento-especial accents are orthogonal flags, not states
 * (a session can be both "próxima" and "casi_lleno").
 */
export type EstadoSesion = "normal" | "casi_lleno" | "lleno" | "termino";

export interface EstadoVisual {
  /** Status badge copy, or null when the session shows no badge (disponible). */
  statusLabel: string | null;
  /** Badge text colour. */
  statusToken: string;
  /** Progress-bar fill colour. */
  barToken: string;
  /** Week-row status dot colour. */
  dotToken: string;
  /** Whether the session reads terminated (dimmed). */
  dimmed: boolean;
}

const MUTED_SOFT = "var(--muted-soft)";

export function estadoVisual(estado: EstadoSesion): EstadoVisual {
  switch (estado) {
    case "casi_lleno":
      return { statusLabel: "Casi lleno", statusToken: "var(--yellow)", barToken: "var(--yellow)", dotToken: "var(--yellow)", dimmed: false };
    case "lleno":
      return { statusLabel: "Lleno", statusToken: "var(--red)", barToken: "var(--red)", dotToken: "var(--red)", dimmed: false };
    case "termino":
      return { statusLabel: "Terminó", statusToken: MUTED_SOFT, barToken: "var(--line)", dotToken: "var(--line)", dimmed: true };
    default:
      // disponible — no badge, neutral bar/dot.
      return { statusLabel: null, statusToken: "var(--muted)", barToken: MUTED_SOFT, dotToken: MUTED_SOFT, dimmed: false };
  }
}

/** Occupancy as a whole percent 0..100, clamped, cap-0 guarded — the bar width. */
export function occupancyPct(booked: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, Math.round((booked / cap) * 100));
}

/** The "18 / 20" reserved-of-capacity label. */
export function countLabel(booked: number, cap: number): string {
  return `${booked} / ${cap}`;
}
