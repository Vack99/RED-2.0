import type { BrandTokens } from "../tokens";

/**
 * Forge's structured fill of the `@gym/ui` CSS-variable contract (ADR-0012
 * §3/§4) — light + dark records keyed by contract name, rendered by the ONE
 * `tokensToCss` serializer (`../tokens`). These are the Forge token VALUES
 * relocated out of `apps/admin/globals.css` so Forge is defined once.
 *
 * Token roles: `--yellow` = FILL accent · `--gold` = foreground accent text/icon ·
 * `--ink` = constant dark placed ON a yellow fill. Light is the default; `.dark`
 * swaps the whole surface/text/line palette in place.
 */
export const forgeTokens: BrandTokens = {
  light: {
    canvas: "#f4f2ed",
    surface: "#ffffff",
    sunk: "#e8e5de",
    line: "#e2ded4",
    "line-soft": "#ece9e1",

    yellow: "#e3a81f",
    gold: "#8f6d09",
    "yellow-dim": "#caa23c",
    "yellow-soft": "rgba(227, 168, 31, 0.16)",
    "yellow-edge": "rgba(143, 109, 9, 0.4)",
    "press-yellow": "#f0bb45",

    silver: "#6f6e69",
    "silver-dim": "#9b9a93",

    fg: "#16150f",
    muted: "#82807a",
    "muted-soft": "#bdbab2",

    green: "#1f9d57",
    red: "#d6443c",
    "green-soft": "rgba(31, 157, 87, 0.13)",
    "red-soft": "rgba(214, 68, 60, 0.12)",

    "wa-bubble": "#d9fdd3",
    "wa-bubble-fg": "#111b21",
    "wa-bubble-meta": "rgba(17, 27, 33, 0.5)",

    ink: "#0a0a0a",
    glass: "rgba(255, 255, 255, 0.78)",
    scrim: "rgba(24, 22, 16, 0.42)",
    "tab-bg": "#ffffff",

    backdrop: "#e7e3d9",
  },
  dark: {
    canvas: "#0a0a0a",
    surface: "#141414",
    sunk: "#070707",
    line: "#1f1f1f",
    "line-soft": "#161616",

    yellow: "#f5c542",
    gold: "#f5c542",
    "yellow-dim": "#7a6020",
    "yellow-soft": "rgba(245, 197, 66, 0.14)",
    "yellow-edge": "rgba(245, 197, 66, 0.42)",
    "press-yellow": "#ffd54f",

    silver: "#c5c5c5",
    "silver-dim": "#6e6e6e",

    fg: "#fafafa",
    muted: "#7a7a7a",
    "muted-soft": "#3f3f3f",

    green: "#5cd47a",
    red: "#ff5a5a",
    "green-soft": "rgba(92, 212, 122, 0.14)",
    "red-soft": "rgba(255, 90, 90, 0.14)",

    "wa-bubble": "#005c4b",
    "wa-bubble-fg": "#e9edef",
    "wa-bubble-meta": "rgba(233, 237, 239, 0.6)",

    ink: "#0a0a0a",
    glass: "rgba(20, 20, 20, 0.72)",
    scrim: "rgba(0, 0, 0, 0.64)",
    "tab-bg": "#0a0a0a",

    backdrop: "#050505",
  },
};
