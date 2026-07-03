import { describe, expect, it } from "vitest";

import { DEFAULT_BRAND } from "./brand-id";
import { brands } from "./registry";

// The registry + host-map are a static Phase-3 stub (ADR-0012 §5). These assert the
// invariants a static registry must hold — a typo'd host mapping to a nonexistent
// brand, or a brand missing its token block, is a bug caught here, not at render.

describe("@gym/brand registry", () => {
  it("ships exactly the three brands: base, forge, red (the census tripwire)", () => {
    // Phase 4 joins the neutral `base` module to Forge + RED. A new brand is a
    // conscious code act, so this census is a deliberate tripwire — a fourth
    // module (or a dropped one) fails here, not silently at render.
    expect(Object.keys(brands).sort()).toEqual(["base", "forge", "red"]);
  });

  it("the default brand is the neutral base module (grill (e))", () => {
    // DEFAULT_BRAND flipped from 'forge' to 'base' in Phase 4: an unknown/absent
    // `x-brand` now wears neutral chrome, never Forge's. The default must always
    // point at a module that exists — asserted in the same slice that ships base.
    expect(DEFAULT_BRAND).toBe("base");
    expect(brands[DEFAULT_BRAND]).toBeDefined();
  });

  it("every module carries a token block defining :root and .dark, plus a logo", () => {
    for (const brand of Object.values(brands)) {
      expect(brand.css).toContain(":root");
      expect(brand.css).toContain(".dark");
      expect(typeof brand.logo).toBe("function");
    }
  });

  it("every module carries a self-contained app-icon SVG for the dynamic favicon route", () => {
    // Favicons paint without page CSS, so the icon must be standalone markup —
    // guard that the /icon route (grill (g)) always has a real SVG to serve.
    for (const brand of Object.values(brands)) {
      expect(brand.appIcon).toContain("<svg");
      expect(brand.appIcon).toContain("</svg>");
    }
  });

  it("exercises the code-preset path — forge and red carry a bespoke login hero, base omits it", () => {
    // The Forge sequence and RED's ignition are self-contained module heroes
    // (grill lock (h)). The neutral base module OMITS the optional hero, so the
    // login falls back to a clean static shell — proving the contract is genuinely
    // optional (`loginAnimation?`), exercised at the seam in static-login.test.ts.
    expect(typeof brands.forge.loginAnimation).toBe("function");
    expect(typeof brands.red.loginAnimation).toBe("function");
    expect(brands.base.loginAnimation).toBeUndefined();
  });
});
