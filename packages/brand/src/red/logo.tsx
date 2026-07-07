import * as React from "react";

import { RedRingMark } from "./ring-mark";

// RED brand mark + wordmark (brand #2). Deliberately NOT a Forge repaint: RED's
// mark is a BROKEN neon ring — two crimson arcs with gaps at the sides (the mock's
// `#redmark-ring` symbol). `RedMark` is the flat static arcs used in compact
// lockups (headers/footers/receipts); the full ignited ring-with-wordmark lives in
// `./ring-mark`. Presentation-only, imports only React + the sibling ring.

const RING_TOP = "M77.5 378.7 A597 597 0 0 1 1176.5 378.7";
const RING_BOT = "M1176.5 845.3 A597 597 0 0 1 77.5 845.3";

/** The static broken-ring arcs: base crimson + coral inner highlight, `.sm` glow. */
export function RedMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1254 1254"
      role="img"
      aria-label="RED"
      style={{ display: "block", filter: "drop-shadow(0 0 2px #d92b1f) drop-shadow(0 0 5px #b5161c)" }}
    >
      <g fill="none" strokeLinecap="butt">
        <path d={RING_TOP} stroke="#cf1f1c" strokeWidth={74} />
        <path d={RING_BOT} stroke="#cf1f1c" strokeWidth={74} />
        <path d={RING_TOP} stroke="#ff7a63" strokeWidth={22} />
        <path d={RING_BOT} stroke="#ff7a63" strokeWidth={22} />
      </g>
    </svg>
  );
}

/**
 * RED's `logo` slot. `animate` (the landing hero) renders the full ignited
 * ring-with-wordmark; static — the default for chrome (headers/footers/receipts)
 * — renders the compact horizontal mark + heavy RED wordmark, matching the
 * Forge/Base lockup shape. The registry widens `logo` to carry `animate?`; static
 * modules simply ignore it.
 */
export function RedLockup({ size = 14, animate = false }: { size?: number; animate?: boolean }) {
  if (animate) {
    return <RedRingMark size={size} />;
  }
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
