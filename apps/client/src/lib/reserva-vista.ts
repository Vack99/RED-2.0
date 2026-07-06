import type { EstadoSesion } from "@gym/domain/types";

/**
 * The domain state ladder → booking-card presentation (mock: Reservar cards). The
 * single home for "how a session estado reads on a member card", so the JSX carries
 * no branching. Visual tones the mock defines — `finished` (dimmed, done), `full`
 * (danger, locked), `open` (accent, bookable) — with `casi_lleno` and `a_continuacion`
 * folding into `open` (both bookable; the occupancy bar carries the near-full / next-up
 * signal). A session the member already holds resolves to the accent `open` tone with
 * `reservada: true` (the "Reservada" chip). Priority: terminada > reservada > lleno >
 * open — a booked full class reads "Reservada" (you are in), never "Lleno".
 */

export type TonoReserva = "finished" | "full" | "open";

export interface EstadoReservaVista {
  tono: TonoReserva;
  /** Big count on the card: "—" when terminada, else the free-spot number. */
  numero: string;
  /** Small unit label: "terminada" | "reservada" | "lleno" | "libre" | "libres". */
  unidad: string;
  /** Right-rail action label. */
  cta: string;
  /** Whether the CTA reads as a live "Reservar" affordance (vs a done/locked/booked chip). */
  reservable: boolean;
  /** Whether this card is the member's own booking (renders the check chip). */
  reservada: boolean;
  /** Whether the whole card is visually dimmed (past sessions). */
  atenuada: boolean;
}

export function presentarEstadoReserva(
  estado: EstadoSesion,
  disponibles: number,
  miReserva = false,
): EstadoReservaVista {
  if (estado === "termino") {
    return { tono: "finished", numero: "—", unidad: "terminada", cta: "Terminó", reservable: false, reservada: false, atenuada: true };
  }
  if (miReserva) {
    return { tono: "open", numero: String(disponibles), unidad: "reservada", cta: "Reservada", reservable: false, reservada: true, atenuada: false };
  }
  if (estado === "lleno") {
    return { tono: "full", numero: String(disponibles), unidad: "lleno", cta: "Lleno", reservable: false, reservada: false, atenuada: false };
  }
  return {
    tono: "open",
    numero: String(disponibles),
    unidad: disponibles === 1 ? "libre" : "libres",
    cta: "Reservar",
    reservable: true,
    reservada: false,
    atenuada: false,
  };
}
