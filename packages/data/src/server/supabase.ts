import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { SUPABASE_COOKIE_OPTIONS } from '../cookie-options'
import type { Database } from '../database.types'
import { shieldedFetch } from './fetch-shield'

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
 *
 * `cookieOptions` MUST match the other three `@supabase/ssr` construction
 * sites exactly (#209) — see `../cookie-options`.
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
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      // Bounds the reads + the JWKS lookup; leaves every write untouched (./fetch-shield).
      global: { fetch: shieldedFetch },
    },
  )
})

/**
 * Cookieless ANON server client for the public marketing reads (ADR-0012 §5, the same posture
 * `resolveTenant`'s pre-auth lookup uses). It carries NO session, so it is ALWAYS the `anon` role —
 * independent of whether the visitor happens to be logged in — which is exactly the surface the
 * anon-SELECT policies gate. The URL/anon key are identical for every tenant (ADR-0008), so there
 * is no per-gym secret here. Same `SupabaseServer` shape as the cookie client, so the DAL's
 * injectable-client seam (ADR-0001) is unchanged.
 *
 * `gymId` stamps the `x-gym-id` request header, which PostgREST publishes in the `request.headers`
 * GUC and the anon catalog policies read through `public.gym_en_peticion()` (#215). Until then
 * those policies were `using (true)` and per-gym scoping was purely the caller's `.eq('gym_id', …)`
 * — a convention, so ONE anonymous call returned every gym's catalog (614 class_session rows across
 * 4 gyms, measured live). The header is NOT an authz input: every row behind it is already public
 * for that gym. It is the scope selector that turns "give me everything" into "give me one gym".
 * Omitting it is a valid state (the unmapped-host case) and yields ZERO rows, not an error.
 */
export function createAnonClient(gymId?: string): SupabaseServer {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: shieldedFetch,
        ...(gymId ? { headers: { 'x-gym-id': gymId } } : {}),
      },
    },
  )
}

/**
 * The per-request server client type — `Awaited` because `createClient` is async.
 * The DAL takes this as an injectable trailing param (default: the real client)
 * so the row→DTO mapping + write orchestration are testable with a fake (ADR-0001,
 * audit cluster 4). Defined once here; every DAL signature derives from it.
 */
export type SupabaseServer = Awaited<ReturnType<typeof createClient>>
