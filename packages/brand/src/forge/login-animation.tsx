import * as React from "react";

import { FMARK_BARS, FMARK_BAR_HEIGHT } from "./logo";

// Forge's ONE bespoke login hero — the code-preset path (ADR-0012 consequences):
// a brand ships baseline tokens + logo, and MAY carry one bespoke code artifact so
// the tracer proves more than a palette swap. Forge's is a forge/loading-bar build:
// the F-mark's three bars wipe in left-to-right (top→bottom), the wordmark rises
// per-letter, a specular shine sweeps the top bar, then the form enters. A
// mechanism distinct from RED's ignition (a chevron scaling out of an ember glow),
// so the two brands diverge in CODE, not just color.
//
// Extracted verbatim from the admin login form (grill lock (h)): the hero now
// lives in the brand module, self-contained — keyframes are declared in a local
// <style> with a `forge-login-*` prefix (never globals.css / the @gym/ui product
// sheet), and every color routes through the CSS-var contract. Presentation-only
// and hook-free (no `use client`): imports only React + the sibling logo geometry,
// so the frozen `brand ✗→ data/domain` boundary holds. The interactive form is
// slotted in as `children` (it carries the Supabase seam, which cannot cross into
// @gym/brand); its own product-motion entrance is timed to follow this sequence.

// --- Per-bar build, derived FROM the shared geometry -------------------------
// Each shared bar's polygon is `xL,yTop  xR,yTop  xR+rightSlant,yTop+h
// xL+leftSlant,yTop+h`. The wipe clip-rect is that polygon's bounding box:
//   x = xL + leftSlant (leftSlant < 0, so the bottom-left is the min x)
//   w = xR - (xL + leftSlant) ;  y = yTop ;  h = FMARK_BAR_HEIGHT
// Parsing the shared `points` keeps the boxes locked to the one definition in
// ./logo — no second copy of the polygon numbers lives here.
function clipBox(points: string) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const pair of points.trim().split(/\s+/)) {
    const [x, y] = pair.split(",").map(Number);
    xs.push(x);
    ys.push(y);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const FMARK_SIZE = 132;

// Stagger delays by bar name. Strict build order: top fills first, bottom last.
const BAR_DELAY: Record<string, number> = { top: 0, middle: 240, bottom: 480 };

const BUILD = FMARK_BARS.map((b) => ({
  id: `forge-login-clip-${b.name}`,
  fill: b.role === "gold" ? "url(#forge-login-gold)" : "url(#forge-login-silver)",
  points: b.points,
  box: clipBox(b.points),
  delay: BAR_DELAY[b.name],
}));

// The top bar polygon (shine is clipped to it) + its inner x-range, both pulled
// from the shared geometry so the shine band can never drift off the real bar.
const TOP_BAR = FMARK_BARS.find((b) => b.name === "top")!;
const TOP_BOX = clipBox(TOP_BAR.points); // x 26.6 → 92, w 65.4, y 18, h 12

// Sharp decelerate for the letters' rise (snappy settle).
const EASE = "cubic-bezier(.32,.72,0,1)";
// Soft, gentle curve for the icon bar wipes — smooth, unhurried build.
const WIPE_EASE = "cubic-bezier(.45,.05,.3,1)";

// --- Timeline (ms) -----------------------------------------------------------
// 1) ICON — each bar wipes L→R in ~420ms, staggered ~240ms (top 0–420,
//    middle 240–660, bottom 480–900); icon completes ~900ms.
const BAR_DURATION = 420;
// 2) WORDMARK — the wordmark letters rise+fade, ~300ms each, ~65ms apart,
//    starting just after the icon finishes.
const WORD_AT = 950;
const WORD_STEP = 65;
const WORD_DURATION = 300;
// 3) SHINE — one sweep across ONLY the top bar, clipped to its polygon. Fires
//    the moment the last wordmark letter settles.
const SHINE_AT = WORD_AT + 4 * WORD_STEP + WORD_DURATION; // 1510
const SHINE_DURATION = 800;

// Shine band geometry. The 26-wide band starts fully off the top bar's inner
// LEFT edge (derived from the shared bbox: TOP_BOX.x - 26) and sweeps +72px,
// ending fully off the right edge. The group is clipped to the top-bar polygon,
// so it only ever shows inside the bar.
const SHINE_W = 26;
const SHINE_X = TOP_BOX.x - SHINE_W; // start: fully left of the inner edge (26.6 - 26)
const SHINE_TRAVEL = 72; // the mark's exact sweep distance

/**
 * Forge's login hero. `name` supplies the wordmark text + aria label (module
 * copy, not a literal — so per-gym `brand_name` row data flows through once
 * wired); `children` is the login form, slotted into the centered stack below
 * the wordmark. Consumed by the admin login page via the resolved module.
 */
export function ForgeLoginAnimation({
  name,
  children,
}: {
  readonly name: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <div
      className="forge-login-root relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-backdrop"
      style={{ padding: 24 }}
    >
      {/* Local-only keyframes + tokens — self-contained (never globals.css / the
          @gym/ui product sheet). Both fill-modes persist the end states (bars
          fully revealed, shine cleared, wordmark risen), which is also what makes
          the GLOBAL reduced-motion rule collapse this to its final usable frame
          with no extra media query here. */}
      <style>{`
        /* Component-local theme tokens — declared here (NOT globals.css) so the
           whole hero stays "var(--x) only". The specular shine is white by design
           (it is what makes the 'shine' read on metal); routing it through a token
           keeps every color reference a var(--x). */
        .forge-login-root {
          --forge-login-shine: rgba(255, 255, 255, 0.92);
          --forge-login-shine-edge: rgba(255, 255, 255, 0);
          /* Soft warm gold for the atmospheric glow — low alpha, a subtle wash. */
          --forge-login-glow: rgba(212, 167, 44, 0.10);
        }
        @keyframes forge-login-wipe {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        /* Opacity-only fade-in. No transform/scale, so there is no rectangular
           edge to sweep into view — the gradient is full-bleed and already
           transparent before any viewport edge. */
        @keyframes forge-login-ambient {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* The shine band travels along the top bar's inner x-range only.
           Clipped to the bar polygon, so it can never protrude past either end. */
        @keyframes forge-login-shine {
          0%   { transform: translateX(0);    opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateX(${SHINE_TRAVEL}px); opacity: 0; }
        }
        /* Per-letter wordmark rise — the hero's own local copy (self-contained),
           equivalent to the @gym/ui product 'forge-rise' but never depended on. */
        @keyframes forge-login-rise {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>

      {/* Faint radial atmosphere behind the hero — depth, not a flat backdrop.
          Full-viewport so there is no rectangular boundary to reveal; the
          gradient fades FULLY to transparent (by 70%) well before any edge.
          Faded in by OPACITY only (no scale), removing any square-edge artifact. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 34%, var(--forge-login-glow) 0%, transparent 70%)",
          animation: "forge-login-ambient 1200ms ease-out both",
          animationDelay: "200ms",
        }}
      />

      {/* HERO — mark + wordmark, vertically centered with the form as one stack. */}
      <div className="relative flex flex-col items-center">
        {/* ── ICON: loading-bar build ───────────────────────────────────────
            One SVG, viewBox 0 0 100 100. Each shared-geometry bar is a polygon
            clipped by its own clipPath rect; that rect is animated scaleX 0→1
            from its LEFT edge (transform-box: fill-box; transform-origin: left),
            so the slant is revealed progressively left-to-right — a loading bar
            filling. Top fills first, bottom last. */}
        <svg
          width={FMARK_SIZE}
          height={FMARK_SIZE}
          viewBox="0 0 100 100"
          aria-label={name}
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <linearGradient id="forge-login-silver" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--silver)" />
              <stop offset="50%" stopColor="#9a9a9a" />
              <stop offset="100%" stopColor="var(--silver)" />
            </linearGradient>
            <linearGradient id="forge-login-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--yellow)" />
              <stop offset="50%" stopColor="#d4a72c" />
              <stop offset="100%" stopColor="var(--yellow)" />
            </linearGradient>

            {/* Horizontal light band for the shine — transparent → specular →
                transparent. Stops reference the component-local shine tokens, so
                every color here is a var(--x). */}
            <linearGradient id="forge-login-shine-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--forge-login-shine-edge)" />
              <stop offset="50%" stopColor="var(--forge-login-shine)" />
              <stop offset="100%" stopColor="var(--forge-login-shine-edge)" />
            </linearGradient>

            {/* One clipPath per bar — a rect over that bar's bounding box. The
                rect's own scaleX wipe (from its left edge) reveals the slanted
                polygon left-to-right. */}
            {BUILD.map((b) => (
              <clipPath key={b.id} id={b.id}>
                <rect
                  x={b.box.x}
                  y={b.box.y}
                  width={b.box.w}
                  height={b.box.h}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "left",
                    animation: `forge-login-wipe ${BAR_DURATION}ms ${WIPE_EASE} ${b.delay}ms both`,
                  }}
                />
              </clipPath>
            ))}

            {/* clipPath holding the EXACT top-bar polygon (shared geometry). The
                shine band lives inside a group clipped by this, guaranteeing it
                stays within the top bar's shape with nothing protruding. */}
            <clipPath id="forge-login-topbar-clip">
              <polygon points={TOP_BAR.points} />
            </clipPath>
          </defs>

          {/* The three bars — each painted whole but masked by its wipe clip. */}
          {BUILD.map((b) => (
            <polygon key={b.id} points={b.points} fill={b.fill} clipPath={`url(#${b.id})`} />
          ))}

          {/* ── SHINE: clipped to the top bar polygon ONLY ──────────────────
              A band of width SHINE_W, starting fully off the bar's inner LEFT
              edge and translating +SHINE_TRAVEL to fully off the right edge.
              Clipped to the top-bar polygon, so it only ever shows inside the
              bar — never overshooting. Top bar only; middle/bottom get none. */}
          <g clipPath="url(#forge-login-topbar-clip)">
            <rect
              x={SHINE_X}
              y={TOP_BOX.y}
              width={SHINE_W}
              height={FMARK_BAR_HEIGHT}
              fill="url(#forge-login-shine-grad)"
              style={{
                mixBlendMode: "screen",
                animation: `forge-login-shine ${SHINE_DURATION}ms ease-in-out ${SHINE_AT}ms both`,
              }}
            />
          </g>
        </svg>

        {/* ── WORDMARK: from module copy, staggered per-letter ─────────────── */}
        <div
          className="uppercase"
          aria-label={name}
          style={{
            display: "flex",
            marginTop: 30,
            fontWeight: 300,
            fontSize: 56,
            letterSpacing: 16,
            // letter-spacing pads the right of the last glyph; pull it back so
            // the word stays optically centered under the mark.
            marginRight: -16,
            color: "var(--silver)",
            lineHeight: 1,
          }}
        >
          {name.split("").map((ch, i) => (
            <span
              key={i}
              aria-hidden
              style={{
                display: "inline-block",
                animation: `forge-login-rise ${WORD_DURATION}ms ${EASE} both`,
                animationDelay: `${WORD_AT + i * WORD_STEP}ms`,
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>

      {/* The interactive login form, slotted below the wordmark as part of the
          centered stack. It owns its own product-motion entrance, timed to
          follow this hero. */}
      {children}
    </div>
  );
}
