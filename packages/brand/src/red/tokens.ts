import type { BrandTokens, TokenScheme } from "../tokens";

/**
 * RED's structured fill of the same `@gym/ui` CSS-variable contract Forge
 * fills (ADR-0012 §3/§4), rendered by the ONE `tokensToCss` serializer
 * (`../tokens`). The contract is filled by NAME, not renamed: the
 * FILL-accent key stays `yellow` and simply carries the mock's solid crimson
 * here, so every `@gym/ui` primitive re-colors with zero edits. `green` / `red`
 * keep their SEMANTIC roles (success / error), retuned neon-legible on
 * near-black; the green WhatsApp bubble stays authentic (not the brand hue).
 *
 * RED is a DARK-ONLY neon identity (owner decision): there is no cream light
 * scheme to keep in sync, so ONE `redNeon` scheme fills BOTH `light` and `dark`.
 * That kills the vestigial light config and also insures against FOUC — whether
 * a screen paints `:root,.light` or `.dark`, it lands on the same near-black
 * neon. Values are pixel-matched to the mock `:root`
 * (`Red-1.0-Design/index.html` — remediation §3.1). The mock's four bg tiers
 * (`--canvas`/`--bg`/`--bg2`/`--surface`) map onto the contract's tiers as
 * `backdrop`/`canvas`/`sunk`/`surface`; the mock's `--ink` (primary *light*
 * text `#fafafa`) fills `fg` (NOT the contract's `ink`, which keeps its
 * near-black overlay role). Do NOT collapse the three reds — the crimson fill
 * (`yellow`), the deep-crimson accent text (`gold`), and the `rgb(239,43,26)`
 * tint base (`yellow-soft`/`yellow-edge`) each carry the neon depth. The
 * glow/ember `--rp-*` reds are brand-scoped (animation slice), not contract keys.
 *
 * `yellow-fg` — the foreground ON the crimson fill — is WHITE here (6.78:1),
 * where Forge's dark accent takes near-black (near-black on this crimson is
 * 2.92:1, a fail). That split is precisely why the key is per-brand rather than
 * a literal in the button: RED's buttons must not change at all.
 */
const redNeon: TokenScheme = {
  canvas: "#0a0a0a",
  surface: "#121212",
  sunk: "#0e0e0e",
  line: "#1f1f1f",
  "line-soft": "#262626",

  yellow: "#b5161c",
  gold: "#7e0d10",
  "yellow-dim": "#9a2b28",
  "yellow-soft": "rgba(239, 43, 26, 0.13)",
  "yellow-edge": "rgba(239, 43, 26, 0.4)",
  "press-yellow": "#d92b1f",
  "yellow-fg": "#ffffff",
  "yellow-core": "#841014",

  silver: "#c5c5c5",
  "silver-dim": "#8c8c8c",
  "silver-core": "#9a9a9a",

  fg: "#fafafa",
  muted: "#7a7a7a",
  "muted-soft": "#5e5e5e",

  green: "#5cd47a",
  red: "#ff5a5a",
  warning: "#e8902a",
  "green-soft": "rgba(92, 212, 122, 0.14)",
  "red-soft": "rgba(255, 90, 90, 0.14)",
  "warning-soft": "rgba(232, 144, 42, 0.14)",

  "wa-bubble": "#005c4b",
  "wa-bubble-fg": "#e9edef",
  "wa-bubble-meta": "rgba(233, 237, 239, 0.6)",

  ink: "#0a0a0a",
  glass: "rgba(18, 18, 18, 0.72)",
  scrim: "rgba(0, 0, 0, 0.64)",
  "tab-bg": "#0a0a0a",

  backdrop: "#050505",
};

export const redTokens: BrandTokens = {
  light: redNeon,
  dark: redNeon,
};
