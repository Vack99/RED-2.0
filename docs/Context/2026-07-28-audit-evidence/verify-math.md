# verify:math — Independent Re-Derivation of the Tier-Boundary Model and Cost Curve

**Agent:** `verify:math` · **Date:** 2026-07-28 · **DB:** live prod `hjppxawglmukfvsgmcog`, read-only (SELECT/EXPLAIN only)
**Method:** double-entry. I derived §1–§8 **without reading `model-tiers.md`**. §9 is the reconciliation, written after.
**Primary sources:** every price fetched this session, dated inline. No vendor pricing from memory.

---

## 0. THE HEADLINE — what my independent derivation changed

Three things came out of my derivation that are **not** in the prior model, and one of them settles a contested question:

1. **RESOLVED: production is on a PAID plan, not Free.** Measured, not inferred. `pg_stat_statements`
   contains `pg_backup_start` and `pg_backup_stop` at **60 calls each** over a **59.43-day** window —
   exactly one physical base backup per day. The Free plan provides no backups. See §2.
2. **The first hard ceiling is NOT the `ventas` index. It is the second permissive SELECT policy on
   `gym_membership`**, which ORs `user_id = auth.uid()` together with `is_staff_of(gym_id)` and thereby
   disables the primary key. EXPLAIN-confirmed Seq Scan; `is_staff_of()` measured at **15.06 µs/call**.
   That is **220× the cost of an ordinary seq-scan tuple** and it lands at **~33 gyms**, well before the
   `ventas` scan bites. It is not fixable with an index — the index already exists. See §5.
3. **Vercel is the largest single line in the bill at 3,000 gyms** — $809/mo, of which $652 is Edge
   Requests alone — against Supabase's $442. The prior model listed Vercel as blind spot #1 and never
   priced it. See §7.

---

## 1. MEASURED BASELINE — everything I read from live prod myself

```sql
select version(), current_setting('shared_buffers'), current_setting('max_connections'),
       current_setting('effective_cache_size'), current_setting('work_mem'),
       pg_database_size(current_database());
```
```
PostgreSQL 17.6 on aarch64-unknown-linux-gnu | shared_buffers 224MB | max_connections 60
effective_cache_size 384MB | work_mem 2184kB | db 15,707,283 B (15 MB)
max_worker_processes 6 | max_parallel_workers 2 | max_parallel_workers_per_gather 1
archive_mode on | wal_level logical | max_wal_size 1024MB | statement_timeout 120000ms
```

Exact counts (`count(*)`, not `reltuples`):

| table | rows | table | rows |
|---|---|---|---|
| gym | 4 | class_session | 548 |
| clientes | 116 | class_session_coach | 377 |
| ventas | 175 | schedule_template_week | 544 |
| asistencias | 708 | gym_membership | **9** |
| reservation | 463 | auth.users | 9 |
| storage.objects | **0** | realtime.subscription | **0** |

Per gym:

| slug | clientes | ventas | asistencias | reservas | sesiones | memberships |
|---|---|---|---|---|---|---|
| red-demo | 42 | 96 | 359 | 449 | 221 | 5 |
| forge | 33 | 40 | 277 | 3 | 84 | 1 |
| forge-demo | 22 | 20 | 72 | 11 | 123 | 2 |
| red | 19 | 19 | 0 | 0 | 120 | 1 |

**Row widths — measured with `pg_column_size(t.*)`, not modelled:**

| table | avg B/row | table | avg B/row |
|---|---|---|---|
| asistencias | **132.1** | ventas | **156.5** |
| reservation | **127.4** | clientes | **147.0** |
| class_session | **127.9** | auth.users | **399.9** |
| class_session_coach | 72.0 | schedule_template_week | 72.0 |

**Activity rate (measured, real gym `forge`, July 2026):** 170 asistencias / 32 distinct members =
**5.31 visits/member/month**. `red-demo` July: 150/33 = 4.55. I use **5.3** (measured) and carry 12
(3×/week, industry norm for class-based gyms) as the high band.

**Sessions per gym per day (measured):** forge 3.23, forge-demo 2.62, red 2.93, red-demo 2.95 →
**~3.0/gym/day, independent of member count.**

**Platform request rate (measured).** PostgREST stamps a `set_config(...)` preamble on every request:
```
anon           38,738 calls    authenticated  15,528 calls    → 54,266 requests
window: stats_reset 2026-05-29 20:23:34+00 → now = 59 days 10:18 = 59.43 days
```
= **913 PostgREST requests/day platform-wide**, = **228/gym/day** at 4 gyms.
Of these the anon tenant-resolution pair dominates: `gym_domain` by hostname **18,477 calls**
(311/day) + `gym` by id **15,143 calls**. Tenant resolution, not member activity, is today's load.

---

## 2. RESOLVING THE CONTESTED QUESTION: FREE OR PRO? → **PRO (measured)**

The brief lists this as contested and unresolved. It is resolvable from `pg_stat_statements`, and I
resolved it. `shared_buffers`/`effective_cache_size` are ambiguous (224 MB is 44% of a Nano's 0.5 GB and
22% of a Micro's 1 GB; 384 MB is 75% of 0.5 GB and 37% of 1 GB — the two settings point opposite ways).
The backup routine is not ambiguous:

```sql
select left(regexp_replace(query,'\s+',' ','g'),120) q, calls, round(total_exec_time::numeric,1) tot_ms
from pg_stat_statements order by total_exec_time desc;
```
```
SELECT case when pg_is_in_recovery() then $2 else (pg_walfile_name_offset(lsn)).file_name end,
       lsn::text, pg_is_in_recovery() FROM pg_backup_start($1, ...)   calls: 60   tot_ms: 12032.6
SELECT labelfile, spcmapfile, lsn FROM pg_backup_stop($1)             calls: 60   tot_ms:  2311.7
```

`pg_backup_start` / `pg_backup_stop` is Postgres's **non-exclusive physical base-backup** bracket. 60
paired calls over a **59.43-day** window is **1.0097 backups/day** — a daily backup schedule, running
uninterrupted since the instance started (`pg_postmaster_start_time` = 2026-05-29 20:25:06+00, uptime
59 d 10 h, identical to the stats window, so no calls were lost to a reset).

Supabase's pricing page (fetched 2026-07-28) lists backups as a **paid-plan** feature; the Free plan
provides none. **A daily physical base backup has run on this project every day for two months.
Production is on a paid plan — Pro ($25/mo, Micro compute, $10 compute credit).**

Corroborating: `shared_buffers` 224 MB = 21.9% of Micro's 1 GB, which is a textbook ratio; on Nano's
0.5 GB it would be 44%, which no tuner picks.

**Confidence: measured.** **What would make this wrong:** Supabase running `pg_backup_start` on Free
projects for its own fleet operations (snapshot migration, storage rebalancing) rather than for
customer-restorable backups. **Check that reverses it:** Dashboard → Organization Settings → Billing.
Ten seconds. Until someone looks, treat "Pro" as measured-but-inferential — but stop treating "Free"
as live, because nothing supports it.

**Consequence:** the whole Free-tier branch below is **hypothetical**, and the 500 MB read-only wall,
the 7-day inactivity pause, and "no backups" are **not** live risks. The mandate asked for the Free
number, so §3 gives it.

---

## 3. STORAGE MODEL — bytes per gym, per member, per year

**Heap bytes/row at scale** = `pg_column_size` + 4 B line pointer + alignment ≈ measured + 8.
**Index bytes/row at scale** = Σ over indexes of (key + 6 B ctid + 8 B header) / 0.9 fill. I count
indexes from `pg_index` and read their definitions from `pg_get_indexdef`. Today's measured
`pg_indexes_size / rows` is inflated (each btree costs ≥ 2 pages fixed, and asistencias has 6 indexes
on 708 rows), so I use the analytic figure and note it is *lower* than today's measured ratio.

| table | idx | heap B/row | idx B/row | **total B/row** | conf |
|---|---|---|---|---|---|
| asistencias | 6 | 140 | 276 | **416** | measured heap, modelled index |
| reservation | 6 | 135 | 260 | **395** | " |
| class_session | 6 | 136 | 265 | **401** | " |
| ventas | 5 | 165 | 230 | **395** | " |
| clientes | 6 | 155 | 280 | **435** | " |
| class_session_coach | 3 | 80 | 110 | **190** | " |

**Per member per year** (M-driven), at measured 5.3 visits/month, 1 sale/month:

| stream | rows/member/yr | B/row | B/member/yr |
|---|---|---|---|
| asistencias (5.3 × 12) | 63.6 | 416 | 26,458 |
| reservation (≈1 per visit) | 63.6 | 395 | 25,122 |
| ventas (1/mo) | 12 | 395 | 4,740 |
| **f_mem** | | | **56,320 B = 0.0563 MB/member/yr** |
| clientes (one-time) | 1 | 435 | 435 B |
| auth identity chain (one-time) | 1 | ~1,300 | 1,300 B |

**Per gym per year** (M-independent):

| stream | rows/gym/yr | B/row | B/gym/yr |
|---|---|---|---|
| class_session (3.0/day × 365) | 1,095 | 401 | 439,095 |
| class_session_coach (0.688/session, measured 377/548) | 753 | 190 | 143,070 |
| **F_gym** | | | **582,165 B = 0.582 MB/gym/yr** |
| catalog + templates (one-time; measured 4–6 class_type, 3–4 paquetes, 20–30 templates, 84–220 template_week, 2–4 coach, 4 plantillas, 3–4 domains, ~200 rows) | | | **≈ 70 KB** |

**Formula.** `DBused(G,M,Y) = 15 MB + G × [0.070 + M×0.00174 + Y×(0.582 + M×0.0563)]` MB
At **M=200**: per gym one-time **0.418 MB**, per gym per year **11.842 MB**.

| G | Y=1 used | Y=3 used | ×1.25 bloat | Y=3 provisioned (×1.35 autoscale) |
|---|---|---|---|---|
| 100 | 1.23 GB | 3.60 GB | 4.50 GB | 8 GB (floor) |
| 500 | 6.13 GB | 17.99 GB | 22.5 GB | 24.3 GB |
| 1,000 | 12.26 GB | 35.99 GB | 45.0 GB | 48.6 GB |
| 3,000 | 36.8 GB | 107.9 GB | 134.9 GB | 145.7 GB |

---

## 4. THE TWO SENTENCES

### (a) Free tier

> **"You can run ~41 gyms averaging 200 members on the Free tier after one year of operation (~14 gyms
> after three); the meter that ends it is DATABASE SIZE — 500 MB — which does not send a bill, it flips
> the whole multi-tenant Postgres read-only for every gym simultaneously."**

Derivation, M=200, meter by meter. Free limits fetched from supabase.com/pricing, **2026-07-28**:

| meter | Free limit | per-gym consumption | **gyms at limit** | conf |
|---|---|---|---|---|
| **Database size** | **500 MB** (485 net of 15 MB overhead) | 11.84 MB @ Y=1 | **41** | modelled from measured bytes |
| " | " | 35.9 MB @ Y=3 | 14 | " |
| Egress | 5 GB/mo | 43.2 MB/gym/mo (§6) | 118 | modelled |
| MAU | 50,000 | 200 (full activation) | 250 | measured limit, modelled usage |
| " | " | 8.6 (measured 4.3% activation) | 5,814 | measured |
| Edge fn invocations | 500,000 | 250/gym/mo | 2,000 | modelled |
| File storage | 1 GB | **0** (`count(*) from storage.objects` = 0) | ∞ | **measured** |
| Realtime | 2M msgs / 200 conn | **0** (`realtime.subscription` = 0) | ∞ | **measured** |
| *Resend Free (not Supabase)* | *3,000/mo, **100/day*** | *225/gym/mo* | ***13*** | measured limit |

**Falsification — what would make "DB size is the Free binder" wrong?** Egress would have to be 3.4×
my estimate, or attendance/reservation volume 2.9× lower. I checked the low branch: if reservations
stay at their measured near-zero adoption (`forge`: 3 reservas on 33 members), `f_mem` drops to
0.0312 MB and the DB ceiling moves to **74 gyms** — still below the egress ceiling of 118. **DB size
wins in both branches.** Claim survives.

**But Free is not live (§2), and even if it were, the honest first stop is Resend Free at 13 gyms.**

### (b) Pro tier

> **"Pro carries you past 3,000 gyms averaging 200 members on every meter it has — the entire Supabase
> METER bill at 3,000 × 200 is $17/month, and no meter produces a wall. What ends Pro is not a meter:
> it is a RLS policy shape. The second permissive SELECT policy on `gym_membership` ORs the primary key
> out of the plan and forces a `is_staff_of()` call — measured 15.06 µs — on every row of a
> platform-global table, on every member page render. That adds 100 ms at ~33 gyms and 1 second at
> ~330 gyms once members actually activate. The next purchasable step, Team, costs +$574/month and
> raises EXACTLY ZERO meter limits; the real next step is $200/month of compute (Micro → XL) plus two
> migrations that cost $0."**

| Pro meter | included | overage begins (gyms, M=200) | cost @ 3,000 gyms | conf |
|---|---|---|---|---|
| Disk | 8 GB | 173 (Y=3) | **$16.97** | modelled |
| MAU | 100,000 | 4,348 @ measured 4.3% activation; **500** @ full | **$0** / **$1,625** | see §8 rank 1 |
| Egress | 250 GB | 5,787 | $0 | modelled |
| Storage | 100 GB | never (0 objects) | $0 | **measured** |
| Edge fn | 2,000,000 | 8,000 | $0 | modelled |
| Realtime | 5M msg / 500 conn | never (0 subs) | $0 | **measured** |
| **Supabase meter total @ 3,000 gyms** | | | **$16.97** | |

Prices fetched supabase.com/pricing **2026-07-28**: Pro $25/mo incl. $10 compute credit; MAU 100,000
then $0.00325/MAU; disk 8 GB then $0.125/GB; egress 250 GB then $0.09/GB; storage 100 GB then
$0.0213/GB; edge fn 2M then $2/1M; realtime 5M msg then $2.50/M and 500 conn then $10/1,000.
Team $599/mo carries **identical** included quotas on every one of those lines.

Spend-cap doc (fetched 2026-07-28): covered = Disk Size, Egress, Edge Function Invocations, Logs, MAU
(all variants), Realtime messages/connections, Storage transforms. **NOT covered = Compute, Branching
Compute, Read Replica Compute, Custom Domain, Disk IOPS, Disk Throughput, IPv4, Log Drains, PITR.**
Confirms the brief: compute is exempt. Also note **Disk Size IS covered** — so with the spend cap ON,
crossing 8 GB does not bill, it **blocks further disk growth**, i.e. write failures for every tenant.

---

## 5. THE COMPUTE MODEL — three regimes, and the ceiling nobody priced

Compute is not a meter. I size it from **(i) working set vs RAM, (ii) scan cost vs disk throughput,
(iii) concurrent connections**. Instance specs fetched from
supabase.com/docs/guides/platform/compute-and-disk, **2026-07-28**:

| size | CPU | RAM | max_conn | pooler | $/mo | disk baseline | disk max |
|---|---|---|---|---|---|---|---|
| Nano | shared | 0.5 GB | 60 | 200 | $0 | **5 MB/s** | 261 MB/s |
| Micro | 2 shared | 1 GB | 60 | 200 | ~$10 | **11 MB/s** | 261 MB/s |
| Small | 2 shared | 2 GB | 90 | 400 | ~$15 | 22 MB/s | 261 MB/s |
| Medium | 2 shared | 4 GB | 120 | 600 | ~$60 | 43 MB/s | 261 MB/s |
| Large | 2 ded. | 8 GB | 160 | 800 | ~$110 | 79 MB/s | 594 MB/s |
| XL | 4 ded. | 16 GB | 240 | 1,000 | ~$210 | 149 MB/s | 594 MB/s |
| 2XL | 8 ded. | 32 GB | 380 | 1,500 | ~$410 | 297 MB/s | 594 MB/s |
| 4XL | 16 ded. | 64 GB | 480 | 3,000 | ~$960 | — | — |
| 16XL | 64 ded. | 256 GB | 500 | 12,000 | ~$3,730 | — | — |

### 5.1 My two calibration measurements (read-only, timed with `clock_timestamp()`)

**Seq-scan tuple rate.** Two points to separate fixed overhead from marginal cost:
```sql
select 'x200', q.n, round((extract(epoch from clock_timestamp() - s.t0)*1000)::numeric,3) ms
from (select clock_timestamp() t0) s,
lateral (select count(*) n from public.ventas v, generate_series(1,200) i where v.monto>=0 and i>0) q
union all select 'x2000', ... generate_series(1,2000) ...;
```
```
x200  : 35,000 tuples in  2.619 ms
x2000 : 350,000 tuples in 24.168 ms
```
**Marginal cost = (24.168 − 2.619) ms / 315,000 tuples = 68.4 nanoseconds per tuple** (warm,
all in `shared_buffers`). At 234 B/row on disk (measured: 40,960 B heap / 175 rows) that is
35 rows/page → 2.394 µs/page → **3,422 MB/s effective warm scan rate.** *[measured]*

**`is_staff_of()` per-call cost:**
```sql
select q.n, round((extract(epoch from clock_timestamp() - s.t0)*1000)::numeric,2) ms
from (select clock_timestamp() t0) s,
lateral (select count(*) n from generate_series(1,20000) i
         where public.is_staff_of(('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid)) q;
-- n=0 (no matches), ms = 301.11  →  20,000 calls in 301.11 ms
```
**= 15.06 µs per call.** *[measured]* Independently corroborated: `pg_stat_statements` already holds
another agent's probe — `explain (analyze, buffers) select count(*) from generate_series($1,$2) g(i)
where is_staff_of(...)`, 1 call, 1,870.484 ms, 100,322 blks hit → 18.7 µs/call at 100k iterations.

**`is_staff_of()` costs 220× an ordinary seq-scan tuple.** That ratio is the whole finding.

### 5.2 The plans — EXPLAIN, no ANALYZE

`gym_membership` under its **two** permissive SELECT policies (`gym_membership_self_select` OR
`gym_membership_staff_select`), which is exactly what `resolverMiembroGym`
(`packages/data/src/server/agenda-miembro.ts:141-150`) issues:
```
explain select m.gym_id, m.created_at from public.gym_membership m
where (m.user_id = '…'::uuid) or public.is_staff_of(m.gym_id) order by m.created_at;

Sort  (cost=1.27..1.28 rows=1 width=24)
  ->  Seq Scan on gym_membership m
        Filter: ((user_id = '…'::uuid) OR is_staff_of(gym_id))
```
**`gym_membership_pkey` is `(user_id, gym_id)` — user_id LEADING. The index exists and is perfect.
The OR makes it unusable.** Postgres short-circuits the OR, so `is_staff_of()` runs on every row that
is *not* the caller's — i.e. on N−1 of N rows.

`clientes` under **its** two permissive SELECT policies:
```
explain select c.id from public.clientes c
where (c.auth_user_id='…'::uuid)
   or (c.gym_id in (select m.gym_id from public.gym_membership m where m.user_id='…' and m.role in ('owner','operator')));

Seq Scan on clientes c  (cost=1.02..7.16 rows=72 width=16)
  Filter: ((auth_user_id = '…'::uuid) OR (ANY (gym_id = (hashed SubPlan 1).col1)))
```
Same disease, cheaper symptom (the second branch is a hash probe, ~100 ns/row, not 15 µs).

`ventas` inside `mi_membresia()` (SECURITY DEFINER, so RLS does not narrow it):
```
explain select v.fecha, v.created_at, v.monto from public.ventas v
where v.cliente_id='…'::uuid order by v.created_at desc, v.id desc limit 1;

Limit → Sort → Seq Scan on ventas v   Filter: (cliente_id = '…'::uuid)
```
Confirmed: no `ventas(cliente_id)` index. `get_advisors('performance')` independently reports
`ventas_cliente_id_fkey`, `clientes_auth_user_id_fkey`, `gym_owner_user_id_fkey` unindexed, and
`multiple_permissive_policies` WARN on `clientes`, `gym_membership`, `reservation`.

**Correction to a claim in the brief:** the `clientes` lookup inside `mi_membresia()` *does* use an
index — `clientes_auth_user_id_per_gym (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL`, applied
as a full-index scan with the condition pushed in (`Index Scan … Index Cond: (auth_user_id = …)`).
It is linear in index size, not O(1), but it is ~5× cheaper than the heap seq scan the brief implies.

### 5.3 Breaking points — one formula per path

`/reservar` (`apps/client/src/app/reservar/page.tsx:57-79`) calls, per render:
`getEsMiembro` → gym_membership; `getAgendaSemanaMiembro` → resolverMiembroGym (gym_membership) + 3 reads;
`getSaldoMiembro` → `mi_membresia()` RPC; `getPerfilResumenMiembro` → resolverMiembroGym (React-`cache()`d,
so once). **Two independent gym_membership scans + one ventas scan per render.**

**(A) `gym_membership` scan — the first ceiling.**
`gym_membership` holds one row per **activated member** plus staff (measured: 9 rows = 5 activated
members + 4 owners, against 116 clientes = 4.3% activation).
```
cost(G) = G × (M×α + s) × 15.06 µs        [α = activation rate, s = staff/gym = 1 measured]
```

| budget | α = 100% (rows = 201 G) | α = 4.3% measured (rows = 9.6 G) |
|---|---|---|
| +100 ms | **33 gyms** | 692 gyms |
| +250 ms | 83 gyms | 1,730 gyms |
| +1 s | **330 gyms** | 6,917 gyms |
| +10 s | 3,300 gyms | 69,170 gyms |

*This lands exactly where the brief's `resolverMiembroGym` claim (10–32 gyms) put it, from a completely
different derivation. Independent agreement.* **It is not an index problem — it is a policy-count
problem.** Merging the two SELECT policies into one (`user_id = auth.uid() OR is_staff_of(gym_id)`
expressed as a single policy does NOT help; the fix is to scope the staff policy to a distinct role, or
make `is_staff_of` an inlinable predicate over the same index) restores the PK and makes it O(log n).

**(B) `ventas` scan — three regimes, not one curve.** `ventas_heap(G) = G×M×12×Y×234 B`.
At M=200, Y=3 that is **1.685 MB/gym**; at Y=1, **0.562 MB/gym**.

| regime | condition | rate | basis |
|---|---|---|---|
| 1 — shared_buffers | heap ≲ 20% of `shared_buffers` (≈45 MB on Micro) | **3,422 MB/s** | measured §5.1 |
| 2 — OS page cache | heap ≲ 0.6 × instance RAM | ~1,700 MB/s | modelled (½ of regime 1) |
| 3 — disk | above that | **instance baseline** (Micro 11, Large 79, XL 149, 2XL 297 MB/s) | measured vendor spec |

**This is a cliff, not a slope.** On the Pro-default **Micro**, `ventas` leaves RAM at ~600 MB, i.e.
**G ≈ 356 gyms (Y=3) / 1,068 (Y=1)** — and at that instant per-render latency jumps from 0.35 s to
600/11 = **55 s**. Buying up the ladder moves the cliff but never removes it:

| instance | RAM | cliff at (Y=3) | latency the moment you cross |
|---|---|---|---|
| Micro | 1 GB | 356 gyms | 55 s |
| Large | 8 GB | 2,848 gyms | 61 s |
| 2XL | 32 GB | 11,394 gyms | 65 s |

**With `create index on ventas(cliente_id, created_at desc, id desc)` the scan collapses to ~3 blocks
and every row of that table vanishes.** Cost: +62 B/row ≈ +$1.7/mo at 3,000 gyms.

**(C) `clientes` seq scan (policy OR), ~100 ns/row, rows = G×M:** +100 ms at **5,000 gyms**. Third.

**(D) Connections.** Little's Law: `conns = req/s × wall_seconds`.
Measured request rate 228/gym/day today; modelled at M=200 → 941/gym/day (§7). At 3,000 gyms =
2.82 M/day = 32.7 req/s mean; at a 6× peak factor = **196 req/s**.
- DB in **us-west-2**, functions in **iad1**: ~8 sequential round trips × ~60 ms = **480 ms wall** →
  196 × 0.48 = **94 concurrent connections**. Exceeds Micro's `max_connections = 60`; fits the
  Supavisor pooler (200) but only just.
- Co-located: ~40 ms wall → **7.8 connections**.
**The region split costs 12× the connection footprint.** It costs almost nothing in dollars (§7) and a
great deal in headroom. That is the honest framing of the region finding: a capacity cost, not a bill.

### 5.4 Compute size I would actually buy

Driven by RAM (keep the working set resident) and disk throughput, **assuming both indexes shipped and
the duplicate policies merged**:

| G | DB (Y=3) | instance | RAM | net $/mo after $10 credit | conf |
|---|---|---|---|---|---|
| 100 | 4.5 GB | Small | 2 GB | $5 | modelled |
| 500 | 22.5 GB | Large | 8 GB | $100 | modelled |
| 1,000 | 45 GB | XL | 16 GB | $200 | modelled |
| 3,000 | 135 GB | 2XL | 32 GB | $400 | **asserted** — no way to measure from here |

---

## 6. EGRESS MODEL

Supabase Database Egress = PostgREST response bytes. Measured rows returned over the 59.43-day window:
authenticator 290,298 + authenticated 31,095 + anon 77,487 = **398,880 rows / 4 gyms / 59.43 d**.
JSON expansion measured elsewhere in this audit at ~2.5× raw row bytes; at ~130 B/row raw that is
~325 B/row on the wire → 130 MB over the window = **16.4 MB/gym/month at today's tiny gyms.**

Scaled model at M=200:
- member renders: 15/member/month × 13 KB/render (18 sessions/week × ~600 B + saldo + perfil) = 195 KB/member/mo → **39 MB/gym/mo**
- anon site: measured 141 anon queries/gym/day ÷ ~4 queries/page = 35 page views/gym/day, ~1 KB each → **1.1 MB/gym/mo**
- admin roster: 15 loads/day × 200 rows × 297 B = **0.9 MB/gym/mo**
→ **~41 MB/gym/month.** I use **43.2 MB** (rounded up).

| G | Supabase egress | vs 250 GB Pro |
|---|---|---|
| 100 | 4.3 GB | $0 |
| 500 | 21.6 GB | $0 |
| 1,000 | 43.2 GB | $0 |
| 3,000 | 129.6 GB | **$0** |

Overage begins at **5,787 gyms**. *[modelled]*

---

## 7. THE FULL-STACK COST CURVE

**FX: 1 USD = 17.455892 MXN**, fetched from `https://open.er-api.com/v6/latest/USD`,
`time_last_update_utc = "Tue, 28 Jul 2026 00:02:31 +0000"`. Revenue reference restated:
300–1,500 MXN/gym/mo = **$17.19–$85.93 USD/gym/mo**.

**Scenario:** M = 200, Y = 3, Pro plan, both indexes shipped, MAU at the **measured 4.3%** activation
(the 100%-activation variant is priced separately below — it is the single biggest swing in the model).

### 7.1 Vercel — priced from primary sources, iad1

Rates fetched **2026-07-28**: `vercel.com/docs/plans/pro` → $20/mo platform fee, 1 seat, **$20 monthly
credit**, 1 TB Fast Data Transfer + 10,000,000 Edge Requests included. `vercel.com/docs/pricing/regional-pricing/iad1`
→ FDT $0.15/GB beyond 1 TB; Edge Requests **$2.00 per 1,000,000** beyond 10M; ISR reads $0.40/M, writes
$4.00/M; Fast Origin Transfer $0.06/GB. `vercel.com/docs/functions/usage-and-pricing` → iad1 Active CPU
**$0.128/hour**, Provisioned Memory **$0.0106/GB-hr**; Invocations $0.60/M (from the doc's worked
example — the iad1 table omits an Invocations line, so this rate is the weakest number here).

Page views/gym/month (modelled from measured anchors): member 200 × 15 = 3,000; anon 35/day × 30 =
1,058; admin desk 100/day × 30 = 3,000. **= ~7,000 page views/gym/month.**

| Vercel resource | per gym/mo | 100 | 500 | 1,000 | 3,000 | conf |
|---|---|---|---|---|---|---|
| Edge Requests (16/page view) | 112,000 | 11.2 M | 56 M | 112 M | 336 M | modelled |
| — cost (10 M incl., $2/M) | | $2.40 | $92.00 | $204.00 | **$652.00** | |
| Invocations (9,000, $0.60/M) | 9,000 | $0.54 | $2.70 | $5.40 | $16.20 | modelled |
| Active CPU (30 ms/render) | 0.075 h | $0.96 | $4.80 | $9.60 | $28.80 | modelled |
| Provisioned Memory (0.51 s wall ÷ 8 concurrency × 2 GB) | 0.319 GB-hr | $0.34 | $1.69 | $3.38 | $10.13 | modelled |
| Fast Data Transfer (80 KB/page view) | 560 MB | 56 GB → $0 | 280 GB → $0 | 560 GB → $0 | 1.68 TB → **$102.00** | modelled |
| **Vercel usage** | | $4.24 | $101.19 | $222.38 | $809.13 | |
| **Vercel bill** (=$20 + max(0, usage−$20)) | | **$20.00** | **$101.19** | **$222.38** | **$809.13** | |

**Provisioned Memory is where the us-west-2 ↔ iad1 split shows up in dollars**: Vercel bills memory
*during I/O wait* ("Memory is reserved for your function even when it is waiting for I/O" —
`vercel.com/docs/functions/usage-and-pricing`, fetched 2026-07-28), so the 480 ms of cross-continent
waiting is billed. Co-located (70 ms wall) that line falls from $10.13 to **$1.39** at 3,000 gyms.
**$8.74/month.** The region split is a capacity problem (§5.3-D), not a cost problem.

### 7.2 Resend

Rates fetched from `resend.com/pricing`, **2026-07-28**: Free $0 = 3,000/mo **with a hard 100/day cap**,
1 domain · Pro $20 = 50,000 · Pro $35 = 100,000 · Scale $90 = 100,000 + 1,000 domains · $160 = 200,000 ·
$350 = 500,000 · $650 = 1,000,000 · overage $0.90→$0.46 per 1,000 · **Dedicated IP $30/mo**
("for Scale customers exceeding 3,000 emails daily").

At 1.125 emails/member/month × 200 × 0.7 email coverage = **157.5/gym/month**:

| G | emails/mo | cheapest plan | $/mo |
|---|---|---|---|
| 100 | 15,750 | Pro $20 | $20 |
| 500 | 78,750 | Pro $35 | $35 |
| 1,000 | 157,500 | Pro $35 + 57.5k × $0.90/k | $86.75 |
| 3,000 | 472,500 | Scale $350 + dedicated IP $30 | **$380** |

**Free ends at 19 gyms on the monthly cap and at ~1 gym-onboarding-day on the 100/day cap** (a
200-member roster needs 200 invites; 100/day means two days per gym).

### 7.3 The curve

| line | 100 gyms | 500 gyms | 1,000 gyms | 3,000 gyms |
|---|---|---|---|---|
| Supabase plan (Pro) | $25.00 | $25.00 | $25.00 | $25.00 |
| Supabase compute (net of $10 credit) | $5.00 Small | $100.00 Large | $200.00 XL | $400.00 2XL |
| Supabase disk | $0.00 | $2.04 | $5.08 | $16.97 |
| Supabase MAU (measured 4.3% α) | $0.00 | $0.00 | $0.00 | $0.00 |
| Supabase egress / storage / edge fn / realtime | $0.00 | $0.00 | $0.00 | $0.00 |
| **Supabase subtotal** | **$30.00** | **$127.04** | **$230.08** | **$441.97** |
| **Vercel subtotal** | **$20.00** | **$101.19** | **$222.38** | **$809.13** |
| **Resend subtotal** | **$20.00** | **$35.00** | **$86.75** | **$380.00** |
| Domains (`*.ibookit.lat`, one wildcard) | not fetched — ≤$5/mo, immaterial | | | |
| **TOTAL / month** | **$70.00** | **$263.23** | **$539.21** | **$1,631.10** |
| **per gym, USD** | $0.700 | $0.526 | $0.539 | **$0.544** |
| **per gym, MXN @ 17.455892** | **12.22** | **9.19** | **9.41** | **9.49** |
| **% of 300 MXN floor** | 4.07% | 3.06% | 3.14% | **3.16%** |
| **% of 1,500 MXN ceiling** | 0.81% | 0.61% | 0.63% | **0.63%** |

### 7.4 The same curve if activation actually works (α = 100%)

The product's *purpose* is to get members onto accounts. If it succeeds, MAU is no longer $0:

| G | MAU | overage | Supabase | Vercel* | Resend* | **TOTAL** | $/gym | MXN/gym | % of 300 |
|---|---|---|---|---|---|---|---|---|---|
| 1,000 | 200,000 | $325.00 | $555.08 | $222.38 | $86.75 | $864.21 | $0.864 | 15.08 | 5.03% |
| 3,000 | 600,000 | $1,625.00 | $2,066.97 | $809.13 | $380.00 | **$3,256.10** | $1.085 | **18.95** | **6.32%** |

\* held constant; in reality full activation also raises page views and email, so this understates.

**Even at 6.3% of the 300 MXN floor and 1.3% of the 1,500 MXN ceiling, infrastructure cost is not this
business's risk.** I am not going to manufacture one. The risk is §5.3-A.

---

## 8. SENSITIVITY — which single input, wrong by 2×, moves the total most

Baseline **$1,631.10/mo** at 3,000 gyms × 200 members, Y=3, measured activation.

| rank | input | baseline | ×2 | new total | Δ | **Δ%** | conf in baseline |
|---|---|---|---|---|---|---|---|
| **1** | **Page views per gym per month** | 7,000 | 14,000 | $2,610.23 | +$979.13 | **+60.0%** | **modelled** — nobody has measured it |
| 2 | Compute rung required | 2XL $400 | 4XL $950 | $2,181.10 | +$550 | **+33.7%** | **asserted** |
| 3 | Emails per member per month | 1.125 | 2.25 | $1,931.10 | +$300 | **+18.4%** | modelled from repo audit |
| 4 | Page weight (Vercel Fast Data Transfer) | 80 KB | 160 KB | $1,883.10 | +$252 | **+15.5%** | modelled |
| 5 | Activation rate α | 4.3% | 8.6% | $1,631.10 | $0 | 0% (still under 100k MAU) | **measured** |
| 6 | Members per gym M (exogenous) | 200 | 400 | ~$2,830 | +$1,199 | +73.5% | given by mandate |
| 7 | DB bytes per member per year | 0.0563 MB | 0.1126 | $1,639.78 | +$8.68 | **+0.53%** | modelled from measured widths |
| 8 | Supabase egress per page | 13 KB | 26 KB | $1,631.10 | $0 | **0%** | modelled — still under 250 GB |
| — | activation α, **regime change** 4.3% → 100% | — | — | $3,256.10 | +$1,625 | **+99.6%** | measured today, unknowable at scale |
| — | `gym_membership` policy merge, present/absent | — | — | unusable at 33 gyms | ∞ | **∞** | **measured** — binary, not a 2× input |

**Read this straight: the input the owner should measure next is PAGE VIEWS PER GYM PER MONTH.** It is
the largest 2× swing in the model (+60%), it is the input with the *weakest* evidence behind it, and it
is observable today for $0 — Vercel Web Analytics is a toggle on the Pro plan already being paid for
($0.03/1K events beyond none included; at 7,000 page views × 3,000 gyms that is $630/mo at full scale,
so sample one month at 4 gyms, not permanently).

Second: **compute sizing**, whose baseline is asserted, not measured, and moves the total 34%.
Everything the meter-focused analysis worried about — disk, egress, storage, realtime — moves the
total by **0% to 0.5%**.

---

## 9. RECONCILIATION WITH `model-tiers.md`

Read after my derivation was complete. We agree on far more than we differ on, which is the point of
double entry. Every disagreement below goes to the referee.

### 9.1 Where we AGREE (independent confirmation — these numbers should be trusted)

| item | model-tiers | verify:math | verdict |
|---|---|---|---|
| Free tier ends at | ~40 gyms @ Y=1, 14 @ Y=3 | **41 @ Y=1, 14 @ Y=3** | **CONFIRMED** — 2.5% apart, different bytes-per-row derivations |
| Free binder | database size (500 MB) | **database size** | **CONFIRMED**, both falsification-tested |
| Supabase METER bill @ 3,000 gyms | $16.95 | **$16.97** | **CONFIRMED** |
| Team raises zero meter limits | +$574/mo, 0 capacity | **+$574/mo, 0 capacity** | **CONFIRMED** from the same page, re-fetched |
| Storage cost | $0 (0 objects) | **$0** (`count(*)`=0, measured) | **CONFIRMED** |
| Realtime cost | $0 (0 channels) | **$0** (`realtime.subscription`=0, measured) | **CONFIRMED** |
| MAU cost at measured activation | $0 | **$0** | **CONFIRMED** |
| Compute rung @ 3,000 gyms | 2XL, $400 net | **2XL, $400 net** | **CONFIRMED** (arrived at from RAM+disk, they from cache-hit) |
| Supabase subtotal @ 3,000 gyms | $441.97 | **$441.97** | **CONFIRMED to the cent, independently** |
| Compute exempt from Spend Cap | yes | **yes** (re-fetched) | **CONFIRMED** |
| FX | 17.48 (Wise, 07-27) | 17.455892 (open.er-api.com, 07-28) | 0.14% apart — immaterial |
| `ventas(cliente_id)` missing, Seq Scan | EXPLAIN-confirmed | **EXPLAIN-confirmed + advisor-confirmed** | **CONFIRMED** |
| Cost is not the risk | 8.54 MXN/gym fully loaded | **9.49 MXN/gym incl. Vercel** | **CONFIRMED** |

### 9.2 Where we DIFFER — five disagreements, for the referee

**D1 — Free vs Pro. model-tiers: "CONTESTED, unresolved from SQL." Me: RESOLVED = PRO.**
model-tiers §3/§9.3 says the plan question "is not readable from SQL" and leans Micro on a
`shared_buffers` argument it correctly calls inference. **It is readable from SQL.**
`pg_stat_statements` holds 60 `pg_backup_start` + 60 `pg_backup_stop` calls over a 59.43-day window =
one physical base backup per day, uninterrupted (§2). Free has no backups. **I believe mine** — it is
a measured artefact of a running backup schedule rather than a heuristic about a tuning parameter, and
the `shared_buffers` argument is genuinely two-sided (224 MB is 22% of Micro's RAM *and*
`effective_cache_size` 384 MB is 75% of **Nano's**, which cuts the other way; neither settles it).
**Impact:** removes the entire "no backups / 500 MB read-only wall / 7-day pause" risk branch from a
payment-handling system. This is the highest-value delta in this file. Still worth the 10-second
dashboard check.

**D2 — the first breaking point. model-tiers: `ventas` scan at ~167 gyms. Me: `gym_membership`
policy-OR at ~33 gyms.** model-tiers does not mention the `gym_membership` multiple-permissive-policy
path anywhere. It is (a) earlier, (b) hit twice per render vs once, (c) **not fixable by an index**,
and (d) EXPLAIN-confirmed with a measured 15.06 µs/row constant. **I believe mine**, and I note it
independently reproduces the brief's `resolverMiembroGym` 10–32-gym claim, which model-tiers also
does not engage with. **These are additive, not competing** — both need fixing.

**D3 — the 282 MB/s scan-rate constant. model-tiers §1.3 calls it "the single most load-bearing
number in this document." I believe it is measuring the wrong thing.** It is derived as
`292.5 blocks × 8,192 B / 8.488 ms` from `mi_membresia()`'s `pg_stat_statements` row. But model-tiers'
own §6.1 states `ventas` is **five 8 KB pages** — so **98.3% of those 292.5 blocks are not the `ventas`
scan.** They are the plpgsql frame, the `clientes` index scan, the `gym` lookup, the `asistencias`
count and the PostgREST wrapper — all costs that are **constant in G**. Extrapolating table size with a
blended rate that is 98% fixed overhead understates the scan rate by ~12×. My marginal measurement
(two-point, differenced to cancel fixed overhead) gives **3,422 MB/s warm** (§5.1).
**Consequence:** model-tiers §6.1's latency table is ~12× pessimistic *in the warm regime* and its
§6.3 core-requirement table (16XL saturated at 1,875 gyms) is correspondingly ~12× pessimistic —
its "163.9 cores at 3,000 gyms" is nearer **13.8 cores**, which an 8XL covers.
**But the conclusion survives for a different reason**, and this is the important part: at 3,000 gyms
`ventas` is 5 GB and **cannot be warm** on any instance below 4XL. Once it leaves RAM the rate is the
instance's *disk baseline* — 11 MB/s on Micro, 297 MB/s on 2XL — which is 12–300× *worse* than 282 MB/s.
So model-tiers' 17.9 s at 3,000 gyms is roughly right **by coincidence**: 282 MB/s happens to sit
between the warm and cold rates. **The correct model is three regimes with a cliff at the RAM
boundary (§5.3-B), not a smooth curve.** The practical difference: model-tiers predicts steady
degradation you would notice; my model predicts a step function at ~356 gyms (Y=3, Micro) from 0.35 s
to 55 s, which you would *not* see coming. **I believe mine.** Referee should note both reach "ship
the index"; only the shape of the warning differs.

**D4 — Vercel. model-tiers blind spot #1: "entirely absent … it may exceed the Supabase line."
Me: it does, and by 1.8×.** $809.13/mo at 3,000 gyms vs Supabase's $441.97, **of which $652 is Edge
Requests alone** — the single largest line in the whole stack. model-tiers' guess ("168,000 SSR
invocations/day … not a rounding error") was directionally right but priced the wrong resource:
invocations are $16.20; edge requests are $652. **No conflict — a gap I filled.**

**D5 — what to measure next. model-tiers §7: buffer-cache hit rate (their rank-2 input, 124% swing).
Me: page views per gym per month (my rank-1, 60% swing).** Once Vercel is in the model, page views
drive three separate billed resources (edge requests, invocations, transfer) and dominate. Cache-hit
rate remains my rank-2 proxy (compute rung, 33.7%). **Both are worth monitoring; I would put the
Vercel Analytics toggle first because it is cheaper to obtain and larger in effect.**

**Minor, non-material:** Resend Free ceiling — model-tiers 19 gyms (157.5 emails/gym/mo at 0.7
coverage), me 13 gyms at 1.0 coverage; identical model, different coverage input, and I adopt
model-tiers' 0.7 in §7.2 for consistency. Both agree the 100/day cap binds at ~1 gym-onboarding-day.

### 9.3 Where model-tiers is right and the session brief is STALE

The brief's headline "the missing `ventas(cliente_id)` index makes `mi_membresia()` scale as
**G-squared**" needs a precision note both files should carry: **user-visible latency is linear in G**
(model-tiers' own §6.1 table is correctly linear). It is *aggregate* work — connections held, cores
required — that goes as G², because request rate ∝ G and per-request cost ∝ G. Both files model this
correctly; only the one-line summary is loose.

---

## 10. EXIT TRIGGERS — every "this is fine" above, with the number that reverses it

| claim | reverses when | observation |
|---|---|---|
| Prod is on Pro, backups exist | `pg_backup_start` calls stop advancing ~1/day | `select calls from pg_stat_statements where query like '%pg_backup_start%'` — re-read weekly; must rise by ~7 |
| Storage costs $0 | any `storage.from(` ships | `grep -r "storage.from(" apps/ packages/` in CI |
| Realtime costs $0 | any `.channel(` / `postgres_changes` ships | same grep; then re-price peak connections at $10/1,000 |
| Supabase egress costs $0 | monthly egress > 200 GB (80% of 250) | Supabase usage dashboard |
| Supabase MAU costs $0 | platform MAU > 80,000 | `select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'` |
| Disk cost is negligible | provisioned disk > 400 GB (= $50/mo) | usage dashboard; also alert at `pg_database_size()` > 85% of provisioned |
| 2XL is the right rung | `blks_hit/(blks_hit+blks_read)` < 99% | `select … from pg_stat_database where datname=current_database()` monthly |
| Vercel is ~$809 at 3,000 gyms | measured page views/gym/mo ≠ 7,000 ± 30% | Vercel Web Analytics, one sampled month |
| Cost is < 4% of the 300 MXN floor | total spend ÷ `count(*) from gym` > 12 MXN | invoice ÷ gym count, monthly |
| The `gym_membership` fix worked | `resolverMiembroGym`'s query still Seq Scans after the policy merge | `explain` the two-policy predicate; must become `Index Scan using gym_membership_pkey` |
| The `ventas` index fixed it | `shared_blks_hit/calls` for `mi_membresia` stays > 100 | `pg_stat_statements`, immediately post-deploy |
| Region split is a cost non-issue | Vercel Provisioned Memory line > $50/mo | Vercel usage dashboard — it is a *capacity* issue regardless (§5.3-D) |

---

## 11. BLIND SPOTS — what I did NOT do

1. **The compute rung at 3,000 gyms ($400, my second-largest sensitivity) is ASSERTED.** I sized it
   from DB size vs RAM and disk throughput, not from a load test. There is no way to measure it from a
   read-only session against a 15 MB database. It moves the total 34% on a one-rung error.
2. **I did not model the WRITE path.** `registrar_venta`, `reservar_clase`, `pasar_lista_sesion` and
   22 other write RPCs are absent from every compute number here. `pg_stat_statements` shows one write
   RPC at **13.58 ms mean / 354 calls** — more expensive per call than `mi_membresia` — and at
   3,000 gyms that is ~600,000 ventas/month. My compute sizing does not include it.
3. **7,000 page views/gym/month is modelled, and it is my rank-1 sensitivity.** The anon component
   (35/gym/day) is derived from measured PostgREST calls, but the member (15/member/mo) and admin
   (100/gym/day) components are assumptions on a platform with 5 activated members total.
4. **Vercel's Invocations rate ($0.60/M) came from a worked example in the fluid-pricing doc, not from
   a rate table** — the iad1 regional page has no Invocations line. It is a $16/mo line, so a 2× error
   is immaterial, but it is the weakest-sourced price in §7.
5. **The 68.4 ns/tuple and 15.06 µs/call constants are measured on ONE instance (2-shared-core ARM,
   Micro) with everything in `shared_buffers`.** Dedicated-core instances are faster per core; every
   threshold in §5.3 scales linearly with them.
6. **I did not verify the Supabase Custom Domain add-on price** and therefore excluded it. It is a
   Spend-Cap-exempt infrastructure add-on; if it is per-project it is immaterial, if it is per-domain
   at 3,000 `*.ibookit.lat` hosts it is not. Someone should fetch it.
7. **Seasonality and onboarding bursts are unmodelled.** All my monthly figures are flat averages. A
   January signup surge concentrates invite email and activation into one month and would trip the
   Resend daily cap long before the monthly one.
8. **I did not price Enterprise, PITR storage growth, or backup storage.** PITR's $100/mo is the
   compute line only; retention-window storage bills separately at a rate I did not fetch.
9. **I did not test whether merging the two `gym_membership` SELECT policies actually restores the
   index.** I proved the OR breaks it (EXPLAIN); I did not prove the fix works, because that needs DDL
   and this session is read-only. The fix may need `is_staff_of` rewritten as an inlinable predicate
   rather than a `SECURITY DEFINER` function call.
