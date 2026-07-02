import type { BrandTokens } from "../tokens";

/**
 * RED's structured fill of the same `@gym/ui` CSS-variable contract Forge
 * fills (ADR-0012 §3/§4), rendered by the ONE `tokensToCss` serializer
 * (`../tokens`). The contract is filled by NAME, not renamed: the
 * FILL-accent key stays `yellow` and simply carries a crimson value here,
 * so every `@gym/ui` primitive re-colors with zero edits. `green` / `red`
 * keep their SEMANTIC roles (success / error), unchanged across brands.
 * Green WhatsApp bubble stays authentic (not the brand hue).
 */
export const redTokens: BrandTokens = {
  light: {
    canvas: "#faf6f6",
    surface: "#ffffff",
    sunk: "#f1e7e7",
    line: "#ecdede",
    "line-soft": "#f4eaea",

    yellow: "#dc2626",
    gold: "#a11212",
    "yellow-dim": "#c4433c",
    "yellow-soft": "rgba(220, 38, 38, 0.14)",
    "yellow-edge": "rgba(161, 18, 18, 0.4)",
    "press-yellow": "#ef4444",

    silver: "#6f6a6a",
    "silver-dim": "#9b9494",

    fg: "#1a1010",
    muted: "#857c7c",
    "muted-soft": "#bdb4b4",

    green: "#1f9d57",
    red: "#d6443c",
    "green-soft": "rgba(31, 157, 87, 0.13)",
    "red-soft": "rgba(214, 68, 60, 0.12)",

    "wa-bubble": "#d9fdd3",
    "wa-bubble-fg": "#111b21",
    "wa-bubble-meta": "rgba(17, 27, 33, 0.5)",

    ink: "#0a0a0a",
    glass: "rgba(255, 255, 255, 0.78)",
    scrim: "rgba(28, 16, 16, 0.42)",
    "tab-bg": "#ffffff",

    backdrop: "#efe0e0",
  },
  dark: {
    canvas: "#0c0808",
    surface: "#161010",
    sunk: "#080505",
    line: "#241c1c",
    "line-soft": "#1a1414",

    yellow: "#f04444",
    gold: "#f04444",
    "yellow-dim": "#7a2020",
    "yellow-soft": "rgba(240, 68, 68, 0.14)",
    "yellow-edge": "rgba(240, 68, 68, 0.42)",
    "press-yellow": "#ff5a5a",

    silver: "#c5bcbc",
    "silver-dim": "#6e6666",

    fg: "#faf5f5",
    muted: "#7a7070",
    "muted-soft": "#3f3838",

    green: "#5cd47a",
    red: "#ff5a5a",
    "green-soft": "rgba(92, 212, 122, 0.14)",
    "red-soft": "rgba(255, 90, 90, 0.14)",

    "wa-bubble": "#005c4b",
    "wa-bubble-fg": "#e9edef",
    "wa-bubble-meta": "rgba(233, 237, 239, 0.6)",

    ink: "#0a0a0a",
    glass: "rgba(22, 16, 16, 0.72)",
    scrim: "rgba(0, 0, 0, 0.64)",
    "tab-bg": "#0c0808",

    backdrop: "#050303",
  },
};
