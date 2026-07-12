import type { BrandTokens } from "../tokens";

/**
 * Forge's structured fill of the `@gym/ui` CSS-variable contract (ADR-0012
 * §3/§4) — light + dark records keyed by contract name, rendered by the ONE
 * `tokensToCss` serializer (`../tokens`). These are the Forge token VALUES
 * relocated out of `apps/admin/globals.css` so Forge is defined once.
 *
 * Token roles: `--yellow` = FILL accent · `--gold` = foreground accent text/icon ·
 * `--yellow-fg` = the text/icon placed ON a solid `--yellow` fill · `--ink` =
 * constant dark placed on the amber `--warning` fill · `--yellow-core` /
 * `--silver-core` = the deep bands inside the F-mark's gold/silver metallic
 * gradients. Light is the default; `.dark` swaps the whole surface/text/line
 * palette in place.
 *
 * `--yellow-fg` is a key and not a hardcoded `text-white` because the client's
 * dark accent takes near-black (`#0a0a0a`, 8.83:1) while RED's crimson takes
 * white — one token, two brands, no possible shared literal. It is NOT `--ink`:
 * `--ink` is the foreground on the amber WARNING fill, and the two roles diverge
 * the moment a brand's accent is dark.
 *
 * `--yellow-core` / `--silver-core` used to be `#d4a72c` / `#9a9a9a` literals in
 * `logo.tsx` + `ignition-mark.tsx`, which put the mark outside the contract: a
 * gym's `token_overrides` could recolor every button and still ship someone
 * else's logo. Keep each `-core` ~11 L* below its parent (`--yellow` /
 * `--silver`) — that gap IS the bevel.
 *
 * DARK's accent is the mark's own gold (`#d4a72c`), not a hotter amber. One
 * token used to serve accent-stroke, button-fill, and mark-gradient duty; the
 * fill was `#f5c542` with hardcoded white on it (1.62:1) while the mark beside
 * it was already `#d4a72c`. `--gold` (the accent-TEXT role, e.g. the BOOTCAMP
 * wordmark) MUST track it — leaving `--gold` hot re-creates exactly the accent
 * mismatch this deepening exists to kill. `--press-yellow` is a LIFT above the
 * accent, kept at ~+5 L* (`#e2b843`); reusing the old `#ffd54f` against the
 * deepened accent would be a +16 L* flashbulb.
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
    "yellow-fg": "#0a0a0a",
    "yellow-core": "#d4a72c",

    silver: "#6f6e69",
    "silver-dim": "#9b9a93",
    "silver-core": "#9a9a9a",

    fg: "#16150f",
    muted: "#82807a",
    "muted-soft": "#bdbab2",

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

    yellow: "#d4a72c",
    gold: "#d4a72c",
    "yellow-dim": "#7a6020",
    "yellow-soft": "rgba(212, 167, 44, 0.14)",
    "yellow-edge": "rgba(212, 167, 44, 0.42)",
    "press-yellow": "#e2b843",
    "yellow-fg": "#0a0a0a",
    "yellow-core": "#b18b24",

    silver: "#c5c5c5",
    "silver-dim": "#6e6e6e",
    "silver-core": "#9a9a9a",

    fg: "#fafafa",
    muted: "#7a7a7a",
    "muted-soft": "#3f3f3f",

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
    glass: "rgba(20, 20, 20, 0.72)",
    scrim: "rgba(0, 0, 0, 0.64)",
    "tab-bg": "#0a0a0a",

    backdrop: "#050505",
  },
};
