/**
 * Fixtures for the agenda primitives — the states each primitive must render,
 * drawn from the interactive mock (`Agenda Week View.html`). No schema dependency:
 * these are plain view-model props S7 (and the fresh-eyes visual gate) mount the
 * primitives against until the DAL feeds real `class_session` rows. es-MX copy
 * verbatim from the approved mock; colours are the primitives' tokens, not here.
 */

import type { CoachOption, EditorDraft } from "./editor-sheet";
import type { SessionCardProps } from "./session-card";
import type { EstadoSesion } from "./session-view";
import type { WeekRow } from "./week-group";

/** One session card per rendered state — the five the acceptance criteria name. */
export const SESSION_CARD_FIXTURES: Record<string, SessionCardProps> = {
  proximo: { time: "08:15", mins: 45, tipo: "Funcional", coaches: "Isa Hdz", booked: 19, cap: 24, estado: "normal", isNext: true },
  casiLleno: { time: "12:30", mins: 45, tipo: "Metcon", coaches: "Marisa", booked: 18, cap: 20, estado: "casi_lleno" },
  lleno: { time: "18:15", mins: 45, tipo: "Funcional", coaches: "Fer", booked: 24, cap: 24, estado: "lleno" },
  termino: { time: "06:15", mins: 45, tipo: "Fuerza", coaches: "Ángel", booked: 24, cap: 24, estado: "termino" },
  especialMultiCoach: { time: "18:15", mins: 60, tipo: "Fuerza", coaches: "Marisa, Paty", booked: 16, cap: 24, estado: "normal", isSpecial: true, specialName: "Noche de Fuerza" },
};

/** A week day's tappable rows, plus an explicitly empty day ("Sin clases"). */
export const WEEK_ROWS_FIXTURE: WeekRow[] = [
  { time: "06:15", tipo: "Fuerza", booked: 18, cap: 24, estado: "normal" },
  { time: "12:30", tipo: "Metcon", booked: 17, cap: 20, estado: "casi_lleno" },
  { time: "18:15", tipo: "Fuerza", booked: 16, cap: 24, estado: "normal", isSpecial: true },
];
export const WEEK_ROWS_EMPTY: WeekRow[] = [];

/** The strip's Lun–Sáb days (mock week 0). */
export const DATE_STRIP_DAYS = [
  { wd: "Lun", dnum: "15" },
  { wd: "Mar", dnum: "16" },
  { wd: "Mié", dnum: "17" },
  { wd: "Jue", dnum: "18" },
  { wd: "Vie", dnum: "19" },
  { wd: "Sáb", dnum: "20" },
];

/** Editor field-picker option sets (business bounds — data-model §4 / PRD (e)). */
export const HORA_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 5 * 60; m <= 22 * 60 + 45; m += 15) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();
export const DURACION_OPTIONS = [30, 45, 60, 75, 90];
export const CUPO_OPTIONS: number[] = Array.from({ length: 37 }, (_, i) => i + 4); // 4..40

export const COACH_CATALOG: CoachOption[] = [
  { id: "coach-marisa", label: "Marisa" },
  { id: "coach-paty", label: "Paty" },
  { id: "coach-angel", label: "Ángel" },
  { id: "coach-fer", label: "Fer" },
  { id: "coach-analau", label: "Analau" },
];

export const TIPO_OPTIONS = ["Fuerza", "Funcional", "Metcon", "Open"];

export const EDITOR_DRAFT_FIXTURE: EditorDraft = {
  tipo: "Fuerza",
  hora: "18:00",
  duracionMin: 45,
  cupo: 24,
  coachIds: [],
  repeatDays: [false, false, false, false, false, false],
  isSpecial: false,
  specialName: "",
};

/** The full set of session states a primitive must handle. */
export const ALL_ESTADOS: EstadoSesion[] = ["normal", "casi_lleno", "lleno", "termino"];
