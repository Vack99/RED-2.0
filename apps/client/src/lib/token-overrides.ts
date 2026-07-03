import type { BrandId } from "@gym/brand";

/**
 * The app-side `token_overrides` seam (PRD grill (b)/(f)). `brandCss` merges a
 * gym's per-row palette overrides onto its module baseline; that override data is
 * an ARGUMENT the APP fetches — `@gym/brand` never fetches (the `brand ✗→ data`
 * boundary is frozen; ADR-0011 §6). This is the fixture form of that fetch.
 *
 * FIXTURE (Phase 4): the ONLY faked element of the base + overrides exit demo is
 * this data source — exactly the seam's design (overrides are an argument, so the
 * merge + layout render below are the REAL path; grill (f)). Post-Phase-3 this
 * becomes a ONE-LINE swap to read the resolved gym row's `token_overrides` jsonb
 * (seeded by #18) instead of the demo constant.
 *
 * Keyed on the neutral base brand (the unmapped-host / generic-gym case): mapped
 * brand hosts carry no fixture, so they hit `brandCss`'s empty-overrides fast path
 * and render byte-identical to before — every mapped host is unaffected.
 */
const BASE_DEMO_OVERRIDES = {
  light: { yellow: "#7c3aed", gold: "#5b21b6" },
  dark: { yellow: "#a78bfa", gold: "#a78bfa" },
};

export function fetchTokenOverrides(brandId: BrandId): unknown {
  return brandId === "base" ? BASE_DEMO_OVERRIDES : undefined;
}
