import 'server-only'

import { cache } from 'react'

import { createClient, type SupabaseServer } from './supabase'
import { getOperatorGym } from './gym'

/**
 * The single operator's profile, as a safe DTO (no `id`/`user_id` leak).
 * `negocio`/`coach` are resolved (blanks → defaults, see resolverIdentidad);
 * `ciudad` stays nullable so consumers choose their own placeholder.
 */
export interface PerfilDTO {
  negocio: string
  coach: string
  ciudad: string | null
  tel: string | null
}

/**
 * The single home for the operator identity DEFAULTS (ADR-0002): a blank/missing
 * negocio falls back to `fallbackNegocio` (the caller's gym brand — gym.brand_name,
 * per-tenant, no hard-coded competitor default), a blank coach to "Coach", and a
 * blank ciudad to null (consumers pick their own placeholder — the recibo omits it,
 * the cuenta badge renders "—"). Pure: trimming + fallbacks only, casing stays at
 * the render site. Both getPerfil and the ventas/ficha reads route through this so
 * the defaults never diverge ("COACH" vs "Coach", "" vs "—") across surfaces.
 */
export function resolverIdentidad(
  p: {
    negocio: string | null
    coach: string | null
    ciudad: string | null
  },
  fallbackNegocio: string,
): { negocio: string; coach: string; ciudad: string | null } {
  return {
    negocio: p.negocio?.trim() || fallbackNegocio,
    coach: p.coach?.trim() || 'Coach',
    ciudad: p.ciudad?.trim() || null,
  }
}

/**
 * Read the authenticated operator's perfil. `perfil` is gym-scoped (RLS is
 * `is_member_of(gym_id)`), so the read is explicitly filtered to the operator's
 * gym — without it a two-gym operator would match two rows. The gym's brand_name
 * is injected as the negocio fallback (no hard-coded platform default). Returns
 * `null` until the perfil row is seeded (issue #2). Memoized per request.
 *
 * @returns the perfil DTO, or `null` when no row exists · best-effort: also
 * returns `null` on error (error is not destructured).
 */
export const getPerfil = cache(
  async (client?: SupabaseServer): Promise<PerfilDTO | null> => {
    const supabase = client ?? (await createClient())
    const gym = await getOperatorGym(supabase)

    const { data } = await supabase
      .from('perfil')
      .select('negocio, coach, tel, ciudad')
      .eq('gym_id', gym.id)
      .maybeSingle()

    if (!data) return null

    return { ...resolverIdentidad(data, gym.brandName), tel: data.tel }
  },
)
