import { describe, expect, it, vi } from "vitest";

import { parseTokenOverrides, tokenOverridesSchema } from "./token-overrides";
import { TOKEN_KEYS } from "./tokens";

// The token-override schema is the machine-checked mirror of the *contrato de
// marca* (PRD grill (a)): only the contract's ~28 keys are overridable, values
// are charset-whitelisted, and ANY defect rejects the WHOLE payload so the render
// falls back to the module baseline (fail-safe — never half-branded). It is the
// guard on the `dangerouslySetInnerHTML` sink both layouts feed, so the hostile
// `</style>` breakout is exercised here against the exact value path.

describe("tokenOverridesSchema", () => {
  it("accepts a partial { light, dark } map of contract keys with valid values", () => {
    const result = tokenOverridesSchema.safeParse({
      light: { yellow: "#7c3aed", canvas: "#f0f0f0" },
      dark: { yellow: "rgba(167, 139, 250, 0.9)" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts every contract key with a hex, rgba, and percentage value", () => {
    const scheme = Object.fromEntries(TOKEN_KEYS.map((k) => [k, "rgba(12, 34, 56, 0.5)"]));
    expect(tokenOverridesSchema.safeParse({ light: scheme, dark: scheme }).success).toBe(true);
    expect(tokenOverridesSchema.safeParse({ light: { canvas: "#abcdef" } }).success).toBe(true);
    expect(tokenOverridesSchema.safeParse({ light: { yellow: "50%" } }).success).toBe(true);
  });

  it("accepts the empty payload and independent single-scheme overrides", () => {
    expect(tokenOverridesSchema.safeParse({}).success).toBe(true);
    expect(tokenOverridesSchema.safeParse({ light: {} }).success).toBe(true);
    expect(tokenOverridesSchema.safeParse({ dark: { fg: "#fff" } }).success).toBe(true);
  });

  it("rejects unknown token keys (a typo or an attack on the closed contract)", () => {
    expect(tokenOverridesSchema.safeParse({ light: { notakey: "#fff" } }).success).toBe(false);
    expect(tokenOverridesSchema.safeParse({ light: { "yellow; color": "#fff" } }).success).toBe(false);
  });

  it("rejects unknown top-level scheme keys", () => {
    expect(tokenOverridesSchema.safeParse({ hover: { yellow: "#fff" } }).success).toBe(false);
    expect(tokenOverridesSchema.safeParse({ light: { yellow: "#fff" }, root: {} }).success).toBe(false);
  });

  it("rejects oversized values (a length-capped denial of a runaway payload)", () => {
    const huge = "#" + "a".repeat(200);
    expect(tokenOverridesSchema.safeParse({ light: { canvas: huge } }).success).toBe(false);
  });

  it("rejects empty-string values", () => {
    expect(tokenOverridesSchema.safeParse({ light: { canvas: "" } }).success).toBe(false);
  });

  it("rejects a hostile `</style>` breakout in the exact value path the layouts inline", () => {
    // The value flows verbatim into `<style dangerouslySetInnerHTML>`; the charset
    // whitelist makes tag breakout, declaration injection, and `url(scheme:...)`
    // unrepresentable — `< > / : ; { } " ' \` are all outside it.
    const hostile = [
      "#fff</style><script>alert(1)</script>",
      "red; } body { display: none",
      "url(javascript:alert(1))",
      '#fff" onload="x',
      "expression(alert(1))\\",
    ];
    for (const value of hostile) {
      expect(
        tokenOverridesSchema.safeParse({ light: { canvas: value } }).success,
        `must reject: ${value}`,
      ).toBe(false);
    }
  });

  it("rejects non-string values (numbers, null, nested objects)", () => {
    expect(tokenOverridesSchema.safeParse({ light: { canvas: 123 } }).success).toBe(false);
    expect(tokenOverridesSchema.safeParse({ light: { canvas: null } }).success).toBe(false);
    expect(tokenOverridesSchema.safeParse({ light: "#fff" }).success).toBe(false);
  });
});

describe("parseTokenOverrides (fail-safe)", () => {
  it("returns the parsed overrides for a valid payload", () => {
    expect(parseTokenOverrides({ light: { yellow: "#7c3aed" } })).toEqual({
      light: { yellow: "#7c3aed" },
    });
  });

  it("returns an empty object for null/undefined (the no-overrides path)", () => {
    expect(parseTokenOverrides(undefined)).toEqual({});
    expect(parseTokenOverrides(null)).toEqual({});
  });

  it("rejects the WHOLE payload on any defect — one bad value discards the valid siblings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A valid `canvas` sits next to a hostile `yellow`; fail-safe drops BOTH.
    expect(parseTokenOverrides({ light: { canvas: "#fff", yellow: "</style>" } })).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
