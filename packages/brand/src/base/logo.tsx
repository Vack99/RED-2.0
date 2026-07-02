import * as React from "react";

// The neutral *módulo base* mark + wordmark — the marca a generic gym wears until
// it ships bespoke code (or overrides the palette via `token_overrides`).
// Deliberately abstract, not a repaint of Forge or RED: a rounded "module" tile
// split on the diagonal into the two accent tones, reading as a calm, intentional
// placeholder emblem. Presentation-only, imports only React, and recolors ENTIRELY
// through the CSS-var contract — `--yellow`/`--gold` are the accent, so a gym's
// override (or a bespoke module) restyles the mark with zero geometry edits.

// ── SINGLE SOURCE OF TRUTH for the base tile geometry ───────────────────────
// The rounded tile and its diagonal split; the static BaseMark and the flat
// app-icon (../base/app-icon) both derive from these numbers — no second copy.
export const BASE_TILE = { x: 16, y: 16, size: 68, radius: 20 } as const;

/** The two triangular halves of the tile, split top-left → bottom-right. */
export const BASE_TILE_HALVES: readonly { readonly points: string; readonly accent: "yellow" | "gold" }[] =
  (() => {
    const { x, y, size } = BASE_TILE;
    const x2 = x + size;
    const y2 = y + size;
    return [
      { points: `${x},${y} ${x2},${y} ${x},${y2}`, accent: "yellow" },
      { points: `${x2},${y} ${x2},${y2} ${x},${y2}`, accent: "gold" },
    ];
  })();

export function BaseMark({ size = 28 }: { size?: number }) {
  const { x, y, size: s, radius } = BASE_TILE;
  const clipId = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Gimnasio">
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={s} height={s} rx={radius} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {BASE_TILE_HALVES.map((half) => (
          <polygon
            key={half.accent}
            points={half.points}
            fill={half.accent === "gold" ? "var(--gold)" : "var(--yellow)"}
          />
        ))}
      </g>
    </svg>
  );
}

/** Compact lockup: the module tile + a quiet "Gimnasio" wordmark. */
export function BaseLockup({ size = 14 }: { size?: number }) {
  return (
    <div className="inline-flex items-center" style={{ gap: 11 }}>
      <BaseMark size={size * 2} />
      <span
        className="capitalize"
        style={{
          fontWeight: 600,
          fontSize: size * 1.5,
          letterSpacing: size * 0.05,
          color: "var(--fg)",
          lineHeight: 1,
        }}
      >
        Gimnasio
      </span>
    </div>
  );
}
