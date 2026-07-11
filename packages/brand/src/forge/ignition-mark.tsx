import * as React from "react";

import { FMARK_BARS, FMARK_BAR_HEIGHT } from "./mark-geometry";

// Forge's crown-jewel animated mark: the F-mark bar-build IGNITION — the three
// bars wipe in left-to-right (top→bottom), the wordmark rises per-letter, then a
// specular shine sweeps the top bar. This is the shared ignition artifact both
// surfaces render: the landing hero (`ForgeLockup animate`, sans form) and the
// login hero (`./login-animation`, which frames it with the form + ambient glow).
// The RED precedent is exact — `RedRingMark` is likewise shared by RED's landing
// lockup and login hero, so the two brands diverge in the MECHANISM, not just color.
//
// Zero client JS: the ignition is pure CSS keyframes, so this stays a Server
// Component (no `use client` — it would only add a needless hydration cost for
// motion that needs no runtime). Every keyframe (`forge-ignition-*`) lives LOCAL
// to this file's inline `<style>`, scoped to `.forge-ignition`, and both fill-modes
// persist the end states (bars fully revealed, shine cleared, wordmark risen) —
// which is also what makes the GLOBAL reduced-motion rule (`@gym/ui` motion.css
// zeroes durations for `*`) collapse this to its final usable frame with no
// per-component media query. Presentation-only and hook-free: imports only React
// + the sibling logo geometry, so the frozen `brand ✗→ data/domain` boundary holds.
//
// Every color routes through the CSS-var contract (`var(--silver)`/`var(--yellow)`);
// the metal mid-stops and the white specular are effect furniture with no swappable
// token, so they are the two literals the mark carries (mirrors the static `FMark`).

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

// The mark's intrinsic size. The wide "FORGE" wordmark (56px, 16px tracking) is
// the constraint: at this icon size it fits the narrowest phone (≈264px content),
// and any larger overflows. Both surfaces render at it — the landing sans form,
// the login framed by one — so login and landing read as one mark.
const FMARK_SIZE = 132;
const WORD_FONT_SIZE = 56;
const WORD_MARGIN_TOP = 30;
const WORD_TRACKING = 16;

// Stagger delays by bar name. Strict build order: top fills first, bottom last.
const BAR_DELAY: Record<string, number> = { top: 0, middle: 240, bottom: 480 };

const BUILD = FMARK_BARS.map((b) => ({
  id: `forge-ignition-clip-${b.name}`,
  fill: b.role === "gold" ? "url(#forge-ignition-gold)" : "url(#forge-ignition-silver)",
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
const SHINE_DURATION = 800;

// Shine band geometry. The 26-wide band starts fully off the top bar's inner
// LEFT edge (derived from the shared bbox: TOP_BOX.x - 26) and sweeps +72px,
// ending fully off the right edge. The group is clipped to the top-bar polygon,
// so it only ever shows inside the bar.
const SHINE_W = 26;
const SHINE_X = TOP_BOX.x - SHINE_W; // start: fully left of the inner edge (26.6 - 26)
const SHINE_TRAVEL = 72; // the mark's exact sweep distance

/**
 * Forge's animated bar-build ignition mark. `name` supplies the wordmark text +
 * aria label (module copy, not a literal — so per-gym `brand_name` row data flows
 * through once wired). Rendered standalone on the landing (`ForgeLockup animate`)
 * and framed by the login hero (`./login-animation`).
 */
export function ForgeIgnitionMark({ name }: { readonly name: string }) {
  // The shine fires the moment the LAST wordmark letter settles — derived from the
  // real letter count so any wordmark length stays in sync.
  const shineAt = WORD_AT + (name.length - 1) * WORD_STEP + WORD_DURATION;

  return (
    <div className="forge-ignition relative flex flex-col items-center">
      {/* Local-only keyframes + shine tokens — self-contained (never globals.css /
          the @gym/ui product sheet), scoped to `.forge-ignition` so a standalone
          landing render carries its own tokens (no dependence on the login root).
          Both fill-modes persist the end states, which is what the GLOBAL
          reduced-motion rule collapses to with no extra media query here. */}
      <style>{`
        .forge-ignition {
          /* The specular shine is white by design (it is what makes the 'shine'
             read on metal); routing it through a token keeps every color a var(--x). */
          --forge-ignition-shine: rgba(255, 255, 255, 0.92);
          --forge-ignition-shine-edge: rgba(255, 255, 255, 0);
        }
        @keyframes forge-ignition-wipe {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        /* The shine band travels along the top bar's inner x-range only.
           Clipped to the bar polygon, so it can never protrude past either end. */
        @keyframes forge-ignition-shine {
          0%   { transform: translateX(0);    opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateX(${SHINE_TRAVEL}px); opacity: 0; }
        }
        /* Per-letter wordmark rise — the mark's own local copy (self-contained),
           equivalent to the @gym/ui product 'forge-rise' but never depended on. */
        @keyframes forge-ignition-rise {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>

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
          <linearGradient id="forge-ignition-silver" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--silver)" />
            <stop offset="50%" stopColor="#9a9a9a" />
            <stop offset="100%" stopColor="var(--silver)" />
          </linearGradient>
          <linearGradient id="forge-ignition-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--yellow)" />
            <stop offset="50%" stopColor="#d4a72c" />
            <stop offset="100%" stopColor="var(--yellow)" />
          </linearGradient>

          {/* Horizontal light band for the shine — transparent → specular →
              transparent. Stops reference the component-local shine tokens, so
              every color here is a var(--x). */}
          <linearGradient id="forge-ignition-shine-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--forge-ignition-shine-edge)" />
            <stop offset="50%" stopColor="var(--forge-ignition-shine)" />
            <stop offset="100%" stopColor="var(--forge-ignition-shine-edge)" />
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
                  animation: `forge-ignition-wipe ${BAR_DURATION}ms ${WIPE_EASE} ${b.delay}ms both`,
                }}
              />
            </clipPath>
          ))}

          {/* clipPath holding the EXACT top-bar polygon (shared geometry). The
              shine band lives inside a group clipped by this, guaranteeing it
              stays within the top bar's shape with nothing protruding. */}
          <clipPath id="forge-ignition-topbar-clip">
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
        <g clipPath="url(#forge-ignition-topbar-clip)">
          <rect
            x={SHINE_X}
            y={TOP_BOX.y}
            width={SHINE_W}
            height={FMARK_BAR_HEIGHT}
            fill="url(#forge-ignition-shine-grad)"
            style={{
              mixBlendMode: "screen",
              animation: `forge-ignition-shine ${SHINE_DURATION}ms ease-in-out ${shineAt}ms both`,
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
          marginTop: WORD_MARGIN_TOP,
          fontWeight: 300,
          fontSize: WORD_FONT_SIZE,
          letterSpacing: WORD_TRACKING,
          // letter-spacing pads the right of the last glyph; pull it back so
          // the word stays optically centered under the mark.
          marginRight: -WORD_TRACKING,
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
              animation: `forge-ignition-rise ${WORD_DURATION}ms ${EASE} both`,
              animationDelay: `${WORD_AT + i * WORD_STEP}ms`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}
