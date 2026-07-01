import * as React from "react";

// RED brand mark + wordmark (brand #2). Deliberately NOT a Forge repaint: RED's
// mark is a double forward-chevron — two stacked ">" arrows leaning into motion,
// reading as speed/drive for the bootcamp. Presentation-only, imports only React,
// and recolors through the CSS-var contract (`--yellow` = RED's crimson accent).

const CHEVRON_HEIGHT = 44;
const CHEVRON_THICK = 20;

/** SVG `points` for one forward chevron whose tip sits at (xTip, 50), center-height. */
function chevron(xTip: number): string {
  const xBack = xTip - 34;
  const half = CHEVRON_HEIGHT / 2;
  return (
    `${xBack},${50 - half} ${xBack + CHEVRON_THICK},${50 - half} ` +
    `${xTip},50 ` +
    `${xBack + CHEVRON_THICK},${50 + half} ${xBack},${50 + half} ` +
    `${xBack + CHEVRON_THICK - 18},50`
  );
}

/** The two chevrons, back → front. The front one carries the accent gradient. */
export const RED_CHEVRONS: readonly { readonly points: string; readonly lead: boolean }[] = [
  { points: chevron(58), lead: false },
  { points: chevron(88), lead: true },
];

export function RedMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="RED">
      <defs>
        <linearGradient id="red-accent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--yellow)" />
          <stop offset="100%" stopColor="var(--gold)" />
        </linearGradient>
      </defs>
      {RED_CHEVRONS.map((c, i) => (
        <polygon
          key={i}
          points={c.points}
          fill={c.lead ? "url(#red-accent)" : "var(--silver)"}
        />
      ))}
    </svg>
  );
}

/** Compact lockup: chevron mark + heavy RED wordmark. */
export function RedLockup({ size = 14 }: { size?: number }) {
  return (
    <div className="inline-flex items-center" style={{ gap: 10 }}>
      <RedMark size={size * 2} />
      <span
        className="uppercase"
        style={{
          fontWeight: 800,
          fontSize: size * 1.7,
          letterSpacing: size * 0.12,
          color: "var(--yellow)",
          lineHeight: 1,
        }}
      >
        RED
      </span>
    </div>
  );
}
