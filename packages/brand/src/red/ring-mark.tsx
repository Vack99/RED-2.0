import * as React from "react";

// RED's crown-jewel mark: a BROKEN neon ring (two arcs, gaps at the sides)
// enclosing a stroked "RED" wordmark — the mock's `redLogoSVG` (index.html
// 1811-1831), rebuilt exactly. This is the animated hero artifact that the
// landing + both login heroes render; the small chrome lockup uses the flat
// ring arcs in `./logo` instead.
//
// Zero client JS: the ignition is pure CSS keyframes, so this stays a Server
// Component (no `use client` — client components would still SSR but pay a
// needless hydration cost for motion that needs no runtime). The three ignition
// keyframes (ringDraw/redFlick/redBreathe) live LOCAL to this file in an inline
// SVG `<style>`; the screen-level neon-copy keyframes live in the apps' own
// globals.css, so there is no overlap.
//
// Gradient + keyframe ids are made unique per instance via a deterministic
// `idSuffix` prop (NOT `useId`, which would buy nothing here and only muddies
// the zero-JS story): the landing paints the static chrome lockup AND this
// animated ring in one DOM, so shared `url(#…)` ids would collapse to the first
// match. Callers pass a stable suffix (`"hero"`).
//
// Colors are the mock's bespoke neon hexes, inline (the admin app does not
// `@source`-scan `@gym/brand`, so Tailwind classes would tree-shake there). The
// glow reds (#d92b1f/#b5161c/#7e0d10) and the tube gradients are the neon effect
// itself — they have no swappable token equivalent, so they stay literal.

/** Base neon glow, shared by the resting mark and the `redBreathe` low-key. */
const BASE_GLOW =
  "drop-shadow(0 0 3px #d92b1f) drop-shadow(0 0 8px #b5161c) drop-shadow(0 0 16px #7e0d10)";

const RING_TOP = "M77.5 378.7 A597 597 0 0 1 1176.5 378.7";
const RING_BOT = "M1176.5 845.3 A597 597 0 0 1 77.5 845.3";

/** The three wordmark letters: stroke `d`s + the per-letter flick delay (s). */
const LETTERS: readonly {
  readonly cls: string;
  readonly delay: number;
  readonly d: readonly string[];
}[] = [
  {
    cls: "R",
    delay: 1.18,
    d: [
      "M72 478 V746",
      "M72 478 H266 C311 478 343 502 343 544 C343 580 328 608 296 625 C257 640 230 633 204 624",
      "M210 626 L324 742",
    ],
  },
  { cls: "E", delay: 1.46, d: ["M510 478 H767", "M510 612 H767", "M510 746 H767"] },
  {
    cls: "D",
    delay: 1.72,
    d: [
      "M919 478 V746",
      "M919 485 H1049 C1132 485 1199 541 1199 613 C1199 685 1132 741 1049 741 H919",
    ],
  },
];

/**
 * The RED neon broken-ring lockup. `animate` gates the ignition (arcs draw in,
 * letters strobe on, then an idle breathe); static renders the fully-lit ring.
 * Reduced motion is handled globally (`@gym/ui`'s motion.css zeroes durations +
 * delays) — every animation uses `forwards`/`both`, so the collapsed path lands
 * on the fully-drawn, lit ring with no per-component media query.
 */
export function RedRingMark({
  size = 200,
  animate = false,
  idSuffix = "red",
}: {
  readonly size?: number;
  readonly animate?: boolean;
  readonly idSuffix?: string;
}) {
  const ringGrad = `ringGrad_${idSuffix}`;
  const redBody = `redBody_${idSuffix}`;

  const svgStyle: React.CSSProperties = {
    display: "block",
    filter: BASE_GLOW,
    ...(animate ? { animation: `redBreathe_${idSuffix} 4.2s ease-in-out 2.4s infinite` } : {}),
  };

  const ringStyle = (delay: number): React.CSSProperties =>
    animate
      ? {
          strokeDasharray: 1410,
          strokeDashoffset: 1410,
          animation: `ringDraw_${idSuffix} .9s cubic-bezier(.45,.05,.35,1) ${delay}s forwards`,
        }
      : {};

  const flickStyle = (delay: number): React.CSSProperties =>
    animate ? { opacity: 0, animation: `redFlick_${idSuffix} .6s ${delay}s forwards` } : { opacity: 1 };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1254 1254"
      role="img"
      aria-label="RED"
      style={svgStyle}
    >
      {animate ? (
        <style>{`
          @keyframes ringDraw_${idSuffix} { from { stroke-dashoffset: 1410; } to { stroke-dashoffset: 0; } }
          @keyframes redFlick_${idSuffix} {
            0%{opacity:0} 7%{opacity:.75} 11%{opacity:.08} 17%{opacity:.9} 24%{opacity:.15}
            33%{opacity:1} 44%{opacity:.45} 55%{opacity:1} 70%{opacity:.7} 100%{opacity:1}
          }
          @keyframes redBreathe_${idSuffix} {
            0%,100% { filter: ${BASE_GLOW}; }
            50%     { filter: drop-shadow(0 0 4px #e23a2a) drop-shadow(0 0 12px #c8161c) drop-shadow(0 0 22px #8e0d0f); }
          }
        `}</style>
      ) : null}

      <defs>
        <linearGradient
          id={ringGrad}
          gradientUnits="userSpaceOnUse"
          x1="627"
          y1="30"
          x2="627"
          y2="1224"
        >
          <stop offset="0" stopColor="#d92b1f" />
          <stop offset=".5" stopColor="#c8161c" />
          <stop offset="1" stopColor="#8f1014" />
        </linearGradient>
        <linearGradient
          id={redBody}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="478"
          x2="0"
          y2="773"
        >
          <stop offset="0" stopColor="#e23222" />
          <stop offset=".35" stopColor="#c8161c" />
          <stop offset="1" stopColor="#7e0d10" />
        </linearGradient>
      </defs>

      {/* stroke-linejoin:round is load-bearing for the R-bowl/leg corners. */}
      <g fill="none" strokeLinejoin="round">
        <path
          d={RING_TOP}
          stroke={`url(#${ringGrad})`}
          strokeWidth={14}
          strokeLinecap="butt"
          style={ringStyle(0.15)}
        />
        <path
          d={RING_BOT}
          stroke={`url(#${ringGrad})`}
          strokeWidth={14}
          strokeLinecap="butt"
          style={ringStyle(0.6)}
        />

        <g transform="translate(0 27)" strokeLinecap="butt">
          {LETTERS.map((letter) => (
            <g key={letter.cls} style={flickStyle(letter.delay)}>
              {letter.d.map((d, i) => (
                <path key={i} d={d} stroke={`url(#${redBody})`} strokeWidth={37} />
              ))}
              {/* Inner neon-tube highlight, offset up-left. */}
              <g transform="translate(-2 -8)" stroke="#ffd8b8" strokeWidth={5} opacity={0.5}>
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
