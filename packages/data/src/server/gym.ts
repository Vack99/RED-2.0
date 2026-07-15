import "server-only";

import { cache } from "react";

import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";

export interface OperatorGym {
  id: string;
  timezone: string;
  /** URL-safe gym identifier — the respaldo filename stamps it (spec §2.4). */
  slug: string;
  /** Per-tenant brand, mixed-case as stored (e.g. "RED", "Forge"); render sites uppercase. */
  brandName: string;
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
 *
 * `cache()` keys on argument identity, so it MUST wrap a function keyed on the
 * already-resolved client — never on `client?: SupabaseServer` directly. A page
 * calling `getOperatorGym()` (no arg) and a DAL read calling `getOperatorGym(supabase)`
 * would otherwise land in different buckets and run the 2-query resolution twice per
 * page (perf audit 2026-07-14). `createClient` is itself `cache()`d, so resolving here
 * yields the SAME instance every DAL caller already holds — one bucket, one round trip.
 */
const resolveOperatorGym = cache(
  async (supabase: SupabaseServer): Promise<OperatorGym> => {
    await requireOperator(supabase);

    const { data: membership } = await supabase
      .from("gym_membership")
      .select("gym_id")
      .in("role", ["owner", "operator"])
      .order("gym_id")
      .limit(1)
      .maybeSingle();
    if (!membership) throw new Error("Sin gym asignado");

    const { data: gym } = await supabase
      .from("gym")
      .select("timezone, slug, brand_name")
      .eq("id", membership.gym_id)
      .maybeSingle();
    if (!gym) throw new Error("Gym no encontrado");

    return {
      id: membership.gym_id,
      timezone: gym.timezone,
      slug: gym.slug,
      brandName: gym.brand_name,
    };
  },
);

export async function getOperatorGym(client?: SupabaseServer): Promise<OperatorGym> {
  const supabase = client ?? (await createClient());
  return resolveOperatorGym(supabase);
}
