"use client";

import * as React from "react";

import { SpecialStar } from "./special-star";
import { WheelPickerSheet } from "./wheel-picker";

/**
 * The session editor: a right-sliding full panel over the agenda. Field rows open
 * the wheel picker (tipo, hora, duración, cupo), a coach multi-select over the
 * catalog, a "Se repite" weekday toggle row (L M Mi J V S), and an "Evento
 * especial" switch that reveals a name input. Primary save + discard, plus a
 * destructive "Cancelar esta clase" when editing. Token-only.
 *
 * The mock's free-text coach field is deliberately replaced by a multi-select
 * over the `coach` catalog (PRD (e), invariant §5.4): no coach chosen renders
 * "Por asignar" (display only). The tipo picker's `+` mints a real `class_type`.
 */

export const WEEKDAY_TOGGLES = ["L", "M", "Mi", "J", "V", "S"] as const;

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
  repeatDays: boolean[];
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
  onPatch: (patch: Partial<EditorDraft>) => void;
  onAddTipo?: (name: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onCancelClass?: () => void;
  onClose: () => void;
}

type PickerKey = "tipo" | "hora" | "duracion" | "cupo" | null;

const LABEL_STYLE: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: 1.6, color: "var(--muted)" };
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
  onPatch,
  onAddTipo,
  onSave,
  onDiscard,
  onCancelClass,
  onClose,
}: EditorSheetProps) {
  const [picker, setPicker] = React.useState<PickerKey>(null);

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
        <button type="button" onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center" style={{ width: 34, height: 34, border: "1px solid var(--line)", background: "transparent", cursor: "pointer" }}>
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

        {/* Cupo */}
        <div style={{ marginTop: 20 }}>{fieldRow("Cupo", `${draft.cupo} ${draft.cupo === 1 ? "persona" : "personas"}`, "cupo")}</div>

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
          {draft.coachIds.length === 0 && <div style={{ marginTop: 8, fontSize: 11.5, letterSpacing: 0.3, color: "var(--muted)" }}>Por asignar</div>}
        </div>

        {/* Se repite */}
        <div style={{ marginTop: 20 }}>
          <div className="uppercase" style={LABEL_STYLE}>
            Se repite
          </div>
          <div className="flex" style={{ marginTop: 9, gap: 5 }}>
            {WEEKDAY_TOGGLES.map((lab, i) => {
              const on = draft.repeatDays[i];
              return (
                <button
                  key={lab}
                  type="button"
                  onClick={() => toggleDay(i)}
                  aria-pressed={on}
                  className="uppercase"
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "11px 0",
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    background: on ? "var(--yellow)" : "transparent",
                    color: on ? "var(--ink)" : "var(--muted)",
                    border: on ? "none" : "1px solid var(--line)",
                  }}
                >
                  {lab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Evento especial */}
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

        <button
          type="button"
          onClick={onSave}
          className="uppercase"
          style={{ marginTop: 24, width: "100%", padding: 17, background: "var(--yellow)", color: "var(--ink)", border: "none", fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: 1.4, cursor: "pointer" }}
        >
          {saveLabel(isEdit)}
        </button>
        {isEdit && onCancelClass && (
          <button
            type="button"
            onClick={onCancelClass}
            className="uppercase"
            style={{ marginTop: 10, width: "100%", padding: 14, background: "transparent", border: "1px solid color-mix(in srgb, var(--red) 35%, transparent)", color: "var(--red)", fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer" }}
          >
            Cancelar esta clase
          </button>
        )}
        <button
          type="button"
          onClick={onDiscard}
          className="uppercase"
          style={{ marginTop: 10, width: "100%", padding: 13, background: "transparent", border: "none", color: "var(--muted)", fontFamily: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}
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
