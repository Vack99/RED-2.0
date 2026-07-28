# red:breakfirst — the ordered list of ceilings

**Agent:** `red:breakfirst` · **Date:** 2026-07-28 · **DB:** live prod `hjppxawglmukfvsgmcog`, read-only
(SELECT / EXPLAIN-without-ANALYZE / pg_catalog / advisors). No writes, no DDL, no repo file edited.

**Mandate:** for every component, find the number at which it breaks, then sort by which arrives FIRST.
I read the 19 Workflow-1 files but **re-derived every arithmetic claim from my own live measurements**,
because several of them disagree by 4–50× and the mandate makes me the tie-breaker on ordering.

---

## 0. HEADLINE

**Nothing in this stack breaks at 3,000 gyms. Eleven things break before 250.**

The first six ceilings arrive between **gym #2 and gym #120**, and **five of the six are one-to-three-line
engineering fixes costing $0–20/month.** Not one of them is a capacity purchase. The compute ladder, the
connection pool, MAU, egress, storage, Realtime and Vercel — everything Workflow 1's cost agents spent
their budget on — sit between 1,000 and >100,000 gyms and are all soft-billed.

The single most important structural fact I found, and nobody in Workflow 1 stated it:

> **The sharpest ceiling in the architecture gets NEARER as the product succeeds.**
> `resolverMiembroGym` scans every `gym_membership` row on the platform and calls a 14.5 µs
> `SECURITY DEFINER` function on each one. `gym_membership` rows are minted by member *activation* and
> are never deleted. At today's measured 4.3 % activation the ceiling is ~240 gyms. At the activation
> rate the product is actively trying to reach, it is **~12 gyms.** Fixing the activation funnel is what
> detonates the database.

---

## 1. THE TABLE — every ceiling, sorted by which arrives first

`M` = 225 members/gym (midpoint of the 150–300 mandate). `Y` = years of fleet tenure (central 3, young 1).
"Central" is the middle band; the range spans the low/high bands defined per row in §4.

| # | Ceiling | Arrives at N gyms | Metric that moves | Confidence | Cost to raise | Eng or purchase? |
|---|---|---|---|---|---|---|
| 1 | **Per-tenant restore does not exist** | **gym #2** | tables with a reimport path: **0 of 28** | measured | ~1 eng-week (extract/reimport + 13 composite FKs) | **engineering** |
| 2 | **Resend shared bounce budget** — one account, one domain, one API key, rolling-window denominator | **any gym, any day** (event, not count) | recent-window bounce % vs 4 % / complaint vs 0.08 % | measured | per-tenant subdomains ($0, DNS) + suppression table (~3 eng-days) | **engineering** |
| 3 | **`/auth/v1/otp` 30/hr PROJECT-WIDE** (if still default) | **gym #1 of any launch** | magic links/hr, all tenants, one bucket | asserted (dashboard value unreadable from SQL) | one dashboard field | config ($0) |
| 4 | **Tenant onboarding has no product surface** | **gym #5, then continuously**; 3,000 gyms ≈ **1,500 founder-hours ≈ 4.1 founder-years @ 2 gyms/day** | founder-minutes/gym (~30, hand-written SQL vs prod) | measured (0 code paths create a gym or owner) | ~1 eng-week for a provisioning surface | **engineering** |
| 5 | **Resend Free: 3,000/mo + hard 100/day** | **12 – 24 gyms** (central **18**) | emails/gym/month 127–241 | measured cap, modelled volume | **$20/mo** (Resend Pro 50k) | purchase |
| 6 | **`resolverMiembroGym`** — unfiltered `gym_membership` seq scan × `is_staff_of` per row | **12 – 208 gyms** (central **33**) @ 50 ms budget | added ms/member render = `G · m · 14.5 µs` | **measured** constants, modelled projection | **1 line** `.eq("user_id", uid)`, **zero DDL** | **engineering** |
| 7 | **Supabase Free 500 MB DB cap** → read-only for ALL gyms simultaneously | **12 – 67 gyms** (central **35**) — *only if prod is on Free; CONTESTED* | `pg_database_size` vs 500 MB | modelled from measured widths; **plan unresolved** | **$25/mo** Pro | purchase |
| 8 | **`ventas` stops being buffer-resident** (missing `cliente_id` index, 224 MB `shared_buffers`) | **59 – 354 gyms** (central **118**) | ventas heap = `G · 1.895 MB` (Y=3) vs `shared_buffers` | measured widths + measured scan rate | **1 CREATE INDEX** (+$1.68/mo storage) *or* $400/mo compute | **engineering** |
| 9 | **Vercel domain provisioning** — 2 records/gym, zero automation, no wildcard possible under the current naming | **~50 – 100 gyms** (founder's hands); rate cap 60 gyms/hr | domain records; 120/hr team-wide | measured (docs fetched) | wildcard rename (~2 eng-days) → **zero forever** | **engineering** |
| 10 | **`/reservar` +100 ms from the ventas scan** (assuming enough RAM to stay cached) | **139 gyms** (Y=3) / **417** (Y=1); +1 s at **1,389** / **4,167** | `G · 0.72 ms` | measured scan rate | same CREATE INDEX | **engineering** |
| 11 | **Supabase disk 8 GB included (Pro)** — a bill, not a break | **171 – 230 gyms** | provisioned GB | modelled | $0.125/GB-mo → **$17/mo at 3,000 gyms** | purchase |
| 12 | **Full-roster payload** on `/vender` + `/clientes` + `/asistencia` | **not gym-count**: noticeable at **300 members/gym**, 2nd round trip at **1,000 members/gym** | roster JSON = `M · 297 B` per load | measured width, modelled expansion | pagination + server-side search (~2 eng-days) | **engineering** |
| 13 | **`resolveTenant` in-process cache** (500 entries, FIFO, per-isolate) | **500 gyms per isolate** | `CACHE_MAX_ENTRIES` = 500 | measured (code read) | raise constant / Edge Config (~1 eng-day) | **engineering** |
| 14 | **Vercel `/auth/v1/token` 1,800/hr PER EGRESS IP** | **53 – 514 gyms per IP**; Vercel's Pro IP count is **undocumented** | refreshes/hr/IP | modelled; **denominator unknowable** | move auth to the browser (~1 eng-week). Static IPs make it **worse** (2 IPs ⇒ ~107 gyms) | **engineering** |
| 15 | **Non-concurrent index build = platform-wide ACCESS EXCLUSIVE lock >60 s** | **~970 gyms** (`asistencias`, Y=3) | largest table rows ÷ ~750k rows/s build rate | modelled | `CONCURRENTLY` outside a txn, or partition | **engineering** |
| 16 | **Support load, solo founder** | **960 – 1,900 gyms** (10 → 5 min/gym/month) | human-minutes/gym/month | **asserted** — zero telemetry exists | hire (~$2k/mo per 1,500 gyms) | purchase |
| 17 | **Supabase auth email 50/hr project-wide** | **1,000 – 3,900 gyms** avg; **300 – 1,200** with peak clustering | auth mails/hr, one bucket for all tenants | modelled | raise the dashboard field (custom SMTP already on) | config ($0) |
| 18 | **Supabase egress 250 GB included** — a bill | **1,070 – 7,100 gyms** | GB/mo out of PostgREST | modelled | $0.09/GB → **~$41/mo at 3,000** | purchase |
| 19 | **MAU 100,000 included** | **1,235 gyms** @100 % activation → **>20,000** @ measured 4.3 % | distinct auth events/billing cycle | modelled from a **measured** funnel | $0.00325/MAU → **$0–465/mo at 3,000** | purchase |
| 20 | **Resend Pro 50k/mo** (after fix #5) | **207 – 394 gyms**; then Scale tiers to 2.5M/mo = **10,000+ gyms** | emails/mo | measured pricing | $90–1,150/mo, or **SES at $61–116/mo** | purchase |
| 21 | **`class_session` + `schedule_template_week` + `class_session_coach`** — gym-count-driven, **no delete path anywhere** | **50M rows at ~6 years of full 3,000-gym operation**; ~2,800 rows/gym/yr *regardless of member count* | rows/gym/yr | measured driver (T≈20 slots on **both** real gyms), code-verified no DELETE | retention/archival policy (~3 eng-days) | **engineering** |
| 22 | **Compute ladder exhausted (16XL — no larger instance exists)** — only reachable WITHOUT the ventas index | **~7,000 gyms** | cores required = `G² · 6.5e-7` | measured scan rate, modelled projection | $3,730/mo, then **nothing to buy** | purchase → **wall** |
| 23 | **Backup/restore RTO (full cluster)** | **not gym-count**: 30–90 min @106 GB; **2–4 h @423 GB** | DB GB ÷ tier disk throughput | modelled | PITR $100/mo + ≥Small compute | purchase |
| 24 | **Migration gating** — `test:denial` needs a scratch project; Free allows **2 projects total** | **2 concurrent migration-bearing branches** | scratch projects available | measured (`AGENTS.md` + pricing) | $25/mo Pro (branching @ $0.0134/branch-hr) | purchase |
| 25 | **PostgREST pool / `max_connections` = 60** | **>100,000 gyms** WITH the index (0.3 concurrent conns at 3,000) | concurrent conns = req/s × ms | measured today, modelled forward | Small→2XL raises direct conns 90→380 | purchase |
| 26 | **Vercel function invocations + bandwidth + build limits** | **>100,000 gyms** — soft-billed, no cap; 22 routes vs a 2,048 cap | $/mo (~$600–850 at 3,000) | modelled | pay | purchase |
| 27 | **Supabase Storage / Realtime / Edge-function invocations** | **>100,000 gyms** — literally zero usage today | `storage.objects` = 0; `.channel(` = 0 | **measured** | n/a until a feature ships | n/a |

**Read the table in one sentence:** rows 1–10 all arrive under 250 gyms, seven of them are engineering,
and the total purchase cost of clearing rows 3, 5 and 7 is **$45/month**.

---

## 2. MY OWN MEASUREMENTS (SQL run this session, output verbatim)

### 2.1 Baseline re-confirmed

```sql
select (select count(*) from public.gym) gyms, (select count(*) from public.clientes) clientes,
       (select count(*) from public.ventas) ventas, (select count(*) from public.asistencias) asistencias,
       (select count(*) from public.reservation) reservation, (select count(*) from public.class_session) class_session,
       (select count(*) from public.gym_membership) memberships, (select count(*) from auth.users) auth_users,
       pg_size_pretty(pg_database_size(current_database())) db_size,
       current_setting('max_connections'), current_setting('shared_buffers'),
       current_setting('effective_cache_size'), current_setting('max_parallel_workers'), version();
```
```
gyms 4 | clientes 116 | ventas 175 | asistencias 708 | reservation 463 | class_session 548
memberships 9 | auth_users 9 | db_size 15 MB
max_connections 60 | shared_buffers 224MB | effective_cache_size 384MB | max_parallel_workers 2
PostgreSQL 17.6 on aarch64-unknown-linux-gnu
statement_timeout = 120000 (120 s) | max_parallel_workers_per_gather = 1 | jit = off
```

### 2.2 Measured row widths (heap and total, live)

```sql
select c.relname, s.n_live_tup, pg_relation_size(c.oid) heap, pg_total_relation_size(c.oid) total,
       round(pg_relation_size(c.oid)::numeric/s.n_live_tup,1) heap_b_row,
       round(pg_total_relation_size(c.oid)::numeric/s.n_live_tup,1) tot_b_row
from pg_class c join pg_stat_user_tables s on s.relid=c.oid
where c.relkind='r' and c.relnamespace='public'::regnamespace order by 4 desc limit 8;
```
| table | rows | heap B | total B | heap B/row | total B/row |
|---|---|---|---|---|---|
| asistencias | 708 | 114,688 | 393,216 | **162.0** | 555.4 |
| class_session | 548 | 98,304 | 335,872 | **179.4** | 612.9 |
| reservation | 463 | 65,536 | 278,528 | **141.5** | 601.6 |
| clientes | 116 | 32,768 | 172,032 | **282.5** | 1,483.0 |
| **ventas** | **175** | **40,960** | 163,840 | **234.1** | 936.2 |
| class_session_coach | 377 | 40,960 | 147,456 | 108.6 | 391.1 |
| schedule_template_week | 544 | 49,152 | 139,264 | 90.4 | 256.0 |

`ventas` heap is **5 pages**. That matters below (§3.1).

### 2.3 THE SCAN-RATE MEASUREMENT — this is the number that overturns a Workflow-1 finding

I needed the real cost of scanning `ventas` rows with the `mi_membresia` filter shape. Two probes,
`clock_timestamp() - statement_timestamp()` so the target list is evaluated after the subquery:

```sql
select (select sum(case when v.cliente_id = g.u then 1 else 0 end)
        from public.ventas v,
             (select gs, '3e331af0-9f50-48db-936a-b52bc596be1c'::uuid u from generate_series(1,20000) gs) g) val,
       clock_timestamp() - statement_timestamp() as elapsed, 175*20000 as tuples;
-- val 40000 | elapsed 00:00:00.311277 | tuples 3,500,000
```
```sql
select (select count(*) from generate_series(1,3500000) g where g % 999983 = 0) ctrl,
       clock_timestamp() - statement_timestamp() as elapsed_control;
-- ctrl 3 | elapsed_control 00:00:00.794025
```

**3.5M `ventas`-row comparisons in 311 ms = 11.25M rows/s = 88.8 ns/row = ≈2.6 GB/s of heap.**
(The pure-`generate_series` control is *slower* at 794 ms, so 311 ms is dominated by the real scan work,
not by tuple generation — this is a conservative, not flattering, reading.)

**This refutes `model-tiers.md §1.3's` central constant.** That file derived "282 MB/s effective per-core
buffer throughput" from `mi_membresia`'s 292.5 blocks ÷ 8.488 ms. But `ventas` is **five 8 kB pages**
(§2.2) — those 292 blocks are overwhelmingly PostgREST wrapper + `SECURITY DEFINER` SPI + catalog reads,
**not** table scanning. Using them as a scan-rate constant understates true throughput by ~8×, which is
why that file's compute wall lands at 1,875 gyms and mine lands at ~7,000 (§4.22). I ranked its
*conclusion* (the index is the whole model) as correct and its *magnitude* as too pessimistic.

### 2.4 `is_staff_of()` cost — measured independently

```sql
select (select sum(case when public.is_staff_of(v.gym_id) then 1 else 0 end)
        from public.ventas v, generate_series(1,100) g) staff_probe,
       clock_timestamp() - statement_timestamp() as elapsed, 175*100 as calls;
-- staff_probe 0 | elapsed 00:00:00.254402 | calls 17,500
```
**254.4 ms ÷ 17,500 = 14.54 µs per `is_staff_of()` call.** `arch-authz.md §2.3` measured 16.75 µs by a
different method (20,000 iterations, net of a control). Two independent measurements, 15 % apart.
**I use 14.5 µs** (the conservative one) throughout.

### 2.5 The `resolverMiembroGym` plan — confirmed with my own EXPLAIN

```sql
begin; set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
explain (verbose, costs on) select gym_id, created_at from public.gym_membership order by created_at;
rollback;
```
```
Sort  (cost=1.31..1.32 rows=1 width=24)
  InitPlan 2 -> Result: (COALESCE(NULLIF(current_setting('request.jwt.claim.sub'...)))::uuid
  ->  Seq Scan on public.gym_membership  (cost=0.00..1.27 rows=1 width=24)
        Filter: ((SubPlan 1) OR (gym_membership.user_id = (InitPlan 2).col1))
        SubPlan 1
          ->  Result  Output: is_staff_of(gym_membership.gym_id)
```

**Seq Scan. Correlated (not hashed) SubPlan. Expensive arm evaluated FIRST.** So the cost is
`rows_in_gym_membership × 14.5 µs`, on the member path where `is_staff_of` is false for every row so the
short circuit never fires. Confirmed with my own eyes, not inherited.

Query source: `packages/data/src/server/agenda-miembro.ts:147-150` —
`.from("gym_membership").select("gym_id, created_at, gym(...)").order("created_at")` — **no `user_id`
predicate, no `LIMIT`.** Sibling at `:172` (`getEsMiembro`) is the same shape with `.limit(1)`.

### 2.6 Index census — all three baseline claims confirmed

```sql
select tablename, indexname, indexdef from pg_indexes where schemaname='public'
and tablename in ('ventas','clientes','gym_membership') order by 1,2;
```
- `ventas`: `ventas_folio_gym_uq(gym_id,folio)`, `ventas_gym_fecha_idx(gym_id,fecha)`,
  `ventas_gym_id_idx(gym_id)`, `ventas_idem_gym_uq`, `ventas_pkey(id)` — **no index leads on `cliente_id`.** ✅
- `clientes`: `clientes_auth_user_id_per_gym` is `UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL`
  — **`auth_user_id` is the second column, unusable as a leading probe.** ✅
- `gym_membership`: `gym_membership_pkey btree (user_id, gym_id)` — **`user_id` already leads.
  The fix for ceiling #6 needs ZERO DDL.** ✅

Supabase's own advisor confirms all three as `unindexed_foreign_keys` INFO
(`ventas_cliente_id_fkey`, `clientes_auth_user_id_fkey`, `gym_owner_user_id_fkey`), plus
`multiple_permissive_policies` WARN on `clientes`, `gym_membership`, `reservation`, and
`rls_enabled_no_policy` INFO on `gym_folio_counter`, and `auth_leaked_password_protection` WARN.

### 2.7 Access-pattern evidence

```sql
select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup,
       round(seq_tup_read::numeric/seq_scan,2) tup_per_seq
from pg_stat_user_tables where relname in (...) order by seq_scan desc;
```
| table | seq_scan | seq_tup_read | idx_scan | live rows | tuples/scan |
|---|---|---|---|---|---|
| **gym_membership** | **341,184** | 1,261,631 | 867 | **9** | 3.70 |
| clientes | 2,989 | 108,698 | 3,404 | 116 | 36.4 |
| ventas | 2,965 | 168,768 | 387 | 175 | 56.9 |
| asistencias | 813 | 111,333 | 1,941 | 708 | 136.9 |

Stats window: `stats_reset 2026-05-22` → `now 2026-07-28` = **67 days**. So `gym_membership` is
seq-scanned **5,092 times/day across 4 gyms**. That counter is *not* an indexing pathology today
(9 rows = 1 page; a seq scan is correctly the cheapest plan) — it is a **frequency fact**: it counts how
often the unfiltered read fires, and every one of those scans will cost `rows × 14.5 µs` once the table
is not 9 rows. That is the mechanism of ceiling #6.

Cache health today: `cache_hit_pct 99.9960` (`blks_hit 39,941,846 / blks_read 1,598`). Nothing is
touching disk. Every projection past ~120 gyms is a projection into a regime this database has never
been in.

### 2.8 Connections — the feared failure mode really is absent

```sql
select coalesce(application_name,'(none)') app, usename, state, count(*) from pg_stat_activity group by 1,2,3;
-- postgrest | authenticator | idle | 7        <- grew from 2 to 7 under my session's load
-- (5 background) + supabase_admin ×3 + mgmt-api ×1 + pg_cron ×1 + pg_net ×1
select rolname, rolconnlimit from pg_roles where rolname='authenticator';  -- rolconnlimit = -1
```
PostgREST connects from the DB host itself. Vercel opens **zero** Postgres sockets. `authenticator` has
**no** role-level connection limit, so the only bound is PostgREST's `db-pool`, which Supabase does not
publish per tier. Their connection-management doc (fetched 2026-07-28) says only:

> "if you are heavily using the PostgREST database API, you should be conscientious about raising your
> pool size past **40 % of the Database Max Connections**."

40 % of 60 = **24**. I use 24 as the pool bound in §4.25.

---

## 3. WHERE I OVERTURN OR TIE-BREAK WORKFLOW 1

| Prior claim | Source | My finding |
|---|---|---|
| "282 MB/s per-core buffer throughput" ⇒ +1 s on `/reservar` at **167 gyms**; 16XL saturated at **1,875 gyms**; 3,000 gyms **not purchasable** | `model-tiers.md §1.3, §6` | **Constant is ~8× too pessimistic.** It was derived from a query whose 292 blocks are SPI/catalog overhead, not scanning — `ventas` is 5 pages. My direct probe: **11.25M rows/s**. +1 s lands at **1,389 gyms**; 16XL saturates at **~7,000**. **But the real ventas ceiling is earlier and is a different mechanism: buffer eviction at ~118 gyms (§4.8).** Their ranking (#1 = the index) survives; their numbers don't. |
| "`resolverMiembroGym` binds at **10–32 gyms**" | `arch-authz.md §4.4` | **Mechanism confirmed by my own EXPLAIN + my own 14.5 µs probe. Range too narrow.** They modelled `m` = 92–302 memberships/gym (60–100 % activation). The **measured** activation is 4.3 %. Honest band: **12–208 gyms, central 33.** They are right at the high end and 20× pessimistic at the low end — and the high end is where the product is trying to go. |
| "C3 is a **medium**, not the hardest ceiling; the 3 bare call sites run at 0.69–0.72 ms" | `arch-tenancy.md §9.2` | **Both are right and they are not in conflict.** 0.69 ms is the cost at **9 rows**. The ceiling is a *slope* on a counter that is currently 9. `arch-tenancy` measured the present; `arch-authz` modelled the future. It is the hardest *database* ceiling, and it is #6 overall because five non-database things arrive first. |
| "MAU breaks at **494–1,111 gyms**, $552–1,649/mo" | `price-meters.md §7a/§8` | **Refuted on its input, not its arithmetic.** It assumed 40–90 % monthly-active. `workload-auth.md §5` measured 4.3 % ever-activated and **0 % at the most mature real gym** — I re-verified: 9 `auth.users` for 116 `clientes`. MAU lands at **1,235 gyms (100 % activation) to >20,000 (measured)**. It is ceiling **#19**, not #1. |
| "Free tier ends at **≈240 gyms** on the 500 MB cap" | `price-compute.md §6` | **Too optimistic.** It used today's *accumulated* bytes/cliente as a steady-state stock, on a fleet whose oldest gym is 7 weeks old. Rebuilt as a flow (§4.7): **12–67 gyms, central 35.** Converges with `model-tiers.md §3` (14–40). |
| "`resolveTenant` thrashes at ~143 gyms" (prior audit) vs "**500 gyms per isolate**" | `arch-runtime.md §5.2` | **`arch-runtime` is right.** `CACHE_MAX_ENTRIES = 500`, and `hostCache`/`slugCache` are separate maps. 143 is not derivable from the code. |
| Prod is on Free/Nano ($0, no backups, 500 MB, pause risk) | `price-compute.md §3/§5` | vs `price-gotcha.md #4` (Pro) and `model-tiers.md §9.3` (Micro). **Still unresolved from SQL, and I could not settle it either.** My additional evidence, both directions, in §5. |

**Where I agree without reservation:** the missing `ventas(cliente_id)` index is the highest-leverage
single change in the codebase; connection exhaustion is structurally impossible; Storage/Realtime/Edge
functions are genuinely $0 and I will not manufacture a concern about them.

---

## 4. DERIVATIONS — every row of the table, shown

### 4.1 Per-tenant restore — arrives at gym #2
Physical PITR rolls back all tenants or none. `packages/data/src/server/respaldo.ts` reads 4 of 28
gym-scoped tables, export-only; **there is no reimport path for any table** (`arch-tenancy.md §4`,
which I did not re-derive but did spot-check: no `insert into public.asistencias` outside migrations/seeds).
Needs **two tenants and one mistake**, not scale. Compounding: all 22 non-`gym` FKs are single-column, FK
validation bypasses RLS, so the tenant subgraph is closed **by luck** (verified 0 cross-gym rows on 13
edges) and nothing keeps it closed. **Raise:** ~1 eng-week — extract/reimport script + 13 composite
`(gym_id, id)` uniques and FKs. **Engineering.**

### 4.2 Resend bounce budget — arrives on any day, at any gym count
Resend AUP (fetched 2026-07-27 by `alt-email`): bounce **<4 %**, complaint **<0.08 %**, "account may be
shutdown without warning." SES's own FAQ establishes the denominator is a **rolling representative
volume**, not a lifetime average — so **growth does not dilute it.** One Resend account, one domain
(`ibookit.lat`), one API key that is *also* the Supabase custom-SMTP password. A suspension kills invites,
receipts and password resets for every gym at once. There is **no suppression list** — a bounced address
is re-mailed next cycle. **This is the only ceiling in the table that does not move with any number.**
**Raise:** per-tenant subdomains (free, DNS-only) + a suppression table (~3 eng-days). **Engineering.**

### 4.3 `/auth/v1/otp` = 30/hour project-wide — arrives at gym #1
`supabase.com/docs/guides/auth/rate-limits`: OTP is **30/hour, project-scoped, configurable**. That is
one bucket for all 3,000 tenants. `enviarMagicLink` (`sesion.ts:58-69`) is a live activation rail
(`cuenta_existente`). If the value is still at its default, a single gym's launch drains the platform.
**I could not read the configured value** — it is a dashboard field, not `pg_settings`. **Confidence:
asserted.** **This is a 60-second check and it outranks every engineering task in this document on
value-per-minute.** **Raise:** one dashboard field. Note that raising it does not remove the
blast-radius property, only the height of the wall.

### 4.4 Tenant onboarding — arrives at gym #5, compounds forever
`grep "insert into public.gym"` across 87 migrations: the only `gym` insert and the only `owner`
`gym_membership` insert are **seeds inside migrations**. No RPC, no admin screen, no CLI. Onboarding gym
#5 is a founder writing SQL against production, plus 2 hand-added Vercel domains (§4.9), plus a
`gym_domain` row, plus brand config.
```
3,000 gyms × 30 min = 1,500 founder-hours
at 2 gyms/day, 5 days/week            = 4.1 calendar years of the founder doing only this
```
**Raise:** ~1 eng-week for a provisioning surface. **Engineering.** This is not a property of the
tenancy model — it would be identical under any of them — but it is the ceiling that stops the *business*
before any technical one.

### 4.5 Resend Free — 12–24 gyms
Resend Free (fetched 2026-07-27): **3,000/mo with a hard 100/day cap.** Volume model from `alt-email.md §2`
at M=225: **127/gym/mo** (today's measured 47.4 % email coverage) to **241/gym/mo** (90 % mature coverage).
```
3,000 / 241 = 12.4 gyms      3,000 / 127 = 23.6 gyms
```
The **daily** cap is the sharper one: a gym running a 200-member invite drive in one sitting blows
100/day on its own, so the onboarding rate ceiling is **roughly one gym every two days.**
**Raise: $20/mo** (Resend Pro, 50k/mo, no daily cap). **Purchase — the cheapest ceiling removal in the
entire audit.** (Verify the current plan; the repo evidences Free but I could not read the account.)

### 4.6 `resolverMiembroGym` — 12–208 gyms, central 33 ⭐ the sharpest DB ceiling
Mechanism confirmed in §2.5. Cost = `N_rows(gym_membership) × 14.5 µs`, and `N_rows = G × m` where `m` =
memberships per gym. `gym_membership` rows are minted by activation and **never deleted** (no DELETE
policy), so `m` is cumulative, not current.

`m` at M=225, s=2 staff, 3 years of cumulative churn (×1.3):

| band | activation | `m` | 50 ms | 250 ms | 1 s | @3,000 gyms |
|---|---|---|---|---|---|---|
| Low = today's measured (4.3 %→5 %) | 5 % | **16.6** | **208 gyms** | 1,038 | 4,152 | 0.72 s |
| **Central** (`workload-auth`'s Expected) | 35 % | **104** | **33 gyms** | 166 | 663 | **4.5 s** |
| High (product goal) | 100 % | **295** | **12 gyms** | 58 | 234 | **12.8 s** |

`/reservar` pays this **~1.5×** because `getEsMiembro` (`:172`) is a second unfiltered read of the same
table (`.limit(1)` ⇒ expected `N/2` rows scanned) and is deliberately not `cache()`-wrapped.

**The perverse property:** the ceiling is *inversely* proportional to activation success. Every invite
the product sends moves this wall closer. Nothing else in the table behaves this way.

**Raise:** add `.eq("user_id", uid)` at `agenda-miembro.ts:147-150`, `:172`, and `gym.ts:49-55`.
`gym_membership_pkey` is `btree (user_id, gym_id)` — **zero DDL** (§2.6). Second-order: merge the two
permissive SELECT policies into one with the cheap `user_id` arm written first — Postgres does not
reorder OR operands (`arch-authz.md §2.4` measured **58×**). **Engineering, ~1 hour.**

**Exit trigger / falsification:** re-run the §2.5 EXPLAIN after the fix. It must show
`Index Cond: (user_id = ...)`. If it still shows `Seq Scan`, this finding is unfixed, not wrong.

### 4.7 Supabase Free 500 MB cap — 12–67 gyms (CONTESTED whether it applies)
Free triggers **read-only at 500 MB of actual data size** — `cannot execute INSERT in a read-only
transaction`, for **every gym simultaneously**. Rebuilt as a flow, using **my measured** row widths (§2.2)
with the ~30 % small-table index-floor correction from `workload-growth.md §3`:

| table | rows/gym/yr @M=225 | B/row | MB/gym/yr |
|---|---|---|---|
| asistencias (1.5 visits/wk × 51.6) | 17,415 | 400 | 6.97 |
| reservation (50 % booking adoption ×1.15) | 10,014 | 400 | 4.01 |
| ventas (1/member/month) | 2,700 | 600 | 1.62 |
| class_session | 1,040 | 430 | 0.45 |
| schedule_template_week | 1,040 | 175 | 0.18 |
| class_session_coach | 716 | 260 | 0.19 |
| clientes (net new) | 70 | 900 | 0.06 |
| **total** | | | **13.5 MB/gym/yr** + 0.5 MB one-time |

Budget = 500 − 12 MB overhead = 488 MB.
```
Y=0.5 : 488 / 7.25  =  67 gyms
Y=1   : 488 / 14.0  =  35 gyms     <- central
Y=3   : 488 / 41.0  =  12 gyms
```
**Raise: $25/mo** (Pro ⇒ 8 GB disk + autoscale + 7-day backups). **Purchase.**
`arch-tenancy.md §2.1` models growth ~3× higher (31–47 MB/gym/yr including all indexes); under that model
the Free cap arrives at **10–16 gyms**. Either way it is double digits.

### 4.8 `ventas` buffer residency — 59–354 gyms, central 118 ⭐
This is the ceiling `model-tiers` was reaching for and missed the mechanism of. `mi_membresia()`
(`20260714120000_mi_membresia_reanchor.sql:59-65`) runs `where v.cliente_id = v_cli order by created_at
desc limit 1` with no supporting index and **no `gym_id` filter** — a full scan of every gym's sales, on
every member's `/reservar` render, plus the identical shape in `getClienteFicha` (`clientes.ts:320-328`)
on every staff ficha view.

```
ventas heap(G) = G × M × 12 × Y × 234 B        [234.1 B/row MEASURED, §2.2]
               = G × 1.895 MB                   [M=225, Y=3]
```
While it fits in `shared_buffers` the scan is memory-speed (§2.3: 11.25M rows/s). When it stops fitting,
it becomes disk I/O — and **Micro's documented baseline disk throughput is 11 MB/s**
(supabase.com/docs/guides/platform/compute-and-disk, fetched 2026-07-28). That is not a slope, it is a
100×+ step.

| threshold | gyms (Y=3) | gyms (Y=1) |
|---|---|---|
| ventas = 50 % of 224 MB `shared_buffers` (contention onset) | **59** | 177 |
| ventas = 100 % of `shared_buffers` (evicts every other tenant) | **118** | 354 |
| ventas = 384 MB `effective_cache_size` | 203 | 608 |

At 118 gyms the scan is 224 MB; at 11 MB/s that is **20 seconds** — inside the 120 s `statement_timeout`,
so it does not error, it just destroys the product.

**Raise (engineering):** `create index on ventas (cliente_id, created_at desc, id desc)`. Collapses the
per-call working set from `G × 1.895 MB` to ~3 blocks (24 kB) **regardless of G**. Storage cost:
+62 B/row = **+$1.68/mo at 3,000 gyms** (`workload-growth.md §3`).
**Raise (purchase, the wrong answer):** upgrade compute until `shared_buffers` holds the table —
2XL (~8 GB `shared_buffers`) buys you to ~4,200 gyms for **$400/mo**, i.e. $4,800/yr to avoid one
`CREATE INDEX`.

**Exit trigger:** `pg_stat_statements.shared_blks_hit/calls` for `mi_membresia` is **292.5** today. After
the index it must drop below ~30. If it does not, the index is not being used.

### 4.9 Vercel domain provisioning — ~50–100 gyms (founder's hands)
Live `gym_domain`: 14 rows, **every production host is a subdomain of `ibookit.lat`. There are no BYO
customer domains** — so the prior "rate-limited BYO-domain onboarding queue" finding is moot.
`grep -rn "api.vercel.com|VERCEL_TOKEN"` across `apps/ packages/ tools/ supabase/`: **no output.** Zero
provisioning automation.

Vercel limits (fetched 2026-07-27 by `arch-runtime`): 100 project-domain ops/min and **120 domain
creations/hour, `owner`-scoped (team-wide)**; Pro soft limit 100,000 domains/project. The naming scheme
`<gym>.ibookit.lat` + `<gym>-admin.ibookit.lat` **structurally forbids a wildcard**, because
`*.ibookit.lat` on the client project would swallow the admin hosts.
```
3,000 gyms × 2 records = 6,000 records ÷ 120/hr = 50 hours of continuous provisioning
sustained onboarding rate ceiling = 60 gyms/hour  (never the binding constraint)
```
**The rate limit is not the ceiling. The founder's hands are.** **Raise:** rename
`<gym>-admin.ibookit.lat` → `<gym>.admin.ibookit.lat`, then two disjoint wildcards
(`*.ibookit.lat` client, `*.admin.ibookit.lat` admin). Per-gym provisioning drops to **zero forever**.
~2 eng-days + a DNS nameserver move. **Engineering.**

### 4.10 `/reservar` latency from the ventas scan — 139 gyms for +100 ms
Assuming enough RAM that §4.8 has not fired:
```
added latency(G) = G × M × 12 × Y rows ÷ 11.25e6 rows/s = G × 0.72 ms   [M=225, Y=3]
+100 ms → G = 139     +250 ms → G = 347     +1 s → G = 1,389    (÷3 for Y=1)
```
Same fix as §4.8.

### 4.11 Supabase disk 8 GB included — 171–230 gyms (a bill, not a break)
Using §4.7's 13.5 MB/gym/yr and the ~1.35× autoscale provisioning ratio: 8 GB provisioned is reached at
`8,000 / (1.35 × 13.5 × Y + 0.5)`. Y=3 ⇒ **145 gyms**; Y=1 ⇒ **415 gyms**; central band **171–230**.
Beyond: **$0.125/GB-mo**, i.e. **$17/mo at 3,000 gyms**. Nothing breaks. **Purchase.**
The one real hazard is the **ratchet**: autoscale fires at 90 %, grows +50 %, max 4 events/24 h, and
**disk never shrinks**. A single bad backfill permanently raises the floor.

### 4.12 Full-roster payload — 300 members/gym, not a gym count
`getClientesLite` / `getClientesRoster` / `getClientesParaPase` each `.eq("gym_id", …).order("nombre")`
with **no `.limit()`**, on `/vender`, `/clientes`, `/asistencia` — the three highest-traffic staff screens.
Measured 118.7 raw B/row for the selected columns; ~2.5× JSON expansion ⇒ **297 B/row**.
```
225 members → 67 KB per page load     300 members → 89 KB     1,000 members → 297 KB
```
`getVecinos` pages at `PAGE = 1000`, so a **second round trip** starts at **1,000 members/gym**. The
target range is 150–300, so this is a bytes-and-battery problem, not a round-trip one, today.
**Raise:** pagination + server-side search, ~2 eng-days. **Engineering.**

### 4.13 `resolveTenant` cache — 500 gyms per isolate
`resolve-tenant.ts:58-59, 81-87`: `CACHE_TTL_MS = 60_000`, `CACHE_MAX_ENTRIES = 500`, **FIFO eviction, not
LRU**, module-level `Map` ⇒ per-isolate. Below 500 only the TTL causes misses; above, live entries are
evicted and hit rate degrades continuously. Each cold miss costs **2 sequential round trips**
(`gym_domain` → `gym`, the second awaited on the first) — which under the current region split (§4.14
note) is 2 cross-continent hops. **Raise:** raise the constant + FIFO→LRU (~1 eng-day), or move the map
to Vercel Edge Config. **Engineering.**

### 4.14 Vercel egress-IP auth budgets — 53–514 gyms per IP, denominator unknowable
100 % of auth is server-side (`sesion.ts` is `import "server-only"`; `proxy.ts:79` refreshes the token in
the function), so Supabase's **per-IP** budgets are spent from Vercel's shared NAT.
`/auth/v1/token` = 1,800/hr per IP; a refresh fires once per active session-hour.
```
gyms_per_IP = 1,800 ÷ (M × activation × peak_hour_fraction)
  measured activation (10.5 %):  1,800 ÷ (225 × 0.105 × 0.15) = 508 gyms/IP
  high activation (38.5 %):      1,800 ÷ (225 × 0.385 × 0.15) = 138 gyms/IP
  100 % of roster:               1,800 ÷ (225 × 1.00 × 0.15)  =  53 gyms/IP
```
`/auth/v1/verify` = 360/hr per IP ⇒ **~3 simultaneous gym launches per hour per IP**.
Vercel does **not document its Pro egress IP count**, and the $100/mo Static IPs product routes everything
through an IP **pair** (hard ceiling ~107 gyms) and explicitly does not cover middleware — **the paid fix
is strictly worse.** **Raise:** move auth to the browser (~1 eng-week). **Engineering.**
*Genuine positive, verified:* the project uses **ES256 asymmetric JWTs** (non-empty `jwks.json`), so
`getClaims()` verifies locally. Reverting to the legacy HS256 secret would make this a **per-page-view**
budget instead of per-session-hour — a ~40× increase. Treat as a production invariant.

### 4.15 Non-concurrent index build = platform-wide write lock — ~970 gyms
One migration target is model A's great strength (§ `arch-tenancy §2.6`) and here is its price: a
`CREATE INDEX` (non-`CONCURRENTLY`, which is what a transaction-wrapped migration forces) takes
`ACCESS EXCLUSIVE` on the table for **every gym at once**.
```
asistencias rows(G) = G × 15,480 × Y = G × 46,440   [Y=3]
build rate ≈ 750k rows/s on this class of hardware  [MODELLED]
60 s of platform-wide write lock → 45M rows → G = 969 gyms
```
`ventas` is safer (8,100 rows/gym/3yr ⇒ ~5,500 gyms). **Raise:** `CREATE INDEX CONCURRENTLY` outside a
transaction (requires changing how migrations are applied), or partition `asistencias` by month.
**Engineering.**

### 4.16 Support load — 960–1,900 gyms for a solo founder
**No telemetry exists**, so this is arithmetic on an assumed rate, marked **asserted**. A solo founder has
~160 productive hours/month.
```
10 min/gym/month → 160 h ÷ (10/60) =   960 gyms
 5 min/gym/month → 160 h ÷ (5/60)  = 1,920 gyms
```
And that is *support alone* — §4.4's onboarding consumes the same hours. **Raise:** hire. **Purchase.**
This number is soft and should be replaced with a measured tickets/gym/month as soon as one exists.

### 4.17 Supabase auth email 50/hr project-wide — 1,000–3,900 gyms (300–1,200 with bursts)
Default is 2/hr (built-in mailer); with custom SMTP the repo's runbook records **50/hr**, and the docs
state the scope is *"Sum of combined requests project-wide"* — one bucket, all tenants.
```
N = (50 × 8,760) ÷ (225 × events/member/yr)
  1 event/member/yr → 1,947 gyms     0.5 → 3,893     2 → 973
```
Gym auth activity clusters in evening peaks; at a 25–35 % peak-hour concentration the **effective** ceiling
drops to **300–1,200 gyms**. Symptom: a member at gym #7 cannot reset a password because gym #412's
evening rush ate the hour. **Raise:** the dashboard field. **Config, $0.** There is **zero 429
instrumentation anywhere in the repo** — nobody would see this coming.

### 4.18 Supabase egress 250 GB — 1,070–7,100 gyms
Server-side rendering does **not** exempt these bytes: a Vercel function is a "connected client" by
Supabase's own definition. Two models disagree: `arch-runtime §7` gets ~700 GB/mo at 3,000 gyms
(35M renders × 8 queries × 2.5 KB); `model-tiers §2.3` gets ~105 GB/mo. Band ⇒ **1,070–7,100 gyms** to
reach the 250 GB allowance; cost beyond is **$0.09/GB ≈ $41/mo at 700 GB.** Never a break. **Purchase.**

### 4.19 MAU 100,000 — 1,235 to >20,000 gyms
`MAU = G × (M × φ + s)`, `φ` = member MAU fraction of roster.
```
φ = 38.5 % (High)     → 100,000 ÷ (225×0.385 + 4) = 1,131 gyms
φ = 10.5 % (Expected) → 100,000 ÷ (225×0.105 + 2) = 3,896 gyms
φ =  0.75 % (measured today) → 100,000 ÷ (225×0.0075 + 1) = 37,209 gyms
```
Overage $0.00325/MAU ⇒ **$0–465/mo at 3,000 gyms.** **Purchase.** Note the plan-toggle hazard
(`price-meters §2c`): on Pro with **Spend Cap at its default ON**, crossing this **hard-blocks new logins
platform-wide** rather than billing. That converts a $465 line item into an outage, and it is a dashboard
checkbox nobody has read.

### 4.20 Resend Pro/Scale ladder — 207 gyms to 10,000+
After the $20 fix: Pro 50,000/mo ⇒ 50,000/241 = **207 gyms** (or 394 at low coverage), then Scale
$90/100k → $1,150/2.5M ⇒ **10,000+ gyms**. **Amazon SES prices the same 381k–723k/mo volume at
$61–116/mo vs Resend's $416–1,120** (`alt-email §3.2`) — a 4–10× gap that costs engineering
(SNS bounce webhook + suppression table) rather than invoice. **Purchase, with an engineering alternative.**

### 4.21 `class_session` / `schedule_template_week` / `class_session_coach` — 50M rows at ~6 years
Verified in `workload-growth §2.4` by reading `ensure_week_materialized` and grepping every `DELETE`:
the **only** deletes against these tables anywhere in the repo are demo-teardown scripts. Rows are
written per (template, week) the first time anyone views that week and **never removed**.
Measured driver: **T ≈ 20–21 weekly class slots on BOTH real gyms**, independent of roster size
(Forge 33 members, RED 19 members, same ~20 slots).
```
2,080 rows/gym/yr (class_session + schedule_template_week) + 716 (class_session_coach) = 2,796
× 3,000 gyms = 8.4M rows/year, forever, unconditional
50M rows reached at 8.4M/yr → ~6 years of full-scale operation
```
**A 50-member micro-gym pays exactly the same row bill as a 300-member flagship.** This is the one
component in the whole audit whose cost is set by gym count rather than member count, which is precisely
the axis this business scales on. **Raise:** an archival/retention policy (collapse sessions >12 months
old), ~3 eng-days. **Engineering.** Not urgent; it is a monotonic liability with no offramp, and the
cheapest moment to write the policy is before there are 10M rows of dead calendar history.

### 4.22 Compute ladder exhausted — ~7,000 gyms (only without the index)
```
call_rate(G)   = G × 0.0009 req/s        [member /reservar + admin ficha views, peak]
latency(G)     = G × 8,100 rows ÷ 11.25e6 rows/s = G × 0.72 ms
cores(G)       = call_rate × latency = G² × 6.48e-7
50 % core budget (you cannot give one query the whole box):  G² × 1.296e-6 ≤ cores
16XL = 64 cores → G ≤ 7,027 gyms
```
Published ladder (fetched 2026-07-28): Nano $0/0.5 GB → Micro $10/1 GB → … → 16XL $3,730/256 GB/64 cores,
**and nothing above it except "Contact Sales."** Direct connections cap at **500 from 12XL onward** — the
$930/mo step from 12XL to 16XL buys **zero** additional direct connections.
**With the index this row does not exist at all** — the per-call working set becomes ~24 kB regardless of G.
**Purchase, then a wall.**

### 4.23 Backup/restore RTO — not a gym count
DB size at 3,000 gyms, Y=3: **106 GB** (my §4.7 model) to **423 GB** (`arch-tenancy §2.1`, index-inclusive).
Supabase publishes no restore-time figure. Lower bound from the published tier disk throughput:
```
106 GB ÷ 297 MB/s (2XL) ≈  6 min pure I/O → realistically 30–90 min end-to-end
423 GB ÷ 297 MB/s       ≈ 24 min pure I/O → realistically  2–4 h
```
And it restores **all 3,000 gyms or none** (§4.1). PITR: **$100/mo per 7 days**, **requires ≥Small
compute**, is **not covered by Spend Cap**, and **replaces** daily backups rather than adding to them.
**If prod is on Free, there are no automatic backups at all** and the RPO is "whenever the founder last
ran `pg_dump`." **Purchase.**

### 4.24 Migration gating — 2 concurrent branches
`pnpm test:denial` is the only thing that exercises the 25 write-bearing RPCs (vitest mocks the RPC
boundary), it is **not in CI or pre-commit**, and it needs a throwaway project. Free allows **2 active
projects, counted per owner across every org** — live + exactly one scratch. **The second concurrent
migration-bearing branch cannot be gated.** In a repo where agents write migrations, that is a real
throughput ceiling. **Raise:** $25/mo Pro (branching at $0.01344/branch-hr — and nothing auto-deletes a
branch; it is on the *not*-Spend-Cap-covered list). **Purchase.**

### 4.25 PostgREST pool / `max_connections` — >100,000 gyms (with the index)
```
peak DB work at 3,000 gyms (index shipped):
  member /reservar : 3,000 × 225 × 0.105 × 8 renders/mo = 567k/mo = 0.65 req/s peak × ~20 ms = 0.013 conn
  admin refresh    : 8.7M invocations/mo = 10 req/s peak × ~30 ms                          = 0.30 conn
  total ≈ 0.3 of a pool of 24 (40 % of max_connections=60, per Supabase's own guidance)
```
**80× headroom ⇒ the pool binds somewhere past 240,000 gyms.** Report as **>100,000 gyms.**
Falsification: this collapses if per-call latency stops being ~20 ms — which is exactly what §4.8/§4.10
do. **The pool is not a ceiling; it is a symptom amplifier for the index.**

### 4.26 Vercel invocations / bandwidth / builds — >100,000 gyms
22 routes against a 2,048-route cap; one deployment serves all tenants so builds do not scale with gym
count; invocations and bandwidth are soft-billed with no cap. Modelled **$600–850/mo at 3,000 gyms =
$0.20–0.28/gym = 0.3–1.6 % of a 300–1,500 MXN price point.** The one that will annoy: **1-day runtime log
retention on Pro** — you cannot debug Tuesday's incident on Thursday.

### 4.27 Storage / Realtime / Edge functions — >100,000 gyms
`select count(*) from storage.objects` = **0**. `grep -rn "\.channel\(|postgres_changes|storage\.from\("`
= **0**. Edge function invocations ≈ 30k/mo at 3,000 gyms against **Free's** 500,000. These are $0 and I
am not going to invent a concern about them. **Exit trigger:** the day a `.channel()` or `storage.from(`
call site ships. If Realtime is adopted, the decision that matters is **channel granularity, before the
first `.channel()`** — per-`class_session` costs ~$270/mo at 3,000 gyms, per-gym costs **~$1,700/mo**,
because messages ($2.50/M) not connections ($10/1,000) are the expensive meter.

---

## 5. THE UNRESOLVED PLAN QUESTION — my additional evidence, both directions

Three Workflow-1 files disagree (Free/Nano vs Micro vs Pro). It decides whether ceiling #7 (500 MB
read-only at ~35 gyms) applies at all, and whether **a system that handles money has any backups.**
I could not settle it either. What I added:

**Toward paid/Micro:**
- `shared_buffers = 224 MB`. That is **43.75 % of a Nano's 0.5 GB** and **21.9 % of a Micro's 1 GB**.
  Supabase's tuning posture is ~25 % of RAM. No tuner sets 44 %.
- `effective_cache_size = 384 MB`, `max_worker_processes = 6`, `max_parallel_workers = 2` — a 1 GB profile.

**Toward Free:**
- `AGENTS.md`: *"preview branching is Pro-gated / 402; the free tier fits exactly one scratch beside live."*
  A 402 on branching only happens off a paid plan.
- Session memory (Phase 3): *"free tier = no backups → manual pre-gate dumps"*, and an open *"keepalive
  ping"* task — which exists only because Free pauses after 7 days of inactivity.

**Neither settles it, and I found the reason why.** Supabase's own compute-and-disk page (fetched
2026-07-28) says: *"You cannot launch Nano instances on paid plans, only Micro and above — **but you might
have Nano instances after upgrading from Free Plan**."* So plan and compute size are **independent**, and
no Postgres setting can determine the plan. `archive_mode = on` with a `wal-g wal-push` archive command is
present but Supabase appears to archive WAL on all tiers.

**This is a 30-second dashboard check (Organization Settings → Billing) and nothing downstream of it
should be acted on until it is answered.** It is the second-highest value-per-minute item in this
document, after §4.3.

---

## 6. FORCED RANKING — the 5 worst things about this stack's ceiling structure, worst first

**1. The ceilings that arrive first are all invisible, and every monitor that would see them is absent.**
Ten of the first eleven ceilings produce no bill, no error and no alert. `mi_membresia` gets slower by
0.72 ms per gym added — nobody will connect that to a billing meter, because it is not one. There is
**zero 429 instrumentation** for the auth buckets (§4.17), **no `server-timing`** around the DAL, **no
cache-hit-rate watch** (`cache_hit_pct` reads 99.996 % today, which tells you nothing about the regime
past 120 gyms), and **1-day log retention on Pro** means the evidence is gone before anyone looks.
**Breaks at:** gym #35–120, silently. **Confidence: measured** (the absence of the instrumentation).

**2. The sharpest technical ceiling tightens as the product succeeds — and nobody has noticed.**
`resolverMiembroGym` costs `G × m × 14.5 µs` where `m` = cumulative activated members per gym, a number
that only ever grows and that the entire product roadmap exists to increase. At the measured 4.3 %
activation the wall is ~240 gyms; at the goal it is **12**. Every invite sent moves it closer. The fix is
one `.eq()` with zero DDL, and the reason it was never applied is a **code comment stating the wrong
reason** (`gym.ts:25-26`: *"gym_membership's RLS self-read policy already scopes the read to the caller…
so no explicit user_id filter is added here"*). **Breaks at 12–208 gyms. Confidence: measured mechanism
(my EXPLAIN, §2.5) + measured constant (14.5 µs, §2.4), modelled projection.**

**3. Three of the first five ceilings are outside the database entirely, and two of them are single
points of failure with no per-tenant partition.**
Resend (one account, one domain, one key that doubles as the SMTP password, no suppression list, rolling
bounce window that never dilutes with scale) and Supabase's project-wide auth buckets (`/auth/v1/otp`
30/hr, `rate_limit_email_sent` 50/hr) are both **one bucket for 3,000 tenants**. Neither has any
metering, backpressure, or per-gym budget. A DB audit that stops at the DB misses both. **Breaks at: any
day (Resend bounce), gym #1 (OTP if default), 12–24 gyms (Resend Free volume). Confidence: measured caps,
modelled volumes, asserted current config.**

**4. There is no "buy the next tier" answer to a single ceiling in the top ten — and the two ceilings you
*can* buy your way past cost $45/month combined.**
Team is **+$574/mo over Pro and raises ZERO meter limits** (MAU 100k, disk 8 GB, egress 250 GB, storage
100 GB, edge fn 2M, realtime 5M/500 — identical on both plans, cross-verified across two vendor pages).
Compute is the only purchasable capacity axis, it is **exempt from Spend Cap**, it **never autoscales**
(every resize is a manual click with downtime), and its top rung (16XL, $3,730/mo) is followed by nothing.
Meanwhile the entire Supabase *meter* bill at 3,000 gyms is **~$17/month**. **Breaks at:** the first
capacity conversation where someone reaches for the plan dropdown instead of an index.
**Confidence: measured** (both vendor pages fetched).

**5. The failure mode of every ceiling here is platform-wide and simultaneous, and there is no per-tenant
lever of any kind.**
One project, one org, one Resend account, one domain, one deployment, one migration target. Free's 500 MB
cap flips **every gym** to read-only at once. Spend Cap ON blocks **every gym's** logins at once. A
Resend suspension kills **every gym's** mail at once. A non-concurrent index build locks **every gym's**
writes at once (§4.15). A bad migration is live for all 3,000 with no canary. Postgres offers no
per-tenant resource governor, and there is no way to throttle, move, or shed a noisy tenant. This is not
an argument against the tenancy model — one migration target is worth more day-to-day than everything the
alternatives offer — but it means **every number in §1 is a number of gyms that go down together.**
**Breaks at:** not a row count; the first incident that needs a per-tenant response, which the
architecture cannot express. **Confidence: measured.**

**Honest counterpoint (rule 7), stated plainly:** the *architecture* is right. Server-side-everything on
one multi-tenant deployment per app makes serverless connection exhaustion **structurally impossible**
(measured: PostgREST connects from the DB host; the repo has no Postgres driver). ES256 asymmetric JWTs
convert a per-request auth round trip into a per-session-hour one. All 101 RLS policies use
`(select auth.uid())` — zero bare calls, which is the single most common Supabase mistake and it is absent
here. There are no `FOR ALL` policies. The ledgers have no DELETE policy, so soft-delete is enforced by
construction. `gym_folio_counter` is correctly deny-all. Three of Supabase's seven meters are literally
zero. **Nothing in §1 requires a redesign. Seven of the first ten items are between one line and one
week of work.**

---

## 7. FALSIFICATION — what would have to be true for my ordering to be wrong

| My claim | Would be wrong if | Did I check? |
|---|---|---|
| `resolverMiembroGym` scans every membership row with a per-row definer call | the planner hashed the SubPlan, or short-circuited on the cheap arm | **Checked. My own EXPLAIN (§2.5): `Seq Scan`, `SubPlan 1` (correlated, not hashed), `is_staff_of` written FIRST in the OR.** Postgres does not reorder OR operands (58× proven in `arch-authz §2.4`). |
| The scan rate is 11.25M rows/s, not 282 MB/s | my probe measured tuple generation rather than heap scanning | **Checked.** The pure-`generate_series` control is **slower** (794 ms vs 311 ms), so the 311 ms is not generator-bound. Conservative reading. |
| `ventas` has no usable index for `cliente_id` | any index led on it | **Checked. `pg_indexes` (§2.6): five indexes, all leading on `gym_id` or `id`.** Supabase's advisor independently flags `ventas_cliente_id_fkey` as unindexed. |
| The `gym_membership` fix needs no DDL | `gym_membership_pkey` did not lead on `user_id` | **Checked. `btree (user_id, gym_id)`.** ✅ |
| Connections never bind | some code path opened a direct Postgres socket | **Checked. `pg_stat_activity`: `postgrest` from the DB host, `authenticator` `rolconnlimit = -1`.** Repo has only `@supabase/supabase-js` + `@supabase/ssr`, both HTTP. |
| The Free 500 MB cap arrives at ~35 gyms, not ~240 | today's bytes-per-cliente were a steady-state stock | **Checked and it is not.** Forge is 7 weeks old with 26 of 40 sales being first purchases; RED was seeded 3 days before the audit with **zero** attendance. Today's ratio is an acquisition snapshot, not an accrual rate. |
| Storage / Realtime cost $0 | any call site existed | **Checked. `storage.objects` = 0 rows; zero `.channel(`/`postgres_changes`/`storage.from(` in the repo.** |
| MAU is ceiling #19, not #1 | activation were 40–90 % as `price-meters` assumed | **Checked. 9 `auth.users` against 116 `clientes`; 0 activated at the most mature real gym.** And there is no batch-invite path, so the stock cannot catch up on its own. |
| The compute ladder is not the binding constraint at 3,000 gyms | the scan rate were ~282 MB/s as `model-tiers` modelled | **Checked and refuted (§2.3).** But note: **their conclusion still holds under my numbers via a different mechanism** — buffer eviction at ~118 gyms (§4.8), not core exhaustion at 1,875. I moved the number and kept the ranking. |
| `/auth/v1/otp` is still at 30/hr | someone raised it in the dashboard | **Could NOT check.** Not in `pg_settings`, not in the public `/auth/v1/settings` endpoint. **Marked asserted. This is the weakest high-ranked item in the table.** |

---

## 8. MY BLIND SPOTS

1. **Every number above ~700 rows is an extrapolation.** This database has 4 gyms, 15 MB, and a 99.996 %
   cache hit rate. It has never touched disk in anger. The §4.8 buffer-eviction cliff, the §4.15 index-build
   lock, and the §4.22 core exhaustion are all projections into a regime that has never been observed.
   **The honest way to settle the entire top half of this table is to seed a scratch project to 500 gyms
   and re-run §2.3/§2.4/§2.5.** Read-only access cannot build that, and I did not.
2. **`EXPLAIN ANALYZE` was forbidden**, so I have no `loops=` counts. "`is_staff_of` fires on every row"
   rests on plan text plus the OR-order experiment, not on an observed loop count.
3. **PostgREST's actual `db-pool` value is unmeasured.** I used 24 (40 % of `max_connections`, from
   Supabase's own guidance). If it is 10, §4.25's headroom is halved; if 100, it quadruples. Either way it
   is not the binding constraint, but the number is a guess. Supabase publishes no per-tier table; I
   searched and could not find one.
4. **I could not read any dashboard.** The plan tier (§5), the Spend Cap toggle, `/auth/v1/otp`'s
   configured value, `rate_limit_email_sent`'s current value, Resend's actual plan, Vercel's function
   region setting, whether Fluid compute is on, and Vercel's egress-IP count are **all unverifiable from a
   read-only SQL session.** Four of my top-20 rows depend on one of these.
5. **The support-load row (§4.16) is arithmetic on an assumed rate.** No tickets/gym/month figure exists
   anywhere. I flagged it `asserted` rather than omit it, because the mandate requires a number — but it
   is the softest cell in the table and should be replaced the moment real data exists.
6. **I did not model the write path's own ceilings.** `registrar_venta`, `reservar_clase`,
   `pasar_lista_sesion` — 25 write RPCs — appear in my numbers only as call-rate inputs. Live
   `pg_stat_statements` shows one write RPC at **400.8 blocks/call and 13.6 ms mean**, *more* expensive
   per call than `mi_membresia`. At 3,000 gyms that is ~675k ventas/month plus ~7.2M `clientes` UPDATEs/yr
   against a table whose row *count* grows by only ~210k/yr — a vacuum/bloat profile 35× its row growth,
   which nothing in my table captures.
7. **I did not re-derive the Vercel cost model or the LatAm deliverability numbers** — I took
   `arch-runtime` and `alt-email` at their word on those, having spot-checked their methodology but not
   re-fetched their sources.
8. **Seasonality is entirely unmodelled.** No December/January cycle exists in a 2-month-old dataset. A
   January signup surge concentrates activation, invite email and auth-bucket consumption into one month;
   every flat monthly average in §4.5, §4.17 and §4.19 understates the peak that actually trips the cap.
9. **I did not verify the "Y" (fleet tenure) assumption anywhere.** Ceilings #7, #8, #10, #11 and #15 all
   move by 3× between Y=1 and Y=3, and a real fleet has a tenure *distribution*, not a single value. I used
   flat Y for tractability and flagged both endpoints; a cohort model would tighten every one of them.
