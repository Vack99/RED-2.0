import { NextResponse, type NextRequest } from "next/server";

import { resolveTenant, tenantHeaders } from "@gym/data/server/resolve-tenant";

/**
 * Next 16 request proxy (the `middleware.ts` successor — do NOT reintroduce that
 * name). The client app's single host→inquilino→marca seam (ADR-0012 §2/§5). It
 * resolves the tenant ONCE here — never per RSC subtree — then hands the answer
 * downstream:
 *
 *   1. read `host` (never `x-forwarded-host` — ADR-0012), the `?gym=` query
 *      override, and the persisted `gym` cookie (query beats cookie);
 *   2. `resolveTenant` does the DB-backed `gym_domain → gym` lookup, host-wins —
 *      on a mapped host the override is structurally inert (a Forge host cannot
 *      `?gym=red` itself into RED);
 *   3. stamp `x-gym` (tenant slug) + `x-brand` (the gym's brand-module key) on the
 *      FORWARDED request so the layout SSR-injects the right token block with zero
 *      re-resolution, and persist the resolved gym slug as the `gym` cookie so a
 *      later navigation keeps the tenant without `?gym=`.
 *
 * An unknown host with no valid `?gym=` resolves NO tenant: nothing is stamped or
 * persisted, so the layout falls back to `DEFAULT_BRAND` and no `x-gym` is claimed.
 * The tenant is presentation/UX only (ADR-0008): this stamps a marca, never an
 * authz claim.
 */
export async function proxy(request: NextRequest) {
  const override =
    request.nextUrl.searchParams.get("gym") ?? request.cookies.get("gym")?.value ?? null;
  const tenant = await resolveTenant(request.headers.get("host"), override);

  const response = NextResponse.next({
    request: { headers: tenantHeaders(request.headers, tenant) },
  });
  if (tenant) response.cookies.set("gym", tenant.slug, { path: "/", sameSite: "lax" });
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on real navigations only — skip build output, the image optimizer, and
     * static image files so tenant resolution isn't spent on assets:
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
