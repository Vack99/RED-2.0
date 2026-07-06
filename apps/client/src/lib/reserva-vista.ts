import type { EstadoSesion } from "@gym/domain/types";

/**
 * The domain state ladder → booking-card presentation (mock: Reservar cards). The
 * single home for "how a session estado reads on a member card", so the JSX carries
 * no branching. Three visual tones the mock defines — `finished` (dimmed, done),
 * `full` (danger, locked), `open` (accent, bookable) — with `casi_lleno` and
 * `a_continuacion` folding into `open` (both are bookable; the occupancy bar, not
 * the chip, carries the near-full / next-up signal). `reservable` styles the CTA;
 * the CTA itself is inert until booking ships (slice #57).
 */

export type TonoReserva = "finished" | "full" | "open";

export interface EstadoReservaVista {
  tono: TonoReserva;
  /** Big count on the card: "—" when terminada, else the free-spot number. */
  numero: string;
  /** Small unit label: "terminada" | "lleno" | "libre" | "libres". */
  unidad: string;
  /** Right-rail action label. */
  cta: string;
  /** Whether the CTA reads as a live "Reservar" affordance (vs a done/locked chip). */
  reservable: boolean;
  /** Whether the whole card is visually dimmed (past sessions). */
  atenuada: boolean;
}

export function presentarEstadoReserva(
  estado: EstadoSesion,
  disponibles: number,
): EstadoReservaVista {
  if (estado === "termino") {
    return { tono: "finished", numero: "—", unidad: "terminada", cta: "Terminó", reservable: false, atenuada: true };
  }
  if (estado === "lleno") {
    return { tono: "full", numero: String(disponibles), unidad: "lleno", cta: "Lleno", reservable: false, atenuada: false };
  }
  return {
    tono: "open",
    numero: String(disponibles),
    unidad: disponibles === 1 ? "libre" : "libres",
    cta: "Reservar",
    reservable: true,
    atenuada: false,
  };
}
