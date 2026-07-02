import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import { decideRedirect } from './lib/auth'
import { resolveTenant, tenantHeaders } from '@gym/data/server/resolve-tenant'
import type { Database } from '@gym/data'

/**
 * Next 16 request proxy (formerly `middleware.ts` — do NOT reintroduce that
 * name). Runs on the Node.js runtime before rendering and carries TWO seams:
 *
 *   1. Host→inquilino→marca (ADR-0012 §2/§5) — the SAME `resolveTenant` the client
 *      app runs. Read `host` (never `x-forwarded-host`) + `?gym=` + the `gym`
 *      cookie, resolve the tenant once via the DB-backed `gym_domain → gym` lookup,
 *      stamp `x-gym` (tenant slug) + `x-brand` (the gym's brand-module key) on the
 *      FORWARDED request so the layout SSR-injects the token block, and persist the
 *      resolved gym slug as the `gym` cookie. This is the Forge deployment: on its
 *      Forge-mapped host `?gym=red` is structurally inert (host wins). An unknown
 *      host resolves NO tenant → default-brand chrome, no `x-gym`. RED-admin is
 *      Phase 4 — a one-row `gym_domain` insert + a provisioned host, zero mechanism
 *      change.
 *   2. Auth gate (Phase 1) — refresh the Supabase session (rotated cookies ride
 *      back so Server Components see a valid session) and gate routes via the pure
 *      `decideRedirect` (tested in src/lib/auth.test.ts).
 *
 * The tenant is presentation-only (ADR-0008): the seam stamps a marca, never an
 * authz claim; authorization uses `getClaims()` (verified), never `getSession()`.
 */
export async function proxy(request: NextRequest) {
  const override =
    request.nextUrl.searchParams.get('gym') ?? request.cookies.get('gym')?.value ?? null
  const tenant = await resolveTenant(request.headers.get('host'), override)

  let response = NextResponse.next({
    request: { headers: tenantHeaders(request.headers, tenant) },
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          // Re-clone AFTER the rotation so the forwarded request carries both the
          // fresh session cookies and the resolved tenant headers.
          response = NextResponse.next({
            request: { headers: tenantHeaders(request.headers, tenant) },
          })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
          // `@supabase/ssr` 0.10+ passes cache-control headers that MUST ride
          // with auth cookies so a CDN/proxy never caches one user's session.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value)
          }
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const authed = Boolean(data?.claims)

  const dest = decideRedirect(authed, request.nextUrl.pathname)
  if (dest) {
    const url = request.nextUrl.clone()
    url.pathname = dest
    return NextResponse.redirect(url)
  }

  if (tenant) response.cookies.set('gym', tenant.slug, { path: '/', sameSite: 'lax' })
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files, so the
     * session refresh + brand seam run on real navigations only:
     * - _next/static, _next/image (build output / image optimizer)
     * - favicon.ico and common image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
