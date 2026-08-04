/**
 * Pure state for the attendance screen. ONE shape for every day (#89): a LIST of visit
 * events (`Visita[]`), each carrying the context it happened in. Two classes in one day
 * are two entries; a class visit and an ACCESO LIBRE visit are two entries. Today and a
 * picked past day differ only in which context the screen has SELECTED — a past day locks
 * it to LIBRE (the only context its 2-arg toggle can write), never in how state is keyed.
 *
 * `setVisita` is the single transition used BOTH for the optimistic flip on tap and for
 * the reconcile against the server result. It is immutable (never touches the input) and
 * idempotent (marking a present member, or unmarking an absent one, is a no-op), so the
 * optimistic flip and the later server reconcile of the same outcome converge to the
 * identical state. Note this is NOT what makes a double-tap safe: a second tap in the
 * in-flight window would compute the opposite direction and fire a competing toggle — the
 * `inFlight` guard in asistencia.tsx (not idempotency) is what blocks that. The two are
 * complementary: the guard prevents the competing action, idempotency keeps the single
 * in-flight action's optimistic and reconciled states consistent.
 */

import { enVentanaArribo, VENTANA_ARRIBO_PREVIA_MIN } from "@gym/domain/rules";

/** The screen's context key for the class-less visit kind (ACCESO LIBRE). Never a
 *  session id — session ids are uuids, so the two can't collide. */
export const LIBRE = "libre";

/** One attendance row: a visit event in ONE context. Mirrors @gym/data's `Visita`
 *  (kept structural, not imported: this is a "use client" module and the DAL is
 *  `server-only`). */
export interface Visita {
  clienteId: string;
  /** The class this visit belongs to, or null for ACCESO LIBRE. */
  sessionId: string | null;
  /** "HH:MM" arrival, or null for a row with no time (a back-entered day, or the
   *  instant between an optimistic mark and the server's answer). */
  hora: string | null;
}

/** A visit's context key — its session id, or LIBRE. */
export function ctxDe(v: Visita): string {
  return v.sessionId ?? LIBRE;
}

/** A member's visit in ONE context, if they have one. Slice 1's toggle discipline
 *  (and the DB's partial unique indexes) allow at most one, so this is the visit. */
export function visitaDe(visitas: Visita[], ctx: string, clienteId: string): Visita | undefined {
  return visitas.find((v) => v.clienteId === clienteId && ctxDe(v) === ctx);
}

/**
 * Return a new list with `clienteId` present (or absent) in `ctx`, leaving the input
 * untouched. Marking someone already marked REPLACES their row's hora — that is how the
 * server's authoritative arrival time lands on the optimistic row (which was appended
 * with `hora: null`) without appending a second one.
 */
export function setVisita(
  visitas: Visita[],
  ctx: string,
  clienteId: string,
  present: boolean,
  hora: string | null,
): Visita[] {
  const previa = visitaDe(visitas, ctx, clienteId);
  const resto = previa ? visitas.filter((v) => v !== previa) : visitas.slice();
  if (!present) return resto;
  return [...resto, { clienteId, sessionId: ctx === LIBRE ? null : ctx, hora }];
}

/** Distinct members with at least one visit — what a day's strip/calendar dot counts
 *  (`marcadas_presencia` counts distinct `cliente_id`, not rows). */
export function personasEn(visitas: Visita[]): number {
  return new Set(visitas.map((v) => v.clienteId)).size;
}

/** How far from now a class may start and still be the screen's opening context. This is
 *  the arrival window's own lower bound, IMPORTED rather than re-coined: the class the
 *  screen opens on and the class a LIBRE tap gets attributed to are then the same 90
 *  minutes by construction, not by two numbers agreeing. Aliased so the kiosk rule below
 *  still reads in its own vocabulary. */
const VENTANA_CERCANA_MIN = VENTANA_ARRIBO_PREVIA_MIN;

/**
 * The class whose start is nearest `ahora`, within `VENTANA_CERCANA_MIN` — Zen Planner's
 * kiosk rule ("your current class of the day will automatically be highlighted and
 * selected"). Falls back to `LIBRE`, the honest default for a gym with no maintained
 * schedule (and the ONLY context when there are no classes at all).
 *
 * Compares ABSOLUTE instants, never wall-clock strings, so the pick is right even when
 * the operator's device sits in a different zone than the gym. Resolved on the server so
 * the opening context is identical in the SSR and hydration renders — which is why it
 * takes the DAL's `startsAt` Date directly, and the screen's own SesionDelDia never
 * carries it.
 */
export function sesionCercana(sesiones: { id: string; startsAt: Date }[], ahora: Date): string {
  let mejor = LIBRE;
  let dist = Infinity;
  for (const s of sesiones) {
    const delta = Math.abs(s.startsAt.getTime() - ahora.getTime());
    if (delta < dist) {
      dist = delta;
      mejor = s.id;
    }
  }
  return dist <= VENTANA_CERCANA_MIN * 60_000 ? mejor : LIBRE;
}

/**
 * clienteId → the session a LIBRE tap on that member would be ATTRIBUTED to today: their
 * nearest booking that is still `reservada`, not a walk-in, and whose arrival window
 * CONTAINS `ahora` (#179 — the chip promises attribution only where the server's own
 * `ventana_arribo(...) @> now()` gate would grant it; outside the window there is no
 * chip). `|startsAt − ahora|` is the tie-break among the survivors, matching the RPC's
 * own ordering. Members with only marked, walk-in, or out-of-window bookings get no
 * entry — a tap on them refuses or charges, and a chip there would promise attribution
 * the server will not give.
 *
 * The window is a DIFFERENT job from the `sesionCercana` pill's ±90 note above: the pill
 * PRESELECTS a context to open the screen on, this ATTRIBUTES a specific tap to a specific
 * booking. They share a constant (their open edge), not a purpose.
 *
 * Resolved SERVER-side (page.tsx, beside `sesionCercana`) for the same reason: the metric
 * is measured against an absolute instant, which must not differ between the SSR and
 * hydration renders. The reservation shape is kept structural, not imported — the DAL is
 * `server-only` and this is a "use client" module (same as `Visita` above).
 */
export function reservaAtribuible(
  sesiones: { id: string; startsAt: Date; duracionMin: number }[],
  reservas: Record<string, { clienteId: string; status: string; isWalkIn: boolean }[]>,
  ahora: Date,
): Record<string, string> {
  const mejor: Record<string, { sessionId: string; dist: number }> = {};
  for (const s of sesiones) {
    if (!enVentanaArribo(s.startsAt, s.duracionMin, ahora)) continue;
    const dist = Math.abs(s.startsAt.getTime() - ahora.getTime());
    for (const r of reservas[s.id] ?? []) {
      if (r.status !== "reservada" || r.isWalkIn) continue;
      const actual = mejor[r.clienteId];
      if (!actual || dist < actual.dist) mejor[r.clienteId] = { sessionId: s.id, dist };
    }
  }
  return Object.fromEntries(Object.entries(mejor).map(([id, m]) => [id, m.sessionId]));
}
