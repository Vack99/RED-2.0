/**
 * The brand token contract (*contrato de marca* — CONTEXT.md): the ~28 CSS
 * variable names every `@gym/ui` primitive reads, independent of which brand
 * fills them (ADR-0012 §3/§4). `TOKEN_KEYS` is the single source the key union,
 * the per-brand `TokenScheme` maps, and (later, Phase-4 S4) the zod
 * override schema all derive from.
 */
export const TOKEN_KEYS = [
  "canvas",
  "surface",
  "sunk",
  "line",
  "line-soft",

  "yellow",
  "gold",
  "yellow-dim",
  "yellow-soft",
  "yellow-edge",
  "press-yellow",

  "silver",
  "silver-dim",

  "fg",
  "muted",
  "muted-soft",

  "green",
  "red",
  "warning",
  "green-soft",
  "red-soft",
  "warning-soft",

  "wa-bubble",
  "wa-bubble-fg",
  "wa-bubble-meta",

  "ink",
  "glass",
  "scrim",
  "tab-bg",

  "backdrop",
] as const;

/** One contract variable name (e.g. `"yellow-soft"`), sans the `--` prefix. */
export type TokenKey = (typeof TOKEN_KEYS)[number];

/** A brand's fill of the full contract for one color scheme. */
export type TokenScheme = Record<TokenKey, string>;

/** A brand's structured tokens — light and dark are independent, complete fills. */
export interface BrandTokens {
  readonly light: TokenScheme;
  readonly dark: TokenScheme;
}

/** Render one scheme's variables, one `--key: value;` declaration per line. */
function renderScheme(scheme: TokenScheme): string {
  return Object.entries(scheme)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");
}

/**
 * THE serializer (PRD grill lock (b)): structured tokens in, the exact
 * `:root,.light { … } .dark { … }` block out. The one home for this
 * rendering — Phase 2 inlined it with a single caller; the module ⊕
 * overrides merge (S4) is its second producer.
 */
export function tokensToCss(tokens: BrandTokens): string {
  return `:root,\n.light {\n${renderScheme(tokens.light)}\n}\n\n.dark {\n${renderScheme(tokens.dark)}\n}`;
}
