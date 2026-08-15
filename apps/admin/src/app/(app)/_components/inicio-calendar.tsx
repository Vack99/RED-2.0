"use client";

import * as React from "react";
import { Icon } from "@gym/ui/forge/icon";
import { Tnum } from "@gym/ui/forge/ui";
import { DOW, fmtFull, isoDay, MON, sameDay } from "@gym/format";

/** The backdate month calendar — the asistencia PaseCalendar pattern, minus the presence
 *  dots, plus a lower `min` bound. Both future days (> hoy) and days before the alta/30-day
 *  floor (< min) are disabled and unselectable; the RPC re-checks all of it (the real gate).
 *
 *  Lifted out of vender.tsx when the correction sheet's FECHA field became the SECOND surface
 *  that picks a sold date (same lift as MetodoEditor) — one calendar, one set of bounds
 *  semantics, so the two pickers can never drift apart. */
export function InicioCalendar({
  hoy,
  min,
  sel,
  onPick,
}: {
  hoy: Date;
  min: Date;
  sel: Date;
  onPick: (d: Date) => void;
}) {
  const [view, setView] = React.useState({ y: sel.getFullYear(), m: sel.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const lead = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const atCurrentMonth = view.y === hoy.getFullYear() && view.m === hoy.getMonth();
  // The previous month has a selectable day iff its last day is still ≥ the floor.
  const prevMonthLast = new Date(view.y, view.m, 0);
  const atFloorMonth = prevMonthLast < min;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));

  const stepMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    setView({ y: next.getFullYear(), m: next.getMonth() });
  };

  return (
    <div style={{ padding: "8px 18px 18px" }}>
      {/* month nav */}
      <div className="flex items-center justify-between" style={{ padding: "6px 2px 14px" }}>
        <button
          onClick={() => stepMonth(-1)}
          disabled={atFloorMonth}
          aria-label="Mes anterior"
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, cursor: atFloorMonth ? "not-allowed" : "pointer", opacity: atFloorMonth ? 0.35 : 1 }}
        >
          <Icon name="back" size={16} color="var(--fg)" />
        </button>
        <div className="uppercase font-extrabold" style={{ fontSize: 15, letterSpacing: 1 }}>
          {MON[view.m]} {view.y}
        </div>
        <button
          onClick={() => stepMonth(1)}
          disabled={atCurrentMonth}
          aria-label="Mes siguiente"
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, cursor: atCurrentMonth ? "not-allowed" : "pointer", opacity: atCurrentMonth ? 0.35 : 1 }}
        >
          <Icon name="chev" size={16} color="var(--fg)" />
        </button>
      </div>

      {/* weekday header */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DOW.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5 }}>{d}</div>
        ))}
      </div>

      {/* days */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const disabled = d > hoy || d < min;
          const isSel = sameDay(d, sel);
          const isToday = sameDay(d, hoy);
          return (
            <button
              key={isoDay(d)}
              onClick={() => !disabled && onPick(d)}
              disabled={disabled}
              className="relative flex aspect-square items-center justify-center"
              style={{
                background: isSel ? "var(--yellow)" : "transparent",
                border: `1px solid ${isSel ? "var(--yellow)" : isToday ? "var(--yellow-edge)" : "var(--line)"}`,
                color: isSel ? "var(--ink)" : disabled ? "var(--muted-soft)" : "var(--fg)",
                cursor: disabled ? "default" : "pointer",
                transition: "background-color 150ms cubic-bezier(.32,.72,0,1), border-color 150ms cubic-bezier(.32,.72,0,1)",
              }}
            >
              <Tnum style={{ fontSize: 14, fontWeight: 700 }}>{d.getDate()}</Tnum>
            </button>
          );
        })}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <div className="uppercase" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>{fmtFull(sel)}</div>
        <button
          onClick={() => onPick(hoy)}
          className="forge-pressable uppercase font-extrabold"
          style={{ padding: "10px 16px", background: "var(--yellow)", color: "var(--ink)", fontSize: 12, letterSpacing: 1, cursor: "pointer" }}
        >
          HOY
        </button>
      </div>
    </div>
  );
}
