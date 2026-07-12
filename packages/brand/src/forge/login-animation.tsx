import * as React from "react";

import { ForgeIgnitionMark } from "./ignition-mark";

// Forge's ONE bespoke login hero — the code-preset path (ADR-0012 consequences):
// a brand ships baseline tokens + logo, and MAY carry one bespoke code artifact so
// the tracer proves more than a palette swap. Forge's is the F-mark bar-build
// IGNITION (the bars wipe in, the wordmark rises, a shine sweeps the top bar) —
// a mechanism distinct from RED's neon-ring ignition, so the two brands diverge
// in CODE, not just color.
//
// The ignition itself is the SHARED `ForgeIgnitionMark` (grill lock (h): the
// artifact lives in the brand module, self-contained). This hero is the login
// FRAME around it: the dark stage, the atmospheric glow, and the interactive form
// slotted in as `children` (it carries the Supabase seam, which cannot cross into
// @gym/brand). The landing renders the very same mark sans this frame, so login
// and landing feel like one product. Presentation-only and hook-free (no
// `use client`): imports only React + the sibling mark, so the frozen
// `brand ✗→ data/domain` boundary holds.

/**
 * Forge's login hero. `name` supplies the wordmark text + aria label (module
 * copy, so per-gym `brand_name` row data flows through once wired); `children`
 * is the login form, slotted into the centered stack below the mark. Consumed by
 * the admin + client login pages via the resolved module.
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
      {/* Login-only chrome: the atmospheric glow token + its keyframe. The
          ignition's own keyframes/tokens live self-contained in ForgeIgnitionMark;
          this hero adds only the ambient wash behind it. */}
      <style>{`
        .forge-login-root {
          /* The atmospheric glow is the ACCENT at low alpha — a subtle wash, not a
             color of its own. It was rgba(212,167,44,.10): a third hardcoded copy of
             the mark's gold, which could not follow a palette change — so a gym's
             token_overrides recolored the form and the mark and left a stale gold
             halo behind them. color-mix derives it from the live accent at the same
             10% alpha, so the wash tracks whatever --yellow resolves to. */
          --forge-login-glow: color-mix(in srgb, var(--yellow) 10%, transparent);
        }
        /* Opacity-only fade-in. No transform/scale, so there is no rectangular
           edge to sweep into view — the gradient is full-bleed and already
           transparent before any viewport edge. */
        @keyframes forge-login-ambient {
          from { opacity: 0; }
          to   { opacity: 1; }
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

      {/* HERO — the shared ignition mark, vertically centered with the form as
          one stack. */}
      <ForgeIgnitionMark name={name} />

      {/* The interactive login form, slotted below the wordmark as part of the
          centered stack. It owns its own product-motion entrance, timed to
          follow this hero. */}
      {children}
    </div>
  );
}
