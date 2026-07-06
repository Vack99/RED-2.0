import * as React from "react";

import { RedRingMark } from "./ring-mark";

/**
 * RED's login hero for the registry contract: the neon-ring ignition on a
 * full-viewport dark stage, with `children` (the login form) overlaid on the
 * lower portion. The `loginAnimation` contract requires rendering `children` —
 * the ring carries no form slot of its own, so this adapter is what makes the
 * advertised contract TRUE for RED. The ring carries its own wordmark/aria, so
 * `name` (module copy, `"RED"`) is not re-rendered here.
 *
 * The stage is inline styles, not utility classes: the admin app does not
 * `@source`-scan this package, so classes unique to this file would be
 * tree-shaken there.
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
        justifyContent: "center",
        overflow: "hidden",
        background: "var(--backdrop)",
        padding: 24,
      }}
    >
      <RedRingMark size={200} animate idSuffix="hero" />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: 24,
        }}
      >
        {children}
      </div>
    </div>
  );
}
