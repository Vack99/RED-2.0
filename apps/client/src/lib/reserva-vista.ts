import type { AvisoReserva, MotivoReserva, VeredictoReserva } from "@gym/domain/reserva";
import type { EstadoSesion } from "@gym/domain/types";

/**
 * El veredicto de reservabilidad → la presentación del socio. `derivarReservabilidad`
 * (@gym/domain/reserva) decides WHETHER the member can book and why; this module is the
 * single home for how that verdict READS — so the week card, the summary sheet and the
 * class page all say the same words about the same verdict, and the JSX carries no
 * branching.
 *
 * Visual tones the mock defines — `finished` (dimmed, done/locked), `full` (danger),
 * `open` (accent, bookable). `casi_lleno` and `a_continuacion` fold into `open` (both
 * bookable; the occupancy bar carries the near-full / next-up signal), and both member-side
 * locks (`vencido`, `sin_clases`) reuse the dimmed `finished` tone: this session is not
 * bookable BY YOU, and tapping still opens the sheet's renew/buy path.
 */

export type TonoReserva = "finished" | "full" | "open";

export interface EstadoReservaVista {
  tono: TonoReserva;
  /** Big count on the card: "—" when the member can't book at all, else the free-spot number. */
  numero: string;
  /** Small unit label: "terminada" | "reservada" | "vencido" | "sin clases" | "lleno" | "libre" | "libres". */
  unidad: string;
  /** Right-rail action label. */
  cta: string;
  /** Whether the CTA reads as a live "Reservar" affordance (vs a done/locked/booked chip). */
  reservable: boolean;
  /** Whether this card is the member's own booking (renders the check chip). */
  reservada: boolean;
  /** Whether the whole card is visually dimmed (past or locked). */
  atenuada: boolean;
}

/** The week card's read of a verdict. `disponibles` is the session's free-spot count —
 *  shown only where it is actionable (a locked member gets an em-dash, not a number they
 *  cannot use). */
export function presentarEstadoReserva(
  veredicto: VeredictoReserva,
  disponibles: number,
): EstadoReservaVista {
  const bloqueado = { tono: "finished", numero: "—", reservable: false, reservada: false, atenuada: true } as const;
  switch (veredicto.motivo) {
    case "terminada":
      return { ...bloqueado, unidad: "terminada", cta: "Terminó" };
    case "reservada":
      return {
        tono: "open",
        numero: String(disponibles),
        unidad: "reservada",
        cta: "Reservada",
        reservable: false,
        reservada: true,
        atenuada: false,
      };
    case "vencido":
      // Lapsed membership (#118 E4): the whole week reads locked, not a green "Reservar"
      // the sheet only retracts one tap later.
      return { ...bloqueado, unidad: "vencido", cta: "Vencido" };
    case "sin_clases":
      // The SAME defect as vencido, from the same saldo (the RPC refuses both alike) — the
      // card used to lock on one and not the other.
      return { ...bloqueado, unidad: "sin clases", cta: "Sin clases" };
    case "llena":
      return {
        tono: "full",
        numero: String(disponibles),
        unidad: "lleno",
        cta: "Lleno",
        reservable: false,
        reservada: false,
        atenuada: false,
      };
    case "libre":
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
}

/** The hero/sheet status chip. It describes THE CLASS, so the two member-side locks
 *  (`vencido` / `sin_clases`) leave it alone — a class with seats still reads "Disponible"
 *  to a member who cannot take it; the CTA below is what refuses them. */
export function badgeDeReserva(
  veredicto: VeredictoReserva,
  estado: EstadoSesion,
): { texto: string; clase: string } {
  switch (veredicto.motivo) {
    case "terminada":
      return { texto: "Terminada", clase: "border-line bg-sunk text-muted" };
    case "reservada":
      return { texto: "Reservada", clase: "border-accent/40 bg-accent-soft text-accent" };
    case "llena":
      return { texto: "Llena", clase: "border-warning/40 bg-warning-soft text-warning" };
    default:
      return estado === "casi_lleno"
        ? { texto: "Pocos lugares", clase: "border-warning/40 bg-warning-soft text-warning" }
        : { texto: "Disponible", clase: "border-accent/40 bg-accent-soft text-accent" };
  }
}

/** The reason line above a BLOCKED CTA, by motivo. `reservada` is absent on purpose: it is
 *  the one motivo whose line depends on the surface's own affordance (the week sheet
 *  dismisses, the class page cancels), so each writes its own. `vencido` / `sin_clases`
 *  render inside `CtaVerPlanes` (paga en tu gym → /precios, never a dead-end button). */
export const LINEA_BLOQUEO: Record<Exclude<MotivoReserva, "libre" | "reservada">, string> = {
  terminada: "Esta clase ya pasó.",
  vencido: "Tu paquete venció. Renueva en tu gimnasio para reservar.",
  llena: "Clase llena. No hay lugares disponibles.",
  sin_clases: "No te quedan clases en tu plan. Compra un paquete en tu gimnasio para reservar.",
};

export interface AvisoVista {
  texto: string;
  /** Renders in the warning tone (the cupo urgency), vs the muted consent lines. */
  urgente: boolean;
}

/** The consent / urgency line above a LIVE booking CTA. `esHoy` is whether the session's
 *  gym-local day IS today — the #89 nota says "hoy" only then. */
export function presentarAvisoReserva(
  aviso: AvisoReserva,
  ctx: { clasesRestantes: number | null; disponibles: number; esHoy: boolean },
): AvisoVista {
  switch (aviso) {
    case "otra_ese_dia":
      return {
        texto: `Ya tienes una clase ${ctx.esHoy ? "hoy" : "ese día"} — esta usará otra de tus ${ctx.clasesRestantes} clases.`,
        urgente: false,
      };
    case "casi_llena":
      return {
        texto: `Solo ${ctx.disponibles} libre${ctx.disponibles === 1 ? "" : "s"} · asegura tu lugar`,
        urgente: true,
      };
    case "ilimitado":
      return { texto: "Reserva incluida en tu plan ilimitado.", urgente: false };
    case "consume_una":
      return { texto: `Esta reserva usa 1 de tus ${ctx.clasesRestantes} clases`, urgente: false };
  }
}
