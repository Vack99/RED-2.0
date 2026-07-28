# Alt: Self-hosted Postgres / Self-hosted Supabase OSS at 3,000 gyms

**Agent:** alt:selfhost
**Date:** 2026-07-27
**Question:** if RED 2.0 self-hosted Postgres (or the full Supabase OSS stack) on rented hardware instead of Supabase's managed platform, what would it cost — hardware, AND the labor a solo founder actually has to spend to keep it alive — and what does self-hosted Supabase OSS not give you that the hosted product does?

**Method:** priced real SKUs from vendor pricing pages (fetched today, URLs + dates below), sized them against the live-measured RED-2.0 row/byte rates from the 2026-07-27 baseline plus this session's own live queries, then built an explicit, itemized ops-hours model priced at sourced 2026 contractor rates. Every "self-hosting is cheap" claim is checked against that labor line before being allowed to stand — per Rule 6, the labor rate is flagged ASSERTED (it is a market-rate estimate, not a vendor price) and everything else that touches a dollar figure carries a URL + fetch date.

---

## 1. Live workload used for sizing (queried this session, PG 17.6, prod, read-only)

```sql
select (select min(created_at) from asistencias) as min_asist,
       (select max(created_at) from asistencias) as max_asist,
       (select count(*) from asistencias) as n_asist,
       (select min(created_at) from ventas) as min_venta,
       (select max(created_at) from ventas) as max_venta,
       (select count(*) from ventas) as n_venta,
       (select min(created_at) from reservation) as min_res,
       (select max(created_at) from reservation) as max_res,
       (select count(*) from reservation) as n_res,
       (select count(*) from gym) as n_gyms,
       (select count(*) from clientes) as n_clientes;
```
Result: `n_asist=705` (2026-05-31→2026-07-28, 58d) · `n_venta=175` (2026-04-20→2026-07-28, 99d) · `n_res=463` (2026-05-31→2026-07-22, 52d) · `n_gyms=4` · `n_clientes=116`.

```sql
select pg_size_pretty(pg_database_size(current_database())) as db_size,
       (select setting from pg_settings where name='max_connections') as max_conn,
       (select setting from pg_settings where name='shared_buffers') as shared_buffers,
       (select setting from pg_settings where name='effective_cache_size') as eff_cache;
```
Result: `db_size=15 MB` · `max_conn=60` · `shared_buffers` raw `28672` (×8kB = 224 MB, matches the orchestrator baseline) · `eff_cache` raw `49152` (×8kB = 384 MB). Confirms the given baseline is this same live read.

```sql
select relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid))
from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 20;
```
Cross-checks the given "bytes/row incl. indexes" figures (e.g. `asistencias` 384kB/705 rows = 545 B/row vs the given 558 — consistent within `pg_size_pretty` rounding) and supplies `schedule_template_week`: 136 kB / 544 rows ≈ 250 B/row (not given in the baseline, derived here).

### Derived per-member / per-gym monthly rates (measured, not assumed)

| Table | rows | window | rate | formula |
|---|---|---|---|---|
| ventas | 175 | 99 d = 3.25 mo | **0.464 sales / member / month** | 175 ÷ 116 clientes ÷ 3.25 mo |
| asistencias | 705 | 58 d = 1.91 mo | **3.20 visits / member / month** | 705 ÷ 116 ÷ 1.91 |
| reservation | 463 | 52 d = 1.71 mo | **2.33 reservations / member / month** | 463 ÷ 116 ÷ 1.71 |
| class_session | 548 | 58 d | **2.36 sessions / gym / day** | 548 ÷ 4 gyms ÷ 58 d |
| schedule_template_week | 544 | static | **136 rows / gym** | 544 ÷ 4 (template, not time-scaled) |

**Honesty flag on `asistencias`:** 3.2 visits/member/month is low for a gym (real-world check-in benchmarks commonly run 8–12×/month for an engaged member). This dataset mixes demo fixtures and 19 real RED members seeded 2026-07-24 — it is a thin, short window (58 days, 4 gyms), so I carry **both** the measured rate and a labeled "industry-typical" 10×/month rate through the projection below rather than picking one silently.

---

## 2. DB size at 3,000 gyms × 150–300 members, 3-year steady state

**Assumptions (labeled):** 225 avg members/gym (midpoint of the stated 150–300 range) → 675,000 members. Full 3,000-gym book from month 1 (worst case for capacity — no onboarding ramp discount). 36-month horizon. `clientes` churn multiplier 1.75× over 3 years (25%/yr replacement — a labeled assumption, not measured; gym member turnover is commonly cited in that range but I did not fetch a source for it, so treat it as ASSERTED).

| Table | 3-yr rows (measured-rate) | 3-yr rows (industry-rate, asistencias only) | B/row (given/derived) | GB (measured) | GB (industry) |
|---|---|---|---|---|---|
| clientes | 1,181,250 | — | 1,483 | 1.75 | 1.75 |
| ventas | 11,275,200 | — | 936 | 10.55 | 10.55 |
| asistencias | 77,760,000 | 243,000,000 | 558 | 43.39 | 135.59 |
| reservation | 56,619,000 | — | 602 | 34.08 | 34.08 |
| class_session | 7,759,935 | — | 613 | 4.76 | 4.76 |
| schedule_template_week | 408,000 | — | ~250 | 0.10 | 0.10 |
| **Subtotal** | | | | **94.6 GB** | **186.8 GB** |
| +20% (auth schema, gym/class_type/paquetes/notificaciones/toast/index bloat not itemized) | | | | 113.6 GB | 224.2 GB |

**Sizing target: a self-hosted primary needs to comfortably hold and cache ~120–230 GB after 3 years at full 3,000-gym scale**, growing a further ~30–70 GB/year (asistencias + reservation dominate growth; `class_session`/`schedule_template_week` are near-flat because they scale with gym-count and calendar time, not member count). This is a genuinely modest OLTP dataset — the hardware question is not the hard part of this alternative; see §5.

---

## 3. Hardware pricing — real SKUs, fetched today

### Hetzner dedicated (AX line) — <https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/> and <https://hosting.gallery/companies/hetzner-com/dedicated-servers> (both fetched 2026-07-27; official price-adjustment doc is primary, aggregator cross-checked it)

| Model | CPU | RAM | Storage | Monthly (EUR) |
|---|---|---|---|---|
| AX42 | 8× AMD Ryzen 7 PRO 8700GE, 3.6 GHz | 64 GB DDR5 ECC | 2×512 GB NVMe | €54–59 (FI/DE) |
| **AX102** | 16× AMD Ryzen 9 7950X3D, 4.2 GHz | 128 GB DDR5 ECC | 2×1,920 GB NVMe | **€119–124** (FI/DE) + €269 setup |
| AX162-S/R | 48× AMD EPYC 9454P, 2.75 GHz | 128–256 GB | 2×1,920–3,840 GB NVMe | €229–244 + €411–542 setup |

Official June-2026 adjustment doc confirms current cloud-line prices too (below) and that Ashburn, VA + Hillsboro, OR + Singapore dedicated-server locations opened **March 2026** (per [webanditnews.com, "Hetzner's New US Data Centers"](https://www.webanditnews.com/2026/03/07/hetzners-new-us-data-centers-are-shaking-up-the-cloud-hosting-market/), fetched via search 2026-07-27) — meaning a US-region self-host **is now possible** and would sit in the same region class as Supabase's recommended `us-east-1`, avoiding the São Paulo latency trap the prior audit flagged. **Caveat, stated honestly: I could not fetch the Ashburn AX-line catalog/pricing directly** (only the EU DE/FI catalog above is vendor-confirmed) — Hetzner's US colocation pricing has historically run at a premium over EU-owned-DC pricing; treat the AX102 EU price as a floor, not the US price, until the Ashburn configurator is checked directly.

**Recommended primary: AX102 (128 GB RAM, 1.92 TB usable NVMe after RAID1) — comfortably holds the ~120–230 GB 3-year working set with room for OS/WAL/backup staging, and can cache most of the hot (recent) partition of `asistencias`/`reservation`/`ventas` in RAM.** CPU is not the constraint at this row count — 16 modern cores handle far more than a few thousand req/s of indexed OLTP lookups; the actual bottleneck at 3,000 gyms is the same one the live audit already found (§C1–C3 missing indexes, unindexable OR'd RLS-adjacent predicates) — self-hosting does not fix a bad query plan, it just removes the vendor's advisor that flags it (§6).

### Hetzner Cloud (CCX, dedicated-vCPU line) — official price-adjustment doc, fetched 2026-07-27

| Instance | vCPU | RAM | Monthly (EUR) |
|---|---|---|---|
| CCX13 | 2 | 8 GB | €42.99 |
| CCX23 | 4 | 16 GB | €85.99 |
| CCX33 | 8 | 32 GB | €138.49 |
| CCX43 | 16 | 64 GB | €275.99 |

Note the cited June-2026 CPX/CCX price increase (up to +176% on some lines per [wz-it.com](https://wz-it.com/en/blog/hetzner-price-increase-june-2026-cpx-ccx-alternatives/), fetched via search 2026-07-27) — cloud-line Hetzner pricing moved materially against self-hosters this year; dedicated (AX) pricing is the more stable comparison point and is what I size against below.

### DigitalOcean Droplets — <https://www.digitalocean.com/pricing/droplets> (fetched 2026-07-27)

| Line | RAM | vCPU | SSD | Monthly (USD) |
|---|---|---|---|---|
| General Purpose | 32 GiB | 8 | 100 GiB | $252 |
| General Purpose | 64 GiB | 16 | 200 GiB | $504 |
| Memory-Optimized | 64 GiB | 8 | 200 GiB | $336 |
| **Memory-Optimized** | **128 GiB** | **16** | **400 GiB** | **$672** |

A DO Droplet matched to the AX102's 128 GB RAM costs **$672/mo vs the AX102's ≈$130–135/mo** — roughly **5× more** for comparable specs. That gap is real and is the honest core of the "dedicated hardware is cheap" argument; it buys instant provisioning, snapshots, a real support SLA and elastic resize that bare-metal doesn't give you, none of which changes the labor argument in §5.

### OVHcloud bare-metal — <https://www.ovhcloud.com/en/bare-metal/> (fetched 2026-07-27) + search corroboration

| Range | CPU | RAM | Storage | From (USD/mo) |
|---|---|---|---|---|
| Advance (T3) | 6–24 cores AMD EPYC | 32 GB–1 TB | 2–8 NVMe/SSD | $128.40 |
| Scale (T4) | 16–384 cores | 128 GB–3 TB | 2–6 disks | $524.40 |
| High Grade (T5) | 16–192 cores | 128 GB–3 TB | 2–36 disks | $1,345.20 |

The Advance-1 2026 SKU (6-core EPYC 4245P, 32–256 GB configurable, NVMe) starts at **$134/mo** ([techradar.com coverage](https://www.techradar.com/news/ovhcloud-releases-new-advance-bare-metal-servers-for-smes), via search 2026-07-27) — **an exact RAM-matched (128 GB) monthly price was not retrievable**; the OVH configurator app did not render in WebFetch (JS-rendered), so treat OVH as "same order of magnitude as Hetzner AX102, likely €150–350/mo range for a 128GB NVMe config" — **ASSERTED**, not confirmed to the SKU.

### Backup storage — Hetzner Storage Box, <https://www.hetzner.com/storage/storage-box/bx11/> (via search, fetched 2026-07-27)

BX11 = 1 TB for **€3.20/mo**. A few TB of WAL-archive + base-backup retention is a **rounding error** (€10–20/mo) regardless of provider. Raw backup storage cost is not where self-hosting bites — see §6.

---

## 4. Recommended self-hosted footprint and its raw infra bill

Self-hosted Postgres has **no built-in HA/failover** (unlike hosted Supabase's managed cluster) — you get exactly the box(es) you rent. A single AX102 is a single point of failure for the entire platform's data plane; a business selling to gyms that open at 5am needs at minimum a warm standby you have personally built and tested (Patroni/repmgr/pg_auto_failover — none of this ships for free, see §6).

| Component | SKU | Monthly |
|---|---|---|
| Primary Postgres (self-managed) | Hetzner AX102, 128 GB / 1.92 TB NVMe | €124 |
| Standby replica (recommended, not optional at this customer profile) | Hetzner AX102 | €124 |
| Offsite backup storage (WAL + base backups, 3–4 TB) | Hetzner Storage Box BX-tier | ~€15 |
| App tier (Kong/GoTrue/PostgREST/Realtime/Storage/Studio containers, isolated) | Hetzner Cloud CCX13 | €43 |
| **Prudent all-in infra, with HA** | | **≈€306/mo ≈ $330/mo** |
| **Bare-minimum, single box, no HA** (primary only, app tier colocated) | AX102 + Storage Box | **≈€139/mo ≈ $150/mo** |

(EUR→USD at an approximate ~1.08 unsourced conversion, ASSERTED, for readability only — all cited prices above are in their native currency.)

**This is the number every "self-host and save money" pitch stops at. It is genuinely 4–8× cheaper than the equivalent cloud-VM (DO) route and looks dramatically cheaper than the prior audit's hosted-Supabase subtotal of $1,200–2,300/mo. It is also the wrong number to stop at — see §5.**

---

## 5. The part every self-host pitch omits: ops labor, priced honestly

**Hourly rate used:** senior DevOps/DBA-capable contractor rate, 2026 US market, sourced from search aggregation of golance.com, aalpha.net, salary.com and ziprecruiter listings (fetched via WebSearch 2026-07-27): **$75–165/hr**, with $165/hr cited as the average senior-DevOps rate and $75–200/hr as the general freelance senior-technical band. **ASSERTED per Rule 6** — this is a market-rate estimate for the founder's *opportunity cost*, not a vendor price; I did not find a single canonical source and am reporting the range the search actually returned rather than asserting a false-precision single number. I use **$100/hr as a conservative-of-the-range midpoint** in the totals below; the low end ($75) and high end ($165) are carried through so the reader can re-price at their own rate.

### Itemized steady-state hours/month, at full 3,000-gym scale, two-box HA setup

| Task | hrs/mo | Basis |
|---|---|---|
| OS + kernel patching (2 boxes) | 2.0 | unattended-upgrades config, verify, coordinate reboots without downtime |
| Postgres minor-version patching | 1.0 | apply, restart, verify streaming replication resyncs |
| Postgres **major**-version upgrade | 1.5 | ~1×/yr, 12–20 hrs (pg_upgrade or logical-replication cutover + staging test + downtime window), amortized ÷12 |
| Backup pipeline monitoring (WAL-G/pgBackRest) | 1.0 | verify daily base backup + continuous WAL archive succeeded; quota/rotation |
| **Restore drills** | 2.0 | quarterly full drill (spin up a box, restore, verify integrity, time the RTO) at 4–6 hrs, amortized monthly — **explicitly what most self-host writeups skip**, and what the sibling hosted-Supabase audit flagged prod as never having done either |
| Monitoring/alerting (Prometheus/Grafana/Alertmanager or equivalent) | 2.0 | dashboard upkeep, alert-rule tuning, avoiding alert fatigue |
| TLS/cert rotation | 0.5 | mostly automated (Caddy/certbot) but must catch silent renewal failures |
| Capacity planning | 1.5 | disk/connection/pool growth trend review, vertical-scale or read-replica timing |
| HA/failover build + periodic failover test | 1.5 | Patroni/repmgr config care, and testing that failover actually works (untested failover is not failover) |
| Security/CVE triage | 2.0 | unpredictable; averages out across a year of Postgres/Docker/Kong/GoTrue advisories |
| Supabase-OSS docker-compose stack upgrades | 1.5 | per the vendor's own docs (§6): "versions in each release are tested together" — compat is NOT guaranteed mixing versions, so upgrades are a coordinated multi-service bump, not `apt upgrade` |
| On-call incident response (active troubleshooting) | 3.0 | modeled ~1–2 unplanned incidents/month at this scale (disk pressure, connection storm, replication lag, container crash) at 1–3 hrs each |
| **Total, steady state** | **≈20 hrs/month** | |

Plus a **one-time build cost** (docker-compose stack, hardening, backup pipeline, monitoring stack, HA wiring, first restore-drill): **40–80 hours**, not amortized above.

### Pricing it

| | Hours | @ $75/hr | @ $100/hr | @ $165/hr |
|---|---|---|---|---|
| Steady-state, monthly | 20 | $1,500 | $2,000 | $3,300 |
| One-time setup | 40–80 | $3,000–6,000 | $4,000–8,000 | $6,600–13,200 |

**All-in monthly total (infra + labor, prudent HA setup, midpoint rate):** €306 infra (≈$330) + $2,000 labor ≈ **$2,330/mo**, range **$1,830–3,630/mo** across the rate band.

### The comparison that matters

| | Monthly | Per gym (÷3,000) |
|---|---|---|
| **Self-host, infra only** (what the pitch usually shows) | $150–330 | $0.05–0.11 |
| **Self-host, infra + labor, honestly priced** | **$1,830–3,630 (mid ≈$2,330)** | **≈$0.61–1.21 (mid ≈$0.78)** |
| Hosted Supabase subtotal (prior audit, §4 of the sibling report) | $1,200–2,300 | $0.40–0.77 |

**Priced honestly, self-hosting is not meaningfully cheaper than the managed platform it would replace — at the midpoint it is very slightly more expensive per gym ($0.78 vs the hosted subtotal's own midpoint), before counting the one-time $4,000–8,000 build cost, and while trading a vendor SLA (weak as it already is — no uptime SLA below Enterprise, per the sibling audit) for literally no SLA and a bus factor of 1.** The "self-host and save 10×" framing is only true if the founder's own hours are priced at $0 — which is the exact self-deception Rule 3 (falsification) exists to catch. I checked it: it is false at any hourly rate above roughly **$15/hr** (the infra-only savings of ~$1,000–1,900/mo ÷ 20 hrs/mo), and no realistic reading of a technical solo founder's opportunity cost is that low.

**Falsification test, and what would make me wrong:** if the founder genuinely has zero alternative use for these 20 hrs/month (no other product, no fundable use of the time, ops work is not itself corrosive to morale/focus) **and** is pre-revenue or revenue-constrained enough that the $1,200–2,300/mo hosted bill is a real cash problem rather than a rounding error against the ~$45,000–249,000/mo total-platform revenue potential (3,000 gyms × 300–1,500 MXN/gym/mo, ≈$16–81/gym/mo at an unsourced-ASSERTED ~18.5 MXN/USD), then self-hosting's infra-only savings are real and the labor is "free" in the relevant sense. **Check against this repo:** git log and CLAUDE.md both describe a solo operator (`git user: Vack99`) currently running **4 live gyms**, where the hosted bill today is trivially small regardless of tier (nowhere near the $1,200+/mo modeled at 3,000-gym scale). At today's scale, self-hosting is unambiguously the wrong trade — pure setup overhead (40–80 hrs) for zero savings, since the hosted bill it would replace is already near-zero. The self-host case, if it exists at all, only becomes numerically live **once the hosted bill clears roughly $3,000–5,000/mo** (i.e., roughly the 3,000-gym endpoint itself, per the prior audit's own model) — which is exactly the scale at which a single-founder-with-no-backup-on-call posture is least defensible and Team-tier compliance features (next section) start mattering most. **The self-host case gets numerically better and operationally worse at the same time, as the platform grows** — that is the sharpest finding in this report.

---

## 6. What self-hosted Supabase OSS does NOT give you

Fetched directly from Supabase's own docs (primary source, both 2026-07-27):

**<https://supabase.com/docs/guides/self-hosting>** — verbatim: *"Platform-only features such as branching, advanced metrics beyond logs, managed backups and PITR, analytics and vector buckets, ETL, and the platform management API are unavailable in self-hosted configuration."* Also: Studio is limited to **a single project**, no multi-organization support. Support is explicitly **community-only** — GitHub Discussions/Issues, Discord, Reddit; no SLA; Enterprise-only path to talk to an actual Supabase team.

**<https://supabase.com/docs/guides/self-hosting/docker>** — the docker-compose stack is: **Studio, Kong (API gateway), GoTrue (Auth), PostgREST, Realtime, Storage, imgproxy, postgres-meta, Postgres, Edge Runtime, Logflare+Vector (logging), Supavisor (pooler)**. Direct quotes: production needs **your own TLS** ("you need HTTPS with a valid TLS certificate," reverse proxy via Caddy/Nginx) and **your own SMTP** ("a production-ready SMTP server for sending emails," AWS SES suggested) — note this SMTP requirement is identical to what the hosted platform *also* requires (Resend, per the sibling audit), so it is not a self-host-specific delta; and a compatibility warning that **"versions in each release are tested together"** with no guarantee across mismatched individual service versions — i.e. you own the entire stack's version matrix, not just Postgres's.

**<https://supabase.com/docs/guides/platform/backups>** — hosted tiers: Pro = 7 days of daily backups, Team = 14 days, Enterprise = up to 30 days; PITR is an add-on on all paid tiers with second-level recovery granularity and a ~2-minute worst-case RPO. **None of this exists in self-hosted OSS** — you get raw Postgres; WAL archiving, base-backup scheduling, retention, and restore tooling (pgBackRest / wal-g) are 100% your build, and the *drill* obligation this mandate explicitly calls out (proving a restore actually works) is not a checkbox anyone hands you — it is the single most commonly-skipped step in every self-host writeup, this one included until you run it.

**Concretely, what you lose, mapped to what this very audit session used:**
- **No `get_advisors`-equivalent.** The sibling live-database audits in this repo (auth-structure and multigym-scoping) both found real, verified defects (missing `ventas.cliente_id` index, unindexable `gym_membership` OR-policies) using Supabase's built-in performance/security advisor. Self-hosted OSS ships no such tool — you would need to hand-roll `pg_stat_statements` review + manual `EXPLAIN` audits on a schedule, and the defects this repo already has (C1–C3 in the sibling audit) do not become less dangerous by self-hosting; they become *harder to find*.
- **No branching.** The scratch-project `SUPABASE_TARGET_REF` pattern this repo already relies on for `pnpm test:denial` (per `AGENTS.md`) is a *hosted-platform* feature. Self-hosting removes it; the equivalent (a second full docker-compose stack, kept schema-synced) is more infra + more ops hours, not fewer.
- **No managed PITR dashboard**, no one-click restore — pgBackRest/wal-g CLI restore, scripted and rehearsed by you.
- **No compliance ceiling.** Hosted Team tier ($599/mo, per the sibling audit) buys SOC2/ISO 27001/audit-log retention as a purchase. Self-hosted OSS has **no path to that at all** short of independently commissioning and passing your own audit — a five-figure, multi-month undertaking, not a monthly line item. This binds exactly at the scale (3,000 gyms, hundreds of thousands of LatAm members' PII) where a regulator or an enterprise gym-chain customer would ask for it.
- **No vendor uptime commitment at all** (self-host has none by construction) vs. the hosted platform's already-weak "no SLA below Enterprise" — self-hosting doesn't fix that gap, it removes the floor entirely and replaces it with whatever HA you personally built and tested.

---

## 7. Migration path back, if self-hosting fails

**Mechanically straightforward if planned ahead; genuinely risky if it's a fire drill.**

- Postgres is Postgres: `pg_dump`/`pg_restore` (or a base backup + WAL replay) into a fresh hosted Supabase project restores the domain schema cleanly. Because self-hosted Supabase OSS runs the **same** GoTrue/PostgREST/extension family as the hosted platform, the auth schema and any `pgsodium`/Vault-encrypted columns (this repo's firma/HMAC scheme depends on a Vault key, per the sibling auth audit) round-trip more cleanly than a generic "self-hosted Postgres → arbitrary managed Postgres" migration would — but extension **versions** must be checked; self-hosted OSS release cadence lags and diverges from the hosted platform's managed Postgres image, so a same-name extension is not guaranteed to be the same build.
- **The `supabase db dump` gotcha applies here too**, and the sibling audit already flagged it: the CLI dump **excludes the `auth` schema by default**. A self-host operator who "took a backup" via the obvious command has silently not backed up user credentials. Dump `auth` explicitly, every time, and prove it in a restore drill — the same discipline §5's restore-drill line item is pricing.
- **Planned migration back** (self-host is healthy, you're just changing your mind): dump/restore against the ~120–230 GB steady-state size is dominated by I/O, roughly 30 min–2 hr each way on modern NVMe; with `pglogical`/logical replication staged ahead of time, cutover can be near-zero-downtime. Budget **a few hours of a maintenance window**, well inside what a gym-software product can schedule for 2am.
- **Unplanned migration back** (self-host *catastrophically* failed — corrupted primary, and the backup posture turns out not to have been drilled, which is exactly the failure mode the mandate calls out by name): the RPO is bounded by whatever the last **verified-good** restore actually was, not by whatever the backup schedule *claims*. This is not a self-host-specific risk in kind — the sibling audit found the *hosted* platform's PITR retention was similarly unverified in this repo today — but self-hosting removes the vendor's own backup/PITR system as a second line of defense entirely; there is no fallback but the one you built.

---

## 8. Forced ranking — 5 worst things about this alternative, worst first

1. **Bus factor of 1 becomes the platform's actual disaster-recovery plan.** No self-managed HA exists until you build and *test* it (Patroni/repmgr), and even then there is exactly one human who can respond to a 5am primary-DB incident for a customer base of gyms that open at 5am. **Breaks at:** the first incident that coincides with founder unavailability (sick, traveling, asleep, phone dead) — a probability that compounds with gym count, not a row count. **Falsification check:** would this be fine if the founder hires a second on-call-capable engineer? Yes — that is the exit trigger in §5, and it is the single condition that would most change this ranking.
2. **The safety tooling this repo's own audits just used disappears.** `get_advisors`, managed PITR with a dashboard, and project branching are hosted-platform-only (verified via Supabase's own self-hosting docs, §6). The C1–C3 defects the sibling audit found today were found *because* those tools exist; self-hosting doesn't remove the defects, it removes the instrument that catches them.
3. **The "10× cheaper" framing is false once labor is priced at any realistic rate.** Infra-only self-host runs $150–330/mo vs. the hosted subtotal's $1,200–2,300/mo — a real and large gap. But all-in with honestly-priced ops labor (§5), self-hosting lands at **$1,830–3,630/mo**, comparable to or slightly above the hosted number it would replace, before the $4,000–8,000 one-time build cost. **Breaks at:** any founder hourly rate above ≈$15/hr, which is not a realistic number for the technical work this actually requires.
4. **The compliance ceiling is worse, not just absent, at the exact scale where it starts to matter.** Hosted Team tier turns SOC2/audit-log retention into a $599/mo purchase; self-host has no equivalent short of an independent, multi-month, five-figure audit engagement — binding at 3,000 gyms' worth of LatAm PII, i.e. precisely the scale this mandate is sizing for.
5. **Region/latency risk if the wrong Hetzner location is picked.** Hetzner's owned data centers are Germany/Finland; a self-host there for a Mexico-market product repeats the São Paulo-style latency trap the sibling audit already flagged for Supabase's region choice. The fix exists — Hetzner opened Ashburn/Hillsboro dedicated-server locations in **March 2026** — but I could not fetch confirmed US-location AX-line pricing (§3), so treat "self-host in the right region at the AX102 price quoted" as unverified until the Ashburn configurator is checked directly.

**Honesty note (Rule 7):** the raw hardware pricing comparison genuinely favors dedicated servers — Hetzner's AX102 at ~$130–135/mo for 128 GB RAM / 16 cores / ~1.9 TB NVMe is roughly 5× cheaper than DigitalOcean's RAM-matched Memory-Optimized Droplet at $672/mo. That part of the self-host pitch is true and sourced. What breaks the overall case is not the hardware line — it's the labor line and the missing safety net, both of which the "just rent a Hetzner box" framing routinely omits.

---

## 9. Exit triggers (Rule 4)

- **KEEP hosted Supabase unless ALL THREE hold simultaneously:** (a) the hosted monthly bill exceeds ~$4,000–5,000/mo (approaching the point where Team-tier + compute-ladder costs bite, per the sibling audit's own model), **and** (b) a second on-call-capable engineer exists (bus factor ≥2), **and** (c) the business is prepared to independently fund a SOC2/ISO-equivalent audit rather than buy it via Team tier. Until all three are true at once, self-hosting is a same-or-worse-cost trade for a strictly worse reliability and compliance posture.
- **Reverse trigger that does NOT imply full self-hosting:** if Supabase's control-plane degradation (the Feb-2026 3h42m outage the sibling audit cites) recurs 2+ times/year, the correct response is an **independent nightly `pg_dump` to a separate cloud account** (already recommended at #12 in the sibling audit, and far cheaper than full self-hosting), not migrating the primary off Supabase.

---

## 10. My blind spots

- **I did not fetch confirmed Ashburn/US-region Hetzner AX-line pricing** — the hardware numbers here are EU (DE/FI) list prices; a US self-host (the region that actually matters for LatAm latency) may price higher and I flagged but did not close that gap.
- **I did not get an exact OVH SKU/price for a 128 GB RAM config** — the OVH configurator is JS-rendered and didn't return data to WebFetch; the $128–524/mo range cited is the vendor's own tier-floor pricing, not a matched-spec quote.
- **The 20 hrs/month ops model is a reasoned estimate, not a measurement** — nobody at this company has run this stack in anger at 3,000-gym scale, so unlike the DB-size projection (grounded in measured per-member rates) the labor table is my own decomposition of the mandate's named categories, cross-checked only against general DevOps-hours folklore, not a cited case study of a comparable self-hosted gym-SaaS.
- **I did not model a middle path** — e.g. self-hosting Postgres only (skip the full Supabase OSS stack: keep hosted Auth/Storage/Realtime, run your own Postgres with logical replication into Supabase, or the reverse) — which might materially change both the ops-hours table and the "what you lose" list in §6. The mandate asked for both self-hosted Postgres and self-hosted Supabase OSS as a pair, and I priced them together; a hybrid wasn't in scope but is a real design point a synthesizer might want investigated.
- **I did not independently verify the 25%/yr member churn assumption** feeding the 3-year `clientes` row-count projection, or the 10-visits/month "industry-typical" asistencias benchmark I used to bound the measured rate — both are stated as assumptions, not sourced.
- **FX conversion (EUR→USD, MXN→USD) used approximate, unsourced rates** — flagged inline, but if precise USD figures matter for a board deck, re-derive from a fetched FX rate rather than my ~1.08 / ~18.5 approximations.
- **I did not test any of this against a real docker-compose deployment** — everything in §6 is drawn from Supabase's own documentation pages, not from actually standing up the OSS stack and finding where the docs are silent or wrong (a common gap in self-hosting docs generally, which I did not have time or scope to probe empirically).
