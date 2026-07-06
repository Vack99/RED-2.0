import type { BrandTokens } from "../tokens";

/**
 * The neutral *módulo base* fill of the `@gym/ui` CSS-variable contract (ADR-0012
 * §3/§4; *módulo base* — CONTEXT.md) — the marca the thousands of generic gyms
 * with no bespoke code module wear (`DEFAULT_BRAND`). A restrained slate surface
 * with ONE calm indigo accent on `--yellow`/`--gold`: deliberately quiet so a
 * gym's own `token_overrides` recolor it into their palette (that is the whole
 * point of the base + overrides path), yet intentional — never unstyled. Semantic
 * `green`/`red` and the authentic WhatsApp bubble stay put across every marca.
 *
 * Copy voice is neutral es-MX placeholder pending the HITL voice decision (Phase 4
 * terminal slice) — see the registry's `base.copy`.
 */
export const baseTokens: BrandTokens = {
  light: {
    canvas: "#f6f6f7",
    surface: "#ffffff",
    sunk: "#ececee",
    line: "#e3e3e6",
    "line-soft": "#efeff1",

    yellow: "#5b6698",
    gold: "#3f4670",
    "yellow-dim": "#7b83b0",
    "yellow-soft": "rgba(91, 102, 152, 0.14)",
    "yellow-edge": "rgba(63, 70, 112, 0.4)",
    "press-yellow": "#6b76a8",

    silver: "#6b6b70",
    "silver-dim": "#9a9aa0",

    fg: "#17171a",
    muted: "#7b7b82",
    "muted-soft": "#bcbcc2",

    green: "#1f9d57",
    red: "#d6443c",
    warning: "#d97706",
    "green-soft": "rgba(31, 157, 87, 0.13)",
    "red-soft": "rgba(214, 68, 60, 0.12)",
    "warning-soft": "rgba(217, 119, 6, 0.13)",

    "wa-bubble": "#d9fdd3",
    "wa-bubble-fg": "#111b21",
    "wa-bubble-meta": "rgba(17, 27, 33, 0.5)",

    ink: "#0a0a0a",
    glass: "rgba(255, 255, 255, 0.78)",
    scrim: "rgba(20, 20, 24, 0.42)",
    "tab-bg": "#ffffff",

    backdrop: "#eaeaec",
  },
  dark: {
    canvas: "#0b0b0d",
    surface: "#161618",
    sunk: "#070708",
    line: "#232327",
    "line-soft": "#19191c",

    yellow: "#8a93d6",
    gold: "#8a93d6",
    "yellow-dim": "#565d8a",
    "yellow-soft": "rgba(138, 147, 214, 0.14)",
    "yellow-edge": "rgba(138, 147, 214, 0.42)",
    "press-yellow": "#9aa3e0",

    silver: "#c4c4c8",
    "silver-dim": "#6d6d72",

    fg: "#fafafa",
    muted: "#7a7a80",
    "muted-soft": "#3f3f44",

    green: "#5cd47a",
    red: "#ff5a5a",
    warning: "#f59e0b",
    "green-soft": "rgba(92, 212, 122, 0.14)",
    "red-soft": "rgba(255, 90, 90, 0.14)",
    "warning-soft": "rgba(245, 158, 11, 0.14)",

    "wa-bubble": "#005c4b",
    "wa-bubble-fg": "#e9edef",
    "wa-bubble-meta": "rgba(233, 237, 239, 0.6)",

    ink: "#0a0a0a",
    glass: "rgba(22, 22, 24, 0.72)",
    scrim: "rgba(0, 0, 0, 0.64)",
    "tab-bg": "#0b0b0d",

    backdrop: "#050506",
  },
};
