import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import type { Database } from '@/lib/supabase/database.types'

/**
 * Next 16 request proxy (formerly `middleware.ts` — do NOT reintroduce that
 * name). Runs on the Node.js runtime before rendering. Its job here is to
 * refresh the Supabase auth session and write any rotated cookies back onto the
 * response, so Server Components see a valid session.
 *
 * The route gate (redirect unauthenticated users to `/login`) is wired in the
 * auth slice (issue #2); this scaffolds the session-refresh half.
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

  // Refresh the session (and trigger setAll on rotation). Authorize with
  // getClaims() — verified — never getSession().
  await supabase.auth.getClaims()

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files, so the
     * session refresh runs on real navigations only:
     * - _next/static, _next/image (build output / image optimizer)
     * - favicon.ico and common image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
