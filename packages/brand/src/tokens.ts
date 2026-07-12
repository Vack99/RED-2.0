/**
 * The brand token contract (*contrato de marca* — CONTEXT.md): the 33 CSS
 * variable names every `@gym/ui` primitive reads, independent of which brand
 * fills them (ADR-0012 §3/§4). `TOKEN_KEYS` is the single source the key union,
 * the per-brand `TokenScheme` maps, and (later, Phase-4 S4) the zod
 * override schema all derive from.
 *
 * `yellow-fg` is the foreground that sits ON a solid `yellow` fill, and it is
 * PER-BRAND on purpose: Forge dark and base dark carry a light accent and need
 * near-black on it, while RED's crimson and base light need white — no single
 * hardcoded foreground (and no reuse of `ink`, which is also the text on the
 * amber `warning` fill, where white would break) can serve both. It follows the
 * `wa-bubble` / `wa-bubble-fg` precedent: a fill and its legible foreground are
 * two keys, not one.
 *
 * `yellow-core` / `silver-core` are the deep bands inside the brand mark's
 * metallic gradients. They exist because the mark's REAL color used to be a
 * literal in the SVG, which meant a gym's `token_overrides` could recolor its
 * buttons but not its logo — the contract has to reach every pixel the brand
 * owns, or the escape hatch is a half-brand.
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
  "yellow-fg",
  "yellow-core",

  "silver",
  "silver-dim",
  "silver-core",

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
