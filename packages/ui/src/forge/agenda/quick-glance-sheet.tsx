"use client";

import * as React from "react";

import { Sheet } from "../sheet";
import { type EstadoSesion, countLabel, occupancyPct } from "./session-view";
import { SessionRoster, type CandidateRow, type RosterRow } from "./session-roster";
import { SpecialStar } from "./special-star";

/**
 * The quick-glance bottom sheet a session card opens: hora + tipo, the coaches ·
 * duración meta line, the cupo count with an occupancy bar + availability line,
 * an edit pencil, and (slice #60) the reservation-aware roster — booked members with
 * a Pasar lista present-toggle + a walk-in "Agregar" picker. The roster block renders
 * only when `roster` props are supplied. Built on the shared `Sheet`; token-only.
 *
 * The sheet reads "greener" than the card: a healthy class shows a green
 * availability line + bar where the card's bar is neutral, so it owns its own
 * estado→copy + estado→colour mapping.
 */

/** The availability line copy for a session's estado + free-seat count. */
export function disponibilidadLine(estado: EstadoSesion, free: number): string {
  if (estado === "termino") return "La clase terminó";
  if (free <= 0) return "Clase llena · sin lugares";
  if (free <= 3) return `Solo ${free} ${free === 1 ? "lugar libre" : "lugares libres"}`;
  return `${free} lugares libres`;
}

/** The availability line + bar colour — green when there is room (unlike the card). */
export function disponibilidadColor(estado: EstadoSesion): string {
  switch (estado) {
    case "casi_lleno":
      return "var(--yellow)";
    case "lleno":
      return "var(--red)";
    case "termino":
      return "var(--muted-soft)";
    default:
      return "var(--green)";
  }
}

/** Stable empty set so the roster's `busy` prop never changes identity when absent. */
const EMPTY_BUSY: Set<string> = new Set();

export interface QuickGlanceSheetProps {
  open: boolean;
  onClose: () => void;
  time: string;
  tipo: string;
  coaches: string;
  mins: number;
  booked: number;
  cap: number;
  estado: EstadoSesion;
  isSpecial?: boolean;
  specialName?: string | null;
  onEdit: () => void;
  /** Slice #60 roster. When supplied, the sheet renders the Pasar lista block. */
  roster?: RosterRow[];
  candidates?: CandidateRow[];
  rosterLoading?: boolean;
  rosterBusy?: Set<string>;
  onTogglePresent?: (clienteId: string) => void;
  onAddWalkIn?: (clienteId: string) => void;
}

export function QuickGlanceSheet({
  open,
  onClose,
  time,
  tipo,
  coaches,
  mins,
  booked,
  cap,
  estado,
  isSpecial = false,
  specialName = null,
  onEdit,
  roster,
  candidates = [],
  rosterLoading = false,
  rosterBusy,
  onTogglePresent,
  onAddWalkIn,
}: QuickGlanceSheetProps) {
  const col = disponibilidadColor(estado);
  const free = Math.max(0, cap - booked);

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 24px 4px" }}>
        <div className="flex items-start justify-between" style={{ gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            {isSpecial && (
              <div className="flex items-center" style={{ gap: 6, marginBottom: 9 }}>
                <SpecialStar size={13} />
                <span className="uppercase" style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, color: "var(--yellow)" }}>
                  {specialName?.trim() || "Especial"}
                </span>
              </div>
            )}
            <div className="flex items-baseline" style={{ gap: 12 }}>
              <span className="tnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: "var(--yellow)" }}>
                {time}
              </span>
              <span className="uppercase" style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5, color: "var(--fg)" }}>
                {tipo}
              </span>
            </div>
            <div className="uppercase" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, letterSpacing: 0.4 }}>
              {coaches} · {mins} min
            </div>
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Editar"
            data-autofocus
            className="flex items-center justify-center"
            style={{ flex: "none", width: 34, height: 34, background: "transparent", border: "1px solid var(--line)", cursor: "pointer" }}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--silver)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 14l9-9 3 3-9 9H3v-3z" />
              <path d="M11 3l3 3" />
            </svg>
          </button>
        </div>

        <div className="flex items-baseline justify-between" style={{ marginTop: 22 }}>
          <span className="uppercase" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.6, color: "var(--muted)" }}>
            Cupo
          </span>
          <span className="tnum" style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2, color: "var(--fg)" }}>
            {countLabel(booked, cap)}
          </span>
        </div>
        <div style={{ height: 7, background: "var(--sunk)", marginTop: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${occupancyPct(booked, cap)}%`, background: col, transition: "width .4s ease" }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3, color: col }}>{disponibilidadLine(estado, free)}</div>

        {roster !== undefined && onTogglePresent && onAddWalkIn && (
          <SessionRoster
            rows={roster}
            candidates={candidates}
            loading={rosterLoading}
            busy={rosterBusy ?? EMPTY_BUSY}
            onToggle={onTogglePresent}
            onAddWalkIn={onAddWalkIn}
          />
        )}
      </div>
    </Sheet>
  );
}
