import { headers } from "next/headers";

import { fetchTokenOverrides as fetchGymTokenOverrides } from "@gym/data/server/resolve-tenant";

/**
 * The app-side `token_overrides` seam (PRD grill (b)/(f)). `brandCss` merges a
 * gym's per-row palette overrides onto its module baseline; that override data is
 * an ARGUMENT the APP fetches — `@gym/brand` never fetches (the `brand ✗→ data`
 * boundary is frozen; ADR-0011 §6).
 *
 * The slug is the proxy-stamped `x-gym` (the tenant in effect), not the brand
 * module id — a mapped host's gym owns its overrides row even when several gyms
 * share one brand module. No `x-gym` (the unmapped-host case) means there is no
 * gym row to read, so this resolves to `undefined` and `brandCss` hits its
 * empty-overrides fast path — every unmapped host is unaffected.
 */
export async function fetchTokenOverrides(): Promise<unknown> {
  const slug = (await headers()).get("x-gym");
  if (!slug) return undefined;
  return fetchGymTokenOverrides(slug);
}
