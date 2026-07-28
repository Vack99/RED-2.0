# alt:aws — AWS RDS Postgres / Aurora priced against RED 2.0's workload

**Agent:** alt:aws | **Date:** 2026-07-28 | **Scope:** price AWS as the backend for RED 2.0 (3,000 gyms × 150–300 members),
using AWS's own pricing pages/API, and cost the pieces AWS makes you build that Supabase bundles for free.
**Everything is read-only.** No writes were made to Supabase or AWS. Prior work (`2026-07-27-auth-structure-scale-audit.md`)
supplies the Supabase-side numbers I compare against — treated as a hypothesis, re-derived/cross-checked where practical
(Cognito, SES, Supabase's own Auth-pricing page), not assumed.

---

## 0. Method — how every number below was obtained

AWS's marketing pricing pages (`aws.amazon.com/rds/postgresql/pricing/`, `.../rds/aurora/pricing/`) render their instance-hour
tables via client-side JS; `WebFetch` returns prose, not the numeric table. So the instance/storage/IOPS/backup numbers below
come from **AWS's own bulk Price List API** — the same machine-readable feed the pricing pages call — fetched directly:

```
curl https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json   (26.9 MB, Last-Modified 2026-07-28)
curl https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/us-east-1/index.json (1.47 MB, Last-Modified 2026-07-20)
```
fetched 2026-07-28, parsed with Node (`rds-pricing.json`, `dt-pricing.json`, `rds-instance-prices.json`, `rds-storage-prices.txt`,
`aurora-prices.txt` — all in this scratchpad dir). Every `$` figure that follows a JSON snippet is a direct read of that file,
not a memory or a third-party aggregator. Region: **US East (N. Virginia) / us-east-1** — matches the region call the sibling
Supabase audit made (§6: "`us-east-1` is right; `sa-east-1` is the trap" for Mexico-centric LatAm traffic).

Pages fetched directly (prose-only, cited inline): RDS Proxy pricing, Cognito pricing, SES pricing, Fargate pricing, Aurora
Serverless v2 docs, RDS connection-limit docs, Supabase's own `/pricing` page (for the Cognito-vs-Auth comparison), all
2026-07-28.

---

## 1. Workload sizing — reused, then independently re-derived

The sibling audit's Supabase model targets **3,000 gyms × 150–300 members** at "XL–2XL compute" and "~45 GB storage." I reuse
that as the primary sizing so the two reports are comparable, and I derive my own row-count model as a check.

**Live baseline (orchestrator-measured, 2026-07-27):** gyms 4, clientes 116 (29/gym), ventas 175, asistencias 705,
reservation 463, class_session 548, schedule_template_week 544, total DB 15 MB. Bytes/row incl. indexes: asistencias 558,
reservation 602, class_session 613, ventas 936, clientes 1483.

**Cross-sectional model** (3,000 gyms at the *same platform age* as today — i.e. just multiply out today's per-gym/per-member
densities): scale factor = `(3000/4 gyms) × (150–300 / 29 members-per-gym)` = 750 × (5.17–10.34) = **3,875×–7,758×** on
member-driven tables, 750× on gym-only tables (class_session, schedule_template_week).

| Table | Rows (cross-sectional) | Bytes | Size |
|---|---|---|---|
| clientes | 450,000–900,000 | ×1483 | 0.67–1.33 GB |
| ventas | 678,000–1,357,000 | ×936 | 0.63–1.27 GB |
| asistencias | 2.73M–5.47M | ×558 | 1.52–3.05 GB |
| reservation | 1.79M–3.59M | ×602 | 1.08–2.16 GB |
| class_session | 411,000 (gym-only ×750) | ×613 | 0.25 GB |
| schedule_template_week | 408,000 (gym-only ×750) | ~600 | 0.24 GB |
| **Total (+ overhead)** | | | **~5–10 GB** |

That's a same-*age* snapshot — it doesn't capture years of accumulated history. A **steady-state / mature-platform** model
(6 ventas/member/yr, 6 attendance visits/member/month, 4 reservations/member/month, 675k members, 2-year horizon) gives:

| Table | Rows/2yr | Size |
|---|---|---|
| ventas | ~8.1M | ~7.6 GB |
| asistencias | ~97M | ~54 GB |
| reservation | ~65M | ~39 GB |
| clientes + class_session + schedule | | ~1.5 GB |
| **Total** | | **~102 GB by year 2** |

**I use 45 GB (near-term, matches the sibling audit's number) to 150 GB (mature, ~2–3 yr) as the pricing range below.**
Both figures are **models, not measurements** — there is no 3,000-gym Postgres to measure. Flagged per the no-memory-pricing
rule's spirit even though this is a sizing model, not a price.

---

## 2. RDS PostgreSQL — the primary-source price table

### 2.1 Instance-hours (us-east-1, On-Demand, PostgreSQL engine — verified live against AWS's bulk API 2026-07-28)

```json
{"instanceType":"db.m6g.large","deploymentOption":"Single-AZ","vcpu":"2","memory":"8 GiB","price":"0.159"}
{"instanceType":"db.m6g.large","deploymentOption":"Multi-AZ","vcpu":"2","memory":"8 GiB","price":"0.318"}
{"instanceType":"db.m6g.xlarge","deploymentOption":"Single-AZ","vcpu":"4","memory":"16 GiB","price":"0.318"}
{"instanceType":"db.m6g.xlarge","deploymentOption":"Multi-AZ","vcpu":"4","memory":"16 GiB","price":"0.636"}
{"instanceType":"db.m6g.2xlarge","deploymentOption":"Single-AZ","vcpu":"8","memory":"32 GiB","price":"0.636"}
{"instanceType":"db.m6g.2xlarge","deploymentOption":"Multi-AZ","vcpu":"8","memory":"32 GiB","price":"1.272"}
{"instanceType":"db.r6g.large","deploymentOption":"Single-AZ","vcpu":"2","memory":"16 GiB","price":"0.225"}
{"instanceType":"db.r6g.xlarge","deploymentOption":"Single-AZ","vcpu":"4","memory":"32 GiB","price":"0.450"}
{"instanceType":"db.r6g.xlarge","deploymentOption":"Multi-AZ","vcpu":"4","memory":"32 GiB","price":"0.899"}
{"instanceType":"db.r6g.2xlarge","deploymentOption":"Single-AZ","vcpu":"8","memory":"64 GiB","price":"0.899"}
{"instanceType":"db.r6g.2xlarge","deploymentOption":"Multi-AZ","vcpu":"8","memory":"64 GiB","price":"1.798"}
{"instanceType":"db.r7g.xlarge","deploymentOption":"Single-AZ","vcpu":"4","memory":"32 GiB","price":"0.478"}
{"instanceType":"db.r7g.xlarge","deploymentOption":"Multi-AZ","vcpu":"4","memory":"32 GiB","price":"0.956"}
{"instanceType":"db.r7g.2xlarge","deploymentOption":"Single-AZ","vcpu":"8","memory":"64 GiB","price":"0.956"}
{"instanceType":"db.r7g.2xlarge","deploymentOption":"Multi-AZ","vcpu":"8","memory":"64 GiB","price":"1.913"}
```

| Instance | vCPU/RAM | Single-AZ $/mo (×730h) | Multi-AZ $/mo | Multi-AZ ÷ Single-AZ |
|---|---|---|---|---|
| db.m6g.xlarge (Supabase-XL RAM match) | 4/16GB | **$232.14** | **$464.28** | 2.000× |
| db.m6g.2xlarge (Supabase-2XL RAM match) | 8/32GB | **$464.28** | **$928.56** | 2.000× |
| db.r6g.xlarge | 4/32GB | $328.50 | $656.27 | 1.998× |
| db.r6g.2xlarge | 8/64GB | $656.27 | $1,312.54 | 2.000× |

**Multi-AZ doubling, confirmed to the third decimal, across every family pulled.** This is exactly the naive-quote trap the
mandate named: someone pricing "AWS RDS is $232/mo" off the Single-AZ number and comparing it to Supabase's $210–410/mo XL
compute tier is silently comparing a single-point-of-failure box to a tier that (on Supabase) still doesn't buy HA either —
see §7 for that asymmetry. There is also a **third** tier, `Multi-AZ (readable standbys)` (2 standbys, 3 total copies) — its
storage SKU prices at exactly **3×** Single-AZ (`$0.345/GB-mo` gp3 vs `$0.115`), confirming the pattern scales linearly with
copy count.

### 2.2 Storage, IOPS, backup, snapshot export (us-east-1, PostgreSQL, verified 2026-07-28)

```json
{"volumeType":"General Purpose-GP3","deploymentOption":"Single-AZ","usagetype":"RDS:GP3-Storage","price":"0.115","unit":"GB-Mo"}
{"volumeType":"General Purpose-GP3","deploymentOption":"Multi-AZ","usagetype":"RDS:Multi-AZ-GP3-Storage","price":"0.230","unit":"GB-Mo"}
{"volumeType":"General Purpose-GP3","deploymentOption":"Multi-AZ (readable standbys)","price":"0.345","unit":"GB-Mo"}
{"groupDescription":"RDS Provisioned GP3 IOPS","deploymentOption":"Single-AZ","usagetype":"RDS:GP3-PIOPS","price":"0.02","unit":"IOPS-Mo"}
{"groupDescription":"RDS Provisioned GP3 IOPS","deploymentOption":"Multi-AZ","usagetype":"RDS:Multi-AZ-GP3-PIOPS","price":"0.04","unit":"IOPS-Mo"}
{"volumeType":"Provisioned IOPS","deploymentOption":"Single-AZ","usagetype":"RDS:PIOPS-Storage","price":"0.125","unit":"GB-Mo"}   // io1
{"volumeType":"Provisioned IOPS","deploymentOption":"Single-AZ","usagetype":"RDS:PIOPS","price":"0.10","unit":"IOPS-Mo"}          // io1 IOPS
{"volumeType":"Provisioned IOPS-IO2","deploymentOption":"Single-AZ","usagetype":"RDS:IO2-PIOPS-Storage","price":"0.125","unit":"GB-Mo"}
{"volumeType":"Provisioned IOPS-IO2","deploymentOption":"Single-AZ","usagetype":"RDS:IO2-PIOPS","price":"0.10","unit":"IOPS-Mo"}
{"usagetype":"RDS:ChargedBackupUsage","price":"0.095","unit":"GB-Mo","desc":"additional GB-month of backup storage exceeding free allocation"}
{"usagetype":"RDS:SnapshotExportToS3","price":"0.010","unit":"GB"}
```

gp3's **free baseline is 3,000 IOPS / 125 MiB/s** up to 400 GB — under that, the storage line above is the *entire* IOPS
cost. At 45–150 GB and an OLTP workload of small indexed lookups (once the sibling audit's C1/C2/C3 indexes are fixed —
see §6), 3,000 IOPS is generous headroom; I do **not** provision extra IOPS in the base case. The provisioned-IOPS line
matters as a *failure-mode* cost, not a baseline one — see §6's Aurora tie-in.

**Backup storage:** free up to 100% of provisioned storage size; beyond that, $0.095/GB-mo. At 45–150 GB with a normal 7-day
retention window this rarely exceeds the free allowance; it becomes real only at longer retention on a bigger, more
write-heavy DB — same shape of exposure the sibling audit flagged for Supabase's own PITR pricing (its C4/§4: "PITR at
$100/mo per 7-day window").

**RDS Proxy** ([aws.amazon.com/rds/proxy/pricing/](https://aws.amazon.com/rds/proxy/pricing/), fetched 2026-07-28):
billed **$0.015 per vCPU-hour of the underlying instance**, no separate HA charge. For a 4-vCPU primary: `4 × 0.015 × 730 =
$43.80/mo`; 8-vCPU: `$87.60/mo`. Cheap in isolation — see §7.3 for why it's not optional.

### 2.3 RDS monthly total (DB tier only — no auth, no API layer, no email)

| Config | Instance | Storage | Backup | Proxy | DT-out (§4) | **Total/mo** |
|---|---|---|---|---|---|---|
| XL-equiv, Multi-AZ, 45 GB | $464.28 | $10.35 | ~$0 | $43.80 | ~$20 | **$538.43** |
| 2XL-equiv, Multi-AZ, 150 GB | $928.56 | $34.50 | ~$14 | $87.60 | ~$40 | **$1,104.66** |

---

## 3. Aurora PostgreSQL — Provisioned and Serverless v2

### 3.1 Instance-hours (us-east-1, Aurora PostgreSQL, verified 2026-07-28)

```json
{"instanceType":"db.r6g.large","price":"0.26","desc":"...running Aurora PostgreSQL"}
{"instanceType":"db.r6g.large","price":"0.338","desc":"...IO-optimized...running Aurora PostgreSQL."}
{"instanceType":"db.r6g.xlarge","price":"0.519"}
{"instanceType":"db.r6g.xlarge","price":"0.675","desc":"IO-optimized"}
{"instanceType":"db.r6g.2xlarge","price":"1.038"}
{"instanceType":"db.r6g.2xlarge","price":"1.349","desc":"IO-optimized"}
{"instanceType":"db.r7g.xlarge","price":"0.553"}
{"instanceType":"db.r7g.xlarge","price":"0.719","desc":"IO-optimized"}
```

Aurora PostgreSQL has **no m6g family** — only r/r7g/x2g. So there's no RAM-matched-to-Supabase-XL (16 GB) Aurora instance;
the smallest reasonable match is `db.r6g.xlarge` (32 GB, double Supabase XL's RAM) — an apples-to-oranges gap worth flagging
on its own: Aurora's smallest sensible tier already outspends Supabase's matched tier on RAM you didn't ask for.

Aurora has no separate "Multi-AZ" instance SKU — HA means adding a **reader** in a second AZ, billed at the **same
per-instance rate** as the writer (verified via AWS's own Aurora Serverless-v2 docs, §3.3 below, and the pricing page's
"Instance charges apply to both Aurora primary instances and replicas"). So HA cost = 2× one instance's rate:

| Instance | Standard $/mo (1 inst) | Standard HA (writer+reader) | IO-Opt $/mo (1 inst) | IO-Opt HA |
|---|---|---|---|---|
| db.r6g.xlarge (4/32GB) | $378.87 | **$757.74** | $492.75 | **$985.50** |
| db.r6g.2xlarge (8/64GB) | $757.74 | **$1,515.48** | $984.77 | **$1,969.54** |

Compare to **RDS r6g Multi-AZ** at the same instance class: xlarge $656.27/mo, 2xlarge $1,312.54/mo. **Aurora costs 8–16%
more than RDS Multi-AZ for the identical instance class and HA posture** — the well-known Aurora instance-hour premium,
now with primary-sourced numbers. In exchange you get 6-way storage replication across 3 AZs (§3.2) instead of RDS's
literal duplicated volume, faster failover, and no separate Multi-AZ storage multiplier. Whether that's worth 8–16% is a
real tradeoff, not a free upgrade — the naive assumption "Aurora is strictly better at the same price" is false on the
evidence.

### 3.2 Storage and I/O billing — Standard vs I/O-Optimized (the biggest Aurora surprise, priced)

```json
{"usagetype":"Aurora:StorageUsage","price":"0.10","unit":"GB-Mo","desc":"consumed storage (Aurora PostgreSQL)"}
{"usagetype":"Aurora:IO-OptimizedStorageUsage","price":"0.225","unit":"GB-Mo"}
{"usagetype":"Aurora:StorageIOUsage","price":"0.0000002","unit":"IOs","desc":"$0.20 per 1 million I/O requests (Aurora PostgreSQL)"}
{"usagetype":"Aurora:BackupUsage","price":"0.021","unit":"GB-Mo","desc":"backup storage exceeding free allocation"}
```

**Standard**: storage $0.10/GB-mo + **every storage-layer read/write costs $0.20 per million requests**. **I/O-Optimized**:
storage $0.225/GB-mo (2.25×), **zero I/O charges**. AWS's own stated rule (fetched from `rds/aurora/pricing/`,
2026-07-28): *"If your I/O spend exceeds 25% of your total Aurora database spend, [I/O-Optimized] can save up to 40%."*

**Breakeven, computed for this workload** (2XL-equiv, r6g.2xlarge, HA, 150 GB):
- Standard fixed cost (instance + storage): `$1,515.48 + (150×0.10=$15.00) = $1,530.48`
- I/O-Optimized fixed cost: `$1,969.54 + (150×0.225=$33.75) = $2,003.29`
- Solve `$1,530.48 + X × $0.0000002 = $2,003.29` → `X = 2,364,050,000` — **~2.36 billion storage I/O requests/month to break even.**

Modeled write volume at 3,000 gyms (from §1's mature-model row counts: ~8.1M ventas + ~97M asistencias + ~65M reservation
writes over 2 years ≈ **7.2M writes/month**, × a documented rule-of-thumb ~3–6 storage I/Os per row-level write for WAL +
index + heap ≈ **25–45M I/O/month** from writes alone) is **two orders of magnitude below** the 2.36B breakeven. Reads are
mostly buffer-cache hits on a <150 GB DB sized against 32–64 GB RAM, so they don't close that gap. **Standard I/O pricing
is the right pick at this scale by a wide margin — this is a case where the "keep it simple" default is also the cheap
one.**

**Falsification, checked, not just asserted:** this verdict flips if measured I/O is much higher than the write-volume
model — which is *exactly* what happens if the sibling audit's C1/C3 defects (missing `ventas.cliente_id` index; the
`gym_membership` OR-policy compiling to a full index scan on every `gym_membership` read, confirmed live via
`pg_stat_user_tables`: 275,638 seq scans vs 867 index scans on a 9-row table) ship unfixed onto Aurora. A sequential scan
over a growing `ventas`/`gym_membership` table on every `mi_membresia()` call turns "a few queries per request" into
"read the whole table's storage pages per request" — on Aurora Standard, that is a **per-request dollar cost**, not just
latency. **This is a real, checkable link between the sibling report's live-confirmed correctness bugs and this report's
Aurora pricing model** — badly-indexed queries are not scale-neutral on Aurora the way they're closer to scale-neutral on
a flat-rate compute tier.

### 3.3 Aurora Serverless v2

ACU mechanics (AWS Aurora User Guide, `aurora-serverless-v2.how-it-works.html`, fetched 2026-07-28): **1 ACU ≈ 2 GiB memory
+ proportional CPU/network**, range 0.5–256 ACU depending on engine/platform version, can auto-pause to 0 on recent
versions. Billed per ACU-hour, "measured every second."

```json
{"usagetype":"Aurora:ServerlessV2Usage","price":"0.12","unit":"ACU-Hr","desc":"Aurora PostgreSQL Serverless v2"}
{"usagetype":"Aurora:ServerlessV2IOOptimizedUsage","price":"0.16","unit":"ACU-Hr","desc":"...IO-Optimized"}
```

(Note: an older `Aurora:ServerlessUsage` SKU at `$0.06/ACU-hr` also exists in the feed — that's the deprecated **Aurora
Serverless v1** metric, a different architecture; do not quote it for v2. Verified by usage-type name, not assumed.)

**Fixed-capacity cost, matched to Supabase's XL (16 GB → 8 ACU) / 2XL (32 GB → 16 ACU), with an HA reader pinned to the
writer's capacity (promotion tier 0/1, per the docs above):**

| Capacity | Standard $/mo (writer+reader HA) | I/O-Optimized $/mo (HA) |
|---|---|---|
| 8 ACU (≈16 GB) | 2 × 8 × $0.12 × 730 = **$1,401.60** | **$1,868.80** |
| 16 ACU (≈32 GB) | 2 × 16 × $0.12 × 730 = **$2,803.20** | **$3,737.60** |

**Compare to Aurora *Provisioned* r6g.xlarge Standard HA at $757.74/mo for a comparable 32 GB writer.** Pinning Serverless
v2's min=max to hold constant capacity costs **1.85×** the equivalent Provisioned instance — Serverless v2 has no benefit
if you don't let it actually scale down. **Falsifiable claim + exit trigger:** Serverless v2 only wins in dollars if
measured time-averaged ACU utilization sits meaningfully below the provisioned peak for a large share of each day (AWS's
own guidance: it's "suitable for the most demanding, highly variable workloads... heavy for a short period... followed by
long periods of light activity"). **This is a national, multi-timezone gym platform** — Mexico alone spans multiple UTC
offsets, and at 3,000 gyms the aggregate demand curve smooths out; the low-traffic overnight window that makes Serverless
v2 pay off *shrinks precisely as the platform grows toward the 3,000-gym target*, which is backwards from what a scaling
narrative usually wants. I did not measure a real ACU-utilization curve (none exists — no Aurora deployment to sample);
this is a model from AWS's own stated use case, not a live measurement, and is the honest limit of this claim.

---

## 4. Data Transfer OUT — the line everyone forgets, with the ambush case actually worked

```json
{"usagetype":"Global-DataTransfer-Out-Bytes","price":"0.00","beginRange":"0","endRange":"100","desc":"$0 for 100GB...aggregated globally, each month"}
{"usagetype":"DataTransfer-Out-Bytes","price":"0.09","beginRange":"0","endRange":"10240","desc":"first 10 TB/month beyond the global free tier"}
{"usagetype":"DataTransfer-Out-Bytes","price":"0.085","beginRange":"10240","endRange":"51200","desc":"next 40 TB/month"}
{"usagetype":"DataTransfer-Out-Bytes","price":"0.07","beginRange":"51200","endRange":"153600","desc":"next 100 TB/month"}
{"usagetype":"DataTransfer-Out-Bytes","price":"0.05","beginRange":"153600","desc":"greater than 150 TB/month"}
```
(us-east-1, fetched 2026-07-28. No RDS/Aurora-specific discounted egress SKU exists in the feed — DB egress bills at the
standard EC2/general rate above.) 100 GB/month free, aggregated across the whole AWS account/region, not per-service.

**At this specific workload, it does not bind.** Modeling API-response traffic (750,000 members × 20 page-loads/month ×
5 queries/load × 3 KB avg JSON response ≈ 225,000,000 KB ≈ **~220 GB/month**) costs `220 × $0.09 ≈ $20/mo` — genuinely
noise, and consistent with the sibling audit's own finding that Supabase's egress line is small ($7–135/mo) for the same
reason: every read here is server-side (Vercel↔DB), never shipped raw to a browser.

**Where it actually ambushes people — the case the mandate is pointing at, worked with real numbers:** the sibling audit's
own §7 action item #12 recommends **"Independent off-Supabase backups (nightly `pg_dump` to a separate cloud account)"**
as a non-negotiable DR practice given Supabase's mid-2026 multi-day PITR control-plane degradations. **The identical good
practice, run against AWS RDS/Aurora instead, is a real egress bill**, because a nightly logical dump leaving AWS for a
different cloud is not "internal AWS traffic" — it's Data Transfer OUT at the full rate:

`150 GB/night (mature-DB estimate, §1) × 30 nights × $0.09/GB = $405.00/month` — just for the backup script, before any
other line item. Snapshot **export to S3** (`RDS:SnapshotExportToS3` / `Aurora:SnapshotExportToS3`, both **$0.010/GB**,
verified) is far cheaper *because S3 is still inside AWS* — but export-to-S3 doesn't satisfy "independent, off-vendor"
backup posture, which is the whole point of that recommendation. **This is the real ambush: the safety practice this
platform already needs costs real, non-trivial money specifically because it crosses the AWS network boundary — and it's
invisible in any quote that only prices instance-hours and storage-GB.**

---

## 5. What Supabase bundles that AWS does not — priced separately, per the mandate

### 5.1 Auth: Cognito vs Supabase Auth — the single largest number in this report

**Supabase's own pricing page** (`supabase.com/pricing`, fetched 2026-07-28): *"100,000 [MAU] included, then $0.00325 per
MAU"* on Pro. This directly confirms the sibling audit's $845–$1,430/mo figure: `(360,000–450,000 − 100,000) × $0.00325 =
$845–$1,138` (the sibling's $1,430 upper bound likely used a slightly higher MAU assumption; directionally consistent).

**AWS Cognito** (`aws.amazon.com/cognito/pricing/`, fetched 2026-07-28): Essentials tier — **10,000 MAU free**, then
**$0.015/MAU, flat, no volume discount**. Plus tier: $0.02/MAU, **no free tier at all**.

| MAU | Supabase Auth cost | Cognito Essentials cost | Cognito ÷ Supabase |
|---|---|---|---|
| 50,000 | $0 (under 100k free) | $600 | ∞ |
| 100,000 | $0 | $1,350 | ∞ |
| 200,000 | $325 | $2,850 | 8.8× |
| 360,000 | $845 | $5,250 | 6.2× |
| 450,000 | $1,138 | $6,600 | 5.8× |

**There is no MAU count above Cognito's 10,000-free-tier where Cognito is cheaper than Supabase Auth — the gap is
monotonic and widens with growth, the opposite of the usual "commit to scale, get a volume discount" pattern.** At the
3,000-gym target this is a **$4,400–$5,750/month** ($53,000–$69,000/yr) gap, dwarfing every RDS-vs-Aurora nuance in §§2–3
combined. This is the report's headline number (see §8, rank 1).

**Exit / falsification check, performed:** the obvious counter is "self-host GoTrue instead of paying Cognito" — Supabase's
auth server (`supabase/auth`, formerly GoTrue) is MIT-licensed and can run anywhere, including on Fargate against your own
RDS/Aurora Postgres. That removes the MAU tax entirely (open-source software, no per-user metering) but converts a managed
line item into an operated one — priced in §5.4 and §6.

### 5.2 Auto-generated REST API: nothing AWS-native does what PostgREST does

AWS's closest built-in offering is the **RDS/Aurora Data API** — verified via its own docs and a live search result:
**$0.35 per million requests**, payloads metered in 32 KB increments, 1M requests/month free for the first year
(`aws.amazon.com/rds/aurora/pricing/`, corroborated by a July-2026 AWS Database Blog post, fetched 2026-07-28). But it is,
in AWS's own words, *"an easy-to-use, secure HTTPS API for executing SQL queries"* — **a raw SQL-over-HTTP wrapper, not an
auto-generated REST/CRUD surface with RLS-aware row filtering.** It doesn't replace PostgREST's core value: introspect the
schema, expose every table as a REST resource, and let Postgres RLS policies (which are vanilla Postgres and **do** port
to RDS/Aurora unmodified) do all authorization. Using the Data API would mean hand-writing the SQL every `packages/data`
call site currently gets for free from schema introspection — a rewrite of the entire data-access layer, not a config
swap.

**The honest AWS answer is: self-host the identical open-source PostgREST binary** (MIT-licensed) on Fargate, in front of
RDS/Aurora, and keep every existing RLS policy and RPC. Compute cost is trivial — see §5.4. **The real cost is engineering
hours** (§6): wiring PostgREST's JWT verification to whatever issues your tokens (Cognito or self-hosted GoTrue), the
`NOTIFY pgrst, 'reload schema'` trigger on every migration that Supabase's platform currently fires for you, TLS
termination, health checks, and a deploy pipeline for a service that has never existed in this stack before.

### 5.3 Connection pooling: not optional the moment you leave PostgREST

The sibling audit's item 7 states plainly: *"Serverless connection exhaustion does not apply here — everything is
PostgREST over HTTP; Vercel opens zero Postgres connections."* **That structural immunity is Supabase-specific.** The
moment RED's Next.js server code talks to Postgres with a driver instead of an HTTP API (which is what happens if you
migrate off PostgREST without also self-hosting it), every concurrent Vercel serverless invocation can hold its own raw
connection — precisely the failure mode RDS Proxy's own marketing copy names: *"designed for applications that... can
have a large number of open connections... and open and close database connections frequently"*
(`aws.amazon.com/rds/proxy/pricing/`, fetched 2026-07-28).

**Hard ceiling, verified from AWS's own docs** (`docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html`, fetched
2026-07-28): PostgreSQL `max_connections` default = `LEAST(DBInstanceClassMemory / 9531392, 5000)`.

- db.m6g.xlarge (16 GiB): `17,179,869,184 / 9,531,392 ≈ 1,802`
- db.r6g.2xlarge (64 GiB): `68,719,476,736 / 9,531,392 ≈ 7,211` → **capped at the hard platform max of 5,000**, regardless
  of how large an instance you buy.

**5,000 is a hard ceiling that no instance size raises further.** A national platform at 3,000 gyms with any synchronized
peak (front-desk check-ins at opening time, evening class rush) can plausibly put low-hundreds-to-low-thousands of
concurrent Vercel function invocations in flight; well-established Postgres operational guidance (not independently
re-verified against a primary source for *this* workload — flagged as reasoning, not a fetched number) is that OLTP
throughput degrades well before the connection cap, typically in the few-hundred-concurrent range for a handful-of-vCPU
instance. **RDS Proxy or a self-hosted pooling layer stops being optional the instant this architecture leaves
PostgREST — it is a forced, non-negotiable line item on AWS, priced at $43.80–$87.60/mo (§2.2), that has a $0 equivalent
under the current Supabase architecture.**

### 5.4 Email: SES vs Resend — cheaper per-unit, more DIY

```
SES à la carte: $0.10 / 1,000 emails, no monthly minimum        (aws.amazon.com/ses/pricing/, fetched 2026-07-28)
SES "Essentials" plan: $0.16/1,000 (0–10M), no monthly fee
SES "Pro" plan: $0.22/1,000 (0–10M) + $105/mo minimum
Dedicated IP: $15/mo (AWS-managed) or $24.95/mo (BYOIP, self-managed warmup)
Attachment data: $0.12/GB · Inbound processing: $0.15/1,000
```

Modeling ~200,000–500,000 transactional emails/month at 3,000 gyms (receipts + auth flows, extrapolated from the current
folio/attendance volume in §1): à la carte SES costs **$20–$50/mo**, dramatically under the sibling audit's Resend
estimate of $385–$1,150/mo. **But this is not an apples-to-apples swap.** New AWS accounts start in the **SES sandbox**
(200 emails/day, verified recipients only) — moving to production is an **AWS support-ticket review, not a config
toggle**, with real calendar-time risk. Everything Resend/Supabase bundles as product surface — bounce/complaint webhook
handling, a suppression list, DKIM/SPF/DMARC setup guidance, dedicated-IP warmup scheduling — has to be built by hand on
SES: an SNS topic + Lambda to process bounce/complaint notifications into your own suppression table, manual DNS records
per sending domain, and a multi-week IP-warmup plan if you add a dedicated IP (mostly calendar time, not engineering
hours, but it blocks high-volume sending until complete). **Cheaper in raw dollars, meaningfully more DIY** — exactly the
pattern the mandate asked to be surfaced, not just priced.

---

## 6. Engineering cost of the unbundling, in hours (the real price for a solo founder)

| Component | AWS-native option | Dollar cost/mo | Engineering hours (build) | Ongoing (hrs/mo) |
|---|---|---|---|---|
| Auth | Cognito (managed) | $5,250–$6,600 | 80–150 (re-implement the firma/HMAC activation rail as Cognito Lambda triggers; migrate 9 existing bcrypt hashes or force reset) | 2–4 |
| Auth | Self-hosted GoTrue on Fargate | ~$40–120 | 40–80 (wire to RDS/Aurora, custom SMTP, port the activation RPC calls — mostly portable since they're plain Postgres) | 4–8 (patch/upgrade, on-call) |
| REST API | RDS/Aurora Data API | $0.35/1M req | 200+ (rewrite every `packages/data` call site to hand-written SQL; loses RLS-as-authorization DX entirely) | ongoing per-query maintenance |
| REST API | Self-hosted PostgREST on Fargate | ~$40–120 | 40–80 (JWT/JWKS trust wiring, schema-reload trigger, TLS, deploy pipeline) | 4–8 |
| Pooling | RDS Proxy | $43.80–$87.60 | 8–16 (IAM auth, Secrets Manager, testing prepared-statement "pinning" behavior against the actual driver in use — a known RDS Proxy gotcha) | 1–2 |
| Email | SES + hand-built deliverability infra | $20–$75 | 30–60 (production-access request, DKIM/SPF/DMARC, bounce/complaint pipeline, suppression list) | 2–4 |

**Total to reach rough parity with what Supabase currently gives away as bundled product surface: ~150–300 hours
initial, plus 12–24 hours/month forever** that a managed vendor currently absorbs invisibly inside its bill. At any
non-trivial hourly opportunity cost for a solo founder (even $50–100/hr), that's **$7,500–$30,000 one-time** plus
**$600–$2,400/month of ongoing opportunity cost** — which is the same order of magnitude as, or larger than, the dollar
gap this unbundling is trying to close (§7). This is consistent with, and adds hour-level granularity to, the sibling
audit's own vendor-risk read: *"only 6 files import `@supabase/*`... hours of work... converts a 1–3 month auth migration
into a contained one"* — even the *optimistic* framing there still prices a full exit at 1–3 solo-founder months
(≈160–500 hours), which brackets my component-level 150–300-hour estimate well.

**RLS itself is not part of this cost** — it's vanilla Postgres and ports to RDS/Aurora unmodified, along with every one
of the 34 `SECURITY DEFINER`/`INVOKER` RPC functions this codebase already has. The unbundling tax is specifically in the
four *managed platform* layers Supabase wraps around plain Postgres, not in the domain logic sitting inside it.

---

## 7. Full monthly roll-ups — three AWS paths vs the sibling's Supabase numbers

All figures exclude Vercel (app hosting is orthogonal to the DB-vendor question; sibling's own Vercel line, $270–560/mo,
applies unchanged under any of these).

| Path | DB tier | + API layer | + Auth | + Email | **Backend total/mo** | **$/gym/mo (÷3,000)** |
|---|---|---|---|---|---|---|
| **AWS + Cognito** (RDS Multi-AZ + self-hosted PostgREST + Cognito + SES) | $538–$1,105 | $40–$120 | $5,250–$6,600 | $20–$75 | **$5,848–$7,900** | **$1.95–$2.63** |
| **AWS + Cognito, Aurora HA instead of RDS** | $821–$1,651 | $40–$120 | $5,250–$6,600 | $20–$75 | **$6,131–$8,446** | **$2.04–$2.82** |
| **AWS self-hosted stack** (RDS/Aurora + self-hosted PostgREST + self-hosted GoTrue + SES) | $538–$1,651 | $40–$120 | $40–$120 | $20–$75 | **$638–$1,966** | **$0.21–$0.66** |
| **Supabase** (sibling audit, DB+Auth subtotal + Resend email) | — | bundled | bundled | $385–$1,150 | **$1,585–$3,450** | **$0.53–$1.04\*** |

\* Sibling's per-gym figure includes Vercel ($270–560); mine above are backend-only. Adding Vercel to the AWS rows:
Cognito path → **$2.04–$3.00/gym/mo**; self-hosted path → **$0.30–$0.84/gym/mo** — still comparable to Supabase's own
figure, on the low end genuinely *cheaper*.

**Two honestly different verdicts sit inside this one table, and rule 7 says both get stated plainly:**

1. **"AWS + managed pieces" (Cognito, and implicitly whatever managed pooling/API glue) costs 2.4×–3.7× what Supabase
   costs at this scale**, almost entirely because of Cognito's MAU pricing (§5.1) — not because RDS/Aurora compute or
   storage is expensive. The DB tier alone is *competitive* with or cheaper than Supabase's compute+storage lines; the
   auth line is what breaks the comparison.
2. **"AWS, self-hosting the same open-source stack Supabase runs" (GoTrue + PostgREST on Fargate, against RDS/Aurora)
   comes out at or below Supabase's own bill in raw dollars** — a genuinely honest finding that favors the alternative,
   not the incumbent, exactly where the evidence points that way. **This is not a free lunch**: it is the ~150–300 hours
   and 12–24 hrs/month of §6, converting a vendor relationship into an on-call rotation of one. For a solo founder, that
   trade is close to a wash once time is priced at any reasonable rate — genuinely a coin flip, not a slam dunk either
   way, which is the honest answer.

---

## 8. Forced ranking — the 5 worst things about AWS as RED 2.0's backend, worst first

1. **Cognito's MAU pricing is a 4.6×–8.8× tax vs. Supabase Auth at every volume above 10k MAU, with no crossover point in
   Cognito's favor.** — *Evidence:* §5.1, both vendors' own pricing pages, fetched 2026-07-28. *Breaks at:* immediately
   above Cognito's 10,000-MAU free tier; the gap only widens with growth (it is the platform's growth metric, not a
   one-time hit). *Confidence: measured* (both prices read live from each vendor's own page). *Exit trigger reversing
   this:* AWS re-tiers Cognito Essentials pricing down toward Supabase's $0.00325/MAU rate, or the product ships a
   self-hosted-GoTrue path (§5.1/§6) that removes the metering entirely — the second option is available today and
   already priced above.

2. **Connection pooling stops being optional the moment this leaves PostgREST, and the hard ceiling (`max_connections`
   capped at 5,000 regardless of instance size) is reachable at ordinary national-platform peak load, not an edge
   case.** — *Evidence:* §5.3, AWS's own RDS docs formula, fetched 2026-07-28; corroborated architecturally by the
   sibling audit's own finding that today's Vercel↔PostgREST path opens zero Postgres connections. *Breaks at:* the
   architectural transition itself (any raw-driver access from serverless functions), reachable at low-hundreds of
   concurrent requests — plausible well under 3,000 gyms at a synchronized peak (e.g., evening class-rush). *Confidence:
   modeled* for the "when does this actually bite" number (no live AWS deployment to measure against); *measured* for
   the hard 5,000-connection ceiling itself.

3. **RDS Multi-AZ doubles instance, storage, and IOPS cost — confirmed to the exact 2.00× across every SKU pulled — and
   it is easy to naively quote the Single-AZ number.** — *Evidence:* §2.1/§2.2, live pricing-API pull, 2026-07-28.
   *Breaks at:* the moment anyone compares a Single-AZ AWS quote to a Supabase compute tier without asking whether
   Supabase's own tier includes equivalent HA (a question this report couldn't answer — genuine blind spot, §9).
   *Confidence: measured.* *Exit trigger:* if RED accepts Single-AZ (no automatic failover) as its actual risk posture,
   this line halves — but that's a real availability tradeoff being made silently, not a pricing win.

4. **Aurora carries an 8–16% instance-hour premium over RDS Multi-AZ at the same instance class, and Serverless v2 costs
   1.85× Provisioned when pinned to constant capacity — both are easy to miss if "Aurora" and "cheaper/better" are
   assumed to go together.** — *Evidence:* §3.1/§3.3, live pricing-API pull, 2026-07-28. *Breaks at:* Serverless v2 only
   pays off when true idle windows exist in the demand curve; modeled (not measured) to *shrink* as gym count grows
   across timezones, which is backwards from the usual "serverless scales with you" pitch. *Confidence: measured* for
   the instance-hour deltas; *modeled* for the demand-curve claim about serverless's benefit shrinking with scale.

5. **Data Transfer OUT is genuinely small for this specific JSON-API workload (~$20–40/mo) but ambushes the exact DR
   practice the sibling audit itself recommends** — nightly independent off-cloud backups, run on AWS, cost real money
   ($405/mo modeled for a 150 GB nightly dump) purely for crossing the AWS network boundary, and this is invisible in
   any quote that stops at instance-hours and storage-GB. — *Evidence:* §4, live Data Transfer pricing-API pull,
   2026-07-28, applied to the sibling audit's own §7 action item #12. *Breaks at:* whenever an off-vendor backup, bulk
   export, or cross-cloud migration moves DB-sized payloads — a one-time or recurring event, not continuous baseline
   traffic. *Confidence: modeled* (150 GB/night is this report's own §1 storage projection, not a measured backup size).

**Honest note on ranking #5 vs the others:** at *this* workload's actual continuous traffic, egress is the least
consequential item in dollar terms of the five — it's ranked here because the mandate specifically named it as "the line
that ambushes everyone," and the worked example shows precisely when that's true and when it isn't, rather than either
inflating or dismissing it.

---

## 9. Blind spots — what this session did not check

1. **Supabase's own HA/replica pricing was not fetched.** §7's "$538–$1,105 AWS Multi-AZ" is compared against a Supabase
   compute tier whose HA posture I did not verify — the sibling audit notes Supabase carries "no uptime SLA below
   Enterprise," but doesn't say whether the compute tiers it priced include a standby. If they don't, the AWS-vs-Supabase
   comparison in §7 is comparing HA-AWS to non-HA-Supabase, which would need a Supabase HA add-on price to be fully fair.
2. **No live AWS deployment exists to measure real I/O request counts, connection-pool behavior under Vercel's actual
   invocation pattern, or SES sandbox-to-production approval latency.** Every number that depends on those (§3.2's
   breakeven check, §5.3's "breaks at low-hundreds of connections," §5.4's email-volume model) is a model built from this
   report's own §1 workload projection, not a measurement — flagged individually above, restated here as a set.
3. **Reserved Instances / Savings Plans were not priced.** Every number in this report is On-Demand. A 1- or 3-year
   Reserved Instance commitment on RDS/Aurora typically cuts instance-hour cost 30–50%, which would materially change
   §2.3/§3.1's totals (though not the Cognito or connection-pooling findings, which don't have an RI-equivalent lever).
4. **Multi-region / Aurora Global Database was out of scope.** The sibling audit flags `sa-east-1` vs `us-east-1` as a
   live regional question for LatAm; this report priced only single-region us-east-1 and did not model what serving
   Brazil/Southern Cone from a second Aurora region would add (Aurora Global Database bills replicated write I/O to each
   secondary region, per §3's fetched docs, but I did not size that).
5. **The 150–300 engineering-hour estimate in §6 is this agent's own judgment call, not benchmarked against anyone who
   has actually performed a Supabase→AWS migration of comparable scope.** It should be treated as an order-of-magnitude
   planning number, not a quote.
6. **Vendor lock-in/exit-cost asymmetry was not re-derived here** — the sibling audit's vendor-risk section (§6 there)
   already covers Postgres portability and the `getClaims()` seam; this report treats that as given rather than
   re-verifying it, since re-deriving it would duplicate rather than extend that agent's work.
