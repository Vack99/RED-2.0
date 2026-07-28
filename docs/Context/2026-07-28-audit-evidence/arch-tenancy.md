# arch:tenancy — the structural fork the previous audit never took

**Agent:** `arch:tenancy` · **Date:** 2026-07-27 · **Target:** ≥3,000 gyms × 150–300 members
**Access used:** live prod `hjppxawglmukfvsgmcog` read-only (SELECT / EXPLAIN-without-ANALYZE / pg_catalog / advisors), repo at `C:/Users/Aaron/Documents/Repos/RED-2.0`, vendor pages fetched 2026-07-27.
**Mandate:** judge (A) shared+RLS, (B) schema-per-tenant, (C) database-per-tenant, (D) sharded pods, (E) hybrid as peers, incumbent gets no default.

---

## 0. Headline

The incumbent's tenant discriminator **is not an index condition and cannot become one**. I proved this on live prod: with `enable_seqscan = off` (a 10¹⁰ cost penalty), a member-scoped read of `asistencias` *still* chose a Seq Scan — the planner could find no index path at all. The RLS predicate compiles to `gym_id = ANY (hashed SubPlan)`, and a hashed SubPlan is a **filter**, never an `Index Cond`.

The only thing that makes any read O(tenant) instead of O(platform) is the reader-side `.eq("gym_id", …)` convention that ADR-0013 §2 names as load-bearing. **It is present in 40 of 118 non-test `.from()` calls. Ten DAL modules have zero — including `agenda.ts`, the busiest admin screen in the product.** Nothing in `tools/guards/`, `.dependency-cruiser.cjs` or ESLint checks it.

So the real question is not "which tenancy model" — it is "**the incumbent model has exactly one scaling mechanism, it is a code-review convention, and it is 66% unimplemented**". Every alternative (B/C/D) makes tenant scoping a *structural property* rather than a convention. That is the fork, and it is the honest reason to take alternatives seriously — not isolation, not cost.

**Verdict: keep (A), but only if the convention becomes a machine-checked property. If it cannot be made a property, (D) sharded pods is the correct migration and it is cheap to prepare.** Exit trigger in §7.

---

## 1. The incumbent, grounded

### 1.1 Shape (measured, live)

```sql
select c.relname, (select count(*) from information_schema.columns col
   where col.table_schema='public' and col.table_name=c.relname and col.column_name='gym_id') as has_gym_id
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r';
```

| Fact | Value |
|---|---|
| `public` tables | **29** |
| tables carrying `gym_id` | **28** (all but `gym` itself, which *is* the tenant) |
| tables with RLS enabled | **29 / 29** |
| RLS policies in `public` | **101** |
| indexes in `public` | **89** |
| partitioned tables | **0** |
| FK constraints in `public` | **50**, of which **28 point at `gym`** |
| FK constraints that are **composite (include `gym_id`)** | **0** |
| DB size | 15 MB total; `public` heap+idx = **2,936 kB** across 4 gyms |

Measured bytes/row (`pg_relation_size` ÷ `reltuples`, live):

| table | heap B/row | total B/row (incl. idx) | #idx |
|---|---|---|---|
| asistencias | 181 | 619 | 6 |
| class_session | 177 | 606 | 6 |
| reservation | 142 | 605 | 6 |
| ventas | 299 | 1,196 | 5 |
| clientes | 306 | 1,608 | 6 |
| schedule_template_week | 93 | 263 | 2 |

*(total B/row is inflated at this size — a 107-row table with 6 indexes pays 6 × 16 kB of index-page minimums. Treat total B/row as an upper bound and heap B/row as sound.)*

### 1.2 How the predicate actually executes — the load-bearing measurement

**Test 1 — owner reads `asistencias`, no explicit gym filter:**

```sql
begin; set local role authenticated;
set local request.jwt.claims = '{"sub":"10517230-…","role":"authenticated"}';
explain (verbose, costs on) select id, fecha, cliente_id from public.asistencias where fecha >= '2026-07-01';
rollback;
```
```
Seq Scan on public.asistencias  (cost=1.34..27.46 rows=164 width=36)
  Filter: ((ANY (asistencias.gym_id = (hashed SubPlan 4).col1)) AND (asistencias.fecha >= '2026-07-01'))
  SubPlan 4
    ->  Seq Scan on public.gym_membership m
          Filter: ((m.role = ANY ('{owner,operator}')) AND (m.user_id = (InitPlan 1).col1)
                   AND ((SubPlan 2) OR (m.user_id = (InitPlan 3).col1)))
          SubPlan 2 ->  Result  Output: is_staff_of(m.gym_id)
```

**Test 2 — same query with `enable_seqscan = off` (10¹⁰ penalty):**
```
Seq Scan on public.asistencias  (cost=10000000002.67..10000000028.80 rows=164 width=36)
  Filter: ((ANY (asistencias.gym_id = (hashed SubPlan 4).col1)) AND (asistencias.fecha >= '2026-07-01'))
```
**Still a Seq Scan at cost 10 billion.** The planner would have taken *any* index path if one existed. There is none. `asistencias_gym_id_idx` and `asistencias_gym_fecha_idx (gym_id, fecha)` both exist and are both unusable by the RLS predicate.

**Test 3 — identical query with an explicit `gym_id` literal, seqscan still off:**
```
Index Scan using asistencias_gym_id_idx on public.asistencias  (cost=2.83..24.12 rows=91 width=36)
  Index Cond: (asistencias.gym_id = 'daa1c888-…'::uuid)
  Filter: ((ANY (asistencias.gym_id = (hashed SubPlan 4).col1)) AND …)
```
Cost 10,000,000,028.80 → **24.12**. The `.eq("gym_id")` is the entire difference between O(platform) and O(tenant).

**Test 4 — `clientes`, the two OR'd permissive policies:**
```
Seq Scan on public.clientes
  Filter: ((ANY (clientes.gym_id = (hashed SubPlan 4).col1)) OR (clientes.auth_user_id = (InitPlan 5).col1))
```
An OR of a hashed SubPlan and a column test. Structurally unindexable in both branches, forever, regardless of table size. Supabase's own advisor flags this as `multiple_permissive_policies` (WARN) on `clientes`, `gym_membership`, `reservation`.

**Test 5 — member reads `class_session` (the client-app agenda), seqscan off:**
```
Index Scan using class_session_gym_starts_idx on public.class_session
  Index Cond: (class_session.starts_at > now())
  Filter: (ANY (class_session.gym_id = (hashed SubPlan 4).col1))
```
`starts_at` is the **second** column of a `(gym_id, starts_at)` index. Using it as the sole cond means a **full index scan** across every gym's sessions, with the tenant filter applied per entry.

### 1.3 The convention that carries the whole model, and its coverage

`docs/adr/0013-*.md` §2 (corrected 2026-07-13) states it plainly:

> **Scale comes from the readers, not the predicate:** every staff DAL read carries an explicit `.eq("gym_id", gym.id)` scope selector … The `.eq` is **not redundant with RLS and must not be "cleaned up"**.

Measured coverage across `packages/data/src/server/*.ts`, excluding tests and helpers:

| Metric | Value |
|---|---|
| `.from(` call sites | **118** |
| `.eq("gym_id"` occurrences | **40** |
| `.rpc(` call sites | 41 |
| **DAL modules with `.from()` and ZERO `.eq("gym_id")`** | **10** |

The ten: `agenda.ts` (5), `class-type.ts` (6), `coach.ts` (5), `catalog.ts` (3), `gym.ts` (2), `mensajes.ts` (2), `cobro.ts` (1), `perfil.ts` (1), `plantillas.ts` (1), `resolve-tenant.ts` (2).

`agenda.ts:104-110` — the admin Agenda DÍA/SEMANA fetch, an entire product sector (ADR-0010):
```ts
.from("class_session")
.select("id, class_type_id, starts_at, duration_min, capacity, is_special, special_name, room_id")
.is("cancelled_at", null)
.gte("starts_at", low.toISOString())
.lt("starts_at", high.toISOString())
.order("starts_at");
```
No `gym_id`. `catalog.ts:12-15` even documents the omission as intentional: *"Isolation is RLS-by-membership (ADR-0013) — no manual gym_id filter on the reads."* That comment is the ADR's pre-correction reading, still shipping.

**Enforcement:** `tools/guards/` contains 8 guard tests (client-seam, denial-suite-drift, docs, loading-coverage, manifests, public-assets, rpc-write-coverage, turbo). **None checks gym scoping.** The only file under `tools/` that mentions `gym_id` is `tools/perf/seed-local.mjs`. There is no lint rule, no dependency-cruiser rule, no test.

### 1.4 The natural A/B experiment already running in production

`extensions.pg_stat_statements`, same table, same predicates, same ORDER BY, differing only by the `gym_id` qual:

| PostgREST query (class_session, cancelled_at IS NULL, starts_at range, ORDER BY starts_at) | gym_id qual | calls | mean_ms |
|---|---|---|---|
| 5 columns | **yes** (`gym_id = $1`) | 612 | **0.608** |
| 5 columns | **no** | 97 | **1.908** |
| 8 columns | **no** | 215 | **1.572** |

**3.1× slower at 548 platform rows and 4 gyms.** The scoped variant's cost is flat in platform size; the unscoped variant's grows linearly with it.

`pg_stat_user_tables`, cumulative since stats reset:

| table | seq_scan | seq_tup_read | idx_scan | live rows |
|---|---|---|---|---|
| gym_membership | **321,021** | 1,085,590 | 867 | 9 |
| ventas | 2,945 | 165,268 | 380 | 175 |
| clientes | 2,952 | 104,406 | 3,371 | 116 |
| asistencias | 805 | 105,690 | 1,915 | 705 |

### 1.5 Tenant integrity is not enforced by the database

All 22 non-`gym` FK constraints are **single-column**. There is no composite `(gym_id, id)` FK anywhere. Consequences:

- Postgres does **not** guarantee that `class_session.class_type_id` points at a `class_type` in the same gym. FK validation runs with RLS bypassed, so an operator of gym A can insert a `class_session` (gym_id = A, passes `is_staff_of(A)` WITH CHECK) whose `class_type_id` belongs to gym B.
- I checked all 13 cross-table edges live. **Today: 0 cross-gym rows on every edge.** The invariant holds by luck and discipline, not by construction.

```
class_session->class_type 0 | class_session->room 0 | class_session->schedule_template 0
reservation->clientes 0 | reservation->class_session 0 | asistencias->clientes 0
asistencias->class_session 0 | ventas->clientes 0 | clientes->favorite_class_type 0
plan_feature->paquetes 0 | class_session_coach->coach 0 | schedule_template_coach->coach 0
schedule_template_week->schedule_template 0
```

This matters *specifically* for per-tenant restore (§4): a per-gym logical extract is only well-defined if the tenant subgraph is closed. It is closed today and nothing keeps it closed.

### 1.6 Onboarding a gym, today

`grep "insert into public.gym_membership" supabase/migrations/*.sql` returns 13 hits. **Every one in a live RPC is the member-claim path** (`reclamar_o_crear_cliente`, `reclamar_por_codigo`, …), inserting `role = 'member'`. The only `owner` insert is a seed inside `20260702161010_create_gym_membership.sql:90`. The only `insert into public.gym` is a seed in `20260702150000_create_gym_tenant_spine.sql:56`.

**No product surface creates a gym or an owner.** Onboarding gym #5 is a founder writing SQL against production. That is model A's *actual* onboarding cost — which is not a property of model A at all, and would be identical work under D.

---

## 2. The five models, judged as peers

### 2.1 Cost at 3,000 tenants

**Data-volume model.** Per gym, 225 members, one year:

| entity | rows/gym/yr | derivation |
|---|---|---|
| asistencias | 33,750 | 225 × 3/wk × 50 wk |
| reservation | 33,750 | ~1:1 with attendance |
| ventas | 2,700 | 225 × 12 monthly renewals |
| class_session | 1,560 | 30/wk × 52 |
| class_session_coach | 1,872 | 1.2 coaches/session |
| clientes | ~400 | 225 active + churn |
| **total** | **~74,000** | |

× 3,000 gyms = **222M rows/year**. Using measured heap B/row: **36.9 GB heap/yr**; with indexes **92 GB/yr realistic, 141 GB/yr upper bound**. Year 3: **276–423 GB**.

**Prices — all fetched from https://supabase.com/pricing and https://supabase.com/docs/guides/platform/compute-and-disk on 2026-07-27:**

| item | price |
|---|---|
| Pro plan | $25/mo/org |
| Micro (1 GB, 60 conn / 200 pooler, 10 GB max DB) | $10/mo |
| Large (8 GB, 160/800, 200 GB) | $110/mo |
| XL (16 GB, 240/1,000, 500 GB) | $210/mo |
| 2XL (32 GB, 380/1,500, 1 TB) | $410/mo |
| 4XL (64 GB, 480/3,000, 2 TB) | $960/mo |
| 8XL (128 GB, 490/6,000, 4 TB) | $1,870/mo |
| 16XL (256 GB, 500/12,000, 10 TB) | $3,730/mo |
| PITR | **$100/mo per 7 days retention, per project** |
| Disk | $0.125/GB beyond 8 GB |
| Compute credit | **$10/mo per organization, applied once** (https://supabase.com/docs/guides/platform/manage-your-usage/compute, fetched 2026-07-27) |

**Cost table at 3,000 gyms (database layer only — excludes Vercel, Resend, Auth MAU, which are identical across models except C):**

| model | shape | compute | PITR | disk | plan | **total/mo** | **$/gym/mo** |
|---|---|---|---|---|---|---|---|
| **A** shared + RLS | 1 project, 4XL | $960 | $100 | ~$19 | $25 − $10 | **$1,094** | **$0.36** |
| **B** schema-per-tenant | 1 project, 8XL (catalog + relcache headroom) | $1,870 | $100 | ~$19 | $15 | **$2,004** | **$0.67** |
| **C** db-per-tenant | 3,000 projects, Micro each | $30,000 | **$300,000** | incl. | $15 | **$330,015** | **$110.01** |
| **C′** db-per-tenant, **no PITR** | 3,000 × Micro | $30,000 | $0 | incl. | $15 | **$30,015** | **$10.01** |
| **D** 12 pods × 250 gyms | 12 projects, XL each | $2,520 | $1,200 | ~$19 | $15 | **$3,754** | **$1.25** |
| **E** hybrid: 2,900 shared + 100 dedicated | 4XL + 100 × Micro | $1,960 | $100 (shared only) | ~$19 | $15 | **$2,094** | **$0.70** |

**The most important number in this table is C's PITR line.** Per-tenant PITR is the entire reason to buy database-per-tenant, and at $100/mo/project it costs **$300,000/mo — 10× the raw compute**. Database-per-tenant on Supabase cannot afford the thing it exists to provide. Without PITR (C′) it still costs $10.01/gym/mo, which against a 300 MXN/gym floor (≈ USD 16 at ~18.5 MXN/USD — *FX rate ASSERTED, not fetched*) is **62% of revenue**. **C is dead on arrival and it dies on a line item nobody models.**

D at $1.25/gym is 3.4× A but still ~1.6–8% of revenue. **Cost does not decide between A, B, D and E.** It only eliminates C.

### 2.2 Isolation and blast radius

| model | a bad query | a bad RLS policy | a bad migration | a compromised `service_role` key | vendor outage |
|---|---|---|---|---|---|
| **A** | all 3,000 | **all 3,000** — one missing/wrong `USING` leaks the platform | all 3,000, atomically | **all 3,000** — the key bypasses RLS entirely | all 3,000 |
| **B** | all 3,000 (shared instance) | **n/a — no RLS needed**; isolation is `search_path` | all 3,000, non-atomically → partial states | all 3,000 | all 3,000 |
| **C** | 1 | n/a | 1 per target | **1** | 1 |
| **D** | 250 | 250 | 250 per pod, staged | 250 (per-pod keys) | 250 |
| **E** | 2,900 or 1 | 2,900 | 2,900 or 1 | 2,900 or 1 | 2,900 or 1 |

**The honest asymmetry:** A's isolation failure mode is a *code* bug (a policy), which is testable — and this repo tests it, hard: `supabase/tests/` + `pnpm test:denial` (36 suites, per repo memory), plus `rpc-write-coverage.test.ts` and `denial-suite-drift.test.ts` guarding the wiring. **A's isolation is genuinely better-defended here than the generic argument suggests, because the denial suite exists and is machine-guarded against drift.** That is real and it counts.

B's isolation failure mode is a *routing* bug (wrong `search_path`), which is one line and equally testable. B's advantage over A on isolation is smaller than it looks.

D is the only model that reduces blast radius by construction without paying C's price.

### 2.3 Noisy neighbour

| model | verdict |
|---|---|
| **A** | **Worst, and structurally so.** Every unscoped read (10 DAL modules) scans *all* tenants' rows. Gym #2,999's Agenda render burns CPU proportional to gym #1's data. A single tenant's data growth degrades every other tenant. There is no per-tenant resource governor anywhere in Postgres. |
| **B** | Much better on I/O (each tenant's tables and indexes are separate relations → smaller, cache-resident). Worse on catalog and relcache (§2.5). |
| **C** | Perfect. Separate instances. |
| **D** | 250-way blast radius; a hot tenant can be moved to another pod, which is the operational lever A structurally lacks. |
| **E** | Whales get C, minnows get A. The exact right shape *if* whales exist. At 150–300 members per gym in this product, **they do not** — the tenant size distribution is nearly uniform, which is precisely the condition under which E's added complexity buys nothing. |

### 2.4 Connection-pool math

**First, kill the usual bogeyman honestly.** Every query in `pg_stat_statements` is wrapped in `WITH pgrst_source AS (…)` — that is PostgREST's query shape. All app access is HTTP → PostgREST. **Vercel opens zero Postgres connections.** Serverless connection exhaustion, the most-feared failure mode of this stack shape, does not apply. This is measured, not assumed.

| model | direct conns | pooler conns | binds at |
|---|---|---|---|
| **A** (1 × 4XL) | 480 | 3,000 | never — PostgREST holds a fixed small pool |
| **B** (1 × 8XL) | 490 | 6,000 | never on connection count; **binds on PostgREST schema cache** (§2.5) |
| **C** (3,000 × Micro) | 3,000 × 60 | 3,000 × 200 | never on count; binds on cost and control plane |
| **D** (12 × XL) | 2,880 | 12,000 | never — 4× A's headroom |
| **E** | 480 + 100×60 | 3,000 + 100×200 | never |

**Connections are a non-issue in every model.** Anyone who ranks these models on connection math is solving 2019's problem. Say so plainly.

### 2.5 Ceiling-check on schema-per-tenant — honestly

Two credible sources disagree, and the disagreement is the finding:

- **PlanetScale** (https://planetscale.com/blog/approaches-to-tenancy-in-postgres, fetched 2026-07-27): schema-per-tenant "likely won't scale beyond a few hundred tenants" because "system catalogs grow into millions of rows"; database-per-tenant same ceiling, ~8 MB per database, and "PgBouncer pools are calculated per-database and will quickly exceed your max_connections limit."
- **Citus** (https://docs.citusdata.com/en/stable/get_started/concepts.html, fetched 2026-07-27): schema-based sharding supports **"1-10k" tenants per cluster**; row-based supports "1-1M+".

Citus ships schema-based sharding as a product and rates it to 10k. PlanetScale sells a competing product and rates it to "a few hundred". **3,000 sits inside Citus's band and outside PlanetScale's.** Neither is disinterested. So I computed the ceilings myself against *this* schema.

**Catalog math** (measured `public` schema × 3,000):

| catalog | per schema (measured) | × 3,000 |
|---|---|---|
| `pg_class` (29 tables + 89 idx) | 118 | 354,000 |
| + TOAST tables & their indexes (~25 × 2) | ~50 | +150,000 → **~504,000** |
| `pg_attribute` | 519 | **1,557,000** |
| `pg_constraint` | 124 | **372,000** |
| `pg_proc` | 38 | 114,000 (avoidable — keep functions in a shared schema) |
| `pg_policy` | 101 | **0 — B needs no RLS** |

~500k `pg_class` rows and ~1.6M `pg_attribute` rows is large but not fatal; these are btree-indexed catalogs. **PlanetScale's "millions of rows" claim is directionally right and its "few hundred" ceiling is not supported by this arithmetic.** Catalog size is not what kills B here. Three other things do:

**(i) Atomic all-tenant DDL is impossible on this instance — computable.**
```sql
select name, setting from pg_settings
where name in ('max_locks_per_transaction','max_connections','max_prepared_transactions');
-- max_locks_per_transaction = 64 | max_connections = 60 | max_prepared_transactions = 0
```
Postgres sizes the lock table as `max_locks_per_transaction × (max_connections + max_prepared_transactions)` = **64 × 60 = 3,840 lock slots**. A transaction that `ALTER TABLE`s one table in every schema takes ≥1 lock per relation touched (table + its indexes ≈ 4). **3,840 ÷ 4 ≈ 960 schemas** before `ERROR: out of shared memory / You might need to increase max_locks_per_transaction`. Supabase raises this with compute size but it is a config knob you do not own on Pro. Non-atomic per-schema DDL works but leaves 3,000 independent partial-failure states — exactly the drift the ClickHouse writeup warns about ("Managing schema drift across 5,000 distinct schemas during deployment is an operational burden you do not want to bear", https://clickhouse.com/resources/engineering/multi-tenant-saas-postgres-architecture, fetched 2026-07-27).

**(ii) PostgREST's schema cache is B's disqualifier on Supabase specifically.**
Supabase's data API is PostgREST. Exposing 3,000 schemas means `db-schemas` lists 3,000 entries and PostgREST builds a schema cache over ~504,000 relations. The PostgREST docs (https://docs.postgrest.org/en/v12/references/schema_cache.html, fetched 2026-07-27) state the cache exists because "getting this metadata requires expensive queries", that it reloads on DDL event triggers, and — decisively — **"Requests will wait until the schema cache reload is done."** Under B, *every gym onboarding is a DDL event that stalls all 3,000 tenants' API traffic* while a half-million-relation cache rebuilds. The docs give no size figures, so the exact stall is **ASSERTED, not measured** — but the mechanism is documented and the direction is not in doubt.

**(iii) Relcache accumulation under transaction pooling.**
Supavisor multiplexes: one backend serves many tenants over its life. Each backend caches a `RelationData` entry per relation it has touched. A long-lived backend that has served all tenants accumulates up to ~504,000 relcache entries at roughly 3–10 kB each = **1.5–5 GB per backend**. With 20 active backends that is 30–100 GB of per-backend memory — fatal below 8XL, and there is no `search_path`-affine routing in Supavisor to avoid it. *(Per-entry size is ASSERTED from Postgres internals, not measured here.)*

**Autovacuum**, by contrast, is *not* the killer people expect. `autovacuum_max_workers = 3`, `autovacuum_naptime = 60s`. 87,000 tables is a large work list but autovacuum skips relations below their thresholds cheaply. It degrades; it does not cliff. I rank this a real but second-order B cost.

**Honest B scorecard:** B's cost ($0.67/gym) is fine, its isolation is fine, its per-tenant restore is *excellent* (§4), and the catalog arithmetic does not disqualify it. **B loses on exactly two things: PostgREST's schema cache (a Supabase-specific hard blocker) and migration atomicity.** Both are real. Neither is the reason usually given.

### 2.6 Migration ergonomics

Repo has **87 migration files** (`ls supabase/migrations/*.sql | wc -l`).

| model | targets per migration | atomic? | drift risk |
|---|---|---|---|
| **A** | **1** | yes | none |
| **B** | 3,000 | **no** (§2.5-i) | 3,000 independent states |
| **C** | 3,000 projects across a control-plane API | no | worst; plus 3,000 SMTP/auth/key configs |
| **D** | 12 | per pod | 12 states, staged rollout is a *feature* |
| **E** | 2 shapes forever | partial | must test every migration against both shapes |

**This is A's genuine, large, uncontested win, and it deserves to be stated as strongly as A's flaws.** One migration target, one denial suite run, one `test:denial` gate. That single property is worth more day-to-day than everything B and C offer.

D preserves 92% of it (12 targets) and adds staged rollout, which A cannot do at all: under A, a bad migration is live for all 3,000 gyms simultaneously with no canary.

### 2.7 Onboarding cost per gym

| model | mechanism | wall-clock | interrupts other tenants? |
|---|---|---|---|
| **A** | 3 INSERTs (`gym`, `gym_domain`, `gym_membership` owner) | seconds | no |
| **B** | `CREATE SCHEMA` + replay 87 migrations + add to `db-schemas` + schema-cache reload | minutes | **yes — all 3,000 stall** |
| **C** | create project via API + provision + SMTP + auth URLs + keys + Vercel env | minutes–hours; gated on a control plane the prior audit found degraded ~2 of 8 weeks | no |
| **D** | same as A + a pod assignment | seconds | no |
| **E** | A or C depending on tier | | |

A and D are 3 INSERTs. **Neither is implemented** (§1.6). ADR-0008's "onboarding a gym is a config act, not an infra act" is the right principle and it is currently satisfied by a human typing SQL into production.

### 2.8 How each fails

| model | failure mode | what it looks like at 3 a.m. |
|---|---|---|
| **A** | one unscoped hot query saturates CPU; the working set stops fitting in `shared_buffers` and every scan becomes disk I/O | platform-wide latency cliff, all 3,000 gyms at once, no per-tenant lever, no way to shed load |
| **B** | schema-cache reload storm or lock-table exhaustion mid-migration | API stalls platform-wide; half the tenants have the new column |
| **C** | control-plane degradation blocks onboarding; billing surprise | cannot sell; or a $330k invoice |
| **D** | one pod degrades | 250 gyms down, 2,750 fine; move the hot tenant |
| **E** | two codepaths drift | a bug reproduces on one tier only |

**A has no graceful degradation and no per-tenant lever. That is its defining operational weakness and it is not fixable within model A** — only by moving to D.

---

## 3. Where A actually breaks — the numbers

**Cliff mechanism:** while the working set fits in `shared_buffers`, unscoped scans are memory-speed and merely wasteful. When it stops fitting, they become random disk I/O — a 100–1,000× step, not a slope. So the breaking point is where the *scanned* working set exceeds `shared_buffers`.

Live: `shared_buffers = 28,672 × 8 kB = 224 MB`, `effective_cache_size = 384 MB` — entry-tier compute.

Supabase sets `shared_buffers` at roughly 25% of RAM. Largest instance sold is 16XL / 256 GB → ~64 GB `shared_buffers`.

Growth: **92 GB/yr realistic, 141 GB/yr upper bound** at 3,000 gyms (§2.1) = **31–47 MB per gym per year**.

| retention | gyms at which working set exceeds 64 GB (16XL, $3,730/mo) | gyms at which it exceeds 16 GB (4XL, $960/mo) |
|---|---|---|
| 1 year | **1,370 – 2,090** | **340 – 520** |
| 3 years | **460 – 700** | **115 – 175** |
| 5 years (a gym's ledger is permanent) | **275 – 420** | **68 – 105** |

**Breaking point for A-as-written: 340–520 gyms on a 4XL with one year retained; 115–175 gyms with three years retained.** Past that, you buy bigger boxes to compensate for scans you did not need to run, and the ceiling is 16XL — after which model A has no more moves.

**Breaking point for A-with-`.eq("gym_id")`-everywhere:** the resident set becomes B-tree upper levels plus the reading tenant's own pages — ~3 orders of magnitude smaller. 3,000 gyms fits comfortably on a **2XL–4XL** with room for 3–5 years of ledger. Confirmed by the live A/B: 0.608 ms scoped vs 1.908 ms unscoped, and the scoped variant's cost is flat in platform size.

**The gap between those two answers — ~350 gyms vs >3,000 gyms — is the value of a machine guard on 78 missing `.eq("gym_id")` calls.**

Secondary confirmations already flagged by the prior audit and re-verified here:
- `ventas` has **no** index leading with `cliente_id`; `mi_membresia()` (`prosecdef=true`) runs `from public.ventas v where v.cliente_id = v_cli order by v.created_at desc, v.id desc limit 1` on **every member plan-card render**. Live: 2,945 seq scans / 165,268 tuples on a 175-row table. Supabase advisor confirms `unindexed_foreign_keys` on `ventas_cliente_id_fkey`.
- `clientes` has no index leading with `auth_user_id` (only `UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL`). Advisor confirms.
- `gym_membership`: **321,021 seq scans on 9 rows.**

---

## 4. Per-tenant point-in-time restore — the question nobody asked

Physical PITR replays WAL for the whole cluster. It structurally cannot roll back one tenant. What each model does about that:

| model | "gym #1,847 deleted its roster on Tuesday, restore it" | RTO | code that must exist |
|---|---|---|---|
| **A** | Restore the full 3,000-gym DB to a **scratch project** at time T (Supabase PITR to a new project), then logically extract gym #1,847's 28 tables in FK order and merge back into live. | hours; dominated by full-cluster restore of a 92–423 GB DB | **A per-gym extract + reimport script. Does not exist.** `packages/data/src/server/respaldo.ts` is the closest thing: it reads `ventas`, `asistencias`, `clientes`, `paquetes` scoped by `.eq("gym_id", gym.id)` — **4 of 28 tables, read-only, for a CSV/Excel export.** No reimport path for any table. |
| **B** | `pg_restore -n gym_1847` from last night's dump; or `pg_dump -n gym_1847` from a PITR'd scratch. **One command.** | minutes | **none** |
| **C** | Native per-project PITR. One dashboard click. | minutes | none — but costs $300k/mo (§2.1) |
| **D** | PITR the pod → rolls back **250** gyms, not 3,000. Or restore that pod to scratch and extract 1 of 250. | ~1/12 of A's restore volume | same extract script as A, but sifting 12× less data |
| **E** | A for the shared pool, C for dedicated | | same as A |

**This is the single dimension on which the incumbent is worst by a wide margin, and it is the dimension the previous audit relegated to item #11 of 17.**

Two compounding facts specific to A here:

1. **The extract's feasibility rests on an unenforced invariant.** A per-gym logical extract is only well-defined if the tenant subgraph is closed. I verified it is closed **today** (§1.5, 0 cross-gym rows on 13 edges). But all 22 non-`gym` FKs are single-column and FK checks bypass RLS, so nothing prevents a cross-gym reference. If one lands, the restore script either fails FK validation or silently drops rows — and it will be discovered during the incident.

2. **`supabase db dump` excludes the `auth` schema by default.** Under A, `clientes.auth_user_id`, `gym.owner_user_id` and `gym_membership.user_id` are all FKs into `auth.users`. A restore of one gym from a dump that omitted `auth` reconstructs a roster whose members cannot log in.

**Cheapest fix that does not change the model** (recommended regardless of which model wins):
- Add composite `UNIQUE (gym_id, id)` + composite FKs `(gym_id, <ref>) → (gym_id, id)` on the 13 intra-tenant edges. This converts "the tenant subgraph is closed" from luck into a database property, and it costs 13 unique indexes plus 13 FK swaps.
- Write and round-trip the per-gym extract/reimport against the `forge-demo` twin. Record the RTO.
- Dump `auth` explicitly in every backup.

---

## 5. What comparable SaaS actually run

| system | shape | source |
|---|---|---|
| **Notion** | **480 logical shards on 32 physical Postgres instances**, partitioned by `workspace_id` — ~15 logical shards per instance. This is option **D** at production scale. | search result summary, https://clickhouse.com/resources/engineering/multi-tenant-saas-postgres-architecture and related; *I did not fetch Notion's own engineering post — treat the exact figures as second-hand* |
| **Citus / Azure Cosmos DB for PostgreSQL** | ships **both** row-based (option A, rated **1–1M+ tenants**) and schema-based (option B, rated **1–10k tenants**) sharding as first-class features | https://docs.citusdata.com/en/stable/get_started/concepts.html, fetched 2026-07-27 |
| **PlanetScale's recommendation** | shared-schema with `tenant_id` "can scale to many thousands of tenants"; explicitly *does not* recommend relying on RLS, citing "security policy misconfiguration risks and connection pooling complications" | https://planetscale.com/blog/approaches-to-tenancy-in-postgres, fetched 2026-07-27 |
| **ClickHouse's 2026 guidance** | schema-per-tenant is "rarely the right pick for a new SaaS application in 2026"; recommends read replicas → partitioning → logical-replication isolation for whales → sharding "a true last resort" | https://clickhouse.com/resources/engineering/multi-tenant-saas-postgres-architecture, fetched 2026-07-27 |

**Convergent industry answer: shared tables with a tenant discriminator, sharded into pods when one instance runs out — i.e. A → D.** Nobody at 3,000 tenants runs C. B exists as a product feature (Citus) rated exactly into this range, which is why it deserved a real hearing rather than dismissal.

Note the dissent worth internalising: **PlanetScale explicitly recommends against relying on RLS** as the tenancy boundary, favouring an application-enforced `tenant_id` on every query. That is *almost exactly* what ADR-0013 §2 (corrected) concluded independently — reader-side `.eq("gym_id")` is the scaling mechanism, RLS is the safety net. The repo reached the right answer and then implemented it in 34% of call sites.

---

## 6. Falsification — what would have to be true for me to be wrong

| my claim | what would have to be true for it to be wrong | did I check? |
|---|---|---|
| The RLS predicate can never be an index condition | Postgres could turn `= ANY (hashed SubPlan)` into an `Index Cond` at some table size | **Checked. `enable_seqscan=off` on live prod: still Seq Scan at cost 10¹⁰.** The planner had a 10-billion incentive and found no index path. Not size-dependent. |
| The `.eq("gym_id")` convention is unenforced | some guard, lint rule or type-level device requires it | **Checked.** 8 files in `tools/guards/`, none about gym scoping; only `tools/perf/seed-local.mjs` mentions `gym_id` under `tools/`. |
| 10 DAL modules have zero gym scoping | those modules' tables are tiny/global, so it doesn't matter | **Partly wrong, honestly:** `coach` (~5/gym → 15k rows), `class_type` (~5/gym → 15k), `perfil`, `cobro`, `plantillas` stay small. **But `agenda.ts` reads `class_session` (4.68M rows/yr at 3,000 gyms) and `class_session_coach` (5.6M/yr) unscoped.** The finding survives on `agenda.ts` alone. |
| Per-gym extract is feasible | a cross-gym FK reference exists today | **Checked. 0 across all 13 edges.** Feasible today, unguarded. |
| C is unaffordable | Supabase offers volume pricing on projects, or PITR is not per-project | Pricing page states "$100 per month per 7 days retention"; compute doc states compute is billed per project with a **single $10 org-wide credit**. No volume tier documented. **If Supabase quotes a bulk rate, C's ranking changes — this is my most fragile cost claim.** |
| Model A's cliff is at 340–520 gyms | `shared_buffers` is a larger fraction of RAM than 25%, or retention is <1 year, or unscoped reads are colder than I assume | **Not checked directly** — 25% is Supabase's documented default posture, not measured on this instance. Live `shared_buffers`=224 MB on entry-tier is consistent with ~22% of 1 GB. Treat the gym counts as ±2×. |
| B's PostgREST schema-cache stall is disqualifying | PostgREST loads the cache lazily per-schema, or Supabase pins `db-schemas` differently | **Mechanism documented, magnitude ASSERTED.** I found no figure for cache-build time vs relation count. This is B's weakest evidence and would need a bench to settle. |

---

## 7. Verdict and exit triggers

### Verdict

**Keep (A) — shared tables + RLS discriminator — and convert its scaling mechanism from a convention into a machine-checked property. Prepare (D) sharded pods as the named successor, and prepare it before it is needed.**

Reasons, in order of weight:
1. **One migration target.** 87 migrations × 1 execution, one denial suite, one `test:denial` gate. B costs 3,000×, C costs 3,000× across a flaky control plane. This single property outweighs everything B and C offer at this tenant count.
2. **Cost eliminates C** ($10–110/gym/mo vs $0.36) and does not distinguish A, B, D, E.
3. **The industry converges here** (Citus rates row-based to 1M+; Notion runs A-inside-D).
4. **A's isolation is better-defended in this repo than the generic argument allows** — the denial suite plus its two drift guards is real machinery that most shared-table shops do not have.
5. **A's decisive weakness is per-tenant restore, and D fixes 92% of it for $2,660/mo** without touching a line of application code.

Reasons this is **not** a rubber stamp: A wins on migration ergonomics and cost, and loses on per-tenant restore, noisy neighbour, blast radius and graceful degradation — **four of eight axes.** It wins because the two axes it wins are the ones you touch daily and the four it loses are ones you touch during incidents. That is a defensible trade, not a free one.

### Exit triggers — observable metric + threshold, each reversing the decision

| # | metric | threshold | action |
|---|---|---|---|
| **T1** | `.eq("gym_id")` coverage of non-test `.from()` call sites in `packages/data/src/server` (today **40/118 = 34%**) | **< 95% at the end of the next release cycle**, or any new `.from()` lands without it | The convention has failed as a convention. Ship the guard test *or* abandon A for D. This is the primary trigger. |
| **T2** | `pg_stat_user_tables.seq_tup_read` on `class_session`, `asistencias`, `reservation`, `clientes`, `ventas`, summed per week | **> 10⁹/week** | Unscoped scans dominate. Fix the call sites within one cycle. |
| **T3** | `pg_database_size` | **> 25% of `shared_buffers` × 4** (i.e. > effective_cache_size) on the largest instance you are willing to pay for | Working set no longer resident. Move to D. On a 4XL this is **~16 GB ⇒ ~340–520 gyms**; on 16XL **~64 GB ⇒ ~1,370–2,090 gyms**. |
| **T4** | compute tier required to hold admin p95 < 300 ms | **2XL ($410) reached before 1,000 gyms** | You are buying hardware to pay for scans you shouldn't run. Fix T1 first; if p95 is still failing, shard. |
| **T5** | count of cross-gym FK references (the §1.5 query) | **> 0** | The per-tenant restore path is now broken. Add composite FKs immediately, before the next restore is needed. |
| **T6** | tenants requesting a contractual per-tenant RPO/RTO, or a single tenant exceeding **2% of platform rows** | any | Move that tenant to model E's dedicated tier. Below that threshold E is complexity without a customer. |
| **T7** | Supabase quotes volume pricing bringing per-project cost below **$1/gym/mo** | any | Re-open option C. |

### Concretely, in order

1. **Write the guard** (`tools/guards/gym-scope-coverage.test.ts`): every `.from(<gym-scoped table>)` in a non-test `packages/data/src/server` module must be accompanied by `.eq("gym_id", …)` or carry an explicit allow-list entry with a reason — the same shape as `denial-suite-drift.test.ts`. This is the single highest-leverage line of work in the whole audit; it is what converts A from a 350-gym architecture into a 3,000-gym one.
2. **Add the 78 missing `.eq("gym_id")` calls**, starting with `agenda.ts` and `catalog.ts`. Delete the stale `catalog.ts:12-15` comment that documents the omission as intentional.
3. **Two indexes** (already known, still absent): `ventas (cliente_id, created_at desc, id desc)` and `clientes (auth_user_id) where auth_user_id is not null`.
4. **Composite `(gym_id, id)` uniques + composite FKs** on the 13 intra-tenant edges — makes the tenant subgraph closed by construction and unblocks per-tenant restore.
5. **Build and round-trip the per-gym extract/reimport** against `forge-demo`; record the RTO. Include `auth` in every dump.
6. **Make `resolveTenant` pod-aware now, while there is one pod.** Add a `gym.pod_id` column and have `resolveTenant` return it, even though every value is `1`. Migrating to D later then costs a routing change, not a rewrite. This is the cheapest insurance in the document.

---

## 8. The 5 worst properties of the incumbent model, worst first

**1. Its only scaling mechanism is a code-review convention, and the convention is 66% unimplemented with zero enforcement.**
ADR-0013 §2 (corrected) is explicit that reader-side `.eq("gym_id")` — not RLS — is what makes reads O(tenant). Measured: **40 of 118 non-test `.from()` call sites carry it; 10 DAL modules have none**, including `agenda.ts` which reads `class_session` (4.68M rows/yr at 3,000 gyms) with no tenant filter. No guard, no lint rule, no test checks it. And this exact mechanism has already been documented wrong once in a locked ADR — §2 originally claimed O(1)-per-statement and was retracted 2026-07-13. *An architecture whose scaling property depends on every future author remembering an ADR footnote is not an architecture, it is a habit.*
**Breaks at:** ~340–520 gyms on a 4XL with 1 year retained (working set exceeds `shared_buffers`); ~115–175 gyms at 3 years.

**2. RLS cannot enforce tenant scoping *efficiently*, and this is structural, not a tuning problem.**
Proven on live prod: with `enable_seqscan=off` the planner still chose a Seq Scan at cost 10,000,000,028.80. `gym_id = ANY (hashed SubPlan)` is a filter and can never be an `Index Cond`. On `clientes` it is worse — the two OR'd permissive policies produce `(ANY (gym_id = hashed SubPlan)) OR (auth_user_id = InitPlan)`, unindexable in both branches. The 2026-07-14 uncorrelated rewrite was correct and helped (42 ms → 3 ms on 5k rows) but it converted a quadratic cost into a linear one; it did **not** make anything O(tenant).
**Breaks at:** immediately in principle; observably when platform rows on any hot table exceed ~10⁶, i.e. **~200–650 gyms**.

**3. Per-tenant point-in-time restore does not exist and the path to building it rests on an unenforced invariant.**
Physical PITR rolls back all 3,000 or none. The reimport half of a per-gym restore exists for **0 of 28 tables** (`respaldo.ts` reads 4 tables, export-only). Feasibility depends on the tenant subgraph being closed — **all 22 non-`gym` FKs are single-column, FK checks bypass RLS, and nothing prevents a cross-gym reference.** It is closed today (verified, 13 edges, 0 rows) by luck. Compounding: `supabase db dump` omits `auth` by default, and three tenant tables FK into `auth.users`.
**Breaks at:** the first customer who deletes their roster and asks for it back — possible at **gym #5**. Not a scale trigger; a calendar one.

**4. No blast-radius control and no per-tenant lever of any kind.**
One bad policy, one bad migration, one leaked `service_role` key, one saturating query, one vendor outage — each is all-3,000-at-once. There is no canary deploy (one migration target is a strength *and* this weakness), no way to throttle a noisy tenant, no way to move one, no way to shed load. Postgres offers no per-tenant resource governor. Every alternative except B improves this; D improves it 12× for $2,660/mo with no application changes.
**Breaks at:** not a row count — it breaks the first time an incident needs a per-tenant response, which the model cannot express.

**5. Onboarding a tenant has no product surface — it is hand-written SQL against production.**
`grep` over all 87 migrations: every `insert into public.gym_membership` in a live RPC writes `role = 'member'` (the claim path). The only `owner` insert and the only `insert into public.gym` are seeds inside migrations. **No code path creates a gym or an owner.** At 3,000 gyms × 30 min that is ~1,500 founder-hours of production write access. Fairly: this is not a property of model A — it would be identical under D — but it is a property of *the incumbent as built*, and it is the one that stops the business before any of the above.
**Breaks at:** a sales rate above ~2 gyms/day, or the first gym onboarded while the founder is asleep.

---

## 9. Where I contradict prior work

**1. The orchestrator's warning about ADR-0013 is stale.** The brief states ADR-0013 §2/§3 "asserts the gym RLS helper is O(1)-per-statement and forbids changing it. BOTH HALVES ARE FALSE… That ADR exists to tell reviewers to delete the correct fix." **The ADR was corrected in place on 2026-07-13** and carries the correction inline as a block quote, and the fix shipped as `supabase/migrations/20260714080000_rls_uncorrelated_predicates.sql`. Its "What a future reader must not undo" section now says the opposite of the warning: *"Never delete a reader's `.eq("gym_id", …)` as 'redundant with RLS'"*. The repo already knows. It just hasn't finished implementing what it knows.

**2. The prior audit's C3 is half wrong.** It claims the `gym_membership` OR'd policies mean "cost stays O(platform), not O(tenant)" and rates it "the hardest technical ceiling in the architecture", binding at 65–330 gyms. **In the common path — `gym_membership` read *inside* another table's RLS subquery — the planner does form an index cond**, because the outer policy body supplies `m.user_id = auth.uid()` as a top-level qual:
```
->  Index Scan using gym_membership_pkey on public.gym_membership m
      Index Cond: (m.user_id = (InitPlan 1).col1)
      Filter: ((SubPlan 2) OR (m.user_id = (InitPlan 3).col1))
```
The OR degrades to a filter over 1–3 rows. C3 is real **only for the three bare call sites** that read `gym_membership` with no `user_id` qual (`gym.ts:49-55`, `agenda-miembro.ts:147-150`, `agenda-miembro.ts:172`), which `pg_stat_statements` confirms run at 0.69–0.72 ms. That is a **medium**, not "the hardest technical ceiling". The genuinely hardest ceiling is #1/#2 above, which the panel did not identify.

**3. The prior audit ranked per-tenant restore #11 of 17.** On the evidence here it is a top-3 property of the model and the single axis where alternatives beat the incumbent decisively. It also never priced the alternative: it recommended "build a per-`gym_id` logical extract/reimport" without noting that schema-per-tenant makes that a one-liner and that database-per-tenant's per-project PITR would cost $300,000/mo.

**4. "$0.53–1.04/gym/mo" is a full-stack number and is broadly right, but it hides the structural point.** The database *layer* at 3,000 gyms is $0.36/gym under A and $1.25/gym under D. The choice between them costs **$2,660/mo — under 1% of revenue at the 300 MXN floor.** Cost is not a reason to stay on A; migration ergonomics is.

---

## 10. Blind spots — what I did NOT examine

1. **I did not benchmark at scale.** Every extrapolation runs from a 15 MB / 4-gym / 705-attendance database. I have no measurement above ~700 rows on any table. The gym counts in §3 and §7 carry roughly ±2× uncertainty. A seeded 500-gym scratch project would settle every number in this document and nothing else will.
2. **PostgREST schema-cache cost vs relation count is asserted, not measured.** It is B's disqualifier and it rests on a documented mechanism with no published magnitude. If someone benches PostgREST against 500k relations and it reloads in seconds, option B's ranking rises materially.
3. **Relcache per-entry size (3–10 kB) is from Postgres internals knowledge, not measured.** It drives B's memory ceiling.
4. **I did not verify Supabase's actual `shared_buffers` fraction per compute tier**, only the live 224 MB on entry-tier. T3's thresholds move with it.
5. **I did not fetch Notion's own engineering post** — the "480 shards / 32 instances" figure is second-hand from a search summary. Treat as indicative.
6. **I did not price non-Supabase substrates** — Neon (branch-per-tenant, autoscale-to-zero, which is a genuinely different answer to per-tenant restore), RDS/Aurora with 3,000 databases, or Nile (built expressly for tenant-per-row-with-virtual-isolation). If per-tenant PITR is truly a requirement, Neon's copy-on-write branching is the option this audit never evaluated and probably should have.
7. **I did not evaluate table partitioning** (`PARTITION BY LIST (gym_id)` or hash) as a middle path between A and D. Zero tables are partitioned today. Partitioning by `gym_id` hash would give partition pruning **only when `gym_id` is in the qual** — i.e. it has the same dependency on the `.eq()` convention, which is why I deprioritised it — but partitioning by `fecha`/`starts_at` would bound the scan cost of the *unscoped* reads by time window and is a genuine partial mitigation I did not cost out.
8. **I did not examine the 41 `.rpc(` call sites' internal gym scoping** beyond `mi_membresia`, `staff_gym`, `is_staff_of`, `has_role`, `is_member_of`. 34 `public` functions exist; 25 write. The multi-gym RPC scoping memo covers some of this; I did not re-derive it.
9. **I did not examine write-path contention** — `gym_folio_counter` is one row per gym and every `registrar_venta` touches it. At 3,000 gyms × 2,700 sales/yr that is 8.1M row-level lock acquisitions/yr, but they are per-gym so contention should be per-tenant. Unverified.
10. **I did not consider regulatory data-residency** as a tenancy driver. Mexico (LFPDPPP), Brazil (LGPD) and Colombia (Ley 1581) do not currently mandate in-country storage, but if any customer contract does, models C/D/E become mandatory regardless of every number here.
11. **Statement timeout is 120 s** (`statement_timeout = 120000`). Under A, an unscoped scan that exceeds it fails the request rather than degrading. I did not model when any query approaches that.
