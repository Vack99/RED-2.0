# Alternative DB Tier Audit: Neon, Railway, Fly Postgres

Agent: `alt:neon-postgres`. Scope: price Neon, Railway, and Fly Postgres as replacements for the Supabase DB tier, and answer the multi-tenant question (one big DB vs. DB-per-tenant at 3,000 gyms) with primary-sourced numbers.

All prices fetched 2026-07-27. All USD unless noted. Target scale per mandate: **3,000 gyms × 150–300 members**. Live baseline (Supabase, measured 2026-07-27): 4 gyms, 116 clientes, 175 ventas, total DB 15 MB.

---

## 1. Neon

### 1.1 Pricing model
Source: [neon.com/pricing](https://neon.com/pricing) (redirected from neon.tech/pricing), fetched 2026-07-27; [neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans), fetched 2026-07-27.

| Plan | Base fee | Compute | Storage | Egress | Projects included |
|---|---|---|---|---|---|
| Free | $0 | 100 CU-hr/project/mo included | 0.5 GB/project | 5 GB/project/mo | 1 |
| Launch | **No minimum** (pay-as-you-go; per a 2026 update, the old $19/mo floor was removed Dec 2025 — corroborated by [selfhost.dev](https://selfhost.dev/blog/neon-pricing-cost-of-serverless-postgres/), 2026) | $0.106/CU-hr | $0.35/GB-mo | 500 GB/project/mo incl., then $0.10/GB | 100 |
| Scale | No minimum | $0.222/CU-hr | $0.35/GB-mo | 500 GB/project/mo incl., then $0.10/GB; private networking $0.01/GB | 1,000 (+500 for $50/mo) |
| Business | Not found in current docs (existence confirmed only via [blog post](https://neon.com/blog/thousands-of-neon-projects-now-included-in-your-pricing-plan)); base fee ASSERTED unknown — contact sales | — | — | — | 5,000 incl. |
| Enterprise | Custom | Custom | Custom | Custom | Custom |

1 Compute Unit (CU) = ~4 GB RAM + proportional CPU + SSD. Fixed sizes on Scale run up to **56 CU (224 GB RAM)**; autoscaling ranges up to 16 CU on Launch/Scale. Business/Enterprise max size not published.

Manual snapshots: $0.09/GB-mo, billed on top of PITR storage. PITR history window: Free 6 hr (1 GB cap), Launch up to 7 days, Scale up to 30 days, at $0.20/GB-mo for the retained history.

### 1.2 Autoscaling / scale-to-zero + latency cost
Source: [neon.com/docs/introduction/autoscaling](https://neon.com/docs/introduction/autoscaling), [neon.com/docs/introduction/scale-to-zero](https://neon.com/docs/introduction/scale-to-zero), both fetched 2026-07-27; corroborating third-party benchmark writeups found via search.

- Autoscaling adjusts CU within a user-set min/max range (max spread = 8 CU) with "no manual intervention or restarts." No published scale-up/scale-down speed in seconds.
- Scale-to-zero: default suspend after 5 min idle. Free/Launch: 5 min (Launch can disable). Scale: configurable 1 min → always-on.
- Cold-start latency: Neon's own scale-to-zero doc says reactivation happens "within a few hundred milliseconds." Third-party benchmarks (searched, not primary) report 300–800ms first-query latency, sub-100ms after via PgBouncer pooling. Treat the few-hundred-ms figure as vendor-stated; the 300–800ms range is corroborating but not primary.

**Falsification finding (this is the load-bearing number for §4):** [github.com/neondatabase/neon discussion #12900](https://github.com/neondatabase/neon/discussions/12900), fetched 2026-07-27. A user on a project fixed at 0.25 CU with 5-min auto-suspend, receiving only ~30 real visits/day, measured **~6 CU-hours/day of billed compute** — far above what 30 visits should cost. Neon staff's own explanation: the platform's `check_availability` control-plane health-check pings the compute 30–40 times/day, each ping triggering a wake cycle that resets the idle timer before the compute can stay suspended. Staff called this expected behavior on that plan tier and said it's "optimized for development and spiky traffic, not for '30 visits/day' production workloads," recommending tenant consolidation instead. This directly contradicts the marketing claim (used elsewhere in Neon's own docs, see §1.5) that "empty projects are virtually free."
- Caveat: this is one community-reported data point (Neon-staff-acknowledged, not a documented SLA/pricing-page number). It may have been mitigated since the report. I could not find an official doc retracting or fixing it. Flagged as **PLAUSIBLE, not CONFIRMED-via-official-docs**, but it is the single most consequential number in this report because it falsifies the core marketing premise DB-per-tenant pricing is built on.

### 1.3 Connection handling / pooling
Source: [neon.com/docs/connect/connection-pooling](https://neon.com/docs/connect/connection-pooling), fetched 2026-07-27.
- PgBouncer in transaction mode. Per-pool cap = `0.9 × max_connections`.
- max_connections scales with CU: 0.25 CU → 104 (97 usable), 1 CU → 419, 8 CU → 3,357, 9+ CU capped at 4,000.
- Pooled connections (`-pooler` hostname suffix) for app/serverless traffic; direct connections required for migrations, `pg_dump`, logical replication, advisory locks, `LISTEN/NOTIFY`, `PREPARE`.

### 1.4 Branching
Source: [neon.com/docs/introduction/branching](https://neon.com/docs/introduction/branching), fetched 2026-07-27.
- Instant copy-on-write branches; a branch stores only its delta from the parent. Creating a branch does not load the parent branch. No documented per-branch minimum charge beyond the delta storage it accumulates and any compute it spins up.
- Genuinely relevant to a pain point already recorded in this repo's own memory: RED's Supabase branching is Pro-gated and the free tier "fits exactly one scratch beside live" (per `docs/agents` / MEMORY.md context). Neon branching is available on **every plan including Free**, with no Pro gate. If RED ever migrated off Supabase, this specific operational annoyance (scratch-project-per-test-run workaround for `test:denial`) would disappear. This is a genuine point in Neon's favor — noted per rule 7, ranked in §4 anyway.

### 1.5 Backup / PITR
Covered in §1.1 table. Free: no real PITR (6 hr/1 GB). Launch: 7 days. Scale: 30 days, billed separately from base storage at $0.20/GB-mo.

### 1.6 Largest instance
56 CU (224 GB RAM, proportional CPU/IO) fixed-size on Scale — [neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans). Business/Enterprise ceiling not published in fetched docs.

### 1.7 Multi-tenant: DB-per-tenant at 3,000 gyms
Source: [neon.com/docs/guides/multitenancy](https://neon.com/docs/guides/multitenancy), fetched 2026-07-27 — Neon's own official guidance ranks three patterns and **explicitly recommends project-per-tenant** ("provides instance-level isolation without the DevOps overhead of managing individual RDS instances"), explicitly recommends *against* schema-per-tenant for SaaS (blocks per-tenant PITR), and calls shared-schema/RLS "a good starting point" that needs Postgres tuning as tables grow — i.e., Neon's own docs rank the architecture RED already runs (shared-schema + RLS on one Postgres, per ADR-0013/0014) as the *weakest* of the three options for a SaaS at scale. That is a real point against the status quo worth carrying to the synthesizer, even though this agent's number-crunching below shows project-per-tenant is not economically viable for RED's traffic shape.

Neon states some customers "manage hundreds of thousands of projects" via automation, and the [Agent plan](https://neon.com/docs/introduction/agent-plan) (fetched 2026-07-27) raises the per-org default to **30,000 projects**. But the Agent plan requires an active Scale plan, Neon team approval, and is explicitly scoped to "platforms that provision and manage Postgres databases for end users at scale" in the AI-agent/sandbox sense (cited examples: Replit, v0) — not stated to be available to an ordinary vertical-SaaS use case like gym management. Compute/storage/PITR rates on the Agent plan mirror standard rates ($0.106/CU-hr quoted — notably the *Launch* rate, not Scale's $0.222, an unexplained discrepancy between the two docs pages I could not reconcile from primary sources).

**Project-count cost at 3,000 tenants (Scale plan, the only publicly self-serve tier that reaches this count):**
- 1,000 projects included + 2,000 extra ÷ 500-project blocks × $50/mo = **$200/mo** just for project slots, before any compute/storage usage.
- (Business plan claims 5,000 included "at no additional cost," but its own base subscription price was not published in any fetched primary source — flagged ASSERTED/unknown, contact sales.)

**Compute cost at 3,000 tenants, using the #12900 floor (§1.2) as the realistic floor rather than the marketing "near-zero" claim:**
- Floor per project ≈ 6 CU-hr/day × 30 days = 180 CU-hr/mo. At Scale rate ($0.222/CU-hr, the only rate available above 100 projects): **$39.96/project/mo**.
- × 3,000 projects = **≈ $119,880/mo**, from platform-generated pings alone, before any real gym check-in/POS traffic is added on top.
- Compare to a single shared database sized generously at 4 fixed CU always-on: 4 × 730 hr × $0.222 = **$648/mo** for all 3,000 tenants combined.
- **Ratio: DB-per-tenant on Neon is ≈185× the cost of a single shared database**, for RED's traffic shape specifically, and the gap is not close enough for modeling error to close it.

This is the sharpest finding of the audit: Neon's DB-per-tenant pitch is real and well-engineered for **mostly-idle** tenants (dev sandboxes, AI-agent scratch DBs, trial accounts) — exactly the profile its own marketing examples describe. RED's gyms are the opposite profile: live, staffed small businesses generating check-in/POS traffic through business hours every day. That traffic pattern is precisely what defeats scale-to-zero savings and instead pays the per-project floor 3,000 times over.

---

## 2. Railway

### 2.1 Pricing model
Source: [railway.com/pricing](https://railway.com/pricing), fetched 2026-07-27.

| Plan | Base | Notes |
|---|---|---|
| Free Trial | $5 one-time credit | No card |
| Hobby | $5/mo | Includes usage allowance |
| Pro | $20/seat/mo | Higher limits, team features |
| Enterprise | Custom | SLA, dedicated support |

Usage (all plans, metered per second):
- Memory: $0.00000386/GB-s (≈ $10.00/GB-mo if always-on)
- CPU: $0.00000772/vCPU-s (≈ $20.00/vCPU-mo if always-on)
- Volumes: $0.00000006/GB-s (≈ $0.156/GB-mo)
- Egress: $0.05/GB
- Object storage: $0.015/GB-mo, free egress

No compute-hour/CU abstraction like Neon — pure metered CPU/RAM/disk-seconds regardless of what's running on them (Postgres or anything else).

### 2.2 Autoscaling / scale-to-zero + latency cost
Source: [docs.railway.com/deployments/serverless](https://docs.railway.com/deployments/serverless) via search, fetched 2026-07-27; corroborated by Central Station community threads.
- "Serverless" mode sleeps a service after >10 min with no outbound traffic (requests, DB connections, even NTP count as activity).
- First request after sleep triggers a cold boot; documented as producing occasional **502 Bad Gateway** on the very first request, and multiple Central Station threads (2026) report services/databases failing to wake reliably, or failing to sleep at all when a connection pooler keeps a socket open — which is the normal state for a pooled Postgres in front of an app. **This means the one feature that would make DB-per-tenant cheap on Railway (sleep-to-zero) is documented by Railway's own community forum as unreliable specifically for the case where a pooler is present** — and a pooler is required to serve concurrent gym staff/members at all. No official vendor number for wake latency.

### 2.3 Connection handling / pooling
Source: search of [docs.railway.com/databases/postgresql-pgbouncer](https://docs.railway.com/databases/postgresql-pgbouncer), fetched 2026-07-27.
- PgBouncer add-on, one click, works with standalone or HA Postgres. Selectable pool mode (transaction/session/statement), changeable live.
- Auto-provisions pooled (`DATABASE_URL`) and unpooled (`DATABASE_UNPOOLED_URL`) connection strings; auto-migrates same-project services to the pooled endpoint.
- Scalable 1–6 PgBouncer replicas.
- This is a genuinely solid, well-designed feature — better UX than Neon's manual `-pooler` suffix convention, arguably better than Supabase's current Supavisor setup. Noted per rule 7.

### 2.4 Branching
No branching/copy-on-write primitive found in any fetched source. Railway's isolation unit is "environments" within a project (standard PaaS preview-environment concept), not a cheap CoW clone of a running database. No equivalent to Neon's instant branch.

### 2.5 Backup / PITR
Source: search results for [docs.railway.com/volumes/point-in-time-recovery](https://docs.railway.com/volumes/point-in-time-recovery), fetched 2026-07-27.
- PITR via pgBackRest: continuous WAL archiving to a Railway storage bucket, full backup weekly, incremental daily, **last 4 full backups retained ⇒ ≈4-week restore window**.
- **Pro-plan gated** (opt-in from the Backups panel; explicitly stated as a Pro feature).

### 2.6 Largest instance
Source: [docs.railway.com/reference/scaling](https://docs.railway.com/reference/scaling), fetched 2026-07-27, cross-checked against a search snippet of the same page.
- Conflicting numbers found in different excerpts of Railway's own scaling doc: one excerpt states Hobby caps at 8 vCPU/8 GB and Pro at 32 vCPU/32 GB per service; another excerpt of the same page states "each of your [Pro] replicas can utilize up to 24 vCPU and 24GB." A third search result cites Hobby at 48 vCPU/48 GB. **I could not reconcile these from primary sources in this session — flag as a documentation-consistency problem on Railway's own site**, not just a research artifact of mine. Business plan: up to 1,000 vCPU / 1 TB per service (per replica-multiplied search citation); Enterprise: up to 2,400 vCPU / 2.4 TB.
- Directionally: Railway can vertically scale a single Postgres far larger than Neon's fixed 56 CU ceiling, if the exact cap is confirmed with sales before relying on it.

### 2.7 Multi-tenant: DB-per-tenant at 3,000 gyms
Railway has **no bulk/discounted per-tenant pricing primitive** — no project-count tiers, no branch-based cloning, nothing analogous to Neon's "buy 500 more projects for $50/mo." DB-per-tenant means 3,000 independently deployed, independently billed Postgres services.

- Minimum realistic per-tenant footprint to actually run Postgres (not a toy): call it 0.5 GB RAM + 0.25 vCPU always-on (smaller than this risks OOM under any real write load). Cost: RAM $0.00000386×0.5×2,592,000s = $5.00/mo; CPU $0.00000772×0.25×2,592,000s = $5.00/mo → **≈$10/mo/tenant if always-on**.
- × 3,000 = **≈$30,000/mo**, before Pro-seat fees, before egress, before the PITR add-on (Pro-gated, likely wanted for a paid product).
- Serverless/sleep *could* cut this, but §2.2's own community-reported reliability problem (poolers block sleep; first-request 502s) makes it an unproven lever for a system where pooling is mandatory for concurrent gym staff traffic.
- **Ratio vs. a single shared Railway Postgres** (1 vCPU + 2 GB RAM always-on ≈ $40/mo compute + trivial storage ≈ $42–65/mo all-in including Pro seat): DB-per-tenant is **≈460–700× more expensive**, with no platform lever (branching, project tiers) to close the gap the way Neon at least attempts to.

---

## 3. Fly Postgres

Fly has **two distinct products** as of 2026 and this matters a lot for the multi-tenant answer.

### 3.1 Fly Managed Postgres (MPG) — the current first-party offering
Source: [fly.io/docs/mpg/](https://fly.io/docs/mpg/), fetched 2026-07-27; search corroboration on pricing figures.

| Plan | CPU | RAM | Monthly |
|---|---|---|---|
| Basic | Shared-2x | 1 GB | $38 |
| Starter | Shared-2x | 2 GB | $72 |
| Launch | Performance-2x | 8 GB | $282 |
| Scale | Performance-4x | 32 GB | $962 |
| Performance | Performance-8x | 64 GB | $1,922 |

- Storage: $0.28/provisioned-GB for a 30-day month. Max 1 TB; initial provisioning up to 500 GB.
- Egress: intra-region free; starting Feb 2026 inter-region private transfer bills at standard Machine rates (region-tiered, see §3.2).
- Backups/PITR: included on all plans; community-report-derived (not an official page I could fetch cleanly) recovery window **≈10 days**, not documented as adjustable — [community.fly.io thread](https://community.fly.io/t/managed-postgres-backup-recovery-window/25903), fetched via search 2026-07-27, flagged as community-sourced not vendor-doc-sourced.
- Connection pooling: **built-in PgBouncer on every plan**. Fixed connection-slot ceiling per plan: Basic/Starter 200 max client connections, Launch 500 — [community.fly.io thread](https://community.fly.io/t/fly-managed-postgres-and-database-connection-limit-using-the-pg-bouncer/27103), fetched via search 2026-07-27. Default pool mode is **session mode** (not transaction mode like Neon/Supabase), which is more compatible but pools less aggressively — worth flagging since RED's RPC layer assumes transaction-pooled Supavisor today.
- **Scale-to-zero: not applicable.** MPG has no auto-suspend/scale-to-zero mechanism in any fetched source. HA and always-on are the model.
- Largest instance: Performance-8x / 64 GB RAM ($1,922/mo), smaller than Neon's 56 CU/224 GB.
- Regions: 12 (Amsterdam, Frankfurt, São Paulo, Ashburn VA, Los Angeles, London, Tokyo, Chicago, Singapore, San Jose, Sydney, Toronto) — includes São Paulo, relevant for LatAm latency, a genuine point in Fly's favor for this specific product (RED is LatAm-only).

### 3.2 Legacy/unmanaged Fly Postgres (Postgres-on-Machines)
Source: [fly.io/docs/postgres/](https://fly.io/docs/postgres/), fetched 2026-07-27.
- Explicitly marked as the older path: "We are **not able to provide support or guidance for unmanaged Postgres**." This is Fly's own words, in their own current docs, in 2026 — i.e., building new production infrastructure on this path in 2026 is choosing an EOL/community-support-only product.
- It does support "automatic scale to zero" for a single-instance "Development" preset — the only scale-to-zero-capable Postgres Fly offers at all.
- Underlying compute is billed as raw Fly Machines: [fly.io/docs/about/pricing/](https://fly.io/docs/about/pricing/), fetched 2026-07-27 — e.g. shared-cpu-1x/256MB ≈ $0.00000078/s ≈ $2.02/mo if always-on in Amsterdam; region-tiered egress ($0.02/GB NA/EU public, $0.006/GB NA/EU private cross-region; up to $0.12/GB Africa public); volumes $0.15/GB-mo; snapshots $0.08/GB-mo with first 10 GB/mo free.

### 3.3 Multi-tenant: DB-per-tenant at 3,000 gyms

**Via MPG (the supported, current product):** no scale-to-zero at all, so cost is flat regardless of tenant activity.
- Cheapest plan (Basic, $38/mo) × 3,000 tenants = **$114,000/mo minimum**, before storage/backup/egress add-ons, before any tenant even receives a single request. This is the most expensive of the three DB-per-tenant floors computed in this report, and unlike Neon/Railway it is a *hard* floor with no lever (no sleep, no autoscale) to reduce it.
- Compare to a single shared MPG instance sized generously (Launch, $282/mo, 8 GB RAM) serving all 3,000 tenants combined: **ratio ≈ 404×**.

**Via unmanaged Postgres-on-Machines (unsupported):** theoretically the cheapest of all three platforms for idle-heavy tenants — a scale-to-zero-capable shared-cpu-1x machine could run **≈$2–5/mo/tenant** if genuinely idle most of the day, giving ≈$6,000–15,000/mo at 3,000 tenants (still ≈20–50× the single-shared-instance cost, and that's the *optimistic* case assuming RED's gyms are idle enough for scale-to-zero to bite, which §1.2's Neon evidence suggests is a bad assumption for actively-staffed small businesses). But this path requires RED to build and operate its own HA/failover/backup/pooling automation across 3,000+ unsupported clusters with **zero vendor support**, an operational liability the dollar figure does not capture. Org-level app/machine count ceilings for provisioning 3,000+ apps were not found in any official Fly doc during this session — community threads mention a default machine ceiling around the low tens-to-hundreds per org, raisable on request, but I could not confirm an exact published number, so treat "can Fly even provision 3,000 separate apps via API" as **open/unverified**, not confirmed either way.

---

## 4. Forced ranking — 5 worst things about {Neon, Railway, Fly} as the DB tier, worst first

1. **Neon's DB-per-tenant floor, driven by the platform's own health-check pings, makes 3,000-tenant DB-per-tenant ≈185× more expensive than a single shared DB (≈$120k/mo vs. ≈$650/mo), directly contradicting Neon's "empty projects are virtually free" marketing claim.** Evidence: Neon staff response in [github.com/neondatabase/neon#12900](https://github.com/neondatabase/neon/discussions/12900) (6 CU-hr/day floor from `check_availability` pings, independent of real traffic) × Scale-plan rate $0.222/CU-hr × 3,000 projects. Breaks at: any tenant fleet where individual tenants generate real, continuously-polled traffic rather than sitting idle — which describes every one of RED's 3,000 target gyms, since they're staffed businesses running check-ins/POS through business hours, not dormant trial accounts. Confidence: modelled from a community-reported, vendor-staff-acknowledged number, not an official pricing-page SLA — this is the single biggest verification gap in the report (see blind spots).

2. **Fly Managed Postgres has zero scale-to-zero, so DB-per-tenant there is a flat, un-optimizable $114,000/mo floor at 3,000 tenants (Basic plan × 3,000) — the most expensive and least flexible of the three floors computed.** Evidence: [fly.io/docs/mpg/](https://fly.io/docs/mpg/) plan table, no autosuspend mechanism found in any fetched MPG doc. Breaks at: any tenant count where per-instance always-on billing (vs. Neon/Railway's at-least-partial usage-based billing) starts to dominate — for RED specifically, 3,000 gyms at the cheapest MPG tier already exceeds a full year of Supabase's entire prior-audit platform cost estimate in a single month.

3. **Fly's only scale-to-zero-capable Postgres path is a product Fly's own current docs say they "are not able to provide support or guidance for."** Evidence: [fly.io/docs/postgres/getting-started/what-you-should-know/](https://fly.io/docs/postgres/) header notice, fetched 2026-07-27. Breaks at: the moment RED needs a support ticket answered, a failover debugged, or a security patch applied across a fleet Fly has explicitly disclaimed — this is not a cost number, it's an operational-risk ceiling that applies at any scale, including 1 tenant.

4. **Railway has no bulk/discounted multi-tenant primitive at all (no branching, no project-count tiers) and the one feature that would make per-tenant cost tractable — sleep-to-zero — is documented by Railway's own community forum as unreliable exactly when a connection pooler is present, which is mandatory for RED's concurrent-staff access pattern.** Evidence: [docs.railway.com/deployments/serverless](https://docs.railway.com/deployments/serverless) + Central Station threads on services failing to sleep with an open pooler / failing to wake (502 on first request). Modelled DB-per-tenant cost at 3,000 gyms: ≈$30,000/mo always-on (≈460–700× the single-shared-DB estimate), with no credible lever to bring that down.

5. **Railway's own scaling documentation is internally inconsistent about the largest instance size available (8 vCPU/8 GB vs. 48 vCPU/48 GB for Hobby; 32 vCPU/32 GB vs. 24 vCPU/24 GB for Pro, across different excerpts of the same doc page), so "largest instance available" cannot be stated with confidence from primary sources.** Evidence: [docs.railway.com/reference/scaling](https://docs.railway.com/reference/scaling) — two fetches of the same page yielded different numbers. This is a minor finding relative to 1–4, but it means any capacity-planning number quoted from Railway's docs should be re-verified with sales before being load-bearing in a real migration decision.

**Honesty note (rule 7):** two things in this candidate set are genuinely good and better than the incumbent on a specific axis, not manufactured to pad the ranking:
- **Neon's branching is free-tier-available, instant, and copy-on-write** — strictly better than Supabase's current Pro-gated branching, which is an actual recorded pain point in this repo's own memory (`test:denial` needs a scratch project because "preview branching is Pro-gated / 402; the free tier fits exactly one scratch beside live"). If RED ever migrated to Neon for reasons other than multi-tenancy, this specific friction goes away.
- **Railway's PgBouncer integration is a one-click, auto-migrating, replica-scalable pooler** with a materially better developer UX than Neon's manual `-pooler`-suffix convention or Supabase's Supavisor setup, and its PITR (pgBackRest, weekly-full + daily-incremental, ~4-week window) is a real, working feature — just Pro-gated.
- **Neon's official multitenancy guidance explicitly ranks shared-schema+RLS (RED's current, ADR-0013/0014-locked architecture) as the weakest of three patterns for SaaS**, recommending project-per-tenant instead. This audit's own math (finding #1) shows project-per-tenant is not economically viable for RED's traffic shape on Neon today — so the two claims coexist: Neon's architectural advice and Neon's own pricing floor contradict each other for a tenant fleet that looks like RED's.

---

## 5. What would make each "keep the incumbent" or "switch" call wrong — falsification checks I actually ran

- **Falsifies "Neon DB-per-tenant is disqualifying":** if the #12900 ping-floor bug has been fixed since that report and real-world CU-hr/day for a low-traffic project is now near-zero, the 185× ratio collapses toward parity or better. *Checked*: searched for a Neon changelog/fix acknowledging this; found none in this session. Still open — flagged as the top verification item for the synthesizer/next agent (query Neon support directly, or provision one real test project and measure).
- **Falsifies "single shared DB is cheap on all three platforms":** if RED's real query volume at 3,000 gyms × 150–300 members needs materially more than the 2–4 CU / 1–2 vCPU sizes assumed here (e.g., if the multigym RLS correlated-subplan issue flagged elsewhere in this repo's own docs, `adr-0013-rls-per-row-claim-is-false`, makes every query touch far more rows than assumed), compute cost for the single-DB scenario rises on all three platforms roughly in proportion — this doesn't change the *ranking* between platforms much since it scales all three together, but it would raise all the single-DB dollar figures in this report. *Not independently re-verified in this session* — out of this agent's mandate (that's the RLS-performance audit's job), but noted since it's an input to every dollar figure here.
- **Falsifies "Fly MPG has no scale-to-zero":** if Fly shipped auto-suspend for MPG after the docs I fetched were last updated, finding #2 disappears. *Checked*: no scale-to-zero mention anywhere in [fly.io/docs/mpg/](https://fly.io/docs/mpg/), [fly.io/docs/mpg/pricing/](https://fly.io/docs/mpg/pricing/) (404'd — page may have moved/renamed), or search results as of 2026-07-27.

---

## 6. Blind spots — what I did NOT examine

1. **Never provisioned a real Neon/Railway/Fly project to measure actual CU-hours, wake latency, or connection behavior against RED's real workload.** Every number here is from vendor docs/pricing pages or third-party/community reports, not a live experiment. The #12900 ping-floor number in particular deserves direct verification (spin up one Neon Scale-plan project mimicking a single gym's traffic, watch the usage dashboard for a week) before it's treated as load-bearing for a migration decision.
2. **Did not model migration cost/risk** (schema/RLS porting effort, Postgres extension parity, auth migration off Supabase Auth, data migration downtime) for any of the three platforms — this report is DB-tier pricing/architecture only, per mandate, but a synthesizer weighing "switch vs. stay" needs that separately.
3. **Did not verify Fly's org-level app/machine provisioning ceiling** at anything near 3,000 apps — no official number found; only unconfirmed community-thread mentions of much smaller default ceilings. This directly affects whether Fly's unmanaged DB-per-tenant path (§3.3) is even *executable* at target scale, independent of cost.
4. **Did not price Neon's Business/Agent-plan base subscription fee** — both exist per docs/blog but neither publishes a base price; the Agent-plan compute rate I found ($0.106/CU-hr) contradicts the Scale-plan rate ($0.222/CU-hr) and I could not reconcile which applies at 3,000-gym scale for a non-AI-agent SaaS.
5. **Did not test whether RED's actual RPC/query patterns (Supavisor transaction-mode pooling assumptions baked into `packages/data`) are compatible with Fly MPG's default session-mode pooling** or Railway's PgBouncer pool-mode options — this is a real porting-cost question, not just a pricing one, and it's outside this agent's pricing-only mandate but will matter to whoever picks a target.
6. **Did not independently reproduce or challenge the prior-work auth-structure audit's $0.53–1.04/gym/mo Supabase estimate** to compute exact ratios against my DB-per-tenant floors — I used it only as a rough order-of-magnitude anchor for "what does the current platform cost look like" in §4, not as a verified premise.
