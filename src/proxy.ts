import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import { decideRedirect } from '@/lib/auth'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Next 16 request proxy (formerly `middleware.ts` — do NOT reintroduce that
 * name). Runs on the Node.js runtime before rendering. It:
 *   1. refreshes the Supabase auth session and writes rotated cookies back onto
 *      the response so Server Components see a valid session, and
 *   2. gates routes — the redirect decision is the pure `decideRedirect`
 *      (tested in src/lib/auth.test.ts); this function only wires it to Next.
 *
 * Authorization uses `getClaims()` (verified), never `getSession()`.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

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
          response = NextResponse.next({ request })
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

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files, so the
     * session refresh + gate run on real navigations only:
     * - _next/static, _next/image (build output / image optimizer)
     * - favicon.ico and common image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
