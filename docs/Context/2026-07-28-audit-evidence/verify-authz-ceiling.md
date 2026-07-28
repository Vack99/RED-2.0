# verify:authz-ceiling — independent re-derivation of the gym_membership ceiling

**Agent:** `verify:authz-ceiling` · **Date:** 2026-07-28 · **Target:** live prod `hjppxawglmukfvsgmcog`, Postgres 17.6
**Access:** read-only (`SELECT`, `EXPLAIN` without `ANALYZE`, `pg_catalog`, `get_advisors`). Every EXPLAIN below was run
inside a `set local role authenticated; set local request.jwt.claims = '…'` context so RLS actually applied (the MCP's
raw role is table owner / bypasses RLS). Nothing written, no DDL, no `apply_migration`.

**Method note:** Steps 1–3 (call-site inventory, live policy read, EXPLAIN shapes) were done BEFORE reading
`arch-authz.md`, per the mandate. §5 is the after-the-fact comparison.

---

## 1. Every call site that reads `gym_membership` (file:line, predicate, prefilter, LIMIT)

```
grep -rn '\.from\("gym_membership"\)|from gym_membership|FROM gym_membership' -- *.ts *.sql
```

| # | Call site | Query shape | `user_id` predicate | role prefilter | `LIMIT` |
|---|---|---|---|---|---|
| Q1 | `packages/data/src/server/agenda-miembro.ts:147-150` (`resolverMiembroGym`, member agenda/booking) | `select gym_id, created_at, gym(…) … order by created_at` | **none** | **none** | **none** |
| Q1b | `packages/data/src/server/clase-miembro.ts:133-136` (`resolverMiembroGym`, class-detail page — near-identical duplicate, NOT in the prior audit's list) | same shape | **none** | **none** | **none** |
| Q2 | `packages/data/src/server/agenda-miembro.ts:172` (`getEsMiembro`) | `select gym_id … limit 1 … maybeSingle()` | **none** | **none** | yes (1) |
| Q3 | `packages/data/src/server/gym.ts:49-55` (`resolveOperatorGym`, admin app, every request) | `select gym_id … in role(owner,operator) … order by gym_id … limit 1` | **none** | **yes** | yes (1) |
| — | `packages/data/src/server/agenda-miembro.ts` / `clase-miembro.ts` self-favorite/consume reads | scoped by an already-resolved `gymId` parameter (post-resolution), not a fresh `gym_membership` read | n/a | n/a | n/a |

Real routes that trigger Q1/Q1b/Q2 (verified, not assumed):
- Q1 fires on every render of the member agenda/booking home (`getAgendaSemanaMiembro`, `getSaldoMiembro`,
  `getPerfilResumenMiembro` all call the same `cache()`-wrapped `resolverMiembroGym`, so it is 1 execution per request,
  not 3 — confirmed by the docstring at `agenda-miembro.ts:134-139`).
- Q1b fires on `apps/client/src/app/clase/[sessionId]/page.tsx` → `getClaseDetalleMiembro` — the class-detail sheet, a
  second hot member route with the identical unfixed shape. Grepped: `getClaseDetalleMiembro` used only there.
- Q2 (`getEsMiembro`) is deliberately **not** `cache()`-wrapped (comment explains why: it re-checks after a
  same-request claim retry) — `apps/client/src/app/reservar/page.tsx:41` is its caller.
- Q3 runs once per admin-app request via `getOperatorGym()`.

`gym.ts:25-26` states the reasoning that produced Q3's gap out loud: *"`gym_membership`'s RLS self-read policy already
scopes the read to the caller … so no explicit `user_id` filter is added here."* That comment is the root cause on all
four sites — RLS narrows *visibility*, not *scan cost*, and nothing here supplies the predicate RLS needs to be cheap.

---

## 2. Live policies on `gym_membership` (pg_policies, read this session)

```sql
select policyname, permissive, roles, cmd, qual from pg_policies where tablename='gym_membership';
```
```
gym_membership_self_select  | PERMISSIVE | {authenticated} | SELECT | (user_id = ( SELECT auth.uid()))
gym_membership_staff_select | PERMISSIVE | {authenticated} | SELECT | ( SELECT is_staff_of(gym_membership.gym_id))
```

`is_staff_of(gym_membership.gym_id)` references the **outer row's own column** — despite the `(select …)` wrapper
(the ADR-0001 idiom that hoists `auth.uid()`), this cannot become an InitPlan because its argument is correlated to the
row being scanned. `supabase/migrations/20260714080000_rls_uncorrelated_predicates.sql:34-38` says this explicitly and
deliberately leaves `gym_membership_staff_select` unrewritten ("an inline `gym_id in (select … from gym_membership …)`
inside a policy ON `gym_membership` triggers 'infinite recursion detected in policy'"). That migration fixed the
*other* 25 SELECT policies (on `clientes`, `ventas`, `class_session`, …) to a hashed InitPlan; `gym_membership`'s own
two policies were explicitly, correctly, exempted — and are the one place in the schema still paying the per-row cost.

**Function costs (`pg_proc`):** `is_staff_of`, `is_member_of`, `has_role`, `staff_gym` are all `procost=100` (Postgres's
generic default for a non-C function — nobody has tuned it) and `provolatile='s'` (STABLE), `prosecdef=true`.

---

## 3. EXPLAIN shapes (live, RLS enforced, no ANALYZE)

### 3.1 Q1's actual shape — confirmed: no index path exists

```sql
select set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}', true);
set local role authenticated;
explain (verbose, costs) select gym_id, created_at from public.gym_membership order by created_at asc;
```
```
Sort
  ->  Seq Scan on public.gym_membership
        Filter: ((SubPlan 1) OR (gym_membership.user_id = (InitPlan 2).col1))
        SubPlan 1 -> Result: is_staff_of(gym_membership.gym_id)     ← evaluated FIRST, every row
```

Forcing the issue (`set local enable_seqscan = off`, 10¹⁰ cost penalty):
```
Seq Scan on public.gym_membership  (cost=10000000000.03..10000000001.30 rows=1)
  Filter: ((SubPlan 1) OR …)
```
**The planner takes the 10-billion-cost penalty rather than use an index. There is no alternative access path for the
unfiltered shape — confirmed structurally, not inferred.**

### 3.2 The candidate fix — `.eq("user_id", uid)` — confirmed to flip the plan

```sql
where user_id = '<uid>'::uuid order by created_at asc;
```
At n=9 rows, the planner still *picks* Seq Scan (correct — index overhead isn't worth it below ~hundreds of rows), but
forcing `enable_seqscan=off` proves the index path is real and structurally available today:
```
Index Scan using gym_membership_pkey on public.gym_membership
  Index Cond: (gym_membership.user_id = '<uid>'::uuid)
  Filter: ((SubPlan 1) OR (gym_membership.user_id = (InitPlan 2).col1))
```
`gym_membership_pkey` is `btree (user_id, gym_id)` (`supabase/migrations/20260702161010_create_gym_membership.sql:21`)
— `user_id` already leads. **No new index, no DDL.** Adding the predicate turns the scan from "every row in the
table, platform-wide" into "the ≤3 rows this user actually holds," after which the residual `is_staff_of` OR is cheap
almost by construction.

The caller-known value to filter on already exists in the codebase's own idiom:
`packages/data/src/server/_auth.ts:18-22` (`requireOperator`) gets it via `supabase.auth.getClaims()` →
`claims.claims.sub` — a local JWT decode, not a network round trip. The fix is exactly:
```ts
const { data: claims } = await supabase.auth.getClaims();
// …
.eq("user_id", claims?.claims?.sub)
```
at Q1, Q1b, and Q2 (Q3 already has a role prefilter but not this predicate either — same one-line addition closes it
too, for the same zero-DDL reason). **This independently reproduces the "3 TS lines, zero DDL" claim** — it's 3 lines
per site, at 4 sites (Q1, Q1b, Q2, Q3), not 3 lines total, since Q1b (`clase-miembro.ts`) is a genuine 4th duplicate
the prior report didn't list.

### 3.3 Q3's shape — the role prefilter genuinely narrows the expensive part, not the scan

```
Limit -> Sort -> Seq Scan on public.gym_membership
  Filter: ((role = ANY('{owner,operator}')) AND ((SubPlan 1) OR (user_id = …)))
```
The `role = ANY(...)` conjunct is cheap and (per Postgres's `AND`-conjunct cost-reordering, which — unlike `OR` —
*does* happen) is evaluated before the OR for most rows, so `is_staff_of` is skipped for every `member`-role row. But
the outer `Seq Scan` + `Sort` still must materialize and touch every row of the table for the `ORDER BY … LIMIT 1` to
be correct — I/O cost is still O(total table rows); only the *expensive* function-call cost is bounded to the
platform's staff-row count. This is a real, structural asymmetry vs. Q1/Q1b/Q2, not a guess.

---

## 4. Magnitude — gym-count ceiling, arithmetic shown

**Per-call cost of `is_staff_of()`:** I did not independently time it in this session (no `ANALYZE`, and a clean
20k-iteration timing harness is more instrumentation than this pass budgeted for). I instead cross-checked two
in-repo empirical numbers against each other:
- `supabase/migrations/20260714080000_rls_uncorrelated_predicates.sql:8-9` cites a live bench: `asistencias` over
  5,000 rows with the *same* correlated-`is_staff_of`-per-row shape → 42ms vs ~3ms RLS-off ⇒ **~7.8µs/call marginal**.
- `arch-authz.md §2.3` reports a dedicated 20,000-iteration `clock_timestamp()` harness on live prod →
  **16.75µs/call** for `is_staff_of()`, vs 7.25µs/call for the inline `EXISTS` equivalent (the `SECURITY DEFINER`
  wrapper is the 2.3× difference). This is a more direct, purpose-built measurement than the migration comment's
  incidental one, so I use **16.75µs/call** for the arithmetic below — the two are the same order of magnitude
  (2.1×), which is the right amount of agreement for one number derived incidentally and one measured on purpose.
- I did **not** reproduce this measurement myself — flagging per rule 6 rather than presenting it as mine.

**Rows-per-gym, `m`, and why it is the whole argument:** `m` = activated accounts in `gym_membership` per gym
(members who've signed in at least once, PLUS ~1 owner + operators). This is **not** `clientes` count — it's gated by
activation. Independently re-verified this session, not taken from the brief:
```sql
select count(*) total, count(*) filter (where auth_user_id is not null) activated
from public.clientes;                                    --> 116 total, 5 activated (4.3%)
select role, count(*) from public.gym_membership group by role;  --> member=5, owner=4 (0 operator rows exist yet)
```
**Confirms the 4.3% activation figure exactly (5/116) — independently reproduced, not trusted on the brief's say-so.**

Cost model (own re-derivation, same shape arch-authz.md used): `g · m · (c_scan + c_helper)` ≈ `g · m · 17.14µs`,
since Q1/Q1b pay the expensive `is_staff_of` arm on essentially every row (it is evaluated *first* in the OR, per the
plan text order in §3.1 — Postgres does not reorder `OR` operands, only top-level `AND` conjuncts).

| Activation scenario | `m` @ 150 members/gym | `m` @ 300 members/gym | Gyms @ 50ms | Gyms @ 1s |
|---|---|---|---|---|
| **Mature / full (60–100%)** — arch-authz.md's model | 92–150 | 152–302 | **~10–41** | **~207–822** |
| **Today, measured live (4.3%)** — this session's own scenario | ~7.5 (150×.043+1) | ~13.9 (300×.043+1) | **~208–389** | **~4,167–7,780** |

**Both rows are the same mechanism at different points on one dial, not two competing "right answers".** The prior
audit's 65–330 gyms sits inside neither extreme cleanly, but closer to a 15–40% activation assumption — plausible for
a "some growth already happened" scenario, unverifiable without their working.

---

## 5. Verdict — comparing to `arch-authz.md`, read only now

**Mechanism, call sites, and fix: independently reproduced, not just trusted.** My own EXPLAIN output (§3.1–3.2,
gathered before reading their doc) matches theirs line for line: same two policies, same correlated SubPlan, same "no
index path for the unfiltered shape / index path exists once `.eq("user_id",…)` is added" result, same
`gym_membership_pkey` DDL-free fix. I found a **4th call site they missed** (`clase-miembro.ts:133-136`, the
class-detail page) — an exact duplicate of Q1, so the fix is 4 sites, not 3, and the exposed member-facing surface is
wider than reported (two hot member routes, not one).

**Which of the two competing numbers is right — 65–330 (prior audit) or ~10–32 (arch-authz.md)?** Neither is "the"
number; both are conditional on an activation assumption neither report states as a variable. arch-authz.md's
~10–32-gyms-at-50ms figure explicitly models `m` at 60–100% activation ("model maturity" — its own §4.4 language) —
i.e., a **future, aspirational** state, not today's. The SAME workflow's own headline claims assert **today's**
platform-wide activation is 4.3%, and 0% at the single most mature real gym. Re-run their identical formula at
**today's measured rate** (not projected) and the 50ms ceiling is **~200–400 gyms**, and the 1s ceiling is
**~4,000–7,800 gyms** — past the entire 3,000-gym target. **This is a real tension the prior report doesn't name: low
activation is currently a product failure AND an accidental performance safety valve for this exact bug — fixing
activation (the roadmap's actual goal) drags this ceiling down by roughly 20×, from "past target" to "10–40 gyms."**
So: the qualitative verdict (this is real, this is the first hard ceiling in the authz layer, the fix is
`.eq("user_id", uid)` with zero DDL) is CONFIRMED. The specific number "~10–32 gyms" is correct **only under a full-
activation assumption that does not describe production today** — at today's measured behavior the number is
roughly an order of magnitude higher, and it gets worse (i.e., the ceiling drops) exactly as the platform's other
stated goal (raise activation) succeeds. Both the 65–330 prior estimate and the ~10–32 arch-authz.md estimate should
be read as points on this same activation-indexed curve, not as a resolved disagreement.

**Fix cost — verified:** ~3 lines of TypeScript per call site (`supabase.auth.getClaims()` → `.eq("user_id", sub)`),
using a pattern (`getClaims()`) already established elsewhere in the same package (`_auth.ts:18-22`). Zero DDL — the
covering index (`gym_membership_pkey`, `user_id` leading) already exists in production. 4 call sites, not 3.

---

## 6. The 5 worst things about this ceiling specifically, worst first

1. **`resolverMiembroGym` (Q1 + Q1b, duplicated across two DAL files) has no `user_id` predicate, no role prefilter,
   no `LIMIT`, and calls a `SECURITY DEFINER` function on every row of `gym_membership` platform-wide, on two
   different hot member routes.** Breaks the 50ms budget at ~10–41 gyms (mature activation) to ~200–400 gyms (today's
   4.3%). Confidence: measured mechanism (EXPLAIN, this session), modelled magnitude (per-call cost sourced from
   arch-authz.md's timing harness, not independently re-timed).
2. **The severity of #1 is activation-rate-dependent, and nobody has priced that interaction.** Growing member
   activation (a stated roadmap goal, since only 4.3% of `clientes` are activated today) directly and proportionally
   *lowers* this ceiling. Shipping the activation funnel without shipping this fix first converts a currently-latent
   bug into a live one, possibly mid-rollout.
3. **`getEsMiembro` (Q2) has the same missing predicate but a `LIMIT 1` with no `ORDER BY`, so a *newly registered*
   member — whose row is physically the most recently inserted — is the worst case: they must scan past nearly every
   pre-existing row before Postgres's sequential-scan-with-early-exit reaches theirs.** This makes the query
   structurally worst for exactly the population (first-time claimers) hitting it right after a fresh `/activar` flow.
4. **`resolveOperatorGym` (Q3, admin app) still pays an O(total-table) I/O scan even with its role prefilter**, because
   the `ORDER BY gym_id LIMIT 1` forces materializing and sorting every row that survives the filter before limiting.
   The role prefilter bounds the *expensive* part (function calls) to platform-wide staff rows, not member rows — a
   smaller, roughly gym-count-linear (not member-count-linear) quantity — but it is not free of the underlying defect,
   and the fix is the same one line.
5. **Supabase's own performance advisor flags this as a generic WARN ("multiple permissive policies"), not as the
   scan-shape defect it actually is.** `get_advisors(type=performance)` on live prod returns exactly one line about
   `gym_membership` (`multiple_permissive_policies`), with no distinction between "two policies that both hoist to
   InitPlans" (fine, that's `clientes`/`reservation`) and "two policies where one is an unavoidable per-row
   `SECURITY DEFINER` call" (this table). Nothing in the standard tooling would have surfaced this without reading
   the query plans directly.

---

## 7. What I could not verify (honesty over confidence)

- **I did not independently re-time `is_staff_of()`.** The 16.75µs/call figure is arch-authz.md's, not mine, cited
  and cross-checked against a second in-repo source (the 20260714080000 migration comment, 7.8µs/call marginal on a
  different table) rather than trusted blind. The two are the same order of magnitude; I did not resolve the 2.1×
  gap myself.
- **I did not seed rows to observe real behavior at scale.** Every gym-count number here is a linear extrapolation
  from a 9-row live table (1 page, fully cached) using measured *per-call* constants — not an observation. Postgres
  I/O cost is very likely non-linear once `gym_membership` no longer fits in `shared_buffers` (224MB per the shared
  baseline) or once index depth grows past 2–3 levels; my model assumes it stays linear across the whole range,
  which is optimistic at the high end (millions of rows) and irrelevant at the ranges that matter here (hundreds to
  low millions).
- **I did not compute a throughput/connection-pool ceiling**, only a per-request latency ceiling. The task asked for
  gym-count-at-which-latency-budget-breaks, which is what's above; a *concurrent* ceiling (how many simultaneous
  `/reservar` loads before `max_connections=60` or the PgBouncer/Supavisor pool saturates) is a related but distinct
  question I did not size. At the activation-4.3% end of my range (thousands of gyms before 1s), this could plausibly
  bind before the raw per-request latency does; I flag it as unresolved rather than guessing a number.
- **The activation-rate framing is itself inherited from the brief's headline claims (4.3% platform-wide), though I
  independently re-derived it from live `clientes`/`gym_membership` rows this session** (§4) rather than trusting the
  brief's assertion — so this specific number is measured, not borrowed.
