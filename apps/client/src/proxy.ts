import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { resolveTenant, tenantHeaders } from "@gym/data/server/resolve-tenant";
import { SECURE_COOKIES, SUPABASE_COOKIE_OPTIONS } from "@gym/data/cookie-options";
import type { Database } from "@gym/data";

/**
 * Is this request a router prefetch (i.e. speculative, no member behind it)?
 *
 * KNOWN LIMIT, verified against Next 16 rather than assumed: the proxy adapter
 * DELETES the Flight headers — `rsc`, `next-router-state-tree`,
 * `next-router-prefetch`, `next-router-segment-prefetch` — from `request` before
 * this handler runs (`FLIGHT_HEADERS` in `next/dist/server/web/adapter.js`;
 * documented at `docs/01-app/03-api-reference/03-file-conventions/proxy.md` §"RSC
 * requests and rewrites"), and they are the ONLY signal the App Router sends
 * (`purpose: prefetch` is the Pages Router's). So `next-router-prefetch` reads
 * null here unless `skipProxyUrlNormalize` is set in next.config — a global change
 * with its own blast radius, deliberately NOT taken. Both names are checked anyway:
 * the check is free, it is the documented contract, and it starts working the day
 * the header is visible. A forged `purpose: prefetch` only skips the sender's own
 * rotation — it grants nothing, so trusting the header costs nothing.
 */
export function esPrefetch(headers: Headers): boolean {
  return headers.get("next-router-prefetch") !== null || headers.get("purpose") === "prefetch";
}

/**
 * Is EVERY entry of a `setAll` batch a cookie deletion? Then the batch is auth-js
 * tearing the session down (`_removeSession` after a failed refresh), not a
 * rotation, and the proxy must not ride it back onto the response.
 *
 * "Every", never "any": a SUCCESSFUL rotation also emits deletions — of the surplus
 * `.1`/`.2`… chunk cookies the shorter new token no longer needs — but always
 * ALONGSIDE the non-empty chunks it just minted (`@supabase/ssr`'s
 * `applyServerStorage` concatenates `removeCookies` then `setCookies` into one
 * batch). An empty batch is not a wipe: there is nothing to suppress and nothing
 * to warn about.
 */
export function esBorradoTotal(
  cookiesToSet: readonly { name: string; value?: string | null }[],
): boolean {
  return cookiesToSet.length > 0 && cookiesToSet.every(({ value }) => !value);
}

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
 *
 * Seam 2 rotates on REAL NAVIGATIONS ONLY and is FAIL-SOFT — two latent ways this
 * file could sign a device out, both closed. A prefetch is a second actor racing
 * the real navigation for the ONE refresh token the cookie holds, and the loser of
 * that race gets `invalid_grant`, on which auth-js wipes the session in every tab —
 * so `esPrefetch` skips the client construction AND `getClaims()`, while tenant
 * resolution, the `x-gym`/`x-brand` stamp and the `gym` cookie still run (a
 * prefetched RSC payload that missed the stamp renders the WRONG marca). A failed
 * refresh makes auth-js call `_removeSession()`, which fires `setAll` carrying
 * nothing but deletions (`value: ""` + `maxAge: 0` — `@supabase/ssr`'s
 * `applyServerStorage`); riding those back would sign the member out over a network
 * blip, so `esBorradoTotal` drops that write whole. A `getClaims()` THROW is caught
 * for the same reason: serve the request with the cookies it arrived with rather
 * than 500, and let the page-level gates decide what an unauthenticated render does.
 */
export async function proxy(request: NextRequest) {
  const override =
    request.nextUrl.searchParams.get("gym") ?? request.cookies.get("gym")?.value ?? null;
  const tenant = await resolveTenant(request.headers.get("host"), override, undefined, "client");

  let response = NextResponse.next({
    request: { headers: tenantHeaders(request.headers, tenant) },
  });

  // A prefetch stops here: marca stamped, refresh token untouched (`esPrefetch`).
  if (!esPrefetch(request.headers)) {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            // Deletions-only = a teardown, not a rotation. Drop it whole: leave
            // both the forwarded request and the response exactly as they are.
            if (esBorradoTotal(cookiesToSet)) {
              console.warn("[proxy] refresh failure suppressed cookie wipe");
              return;
            }
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
        // MUST match the other three @supabase/ssr construction sites exactly
        // (#209) — see @gym/data/cookie-options.
        cookieOptions: SUPABASE_COOKIE_OPTIONS,
      },
    );

    // The call itself (result unused) is what triggers the refresh — `setAll`
    // above fires as a side effect when the SDK rotates the token. A throw here
    // is NOT fatal: keep serving with the cookies the request arrived with.
    try {
      await supabase.auth.getClaims();
    } catch (error) {
      console.warn("[proxy] session refresh failed, serving with existing cookies", error);
    }
  }

  if (tenant)
    response.cookies.set("gym", tenant.slug, {
      path: "/",
      sameSite: "lax",
      secure: SECURE_COOKIES,
    });
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
