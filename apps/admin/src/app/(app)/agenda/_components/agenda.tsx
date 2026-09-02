"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { liberarSenal, ocuparSenal } from "@gym/data/client-senal";
import type { AgendaResultado } from "@gym/data/server/agenda";
import { DateStrip } from "@gym/ui/forge/agenda/date-strip";
import { EditorSheet, type CoachOption, type EditorDraft } from "@gym/ui/forge/agenda/editor-sheet";
import { QuickGlanceSheet } from "@gym/ui/forge/agenda/quick-glance-sheet";
import type { CandidateRow, RosterRow, VentaSugerida } from "@gym/ui/forge/agenda/session-roster";
import { SessionCard } from "@gym/ui/forge/agenda/session-card";
import { WeekGroup, type WeekRow } from "@gym/ui/forge/agenda/week-group";
import { Icon } from "@gym/ui/forge/icon";
import { forgeToast } from "@gym/ui/forge/toaster";

import {
  actualizarHorarioRecurrenteAction,
  cancelarReservaClienteAction,
  cancelarSesionAction,
  crearClassTypeAction,
  crearHorarioRecurrenteAction,
  crearSesionAction,
  editarSesionAction,
  pasarListaSesionAction,
  reservarClaseClienteAction,
  retirarHorarioRecurrenteAction,
  rosterSesionAction,
} from "../actions";
import { cardVigente } from "./card-vigente";
import { marcarPresente } from "./marcar-presente";
import { pasoAgenda } from "./paso-agenda";
import {
  accionAgregar,
  canceladasLinea,
  coachIdsCambiaron,
  createDraft,
  aplicarAlcance,
  diaSemanaDe,
  draftSinCambios,
  editDraftFrom,
  esSerie,
  movidasLinea,
  semillaAlcance,
  sugerenciaVenta,
  type CardVM,
} from "./session-vm";

/**
 * The Agenda orchestrator (PRD #36 S7): DÍA and SEMANA over one week of data, the
 * view-aware date navigator, and the create/edit + quick-glance sheets — wiring the
 * #41 primitives to the DAL actions. In-week day selection is instant client state;
 * week paging (DÍA wrap / SEMANA ±1 week) is a `?d` navigation that re-reads the
 * server component. Brand-neutral: colours live in the primitives as `var(--*)`.
 */

export interface StripDay {
  wd: string;
  dnum: string;
  iso: string;
}

export interface DiaVM {
  iso: string;
  /** "MIÉ 17 JUN" — the navigator context label + the DÍA content day-header. */
  dateLabel: string;
  /** "Hoy" / "Mañana" / "En 3 días" — the navigator relative label. */
  navRel: string;
  /** "6 clases · 109 reservas" — the DÍA day-header summary. */
  summary: string;
  /** Day occupancy percent, or null for an empty day — the SEMANA group header. */
  occupancyPct: number | null;
  cards: CardVM[];
}

export interface ClassTypeOpt {
  id: string;
  name: string;
}

export interface AgendaScreenProps {
  weekMondayIso: string;
  stripDays: StripDay[];
  todayIndex: number;
  initialSelectedIndex: number;
  dias: DiaVM[];
  weekNavLabel: string;
  weekNavRel: string;
  weekFooter: string;
  /** The viewed week is past the materialization horizon (#243): nothing is generated out
   *  there yet, so an empty day means "not yet", not "free" — and must not read as an
   *  invitation to hand-create a class the horizon will generate again later. */
  fueraDeHorizonte: boolean;
  /** `?sesion=<id>` (the /inicio hero/peek deep link, #328), already resolved to a session
   *  in THIS week and selected by page.tsx (resolverDiaSesion) — `null` when absent or when
   *  the id was stale/foreign to the loaded week. Opens that card's own quick-glance sheet
   *  once, on mount; never re-derived client-side. */
  sesionInicial: string | null;
  coaches: CoachOption[];
  tipos: ClassTypeOpt[];
  horaOptions: string[];
  duracionOptions: number[];
  cupoOptions: number[];
}

type View = "dia" | "semana";

const VACIO_STYLE: React.CSSProperties = {
  border: "1px solid var(--line)",
  padding: "34px 20px",
  textAlign: "center",
  fontSize: 12.5,
  letterSpacing: 0.3,
  color: "var(--muted)",
};

/** Past the materialization horizon nothing has been GENERATED yet, so an empty stretch out
 *  there means "not yet", not "free" — the ordinary "toca + para crear una" would invite a
 *  duplicate of the class the horizon will generate on its own (#243). Forward only: the flag
 *  is a strict "beyond +26 weeks", so browsing BACKWARDS — the batch-attendance workflow —
 *  keeps the ordinary empty state and its `+`. */
const SIN_GENERAR = "Todavía sin generar · las clases de esta semana aparecerán más adelante";

interface EditorState {
  open: boolean;
  mode: "create" | "edit";
  /** The card under edit, `null` while creating. Kept whole rather than as an id: save
   *  and cancel read its `templateId` (is there a rule behind this class?), its `booked`
   *  (the cupo-shrink warning) and its opening `coachIds` (#243) back out at write time. */
  card: CardVM | null;
  draft: EditorDraft;
  /** This card's own weekday (Lun=0..Sáb=5), from the day it is rendered under (#243) —
   *  the toggle's "todos los <día>" label and the destructive button's day-scoped copy.
   *  `null` while creating (no card, no day). */
  cardDia: number | null;
}

export function AgendaScreen(props: AgendaScreenProps) {
  const {
    weekMondayIso,
    stripDays,
    todayIndex,
    initialSelectedIndex,
    dias,
    weekNavLabel,
    weekNavRel,
    weekFooter,
    fueraDeHorizonte,
    sesionInicial,
    coaches,
    horaOptions,
    duracionOptions,
    cupoOptions,
  } = props;
  const router = useRouter();

  const [view, setView] = React.useState<View>("dia");
  const [selectedIndex, setSelectedIndex] = React.useState(initialSelectedIndex);
  // THE week-reset mechanism (the page deliberately renders us without a `key`,
  // so week navigation swaps props on this mounted instance): re-seed the selected
  // day from the new week's `?d` via React's "adjust state on prop change during
  // render" pattern — no flash, no effect. Everything NOT reset here survives week
  // paging by design, above all `view`: in SEMANA the arrows step ±1 week and must
  // keep the operator in SEMANA (PRD (f)). In-week day taps don't change
  // weekMondayIso, so the selection is preserved.
  const [prevWeek, setPrevWeek] = React.useState(weekMondayIso);
  if (prevWeek !== weekMondayIso) {
    setPrevWeek(weekMondayIso);
    setSelectedIndex(initialSelectedIndex);
  }

  // The tipo catalog is client state so a freshly-minted `+` tipo appears + selects
  // without a round trip; the server re-seeds it (same render-time reconcile) on the
  // next read — a new props array ref lands only on a server render, never a client one.
  const [tipos, setTipos] = React.useState<ClassTypeOpt[]>(props.tipos);
  const [prevTipos, setPrevTipos] = React.useState(props.tipos);
  if (prevTipos !== props.tipos) {
    setPrevTipos(props.tipos);
    setTipos(props.tipos);
  }

  const [glance, setGlance] = React.useState<{
    open: boolean;
    card: CardVM | null;
    /** The calendar day (iso) the card is rendered under — #243's only source for "this
     *  card's own weekday" (openEdit's cardDia): `card.startsAtIso` is an absolute instant
     *  that can straddle midnight against the gym's own local calendar day. */
    dia: string | null;
    loading: boolean;
    roster: RosterRow[];
    candidates: CandidateRow[];
  }>({ open: false, card: null, dia: null, loading: false, roster: [], candidates: [] });
  // clienteIds with a pase in flight — drives the roster's pending affordance.
  const [rosterBusy, setRosterBusy] = React.useState<Set<string>>(() => new Set());
  // #235 story 10: the last PICKER add the RPC refused over balance or vigencia. The toast that
  // named the reason is gone by the time the operator has read the caller their options, so the
  // sheet keeps a line to that member's sale — the whole point being that they are still on the
  // phone. Only the add flow sets it; the present-toggle on an existing row never does.
  const [ventaSugerida, setVentaSugerida] = React.useState<VentaSugerida | null>(null);
  const [editor, setEditor] = React.useState<EditorState>({
    open: false,
    mode: "create",
    card: null,
    draft: createDraft(props.tipos[0]?.name ?? ""),
    cardDia: null,
  });
  const [busy, setBusy] = React.useState(false);
  // The desk's own fix for the same race (asistencia.tsx's `inFlight` ref): `busy` is STATE,
  // so two fast taps on GUARDAR/CANCELAR can both read it `false` before React commits the
  // first tap's `setBusy(true)` — two concurrent server actions, and on the create path, two
  // rows. A ref closes that gap synchronously; `busy` stays, driving the sheet's disabled/dim UI.
  const editorInFlight = React.useRef(false);

  // The signal rail is held while either sheet is open (audit 2026-09-01, weakness 5). The glance
  // sheet holds a lazily-loaded roster and the editor holds an unsaved draft; a `router.refresh()`
  // under either one throws away work the operator can see. Closing BOTH releases the hold, and
  // `liberarSenal` flushes whatever was pending — so the refresh they "missed" lands on close
  // instead of waiting for the next write anybody happens to make.
  //
  // The dep is the COLLAPSED boolean, never `[glance.open, editor.open]`: EDITAR hands off from
  // the glance sheet to the editor, and a two-value dep re-runs the effect on that handoff —
  // release, then re-acquire — which flushes a pending refresh straight into the editor that is
  // opening. One boolean stays true across the handoff, so nothing is released mid-flight.
  const reteniendoHoja = glance.open || editor.open;
  React.useEffect(() => {
    if (!reteniendoHoja) return;
    ocuparSenal("agenda-hoja");
    return () => liberarSenal("agenda-hoja");
  }, [reteniendoHoja]);

  const selectedDay = dias[selectedIndex] ?? dias[0];
  const selectedIso = stripDays[selectedIndex]?.iso ?? stripDays[0].iso;

  // ── Navigation ──────────────────────────────────────────────────────────
  // The decision is the pure, tested pasoAgenda; this is just the adapter.
  const step = (dir: 1 | -1) => {
    const paso = pasoAgenda(view, selectedIndex, selectedIso, dir);
    if (paso.kind === "select") setSelectedIndex(paso.index);
    else router.push(`/agenda?d=${paso.iso}`);
  };

  // ── Sheets ──────────────────────────────────────────────────────────────
  // Opening a card's quick-glance lazily loads its roster (booked members + walk-in
  // candidates) — the whole week's rosters would be a read per session up front.
  const openGlance = (card: CardVM, dia: string) => {
    setGlance({ open: true, card, dia, loading: true, roster: [], candidates: [] });
    setRosterBusy(new Set());
    void rosterSesionAction(card.id).then((res) => {
      setGlance((g) => (g.card?.id === card.id ? { ...g, loading: false, roster: res.roster, candidates: res.candidates } : g));
    });
  };
  const closeGlance = () => {
    setVentaSugerida(null);
    setGlance((g) => ({ ...g, open: false }));
  };
  const closeEditor = () => setEditor((e) => ({ ...e, open: false }));

  // `?sesion=<id>` (#328): page.tsx already resolved the id to a day in THIS week and
  // selected it (a stale/foreign id never reaches this prop), so all that's left is
  // opening that card's OWN quick-glance sheet — the same one a tap opens — once, on
  // mount. The ref (not just a `sesionInicial` check) is what makes it once: React
  // Strict Mode double-invokes this effect in dev, and a later re-render must not
  // re-open a sheet the operator already closed.
  const sesionInicialAbierta = React.useRef(false);
  React.useEffect(() => {
    if (sesionInicialAbierta.current || !sesionInicial) return;
    sesionInicialAbierta.current = true;
    const card = selectedDay.cards.find((c) => c.id === sesionInicial);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional deep-link open on mount
    if (card) openGlance(card, selectedDay.iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: opens the deep-linked card once, off the first render's selectedDay/openGlance
  }, []);

  // Every roster write shares one shape: busy-gate the cliente, run the RPC, surface its
  // Spanish raise through the toast, then reload the roster (the RPC is authoritative — never
  // optimistically guess membership) and refresh the agenda so the occupancy bump lands on the
  // card counts, CUPO, the lugares-libres line and the day header's reservas total.
  const runRoster = async (
    clienteId: string,
    accion: (sessionId: string) => Promise<AgendaResultado>,
    errorTitle: string,
    // #235 story 10: the RPC's own sentence, handed to the caller that asked for it. Additive —
    // the toast fires either way; this is only how the add flow learns WHY it was refused.
    onFail?: (error: string) => void,
  ) => {
    const card = glance.card;
    if (!card || rosterBusy.has(clienteId)) return;
    const sessionId = card.id;
    setRosterBusy((prev) => new Set(prev).add(clienteId));
    try {
      const res = await accion(sessionId);
      if (!res.ok) {
        forgeToast({ tone: "warning", title: errorTitle, body: res.error });
        onFail?.(res.error);
        return;
      }
      const fresh = await rosterSesionAction(sessionId);
      setGlance((g) => (g.card?.id === sessionId ? { ...g, roster: fresh.roster, candidates: fresh.candidates } : g));
      router.refresh();
    } finally {
      setRosterBusy((prev) => {
        const next = new Set(prev);
        next.delete(clienteId);
        return next;
      });
    }
  };

  // The LISTA checkbox's fast path (owner report: the check mark "took time" to move — this
  // was TWO serial Vercel→Supabase trips, the RPC then a full roster refetch, before the row
  // flipped at all). Skips `runRoster`'s reload in favor of a synchronous flip plus a reconcile
  // off the RPC's own `present`, because nothing about MEMBERSHIP changes here: the row was
  // already on the roster and stays on it either way. Only safe for such a row — never a
  // walk-in add (a brand-new row, dropped from candidates) nor a walk-in UNTOGGLE (their
  // reservation is cancelled outright, so the row disappears server-side) — `runPase` below
  // gates on both before calling this.
  //
  // Reverts are per ROW, never a whole-roster snapshot: `rosterBusy` gates per cliente, so two
  // taps on different members (A, B) can both be in flight at once, and resetting to a
  // snapshot taken before A's tap would erase B's already-landed flip if A then fails. A
  // thrown/rejected call (network, a deploy mid-flight) reverts the same way through the catch,
  // so a dropped call never leaves the optimistic flip on screen with no explanation.
  const runPaseOptimista = async (clienteId: string, presenteAntes: boolean, onFail?: (error: string) => void) => {
    const card = glance.card;
    if (!card || rosterBusy.has(clienteId)) return;
    const sessionId = card.id;
    setRosterBusy((prev) => new Set(prev).add(clienteId));
    setGlance((g) => (g.card?.id === sessionId ? { ...g, roster: marcarPresente(g.roster, clienteId, !presenteAntes) } : g));
    try {
      const res = await pasarListaSesionAction({ sessionId, clienteId });
      if (!res.ok) {
        setGlance((g) => (g.card?.id === sessionId ? { ...g, roster: marcarPresente(g.roster, clienteId, presenteAntes) } : g));
        forgeToast({ tone: "warning", title: "No se pudo pasar lista", body: res.error });
        onFail?.(res.error);
        return;
      }
      setGlance((g) => (g.card?.id === sessionId ? { ...g, roster: marcarPresente(g.roster, clienteId, res.present) } : g));
      router.refresh();
    } catch {
      setGlance((g) => (g.card?.id === sessionId ? { ...g, roster: marcarPresente(g.roster, clienteId, presenteAntes) } : g));
      forgeToast({ tone: "warning", title: "No se pudo pasar lista", body: "Revisa tu conexión e inténtalo de nuevo." });
    } finally {
      setRosterBusy((prev) => {
        const next = new Set(prev);
        next.delete(clienteId);
        return next;
      });
    }
  };

  // Reservation-aware Pasar lista: one atomic RPC per tap (booked → asistida no re-consume;
  // walk-in → is_walk_in reservation + consume; untoggle reverses).
  // `onFail` is the add flow's alone: the roster's present-toggle calls this with one argument
  // (SessionRosterProps.onToggle takes only a clienteId), so a blocked re-toggle never offers a sale.
  //
  // The RPC is the same either way; only the write's blast radius decides which path runs it.
  // An EXISTING, non-walk-in row is a pure present-flip — nothing about membership changes —
  // so it takes `runPaseOptimista`. Everything else goes through the ordinary `runRoster`
  // refetch: a candidate walk-in (runAgregar's "pase" branch) ADDS a row and drops a candidate,
  // and un-toggling a walk-in CANCELS its reservation outright — the row disappears server-side
  // and the member returns to candidates. Both are membership changes.
  const runPase = (clienteId: string, onFail?: (error: string) => void) => {
    const existente = glance.roster.find((r) => r.clienteId === clienteId);
    if (existente && !existente.isWalkIn) {
      return runPaseOptimista(clienteId, existente.present, onFail);
    }
    return runRoster(clienteId, (sessionId) => pasarListaSesionAction({ sessionId, clienteId }), "No se pudo pasar lista", onFail);
  };

  // THE tense branch (#238), and it lives HERE, in the handler, against a clock read at THIS
  // instant — never one captured at render (the #235 amendment). A sheet left open across the
  // window's opening edge still shows the stale AGREGAR RESERVA label, and that is fine: the
  // tap below re-reads the clock and checks the member in. A stale label is cosmetic; a stale
  // write is a false record. There is deliberately no interval here — #231 owns the tick.
  const runAgregar = (clienteId: string) => {
    const card = glance.card;
    if (!card) return;
    // Any new pick supersedes the last suggestion — a different candidate, or the same member
    // retried after the sale went through. Nothing re-sets it on success, so this is the clear.
    setVentaSugerida(null);
    // Both tenses can hit a sellable wall: reservar_clase gates on balance AND vigencia,
    // pasar_lista_sesion on vigencia for a walk-in. The classifier is what tells them apart.
    const sugerir = (error: string) =>
      setVentaSugerida(sugerenciaVenta(error, glance.candidates.find((c) => c.id === clienteId)));
    if (accionAgregar(card.startsAtIso, new Date()) === "pase") return runPase(clienteId, sugerir);
    return runRoster(
      clienteId,
      (sessionId) => reservarClaseClienteAction({ sessionId, clienteId }),
      "No se pudo reservar",
      sugerir,
    );
  };

  // The undo. Charging is at booking, so a mis-tapped name has cost that member a class —
  // this is the only thing that gives it back (the present-toggle would mark them ATTENDED).
  const runCancelarReserva = (clienteId: string) =>
    runRoster(
      clienteId,
      (sessionId) => cancelarReservaClienteAction({ sessionId, clienteId }),
      "No se pudo cancelar la reserva",
    );

  const openCreate = () => {
    closeGlance();
    setEditor({ open: true, mode: "create", card: null, draft: createDraft(tipos[0]?.name ?? ""), cardDia: null });
  };
  // Every open re-seeds the draft, which is what resets the #243 scope to "Solo esta
  // clase" — a wide edit never survives into the next card the operator taps. `cardDia`
  // reads the day the card was rendered under (glance.dia), never `card.startsAtIso` —
  // see the glance state's own comment.
  const openEdit = (card: CardVM) => {
    closeGlance();
    setEditor({
      open: true,
      mode: "edit",
      card,
      draft: editDraftFrom(card),
      cardDia: glance.dia ? diaSemanaDe(glance.dia) : null,
    });
  };
  // A scope toggle is not just a flag — it changes WHAT the save writes, so the pure
  // `aplicarAlcance` (session-vm.ts) re-seeds the shared fields from the new scope's own
  // baseline (#243): the rule for "dia"/"horario", the clicked session for "solo esta clase" —
  // but ONLY for fields the operator has not actually changed, judged BY VALUE against the scope
  // being left (D1/D2 fixes), never by a sticky "touched" flag. Any other patch (not a scope
  // flip) is a plain merge.
  const patchDraft = (patch: Partial<EditorDraft>) =>
    setEditor((e) => {
      if (patch.alcance && e.card) {
        return { ...e, draft: aplicarAlcance(e.card, e.draft, patch.alcance) };
      }
      return { ...e, draft: { ...e.draft, ...patch } };
    });

  // The title NAMES the verb that failed, because the three #243 writes are three different
  // acts with three different blast radii — "No se pudo guardar" over a refused retire reads
  // as a lost edit, not as a schedule that is still running.
  const fail = (error: string, title = "No se pudo guardar") => forgeToast({ tone: "warning", title, body: error });
  const afterWrite = (title: string, body: string) => {
    closeEditor();
    forgeToast({ tone: "success", title, body });
    router.refresh();
  };

  const addTipo = async (name: string) => {
    const res = await crearClassTypeAction({ name });
    if (!res.ok) {
      fail(res.error);
      return;
    }
    setTipos((ts) => [...ts, { id: res.id, name }]);
    patchDraft({ tipo: name });
  };

  const save = async () => {
    // Ref check-and-set closes the gap `busy` (state) cannot: two taps inside one render tick
    // both see `busy === false`. `busy` is still checked — belt for the ordinary, already-
    // re-rendered case — but the ref is what actually blocks the fast double-tap.
    if (editorInFlight.current || busy) return;
    editorInFlight.current = true;
    try {
      // Nothing changed → nothing is written, and this is not a nicety: the narrow save runs
      // edit_class_session, which CLEARS template_id, so a reflex GUARDAR on an untouched attached
      // class buys an irreversible detach in exchange for no edit at all (#243).
      if (editor.mode === "edit" && editor.card && draftSinCambios(editor.card, editor.draft)) {
        closeEditor();
        return;
      }
      const tipoId = tipos.find((t) => t.name === editor.draft.tipo)?.id;
      if (!tipoId) {
        forgeToast({ tone: "warning", title: "Falta el tipo", body: "Elige o crea un tipo de clase." });
        return;
      }
      const { draft } = editor;
      const nombreEspecial = draft.isSpecial ? draft.specialName : undefined;
      setBusy(true);
      try {
        if (editor.mode === "edit" && editor.card) {
          const card = editor.card;
          // "dia" / "horario": one RPC rewrites every future class of the rule (one weekday, or
          // every weekday of the group) in place. The bookings ride along on the FK — nothing is
          // charged, nothing is refunded, nobody is un-booked. Coaches go only when the operator
          // moved them, measured against THE RULE's coach set (the draft was seeded from it).
          if (draft.alcance !== "clase" && card.templateId) {
            const res = await actualizarHorarioRecurrenteAction({
              templateId: card.templateId,
              classTypeId: tipoId,
              hora: draft.hora,
              duracionMin: draft.duracionMin,
              cupo: draft.cupo,
              ...(draft.alcance === "horario" && { todosLosDias: true }),
              ...(coachIdsCambiaron(semillaAlcance(card, draft.alcance).coachIds, draft.coachIds) && {
                coachIds: draft.coachIds,
              }),
            });
            if (!res.ok) return fail(res.error, "No se pudo actualizar el horario");
            afterWrite("Horario actualizado", movidasLinea(res.clasesMovidas, res.clasesSinMover));
            return;
          }
          const res = await editarSesionAction({
            sesionId: card.id,
            classTypeId: tipoId,
            fecha: selectedIso,
            hora: draft.hora,
            duracionMin: draft.duracionMin,
            cupo: draft.cupo,
            coachIds: draft.coachIds,
            esEspecial: draft.isSpecial,
            nombreEspecial,
          });
          if (!res.ok) return fail(res.error);
          // edit_class_session clears template_id, so a narrow save on a series member SEPARATES
          // it. The caption warned before the fact; this is the receipt after it.
          afterWrite("Clase actualizada", card.templateId ? "Visible en la app · ahora es Única" : "Visible en la app");
          return;
        }
        const weekdays = draft.repeatDays.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
        if (weekdays.length) {
          const res = await crearHorarioRecurrenteAction({
            classTypeId: tipoId,
            weekdays,
            hora: draft.hora,
            duracionMin: draft.duracionMin,
            cupo: draft.cupo,
            coachIds: draft.coachIds,
          });
          if (!res.ok) return fail(res.error);
          afterWrite("Clase creada", weekdays.length > 1 ? `${weekdays.length} días` : "Visible en la app");
          return;
        }
        const res = await crearSesionAction({
          classTypeId: tipoId,
          fecha: selectedIso,
          hora: draft.hora,
          duracionMin: draft.duracionMin,
          cupo: draft.cupo,
          coachIds: draft.coachIds,
          esEspecial: draft.isSpecial,
          nombreEspecial,
        });
        if (!res.ok) return fail(res.error);
        afterWrite("Clase creada", "Visible en la app");
      } finally {
        setBusy(false);
      }
    } catch {
      // A thrown/rejected action (network drop, timeout) previously left the sheet open with no
      // toast and a silently-reset `busy` — inviting a retry that duplicates on the create path.
      // Same failure idiom as an `{ok:false}` result; the sheet stays open so the draft survives.
      fail("Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      editorInFlight.current = false;
    }
  };

  // The same scope toggle governs the destructive path — which is why the sheet keeps
  // one destructive button, not two. Wide: stop the rule(s) and cancel every future class,
  // each through the shipped cancel_class_session, so every held class comes back.
  const cancelClass = async () => {
    if (editorInFlight.current || busy || !editor.card) return;
    editorInFlight.current = true;
    const { card, draft } = editor;
    try {
      setBusy(true);
      try {
        if (draft.alcance !== "clase" && card.templateId) {
          const res = await retirarHorarioRecurrenteAction({
            templateId: card.templateId,
            ...(draft.alcance === "horario" && { todosLosDias: true }),
          });
          if (!res.ok) return fail(res.error, "No se pudo terminar el horario");
          afterWrite("Horario terminado", canceladasLinea(res.clasesCanceladas));
          return;
        }
        const res = await cancelarSesionAction({ sesionId: card.id });
        if (!res.ok) return fail(res.error, "No se pudo cancelar la clase");
        afterWrite("Clase cancelada", "Reservas canceladas y clases devueltas");
      } finally {
        setBusy(false);
      }
    } catch {
      // Mirrors save()'s catch: a thrown/rejected action must not leave the sheet silently
      // reset with no explanation, inviting a retry.
      fail("Revisa tu conexión e inténtalo de nuevo.", "No se pudo cancelar la clase");
    } finally {
      editorInFlight.current = false;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const navLabel = view === "dia" ? selectedDay.dateLabel : weekNavLabel;
  const navRel = view === "dia" ? selectedDay.navRel : weekNavRel;
  // The sheet's two render-time clock reads (#238): the add button's verb, and whether the
  // roster still offers a cancel. Both are COSMETIC — the tap handler re-reads the clock and
  // the RPC is the enforcer either way — so nothing refreshes them (#231 owns the tick).
  const ahora = new Date();
  // The card the quick-glance sheet actually renders. `glance.card` is only the identity/
  // open-state anchor (its id, and what the effect/`runRoster` key off); `cardVigente` looks
  // up the CURRENT week's own card with that id, so a roster write's `router.refresh()`
  // updates CUPO/lugares-libres the same tick it updates LISTA, instead of waiting for the
  // sheet to close and reopen. `null` while no card is open; falls back to the snapshot once
  // the id has left the loaded week (week navigation, deletion) — cardVigente's own fallback.
  const cardActual = glance.card && cardVigente(dias, glance.card);

  return (
    <div>
      {/* Header — sticky so the navigator/strip/toggle stay put while the list scrolls. */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--canvas)", borderBottom: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between" style={{ padding: "16px 18px 10px" }}>
          <span className="uppercase" style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, color: "var(--fg)" }}>
            Agenda<span style={{ color: "var(--yellow)" }}>.</span>
          </span>
          <button
            type="button"
            onClick={openCreate}
            aria-label="Nueva clase"
            className="flex items-center justify-center"
            style={{ width: 40, height: 40, background: "var(--yellow)", border: "none", cursor: "pointer" }}
          >
            <Icon name="plus" size={20} color="var(--ink)" strokeWidth={2.4} />
          </button>
        </div>

        {/* Navigator: context label + relative label. */}
        <div className="flex items-baseline" style={{ gap: 10, padding: "0 22px 2px" }}>
          <span className="uppercase" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: "var(--fg)" }}>
            {navLabel}
          </span>
          <span
            className="uppercase"
            style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: navRel === "Hoy" || navRel === "Esta semana" ? "var(--yellow)" : "var(--muted)" }}
          >
            {navRel}
          </span>
        </div>

        <DateStrip
          days={stripDays.map((s) => ({ wd: s.wd, dnum: s.dnum }))}
          selectedIndex={selectedIndex}
          todayIndex={todayIndex}
          onSelect={setSelectedIndex}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />

        {/* DÍA / SEMANA underline toggle. */}
        <div className="flex" style={{ gap: 24, padding: "2px 22px 0" }}>
          {(["dia", "semana"] as const).map((v) => {
            const on = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={on}
                className="uppercase"
                style={{
                  padding: "6px 1px 10px",
                  border: "none",
                  borderBottom: `2px solid ${on ? "var(--yellow)" : "transparent"}`,
                  background: "transparent",
                  color: on ? "var(--fg)" : "var(--muted)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  cursor: "pointer",
                  transition: "color .2s ease, border-color .2s ease",
                }}
              >
                {v === "dia" ? "Día" : "Semana"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {view === "dia" ? (
        <div style={{ padding: "14px 16px 24px", display: "flex", flexDirection: "column", gap: 11 }}>
          <div className="flex items-center justify-between" style={{ padding: "0 4px 2px" }}>
            <span className="uppercase" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: "var(--muted)" }}>
              {selectedDay.dateLabel}
            </span>
            <span className="tnum" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3, color: "var(--muted-soft)" }}>
              {selectedDay.summary}
            </span>
          </div>

          {selectedDay.cards.length === 0 ? (
            <div style={VACIO_STYLE}>
              {fueraDeHorizonte ? SIN_GENERAR : "Sin clases este día · toca + para crear una"}
            </div>
          ) : (
            selectedDay.cards.map((card) => (
              <SessionCard
                key={card.id}
                time={card.time}
                mins={card.mins}
                tipo={card.tipo}
                coaches={card.coaches}
                booked={card.booked}
                cap={card.cap}
                estado={card.estado}
                isNext={card.isNext}
                isSpecial={card.isSpecial}
                specialName={card.specialName}
                esUnica={card.templateId === null}
                onClick={() => openGlance(card, selectedDay.iso)}
              />
            ))
          )}
        </div>
      ) : fueraDeHorizonte && dias.every((d) => d.cards.length === 0) ? (
        // SEMANA gets the same message, and needs it more: six "Sin clases" groups under a live
        // `+` is the shape that invites six duplicate creates the horizon will generate anyway.
        <div style={{ padding: "20px 22px 22px" }}>
          <div style={VACIO_STYLE}>{SIN_GENERAR}</div>
        </div>
      ) : (
        <div style={{ padding: "6px 22px 22px" }}>
          {dias.map((dia, i) => (
            <WeekGroup
              key={dia.iso}
              dnum={stripDays[i].dnum}
              wd={stripDays[i].wd}
              selected={i === selectedIndex}
              occupancyPct={dia.occupancyPct}
              rows={dia.cards.map<WeekRow>((card) => ({
                time: card.time,
                tipo: card.tipo,
                booked: card.booked,
                cap: card.cap,
                estado: card.estado,
                isSpecial: card.isSpecial,
                esUnica: card.templateId === null,
                onClick: () => {
                  setSelectedIndex(i);
                  openGlance(card, dia.iso);
                },
              }))}
            />
          ))}
          <div className="flex justify-end" style={{ paddingTop: 20 }}>
            <span className="tnum uppercase" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: "var(--yellow)" }}>
              {weekFooter}
            </span>
          </div>
        </div>
      )}

      {/* Quick-glance (card tap) — portals to the viewport via Sheet. */}
      {cardActual && (
        <QuickGlanceSheet
          open={glance.open}
          onClose={closeGlance}
          time={cardActual.time}
          tipo={cardActual.tipo}
          coaches={cardActual.coaches}
          mins={cardActual.mins}
          booked={cardActual.booked}
          cap={cardActual.cap}
          estado={cardActual.estado}
          isSpecial={cardActual.esEspecial}
          specialName={cardActual.specialName}
          onEdit={() => cardActual && openEdit(cardActual)}
          roster={glance.roster}
          candidates={glance.candidates}
          rosterLoading={glance.loading}
          rosterBusy={rosterBusy}
          antesDeVentana={accionAgregar(cardActual.startsAtIso, ahora) === "reservar"}
          claseIniciada={new Date(cardActual.startsAtIso).getTime() <= ahora.getTime()}
          ventaSugerida={ventaSugerida ?? undefined}
          onTogglePresent={runPase}
          onAddWalkIn={runAgregar}
          onCancelReserva={runCancelarReserva}
        />
      )}

      {/* Editor — a right-sliding full panel; portaled into a viewport frame so the
          template.tsx enter-transform never becomes its containing block. */}
      <EditorPortal open={editor.open}>
        <EditorSheet
          open={editor.open}
          isEdit={editor.mode === "edit"}
          draft={editor.draft}
          coaches={coaches}
          tipoOptions={tipos.map((t) => t.name)}
          horaOptions={horaOptions}
          duracionOptions={duracionOptions}
          cupoOptions={cupoOptions}
          esSerie={esSerie(editor.card)}
          esPasada={editor.card ? new Date(editor.card.startsAtIso).getTime() <= ahora.getTime() : false}
          reservasActuales={editor.card?.booked ?? 0}
          cupoPlantilla={editor.card?.plantilla?.capacidad ?? 0}
          cardDia={editor.cardDia ?? undefined}
          groupDias={editor.card?.plantilla?.groupDias ?? []}
          pending={busy}
          onPatch={patchDraft}
          onAddTipo={addTipo}
          onSave={save}
          onDiscard={closeEditor}
          onCancelClass={editor.mode === "edit" ? cancelClass : undefined}
          onClose={closeEditor}
        />
      </EditorPortal>
    </div>
  );
}

/** Body-level fixed frame for the sliding editor (mirrors Sheet's portal escape of
 *  the app shell's enter-transform), centered into the phone-width column. */
function EditorPortal({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only body read; SSR/first render stay null to avoid a hydration mismatch
    setEl(document.body);
  }, []);
  if (!el) return null;
  return createPortal(
    <div className="fixed inset-0 z-50" style={{ pointerEvents: open ? "auto" : "none" }}>
      <div className="absolute inset-y-0 inset-x-0 mx-auto w-full overflow-hidden sm:max-w-[440px]">
        {children}
      </div>
    </div>,
    el,
  );
}
