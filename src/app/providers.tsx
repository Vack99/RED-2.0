"use client";

import { ThemeProvider } from "next-themes";

/**
 * App-wide client providers. next-themes toggles the `.dark` class on
 * <html>; light is the default (the user's design decision), system
 * preference is intentionally ignored so the in-app sun/moon toggle is
 * the single source of truth.
 *
 * `disableTransitionOnChange` is intentionally OFF so the scoped html
 * background/color transition (globals.css) can cross-fade the surface on a
 * sun/moon toggle. The initial theme is set by next-themes' blocking inline
 * script before first paint, and the on-mount re-apply is idempotent (same
 * class), so relaxing this neither flashes the wrong theme nor animates the
 * first paint — the transition only fires on a real user toggle.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </ThemeProvider>
  );
}
