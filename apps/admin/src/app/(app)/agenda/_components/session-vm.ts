import { antesDeVentanaArribo } from "@gym/domain/rules";
import { parseDay } from "@gym/format";
import type { PlantillaDTO, SesionAgendaDTO } from "@gym/data/server/agenda";
import type { EditorAlcance, EditorDraft } from "@gym/ui/forge/agenda/editor-sheet";
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
  /** That rule's current values — what the WIDE scope edits, and therefore what it seeds from. */
  plantilla: PlantillaDTO | null;
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
    plantilla: dto.plantilla,
  };
}

const EMPTY_REPEAT: boolean[] = [false, false, false, false, false, false];

/** A card's own weekday, Lun=0..Dom=6 (this app's indexing — WEEKDAY_TOGGLES,
 *  `plantilla.groupDias`) — the #243 "todos los <día>" toggle label. Reads `iso`
 *  ("YYYY-MM-DD", the DiaVM the card is rendered under) with `parseDay`'s LOCAL Y/M/D,
 *  never `card.startsAtIso`: that is an absolute instant, and an evening class can sit
 *  on the far side of UTC midnight from the gym's own calendar day. */
export function diaSemanaDe(iso: string): number {
  return (parseDay(iso).getDay() + 6) % 7;
}

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

/** The four editable fields, as the SCOPE the operator picked defines them (#243).
 *
 *  "Esta y las siguientes" does not edit the clicked class — it rewrites THE RULE, and then
 *  regenerates every future class from it. So the wide arm must show the rule's own values.
 *  A class can be attached and still off-grid: `update_recurring_schedule` leaves the one whose
 *  recomputed instant would land in the past at the time it already had, and a race can strand
 *  another. Seeding a wide save from such a row would push its stale hora/cupo/tipo/coaches onto
 *  the template and revert the entire series — the operator who touched only the cupo would move
 *  25 classes back to last month's hour. On an on-grid row the two seeds are identical, which is
 *  why the normal case shows no visible change when the toggle flips.
 *
 *  "dia" and "horario" (#243) seed the same way — both rewrite THE RULE; only the write's blast
 *  radius (one weekday vs the whole group) differs, and that lives in the save call, not here. */
export function semillaAlcance(
  card: CardVM,
  alcance: EditorAlcance,
): Pick<EditorDraft, "tipo" | "hora" | "duracionMin" | "cupo" | "coachIds"> {
  const regla = alcance !== "clase" ? card.plantilla : null;
  return regla
    ? { tipo: regla.tipo, hora: regla.hora, duracionMin: regla.duracionMin, cupo: regla.capacidad, coachIds: regla.coachIds }
    : { tipo: card.tipo, hora: card.time, duracionMin: card.mins, cupo: card.cap, coachIds: card.coachIds };
}

/** The scalar keys a scope's rule seeds (semillaAlcance's shape minus `coachIds`, which has its
 *  own dirty test — a set, not a value, can't use `!==`). Walked as a tuple so `aplicarAlcance`
 *  never repeats it. */
const SEED_ESCALARES = ["tipo", "hora", "duracionMin", "cupo"] as const;

/**
 * The scope-toggle transform (#243 fix, defects D1/D2). A flip still baselines the new scope's
 * seed (semillaAlcance) — a wide edit has to start from the RULE, not an off-grid card — but ONLY
 * for the fields the operator has not actually changed. "Changed" is judged BY VALUE against the
 * scope being LEFT (`draft.alcance`), never by a sticky touched-flag (D2): a field dialed away and
 * corrected back by hand must re-seed on the next flip like any other untouched field, not stay
 * frozen at the card's value forever because it was dirtied once.
 *
 * `coachIds` can't reuse that value test — it's a set, not a scalar — so a dirty multi-select
 * rebases the operator's DELTA (added minus removed, against the OUTGOING seed) onto the INCOMING
 * seed, rather than carrying the raw array forward (D1): carrying the raw array would let an
 * off-grid session's own substitute coach silently replace the whole rule's coach set the moment
 * the operator's edit happened to also touch coachIds.
 */
export function aplicarAlcance(card: CardVM, draft: EditorDraft, alcance: EditorAlcance): EditorDraft {
  const seedAnterior = semillaAlcance(card, draft.alcance);
  const seedNuevo = semillaAlcance(card, alcance);
  const reseedado = Object.fromEntries(
    SEED_ESCALARES.filter((k) => draft[k] === seedAnterior[k]).map((k) => [k, seedNuevo[k]]),
  ) as Partial<EditorDraft>;
  const coachIds = coachIdsCambiaron(seedAnterior.coachIds, draft.coachIds)
    ? rebaseCoachIds(seedAnterior.coachIds, draft.coachIds, seedNuevo.coachIds)
    : seedNuevo.coachIds;
  return { ...draft, ...reseedado, coachIds, alcance };
}

/** D1's delta rebase: what the operator ADDED (present in the draft, absent from the seed they
 *  edited under) and REMOVED (the reverse) replay onto the NEW seed, instead of carrying the raw
 *  multi-select forward. Dedup: an addition the new seed already has does not duplicate. */
function rebaseCoachIds(seedAnterior: string[], draftCoachIds: string[], seedNuevo: string[]): string[] {
  const agregados = draftCoachIds.filter((id) => !seedAnterior.includes(id));
  const quitados = seedAnterior.filter((id) => !draftCoachIds.includes(id));
  const base = seedNuevo.filter((id) => !quitados.includes(id));
  return [...base, ...agregados.filter((id) => !base.includes(id))];
}

/**
 * Seed the editor from an existing session. `repeatDays` stays empty — the weekday
 * row is the create flow's alone — and `alcance` re-seeds to "clase" on EVERY open
 * (#243): the wide scope is a per-open decision, never sticky, so a "dia"/"horario"
 * edit can't leave its blast radius armed for the next card the operator taps.
 */
export function editDraftFrom(card: CardVM): EditorDraft {
  return {
    ...semillaAlcance(card, "clase"),
    repeatDays: [...EMPTY_REPEAT],
    alcance: "clase",
    isSpecial: card.esEspecial,
    specialName: card.specialName ?? "",
  };
}

/**
 * Did the operator change ANYTHING? (#243) A narrow save runs `edit_class_session`, which clears
 * `template_id` — so opening an attached class and tapping GUARDAR out of reflex buys an
 * irreversible detach in exchange for no edit at all. Compared against the scope's OWN seed,
 * because a scope flip re-seeds the form (aplicarAlcance): under "dia"/"horario" the baseline is
 * the rule, under "clase" it is the session.
 *
 * `isSpecial`/`specialName` are ignored under a WIDE scope (D7): they are a property of ONE dated
 * class, the wide RPCs never write them, and the sheet hides the toggle entirely once the scope
 * isn't "clase" (editor-sheet.tsx). Counting them under "dia"/"horario" would report a real change
 * for a special-flag edit the operator made and then abandoned by flipping scope — and the wide
 * save would silently drop exactly that edit while still moving the whole rule.
 */
export function draftSinCambios(card: CardVM, draft: EditorDraft): boolean {
  const seed = semillaAlcance(card, draft.alcance);
  const especialSinCambios =
    draft.alcance !== "clase" ||
    (draft.isSpecial === card.esEspecial && draft.specialName === (card.specialName ?? ""));
  return (
    draft.tipo === seed.tipo &&
    draft.hora === seed.hora &&
    draft.duracionMin === seed.duracionMin &&
    draft.cupo === seed.cupo &&
    !coachIdsCambiaron(seed.coachIds, draft.coachIds) &&
    especialSinCambios
  );
}

/**
 * Did the operator actually touch the coach multi-select? A "dia"/"horario" write sends
 * `coachIds` only when they did — `update_recurring_schedule` leaves the coach set alone when
 * the argument is omitted, and this is what decides to omit it. The `seed` it is measured against is the SCOPE's
 * seed (semillaAlcance), i.e. the template's own coaches for a wide edit: measured against the
 * clicked session's instead, an off-grid class would report a change that isn't one and stamp its
 * substitute coach over the schedule's. Order-insensitive: the multi-select appends taps, so a
 * re-tapped-back set is still unchanged.
 */
export function coachIdsCambiaron(seed: string[], actual: string[]): boolean {
  return seed.length !== actual.length || seed.some((id) => !actual.includes(id));
}

/**
 * The "dia"/"horario" receipt (#243 §4). The count is what the RPC actually moved — and when it
 * moved FEWER classes than the scope holds, the receipt has to say which ones it skipped rather
 * than leave the operator to notice. `clasesSinMover` is the past-instant guard's leftover:
 * structurally 0 or 1 for "dia" (only the current week's class can recompute backwards), but
 * "horario" can skip one per weekday in the group, hence the plural arm. Each skipped class keeps
 * EVERYTHING it had — hora, cupo, tipo, coaches — so the receipt says "se queda(n) como está(n)"
 * and not just something about its hour.
 */
export function movidasLinea(clasesMovidas: number, clasesSinMover: number): string {
  const movidas = `${clasesMovidas} ${clasesMovidas === 1 ? "clase futura movida" : "clases futuras movidas"}`;
  if (clasesSinMover === 0) return movidas;
  if (clasesSinMover === 1) return `${movidas} · la de esta semana se queda como está`;
  return `${movidas} · ${clasesSinMover} clases de esta semana se quedan como están`;
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
