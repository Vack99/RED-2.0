import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import type { Database } from './database.types'

/**
 * Per-request Supabase client for Server Components, the DAL, and Server Actions
 * (ADR-0001). Created fresh per request and memoized with React `cache()` so all
 * callers in one request share an instance.
 *
 * The cookie adapter implements ONLY `getAll`/`setAll` (the deprecated
 * get/set/remove are intentionally unused). `setAll` is a no-op when invoked
 * during a Server Component render (cookies are read-only there) — `proxy.ts`
 * owns session refresh. Authorize with `getClaims()`/`getUser()`, never
 * `getSession()`.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, where the cookie store is
            // read-only. Safe to ignore — proxy.ts refreshes the session.
          }
        },
      },
    },
  )
})
