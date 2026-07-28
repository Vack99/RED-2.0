# RED 2.0 — Supabase fit, structure, weaknesses and alternatives

**Date:** 2026-07-28 · **Subject:** RED 2.0, multi-tenant gym SaaS for LatAm · **Target:** ≥3,000 gyms × 150–300 members
**Method:** 36 agents on distinct mandates, read-only against live prod `hjppxawglmukfvsgmcog`, every vendor price fetched
this session. One referee re-measured every contested constant; one critic audited what the roster missed. Every load-bearing
constant in this report was re-verified against prod at write time (§8.1).

**How to read the numbers.** Every figure is tagged **[measured]** (read from live prod, a file, or a vendor page fetched
this session), **[modelled]** (computed from measured inputs with the formula shown), or **[asserted]** (a judgement call
with no measurement behind it). Act on measured, plan with modelled, verify asserted before you spend on it.

---

# EXECUTIVE ANSWER

## 1. Is Supabase the best approach for this?

**Yes, and it isn't close — but "best" here means "the cheapest way to not have this problem," not "the cheapest bill."**
Seven agents priced leaving: Neon, Railway, Fly, AWS RDS/Aurora + Cognito, self-hosted Supabase OSS on Hetzner, Firestore,
Convex, Appwrite, Nhost, and five auth vendors. Every one concluded don't switch, and the two that came closest —
AWS-with-self-hosted-GoTrue-and-PostgREST, and Hetzner bare metal — arrive at *the same monthly cost* while converting a
vendor relationship into an on-call rotation of one person who is already the bottleneck (§4). The bill is not your problem:
your total infrastructure at 3,000 gyms is **~$1,500/month, ~8.8 MXN per gym per month, 2.9% of the 300 MXN price floor**
[modelled]. Your support cost at real market rates is **629–1,224 MXN per gym per month — 210% to 408% of that same floor**
[modelled from a fetched benchmark]. You are 36 agents deep into auditing a line item worth 3% of revenue.

The honest caveat: Supabase is not *proven* best, because nobody built one head-to-head table on one workload with a stated
decision criterion, and because the app tier — Vercel, which is **the larger bill of the two** at ~$658/mo vs Supabase's
~$444/mo at 3,000 gyms — was priced by exactly one agent and shopped against no alternative at all.

## 2. Is our structure right for a project like this?

**The database structure is right and better-built than most shops at this stage. The structure around it barely exists.**

Shared tables + a `gym_id` discriminator + RLS is what the industry actually runs (Citus rates row-based sharding to 1M+
tenants; Notion runs 480 logical shards over 32 instances), and your version of it has real quality in it: all 101 RLS
policies use the `(select auth.uid())` initplan form with zero bare calls — the single most common Supabase performance
mistake, absent here [measured]; RLS enabled on 29/29 tables with an event trigger keeping it that way; `search_path=''`
on all 38 functions; no `FOR ALL` policies; `next_folio` is a per-gym counter row inside the caller's transaction rather
than a sequence, so a rolled-back sale leaves no folio gap — exactly right for Mexican receipt sequencing and better than
the obvious `bigserial`; a real idempotency rail on the money path; and a denial-suite regime with two machine guards that
derive their obligation set by replaying migrations rather than trusting a declaration.

What does not exist: a caching layer (never even evaluated as an option), a job/queue layer (`pg_cron` and `pg_net` are not
installed [measured]), an observability layer (zero — no error tracker, no APM, no log drain, no alert, no uptime check
[measured by grep across the whole repo]), a release/canary layer (migrations reach prod through `apply_migration` against
the live ref, bypassing CI entirely — the number of automated checks between a DDL statement and 3,000 tenants' rows is
**zero**), a tenant-provisioning surface (no code path anywhere creates a gym, a domain or an owner), and a lifecycle layer
(no void, no archive, no revoke, no suspend, no offboard). Four of those five are the ones that bite a solo founder first.

## 3. Where are our main weaknesses?

Ranked in full in §3. The headline: **most of the worst ones are live today at 4 gyms, not projections at 3,000.**

The single sharpest is that **there is no way back**. If one gym's operator wipes their roster on Tuesday and asks for it
back on Friday, you have exactly two options: tell them it's gone, or roll back all 2,999 other gyms to Tuesday. Per-tenant
RTO is **∞** — not "no mechanism," but worse: the mechanism that exists (`respaldo.xlsx`) covers 4 of 29 tables, drops
every primary key, and denormalises foreign keys to display names, so two members named "Juan Pérez" are indistinguishable
on reimport, and 61 of 116 live roster rows have no email to disambiguate them [all measured].

Second sharpest: **`enviar_mensaje_contacto` is a live, unauthenticated, unbounded write vector.** Its rate limit is guarded
by `if p_ip is not null`, and `p_ip` is a caller-supplied parameter with `DEFAULT NULL`. Omit it and there is no limit at
all. Re-verified live at write time: signature still carries `p_ip`, guard still present, `anon` still holds EXECUTE.
Cost to the attacker: a $5 VPS and a key that ships in your browser bundle.

Third: **a gym is one shared password.** Zero rows have ever been written with `role = 'operator'` anywhere in this product
— not by an RPC, not by a seed [measured against live `pg_proc`]. A two-shift gym shares the owner's credential, which also
carries the bank details and the money ledger, and there is no password-reset link on the admin login form.

## 4. What are the best alternatives?

**"Stay and fix" is the best alternative, and this report is the first document to price it: ~23–35 engineer-days,
≈$18,000–28,000 of founder opportunity cost** (§4.1). That is the same order as the cheapest exit (AWS self-hosted OSS at
150–300 hours), and the exit fixes none of your top five weaknesses.

Ranked runner-ups if you ever do leave: (1) **Amazon SES for email only** — 4–10× cheaper than Resend at every volume
tested, ~$100/mo vs ~$402/mo at 3,000 gyms, at the cost of building bounce/complaint/suppression handling yourself; this is
the one substitution that pays for itself. (2) **AWS + self-hosted GoTrue/PostgREST on Fargate** — genuinely at or below
Supabase's bill, but 150–300 hours and 12–24 hours/month of ops forever. (3) **Nhost** — same Postgres engine, zero
domain-fit loss, unlimited MAU, but a 6-person company against Supabase's $500M Series F. Everything else is worse: Cognito
is a 4.6–8.8× auth tax with no crossover; Clerk and Auth0 bill on *organisation count* (= your gym count), which is exactly
the axis that grows; Firestore forces denormalise-or-N+1 on every report and its own hotspot guidance breaks your folio
ordering; Appwrite's self-serve pricing **stops existing at 667–1,333 gyms** (200,000 MAU hard cap on Pro); Neon's
DB-per-tenant is ~185× the cost of one shared DB for a workload like yours; Fly Managed Postgres at $38/mo × 3,000 is
$114,000/mo with no scale-to-zero lever.

## 5. How many gyms × members before the first paid tier, and how far does Pro go?

> **You can run ~40 gyms averaging 200 members on the Free tier after one year of operation (~14 after three); the meter
> that ends it is DATABASE SIZE — the 500 MB cap — which does not send a bill, it flips the whole multi-tenant Postgres
> read-only for every gym simultaneously.** *This line is informational only: production is already on a paid plan
> (ruling R1 — 60 `pg_backup_start`/`pg_backup_stop` pairs over 59.4 days of uptime = one physical base backup per day,
> which Free does not provide). You are past this question.*

> **Pro carries you past 3,000 gyms averaging 200 members on every meter it has — the entire Supabase *meter* bill at
> 3,000 × 200 is $17/month, and no meter produces a wall. The meter that ends Pro is none of them. What ends Pro is a
> query plan: the unindexed `ventas.cliente_id` sequential scan inside `mi_membresia()`, which fires on every member's
> plan-card render and adds +100 ms at ~53 gyms and +1 s at ~300 gyms. The next step that buys real capacity costs ~$400/mo
> of compute (Micro → 2XL). The next step that *looks* like an upgrade — Team — costs +$574/month and raises exactly zero
> meter limits.**

The number Aaron needs is **~53 gyms**, and it is a `CREATE INDEX` that takes ten minutes today and `CREATE INDEX
CONCURRENTLY` on ~12 million rows across a live shared instance later.

---

## THE FIRST THREE THINGS TO DO

| # | Do this | Hours | Why it is first |
|---|---|---|---|
| **1** | **Ship the safety batch, in one migration, this week.** (a) `create index concurrently on ventas (cliente_id, created_at desc, id desc)`; (b) `create index concurrently on clientes (auth_user_id) where auth_user_id is not null`; (c) index `gym.owner_user_id`; (d) drop `p_ip` from `enviar_mensaje_contacto` and read the IP from `current_setting('request.headers',true)::json->>'cf-connecting-ip'`, failing closed on NULL; (e) `alter table contact_message add check (char_length(ip) <= 45)`; (f) `revoke truncate, references, trigger on all tables in schema public from anon, authenticated` + the matching `alter default privileges`; (g) `revoke execute` on the five anon-EXECUTE write RPCs; (h) `create unique index concurrently clientes_tel_gym_uq on clientes (gym_id, tel)`; (i) `alter table ventas alter constraint ventas_cliente_id_fkey ... on delete restrict`. | **6–8 h** | Every item is a measured fact about a 15 MB database, correct at 4 gyms and at 3,000, and cheap. (h) is **free today at 0 duplicates and permanently impossible after the first one** — the index build fails. (d) closes a live unauthenticated write vector. **Run E1 + E3 on the scratch project first (see §8.3) — 3½ hours — because this DDL ships through a path with zero automated checks, against a schema nobody has diffed.** |
| **2** | **Build the recovery floor.** Nightly per-gym `COPY (select * from <t> where gym_id = $1) TO ...` for all 28 gym-scoped tables into Supabase Storage as JSONL — IDs intact, FK graph intact, restorable. Commit `supabase db dump --schema-only` to the repo weekly as `supabase/schema.sql`. Then do one timed restore into the scratch project and write down the number. | **16–24 h** + **$5–15/mo** | Your per-tenant RTO is ∞ and your platform RTO is a 4–24 h band nobody has ever exercised. This is the only item on the list where the failure mode is "a paying customer's data is gone and you cannot get it back." The restore drill also settles two open questions at once (§9). |
| **3** | **Split the Resend key and give a gym a second login.** (a) Issue a separate Resend API key for the Supabase custom-SMTP password vs `RESEND_API_KEY`, so a send-side suspension cannot take down login for every gym — 10 minutes, $0. (b) Ship `invitar_operador(p_email, p_gym)` mirroring `preparar_invitacion`'s shape, a staff list panel in the existing `/cuenta` screen, and link the already-implemented `solicitarReset` from the admin login form. | **(a) 0.2 h · (b) 16–24 h** | (a) is the highest value-per-minute item in the entire audit. (b) is the change that unblocks everything else operationally: the front-desk labour, the invite drive, and the support load all currently funnel through one person because there is nobody to delegate to. |

Everything after that is in §3, ordered. Note what is **not** in the top three: no migration, no vendor change, no
re-architecture. Nothing in the ranked weakness list requires a redesign.

---

# 1. THE TIER CALCULATOR

## 1.1 The formula, with its inputs, so you can re-run it

```
DBused(G, M, Y)  = 15 MB + G × [ 0.070 + M×0.00174 + Y×(0.582 + M×0.0563) ]   MB
provisioned      = max(8 GB, 1.35 × 1.25 × DBused)          # 1.25 bloat, 1.35 autoscale ratchet
disk cost        = max(0, provisioned_GB − 8) × $0.125

MAU(G, M)        = G × (M × φ + s)                          # φ = monthly-active fraction of roster, s = 2 staff
MAU cost         = max(0, MAU − 100,000) × $0.00325

Egress(G, M)     = G × 0.048 GB/month  (at M = 225)
Emails(G, M)     = G × M × 1.125 × coverage                 # coverage = fraction of roster with an email on file
EdgeReq(G)       = G × pageviews_per_gym_per_month × edge_requests_per_pageview
```

**Inputs, and where each came from:**

| Symbol | Value | Confidence | Source |
|---|---|---|---|
| `0.070` MB | per-gym one-time catalog/template rows | modelled from measured row widths | `verify-math §3` |
| `0.00174` MB | per-member one-time (`clientes` row + auth identity chain) | modelled from measured | `verify-math §3` |
| `0.582` MB | per-gym-per-year, member-independent (`class_session` + `class_session_coach`, measured at 3.0 sessions/gym/day) | measured driver, modelled bytes | `verify-math §3` |
| `0.0563` MB | per-member-per-year (`asistencias` + `reservation` + `ventas`) at the measured 5.3 visits/member/month | modelled from measured widths | `verify-math §3` |
| `s = 2` | staff accounts per gym | measured (every live gym has exactly 1 owner, 0 operators) | `workload-auth` |
| `φ` | 0.75% today | **measured** | live: 5/116 activated, and 0 of 52 across both *real* gyms |
| `$0.00325`/MAU over 100,000 | Pro & Team, identical | measured | supabase.com/pricing, fetched 2026-07-28 |
| `$0.125`/GB over 8 GB | disk, billed on **provisioned** not used | measured | supabase.com/docs/guides/platform/compute-and-disk, 2026-07-28 |
| `$2.00`/M edge requests over 10M | Vercel iad1, **team-wide not per project** | measured | vercel.com/docs/pricing/regional-pricing/iad1, 2026-07-28 |

**When the product changes, these are the inputs to change:** ship a media feature → storage stops being $0. Ship a live
class-full board → realtime stops being $0 and the *message* meter is 2–19× the connection meter. Fix activation → `φ`
rises and the MAU line wakes up at φ ≈ 14%. Add a second sale per member per month → the `ventas` scan thresholds halve.

## 1.2 The tier table, keyed on gyms × members

Y = 3 years of fleet tenure, φ = measured. Disk figures are provisioned GB.

| G × M | DB used | Disk $ | MAU | MAU $ | Egress | Emails/mo | Edge req/mo | **Required Supabase tier** | **What actually binds first** |
|---|---|---|---|---|---|---|---|---|---|
| 25 × 150 | 0.71 GB | $0 (8 GB floor) | 238 | $0 | 1.2 GB | 3,000 | 1.8M | Free would survive | **Resend Free 3,000/mo — right here** |
| 40 × 200 | 1.5 GB | $0 | 460 | $0 | 1.9 GB | 6,300 | 2.8M | Free at Y=1, **dead at Y=3** | Free DB cap (500 MB) at Y=1 |
| 100 × 225 | 4.0 GB | $0 | 730 | $0 | 4.8 GB | 17,700 | 7.0M | **Pro + Small compute** | `ventas` scan latency (~53 gyms, already crossed) |
| 300 × 225 | 12.1 GB | $2.1 | 2,190 | $0 | 14.4 GB | 53,100 | 21M | Pro + Medium | Vercel edge requests overage; founder-hours |
| 500 × 225 | 20.1 GB | $3.2 | 3,650 | $0 | 24 GB | 88,500 | 35M | **Pro + Large** | `resolveTenant` cache (500/isolate); founder support |
| 1,000 × 225 | 40.2 GB | $7.5 | 7,300 | $0 | 48 GB | 177,000 | 70M | **Pro + XL** | compute; support headcount (7.4 FTE) |
| 3,000 × 150 | 82 GB | $12.8 | 12,000 | $0 | 32 GB | 354,000 | 210M | Pro + 2XL | support headcount |
| **3,000 × 225** | **121 GB** | **$19** | **21,900** | **$0** | **144 GB** | **531,000** | **210M** | **Pro + 2XL** | **support headcount (22 FTE)** |
| 3,000 × 300 | 160 GB | $26 | 29,100 | $0 | 192 GB | 708,000 | 210M | Pro + 2XL/4XL | support headcount |
| 3,000 × 225, **φ = 100%** | 121 GB | $19 | **681,000** | **$1,888** | 144 GB | 531,000 | 210M | Pro + 2XL | MAU (and it is *good news* — see §2.4) |

**Read the table in one sentence:** no Supabase meter binds anywhere inside your target scale; the things that bind are a
query plan at ~53 gyms, an email plan at ~17 gyms, a Vercel meter at ~143 gyms, and a human being at ~135 gyms.

## 1.3 The two required sentences, filled in

> **"You can run ~40 gyms averaging 200 members on the Free tier after one year of operation (~14 after three); the meter
> that ends it is DATABASE SIZE — Supabase's 500 MB cap — which does not send a bill, it flips the whole multi-tenant
> Postgres read-only for every gym at once."**
> *Informational only. R1 settled that production is on a paid plan. Two independent derivations (verify-math and
> model-tiers, using different bytes-per-row models) agree to within 2.5% on this number, and both falsification-tested it:
> if reservation adoption stays at its measured near-zero the ceiling moves to 68–74 gyms, still below the egress ceiling
> of 118–142. Database size is the Free binder in every band modelled.*

> **"Pro carries you past 3,000 gyms averaging 200 members on every meter it has — the entire Supabase meter bill at
> 3,000 × 200 is $17/month, and no meter produces a wall. What ends Pro is a query plan, not a meter: the unindexed
> `ventas.cliente_id` seq scan inside `mi_membresia()` adds +100 ms to every member page render at ~53 gyms and +1 s at
> ~300. The next purchasable step that buys capacity is ~$400/month of compute (Micro → 2XL). The next step that looks
> like an upgrade — Team at $599 — costs +$574/month and raises EXACTLY ZERO meter limits: MAU 100,000, disk 8 GB, egress
> 250 GB, storage 100 GB, edge functions 2M, realtime 5M/500 are identical on both plans."**

**The 53-gym number, derived** [modelled, from measured inputs]:

`ventas` heap = G × M × 12 sales/yr × Y × 234 B/row [234 B/row measured live] = **G × 1.895 MB** at M=225, Y=3.
Three regimes, boundaries confirmed from PostgreSQL 17 source (`heapam.c initscan()`: a seq scan switches to the 256 KB
`BAS_BULKREAD` ring the moment `rs_nblocks > NBuffers/4`):

| Regime | Condition | Gyms | Scan rate | Added latency per render |
|---|---|---|---|---|
| 1 — normal strategy, `shared_buffers` | heap < NBuffers/4 = 56 MB | G < 30 | **3,250 MB/s** [measured, two-point differenced] | < 17 ms |
| 2 — 256 KB ring over OS page cache | 56 MB → ~600 MB | 30 – 317 | ~1,000 MB/s [**modelled — softest number here**] | 57 ms → 600 ms |
| 3 — 256 KB ring over disk | > ~600 MB | > 317 | **11 MB/s** (Micro baseline, doc-fetched) | **55 s and climbing** |

**+100 ms is crossed at G ≈ 53.** The regime-2 rate is modelled and moves this between ~30 and ~170 gyms — which is the
single softest load-bearing number in this report. It does not change the action: one `CREATE INDEX` collapses the working
set from `G × 1.895 MB` to ~3 blocks **regardless of G** and deletes regimes 2 and 3 entirely, for +62 B/row ≈ +$1.70/mo.

**Verified at write time (2026-07-28):** `ventas` has no index leading on `cliente_id`; `clientes` has no index leading on
`auth_user_id`. Both still absent. Supabase's own performance advisor has been reporting them the whole time — and nothing
in `pnpm lint`, `pnpm typecheck`, `pnpm test` or `pnpm test:denial` reads the advisor.

---

# 2. THE COST CURVE

**FX: 1 USD = 17.455892 MXN**, fetched from `https://open.er-api.com/v6/latest/USD`,
`time_last_update_utc = "Tue, 28 Jul 2026 00:02:31 +0000"`. Revenue reference: 300–1,500 MXN/gym/mo = **$17.19–$85.93 USD**.
Scenario: **M = 225, Y = 3, Pro plan, both indexes shipped, φ at the measured rate.**

## 2.1 Per vendor, per meter

| Line | 100 gyms | 500 gyms | 1,000 gyms | 3,000 gyms | Confidence |
|---|---|---|---|---|---|
| **SUPABASE** | | | | | |
| Plan (Pro) | $25.00 | $25.00 | $25.00 | $25.00 | measured |
| Compute (net of $10 credit) | $5 (Small) | $100 (Large) | $200 (XL) | $400 (2XL) | **asserted** — no way to measure from a 15 MB DB |
| Disk (provisioned, $0.125/GB over 8) | $0.00 | $3.24 | $7.47 | $19.00 | modelled |
| MAU (φ measured) | $0.00 | $0.00 | $0.00 | $0.00 | measured input, modelled projection |
| Egress / Storage / Edge fn / Realtime | $0.00 | $0.00 | $0.00 | $0.00 | **measured** (`storage.objects` = 0, `realtime.subscription` = 0) |
| **Supabase subtotal** | **$30** | **$128** | **$232** | **$444** | |
| **VERCEL** (iad1) | | | | | |
| Edge Requests (70,000/gym/mo central; 10M team-wide included, $2/M) | $0 | $50 | $120 | **$400** | **modelled, ±5×** |
| Fast Data Transfer (560 MB/gym/mo; 1 TB included, $0.15/GB) | $0 | $0 | $0 | $102 | modelled |
| Fast Origin Transfer ($0.06/GB, **no included allowance**, `proxy.ts` runs on every navigation) | $3 | $17 | $34 | $101 | modelled |
| Invocations ($0.60/M) | $0.54 | $2.70 | $5.40 | $16.20 | modelled |
| Active CPU + Provisioned Memory | $1.30 | $6.49 | $12.98 | $38.93 | modelled |
| Platform fee (1 seat, $20 credit) | $20 min | — | — | — | measured |
| **Vercel subtotal** | **$20** | **$76** | **$172** | **$658** | **band $150–$3,000** |
| **EMAIL (Resend)** | | | | | |
| Plan + overage + dedicated IP | $20 (Pro) | $35 (Pro) | $104 (Pro+ovg) | $402 (Scale $350 + 31k ovg + $30 IP) | measured rates, modelled volume |
| *(same volume on Amazon SES)* | *$3* | *$14* | *$28* | *$100* | measured rates |
| **DOMAINS** (`*.ibookit.lat`, one apex) | $3 | $3 | $3 | $3 | not fetched — ≤$5/mo, immaterial |
| **TOTAL / MONTH** | **$73** | **$242** | **$511** | **$1,507** | |
| **per gym, USD** | $0.730 | $0.484 | $0.511 | **$0.502** | |
| **per gym, MXN @ 17.4559** | **12.75** | **8.45** | **8.92** | **8.77** | |
| **% of 300 MXN floor** | 4.25% | 2.82% | 2.97% | **2.92%** | |
| **% of 1,500 MXN ceiling** | 0.85% | 0.56% | 0.59% | **0.58%** | |

## 2.2 The band, honestly

The $1,507 figure carries a real band, and the two ends of it are two different unmeasured numbers:

- **Vercel: $150 – $3,000** at 3,000 gyms. Every rate was verified against Vercel's own pages this session (all eight
  correct). The *volume* is not: `7,000 page views/gym/month × 10 edge requests/page view` is a model whose only measured
  anchor is 913 PostgREST requests/day platform-wide across 4 tiny gyms. Low case (light adoption, warm caches): 4,000
  views × 4 requests = $76. High case (heavy booking, prefetch-dense, busy desk): 18,000 × 20 = $2,140.
- **Supabase: $250 – $1,000** at 3,000 gyms, because **$400 of the $444 is one asserted compute rung**. Two agents
  independently arrived at $441.97 and agreed to the cent — which sounds like corroboration and isn't, because they made
  the same asserted assumption.

**So the "Vercel is 1.8× Supabase" headline does not survive its own band.** What does survive, and matters: Vercel is the
same order of magnitude as Supabase and plausibly larger, **Edge Requests alone is the single largest meter in the entire
stack**, and exactly one of 36 agents priced it.

## 2.3 The number that dwarfs all of this

| Line at 3,000 gyms | $/gym/mo | MXN/gym/mo | % of 300 MXN floor | % of 1,500 MXN ceiling |
|---|---|---|---|---|
| **All infrastructure (this report)** | $0.502 | **8.77** | **2.92%** | **0.58%** |
| Support at $18/ticket × 2.0 tickets/gym/mo | $36.00 | **629** | **210%** | 42% |
| Support at $35/ticket × 2.0 tickets/gym/mo | $70.00 | **1,224** | **408%** | 82% |

Cost-per-ticket band fetched from lorikeetcx.ai, 2026-07-28 [measured rate, **modelled** application]. The ticket rate of
2.0/gym/month is modelled and carries ±3× — but the *structural* claim under it is measured: correcting a mis-sold package
and merging a duplicate member are both founder-executed SQL transactions against production, documented in
`docs/runbooks/venta-correction.md` and `docs/runbooks/duplicate-member-merge.md`, and neither has ever been run
(`select count(*) from ventas where monto < 0` → **0** across 175 sales).

**One honest caveat the audit could not close:** that $18–35/ticket is a US-anchored benchmark. LatAm outsourced support
could plausibly run $5–8/ticket, which drops the numbers to ~35–70% of the floor — still uncomfortable, no longer
catastrophic. Nobody fetched a LatAm rate. That is the single most load-bearing unverified number in the business case.

## 2.4 The success case, and why it is good news

If activation actually works (φ → 100%), MAU stops being $0:

| G | MAU | MAU overage | Supabase | Vercel | Email | **Total** | $/gym | MXN/gym | % of 300 |
|---|---|---|---|---|---|---|---|---|---|
| 1,000 | 227,000 | $413 | $645 | $172 | $104 | $924 | $0.924 | 16.13 | 5.38% |
| 3,000 | 681,000 | **$1,888** | $2,332 | $658 | $402 | **$3,395** | $1.132 | **19.76** | **6.59%** |

**6.6% of the floor price is a bill you should be delighted to pay.** Today's $0 MAU line is $0 *because 4.3% of the
platform's roster has ever signed in, and 0 of 52 members across both real gyms have* [measured]. The cheapest line in
your cost model is cheap because the client half of the product is not being used.

---

# 3. RANKED WEAKNESS LIST — worst first

Ranking principle: **live-today × blast radius × irreversibility × how much more the fix costs later.** Sixteen entries,
deduplicated across 36 agents. Every one carries evidence you can check yourself.

---

### 1. There is no way back — per-tenant RTO is ∞, platform RTO is unproven, and the repo is not a rebuild artifact · **LIVE-TODAY**

**What it is.** Physical PITR restores the *cluster*, so "restore gym #1,847 to Tuesday" means restoring 2,999 other gyms
to Tuesday. The per-tenant alternative would be a logical extract — and the one that exists is lossy in exactly the way
that makes reconstruction impossible.

**Evidence.** `packages/data/src/server/respaldo.ts` reads `ventas`, `asistencias`, `clientes`, `paquetes` — **4 of 29
tables**. `packages/data/src/server/export/rows.ts:174-206` (`shapeClientes`) emits Nombre/Teléfono/Email/…/Alta with **no
`id`**. `rows.ts:161-164` builds `nombrePorId` and emits `nombreDe(v.cliente_id)` — **the referential graph is destroyed at
export time**. `respaldo.ts:166` windows to the last 24 months. `grep -rn "xlsx.read|readFile|parse.*csv|bulkInsert"` across
`packages/data/src` and `apps/*/src` → **two hits, both in `.test.ts`. The import path is 0 of 29 tables.** Live:
**61/116 `clientes` rows have `email is null`**, no unique constraint on `tel`, PK on `id` is a surrogate — so two members
named "Juan Pérez" are indistinguishable on reimport. And `ventas_folio_gym_uq (gym_id, folio)` will collide with every
folio `next_folio` has since issued. The 25 tables with **no export at all** are the entire agenda, schedule, branding,
billing-config and **membership** subgraph: a gym restored from `respaldo.xlsx` has a roster and a sales list and no
classes, no coaches, no schedule, no brand, and no staff account.

Compounding: **prod's migration ledger shares only 22 of 87 version stamps with the repo** [measured] — `apply_migration`
restamps, so `supabase db push` would re-apply 65 migrations including every seed, and there is no command that answers
"is prod's schema the one the suites were run against?" Replaying the repo gives you an approximation of prod's schema,
known to differ on the privilege surface by the repo's own written admission.

**Scale at which it bites.** Gym #1. This is a calendar trigger, not a scale one. At 3,000 gyms with a 1%/yr incident rate
that is 30 unrecoverable-data-loss events per year.

**Blast radius.** One tenant (irrecoverable) or all 3,000 (a restore rolls everyone back).

**Cost now vs later.** Now: ~2 days for the nightly per-gym JSONL export + $5–15/mo of Storage; ~1 day for a schema-dump
convention and one timed restore drill. Later: unbounded, and the first time you need it is under maximum pressure with a
customer on the phone.

---

### 2. `enviar_mensaje_contacto` is a live unauthenticated unbounded-write vector · **LIVE-TODAY**

**What it is.** The rate limit is inside `if p_ip is not null`, and `p_ip` is a caller-supplied parameter with
`DEFAULT NULL`. Omit it and the limit does not exist.

**Evidence — re-verified live at write time, 2026-07-28:**

```
signature : p_gym_slug text, p_nombre text, p_correo text, p_mensaje text, p_ip text
prosecdef : true          has "p_ip is not null" guard : true          anon EXECUTE : true
```

Prerequisites, all free: the publishable key (ships in the browser bundle) and a gym slug. `gym_domain` is
`anon`-SELECTable with `USING (true)` [measured], so an attacker enumerates all 3,000 tenants' hostnames and gym UUIDs in
one request and spreads writes across every tenant to defeat per-gym alerting. Turnstile lives in the Next server action
(`apps/client/src/app/contacto/actions.ts`); the RPC is reachable directly at `POST /rest/v1/rpc/enviar_mensaje_contacto`.
Different door, no lock. **Amplification nobody found:** `contact_message` has CHECKs on `nombre` (≤80), `correo` (≤160),
`mensaje` (≤2000) — and **none on `ip`**, which is attacker-controlled free text bounded only by the btree entry limit
(~2,704 B) on `contact_message_ratelimit_idx`, and duplicated into that index. That takes the row from ~2.5 KB to ~8.7 KB.

**Where it terminates.** Supabase disk autoscales at 90% utilisation, +50% per event, **max four resizes per rolling 24 h**,
then *"If your project reaches 95% disk utilization and has exhausted your modification quota, your project will enter
read-only mode"* (docs fetched 2026-07-28). From an 8 GB baseline: 8 → 12 → 18 → 27 → 40.5 GB, quota exhausted, read-only
at ~38.5 GB written inside one 24-hour window. At 100 req/s with the max payload that is **~12 hours**; at 1,000 req/s,
**~75 minutes**. Cost to the attacker: a $5/month VPS.

**Blast radius.** Platform-wide read-only — every one of 3,000 gyms stops taking sales simultaneously — **plus a permanent
bill ratchet**, because disk never shrinks. Deleting every row and running `VACUUM FULL` leaves the disk at 40.5 GB:
+32 GB × $0.125 = **+$4/month forever, per attack, repeatable monthly**.

**Cost now vs later.** ~1 hour + 5 minutes. There is no "later" — this is the highest value-per-minute item in the audit.

---

### 3. A gym is one shared password · **LIVE-TODAY**

**What it is.** There is no operator role. Not "no UI for it" — no writer at all.

**Evidence.** `grep -rn "'operator'"` across all SQL/TS excluding CHECK constraints, RLS predicates and test fixtures →
**zero**. Live `pg_proc`: exactly two of the 38 `public` functions insert a `gym_membership` row (`reclamar_o_crear_cliente`,
`reclamar_por_codigo`), and **neither body contains the string `'owner'` or `'operator'`**. The only owner insert in 87
migrations is a seed with a hardcoded email. Live census: `{member: 5, owner: 4, operator: 0}`. The admin app has 7 routes
and none of them is a staff screen. `apps/admin/.../login-form.tsx` has `signInWithPassword` and **no password-reset link**
— while `packages/data/src/server/sesion.ts:45` already implements `solicitarReset` for the client app.

**Scale at which it bites.** Gym #1. A 150–300-member LatAm gym runs 05:00–22:00, seven days — two to three shifts, one
credential, which also carries the bank details (`cobro`) and the money ledger. The only revocation is a password change
that locks out the whole staff, requested from you because there is no reset link.

**Blast radius.** Per gym — but it *gates* the email-capture labour, the invite drive, and every desk task, because there
is nobody to delegate to. It is also why per-user audit attribution is meaningless: every sale, attendance mark and content
edit is attributed to the one owner account.

**Cost now vs later.** 2–3 engineer-days now (`invitar_operador` mirroring `preparar_invitacion`'s shape + a panel in the
existing `/cuenta` mega-screen + link the reset). Later: identical code, but shipped to N gyms simultaneously with no
canary.

---

### 4. Support is founder-executed SQL, saturating at ~135 gyms, at 210–408% of floor revenue · **LIVE-TODAY**

**Evidence.** `docs/runbooks/venta-correction.md`, verbatim: *"An `anular_venta` RPC ships only if mis-sales prove
frequent; until then, correction is an owner-run SQL recipe."* The recipe impersonates the owner via
`set_config('request.jwt.claims', …)`, draws a folio, inserts a negative-`monto` compensating row, and updates three
balance columns to a target the operator must supply from memory — because *"the stored saldo is authoritative and not
re-derivable from the ledger (ADR-0004)."* `duplicate-member-merge.md` requires four pre-checks and warns that deleting
the loser first *"silently destroys its revenue ledger + attendance history."* Neither has ever run in production.

At 225 members × 12 renewals = 2,700 sales/gym/yr and a 0.5–2% front-desk keying-error rate, that is 1.1–4.5 SQL-surgery
tickets per gym per month. At 1.25 founder-hours/gym/month and 169 h/FTE-month, **the founder saturates at ~135 gyms**
[modelled, ±3×]. At 3,000 gyms the Expected band needs **22 FTE**.

**Scale at which it bites.** ~135 gyms for the founder; the unit economics never work at the 300 MXN floor.

**Cost now vs later.** 5–8 engineer-days for `anular_venta` + `fusionar_clientes` — **both are already fully specified in
prose in the runbooks; only the code is missing.** That moves saturation 135 → 338 gyms and 3,000-gym headcount 22 → 9 FTE.

---

### 5. The money model has no correction path, and the only correction the DB permits desynchronises the ledger · **LIVE-TODAY**

**Evidence.** `pg_policies` on `ventas` = exactly 2 rows: `ventas_staff_insert` (INSERT), `ventas_staff_select` (SELECT).
**No UPDATE policy. No DELETE policy.** Zero functions update or delete `ventas`. **Zero non-internal triggers in the
entire `public` schema.** Meanwhile `information_schema.column_privileges` grants `authenticated` UPDATE on **all 18
columns of `clientes`**, including `clases_restantes`, `vence`, `gym_id` and `auth_user_id`, under a policy whose only test
is `is_staff_of(gym_id)`. So a `PATCH /rest/v1/clientes` setting `{"clases_restantes": 40, "vence": "2027-01-01"}` succeeds
for any operator; a `PATCH /rest/v1/ventas` does not. **The schema makes the derived projection editable and the source of
truth immutable — exactly backwards.** `grep -rn "void\|refund\|anular\|reembolso" docs/adr/` → nothing in a decision
context. This was never decided; it was never noticed.

The landmine underneath it: `ventas_cliente_id_fkey ... ON DELETE CASCADE` and `asistencias_cliente_id_fkey ... ON DELETE
CASCADE`, with DELETE **privilege granted** to `authenticated` and denied only by a missing policy — while **eight sibling
tables already ship a `*_staff_delete` policy**, making `create policy clientes_staff_delete ... for delete using
(is_staff_of(gym_id))` a five-second, reviews-clean, ships-green change. It would pass `pnpm lint`, `pnpm typecheck`,
`pnpm test` (the DAL mocks the RPC boundary) and `pnpm test:denial` (the suites assert *cross-tenant* denial, and the
policy is correctly gym-scoped). Then `getResumenMes` (`resumen.ts:41`) sums `ventas` live with no snapshot, so the
deletion retroactively rewrites every past month's revenue figure — noticed at month-end close, not at the moment of loss.

**Cost now vs later.** ~1 day now: `ventas.anulada_at` + `anula_venta_id` + an `anular_venta` RPC writing a reversing row
and recomputing the balance in one transaction + a suite asserting the written rows; plus `ON DELETE RESTRICT` and
`clientes.archived_at` (~2 h). Later: unbounded — past direct-SQL repairs are unmarked and unfindable, and ADR-0004's
promised reconcile job becomes unwritable.

---

### 6. The two missing indexes, and the reason they are still missing · **AT-SCALE (bites at ~53 gyms)**

**Evidence — verified at write time 2026-07-28: `ventas` has 0 indexes leading on `cliente_id`; `clientes` has 0 leading
on `auth_user_id`.** `mi_membresia()` is `SECURITY DEFINER`, so its `where cliente_id = $1` seq-scans **every gym's**
sales ledger on every member's plan-card render; the identical scan runs in `getClienteFicha` on every staff ficha view.
Live `pg_stat_user_tables` on a 175-row table: 2,965 seq scans / 168,768 tuples read. Supabase's own performance advisor
reports `unindexed_foreign_keys` on `ventas_cliente_id_fkey`, `clientes_auth_user_id_fkey` and `gym_owner_user_id_fkey`.

**The finding is not "you are missing an index."** It is that the index has been advisor-flagged for weeks, named a
"verified critical" by your own 2026-07-27 audit, and is still absent — because **no gate in this project reads
`get_advisors`**, and the mechanism for applying the fix is itself degraded (§weakness 14).

**Cost now vs later.** 10 minutes now, instantly, at 175 rows. Later: `CREATE INDEX CONCURRENTLY` on ~12M rows on a live
shared instance with no maintenance window and all 3,000 tenants attached.

---

### 7. One email identity gates login for the whole platform, on a rolling bounce budget that never dilutes · **LIVE-TODAY**

**Evidence.** `docs/runbooks/hitl-72-resend-live.md:59`, verbatim: *"Copy the `re_…` secret once. Store it for §B (SMTP
password) and §D (`RESEND_API_KEY`) — **the same key serves both roles**."* One Resend account, one sending domain
(`ibookit.lat`), one API key gating signup confirmation, password reset, magic-link activation, invites and receipts for
every tenant. No suppression table anywhere. `notificaciones_activadas` reads as a working opt-out in the member UI and is
**never consulted by any send path** — the RPC that would let a member flip it was dropped in
`20260708190000_drop_set_notificaciones.sql`.

**The correction that matters.** SES's own enforcement FAQ (fetched 2026-07-27) states the bounce/complaint rate is
computed over *"a representative volume … [that] changes as the user's sending patterns change"* — **a rolling window, not
a lifetime average.** So one gym importing one dirty 200-contact roster trips an account-wide suspension identically at 30
gyms and at 3,000. Growth does not dilute this. The prior framing ("it's a cold-start artifact we'll outgrow") is wrong.

**Scale at which it bites.** Resend Free's **100/day hard cap** binds at gym #2 during any invite drive: a 225-member
roster is 2.25 days of the entire platform's budget. The 3,000/mo cap binds at **12–25 gyms**. Both are activation-independent,
which is why email is the first ceiling at 4.3% activation *and* at 60%.

**Cost now vs later.** Split the key: **10 minutes, $0** — decouples "invites got suspended" from "nobody can log in."
Per-tenant sending subdomains: DNS-only, $0 (Resend's own docs recommend it *"to isolate your sending reputation"*).
Suppression table: ~half a day. Paid tier: $20/mo. **And SES prices the same volume at $100/mo vs Resend's $402** at
3,000 gyms — 4× cheaper, at the cost of building the bounce/suppression handling yourself.

---

### 8. Zero observability — which makes this entire report unenforceable · **LIVE-TODAY**

**Evidence.** `grep -ril "sentry|datadog|opentelemetry|posthog|logflare|axiom|betterstack|pagerduty|log drain"` over
`apps/*/src packages/*/src supabase` → **nothing**. No such dependency in any `package.json`. `log_min_duration_statement
= -1` [measured] — no slow-query logging. `track_functions = none` → `pg_stat_user_functions` is empty. And
`auto_explain` is loaded with `log_min_duration = 10000` while `authenticated` carries `statement_timeout = 8s` and `anon`
3s — **a statement killed by the timeout never completes and is never logged, so auto_explain provably cannot fire for any
app-role query, ever.** No uptime check. No error tracker. No alert on any of the ten platform-wide single points of
failure. Detection time for a bad migration: *"when a customer complains."* Detection time for a leaked `service_role`
key: **zero — nothing detects it.**

**Why this is ranked here and not lower.** This report contains 69 exit triggers across the corpus. Roughly a third are
gym-count thresholds a human can check by running SQL on purpose. **The rest are p95 latency, GoTrue 429 rates, cache hit
rates, Resend quota headers, disk-fill rate and DAL network wait — and nothing in this stack emits any of them.** The
report's delivery mechanism does not work against this codebase as it stands.

**Cost now vs later.** 1–2 days for a minimum viable set: an error tracker in both apps, an uptime check per app, a weekly
`pg_stat_database` cache-hit read, and one alert on `pg_stat_archiver.failed_count`. Later: the same work, plus every
incident you did not see.

---

### 9. The tenant boundary and the performance boundary are different mechanisms, and only one is enforced · **AT-SCALE (26–315 gyms)**

**Evidence.** The RLS predicate compiles to `gym_id = ANY (hashed SubPlan)` — a **filter**, never an `Index Cond`. Proven
on live prod: with `enable_seqscan = off` (a 10¹⁰ cost penalty) a member-scoped read of `asistencias` **still** chose a
Seq Scan at cost 10,000,000,028.80. The same query with an explicit `gym_id` literal: cost **24.12**. The `.eq("gym_id")`
is the entire difference between O(platform) and O(tenant) — and ADR-0013 §2 says so explicitly, after correcting itself
on 2026-07-13.

Coverage, re-counted by the referee: **40 of 122 non-test `.from()` call sites = 32.8%**. Honest denominator excluding
`gym`/`gym_domain`/`gym_membership` where `.eq("gym_id")` is impossible or wrong: ~112 ⇒ **35.7%**. Ten DAL modules have
zero, including `agenda.ts` — the admin Agenda, an entire product sector, reading `class_session` (4.7M rows/year at 3,000
gyms) with no tenant filter, and `catalog.ts:12-15` documents the omission as *intentional* using the ADR's pre-correction
reading. `tools/guards/` holds 8 guard tests; **none checks gym scoping.**

Separately: `gym_membership` is read at **four sites with no `user_id` predicate**, and its two permissive SELECT policies
OR together as `is_staff_of(gym_id) OR user_id = uid` — **expensive arm first**, on the member path where `is_staff_of` is
false for every row. Postgres does not reorder OR operands (proven 58× by swapping them: 339.59 ms vs 5.78 ms).
`is_staff_of` costs **14.5 µs/call** [measured four independent ways, all within ±15%].

**Scale at which it bites.** `+100 ms` on `/reservar`: **315 gyms at today's 4.3% activation, 76 gyms at 20%, 26 gyms at
60%.** This is the one ceiling that gets *nearer as the product succeeds* — and the fix is `.eq("user_id", uid)` at four
call sites with **zero DDL**, because `gym_membership_pkey` is already `btree (user_id, gym_id)`.

One sharp sub-case worth naming: `getEsMiembro` (`agenda-miembro.ts:172`) is `select gym_id … limit 1` with no `ORDER BY`,
so Postgres scans until it finds a visible row — and a **newly activated** member's row is physically the most recent
insert. The query is structurally worst-case for first-time claimers, immediately after `/activar`, on the exact request
that decides whether activation felt like it worked. That is a conversion risk, not just latency.

**Cost now vs later.** 4 one-line edits + one policy merge + one guard test shaped like `denial-suite-drift.test.ts`:
1–2 days. **The policy merge is unproven** — see E1 in §8.3; run it on scratch first.

---

### 10. anon and authenticated hold INSERT/UPDATE/DELETE/TRUNCATE on all 29 public tables · **LIVE-TODAY (latent)**

**Evidence — verified at write time:** 29 of 29 public tables grant TRUNCATE to `anon`; `relforcerowsecurity` is false on
29/29. PostgreSQL 17 docs: *"Operations that apply to the whole table, such as TRUNCATE and REFERENCES, are not subject to
row security."* RLS is the only tenant boundary in this system and it has a documented hole exactly at the whole-table
verb — including on `gym_folio_counter`, whose deny-all posture protects it from SELECT/UPDATE but not from TRUNCATE.
Separately, **7 functions are anon-EXECUTE** [verified at write time], of which 5 are write-bearing scheduling RPCs that
were revoked `from public` but not `from anon` — and the repo's *own* migration `20260715080000_revoke_anon_perf_rpcs.sql`
root-causes this exact class in prose, then fixes four **different** functions and leaves these five standing.

**Honest severity.** Latent, not live. PostgREST emits no TRUNCATE verb, and all five write RPCs open with a `staff_gym()`
null check that bounces `anon` at index-lookup cost. **What it proves is the point:** the local/scratch substrate the
denial suite runs on *does not reproduce prod's default grants* — the repo says so itself — and no suite anywhere asserts
what `anon` can EXECUTE. Any grant-surface, policy-absence or index-absence defect on prod is invisible to every gate this
project has.

**Cost now vs later.** One migration, ~20 minutes, plus a `tools/guards/` test asserting the anon-EXECUTE allow-list is
exactly `{enviar_mensaje_contacto, invitacion_info}` — ~2 hours, same shape as the guard that already works here.

---

### 11. There is no tenant-provisioning surface — growth caps at 250–500 gyms/year · **LIVE-TODAY**

**Evidence.** No code path creates a `gym`, a `gym_domain`, or an owner membership. Three `.from("gym")` call sites in all
of `packages/data` + `apps` — **all SELECT**. And branding a gym is worse than the "3 INSERTs" the architecture implies:
`packages/brand/src/brand-id.ts:9` is a **compiled TypeScript union** `"forge" | "red" | "base"`, guarded by a census test
(`brand.test.ts:13`) that asserts exactly those three exist. The designed escape hatch — `gym.token_overrides`, a 33-key
CSS map with a hardened Zod schema — **is not wired**: `apps/admin/src/lib/token-overrides.ts` returns a hardcoded purple
demo constant and never reads the database, and its own comment concedes *"FIXTURE (Phase 4)… this becomes a ONE-LINE
swap."* Live: all four gyms have `token_overrides = {}` and a compiled `brand_module_id`.

So the only pattern ever executed is **3 INSERTs + a TypeScript union edit + a test edit + a Vercel deploy**: 5.5–18.5
founder-hours per gym, against 1.5–2.5 hours on the never-executed base-brand path. To reach 3,000 gyms in three years you
must provision **4 gyms every business day for three years**; the process absorbs 1–2/day at its very best and has
demonstrated 4 gyms in 26 days.

Vercel is **not** the constraint, and this settles the repo's open question: unlimited domains per project on Pro (100,000
soft cap), 120 domain-creates/hour team-scoped = 60 gyms/hour. The "100/hr vs 100/min contradiction" is not a
contradiction — they are two different limits on two different endpoints, and the binding one is 120/hour.

**Cost now vs later.** `alta_gimnasio(slug, brand_name, timezone, owner_email, hostnames[])` as one `SECURITY DEFINER`
transaction + the one-line `token_overrides` DB read: **4–6 engineer-days**, collapsing 4.5–16 h/gym to ~15 min.

---

### 12. Compute in `iad1`, database in `us-west-2` — and no `vercel.json` exists at all · **LIVE-TODAY**

**Evidence.** `X-Vercel-Id: sfo1::iad1::…` on both production hosts [measured by curl]. `db.hjppxawglmukfvsgmcog.supabase.co`
resolves to `2600:1f13:5fd:be02:…`, geolocating to Boardman, Oregon, AS16509 — and this repo's own handoff records the org
region as `us-west-2`. `find . -name "vercel.json"` → **no output**. The only runtime directive in the codebase is one
`export const runtime = "nodejs"`. `/reservar` makes **~8 sequential round trips** and ~20–23 total PostgREST requests per
render; the physics floor for iad1↔us-west-2 is ~39 ms RTT and the real-world figure is 60–75 ms. **~320–560 ms of
avoidable latency on every member page render, at every scale, forever** [modelled — the *placement* is measured, the
millisecond cost is not].

**The governance defect is worse than the latency.** `docs/runbooks/hitl-16-vercel-deploy-verify.md:82-84` predicted this
exact tax and left a blank to record the pair: `` `Supabase: ____ · Vercel: ____` ``. **The blank is still blank.** Three
later documents instruct a future reader to *"verify, do not re-tune"* the record that was never written. That is the
failure mode of this whole codebase's checklists in miniature: they produce the *feeling* of verification without the
artifact.

**Cost.** One dashboard setting (`pdx1`), $0, zero downtime — but pin it in a `vercel.json` so it is reviewable. Also
`resolve-tenant.ts:121-128` makes the `gym_domain` → `gym` lookups **sequential** where an embedded select would make them
one query, and the proxy fires a wasted `gym`-by-slug lookup on 100% of returning traffic because it sets the `gym` cookie
on every response and then discards the override on mapped hosts (~2 lines to fix).

---

### 13. 52.6% of roster rows have no unique key at all, and the fix expires · **LIVE-TODAY**

**Evidence.** `clientes_email_gym_uq` is `WHERE email IS NOT NULL` → enforces nothing on **61/116 rows (52.6%)**.
`clientes_auth_user_id_per_gym` is `WHERE auth_user_id IS NOT NULL` → nothing on **111/116 (95.7%)**. **There is no index
on `tel` at all** — not unique, not even a plain btree. The only thing protecting those 61 rows is a soft check inside
`registrar_venta` with **no `FOR UPDATE`** and an explicit `p_forzar_nuevo` bypass. Two concurrent front-desk terminals
selling to the same walk-in both see no duplicate and both insert.

**This directly contradicts the prior audit's claim** that the two partial indexes make "one roster row per tenant" a
database property. They do so for the claimed minority and generalise it to the table.

**Cost now vs later.** `create unique index concurrently clientes_tel_gym_uq on clientes (gym_id, tel)` builds instantly on
116 rows with 0 duplicates today [measured]. **The build FAILS the moment duplicates exist**, and the merge migration it
would then need must dodge the `ON DELETE CASCADE` that deletes the loser's revenue. This is the one item on the list that
goes from *free* to *permanently impossible*.

---

### 14. The shipping path has no gate, no canary, and no rollback — at a 3.75-day schema cadence during gym hours · **LIVE-TODAY**

**Evidence.** `.github/workflows/ci.yml` runs `lint`, `typecheck`, `test`, `build` — **no database step, no
`test:denial`**. But CI is not even on the path: migrations reach production through `apply_migration` against the live
ref, which does not pass through GitHub Actions at all, and runs as `postgres` (table owner) where PostgreSQL documents
that **RLS does not apply**. 87 migrations in 60 days = one every 3.75 days. **62 of 87 (71%) were applied between 07:00
and 21:00 Mexico City time**, while gyms were open and selling. `registrar_venta` — the money path — was `DROP FUNCTION`'d
and recreated with a different arity **three times in five days** (12 → 8 → 13 args), and the repo's own migration comment
documents the outage window: *"between applying this and deploying the matching app build, the old app's COBRAR fails
loudly (PGRST202). Accepted for a solo deploy."* At 3,000 gyms and 26.8 sales/minute platform-wide, a 5-minute skew drops
**134 sales**; 30 minutes drops **804**.

The escape hatch is genuinely blocked, not merely unused: `registrar_venta` has 12 of 14 args defaulted, so keeping both
signatures as overloads makes any call supplying ≤13 args ambiguous and Postgres raises `function is not unique` (42725).
There is no API version, no `Accept-Profile` schema switch, no dual-write, no feature flag, no canary tenant, no staging DB.

**Cost now vs later.** Wire `test:denial` into CI against the already-provisioned scratch project — **1–2 engineer-days,
and the ticket is already written in `docs/scope-model.yaml`**. Add a maintenance-window convention and a Spanish `503`
for the DROP window — hours. The versioned front door (a single-`jsonb`-arg RPC per writer, so the arg list never changes
again) is the real decision, and it needs making before the next roll.

---

### 15. RED has no representation of its own customer relationship — it cannot suspend a non-paying gym · **LIVE-TODAY**

**Evidence.** Live `information_schema.columns` on `public.gym`: twelve columns, **none of them record payment status,
lifecycle, or anything RED-facing**. No subscription table, no `paid_through`, no invoice history (`cobro` is the *gym's*
bank details for collecting from *members*). Three independent checks confirm suspension is impossible through any
supported path: (1) 7 of 27 FKs into `gym` are `NO ACTION`, so `DELETE FROM gym` throws once a gym has member data;
(2) deleting `gym_domain` rows does not revoke access, because `resolve-tenant.ts:34-39` documents that the slug is *"NEVER
an authz input"* and an unmapped host + `?gym=<slug>` still resolves against the live `gym` table; (3) `gym_membership` —
the actual authz boundary — has **no DELETE or UPDATE code path anywhere in 87 migrations**.

There is also no `gym.status`, so a departed gym is indistinguishable from an active one forever: its hosts keep resolving,
its rows keep being scanned by every query, and every compute model in this report counts it. At an assumed 20–25%/yr logo
churn that is 600–750 new zombie tenants per year at steady state.

And no ToS/DPA exists anywhere in the repo defining what a gym is owed when it leaves — which is also the precondition the
lawful-international-transfer analysis depends on (§Compliance).

---

### 16. The client half of the product has never worked at a real gym, and the front desk runs 17 cross-continent round trips with no offline path · **LIVE-TODAY**

**Evidence.** Live per-gym: **forge** — 33 roster, **32 with no email at all**, **1 invite ever sent**, **0 activated**, 26
days live. **red** — 19 roster, 0 invites, 4 days live. Platform 5/116 = 4.3%; **0 of 52 across both real gyms**. The prior
reading (a batch-invite gap) is not the binding constraint: **you cannot invite a member whose email you never captured**,
and `email` is the sole join key between the two doors. Collecting them is ~5.6 hours of undelegatable front-desk labour
per gym (16,875 hours across 3,000), for an app the member has no recurring reason to open — attendance is 100%
staff-marked, there is no in-app payment, and live `asistencias` (708) exceed `reservation` (463) by 53%.

Compounding, and nobody connected these two facts: **no service worker, no PWA manifest, no `navigator.onLine`, no offline
handling anywhere in `apps/*/src`** [measured by grep], while `/reservar` is 17 sequential round trips and *pase de lista*
is a write + a full RSC re-render per member, from Virginia to Oregon, at ~60–70 ms each. A gym front desk in Chihuahua on
flaky wifi runs the product's headline daily flow with no offline buffer, no optimistic write and no retry. **This is the
one class of problem in this entire audit that a paying customer experiences directly, and it arrives at 30 gyms, not
3,000.**

**Cheapest first move:** make `email` a required field on the `/vender` NUEVO arm so no new member enters the roster
un-invitable — one Zod change, hours. Then bulk invite — **but per-tenant sending subdomains must land first** (§weakness 7).

---

**Honourable mentions that are real but rank below the sixteen:** the Spend Cap ambiguity (§9 item 1 — it converts three
overage bills into three platform-wide outages, and the four biggest lines are uncapped either way); `staff_gym()` =
`order by gym_id limit 1`, so a two-location owner's sale lands in the lowest-UUID gym's ledger and folio sequence;
`ventas` has no `paquete_id`, only a free-text label, and **3 labels are already ambiguous across 2 gyms at 175 sales**;
the error contract is 100 free-text Spanish `raise exception`s of which 95 carry no SQLSTATE and 27 of 49 distinct messages
are asserted nowhere, string-matched in TypeScript against a mock; `pg_stat_statements` is at 65.5% of capacity with 22 of
its entries consumed by `registrar_venta`'s conditional-spread arg shapes, 8 of them for a signature that no longer exists.

---

# 4. ALTERNATIVES MATRIX

All costs monthly, USD, at M = 225. Migration hours are **asserted** in every row — nobody has performed one of these.

| Option | @100 gyms | @1,000 gyms | @3,000 gyms | Migration hours | What improves | What gets worse | Verdict |
|---|---|---|---|---|---|---|---|
| **STAY AND FIX** *(first-class row — §4.1)* | $73 | $511 | $1,507 | **~180–280 h of fixes, not migration** | Every one of the 16 weaknesses; the fixes are the product roadmap | Nothing — but it is 5–7 solo weeks that do not ship features | **DO THIS.** Same cost as the cheapest exit, and the exit fixes none of the top 5 |
| **Supabase + SES for email only** | $56 | $435 | **$1,205** | 16–40 h | −$302/mo at 3,000 gyms (4× cheaper); config sets + IP pools give real per-tenant isolation | You build bounce/complaint/suppression handling (SNS + Lambda + a table); SES sandbox exit is a support ticket, not a toggle | **The one substitution that pays.** Do it at ~500 gyms, not before |
| **AWS RDS Multi-AZ + self-hosted GoTrue + PostgREST on Fargate + SES** | ~$600 | ~$900 | **$638–1,966** | **150–300 h + 12–24 h/mo forever** | Genuinely at or below Supabase's bill; RLS and all 38 RPCs port unmodified | A vendor relationship becomes an on-call rotation of one; you lose `get_advisors`, branching, managed PITR; nightly off-cloud dumps cost $405/mo in egress | **Coin flip on dollars, loss on time.** Only if a second engineer exists |
| **AWS RDS/Aurora + Cognito** | ~$700 | ~$3,000 | **$5,848–7,900** | 150–300 h | Nothing that matters here | Cognito is **$0.015/MAU flat with no volume discount** — 4.6–8.8× Supabase Auth at every volume above 10k MAU, with **no crossover point** | **No.** The auth line alone is a $53–69k/yr gap |
| **Self-hosted Supabase OSS on Hetzner** | $150–330 infra | same | **$150–330 infra + ~$2,000/mo labour = $1,830–3,630** | 40–80 h build, then **20 h/mo forever** | Hardware is genuinely 5× cheaper than DO-equivalent; branching friction disappears | Bus factor 1 becomes the DR plan; you lose `get_advisors`, managed PITR, branching, and **any path to SOC2** short of a five-figure audit | **No.** False at any founder hourly rate above ~$15/hr. And it gets numerically better and operationally worse at the same time |
| **Neon (DB-per-tenant)** | — | — | **~$119,880** | 80–144 h | Free-tier branching is genuinely better than Supabase's Pro-gated version | Neon's own control-plane health-check pings put a **6 CU-hr/day floor per project** regardless of traffic — 185× a single shared DB | **No.** Its own multitenancy doc recommends the pattern its own pricing makes unaffordable |
| **Neon / Railway / Fly (one shared DB)** | ~$50 | ~$300 | **$648–962** | 80–144 h + full auth rebuild | Neon branching; Railway's one-click PgBouncer is genuinely better UX | You lose Auth, PostgREST, RLS-as-authorization, advisors, and the denial suite's substrate | **No.** You'd rebuild the auth spine to save nothing |
| **Fly Managed Postgres (DB-per-tenant)** | — | — | **$114,000** | — | São Paulo region exists | No scale-to-zero at all; flat, un-optimisable floor | **No** |
| **Firestore** | ~$5 | $522–1,212 | **$1,970–4,040** | 200+ h (full rewrite) | Nothing | **No engine-enforced per-tenant UNIQUE** (you have 5 live ones on money-adjacent data); no GROUP BY; its own hotspot guidance (sharded counters) **breaks folio ordering**, which is a fiscal artifact; denormalise-or-N+1 on every report reintroduces the exact write-fanout bug class as #78 | **No.** Fit, not price, disqualifies it |
| **Convex** | ~$25 | ~$25 | **~$78** | 200+ h | Startlingly cheap on the rate card; every mutation is one serializable transaction | **No unique constraints** (their docs say so); no join/aggregate language; bills **bytes scanned, not returned** — so your existing unindexed-read bugs become a metered bill instead of just latency | **No**, and the $78 is the least trustworthy number in the corpus |
| **Appwrite** | $25 | $37.6–Enterprise | **Enterprise-only** | 200+ h | Native composite unique index and atomic increment — closest fit of the BaaS three | **Pro's 200,000 MAU is a hard cap** → self-serve pricing stops existing at **667–1,333 gyms**, forcing an opaque negotiation with a Series-A company | **No.** This is the only alternative that runs out of *published price* before your target |
| **Nhost** | $25 | ~$115 | **$256–456** | 80–144 h (Hasura permission DSL rewrite) | Same Postgres engine — zero domain-fit loss; unlimited MAU on every plan | 6-person company, ~$660k ARR, $3M raised vs Supabase's $500M Series F; "unlimited MAU" is exactly the promise a company that size re-tiers later | **Only if Supabase becomes untenable.** Continuity risk, not fit risk |
| **Swap auth only (Clerk / WorkOS / Auth0)** | $0–25 | $0–1,000 | **$0–6,894** | **180–280 h** | Nothing at your MAU | `auth.uid()` returns a Postgres `uuid`; every alternative issues a **string** ID, so this is a type-and-predicate rewrite across 28 policies, 22 function bodies and 2 identity columns. **Supabase's Third-Party MAU meter bills at the identical $0.00325 with the identical 100,000 included** — the officially supported unbundling path saves $0. And *"it is not possible to disable Supabase Auth at this time."* Clerk and Auth0 bill on **organisation count** = gym count | **No.** 24–37 month payback against a $559/mo maximum saving |
| **Swap the app tier (Cloudflare Workers, Fly, self-hosted Next)** | ? | ? | ? | ? | It is the **larger** bill (~$658 vs $444) | — | **UNPRICED — and this is the largest pricing gap in the audit.** One agent priced Vercel; nobody shopped it |

## 4.1 "Stay and fix", costed — the row nobody built

| Work | Days | Fixes weakness |
|---|---|---|
| The safety batch (2 indexes, FK index, `p_ip`, grants, `tel` unique, FK RESTRICT) | 1 | 2, 6, 10, 13 |
| E1 + E3 on scratch before shipping any of it | 0.5 | delivery safety |
| Per-gym JSONL nightly export + weekly schema dump + one timed restore drill | 3 | 1 |
| `anular_venta` + `fusionar_clientes` RPCs + suites | 5–8 | 4, 5 |
| `invitar_operador` + staff panel + admin reset link | 2–3 | 3 |
| `alta_gimnasio` RPC + wire `token_overrides` to the DB | 4–6 | 11 |
| Email: split key, per-tenant subdomains, suppression table | 1.5 | 7 |
| Observability minimum (error tracker, uptime, cache-hit read, archiver alert) | 1–2 | 8 |
| 4 × `.eq("user_id")` + policy merge + gym-scope guard test | 1–2 | 9 |
| Region pin + `vercel.json` + proxy lookup collapse | 0.5 | 12 |
| `test:denial` in CI against the existing scratch project | 1–2 | 14 |
| Front-desk retry/optimistic-write pass + required email on NUEVO | 3–5 | 16 |
| **TOTAL** | **~23–35 engineer-days** | |

At $100/hr opportunity cost: **$18,000–28,000 one-time.** The cheapest exit (AWS self-hosted OSS) is 150–300 hours =
$15,000–30,000 — **and afterwards you still have to do most of the list above.** That is the whole answer to "should we
switch."

---

# 5. STRUCTURAL VERDICT

Every "keep" below ships a named condition under which you leave. A keep with no exit trigger is an unfalsifiable opinion.

## 5.1 Tenancy model — shared tables + `gym_id` discriminator + RLS · **KEEP**

**Why.** One migration target: 87 migrations, one execution, one denial-suite run. Schema-per-tenant costs 3,000× and is
additionally blocked on Supabase specifically by PostgREST's schema cache (*"Requests will wait until the schema cache
reload is done"* — so every gym onboarding would stall all 3,000 tenants while a half-million-relation cache rebuilds) and
by lock-table exhaustion (`max_locks_per_transaction 64 × max_connections 60` = 3,840 slots ≈ **960 schemas** before
atomic all-tenant DDL fails). Database-per-tenant is dead on a line nobody models: **per-project PITR at $100/mo × 3,000 =
$300,000/month, 10× the raw compute.** Cost eliminates C and does not distinguish A, B, D or E. The industry converges
here (Citus rates row-based sharding to 1M+; Notion runs A-inside-D).

**This is not a rubber stamp.** A wins on migration ergonomics and cost, and loses on per-tenant restore, noisy neighbour,
blast radius and graceful degradation — **four of eight axes.** It wins because the two it wins are the ones you touch
daily and the four it loses are the ones you touch during incidents.

**LEAVE FOR SHARDED PODS (model D) WHEN:**
- `.eq("gym_id")` coverage is **< 95%** of non-test `.from()` call sites at the end of the next release cycle, or any new
  `.from()` lands without it → the convention has failed as a convention. *(Today: 32.8%.)*
- `pg_database_size()` exceeds `effective_cache_size` on the largest compute rung you are willing to buy. *(On a 4XL that
  is ~16 GB ⇒ ~340–520 gyms with one year retained; on 16XL ~64 GB ⇒ ~1,370–2,090.)*
- A customer contract demands a written per-tenant RPO/RTO, or one tenant exceeds 2% of platform rows.
- Any cross-gym FK reference appears (today: 0 across 13 edges) → the per-tenant restore path is broken.

**Cheapest insurance, today:** add `gym.pod_id` and have `resolveTenant` return it while every value is `1`. One afternoon,
and it converts a future rewrite into a routing change.

## 5.2 Authorization in RLS · **KEEP (RLS as the boundary, `.eq()` as the accelerator)**

**Why, and it is not aesthetic.** Fifteen-plus DAL write statements carry **no tenant predicate at all** —
`facilities.ts:71,83,96`, `about-values.ts:71,83,96`, `faqs.ts:68,80,93`, `stats.ts:65,77,90`, `coach.ts:113,132,144`,
`class-type.ts:145,208,218`, `mensajes.ts:49` are all `.update(…).eq("id", …)`. Five RPCs do the same
(`cancel_class_session`: `update class_session set cancelled_at = now() where id = p_session_id` — **no gym predicate
anywhere in the statement**). The *only* thing stopping an operator of gym A from cancelling gym B's class is
`class_session_staff_update USING ((SELECT is_staff_of(gym_id)))`. Under a service-layer model every one of those is a
cross-tenant write hole on day one, permanently one code-review miss away — in a repo where agents write code. And RLS
costs **~17 µs per statement** on the read path. Option (B) is a redesign priced at a rounding error.

Also decisive: `grep` confirms **the only `service_role` client in the entire repo is
`supabase/functions/activar-cuenta/index.ts:36`.** Neither Next app holds one. That containment is the single most common
way this architecture goes catastrophically wrong, and it has been avoided.

**LEAVE WHEN:**
- RLS-helper time (`is_staff_of` / `has_role` / `is_member_of`) exceeds **15% of total DB exec time at p95**, or any single
  statement's `gym_membership`-derived predicate exceeds **25 ms**. *(Today: ~0% and ~0.15 ms.)*
- A `service_role` client is ever needed in either Next app for any unrelated reason → the boundary is gone anyway and the
  calculus changes immediately.

**Two fixes that are not exits.** (1) `ALTER FUNCTION public.is_staff_of(uuid) COST <n>` — the planner currently models it
at cost **0.26** against a measured **14.5 µs**, which is *mechanically why* it chooses plans that call it a million
times. Nobody has pulled this lever. (2) **0 of 101 policies are RESTRICTIVE**, so every policy composes with `OR` and any
future policy can only widen access, never narrow it. There is no deny-by-default floor a mistake can hit.

## 5.3 Data model · **KEEP the shape, FIX the lifecycle**

**Keep:** `gym_id` denormalised onto all 28 tenant tables `NOT NULL` + FK (every RLS predicate is a single-column
comparison, no join in the security barrier — this is why pods stay cheap to reach later). Per-gym roster rows with
per-gym consent stamps (legally correct under LFPDPPP where each gym is a separate *responsable*; a global `person` table
would put one human's PII under 3,000 controllers and is strictly worse). Two membership concepts (`gym_membership` = authz,
`clientes` = roster/money) — the separation is clean. Snapshot columns on `ventas` (**verified not drifting**: forge's
`Ilimitado` shows 11 sales at 1350 and 5 at 1349 while the catalog now reads 1349). `next_folio` as a counter row, not a
sequence. Balance replay reconciles **exactly** (4 sales replayed by hand → `vence` 2026-09-03 and 26 classes, both
matching live).

**Fix, in this order:** `UNIQUE (gym_id, tel)` (expires); `anular_venta` + `anulada_at`/`anula_venta_id`;
`ON DELETE RESTRICT` on `ventas_cliente_id_fkey`; `clientes.archived_at`; `ventas.paquete_id` + `regla_version`;
composite `(gym_id, id)` uniques + composite FKs on the 13 intra-tenant edges.

**LEAVE the "keep both membership concepts" decision WHEN** either of these goes non-zero (both measured at 0 today):
```sql
select count(*) from clientes c where c.auth_user_id is not null
  and not exists (select 1 from gym_membership m where m.user_id=c.auth_user_id and m.gym_id=c.gym_id);
select count(*) from gym_membership m where m.role='member'
  and not exists (select 1 from clientes c where c.auth_user_id=m.user_id and c.gym_id=m.gym_id);
```
**LEAVE `staff_gym()`'s `limit 1` WHEN** any user holds `role in ('owner','operator')` at more than one gym (today: 0).
**LEAVE the per-gym roster row WHEN** any `auth_user_id` holds `clientes` rows in 2+ gyms (today: 0 — but 4 *emails*
already do; the powder is loaded).
**The "text snapshot is enough" trigger has already fired:** 3 ambiguous `paquete_nombre` labels across 2 gyms at 175 sales.

## 5.4 API design — 38 RPCs over PostgREST · **KEEP**

**Why.** Atomicity is real where it matters: `registrar_venta` holds a `for update` row lock and an idempotency key;
`reservar_clase` and `pasar_lista_sesion` each take a `pg_advisory` lock. A Node service layer would need a distributed
lock to earn the same guarantee. The DAL seam is airtight — all 34 `.rpc(` call sites are inside
`packages/data/src/server/*.ts`, zero in `apps/*`, zero in a browser bundle. `set search_path=''` on **all 38** functions,
no exceptions. And write RPCs are **1.37% of PostgREST calls but 41.5% of PostgREST DB time** (51× the per-call cost) —
which is the currency that matters, and it is currently fine: at today's 16 ms mean hold, pool exhaustion is at 23,100
gyms (P=10) or 55,500 (P=24).

**LEAVE (or rather: version the front door) WHEN** — and this has **already fired** — a signature roll is executed with
more than one revenue-generating tenant live. The comment `-- Accepted for a solo deploy` at
`20260714110000_registrar_venta_backdate.sql:14` is already false. The next roll must ship behind a versioned front door:
a single-`jsonb`-arg RPC per writer so the arg list never changes again, or an `api_v2` schema selected by `Accept-Profile`.

**Secondary triggers:** `pg_stat_statements_info.dealloc > 0` (today 0; **~31 more days of development at the observed
rate** before eviction starts silently deleting the rare-and-slow variants you would need); any write RPC's
`mean_exec_time > 150 ms`; any PGRST003 in the logs; **any second contributor with commit rights** — at which point
`test:denial` must be in CI that same week.

## 5.5 Runtime — server-side everything, one deployment per app, host resolution · **KEEP the shape, FIX the config**

**Why.** Connection exhaustion — the most-feared serverless failure mode — is **structurally impossible** here, and this is
measured, not assumed: `pg_stat_activity` shows PostgREST connecting from `::1/128` (it runs *on* the database host), and
the repo contains no Postgres driver at all, only `@supabase/supabase-js` and `@supabase/ssr` over HTTP. Asymmetric JWTs
are live (`/auth/v1/.well-known/jwks.json` returns a non-empty ES256 key), so `getClaims()` verifies locally against a
cached JWKS instead of firing a GoTrue round trip on every navigation — **this is the single best runtime decision in the
stack and it is load-bearing**: without it the refresh ceiling would already be breached at ~50 gyms. Three expensive
meters are literally zero. Vercel is 0.3–1.6% of revenue.

**LEAVE / ACT WHEN:**
- Instrumented `server-timing` shows the DAL leg of a member render exceeds **150 ms of pure network wait** → the region
  placement costs more than every other runtime item combined, and must be fixed before any other runtime work is funded.
- **Any GoTrue 429 appears in the logs at any rate** → the shared-egress-IP budgets (BP-A/B/C) are live and auth must move
  to the browser. *(`/auth/v1/token` is 1,800/hr **per IP**, `/auth/v1/verify` 360/hr per IP, and every auth call in this
  product fires from a Vercel function, so "per IP" means "per Vercel shared NAT IP, across all 3,000 gyms." The paid fix
  is a trap: Static IPs at $100/mo route everything through an IP **pair** — a hard ~107-gym ceiling — and explicitly do
  not cover middleware, which is where the refresh happens.)*
- Gym count > **400** → the `resolveTenant` cache (`CACHE_MAX_ENTRIES = 500`, FIFO not LRU, **per isolate**) starts
  evicting live entries; each miss costs 2 sequential cross-region round trips.
- Anyone disables JWT signing keys or reverts to the legacy HS256 secret → treat this as a production invariant and put it
  in an ADR.
- Brazil exceeds 25% of traffic → `gru1` prices Fast Origin Transfer at **6.83×** iad1 ($0.41 vs $0.06/GB), roughly
  doubling the Vercel bill for the same volume.

**And keep zero-Realtime for now** — it is the right call at 4 gyms and keeps three meters at $0. **When it flips, the
decision that matters is channel granularity, decided before the first `.channel()` call**: per-`class_session` costs
~$270/mo at 3,000 gyms; per-gym costs **~$1,700/mo** — more than the entire Vercel bill. Write that constraint down now,
while it costs nothing.

---

# 6. MIGRATION-TRIGGER TABLE

The single most useful artifact for a founder who has just been told to keep most of what he has. **The "Emits it today?"
column is the finding**: 14 of 22 rows have nothing behind them.

| Component | Observable metric | Threshold → act | Where to read it | Emits it today? |
|---|---|---|---|---|
| **`ventas` index** | `shared_blks_hit / calls` for `mi_membresia` | **> 100 blocks/call** → ship the index (already true) | `pg_stat_statements` | ✅ yes |
| **`gym_membership` scan** | `resolverMiembroGym`'s plan | any `Seq Scan` after the `.eq("user_id")` fix → the fix failed | `EXPLAIN` the predicate | ✅ yes (manual) |
| **Gym scoping convention** | `.eq("gym_id")` ÷ non-test `.from()` in `packages/data/src/server` | **< 95%** at end of a release cycle → guard test or move to pods | a guard test you must write | ❌ **no guard exists** |
| **Unscoped scan load** | `seq_tup_read` summed weekly on `class_session`, `asistencias`, `reservation`, `clientes`, `ventas` | **> 10⁹/week** → fix the call sites within one cycle | `pg_stat_user_tables` | ✅ yes (manual) |
| **Tenancy model** | `pg_database_size()` vs `effective_cache_size` on the largest rung you'll buy | **used > cache** → move to sharded pods | `pg_database_size()` | ✅ yes (manual) |
| **Compute rung** | `blks_hit / (blks_hit + blks_read)` | **< 99%** → the 2XL assumption is being falsified; re-size before the invoice tells you | `pg_stat_database`, monthly | ✅ yes (manual) |
| **PostgREST pool** | max `mean_exec_time` across write RPCs | **> 150 ms**, or any PGRST003 → move the money path off the shared pool | `pg_stat_statements` / Vercel logs | ⚠️ partial (no log alerting) |
| **`pg_stat_statements` capacity** | `dealloc` | **> 0** → you are silently losing the evidence you need | `pg_stat_statements_info` | ✅ yes (manual) |
| **Disk** | provisioned GB; and `pg_database_size()` ÷ provisioned | **> 400 GB** (= $50/mo); **> 85%** → catch a write storm before the 95% read-only wall | Supabase usage dashboard | ⚠️ dashboard only, no alert |
| **MAU** | `count(*) from auth.users where last_sign_in_at > now() - interval '30 days'` | **> 80,000** (80% of included) → the MAU line wakes up | live SQL | ✅ yes (manual) |
| **Egress** | monthly uncached GB | **> 200 GB** (80% of 250) | Supabase usage dashboard | ⚠️ dashboard only |
| **Storage stops being $0** | any `storage.from(` call site ships | first hit → re-price | `grep` in CI | ❌ no CI check |
| **Realtime stops being $0** | any `.channel(` / `postgres_changes` ships | first hit → **decide channel granularity before the first call**; per-gym is 6× per-session | `grep` in CI | ❌ no CI check |
| **Email volume** | Resend monthly sends; daily sends | **> 80% of plan**; **> 3,000/day** → dedicated IP becomes mandatory by Resend's own threshold | Resend dashboard | ❌ no alerting |
| **Email reputation** | bounce %, complaint % over the rolling window | **bounce > 2%** or **complaint > 0.04%** (half of Resend's 4% / 0.08% limits) → suppression list + per-tenant subdomains **now** | Resend dashboard | ❌ **nothing watches this, and the consequence is account-wide suspension without warning** |
| **Auth rate limits** | GoTrue 429 count | **any 429 at all** → BP-A/B/C are live; move auth to the browser | Supabase auth logs | ❌ **no 429 instrumentation anywhere in the repo** |
| **Region cost** | `server-timing` on the DAL leg of a member render | **> 150 ms of pure network wait** → pin the region before funding any other runtime work | a header you must add | ❌ **not instrumented** |
| **Tenant cache** | gym count; p95 TTFB on a mapped host | **> 400 gyms**, or **p95 > 400 ms** → raise `CACHE_MAX_ENTRIES`, FIFO→LRU, or Edge Config | Vercel analytics | ❌ nobody can see the hit rate |
| **Vercel cost model** | page views/gym/month | **≠ 7,000 ± 30%** → the whole cost curve moves ±60% | Vercel Web Analytics, one sampled month | ❌ **not enabled** |
| **Support load** | founder-hours/month on support, time-tracked | **> 60 h/mo** (≈50 gyms) → ship `anular_venta` + `fusionar_clientes` now, before you hire to do work a 5-day RPC deletes | a timer | ❌ not tracked |
| **Support mix** | tickets needing production SQL ÷ total tickets | **> 20%** → freeze feature work until both surgeries are RPCs | a ticket system | ❌ **no ticket system** |
| **Operator role** | `count(*) from gym_membership where role='operator'` | **still 0 at gym #10** → ship `invitar_operador`; every gym past #10 runs on a shared credential with no revocation story | live SQL | ✅ yes (manual) |
| **Activation** | activated ÷ roster at the most mature real gym | **< 25% at 90 days live** → the client app is not the product; fix email capture at point of sale or reprice as a desk tool *(today: **0% at 26 days**)* | live SQL | ✅ yes (manual) |
| **Provisioning rate** | median founder-minutes to provision one gym (3-gym rolling) | **> 60 min at gym #15** → build `alta_gimnasio` + wire `token_overrides` | a stopwatch | ❌ not timed |
| **Bus factor** | humans with production SQL access | **still 1 at gym #50** → a two-week absence is a business-ending event | you know | ✅ |
| **Restore capability** | rehearsed restores into scratch | **0 at any gym count > 5** → do one; it also settles two owner-input questions | you know | ✅ |

---

# 7. DISSENT LOG

## 7.1 Settled

| # | Dispute | Positions | How it was settled | Ruling |
|---|---|---|---|---|
| D1 | **Free or Pro?** | `price-compute`, `red-team`: Free/Nano (from `effective_cache_size` 384 MB ÷ 0.75 ≈ 512 MB RAM, plus two 402-branching citations). `verify-math`, `price-gotcha`: Pro | Orchestrator R1: `pg_stat_statements` holds **60 `pg_backup_start` + 60 `pg_backup_stop`** over a 59.43-day uptime = one physical base backup/day. Free provides none | **PAID.** red-team's Nano inference and verify-plan-tier are refuted; the "500 MB read-only wall / no backups / 7-day pause" branch is **deleted**. Residual: Pro-vs-Team, and whether PITR is purchased |
| D2 | **Which ceiling arrives first?** | Five agents, five different numbers: 10–32 gyms, 33, 53, 65–330, 167, 315, 692 | Referee: it is **one curve read at five points on two dials nobody declared** — activation `α` and fleet tenure `Y` | **Email is first** (12–25 gyms, and activation-independent, which is why it's first at 4.3% *and* at 60%). Then `ventas` below α ≈ 9–29%, `gym_membership` above. Production is at α = 4.3%, so `ventas` is first today by ~6×; the day α passes ~15% the ordering flips |
| D3 | **The 282 MB/s scan constant** | `model-tiers` called it "the single most load-bearing number in this document" | Referee re-derived it two-point differenced (cancels fixed overhead): **72.0 ns/tuple = 3,250 MB/s warm**. `ventas` heap is 5 pages, so ≥98% of model-tiers' 292 blocks/call were plpgsql frame + index scan + PostgREST wrapper — all constant in G | **REFUTED, 11.5× too low.** model-tiers' "+1 s at 167 gyms" lands near the truth **by luck** — 282 MB/s sits between the warm and cold rates, so the error cancelled |
| D4 | **Buffer eviction at 118 gyms** | `red-breakfirst`: "`ventas` heap exceeds `shared_buffers` ⇒ the scan evicts every other tenant's pages" | PostgreSQL 17 `heapam.c initscan()`: `BAS_BULKREAD` fires at `rs_nblocks > NBuffers/4` = 56 MB ≈ **30 gyms**, and the buffer README says the ring exists *precisely so a large scan does not blow out the cache* | **HALF RIGHT.** The refutation of 282 MB/s was correct and valuable. The replacement threshold (4× too late) and the harm (cache blowout — the one thing Postgres's design prevents) are both wrong |
| D5 | **Per-tenant export coverage** | Workflow 1 summary: "0 of 28 tables". `red-blastradius`: "4 of 29" | Both are true of different halves. `arch-tenancy`'s *detail* row said 4 tables; its *summary* line said the **reimport** is 0 of 28 | **Export 4/29. Import 0/29.** The compression, not the finding, was wrong |
| D6 | **`.eq("gym_id")` coverage** | `arch-tenancy` 40/118 = 34%; `red-team` 40/122 = 32.8% | Referee re-grepped: **122** call sites | **red-team.** But *both* files mis-frame it: this is a **performance** metric, not a security one — migration `20260714080000` put the gym scope in every plan as a filter, so a missing `.eq()` costs a scan, not a leak |
| D7 | **MAU cost at 3,000 gyms** | $0 · $0–465 · $0–559 · $845–1,430 | Same formula at four different φ | **All correct.** Report it as a formula, never a number: `max(0, G·(M·φ + s) − 100,000) × $0.00325`. $0 until φ ≈ 14%. **And "swap the auth provider to cut MAU" saves nothing** — Third-Party MAU bills at the identical rate and quota |
| D8 | **`gym_membership`: "a medium" or "the hardest ceiling"?** | `arch-tenancy` measured 0.69–0.72 ms (true, of a **9-row** table). `arch-authz` modelled G × m rows | Same finding at two points on a slope; the slope is 14.5 µs/row | **Both.** "A medium" describes production *today*; "hardest ceiling" describes production *next year*. The fix is 4 lines with zero DDL, so the dispute has no decision attached |
| D9 | **`resolveTenant` cache thrashes at 143 gyms** | prior audit | `hostCache` and `slugCache` are **separate** 500-entry maps | **500 gyms per isolate** — and the *per-isolate* property matters more than the constant |
| D10 | **Realtime's expensive meter** | prior audit named peak connections | Connections ≈ $85/mo at 3,000 gyms; **messages** are $183 (per-session) to $1,613 (per-gym) | **Messages, 2–19×.** Channel granularity is the whole decision |
| D11 | **Vercel's bill** | $270–560 · $600–850 · $809 | All rates verified correct; all *volumes* modelled from one measured anchor | **±5× band, $150–$3,000.** "Vercel is 1.8× Supabase" does not survive it. What survives: **Edge Requests is the single largest meter in the stack, and one of 36 agents priced it** |
| D12 | **ADR-0013's RLS claim** | The session brief and a memory item both say ADR-0013 asserts O(1)-per-statement and forbids changing it | The ADR **self-corrected in place on 2026-07-13** and the fix shipped as `20260714080000_rls_uncorrelated_predicates.sql`; §2 is now titled *"corrected: it is per-ROW, not per-statement"* and the "never unwrap" instruction is explicitly retracted | **The brief and the memory item are STALE and now actively harmful** — an agent acting on them would go looking for a fix that is already in production and could revert a migration worth 42 ms → 3 ms on a 5,000-row statement. **Retire the memory item.** |
| D13 | **"34 public functions"** (`AGENTS.md`, and the `denial-suite.ts` docstring that claims it is "verified against the live catalog… no drift") | | Live: **38 / 25 writers / 13 readers**. The machine guard is unaffected (it derives), but the prose has been wrong since ~2026-07-14 | **38.** Fix the docstring — it is used as a coverage denominator by readers |

## 7.2 Unsettled — and what each one costs you

| Open question | Why it is open | What it moves | How to close |
|---|---|---|---|
| **Pro or Team?** | R1 proves *paid*, not *which* | Team is +$574/mo and raises **zero** meter limits — only SOC2/ISO/audit logs/28-day retention/an SLA | Dashboard → Billing, 1 min |
| **Is PITR actually purchased?** | Not readable from SQL | RPO ≤24 h vs ≤2 min | **Strong prior: NO.** Supabase's backups guide: *"Projects that want to use PITR must also use at least a Small compute add-on."* Small carries 90 direct connections. **Live `max_connections = 60`** [verified at write time] = Micro/Nano class. Confirm in the dashboard |
| **Spend Cap ON or OFF?** | A checkbox nobody has read | **Re-classifies six rows across two agents' tables.** With the cap ON, disk/MAU/egress overages are not bills — they are **hard walls**: MAU > 100,000 = new logins disallowed platform-wide; disk over provisioned = writes disallowed; egress > 250 GB = reads disallowed. It also changes the §2 attack from "a bill ratchet" to "read-only until next billing cycle" | Dashboard → Organization → Billing, 30 s |
| **`/auth/v1/otp` configured limit** | Dashboard-only, and **Supabase's own two doc pages contradict each other on the default (30/hr vs 360/hr)** — reproduced independently by two agents today. This is a vendor documentation defect, unresolvable from outside | If still 30/hr **project-wide**, the entire platform can send 30 magic links per hour regardless of gym count — and magic link is a live activation rail | Dashboard → Auth → Rate Limits, 30 s |
| **The regime-2 scan rate (~1,000 MB/s)** | Modelled; the softest load-bearing number in the report | Moves ceiling #7 between **~30 and ~170 gyms** | Seed the scratch project to 500 gyms and re-run the three probes (E2) |
| **PostgREST `db-pool` size** | Not published per tier | Every connection-ceiling number in four files | Dashboard → Settings → API, 30 s |
| **Vercel function region / Fluid / plan** | No dashboard access | $10–150/mo swing on how `proxy.ts` bills, and whether the cross-continent hop is real | Vercel → project → Functions, 2 min |
| **Does the policy merge actually restore the index?** | `verify-math` proved the OR *breaks* it and explicitly did **not** prove the fix works, warning `is_staff_of` may need rewriting as an inlinable predicate first | This is a **named top recommendation and it is unproven** | E1 on scratch, 30 min |
| **Does prod's schema match the repo, object by object?** | Ledgers diverge 65/87; grants are *known* to differ | You cannot safely ship DDL to a schema you have not diffed | E3 on scratch, 2–3 h |

---

# 8. CONFIDENCE AND MEASUREMENT GAPS

## 8.1 What was re-verified at write time (2026-07-28), directly against prod

```
max_connections                       : 60            → Micro/Nano class → PITR cannot be enabled
shared_buffers                        : 28,672 × 8kB  = 224 MB
ventas indexes leading on cliente_id  : 0             → weakness #6 still open
clientes indexes leading on auth_user_id : 0          → weakness #6 still open
anon-EXECUTE public functions         : 7             → 5 of them write-bearing, weakness #10 still open
public tables with anon TRUNCATE      : 29 of 29      → weakness #10 still open
enviar_mensaje_contacto               : p_ip present, "p_ip is not null" guard present, anon EXECUTE true
                                                      → weakness #2 STILL LIVE
gyms / clientes / activated / db size : 4 / 116 / 5 / 15 MB
```

## 8.2 Measured / modelled / asserted, by claim class

| Claim class | Status | Notes |
|---|---|---|
| All vendor rates (Supabase, Vercel, Resend, SES, AWS, Neon, Fly, Railway, Firestore, Convex, Appwrite, Nhost, Clerk, WorkOS, Auth0, Zitadel) | **measured** | Every one fetched 2026-07-27/28 with the URL named. Two exceptions flagged in-line: SendGrid above 100k/mo (sales-gated, unfetchable) and every Enterprise figure (Contact Us) |
| Query plans, policy census, grant surface, FK topology, function bodies, row counts, row widths | **measured** | Live prod, read-only, this session |
| `is_staff_of` = 14.5 µs/call; warm seq-scan = 72 ns/tuple; OR-order penalty = 58× | **measured**, four independent probes within ±15% | On **one** instance (2-shared-core ARM, Micro), fully cached. Every threshold scales linearly with these |
| Every gym-count threshold in this report | **modelled**, ±2× | Extrapolated from a 4-gym, 15 MB database with a 99.996% cache-hit rate. **Every projection is into a regime this database has never entered** |
| The $400 compute rung at 3,000 gyms | **ASSERTED** | Two agents agreed to the cent, which is corroboration of arithmetic, not of the assumption. It moves the Supabase total ±34% on a one-rung error. **No way to measure from a read-only session** |
| 7,000 page views/gym/month | **modelled**, and the rank-1 sensitivity | ±2× moves the whole cost curve ±60%. Observable today for $0 |
| 2.0 support tickets/gym/month, 1.0 h per SQL-surgery ticket | **modelled**, ±3× | Zero real ticket data exists. The *structural* claim under it — that half the tickets are irreducible DB surgery — is measured and does not move |
| $18–35/ticket support cost | measured rate, **US-anchored** | LatAm BPO could be $5–8, dropping 210–408%-of-revenue to ~35–70%. **Nobody fetched a LatAm rate.** Single most load-bearing unverified number in the business case |
| 20–25%/yr gym (logo) churn | **ASSERTED** | Borrowed from a *member*-churn figure. B2B logo churn is typically far lower. The zombie-tenant *mechanism* is measured; the *rate* is a guess |
| The §2 attack throughput | **modelled** | The bypass is certain (read from the function body); the request rate is not — Supabase may impose an undocumented gateway limit on `/rest/v1/rpc/*`. No agent sent a single HTTP request |
| Every migration-hour estimate in §4 | **ASSERTED** | Derived from call-site counts and structural complexity. Nobody has performed one of these migrations, and no historical PR duration was pulled from this repo's own comparable refactors |

## 8.3 The experiments that would settle it — all on the existing scratch project `gyyujeguycxxoaqgdnjp`

The scratch project already exists (77 migrations applied, writes allowed, credentials in `docs/db-testing-throwaway-project`).
**It sat idle for this entire audit while at least seven agents independently wrote "the honest way to settle this is to seed
the scratch project, and I could not."** That one provisioning decision is why every scale number in this report is soft.

| # | Question it closes | Experiment | Cost | Gates a recommendation? |
|---|---|---|---|---|
| **E1** | Does merging the two permissive SELECT policies actually restore the index? | Apply the merged policy on scratch, `EXPLAIN` the same query, confirm `Index Scan` | **30 min** | **YES — this is a named top recommendation and it is unproven** |
| **E3** | Does prod's schema match the repo, object by object? | Replay all migrations onto scratch, `pg_dump --schema-only`, diff against a prod schema dump | **2–3 h** | **YES — you cannot safely ship §Do-This-First's DDL to a schema you have not diffed** |
| **E2** | Every gym-count threshold in this report | Seed scratch to 500 gyms × 200 members, re-run the `arch-authz` Q1/Q2/Q3 probe set and the three regime probes | **6–10 h** | No — but nothing quantitative here is decision-grade until it runs |
| **E4** | RTO/RPO | Timed restore drill into scratch | **2–4 h** | No, but it is the only number that matters in a disaster, and it settles the PITR question at the same time |
| **E5** | `registrar_venta`'s duplicate-guard race; `gym_folio_counter` contention | pgbench concurrent RPC calls on scratch | **1–2 h** | No |
| **E6** | The write path — measured at **1.6×–8.5× the mean latency** and 1.4×–4.1× the block traffic of the read the entire compute model is anchored on | Fold write-RPC constants into the compute model | **2 h** | No, but the direction of the error is known: **every compute ceiling here arrives *earlier* than published** |

**E1 + E3 + the eight dashboard clicks together cost under four hours and would upgrade more of this audit than any
additional agent.** Do E1 and E3 **before** shipping the safety batch.

---

# 9. OWNER-INPUT LIST

Ranked by value per minute. None of these is readable from SQL.

| # | Question | Where to click | Time | Why it matters |
|---|---|---|---|---|
| **1** | **Is the Spend Cap ON or OFF?** | Dashboard → Organization → Billing | **30 s** | Decides whether disk / MAU / egress overages are **bills** or **platform-wide outages**, and re-classifies six rows across two agents' cost tables. With the cap ON, the §2 attack does not ratchet a bill — it turns the platform read-only until the next billing cycle |
| **2** | **Pro or Team?** | same page | **1 min** | R1 proves *paid*, not *which*. Team is **+$574/mo and raises zero meter limits** — it buys SOC 2 Type II, ISO 27001, PrivateLink, platform audit logs, 28-day retention, and an SLA whose Urgent commitment is 24 h. Note: **Pro carries no support SLA at all** (*"Support Service Level Agreements are available to Teams and Enterprise customers"*), and **no tier below Enterprise carries an uptime SLA** |
| **3** | **Is PITR actually purchased, and is Daily Backups listed as present?** | Dashboard → Database → Backups | **30 s** | Decides RPO ≤24 h vs ≤2 min. **Strong prior: NO** — PITR requires ≥Small compute, and live `max_connections = 60` is Micro/Nano class. If you buy it, budget **$100/mo PITR + ~$15/mo Small compute**, and know that **enabling PITR turns off Daily Backups** (it replaces them) and that **PITR is not covered by the Spend Cap** |
| **4** | **What is the provisioned disk size today?** | Dashboard → Settings → Database | **30 s** | Sets the §2 attack terminus. If it has already autoscaled, the terminus moves |
| **5** | **What is the Resend plan — Free or Pro?** | Resend → Settings → Billing | **30 s** | The whole 12–25-gym band, and whether the 100/day hard cap is live. The repo's last record (`2026-07-22-email-infrastructure-investigation.md:69`) says Free; the API key is send-only restricted and cannot read billing |
| **6** | **What is `/auth/v1/otp`'s configured rate limit?** | Dashboard → Auth → Rate Limits | **30 s** | If still at the documented 30/hour **project-wide**, the whole platform can send 30 magic links per hour forever, regardless of gym count — and magic link is one of two live activation rails. *(Supabase's own two doc pages contradict each other on the default: 30/hr vs 360/hr. Both re-fetched today, both current. This is a vendor documentation defect.)* |
| **7** | **Vercel: function region, Fluid compute on/off, plan** | Vercel → project → Settings → Functions | **2 min** | Decides whether the iad1↔us-west-2 hop is real (it is, by header measurement) and whether `proxy.ts` bills as Edge Request CPU Duration ($0.30/hr over 10 ms) or as Invocations + Active CPU + Provisioned Memory. $10–150/mo swing |
| **8** | **PostgREST `db-pool` size** | Dashboard → Settings → API | **30 s** | Every connection-ceiling number in four agent files. At P=10 the pool exhausts at 23,100 gyms; the number matters only once write-RPC hold time reaches ~500 ms, which is the live direction of travel |
| **9** | **Sample one month of Vercel Web Analytics on the 4 live gyms — then turn it off.** | Vercel → Analytics toggle | **1 month, $0** | Page views per gym per month is the single largest uncertainty in the entire cost model (±5× on the biggest vendor line, ±60% on the total). **Do not leave it on** — at 21M page views/month it would cost $630/mo itself at $0.03/1K events |
| **10** | **Does a record exist, anywhere outside the repo, of which gyms have paid?** | your own files | **—** | The product has no representation of it (§weakness 15). If a spreadsheet exists, that finding is "no *product* surface"; if it doesn't, it is "no visibility at all" |

---

# 10. COMPLIANCE

**Framing that governs all three regions:** the intended posture — gym = controller/*responsable*, RED = processor/*encargado*
— **does not survive contact with this codebase.** Every deletion, retention and consent decision is hard-coded once for all
tenants; a gym cannot write its own privacy notice, name its own DPO, or set its own retention period. RED chose the
sub-processor (Supabase → AWS us-west-2), the schema, the security controls and the consent mechanism. Under ANPD-style
reasoning the test is *who determines the means*, not the contract label. **RED is functionally a joint controller for every
tenant, whatever a ToS says — which makes this RED's compliance problem once, at platform scale, not one gym's problem
3,000 times.**

## 10.1 Mexico (primary market) — LFPDPPP

**Current state of the law (do not use pre-2025 memory):** the LFPDPPP was **republished in the DOF 20 March 2025, effective
21 March 2025**, repealing the 2010 law. **INAI formally disappeared 9 May 2025**; private-sector data-protection functions
transferred to the **Secretaría Anticorrupción y Buen Gobierno (SABG)**. The **implementing reglamento is still not
published** — so the *duties* exist now while the *procedural detail* (how to file with SABG, breach report format) is
administratively unsettled. Do not read "no reglamento yet" as "no obligation yet."

| # | Gap | Evidence | Fix |
|---|---|---|---|
| 1 | **The product promises `cancelación` and structurally cannot deliver it** | `apps/client/src/app/legal/page.tsx:78-82` tells every member *"Puedes acceder, rectificar o cancelar tus datos."* Live `pg_policies`: **zero DELETE policies** on `clientes`, `ventas`, `asistencias`. The only cascade that exists would delete the fiscal ledger rather than anonymise it | An anonymisation RPC (null the PII columns on `clientes`, retain the numeric ledger facts) reachable inside the 20 + 10 + 15-day statutory window. Until it ships, **rewrite the aviso text to match what is actually offered** |
| 2 | **The aviso de privacidad fails Art. 15's baseline content test for every tenant** | One static, brand-neutral block ("el estudio") with **no gym legal name, address or RFC** — despite `gym_contact.address_line` existing and being populated per gym, and `resolveBrand()` being used elsewhere in the same app | Interpolate `gym_contact` + a legal-name field. Small, well-scoped, and the data is mostly already there |
| 3 | **95.7% of the live roster has never been shown a notice or recorded any consent** | Live: **111 of 116 `clientes` rows have `terms_accepted_at IS NULL`.** The stamps are written only inside the self-activation RPC family; the **staff/checkout path — which produced 111 of 116 rows — never touches them** | Either capture consent at staff entry, or document the exception you are relying on (contractual necessity / tacit consent for face-to-face non-sensitive data). Today it is neither designed nor documented — just absent |
| 4 | **No encargado instrument exists between RED and any gym** | Repo-wide grep for `encargado\|DPA\|processor agreement\|LFPDPPP` → zero product/legal docs. This is also the precondition the lawful-international-transfer analysis depends on: LFPDPPP does not bar US hosting, it requires the transfer be **formalized** and the receiver provide **protección equivalente** — paper you do not have | A standard encargado contract (scope, instructions, security measures, data return/destruction on termination), executed before the next gym onboards. Also: request Supabase's own DPA and check it for LFPDPPP-equivalence terms |
| 5 | **The contact form collects PII with no notice at the point of collection** | `contacto-form.tsx` has no `/legal` link and no consent checkbox; the only control present is Turnstile, which is unrelated | One line. Cheapest fix in the list — but fix #2 first, so the page is worth linking to |

**Good news, checked not assumed:** RED does **not** structurally collect *datos sensibles* — `clientes` and `asistencias`
have no health/injury/medical/emergency-contact/biometric field, and attendance timestamps are ordinary personal data.
**But** the terms text at `legal/page.tsx:58-59` already tells members to *"informar al estudio de cualquier condición de
salud relevante"* — a contractual invitation to submit sensitive data that the schema has nowhere to put. The day someone
adds a free-text `notas` field, it becomes datos sensibles with zero of the extra-consent, restricted-access machinery the
law requires. **Designed-in landmine, not a present violation.**

## 10.2 Brazil — LGPD

**Read this section as "when Brazil is real," not "act on this now" — because `apps/client/src/app/layout.tsx:74` hardcodes
`lang="es-MX"` and there is no translation framework in any `package.json`. The application cannot linguistically serve the
market these findings are about, and the i18n build is unpriced.**

Ranked: (1) **there is no deletion capability at all** — Art. 18 VI cannot be honoured on request #1, at any scale, and
Art. 16's retention exceptions require an *articulated* policy that does not exist anywhere. (2) **No portability
mechanism scoped to a data subject** — `respaldo` is a gym-operator report by design and would need both a per-subject
filter and a rewrite from display strings back to raw data. (3) **The 15-day access SLA (Art. 19) funnels through the one
`service_role` holder** who is already saturating on unrelated work — DSAR volume doesn't need to be high to blow a 15-day
SLA when fulfilment cost per request is "write custom SQL by hand." (4) **No international-transfer instrument** — Brazil→US
has no adequacy decision, **Res. 19/2024's SCC grace period expired 2025-08-23**, and the repo contains zero SCCs and zero
mention of transfer in the one shipped notice. Live the instant one Brazilian row is written to Oregon. (5) **No encarregado
is named**, and the aggregation model (one shared Postgres for 3,000 tenants / 600k+ subjects) is exactly the shape that
disqualifies you from Res. 2/2022's small-agent DPO waiver, regardless of any single gym's size.

## 10.3 Andean bloc — Colombia, Argentina, Chile

| Country | Position | Sharpest risk |
|---|---|---|
| **Colombia** (Ley 1581/2012) | Cleanest of the three. **RNBD registration is asset-gated at 100,000 UVT ≈ COP $5.24 bn ≈ USD $1.2–1.3M in total assets**, so most 150–300-member gyms are exempt from the *filing* — though never from the substantive duties. US hosting is currently adequacy-clean | The adequacy path is **a single 2017 SIC circular that the SIC is actively revisiting** (Circulares 002/003 de 2025), alongside a pending reform bill proposing a 5× fine-ceiling increase. Not a gym count — a regulatory event. Watch for any further Circular Externa touching Título V Capítulo 3 |
| **Argentina** | Hardest entry. **AAIP database registration has no size threshold and plausibly attaches at gym #1**, and Argentina requires SCCs for the same Oregon-hosting fact pattern that is adequacy-clean in Colombia | Bespoke legal work (registration filing + signed transfer contract) **before or immediately after market entry**, not after scale |
| **Chile** (Ley 21.719) | **Full entry into force 2026-12-01 — roughly four months out.** Brand-new regulator with real teeth: up to 20,000 UTM / 4% of revenue, suspension power, public sanctions registry | **Zero published transfer basis for Oregon hosting.** The Agency does not exist yet, so you cannot pursue adequacy; you can only pursue an SCC-equivalent contract proactively, and no source confirms what "adequate guarantees" look like under a regime that isn't implemented. **Highest severity in the bloc**, because it combines a hard calendar deadline with a new regulator and no basis to rely on |

**Cross-cutting:** breach-notification asymmetry forces a choice you have not made — build to Brazil's 3-business-day bar
now (cost today) or accumulate risk in Argentina, where there is currently no deadline but a live reform effort trying to
add one. And Mexico's own regulatory vacuum (INAI dissolved, executive-branch successor, >1 year without implementing rules)
removes your home-market anchor when a Colombian/Argentine/Chilean counterparty asks what "good compliance" looks like
where you're from.

---

# 11. WHAT THIS AUDIT DID NOT EXAMINE

From the coverage critic, ordered by how much it matters. **Read this as the list of things you should not assume are fine
just because 36 agents didn't flag them.**

1. **Observability was nobody's mandate** — so it stayed a recurring aside in six files instead of a finding. It is
   ranked #8 in §3 only because the critic promoted it. The corpus contains 69 exit triggers and this stack emits none of them.
2. **"Stay and fix" was never costed** — seven agents were funded to price *leaving*, zero to price *staying*, and the audit
   then concludes "stay." §4.1 is the first estimate that exists, and it is asserted.
3. **Caching was never evaluated as a design option.** Zero hits corpus-wide for `unstable_cache`, `Redis`, `materialized
   view`, `CQRS`; one hit each for `revalidat`. The audit's rank-1 technical mechanism is read volume against unindexed
   plans, and **the textbook mitigation was never weighed against "buy compute" or "migrate vendor"** — even though the
   most-read data (`gym`, `paquetes`, `class_type`, `schedule_template`, `perfil`) is near-static per tenant and three of
   those tables' indexes show as *never used* in the live advisor. **~3 hours to close. It should land before any
   compute-rung or vendor decision is funded.**
4. **The app tier was never shopped.** It is the larger bill. Cloudflare Workers + Hyperdrive, Fly, Railway and self-hosted
   Next are all plausible substitutes and none was costed.
5. **No head-to-head alternatives table on one workload with a stated decision criterion.** Each vendor was compared to
   Supabase; none to each other; three different workload denominators were used. "Best" was never defined — cheapest?
   lowest operational risk? best for a solo founder with no on-call? Different criteria produce different winners.
6. **No security mandate existed.** The two sharpest rulings (R2 and R3) came from an *adjacent* mandate (blast radius).
   There was no pentest pass, no authn/authz abuse-case pass, and — verified by grep — **zero dependency or supply-chain
   review anywhere in the corpus** (`npm audit`, CVE posture, lockfile provenance, Dependabot: no hits), and no
   secrets-handling review, though live secrets sit in `.env.local` on disk (a Supabase PAT, a Resend key, the HMAC
   tenant-assertion key). There is no reason to think that surface is exhausted.
7. **The write path is unmodelled** in every compute number here. It is measured at **1.6×–8.5× the mean latency** and
   1.4×–4.1× the block traffic of the read the whole model is anchored on. Direction of the error is known: **ceilings
   arrive earlier than published.**
8. **Async and scheduled work has no home**, and nobody covered it as a structural gap. No queue library, no
   `waitUntil`/`after()`, and `pg_cron`/`pg_net` are **not installed** [measured]. Every one of membership expiry, renewal
   reminders, dunning, monthly close, bulk invite, nightly reconciliation and backup verification is a feature you will
   need, and each currently has to be synchronous in a request or a founder running SQL.
9. **Seasonality is unmodelled everywhere, including in this report.** Every monthly figure is a flat average on a
   two-month-old dataset. **January is a gym business's entire acquisition year** — a signup surge concentrates invites,
   activation and auth-bucket consumption into one month, and the caps that bind first (Resend 100/day, the auth buckets)
   are *daily* ones.
10. **Concurrency was never tested.** The `registrar_venta` duplicate-guard race, `gym_folio_counter`'s per-gym
    serialisation point, and the advisory-lock RPCs are all argued from source and never exercised.
11. **Nobody read the denial suites' bodies.** The human rule, the machine guard and two auditors all point at the same
    unexamined thing: whether a suite asserts the *written rows* or just the return value.
12. **Nobody opened the app.** All 36 mandates were infrastructural. The poor-connectivity front-desk finding (§weakness 16)
    is a structural inference from a round-trip count, not an observation — it could be wrong in either direction, and it
    is the one class of problem a paying customer experiences directly.
13. **Mobile bundle size, LCP on low-end Android, and accessibility** — one incidental mention corpus-wide; 80 KB/page view
    is assumed and unverified; no `eslint-plugin-jsx-a11y`, though 53 `aria-label` / 55 `aria-hidden` / 22 `role=` in source
    say someone was paying attention.
14. **Tenant (logo) churn rate is unsourced** — two agents borrowed a *member*-churn figure. It drives re-provisioning load
    and zombie-tenant accumulation.
15. **Restore was never timed. No exploit was ever attempted. No load test was ever run. Nothing was benchmarked above
    ~700 rows.**

**Three things are simply sound and should be stated as such so a future reviewer does not "fix" them:** per-gym
`gym.timezone` read at `agenda-miembro.ts:149` and plumbed as `tz` at `:160` with lockstep tests — correctly built, needs
nothing; `next_folio`'s counter-not-sequence design; and the `auth.users`-deletion re-activation path, which was
flagged as a possible one-way door and is not — `clientes_auth_user_id_fkey ON DELETE SET NULL` returns the row to
`auth_user_id IS NULL` and `preparar_invitacion` re-mints a code. De-escalate it.

---

*36 agents · live prod read-only · every vendor price fetched 2026-07-27/28 · every load-bearing constant re-verified
against production at write time.*
