import { describe, expect, it } from "vitest";

import { DEFAULT_BRAND } from "./brand-id";
import { ForgeIgnitionMark } from "./forge/ignition-mark";
import { ForgeLockup } from "./forge/logo";
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

  it("stamps a dark default scheme for the two bespoke brands, light for neutral base (#84)", () => {
    // `defaultScheme` drives the layout's `<html>` scheme-class append (ADR-0012's
    // no-FOUC seam). Forge joins RED as dark-only in Phase-#84's calm-gold pass; the
    // neutral base module omits it (falls back to light). Admin doesn't consume this
    // field (own theme provider), so flipping forge here leaves the desk untouched.
    expect(brands.forge.defaultScheme).toBe("dark");
    expect(brands.red.defaultScheme).toBe("dark");
    expect(brands.base.defaultScheme).toBeUndefined();
  });

  it("forge publishes a real brand-voice tagline (not the generic landing fallback)", () => {
    // The landing prefers a module `copy.tagline` over its generic "Reserva.
    // Entrena. Avanza." fallback (page.tsx). Forge ships its own functional-
    // bootcamp line, distinct from RED's — so a Forge host reads Forge, not a
    // placeholder. Asserted here, at the module seam, not at render.
    const forgeTagline = brands.forge.copy.tagline;
    expect(typeof forgeTagline).toBe("string");
    expect(forgeTagline).toBeTruthy();
    expect(forgeTagline).not.toBe("Reserva. Entrena. Avanza.");
    expect(forgeTagline).not.toBe(brands.red.copy.tagline);
  });

  it("forge's logo honors the widened `animate` slot — landing plays the ignition, chrome stays static", () => {
    // The registry widened `logo` to `{ size?; animate? }` (one slot, not a
    // second `heroMark` member). The landing calls `<Logo animate />`; static
    // chrome (headers/footers) calls it without the flag. Forge's animate branch
    // must render the shared bar-build ignition, the still branch the flat lockup.
    const animated = ForgeLockup({ animate: true });
    const still = ForgeLockup({ animate: false });
    expect(animated.type).toBe(ForgeIgnitionMark);
    expect(still.type).not.toBe(ForgeIgnitionMark);
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
