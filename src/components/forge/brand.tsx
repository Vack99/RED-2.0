import * as React from "react";

// Forge brand mark + wordmark, ported from the prototype's brand.jsx.
// The F-mark is three slanted bars (silver / gold crossbar / silver stub) whose
// LEFT edges are collinear on a single "/" diagonal — that shared left margin is
// the "F" spine. Bars step down in length (~100% / 74% / 40%) and end in a sharp
// right-leaning point, so the negative space reads as an "F". (Geometry matched
// to the real Forge Bootcamp logo.)

export function FMark({ size = 28 }: { size?: number }) {
  // Both edges lean left at the bottom ("/"): the left edge gently (the shared
  // spine), the right edge steeper so each bar ends in a sharp forward point.
  const leftSlant = -3.4;
  const rightSlant = -6;
  const h = 12;
  const bar = (xL: number, xR: number, yTop: number) =>
    `${xL},${yTop} ${xR},${yTop} ${xR + rightSlant},${yTop + h} ${xL + leftSlant},${yTop + h}`;
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
      <polygon points={bar(30, 92, 18)} fill="url(#fm-silver)" />
      <polygon points={bar(23.7, 69.7, 40)} fill="url(#fm-yellow)" />
      <polygon points={bar(17.4, 42.4, 62)} fill="url(#fm-silver)" />
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
