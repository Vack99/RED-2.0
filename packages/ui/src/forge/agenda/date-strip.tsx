"use client";

import * as React from "react";

/**
 * The swipeable Lun–Sáb date strip: six day buttons flanked by ‹ › arrows.
 * A pointer drag translates the strip live once it clears a small horizontal
 * intent threshold, and commits a day step (onPrev/onNext) past a larger one;
 * short of that it springs back. Arrows step directly. Token-only.
 *
 * Thresholds are the mock's, not the app-shell ficha swipe (different job):
 * a light 6px intent so the strip feels responsive, a 48px commit, and a ±70px
 * clamp so the strip never runs off. The spring-back is a CSS transition
 * (neutralized by the reduced-motion block in motion.css); the live drag is
 * direct manipulation.
 */

const INTENT_PX = 6;
const COMMIT_PX = 48;
const CLAMP_PX = 70;

/** A drag reads as horizontal once it clears the intent threshold and beats vertical. */
export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) >= INTENT_PX && Math.abs(dx) > Math.abs(dy);
}

/** A released drag commits a day step past the commit threshold. */
export function swipeCommits(dx: number): boolean {
  return Math.abs(dx) > COMMIT_PX;
}

/** The live translate, clamped to the rail so the strip never runs away. */
export function clampDrag(dx: number): number {
  return Math.max(-CLAMP_PX, Math.min(CLAMP_PX, dx));
}

export interface DateStripDay {
  wd: string;
  dnum: string;
}

export interface DateStripProps {
  days: DateStripDay[];
  selectedIndex: number;
  /** Index of "today" within the strip, for the faint today dot; -1 for none. */
  todayIndex?: number;
  onSelect: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function DateStrip({ days, selectedIndex, todayIndex = -1, onSelect, onPrev, onNext }: DateStripProps) {
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const moved = React.useRef(false);
  const suppressClick = React.useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!isHorizontalSwipe(dx, dy)) return;
    moved.current = true;
    const el = stripRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translateX(${clampDrag(dx)}px)`;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    start.current = null;
    const el = stripRef.current;
    if (el) {
      el.style.transition = "transform .25s ease";
      el.style.transform = "translateX(0)";
    }
    if (moved.current && swipeCommits(dx)) {
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 400);
      if (dx < 0) onNext();
      else onPrev();
    }
  };

  const arrow = (dir: "prev" | "next", label: string, d: string) => (
    <button
      type="button"
      onClick={dir === "prev" ? onPrev : onNext}
      aria-label={label}
      className="flex items-center justify-center"
      style={{ width: 22, height: 50, flex: "none", background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 0.65 }}
    >
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--silver)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="flex items-center"
      style={{ gap: 0, padding: "8px 6px 6px", overflow: "hidden", touchAction: "pan-y" }}
    >
      {arrow("prev", "Anterior", "M12 4l-6 6 6 6")}
      <div ref={stripRef} className="flex" style={{ flex: 1, minWidth: 0, gap: 4, willChange: "transform" }}>
        {days.map((d, i) => {
          const sel = i === selectedIndex;
          const today = i === todayIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (suppressClick.current) return;
                onSelect(i);
              }}
              className="flex flex-col items-center"
              style={{ flex: 1, gap: 7, padding: "4px 0", background: "transparent", border: "none", cursor: "pointer" }}
              aria-pressed={sel}
            >
              <span className="uppercase transition-colors" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: sel ? "var(--yellow)" : today ? "var(--silver)" : "var(--muted)" }}>
                {d.wd}
              </span>
              <span className="tnum transition-colors" style={{ fontSize: 23, fontWeight: 700, lineHeight: 0.9, letterSpacing: -1, color: sel ? "var(--yellow)" : "var(--fg)" }}>
                {d.dnum}
              </span>
              <span style={{ width: 18, height: 3, borderRadius: 2, background: "var(--yellow)", opacity: sel ? 1 : today ? 0.4 : 0, transition: "opacity .25s ease" }} />
            </button>
          );
        })}
      </div>
      {arrow("next", "Siguiente", "M8 4l6 6-6 6")}
    </div>
  );
}
