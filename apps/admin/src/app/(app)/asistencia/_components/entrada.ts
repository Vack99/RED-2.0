/**
 * The Cupo desk's entry step (#330) — asks BEFORE the roster shows names, replacing the
 * ±90-minute auto-guess as how a class gets picked. It fixes the ONE
 * thing the roster reads before it can render: the context (`ctx`/`ctxSel` — see
 * marcadas.ts). Nothing here writes; picking an option only sets that context.
 *
 * Only TODAY ever has a session list — the desk fetches no other day's agenda, and a
 * past day's capture is already pinned to ACCESO LIBRE (asistencia.tsx's `ctxSel`) — so
 * "the sessions of the chosen date" reduces to: today offers its classes plus LIBRE,
 * every other date (a past pick, a no-schedule day, a failed agenda read) offers only
 * LIBRE. Lista never reaches this module: its desk is forced ACCESO LIBRE by #329,
 * upstream of where the entry step would be shown.
 */

import { ctxDe, LIBRE, personasEn, type Visita } from "./marcadas";

/** One choice on the entry step: a class with its "N/M" occupancy, or ACCESO LIBRE
 *  (`ocupacion: null` — LIBRE has no capacity to be "of"). LIBRE is always last. */
export interface OpcionEntrada {
  id: string;
  /** "HH:MM", or "" for ACCESO LIBRE. */
  hora: string;
  tipo: string;
  /** "N/M" — how many are already marked in that class against its capacity — or null
   *  for ACCESO LIBRE. */
  ocupacion: string | null;
}

/** Today's classes plus LIBRE, in date order with LIBRE last; any other date (past pick,
 *  no-schedule day, failed read) is LIBRE alone. `visitas` is the CHOSEN date's own visit
 *  list — its counts only ever matter on the `iso === hoyIso` branch, since that is the
 *  only branch with classes to count against. */
export function opcionesEntrada(
  iso: string,
  hoyIso: string,
  sesiones: { id: string; hora: string; tipo: string; capacidad: number }[],
  visitas: Visita[],
): OpcionEntrada[] {
  const clases = iso === hoyIso ? sesiones : [];
  return [
    ...clases.map((s) => ({
      id: s.id,
      hora: s.hora,
      tipo: s.tipo,
      ocupacion: `${personasEn(visitas.filter((v) => ctxDe(v) === s.id))}/${s.capacidad}`,
    })),
    { id: LIBRE, hora: "", tipo: "ACCESO LIBRE", ocupacion: null },
  ];
}

/**
 * Whether a `?sesion=` id (the home hero's PASAR LISTA, or a peek row — #328) should skip
 * the entry step entirely and land the desk on that class's roster. Only trusts an id
 * that names one of TODAY's classes: an absent param, an unknown id, or a class from a
 * schedule that failed to load all fall back to the step instead of opening on a context
 * that does not exist.
 */
export function ctxDesdeSesionParam(
  sesionParam: string | undefined,
  sesiones: { id: string }[],
): string | null {
  if (!sesionParam) return null;
  return sesiones.some((s) => s.id === sesionParam) ? sesionParam : null;
}

/** The entry step's date bounds: today or earlier, matching the roster's own past-only
 *  rule (the day strip never renders a future day, the calendar disables one) — never a
 *  future day, which the desk has no attendance model for at all. */
export function fechaSeleccionable(iso: string, hoyIso: string): boolean {
  return iso <= hoyIso;
}
