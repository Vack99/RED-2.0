import { describe, expect, it } from "vitest";

import { DEFAULT_BRAND } from "./brand-id";
import { HOST_TO_BRAND } from "./host-map";
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

  it("exercises the code-preset path — both shipped brands carry a bespoke login hero", () => {
    // The Forge sequence is now extracted into its own module (grill lock (h)),
    // joining RED's ignition; the neutral base module (S4) will omit it and
    // exercise the optional-animation fallback.
    expect(typeof brands.forge.loginAnimation).toBe("function");
    expect(typeof brands.red.loginAnimation).toBe("function");
  });
});

describe("HOST_TO_BRAND", () => {
  it("maps the *.localhost dev hosts to their brand", () => {
    expect(HOST_TO_BRAND["forge.localhost"]).toBe("forge");
    expect(HOST_TO_BRAND["red.localhost"]).toBe("red");
  });

  it("never maps a host to a brand the registry does not ship", () => {
    for (const id of Object.values(HOST_TO_BRAND)) {
      expect(brands[id]).toBeDefined();
    }
  });
});
