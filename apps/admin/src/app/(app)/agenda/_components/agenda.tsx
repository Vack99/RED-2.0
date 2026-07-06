"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { DateStrip } from "@gym/ui/forge/agenda/date-strip";
import { EditorSheet, type CoachOption, type EditorDraft } from "@gym/ui/forge/agenda/editor-sheet";
import { QuickGlanceSheet } from "@gym/ui/forge/agenda/quick-glance-sheet";
import type { CandidateRow, RosterRow } from "@gym/ui/forge/agenda/session-roster";
import { SessionCard } from "@gym/ui/forge/agenda/session-card";
import { WeekGroup, type WeekRow } from "@gym/ui/forge/agenda/week-group";
import { Icon } from "@gym/ui/forge/icon";
import { forgeToast } from "@gym/ui/forge/toaster";

import {
  cancelarSesionAction,
  crearClassTypeAction,
  crearHorarioRecurrenteAction,
  crearSesionAction,
  editarSesionAction,
  pasarListaSesionAction,
  rosterSesionAction,
} from "../actions";
import { pasoAgenda } from "./paso-agenda";
import type { CardVM } from "./session-vm";

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
  coaches: CoachOption[];
  tipos: ClassTypeOpt[];
  horaOptions: string[];
  duracionOptions: number[];
  cupoOptions: number[];
}

type View = "dia" | "semana";

interface EditorState {
  open: boolean;
  mode: "create" | "edit";
  editId: string | null;
  draft: EditorDraft;
}

const EMPTY_REPEAT: boolean[] = [false, false, false, false, false, false];

/** Editor defaults for a new class (PRD #36 e): 18:00 / 45 min / cupo 24, first tipo. */
function createDraft(tipos: ClassTypeOpt[]): EditorDraft {
  return {
    tipo: tipos[0]?.name ?? "",
    hora: "18:00",
    duracionMin: 45,
    cupo: 24,
    coachIds: [],
    repeatDays: [...EMPTY_REPEAT],
    isSpecial: false,
    specialName: "",
  };
}

/** Seed the editor from an existing session (editing never fans out — ADR-0010). */
function editDraftFrom(card: CardVM): EditorDraft {
  return {
    tipo: card.tipo,
    hora: card.time,
    duracionMin: card.mins,
    cupo: card.cap,
    coachIds: card.coachIds,
    repeatDays: [...EMPTY_REPEAT],
    isSpecial: card.esEspecial,
    specialName: card.specialName ?? "",
  };
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
    loading: boolean;
    roster: RosterRow[];
    candidates: CandidateRow[];
  }>({ open: false, card: null, loading: false, roster: [], candidates: [] });
  // clienteIds with a pase in flight — drives the roster's pending affordance.
  const [rosterBusy, setRosterBusy] = React.useState<Set<string>>(() => new Set());
  const [editor, setEditor] = React.useState<EditorState>({
    open: false,
    mode: "create",
    editId: null,
    draft: createDraft(props.tipos),
  });
  const [busy, setBusy] = React.useState(false);

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
  const openGlance = (card: CardVM) => {
    setGlance({ open: true, card, loading: true, roster: [], candidates: [] });
    setRosterBusy(new Set());
    void rosterSesionAction(card.id).then((res) => {
      setGlance((g) => (g.card?.id === card.id ? { ...g, loading: false, roster: res.roster, candidates: res.candidates } : g));
    });
  };
  const closeGlance = () => setGlance((g) => ({ ...g, open: false }));
  const closeEditor = () => setEditor((e) => ({ ...e, open: false }));

  // Reservation-aware Pasar lista: one atomic RPC per tap (booked → asistida no re-consume;
  // walk-in → is_walk_in reservation + consume; untoggle reverses). The RPC is authoritative,
  // so we reload the roster from it rather than optimistically guessing membership, then refresh
  // the agenda so a walk-in's occupancy bump lands on the card counts.
  const runPase = async (clienteId: string) => {
    const card = glance.card;
    if (!card || rosterBusy.has(clienteId)) return;
    const sessionId = card.id;
    setRosterBusy((prev) => new Set(prev).add(clienteId));
    try {
      const res = await pasarListaSesionAction({ sessionId, clienteId });
      if (!res.ok) {
        forgeToast({ tone: "warning", title: "No se pudo pasar lista", body: res.error });
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

  const openCreate = () => {
    closeGlance();
    setEditor({ open: true, mode: "create", editId: null, draft: createDraft(tipos) });
  };
  const openEdit = (card: CardVM) => {
    closeGlance();
    setEditor({ open: true, mode: "edit", editId: card.id, draft: editDraftFrom(card) });
  };
  const patchDraft = (patch: Partial<EditorDraft>) =>
    setEditor((e) => ({ ...e, draft: { ...e.draft, ...patch } }));

  const fail = (error: string) => forgeToast({ tone: "warning", title: "No se pudo guardar", body: error });
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
    if (busy) return;
    const tipoId = tipos.find((t) => t.name === editor.draft.tipo)?.id;
    if (!tipoId) {
      forgeToast({ tone: "warning", title: "Falta el tipo", body: "Elige o crea un tipo de clase." });
      return;
    }
    const { draft } = editor;
    const nombreEspecial = draft.isSpecial ? draft.specialName : undefined;
    setBusy(true);
    try {
      if (editor.mode === "edit" && editor.editId) {
        const res = await editarSesionAction({
          sesionId: editor.editId,
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
        afterWrite("Clase actualizada", "Visible en la app");
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
  };

  const cancelClass = async () => {
    if (busy || !editor.editId) return;
    setBusy(true);
    try {
      const res = await cancelarSesionAction({ sesionId: editor.editId });
      if (!res.ok) return fail(res.error);
      afterWrite("Clase cancelada", "Se avisó a los reservados");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const navLabel = view === "dia" ? selectedDay.dateLabel : weekNavLabel;
  const navRel = view === "dia" ? selectedDay.navRel : weekNavRel;

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
            <div
              style={{ border: "1px solid var(--line)", padding: "34px 20px", textAlign: "center", fontSize: 12.5, letterSpacing: 0.3, color: "var(--muted)" }}
            >
              Sin clases este día · toca + para crear una
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
                onClick={() => openGlance(card)}
              />
            ))
          )}
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
                onClick: () => {
                  setSelectedIndex(i);
                  openGlance(card);
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
      {glance.card && (
        <QuickGlanceSheet
          open={glance.open}
          onClose={closeGlance}
          time={glance.card.time}
          tipo={glance.card.tipo}
          coaches={glance.card.coaches}
          mins={glance.card.mins}
          booked={glance.card.booked}
          cap={glance.card.cap}
          estado={glance.card.estado}
          isSpecial={glance.card.esEspecial}
          specialName={glance.card.specialName}
          onEdit={() => glance.card && openEdit(glance.card)}
          roster={glance.roster}
          candidates={glance.candidates}
          rosterLoading={glance.loading}
          rosterBusy={rosterBusy}
          onTogglePresent={runPase}
          onAddWalkIn={runPase}
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
