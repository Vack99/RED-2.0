import 'server-only'

import { cache } from 'react'

import { createClient, type SupabaseServer } from '@/lib/supabase/server'

/**
 * The single operator's profile, as a safe DTO (no `id`/`user_id` leak).
 * `negocio` is the brand, stored once (= "FORGE").
 */
export interface PerfilDTO {
  negocio: string
  coach: string | null
  tel: string | null
  ciudad: string | null
}

/**
 * Read the authenticated operator's perfil. RLS scopes the row to
 * `(select auth.uid())`, so no explicit owner filter is needed. Returns `null`
 * until the perfil row is seeded (issue #2). Memoized per request.
 */
export const getPerfil = cache(
  async (client?: SupabaseServer): Promise<PerfilDTO | null> => {
    const supabase = client ?? (await createClient())

    const { data } = await supabase
      .from('perfil')
      .select('negocio, coach, tel, ciudad')
      .maybeSingle()

    if (!data) return null

    return {
      negocio: data.negocio,
      coach: data.coach,
      tel: data.tel,
      ciudad: data.ciudad,
    }
  },
)
