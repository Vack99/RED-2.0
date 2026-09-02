import "server-only";

import { cache } from "react";

import { slugDelHost } from "./inquilino";
import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";

export interface OperatorGym {
  id: string;
  timezone: string;
  /** URL-safe gym identifier — the respaldo filename stamps it (spec §2.4). */
  slug: string;
  /** Per-tenant brand, mixed-case as stored (e.g. "RED", "Forge"); render sites uppercase. */
  brandName: string;
  /** `gym.booking_enabled` — the ONE fact `@gym/domain`'s `modo()` derives into `'lista' |
   *  'cupo'` (spec #326). Carried raw here (not pre-derived) so every caller applies the
   *  same one derivation instead of each admin surface re-deciding the mode. */
  bookingEnabled: boolean;
  /** The resolving session's `auth.uid()` — the claim `sub` `requireOperator` already
   *  returned. Carried so the tenant-crossing log line (#204) can name WHO crossed
   *  without a second `getClaims()` round trip. */
  userId: string;
}

/**
 * EVERY gym the session staffs (ADR-0013 membership: `auth.uid() -> gym_membership ->
 * gym`), ordered by `gym_id`, memoized per request via React `cache()`. The list is the
 * primitive because the tenant reconciliation (#212) and the 2+-gym chooser (#208) both
 * need all of them; `getOperatorGym` is the pick made on top of it.
 *
 * `gym_membership` carries a SECOND permissive select policy alongside the self-read one —
 * `gym_membership_staff_select`, `using (is_staff_of(gym_membership.gym_id))` — so a staff
 * member of a gym can read every OTHER staff member's row for that same gym, not just their
 * own (RLS ORs permissive policies together). Without an explicit `.eq("user_id", userId)`
 * here, a gym with 2+ owner/operator rows hands this query BOTH, embedding the SAME gym
 * twice: `getOperatorGyms` returns a duplicate slug, `decideTenant` sees `misGyms.length`
 * inflated past the caller's real membership count, and a single-gym operator lands in the
 * `choose` chooser instead of the `redirect` arm. The `.eq()` narrows back down to the rows
 * that are actually the caller's OWN. `requireOperator` gives a clean "No autenticado"
 * instead of a confusing "Sin gym asignado" for an anonymous caller.
 *
 * The staff-role filter (`owner`|`operator`) and the `gym_id` order live IN THE QUERY
 * (spec §1.3): they are what make the pick deterministic, so a `member` row (a socio who
 * self-registered — audit #19) can never win and lock the real operator out of their own
 * admin app. A member-only session simply resolves no row → SinGimnasio. RLS is untouched.
 *
 * `cache()` keys on argument identity, so it MUST wrap a function keyed on the
 * already-resolved client — never on `client?: SupabaseServer` directly. A page
 * calling `getOperatorGym()` (no arg) and a DAL read calling `getOperatorGym(supabase)`
 * would otherwise land in different buckets and run the resolution twice per page (perf
 * audit 2026-07-14). `createClient` is itself `cache()`d, so resolving here yields the
 * SAME instance every DAL caller already holds — one bucket, one round trip.
 */
const resolveOperatorGyms = cache(
  async (supabase: SupabaseServer): Promise<OperatorGym[]> => {
    const userId = await requireOperator(supabase);

    // ONE request (embedded FK join) instead of the old membership-then-gym pair:
    // gym_membership.gym_id → gym is a many-to-one FK, so PostgREST embeds `gym` as a
    // single object per row, never an array (the shape `resolverMiembroGym` reads).
    const { data: memberships } = await supabase
      .from("gym_membership")
      .select("gym_id, gym(timezone, slug, brand_name, booking_enabled)")
      .eq("user_id", userId)
      .in("role", ["owner", "operator"])
      .order("gym_id");

    return (memberships ?? []).flatMap((m) =>
      m.gym
        ? [
            {
              id: m.gym_id,
              timezone: m.gym.timezone,
              slug: m.gym.slug,
              brandName: m.gym.brand_name,
              bookingEnabled: m.gym.booking_enabled,
              userId,
            },
          ]
        : [],
    );
  },
);

/** Every gym the session staffs, ordered by `gym_id`. */
export async function getOperatorGyms(client?: SupabaseServer): Promise<OperatorGym[]> {
  const supabase = client ?? (await createClient());
  return resolveOperatorGyms(supabase);
}

/**
 * The ONE gym this request operates on: the gym the host names when the session staffs
 * it, else the first by `gym_id` (the stable pick every caller already agreed on).
 *
 * Host-aware on purpose (#212). Without it a multi-gym operator on host B reads gym A's
 * rows under gym B's chrome — the reported defect reproduced INSIDE one request, below
 * the layout's reconciliation. Every DAL reader that needs the gym-local calendar (audit
 * finding 1, PRD #17) resolves its `tz` through here, and scopes its queries to the
 * returned `id` (spec 2026-07-13 §1.1): a scope selector, not a boundary — RLS stays the
 * boundary (ADR-0001).
 */
export async function getOperatorGym(client?: SupabaseServer): Promise<OperatorGym> {
  const gyms = await getOperatorGyms(client);
  const host = await slugDelHost();
  const gym = gyms.find((g) => g.slug === host) ?? gyms[0];
  if (!gym) throw new Error("Sin gym asignado");
  return gym;
}

/**
 * `gym_id → admin hostname` for the gyms passed in — THE redirect target (#212) and the
 * chooser's links (#208). Server-derived from ids that came out of the caller's own
 * membership rows, so no param, header or cookie can steer it (issue #212's first
 * non-negotiable constraint); it reads under the caller's session, and #216 scoped
 * `gym_domain` to exactly that.
 *
 * A gym may map several admin hosts (dev mirror + live): PRINCIPAL FIRST — the gym's
 * declared canonical host (`gym_domain.es_principal`, at most one per `(gym_id, app)` by
 * partial unique index `gym_domain_principal_uniq`) — then `created_at` ascending as the
 * tie-break for pairs that have declared nothing, so the pick stays deterministic rather
 * than a plan-order coin flip and an unflagged gym keeps its old oldest-wins host instead
 * of vanishing from the map. `.localhost` rows are dev-only tenancy hosts, excluded before
 * either order and never resurrected by the flag — never a reachable target (the same rule
 * `construirUrlInvitacion` applies to the client side). A gym with no admin host is
 * simply absent from the map; the caller renders it without a link.
 */
export async function getAdminHosts(
  gymIds: readonly string[],
  client?: SupabaseServer,
): Promise<Record<string, string>> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("gym_domain")
    .select("gym_id, hostname")
    .in("gym_id", [...gymIds])
    .eq("app", "admin")
    .not("hostname", "like", "%localhost")
    .order("es_principal", { ascending: false })
    .order("created_at", { ascending: true });

  const hosts: Record<string, string> = {};
  for (const row of data ?? []) hosts[row.gym_id] ??= row.hostname;
  return hosts;
}

/**
 * `gym_id → client hostname` for ONE gym (#256) — the aviso's `{{url_aviso_integral}}` merge
 * field needs the client app's REAL host to preview accurately from the admin app (a different
 * host than the member ever sees it on). Singular sibling of `getAdminHosts` above: same
 * dev-host exclusion, same principal-first order (`gym_domain.es_principal`, one per
 * `(gym_id, app)` by partial unique index `gym_domain_principal_uniq`) with `created_at`
 * ascending as the tie-break for unflagged pairs, `app='client'` instead of `'admin'`, one gym
 * because the CUENTA preview only ever needs its OWN. `null` when unmapped — the merge field
 * then stays visibly unresolved in the preview rather than a fabricated URL.
 */
export async function getClientHost(gymId: string, client?: SupabaseServer): Promise<string | null> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("gym_domain")
    .select("hostname")
    .eq("gym_id", gymId)
    .eq("app", "client")
    .not("hostname", "like", "%localhost")
    .order("es_principal", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.hostname ?? null;
}
