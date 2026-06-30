"use client";

import { ThemeProvider } from "next-themes";

/**
 * App-wide client providers. next-themes toggles the `.dark` class on
 * <html>; light is the default (the user's design decision), system
 * preference is intentionally ignored so the in-app sun/moon toggle is
 * the single source of truth.
 *
 * `disableTransitionOnChange` is intentionally OFF. next-themes' suppression
 * works by injecting a global `*{transition:none!important}` for one frame
 * during the class swap, which would also kill the deliberate surface
 * cross-fade. With it off, a sun/moon toggle cross-fades EVERY token-colored
 * element that carries a color/background transition — the html/body backdrop
 * (globals.css) plus the chrome that opts in (TabBar pill + labels, and the
 * visible Badge / Avatar / Segmented / DayStrip cells). That is intentional:
 * all of them share the 180–220ms cubic-bezier(.32,.72,0,1) curve, so the
 * theme swap reads as one coordinated cross-fade rather than a single surface.
 * The initial theme is set by next-themes' blocking inline script before first
 * paint, and the on-mount re-apply is idempotent (same class), so relaxing this
 * neither flashes the wrong theme nor animates the first paint — the cross-fade
 * only fires on a real user toggle.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </ThemeProvider>
  );
}
