"use client";

import * as React from "react";

import { scrollBehavior } from "../../motion";

/**
 * A bottom-sheet wheel picker — the clases-picker scroll-snap pattern generalized
 * to any option list and wrapped in the mock's editor sheet chrome: a 40px-item /
 * 200px-viewport column with a centered highlight band and top/bottom fades, a
 * title, a `Listo` confirm, and an optional `+` add-new flow (the tipo picker
 * mints a real `class_type`). Snap-on-scroll-end, tap-to-scroll. Token-only.
 *
 * The value is emitted only on a resting snap (a debounced settle), so a mid-fling
 * frame never reports one. Tap-to-scroll honours prefers-reduced-motion via the
 * shared `scrollBehavior()` guard; the sheet's slide is CSS (neutralized by the
 * reduced-motion block in motion.css).
 */

export const WHEEL_ITEM_H = 40; // px per option row (snap pitch)
const VIEWPORT = 200; // column viewport height
const PAD = (VIEWPORT - WHEEL_ITEM_H) / 2; // spacer so first/last item can center

/** The nearest row to the window center for a scrollTop, rounded to the pitch and clamped. */
export function wheelRowAt(scrollTop: number, len: number): number {
  return Math.min(Math.max(Math.round(scrollTop / WHEEL_ITEM_H), 0), Math.max(len - 1, 0));
}

/** The row displaying `value`; an absent value falls back to the first row. */
export function wheelIndexOf<T>(options: readonly T[], value: T): number {
  const i = options.indexOf(value);
  return i < 0 ? 0 : i;
}

export interface WheelPickerSheetProps<T> {
  open: boolean;
  title: string;
  options: readonly T[];
  value: T;
  format?: (v: T) => string;
  onChange: (v: T) => void;
  onClose: () => void;
  /** Enables the `+` add-new flow (the tipo picker). Receives the trimmed name. */
  onAdd?: (name: string) => void;
  addPlaceholder?: string;
}

export function WheelPickerSheet<T>({
  open,
  title,
  options,
  value,
  format,
  onChange,
  onClose,
  onAdd,
  addPlaceholder = "Nombre nuevo",
}: WheelPickerSheetProps<T>) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [active, setActive] = React.useState<number>(() => wheelIndexOf(options, value));
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const seedingRef = React.useRef(false);
  const settleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const seedTo = React.useCallback((row: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const target = row * WHEEL_ITEM_H;
    setActive(row);
    if (el.scrollTop !== target) {
      seedingRef.current = true;
      el.scrollTop = target;
    }
  }, []);

  // Seed the column to the current value whenever the sheet opens, and re-seed if
  // the value/options change under it (e.g. after adding a tipo).
  React.useEffect(() => {
    if (!open) return;
    seedTo(wheelIndexOf(options, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open + option/value change, not on every render
  }, [open, value, options.length]);

  React.useEffect(() => {
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setActive(wheelRowAt(el.scrollTop, options.length));
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const row = wheelRowAt(el.scrollTop, options.length);
      setActive(row);
      if (seedingRef.current) {
        seedingRef.current = false;
        return;
      }
      if (options[row] !== value) onChange(options[row]);
    }, 110);
  };

  const scrollToRow = (row: number) => {
    scrollRef.current?.scrollTo({ top: row * WHEEL_ITEM_H, behavior: scrollBehavior() });
  };

  const submitAdd = () => {
    const name = newName.trim().replace(/\s+/g, " ");
    setAdding(false);
    setNewName("");
    if (name && onAdd) onAdd(name);
  };

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} className="absolute inset-0" style={{ background: "var(--scrim)", zIndex: 60 }} />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ zIndex: 61, background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "15px 18px 20px", animation: "forge-rise .26s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 4, gap: 10 }}>
          <span className="uppercase" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: "var(--muted)", whiteSpace: "nowrap" }}>
            {title}
          </span>
          <div className="flex items-center" style={{ gap: 8 }}>
            {onAdd && (
              <button
                type="button"
                onClick={() => {
                  setAdding((a) => !a);
                  setNewName("");
                }}
                aria-label="Nuevo tipo"
                className="forge-hit flex items-center justify-center"
                style={{ width: 34, height: 34, flex: "none", background: "transparent", border: `1px solid ${adding ? "var(--yellow)" : "var(--line)"}`, cursor: "pointer", padding: 0 }}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--yellow)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M10 4v12M4 10h12" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="uppercase"
              style={{ padding: "8px 18px", background: "var(--yellow)", color: "var(--ink)", border: "none", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer" }}
            >
              Listo
            </button>
          </div>
        </div>

        {adding && onAdd && (
          <div className="flex" style={{ gap: 8, margin: "6px 0 12px" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAdd();
              }}
              placeholder={addPlaceholder}
              className="uppercase"
              style={{ flex: 1, minWidth: 0, background: "var(--canvas)", border: "1px solid var(--line)", color: "var(--fg)", fontFamily: "inherit", fontSize: 14, fontWeight: 600, letterSpacing: 0.4, padding: 12, outline: "none" }}
            />
            <button
              type="button"
              onClick={submitAdd}
              className="uppercase"
              style={{ flex: "none", padding: "0 18px", background: "var(--yellow)", color: "var(--ink)", border: "none", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, cursor: "pointer" }}
            >
              Crear
            </button>
          </div>
        )}

        <div style={{ position: "relative", height: VIEWPORT, overflow: "hidden" }}>
          <div className="pointer-events-none absolute inset-x-0" style={{ top: PAD, height: WHEEL_ITEM_H, borderTop: "1px solid var(--yellow-edge)", borderBottom: "1px solid var(--yellow-edge)", background: "var(--yellow-soft)", zIndex: 2 }} />
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: PAD, background: "linear-gradient(var(--surface), color-mix(in srgb, var(--surface) 10%, transparent))", zIndex: 3 }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: PAD, background: "linear-gradient(color-mix(in srgb, var(--surface) 10%, transparent), var(--surface))", zIndex: 3 }} />
          <div
            ref={scrollRef}
            onScroll={onScroll}
            role="listbox"
            aria-label={title}
            className="forge-scroll"
            style={{ position: "relative", height: VIEWPORT, overflowY: "auto", scrollSnapType: "y mandatory", zIndex: 1 }}
          >
            <div style={{ height: PAD }} aria-hidden="true" />
            {options.map((opt, i) => {
              const sel = i === active;
              const dist = Math.abs(i - active);
              return (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => scrollToRow(i)}
                  className="tnum flex w-full items-center justify-center"
                  style={{
                    height: WHEEL_ITEM_H,
                    scrollSnapAlign: "center",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: sel ? "var(--fg)" : "var(--muted)",
                    fontWeight: sel ? 800 : 500,
                    fontSize: sel ? 24 : 17,
                    opacity: Math.max(0.16, 1 - dist * 0.32),
                    transform: `scale(${(1 - Math.min(dist, 3) * 0.06).toFixed(3)})`,
                    transition: "color .14s ease, font-size .14s ease",
                  }}
                >
                  {format ? format(opt) : String(opt)}
                </button>
              );
            })}
            <div style={{ height: PAD }} aria-hidden="true" />
          </div>
        </div>
      </div>
    </>
  );
}
