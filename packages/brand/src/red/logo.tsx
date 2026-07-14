import * as React from "react";

import {
  BODY_GRADIENT,
  CHROME,
  LETTERS,
  LETTERS_SHIFT,
  RING_BOT,
  RING_GRADIENT,
  RING_TOP,
  chromeGlow,
} from "./mark-geometry";
import { RedRingMark } from "./ring-mark";

// RED's chrome mark + `logo` slot. This is the SAME drawing as the ignited hero
// (./ring-mark) — same broken ring, same R/E/D — at the CHROME optical cut: the ring
// re-weighted from 14 to 32 and the letters from 37 to 64, because at the ~26px this
// renders at, the hero's hairline ring lands on a quarter of a pixel and vanishes.
// Same paths, different weights: that is what an optical cut IS.
//
// What it replaces: a fat stroke-74 ring with the R/E/D DELETED and the word "RED"
// set in the app's UI font beside it — a mark and a wordmark from two different
// drawings, clipped flat at the top besides (./mark-geometry). The wordmark is inside
// the ring now, where the gym draws it, so there is no separate text span.
//
// Presentation-only: React + the geometry + the sibling ring, nothing else.

/**
 * The static broken-ring mark WITH its wordmark, cut for chrome sizes.
 *
 * `glow` is the neon halo. It is the mark's identity on a dark surface, and a smudge
 * on a light one: the receipt is a fixed cream card (#f5f1ea), where the halo prints
 * as a pink bloom around the ring — so that one caller turns it off. The blur scales
 * with `size` (chromeGlow) rather than sitting fixed, or it would swallow the mark.
 */
export function RedMark({ size = 28, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={CHROME.viewBox}
      role="img"
      aria-label="RED"
      style={{ display: "block", filter: glow ? chromeGlow(size) : undefined }}
    >
      {/* Own ids, so a chrome mark can never collide with the hero's gradients. Two
          chrome marks on one page would redefine these identically — same paint. */}
      <defs>
        <linearGradient
          id="cmRing"
          gradientUnits="userSpaceOnUse"
          x1={RING_GRADIENT.x}
          y1={RING_GRADIENT.y1}
          x2={RING_GRADIENT.x}
          y2={RING_GRADIENT.y2}
        >
          {RING_GRADIENT.stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <linearGradient
          id="cmBody"
          gradientUnits="userSpaceOnUse"
          x1={BODY_GRADIENT.x}
          y1={BODY_GRADIENT.y1}
          x2={BODY_GRADIENT.x}
          y2={BODY_GRADIENT.y2}
        >
          {BODY_GRADIENT.stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>

      {/* stroke-linejoin:round is load-bearing for the R-bowl/leg corners. */}
      <g fill="none" strokeLinejoin="round" strokeLinecap="butt">
        <path d={RING_TOP} stroke="url(#cmRing)" strokeWidth={CHROME.ring} />
        <path d={RING_BOT} stroke="url(#cmRing)" strokeWidth={CHROME.ring} />

        {/* No inner tube highlight: at this size it is sub-pixel, and on cream it is
            invisible outright — pure loss either way. */}
        <g transform={LETTERS_SHIFT}>
          {LETTERS.flatMap((letter) =>
            letter.d.map((d, i) => (
              <path key={`${letter.cls}${i}`} d={d} stroke="url(#cmBody)" strokeWidth={CHROME.letters} />
            )),
          )}
        </g>
      </g>
    </svg>
  );
}

/**
 * RED's `logo` slot. `animate` (the landing hero) renders the full ignited ring;
 * static — the default for chrome (headers/receipts/drawers) — renders the same mark
 * at the chrome cut. RED's wordmark lives INSIDE the ring, so unlike Forge/Base there
 * is no text beside it: the mark is the lockup. `size` stays the slot's shared unit;
 * the mark is drawn at 2.4× it, the scale at which the enclosed R/E/D still reads.
 */
export function RedLockup({
  size = 14,
  animate = false,
  glow = true,
}: {
  size?: number;
  animate?: boolean;
  glow?: boolean;
}) {
  return animate ? <RedRingMark size={size} /> : <RedMark size={size * 2.4} glow={glow} />;
}
