import * as React from "react";

// Forge brand mark + wordmark, ported from the prototype's brand.jsx.
// The F-mark is three slanted bars (silver / gold crossbar / silver stub) whose
// LEFT edges are collinear on a single "/" diagonal — that shared left margin is
// the "F" spine. Bars step down in length (~100% / 74% / 40%) and end in a sharp
// right-leaning point, so the negative space reads as an "F". (Geometry matched
// to the real Forge Bootcamp logo.)

// ── SINGLE SOURCE OF TRUTH for the F-mark geometry ──────────────────────────
// Exported so EVERY surface that draws the mark (the static FMark below, the
// animated login build, the app icon) derives its polygons from this ONE
// definition and can never drift. This is Forge's brand module in @gym/brand and
// imports only React — keep it free of any app / @gym/data / @gym/domain dependency.
//
// Both edges lean left at the bottom ("/"): the left edge gently (the shared
// spine), the right edge steeper so each bar ends in a sharp forward point.
export const FMARK_LEFT_SLANT = -3.4;
export const FMARK_RIGHT_SLANT = -6;
export const FMARK_BAR_HEIGHT = 12;

/** SVG `points` string for one bar, given its top-left x, top-right x, top y. */
export function bar(xL: number, xR: number, yTop: number): string {
  return (
    `${xL},${yTop} ${xR},${yTop} ` +
    `${xR + FMARK_RIGHT_SLANT},${yTop + FMARK_BAR_HEIGHT} ` +
    `${xL + FMARK_LEFT_SLANT},${yTop + FMARK_BAR_HEIGHT}`
  );
}

/** Which metal gradient fills a bar (the mark is silver / gold / silver). */
export type FMarkBarRole = "silver" | "gold";

/** A single bar of the mark: its polygon points and its metal role. */
export interface FMarkBar {
  /** Stable identifier (top → middle → bottom). */
  readonly name: "top" | "middle" | "bottom";
  /** SVG polygon `points` for this bar. */
  readonly points: string;
  /** Which metal gradient fills it. */
  readonly role: FMarkBarRole;
}

/**
 * The three bars in draw order (top → middle → bottom), silver / gold / silver.
 * THIS is the canonical geometry. FMark, the login animation, and the app icon
 * all consume this array — there is no second copy of the polygon numbers.
 */
export const FMARK_BARS: readonly FMarkBar[] = [
  { name: "top", points: bar(30, 92, 18), role: "silver" },
  { name: "middle", points: bar(23.7, 69.7, 40), role: "gold" },
  { name: "bottom", points: bar(17.4, 42.4, 62), role: "silver" },
];

export function FMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Forge">
      <defs>
        <linearGradient id="fm-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--silver)" />
          <stop offset="50%" stopColor="#9a9a9a" />
          <stop offset="100%" stopColor="var(--silver)" />
        </linearGradient>
        <linearGradient id="fm-yellow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--yellow)" />
          <stop offset="50%" stopColor="#d4a72c" />
          <stop offset="100%" stopColor="var(--yellow)" />
        </linearGradient>
      </defs>
      {FMARK_BARS.map((b) => (
        <polygon
          key={b.name}
          points={b.points}
          fill={b.role === "gold" ? "url(#fm-yellow)" : "url(#fm-silver)"}
        />
      ))}
    </svg>
  );
}

/** Compact lockup: F-mark + stacked FORGE / BOOTCAMP wordmark. */
export function ForgeLockup({ size = 14 }: { size?: number }) {
  return (
    <div className="inline-flex items-center" style={{ gap: 12 }}>
      <FMark size={size * 2} />
      <div className="flex flex-col items-start" style={{ lineHeight: 1, gap: 4 }}>
        <span
          className="uppercase"
          style={{ fontWeight: 300, fontSize: size, letterSpacing: size * 0.28, color: "var(--silver)" }}
        >
          FORGE
        </span>
        <span
          className="uppercase"
          style={{ fontWeight: 400, fontSize: size * 0.46, letterSpacing: size * 0.18, color: "var(--gold)" }}
        >
          BOOTCAMP
        </span>
      </div>
    </div>
  );
}
