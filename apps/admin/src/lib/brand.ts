import { headers } from "next/headers";

import { brands, DEFAULT_BRAND, type BrandId, type BrandModule } from "@gym/brand";

/**
 * Resolve the request's brand module from the proxy-stamped `x-brand` header
 * (ADR-0012 §3; the pinned header contract). The header arrives from HTTP, so an
 * absent/forged value is validated against the registry via `Object.hasOwn` and
 * falls back to `DEFAULT_BRAND` rather than crashing the render. This is the one
 * home for that read+validate — the layout (metadata/viewport/document), the
 * login page, the branded pages (inicio/vender/cuenta), and the `/icon` route all
 * call it. It never re-resolves host→brand (Phase 3 owns that seam).
 */
export async function resolveBrand(): Promise<BrandModule> {
  const stamped = (await headers()).get("x-brand");
  const brandId: BrandId =
    stamped !== null && Object.hasOwn(brands, stamped) ? (stamped as BrandId) : DEFAULT_BRAND;
  return brands[brandId];
}
