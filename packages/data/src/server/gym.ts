import "server-only";

import { cache } from "react";

import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";

export interface OperatorGym {
  id: string;
  timezone: string;
  /** URL-safe gym identifier — the respaldo filename stamps it (spec §2.4). */
  slug: string;
}

/**
 * The operator's gym (ADR-0013 membership: `auth.uid() -> gym_membership ->
 * gym`), memoized per request via React `cache()`. Every DAL reader that needs
 * the gym-local calendar (audit finding 1, PRD #17) resolves its `tz` through
 * here — one round trip per request (deduped by `cache()`), not one per call
 * site. Readers also scope their queries to the returned `id` (spec 2026-07-13
 * §1.1): a scope selector, not a boundary — RLS stays the boundary (ADR-0001).
 *
 * `gym_membership`'s RLS self-read policy already scopes the read to the caller
 * (ADR-0013 §4), so no explicit `user_id` filter is added here.
 * `requireOperator` gives a clean "No autenticado" instead of a confusing "Sin
 * gym asignado" for an anonymous caller.
 *
 * The staff-role filter (`owner`|`operator`) and the `gym_id` order live IN THE
 * QUERY (spec §1.3): a `.limit(1)` read picks its row at the DB, so filtering or
 * sorting in JS after the fact cannot make the pick deterministic — an
 * unordered, unfiltered read under multi-membership could land on a `member`
 * row (a socio who self-registered — audit #19) and lock the real operator out
 * of their own admin app. With the filter in the query, a member-only session
 * simply resolves no row → SinGimnasio. RLS is untouched.
 */
export const getOperatorGym = cache(
  async (client?: SupabaseServer): Promise<OperatorGym> => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);

    const { data: membership } = await supabase
      .from("gym_membership")
      .select("gym_id, role")
      .in("role", ["owner", "operator"])
      .order("gym_id")
      .limit(1)
      .maybeSingle();
    if (!membership) throw new Error("Sin gym asignado");

    const { data: gym } = await supabase
      .from("gym")
      .select("timezone, slug")
      .eq("id", membership.gym_id)
      .maybeSingle();
    if (!gym) throw new Error("Gym no encontrado");

    return { id: membership.gym_id, timezone: gym.timezone, slug: gym.slug };
  },
);
