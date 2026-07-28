# verify:pricing-supabase — independent fact-check of every load-bearing Supabase pricing number

Agent: `verify:pricing-supabase` | Date fetched: 2026-07-28 | Method: fresh, independent `WebFetch`
calls against Supabase's own primary-source pages (not re-reading the prior agents' citations — I hit
the same URLs cold and compared afterward). Every number below has its own fetch, done this session.

Verdict key: **CONFIRMED** (my independent fetch matches the audited claim), **WRONG** (my fetch
contradicts it — correct value given), **UNVERIFIABLE** (no primary source states it either way).

---

## (1) Pro = $25/mo base, Team = $599/mo

**CONFIRMED.** `https://supabase.com/pricing` (fetched 2026-07-28): "Free: $0/month… Pro: $25/month…
Team: $599/month… Enterprise: Custom pricing." Matches all three prior audits exactly.

---

## (2) MAU: 100,000 included on Pro AND Team, $0.00325/MAU after

**CONFIRMED**, two independent pages agree:
- `https://supabase.com/pricing` (2026-07-28): "Pro: 100,000 included, then $0.00325 per MAU… Team:
  100,000 included, then $0.00325 per MAU."
- `https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users` (2026-07-28): same
  quota and rate, plus a worked billing example in the doc itself — "an organization with 160,000 MAUs on
  a Pro plan was charged $195," i.e. (160,000−100,000)×$0.00325 = $195.00 exactly, which is a second,
  independent arithmetic confirmation of the $0.00325 rate baked into Supabase's own example.

---

## (3) "Team raises zero meter limits vs Pro" — checked every meter individually

**CONFIRMED.** I fetched Pro and Team's numbers separately for all seven metered/billable usage items
Supabase lists, and every single one is identical between the two plans:

| Meter | Pro | Team | Identical? |
|---|---|---|---|
| MAU | 100,000 incl., $0.00325/MAU | 100,000 incl., $0.00325/MAU | Yes |
| Disk size | 8 GB incl., $0.125/GB | 8 GB incl., $0.125/GB | Yes |
| Egress (uncached) | 250 GB incl., $0.09/GB | 250 GB incl., $0.09/GB | Yes |
| Egress (cached) | 250 GB incl., $0.03/GB | 250 GB incl., $0.03/GB | Yes |
| File storage | 100 GB incl., $0.0213/GB | 100 GB incl., $0.0213/GB | Yes |
| Edge Function invocations | 2M incl., $2/1M | 2M incl., $2/1M | Yes |
| Realtime messages | 5M incl., $2.50/1M | 5M incl., $2.50/1M | Yes |
| Realtime peak connections | 500 incl., $10/1,000 | 500 incl., $10/1,000 | Yes |

Sources (all fetched 2026-07-28): `supabase.com/pricing`, `.../manage-your-usage/edge-function-invocations`,
`.../manage-your-usage/realtime-messages`, `.../pricing.md` (cross-check for the peak-connections row,
which the dedicated realtime-messages page doesn't carry).

**What Team actually buys instead of capacity:** log retention (28d vs Pro's 7d), backup retention (14d
vs Pro's 7d), a support SLA (Pro has none at all — see §10), SOC2 Type II + ISO 27001, audit logs, and
project-scoped RBAC roles. None of these are usage meters — they're plan features/compliance/support.
**The prior audit's claim is confirmed exactly as stated: Team is a 24× price multiplier that changes
zero numbers on the seven meters that actually drive a usage bill.**

---

## (4) Database/disk: 8GB included, $0.125/GB/mo gp3, $0.195/GB io2, autoscale +50% at 90% capped
+200GB max 4x/24h, read-only at 95%

**CONFIRMED, every clause:**
- 8 GB included (Pro/Team), $0.125/GB/mo gp3 overage — `supabase.com/pricing` (2026-07-28).
- io2 overage $0.195/GB/mo — `compute-and-disk` doc (2026-07-28): "$0.195 per GB."
- Autoscale trigger 90%, growth +50%, capped +200GB/event, max 4 events/rolling-24h —
  `database-size` doc (2026-07-28), quoted directly: "Disk size expands automatically when the database
  reaches 90% of the allocated disk size" / "expanded to be 50% larger" / capped at 200 GB per event /
  "four modifications within a rolling 24-hour window."
- Read-only at 95% — `database-size` doc (2026-07-28): "Read-only mode triggers at 95% disk utilization
  for paid plans." (Free plan's trigger is a different mechanism — 500 MB actual database size, not a %
  of provisioned disk — see §5.)

---

## (5) Free plan: 500MB database, 2 active projects, pause after 7 days inactivity, no backups

**CONFIRMED, every clause:**
- 500 MB database size cap — `pricing` + `database-size` docs (2026-07-28), both agree.
- 2 active projects, and it is a cross-org cap on the person, not per-organization —
  `pricing.md` (2026-07-28): "The Free plan limits you to 2 active projects... Free projects are
  automatically paused after one week of inactivity, though you may maintain unlimited paused projects."
- Pause after 7 days inactivity, **paid plans exempt** — `free-project-pausing` doc (2026-07-28), quoted
  directly: "A Free plan project is considered inactive if it does not receive sufficient user database
  activity over the past week" / "Projects under a paid plan cannot be paused." Restore window: up to 1
  year via Studio.
- No automatic backups on Free — `pricing` doc (2026-07-28): Free row has no backup entry; Pro/Team both
  explicitly state "Daily backups stored for 7/14 days," confirming Free has none by omission-plus-contrast.

---

## (6) Egress: 250GB uncached at $0.09/GB + 250GB cached at $0.03/GB

**CONFIRMED**, Pro and Team both — `pricing` doc (2026-07-28): "250 GB included, then $0.09 per GB"
(standard/uncached) and "250 GB cached egress (then $0.03 per GB)." Two separate 250GB pools, not one
shared 250GB split across both categories.

---

## (7) PITR: $100/mo, minimum compute size requirement

**CONFIRMED, both clauses:**
- Rate table — `backups` doc (2026-07-28): 7-day = "$0.137/hr" ≈ "~$100" monthly; 14-day = "$0.274/hr" ≈
  "~$200"; 28-day = "$0.55/hr" ≈ "~$400"; beyond 28 days is Enterprise-only/custom.
- **Minimum compute floor** — same doc, quoted directly: "Projects that want to use PITR must also use at
  least a Small compute add-on to ensure smooth functioning." Small is ~$15/mo, so the real minimum spend
  to run 7-day PITR is ~$115/mo, not the headline ~$100/mo, if the project would otherwise be on Micro.
- Bonus-confirmed, not asked for but load-bearing: enabling PITR **disables** Daily Backups (documented
  as a replacement, not additive) — "If you enable PITR, we will no longer take Daily Backups."

**Note on precision:** the $100/$200/$400 monthly figures are Supabase's *own* rounded approximation of
the hourly rate (0.137 × 730 hrs = $100.01 — checks out to the cent for a full 730-hour month), so this
isn't a rounding error introduced by any audit — it's the vendor's own published approximation.

---

## (8) Spend Cap exclusions — does NOT cover Compute, PITR, Read Replica Compute, Branching Compute;
ON by default on Pro; hard-blocks usage until next cycle

**CONFIRMED, every clause, with one documentation-consistency wrinkle flagged below:**

- Covered items (12), quoted verbatim from `spend-cap` doc (2026-07-28): "Disk Size, Egress, Edge
  Function Invocations, Logs Ingest, Logs Query, Monthly Active Users, Monthly Active SSO Users, Monthly
  Active Third Party Users, Realtime Messages, Realtime Peak Connections, Storage Image Transformations,
  Storage Size."
- NOT-covered items (11), same page, same fetch: "Compute, Branching Compute, Read Replica Compute,
  Custom Domain, Additionally provisioned Disk IOPS, Additionally provisioned Disk Throughput, IPv4
  address, Log Drain Hours, Log Drain Events, Multi-Factor Authentication Phone, **Point-in-Time-Recovery**."
  Compute, PITR, Read Replica Compute, and Branching Compute are all confirmed on the NOT-covered list —
  exactly as claimed.
- **ON by default on Pro** — CONFIRMED, but only findable on one of three pages I checked. My direct
  fetches of the two pages that read as the "canonical" home for this fact — `spend-cap` and
  `cost-control` — **both came back "the document does not explicitly state this."** The actual verbatim
  sentence only turned up on a *third* page, `billing-faq` (2026-07-28): **"The Pro Plan has a Spend Cap
  enabled by default to keep costs under control."** So the claim is TRUE, but it's a documentation
  fragility worth flagging: two re-verifications in a row (mine, independently) missed it because they
  went to the obviously-named pages first.
- **Team plan does not have Spend Cap at all** — `spend-cap` doc (2026-07-28), now a direct quote rather
  than an inference: "available only with the Pro Plan." The prior audit had flagged this as an inference
  from absence; I found the page's own affirmative statement, upgrading it from *inferred* to *measured*.
- **Hard-block mechanics** — `cost-control` doc (2026-07-28): ON = "further usage of that item is
  disallowed until the next billing cycle" (no charge, service stops); OFF = "projects will continue to
  operate... charged based on the item's cost per unit" (uncapped overage billing). Matches claim exactly.

---

## (9) Compute ladder prices + $/GB cliff at Small→Medium

**CONFIRMED**, with one caveat the prior audit didn't flag: Supabase's own docs publish these as
**approximations**, tilde-prefixed, not exact contractual figures.

`compute-add-ons` doc (2026-07-28), quoted with the vendor's own "~":

| Instance | $/mo (vendor's own figure, incl. "~") | RAM |
|---|---|---|
| Micro | ~$10 | 1 GB |
| Small | ~$15 | 2 GB |
| Medium | ~$60 | 4 GB |
| Large | ~$110 | 8 GB |
| XL | ~$210 | 16 GB |
| 2XL | ~$410 | 32 GB |
| 4XL | ~$960 | 64 GB |
| 8XL | ~$1,870 | 128 GB |
| 12XL | ~$2,800 | 192 GB |
| 16XL | ~$3,730 | 256 GB |

Matches the prior audit's table exactly, dollar-for-dollar. The doc's own footnote-equivalent: "monthly
prices as approximations... the precise billing metric is hourly." So the $/GB-cliff claim —
**Small = $15/2GB = $7.50/GB, Medium = $60/4GB = $15.00/GB, a 2× jump** — is arithmetically correct given
the confirmed inputs, but it's a computed ratio built on two vendor-rounded numbers, not two exact prices.
Practically this changes nothing (the cliff is a 2× multiple, not a marginal difference a few cents of
rounding could erase), but it means no dollar figure anywhere in the compute-ladder chain of this audit
should be quoted as more precise than the vendor's own "~".

---

## (10) Log retention 1/7/28/90 by plan; no uptime SLA below Enterprise

**CONFIRMED, both halves:**
- Log retention — `pricing` doc (2026-07-28): Free 1 day, Pro 7 days, Team 28 days, Enterprise 90 days.
  Exact match.
- No uptime SLA below Enterprise — `sla` doc (2026-07-28), quoted directly: "Each product is individually
  covered by a 99.9% uptime commitment for customers with an Enterprise tier subscription" — Free/Pro/Team
  get no mention of any uptime number anywhere on the page. Support response-time table (Team vs
  Enterprise Standard vs Enterprise Priority Plus) reproduced identically to the prior audit's table,
  re-confirmed field-by-field this session:

  | Severity | Team | Enterprise Standard | Enterprise Priority Plus |
  |---|---|---|---|
  | Urgent | 24h, 24/7 | 1h, 24/7 | 1h, 24/7 |
  | High | 1 business day, M-F | 2 business hrs, M-F | 2h, 24/7 |
  | Normal | 1 business day, M-F | 1 business day, M-F | 12h, 24/7 |
  | Low | 2 business days, M-F | 2 business days, M-F | 24h, 24/7 |

---

## Where two Supabase pages disagree (mandate explicitly asks to flag this)

1. **Disk billing scope.** `billing-on-supabase` says quota is "applied to your entire organization,
   independent of how many projects you launch" (general statement about variable usage quotas); the
   dedicated `disk-size` usage page says "Disk charges apply per project" specifically. Not independently
   re-verified by me this session (inherited from the prior `price-meters.md` finding, §3a there) — flagging
   because the mandate asks for disagreements to be reported even when found by a sibling agent, and I did
   not re-fetch `billing-on-supabase` myself to re-confirm the exact wording, so treat this one line as
   carried-forward, not freshly measured.
2. **Spend Cap's Pro-default statement** (see §8 above) — not a contradiction between two pages, but a
   **documentation-completeness gap**: it's asserted on exactly one of three plausible pages and silent
   (not contradicted, just absent) on the other two. Different failure shape than a true disagreement, but
   worth the same flag: don't trust a single page's silence as "not true."

---

## Forced ranking — 5 pricing claims most likely to be wrong, worst first

Every one of the ten numbered claims in the mandate came back **CONFIRMED** against fresh, independent
fetches this session — I did not find a single outright-WRONG headline number. So this ranking is about
**fragility of the evidence**, per Rule 3 (falsification): which of these claims has the thinnest margin
before a future re-check could overturn it, ranked by how much downstream cost-model damage a reversal
would do.

1. **Whether RED's live production project is on Free or Pro is unresolved, and it is the single most
   consequential fork in the entire pricing chain — three sibling audit files in this same investigation
   assumed three different answers.** `price-compute.md` concludes the live instance is **Free/Nano ($0/mo)**,
   citing `AGENTS.md`'s 402-branching note. `price-gotcha.md` and the mandate's own baseline both write
   "Pro" cost-table lines without flagging the contradiction. This is not a pricing-*number* error (every
   number I checked is a correct quote of Supabase's published rate for whichever plan is actually true) —
   it's an **unresolved input variable** that the rest of the audit chain has been silently guessing at
   three different ways. If Free: no backups, 500MB cap, weekly pause risk, on a system already processing
   real member payments (§5, §1 above). If Pro: $25/mo is already being paid, backups exist, Spend Cap's
   default-ON behavior (confirmed real, §8) is live right now and could already be silently blocking
   something. **Nothing in Postgres `pg_catalog` or any Supabase docs page can answer this — it is a
   30-second dashboard check (Organization Settings → Billing) that no agent in this workflow, including
   me, has permission to perform.** Highest severity because it invalidates or confirms wholesale dollar
   figures elsewhere in the audit depending on which way it resolves.

2. **"Spend Cap is ON by default on Pro" is real and confirmed, but it lives on exactly one of three
   plausible documentation pages** — the two pages an engineer would naturally check first (`spend-cap`,
   `cost-control`) are both silent on the default; only `billing-faq` states it. I hit this exact trap
   myself this session (two fetches in a row came back "not stated") before finding it on the third page.
   The claim itself isn't wrong, but it's one re-audit-without-checking-all-three-pages away from being
   incorrectly downgraded to UNVERIFIABLE by someone who trusts the more obviously-named source.

3. **The Fair Use Policy's numeric threshold for "consistently exceeding quota" (the trigger for a 402
   org-wide restriction on Team/Enterprise, or on Pro with Spend Cap off) does not exist in any primary
   source I or the prior `price-meters` agent could find**, despite three independent search passes
   between us. This is the exact shape of gap where a future, less careful pass could confidently invent a
   number ("if you exceed by 20% for 3 consecutive days...") — flagging pre-emptively so nobody does.

4. **Every derived/modelled dollar projection in the sibling audit files (MAU overage $552-$1,649/mo,
   gyms-to-breach counts like "≈240 gyms" or "494-1,111 gyms", the $/GB disk-growth projections) is
   arithmetically correct given its inputs, but every one of those inputs is itself an assumption, not a
   measurement** — avg 225 members/gym (midpoint of a 150-300 *target* range, not observed), 40-90%
   monthly activation rate (three guessed scenarios, not measured — live activation is 4.3% platform-wide
   per the mandate's baseline, which would push the MAU-breach gym-count *far* higher than any of the
   modelled scenarios), and bytes/row ratios extrapolated from a 4-gym/116-member seed dataset weeks old.
   None of this is a Supabase pricing fact being wrong — the per-unit rates are all confirmed correct — but
   these are the numbers in the whole audit chain most likely to diverge materially from reality once real
   usage data exists, because they compound multiple unverified assumptions on top of confirmed unit
   prices. Re-run this modelling once the platform has 90+ days of real multi-tenant usage, not before.

5. **The compute ladder's dollar figures are the vendor's own published approximations ("~$15", "~$60"),
   not exact contractual prices** — confirmed directly from `compute-add-ons`' own tilde-prefixed table.
   Lowest severity in this ranking (rounding is almost certainly to the nearest few dollars, not enough to
   flip any of the audit's directional conclusions), but it means every downstream "$/GB cliff" or
   "PITR-plus-compute-floor" sum in this audit chain inherits an un-stated rounding band, and none of them
   should be quoted as more precise than Supabase's own "~".

**Honest counterpoint (Rule 7):** the headline story here is actually a good-news one for the audit
chain's integrity — every single one of the ten specific numbers the mandate asked me to check came back
matching exactly, across MAU, disk, egress, storage, PITR, Spend Cap, compute, and SLA. The prior agents'
pricing work was accurate, not hallucinated. The five items above are about the *shape* of remaining risk
(one unresolved plan-tier fact, one thin citation, one genuine vendor-documentation gap, and two categories
of "correct math on soft inputs") — not about anyone having invented a number.

---

## Blind spots — what I did not check

1. **I could not resolve the Free-vs-Pro question myself.** No MCP tool exposed to this session reads
   Supabase's billing/plan API; I have read-only Postgres SQL and WebFetch/WebSearch only. This is ranked
   #1 above and remains open.
2. **I did not re-verify the `billing-on-supabase` vs `disk-size` "per-project vs per-org" scope
   disagreement myself this session** — carried forward from `price-meters.md` without a fresh fetch;
   flagged as carried-forward, not independently re-measured, in the disagreement section above.
3. **I did not check "Logs Ingest" and "Logs Query" as separate billing line items** (distinct from the
   1/7/28/90-day log *retention* claim I did verify) — they appear on the Spend-Cap-covered list (§8) but
   I did not fetch a page giving their own included-quota/overage-rate numbers; out of the mandate's
   explicit ten questions, so not chased.
4. **Dashboard/Studio traffic egress billing** — I did not re-attempt this after `price-gotcha.md` already
   reported it as genuinely undocumented (checked their negative result, did not re-fetch to try to find
   what they couldn't).
5. **I did not fetch any non-Supabase source** (no AWS/GCP baseline comparison for gp3/io2 margin, no
   independent review of Supabase's actual historical uptime vs. its contractual SLA) — out of scope for a
   pricing fact-check mandate, but worth naming since "the price is correct" and "the price is a fair deal"
   are different questions this document does not answer.
6. **I did not attempt to independently verify the MAU dedup/refresh-counting mechanics** claimed in
   `price-gotcha.md` (1 unique user = 1 MAU/cycle regardless of refresh count) — accepted their citation of
   `monthly-active-users` doc without a fresh fetch of that specific paragraph myself; the quota/rate
   numbers I did verify fresh, the dedup *mechanism* description I did not re-derive independently.
