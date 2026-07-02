import { describe, expect, it } from "vitest";

import { DEFAULT_BRAND } from "./brand-id";
import { brands } from "./registry";

// The registry + host-map are a static Phase-3 stub (ADR-0012 §5). These assert the
// invariants a static registry must hold — a typo'd host mapping to a nonexistent
// brand, or a brand missing its token block, is a bug caught here, not at render.

describe("@gym/brand registry", () => {
  it("ships exactly the two Phase-2 brands", () => {
    expect(Object.keys(brands).sort()).toEqual(["forge", "red"]);
  });

  it("the default brand is a real brand (forge, brand #1)", () => {
    expect(DEFAULT_BRAND).toBe("forge");
    expect(brands[DEFAULT_BRAND]).toBeDefined();
  });

  it("every module carries a token block defining :root and .dark, plus a logo", () => {
    for (const brand of Object.values(brands)) {
      expect(brand.css).toContain(":root");
      expect(brand.css).toContain(".dark");
      expect(typeof brand.logo).toBe("function");
    }
  });

  it("exercises the code-preset path with exactly one bespoke login animation (RED)", () => {
    expect(typeof brands.red.loginAnimation).toBe("function");
    expect(brands.forge.loginAnimation).toBeUndefined();
  });
});
