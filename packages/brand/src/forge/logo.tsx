import * as React from "react";

import { ForgeIgnitionMark } from "./ignition-mark";
import { FMARK_BARS } from "./mark-geometry";

// Forge brand mark + wordmark, ported from the prototype's brand.jsx. The F-mark
// geometry (the SINGLE SOURCE OF TRUTH consumed here, by the ignition mark, and by
// the app icon) lives in its own leaf module `./mark-geometry` — re-exported below
// so the `./forge/logo` subpath keeps publishing it, and so `./logo` and
// `./ignition-mark` can each draw the mark without a circular import.
export * from "./mark-geometry";

export function FMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Forge">
      {/* The metallic bevel: each bar is one hue lit at its edges and shadowed
          through its middle, so BOTH stops are brand color — the rim (0%/100%)
          and the deep core (50%). The core was a hardcoded literal, which meant
          a gym's `token_overrides` recolored the whole product but silently left
          the mark's core the old gold/grey. `--yellow-core`/`--silver-core` are
          the contract keys for that core (the accent's own deep band, ~11 L*
          below it), so the mark now follows an override like everything else. */}
      <defs>
        <linearGradient id="fm-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--silver)" />
          <stop offset="50%" stopColor="var(--silver-core)" />
          <stop offset="100%" stopColor="var(--silver)" />
        </linearGradient>
        <linearGradient id="fm-yellow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--yellow)" />
          <stop offset="50%" stopColor="var(--yellow-core)" />
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

/**
 * Forge's `logo` slot. `animate` (the landing hero) plays the shared bar-build
 * ignition sans form; static — the default for chrome (headers/footers/receipts)
 * — renders the compact F-mark + stacked FORGE / BOOTCAMP wordmark. The registry
 * widens `logo` to carry `animate?`; static brands ignore it (a single widened
 * slot, not a second `heroMark` member). Mirrors RED's `RedLockup`.
 */
export function ForgeLockup({ size = 14, animate = false }: { size?: number; animate?: boolean }) {
  if (animate) {
    // The landing hero: the shared bar-build ignition, sans form. The mark has an
    // intrinsic size (its wide wordmark's mobile ceiling), so the brand-neutral
    // `size` the landing passes for RED's scalable ring does not apply here.
    return <ForgeIgnitionMark name="FORGE" />;
  }
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
