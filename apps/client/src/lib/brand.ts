import { headers } from "next/headers";

import { brands, DEFAULT_BRAND, type BrandId, type BrandModule } from "@gym/brand";

/**
 * Resolve the request's brand module from the proxy-stamped `x-brand` header
 * (ADR-0012 §3). The header arrives from HTTP, so an absent/forged value is
 * validated against the registry via `Object.hasOwn` and falls back to
 * `DEFAULT_BRAND` rather than crashing the render. The one home for that
 * read+validate in the client app — the layout (chrome + no-FOUC tokens) and the
 * auth pages (login hero) both call it. It never re-resolves host→brand (Phase 3
 * owns that seam; the header is UX only, never an authz input — ADR-0012).
 */
export async function resolveBrand(): Promise<BrandModule> {
  const stamped = (await headers()).get("x-brand");
  const brandId: BrandId =
    stamped !== null && Object.hasOwn(brands, stamped) ? (stamped as BrandId) : DEFAULT_BRAND;
  return brands[brandId];
}
