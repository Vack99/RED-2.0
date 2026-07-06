import * as React from "react";

import { type EstadoSesion, countLabel, estadoVisual } from "./session-view";
import { SpecialStar } from "./special-star";

/**
 * A week-view day group: a header (date number, weekday, "N clases · X%"
 * summary) over a list of tappable class rows (hora · status dot · tipo ★ ·
 * count), or a "Sin clases" line for an empty day. The SEMANA view is a
 * day-grouped agenda, never a time grid (PRD (f)). Token-only.
 */

/** "6 clases · 82%" — pluralized; percent dropped when unknown; empty for no classes. */
export function daySummaryLabel(count: number, pct: number | null): string {
  if (count === 0) return "";
  const clases = `${count} ${count === 1 ? "clase" : "clases"}`;
  return pct === null ? clases : `${clases} · ${pct}%`;
}

/** "Semana · 78% ocupación" — the week footer. */
export function weekSummaryLabel(pct: number): string {
  return `Semana · ${pct}% ocupación`;
}

export interface WeekRow {
  time: string;
  tipo: string;
  booked: number;
  cap: number;
  estado: EstadoSesion;
  isSpecial?: boolean;
  onClick?: () => void;
}

export interface WeekGroupProps {
  dnum: string;
  wd: string;
  /** Whether this is the selected day (accent header). */
  selected?: boolean;
  /** Day occupancy percent, or null when there are no classes. */
  occupancyPct?: number | null;
  rows: WeekRow[];
}

export function WeekGroup({ dnum, wd, selected = false, occupancyPct = null, rows }: WeekGroupProps) {
  const headCol = selected ? "var(--yellow)" : "var(--fg)";
  const wdCol = selected ? "var(--yellow)" : "var(--muted)";

  return (
    <div style={{ paddingTop: 18 }}>
      <div className="flex items-baseline" style={{ gap: 9, marginBottom: 6 }}>
        <span className="tnum" style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1, color: headCol }}>
          {dnum}
        </span>
        <span className="uppercase" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.6, color: wdCol }}>
          {wd}
        </span>
        <span style={{ flex: 1 }} />
        <span className="tnum" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, color: "var(--muted-soft)" }}>
          {daySummaryLabel(rows.length, occupancyPct)}
        </span>
      </div>

      {rows.map((r, i) => {
        const v = estadoVisual(r.estado);
        return (
          <button
            key={i}
            type="button"
            onClick={r.onClick}
            className="flex w-full items-center text-left"
            style={{
              gap: 13,
              padding: "12px 2px",
              background: "transparent",
              border: "none",
              borderTop: "1px solid var(--line-soft)",
              cursor: "pointer",
              opacity: v.dimmed ? 0.5 : 1,
            }}
          >
            <span className="tnum" style={{ flex: "none", width: 42, fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, color: "var(--fg)" }}>
              {r.time}
            </span>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: v.dotToken, flex: "none" }} />
            <span className="flex items-center" style={{ flex: 1, minWidth: 0, gap: 6 }}>
              {r.isSpecial && <SpecialStar size={11} />}
              <span
                className="uppercase"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  color: v.dimmed ? "var(--muted)" : "var(--fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.tipo}
              </span>
            </span>
            <span className="tnum" style={{ flex: "none", fontSize: 12, fontWeight: 700, letterSpacing: -0.2, color: v.dimmed ? "var(--muted-soft)" : "var(--muted)" }}>
              {countLabel(r.booked, r.cap)}
            </span>
          </button>
        );
      })}

      {rows.length === 0 && (
        <div style={{ padding: "6px 2px 2px", fontSize: 11, letterSpacing: 0.3, color: "var(--muted-soft)" }}>Sin clases</div>
      )}
    </div>
  );
}
