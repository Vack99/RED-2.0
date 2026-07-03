import type { BrandModule } from "./registry";
import { parseTokenOverrides, type TokenOverrides } from "./token-overrides";
import { TOKEN_KEYS, tokensToCss, type BrandTokens, type TokenScheme } from "./tokens";

/**
 * The module ⊕ overrides merge (PRD grill (b); the *A escala* mechanism —
 * CONTEXT.md): the served CSS is `baseline del módulo ⊕ token_overrides`. This is
 * the SINGLE entry point both layouts call to produce the SSR-inlined `<style>`
 * block, and (validating its untrusted argument) the guard on that
 * `dangerouslySetInnerHTML` sink.
 *
 * Overrides arrive as an ARGUMENT the app fetched — `@gym/brand` never fetches
 * (the `brand ✗→ data` boundary is frozen; ADR-0011 §6). Empty/absent/invalid
 * overrides return the module's precomputed baseline `css` unchanged: the
 * thousands-of-generic-gyms fast path costs nothing per request, and an invalid
 * payload fails safe to the intact baseline (`parseTokenOverrides`).
 */
export function brandCss(module: BrandModule, rawOverrides?: unknown): string {
  const overrides = parseTokenOverrides(rawOverrides);
  if (isEmpty(overrides)) return module.css;
  return tokensToCss(mergeTokens(module.tokens, overrides));
}

/** No scheme carries an override → the precomputed-baseline fast path applies. */
function isEmpty(overrides: TokenOverrides): boolean {
  return !hasKeys(overrides.light) && !hasKeys(overrides.dark);
}

function hasKeys(map: TokenOverrides["light"]): boolean {
  return map !== undefined && Object.keys(map).length > 0;
}

/** Overlay each scheme's partial overrides onto the module baseline (override wins). */
function mergeTokens(base: BrandTokens, overrides: TokenOverrides): BrandTokens {
  return {
    light: mergeScheme(base.light, overrides.light),
    dark: mergeScheme(base.dark, overrides.dark),
  };
}

/**
 * A defined string override replaces the baseline value for that key; every other
 * key keeps the module baseline. Iterating `TOKEN_KEYS` (never a raw spread) means
 * only contract keys can ever land in the merged scheme — a second structural
 * backstop behind the schema's key-enum.
 */
function mergeScheme(base: TokenScheme, over: TokenOverrides["light"]): TokenScheme {
  if (over === undefined) return base;
  const merged: TokenScheme = { ...base };
  for (const key of TOKEN_KEYS) {
    const value = over[key];
    if (typeof value === "string") merged[key] = value;
  }
  return merged;
}
