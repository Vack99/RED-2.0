import type { ComponentType, ReactNode } from "react";

// The clean, motion-free login for a brand module that omits a bespoke login
// hero (the neutral base module, later — grill lock (h)). It is the animated
// hero's disciplined resting state: the resolved module's own lockup centered
// over the form, everything token-driven, nothing animated. Exercising this path
// is what proves the `loginAnimation?` contract is genuinely optional.
export function StaticLogin({
  logo: Logo,
  children,
}: {
  readonly logo: ComponentType<{ size?: number }>;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-backdrop"
      style={{ padding: 24, gap: 8 }}
    >
      <Logo size={22} />
      {children}
    </div>
  );
}
