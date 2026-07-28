# Agent: price:gotcha — Supabase pricing fine print & step functions

**Date:** 2026-07-27
**Subject:** RED 2.0, target ≥3,000 gyms × 150–300 members, one Supabase project, Vercel + Resend.
**Method:** primary-source fetches of `supabase.com/pricing`, `supabase.com/docs/guides/platform/*`,
`supabase.com/sla`, `supabase.com/docs/guides/platform/billing-faq`, plus two targeted web searches
cross-checked against a live Supabase-staff GitHub reply and the `supabase/supabase` docs repo. All URLs
fetched **2026-07-27**. I did not adopt the prior audit's $0.53–$1.04/gym/mo verdict as a premise — I
re-derived every number in §7 from the primary sources below and flag every place the prior number was
wrong or incomplete.

**Everything in this file is about the meters, gates, and fine print. It does not re-litigate whether
Supabase is the right vendor — the prior audit already covers that ground.**

---

## 0. The single most load-bearing finding first

**"Spend Cap" does not cap your spend.** It caps 12 named usage items. It explicitly does **not** cover:
`Compute`, `Branching Compute`, `Read Replica Compute`, `Custom Domain`, `Disk IOPS` (extra), `Disk
Throughput` (extra), `IPv4 address`, `Log Drain Hours/Events`, `MFA Phone`, and — this is the one that
matters most for a company that was just told to buy PITR — **`Point-in-Time-Recovery`**.

Source (fetched 2026-07-27, `supabase.com/docs/guides/platform/spend-cap`):

> Covered: "Disk Size, Egress, Edge Function Invocations, Logs Ingest, Logs Query, Monthly Active Users,
> Monthly Active SSO Users, Monthly Active Third Party Users, Realtime Messages, Realtime Peak
> Connections, Storage Image Transformations, Storage Size"
>
> **NOT covered:** "Compute, Branching Compute, Read Replica Compute, Custom Domain, Additionally
> provisioned Disk IOPS, Additionally provisioned Disk Throughput, IPv4 address, Log Drain Hours, Log
> Drain Events, Multi-Factor Authentication Phone, **Point-in-Time-Recovery**"

A founder who reads "Spend caps are on by default on the Pro Plan" (same page) and concludes "I cannot
get a surprise invoice" is wrong in exactly the five ways this report ranks below. Compute — the single
largest line in every cost model, including the prior audit's own $210–$410/mo estimate — is not capped
either way; it simply always bills at the provisioned rate, spend-cap setting irrelevant. The name
"Spend Cap" describes a subset of the bill, not the bill.

---

## 1. FORCED RANKING — worst five things, worst first

### #1 — Spend Cap's blind spots are exactly the biggest line items (compute, PITR, replicas, branching)
**Claim:** Turning Spend Cap ON, the action the platform recommends and defaults to, gives zero
protection against the four cost lines most likely to actually move the bill at RED's scale: Compute
(the $210–$410/mo line), PITR (the $100–$400/mo line the prior audit told the owner to go buy today),
Read Replica Compute (a full second compute bill), and Branching Compute (which nothing auto-deletes).
**Evidence:** `supabase.com/docs/guides/platform/spend-cap`, fetched 2026-07-27 (quoted above).
**Breaks at:** the day compute autoscales past what was budgeted (organic MAU/write growth — no discrete
gym count, it's continuous), or the day one preview branch or one PITR purchase is left running past
when someone remembers to check the invoice. Not a gym-count threshold — a **process** threshold: nobody
owns "read the Supabase invoice monthly" today (nothing in `docs/adr/` or `CONTEXT.md` assigns this).
**Confidence:** measured (primary source, exact quote).
**Falsification check — what would make this NOT matter:** if RED's compute tier were fixed and manually
gated (never auto-scaled) and branching/replicas were never used. Compute tier at RED **is** manually
chosen today (no autoscaling compute product exists at Supabase — compute changes are always operator
click-through), which narrows this from "compute could silently balloon" to "PITR/branches/replicas are
the live exposure." I checked: this repo has **zero** Supabase branches created via MCP tooling evidence
and no branching workflow in `.github/` — so branching exposure is currently **theoretical**, not
active. It becomes active the moment CI branching (mentioned in `AGENTS.md`'s `SUPABASE_TARGET_REF`
scratch-project pattern) is swapped for native Supabase branching instead of a second throwaway project.
**Exit trigger:** if Supabase ships a documented "hard org-wide invoice ceiling" (not per-item) — reverse
this finding. Recheck `spend-cap` doc's covered-item list on every native-branching adoption decision.

### #2 — Disk size is a one-way ratchet: auto-grows, never auto-shrinks, re-triggerable 4×/24h
**Claim:** Disk billing is on **provisioned** size, not usage (`compute-and-disk` doc: "You are charged
for the provisioned disk size"), and disk "can increase but cannot decrease" via the normal path. Disk
auto-grows when usage crosses **90%** of allocated size, growing by **50%** each time, and Supabase
allows up to **4 such auto-grow events in a rolling 24-hour window** — so one bad script (a bulk import,
a bulk export, an un-vacuumed bloat spike) can compound 8GB → 12 → 18 → 27 → 40GB in a single day, and
that 40GB becomes the new permanent monthly floor ($0.125/GB/mo = $5/mo on this example) with no
dashboard path back down — the documented walk-back is a manual dump/restore into a new, smaller
project, i.e. a maintenance window.
**Evidence:** `supabase.com/docs/guides/platform/compute-and-disk` + `database-size.mdx`
(github.com/supabase/supabase), fetched/searched 2026-07-27.
**Breaks at:** any single bulk operation (a live-seed script — this repo already ran one, see
`docs/superpowers/handoffs/2026-07-20-red-gym-seed-members-handoff.md` — or an admin CSV bulk-import
feature the roadmap plausibly adds) that pushes DB size past 90% of the current disk allocation in one
sitting. At the **current 15MB / 4-gym baseline** this is nowhere close (default disk is 8GB = 90% is
7.2GB, ~480× current size) — this is a dollar-cheap finding today and becomes relevant only once real
per-gym data volume (photos via Storage, long attendance history) approaches the disk tier's headroom.
**Confidence:** modelled (auto-grow mechanics measured from docs; RED's own trigger distance is
computed from the live 15MB baseline given in the mandate, not independently re-queried this session).
**Falsification check:** if disk usage stays flat relative to allocation (i.e., the operator manually
right-sizes disk ahead of the 90% line), the ratchet never fires and this is a non-issue. That is a
**process** dependency, same shape as #1.
**Exit trigger:** once average per-gym data footprint is known (it isn't yet — no Storage/media use
today), recompute the 90% line against real growth rate; if projected growth is <10%/quarter, downgrade
this off the top-5 list.

### #3 — Team ($599/mo, 24× Pro) buys compliance certs, not reliability — no uptime SLA below Enterprise, and even Team's own incident SLA is Mon–Fri business hours for two of four severities
**Claim:** The prior audit's action item #17 says "Team plan ($599) for SOC2 / audit logs / 28-day
retention" as a before-3,000-gyms move, framed as a reliability upgrade. It is not one. Per
`supabase.com/sla` (fetched 2026-07-27):

| Severity | Team | Enterprise Standard | Enterprise Priority Plus |
|---|---|---|---|
| Urgent | 24h, 24/7×365 | 1h, 24/7×365 | 1h, 24/7×365 |
| High | **1 business day, Mon–Fri** | 2 business hours, Mon–Fri | 2h, 24/7×365 |
| Normal | **1 business day, Mon–Fri** | 1 business day, Mon–Fri | 12h, 24/7×365 |
| Low | 2 business days, Mon–Fri | 2 business days, Mon–Fri | 24h, 24/7×365 |

Uptime SLA: **"Uptime Service Level Agreements are only available to Enterprise customers"** — Team
carries **zero** uptime commitment despite the 24× price jump from Pro.
**Evidence:** `supabase.com/sla`, fetched 2026-07-27, quoted verbatim.
**Breaks at:** the first Saturday-morning production incident (LatAm gym peak walk-in window) rated
High or Normal severity on the Team plan — response commitment is "next business day," i.e., effectively
Monday, for a front-desk check-in outage happening on the day gyms are busiest.
**Confidence:** measured.
**Falsification check — is this actually worse than staying on Pro?** No: Team still adds *some* SLA
(Pro has none, see #4) and does add SOC2/ISO27001/PrivateLink which the prior audit correctly flagged as
gating real enterprise sales conversations. The finding is narrower and still true: **don't buy Team
expecting weekend incident coverage** — that requires Enterprise, which is custom-priced (no published
number; contact-sales only, not fetchable this session, marked ASSERTED-unavailable).
**Exit trigger:** re-evaluate the moment a gym-chain or franchise customer's procurement asks for an
uptime number in writing — that's the actual trigger for needing Enterprise pricing, not a gym count.

### #4 — Pro plan (what RED runs on today per the auth-structure audit) carries no support SLA at all
**Claim:** `supabase.com/support-policy` (fetched 2026-07-27): **"Support Service Level Agreements are
available to Teams and Enterprise customers"** — meaning Free and Pro get community Discord + an email
form with **no committed response time of any kind**, for any severity, including a full production
outage. This is the tier RED runs on through most of its growth curve under the prior audit's own
recommended sequencing (§17 places Team as a "before 3,000 gyms" move, i.e., something to defer).
**Evidence:** `supabase.com/support-policy`, fetched 2026-07-27.
**Breaks at:** zero gyms — this is true today, on the live project, right now. It's not a threshold
finding; it's a standing gap the prior audit's cost model (which counted the $25 Pro subscription fee)
never priced as a risk.
**Confidence:** measured.
**Falsification check:** best-effort support could still be fast in practice (many vendors beat their
own floor). I have no data on Supabase's actual Pro-tier response latency (not publishable — no primary
source states an average) — this is a **contractual** gap, not necessarily an observed-latency one.
Flagging it as a contract fact, not a claim about actual incident history.
**Exit trigger:** the first Sev-1 production incident where response time actually matters converts this
from theoretical to lived — track incident response time against zero commitment and decide whether
Team's still-limited SLA (see #3) is worth $599/mo before that happens, not after.

### #5 — The headline number is never the whole number: PITR's hidden compute floor, replicas at full uncapped compute price, and log retention that isn't purchasable without a whole-tier upgrade
Three separate fine-print items, same shape, bundled because each alone is medium severity:

**5a. PITR's $100/mo headline hides a compute floor.** `supabase.com/docs/guides/platform/backups`
(fetched 2026-07-27): **"Projects that want to use PITR must also use at least a Small compute
add-on."** Small compute is ~$15/mo (per the compute pricing table below). A founder budgeting "$100/mo
for 7-day PITR" who is currently on the default Micro tier actually needs **≥$115/mo** minimum, and per
Finding #1, none of it is spend-cap-protected. Exact PITR rate table (`backups` doc):

| Retention | Hourly | ≈Monthly |
|---|---|---|
| 7 days | $0.137/hr | ~$100 |
| 14 days | $0.274/hr | ~$200 |
| 28 days | $0.55/hr | ~$400 |
| >28 days | Enterprise only, custom | — |

Also: **enabling PITR turns off Daily Backups** ("If you enable PITR, we will no longer take Daily
Backups") — it's a replacement, not an addition, and post-disable, backups revert to a physical-only
format that isn't directly downloadable (manual `pg_dump` becomes the only export path again).

**5b. Read replicas are billed as full, separate, uncapped compute instances** — not a discounted
read-only tier. `manage-your-usage/read-replicas` (fetched 2026-07-27): "Read Replicas run on the same
Compute size as the primary database," charged "the exact number of hours a Read Replica is running,"
and **compute credits do not apply to replica costs**. Worked example from the doc: Small replica
≈$15/mo, Large replica ≈$111/mo — i.e., adding one Large read replica to fix the `gym_membership` OR-scan
ceiling the prior audit flagged (binds at 65–330 gyms) would **double** the compute line from $111/mo to
$222/mo if replication were chosen over the 6-line query fix. Replica disk is billed from the **first
byte** (no included allowance) at 1.25× primary disk size, and per Finding #1, none of this is
spend-cap-covered.

**5c. Log retention isn't an à-la-carte purchase — it's a whole-plan-tier jump.** Retention table
(`supabase.com/pricing`, fetched 2026-07-27):

| Tier | DB/API logs | Auth audit logs |
|---|---|---|
| Free | 1 day | 1 hour |
| Pro | 7 days | 7 days |
| Team | 28 days | 28 days |
| Enterprise | 90 days | included |

There is no "buy 30 days of retention on Pro for $X" option. The only way to see further back than 7
days without upgrading the entire plan (Pro $25 → Team $599, a $574/mo jump for retention alone) is Log
Drains — a *different* product (stream logs to your own sink) priced at **$60/drain/mo + $0.20/million
events + $0.09/GB egress**, and Log Drains are also on the NOT-covered-by-spend-cap list (Finding #1).
For a team that already shipped one silent-data-bug incident (#78, dropped `email` column) and would
plausibly want to grep 3-week-old logs during the next one, the realistic cheapest path is the Log
Drains product, not the plan upgrade.

**Evidence:** all three sub-findings sourced from `supabase.com/docs/guides/platform/backups`,
`manage-your-usage/read-replicas`, and `supabase.com/pricing`, all fetched 2026-07-27.
**Breaks at:** 5a binds the moment PITR is purchased (this week, per the prior audit's own action item
#2) if compute is still at Micro. 5b binds if/when the `gym_membership` ceiling (65–330 gyms) is patched
with a replica instead of the query fix. 5c binds the first time an incident needs >7-day log lookback.
**Confidence:** measured (5a, 5c) / measured (5b, worked example is the vendor's own).
**Falsification check:** the query fix for the OR-scan ceiling is genuinely ~6 lines (prior audit,
verified live) — so 5b is avoidable engineering, not an inevitable cost. I'm flagging it because "throw
a replica at it" is the instinctive fix an unfamiliar future engineer reaches for, and the price
asymmetry (2× compute vs. 6 lines of SQL) should be written down somewhere more visible than this file.
**Exit trigger:** if the query fix ships (prior audit's own NOW-list item), 5b drops off entirely —
recheck after that ships.

---

## 2. Full answer key to the ten questions in the mandate

### (1) MAU — exact definition, and where the prior audit's number needs a caveat
Source: `supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users` +
`.../monthly-active-users-third-party` + a live Supabase-staff reply
(github.com/orgs/supabase/discussions/35933), all fetched/read 2026-07-27.

- **What counts:** "login, token refresh, logout" — any Auth event. A silent background token refresh
  (which every Supabase client SDK does automatically, roughly hourly, whenever a tab/app is open) is
  itself a countable event.
- **BUT it is deduplicated per unique user per billing cycle** — "a user is only counted once towards
  MAU in a billing cycle" regardless of how many times they authenticate or refresh. This is genuinely
  well-designed and **not** a gotcha: a member who opens the app 40 times in a month with the tab backgrounded
  refreshing hourly is still 1 MAU, not 40. **This is the one place in this audit I'm overturning an
  implicit worry rather than confirming one** — per Rule 7, stating it plainly: RED's MAU exposure scales
  with *distinct signed-in members per month*, not with session count or refresh frequency. The prior
  audit's ~360k–450k MAU estimate at 3,000 gyms × 150–300 members is the right shape of number *if* most
  members sign in at least once/month — it is **not** inflated by refresh chatter.
- **Reset:** resets at the start of each billing cycle — a calendar-month **cliff**, not a rolling
  30-day window. A member who signs in on the 1st and the 30th is 1 MAU in one cycle; a member who signs
  in on the 28th and again on the 3rd of next month is 1 MAU in **each** of two cycles (2 billed MAU total
  for one human, 3 days apart) — worth knowing but immaterial at RED's volumes.
- **Anonymous users:** confirmed via a Supabase staff reply — an anonymous sign-in persists the same
  UUID across refreshes as long as the client doesn't explicitly sign out or clear local storage; it
  counts as 1 MAU, same rule as authenticated users. **Not relevant to RED today** — no anonymous auth
  usage found in this codebase (out of scope of this session's grep, inherited from the mandate's
  baseline which lists no anon-auth call sites).
- **Deleted users mid-cycle:** **not documented anywhere I could find**, primary or secondary. The
  closest primary-source statement is from `billing-faq` (fetched 2026-07-27): pausing/deleting a
  *project* does not remove usage "already occurred during the current billing cycle" — by the same
  billing philosophy (usage is metered at time of event, not at time of invoice), a user deleted on day
  20 after signing in on day 5 almost certainly still counts for that cycle. **Marked ASSERTED, not
  measured** — Supabase does not state this explicitly for the user-deletion case and I could not find a
  page that does.
- **Third-party MAU and SSO MAU are separate meters**, same $0.00325/MAU rate, same 100k Pro/Team included
  quota, but their own quota pools (`monthly-active-users-third-party` doc, fetched 2026-07-27) — not
  relevant to RED (no third-party auth provider or SSO in use), flagged for completeness only.

### (2) PITR pricing per retention tier + minimum compute
Covered fully in Finding 5a above. Table: 7d=$100/mo, 14d=$200/mo, 28d=$400/mo, >28d=Enterprise-only
custom. **Minimum Small compute add-on required** (~$15/mo), not disclosed on the main pricing page
table — only in the `backups` guide's prose.

### (3) Read-replica billing
Covered fully in Finding 5b above. Full primary-compute-equivalent price per replica, disk from first
byte at 1.25× primary, compute credits excluded, not spend-cap covered.

### (4) Branching cost per branch-hour and what gates it
Source: `manage-your-usage/branching` (fetched 2026-07-27).
- **$0.01344/hour** for a Micro-size Preview branch (≈$9.80/mo if left running the full billing cycle —
  730 hours). No fixed/flat fee — "you only pay for the usage it incurs." Rate scales with whatever
  compute size the branch is provisioned at (Micro is the stated default/example; larger branch sizes
  cost proportionally more, same ladder as primary compute).
- **What gates it:** nothing automatic. The doc's own remediation advice is "Delete Preview branches
  that are no longer in use" — there is no stated auto-expiry, and it is explicitly **not covered by
  Spend Cap** (Finding #1), so an abandoned branch bills indefinitely with no platform-side stop.
  Persistent branches (which by design stay up after a PR merges/closes, unlike ephemeral Preview
  branches) are the sharper version of this risk — same per-hour rate, but nothing about their lifecycle
  terminates them automatically either.
- **RED-specific:** `AGENTS.md`'s documented workflow already avoids native branching for the
  `test:denial` gate (uses a separate throwaway **project**, `SUPABASE_TARGET_REF`, not a Supabase
  branch) — so this exposure is currently **dormant by design choice**, not currently firing. Flag it as
  a landmine only if that pattern is ever swapped for native branching.

### (5) Log/analytics retention per tier + cost to extend
Covered fully in Finding 5c above. Free 1d/1h(audit), Pro 7d, Team 28d, Enterprise 90d/included(audit).
No à-la-carte retention purchase — only a full plan-tier jump or the separate Log Drains product
($60/drain/mo + $0.20/M events + $0.09/GB egress, itself not spend-cap covered).

### (6) Meters billed on PEAK rather than average
- **Realtime Peak Connections** — confirmed the sharpest true "peak" meter on the platform. Source:
  `manage-your-usage/realtime-peak-connections` (fetched 2026-07-27): **"measured by tracking the
  highest number of concurrent connections for each project during the billing cycle"** — a single
  highest-instant across the **entire month** sets that month's bill; it does not average, and does not
  reset until the next cycle starts. Rate: $10 per 1,000 over the included quota (200 Free / 500
  Pro+Team). **Not currently relevant** — the mandate's baseline confirms zero `.channel(`/
  `postgres_changes` usage in this repo — but this is the most natural next feature for a gym check-in
  product (live class-full boards, live front-desk dashboards), so I ran the forward-looking number: if
  RED ever ships a live per-member feature and even 5% of a 900k-member base (3,000 gyms × 300) opened it
  concurrently during one peak evening, that's 45,000 peak connections → (45,000−500)/1,000 × $10 =
  **$445/mo**, and — per Finding #1 — that meter *is* spend-cap covered, so at least it wouldn't silently
  overshoot past a configured cap. Contrast with #1's uncapped items, which would.
- **Disk size is NOT a peak meter** — it is billed on **provisioned** (ratcheted, one-way) size, which is
  arguably worse than a peak meter because a peak meter resets every cycle and a provisioned-size ratchet
  never resets on its own (Finding #2). Worth stating precisely since "peak-billed" and "ratchet-billed"
  are different failure shapes and the mandate's question conflates them.
- **Disk IOPS / Disk Throughput "additional provisioned"** — billed on provisioned add-on amount, not
  peak usage; both are on the NOT-spend-cap-covered list (Finding #1) but I did not deep-dive their rate
  tables — out of the mandate's explicit ten questions, noted for completeness only.

### (7) Team-tier-ONLY features — cannot buy on Pro at any price
Source: `supabase.com/pricing`, fetched 2026-07-27.
- **SOC2 Type II + ISO 27001** — Team minimum, included in the $599/mo base (not an add-on once on
  Team), unavailable on Pro at any price.
- **AWS PrivateLink** — Team minimum.
- **Project-scoped and read-only access roles** (RBAC) — Team minimum; **custom** project-scoped roles
  are Enterprise-only (Team gets Supabase's predefined roles only).
- **Platform Audit Logs** — Team minimum.
- **28-day log/audit retention** — Team minimum (vs Pro's 7 days) — see Finding 5c.
- **SSO** — priced "Contact Us" on **both** Team and Enterprise. This is the one item that is not
  self-serve-purchasable at *any* published price on *any* tier — it is always a sales conversation,
  which the mandate's question ("cannot literally buy at any price") technically satisfies even on the
  tier that's supposed to include it.
- **HIPAA** — "available as a paid add-on" on both Team and Enterprise, no published price found on
  either tier's page — sales-gated, price unknown (ASSERTED-unavailable, could not fetch a number).
- **Enterprise-only, not buyable on Team at all:** Uptime SLA (Finding #3), designated support manager,
  24×7×365 premium support, BYO Cloud, custom project-scoped roles, >28-day log retention (90-day),
  >28-day PITR retention.

### (8) Support-response SLA per tier
Fully tabulated in Finding #3 and #4. Summary: **Free/Pro = none.** Team = 24h (Urgent, 24/7) / 1
business day (High, Normal, Mon–Fri) / 2 business days (Low, Mon–Fri). Enterprise Standard = 1h (Urgent,
24/7) / 2 business hours (High, Mon–Fri) / 1 business day (Normal, Mon–Fri) / 2 business days (Low,
Mon–Fri). Enterprise Priority Plus = 1h/2h/12h/24h, all 24/7×365. Uptime SLA credits (Enterprise only):
10% credit at 99.0–99.9% actual availability, up to 30% below 96.0%, capped at 20% of trailing-12-month
fees — i.e., even a full-month outage caps the refund at one-fifth of a year's spend, not the month's fee.

### (9) Egress — what counts, cached vs uncached, dashboard traffic
Source: `manage-your-usage/egress`, fetched 2026-07-27.
- **Billable categories, named explicitly:** Database egress, Storage egress, Auth egress, Realtime
  egress, Edge Functions egress, Shared Pooler (Supavisor) egress, Log Drain egress.
- **Cached is 3× cheaper:** uncached $0.09/GB, cached (CDN/Smart-CDN hits, mainly Storage) $0.03/GB,
  independent quotas/pricing for each.
- **Included:** Free 5GB (cached+uncached each), Pro/Team 250GB each.
- **Dashboard/Studio traffic:** **not mentioned anywhere** in the primary source — could not confirm
  billed or exempt. Marked unresolved, not ASSERTED either way.
- **Cross-cloud (Supabase→Vercel) traffic:** the docs list categories by *product* (Database, Storage,
  etc.), not by *destination* — nothing suggests same-AWS-region traffic to Vercel gets a discount or
  exemption. Every server-side PostgREST response the mandate's baseline confirms this architecture
  relies on (all reads server-side, zero browser-direct Supabase calls) is Database egress at full rate,
  same as if it left AWS entirely. The prior audit's "egress never binds because reads are server-side"
  claim is about *volume* (small JSON payloads vs. large asset egress), not about a same-cloud discount —
  I could not find one, so that claim holds only because RED ships JSON, not because of routing.

### (10) Spend cap mechanism — ON vs OFF, and what actually happens
Fully covered as Finding #1 (the coverage-gap fine print) plus the mechanics:
- **ON (Pro default):** hard stop — "further usage of that item is disallowed until the next billing
  cycle" for the 12 covered items. This is a **production denial-of-service you inflict on yourself**,
  not a bill — e.g., hit the MAU quota mid-cycle with the cap on and *new sign-ins/logins stop working*
  platform-wide until next month, which for a gym check-in product is an outage, not a savings.
- **OFF:** normal pay-as-you-grow — all 12 covered items bill overage at published per-unit rates, no
  stated upper bound.
- **Always billed regardless of the toggle:** the 11-item NOT-covered list from Finding #1 (Compute,
  Branching, Replicas, PITR, Custom Domain, extra IOPS/Throughput, IPv4, Log Drains, MFA Phone) — the
  toggle is cosmetic for these.
- **The real founder-facing choice is therefore not "capped vs. uncapped bill,"** it's "self-inflicted
  outage on 12 usage metrics vs. uncapped overage on those same 12" — with the other 11 items **always**
  exposed to uncapped overage either way. Neither position of the toggle protects PITR/Compute/Replicas/
  Branching spend.

---

## 3. What would make each "keep the toggle as-is" instinct wrong (falsification, per item)

- **"Spend cap ON keeps us safe"** — wrong the moment any of the 11 uncapped items moves: leaving a
  branch running, PITR retention creeping (14d→28d is a manual dashboard change, not automatic — so this
  specific one is low-risk), or organic compute-tier upgrades. **Checked:** branching is dormant by
  design (§(4) above) and PITR isn't purchased yet per the prior audit's own open action item — so as of
  today, the realistic near-term trigger is compute autoscale via manual tier upgrades an operator
  clicks, which is intentional, not surprising. **The finding stands as fine print that will bite the
  first unattended automation (e.g., an AI-agent-driven infra task, which this repo explicitly runs) that
  clicks "create a branch" without a matching "delete the branch" step.**
- **"Team plan = production-grade reliability"** — wrong per Finding #3's exact SLA table; checked
  against the primary source, confirmed no uptime SLA exists below Enterprise.
- **"Egress won't bind because everything's server-side"** — directionally true (checked: baseline
  confirms server-side-only reads) but not because of a documented cross-cloud discount (checked: none
  found) — it's true only because payload sizes stay small. If the product ever adds Storage-served
  member photos at scale, egress becomes payload-size-bound, not routing-bound, and the "never binds"
  claim needs re-checking against actual photo-serving volume, not re-asserted from this audit.

---

## 4. Blind spots — what I did NOT examine

1. **Enterprise pricing is entirely opaque.** Every "Contact Us" figure (SSO on any tier, HIPAA add-on,
   Enterprise base price, >28-day PITR/log retention pricing) has no published number anywhere I could
   fetch. I could not verify or refute the prior audit's implicit framing of Enterprise as "the real
   floor" in dollar terms — I only confirmed *what* is gated there, not *what it costs*.
2. **I did not verify Supabase's actual historical incident response times against the stated SLAs** —
   this file reports contractual commitments only, not measured vendor performance. The prior audit's
   §6 vendor-risk section (control-plane degradation, the Feb 2026 us-east-2 outage) is the closer source
   for lived reliability; I did not re-verify those incident claims this session.
3. **Dashboard/Studio traffic egress billing is genuinely unresolved** — not found in any primary source
   I fetched, not inferred either way. Someone should ask Supabase support directly rather than trust an
   inference from this file.
4. **Disk IOPS and Disk Throughput exact per-unit rates** were not deep-dived (only confirmed they're
   provisioned-based and spend-cap-excluded) — outside the mandate's explicit ten questions, but adjacent
   to Finding #1's "uncapped items" list and worth a follow-up pass if disk performance tuning ever comes
   up.
5. **I did not independently re-query the live database this session** — every dollar figure here is
   from vendor documentation, not recomputed against RED's actual live row counts/bytes (the baseline
   numbers in my mandate). Cross-multiplying these rate tables against RED's real growth trajectory (not
   done here) is exactly the job of whichever agent owns the cost-model synthesis.
6. **Third-party MAU and SSO MAU pool semantics** (do they share the 100k included quota with regular
   MAU, or are they three separate 100k pools?) — the docs read as separate line items on the invoice but
   I could not confirm whether the *included* 100k is shared or per-meter. Not currently relevant to RED
   (no third-party auth/SSO in use) so I did not chase it further; flag if that ever changes.

---

## 5. Numbers other agents will want to reuse (with citations)

| Item | Value | Source | Fetched |
|---|---|---|---|
| MAU overage rate | $0.00325/MAU over 100k (Pro/Team) | supabase.com/pricing | 2026-07-27 |
| MAU dedup rule | 1 unique user = 1 MAU/cycle regardless of refresh count | docs/guides/platform/manage-your-usage/monthly-active-users | 2026-07-27 |
| PITR 7-day | $0.137/hr ≈ $100/mo, requires ≥Small compute (~$15/mo) | docs/guides/platform/backups | 2026-07-27 |
| PITR 14-day | $0.274/hr ≈ $200/mo | docs/guides/platform/backups | 2026-07-27 |
| PITR 28-day | $0.55/hr ≈ $400/mo | docs/guides/platform/backups | 2026-07-27 |
| Read replica (Small) | ≈$15/mo, full compute price, disk from 1st byte @1.25× primary | docs/guides/platform/manage-your-usage/read-replicas | 2026-07-27 |
| Read replica (Large) | ≈$111/mo | docs/guides/platform/manage-your-usage/read-replicas | 2026-07-27 |
| Branching | $0.01344/hr (Micro) ≈ $9.80/mo if left running, not spend-cap covered | docs/guides/platform/manage-your-usage/branching | 2026-07-27 |
| Log retention | Free 1d/1h(audit), Pro 7d, Team 28d, Enterprise 90d | supabase.com/pricing | 2026-07-27 |
| Log Drains | $60/drain/mo + $0.20/M events + $0.09/GB egress, not spend-cap covered | docs/guides/platform/manage-your-usage/log-drains (via pricing page) | 2026-07-27 |
| Realtime peak connections | $10/1,000 over 500 (Pro/Team) / 200 (Free); billed on single highest instant per cycle | docs/guides/platform/manage-your-usage/realtime-peak-connections | 2026-07-27 |
| Disk (gp3) | $0.125/GB-mo, provisioned not usage, one-way (no auto-shrink), 8GB included Pro/Team | docs/guides/platform/compute-and-disk | 2026-07-27 |
| Disk autoscale trigger | 90% full → grow 50%, max 4 events/24h | database-size.mdx (supabase/supabase github) + Answer Overflow | 2026-07-27 |
| Egress uncached/cached | $0.09/GB vs $0.03/GB, 250GB included each (Pro/Team) | docs/guides/platform/manage-your-usage/egress | 2026-07-27 |
| Team plan price | $599/mo | supabase.com/pricing | 2026-07-27 |
| Team SLA | Urgent 24h(24/7); High/Normal 1 business day(Mon-Fri); Low 2 business days(Mon-Fri) | supabase.com/sla | 2026-07-27 |
| Enterprise Standard SLA | Urgent 1h(24/7); High 2 business hrs(Mon-Fri); Normal 1 business day(Mon-Fri); Low 2 business days | supabase.com/sla | 2026-07-27 |
| Uptime SLA availability | Enterprise only, 99.9%/mo, credits capped at 20% of trailing-12mo fees | supabase.com/sla | 2026-07-27 |
| Support SLA availability | Free/Pro = none; Team/Enterprise only | supabase.com/support-policy | 2026-07-27 |
| Spend-cap-covered items (12) | Disk Size, Egress, Edge Fn Invocations, Logs Ingest/Query, MAU, MAU-SSO, MAU-3rdParty, Realtime Messages, Realtime Peak Conn, Storage Image Transforms, Storage Size | docs/guides/platform/spend-cap | 2026-07-27 |
| Spend-cap-NOT-covered items (11) | Compute, Branching Compute, Read Replica Compute, Custom Domain, extra Disk IOPS, extra Disk Throughput, IPv4, Log Drain Hours/Events, MFA Phone, **PITR** | docs/guides/platform/spend-cap | 2026-07-27 |
