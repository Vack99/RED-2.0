import * as React from "react";

import { RedRingMark } from "./ring-mark";

/**
 * RED's login hero for the registry contract: the mock's top-down auth flow
 * (index.html `.slot[data-slot="entrar"]`) — the neon-ring ignition + the shared
 * brand chrome (eyebrow, tagline) framing `children` (the login form) in normal
 * document flow, not a form bottom-pinned over a full-viewport stage. The
 * `loginAnimation` contract requires rendering `children`; the ring carries no
 * form slot of its own, so this adapter is what makes the advertised contract
 * TRUE for RED.
 *
 * The ring + eyebrow + tagline are the CONSTANT brand chrome (same on entrar /
 * registro / restablecer); each form owns only its own title/desc/fields, so
 * the eyebrow and the neon tagline live here once. The ring carries its own
 * wordmark/aria, so `name` (module copy, `"RED"`) is not re-rendered.
 *
 * The stage is inline styles, not utility classes: the admin app does not
 * `@source`-scan this package, so classes unique to this file would be
 * tree-shaken there. `.cm-vals` is the one exception — it is a literal class in
 * the client's globals.css (always emitted, not tree-shaken), carrying the
 * `.dark` neon-crimson tagline treatment (§3.3).
 */
export function RedLoginHero({
  children,
}: {
  readonly name: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "var(--backdrop)",
        padding: "44px 24px 36px",
        overflowY: "auto",
      }}
    >
      <RedRingMark size={140} />
      <div
        style={{
          marginTop: 16,
          fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "var(--muted-soft)",
        }}
      >
        Entrenamiento funcional
      </div>

      <div
        style={{
          width: "100%",
          marginTop: 26,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {children}
      </div>

      <div
        className="cm-vals"
        style={{ marginTop: "auto", paddingTop: 34, textAlign: "center" }}
      >
        <span>Con beneficios de luz roja</span>
      </div>
    </div>
  );
}
