import { createBrowserClient } from '@supabase/ssr'

import type { Database } from './database.types'

/**
 * Supabase client for Client Components (the browser). `@supabase/ssr` handles
 * cookie storage automatically here, so no cookie adapter is supplied. The
 * publishable (anon) key is safe to ship to the browser.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
