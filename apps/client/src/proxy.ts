import { NextResponse, type NextRequest } from "next/server";

import { resolveBrandId } from "@gym/brand";

/**
 * Next 16 request proxy (the `middleware.ts` successor — do NOT reintroduce that
 * name). The client app's single host→brand seam (ADR-0012 §2). It resolves the
 * brand ONCE here — never per RSC subtree — then hands the answer downstream:
 *
 *   1. read `host` (never `x-forwarded-host` — ADR-0012), the `?gym=` query
 *      override, and the persisted `gym` cookie (query beats cookie);
 *   2. `resolveBrandId` picks the marca, host-wins — on a mapped host the override
 *      is structurally inert (a Forge host cannot `?gym=red` itself into RED);
 *   3. stamp `x-brand` on the FORWARDED request so the layout SSR-injects the
 *      right token block with zero re-resolution, and persist the resolved brand
 *      as the `gym` session cookie so a later navigation keeps it without `?gym=`.
 *
 * Brand is presentation-only (ADR-0008): this stamps a marca, never an authz claim.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const override =
    request.nextUrl.searchParams.get("gym") ?? request.cookies.get("gym")?.value ?? null;
  const brand = resolveBrandId(host, override);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-brand", brand);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set("gym", brand, { path: "/", sameSite: "lax" });
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on real navigations only — skip build output, the image optimizer, and
     * static image files so brand resolution isn't spent on assets:
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
