import * as React from "react";

import { BODY_GRADIENT, HERO, LETTERS, LETTERS_SHIFT, RING_BOT, RING_GRADIENT, RING_TOP } from "./mark-geometry";

// RED's crown-jewel mark, ignited: the broken neon ring's arcs draw in, the R/E/D
// letters strobe on like tubes, then an idle breathe. This is the hero artifact the
// landing + both apps' login heroes render, at the HERO cut (hairline ring, inner
// tube highlight, full three-layer glow) — the chrome renders the SAME drawing at
// the CHROME cut instead (./logo). The geometry itself is ./mark-geometry; this file
// owns only the ignition.
//
// It always ignites (there is no static caller) — reduced motion is handled globally
// (`@gym/ui`'s motion.css zeroes durations), and every animation uses
// `forwards`/`both`, so the collapsed path lands on the fully-drawn, lit ring with no
// per-component media query.
//
// Zero client JS: the ignition is pure CSS keyframes, so this stays a Server
// Component (no `use client` — it would only add a needless hydration cost for motion
// that needs no runtime). The three ignition keyframes (ringDraw/redFlick/redBreathe)
// live LOCAL to this file in an inline SVG `<style>`; the screen-level neon-copy
// keyframes live in ./neon.css, so there is no overlap.
//
// Only one ignited ring ever renders per DOM (a page shows the hero or the chrome
// mark, never both), so its gradient/keyframe ids are plain constants; the chrome
// mark uses its own ids and cannot collide with them.

/** Base neon glow, shared by the resting mark and the `redBreathe` low-key. */
const BASE_GLOW =
  "drop-shadow(0 0 3px #d92b1f) drop-shadow(0 0 8px #b5161c) drop-shadow(0 0 16px #7e0d10)";

/** Each arc draws in from hidden (dashoffset 1410 → 0), staggered top then bottom. */
const ringStyle = (delay: number): React.CSSProperties => ({
  strokeDasharray: 1410,
  strokeDashoffset: 1410,
  animation: `ringDraw .9s cubic-bezier(.45,.05,.35,1) ${delay}s forwards`,
});

/** Each letter strobes on like a neon tube turning on, staggered R/E/D. */
const flickStyle = (delay: number): React.CSSProperties => ({
  opacity: 0,
  animation: `redFlick .6s ${delay}s forwards`,
});

/**
 * The RED neon broken-ring lockup: the arcs draw in, the R/E/D letters strobe on,
 * then an idle breathe. Reduced motion is handled globally (see the file header) —
 * every animation uses `forwards`, so the collapsed path lands fully-drawn and lit.
 */
export function RedRingMark({ size = 200 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={HERO.viewBox}
      role="img"
      aria-label="RED"
      style={{
        display: "block",
        filter: BASE_GLOW,
        animation: "redBreathe 4.2s ease-in-out 2.4s infinite",
      }}
    >
      <style>{`
        @keyframes ringDraw { from { stroke-dashoffset: 1410; } to { stroke-dashoffset: 0; } }
        @keyframes redFlick {
          0%{opacity:0} 7%{opacity:.75} 11%{opacity:.08} 17%{opacity:.9} 24%{opacity:.15}
          33%{opacity:1} 44%{opacity:.45} 55%{opacity:1} 70%{opacity:.7} 100%{opacity:1}
        }
        @keyframes redBreathe {
          0%,100% { filter: ${BASE_GLOW}; }
          50%     { filter: drop-shadow(0 0 4px #e23a2a) drop-shadow(0 0 12px #c8161c) drop-shadow(0 0 22px #8e0d0f); }
        }
      `}</style>

      <defs>
        <linearGradient
          id="ringGrad"
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
          id="redBody"
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
      <g fill="none" strokeLinejoin="round">
        <path d={RING_TOP} stroke="url(#ringGrad)" strokeWidth={HERO.ring} strokeLinecap="butt" style={ringStyle(0.15)} />
        <path d={RING_BOT} stroke="url(#ringGrad)" strokeWidth={HERO.ring} strokeLinecap="butt" style={ringStyle(0.6)} />

        <g transform={LETTERS_SHIFT} strokeLinecap="butt">
          {LETTERS.map((letter) => (
            <g key={letter.cls} style={flickStyle(letter.delay)}>
              {letter.d.map((d, i) => (
                <path key={i} d={d} stroke="url(#redBody)" strokeWidth={HERO.letters} />
              ))}
              {/* Inner neon-tube highlight, offset up-left. */}
              <g transform="translate(-2 -8)" stroke="#ffd8b8" strokeWidth={HERO.highlight} opacity={0.5}>
                {letter.d.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
