"use client";

import { ThemeProvider } from "next-themes";

/**
 * App-wide client providers. next-themes toggles the `.dark` class on
 * <html>; light is the default (the user's design decision), system
 * preference is intentionally ignored so the in-app sun/moon toggle is
 * the single source of truth.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
