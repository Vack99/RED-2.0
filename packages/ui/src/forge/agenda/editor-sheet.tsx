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

/** How wide an edit writes (#243): this dated class alone, or the rule behind it. */
export type EditorAlcance = "clase" | "serie";

export const ALCANCE_TOGGLES: { value: EditorAlcance; label: string }[] = [
  { value: "clase", label: "Solo esta clase" },
  { value: "serie", label: "Esta y las siguientes" },
];

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
export function alcanceCaption(alcance: EditorAlcance, esPasada: boolean): string {
  if (alcance === "clase") return "Esta clase se separa del horario. Los cambios del horario ya no la alcanzan.";
  return esPasada
    ? "Cambia las clases futuras de este horario. Esta ya pasó y se queda como está. Las reservas se mueven con la clase."
    : "Cambia las clases futuras de este horario. Las pasadas no se tocan. Las reservas se mueven con la clase.";
}

/** The one destructive button's label — it follows the scope toggle (#243). */
export function cancelLabel(alcance: EditorAlcance): string {
  return alcance === "serie" ? "Terminar el horario" : "Cancelar esta clase";
}

/**
 * The confirm the wide arm must clear, or `null` to fire straight through. Only the
 * series arm is gated: cancelling one class is one class, while "Terminar el horario"
 * cancels every future class of the schedule and hands back every held class.
 */
export function cancelConfirm(alcance: EditorAlcance): string | null {
  return alcance === "serie"
    ? "Se cancelarán todas las clases futuras de este horario y se devolverán las clases reservadas. No se puede deshacer."
    : null;
}

/**
 * Cupo shrunk below what is already booked: WARN, never refuse (#243 §7). Refusing
 * would trap an operator whose one booking is six weeks out; `reservar_clase` already
 * blocks NEW bookings and the quick-glance already reads "Clase llena · sin lugares".
 * `null` renders nothing.
 *
 * The two arms trigger on DIFFERENT facts, because they are warning about different things.
 * Narrow: `reservas` is this class's own bookings, and the number is the point. Wide: `reservas`
 * is still only the CLICKED class's — so triggering on it would stay silent while shrinking a
 * lightly-booked card whose next-week twin is over capacity, and would quote a count that never
 * held for the series. The wide arm therefore fires on the shrink itself (`cupo` below the rule's
 * current `cupoSerie`) and drops the number, promising only what it can know: where the new cupo
 * lands, and that no existing booking is dropped.
 */
export function cupoAviso(cupo: number, reservas: number, alcance: EditorAlcance, cupoSerie: number): string | null {
  if (alcance === "serie") {
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
  pending = false,
  onPatch,
  onAddTipo,
  onSave,
  onDiscard,
  onCancelClass,
  onClose,
}: EditorSheetProps) {
  const [picker, setPicker] = React.useState<PickerKey>(null);

  // The scope exists only for a generated class being edited; everything else is its
  // own scope, so the label, the caption and the confirm all read from this one value.
  const alcance: EditorAlcance = isEdit && esSerie ? draft.alcance : "clase";
  const caption = alcanceCaption(alcance, esPasada);
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
        {isEdit && esSerie && (
          <div style={{ marginTop: 20 }}>
            <div className="uppercase" style={LABEL_STYLE}>
              Alcance del cambio
            </div>
            <div className="flex" style={{ marginTop: 9, gap: 5 }}>
              {ALCANCE_TOGGLES.map((opt) => (
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
        {isEdit && onCancelClass && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const pregunta = cancelConfirm(alcance);
              if (pregunta && !window.confirm(pregunta)) return;
              onCancelClass();
            }}
            className="uppercase"
            style={{ marginTop: 10, width: "100%", padding: 14, background: "transparent", border: "1px solid color-mix(in srgb, var(--red) 35%, transparent)", color: "var(--red)", fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: pending ? "default" : "pointer", opacity: pending ? 0.45 : 1 }}
          >
            {cancelLabel(alcance)}
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
