import { z } from "zod";

import { TOKEN_KEYS, type TokenKey } from "./tokens";

/**
 * The `token_overrides` schema (PRD grill (a); *token overrides* — CONTEXT.md):
 * the machine-checked mirror of the *contrato de marca*. A gym personalizes its
 * marca with DATA — a partial `{ light?, dark? }` map of contract-key → CSS value
 * on its `gym` row — and this schema is the sole gate before those values reach
 * the `dangerouslySetInnerHTML` `<style>` sink both layouts inline. Two closed
 * dimensions make an injection unrepresentable rather than merely filtered:
 *
 *   1. **Keys** — only the ~28 `TOKEN_KEYS` (derived here, single source): an
 *      unknown key is a typo or an attack, both rejected. Light and dark are
 *      independent partial maps, so a value's destination scheme is never ambiguous.
 *   2. **Values** — a conservative charset whitelist (letters, digits, and
 *      `# % ( ) , . / space -`; length-capped) — enough for every color syntax the
 *      contract uses (hex, `rgba(…)`, `%`) while making `</style>` breakout,
 *      declaration injection (`;`/`}`), and `url(scheme:…)` unrepresentable: the
 *      excluded `: ; < > { } " ' \` characters cannot appear.
 *
 * ANY defect rejects the WHOLE payload (`parseTokenOverrides`), so the render falls
 * back to the intact module baseline — fail-safe, never half-branded.
 */

/** Max chars for one CSS value — `rgba(255, 255, 255, 0.42)` is ~24; 64 leaves headroom. */
const MAX_VALUE_LENGTH = 64;

/**
 * One overridable CSS value: non-empty, length-capped, charset-whitelisted. The
 * regex is the injection guard — no `:` (blocks `url(js:…)`), `;`/`{`/`}` (blocks
 * declaration/block injection), `<`/`>`/`"`/`'`/`\` (blocks tag/attr breakout).
 */
const cssValue = z
  .string()
  .min(1)
  .max(MAX_VALUE_LENGTH)
  .regex(/^[A-Za-z0-9#%(),./ -]+$/);

/**
 * A partial per-scheme override map: only contract keys, each optional. Built from
 * `TOKEN_KEYS` (the single source) as a strict object so unknown keys are rejected
 * and the inferred type is exactly `Partial<Record<TokenKey, string>>`.
 */
const schemeShape = Object.fromEntries(TOKEN_KEYS.map((key) => [key, cssValue.optional()])) as {
  readonly [K in TokenKey]: z.ZodOptional<typeof cssValue>;
};
const schemeOverrides = z.strictObject(schemeShape);

/** `gym.token_overrides` — independently overridable light/dark partial maps. */
export const tokenOverridesSchema = z.strictObject({
  light: schemeOverrides.optional(),
  dark: schemeOverrides.optional(),
});

/** The validated override shape: `{ light?: Partial<…>, dark?: Partial<…> }`. */
export type TokenOverrides = z.infer<typeof tokenOverridesSchema>;

/**
 * Validate raw (untrusted) override data into `TokenOverrides`, failing safe:
 * `null`/`undefined` → `{}` (the no-overrides path); ANY validation defect →
 * `{}` (the whole payload is discarded so the module baseline serves intact —
 * never a half-applied brand) with a dev-visible warning. The one caller is the
 * `brandCss` merge entry; the apps pass their fetched row data straight through.
 */
export function parseTokenOverrides(raw: unknown): TokenOverrides {
  if (raw == null) return {};

  const result = tokenOverridesSchema.safeParse(raw);
  if (!result.success) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[@gym/brand] token_overrides rejected — serving the module baseline (fail-safe):",
        result.error.issues,
      );
    }
    return {};
  }
  return result.data;
}
