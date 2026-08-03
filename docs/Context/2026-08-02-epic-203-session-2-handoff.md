# Handoff — epic #203, session 2 of N

**Written:** 2026-08-02, end of session 2. **Session ended early on usage**, not on a blocker.
**Branch:** `epic-203-tenant-in-effect` @ `e6cb60e`, **not pushed**, working tree clean, gate green
(lint + typecheck + **1094 tests**, up from 1078).

Read `docs/Context/2026-08-02-tenant-in-effect-next-session-handoff.md` first — it is still the map.
This file only records what moved and what the next session should do differently.

---

## Process note the owner gave mid-session — apply it from turn one

> *"make sure to use agents bro, you eating the whole usage from this session"*

Session 2 did everything inline in the main context. That is why it ran out. **Delegate.** The
remaining units are near-independent and each fits one subagent with a tight brief:

| Unit | Model | Why |
|---|---|---|
| #212 | opus | the reasoning is done (below) — it is now typing + test rework |
| #217, #218 | sonnet | small, clear-spec |
| #219 | opus | signature change + a new suite fixture shape |
| #209 | sonnet | config/headers |
| #210 | sonnet | prose |

Run them **in the foreground** (owner standing instruction), and keep the main context for review
and the commit messages. Caps: sonnet 35 / opus 18 per session, fable 0.

`/ponytail` and `/caveman` were invoked late in session 2 — start with both.

---

## Shipped this session — 7 of 17 issues, 6 commits

All on the branch, none pushed, none closed on the tracker (see **Before you close anything**).

| Commit | Issue | What landed |
|---|---|---|
| `24b4b88` | **#204** | `apps/admin/src/lib/tenant.ts` — `compareTenant` (pure) + `auditTenantInEffect`, one structured `tenant-crossing` JSON line on disagreement, silence on agreement. Wired in the `(app)` layout. `proxy.ts` stamps `x-ruta`. `OperatorGym` gained `userId`. |
| `24b4b88` | — | **Unfiled prerequisite, fixed:** `tenantHeaders` now DELETES `x-gym`/`x-brand` when no tenant resolves. `new Headers(base)` copies what the client sent, so a **forged inbound `x-gym` rode into the app on every unmapped host** (previews, bare `.vercel.app`, `pnpm dev`). Inert while admin read `x-gym` zero times; not inert now. |
| `9d815cc` | **#211** | ADR-0008 amended (not superseded) + the 4 substitution-test failures rewritten + `CONTEXT.md` + the 2026-07-27 audit's falsified sentence struck with its receipt. |
| `9c6b1a9` | **#213** | `20260802120000_gym_authenticated_column_grants.sql` + the suite assertion (membership-less identity reads 0 `owner_user_id`). |
| `9c6b1a9` | **#214** | `tools/guards/anon-read.ts` (migration replay) + `anon-read-surface.test.ts` + `supabase/tests/anon-read-allowlist.json`. Derived census = **exactly the 17 tables the audit measured**. Also fails on a scoped policy WIDENING back to `using (true)`, and carries a parser tripwire so it cannot go vacuously green. |
| `8e9bd71` | **#216** | `gym_domain` off the anon surface entirely: new `public.gym_id_por_host(p_hostname, p_app)` SECURITY DEFINER; anon loses policy AND grant; `authenticated` narrowed `using (true)` → `is_member_of(gym_id)`. `resolveTenant` + the send-email hook swapped to the RPC. |
| `5ce40d2` | **#215** | The 15 catalog policies now key on the gym the request names: `gym_id = (select public.gym_en_peticion())`, reading `x-gym-id` out of PostgREST's `request.headers`. `createAnonClient(gymId)` stamps it; the 9 catalog readers in `marketing.ts` all already took `gymId` first. |
| `e6cb60e` | **#208** | `_components/varios-gimnasios.tsx` — the 2+-gym chooser, server-derived admin hosts, working sign-out. **Not wired** — the layout branch lands with #212. |

### Two decisions worth not relitigating

1. **#215's `x-gym-id` header is caller-supplied, deliberately.** It is not an authz input — every
   row behind it is already public for that gym. It is the *scope selector* that turns "give me
   everything" into "give me one gym". An attacker can still ask gym by gym; they cannot take the
   platform in one request, and since #216 they cannot get the gym list either.
2. **#215's 15 policies are written out one statement per table, not a `format()` loop.** #214's
   guard parses these migrations; dynamic SQL would take all 15 off its radar while leaving them
   anon-readable in production. Repetition is the price of being machine-checkable. **Do not
   "tidy" this into a loop.**

---

## ⚠️ Before you close anything — the unpaid gate

**4 migration-bearing commits (#213, #214-adjacent, #215, #216) have NEVER been run against a
database.** No `SUPABASE_ACCESS_TOKEN` was available this session. Per AGENTS.md and trap 6 of the
previous handoff:

```
SUPABASE_TARGET_REF=gyyujeguycxxoaqgdnjp SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial
```

Scratch project `gyyujeguycxxoaqgdnjp` is the kept test bed. The runner refuses the live ref.
**This must be green before the branch fast-forwards to `main` and before any of #213/#215/#216
is closed.** Two suites were rewritten and are the actual proof:

- `gym_tenant_anon_read.sql` — anon resolves a known host via the RPC and **cannot** enumerate;
  the membership-less `authenticated` actor gets 42501 on `owner_user_id`/`legal_name`/`created_at`.
- `anon_catalog_read.sql` — seeds a **second gym** and asserts both directions, plus the
  no-header and malformed-header cases (must be EMPTY, never a 500).

**Two things most likely to fail there, check them first:**

1. `public.gym_en_peticion()` depends on PostgREST publishing `request.headers`. Verified as the
   documented Supabase pattern, **never executed**. If the GUC is absent or shaped differently,
   every public marketing page renders empty — a loud failure, but confirm on scratch first.
2. `createAnonClient(gymId)` passes `{ global: { headers: { 'x-gym-id': gymId } } }`. Confirm
   supabase-js actually forwards it on the PostgREST request (it should; unverified live).

There is also **no live verification** that the 9 `marketing.ts` readers are the complete set of
anon catalog reads. The grep was exhaustive over `packages/data/src` and `createAnonClient` appears
nowhere else — but a missed reader degrades to an empty section on a public page, silently.

---

## #212 — the design is DONE, the typing is not

This is where session 2 stopped. It was drafted, found to be a bigger test rework than the budget
allowed, and **deliberately reverted to keep the tree green** (`git checkout HEAD --
packages/data/src/server/gym.ts apps/admin/src/lib/tenant.ts`). Nothing is half-applied. Hand the
whole section below to one opus subagent.

### The decision table (pure, testable, put it in `apps/admin/src/lib/tenant.ts`)

```ts
export type TenantDecision =
  | { kind: "render"; gym: string }   // host names one of mine, OR names nothing
  | { kind: "redirect"; gym: string } // exactly 1 staff gym, host names another
  | { kind: "choose" }                // 2+ staff gyms, host names none  -> VariosGimnasios
  | { kind: "none" };                 // 0 staff gyms                    -> SinGimnasio

export function decideTenant(hostGym: string | null, misGyms: readonly string[]): TenantDecision {
  if (misGyms.length === 0) return { kind: "none" };
  if (!hostGym) return { kind: "render", gym: misGyms[0] };   // ABSENT ARM FIRST — see below
  if (misGyms.includes(hostGym)) return { kind: "render", gym: hostGym };
  if (misGyms.length === 1) return { kind: "redirect", gym: misGyms[0] };
  return { kind: "choose" };
}
```

`misGyms` arrives ordered by `gym_id`, so `misGyms[0]` is the same stable pick `getOperatorGym`
makes. The absent arm is load-bearing and comes first: getting it wrong locks the owner out of
`pnpm dev`.

### `packages/data/src/server/gym.ts` — the refactor #212 needs

`getOperatorGym` must become **host-aware**, not just the layout. Otherwise a multi-gym operator on
host B renders gym A's data under gym B's chrome — *the reported defect reproduced inside one
request*. Shape that was drafted and works:

- Replace the membership-then-gym **two** reads with **one** embedded FK join:
  `.from("gym_membership").select("gym_id, gym(timezone, slug, brand_name)").in("role", ["owner","operator"]).order("gym_id")`
  (same shape `resolverMiembroGym` already uses — this is also a round-trip saving).
- `cache()` the whole list as `resolveOperatorGyms`; export `getOperatorGyms(client?)`.
- `getOperatorGym(client?)` = `gyms.find(g => g.slug === hostGymSlug()) ?? gyms[0]`, throwing
  `"Sin gym asignado"` on empty. **One cache bucket, one round trip, every caller agrees.**
- `hostGymSlug()` reads `(await headers()).get("x-gym")` inside a `try/catch → null`. The catch is
  required, not defensive: unit tests inject a client and never enter a request scope, and an
  absent tenant is a real production state anyway. Do **not** add a `hostGymSlug` parameter — the
  `cache()` docstring explains why an extra arg splits the bucket and doubles the round trips.
- Add `getAdminHosts(gymIds, client?): Promise<Record<gymId, hostname>>` — reads
  `gym_domain where app='admin'`, `.not("hostname","like","%localhost")`, `.order("created_at")`,
  first-wins. This is **the** redirect-target source: server-derived from ids that came out of the
  caller's own membership rows. It serves both #212's redirect and #208's chooser links.
  (It reads under the caller's session; #216 scoped `gym_domain` to the caller's gyms, which is
  exactly this query.)

**Test rework this forces** (the reason session 2 stopped): `packages/data/src/server/gym.test.ts`'s
fake builds a `.select().in().order().limit().maybeSingle()` chain over two tables. It needs to
become an embedded-join fake returning rows shaped `{ gym_id, gym: {...} }`, with no `.limit()`.
~8 existing cases. Keep every assertion — especially "under multi-membership, deterministically
resolves the FIRST staff gym by gym_id — never the member row".

### `(app)/layout.tsx`

```
const gyms = await getOperatorGyms().catch(() => []);
const decision = await auditTenantInEffect(gyms);   // logs the crossing, returns the decision
if (decision.kind === "redirect") { /* getAdminHosts -> redirect(`https://${host}${x-ruta}`) */ }
if (decision.kind === "choose")   return <VariosGimnasios gimnasios={…} />;
if (decision.kind === "none")     return <SinGimnasio />;
```

`auditTenantInEffect` currently takes one `OperatorGym` and returns `TenantCheck`; widen it to take
the list and return `TenantDecision`, keeping the crossing log. Add `outcome: decision.kind` to the
log line. **Update `apps/admin/src/lib/tenant.test.ts` (4 cases) with it.**

- **No admin host for the target gym** → fall through to `choose`, never a dead end and never a
  loop. `VariosGimnasios` already renders "sin dirección asignada" for that case.
- **Loop-freedom:** redirect target = the operator's own gym host → host matches → renders. No loop.
- **Preserve the path** with the `x-ruta` header `proxy.ts` already stamps (#204 added it).

### Corrections to the previous handoff's #212 traps

- **Trap 4 is wrong for this scope.** `agenda-miembro.test.ts:524` and `:574` are the **client**
  app's `resolverMiembroGym`, which #212 does not touch (#212 is the admin app). They did not break.
  The member-side host reconciliation is **#219's** territory. Verify rather than assume.
- Traps 1, 2, 3 all hold and are honoured by the design above.

---

## Remaining work — 10 issues

**Agent-takeable (6):**

| # | Notes for the next session |
|---|---|
| **#212** | Fully designed above. One opus subagent. Blocked by nothing now — #208 shipped. |
| **#217** | `supabase/functions/send-email/correo.ts:57` — fail closed on empty `redirect_to` instead of defaulting to the global Site URL. `correo.test.ts:107-108` already has a defensive test for the fallback; invert it. Sizing is informed by #206 but the fix is correct either way. |
| **#218** | Global sign-out on `gym_membership` removal + a `not_after` decision. Note the interaction: while `reclamar_o_crear_cliente` exists, a removed *member* can re-mint their own membership at `/auth/confirm` — role removal is not durable until #217 lands too. |
| **#219** | `mi_membresia()` / `toggle_favorito_tipo()` take zero args → signature change. `reservar_clase` is the in-repo pattern; the HMAC firma (`20260713190000:51-64`) is the template for a caller-supplied gym. **Must add the first suite vector seeding a two-membership actor** — no fixture in the 41 `supabase/tests/*.sql` does. Unblocked: #211 shipped. |
| **#209** | `__Host-` at all four `@supabase/ssr` construction sites (**identical or sessions silently stop resolving**), `secure` on the `gym` cookie, first `vercel.json` for HSTS. Ranked lowest. |
| **#210** | Draft the operator-facing page; delivery to the `forge` operator is the owner's. |

**Owner-only (4):** #205 (reproduce live), #206 (Auth redirect allow-list — dashboard state, sizes
#217), #207 (`red-2-0-admin.vercel.app` + preview protection), #210's delivery.

**Then #203** closes last, with a comment naming what shipped and what was deliberately dropped.

---

## State to re-verify before starting

```
git log --oneline main..epic-203-tenant-in-effect     # expect 6 commits, e6cb60e at the tip
gh issue list --label tenant-in-effect-2026-08 --state all --json number,title,state \
  --jq '.[] | "\(.state) #\(.number) \(.title)"' | sort -t'#' -k2 -n
```

- **Nothing is pushed.** Pushing needs fresh owner consent for that specific push (CLAUDE.md).
- **Nothing is closed on the tracker.** Deliberate: 4 commits carry unverified migrations.
- Working tree carries the same pre-existing dirt as before (one modified plan doc + ~17 untracked
  `docs/Context/` files + untracked `apps/admin/src/app/proto/`). Not mine, not touched.
- The Supabase MCP is bound to **LIVE**. Session 2 did not touch it at all. Keep it that way.
