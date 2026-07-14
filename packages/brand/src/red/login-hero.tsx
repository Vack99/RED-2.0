import * as React from "react";

import { RedRingMark } from "./ring-mark";

/**
 * RED's login hero for the registry contract: the mock's top-down auth flow
 * (index.html `.slot[data-slot="entrar"]`) — the neon-ring ignition + the shared
 * brand chrome (band, tagline) framing `children` (the login form) in normal
 * document flow, not a form bottom-pinned over a full-viewport stage. The
 * `loginAnimation` contract requires rendering `children`; the ring carries no
 * form slot of its own, so this adapter is what makes the advertised contract
 * TRUE for RED.
 *
 * ONE component, four screens: the admin login and the client's entrar / registro
 * / restablecer. The ring + band are the CONSTANT brand chrome across all four;
 * each form owns only its own title/desc/fields.
 *
 * `tagline` is the one thing that varies, and it is OPT-IN: the admin login passes
 * "ADMINISTRADOR" to declare which side of the platform you are signing in to, and
 * the client's auth screens pass nothing and show no line at all — a member on
 * /entrar does not need to be sold the gym they are already logging into. It sits
 * directly under the band, ABOVE the form, because it labels the destination; a line
 * trailing the form reads as a footer, which is what it looked like when it hung at
 * the bottom. It is deliberately NOT `copy.tagline` — the client LANDING renders that
 * one ("Con beneficios de luz roja") and is the one place the sell belongs.
 *
 * The ring carries its own wordmark/aria, so `name` (module copy, `"RED"`) is not
 * re-rendered.
 *
 * `justifyContent: center` against a MIN-height (never a fixed height) is what
 * centers the stack: when the form outgrows the viewport the box simply grows, free
 * space goes to zero, and the centering becomes a no-op — so a long form (registro)
 * can never be clipped at the top and needs no `safe` keyword. For the same reason
 * the stage sets no `overflow`: a scroll container here would crop the ring's glow.
 *
 * The stage is inline styles, not utility classes: the admin app does not
 * `@source`-scan this package, so classes unique to this file would be tree-shaken
 * there. The `.cm-*` classes are the exception — they are literal classes shipped
 * from a stylesheet (`./neon.css`, imported by both apps), so they always survive,
 * and they carry the neon band + crimson tagline treatment (§3.3).
 */
export function RedLoginHero({
  tagline,
  children,
}: {
  readonly name: string;
  readonly tagline?: string;
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
        justifyContent: "center",
        background: "var(--backdrop)",
        padding: "44px 24px 36px",
      }}
    >
      <RedRingMark size={200} />

      <div className="cm-sub">
        <div className="ln" aria-hidden />
        <span>Entrenamiento funcional</span>
        <div className="ln" aria-hidden />
      </div>

      {tagline ? (
        <div className="cm-vals" style={{ textAlign: "center" }}>
          <span>{tagline}</span>
        </div>
      ) : null}

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
    </div>
  );
}
