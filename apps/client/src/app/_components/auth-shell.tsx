import type { ComponentType, ReactNode } from "react";

/**
 * The clean, motion-free auth frame for a brand module that omits a bespoke login
 * hero (the neutral base module — grill lock (h); the mapped red/forge hosts ship
 * a `loginAnimation` and never reach this). It is the hero's disciplined resting
 * state: the resolved module's own lockup centered over the slotted form, every
 * color from the CSS-var contract, nothing animated. Shared by /entrar and
 * /restablecer so the optional-hero fallback has one home.
 */
export function AuthShell({
  logo: Logo,
  children,
}: {
  readonly logo: ComponentType<{ size?: number }>;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-canvas"
      style={{ padding: 24, gap: 8 }}
    >
      <Logo size={22} />
      {children}
    </div>
  );
}
