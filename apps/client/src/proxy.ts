import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { resolveTenant, tenantHeaders } from "@gym/data/server/resolve-tenant";
import type { Database } from "@gym/data";

/**
 * Next 16 request proxy (the `middleware.ts` successor — do NOT reintroduce that
 * name). The client app carries TWO seams:
 *
 *   1. Host→inquilino→marca (ADR-0012 §2/§5). It resolves the tenant ONCE here —
 *      never per RSC subtree — then hands the answer downstream:
 *        a. read `host` (never `x-forwarded-host` — ADR-0012), the `?gym=` query
 *           override, and the persisted `gym` cookie (query beats cookie);
 *        b. `resolveTenant` does the DB-backed `gym_domain → gym` lookup,
 *           host-wins — on a mapped host the override is structurally inert (a
 *           Forge host cannot `?gym=red` itself into RED);
 *        c. stamp `x-gym` (tenant slug) + `x-brand` (the gym's brand-module key)
 *           on the FORWARDED request so the layout SSR-injects the right token
 *           block with zero re-resolution, and persist the resolved gym slug as
 *           the `gym` cookie so a later navigation keeps the tenant without
 *           `?gym=`.
 *   2. Supabase session refresh (B7 — `@supabase/ssr`'s `updateSession` pattern).
 *      `createClient()` (`packages/data/src/server/supabase.ts`) can't write
 *      cookies from a Server Component render, so THIS is the seam that has to
 *      rotate the access token before it expires — calling `getClaims()` here
 *      triggers the refresh and `setAll` below rides the rotated cookies back on
 *      the response. Without it, a session silently drops on token expiry (the
 *      RSC-level `getClaims()` checks — e.g. `reservar/page.tsx` — see a stale
 *      cookie and bounce a still-valid member to `/entrar`). Route gating itself
 *      stays page-level; this proxy only keeps the cookies alive.
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

  let response = NextResponse.next({
    request: { headers: tenantHeaders(request.headers, tenant) },
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // Re-clone AFTER the rotation so the forwarded request carries both the
          // fresh session cookies and the resolved tenant headers.
          response = NextResponse.next({
            request: { headers: tenantHeaders(request.headers, tenant) },
          });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // `@supabase/ssr` 0.10+ passes cache-control headers that MUST ride
          // with auth cookies so a CDN/proxy never caches one user's session.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // The call itself (result unused) is what triggers the refresh — `setAll`
  // above fires as a side effect when the SDK rotates the token.
  await supabase.auth.getClaims();

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
