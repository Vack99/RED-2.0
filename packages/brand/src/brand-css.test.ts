import { describe, expect, it, vi } from "vitest";

import { brandCss } from "./brand-css";
import { brands } from "./registry";

// `brandCss(module, overrides)` is the single entry point both layouts call to
// produce the SSR-inlined `<style>` block (PRD grill (b)): it returns the
// precomputed module baseline when overrides are empty (the thousands-of-generic-
// gyms fast path) and merges module ⊕ overrides through the ONE serializer
// otherwise. Overrides arrive as an untrusted ARGUMENT — brandCss validates them,
// so it is also the guard on the `dangerouslySetInnerHTML` sink.

const base = brands.base;

describe("brandCss", () => {
  it("returns the precomputed baseline (identity) when overrides are empty/absent", () => {
    expect(brandCss(base)).toBe(base.css);
    expect(brandCss(base, undefined)).toBe(base.css);
    expect(brandCss(base, {})).toBe(base.css);
    expect(brandCss(base, { light: {}, dark: {} })).toBe(base.css);
  });

  it("merges an override onto the baseline through the serializer (precedence: override wins)", () => {
    const css = brandCss(base, { light: { yellow: "#7c3aed" } });
    expect(css).toContain("--yellow: #7c3aed;");
    // Non-overridden keys keep the module baseline value.
    expect(css).toContain(`--canvas: ${base.tokens.light.canvas};`);
    // The override is scheme-scoped: dark's yellow is untouched.
    const [, darkBlock] = css.split(".dark {");
    expect(darkBlock).toContain(`--yellow: ${base.tokens.dark.yellow};`);
  });

  it("applies light and dark overrides independently", () => {
    const css = brandCss(base, { light: { canvas: "#111111" }, dark: { canvas: "#eeeeee" } });
    const [lightBlock, darkBlock] = css.split(".dark {");
    expect(lightBlock).toContain("--canvas: #111111;");
    expect(darkBlock).toContain("--canvas: #eeeeee;");
  });

  it("renders the same block the plain baseline serializer would for the empty case", () => {
    // Fast path must be byte-identical to the module's precomputed css.
    expect(brandCss(brands.forge, {})).toBe(brands.forge.css);
    expect(brandCss(brands.red)).toBe(brands.red.css);
  });

  it("fails safe to the intact baseline on an INVALID payload — never half-branded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A valid canvas next to a hostile yellow: the whole payload is rejected.
    const css = brandCss(base, { light: { canvas: "#abcabc", yellow: "</style><script>" } });
    expect(css).toBe(base.css);
    expect(css).not.toContain("#abcabc"); // the valid sibling is discarded too
    warn.mockRestore();
  });

  it("never emits a `</style>` breakout down the dangerouslySetInnerHTML path", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const css = brandCss(base, { light: { canvas: "#fff</style><script>alert(1)</script>" } });
    expect(css.toLowerCase()).not.toContain("</style>");
    expect(css.toLowerCase()).not.toContain("<script");
    expect(css).toBe(base.css); // rejected → baseline
    warn.mockRestore();
  });

  it("ignores unknown keys by rejecting the payload (closed contract)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(brandCss(base, { light: { notakey: "#fff" } })).toBe(base.css);
    warn.mockRestore();
  });
});
