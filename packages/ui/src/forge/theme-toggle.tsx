"use client";

import { useTheme } from "next-themes";
import * as React from "react";
import { Icon } from "./icon";

/**
 * Sun/moon theme switch — the 38px bordered button used in the Cuenta
 * app bar. Renders a stable placeholder until mounted to avoid a
 * hydration mismatch on the resolved theme.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical one-time mount guard to avoid an SSR hydration mismatch (next-themes)
  React.useEffect(() => setMounted(true), []);

  const isLight = resolvedTheme !== "dark";

  return (
    <button
      onClick={() => setTheme(isLight ? "dark" : "light")}
      // Until mounted, the resolved theme is unknown on the server — keep the label
      // theme-neutral so SSR and the first client render match (same guard as the icon).
      aria-label={!mounted ? "Cambiar tema" : isLight ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
      style={{ width: 38, height: 38, padding: 0, cursor: "pointer" }}
    >
      {mounted && <Icon name={isLight ? "moon" : "sun"} size={16} color="var(--gold)" />}
    </button>
  );
}
