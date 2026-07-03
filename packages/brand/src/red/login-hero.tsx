import * as React from "react";

import { RedLoginAnimation } from "./login-animation";

/**
 * RED's login hero for the registry contract. The shipped ignition
 * (`./login-animation`, preserved exactly as shipped) is formless — it renders
 * no children — so wiring it directly as `loginAnimation` would silently drop
 * the slotted login form. This adapter is what makes the advertised contract
 * TRUE for RED: the untouched ignition, with `children` (the form) overlaid on
 * the lower portion of its full-viewport stage. The ignition carries its own
 * wordmark/aria, so `name` (module copy, `"RED"`) is not re-rendered here.
 *
 * Positioning is inline styles, not utility classes: the admin app does not
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
    <div style={{ position: "relative" }}>
      <RedLoginAnimation />
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
