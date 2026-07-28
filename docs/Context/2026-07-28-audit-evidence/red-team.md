# red:team — the prosecution: this architecture fails before 3,000 gyms

**Agent:** `red:team` · **Date:** 2026-07-28 · **DB:** live prod `hjppxawglmukfvsgmcog`, read-only
**Mandate:** build the strongest HONEST case for "this must change now." Not balanced. Not fair. But every step
rests on evidence I gathered myself, and I may not invent a defect.

**Standard I held myself to:** I did not adopt any Workflow-1 claim as a premise. Every load-bearing fact below is
either (a) SQL I ran this session with its output pasted, (b) a `file:line` I opened, or (c) a URL I fetched today
with the date. Where I reuse another agent's number I say so and mark it. Where a number is modelled I show the
formula and the inputs.

---

## 0. The evidence ledger — what I verified first-hand this session

| # | Claim | How I proved it | Result |
|---|---|---|---|
| E1 | `ventas` has no UPDATE and no DELETE policy | `select tablename,policyname,cmd from pg_policies where tablename='ventas'` | only `ventas_staff_insert` (INSERT), `ventas_staff_select` (SELECT) |
| E2 | The derived balance IS writable by any operator | `information_schema.column_privileges` for `authenticated` | UPDATE granted on `clases_restantes`, `vence`, `gym_id`, `auth_user_id`, `email`, `tel`, `paquete_nombre` |
| E3 | The staff UPDATE policy does not pin the tenant | `pg_policies.qual/with_check` for `clientes_staff_update` | both are just `(SELECT is_staff_of(clientes.gym_id))` — `gym_id` itself is writable |
| E4 | DELETE policies are a routine, already-shipped pattern here | `select tablename from pg_policies where cmd='DELETE'` | 8 tables already have one: `about_value, class_session_coach, facility, faq, gym_contact, plan_feature, plantillas, stat` |
| E5 | RLS on `gym_membership` is structurally unindexable | `set local role authenticated` + JWT + `set local enable_seqscan=off` + EXPLAIN | **Seq Scan at cost 10,000,000,001.27** — see §2.2 |
| E6 | `mi_membresia` seq-scans the platform-wide `ventas` table | EXPLAIN of its exact inner query | `Seq Scan on public.ventas … Filter: (cliente_id = …)` |
| E7 | `mi_membresia` is `SECURITY DEFINER` (so that scan bypasses RLS = every gym's rows) | `get_advisors(security)` metadata | `"security_definer": true` |
| E8 | 5 write-bearing RPCs are `anon`-EXECUTE on prod | `has_function_privilege('anon', oid,'EXECUTE')` over `public` | `create_class_session, edit_class_session, cancel_class_session, create_recurring_schedule, ensure_week_materialized` |
| E9 | The repo *knows* why (E8) happens and fixed 4 other functions instead | `supabase/migrations/20260715080000_revoke_anon_perf_rpcs.sql` (read in full) + `20260706120100_scheduling_write_rpcs.sql:243-247` | see §2.4 — this is the smoking gun |
| E10 | Prod's migration ledger shares only 22 of 87 version stamps with the repo | `supabase_migrations.schema_migrations` vs `ls supabase/migrations/` + `comm` | **65 in repo not in prod; 65 in prod not in repo; 22 overlap** |
| E11 | PITR is definitively NOT enabled | live `max_connections=60`; Supabase docs (fetched today): Small=90 conns; PITR "must also use at least a Small compute add-on" | impossible on this instance |
| E12 | The instance is Nano/Free (resolving Workflow 1's contested question) | live `effective_cache_size = 49152×8kB = 384 MB` ⇒ ~512 MB RAM | see §1.1 |
| E13 | `.eq("gym_id")` coverage is 40/122 = **32.8 %** | `grep` over `packages/data/src/server` excluding tests | 11 non-test modules with zero |
| E14 | The runbook's region blank was never filled | `docs/runbooks/hitl-16-vercel-deploy-verify.md:83` | literally `` `Supabase: ____ · Vercel: ____` `` |
| E15 | There is no gym-creation write path anywhere in app code | `grep 'from("gym")'` + insert/update/upsert | 3 hits, **all SELECT** |
| E16 | Revenue reporting reads `ventas` live with no snapshot | `packages/data/src/server/resumen.ts:41` | `.from("ventas").select("fecha, monto")…` |
| E17 | `respaldo` is export-only | `grep -E '\.(insert\|upsert\|update\|delete)\(' respaldo.ts` | zero hits |
| E18 | Postgres will refuse to cache a seq scan of a table > shared_buffers/4 | `heapam.c initscan()` lines 397-398, fetched from doxygen.postgresql.org 2026-07-28 | `scan->rs_nblocks > NBuffers / 4` → BAS_BULKREAD (256 kB ring) |

---

## 1. THE SINGLE STRONGEST ARGUMENT

> **You are running a system that takes money from paying customers, and it has no recovery artifact of any kind.
> Not a backup — the plan doesn't include one. Not PITR — it is impossible on this instance size, which I proved
> from `max_connections=60` against Supabase's own published table. Not the repository — replaying
> `supabase/migrations/` produces a schema that shares only 22 of 87 version stamps with production and is *proven*
> to differ from it on the privilege surface, by a migration comment you wrote yourself. And not the data — no
> per-gym export/reimport exists for 24 of the 28 tenant tables, and `respaldo.ts` reads four of them, one way.
> Meanwhile the one table that holds the money, `ventas`, cannot be corrected (no UPDATE policy, no DELETE policy,
> no void RPC, zero triggers in the entire `public` schema) while the number it is supposed to justify —
> `clientes.clases_restantes` and `clientes.vence` — is directly `PATCH`-able by every front-desk operator, and its
> foreign key is `ON DELETE CASCADE`. So: the ledger is immutable, the balance is not, the delete is silent, the
> report re-computes from live rows, and there is nothing to restore from. That is not a scaling problem you fix at
> 1,000 gyms. It is a solvency problem that is already true at four. Fix the recovery posture and the `ventas`
> correction path this month, before gym #5, because every one of these repairs is 10–100× cheaper at 175 sales
> rows than it will ever be again — and one of them (`UNIQUE (gym_id, tel)`) becomes literally impossible the first
> time it would have helped.**

That is the paragraph. Everything below is its proof.

### 1.1 Settling the contested plan question — the evidence points to Free/Nano, and both branches are damning

Workflow 1 could not resolve Free vs Pro. I can narrow it, with a measurement none of them used.

```sql
select name, setting, unit from pg_settings
where name in ('shared_buffers','effective_cache_size','max_connections','max_parallel_workers');
-- effective_cache_size = 49152 (8kB) = 384 MB
-- shared_buffers       = 28672 (8kB) = 224 MB
-- max_connections      = 60
-- max_parallel_workers = 2
```

`effective_cache_size` is conventionally set to ~75 % of machine RAM. 384 MB ÷ 0.75 = **512 MB RAM**. Supabase's
compute table, which I fetched myself today:

| Compute | CPU | Memory | Max DB connections | $/mo |
|---|---|---|---|---|
| Nano | Shared | **Up to 0.5 GB** | 60 | $0 |
| Micro | 2-core shared | 1 GB | 60 | ~$10 |
| Small | 2-core shared | 2 GB | 90 | ~$15 |

— https://supabase.com/docs/guides/platform/compute-and-disk, fetched **2026-07-28**.

512 MB matches Nano exactly and matches nothing else. On a 1 GB Micro the conventional value would be 512–768 MB,
not 384 MB. Corroborating, independently: `AGENTS.md` states preview branching is "**Pro-gated / 402**" and
`supabase/tests/run-denial-suite.mjs:87-88` repeats "preview branching is paywalled (402)" — an HTTP 402 on
branching means the org is not on a paid plan. And Supabase's pricing page, fetched by me **2026-07-28**, says Nano
is Free-plan-only and that Free's backup entitlement is the string **"Not included"**, its DB cap is
**"500 MB database size (Shared CPU • 500 MB RAM)"**, and **"Free projects are paused after 1 week of inactivity."**

*Confidence: high but not certain.* The 75 % convention is a tuning convention, not a Supabase-published formula —
marked **MODELLED**. **Falsification, and it takes 30 seconds:** open the Supabase dashboard's Billing page. If it
says Pro, withdraw the Nano inference.

**And here is why the prosecution does not depend on winning that argument.** Both branches are unacceptable for a
system holding a revenue ledger:

| If it is… | Backups | RPO | Restore granularity |
|---|---|---|---|
| **Free / Nano** | "Not included" (pricing page, fetched 2026-07-28) | **∞ — total loss** | none |
| **Pro / Micro** | daily, 7-day retention | **up to 24 hours of sales lost** | all 3,000 gyms or nothing |

PITR — the only thing that fixes either — is impossible today regardless of plan: Supabase's backups guide, fetched
**2026-07-28**, states *"Projects that want to use PITR must also use at least a Small compute add-on"*, and Small
carries 90 direct connections. Live `max_connections = 60`. **This project cannot have PITR. That is not an
inference; it is arithmetic on two published numbers and one measured setting.** Confirmed structurally:
`select count(*) from pg_replication_slots` → **0**; `pg_stat_replication` → **0 rows**.

**The deepest form of this finding is not the plan. It is that nobody knows the plan.** Three documents in this
repo/session disagree about whether a payment-handling production database has backups. That is a fact about the
operation, not the infrastructure, and no amount of Postgres tuning fixes it.

---

## 2. THE CHAIN — which defect makes which other defect worse

Individually, most of these are "known debt." The case is that they are **wired in series**, and each one removes
the mitigation for the one before it.

### 2.1 Chain A — the money chain (the one that loses a customer's data)

```
  registrar_venta writes ventas (INSERT) AND clientes.clases_restantes/vence
        │
   [L1] ventas has no UPDATE policy, no DELETE policy, no void RPC, and there are
        ZERO non-internal triggers in the entire public schema
        →  the LEDGER can never be corrected
        │
   [L2] clientes.clases_restantes / vence / gym_id / auth_user_id / email / tel are
        column-UPDATE-granted to `authenticated` under a policy whose only test is
        is_staff_of(gym_id)
        →  the DERIVED BALANCE can be corrected, freely, by anyone at the front desk
        │
        ⇒ every real-world correction lands on the projection, never the ledger,
          and leaves NO marker. ADR-0004's promised "reconcile job" is now unwritable:
          you cannot distinguish a legitimate balance from a manual repair.
        │
   [L3] ventas_cliente_id_fkey is ON DELETE CASCADE, and `authenticated` HOLDS the
        DELETE privilege on both clientes and ventas. Only the ABSENCE of an RLS
        policy denies it.
        │
   [L4] 8 tables already ship a `*_staff_delete` policy. Adding one is a reviewed,
        normal, five-second change in this codebase.
        →  "gyms want to remove a member" is a five-line PR that silently deletes
          that member's entire sales history
        │
   [L5] getResumenMes (resumen.ts:41) SUMS ventas LIVE with no snapshot
        →  the deletion retroactively rewrites every past monthly revenue figure.
          Nobody notices at the moment of loss; they notice at month-end close.
        │
   [L6] No PITR (proven, §1.1). Best case a 24h-old daily snapshot; likely case
        nothing at all.
        │
   [L7] Even WITH a snapshot, restoring ONE gym requires a per-gym extract/reimport.
        respaldo.ts reads 4 of 28 tenant tables and writes none (verified: zero
        insert/upsert/update/delete calls). And `supabase db dump` omits the `auth`
        schema by default while clientes.auth_user_id, gym.owner_user_id and
        gym_membership.user_id all FK into auth.users — so a naive restore
        reconstructs a roster nobody can log into.
        │
        ⇒ TOTAL: a routine feature request destroys revenue history, invisibly,
          with no correction path, no marker, no snapshot, and no per-tenant restore.
```

**Every link is measured.** L1: `pg_policies` on `ventas` = 2 rows, both INSERT/SELECT. L2: `column_privileges`
output in §0/E2. L3: `pg_constraint` def `ON DELETE CASCADE` + `role_table_grants` shows DELETE granted. L4: the
8 DELETE policies listed in E4. L5: `resumen.ts:41`. L6: §1.1. L7: `grep` on `respaldo.ts`.

### 2.2 Chain B — the compute chain (the one that makes the product unusable)

I proved the root of this chain myself, on live prod, and it is the single most damaging measurement in this file.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"4279afaf-68ac-4552-a427-65bca8dd30a9","role":"authenticated"}';
set local enable_seqscan = off;                      -- a 10^10 cost penalty
explain (verbose, costs on)
  select gym_id, created_at from public.gym_membership order by created_at asc;
rollback;
```
```
Sort  (cost=10000000001.31..10000000001.32 rows=1 width=24)
  ->  Seq Scan on public.gym_membership  (cost=10000000000.00..10000000001.27 rows=1 width=24)
        Filter: ((SubPlan 1) OR (gym_membership.user_id = (InitPlan 2).col1))
        SubPlan 1
          ->  Result  Output: is_staff_of(gym_membership.gym_id)
```

Read that carefully. `gym_membership_pkey` is `btree (user_id, gym_id)` — a **perfect** index for
`user_id = auth.uid()`. The planner was handed a ten-billion-point incentive to use it and **refused**, because the
two permissive SELECT policies OR together into `(SubPlan) OR (user_id = uid)` and an OR'd SubPlan is a filter,
never an `Index Cond`. This is not a statistics problem or a warm-up problem; it is structural and it does not
improve with table size.

And this exact query is the app's hot path. `packages/data/src/server/agenda-miembro.ts:147-150`:

```ts
const { data: memberships } = await supabase
  .from("gym_membership")
  .select("gym_id, created_at, gym(id, slug, timezone, brand_name)")
  .order("created_at", { ascending: true });
```

No `.eq("user_id", …)`. No `.eq("gym_id", …)`. It relies entirely on RLS — which I have just proven cannot be an
index condition. **Every member page render seq-scans the platform's entire membership table.** The cumulative
counter agrees:

```sql
select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup from pg_stat_user_tables …
```
| table | seq_scan | seq_tup_read | idx_scan | live rows |
|---|---|---|---|---|
| **gym_membership** | **341,184** | 1,261,631 | 867 | **9** |
| ventas | 2,965 | 168,768 | 387 | 175 |
| clientes | 2,989 | 108,698 | 3,404 | 116 |
| asistencias | 813 | 111,333 | 1,941 | 708 |

341,184 full-table scans of a nine-row table. At 3,000 gyms that table holds ~675,000 rows.

Now the second half, which is worse:

```sql
explain (verbose, costs on)
select v.id from public.ventas v where v.cliente_id = '…'::uuid
order by v.created_at desc, v.id desc limit 1;
--  ->  Seq Scan on public.ventas v  (cost=0.00..7.14 rows=1 width=24)
--        Filter: (v.cliente_id = '00000000-…'::uuid)
```

That is the *verbatim* inner query of `mi_membresia()` (read from `pg_proc.prosrc` this session), and
`mi_membresia` is `SECURITY DEFINER` (advisor metadata: `"security_definer": true`). **SECURITY DEFINER means RLS
is bypassed inside the function, so this seq scan reads every row of every gym's sales ledger.** A member of gym #1
opening their plan card causes Postgres to read gym #2,999's revenue.

`ventas` indexes, live: `ventas_pkey(id)`, `ventas_gym_id_idx(gym_id)`, `ventas_gym_fecha_idx(gym_id,fecha)`,
`ventas_folio_gym_uq(gym_id,folio)`, `ventas_idem_gym_uq`. **Nothing leads with `cliente_id`.** Supabase's own
performance advisor has been telling you this the whole time — I re-ran it today:
`unindexed_foreign_keys: public.ventas has a foreign key ventas_cliente_id_fkey without a covering index`.

**The G² arithmetic.** Measured live: `pg_relation_size('ventas')/reltuples` = **299 heap bytes/row**.

```
ventas rows/yr  = G gyms × 225 members × 12 renewals   = 2,700·G
ventas bytes/yr = 2,700·G × 299                        = 807,300·G bytes  ≈ 0.807 MB per gym-year
scan_time(G)    = 807,300·G / throughput
renders/day(G)  = G × 225 × r                          (r = plan-card renders per member per day)
CPU-sec/day     = renders/day × scan_time  =  G² × 225·r·807,300 / throughput      ← QUADRATIC IN G
```

Three thresholds, all from live settings:

| Threshold | Derivation | Gyms |
|---|---|---|
| `ventas` exceeds `NBuffers/4` ⇒ Postgres switches to a 256 kB bulk-read ring and **stops trying to cache it** (heapam.c:397-398, fetched 2026-07-28); the buffer pool can no longer protect this query at any instance size | NBuffers = 28,672 blocks (live); /4 = 7,168 blocks = 58.7 MB; ÷ 0.807 MB/gym | **≈ 73** |
| Free plan's 500 MB DB cap ⇒ project goes read-only ⇒ **the front desk cannot sell** | (500 − ~13 MB overhead) ÷ ~2.12 MB/gym-yr (per-gym total from `price-compute.md` §6, reused, MODELLED) | **≈ 230** |
| One `mi_membresia` call exceeds `statement_timeout` (live: **120000 ms**) at Micro's 11 MB/s baseline disk throughput ⇒ **every member's plan card returns an error** | 120 s × 11 MB/s = 1.32 GB ÷ 0.807 MB/gym | **≈ 1,635** |

And on hardware big enough to hold it all in RAM — a **4XL, 16-core / 32 GB, $960/mo** (fetched table, §1.1):

```
ventas at 3,000 gyms, 1 year retained = 2.42 GB          (fits in RAM)
in-memory seq scan ≈ 1 GB/s per core                     [MODELLED]
⇒ 2.42 CPU-seconds per plan-card render
675,000 members × 1 render/member/week = 96,430 renders/day   [MODELLED]
⇒ 233,400 CPU-seconds/day = 2.70 cores held continuously
× 6 peak-hour concentration (LatAm gyms: 06-09h, 18-21h)      [MODELLED]
⇒ 16.2 cores demanded at peak, on a 16-core box.  SATURATED — by ONE query.
```

Sensitivity, because those three inputs are modelled: halve the render rate or halve the peak factor and you buy
one √2 of gym headroom, not an order of magnitude — the exponent is what hurts, not the constant. With **three
years** of ledger retained (a gym's sales history is permanent), the same model exhausts the **top of the entire
Supabase ladder** — 16XL, 64-core, $3,730/mo — at **≈ 3,440 gyms**. There is no rung above that except "Contact
Sales."

**The fix is one index.** `create index concurrently on ventas (cliente_id, created_at desc, id desc)` turns the
whole thing O(log n). Which is exactly the point of Chain B: **the defect is not the missing index. The defect is
that the missing index has been flagged by the vendor's own linter, named a "verified critical" by this repo's own
audit dated 2026-07-27, and is still not there.** Nothing in `pnpm lint`, `pnpm typecheck`, `pnpm test`, or
`pnpm test:denial` reads `get_advisors`. There is no mechanism that makes a missing index visible before it is
fatal.

### 2.3 Chain C — the scoping convention that is 67 % unimplemented

ADR-0013 §2 (as corrected 2026-07-13) is explicit that reader-side `.eq("gym_id")` — not RLS — is what makes reads
O(tenant). I counted it myself:

```
$ grep -rn '\.from(' packages/data/src/server --include=*.ts | grep -v '\.test\.' | wc -l   → 122
$ grep -rn '\.eq("gym_id"' packages/data/src/server --include=*.ts | grep -v '\.test\.' | wc -l → 40
```

**32.8 % coverage.** Eleven non-test modules with `.from()` and zero gym scoping:
`agenda.ts` (5 calls), `class-type.ts` (6), `coach.ts` (5), `catalog.ts` (3), `gym.ts` (2), `mensajes.ts` (2),
`export/workbook.ts` (1), `cobro.ts` (1), `perfil.ts` (1), `plantillas.ts` (1), `resolve-tenant.ts` (2).

`agenda.ts` is the admin Agenda — an entire product sector — reading `class_session`, which at 3,000 gyms is
~4.7M rows/year. `tools/guards/` holds 8 guard tests; none is about gym scoping. The architecture's single scaling
mechanism is a habit.

**And Chain C makes Chain B worse in a specific way:** every unscoped read evicts the pages the scoped reads need.
On a 224 MB buffer pool with a 500 MB cap, the working set and the waste compete for the same memory.

### 2.4 Chain D — the safety machinery is blind to the substrate it protects (the smoking gun)

This is the finding I would lead a board presentation with, because it is not a bug — it is a proof that the
verification system cannot see the production system.

**Step 1 — measured on prod today:**
```sql
select p.proname, p.prosecdef, has_function_privilege('anon', p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and has_function_privilege('anon', p.oid,'EXECUTE');
```
```
cancel_class_session       | f | t      ← writes
create_class_session       | f | t      ← writes
create_recurring_schedule  | f | t      ← writes
edit_class_session         | f | t      ← writes
ensure_week_materialized   | f | t      ← writes
enviar_mensaje_contacto    | t | t      (intentional)
invitacion_info            | t | t      (intentional)
```

**Step 2 — the migration that created them:** `supabase/migrations/20260706120100_scheduling_write_rpcs.sql:243-247`
```sql
revoke execute on function public.create_class_session(…) from public;
revoke execute on function public.ensure_week_materialized(date) from public;
revoke execute on function public.create_recurring_schedule(…) from public;
revoke execute on function public.edit_class_session(…) from public;
revoke execute on function public.cancel_class_session(uuid) from public;
```
Revoked from `public`. Not from `anon`.

**Step 3 — the repo's own root-cause analysis, written 9 days later**, in
`supabase/migrations/20260715080000_revoke_anon_perf_rpcs.sql`, quoted verbatim:

> *"On the hosted platform, ALTER DEFAULT PRIVILEGES grants EXECUTE on new functions to
> anon/authenticated/service_role as ROLE-SPECIFIC grants. The perf migrations revoked from PUBLIC and granted to
> authenticated — but a revoke from PUBLIC does not remove anon's direct default grant, so anon kept EXECUTE on all
> four (**local Docker never had the default grant, which is why the local/scratch denial checks couldn't see
> this**)."*

That migration then fixes **four other functions** — `marcadas_por_gym`, `marcadas_presencia`,
`ventas_count_por_cliente`, `asistencias_mes_por_cliente` — and leaves the five write-bearing ones standing. They
are still standing today, thirteen days later. I measured them.

**Step 4 — why the gate cannot catch it.** `supabase/tests/scheduling_rls_denial.sql:83-95` does
`set local role anon; select count(*) from public.gym_membership; …` — it asserts what anon can **read**. There is
no assertion anywhere in the suite about what anon can **EXECUTE**. And per the repo's own comment, the scratch
substrate the suite runs on *does not reproduce prod's default grants*, so even if such an assertion existed it
would pass there and fail here.

**Honesty, per Rule 7 — the direct impact of these five grants is LOW.** All five are `prosecdef = f`
(SECURITY INVOKER), so RLS still applies, and every underlying policy is `to authenticated`. I read
`ensure_week_materialized`'s body: it opens with `v_gym uuid := public.staff_gym(); if v_gym is null then raise
exception 'No autorizado'`, and for an anon caller `auth.uid()` is null, so it bounces immediately at negligible
cost. **This is a defence-in-depth gap and an unauthenticated-compute nuisance, not a data breach.** I am not going
to inflate it.

**What it proves is the point, and the point is severe.** `AGENTS.md` stakes the entire safety argument of this
codebase on the denial suite: *"a function that drops a column, stamps the wrong `gym_id`, or forgets `where
auth_user_id is null` passes all of `pnpm test`… Their real contract is proven by the self-asserting SQL suites."*
That gate runs against a substrate whose privilege model differs from production's **by the repo's own written
admission**, and it has never tested the EXECUTE surface at all. So the answer to "how do you know prod is safe?"
is: you don't, on this axis, and you have documented evidence that you don't.

### 2.5 Chain E — production and the repository do not share a history

```
$ ls supabase/migrations/*.sql | sed 's#.*/##; s/_.*//' | sort > repo.txt      # 87 lines
   select version from supabase_migrations.schema_migrations                    # 87 rows
$ comm -23 repo.txt live.txt | wc -l   →  65    (in repo, unknown to prod)
$ comm -13 repo.txt live.txt | wc -l   →  65    (in prod, unknown to repo)
$ comm -12 repo.txt live.txt | wc -l   →  22
```

**Only 22 of 87 (25 %) version stamps match.** The mechanism is understood — MCP `apply_migration` restamps with
its own timestamp — and the *statements* were applied even where the *names* differ, so I am **not** claiming the
schema objects are wholesale different. I checked several and they match (the uncorrelated `(SELECT auth.uid())`
policy form from `20260714080000_rls_uncorrelated_predicates.sql` is live; `mi_membresia`'s re-anchor from
`20260714120000` is live).

What I *am* claiming, and what is fully proven:

1. **You cannot mechanically prove prod == repo.** `supabase db diff` / `db push` are unusable — the repo's own
   operational memory says "NEVER `supabase link` to prod or `db push`", and this diff is why: a push would attempt
   to re-run 65 migrations, **seeds included**.
2. **Where the two are known to differ, they differ in the direction of less security** — §2.4's five grants exist
   on prod and, per the repo's own migration comment, do not exist on the scratch/local substrate.
3. **Therefore the repository is not a recovery artifact.** Replaying it gives you an approximation of prod's
   schema, known to be wrong on ACLs, and none of the data.

Compose that with §1.1's "no backups, no PITR": **there is no artifact anywhere from which production could be
reconstituted.** Not the snapshot (there may be none), not the repo (it doesn't reproduce prod), not an export
(`respaldo.ts` covers 4 of 28 tables and has no import path).

### 2.6 Chain F — every millisecond is multiplied by ~8 crossings of North America, and the doc says it was checked

`arch-runtime.md` measured `X-Vercel-Id: sfo1::iad1::…` (functions in Virginia) against a DB whose direct host IPv6
geolocates to Boardman, Oregon. I verified the repo half of that claim myself.
`docs/runbooks/hitl-16-vercel-deploy-verify.md:81-84`:

> "**Region co-location (5-minute check…):** … A mismatch taxes every SSR render ~60–70ms × each sequential
> PostgREST call — permanently, for every gym. Record the pair here once confirmed: `Supabase: ____ · Vercel: ____`."

**The blank is still blank.** And `docs/runbooks/hitl-28-live-cutover-deploy-verify.md:89` says:

> "**Region co-location:** set during #16 — confirm the Supabase/Vercel region pair recorded in
> `hitl-16-vercel-deploy-verify.md` Step 3 still holds. **Verify, do not re-tune.**"

A later document instructs a future operator to trust a record that was never written. That is the governance
failure mode of this whole audit in miniature: **the repo's checklists produce the *feeling* of verification
without the artifact.** The same shape appears in §2.4 (a gate that can't see prod) and §1.1 (three documents
disagreeing about whether backups exist).

---

## 3. THE CHEAPEST SCENARIO IN WHICH THIS BUSINESS DIES

Not a breach. Not a DDoS. A **feature request**, on a Tuesday, at eleven gyms.

**T+0.** Forge's owner emails: *"An ex-member wants us to delete her data — she cited the LFPDPPP. Also our roster
has three test rows from launch. How do we remove people?"* Correct request; Mexico's ARCO rights make it
non-optional; there is no "Borrar cliente" button anywhere because there is no DELETE policy on `clientes`.

**T+1 day.** The fix is obvious, small, and looks exactly like eight changes already in the repo:
```sql
create policy clientes_staff_delete on public.clientes for delete using (is_staff_of(gym_id));
```
It reviews clean. `pnpm lint` passes. `pnpm typecheck` passes. `pnpm test` passes — `packages/data` mocks the RPC
boundary, so vitest never touches a policy. `pnpm test:denial` passes: the suites assert *cross-tenant* denial, and
this policy is correctly gym-scoped, so it **should** pass. Nothing in the gate asks "what does this delete take
with it?" It ships.

**T+1 day, +4 minutes.** The operator deletes the ex-member and the three test rows. `ventas_cliente_id_fkey
ON DELETE CASCADE` and `asistencias_cliente_id_fkey ON DELETE CASCADE` fire silently. Four members' complete sales
history — every `folio`, every `monto`, every `paquete_nombre` snapshot — is gone. Postgres reports success. The UI
reports success. `pg_stat_user_tables` records a delete. **Nothing else in the system knows.**

**T+30 days.** Month-end. `getResumenMes` (`resumen.ts:41`) sums `ventas` live with no snapshot, so the owner's
June revenue figure is now lower than the one he printed and reconciled in July. He calls. Someone opens `ventas` —
which is INSERT-only, so the rows cannot be re-created through the product. Someone opens the folio sequence and
finds gaps: `ventas_folio_gym_uq (gym_id, folio)` is unique but not contiguous now, and Mexican receipt sequencing
is supposed to be gap-free. **The receipts the gym issued to its members no longer have matching records.** That is
not a software bug to a Mexican gym owner; that is his accountant's problem with the SAT.

**T+30 days, +1 hour.** Recovery attempt.
- PITR? Impossible — proven, §1.1 (`max_connections=60` < Small's 90).
- Daily backup? Only if the org is on Pro, and it is 30 days old — Pro retains **7**. Gone either way.
- The repo? Reproduces schema, not data — and only 22 of 87 migrations match anyway (§2.5).
- `respaldo.ts`? It reads `ventas`, `asistencias`, `clientes`, `paquetes` into an Excel file. **There is no
  import path** — zero insert/upsert calls in the file. And ADR-0006 says so out loud: it is an *operational
  export, not disaster recovery*.
- Rebuild by hand from the member's paper receipts? `ventas` has no `paquete_id` — only a free-text
  `paquete_nombre`, which is already ambiguous in production (forge's label `Ilimitado` covers two distinct
  products at 1350 and 1349 pesos). You cannot even reconstruct *which* package was sold.

**T+35 days.** Forge churns. It is 1 of 4 gyms. In a market where the product sells for 300–1,500 MXN/month, the
loss is not the MRR — it is that the reference customer now tells the next ten prospects that this software lost
his revenue records and could not get them back.

**Total cost of prevention, today, at 175 `ventas` rows and 116 `clientes` rows:**

| Repair | Work | Cost now | Cost after the incident |
|---|---|---|---|
| `alter table ventas alter constraint … on delete restrict` (drop+recreate FK) | seconds at 175 rows | ~15 min | must first decide what to do with already-orphaned rows |
| `clientes.archived_at` + roster filter | 1 migration + 1 reader | ~2 h | same, plus a backfill with no ground truth |
| `anular_venta` RPC writing a reversing row + recomputing balance in one txn + a denial suite | 1 day | ~1 day | **unbounded** — past manual `PATCH`es to `clases_restantes` are unmarked and unfindable |
| `create unique index concurrently clientes_tel_gym_uq on clientes (gym_id, tel)` | builds instantly on 116 rows | ~1 h | **the build FAILS** once duplicates exist; needs a merge migration that must dodge the CASCADE that deletes the loser's revenue |
| `create index concurrently on ventas (cliente_id, created_at desc, id desc)` | instant at 175 rows | ~10 min | `CREATE INDEX CONCURRENTLY` on ~12M rows on a live shared instance, no maintenance window, all 3,000 tenants |

**Every one of these is cheaper this month than it will ever be again, and one of them — the `tel` unique — is
free today and permanently impossible after the first duplicate.** Measured today:
61 of 116 `clientes` rows (52.6 %) have neither an `email` nor an `auth_user_id`, and `tel` has **no index at all**
(full `pg_indexes` on `clientes`: `pkey`, `gym_id_idx`, `favorite_class_type_id_idx`, `claim_code_key`,
`email_gym_uq`, `auth_user_id_per_gym`). Those 61 rows are protected from duplication by a non-locking
`select … limit 1` inside `registrar_venta` with an explicit `p_forzar_nuevo` bypass.

---

## 4. THE SINGLE-PROJECT SHARED-POSTGRES MODEL IS THE WRONG SHAPE — argued at its strongest

Set aside every bug above. Assume the index ships, the void RPC ships, the guard ships. **The shape is still
wrong, for four reasons that no amount of query tuning touches.**

**(a) The tenant discriminator is not, and cannot become, an index condition.** This is the argument. I proved it
at cost 10¹⁰ in §2.2 on `gym_membership`, and `arch-tenancy.md` independently proved the same thing on
`asistencias`. A hashed SubPlan is a filter. Therefore the security boundary and the performance boundary are
**different mechanisms** that must be maintained in parallel — RLS for correctness, `.eq("gym_id")` for speed —
with nothing tying them together. Measured result of that arrangement after two years of development: 32.8 %
adoption and eleven modules at zero. Every alternative tenancy model (schema-per-tenant, DB-per-tenant, sharded
pods) makes tenant scoping a **structural property** you cannot forget. This one makes it a habit you must
remember 122 times and counting. PlanetScale, selling a competing product, reaches the same conclusion and says so:
they explicitly recommend against relying on RLS as the tenancy boundary (cited in `arch-tenancy.md` §5, fetched
2026-07-27).

**(b) SECURITY DEFINER functions destroy the tenant boundary entirely, and they are the hot path.** `mi_membresia`
— fired on every member plan-card render — is `prosecdef=true` and contains `select … from public.clientes where
c.auth_user_id = v_uid limit 1` with **no `gym_id` predicate**, then `select … from public.ventas where
v.cliente_id = v_cli` with **no `gym_id` predicate**. Inside a definer function RLS is off. So the busiest read in
the client app is, by construction, a **platform-wide** read. Eighteen of the 34 public functions are definer.
The isolation model has a documented, deliberate hole in it that grows with G, and the same hole is the
multi-gym-roulette correctness bug already logged in
`docs/Context/2026-07-27-multigym-rpc-scoping-decision-memo.md` — *one root cause, two symptoms, and the
performance one is invisible until it isn't.*

**(c) There is no per-tenant lever of any kind.** One bad policy, one bad migration, one saturating query, one
leaked `service_role` key, one vendor incident — each is all-3,000-gyms-simultaneously. No canary. No throttle. No
way to move a hot tenant. No way to shed load. Postgres has no per-tenant resource governor. And per-tenant restore
— the thing a customer will actually ask for by name — is *structurally impossible*: physical PITR replays the
whole cluster, so "restore gym #1,847 to Tuesday" means restoring 2,999 other gyms to Tuesday as well, or building
a logical extract/reimport that exists for zero of 28 tables. `arch-tenancy.md` costed the alternative honestly:
per-project PITR under database-per-tenant is **$100/mo × 3,000 = $300,000/mo**, ten times the compute. So the
model that provides per-tenant recovery natively is unaffordable, and the model you chose cannot provide it at all.
**Nobody has priced the middle.**

**(d) Every shared resource is a shared blast radius, and the mail tier proves the pattern generalises beyond the
database.** One Resend account, one sending domain, one bounce budget for all 3,000 tenants. `alt-email.md`
verified there is no suppression list and no working opt-out anywhere in the send path
(`notificaciones_activadas` is read only for a UI toggle; the RPC that would have let a member flip it was dropped
in `20260708190000_drop_set_notificaciones.sql`). So one gym whose front desk types 200 bad email addresses pushes
the **platform's** bounce rate past Resend's documented 4 % threshold and the sending domain is suspended —
for everyone. That is the same architecture as (c), expressed in a different vendor. **The pattern is: this system
has one of everything, and nothing in it can be quarantined.**

**Counterpoint I have to concede up front, because it's the strongest defence:** shared-tables-plus-discriminator
is what the industry actually runs (Citus rates row-based sharding to 1M+ tenants; Notion runs 480 logical shards
over 32 instances). I am not arguing the model is exotic. I am arguing that **everyone who runs it at scale runs it
as pods (A-inside-D), and this deployment has one pod, no pod concept, and no path to a second one.** Making
`resolveTenant` return a `gym.pod_id` today — while every value is `1` — costs an afternoon and converts a future
rewrite into a routing change. That is the cheapest insurance in this entire audit and it is not on any roadmap.

---

## 5. THE DEFENCE, AND WHY IT IS WRONG

**D1. "It's four gyms and 15 MB. You're modelling failure modes at 3,000 gyms that we may never reach."**
Three of the five findings I would bet on are **already live at four gyms**, not projected: `ventas` cannot be
corrected *today*; there is no recovery artifact *today*; five write RPCs are anon-executable *today*. And the
one-hour repairs are one-hour repairs **only** at 175 rows. The `tel` unique index builds instantly now and
**fails to build** the day it would first have helped. The argument "we're small so it doesn't matter" is precisely
inverted: being small is the entire reason these fixes are affordable. *Where this defence would be right:* if the
repairs were cheap at any scale. They are demonstrably not — see the cost table in §3.

**D2. "The denial suite covers this. 36 self-asserting SQL suites, two machine guards against drift, a
write-coverage guard derived from replaying the migrations."**
This is genuinely good machinery and I say so in §6. But I proved its blind spot with the repo's own words: the
suite runs against a scratch/local substrate whose default grants differ from production's, *as documented in
`20260715080000_revoke_anon_perf_rpcs.sql`*, and the anon assertions in `scheduling_rls_denial.sql:83-95` test
`select` visibility, never `EXECUTE`. Five write-bearing RPCs are anon-executable on prod right now and every gate
is green. More fundamentally: **the whole regime proves what RPCs *write*. Not one line of it asserts what the
schema *forbids*.** No suite can detect a missing UPDATE policy, an unindexed FK, a CASCADE, or a nonexistent
backup, because all four are *absences*.

**D3. "`ventas` being append-only is a feature. Immutable ledgers are correct."**
An immutable ledger is correct **when it has a reversal instrument.** Double-entry accounting never edits a
posting; it posts a contra-entry. Here there is no contra-entry: no `anular_venta`, no `anulada_at`, no
`anula_venta_id`, and — verified — **zero non-internal triggers in the entire `public` schema**. So the only
available correction is a direct `PATCH` on `clientes.clases_restantes` / `vence`, which is exactly the mutation an
immutable ledger exists to prevent, and it leaves no trace. This isn't an immutable ledger; it's a mutable
projection in front of an unreachable log. And the schema already knows: `grep -rn "void\|refund\|anular\|
reembolso" docs/adr/` returns nothing in a decision context. **This was never decided. It was never noticed.**

**D4. "The missing indexes are a one-line fix. Ship them and Chain B evaporates."**
Correct, and I said so in §2.2 — which is why my finding is *not* "you're missing an index." It is: this index has
been flagged by Supabase's own advisor (I re-ran it today), named a "verified critical" by this repo's own
2026-07-27 audit, and it is still absent — because **no gate in this project reads `get_advisors`, and the
migration mechanism for applying the fix is itself degraded** (§2.5: 65/87 stamp mismatch, `db push` unusable). The
one-line fix is one line to *write* and an unrehearsed manual production operation to *apply*. That is the finding.

**D5. "We have `respaldo` — monthly Excel exports. That's the backup."**
`respaldo.ts` reads four tables (`ventas`, `asistencias`, `clientes`, `paquetes`) and has zero write calls —
I grepped. There are 28 tenant-scoped tables. ADR-0006 itself names it *"an operational export, not disaster
recovery."* A backup you cannot restore from is a report.

**D6. "Supabase takes backups. Everyone's data is safe."**
On Free, the pricing page I fetched today says backup entitlement is the literal string **"Not included"** and the
backups guide says *"We recommend that free tier plan projects regularly export their data using the Supabase CLI
`db dump` command and maintain off-site backups."* On Pro it is a daily snapshot with 7-day retention — RPO up to
24 hours, all-tenants-or-nothing. PITR is impossible either way on `max_connections=60`. And **you do not currently
know which of those two you are in.**

**D7. "The Vercel/Supabase region thing is 60 ms. Who cares."**
60–70 ms × ~8 sequential PostgREST round trips ≈ **0.5 s added to every member render, permanently, for every
gym** — and it multiplies with, rather than replacing, Chain B's growing scan time. But the reason I rank the
*documentation* half of this above the latency half is `hitl-28:89` telling a future operator to trust a record
that `hitl-16:83` left as `____`. The latency is a $0 config change. **The fake verification is a process defect
that will produce more of these.**

**D8. "Onboarding by hand-written SQL is fine at this size — it's a config act, not an infra act (ADR-0008)."**
ADR-0008's principle is right; the implementation is a human typing INSERTs into production. I verified: three
`.from("gym")` call sites in all of `packages/data` + `apps`, **all SELECT**; zero insert/update/upsert. The only
`insert into public.gym` in 87 migrations is a seed inside
`20260702150000_create_gym_tenant_spine.sql`. At 3,000 gyms × 30 min that is ~1,500 founder-hours of live
production write access — and every one of those sessions is an opportunity to fire the CASCADE in §3. **This is
the finding that stops the business before any of the technical ones: you cannot sell faster than you can type.**

---

## 6. WHAT IS GENUINELY GOOD — the things my prosecution had to work around

Rule 7 binds me too. These are not consolation prizes; several of them are better than what most shops at this
stage have, and two of them actively made my case harder to build.

1. **`gym_id` is denormalised onto all 28 tenant tables, `NOT NULL` + FK.** Every RLS predicate is a
   single-column comparison — no join in the security barrier. This is the correct decision and it is why option
   (D) sharded pods remains cheap to reach later. It is also why I had to argue *unindexability* rather than
   *complexity* — a lesser schema would have handed me an easier target.
2. **Zero cross-tenant rows today**, across 13 FK edges checked by `arch-tenancy` and 6 by `arch-datamodel`. The
   discipline is real, even though nothing enforces it.
3. **`next_folio` uses a per-gym counter row inside the caller's transaction, not a sequence.** A rolled-back sale
   rolls back the folio — **gap-free receipt numbering**, which is exactly right for Mexican fiscal practice and
   strictly better than the obvious `bigserial`. `registrar_venta` takes that lock **last**, after all derivation,
   minimising hold time. This is genuinely expert work.
4. **`ventas` snapshot columns do not drift.** Live proof: forge's `Ilimitado` shows 11 sales at 1350 and 5 at
   1349 while the catalog now reads 1349. Historical terms survived a catalog edit. That is the snapshot working.
5. **Balance replay reconciles exactly** (verified independently by `arch-datamodel`: 4 sales replayed by hand →
   `vence` 2026-09-03 and 26 classes, both matching live). ADR-0002/0004 are being honoured *today*.
6. **The idempotency rail is real**: `ventas_idem_gym_uq UNIQUE (gym_id, idempotency_key) WHERE … NOT NULL` plus a
   replay branch at the head of `registrar_venta`. Most products this age have a double-charge bug.
7. **`reservation` reuses terminal rows** under `UNIQUE (member_id, class_session_id)` — one row per
   (member, session) forever. Bounded by construction.
8. **The `test:denial` regime and its two machine guards** (`denial-suite-drift.test.ts`,
   `rpc-write-coverage.test.ts`, the latter deriving its obligation set by *replaying the migrations* rather than
   trusting a declaration) are better machinery than most shared-table shops have. My §2.4 attack is not "the gate
   is bad"; it is "the gate has a substrate-shaped hole that the repo itself documented." Those are very different
   claims and I want the distinction on the record.
9. **ADR-0013 self-corrected in place on 2026-07-13** and shipped `20260714080000_rls_uncorrelated_predicates.sql`;
   I confirmed live that the policies are in uncorrelated `(SELECT auth.uid())` form. **The session brief's
   "ADR-0013's RLS claim is false" warning is STALE — do not act on it.** A team that retracts its own locked ADR
   when the measurement disagrees is a team that can absorb this report.
10. **Per-gym roster rows with per-gym consent stamps** (`terms_accepted_at`, `privacy_accepted_at`) is
    *legally* the right shape under Mexico's LFPDPPP, where each gym is a separate *responsable*. A global `person`
    table would be strictly worse. This looks deliberate, and it is correct.
11. **The single migration target** — 87 migrations, one execution, one denial run — is a real and large win that
    schema-per-tenant and DB-per-tenant both destroy. It is the strongest argument for keeping the model, and it is
    why my §4 conclusion is "prepare pods," not "rewrite."

---

## 7. FORCED RANKING — the five I would bet money on, worst first

### #1 — There is no recovery artifact for the production database. Not a backup, not PITR, not the repo.
**Evidence:** PITR impossible — live `max_connections=60`; Supabase compute table (fetched 2026-07-28) puts Small
at 90; backups guide (fetched 2026-07-28): *"Projects that want to use PITR must also use at least a Small compute
add-on."* `pg_replication_slots` → 0. Plan is Free/Nano on three lines of evidence (§1.1), whose backup entitlement
the pricing page (fetched 2026-07-28) states as **"Not included"**; if Pro, it is a 24-hour-RPO all-tenants
snapshot. Repo↔prod migration ledgers share 22 of 87 stamps and are *proven* to differ on grants (§2.4/§2.5).
`respaldo.ts` reads 4 of 28 tables and writes none.
**Breaks at:** **already broken.** Not a gym count — a calendar event. Any data-loss incident, from any cause,
starting now.
**Confidence:** measured (PITR impossibility, ledger diff, respaldo scope); modelled (Nano inference).
**Falsification:** open the Supabase Billing page. If it says Pro *and* daily backups are listed as present, the
severity drops from "total loss" to "24 hours of sales" — which is still unacceptable for a payments system and
still all-3,000-or-nothing on restore granularity.
**Exit trigger for any "we'll do it later":** the day the second paying gym signs. Threshold: `count(*) from gym
where <is a paying customer>` > 1. It is already 2.

### #2 — The money model has no correction path, and the only correction the DB permits desynchronises the balance from the ledger.
**Evidence:** `pg_policies` on `ventas` = INSERT + SELECT only; zero non-internal triggers in `public`;
`column_privileges` grants `authenticated` UPDATE on `clases_restantes`, `vence`, `gym_id`, `auth_user_id`;
`clientes_staff_update`'s USING/WITH CHECK is only `is_staff_of(gym_id)`; `ventas_cliente_id_fkey ON DELETE
CASCADE`; DELETE privilege granted, denied only by a missing policy, while 8 sibling tables already ship one;
`resumen.ts:41` sums `ventas` live with no snapshot.
**Breaks at:** the first correction request — **week one of gym #1**. Becomes unstaffable at ~gym #40
(0.5 % keying-error rate × 2,700 sales/gym/yr ≈ 1.5 escalations/day to the one person holding `service_role`).
Becomes *catastrophic* the moment anyone ships the obvious `clientes_staff_delete` policy.
**Confidence:** measured.
**Falsification I ran:** *"maybe voids are handled in the app."* `grep -rn "\.delete()" packages apps` → 4 hits,
all CMS content (`about_value`, `facility`, `faq`, `stat`). No venta or cliente void anywhere. Claim survives.
**Exit trigger:** none — this is not a "keep." Ship `anular_venta` + `ventas.anulada_at`/`anula_venta_id` +
`ON DELETE RESTRICT` + `clientes.archived_at`. ~1 day now; unbounded after the first manual repair.

### #3 — The safety gate cannot see production, and the repo has already written down why.
**Evidence:** 5 write-bearing RPCs anon-EXECUTE on prod (measured);
`20260706120100_scheduling_write_rpcs.sql:243-247` revokes from `public` not `anon`;
`20260715080000_revoke_anon_perf_rpcs.sql` root-causes it in prose — *"local Docker never had the default grant,
which is why the local/scratch denial checks couldn't see this"* — and then fixes four **different** functions;
`scheduling_rls_denial.sql:83-95` asserts anon *reads*, never anon *EXECUTE*; repo↔prod ledger 22/87.
**Breaks at:** **already broken**, 13 days and counting. The direct impact of these five grants is LOW and I say so
(SECURITY INVOKER + `to authenticated` policies + `staff_gym()` returns null for anon). **The severity is the
class, not the instance:** any grant-surface, policy-absence, or index-absence defect on prod is invisible to every
gate this project has.
**Confidence:** measured.
**Falsification:** *"maybe the suite does assert EXECUTE somewhere."* Grepped the whole `supabase/tests/` tree for
anon assertions — every one is a `set local role anon; select count(*)` visibility check. Claim survives.
**Exit trigger:** add one prod-facing assertion — a scheduled `has_function_privilege('anon', …)` sweep plus a
`get_advisors` check — and this finding closes. Reverse the "gate is sufficient" belief the moment
`select count(*) from pg_proc … where has_function_privilege('anon',oid,'EXECUTE')` exceeds the 2 intentional ones.
Measured today: **7**.

### #4 — The tenant boundary and the performance boundary are different mechanisms, and only one of them is enforced.
**Evidence:** proven unindexable on live prod — `Seq Scan on public.gym_membership (cost=10000000000.00..
10000000001.27)` with `enable_seqscan=off` and a perfect `(user_id, gym_id)` pkey available;
`agenda-miembro.ts:147-150` reads that table with no `user_id` and no `gym_id` predicate;
`.eq("gym_id")` coverage **40/122 = 32.8 %**, 11 modules at zero including `agenda.ts`; zero guards check it;
`mi_membresia` is SECURITY DEFINER and seq-scans platform-wide `ventas` (no `cliente_id` index — confirmed by
Supabase's own advisor today); `gym_membership` at 341,184 seq scans on 9 live rows.
**Breaks at:** `ventas` crosses `NBuffers/4` = 58.7 MB and Postgres stops caching it (heapam.c:397-398, fetched
2026-07-28) at **≈73 gyms**; `statement_timeout=120000` is exceeded by a single `mi_membresia` call at **≈1,635
gyms** on Micro-class disk throughput; a 16-core 4XL saturates on this one query at **≈3,000 gyms** with one year
retained and **≈1,700** with three. Quadratic in G — every doubling of gyms quadruples the cost.
**Confidence:** the plans and thresholds are **measured**; the CPU saturation numbers are **modelled** with inputs
shown (1 GB/s in-memory scan, 1 render/member/week, 6× peak factor) and carry ±2×.
**Falsification:** *"the index fixes it, so this is trivia."* The index does fix Chain B — and the finding is that
the index has been advisor-flagged and audit-named for weeks and is still absent, while the `.eq()` convention it
depends on sits at 32.8 % with no guard. **Exit trigger:** `.eq("gym_id")` coverage < 95 % at the end of the next
release cycle ⇒ the convention has failed as a convention; ship the guard or move to pods.

### #5 — Nothing in this system can be quarantined: one gym's mistake is every gym's outage.
**Evidence:** one Postgres instance, one PostgREST, one `service_role` key, one migration target with no canary,
zero partitioned tables, no `gym.pod_id`; per-tenant restore requires a logical extract that exists for 0 of 28
tables; one Resend domain and one bounce budget with **no suppression list and no working opt-out**
(`notificaciones_activadas` is a UI preference; `set_notificaciones` was dropped in
`20260708190000_drop_set_notificaciones.sql`); and no tenant-creation product surface at all — three `.from("gym")`
call sites, all SELECT, zero writes (§2/E15), so every onboarding is hand-typed SQL against production.
**Breaks at:** not a row count. It breaks the first time an incident needs a per-tenant response — plausibly
**gym #5** (a delete-my-data request), certainly by the first gym whose roster bounces past Resend's documented
4 % threshold. And onboarding breaks at a sales rate above ~2 gyms/day, or the first gym sold while the founder is
asleep.
**Confidence:** measured (all the absences); the Resend thresholds are `alt-email.md`'s fetched figures, reused.
**Exit trigger:** add `gym.pod_id` and have `resolveTenant` return it while every value is `1`. Reverse the
single-pod decision when any of: a tenant exceeds 2 % of platform rows; a customer asks for a written RPO/RTO;
`pg_database_size` > `effective_cache_size` on the largest instance you will pay for.

---

## 8. WHAT I WOULD DO IN THE NEXT SEVEN DAYS (ordered, and it is short)

1. **Open the Supabase Billing page and write the answer into `CONTEXT.md`.** 30 seconds. It is currently unknown,
   and three of this project's own documents disagree.
2. **If Free: upgrade to Pro today ($25/mo) and take a `pg_dump` before you do anything else.** If Pro: verify
   daily backups are actually listed, and buy PITR — which requires moving to Small compute first
   (~$15/mo + $100/mo PITR, and note PITR is **not** covered by Spend Cap per `price-gotcha.md`'s fetched source).
   This is the single cheapest risk reduction available anywhere in this audit.
3. **Two indexes.** `ventas (cliente_id, created_at desc, id desc)` and
   `clientes (auth_user_id) where auth_user_id is not null`. Instant at 175/116 rows.
4. **`create unique index concurrently clientes_tel_gym_uq on clientes (gym_id, tel)`.** Free today
   (0 duplicates, measured), impossible after the first one.
5. **`ventas_cliente_id_fkey → ON DELETE RESTRICT`, plus `clientes.archived_at`.** Removes the §3 scenario
   entirely, in about two hours.
6. **Revoke `anon` EXECUTE on the five write RPCs, and add a scheduled prod-facing privilege sweep** that fails
   loudly when `has_function_privilege('anon', …)` exceeds the intentional allowlist. This closes the instance and
   the class.
7. **`anular_venta` RPC + `ventas.anulada_at`/`anula_venta_id` + a denial suite asserting the written rows.**
8. **The `.eq("gym_id")` guard test**, shaped like `denial-suite-drift.test.ts` — allow-list with reasons, so the
   11 zero-coverage modules become explicit debt instead of invisible debt.
9. **Fill in `hitl-16-vercel-deploy-verify.md:83`** with the measured pair, and set `preferredRegion` to match the
   database. There is no `vercel.json` in the repo at all (verified), so this is a new file and a config change.

Items 1–5 are under a day of work in total and remove, by my count, the top two findings and the §3 death scenario.

---

## 9. BLIND SPOTS — what I did not examine, and where I could be wrong

1. **I never read the billing API.** The Free/Nano conclusion rests on an inference from `effective_cache_size`
   (a tuning convention, not a Supabase-published formula), plus two 402-branching citations in the repo. If the
   org is on Pro, finding #1's severity drops one notch — but PITR remains impossible on `max_connections=60`
   regardless, so the *shape* of the finding survives either way.
2. **I did not benchmark anything above ~700 rows.** Every gym-count threshold in §2.2 and §7 is extrapolated from
   a 15 MB, 4-gym database. The in-memory scan rate (1 GB/s), the render rate (1/member/week) and the peak factor
   (6×) are all **MODELLED** and each could be off by 2×. A seeded 500-gym scratch project would settle every one
   of them and nothing else will. My exponent (G²) is structural and does not depend on those constants; my
   *constants* do.
3. **I did not verify that prod's schema objects match the repo beyond spot checks.** I proved the migration
   *ledgers* diverge 65/87 and that the *grants* diverge, and I spot-checked two migrations whose effects are live.
   I did **not** do an object-by-object diff, so I cannot say how much else differs. That diff is the single
   highest-value follow-up in this document and I could not run it read-only.
4. **I did not test concurrency.** The duplicate-guard race in `registrar_venta` (non-locking `select … limit 1`,
   no supporting unique index for null-email rows) is argued from the code, not demonstrated. I read the
   `pg_advisory_xact_lock` calls in `toggle_pase`/`pasar_lista_sesion`/`reservar_clase` and ran no test against
   them.
5. **I did not measure the Vercel↔Supabase latency myself.** I verified the *documentation* half (the `____`
   blank at `hitl-16:83`, the "verify, do not re-tune" instruction at `hitl-28:89`, the absence of any
   `vercel.json`) and took the `iad1`/`us-west-2` measurement from `arch-runtime.md`. I did not re-run the curl or
   the geolocation.
6. **I did not examine `packages/domain`'s rule code**, the 41 `.rpc()` call sites' internal scoping beyond
   `mi_membresia`/`staff_gym`, `auth.users` internals, Storage, Edge Functions, or the client app's rendering path.
7. **I did not price or design the fix for the tenancy model.** §4 argues the shape is wrong; it does not cost the
   alternative. `arch-tenancy.md` does, and its number ($1.25/gym/mo for 12 pods vs $0.36 for one) is the one I
   would build on — reused, not re-derived.
8. **I am the prosecution and I was told to be.** I have not weighted these findings against what the business
   actually needs next, against the founder's time budget, or against the possibility that this product never
   reaches 100 gyms. A referee should discount me accordingly — but note that findings #1, #2 and #3 are all
   present-tense at four gyms, so the discount for "you're modelling a scale we may not hit" applies to #4 and #5
   only.
