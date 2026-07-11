import { describe, expect, it } from "vitest";

import { brands } from "@gym/brand";

import { brandHtmlSeam } from "./brand";

// The root layout is an async RSC (reads headers()/Supabase), so it can't be
// node-rendered here — the `<html>` brand seam it stamps lives in this pure
// helper instead, and this is where the seam's contract is asserted (#84).
describe("brandHtmlSeam — the client `<html>` brand seam", () => {
  it("stamps each brand's own id as `data-brand` (the RED glow re-scope key)", () => {
    // The glow layers key on `[data-brand="red"]`, so the stamp value MUST be the
    // module id verbatim — a drift here silently unscopes (or mis-scopes) the neon.
    expect(brandHtmlSeam(brands.red).dataBrand).toBe("red");
    expect(brandHtmlSeam(brands.forge).dataBrand).toBe("forge");
    expect(brandHtmlSeam(brands.base).dataBrand).toBe("base");
  });

  it("appends the ` dark` scheme class only for dark-default brands", () => {
    // Forge joins RED as dark-only (#84); the neutral base stays light (no append).
    expect(brandHtmlSeam(brands.forge).schemeClass).toBe(" dark");
    expect(brandHtmlSeam(brands.red).schemeClass).toBe(" dark");
    expect(brandHtmlSeam(brands.base).schemeClass).toBe("");
  });
});
