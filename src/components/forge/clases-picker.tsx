"use client";

import * as React from "react";

import { nombrePaquete } from "@/domain/rules";

/**
 * Mobile-first vertical scroll-snap picker for a package's class grant.
 *
 * The value is the real grant the DB stores: an integer 1..30, or `null` =
 * Ilimitado (∞), which is the LAST stop. The display nombre is DERIVED from this
 * in-DB ("{n} clases" / "1 clase" / "Ilimitado"), so this control is the single
 * source of truth the editor edits — there is no free-text name to drift from it.
 *
 * ── How it works ──
 * A fixed-height column scrolls with `scroll-snap-type: y mandatory`; each option
 * is a snap point centered in a selection window framed by a 1px gold/line rule.
 * Top/bottom spacers (half the visible height minus half a row) let the first and
 * last items center. On mount we seed the scroll position to `value` with no
 * animation. On scroll-settle (debounced scroll end) we read which row sits at
 * the window center and emit it via `onChange` — so a stray mid-scroll frame
 * never fires a value, only the resting snap does.
 */

export const ROW_H = 44; // px per option row (snap pitch)
const VISIBLE = 5; // odd, so one row is dead-center
const COL_H = ROW_H * VISIBLE; // column viewport height
const PAD = (COL_H - ROW_H) / 2; // spacer so first/last item can center

// Stable DOM id per row, so aria-activedescendant can point the listbox at the
// centered option (screen readers announce it). Index === scroll row.
const optionId = (i: number) => `clases-opt-${i}`;

// 1..30 then `null` (Ilimitado) as the final stop. Index === scroll row.
// Exported (with the helpers below) so the pure index↔row logic is unit-tested
// without simulating the DOM/scroll.
export const OPTIONS: (number | null)[] = [...Array.from({ length: 30 }, (_, i) => i + 1), null];

/** The scroll row (index) that displays `value`. null = the last (Ilimitado)
 *  stop; 1..30 map to index value-1; anything else clamps to a valid row. */
export function indexOf(value: number | null): number {
  if (value === null) return OPTIONS.length - 1;
  // value is 1..30 → index value-1; clamp defensively to a valid row.
  return Math.min(Math.max(value - 1, 0), OPTIONS.length - 1);
}

/** The nearest row to the window center for a given scrollTop, rounded to the
 *  snap pitch (ROW_H) and clamped to a valid row. */
export function rowAt(scrollTop: number): number {
  return Math.min(Math.max(Math.round(scrollTop / ROW_H), 0), OPTIONS.length - 1);
}

export function ClasesPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  // The row currently centered in the window (drives the active styling live as
  // you scroll, before the snap settles and onChange fires).
  const [active, setActive] = React.useState<number>(() => indexOf(value));

  // Set true while we programmatically seed scrollTop on mount, so the onScroll
  // that the seed triggers is swallowed by the settle (no unsolicited onChange).
  // The settle clears it; thereafter every settle is user-driven.
  const seedingRef = React.useRef(false);

  // Seed the scroll position to the current value on mount — no animation, so the
  // editor opens already showing the package's grant centered. Runs once.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = indexOf(value) * ROW_H;
    // Only arm the swallow when the seed actually MOVES the column — if the
    // target already equals scrollTop (e.g. row 0), no onScroll fires and a
    // stuck flag would otherwise eat the first real user settle.
    if (el.scrollTop !== target) {
      seedingRef.current = true;
      el.scrollTop = target;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only seed; value changes after are user-driven scrolls, not external resets
  }, []);

  // Debounced scroll-settle: keep `active` live for styling, and once the scroll
  // stops (50ms quiet) emit the centered option. Emitting only on settle means a
  // mid-fling frame never reports a value — only the resting snap does.
  const settleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setActive(rowAt(el.scrollTop));
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const row = rowAt(el.scrollTop);
      setActive(row);
      // Swallow the settle caused by the mount seed: this control advertises
      // that it emits only on a resting user snap, never on an external reset.
      if (seedingRef.current) {
        seedingRef.current = false;
        return;
      }
      // Only emit a genuine change — a settle back onto the current value (e.g.
      // a tiny nudge that snaps home) must not fire a redundant onChange.
      if (OPTIONS[row] !== value) onChange(OPTIONS[row]);
    }, 50);
  };

  React.useEffect(() => {
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  // Tapping a row (or arrow-keying) scrolls it to center; the snap + settle then
  // emit it. Keeps the column the single mechanism that reports a value.
  const scrollToRow = (row: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: row * ROW_H, behavior: "smooth" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      scrollToRow(Math.min(active + 1, OPTIONS.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      scrollToRow(Math.max(active - 1, 0));
    }
  };

  return (
    <div
      className="relative border border-line bg-surface"
      style={{ overflow: "hidden" }}
    >
      {/* Centered selection window — 1px gold/line rule top + bottom. Non-interactive
          overlay so it never eats scroll/taps; gold tint signals the active band. */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10"
        style={{
          top: PAD,
          height: ROW_H,
          borderTop: "1px solid var(--gold)",
          borderBottom: "1px solid var(--gold)",
          background: "var(--yellow-soft)",
        }}
      />
      {/* Top/bottom fade so the column dissolves into the surface at its edges. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{
          height: PAD,
          background: "linear-gradient(var(--surface), color-mix(in srgb, var(--surface) 10%, transparent))",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          height: PAD,
          background: "linear-gradient(color-mix(in srgb, var(--surface) 10%, transparent), var(--surface))",
        }}
      />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="listbox"
        aria-label="Cantidad de clases"
        aria-activedescendant={optionId(active)}
        className="forge-scroll outline-none"
        style={{
          height: COL_H,
          overflowY: "auto",
          scrollSnapType: "y mandatory",
        }}
      >
        <div style={{ height: PAD }} aria-hidden="true" />
        {OPTIONS.map((opt, i) => {
          const dist = Math.abs(i - active);
          const isActive = dist === 0;
          const ilimitado = opt === null;
          return (
            <button
              key={opt === null ? "ilimitado" : opt}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => scrollToRow(i)}
              className="flex w-full items-center justify-center"
              style={{
                height: ROW_H,
                scrollSnapAlign: "center",
                gap: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                // Active row reads bold gold; neighbors fade + shrink with distance.
                color: isActive ? "var(--fg)" : dist === 1 ? "var(--muted)" : "var(--muted-soft)",
                fontWeight: isActive ? 800 : 600,
                fontSize: isActive ? 19 : 16,
                letterSpacing: isActive ? -0.3 : 0,
                transform: `scale(${isActive ? 1 : dist === 1 ? 0.92 : 0.84})`,
                opacity: dist >= 3 ? 0.5 : 1,
                transition: "color 120ms, transform 120ms, font-size 120ms, opacity 120ms",
              }}
            >
              {ilimitado ? (
                <>
                  <span style={{ fontSize: isActive ? 22 : 18, lineHeight: 1 }}>∞</span>
                  <span className="tnum">Ilimitado</span>
                </>
              ) : (
                // DRY the numeric label through the domain rule, the single home
                // for "{n} clases" / "1 clase" (components may import domain).
                <span className="tnum">{nombrePaquete(opt)}</span>
              )}
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{ width: 5, height: 5, borderRadius: 999, background: "var(--gold)" }}
                />
              )}
            </button>
          );
        })}
        <div style={{ height: PAD }} aria-hidden="true" />
      </div>
    </div>
  );
}
