import type { SesionAgendaDTO } from "@gym/data/server/agenda";
import { enCurso, sesionMasCercana } from "@gym/domain/rules";
import { horaEnZona } from "@gym/format";
import { etiquetaSesion } from "@gym/ui/forge/agenda/session-card";

/**
 * /inicio's Cupo day-card view model (#328, spec #326). The card is the DESK's view
 * of the day, not an archive of it: ONE hero class — the class closest to NOW — owns
 * the "Pasar lista" CTA, and the only rows under it are the classes still AHEAD of
 * it. Past classes NEVER render here; history lives on the Agenda.
 *
 * The hero pick is the desk's own ±90-minute preselect semantics, in order:
 *   1. the LIVE class (`@gym/domain`'s `enCurso`, `[start, start + duración)`) — live
 *      wins over mere nearness (a long class deep in its window can be farther by
 *      start-distance than a short one that just ended);
 *   2. else the class whose start is nearest now within ±90 min (`sesionMasCercana`,
 *      the SAME extracted rule the desk's own opening context runs — never a rival
 *      re-derivation) — which may be one that JUST ENDED, because operators are still
 *      marking stragglers;
 *   3. else the day's NEXT upcoming class (the 18:00 class on a quiet noon).
 * No candidate at all — the day is over, has no classes, the agenda read failed, or
 * the gym runs Lista (whose caller passes an empty `sesiones` — the read is never
 * even issued, see `../reads.ts`) — is `null`: the standalone PASE DE LISTA arm.
 *
 * Pure and clock-parameterized (`ahora` is an argument — the caller reads the clock)
 * so the whole derivation is testable; the page hands the result straight to the
 * server component.
 */

/** The hero's tense — which eyebrow word and which count the card leads with. */
export type TenseDia = "en_curso" | "terminada" | "proxima";

/** The hero class: the one the Pasar lista CTA is attached to. */
export interface HeroDia {
  id: string;
  /** Gym-local "HH:MM". */
  hora: string;
  titulo: string;
  /** Comma-joined coach names, or null when unassigned. */
  coaches: string | null;
  tense: TenseDia;
  /** The tense-matched count, preformatted: live "2/12 dentro" (CHECK-INS), just-ended
   *  "4/12 asistieron ✓" (check-ins), upcoming "9/12 reservas" (bookings). */
  cuenta: string;
}

/** One class still AHEAD of the hero, as a hairline row. */
export interface ClaseDelDia {
  id: string;
  /** Gym-local "HH:MM". */
  hora: string;
  nombre: string;
  /** reservas/cupo — every row is upcoming, so its seats are always the operative
   *  number (no ✓/asistieron arm can exist below the hero anymore). */
  cuenta: string;
}

/** The day card's payload. `null` = nothing to lead with (see `derivarDia`). */
export interface DiaVM {
  hero: HeroDia;
  /** The classes strictly AFTER the hero, in the DAL's startsAt order. */
  clases: ClaseDelDia[];
}

/** One upcoming row: hora, agenda-parity name, reservas/cupo. */
export function filaDia(s: SesionAgendaDTO, tz: string): ClaseDelDia {
  return {
    id: s.id,
    hora: horaEnZona(s.startsAt, tz),
    nombre: etiquetaSesion(s),
    cuenta: `${s.activos}/${s.capacidad}`,
  };
}

/** Check-ins per class from the day's visit rows. "Dentro"/"asistieron" mean CHECKED
 *  IN, never booked (`activos` counts reservations, and a class of 12 bookings with 2
 *  people present must not read "12 dentro"). An ACCESO LIBRE visit (sessionId null)
 *  belongs to no class and counts toward none. */
function conteoPorSesion(visitas: readonly { sessionId: string | null }[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const v of visitas) {
    if (v.sessionId !== null) conteo.set(v.sessionId, (conteo.get(v.sessionId) ?? 0) + 1);
  }
  return conteo;
}

/**
 * The whole day card in one pass: pick the hero (live → nearest-within-±90 → next
 * upcoming — the doc-comment ladder above), read its tense off the domain's live window
 * (`[start, start + duración)`, half-open: a just-ended pick reads `terminada`, a
 * not-yet-started one `proxima`), and shape ONLY the classes strictly after it into
 * rows. A row must be ahead of BOTH the hero's start and NOW — a short class that
 * started after the hero but has already finished (e.g. the hero is a long live class)
 * is history, not a row. `sesiones` arrives in the DAL's startsAt order and the rows
 * keep it.
 */
export function derivarDia(
  sesiones: readonly SesionAgendaDTO[],
  visitas: readonly { sessionId: string | null }[],
  tz: string,
  ahora: Date,
): DiaVM | null {
  const viva = enCurso(sesiones, ahora);
  const hero =
    viva ??
    sesionMasCercana(sesiones, ahora) ??
    sesiones.find((s) => s.startsAt.getTime() > ahora.getTime()) ??
    null;
  if (hero === null) return null;

  const tense: TenseDia = viva
    ? "en_curso"
    : hero.startsAt.getTime() + hero.duracionMin * 60_000 <= ahora.getTime()
      ? "terminada"
      : "proxima";
  const dentro = conteoPorSesion(visitas).get(hero.id) ?? 0;
  const cuenta =
    tense === "en_curso"
      ? `${dentro}/${hero.capacidad} dentro`
      : tense === "terminada"
        ? `${dentro}/${hero.capacidad} asistieron ✓`
        : `${hero.activos}/${hero.capacidad} reservas`;

  return {
    hero: {
      id: hero.id,
      hora: horaEnZona(hero.startsAt, tz),
      titulo: etiquetaSesion(hero),
      coaches: hero.coaches.length ? hero.coaches.map((c) => c.nombre).join(", ") : null,
      tense,
      cuenta,
    },
    clases: sesiones
      .filter(
        (s) => s.startsAt.getTime() > hero.startsAt.getTime() && s.startsAt.getTime() > ahora.getTime(),
      )
      .map((s) => filaDia(s, tz)),
  };
}
