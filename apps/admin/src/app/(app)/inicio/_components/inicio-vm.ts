import type { SesionAgendaDTO } from "@gym/data/server/agenda";
import { enCurso, sesionMasCercana } from "@gym/domain/rules";
import { fmtNavegadorDia, horaEnZona, MONTHS_FULL, WEEKDAYS_FULL } from "@gym/format";
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
 * No candidate at all today — the day is over, or it has no classes — is `null`, but
 * that is no longer automatically the standalone PASE DE LISTA arm (owner ruling
 * 2026-09-01): the caller (`page.tsx`) then tries `derivarDiaSiguiente` against the
 * next day(s) with a class, bounded by `../reads.ts`'s `leerProximoDia`. The
 * standalone arm survives only once THAT also comes up empty, or the agenda read
 * failed outright, or the gym runs Lista (whose caller passes an empty `sesiones` —
 * the read is never even issued, see `../reads.ts`).
 *
 * Pure and clock-parameterized (`ahora` is an argument — the caller reads the clock)
 * so the whole derivation is testable; the page hands the result straight to the
 * server component.
 */

/** The hero's tense — which eyebrow word and which count the card leads with. */
export type TenseDia = "en_curso" | "terminada" | "proxima";

/** The hero class: the one the Pasar lista CTA is attached to (TODAY's hero only —
 *  see `esHoy`). */
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
  /** Whether this hero's class is TODAY's (owner ruling 2026-09-01). `false` only for
   *  a rolled-forward hero (`derivarDiaSiguiente`): PASAR LISTA never attaches to it —
   *  `/asistencia` only ever reads TODAY's own agenda (`?sesion=` is validated against
   *  it, never trusted raw) — so the screen renders a plain "Ver en agenda" link
   *  instead, and the eyebrow leads with `etiquetaDia` instead of the tense word. */
  esHoy: boolean;
  /** The day-relative label for a rolled-forward hero — `fmtNavegadorDia`, uppercased
   *  ("MAÑANA", "EN 3 DÍAS"). `null` when `esHoy` (the tense word leads instead). */
  etiquetaDia: string | null;
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

/** The header's date block (owner ruling 2026-09-02) — the pre-#328 hero greeting's
 *  chrome with the DATE in place of the greeting: an eyebrow, then a two-line display
 *  where line 1 is the weekday in ink and line 2 is the day + month in the brand
 *  accent, closed with a period ("BUENOS DÍAS," / "COACH." → "MIÉRCOLES" /
 *  "2 DE SEPTIEMBRE."). Built from the tz-resolved `hoy` the caller already computed
 *  (`hoyEnZona`, page.tsx) — never a second clock read.
 *
 *  The eyebrow carries the YEAR, not the gym name: the gym's `brand_name` is literally
 *  "RED"/"Forge" (the tenant spine's seeds), the same word the marca lockup two lines
 *  above already draws, so a gym-name eyebrow would just say the logo again — and the
 *  account square already carries the gym's initial. The year is the one piece of the
 *  date the display line deliberately drops, which is exactly what the pre-#328
 *  eyebrow carried too ("MIÉ · 2 SEP 2026").
 *
 *  `@gym/format` has no formatter for either line (`fmtFull` is lowercase and joins
 *  both), so this composes the package's exported `WEEKDAYS_FULL`/`MONTHS_FULL`
 *  directly rather than adding one. */
export interface FechaHeaderVM {
  /** "MIÉRCOLES" — display line 1, in `--fg`. */
  diaSemana: string;
  /** "2 DE SEPTIEMBRE." — display line 2, in the brand accent. */
  diaMes: string;
  /** "2026" — the eyebrow above the display. */
  anio: string;
}

export function derivarFechaHeader(hoy: Date): FechaHeaderVM {
  return {
    diaSemana: WEEKDAYS_FULL[hoy.getDay()].toUpperCase(),
    diaMes: `${hoy.getDate()} DE ${MONTHS_FULL[hoy.getMonth()].toUpperCase()}.`,
    anio: String(hoy.getFullYear()),
  };
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
      esHoy: true,
      etiquetaDia: null,
    },
    clases: sesiones
      .filter(
        (s) => s.startsAt.getTime() > hero.startsAt.getTime() && s.startsAt.getTime() > ahora.getTime(),
      )
      .map((s) => filaDia(s, tz)),
  };
}

/**
 * The rolled-forward day card (owner ruling 2026-09-01): once TODAY has no hero left
 * (`derivarDia` returned `null`), Cupo's hero must never sit empty while the gym has
 * ANY upcoming class — `page.tsx` hands this the first later day `../reads.ts`'s
 * `leerProximoDia` found with at least one session. Every session on THAT day is
 * necessarily still ahead (it is a future day), so there is no live/±90-nearest
 * ladder to run: the hero is simply that day's FIRST session, always in the
 * `"proxima"` tense, and the rows below it are the rest of that day's own schedule —
 * `sesiones` arrives in the DAL's startsAt order and both keep it.
 *
 * `esHoy: false` on the hero is the one flag the screen needs to withhold PASAR
 * LISTA: the desk (`/asistencia`) only ever reads TODAY's own agenda, so a link to a
 * future session's check-in would resolve to nothing there.
 */
export function derivarDiaSiguiente(
  sesiones: readonly SesionAgendaDTO[],
  tz: string,
  fecha: Date,
  hoy: Date,
): DiaVM | null {
  const [hero, ...resto] = sesiones;
  if (!hero) return null;

  return {
    hero: {
      id: hero.id,
      hora: horaEnZona(hero.startsAt, tz),
      titulo: etiquetaSesion(hero),
      coaches: hero.coaches.length ? hero.coaches.map((c) => c.nombre).join(", ") : null,
      tense: "proxima",
      cuenta: `${hero.activos}/${hero.capacidad} reservas`,
      esHoy: false,
      etiquetaDia: fmtNavegadorDia(fecha, hoy).toUpperCase(),
    },
    clases: resto.map((s) => filaDia(s, tz)),
  };
}
