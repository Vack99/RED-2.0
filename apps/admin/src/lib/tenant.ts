import { headers } from "next/headers";

import type { OperatorGym } from "@gym/data/server/gym";

/**
 * The tenant-in-effect comparison `apps/admin` never made (#203).
 *
 * The reported defect: signing into the RED admin host with a Forge operator account
 * succeeds and renders Forge's real data under RED chrome. Nothing anywhere compared
 * the gym a hostname belongs to against the gyms a session staffs — `proxy.ts` gates on
 * `decideRedirect(authed, pathname)`, a boolean, and the app read `x-gym` zero times.
 *
 * Azure's Architecture Center names this "user and tenant conflation": *even though the
 * request includes a domain name or other tenant identifier, it doesn't mean you should
 * automatically grant access.* The check belongs at the REQUEST layer — RLS cannot see
 * the host (Postgres has no access to it) and a JWT claim cannot carry it (the Custom
 * Access Token Hook's event payload is `user_id`/`claims`/`authentication_method`).
 *
 * This module is the one home for that comparison. It sits beside `auth.ts`
 * (`decideRedirect`) and `brand.ts` (`resolveBrand`) — same shape: a pure decision plus
 * the thin impure read that feeds it.
 */

/**
 * What the host says versus what the session's membership says.
 *
 *  - `absent`   — no `gym_domain` row matched, so the proxy stamped no `x-gym`. Covers
 *                 `red-2-0-admin.vercel.app`, EVERY preview deployment, and plain
 *                 `pnpm dev` (`apps/*` run bare `next dev` on `localhost:3000` and there
 *                 is no bare `localhost` row in `gym_domain`). This MUST keep rendering:
 *                 treating absent as a crossing locks the owner out of local dev.
 *  - `match`    — the host names the gym this session staffs. The only normal state.
 *  - `crossing` — the host names a DIFFERENT gym. Authenticated, but not authorized
 *                 *for this tenant*.
 */
export type TenantCheck = "absent" | "match" | "crossing";

/** Pure, so the three-way branch is testable without Next's request machinery. */
export function compareTenant(hostGym: string | null, membershipGym: string): TenantCheck {
  if (!hostGym) return "absent";
  return hostGym === membershipGym ? "match" : "crossing";
}

/**
 * Read the request's tenant facts and, on a crossing, emit exactly ONE structured line.
 *
 * Why this ships ahead of every behaviour change (#204): a crossing leaves no trace
 * today and cannot be reconstructed later. `auth.audit_log_entries` is empty, no
 * observability package is installed in either app, `auth.sessions` retains `ip` and
 * `user_agent` but no host, and the hostname exists only inside proxy request scope.
 * "Has this already happened, and how often?" is unanswerable today and would become
 * PERMANENTLY unanswerable the moment the app starts refusing.
 *
 * Agreement emits nothing — no per-request noise, so the line means something when it
 * appears. `console.warn` is deliberate: there is no log drain and no `vercel.json`
 * anywhere in the repo, so stdout/stderr on the Vercel function is the only sink that
 * exists. JSON on one line so it survives whatever drain is configured later.
 *
 * `getOperatorGym` is `cache()`-memoized per request, and the `(app)` layout renders
 * once, so one crossing produces one line.
 */
export async function auditTenantInEffect(gym: OperatorGym): Promise<TenantCheck> {
  const h = await headers();
  const hostGym = h.get("x-gym");
  const check = compareTenant(hostGym, gym.slug);

  if (check === "crossing") {
    console.warn(
      JSON.stringify({
        event: "tenant-crossing",
        hostGym,
        membershipGym: gym.slug,
        // Stamped by proxy.ts — a Server Component cannot read its own pathname.
        path: h.get("x-ruta"),
        userId: gym.userId,
      }),
    );
  }

  return check;
}
