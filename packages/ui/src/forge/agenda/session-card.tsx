import * as React from "react";

import { type EstadoSesion, countLabel, estadoVisual, occupancyPct } from "./session-view";
import { SpecialStar } from "./special-star";

/**
 * A day-view session card (`class_session`): accent rail for the next-upcoming or
 * evento-especial session, an optional top tag ("A continuación" / ★ special
 * name), the hora + duración column, tipo + coaches, the reserved-of-capacity
 * count with a status badge, and a 2px occupancy bar. A terminated session dims.
 *
 * Presentational: the caller passes an already-derived `estado` + `isNext` /
 * `isSpecial` accents (S4/S7 own the math). Colours are brand-contract tokens —
 * the same card renders forge-gold or red purely from the resolved marca.
 */

/** The rail (and its accent) lights for the next-upcoming OR a special session. */
export function railAccent({ isNext, isSpecial }: { isNext: boolean; isSpecial: boolean }): boolean {
  return isNext || isSpecial;
}

/**
 * The top tag: "A continuación" wins for the next session; otherwise a special
 * session shows its name (an unnamed special reads "Especial"); ordinary sessions
 * have no tag.
 */
export function topTag({
  isNext,
  isSpecial,
  specialName,
}: {
  isNext: boolean;
  isSpecial: boolean;
  specialName?: string | null;
}): string | null {
  if (isNext) return "A continuación";
  if (isSpecial) return specialName?.trim() || "Especial";
  return null;
}

export interface SessionCardProps {
  time: string;
  mins: number;
  tipo: string;
  coaches: string;
  booked: number;
  cap: number;
  estado: EstadoSesion;
  isNext?: boolean;
  isSpecial?: boolean;
  specialName?: string | null;
  onClick?: () => void;
}

export function SessionCard({
  time,
  mins,
  tipo,
  coaches,
  booked,
  cap,
  estado,
  isNext = false,
  isSpecial = false,
  specialName = null,
  onClick,
}: SessionCardProps) {
  const v = estadoVisual(estado);
  const accented = railAccent({ isNext, isSpecial });
  const tag = topTag({ isNext, isSpecial, specialName });
  const countCol = v.dimmed ? "var(--muted-soft)" : "var(--fg)";
  const pct = occupancyPct(booked, cap);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-stretch overflow-hidden border text-left transition-colors"
      style={{
        background: isNext ? "var(--yellow-soft)" : "var(--surface)",
        borderColor: isNext ? "var(--yellow-edge)" : "var(--line)",
        padding: 0,
        opacity: v.dimmed ? 0.5 : 1,
        cursor: "pointer",
        position: "relative",
      }}
    >
      <span style={{ width: 2, flex: "none", background: accented ? "var(--yellow)" : "transparent" }} />
      <span style={{ flex: 1, padding: "14px 16px 13px", minWidth: 0 }}>
        {tag && (
          <span className="flex items-center" style={{ gap: 5, marginBottom: 9 }}>
            {isSpecial && !isNext && <SpecialStar size={10} />}
            <span
              className="uppercase"
              style={{
                fontSize: 8.5,
                fontWeight: 800,
                letterSpacing: 1.4,
                color: "var(--yellow)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tag}
            </span>
          </span>
        )}
        <span className="flex items-center" style={{ gap: 14, minWidth: 0 }}>
          <span style={{ flex: "none", width: 52 }}>
            <span className="tnum" style={{ display: "block", fontSize: 22, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1, color: countCol }}>
              {time}
            </span>
            <span style={{ display: "block", fontSize: 10, fontWeight: 500, letterSpacing: 0.3, color: "var(--muted)", marginTop: 6 }}>
              {mins} min
            </span>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              className="uppercase"
              style={{
                display: "block",
                fontSize: 13.5,
                fontWeight: 600,
                letterSpacing: 0.6,
                color: v.dimmed ? "var(--muted)" : "var(--fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tipo}
            </span>
            <span
              style={{
                display: "block",
                fontSize: 11,
                letterSpacing: 0.3,
                color: "var(--muted)",
                marginTop: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {coaches}
            </span>
          </span>
          <span style={{ flex: "none", textAlign: "right", minWidth: 46 }}>
            <span className="tnum" style={{ display: "block", fontSize: 14, fontWeight: 700, letterSpacing: -0.2, color: countCol }}>
              {countLabel(booked, cap)}
            </span>
            {v.statusLabel && (
              <span className="uppercase" style={{ display: "block", fontSize: 8.5, fontWeight: 700, letterSpacing: 0.7, color: v.statusToken, marginTop: 6 }}>
                {v.statusLabel}
              </span>
            )}
          </span>
        </span>
        <span style={{ display: "block", height: 2, background: "var(--sunk)", marginTop: 13, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${pct}%`, background: v.barToken, transition: "width .3s ease" }} />
        </span>
      </span>
    </button>
  );
}
