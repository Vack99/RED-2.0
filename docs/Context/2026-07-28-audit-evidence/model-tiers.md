# The Tier Calculator — RED 2.0 on Supabase

**Agent:** `model:tiers` · **Date:** 2026-07-27 · **DB:** live prod `hjppxawglmukfvsgmcog`, read-only
**Inputs:** the six sibling evidence files (cited per-input in §1), plus my own live `pg_stat_statements`
reads, plus three primary-source fetches the siblings did not make (Resend pricing, Supabase auth rate
limits, USD/MXN).

---

## 0. THE TWO SENTENCES THE MANDATE ASKED FOR

> **"You can run ≈40 gyms averaging 200 members on the Free tier — after one year of operation; the meter
> that ends it is database size, Supabase's 500 MB cap, which does not send a bill, it flips Postgres to
> read-only (`cannot execute INSERT in a read-only transaction`) for every gym at once."**
> Range across engagement bands and fleet tenure: **10 to 96 gyms.** (§3)

> **"Pro carries you to ≈2,600–3,300 gyms averaging 200 members; the meter that ends it is not a meter at
> all — every Supabase usage meter stays soft-billed overage past 3,000 gyms and totals $17/month there.
> What ends Pro is COMPUTE, which is billed separately, is exempt from Spend Cap, and — with the missing
> `ventas(cliente_id)` index still absent — runs out of purchasable rungs entirely somewhere between 1,900
> and 5,000 gyms. The next step costs $574/month (Pro $25 → Team $599), and it buys SOC 2, ISO 27001,
> 28-day logs and a 24-hour urgent-incident SLA, and changes EXACTLY ZERO meter limits."** (§4, §6)

### And the thing that actually breaks first, before any bill or any tier

Neither of those is the first failure. Anchored on a **live-measured** number, the first thing that breaks
is user-visible page latency, at **~167 gyms** (mature fleet) to **~502 gyms** (young fleet) — a full
second added to every member's `/reservar` load — and the entire cause is one missing index. (§6.1)

---

## 1. INPUTS — every constant, its value, its provenance, and its confidence

### 1.1 Pricing constants (all fetched 2026-07-27; I did not restate any from memory)

| Constant | Free | Pro | Team | Source | Conf |
|---|---|---|---|---|---|
| Plan base | $0 | **$25/mo** (incl. $10 compute credit) | **$599/mo** | `price-meters.md §1` ← supabase.com/pricing | measured |
| MAU included | 50,000 | 100,000 | 100,000 | `price-meters.md §1` | measured |
| MAU overage | n/a | **$0.00325/MAU** | $0.00325 | `price-meters.md §1`, `price-gotcha.md §5` | measured |
| DB/disk | **500 MB DB cap** (read-only at cap) | 8 GB gp3 incl. | 8 GB | `price-meters.md §3` ← docs/platform/database-size | measured |
| Disk overage | n/a | **$0.125/GB-mo**, billed on **provisioned** not used | same | `price-compute.md §2`, `price-gotcha.md #2` | measured |
| Disk autoscale | none | 90% full → +50%, max 4 events/24 h, **never shrinks** | same | `price-compute.md §2` | measured |
| Egress uncached | 5 GB | 250 GB then **$0.09/GB** | same | `price-meters.md §1` | measured |
| Storage | 1 GB | 100 GB then $0.0213/GB-mo | same | `price-meters.md §1` | measured |
| Edge fn invocations | 500,000 | 2,000,000 then $2/1M | same | `price-meters.md §1` | measured |
| Realtime msgs / peak conn | 2M / 200 | 5M / 500 | same | `price-meters.md §1` | measured |
| Compute ladder | **Nano only, $0** | Micro $10 → 16XL $3,730 | same | `price-compute.md §1` | measured |
| Direct conns by tier | 60 (Nano/Micro) | 90/120/160/240/380/480/490/500/500 | same | `price-compute.md §1` | measured |
| Backups | **none** | 7-day daily | 14-day | `price-meters.md §1` | measured |
| PITR | n/a | $100 / $200 / $400 (7/14/28 d) **+ requires ≥Small compute** | same | `price-gotcha.md §5a` | measured |
| Log retention | 1 day | 7 days | 28 days | `price-gotcha.md §5c` | measured |
| Support SLA | none | **none** | 24 h Urgent, 1 business day High | `price-gotcha.md #3,#4` | measured |
| Uptime SLA | none | none | **none** (Enterprise only) | `price-gotcha.md #3` | measured |
| Spend Cap covers | n/a | 12 usage items | not offered | `price-gotcha.md §0` | measured |
| Spend Cap does NOT cover | — | **Compute, PITR, Replicas, Branching, IPv4, Log Drains, extra IOPS/throughput** | — | `price-gotcha.md §0` | measured |

**Resend (the mail vendor — not Supabase, but a real ceiling in this stack).** Fetched from
`https://resend.com/pricing`, 2026-07-27, by me this session:
Free $0 = 3,000/mo **with a hard 100/day cap**, 1 domain · Pro $20 = 50,000/mo · Pro $35 = 100,000/mo ·
Scale $90 = 100,000/mo + 1,000 domains · Scale $160 = 200,000 · Scale $350 = 500,000 ($0.70/1,000 over) ·
Scale $650 = 1,000,000 ($0.65/1,000 over) · Scale $825 = 1,500,000 · Scale $1,150 = 2,500,000.

**Supabase auth rate limits.** Fetched from `https://supabase.com/docs/guides/auth/rate-limits`, 2026-07-27,
by me this session: built-in mailer **2 emails/hour** (unchangeable without custom SMTP); OTP **30/hour
project-wide**; verification requests 360/hour per IP; token refresh 1,800/hour per IP. This project runs
custom SMTP with `rate_limit_email_sent` set to **50/hour project-wide** (`docs/Context/2026-07-22-invite-mail-capacity-audit.md:42`
— *"Sum of combined requests project-wide"*, one bucket for all tenants).

**FX rate.** **1 USD = 17.48 MXN**, fetched from `https://wise.com/us/currency-converter/usd-to-mxn-rate`
on **2026-07-27** (mid-market). Corroborated by a WebSearch snippet of valutafx.com quoting 17.4839 on
2026-07-24. **Every MXN figure in this document uses 17.48.** Re-run with a different rate by scaling
linearly. Revenue reference restated in USD: **300–1,500 MXN/gym/mo = $17.16–$85.81 USD/gym/mo.**

### 1.2 Workload constants (from the sibling evidence files)

| Symbol | Meaning | Low | Central | High | Source | Conf |
|---|---|---|---|---|---|---|
| `φ` | member MAU fraction of roster (= cumulative-activated × monthly-active) | 0.75% | **10.5%** | 38.5% | `workload-auth.md §6` | modelled from a measured funnel (4.3% platform-wide activated, 0% at the most mature real gym) |
| `s` | staff accounts per gym | 1 | **2** | 4 | `workload-auth.md §6` | measured (every live gym has exactly 1 owner, 0 operators) |
| `f_mem` | MB of new data per member per year | 0.0271 | **0.0543** | 0.1567 | derived by me from `workload-growth.md §2,§3` (decomposition in §2.2 below) | modelled |
| `F_gym` | MB of new data per gym per year, member-independent | 0.61 | **0.815** | 1.78 | `workload-growth.md §2.4, §4` | measured driver (T≈20 weekly slots on both real gyms), modelled bytes |
| `c_mem` | one-time MB per member (`clientes` row) | 0.000875 | **0.000875** | 0.001483 | `workload-growth.md §3` (modelled) / live `pg_class` (measured) | both |
| `C_gym` | one-time MB per gym (catalog tables) | 0.27 | **0.27** | 0.27 | `workload-growth.md §7` | measured |
| `O` | fixed platform overhead MB | 13.4 | **13.4** | 13.4 | `price-compute.md §6` (15 MB live − 1.6 MB content) | measured |
| `v_row` | `ventas` heap bytes/row | 234 | **234** | 234 | live `pg_class`: 40,960 B / 175 rows = **234.1** | **measured** |
| `L_admin` | roster-shipping admin page loads/gym/day | 5 | **15** | 30 | measured floor 5.1/gym/day from `pg_stat_statements` (1,356 roster calls / 66 d / 4 gyms); upper modelled | measured floor, modelled central |
| `P_roster` | bytes of the roster JSON per load | M × 297 | M × 297 | M × 297 | `workload-reads.md §4`: 118.7 raw B/row measured × 2.5 JSON expansion | measured×modelled |
| `E_mail` | emails per member per month | 1.125 | 1.125 | 1.125 | `docs/Context/2026-07-22-invite-mail-capacity-audit.md` (45/mo at 40 members) | modelled |

### 1.3 The measured anchors I pulled this session that nobody else had

```sql
-- live prod, 2026-07-27, read-only
select left(regexp_replace(query,'\s+',' ','g'),120) q, calls,
       round(total_exec_time::numeric,1) total_ms, round(mean_exec_time::numeric,3) mean_ms,
       shared_blks_hit, shared_blks_read
from extensions.pg_stat_statements where query ilike '%mi_membresia%';
```
```
q         : WITH pgrst_source AS (SELECT "pgrst_call".* FROM "public"."mi_membresia"() pgrst_call) ...
calls     : 97
total_ms  : 823.4
mean_ms   : 8.488          <-- 8.5 ms per call on a 15 MB database with a 99.996% cache hit rate
shared_blks_hit  : 28374   <-- 292.5 blocks (2.34 MB of buffer traffic) PER CALL
shared_blks_read : 0
```
```sql
select round(100.0*sum(blks_hit)/nullif(sum(blks_hit)+sum(blks_read),0),3) cache_hit_pct,
       sum(blks_hit) blks_hit, sum(blks_read) blks_read, max(stats_reset) stats_reset
from pg_stat_database where datname = current_database();
-- cache_hit_pct 99.996 | blks_hit 39,888,185 | blks_read 1,593 | stats_reset 2026-05-22 15:13:20+00
```
```sql
select c.relname, pg_relation_size(c.oid) heap_bytes, s.n_live_tup,
       round(pg_relation_size(c.oid)::numeric/s.n_live_tup,1) heap_b_per_row
from pg_class c join pg_stat_user_tables s on s.relid=c.oid where c.relname='ventas';
-- ventas | 40,960 | 175 | 234.1
```
```sql
select name, setting, unit from pg_settings where name in
 ('shared_buffers','effective_cache_size','max_connections','max_parallel_workers','wal_level','archive_mode');
-- shared_buffers 28672 (8kB) = 224 MB | effective_cache_size 49152 (8kB) = 384 MB
-- max_connections 60 | max_parallel_workers 2 | wal_level logical | archive_mode on
```
```sql
select (select count(*) from storage.objects) storage_objects, pg_size_pretty(pg_database_size(current_database())) db;
-- storage_objects 0 | db 15 MB
```

**Derived measured constant — the single most load-bearing number in this document:**

```
effective per-core buffer throughput for the mi_membresia query shape
  = 292.5 blocks × 8,192 B / 0.008488 s
  = 282.3 MB/s          [MEASURED, end-to-end, includes PostgREST wrapper + planning + RLS]
```
This is deliberately conservative as a pure-scan rate (it includes non-scan overhead) and deliberately
*optimistic* as a scaling rate (it is measured with the whole table resident in `shared_buffers`; the
same work against disk on a Micro instance is capped at **11 MB/s**, per `price-compute.md §1`). I model
with 282 MB/s central and 1,000 MB/s as the optimistic bound.

---

## 2. THE CALCULATOR — one formula per meter

Let **G** = number of gyms, **M** = members per gym, **Y** = average years each gym has been operating.
Default scenario throughout: **M = 200, Y = 3, Central/Expected band.**

### 2.1 MAU
```
MAU(G,M) = G × (M × φ + s)
cost     = max(0, MAU − 100,000) × $0.00325       [Pro/Team; Free has no overage, it hard-stops at 50,000]
```
Per-gym MAU at M=200 — Low **2.5** · Expected **23** · High **81**.

| Band | Free ends (50,000 MAU) | Pro overage begins (100,000 MAU) | MAU at 3,000 gyms | overage cost |
|---|---|---|---|---|
| Low | 20,000 gyms | 40,000 gyms | 7,500 | **$0** |
| **Expected** | **2,174 gyms** | **4,348 gyms** | **69,000** | **$0** |
| High | 617 gyms | 1,235 gyms | 243,000 | **$464.75** |

**MAU does not bind at 3,000 gyms in the Low or Expected band.** This contradicts `price-meters.md §8`
which ranks MAU as risk #1 — see §9.

### 2.2 Database size
```
DBused(G,M,Y) = O + G × [ C_gym + M×c_mem + Y×(F_gym + M×f_mem) ]      MB
provisioned   = max(8 GB, 1.35 × DBused)     [the autoscale ratchet averages ~1.35× used; see below]
disk cost     = max(0, provisioned_GB − 8) × $0.125
```
`f_mem` decomposition (I rebuilt this from `workload-growth.md §2` rather than take the aggregate,
so it can be re-run per assumption):

| component | rows/member/yr | B/row (modelled steady-state) | B/member/yr |
|---|---|---|---|
| `asistencias` (1.5 visits/wk × 51.6) | 77.4 | 388 | 30,031 |
| `reservation` (50% booking adoption × 1.15 churn) | 44.5 | 387 | 17,222 |
| `ventas` (1/member/month) | 12 | 562 | 6,744 |
| `clientes` net new (churn replacement) | 0.35 | 875 | 306 |
| **f_mem central** | | | **54,303 B = 0.0543 MB** |

At M=200, central: per-gym-per-year = 0.815 + 200×0.0543 = **11.675 MB**; one-time = 0.27+0.175 = **0.445 MB**.

The `1.35×` provisioned factor: disk autoscales at 90% used and jumps +50%, so provisioned sits between
1.11× and 1.67× used, averaging ~1.35× (`price-compute.md §2`, `price-gotcha.md #2`). **Modelled**, and it
only matters at the $0.125/GB rate, so a 2× error here costs $17/mo at 3,000 gyms.

### 2.3 Egress
```
Egress(G,M) = G × 30 × [ L_admin×(M×297 B) + L_admin×15 KB + (M×φ)×(8/30)×15 KB ]     per month
cost        = max(0, GB − 250) × $0.09
```
At M=200, L_admin=15, Expected: 26.7 + 6.75 + 2.5 = **36 MB/gym/month** (range 15–75).
Free 5 GB → **142 gyms** (68–341). Pro 250 GB → **7,111 gyms** (3,413–17,067).
At M=300 with L_admin=30: 98 MB/gym/mo → Pro overage begins at **2,612 gyms**. Egress is the one
"non-issue" meter that can reach the Pro line inside the target scale, and only under high assumptions.

### 2.4 Compute — TWO regimes, and they are not close
The apps talk to Postgres only through PostgREST (`price-compute.md §3`, grep-verified: zero `pg.Pool` /
`postgres://` in `packages/data`), so `max_connections` is not the app's ceiling. What binds is
**buffer bandwidth** and **PostgREST's internal pool**.

The dominant term is `mi_membresia()`'s unindexed `where cliente_id = X` scan over the whole `ventas`
table — `workload-reads.md §6 Finding A` (EXPLAIN-confirmed `Seq Scan on ventas`), fired on every member's
`/reservar` render, plus the identical scan in `getClienteFicha` on every staff ficha view.

```
ventas_heap(G,M,Y) = G × M × 12 × Y × 234 B                        [v_row MEASURED]
scan_rate(G,M)     = G × (M×φ×8/30 + 20) × 3 / (14×3600)  req/s    [peak: 14 h window, 3× peak factor]
bandwidth_req      = scan_rate × ventas_heap                       B/s
latency_per_call   = ventas_heap / 282 MB/s                        s   [MEASURED per-core rate]
concurrent_conns   = scan_rate × latency_per_call
cores_req          = bandwidth_req / 282 MB/s
```
At M=200: `scan_rate = G × 0.001524 req/s`, `ventas_heap = G×M×12×Y×234 = G × 1.685 MB` (Y=3), so
**everything below scales as G², not G.** That is the shape of this problem: it is a cliff, not a slope.

**With `create index on ventas(cliente_id, created_at desc, id desc)`:** the scan collapses to ~2 index
blocks + 1 heap block ≈ 24 KB regardless of G. `bandwidth_req` at 3,000 gyms falls from **23,112 MB/s to
0.11 MB/s** — a 210,000× reduction — and compute sizing reverts to being driven purely by buffer-cache
hit rate on the whole DB.

### 2.5 Storage · Edge functions · Realtime · Connections
- **Storage: $0 at every scale.** Live: `select count(*) from storage.objects` = **0**; repo grep for
  `storage.from(` = zero hits (re-verified by me this session). Formula: n/a until a media feature exists.
- **Edge functions:** two exist (`activar-cuenta`, `send-email`). Invocations/mo ≈
  `G×M×(activation_ramp/12)×2 + G×M×0.03` (auth-mail hook; invites and receipts bypass it — they POST
  Resend directly from Next.js, `invite-mail-capacity-audit.md`). At 3,000 gyms × 200 members, Expected:
  **≈30,000/month against Free's 500,000** — a 16× headroom on the *Free* allowance. Even the High band
  (70% activation inside one year) reaches ≈88,000/month. **Never binds.**
- **Realtime: $0.** Zero `.channel(` / `postgres_changes` in the repo (re-verified this session).
- **Connections:** with the index, peak concurrent DB work at 3,000 gyms is **0.12 connections**
  against `max_connections = 60`. Without it, see §6.

### 2.6 Auth emails (the meter that lives outside Supabase)
```
emails/month = G × M × 1.125 × coverage        [coverage = fraction of members with an email on file]
```
At M=200, coverage 0.7: **157.5/gym/month**. Free 3,000/mo → **19 gyms**, and Free's **100/day** cap →
**~1 gym-onboarding-day**. At 3,000 gyms: **472,500/month → Resend Scale $350** (500k included), or
$650 for 1M with growth headroom.
Supabase's own `rate_limit_email_sent = 50/hour project-wide` covers only the auth-mail rail
(resets + magic links ≈ M×0.03 = 6/gym/mo): 18,000/month at 3,000 gyms = **25/hour average → binds at
~6,000 gyms on average, but at ~1,200 gyms on any 5× Monday-morning clustering**, and instantly for any
single gym running a >50-signup/hour drive.

---

## 3. FREE TIER — where it ends, meter by meter

M = 200, Expected band, central growth. The Free answer is **tenure-dependent**, so it is a curve, not a point.

| Meter | Free limit | Per-gym consumption | **Gyms at the limit** |
|---|---|---|---|
| **Database size** | **500 MB** (486.6 net of overhead) | 12.12 MB @ Y=1 | **40** |
| " | " | 6.28 MB @ Y=0.5 | 77 |
| " | " | 23.80 MB @ Y=2 | 20 |
| " | " | 35.47 MB @ Y=3 | 14 |
| Egress (uncached) | 5 GB | 36 MB/mo | 142 |
| MAU | 50,000 | 23 | 2,174 |
| Edge fn invocations | 500,000 | ~10/mo | >50,000 |
| Storage | 1 GB | 0 | ∞ |
| Realtime | 2M msgs / 200 conn | 0 | ∞ |
| Compute (Nano, 60 conn) | — | 0.12 conn @ 3,000 gyms | not binding |
| *(Resend Free, not Supabase)* | *3,000/mo, **100/day*** | *157.5/mo* | ***19** (and ~1 onboarding/day)* |

**Answer: ≈40 gyms at 200 members after one year; database size ends it.** Band range **10–96 gyms**
(High band M=300 Y=1 → 10; Low band M=150 Y=1 → 96).

**Falsification — what would have to be true for "DB size is the Free binder" to be wrong?** Two things:
(a) if `reservation` adoption stays at its measured **zero** (`workload-growth.md §1`: 0 activated members
on both real gyms), `f_mem` drops to 0.0271 and the Free DB ceiling moves to ~68 gyms — still below the
egress ceiling of 142, so **DB size still wins**; (b) if `L_admin` is really 30/day at M=300, egress falls
to 51 gyms — still above the 10-gym DB ceiling in that same High band. **I checked both branches: DB size
is the binder in every band I modelled.** The claim survives.

**But the honest first ceiling on the whole stack is Resend Free at ~19 gyms**, and Resend's 100/day hard
cap at roughly **one gym onboarded per day** (a 200-member roster needs 200 invite emails). That is a
$20/month fix (`invite-mail-capacity-audit.md` fix #1) that has not been made.

**Is prod actually on Free? CONTESTED, unresolved from SQL.** `price-compute.md §3/§5#1` concludes Nano/Free
from `AGENTS.md`'s "branching is Pro-gated / 402" and the repo's "free tier = no backups" note.
`price-gotcha.md #4` states RED "runs on Pro today." My own evidence cuts against Free: **`shared_buffers`
= 224 MB.** That is 44% of a Nano's 0.5 GB RAM — a setting no tuner would choose (it starves `work_mem`
and the OS page cache) — and 22% of a Micro's 1 GB, which is textbook. `archive_mode = on` with a
`wal-g wal-push` archive command also shows WAL archiving running. Neither is decisive (Supabase publishes
no `shared_buffers`-per-tier table, and it may archive WAL on all tiers). **This is a 30-second dashboard
check — Organization Settings → Billing — and it should be made before anyone acts on either sibling
file.** It moves the bill by $25/mo (irrelevant) and the risk posture enormously (backups, 7-day
inactivity pause, 1-day logs).

---

## 4. PRO TIER — nothing ends it, and that is the finding

Every Pro meter is soft-billed overage. Not one of them produces a wall at 3,000 gyms.

| Meter | Pro included | Overage begins at (gyms) | Cost at 3,000 gyms |
|---|---|---|---|
| Database size (disk) | 8 GB | **171** | $16.95 |
| MAU | 100,000 | 4,348 (Expected) / 1,235 (High) | $0 / $464.75 |
| Egress uncached | 250 GB | 7,111 (2,612 High) | $0 |
| Storage | 100 GB | never | $0 |
| Edge fn | 2,000,000 | never | $0 |
| Realtime | 5M / 500 | never | $0 |
| **Total metered spend at 3,000 gyms (Expected)** | | | **$16.95** |

**Seventeen dollars.** The entire Supabase *meter* bill for 3,000 gyms × 200 members is $17/month. What
costs money is the plan base and the compute instance underneath it, and compute is (a) not a meter, (b)
explicitly **not covered by Spend Cap** (`price-gotcha.md §0`), and (c) the only thing in this model with a
purchasable ceiling.

**The next step after Pro costs $574/mo (Team, $599 vs $25) and buys ZERO capacity.** Cross-checked
`price-meters.md §1` against `price-gotcha.md §7`: Team's MAU, disk, egress, storage, edge-function,
realtime and compute limits are **identical to Pro's**. Team buys SOC 2 Type II, ISO 27001, AWS PrivateLink,
project-scoped RBAC, platform audit logs, 28-day retention, and a support SLA whose Urgent commitment is
24 hours. **There is no "buy the bigger plan" answer to any capacity question in this model.** Every
capacity answer is a compute rung or an engineering change.

---

## 5. THE COST CURVE

**Scenario:** M = 200 members/gym, Y = 3 years average tenure, Expected engagement band, central growth,
Pro plan, **`ventas(cliente_id)` index shipped.** FX 1 USD = 17.48 MXN (§1.1).

| Meter | 100 gyms | 500 gyms | 1,000 gyms | 3,000 gyms |
|---|---|---|---|---|
| Plan base (Pro) | $25.00 | $25.00 | $25.00 | $25.00 |
| Compute (net of $10 credit) | $5.00 (Small) | $100.00 (Large) | $200.00 (XL) | $400.00 (2XL) |
| Disk — used | 3.48 GB | 17.75 GB | 35.51 GB | 106.51 GB |
| Disk — provisioned (1.35×) | 8 GB (floor) | 23.96 GB | 47.94 GB | 143.79 GB |
| Disk — cost | $0.00 | $2.00 | $4.99 | $16.97 |
| MAU (count) | 2,300 | 11,500 | 23,000 | 69,000 |
| MAU — cost | $0.00 | $0.00 | $0.00 | $0.00 |
| Egress (GB/mo) | 3.5 | 17.6 | 35.2 | 105.5 |
| Egress — cost | $0.00 | $0.00 | $0.00 | $0.00 |
| Storage / Edge fn / Realtime | $0.00 | $0.00 | $0.00 | $0.00 |
| **TOTAL SUPABASE / MONTH** | **$30.00** | **$127.00** | **$229.99** | **$441.97** |
| **Per gym, USD** | $0.300 | $0.254 | $0.230 | **$0.147** |
| **Per gym, MXN @17.48** | **5.24** | **4.44** | **4.02** | **2.57** |
| **% of 300 MXN/gym/mo floor** | 1.75% | 1.48% | 1.34% | **0.86%** |
| **% of 1,500 MXN/gym/mo ceiling** | 0.35% | 0.30% | 0.27% | **0.17%** |

### Fully-loaded, the way a production platform with paying gyms should actually be provisioned

| Line | $/mo at 3,000 gyms | $/gym | MXN/gym | Source |
|---|---|---|---|---|
| Supabase (table above) | $441.97 | $0.147 | 2.57 | this doc |
| PITR 7-day (backups worth the name) | $100.00 | $0.033 | 0.58 | `price-gotcha.md §5a` |
| Resend Scale (500k emails/mo) | $350.00 | $0.117 | 2.04 | resend.com/pricing, 2026-07-27 |
| **Subtotal (Pro plan)** | **$891.97** | **$0.297** | **5.20** | = 1.73% / 0.35% of revenue |
| + Team instead of Pro (SOC 2, audit logs, SLA) | +$574.00 | $0.191 | 3.34 | supabase.com/pricing |
| **Fully loaded (Team plan)** | **$1,465.97** | **$0.489** | **8.54** | = **2.85% / 0.57% of revenue** |

**Cost is not the risk.** Even fully loaded with Team, PITR and Scale-tier email, RED spends **8.54 MXN per
gym per month** against a 300–1,500 MXN price point. This is *lower* than the prior audit's $0.53–1.04/gym/mo
(`docs/Context/2026-07-27-auth-structure-scale-audit.md`), and lower for a specific, evidence-backed reason:
that audit's $845–1,430/mo MAU line assumed 40–100% of the roster is monthly-active; `workload-auth.md §7`
measured 4.3% platform-wide activation and 0% at the most mature real gym. **The MAU line is $0**, not
$845–1,430. See §9.

### The counterfactual: the same curve WITHOUT the `ventas(cliente_id)` index

| Gyms | Compute required (net) | Total Supabase | $/gym | MXN/gym | % of 300 MXN |
|---|---|---|---|---|---|
| 100 | Small $5 | $30.00 | $0.300 | 5.24 | 1.75% |
| 500 | 2XL $400 | $426.99 | $0.854 | 14.93 | 4.98% |
| 1,000 | 8XL $1,860 | $1,889.99 | $1.890 | 33.03 | **11.01%** |
| 2,000 | 12XL $2,790 | $2,826.31 | $1.413 | 24.70 | 8.23% |
| **2,600–3,300** | **16XL saturated** | — | — | — | **NOT PURCHASABLE** |
| 3,000 | 164 cores required; 16XL is 64 | **impossible** | — | — | — |

One `CREATE INDEX` is worth **$1,660/month at 1,000 gyms** and **the difference between existing and not
existing at 3,000**.

---

## 6. THE COMPUTE FINDING IN FULL — why one missing index is the whole model

### 6.1 The first break is latency, not money, and it lands at ~167 gyms

`mi_membresia()` currently costs a **measured** 8.488 ms and 292.5 buffer blocks per call, with 0 disk
reads, on a database where `ventas` is **five 8 KB pages**. That query's dominant cost is a full
sequential scan of `ventas` (`workload-reads.md §6 Finding A`, EXPLAIN-verified; the function is
`SECURITY DEFINER`, so RLS does not even narrow the scan). It fires on **every member's `/reservar`
render**.

```
latency(G) = ventas_heap(G) / 282 MB/s
           = G × M × 12 × Y × 234 B / 282 MB/s
           = G × 5.975 ms                       [M=200, Y=3]
```

| Gyms | `ventas` rows | `ventas` heap | added `/reservar` latency |
|---|---|---|---|
| 4 (today) | 175 | 41 KB | 0.0 ms (measured 8.5 ms total) |
| 100 | 720,000 | 168 MB | **0.60 s** |
| **167** | 1.20M | 281 MB | **1.00 s** |
| 250 | 1.80M | 421 MB | 1.49 s |
| 500 | 3.60M | 842 MB | 2.99 s |
| 1,000 | 7.20M | 1.68 GB | 5.98 s |
| 3,000 | 21.6M | 5.05 GB | **17.9 s** |

At Y=1 (a young fleet) divide by 3: the 1-second regression lands at **502 gyms** instead of 167.
**So: somewhere between 167 and 502 gyms, every member's booking page picks up a full extra second, and
nobody will connect it to a billing meter, because it isn't one.** This is the earliest breaking point
anywhere in this audit, it is anchored on a measured per-call cost rather than a model, and it is fixed by
one index.

### 6.2 The second break is the PostgREST connection pool, at ~1,000–1,500 gyms
```
concurrent_conns(G) = scan_rate(G) × latency(G) = G² × 9.106e-6      [M=200, Y=3]
```
| Gyms | concurrent connections held by this one query |
|---|---|
| 500 | 2.3 |
| 1,000 | 9.1 |
| 1,500 | 20.5 |
| 3,000 | 82.0 |

PostgREST's internal `db-pool` default is **not published anywhere** (`price-compute.md §5#4` searched and
could not find a per-tier table; live it holds 2 of 12 connections today). At a pool of 10 this exhausts at
**1,048 gyms**; at 20, at **1,482 gyms**; and `max_connections` itself (60 on Nano/Micro) is exceeded at
**2,566 gyms**. The symptom is 504s and queued requests, not slow pages — and **buying a bigger instance
does not fix it**, because per-call latency is set by table size, not by core count (`max_parallel_workers`
is 2, so parallel scan buys at best 2×).

### 6.3 The third break is the compute ladder running out
```
cores_req(G) = G² × 0.002568 MB/s / 282 MB/s / 0.5      [50% core budget — you cannot give one query the whole box]
             = G² × 1.821e-5
```
| Gyms | cores required | smallest instance | net $/mo |
|---|---|---|---|
| 250 | 1.1 | Micro/Small (2 shared) | $0–5 |
| 500 | 4.6 | 2XL (8) | $400 |
| 1,000 | 18.2 | 8XL (32) | $1,860 |
| 1,500 | 41.0 | 12XL (48) | $2,790 |
| **1,875** | **64.0** | **16XL — saturated** | $3,720 |
| 3,000 | 163.9 | **does not exist** | — |

At the optimistic 1,000 MB/s/core bound instead of the measured 282, divide by 3.55: the 16XL wall moves to
**~4,990 gyms** and 3,000 gyms needs an 8XL ($1,870). **Honest range for the wall: 1,900–5,000 gyms,
central ~2,600–3,300.**

**Falsification — what would have to be true for this whole finding to be wrong?**
1. *"`ventas` will be cached, so the scan is cheap."* — It IS cached. The 282 MB/s figure is measured with
   `shared_blks_read = 0`. Being cached is already priced in. Uncached it is far worse: a Micro's disk
   throughput is 11 MB/s, so a 5 GB scan would take 7.6 minutes.
2. *"Postgres will parallelise it."* — `max_parallel_workers = 2` (live). Best case 2×, and it consumes
   more cores, not fewer, for the same total work.
3. *"`/reservar` isn't loaded that often."* — At the Expected band each active member loads it 8×/month;
   that is 5.6 loads/gym/day. The admin `getClienteFicha` path runs the *same* scan another ~20×/gym/day
   (`workload-reads.md §6 Finding A`). I modelled both; the admin path is the larger term.
4. *"1 sale/member/month is too high."* — `workload-growth.md §2.3` measured 30–31-day repeat-purchase
   gaps on the only real gym, matching the `vigencia_dias=30` product. If the true cadence is half that,
   every threshold above moves out by exactly 2× — the 16XL wall goes from ~1,875 to ~2,650 gyms. It does
   not go away.
5. *"Adding the index will bloat storage."* — `workload-growth.md §3` prices it at +62 B/row on `ventas`:
   **+$1.68/month at 3,000 gyms.** Against $1,660–3,500/month of avoided compute.

**I checked all five. The finding survives all five.**

### 6.4 What compute costs WITH the index
With the scan gone, compute sizing is driven purely by buffer-cache hit rate against a ~106 GB database.
Working set is genuinely small (each gym reads only its own rows; a peak hour might have ~300 gyms active
× ~5 MB hot each ≈ 1.5 GB), so **XL (16 GB RAM, $210) to 4XL (64 GB, $960)** is the honest band, central
**2XL ($410)**. I used 2XL in §5. **This is the least-certain number in the entire cost model and it is
also the largest — see §7.**

---

## 7. SENSITIVITY — which single input, wrong by 2×, moves the total most

Baseline: **$441.97/month** at 3,000 gyms × 200 members, Y=3, Expected band, index shipped.

| Rank | Input | Baseline | ×2 value | New total | Δ | **Δ%** | Confidence in baseline |
|---|---|---|---|---|---|---|---|
| 1 | **Members per gym `M`** | 200 | 400 | ~$1,105 | +$663 | **+150%** | given by mandate (150–300 range) |
| 2 | **Compute size required** (cache-hit sizing) | 2XL $400 | 4XL $950 | $991.97 | +$550 | **+124%** | **asserted** — not measurable from here |
| 3 | Fleet tenure `Y` (if it forces a rung) | 3 yr | 6 yr | $458.94 → $1,008.94 | +$17 to +$567 | +4% to +128% | assumed |
| 4 | MAU engagement `φ` | 10.5% | 21% | $545.97 | +$104 | +24% | modelled from a measured funnel |
| 5 | DB growth `f_mem` | 0.0543 MB/mem/yr | 0.1086 | $458.94 | +$17 | +4% | modelled |
| 6 | bytes/row (modelled → measured, +44%) | modelled | measured | $449.4 | +$7 | +2% | measured |
| 7 | Egress per gym `L_admin` | 15 loads/day | 30 | $441.97 | $0 | **0%** | still under 250 GB |
| 8 | Email coverage (Resend line, not Supabase) | 0.7 | 1.0 | Scale $350 → $650 | +$300 | +68% of the email line | modelled |
| — | **`ventas` index present/absent** | present | absent | **not purchasable** | ∞ | **∞** | **measured** (binary, not a 2× input) |

**Read this straight:** two inputs dominate — `M` (which the owner does not control; it is set by the market)
and **compute sizing** (which nobody has measured). Everything the previous audit worried about — MAU,
disk, egress — moves the bill by **0% to 24%** on a 2× error. **The thing to measure next is buffer-cache
hit rate as the fleet grows**, because it is the only input with a >100% swing that is also observable:

```sql
-- run monthly; today it reads 99.996
select round(100.0*sum(blks_hit)/nullif(sum(blks_hit)+sum(blks_read),0),3)
from pg_stat_database where datname = current_database();
```

---

## 8. FORCED RANKING — the 5 worst things about RED's tier position, worst first

**1. One missing index converts the only uncapped, ceiling-bearing meter (compute) from a $210–410/mo line
into an unpurchasable wall — and it degrades as G², so it will look fine right up until it doesn't.**
Measured: `mi_membresia()` = 292.5 buffer blocks and 8.488 ms per call at 175 `ventas` rows, 0 disk reads
(`pg_stat_statements`, live). EXPLAIN-confirmed `Seq Scan on ventas` with no `gym_id` filter
(`workload-reads.md §6 Finding A`). **Breaks at:** ~167 gyms (a full second on every `/reservar`),
~1,000–1,500 gyms (PostgREST pool exhaustion), ~1,900–5,000 gyms (16XL saturated — no larger instance
exists). Confidence: **measured** anchor, **modelled** projection. **Exit trigger:** ship
`create index on ventas(cliente_id, created_at desc, id desc)`, re-run the two EXPLAINs in
`workload-reads.md §6`, and confirm Index Scan replaces Seq Scan; then re-read
`pg_stat_statements.shared_blks_hit/calls` for `mi_membresia` and confirm it drops below ~30 blocks/call.
That single number is the whole finding, before and after.

**2. There is no "buy the next tier" answer to anything — Team costs $574/mo more than Pro and raises
zero meter limits.** Cross-verified `price-meters.md §1` against `price-gotcha.md §7`: MAU 100,000, disk
8 GB, egress 250 GB, storage 100 GB, edge fn 2M, realtime 5M/500 — identical on both plans. **Breaks at:**
the first capacity conversation where someone reaches for the plan dropdown instead of an index. Every
capacity answer in this model is compute or engineering. Confidence: **measured** (both vendor pages).
**Exit trigger:** Supabase publishing a Team-tier meter that exceeds Pro's — recheck supabase.com/pricing
at each plan-change decision.

**3. The Free tier ends at ~40 gyms on database size — and it is genuinely unresolved whether production
is on it right now.** Two sibling agents reached opposite conclusions from the same repo
(`price-compute.md §3`: Nano/Free; `price-gotcha.md #4`: Pro). My own live read — `shared_buffers = 224 MB`,
which is 44% of a Nano's RAM and 22% of a Micro's — leans Micro/paid, contradicting `price-compute.md`.
**Breaks at:** ~40 gyms (500 MB → read-only for every gym at once), or immediately if the answer is Free,
because Free has no backups, 1-day log retention, and a 7-day inactivity pause while real gyms take real
money. Confidence: the 40-gym number is **modelled** from measured bytes/row; the plan question is
**unresolved**. **Exit trigger:** Supabase dashboard → Organization Settings → Billing. Thirty seconds.
Nothing downstream of it should be acted on until it is answered.

**4. The cost model's largest lever is the one input nobody has measured, and it is not any of the meters
the previous audit ranked.** Compute sizing moves the total by **124%** on a 2× error (§7); MAU moves it
by 24%, disk by 4%, egress by 0%. Compute sizing is driven by buffer-cache hit rate on a shared
multi-tenant database, which today reads **99.996%** on a 15 MB database — a number that tells you nothing
about a 106 GB one. **Breaks at:** whenever `cache_hit_pct` starts falling; nobody is watching it.
Confidence: **measured** today, **asserted** at scale. **Exit trigger:** the `pg_stat_database` query in
§7, monthly. Below 99%, the 2XL assumption is being falsified in real time and the compute line needs
re-sizing before the invoice tells you.

**5. Resend — not Supabase — is the first vendor ceiling on the whole stack, and it can suspend every
gym's mail at once.** Fetched 2026-07-27: Resend Free is 3,000/month **with a hard 100/day cap**. At 200
members/gym and 70% email coverage that is **19 gyms**, and the daily cap binds at roughly **one gym
onboarded per day** (a 200-member roster = 200 invite emails). Worse, per
`docs/Context/2026-07-22-invite-mail-capacity-audit.md`, all gyms share one sending domain, one account,
and one bounce budget (<4% bounce, <0.08% complaint, *"account may be shutdown without warning"*) against a
lifetime denominator of 28 stamped invites. **Breaks at:** ~19 gyms on volume; **today** on the bounce
budget. Confidence: **measured** (vendor pricing page + repo audit). **Exit trigger:** the $20/mo Resend Pro
upgrade removes both volume ceilings with zero code — do it before the third gym onboards in one day.

**Honest counterpoint, stated plainly (Rule 7).** Five of Supabase's seven usage meters are genuinely
non-issues at 3,000 gyms and I am not going to manufacture a concern about them: **Storage $0** (live
`count(*) from storage.objects` = 0), **Realtime $0** (zero `.channel(` in the repo, re-verified),
**Edge functions $0** with 16× headroom on the *Free* allowance, **Egress $0** on Pro even at 3,000 gyms,
and **MAU $0** at 3,000 gyms in both the Low and Expected bands. The total Supabase *meter* bill for
3,000 gyms × 200 members is **$16.95/month**. Supabase's metering model is not what threatens this
business, and a report that padded it into one would be lying to the owner. What threatens it is one
`CREATE INDEX`.

---

## 9. WHERE I CONTRADICT THE OTHER AGENTS

**9.1 vs `price-meters.md §8` — "MAU is the meter most certain to bind, breaking at 494–1,111 gyms."**
That model assumes a **monthly activation rate of 40–90% of roster**. `workload-auth.md §5` measured the
funnel live: **4.3% of the platform's roster has ever completed activation, and the most mature real gym
(`forge`, ~2 months, 33 paying members, 13 invites sent) has 0 completions.** There is no batch-invite path
(`invite-mail-capacity-audit.md`), so the stock cannot catch up. The two models differ by **4–50×**, and
only one of them is derived from data. I use `workload-auth`'s bands, which put MAU at **$0** at 3,000
gyms in the Low and Expected bands and $464.75 in the High band. `price-meters.md §7a` is not wrong about
the *arithmetic*; its input is an assumption where an observation exists.

**9.2 vs `price-compute.md §6` — "≈240 gyms exhausts the Free 500 MB cap."**
That derivation uses **today's accumulated bytes-per-cliente (8,689 B)** as if it were a steady-state
stock. It isn't: `forge` is 7 weeks old and `red` was seeded 3 days before the audit with zero history
(`workload-growth.md §1`). A member who has been on the platform one year accumulates **55,178 B**
(875 one-time + 54,303/year) — **6.3× more**. Rebuilding the same calculation with the flow model gives
**~40 gyms at Y=1** and **~14 at Y=3**, not 240. `price-compute.md` flagged this direction itself
("the true breaking point is very likely lower than 240 gyms"); I am putting a number on it.

**9.3 vs `price-compute.md §3/§5#1` — "the live production database is on Nano compute, Free plan."**
`shared_buffers = 224 MB` (live) is 44% of a Nano's 0.5 GB RAM and 22% of a Micro's 1 GB. No Postgres
configuration sets `shared_buffers` to 44% of system RAM. This is inference, not a billing-API read, and
`price-gotcha.md #4` independently asserts Pro. **Marked CONTESTED, resolvable only in the dashboard.**

**9.4 vs the prior session's audit (`docs/Context/2026-07-27-auth-structure-scale-audit.md:133`) —
"$845–1,430/mo Auth MAU overage; $1,600–3,100/mo full stack."**
My model gives **$441.97/mo Supabase at 3,000 gyms**, of which **$0 is MAU**, and **$891.97/mo** fully
loaded with PITR and Scale-tier email. The prior figure is 2–7× too high, and its MAU line specifically is
infinity-times too high (it should be zero in the Expected band). I agree with its *verdict* — cost is not
the threat — and my numbers make that verdict stronger, not weaker.

---

## 10. EXIT TRIGGERS — every "this is fine" in this document, with the number that reverses it

| Claim | Reverses when | How to observe |
|---|---|---|
| Storage costs $0 | any `storage.from(` call site ships | `grep -r "storage.from(" apps/ packages/` in CI |
| Realtime costs $0 | any `.channel(` / `postgres_changes` ships | same grep; then re-price peak connections at $10/1,000 — a 5%-of-900k-members live board is $445/mo (`price-gotcha.md §6`) |
| Edge functions cost $0 | invocations pass 1.5M/month (75% of Pro's 2M) | Supabase usage dashboard |
| Egress costs $0 | monthly uncached egress passes 200 GB (80% of 250) | Supabase usage dashboard; recheck at M>250 or if `/vender`-class full-roster pages gain traffic |
| MAU costs $0 | platform MAU passes 80,000 | `select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'` |
| Disk cost is negligible | provisioned disk passes 400 GB (= $49/mo) | Supabase usage dashboard; also alert at `pg_database_size()` > 85% of provisioned to catch a write-storm before the 95% read-only wall |
| 2XL is the right compute size | `cache_hit_pct` < 99% | the `pg_stat_database` query in §7, monthly |
| Connections never bind | `mi_membresia` mean_exec_time > 100 ms | `pg_stat_statements`, monthly — this is the leading indicator for §6.2 |
| Cost is <1% of revenue | total monthly spend / gym count > 15 MXN | invoice ÷ `select count(*) from gym` |
| The `ventas` index fixes it | `shared_blks_hit/calls` for `mi_membresia` stays >100 after the index ships | `pg_stat_statements` immediately post-deploy |

---

## 11. BLIND SPOTS — what I did NOT examine

1. **Vercel is entirely absent from this cost model.** My mandate names Supabase meters. Vercel is the
   other half of the bill (function invocations, function duration, edge requests, bandwidth, and — per
   the `vercel-domain-scale-verdict` memory — a per-domain onboarding ceiling at 3,000+ custom domains).
   Nobody in this audit priced it. At 3,000 gyms × ~56 page loads/gym/day = 168,000 SSR invocations/day,
   this is not a rounding error and it may exceed the Supabase line.
2. **I did not measure PostgREST's actual `db-pool` size.** §6.2's 1,000–1,500-gym pool-exhaustion
   threshold assumes a pool of 10–20 because Supabase publishes no per-tier value (`price-compute.md §5#4`
   searched and found none). If the real pool is 100, that threshold triples. This is the weakest link in
   §6 and it is checkable from the Supabase API-settings page.
3. **The 282 MB/s per-core buffer-throughput constant is derived from ONE query on ONE instance size.**
   It includes PostgREST and RLS overhead, so it understates raw scan rate; and it is measured on a
   2-shared-core ARM box, so a dedicated-core instance is faster per core. Every threshold in §6 scales
   linearly with this number. A proper measurement needs a seeded scratch project, which this read-only
   session could not build.
4. **I did not verify which plan the org is actually on** (§3, §9.3). Everything about backups, log
   retention, project pausing and the 500 MB wall hinges on it, and it is not readable from SQL.
5. **I did not model the write path.** `registrar_venta`, `reservar_clase`, `pasar_lista_sesion` and the
   other 22 write RPCs are absent from every compute number here. Live `pg_stat_statements` shows one write
   RPC at **395.7 blocks/call and 13.43 ms mean** — more expensive per call than `mi_membresia` — but at
   350 calls versus 97 it is currently lower-volume. At 3,000 gyms writes are ~675,000 ventas/month plus
   ~7.2M `clientes` UPDATEs/year (`workload-growth.md §5`), and none of that is in my compute sizing.
6. **I did not model WAL, backup storage, or PITR storage growth.** PITR's $100/mo is the compute line
   only; retention-window storage is billed separately and I did not find its rate.
7. **`schedule_template_week` bytes/row and the `L_admin` central value (15 loads/gym/day) are modelled,
   not measured.** The measured floor is 5.1 loads/gym/day from a 33-member pilot gym with one operator;
   I extrapolated to 15 for a 200-member gym with two. A real number needs Vercel route telemetry.
8. **I did not price Enterprise.** Every Enterprise figure — base price, SSO, HIPAA, >28-day PITR — is
   "Contact Us" and unfetchable (`price-gotcha.md §4.1`). If a franchise customer's procurement demands an
   uptime SLA, the cost of satisfying them is unknown to this entire audit.
9. **Seasonality is unmodelled.** No December/January cycle exists in the live data (oldest gym ~2 months).
   A January signup surge concentrates activation *and* email volume in one month; my flat monthly averages
   would understate the peak that actually trips the Resend daily cap and the 50/hour auth bucket.
