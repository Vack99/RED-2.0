"use client";

import * as React from "react";

import { SpecialStar } from "./special-star";
import { WheelPickerSheet } from "./wheel-picker";

/**
 * The session editor: a right-sliding full panel over the agenda. Field rows open
 * the wheel picker (tipo, hora, duración, cupo), a coach multi-select over the
 * catalog, one toggle row — the "Se repite" weekdays when creating, the #243 scope
 * control when editing a generated class — and an "Evento especial" switch that
 * reveals a name input. Primary save + discard, plus one destructive button when
 * editing whose label AND handler follow the scope toggle. Token-only.
 *
 * The mock's free-text coach field is deliberately replaced by a multi-select
 * over the `coach` catalog (PRD (e), invariant §5.4): no coach chosen renders
 * "Por asignar" (display only). The tipo picker's `+` mints a real `class_type`.
 */

export const WEEKDAY_TOGGLES = ["L", "M", "Mi", "J", "V", "S"] as const;

/** How wide an edit writes (#243): this dated class alone, every future class of its
 *  own weekday ("dia" — the renamed "serie"), or every future class of every weekday
 *  in its schedule's group ("horario" — the whole-group verb). */
export type EditorAlcance = "clase" | "dia" | "horario";

/** Spanish weekday plurals, Lun=0..Sáb=5 — this app's own indexing (WEEKDAY_TOGGLES,
 *  `plantilla.groupDias`), used to name the "dia" scope in the toggle, the cancel label
 *  and its confirm sentence. A trailing "los domingos" keeps the lookup total: `dia`
 *  comes from `diaSemanaDe`, whose Lun=0..Dom=6 range is wider than this app's 0-5 class
 *  days (unreachable today — the gym never schedules Domingo — but a lookup that can
 *  return `undefined` is a defect waiting on a scheduling change, not a hard rule). */
const DIAS_PLURAL = ["los lunes", "los martes", "los miércoles", "los jueves", "los viernes", "los sábados", "los domingos"];

/**
 * Whether the sheet may offer anything wider than "clase" (#243, defect D5): editing a card that
 * came from a rule (`esSerie`) AND whose own weekday is actually known. `cardDia === undefined`
 * means UNKNOWN, not Lunes — this fails CLOSED rather than ever naming the wrong day in a toggle
 * label, a cancel confirm, or (via `todosLosDias`) an RPC call that retires the wrong weekday.
 * The one gate behind the toggle row, the effective `alcance`, and the destructive button's
 * wide arm — so an unknown day can never surface any of the three.
 */
export function puedeAmpliarAlcance(isEdit: boolean, esSerie: boolean, cardDia: number | undefined): boolean {
  return isEdit && esSerie && cardDia !== undefined;
}

/** The scope options the toggle offers for THIS card: narrow always, "dia" always (the
 *  toggle only renders at all when the card is attached, #243), "horario" only when its
 *  schedule's group has more than one active weekday — a lone-weekday group has no
 *  wider verb to offer. */
export function alcanceToggles(dia: number, groupDias: number[]): { value: EditorAlcance; label: string }[] {
  const opciones: { value: EditorAlcance; label: string }[] = [
    { value: "clase", label: "Solo esta clase" },
    { value: "dia", label: `Todos ${DIAS_PLURAL[dia]}` },
  ];
  if (groupDias.length > 1) opciones.push({ value: "horario", label: "Todo el horario" });
  return opciones;
}

export function editorTitle(isEdit: boolean): string {
  return isEdit ? "Editar clase" : "Nueva clase";
}

export function saveLabel(isEdit: boolean): string {
  return isEdit ? "Guardar cambios" : "Crear clase";
}

/** A special session's name, trimmed, or "Especial" when blank. */
export function especialNombre(name: string): string {
  return name.trim() || "Especial";
}

/**
 * The scope caption. Both arms need one, because both do something the label alone does
 * not say. The wide arm has to say all three things at once: what moves, what does not,
 * and that a booked member keeps their spot — a move is not a refund (#243 §4). The
 * NARROW arm silently DETACHES the class from its rule (edit_class_session clears
 * template_id), which is why the card comes back badged `Única` — that is a structural
 * change to the schedule and the operator has to read it before they save, not after.
 *
 * The wide arm claims THE SCHEDULE's future classes, never "esta y las futuras": the clicked
 * class is not guaranteed to be one of them. A class whose recomputed instant would land in the
 * past is left exactly as it is (the past-instant guard) — so on the very card most likely to be
 * clicked after a botched move, "cambia esta clase" would be a lie. `esPasada` is the same
 * honesty one step further: the sheet opens freely on a class that already started, where "las
 * pasadas no se tocan" would be a promise about the class on screen.
 */
export function alcanceCaption(alcance: EditorAlcance, esPasada: boolean, dia: number): string {
  if (alcance === "clase") return "Esta clase se separa del horario. Los cambios del horario ya no la alcanzan.";
  const alcanzados = alcance === "horario" ? "todos los días de este horario" : `${DIAS_PLURAL[dia]} de este horario`;
  return esPasada
    ? `Cambia las clases futuras de ${alcanzados}. Esta ya pasó y se queda como está. Las reservas se mueven con la clase.`
    : `Cambia las clases futuras de ${alcanzados}. Las pasadas no se tocan. Las reservas se mueven con la clase.`;
}

/**
 * Whether the destructive button may render at all (owner re-walk defect). A past "clase" cancel
 * can never succeed — `cancel_class_session`'s before-start gate is permanent, not a race to
 * beat — so offering the button only to have the RPC refuse with a confusing message is a UX
 * defect, not honesty. The "dia"/"horario" arms stay available on a past card: retiring a
 * schedule is legal from ANY card, and the RPC only ever touches the schedule's FUTURE classes
 * regardless of which one was clicked to get there. Render-only: the RPC remains the enforcer
 * either way (same idiom as agenda.tsx's render-time clock reads, ~line 444).
 */
export function puedeCancelar(esPasada: boolean, alcance: EditorAlcance): boolean {
  return !(esPasada && alcance === "clase");
}

/** The one destructive button's label — it follows the scope toggle (#243). */
export function cancelLabel(alcance: EditorAlcance, dia: number): string {
  if (alcance === "horario") return "Terminar todo el horario";
  if (alcance === "dia") return `Terminar ${DIAS_PLURAL[dia]}`;
  return "Cancelar esta clase";
}

/**
 * The confirm a wide arm must clear, or `null` to fire straight through. Only "dia"
 * and "horario" are gated: cancelling one class is one class, while "Terminar los
 * <día>" / "Terminar todo el horario" cancels every future class of the scope and
 * hands back every held class.
 */
export function cancelConfirm(alcance: EditorAlcance, dia: number): string | null {
  if (alcance === "clase") return null;
  if (alcance === "horario") {
    return "Se cancelarán todas las clases futuras de este horario en todos sus días y se devolverán las clases reservadas. No se puede deshacer.";
  }
  return `Se cancelarán todas las clases futuras de ${DIAS_PLURAL[dia]} de este horario y se devolverán las clases reservadas. No se puede deshacer.`;
}

/**
 * Cupo shrunk below what is already booked: WARN, never refuse (#243 §7). Refusing
 * would trap an operator whose one booking is six weeks out; `reservar_clase` already
 * blocks NEW bookings and the quick-glance already reads "Clase llena · sin lugares".
 * `null` renders nothing.
 *
 * The narrow arm triggers on a DIFFERENT fact than the two wide arms, because they are warning
 * about different things. Narrow: `reservas` is this class's own bookings, and the number is the
 * point. Wide ("dia"/"horario"): `reservas` is still only the CLICKED class's — so triggering on
 * it would stay silent while shrinking a lightly-booked card whose next-week twin is over
 * capacity, and would quote a count that never held for the rule. The wide arms therefore fire
 * on the shrink itself (`cupo` below the rule's current `cupoSerie`) and drop the number,
 * promising only what they can know: where the new cupo lands, and that no existing booking is
 * dropped.
 */
export function cupoAviso(cupo: number, reservas: number, alcance: EditorAlcance, cupoSerie: number): string | null {
  if (alcance !== "clase") {
    return cupo < cupoSerie ? "El nuevo cupo aplica a todas las clases futuras · nadie pierde su lugar" : null;
  }
  return reservas > cupo ? `Cupo por debajo de las ${reservas} reservas · nadie pierde su lugar` : null;
}

export interface CoachOption {
  id: string;
  label: string;
}

export interface EditorDraft {
  tipo: string;
  hora: string;
  duracionMin: number;
  cupo: number;
  coachIds: string[];
  /** Create-only: the weekdays a new class repeats on. Edit never reads it. */
  repeatDays: boolean[];
  /** Edit-only (#243): how wide save + the destructive button write. */
  alcance: EditorAlcance;
  isSpecial: boolean;
  specialName: string;
}

export interface EditorSheetProps {
  open: boolean;
  isEdit: boolean;
  draft: EditorDraft;
  coaches: CoachOption[];
  tipoOptions: string[];
  horaOptions: string[];
  duracionOptions: number[];
  cupoOptions: number[];
  /** The edited class came from a repeating rule (#243) — the only case that offers
   *  the scope toggle. A one-off (or a hand-detached class) is always its own scope. */
  esSerie?: boolean;
  /** The edited class already started — the scope caption must not promise to move it. */
  esPasada?: boolean;
  /** Bookings already on the edited class — drives the NARROW cupo-shrink warning. */
  reservasActuales?: number;
  /** The rule's current capacity — what the WIDE cupo warning measures a shrink against. */
  cupoPlantilla?: number;
  /** This card's own weekday (Lun=0..Sáb=5) — the toggle's "todos los <día>" label and the
   *  destructive button's day-scoped copy (#243). `undefined` means UNKNOWN, not Lunes (D5):
   *  the sheet fails closed and hides the "dia"/"horario" toggle options and the wide
   *  destructive arm rather than ever naming the wrong day. */
  cardDia?: number;
  /** The schedule's group weekdays, sorted, including this card's own (#243) — gates
   *  the "horario" scope: a lone-weekday group has no wider verb to offer. */
  groupDias?: number[];
  /** A write is already in flight: the whole button stack goes inert. Descartar included —
   *  closing the sheet mid-save lets the operator edit a second class and land the FIRST
   *  save's toast on it. */
  pending?: boolean;
  onPatch: (patch: Partial<EditorDraft>) => void;
  onAddTipo?: (name: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onCancelClass?: () => void;
  onClose: () => void;
}

type PickerKey = "tipo" | "hora" | "duracion" | "cupo" | null;

const LABEL_STYLE: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: 1.6, color: "var(--muted)" };
/** The under-a-control note ("Por asignar", the scope caption, the cupo warning). */
const NOTE_STYLE: React.CSSProperties = { marginTop: 8, fontSize: 11.5, letterSpacing: 0.3, color: "var(--muted)" };
/** One segmented toggle — the weekday row's look, shared with the #243 scope row. */
function toggleStyle(on: boolean): React.CSSProperties {
  return {
    flex: 1,
    textAlign: "center",
    padding: "11px 6px",
    fontSize: 11,
    fontWeight: 800,
    fontFamily: "inherit",
    cursor: "pointer",
    background: on ? "var(--yellow)" : "transparent",
    color: on ? "var(--ink)" : "var(--muted)",
    border: on ? "none" : "1px solid var(--line)",
  };
}
const ROW_STYLE: React.CSSProperties = {
  width: "100%",
  marginTop: 9,
  display: "flex",
  alignItems: "center",
  gap: 9,
  border: "1px solid var(--line)",
  background: "var(--canvas)",
  padding: "13px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};

function Caret() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden="true">
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

export function EditorSheet({
  open,
  isEdit,
  draft,
  coaches,
  tipoOptions,
  horaOptions,
  duracionOptions,
  cupoOptions,
  esSerie = false,
  esPasada = false,
  reservasActuales = 0,
  cupoPlantilla = 0,
  cardDia,
  groupDias = [],
  pending = false,
  onPatch,
  onAddTipo,
  onSave,
  onDiscard,
  onCancelClass,
  onClose,
}: EditorSheetProps) {
  const [picker, setPicker] = React.useState<PickerKey>(null);

  // The one gate (puedeAmpliarAlcance, D5): everything else is its own scope, so the label, the
  // caption and the confirm all read from this single value.
  const ampliable = puedeAmpliarAlcance(isEdit, esSerie, cardDia);
  const alcance: EditorAlcance = ampliable ? draft.alcance : "clase";
  // `cardDia ?? 0` is inert here: alcanceCaption/cancelLabel/cancelConfirm only READ `dia` on the
  // "dia" branch, which `alcance` can only reach when `ampliable` is true (cardDia a number).
  const caption = alcanceCaption(alcance, esPasada, cardDia ?? 0);
  const aviso = cupoAviso(draft.cupo, reservasActuales, alcance, cupoPlantilla);

  const toggleCoach = (id: string) => {
    const next = draft.coachIds.includes(id) ? draft.coachIds.filter((c) => c !== id) : [...draft.coachIds, id];
    onPatch({ coachIds: next });
  };
  const toggleDay = (i: number) => {
    const next = draft.repeatDays.slice();
    next[i] = !next[i];
    onPatch({ repeatDays: next });
  };

  const fieldRow = (label: string, value: string, key: Exclude<PickerKey, null>) => (
    <div style={{ minWidth: 0 }}>
      <div className="uppercase" style={LABEL_STYLE}>
        {label}
      </div>
      <button type="button" onClick={() => setPicker(key)} style={ROW_STYLE}>
        <span className="tnum" style={{ flex: 1, textAlign: "left", color: "var(--fg)", fontSize: 15, fontWeight: 600 }}>
          {value}
        </span>
        <Caret />
      </button>
    </div>
  );

  return (
    <div
      className="forge-scroll absolute inset-0 flex flex-col overflow-hidden"
      style={{
        background: "var(--canvas)",
        transform: open ? "translateX(0%)" : "translateX(100%)",
        transition: "transform .42s cubic-bezier(.4,0,.2,1)",
        zIndex: 50,
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between" style={{ flex: "none", padding: "18px 16px 12px" }}>
        <span className="uppercase" style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.3, color: "var(--fg)", paddingLeft: 4 }}>
          {editorTitle(isEdit)}
        </span>
        <button type="button" disabled={pending} onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center" style={{ width: 34, height: 34, border: "1px solid var(--line)", background: "transparent", cursor: pending ? "default" : "pointer", opacity: pending ? 0.45 : 1 }}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      <div className="forge-scroll" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 22px" }}>
        {/* Tipo */}
        <div className="uppercase" style={LABEL_STYLE}>
          Tipo de clase
        </div>
        <button type="button" onClick={() => setPicker("tipo")} style={ROW_STYLE}>
          <span style={{ flex: 1, textAlign: "left", color: "var(--fg)", fontSize: 15, fontWeight: 600, letterSpacing: 0.3 }}>{draft.tipo}</span>
          <Caret />
        </button>

        {/* Hora / Duración */}
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {fieldRow("Hora", draft.hora, "hora")}
          {fieldRow("Duración", `${draft.duracionMin} min`, "duracion")}
        </div>

        {/* Cupo — a shrink below the current bookings warns, it never refuses. */}
        <div style={{ marginTop: 20 }}>
          {fieldRow("Cupo", `${draft.cupo} ${draft.cupo === 1 ? "persona" : "personas"}`, "cupo")}
          {aviso && <div style={{ ...NOTE_STYLE, color: "var(--yellow)" }}>{aviso}</div>}
        </div>

        {/* Coaches — catalog multi-select */}
        <div style={{ marginTop: 20 }}>
          <div className="uppercase" style={LABEL_STYLE}>
            Coaches
          </div>
          <div className="flex flex-wrap" style={{ marginTop: 9, gap: 6 }}>
            {coaches.map((c) => {
              const on = draft.coachIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCoach(c.id)}
                  aria-pressed={on}
                  className="uppercase"
                  style={{
                    padding: "9px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    background: on ? "var(--yellow)" : "transparent",
                    color: on ? "var(--ink)" : "var(--fg)",
                    border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {draft.coachIds.length === 0 && <div style={NOTE_STYLE}>Por asignar</div>}
        </div>

        {/* One toggle row, two jobs. Creating: the "Se repite" weekdays. Editing a
            generated class: the #243 scope, which governs BOTH the save path and the
            destructive one — so the sheet keeps three buttons, not five. Editing a
            one-off: neither, because neither control means anything there. */}
        {!isEdit && (
          <div style={{ marginTop: 20 }}>
            <div className="uppercase" style={LABEL_STYLE}>
              Se repite
            </div>
            <div className="flex" style={{ marginTop: 9, gap: 5 }}>
              {WEEKDAY_TOGGLES.map((lab, i) => (
                <button key={lab} type="button" onClick={() => toggleDay(i)} aria-pressed={draft.repeatDays[i]} className="uppercase" style={toggleStyle(draft.repeatDays[i])}>
                  {lab}
                </button>
              ))}
            </div>
          </div>
        )}
        {ampliable && cardDia !== undefined && (
          <div style={{ marginTop: 20 }}>
            <div className="uppercase" style={LABEL_STYLE}>
              Alcance del cambio
            </div>
            <div className="flex" style={{ marginTop: 9, gap: 5 }}>
              {alcanceToggles(cardDia, groupDias).map((opt) => (
                <button key={opt.value} type="button" onClick={() => onPatch({ alcance: opt.value })} aria-pressed={alcance === opt.value} className="uppercase" style={toggleStyle(alcance === opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={NOTE_STYLE}>{caption}</div>
          </div>
        )}

        {/* Evento especial — a property of ONE dated class, never of the rule
            (update_recurring_schedule has no such parameter), so the wide scope hides
            it rather than taking a toggle it would silently drop. */}
        {alcance === "clase" && (
          <>
            <div
              className="flex items-center justify-between"
              style={{ marginTop: 20, border: `1px solid ${draft.isSpecial ? "var(--yellow-edge)" : "var(--line)"}`, background: draft.isSpecial ? "var(--yellow-soft)" : "var(--canvas)", padding: 14 }}
            >
              <div className="flex items-center" style={{ gap: 9 }}>
                <SpecialStar size={15} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>Evento especial</span>
              </div>
              <button
                type="button"
                onClick={() => onPatch({ isSpecial: !draft.isSpecial })}
                aria-label="Evento especial"
                aria-pressed={draft.isSpecial}
                style={{ width: 42, height: 24, background: draft.isSpecial ? "var(--yellow)" : "var(--line)", border: "none", position: "relative", cursor: "pointer", padding: 0 }}
              >
                <span style={{ position: "absolute", top: 3, left: draft.isSpecial ? 21 : 3, width: 18, height: 18, background: "var(--fg)", transition: "left .2s ease" }} />
              </button>
            </div>
            {draft.isSpecial && (
              <input
                value={draft.specialName}
                onChange={(e) => onPatch({ specialName: e.target.value })}
                placeholder="Nombre del evento"
                style={{ width: "100%", marginTop: 8, background: "var(--canvas)", border: "1px solid var(--line)", color: "var(--fg)", fontFamily: "inherit", fontSize: 14, padding: 12, outline: "none" }}
              />
            )}
          </>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="uppercase"
          style={{ marginTop: 24, width: "100%", padding: 17, background: "var(--yellow)", color: "var(--ink)", border: "none", fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: 1.4, cursor: pending ? "default" : "pointer", opacity: pending ? 0.45 : 1 }}
        >
          {saveLabel(isEdit)}
        </button>
        {isEdit && onCancelClass && puedeCancelar(esPasada, alcance) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              // `cardDia ?? 0` is inert (D5): `alcance` can only be "dia"/"horario" — the
              // branches that read `dia` — when `cardDia` is a known number.
              const pregunta = cancelConfirm(alcance, cardDia ?? 0);
              if (pregunta && !window.confirm(pregunta)) return;
              onCancelClass();
            }}
            className="uppercase"
            style={{ marginTop: 10, width: "100%", padding: 14, background: "transparent", border: "1px solid color-mix(in srgb, var(--red) 35%, transparent)", color: "var(--red)", fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: pending ? "default" : "pointer", opacity: pending ? 0.45 : 1 }}
          >
            {cancelLabel(alcance, cardDia ?? 0)}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onDiscard}
          className="uppercase"
          style={{ marginTop: 10, width: "100%", padding: 13, background: "transparent", border: "none", color: "var(--muted)", fontFamily: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: pending ? "default" : "pointer", opacity: pending ? 0.45 : 1 }}
        >
          Descartar
        </button>
      </div>

      {/* Wheel picker for the active field */}
      <WheelPickerSheet
        open={picker === "tipo"}
        title="Tipo de clase"
        options={tipoOptions}
        value={draft.tipo}
        onChange={(v) => onPatch({ tipo: v })}
        onClose={() => setPicker(null)}
        onAdd={onAddTipo}
        addPlaceholder="Nombre del nuevo tipo"
      />
      <WheelPickerSheet
        open={picker === "hora"}
        title="Hora"
        options={horaOptions}
        value={draft.hora}
        onChange={(v) => onPatch({ hora: v })}
        onClose={() => setPicker(null)}
      />
      <WheelPickerSheet
        open={picker === "duracion"}
        title="Duración"
        options={duracionOptions}
        value={draft.duracionMin}
        format={(v) => `${v} min`}
        onChange={(v) => onPatch({ duracionMin: v })}
        onClose={() => setPicker(null)}
      />
      <WheelPickerSheet
        open={picker === "cupo"}
        title="Cupo"
        options={cupoOptions}
        value={draft.cupo}
        onChange={(v) => onPatch({ cupo: v })}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
