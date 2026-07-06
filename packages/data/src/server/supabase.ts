import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../database.types'

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

/**
 * Cookieless ANON server client for the public marketing reads (ADR-0012 §5, the same posture
 * `resolveTenant`'s pre-auth lookup uses). It carries NO session, so it is ALWAYS the `anon` role —
 * independent of whether the visitor happens to be logged in — which is exactly the surface the
 * decision-(b) anon-SELECT policies gate. Per-gym scoping is the caller's job (`.eq('gym_id', …)`),
 * since the anon policies are flat (`using (true)`) across gyms. The URL/anon key are identical for
 * every tenant (ADR-0008), so there is no per-gym secret here. Same `SupabaseServer` shape as the
 * cookie client, so the DAL's injectable-client seam (ADR-0001) is unchanged.
 */
export function createAnonClient(): SupabaseServer {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}

/**
 * The per-request server client type — `Awaited` because `createClient` is async.
 * The DAL takes this as an injectable trailing param (default: the real client)
 * so the row→DTO mapping + write orchestration are testable with a fake (ADR-0001,
 * audit cluster 4). Defined once here; every DAL signature derives from it.
 */
export type SupabaseServer = Awaited<ReturnType<typeof createClient>>
