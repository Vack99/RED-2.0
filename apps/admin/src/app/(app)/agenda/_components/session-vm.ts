import { antesDeVentanaArribo } from "@gym/domain/rules";
import type { SesionAgendaDTO } from "@gym/data/server/agenda";
import type { EstadoSesion as EstadoUi } from "@gym/ui/forge/agenda/session-view";

/**
 * DTO -> Agenda card/row view model. The DAL derives a 5-value domain estado; the
 * #41 primitives (SessionCard, WeekGroup, QuickGlanceSheet, EditorSheet) take a
 * 4-value UI estado plus an orthogonal `isNext` accent — this pure seam bridges
 * them, joins the coaches, and selects the ★-especial flag. Fully serializable so
 * the server page can hand it straight to the client orchestrator.
 */

export interface CardVM {
  id: string;
  /** Gym-local "HH:MM" wall clock (from horaEnZona) — the card time + editor hora seed. */
  time: string;
  /** The session's ABSOLUTE start, ISO — what the roster's tense predicate reads at tap time
   *  (#238). An instant, not a wall clock: `time` is already tz-folded and cannot be compared
   *  to a clock. ISO rather than a Date so the VM stays a plain serializable payload. */
  startsAtIso: string;
  mins: number;
  tipo: string;
  /** Comma-joined coach names, or "Por asignar" when none. */
  coaches: string;
  /** The session's coach ids — the editor's multi-select seed. */
  coachIds: string[];
  booked: number;
  cap: number;
  estado: EstadoUi;
  isNext: boolean;
  /** Whether the card/row shows the ★ accent (derived: hidden while a_continuacion). */
  isSpecial: boolean;
  /** The stored is_special fact — the sheet/editor identity (shows even for the next class). */
  esEspecial: boolean;
  specialName: string | null;
}

export function toCardVM(dto: SesionAgendaDTO, hora: string): CardVM {
  // a_continuacion is the domain's "next upcoming" state; the UI models that as an
  // orthogonal isNext accent over a plain "normal" estado (the else branch narrows
  // dto.estado to the four UI-shared values).
  const estado: EstadoUi = dto.estado === "a_continuacion" ? "normal" : dto.estado;
  const isNext = dto.estado === "a_continuacion";
  return {
    id: dto.id,
    time: hora,
    startsAtIso: dto.startsAt.toISOString(),
    mins: dto.duracionMin,
    tipo: dto.tipo,
    coaches: dto.coaches.length ? dto.coaches.map((c) => c.nombre).join(", ") : "Por asignar",
    coachIds: dto.coaches.map((c) => c.id),
    booked: dto.activos,
    cap: dto.capacidad,
    estado,
    isNext,
    isSpecial: dto.muestraEspecial,
    esEspecial: dto.esEspecial,
    specialName: dto.nombreEspecial,
  };
}

/**
 * Which write path the operator's pick takes (#238) — the whole feature in one line, and the
 * one place a correct rule wired to the wrong callback would slip through. `ahora` is a
 * PARAMETER because the caller must read the clock inside the tap handler: the label may be
 * stale from an earlier render, the branch never is (the #235 amendment). Past the arrival
 * window's opening edge — including long past its close — this is always "pase".
 */
export function accionAgregar(startsAtIso: string, ahora: Date): "reservar" | "pase" {
  return antesDeVentanaArribo(new Date(startsAtIso), ahora) ? "reservar" : "pase";
}
