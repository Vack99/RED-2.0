import "server-only";

import { cache } from "react";

import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";

export interface OperatorGym {
  id: string;
  timezone: string;
}

/**
 * The operator's gym (ADR-0013 membership: `auth.uid() -> gym_membership ->
 * gym`), memoized per request via React `cache()`. Every DAL reader that needs
 * the gym-local calendar (audit finding 1, PRD #17) resolves its `tz` through
 * here — one round trip per request (deduped by `cache()`), not one per call
 * site.
 *
 * `gym_membership`'s RLS self-read policy already scopes the read to the caller
 * (ADR-0013 §4), so no explicit `user_id` filter is added here (matches the
 * RLS-trust convention every other DAL reader follows, e.g. getClientesLite).
 * `requireOperator` gives a clean "No autenticado" instead of a confusing "Sin
 * gym asignado" for an anonymous caller.
 *
 * The membership row must carry a STAFF role (`owner`|`operator`) — a `member`
 * row (a socio who self-registered or claimed an invite) does not resolve here
 * (audit #19: without this check a member session on the admin app silently got
 * the operator's real gym/tz and an empty-looking shell instead of the
 * SinGimnasio state). `role` is `NOT NULL CHECK (role in ('owner','operator',
 * 'member'))` (20260702161010), so `role === 'member'` is the exact complement
 * of staff — checked in JS rather than pushed into the query (`.in()`) so this
 * stays a plain `.limit(1).maybeSingle()` read, matching every other DAL
 * reader's hand-rolled test fake (ADR-0001) instead of requiring every one of
 * them to grow query-builder surface for this one call site. RLS is untouched.
 *
 * MVP: takes the first STAFF membership row (an operator belongs to exactly one
 * gym today — the Forge owner backfill seeds exactly one). Multi-gym operators
 * are out of scope for this slice.
 */
export const getOperatorGym = cache(
  async (client?: SupabaseServer): Promise<OperatorGym> => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);

    const { data: membership } = await supabase
      .from("gym_membership")
      .select("gym_id, role")
      .limit(1)
      .maybeSingle();
    if (!membership || membership.role === "member") throw new Error("Sin gym asignado");

    const { data: gym } = await supabase
      .from("gym")
      .select("timezone")
      .eq("id", membership.gym_id)
      .maybeSingle();
    if (!gym) throw new Error("Gym no encontrado");

    return { id: membership.gym_id, timezone: gym.timezone };
  },
);
