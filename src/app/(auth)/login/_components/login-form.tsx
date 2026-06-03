"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { FMARK_BARS, FMARK_BAR_HEIGHT } from "@/components/forge/brand";

// === The REAL login — variant E ("Forged") surface + live Supabase auth ======
// The visual surface (mark loading-bar build → per-letter FORGE → top-bar shine
// → form slide-in) is variant E reproduced exactly. The form is the real
// single-operator sign-in (createClient + signInWithPassword), unchanged.
//
// The F-mark is NOT re-described here: its polygons come from the single source
// of truth in src/components/forge/brand.tsx (FMARK_BARS). We only add the
// per-bar loading-bar wipe on top of that shared geometry.

// --- Per-bar build, derived FROM the shared geometry -------------------------
// Each shared bar's polygon is `xL,yTop  xR,yTop  xR+rightSlant,yTop+h
// xL+leftSlant,yTop+h`. The wipe clip-rect is that polygon's bounding box:
//   x  = xL + leftSlant   (leftSlant < 0, so the bottom-left is the min x)
//   w  = xR - (xL + leftSlant)
//   y  = yTop ;  h = FMARK_BAR_HEIGHT
// Parsing the shared `points` keeps the boxes locked to the one definition —
// no second copy of the polygon numbers lives here.
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
  id: `ve-clip-${b.name}`,
  fill: b.role === "gold" ? "url(#ve-gold)" : "url(#ve-silver)",
  points: b.points,
  box: clipBox(b.points),
  delay: BAR_DELAY[b.name],
}));

// The top bar polygon (shine is clipped to it) + its inner x-range, both pulled
// from the shared geometry so the shine band can never drift off the real bar.
const TOP_BAR = FMARK_BARS.find((b) => b.name === "top")!;
const TOP_BOX = clipBox(TOP_BAR.points); // x 26.6 → 92, w 65.4, y 18, h 12

// Sharp decelerate for the letters/form rise (snappy settle).
const EASE = "cubic-bezier(.32,.72,0,1)";
// Soft, gentle curve for the icon bar wipes — smooth, unhurried build.
const WIPE_EASE = "cubic-bezier(.45,.05,.3,1)";

// --- Timeline (ms) -----------------------------------------------------------
// 1) ICON — each bar wipes L→R in ~420ms, staggered ~240ms (top 0–420,
//    middle 240–660, bottom 480–900); icon completes ~900ms.
const BAR_DURATION = 420;
// 2) WORDMARK — FORGE letters rise+fade, ~300ms each, ~65ms apart, starting
//    just after the icon finishes.
const WORD_AT = 950;
const WORD_STEP = 65;
const WORD_DURATION = 300;
// 3) SHINE — one sweep across ONLY the top bar, clipped to its polygon. Fires
//    the moment the last FORGE letter settles.
const SHINE_AT = WORD_AT + 4 * WORD_STEP + WORD_DURATION; // 1510
const SHINE_DURATION = 800;
// 4) FORM — fields slide in, Correo then Contraseña, then the button.
const FORM_AT = SHINE_AT + 80; // 1590
const FORM_STEP = 150;

const word = "FORGE";

// Shine band geometry. The 26-wide band starts fully off the top bar's inner
// LEFT edge (derived from the shared bbox: TOP_BOX.x - 26) and sweeps +72px —
// variant E's exact translate distance — ending fully off the right edge. The
// group is clipped to the top-bar polygon, so it only ever shows inside the bar.
const SHINE_W = 26;
const SHINE_X = TOP_BOX.x - SHINE_W; // start: fully left of the inner edge (26.6 - 26)
const SHINE_TRAVEL = 72; // variant E's exact sweep distance

/**
 * Single-operator sign-in. Authenticates against Supabase via the browser
 * client (which persists the session to cookies); the proxy then sees the
 * session on the next navigation.
 *
 * The export stays named `LoginForm` (page.tsx imports it by that name) and is
 * the full-viewport variant-E surface — page.tsx renders just this element.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("Correo o contraseña incorrectos.");
      setPending(false);
      return;
    }

    router.replace("/inicio");
    router.refresh();
  }

  return (
    <div
      className="ve-root relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-backdrop"
      style={{ padding: 24 }}
    >
      {/* Local-only keyframes + tokens. Never touch globals.css. Both fill-modes
          so the end states (bars fully revealed, shine cleared, fields visible)
          persist — which is also what makes the GLOBAL reduced-motion rule
          (globals.css) collapse this to its final usable state with no extra
          media query here. */}
      <style>{`
        /* Component-local theme tokens — declared here (NOT globals.css) so the
           whole component stays "var(--x) only". The specular shine is white by
           design (it is what makes the spec-mandated 'shine' read on metal);
           routing it through a token keeps every color reference a var(--x). */
        .ve-root {
          --ve-shine: rgba(255, 255, 255, 0.92);
          --ve-shine-edge: rgba(255, 255, 255, 0);
          /* Soft warm gold for the atmospheric glow — low alpha, a subtle wash. */
          --ve-glow: rgba(212, 167, 44, 0.10);
        }
        @keyframes ve-wipe {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        /* Opacity-only fade-in. No transform/scale, so there is no rectangular
           edge to sweep into view — the gradient is full-bleed and already
           transparent before any viewport edge. */
        @keyframes ve-glow {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* The shine band travels along the top bar's inner x-range only.
           Clipped to the bar polygon, so it can never protrude past either end. */
        @keyframes ve-shine {
          0%   { transform: translateX(0);    opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateX(${SHINE_TRAVEL}px); opacity: 0; }
        }
        .ve-field:focus {
          border-color: var(--gold) !important;
          box-shadow: 0 0 0 1px var(--gold);
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
            "radial-gradient(60% 50% at 50% 34%, var(--ve-glow) 0%, transparent 70%)",
          animation: "ve-glow 1200ms ease-out both",
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
          aria-label="Forge"
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <linearGradient id="ve-silver" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--silver)" />
              <stop offset="50%" stopColor="#9a9a9a" />
              <stop offset="100%" stopColor="var(--silver)" />
            </linearGradient>
            <linearGradient id="ve-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--yellow)" />
              <stop offset="50%" stopColor="#d4a72c" />
              <stop offset="100%" stopColor="var(--yellow)" />
            </linearGradient>

            {/* Horizontal light band for the shine — transparent → specular →
                transparent. Stops reference the component-local --ve-shine /
                --ve-shine-edge tokens, so every color here is a var(--x). */}
            <linearGradient id="ve-shine-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--ve-shine-edge)" />
              <stop offset="50%" stopColor="var(--ve-shine)" />
              <stop offset="100%" stopColor="var(--ve-shine-edge)" />
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
                    animation: `ve-wipe ${BAR_DURATION}ms ${WIPE_EASE} ${b.delay}ms both`,
                  }}
                />
              </clipPath>
            ))}

            {/* clipPath holding the EXACT top-bar polygon (shared geometry). The
                shine band lives inside a group clipped by this, guaranteeing it
                stays within the top bar's shape with nothing protruding. */}
            <clipPath id="ve-topbar-clip">
              <polygon points={TOP_BAR.points} />
            </clipPath>
          </defs>

          {/* The three bars — each painted whole but masked by its wipe clip. */}
          {BUILD.map((b) => (
            <polygon
              key={b.id}
              points={b.points}
              fill={b.fill}
              clipPath={`url(#${b.id})`}
            />
          ))}

          {/* ── SHINE: clipped to the top bar polygon ONLY ──────────────────
              A band of width SHINE_W, starting fully off the bar's inner LEFT
              edge and translating +SHINE_TRAVEL to fully off the right edge.
              Clipped to the top-bar polygon, so it only ever shows inside the
              bar — never overshooting. Top bar only; middle/bottom get none. */}
          <g clipPath="url(#ve-topbar-clip)">
            <rect
              x={SHINE_X}
              y={TOP_BOX.y}
              width={SHINE_W}
              height={FMARK_BAR_HEIGHT}
              fill="url(#ve-shine-grad)"
              style={{
                mixBlendMode: "screen",
                animation: `ve-shine ${SHINE_DURATION}ms ease-in-out ${SHINE_AT}ms both`,
              }}
            />
          </g>
        </svg>

        {/* ── WORDMARK: FORGE, staggered per-letter ───────────────────────── */}
        <div
          className="uppercase"
          aria-label="FORGE"
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
          {word.split("").map((ch, i) => (
            <span
              key={i}
              aria-hidden
              style={{
                display: "inline-block",
                animation: `forge-rise ${WORD_DURATION}ms ${EASE} both`,
                animationDelay: `${WORD_AT + i * WORD_STEP}ms`,
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>

      {/* ── FORM: the REAL Supabase sign-in, with variant-E field styling and
          slide-in. Correo + Contraseña + Entrar, sitting just below the wordmark
          as part of the centered stack. ─────────────────────────────────── */}
      <form
        onSubmit={onSubmit}
        className="flex w-full flex-col"
        style={{
          maxWidth: 320,
          marginTop: 40,
          gap: 18,
        }}
      >
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            animation: `forge-rise 500ms ${EASE} both`,
            animationDelay: `${FORM_AT + FORM_STEP}ms`,
          }}
        >
          <span
            className="uppercase font-bold"
            style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)" }}
          >
            Correo
          </span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="ve-field"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderBottom: "2px solid var(--silver)",
              padding: "12px 14px",
              fontSize: 16,
              color: "var(--fg)",
              outline: "none",
            }}
          />
        </label>

        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            animation: `forge-rise 500ms ${EASE} both`,
            animationDelay: `${FORM_AT + FORM_STEP * 2}ms`,
          }}
        >
          <span
            className="uppercase font-bold"
            style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)" }}
          >
            Contraseña
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="ve-field"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderBottom: "2px solid var(--silver)",
              padding: "12px 14px",
              fontSize: 16,
              color: "var(--fg)",
              outline: "none",
            }}
          />
        </label>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 12,
              color: "var(--red, #c0392b)",
              fontWeight: 600,
              animation: `forge-rise 300ms ${EASE} both`,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="uppercase font-extrabold"
          style={{
            marginTop: 8,
            padding: "13px 16px",
            fontSize: 12.5,
            letterSpacing: 1.2,
            background: "var(--gold)",
            color: "var(--canvas)",
            border: "none",
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.7 : 1,
            animation: `forge-rise 500ms ${EASE} both`,
            animationDelay: `${FORM_AT + FORM_STEP * 3}ms`,
          }}
        >
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
