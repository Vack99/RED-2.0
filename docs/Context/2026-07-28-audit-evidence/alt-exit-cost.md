# alt:exit-cost — Supabase lock-in quantified, in hours, per component

Agent: `alt:exit-cost`. Scope: verify the prior "6 files / ~8 call sites" claim by direct
count, then decompose exit cost by component with file:line evidence, then answer the
owner's actionable question (cheapest reversibility investment available today, vs. the
same investment after 3,000 gyms).

All grep counts below exclude `.claude/worktrees/**` (a stale duplicate checkout of the
repo sitting inside `.claude/worktrees/issue-89-attendance-ledger/` — it mirrors every
file 1:1 and would double every count if left in). All SQL was run read-only against the
live project (hjppxawglmukfvsgmcog) 2026-07-27.

---

## 0. Verifying the prior finding

**Prior claim** (`docs/Context/2026-07-27-auth-structure-scale-audit.md:194`):
> "only **6 files** import `@supabase/*` ... The one leak is `auth.getClaims()` at ~8
> app-level call sites."

**Verified count — files importing `@supabase/*`:**

```
Grep "@supabase/" **/*.ts **/*.tsx  (excluding worktrees, docs, lockfiles, package.json)
```

| File | Import mechanism |
|---|---|
| `apps/client/src/proxy.ts:2` | `import { createServerClient } from "@supabase/ssr"` |
| `apps/admin/src/proxy.ts:2` | `import { createServerClient } from '@supabase/ssr'` |
| `packages/data/src/client.ts:1` | `import { createBrowserClient } from '@supabase/ssr'` |
| `packages/data/src/server/resolve-tenant.ts:3` | `import { createClient as createSupabaseClient } from "@supabase/supabase-js"` |
| `packages/data/src/server/supabase.ts:5-6` | `createServerClient` (`@supabase/ssr`) + `createClient` (`@supabase/supabase-js`) |
| `supabase/functions/send-email/index.ts:21` | `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` |
| `supabase/functions/activar-cuenta/index.ts:23` | same esm.sh CDN import |

**Verdict: 7 files, not 6** — 5 inside the pnpm-managed npm dependency graph (apps/packages)
+ 2 Deno edge functions that pull the same library via an `esm.sh` CDN URL (outside
`pnpm-workspace.yaml`, a structurally different import path). If the prior count only
walked `apps/*` + `packages/*` under pnpm, "6" undercounts by one even within that scope
(there are 5, not 6, in that scope — the two `proxy.ts` files + `client.ts` +
`resolve-tenant.ts` + `supabase.ts` = 5). Either way the qualitative claim — this repo is
unusually well-seamed, the SDK does not leak across the app — holds. `tools/guards/manifests.test.ts:45-46`
is a string allow-list for the pnpm catalog, not an import; excluded correctly by the
prior audit.

**Verified count — `.auth.getClaims()` call sites (excluding doc/comment mentions and
`.test.ts`/`.test-helper.ts` files, which only mention it in prose):**

```
Grep "\.auth\.getClaims\(\)" **/*.ts*  (excluding worktrees)
```

| # | File:line | Notes |
|---|---|---|
| 1 | `packages/data/src/server/_auth.ts:19` | **the existing shared accessor** (`requireOperator`) |
| 2 | `apps/client/src/proxy.ts:79` | raw call |
| 3 | `apps/admin/src/proxy.ts:68` | raw call |
| 4 | `apps/client/src/app/layout.tsx:58` | raw call |
| 5 | `packages/data/src/server/activacion.ts:151` | raw call |
| 6 | `apps/client/src/app/activar/page.tsx:73` | raw call |
| 7 | `packages/data/src/server/registro.ts:125` | raw call |
| 8 | `apps/client/src/app/clase/[sessionId]/page.tsx:31` | raw call |
| 9 | `apps/client/src/app/confirmada/[sessionId]/page.tsx:31` | raw call |
| 10 | `apps/client/src/app/reservar/page.tsx:54` | raw call |

**Verdict: 10 total invocations, 9 of them raw (outside the one existing accessor) — not
"~8 app-level call sites."** The materially important correction isn't the count (9 vs 8
is noise), it's that **the prior audit undersold that a seam already exists and is already
proven**: `requireOperator()` in `_auth.ts` is imported by 16 admin-side DAL files
(`agenda.ts`, `about-values.ts`, `asistencia.ts`, `catalog.ts`, `class-type.ts`,
`clientes.ts`, `coach.ts`, `facilities.ts`, `faqs.ts`, `gym.ts`, `mensajes.ts`,
`paquetes.ts`, `plantillas.ts`, `stats.ts`, `ventas.ts`, and
`apps/admin/src/app/(app)/cuenta/respaldo/route.ts`). Closing the seam on the remaining 9
call sites is **extending a pattern that already shipped and is already load-bearing**,
not inventing one. That makes it cheaper and lower-risk than "hours of work" framing
implies — it's closer to a mechanical find-and-generalize.

---

## 1. Component decomposition

### 1a. Database schema / DDL — **fully portable, small live coupling**

87 files in `supabase/migrations/`. The overwhelming majority is plain
`CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` / `CREATE TRIGGER` — standard Postgres
DDL, runs unmodified on any Postgres 17 (RDS, Cloud SQL, Neon, self-hosted).

**Concrete live coupling — 3 foreign keys from `public` to `auth.users`** (verified via
`pg_constraint`, not grepped from migration history which is noisier because of historical
drops):

```sql
select conname, conrelid::regclass, pg_get_constraintdef(oid)
from pg_constraint where contype='f' and pg_get_constraintdef(oid) ilike '%auth.users%';
```
→ `gym_owner_user_id_fkey` (`gym.owner_user_id`), `gym_membership_user_id_fkey`
(`gym_membership.user_id`), `clientes_auth_user_id_fkey` (`clientes.auth_user_id`) — all
`ON DELETE CASCADE`/`SET NULL` to `auth.users(id)`.

Historical grep of migrations shows 10 `references auth.users` lines total, most of which
were later dropped — Phase 3's `contract_b_drop_user_id_columns.sql` (2026-07-05) removed
7 `user_id` columns during the RLS cutover (confirmed by memory note
`phase3-rls-execution-progress.md`). The 3 live ones above are what remains.

**`supabase_vault` extension** (verified live: `pg_extension` lists `supabase_vault 0.3.1`
alongside `pgcrypto`, `plpgsql`, `uuid-ossp`, `pg_stat_statements`) is used in exactly 2
migrations — `20260713190000_reclamar_tenant_binding.sql:54` and
`20260722120000_reclamar_por_codigo_firma.sql:50` — both `select ... from
vault.decrypted_secrets where name = 'tenant_assertion_key'`. `supabase_vault` is a
Supabase-authored extension; it does not exist on plain Postgres. Trivial to replace
(read the HMAC key from an env var or a `pgcrypto`-encrypted config table instead) —
2 call sites.

**Hours (mechanical DDL fix only, assuming a replacement `users` table already exists —
i.e. NOT counting the auth migration itself, see §1b): 4-8h asserted**, grounded in "3 FK
rewrites + 2 vault call-site swaps + full-suite re-run," not measured.

### 1b. Auth — **the dominant cost, and the one genuine escape-hatch nuance**

This is the one component where "exit Supabase" has two very different price tags
depending on what "exit" means, and the prior audits don't separate them:

- **Exit Supabase Cloud, keep the Supabase OSS stack (self-hosted GoTrue+PostgREST+PG)**:
  `auth.uid()`, the `auth` schema, RLS policies, and the PostgREST verb surface are
  **unchanged** — you're moving infrastructure, not rewriting SQL or app code. Verified:
  Supabase's own self-hosting docs (fetched 2026-07-27,
  <https://supabase.com/docs/guides/self-hosting/docker>) confirm the self-hosted Docker
  Compose stack ships the *same* open-source components as the cloud product — Postgres,
  **Auth (GoTrue)**, PostgREST, Realtime, Storage, Kong — under "MIT, Apache 2, PostgreSQL,
  or equivalent" licenses, explicitly stating these "mirror the cloud offering." The docs
  fetched do **not** spell out `auth.uid()`/RLS parity in so many words (I could not find
  that exact sentence on the page — flagging this as inferred, not quoted) — but it follows
  structurally from GoTrue being the same server writing the same `auth` schema either way.
  **This path's cost is infra/ops, not SQL rewrite: ASSERTED 16-30h** (docker-compose the
  stack, restore a `pg_dump`, repoint DNS/TLS, re-verify against the existing 37-file
  `supabase/tests/` denial suite unchanged). This is the actual cheap floor of "leaving
  Supabase" that the prior audits didn't call out as a distinct, much-cheaper option.

- **Exit the Supabase *auth model* entirely (Auth0, Clerk, hand-rolled auth + a bespoke
  `users` table)**: this is the expensive path, and it's where the real numbers live.

**Concrete counts, migrations (`grep` across `supabase/migrations/`, historical — includes
drop/recreate churn across 87 files, so treat as an upper bound on distinct call sites,
not a live count):**
- `auth.uid()`: **145 occurrences across 46 files**
- `auth.jwt()`: **0 occurrences** — no policy or function reads the JWT payload directly;
  everything goes through `auth.uid()`. This is good — it's the smaller, more mechanical
  surface of the two Supabase RLS idioms.
- `auth.users` (schema-qualified table refs): **31 occurrences across 15 files**
- Any `auth.*` reference: **177 occurrences across 47 files**

**Live counts (queried directly against `pg_policies` / `pg_proc`, not grep — this is the
number that actually matters, since migrations accumulate drop/recreate noise):**

```sql
select count(*) total, count(*) filter (where qual ilike '%auth.uid()%'
  or with_check ilike '%auth.uid()%') using_auth_uid
from pg_policies where schemaname='public';
-- {"total":101,"using_auth_uid":28}

select count(*) filter (where qual ilike '%is_staff_of%' or with_check ilike '%is_staff_of%') uses_is_staff_of,
       count(*) filter (where qual ilike '%has_role%' or with_check ilike '%has_role%') uses_has_role
from pg_policies where schemaname='public';
-- {"uses_is_staff_of":54,"uses_has_role":2}
```

→ **101 live RLS policies in `public`. 28 call `auth.uid()` directly; 54 more call it
indirectly through the `is_staff_of()` helper (the same correlated-SubPlan predicate
ADR-0013 falsely claims is O(1) — see the multigym-RPC memo); 2 more through `has_role()`.
84 of 101 policies (83%) are ultimately anchored on `auth.uid()`.** The remaining 17 are
anon-open catalog-read policies (`using (true)`) with no auth dependency at all.

```sql
select count(*) total_functions, count(*) filter (where prosecdef) security_definer,
  count(*) filter (where pg_get_functiondef(p.oid) ilike '%auth.%') refs_auth_schema,
  count(*) filter (where not prosecdef and pg_get_functiondef(p.oid) ilike '%auth.%') invoker_refs_auth
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
-- {"total_functions":38,"security_definer":18,"refs_auth_schema":22,"invoker_refs_auth":10}
```

→ **38 live functions in `public`. 18 are `SECURITY DEFINER` (matches AGENTS.md's "18
definer functions" exactly). 22 of the 38 reference the `auth` schema in their body — and
10 of those 22 are `SECURITY INVOKER`**, meaning even non-privilege-escalating functions
(e.g. money-path writers under ADR-0005) are directly coupled to `auth.uid()`, not
insulated from it. (Note: AGENTS.md states "34 public functions" — the live count is 38;
either the doc is stale by 4 functions or counts a narrower surface. Flagging the
discrepancy rather than silently reconciling it.)

**App-layer auth admin API** — the one place service-role / GoTrue-admin coupling lives:
`supabase/functions/activar-cuenta/index.ts:92` (`admin.auth.admin.createUser`) and
`:105` (`admin.auth.admin.generateLink({ type: 'recovery', ... })`). Verified via grep for
`service_role`/`SERVICE_ROLE` across the whole repo (excluding worktrees): the **only**
production code holding the service-role key is this one edge function — the two Next.js
apps hold no service-role key (matches ADR-0015's stated "no-service_role-import
property," ratified 2026-07-13/15). `tools/perf/seed-local.mjs` and `tools/perf/env.mjs`
also reference `SUPABASE_SERVICE_ROLE_KEY`, but those are local dev/perf-harness scripts,
not shipped code. This containment is genuinely good and non-trivial to have held —
worth stating plainly (Rule 7): **this is a component that is actually sound as built.**

**Hours to fully exit the Supabase auth model (RLS rewrite + function rewrite +
provisioning-flow redesign + app SDK swap), asserted from the counts above, not measured:**

| Sub-task | Basis | Hours (asserted) |
|---|---|---|
| Rewrite `is_staff_of()`/`has_role()`/28 direct policies + re-verify all 37 `supabase/tests/*.sql` denial suites | 101 policies, 84 auth-anchored, 37 live suite files | 40–80h |
| Rewrite 22 auth-referencing functions' bodies (18 of them `SECURITY DEFINER`, highest blast radius) | live `pg_proc` count | *(bundled into row above — same review pass)* |
| Redesign the activation/provisioning flow off GoTrue's `createUser`/`generateLink`/recovery-token model | 2 admin-API call sites, but the whole `/activar` UX + `nucleo.ts` decision logic assumes GoTrue's token_hash shape (ADR-0015) | 24–40h |
| Swap `@supabase/ssr` cookie/session plumbing for a new SDK in the 5 pnpm-graph files + migrate the 9 raw `getClaims()` sites | file:line list in §0 | 16–24h |
| **Total, full auth-model exit** | | **80–144h** (2–3.5 focused weeks) |

This is smaller than the prior audit's "1–3 month" framing *if* the seam-closing work
(§2) is done first, but it is still, by a wide margin, the single largest lock-in bucket
in the codebase — RLS-anchored auth is structurally the deepest coupling any
Supabase/Postgres-RLS app has, not a RED-2.0-specific defect.

### 1c. PostgREST / RPC query-builder layer — **moderate, well-contained**

```
Grep "\.rpc\(" packages/data/src   → 41 occurrences across 19 files
Grep "\.from\(" packages/data/src  → 132 occurrences across 33 files
```

All 173 call sites live inside `packages/data/src/server/` (37 non-test source files) —
the DAL is a real, enforced boundary (ADR-0001: apps never call PostgREST directly, only
through `@gym/data`; `.dependency-cruiser.cjs` runs on every commit per AGENTS.md/CLAUDE.md).
Most calls are simple `.from(x).select(y).eq(z)` shapes, which translate near-1:1 to
`SELECT y FROM x WHERE z=$1`. PostgREST's fancier surface (`.upsert(`, `.or(`, `!inner`
embeds, `.range(`) is used sparingly — **20 occurrences across 7 files**
(`clientes.ts`, `respaldo.ts`, `roster-nav.ts` + their tests), which is the harder-to-port
20% of this layer.

**Hours (asserted): 40-60h** to rewrite all 173 call sites to raw `pg`/Drizzle/another
query layer + re-run `pnpm test` (packages/data's vitest suite mocks this boundary per
AGENTS.md, so none of this is caught by CI — it's manual verification against
`supabase/tests/` for the RPC half). Genuinely the *cheapest per-call-site* bucket because
the boundary is already singular and already enforced; it's moderate only because of raw
volume (173 sites), not depth of coupling.

### 1d. Storage — **unused, zero cost**

```
Grep "storage\.from\(" (excluding worktrees) → 0 matches in code (2 matches, both in docs/handoffs)
```
Confirmed independently of the orchestrator's stated baseline. $0, 0h.

### 1e. Realtime — **unused, zero cost**

```
Grep "\.channel\(|postgres_changes" (excluding worktrees) → 0 matches in code (2 matches, both in docs)
```
Confirmed independently. $0, 0h.

### 1f. Edge functions (Deno) — **thin runtime coupling, real business-logic coupling**

2 functions live (`mcp__supabase__list_edge_functions`): `send-email` (v6, ACTIVE) and
`activar-cuenta` (v3, ACTIVE), both `verify_jwt: false`.

- **Runtime surface** (`Deno.serve`, `Deno.env.get`) is trivially portable — both
  functions are already written "THIN by contract" (their own doc comments) with all
  decision logic in pure `nucleo.ts`/`correo.ts` modules, Deno-only at the edges.
  **Asserted 8-16h** to port the Deno shell of both functions to Node/another edge runtime.
- **Business-logic coupling is NOT in the Deno runtime — it's the GoTrue admin API and the
  Auth Hook contract**, already counted under §1b (`createUser`/`generateLink`) and below.

### 1g. Email / auth templates — **already substantially de-risked**

`send-email/index.ts` already replaced Supabase's built-in mailer with Resend (shipped
2026-07-10 per memory `send-email-hook-shipped.md`) — delivery itself has **zero**
Supabase dependency today. What remains Supabase-specific is the **hand-off contract**:
the function receives Supabase's Auth Hook payload shape (`user.email`,
`email_data.{token_hash,redirect_to,email_action_type,site_url}`, verified via the
`standardwebhooks` library against a Supabase-issued hook secret,
`send-email/index.ts:87`) and constructs links using GoTrue's `token_hash` recovery-link
format. That coupling is inseparable from whichever auth model is in place — it collapses
into §1b's cost, not a separate one. **Asserted residual: 0-4h** on top of the auth
migration, not additional to it.

---

## 2. Forced ranking — worst to least-bad, all in scope for this mandate

1. **RLS-policy + function auth coupling (§1b core)** — 84/101 live policies and 22/38 live
   functions anchored on `auth.uid()`/the `auth` schema; 3 live FKs to `auth.users`.
   **Breaks at: any decision to leave the Supabase auth model** (not a scale threshold —
   this is a one-time migration cost, not a growing one; it does not get worse with more
   gyms, only with more accreted policies/functions per new feature). **Cost: 80-144h,
   asserted.** Falsification: if it turns out RLS predicates need to be portable to
   another provider's Postgres RLS convention that *also* calls it `auth.uid()` (e.g. a
   self-hosted GoTrue), the cost collapses to §1a's 4-8h + ops-only — **checked: true for
   the self-host path** (verified via Supabase's own self-hosting docs, same GoTrue
   component), **false for a hosted third-party (Auth0/Clerk)** — those do not populate a
   Postgres `auth` schema at all, so the full 80-144h stands for that path specifically.

2. **Activation/provisioning flow's GoTrue admin-API coupling (`activar-cuenta`)** —
   `admin.auth.admin.createUser`/`generateLink` are Supabase-proprietary REST endpoints
   with no PostgREST/SQL equivalent; the entire `/activar` UX (2026-07-24 cutover, per
   memory) assumes GoTrue's recovery-token flow. **Breaks at: same trigger as #1** (it's
   the same migration event, just the highest-blast-radius single file within it — this
   is the one piece that can't be mechanically rewritten, only redesigned). **Cost:
   bundled into the 80-144h above (24-40h of it).** Honestly the single riskiest file to
   touch, not because it's large, but because it's a security-sensitive flow shipped and
   live-verified as recently as 2026-07-24 — regression here is a real member-facing
   incident, not a build break.

3. **PostgREST query-builder surface (173 call sites, §1c)** — real but shallow: mostly
   1:1-translatable syntax, already confined to one 37-file package behind an enforced
   boundary. **Breaks at: leaving PostgREST specifically while staying on Postgres**
   (e.g. moving to Drizzle/Prisma/raw `pg` on the same DB) — a scenario with no evidence
   anyone is considering, but the cheapest of the three real buckets per call site.
   **Cost: 40-60h.**

4. **The un-seamed `getClaims()` call sites (§0)** — real, but the prior audit overstated
   its leverage. Ranked here, not #1, precisely because closing it does nothing to #1 or
   #2. **Cost to close: 4-6h** (see §3). Leaves ~90% of the real exit bill (#1+#2)
   completely untouched — closing it does NOT "convert a 1-3 month migration into a
   contained one" as claimed; it converts a ~9-call-site cleanup into a 1-call-site
   cleanup, which is real but modest.

5. **Storage/Realtime unused surface, `supabase_vault` extension, Deno runtime shell** —
   genuinely near-zero. Storage/Realtime: $0 (unused). `supabase_vault`: 2 call sites,
   swappable for an env var in under an hour once you're already touching that migration.
   Deno shell: 8-16h, dwarfed by the business logic it hosts. **Least bad by a wide
   margin — includes this session's one plainly-good finding (Rule 7): the
   no-service-role-key-in-the-apps containment (ADR-0015) has genuinely held, verified
   by grep across the whole repo, not just asserted.**

---

## 3. The actionable answer

**Cheapest reversibility investment available today:** close the `getClaims()` seam —
generalize `packages/data/src/server/_auth.ts`'s existing `requireOperator()` (or add a
sibling `getSessionClaims()`) and route the 9 raw call sites in §0 through it, the same
way 16 admin-side DAL files already route through `requireOperator()`.

- **Cost: 4-6h, asserted** (grounded in: pattern already exists and is proven at 16
  call sites; this is 9 mechanical replacements + one new/generalized function + a test
  run, not new design work — not a stopwatch measurement).
- **What it buys:** ONE place to react if the JWT claim shape changes (relevant now —
  `PERF-LOOP.md:233` already flags that the prod signing-key config determines whether
  `getClaims()` verifies locally or costs a network round-trip per request; that's a live
  operational lever, not a hypothetical). It does **not** reduce the 80-144h RLS/function/
  provisioning migration cost (§1b) — that cost is structural to using Postgres RLS at
  all, not to how many call sites read the claims in app code. Calling this "the highest
  leverage-per-hour item" (prior audit) is fair only if leverage is measured in
  *operational flexibility for a claims-shape change*, not in *exit-cost reduction* — it
  shaves perhaps 4-8h off the eventual 80-144h bill (closing 9 duplicated call sites
  saves you rewriting them 9 times instead of once), roughly a 5-8% haircut on the total,
  not a phase-change.
- **Second-cheapest, larger payoff, NOT previously named:** if actual exit is ever live
  considered, evaluate **self-hosting the Supabase OSS stack** (§1b) before evaluating a
  third-party auth provider — it is the only path that avoids the 80-144h bucket
  entirely, for an ops cost of ~16-30h. This wasn't in the prior audit's framing at all
  and is the single highest-leverage fact this session adds.

**Cost to do the SAME seam-closing work after 3,000 gyms are live:** the code diff is
identical in size (9 call sites don't multiply with tenant count — this is app code, not
per-tenant data), so the **coding cost stays ~4-6h**. What changes is the **blast radius
of shipping it**: confirmed via grep, this repo has **no feature-flag, canary, or staged-
rollout infrastructure today** (searched for `feature.?flag|canary|percentage.?rollout` —
0 hits in app code). `proxy.ts` runs on every request for every gym through the single
shared multi-tenant Vercel deployment per app (ADR-0012) — there is no per-tenant deploy
boundary to canary against. At today's 4 gyms / 9 `auth.users`, a regression in this path
is caught by ~9 real sessions; at 3,000 gyms sharing the same deployment, the identical
diff ships to all 3,000 simultaneously with the same zero-canary posture. **Asserted:
12-22h post-scale** (add a canary host / feature-flag gate / synthetic pre-and-post
monitoring around what is otherwise the same 4-6h diff) — roughly **3-4x the coding cost**,
driven entirely by the missing staged-rollout capability, not by the auth refactor itself.
That gap (build canary/staged-rollout tooling once, generically, now while it's cheap)
is arguably a higher-leverage investment than the `getClaims()` seam itself, and is not
specific to auth — it would pay for itself on every future change to shared,
every-gym-simultaneously code paths, of which auth is only one.

---

## 4. Blind spots — what this session did NOT examine

1. **Did not measure wall-clock hours empirically** (no timed spike, no historical PR/issue
   duration data pulled for comparable past refactors in this repo, e.g. the Phase-3 RLS
   cutover or the single-email-activation cutover, which would be the best real analog for
   how long an auth-surface change actually took here). All hour figures are asserted from
   call-site counts and structural complexity, flagged as such throughout — not measured.
2. **Did not evaluate a specific replacement auth provider's actual migration tooling**
   (e.g. whether Auth0's or Clerk's Postgres-RLS integration patterns reduce the 80-144h
   estimate below what a from-scratch RLS rewrite implies — some providers ship
   RLS-compatible JWT shims that could cut this materially).
3. **Did not verify the self-hosted-Supabase auth.uid()/RLS-parity claim against primary
   source text** — the fetched docs confirm identical OSS components and licenses but did
   not, in the fetched summary, explicitly state RLS/JWT parity in quotable text; I
   inferred it from GoTrue's known architecture rather than a quoted guarantee. This is
   the single highest-leverage claim in this report (§3) and it deserves a second, deeper
   fetch (or a live self-hosted trial) before anyone acts on the 16-30h number.
4. **Did not audit `docs/adr/` or `supabase/tests/` for OTHER Supabase-specific SQL idioms**
   beyond `auth.*` and `vault.*` — e.g. whether any migration uses `pgsodium`,
   `pg_graphql`, Supabase's `net.http_*` extension, or other Supabase-authored Postgres
   extensions. `pg_extension` was queried and only 5 extensions are installed
   (`pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`) — none of
   the more exotic Supabase extensions are in use — but I did not read every migration
   line-by-line for one-off idiom usage outside the patterns grepped.
5. **Did not price out or evaluate the canary/staged-rollout tooling gap named in §3**
   beyond confirming its absence — sizing that investment (what it would cost to build,
   what it would need to cover beyond auth) is out of this mandate's scope but is a
   concrete next-session candidate.
6. **Did not reconcile the AGENTS.md "34 public functions" claim against the live count of
   38** — flagged the discrepancy in §1b but did not determine whether AGENTS.md is stale,
   scoped narrower (e.g. write-bearing only, which AGENTS.md separately says is 25), or
   whether some of the 38 are overloads/duplicates that should collapse to one logical
   function.
