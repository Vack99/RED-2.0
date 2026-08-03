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
 * What the request does about the host's tenant claim, given the gyms the session staffs.
 *
 *  - `render`   — the host names one of my gyms, OR names nothing at all. The absent case
 *                 covers `red-2-0-admin.vercel.app`, EVERY preview deployment, and plain
 *                 `pnpm dev` (`apps/*` run bare `next dev` on `localhost:3000` and there
 *                 is no bare `localhost` row in `gym_domain`).
 *  - `redirect` — exactly one staff gym and the host names another: the owner's ruling
 *                 (2026-08-02) is to send the operator to their own host.
 *  - `choose`   — 2+ staff gyms and the host names none, so there is no single correct
 *                 target and a redirect would be a guess → VariosGimnasios (#208).
 *  - `none`     — the session staffs no gym at all → SinGimnasio.
 */
export type TenantDecision =
  | { kind: "render"; gym: string }
  | { kind: "redirect"; gym: string }
  | { kind: "choose" }
  | { kind: "none" };

/**
 * Pure, so all four arms are testable without Next's request machinery. `misGyms` arrives
 * ordered by `gym_id`, so `misGyms[0]` is the same stable pick `getOperatorGym` makes.
 *
 * The absent arm comes FIRST and is load-bearing: treating "the proxy stamped no `x-gym`"
 * as a crossing locks the owner out of local dev.
 */
export function decideTenant(hostGym: string | null, misGyms: readonly string[]): TenantDecision {
  if (misGyms.length === 0) return { kind: "none" };
  if (!hostGym) return { kind: "render", gym: misGyms[0] };
  if (misGyms.includes(hostGym)) return { kind: "render", gym: hostGym };
  if (misGyms.length === 1) return { kind: "redirect", gym: misGyms[0] };
  return { kind: "choose" };
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
 * `getOperatorGyms` is `cache()`-memoized per request, and the `(app)` layout renders
 * once, so one crossing produces one line. `outcome` names what the app DID about it, so
 * the line stays readable once the behaviour changes again.
 *
 * A crossing is a host naming a gym I do not staff — the `redirect` and `choose` arms.
 * `none` is not one: a session with no staff membership has no tenant to cross into.
 */
export async function auditTenantInEffect(gyms: readonly OperatorGym[]): Promise<TenantDecision> {
  const h = await headers();
  const hostGym = h.get("x-gym");
  const misGyms = gyms.map((g) => g.slug);
  const decision = decideTenant(hostGym, misGyms);

  if (decision.kind === "redirect" || decision.kind === "choose") {
    console.warn(
      JSON.stringify({
        event: "tenant-crossing",
        hostGym,
        membershipGyms: misGyms,
        // Stamped by proxy.ts — a Server Component cannot read its own pathname.
        path: h.get("x-ruta"),
        userId: gyms[0].userId,
        outcome: decision.kind,
      }),
    );
  }

  return decision;
}
