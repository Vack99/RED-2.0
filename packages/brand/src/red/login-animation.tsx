import * as React from "react";

import { RedMark } from "./logo";

// RED's ONE bespoke login animation — the code-preset path (ADR-0012 consequences):
// a brand ships baseline tokens + logo, and MAY carry one bespoke code artifact so
// the tracer proves more than a palette swap. RED's is an "ignite" hero: the chevron
// mark scales up out of an ember glow, then the RED wordmark rises. A mechanism
// distinct from Forge's login (a left-to-right loading-bar wipe), so the two brands
// diverge in CODE, not just color.
//
// Presentation-only and hook-free (no `use client`): keyframes are declared in a
// local <style> with a `red-*` prefix so they never collide with globals.css's
// `forge-*` set, and every color routes through the CSS-var contract.

const MARK_SIZE = 132;

/** RED's login hero. Consumed by the client app's login route (later slice). */
export function RedLoginAnimation() {
  return (
    <div
      className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-backdrop"
      style={{ padding: 24 }}
    >
      <style>{`
        @keyframes red-ignite {
          from { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes red-ember {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes red-rise {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Ember glow behind the mark — full-bleed, fades to transparent well before
          any edge, so there is no rectangular boundary to reveal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(55% 45% at 50% 42%, var(--yellow-soft) 0%, transparent 70%)",
          animation: "red-ember 900ms ease-out both",
        }}
      />

      <div className="relative flex flex-col items-center">
        <div style={{ animation: "red-ignite 640ms cubic-bezier(.32,.72,0,1) both" }}>
          <RedMark size={MARK_SIZE} />
        </div>
        <span
          className="uppercase"
          aria-label="RED"
          style={{
            marginTop: 28,
            fontWeight: 800,
            fontSize: 56,
            letterSpacing: 14,
            marginRight: -14,
            color: "var(--yellow)",
            lineHeight: 1,
            animation: "red-rise 420ms cubic-bezier(.32,.72,0,1) both",
            animationDelay: "560ms",
          }}
        >
          RED
        </span>
      </div>
    </div>
  );
}
