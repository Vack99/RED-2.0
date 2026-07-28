# Supabase billing meters & tier limits — primary-source audit

Agent: `price:meters` | Date fetched: 2026-07-27 | Subject: RED 2.0, target scale 3,000 gyms x 150-300 members

All numbers below are quoted/paraphrased from a live fetch of the cited URL on 2026-07-27. Every number
has a URL next to it. Where I could not find a primary-source page (404s hit while crawling the docs
site), I say so explicitly rather than guess.

---

## 1. Full meter table, Free / Pro / Team / Enterprise

Source: https://supabase.com/pricing (fetched 2026-07-27) cross-checked against
https://supabase.com/docs/guides/platform/manage-your-usage/* pages (fetched 2026-07-27, each cited inline).

| Meter | Free | Pro ($25/mo base) | Team ($599/mo base) | Enterprise |
|---|---|---|---|---|
| **MAU** (Auth) | 50,000 included | 100,000 included, then **$0.00325/MAU** | 100,000 included, then $0.00325/MAU | Custom |
| **Database/Disk size** | Gated by **500 MB database-size** limit (no separate disk quota — see §3) | **8 GB** disk (gp3) included, then **$0.125/GB/mo** ($0.000171/GB-Hr); io2 $0.195/GB/mo from byte 1 | Same as Pro: 8 GB, $0.125/GB/mo | Custom |
| **Egress (uncached)** | 5 GB | 250 GB, then **$0.09/GB** | 250 GB, then $0.09/GB | Custom |
| **Egress (cached)** | 5 GB | 250 GB, then **$0.03/GB** | 250 GB, then $0.03/GB | Custom |
| **File Storage size** | 1 GB (744 GB-Hrs) | 100 GB (74,400 GB-Hrs), then **$0.0213/GB/mo** ($0.00002919/GB-Hr) | 100 GB, then $0.0213/GB/mo | Custom |
| **Edge Function invocations** | 500,000 | 2,000,000, then **$2/1M** | 2,000,000, then $2/1M | Custom |
| **Realtime messages** | 2,000,000 | 5,000,000, then **$2.50/1M** | 5,000,000, then $2.50/1M | Volume discount |
| **Realtime peak connections** | 200 | 500, then **$10/1,000** | 500, then $10/1,000 | Custom concurrency + volume discount |
| **Log retention** | 1 day | 7 days | **28 days** | 90 days |
| **Automatic backups / PITR** | none | 7 days | 14 days | Custom |
| **Branching** | not offered | **$0.01344/branch/hour** (Micro compute); no fixed fee, no free compute credit applies | Same: $0.01344/branch/hour | Custom |
| **Support** | Community only (Discord/GitHub) | Email, **no SLA** | Priority email **with SLA** (see §5) | 24×7×365, designated support manager, Priority Plus SLA |
| **Compliance** | — | — | SOC2 & ISO 27001 | (implied superset) |
| **Compute credit** | — | $10/mo (covers 1 Micro/Nano project) | $10/mo | Custom |
| **Active projects** | **Limit of 2** | not documented (see §4) | not documented | not documented |
| **Uptime SLA** | **None** | **None** | **None** | 99.9%/mo, credits (see §5) |

Sources for the row-by-row detail (each fetched 2026-07-27):
- MAU: https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users — *"Distinct users who log in or refresh their token during the billing cycle"*, counted once/cycle.
- Disk: https://supabase.com/docs/guides/platform/manage-your-usage/disk-size
- Egress: https://supabase.com/docs/guides/platform/manage-your-usage/egress — *"Network data transmitted out of the system to a connected client"* from Database, Auth, Storage, Edge Functions, Realtime, Log Drains, and the Supavisor pooler.
- Storage: https://supabase.com/docs/guides/platform/manage-your-usage/storage-size
- Edge Functions: https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations — billed on invocation count *"regardless of response status code"*; preflight requests excluded.
- Realtime messages: https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages — *"Includes database changes, Broadcast and Presence."*
- Realtime peak connections: https://supabase.com/docs/guides/platform/manage-your-usage/realtime-peak-connections — *"Highest number of concurrent connections for each project during the billing cycle."*
- Branching: https://supabase.com/docs/guides/platform/manage-your-usage/branching — *"Compute Credits do not apply to Branching Compute"* and branching usage is *"not covered by the Spend Cap."*
- Pricing table / log retention / backups / support / compliance: https://supabase.com/pricing and https://supabase.com/pricing.md

Two meters exist that the mandate's "at minimum" list didn't name but the docs surface — noted for
completeness, not modelled further because RED doesn't touch them: **Monthly Active Third-Party Users**
and **Monthly Active SSO Users** (separate meters, both under `manage-your-usage/`), plus **Log Drains**,
**Storage Image Transformations**, **Custom Domains**, **PITR**, **IPv4**, **Disk Throughput**, **Disk
IOPS**, and **Read Replicas** — all confirmed to exist as their own line items at
https://supabase.com/docs/guides/platform/manage-your-usage (fetched 2026-07-27) but out of scope because
RED uses none of the underlying features today (zero `.channel(`/`postgres_changes`/`storage.from(` in
repo, corroborating the prior audit's grep).

---

## 2. Hard-capped vs soft-billed — the distinction the mandate asks for

This is the single most important thing this document establishes, and it is **plan-dependent**, not a
fixed property of a meter.

**Source:** https://supabase.com/docs/guides/platform/cost-control (fetched 2026-07-27) +
https://supabase.com/docs/guides/platform/billing-faq (fetched 2026-07-27).

- **Spend Cap is a Pro-only feature.** Verbatim, twice, from two different pages: cost-control —
  *"available only with the Pro Plan"*; billing-faq — *"The Pro Plan has a Spend Cap enabled by
  default."* Team and Enterprise are **not** mentioned as having a Spend Cap toggle anywhere in the
  fetched docs.
- **On Free:** there is no billing to cap (Free doesn't charge overages) but there is still a ceiling —
  the Fair Use Policy. Exceeding a quota puts the org in a grace period; once the grace period is spent,
  restrictions apply (see §2b).
- **On Pro, Spend Cap ON (the default):** *"After exceeding the quota for a usage item, further usage of
  that item is disallowed until the next billing cycle."* Cost-control's table lists **all seven** metered
  items (MAU, disk/database size, egress, storage, edge function invocations, realtime messages, realtime
  peak connections) as covered by this block. This is a **hard cap** — the meter stops working, you are
  not billed for the overage, and the outage/degradation persists until the billing cycle rolls over or
  you manually disable the cap.
- **On Pro, Spend Cap OFF (manually disabled):** *"Your projects will continue to operate after exceeding
  the quota... Any additional usage will be charged based on the item's cost per unit."* **Soft-billed** —
  no cap, straight overage invoicing at the rates in §1.
- **On Team/Enterprise:** because Spend Cap isn't documented as available, the default behaviour is
  soft-billed overage on all seven meters, by omission — the docs never say Team can be capped. This is
  an inference from absence, flagged as such, not a verbatim quote.
- **The escape hatch that isn't really an escape hatch:** even with Spend Cap off / on Team, the Fair Use
  Policy still applies generally: *"your services will be restricted according to our Fair Use Policy if
  you consistently exceed the quota"* (cost-control) and, per
  https://supabase.com/docs/guides/platform/billing-faq (fetched 2026-07-27) via the fair-use-policy
  content surfaced in search, sustained restriction returns **HTTP 402** on every project in the
  restricted org, for every route, until the underlying issue (usage or an unpaid invoice) is resolved.
  **No numeric threshold for "consistently"** is published anywhere I could find — this is a genuine
  unknown, not a gap in this research.

### 2b. What "restricted" concretely means
Source: search-surfaced content from https://supabase.com/docs/guides/platform/billing-faq (fetched
2026-07-27, via WebSearch snippet quoting the live page — I was not able to load this specific paragraph
via direct WebFetch, flagged below): *"If service restrictions are applied, projects will return a 402
status code together with a description of why the project is restricted."* This is applied **per
organization, to all its projects at once** — *"The Fair Use Policy is generally applied to all projects
of the restricted organization."* For RED (one org, one project, all 3,000+ gyms in it), a 402 restriction
is a **platform-wide outage for every gym simultaneously**, not a per-gym degradation.

**Caveat on this sub-section:** the 402/grace-period wording came back from a WebSearch snippet of
`billing-faq`, not a clean WebFetch render of that exact anchor (my direct WebFetch of
`billing-on-supabase/fair-use-policy` 404'd — that URL doesn't exist; the content lives inline in
`billing-faq`). I'm citing it because the search snippet quotes the live page verbatim and multiple
independent phrases corroborate each other, but flagging that I did not get a full clean page render of
this specific paragraph the way I did for the others.

### 2c. A gap in the prior audit this finding exposes
`docs/Context/2026-07-27-auth-structure-scale-audit.md:133` models "Auth MAU overage" as a straight bill
($845-$1,430/mo) and its cost table (line ~127-137) uses the **Pro** base price ($25/mo), while its own
prose at line 150 says *"Treat Team, not Pro, as the real floor."* Neither the cost table nor the prose
mentions Spend Cap. If the project is actually on Pro (as the cost table's base-price line implies) with
Spend Cap left at its **default ON** setting, MAU overage does not bill at all past 100k/cycle — it
**hard-blocks new logins for the whole platform** for the rest of the billing cycle instead. The prior
audit's dollar figure and this audit's outage finding are two different, plan-toggle-dependent futures for
the exact same number (270k-607k MAU), and the repo has no record of which one is true because the Spend
Cap toggle isn't a SQL-readable setting — it's a dashboard checkbox. **This should be checked in the
Supabase dashboard directly (Organization Settings → Billing → Cost Control) — it is not verifiable from
this read-only DB session.**

---

## 3. Database size / disk — the one meter that can outage regardless of plan or Spend Cap

Source: https://supabase.com/docs/guides/platform/database-size (fetched 2026-07-27).

- **Read-only mode activates at 95% of provisioned disk.** Verbatim behaviour: clients get
  `"cannot execute INSERT in a read-only transaction"`. Read-write resumes automatically once usage drops
  back below 95%.
- **Auto-scaling exists on Pro+** (not Free): at 90% of allocated space, disk expands by 50%, capped at
  +200 GB per expansion, **limited to 4 expansions per rolling 24-hour window**. *"If you exhaust this
  quota while at 95% utilization, the database enters read-only mode."* This ceiling is **not** gated by
  the Spend Cap toggle — it is a physical/API rate limit on the resize operation itself, so it applies on
  Pro, Team, and (presumably, not stated) Enterprise alike.
- **Free plan specifically:** read-only triggers at **500 MB of actual database size** (not the 1 GB disk
  figure) — *"measured as actual data size, not total disk space."*
- **Scope: per-project, not org-pooled.** Direct quote, https://supabase.com/docs/guides/platform/manage-your-usage/disk-size
  (fetched 2026-07-27): *"Billing Scope: Disk charges apply per project."* Irrelevant for RED today (one
  project), but material if the platform ever splits gyms across multiple Supabase projects — under that
  model each project gets its own fresh 8 GB, which is a *pooling win* the org-wide MAU/storage/edge-fn
  meters wouldn't give.

### 3a. Documented contradiction (as instructed by the mandate)
- **General statement**, https://supabase.com/docs/guides/platform/billing-on-supabase (fetched
  2026-07-27): *"The quota is applied to your entire organization, independent of how many projects you
  launch."* — stated of variable usage quotas generally.
- **Specific statement**, disk-size page (same fetch date): *"Disk charges apply per project."*
- These two pages disagree on disk/database size specifically. The disk-size page is the more specific
  and more recently-scoped source (it's the dedicated meter page), so I weight it as authoritative for
  disk size, but I am reporting both per the mandate's instruction rather than silently picking one.

---

## 4. Projects included — thinly documented, and this matters to RED's own workflow

- **Free: hard cap of 2 active projects**, and it's **not per-organization — it's per owner/admin across
  every organization they belong to.** https://supabase.com/pricing.md (fetched 2026-07-27): *"Free
  projects are paused after 1 week of inactivity"* and the project cap applies to *"organizations where
  you are an Owner or Administrator."*
- **Pro/Team/Enterprise: no numeric project cap found in any primary-source page fetched.** Every doc
  frames paid-plan projects purely as independent compute-billing units (§1, compute page: *"Each project
  you launch increases your monthly Compute costs"*), never as a capped resource. I did not find a page
  that affirmatively states "unlimited" either — the honest statement is **the docs are silent on an upper
  bound**, not that one is confirmed absent.
- **Why this matters to RED specifically, today, not hypothetically:** `AGENTS.md` (this repo) already
  documents a scratch-project pattern for `pnpm test:denial` and says *"preview branching is Pro-gated /
  402; the free tier fits exactly one scratch beside live."* That sentence is a direct, lived encounter
  with the Free-tier 2-project cap. **Breaking point: the moment two scratch projects are needed
  concurrently** (e.g., two engineers validating two migration-bearing branches in parallel, or a scratch
  project that isn't torn down promptly after one session), the global 2-free-project ceiling blocks
  creating the second one until an existing Free project is deleted or upgraded to paid. This is a hard
  block on project creation, not a bill.

---

## 5. Support SLA — quoted in full because the prior audit didn't have the numbers

Source: https://supabase.com/sla (fetched 2026-07-27).

- **Uptime commitment:** *"99.9% monthly availability"* — **Enterprise only.** Free, Pro, and Team carry
  **no uptime SLA at all** (the page frames the 99.9% figure specifically "for Enterprise customers";
  nothing on the Team pricing row promises uptime — corroborated against https://supabase.com/pricing
  which lists no uptime figure for Team). This independently confirms the prior audit's claim at
  `docs/Context/2026-07-27-auth-structure-scale-audit.md:150`.
- **Uptime credit schedule (Enterprise only):**

  | Actual monthly availability | Service credit |
  |---|---|
  | 99.0% – 99.9% | 10% |
  | 98.0% – 99.0% | 15% |
  | 96.0% – 98.0% | 20% |
  | Below 96.0% | 30% |

  Credits capped at 20% of annual fees paid for the affected service.

- **Support response-time table**, quoted from the same page:

  | Severity | Team | Enterprise Standard | Enterprise Priority Plus |
  |---|---|---|---|
  | Urgent (system outage) | 24 hrs, 24/7 | 1 hr, 24/7 | 1 hr, 24/7 |
  | High (major functionality impacted) | 1 business day (M-F) | 2 hrs (M-F) | 2 hrs, 24/7 |
  | Normal (component malfunction) | 1 business day (M-F) | 1 business day (M-F) | 12 hrs, 24/7 |
  | Low (information request) | 2 business days (M-F) | 2 business days (M-F) | 24 hrs, 24/7 |

  *"Business hours are defined as 6am to 6pm local time unless stated otherwise."*
- **Reading this straight:** on Team ($599/mo, the plan the prior audit itself recommends as "the real
  floor"), a **total system outage gets a 24-hour first-response commitment** — worse than Enterprise
  Standard's "High" (non-outage) severity (2 hrs). There is no dollar figure published for what
  Enterprise costs to get the 1-hour outage response, so I cannot compute where the jump from Team to
  Enterprise becomes worth it — that number isn't public.

---

## 6. Free project pause — full policy

Source: https://supabase.com/docs/guides/platform/free-project-pausing (via WebFetch, fetched 2026-07-27)
+ https://supabase.com/pricing.md (fetched 2026-07-27, corroborating).

- **Trigger:** *"low activity over a 7-day period"* — *"a few user requests to the database each day over
  the previous week is enough"* to avoid pausing. Activity includes dashboard visits, API calls, and
  connected-app requests, not just raw SQL.
- **Scope:** Free-plan projects only. *"Projects under a paid plan cannot be paused and are not subject to
  automatic pausing for inactivity"* (from the earlier troubleshooting-page search snippet,
  `supabase.com/docs/guides/troubleshooting/pausing-pro-projects-vNL-2a`, title implies Pro projects are
  explicitly *not* auto-paused — corroborates).
- **What happens paused:** data and configuration are retained; project is inaccessible until resumed.
- **Restore window:** **1 year** to restore via the dashboard ("Resume project"). No published limit on
  how many times you can pause/resume within that window. No published statement of what happens after
  the 1-year window expires (deletion is implied by the framing but never stated verbatim in what I
  fetched — flagged as unconfirmed, not asserted).

---

## 7. Breaking-point modelling against RED's target scale (3,000 gyms x 150-300 members)

RED is confirmed **one Supabase project / one organization** for the whole platform (ADR-0012, `AGENTS.md`
architecture section; live baseline in the mandate: 4 gyms, one project). That means every **org-level**
meter (MAU, storage, edge-function invocations, realtime messages — see the scope column built in §1-3)
pools automatically across all 3,000+ gyms. This is a real, load-bearing architectural benefit — it is the
reason MAU overage is one bill, not 3,000 separate per-gym Pro subscriptions each hitting their own 100k
ceiling. I want to state that plainly (Rule 7: say when something is sound) before ranking what breaks.

### 7a. MAU — modelled

Included quota: 100,000 (Pro & Team). Overage: $0.00325/MAU (§1, verified).

`gyms_to_breach = 100,000 / (avg_members_per_gym × monthly_activation_rate)`

| Assumption | Monthly-active rate | Breaks at (gyms) | % of 3,000-gym target |
|---|---|---|---|
| Conservative (email-mostly members, rarely opens app) | 40% | 100,000/(225×0.40) = **1,111 gyms** | 37% |
| Moderate (checks schedule/reserves classes monthly) | 60% | 100,000/(225×0.60) = **741 gyms** | 25% |
| Aggressive (app required for booking/check-in) | 90% | 100,000/(225×0.90) = **494 gyms** | 16% |

(avg_members_per_gym = midpoint of the mandate's 150-300 range = 225)

At full target scale (3,000 gyms × 225 = 675,000 total accounts), overage cost by scenario:

| Scenario | MAU | Overage cost/mo |
|---|---|---|
| 40% activation | 270,000 | (270,000-100,000)×$0.00325 = **$552.50** |
| 60% activation | 405,000 | (405,000-100,000)×$0.00325 = **$991.25** |
| 90% activation | 607,500 | (607,500-100,000)×$0.00325 = **$1,649.38** |

This range brackets the prior audit's $845-$1,430/mo figure (`docs/Context/2026-07-27-auth-structure-scale-audit.md:133`,
which used 360k-450k MAU) — good convergence on the dollar model. The two audits disagree only on
whether this is *guaranteed to be a bill* (see §2c — it depends on a dashboard toggle neither audit could
read).

### 7b. Database size — modelled from the mandate's own baseline bytes/row

Using the baseline's measured bytes/row (incl. indexes) and the baseline's own row-count ratios relative
to `clientes` (116 rows today) as a **proxy growth ratio** — flagged explicitly as a snapshot-in-time ratio
from an early-stage seed, not a proven steady-state accrual rate, since `asistencias`/`reservation` are
append-only logs that grow with *time-in-operation*, not just member count:

| Table | bytes/row | current ratio to clientes | rows @ 675,000 members | est. bytes |
|---|---|---|---|---|
| clientes | 1,483 | 1.000 | 675,000 | 1.001 GB |
| ventas | 936 | 1.509 (175/116) | 1,018,575 | 0.953 GB |
| asistencias | 558 | 6.078 (705/116) | 4,102,650 | 2.289 GB |
| reservation | 602 | 3.991 (463/116) | 2,694,675 | 1.622 GB |
| class_session | 613 | scales with gyms, not members: 137/gym × 3,000 | 411,000 | 0.252 GB |
| **Subtotal** | | | | **~6.12 GB** |

Against the 8 GB included on Pro/Team, this subtotal (five tables only — no `schedule_template_week`,
`gym_membership`, `auth.users`, indexes on those, WAL, or the continued monthly accrual of
`asistencias`/`reservation` past the snapshot point) is already at **77% of the included quota** using
today's early-stage per-member row ratios. Since `asistencias` and `reservation` are logs that keep
growing every month a gym stays open (not a one-time allocation per member), **the true multi-year figure
will exceed 8 GB**, not approach it. That's expected and not alarming by itself — §3 confirms Pro/Team
auto-expand disk at 90% by 50% (soft-billed at $0.125/GB/mo) — but it establishes that disk overage
billing is a near-certainty at target scale within the first 1-2 years, and it is the one meter (§3) where
a fast-enough spike (not gradual growth — a bug-triggered write storm) can outrun the 4-bumps/24h
autoscale ceiling and force read-only regardless of plan or Spend Cap.

### 7c. Egress — modelled, lightly

Illustrative only (no primary source gives a "bytes per API request" constant to derive this from
first principles). Assuming 300,000 MAU × ~50 requests/month × ~5 KB average JSON response ≈ **75 GB/mo**
— comfortably under the 250 GB Pro/Team included tier. The prior audit's claim that *"egress never binds
because every read is server-side"* (`docs/Context/2026-07-27-auth-structure-scale-audit.md:147`) is
**directionally right but the stated reasoning is imprecise**: Supabase's own egress definition (§1) is
*"data transmitted out of the system to a connected client"* — a Vercel serverless function is as much a
"connected client" as a browser is, so server-side rendering does not exempt those bytes from Supabase's
egress meter. What server-side rendering *does* do is let one Vercel fetch serve many browsers from cache
instead of N browsers each hitting Supabase directly — a real volume reduction, just not the "doesn't
count" mechanism the prior audit implied. Net effect on the number is the same (egress is not the binding
constraint at modelled volumes) but the causal story in the prior write-up should be corrected.

---

## 8. Forced ranking — 5 worst things about Supabase's metering/billing model for RED, worst first

1. **MAU is the meter most certain to bind, and its failure mode is plan-toggle-dependent and currently
   unknown for this org.** Breaks at 494-1,111 gyms (16-37% of the 3,000-gym target, §7a) — well before
   full target scale, on the *one* meter that scales almost 1:1 with the product's core usage signal
   (logged-in members). Whether crossing it produces a $550-1,650/mo bill (Team, or Pro with Spend Cap
   off) or a **platform-wide login outage for all 3,000+ gyms simultaneously** (Pro with Spend Cap left at
   its default ON) depends on a dashboard checkbox this read-only session cannot see, and which the prior
   audit's cost model silently assumed away (§2c). **Falsification check:** if RED is confirmed to be on
   Team (not Pro) today, this collapses from "outage risk" to "known, modelled cost risk" — because Team
   has no Spend Cap mechanism at all per the docs (§2). I could not confirm RED's current plan from this
   read-only DB session (the mandate's live-baseline block doesn't state it, and plan tier isn't in
   `pg_catalog`) — **this is the single most important thing to verify next, and it's a 30-second dashboard
   check, not an engineering task.**

2. **Database size read-only mode is the one true hard-outage meter that ignores plan tier and Spend Cap
   entirely.** §3, §7b. It doesn't bind from RED's *organic* growth curve (that reaches ~6 GB of just five
   tables at full target scale, gradually, over years — well inside the 4-bumps/24h autoscale allowance)
   but it is a live, standing risk from any future write-amplification bug (a retry loop, a fan-out job, a
   bad migration backfill) that appends rows fast enough to blow through 4 auto-expansions inside a single
   day. **Exit trigger: alert on `pg_database_size()` crossing 85% of provisioned disk** (5% of headroom
   below the 90% autoscale trigger) so a runaway write job is caught before the 95% read-only wall,
   regardless of which billing plan is active.

3. **The Fair Use Policy's "consistently exceed the quota" restriction threshold is undocumented anywhere
   in the primary sources I could reach.** Team/Enterprise have no Spend Cap (§2), which sounds like
   "always soft-billed," but cost-control's own text carves out an exception for sustained abuse with **no
   published number** — not X% over quota, not for how long. This means even a well-run Team-plan org
   cannot compute in advance the exact overage level that risks a 402. **Falsification check for "this is
   a real gap, not just undiscovered docs":** I ran three separate WebFetch/WebSearch passes at
   `billing-faq`, `cost-control`, and `fair-use-policy` looking specifically for a numeric threshold; none
   surfaced one. This should be treated as a genuine vendor disclosure gap, worth a direct support ticket
   before relying on Team's "no cap" framing for cost planning at 3,000-gym scale.

4. **The Free-tier 2-active-project cap is a global, cross-organization, per-person limit that RED's own
   `AGENTS.md` has already run into** (§4) — it's the reason the repo's documented pattern is "one scratch
   beside live," not "spin up scratch projects freely." **Breaking point: the second concurrent scratch
   project.** Low severity (it blocks CI/test workflow, not production), but it is the only finding in
   this document with a *documented, present-tense* collision with this repo's actual engineering practice
   rather than a future-scale projection.

5. **Team's support SLA gives a real system outage a 24-hour first-response commitment** — worse than
   Enterprise Standard's response time for a *non-outage* "High" severity ticket (2 hrs) (§5). This is the
   mildest finding in the set (it's a support-quality tradeoff, not a technical or billing ceiling), but at
   3,000 gyms' worth of dependents on one Supabase project, a same-day-not-same-hour commitment on a total
   outage is a genuine operational gap worth pricing against Enterprise once revenue supports it — no
   public number exists to say at what point that trade becomes worth it (Enterprise pricing is
   custom-quoted, never published).

**Honest counterpoint (Rule 7):** three of the seven metered items — Realtime, Storage, and Edge Functions
— are not close to binding at any modelled scale and are unlikely to become a ranking-worthy risk without
a genuinely new product surface (media uploads, live features, webhook fan-out) that doesn't exist in the
repo today (§1, corroborating the prior audit's grep for zero `.channel(`/`storage.from(` usage). Keeping
them off this top-5 list is not an oversight — the evidence says they're fine, for now, and the exit
trigger is simply: the day RED ships member-photo uploads or a live/realtime feature, re-run this model
for that specific meter before shipping it.

---

## 9. What I did NOT get from a clean primary-source render (transparency, per Rule 6)

- `billing-faq`'s exact FAQ-formatted Q&A blocks did not render fully through WebFetch (the tool converts
  to markdown via a summarizing pass); the 402/grace-period wording is corroborated across a WebSearch
  snippet of the live page plus two other pages (`cost-control`, `pricing.md`) using consistent language,
  but I did not get one single clean full-page dump of `billing-faq` verbatim.
- `billing-on-supabase/fair-use-policy` **404s** — that URL doesn't exist on the current docs site; the
  Fair Use Policy content lives inline in `billing-faq` instead. Anyone re-verifying this should start from
  `https://supabase.com/docs/guides/platform/billing-faq`, not the URL I first guessed.
- I did not find a primary-source page stating a numeric project-count cap for Pro/Team/Enterprise (§4) —
  reported as "docs are silent," not as "confirmed unlimited."
- I did not check current org-level MAU actuals against the live DB (`auth.users` count was already given
  in the mandate's baseline: 9, all signed in within 30 days — i.e. RED is at 9 MAU today against a 50k/100k
  included quota, nowhere near binding at current scale). All breaking-point modelling in §7 is therefore
  projection, not measurement.
