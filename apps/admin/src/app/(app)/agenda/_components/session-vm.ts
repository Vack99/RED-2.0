import { antesDeVentanaArribo } from "@gym/domain/rules";
import type { SesionAgendaDTO } from "@gym/data/server/agenda";
import type { EditorDraft } from "@gym/ui/forge/agenda/editor-sheet";
import type { VentaSugerida } from "@gym/ui/forge/agenda/session-roster";
import type { EstadoSesion as EstadoUi } from "@gym/ui/forge/agenda/session-view";

/**
 * DTO -> Agenda card/row view model. The DAL derives a 5-value domain estado; the
 * #41 primitives (SessionCard, WeekGroup, QuickGlanceSheet, EditorSheet) take a
 * 4-value UI estado plus an orthogonal `isNext` accent — this pure seam bridges
 * them, joins the coaches, and selects the ★-especial flag. Fully serializable so
 * the server page can hand it straight to the client orchestrator.
 *
 * It also owns the editor's draft seeds and the two #243 series receipts: the
 * orchestrator around it is a React component with no test surface, so every
 * decision that can be a pure function lives here instead.
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
  /** The generating `schedule_template.id`, or `null` for a one-off (#243) — what lets the
   *  editor sheet offer the series scope toggle only for a generated class. */
  templateId: string | null;
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
    templateId: dto.templateId,
  };
}

const EMPTY_REPEAT: boolean[] = [false, false, false, false, false, false];

/** Editor defaults for a new class (PRD #36 e): 18:00 / 45 min / cupo 24, first tipo. */
export function createDraft(tipoInicial: string): EditorDraft {
  return {
    tipo: tipoInicial,
    hora: "18:00",
    duracionMin: 45,
    cupo: 24,
    coachIds: [],
    repeatDays: [...EMPTY_REPEAT],
    alcance: "clase",
    isSpecial: false,
    specialName: "",
  };
}

/**
 * Seed the editor from an existing session. `repeatDays` stays empty — the weekday
 * row is the create flow's alone — and `alcance` re-seeds to "clase" on EVERY open
 * (#243): "esta y las siguientes" is a per-open decision, never sticky, so a series
 * edit can't leave its blast radius armed for the next card the operator taps.
 */
export function editDraftFrom(card: CardVM): EditorDraft {
  return {
    tipo: card.tipo,
    hora: card.time,
    duracionMin: card.mins,
    cupo: card.cap,
    coachIds: card.coachIds,
    repeatDays: [...EMPTY_REPEAT],
    alcance: "clase",
    isSpecial: card.esEspecial,
    specialName: card.specialName ?? "",
  };
}

/**
 * Did the operator actually touch the coach multi-select? A series write sends
 * `coachIds` only when they did, because `editDraftFrom` seeds them from the ONE
 * clicked session — an unconditional replace would stamp last week's substitute onto
 * the whole schedule. `update_recurring_schedule` leaves the coach set alone when the
 * argument is omitted, and this is what decides to omit it. Order-insensitive: the
 * multi-select appends taps, so a re-tapped-back set is still unchanged.
 */
export function coachIdsCambiaron(seed: string[], actual: string[]): boolean {
  return seed.length !== actual.length || seed.some((id) => !actual.includes(id));
}

/**
 * The "esta y las siguientes" receipt (#243). The count is what the RPC actually
 * moved, and it can legitimately be lower than the horizon: a class whose new time
 * would land in the past is detached from the rule instead of moved.
 */
export function movidasLinea(clasesMovidas: number): string {
  return `${clasesMovidas} ${clasesMovidas === 1 ? "clase futura movida" : "clases futuras movidas"}`;
}

/** The "terminar el horario" receipt: every future class cancelled, every held class back. */
export function canceladasLinea(clasesCanceladas: number): string {
  return `${clasesCanceladas} ${clasesCanceladas === 1 ? "clase cancelada" : "clases canceladas"} · clases devueltas`;
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

/**
 * The only two refusals a SALE fixes (#235 story 10). Exact match, because these strings are OURS:
 * both are `raise exception` literals in our own RPCs — reservar_clase's expiry and zero-balance
 * gates (20260803140000_reserva_manual_staff_target.sql:145,151), and 'Paquete vencido' again on
 * pasar_lista_sesion's walk-in arm (20260729120000:270) — and the DAL hands the raise through
 * verbatim (agenda.ts `ejecutar`). Change a raise, change this list; they mirror each other.
 *
 * Every other refusal is a fact a sale does not touch: 'Clase llena' is the room, 'Ya reservaste
 * esta clase' is the booking, 'La clase ya comenzó' is the clock, 'No autorizado' is the operator.
 * Offering VENDER on any of those would send the operator to charge a member for nothing.
 */
const BLOQUEOS_VENDIBLES = ["Sin clases disponibles", "Paquete vencido"];

export function esBloqueoVendible(error: string): boolean {
  return BLOQUEOS_VENDIBLES.includes(error);
}

/**
 * The blocked pick's bridge to the sale (#235 story 10) — the whole decision in one pure place, and
 * `null` is "render nothing". Two conditions, both required: the refusal must be one a sale fixes,
 * and the picker must still be able to NAME the member (an unknown id would offer an anonymous
 * VENDER). The href is the existing #77 deep link, which lands on Vender with that member already
 * selected — the re-search this story exists to delete.
 */
export function sugerenciaVenta(
  error: string,
  cliente: { id: string; nombre: string } | undefined,
): VentaSugerida | null {
  if (!cliente || !esBloqueoVendible(error)) return null;
  return { nombre: cliente.nombre, href: `/vender?cliente=${cliente.id}` };
}
