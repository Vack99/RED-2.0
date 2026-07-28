# critic:coverage — the shape of the roster's mind

**Agent:** `critic:coverage` · **Date:** 2026-07-28 · **Method:** read all 34 outputs (1.22 MB), extracted and
clustered every self-declared blind-spot section, swept the corpus for topic coverage by grep, verified the
negative results against the live repo and live prod (read-only), closed three named-but-unanswered questions.

---

## 0. VERDICT, UP FRONT

**The roster examined the substrate exhaustively and never examined the instrument, the plan, or the product.**

Three sentences that summarise 34 agents:

1. It produced **69 exit triggers across 22 files**, and the system has **zero instrumentation to fire a single
   one of them** — no error tracker, no APM, no log drain, no alert, no on-call. Nobody's mandate was "is this
   observable?", so the audit's entire delivery mechanism is unimplementable against this codebase.
2. Seven agents costed **leaving** Supabase. **Zero costed staying and fixing it** — which is what all seven
   of them recommend. The audit's actual conclusion is the one option with no price, no ordering, and no plan.
3. The audit is named after the **smaller bill**. `verify-math.md:621` finds Vercel at **$809.13/mo** against
   Supabase's **$441.97/mo** at 3,000 gyms — the app tier is 1.8× the database tier, it was priced by 1 of 34
   agents in the last hour of the session, and **no agent shopped it against any alternative at all.**

**Complete enough to act on?** Partially — see §7. The index fixes are safe. The ceiling numbers are not
decision-grade. And the audit's own top recommendation must not be shipped through the delivery path the audit
itself ranks as blast-radius #1.

---

## 1. LENS 1 — THE BLIND-SPOT CLUSTERS

31 of 34 files carry an explicit blind-spot section (`price-meters.md`, `verify-authz-ceiling.md` carry an
equivalent "what I could not verify"; `verify-email-ceiling.md` carries none). Clustered:

### Cluster A — "seed the scratch project" (named by ≥7 agents, assigned to 0)

`arch-authz #1`, `arch-tenancy #1`, `red-breakfirst #1`, `red-team #2`, `model-tiers #3`,
`verify-authz-ceiling`, `workload-reads`, `workload-growth` all independently write some form of:

> "The honest way to settle the entire top half of this table is to seed a scratch project to 500 gyms and
> re-run §2.3/§2.4/§2.5. Read-only access cannot build that, and I did not." — `red-breakfirst.md:55`

**A scratch project exists** (`gyyujeguycxxoaqgdnjp`, 77 migrations applied, writes allowed, credentials in
`docs/db-testing-throwaway-project`, per the session memory). It was never assigned. This is the single
most-repeated blind spot in the corpus and it was closable with a resource the orchestrator already owned.

### Cluster B — "someone must open a dashboard" (≥8 agents, ~8 fields, ~4 minutes of clicking)

| Field | Blocks | Named by |
|---|---|---|
| PostgREST `db-pool` size | every connection-ceiling number in 4 files | `arch-api #3`, `model-tiers #2`, `red-breakfirst #3`, `price-compute` |
| Auth → Rate Limits `/auth/v1/otp` | `arch-runtime` finding #3, `alt-email` finding #1 | `arch-runtime #2`, `red-breakfirst #4` |
| Vercel function region / Fluid / plan | `arch-runtime` findings #1, #2, #5 | `arch-runtime #1`, `red-blastradius #4`, `verify-region-runtime` |
| Resend actual plan + `rate_limit_email_sent` | `alt-email #2`, `verify-email-ceiling` | `alt-email #2`, `red-breakfirst #4` |
| Spend Cap on/off | whether disk overflow bills or **blocks writes for every tenant** | `red-breakfirst #4` |
| Plan tier | **settled by R1** — but 5 agents burned sections on it first | `verify-plan-tier`, `price-compute`, `red-team #1`, `red-blastradius #1`, `verify-pricing-supabase #1` |

R1 is the proof of the cost: the orchestrator settled the plan question by noticing 60 `pg_backup_stop()` calls
in `pg_stat_statements`. Genuinely clever — and it demonstrates that five agents wrote sections about a fact one
owner click would have produced on hour one.

### Cluster C — three agents each disclaimed the write path, so nobody modelled it

- `model-tiers #5`: "I did not model the write path… none of that is in my compute sizing."
- `red-breakfirst #6`: "I did not model the write path's own ceilings."
- `verify-math #2`: "I did not model the WRITE path… My compute sizing does not include it."

This is the exact failure mode the mandate warned about: three agents each noted the gap, each assumed it
belonged to someone else's mandate, and **the entire compute model — the thing that produces the "1,900–5,000
gyms" ceiling and the G² curve — is built on read-path constants only.** I closed part of it in §5 below; it
took one query.

### Cluster D — three agents disclaimed WAL / backup / PITR storage growth

`model-tiers #6`, `verify-math #8`, `workload-growth #2`. Compounded by Cluster C: you cannot model WAL without
modelling writes. I closed both in §5.

### Cluster E — three agents disclaimed seasonality

`model-tiers #9`, `red-breakfirst #8`, `verify-math #7`. All three note a January signup surge would concentrate
activation + invite email into one month and trip the Resend daily cap and the auth bucket long before any
monthly average does. **All monthly figures in the corpus are flat averages.** Nobody modelled the peak. For a
gym business this is not a rounding error — January is the whole year's acquisition.

### Cluster F — nobody tested concurrency

`arch-datamodel #3`, `red-team #4`, `biz-model #3`, `arch-tenancy #9`. The `registrar_venta` duplicate-guard
race, the `gym_folio_counter` per-gym serialisation point, and the advisory-lock RPCs are all argued from source
and never exercised. Scratch project, pgbench, 1–2 hours.

### Cluster G — nobody read the denial suites' bodies

`arch-api #4` and `arch-authz #7` both note that `supabase/tests/` was not read, and `arch-api` observes this is
the *machine guard's own* stated blind spot too (`AGENTS.md`: "What the guard cannot check is whether the named
suite asserts the *written rows*"). So the human rule, the machine guard, and both auditors all point at the
same unexamined thing. Nobody looked.

### Cluster H — the roster's own precision, cited across files

`alt-neon #6` used the prior audit's `$0.53–1.04/gym/mo` as an anchor; `alt-aws #6` treated the exit-cost seam as
given; `red-breakfirst #7` took `arch-runtime` and `alt-email` "at their word"; `price-compute` explicitly
declined reconciliation as "the synthesizer's job." At least six load-bearing numbers are cited between siblings
without re-derivation. `model-tiers` blind spot #1 — "**Nobody in this audit priced Vercel**" — was already false
when written (`verify-math` §7 priced it 45 minutes later). Sibling citation across a fan-out with no
write-ordering produces stale cross-references.

---

## 2. LENS 2 — WHAT WAS NEVER PRICED

### 2.1 Priced (for the record)

Supabase (5 agents), AWS RDS/Aurora/Cognito/SES, Neon, Railway, Fly, Firestore, Convex, Nhost, Appwrite,
Clerk/WorkOS/Auth0/Zitadel/Keycloak/BetterAuth, Resend/SES/Postmark/SendGrid, Hetzner/OVH/DigitalOcean *Droplets*,
and Vercel (1 agent, last).

### 2.2 Never priced — and only two of these matter

Zero hits across all 34 files: **CockroachDB, Turso, Timescale, AlloyDB, Google Cloud SQL, Azure Database for
PostgreSQL, Xata, Prisma Postgres, DigitalOcean *Managed* Postgres, Vercel Postgres, Cloudflare
(Workers/D1/Hyperdrive/Pages)**. `Nile` appears exactly once — in `arch-tenancy`'s blind-spot list, naming itself
as unpriced. `Materialize` hits are all false positives on "materialized/materialisation".

**Honest ranking of that list: most of it is padding and I will not pretend otherwise.** D1 is SQLite (no RLS, no
plpgsql, no `SECURITY DEFINER` — the schema cannot run on it). Timescale and Materialize solve problems RED does
not have. CockroachDB, Turso, Xata, Prisma Postgres are the same managed-Postgres category `alt-neon` already
covered with three instances. AlloyDB/Cloud SQL/Azure are the same category `alt-aws` covered. Adding them would
produce six more "don't switch" verdicts. **Do not fund that.**

**The two that matter:**

**(a) The app tier was never shopped — at all.** Every `alt-*` agent shopped the database. `verify-math` §7 then
found the app tier is the bigger bill: **$809.13/mo Vercel vs $441.97/mo Supabase at 3,000 gyms**, of which
**$652 is Edge Requests alone** at 16 requests/page-view. Cloudflare Workers + Hyperdrive, Fly, Railway, or
self-hosted Next on a container are all plausible substitutes for a bill that is 1.8× the one 34 agents
interrogated. Nobody costed one. **This is the largest pricing gap in the audit.**

**(b) A hybrid was never priced, except one direction.** `alt-auth-only` priced Supabase-DB + external auth and
correctly found it doesn't pay. The *reverse* (Supabase Auth + foreign Postgres) is structurally near-impossible
— `auth.uid()` must live in the same database — and `alt-auth-only` §4 explains why, so that's fine. But the
hybrid that actually matters was never named: **stay on Supabase and add the missing tier** (read replica for
reporting, a cache layer, a different app host). See §3.

### 2.3 STAYING AND FIXING WAS NEVER PRICED — and it is the recommendation

`alt-exit-cost.md` prices **leaving** (80–144h auth surface, 16–30h to self-hosted Supabase). No file prices
**staying**. Grep for "stay and fix" / "status quo" / "remediation cost" across all 34 files returns four hits,
none of them an estimate.

Yet every `alt-*` file concludes "don't switch," which makes "stay and fix" the audit's actual verdict. What
does not exist anywhere:

- A consolidated fix list (there are ~170 ranked complaints across 28 forced-5 rankings — see §6.5 — with no dedup).
- An ordering or dependency graph.
- An hours estimate against a solo founder's budget.
- A statement of which fixes are prerequisites for the next 30 gyms vs. the next 3,000.

**Consequence:** Aaron will read 1.2 MB, agree with the verdict, and have no idea what to do on Monday.

---

## 3. LENS 3 — THE STRUCTURAL OPTIONS NEVER CONSIDERED

Verified by grep across all 34 files. Zero hits: `CQRS`, `event log`, `materialized view`, `Redis`,
`unstable_cache`. One hit: `revalidat`, `Sentry`, `feature flag`, `observability`.

### 3.1 CACHING — the orchestrator's suspicion is correct. It was never examined.

The only caching anywhere in the corpus is incidental:
- `arch-runtime` §5.2 — the existing 60-second in-process tenant cache, examined only to say it saturates at
  ~500 gyms and "right now nobody can see it" (`arch-runtime.md:480`).
- `workload-reads.md:14` — React's per-render `cache()` memoisation, credited as a de-duplication of round trips.

**Never examined as a design option:** Next.js Data Cache / `unstable_cache` / ISR, HTTP cache headers, an
external cache (Upstash/Redis), or materialised views.

**Why this is load-bearing, not academic:** the audit's rank-1 technical finding is that read volume against
unindexed / OR-policy-broken plans drives compute super-linearly (`model-tiers` §6, `verify-math` §5, G² in
`red-team`). Caching is the textbook mitigation and it was never weighed against "buy a bigger box" or "migrate
vendors." And the data most read is the most cacheable: `gym`, `paquetes`, `class_type`, `schedule_template`,
`perfil` are near-static per tenant and re-read on every render (`workload-reads` §1–§7). Three of those
(`paquetes_gym_id_idx`, `perfil_gym_id_idx`, `cobro_gym_id_idx`) show as **never-used indexes** in the live
performance advisor — consistent with tables small enough to cache entirely.

**Cost to close:** one agent, ~3h, no new infrastructure — the question is "which of the 17 round trips on
`/reservar` are cacheable, for how long, and what does that do to the §5 compute curve."
**Verdict: follow-up, but it must land before any compute-rung or vendor-migration decision is funded.**

### 3.2 OBSERVABILITY AND ALERTING — zero, and it invalidates the audit's delivery mechanism

Verified: `grep -ril "sentry|datadog|opentelemetry|posthog|logflare|axiom|betterstack|pagerduty|log drain"` over
`apps/*/src packages/*/src supabase` returns **nothing**. No such dependency in any `package.json`.

The corpus says the same thing five times without ever making it a finding:
- `arch-runtime.md:407` — "no per-gym metering, no backpressure and **no 429 instrumentation anywhere in the repo**"
- `arch-runtime.md:480` — "Instrument the cache hit rate before deciding — **right now nobody can see it**"
- `verify-email-ceiling.md:99` — "no queue, no outbox, **no alerting anywhere in the repo** to surface it"
- `red-blastradius.md:31` — detection time for a bad migration: "Minutes–days (**no alerting exists**)"
- `red-blastradius.md:40` — leaked `service_role` key: detection "**Zero — nothing detects it**"
- `legal-br.md:217` — "**nothing is instrumented** to answer 'what did the attacker actually read'"

Nobody's mandate was observability, so it stayed a recurring aside instead of a rank-1 finding.

**Why it is rank-1:** the orchestrator's own Rule 3 is *"every 'keep' ships an observable exit trigger."* The
corpus contains **69 exit-trigger statements**. Sample them and roughly a third are gym-count thresholds a human
could check by running SQL on purpose; the rest are p95 latency, GoTrue 429 rates, cache hit rates, Resend
quota headers, disk-fill rate, DAL network wait — **none of which any system in this stack currently emits, and
none of which alerts anyone.** The report's core promise is undeliverable against this codebase as it stands.

There is also no pager. `red-ops` §6 argues the founder is the on-call rotation; it does not observe that there
is nothing to page him *with*. At 4 gyms, Aaron notices because a gym owner calls him. That does not scale, and
the corpus has no number for when it stops working.

**Cost to close:** the *audit* gap is one agent, ~2h, producing a mapping of the 69 triggers → the specific
signal each needs → what emits it today (mostly: nothing). The *engineering* is a separate, larger ticket.
**Verdict: THIS SHOULD BLOCK THE REPORT** — not because the report's findings are wrong, but because shipping 69
triggers nobody can observe is shipping a report that cannot be acted on after Monday.

### 3.3 ASYNC WORK — no queue, and the extension isn't even installed

`pg_extension` live, this session: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`.
**No `pg_cron`, no `pg_net`, no `pgmq`.** No queue library in any `package.json`. No `waitUntil`/`after()`.

Coverage in the corpus is **email-only and good**: `alt-email` §5 and `verify-email-ceiling` #3 both nail the
no-retry/no-outbox posture, and `alt-email:235` makes the honest counterpoint that at 1–2 sends/day it is the
right call. I verified the mechanism at `packages/data/src/server/invitaciones.ts:181-218` — `enviarInvitacion`
awaits `transport.send()` **inline in the request**, returns `{ok:false, motivo:"envio-fallido"}` on any non-2xx,
and the invite is simply lost until a human re-clicks.

**What nobody covered:** async as a *general* structural gap. There is no scheduled work anywhere — no membership
expiry sweep, no renewal reminder, no dunning, no monthly close, no bulk invite, no nightly reconciliation, no
backup verification job. Every one of those is a product feature a gym-management SaaS eventually needs, and
each currently has to be either synchronous in a request or a founder running SQL. `red-ops` counts the founder-
executed runbooks; it never connects them to "there is no place to put a background job."

**Cost:** one agent, ~2h, to enumerate what would need scheduling by 300 gyms and price the primitive.
**Verdict: follow-up.** Not urgent at 4 gyms; it is the shape of the next 12 months of product work.

### 3.4 Read replicas / CQRS / reporting separation

Read replicas appear only as a **price** (`price-gotcha`'s rate table: ~$15/mo Small to ~$111/mo Large,
Spend-Cap-**exempt**). No agent evaluated one as an *architecture* move. Zero hits for CQRS or materialized view.
This matters because the heaviest reads in the product are analytical — `getResumenMes` / `calcularCorteMes` over
a 24-month window (per session memory) — and they run on the same OLTP instance that serves the front desk during
class check-in. **Cost: fold into the §3.1 caching pass.** Verdict: follow-up.

### 3.5 Partitioning — partially covered, honestly deprioritised

`workload-growth` §6 gives a row-count threshold; `arch-tenancy` blind spot #7 explains why it was deprioritised
(hash-by-`gym_id` inherits the same `.eq()` dependency) and flags time-partitioning as an uncosted partial
mitigation. That is adequate. **Verdict: minor. Do not pad.**

### 3.6 Feature flags, canaries, staged rollout — found absent, never sized

`alt-exit-cost #5` flags the gap and declines to size it. `red-blastradius.md:46` is the sharper statement:

> "Migrations reach production through the MCP's `apply_migration` against the live ref… That call does not pass
> through GitHub Actions at all. **The number of automated checks between an agent's DDL and 3,000 tenants' rows
> is zero.**"

No canary tenant, no staging DB, no dry-run, no flag. **This is directly load-bearing on the audit's own top
recommendation** (ship two indexes, merge two policies) — see §7. **Cost to size: ~2h.** Verdict: follow-up,
but it is the *delivery* half of the report's recommendation and cannot be omitted from it.

### 3.7 Idempotency / retry infrastructure

Partially covered — the renewal dedup guard shipped (session memory), `red-team #4` notes the race is untested,
`verify-email-ceiling` covers the mail side. No general treatment. **Minor.**

### 3.8 Rate limiting as a first-class product concern

Covered as a *defect* (R2's `p_ip` bypass; `arch-runtime` §4's shared GoTrue pools) but never as a *requirement*.
Nobody asked "what per-tenant quotas does a multi-tenant SaaS need, and where do they live?" The answer today is:
one hand-rolled IP check in `contacto` that R2 proves is bypassable, and Supabase's project-wide auth buckets
that `arch-runtime` proves are shared across all 3,000 tenants. **Cost: ~2h.** Verdict: follow-up, medium.

---

## 4. LENS 4 — WHAT RESTS ON ASSERTION, AND THE EXPERIMENT THAT SETTLES IT

Every experiment below runs on the **existing scratch project** (`gyyujeguycxxoaqgdnjp`, 77 migrations, writes
allowed). None touch prod.

| # | Claim, and who asserts it | Experiment | Cost | Gates a recommendation? |
|---|---|---|---|---|
| **E1** | **"Merging the two permissive SELECT policies restores the index."** `verify-math #9`: *"I proved the OR breaks it (EXPLAIN); I did not prove the fix works… The fix may need `is_staff_of` rewritten as an inlinable predicate rather than a `SECURITY DEFINER` function call."* | Apply the merged policy on scratch, `EXPLAIN` the same query, confirm index scan | **30 min** | **YES — this is a named top recommendation and it is unproven** |
| E2 | The G²/compute curve, the 167-gym latency ceiling, the 1,900–5,000-gym compute wall, the buffer-eviction cliff — all extrapolated from 4 gyms / 15 MB / 705 attendance rows | Seed scratch to 500 gyms × 200 members, re-run the `arch-authz` Q1/Q2/Q3 set and `red-breakfirst` §2.3–2.5 | 6–10h | No — but every *number* in the report depends on it |
| E3 | Prod schema == repo schema. `red-team #3` proved the migration *ledgers* diverge **65/87** and calls an object diff "**the single highest-value follow-up in this document**" | Replay all migrations onto scratch, `pg_dump --schema-only`, diff against a prod schema dump | 2–3h | **YES — you cannot safely ship DDL to a schema you have not diffed** |
| E4 | RTO/RPO. `red-blastradius #2`: "I never timed a restore… could be off by 2× in either direction" | Timed restore drill into scratch | 2–4h | No, but it is the only number that matters in a disaster |
| E5 | `registrar_venta` duplicate-guard race; `gym_folio_counter` contention | pgbench concurrent RPC calls on scratch | 1–2h | No |
| E6 | PostgREST `db-pool` size (4 agents blocked) | **Open the Supabase API settings page** | **30 sec** | No |
| E7 | Vercel region / plan / Fluid compute (3 agents blocked) | **Open the Vercel dashboard** | **2 min** | No |
| E8 | `/auth/v1/otp` configured rate limit (2 agents, one calls it "the single highest-priority thing to go look at today") | **Open Supabase Auth → Rate Limits** | **30 sec** | No |

**E1, E3 and the four dashboard clicks together cost under four hours and would upgrade more of this audit than
any additional agent.**

---

## 5. WHAT I CLOSED WHILE AUDITING (three gaps, ~15 minutes)

I include these to demonstrate the gaps are cheap, not to claim credit.

### 5.1 `arch-datamodel`'s self-declared "highest-value next question" — ANSWERED, and it is benign

> *"after an `auth.users` deletion, can that person ever re-activate? …If it does not, account deletion is a
> one-way door for the member and a support ticket for the platform operator. **Untested.**"* — `arch-datamodel.md:193`

Twenty-plus agents ran after that was written. Nobody answered it. Live `pg_proc` body of `preparar_invitacion`:

```
  if v_auth is not null then raise exception 'La cuenta ya está activa'; end if;
  if v_code is null then
    loop  v_code := <8 chars from A-Z2-9>;
      begin update public.clientes set claim_code = v_code where id = p_cliente_id; exit;
      exception when unique_violation then end;  -- regenerate and retry
    end loop;
  end if;
```

`clientes_auth_user_id_fkey ON DELETE SET NULL` returns the row to `auth_user_id IS NULL` with `claim_code` also
null; `preparar_invitacion` then **re-mints a code**. **Re-activation works. Not a one-way door.** It is
staff-initiated (the member cannot self-serve), which is a UX note, not a defect. **De-escalate this item.**

### 5.2 Cluster C — the write path is not unmeasurable. It is one query.

`extensions.pg_stat_statements`, live, this session:

| statement | calls | mean ms | blks/call | dirtied | WAL |
|---|---|---|---|---|---|
| heaviest write RPC | 354 | **13.58** | **400.8** | 736 | 2.12 MB |
| next write RPCs | 18 / 8 / 3 | 26.9 / **54.9** / **72.2** | 614 / **997** / **1,047** | | |
| `mi_membresia` (the READ the whole compute model is anchored on) | 97 | 8.49 | 292.5 | 0 | 0 |

**The write path is measured at 1.6×–8.5× the mean latency and 1.4×–4.1× the block traffic of the read that
`model-tiers` §6 and `verify-math` §5 build the entire compute ceiling on.** Three agents disclaimed it as
another mandate's job. It took one `select`. Every compute threshold in the corpus is therefore an **underestimate
of unknown size**, and the direction of the error is known: the ceilings arrive *earlier* than published.

### 5.3 Cluster D — WAL measured, and the feared PITR storage charge does not exist

Live: **26 MB WAL over 59.4 days** of uptime at 4 gyms = **450 kB/day** = ~112 kB/gym/day. Linear to 3,000 gyms:
~337 MB/day ≈ **123 GB/year of WAL**. (Floor only — these 4 gyms are seed-dominated and low-activity.)

And the charge three agents feared is not published: `supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery`
(fetched **2026-07-28**) gives PITR as a flat **$0.137/hr (~$100/mo) / 7d, $0.274 (~$200) / 14d, $0.55 (~$400) /
28d**, with **no per-GB backup or WAL-retention storage line anywhere on the page.** Doc silence is not proof,
but **three agents' "unpriced PITR storage growth" blind spot should be closed as 'no such published line'**
rather than carried as an open cost risk.

---

## 6. LENS 5 — AARON'S FIVE QUESTIONS, ONE AT A TIME

### Q1 "Is Supabase really the best possible approach?" → **HEDGED. Not answerable from this corpus as written.**

Seven `alt-*` files each conclude "don't switch," which is a strong signal. But:
- **Three different workload denominators.** `alt-baas` built its own §0 model, `alt-aws` re-derived its own §1,
  `alt-neon` used the prior audit's `$0.53–1.04/gym/mo` as a rough anchor and says so. The numbers are not
  comparable to each other.
- **No head-to-head table exists.** Grep confirms it. Each vendor was compared to Supabase; none to each other.
- **"Best" was never defined.** Cheapest? Lowest operational risk? Fastest to 3,000 gyms? Best for a solo
  founder with no on-call? Different criteria produce different winners and no agent was given one.
- **The app tier — the bigger bill — was never shopped** (§2.2a).

**To answer crisply:** one synthesis table, one workload, one row per option **including "stay + fix" as a row**,
one stated decision criterion. ~3h. **This blocks Q1 and Q4.**

### Q2 "Is our structure the best possible approach for a project like this?" → **CRISP on the database. ABSENT on everything else.**

Excellent and decision-grade: `arch-tenancy` (shared-table + RLS is right, ranked against 5 peers, with Citus
and PlanetScale cited on both sides), `arch-authz` (RLS-as-safety-net + reader-side `.eq("gym_id")` is right —
and is implemented in **34% of call sites**), `arch-datamodel` and `arch-api` (crisply negative, with specifics).

**But "structure" was read as "database structure."** Unexamined: caching structure, async/job structure,
observability structure, release/deploy structure, the app-tier structure. Four of the five are the ones that
bite a solo founder first. **Partially answered — say so plainly in the report rather than implying coverage.**

### Q3 "Where are our main weaknesses?" → **OVER-ANSWERED AND UN-CONSOLIDATED.**

28 files carry a forced "5 worst things, worst first" section: **~170 ranked complaints, with no dedup, no
cross-file ranking, and no single list.** Producing that list is the orchestrator's job and it does not exist yet.

Two structural warnings for that synthesis:
1. **Forced-N ranking manufactures findings.** The prompt demanded five per file whether or not five existed. A
   visible fraction of rank-4 and rank-5 items are padding. The synthesis needs permission to drop them.
2. **The top weakness may not be technical.** `red-ops` argues the platform saturates the founder at **~135 gyms**
   and needs ~22 FTE at 3,000 — an order of magnitude before most technical ceilings in the corpus. `biz-model`
   independently finds support cost, not infra cost, dominates. If those two are right, the ranked list should
   open with an organisational finding and the 34 infrastructure agents are answering the second question.

### Q4 "What are the best alternatives?" → **PER-VENDOR YES. RANKED NO.** See Q1.

### Q5 "How many gyms/members before the first paid tier, and how much can Pro handle?" → **CRISPEST ANSWER IN THE CORPUS, AND HALF OF IT IS NOW MOOT.**

`verify-math` §4 and `model-tiers` §0 both deliver it in the requested form. Free: **~41 gyms @ 200 members after
one year (~14 after three)**, ended by the **500 MB database cap**, which does not bill — it flips every tenant
read-only. Pro: **every meter survives 3,000 gyms and totals $17/month there.**

Three problems with using it as-is:

1. **R1 deleted the first half.** Production is already on a paid plan. "How many gyms before the first paid
   tier" is now "you are past it." The Free-tier arithmetic is a well-built answer to a question that no longer
   applies. Say so, don't bury it.
2. **The Pro answer contains its own contradiction and the report must resolve it.** "Pro carries you past 3,000
   gyms" (meters) sits beside "compute runs out of purchasable rungs between 1,900 and 5,000 gyms" (not a meter,
   Spend-Cap-exempt) sits beside "the first thing that actually breaks is page latency at **~167 gyms**." The
   number Aaron needs is **167**, and it is in §6.1 of one file, behind two headline sentences that both say
   "3,000." Lead with 167.
3. **Nobody converted any of it into Aaron's units.** From `verify-math` §7 at 3,000 gyms: Supabase $441.97 +
   Vercel $809.13 = **$1,251/mo ÷ 3,000 = $0.417/gym/mo ≈ 7.3 MXN/gym/mo** against **300–1,500 MXN/gym/mo**
   revenue — **0.5%–2.4% of revenue.** That single line answers the question behind the question, and no agent
   states it. It also indicts the audit's own framing: **34 agents interrogated a line item worth ~1% of
   revenue**, while `biz-model` and `red-ops` — 2 of 34 — looked at support cost, which they put at
   **210%–408% of revenue** at the 300 MXN floor.

---

## 7. LENS 6 — THE PRODUCT AND THE USER

**All 34 mandates are infrastructural. Zero examined whether the software works for the people using it.** Scoped
honestly:

### 7.1 IN SCOPE AND LOAD-BEARING — poor-connectivity behaviour at the front desk

Verified: no service worker, no PWA manifest, no `navigator.onLine`, no offline handling in `apps/*/src`. And
`arch-runtime` §1 + `workload-reads` establish the member render is **8 sequential round trips** and `/reservar`
is **17**, from Vercel `iad1` (Virginia) to Supabase `us-west-2` (Oregon), at ~60–70 ms each.

Compose those: a gym front desk in Chihuahua on flaky wifi runs *pase de lista* — the product's headline daily
flow — over 17 sequential cross-continent round trips with no offline buffer, no optimistic write, and no retry.
`red-ops` §4 separately reports that **"the product's headline feature has never worked at a real gym."** Nobody
connected those two facts. **This is the failure that arrives at 30 gyms, not 3,000**, and it is the one class of
problem in this entire audit that a customer experiences directly.

**Cost: one agent, ~3h** (throttle to 3G/high-latency, walk *pase de lista* and `/reservar`, report what a
dropped packet does). **Verdict: HIGH. Belongs in the next round, ahead of most of §4's experiments.**

### 7.2 IN SCOPE — i18n is hardcoded, which makes the Brazil analysis premature

`apps/admin/src/app/layout.tsx:71` and `apps/client/src/app/layout.tsx:74` both hardcode `lang="es-MX"`. There is
no translation framework in any `package.json`. Meanwhile `legal-br.md` spends **416 lines** on an LGPD posture
for a Brazilian launch the application cannot linguistically serve, and `legal-andean` adds 413 more.

The legal agents did their job well. But **829 lines of the corpus analyse markets gated behind an unexamined
and unpriced i18n build**, and no agent noticed. **Cost to close: 1h to size the i18n work.** Verdict: follow-up
— but it reorders the legal findings from "act on" to "when Brazil is real."

### 7.3 IN SCOPE, AND IT IS SOUND — timezone. Say so plainly.

Per-gym `gym.timezone` (live values include `America/Chihuahua`), read at
`packages/data/src/server/agenda-miembro.ts:149` and plumbed as `tz` at `:160`, with lockstep tests
(`agenda-miembro.test.ts`). **This is correctly built and needs nothing.** Naming it protects it from a future
reviewer "fixing" it.

### 7.4 MARGINAL — mobile performance, accessibility, mid-class disconnect

- **Mobile/bundle/LCP:** one incidental mention corpus-wide (`workload-reads.md:389`). Members are on low-end
  Android. `verify-math` assumes 80 KB/page view and nobody verified it. **Medium; fold into 7.1.**
- **Accessibility:** 53 `aria-label`, 55 `aria-hidden`, 22 `role=`, 13 `aria-pressed` in source — someone was
  paying attention — but no `eslint-plugin-jsx-a11y` and no audit. No LatAm regulatory driver today.
  **Low. File it; do not fund it now.**
- **Member disconnects mid-class:** reservation is not real-time (zero Realtime subscriptions, measured). **Minor.**

---

## 8. LENS 7 — WHAT THE ORCHESTRATOR GOT WRONG

Bluntly, as requested. Ordered by how much output each one cost.

### 8.1 You held a writable scratch project and made all 34 agents read-only against prod

This is the largest process error. Read-only-against-live was correct for prod. But `gyyujeguycxxoaqgdnjp` — 77
migrations, writes allowed — sat idle for the entire session while **at least seven agents independently wrote
"the honest way to settle this is to seed the scratch project and I could not."** They all wrote the same
sentence because they were all given the same wrong tool. One seeding agent, launched first, would have upgraded
`arch-authz`, `arch-tenancy`, `red-breakfirst`, `red-team`, `model-tiers`, `verify-math` and
`verify-authz-ceiling` from extrapolation to measurement. **Every scale number in this audit is soft because of
one provisioning decision.**

### 8.2 Thirty-four infrastructure mandates, zero product mandates

Aaron asked "is our structure the best possible approach **for a project like this**." A roster of 34 agents in
which *not one* opens the app produces an answer about Postgres, and it is the wrong altitude for a company at
**4 gyms, 116 members, 5 activated accounts, 15 MB** (measured this session) whose headline feature `red-ops`
says has never worked at a real gym. §7.1 is the finding that mandate structure excluded.

### 8.3 "The incumbent gets no default" produced asymmetry, not neutrality

The rule was meant to strip bias. It stripped it in one direction only: it funded **seven agents to price
leaving** and **zero to price staying and fixing**. The audit then concludes "stay." **The option the audit
recommends is the only option with no cost, no ordering, and no plan** (§2.3). A neutral framing would have made
"stay + fix" a costed row in the same table as AWS and Neon.

### 8.4 You named the audit after the smaller bill

The session is titled around Supabase. Five agents priced Supabase. **One agent priced Vercel, in the last hour,
and found it is 1.8× larger** ($809 vs $442 at 3,000 gyms). Had "price the app tier" been a first-class mandate,
`$652/mo of Edge Requests at 16 requests/page-view` would have been interrogated by someone. It was not.

### 8.5 "Rank don't rate" + implicit forced-five manufactured ~170 complaints

28 files carry a "5 worst things, worst first" section. Forced-N ranking with no escape hatch means an agent who
honestly found two problems invented three. The corpus is therefore **inflated by construction**, and the
synthesis has no de-duplication step. `red-team #8` is admirably honest about this for itself ("I am the
prosecution and I was told to be"); the structural version applies to all 28. **Give the synthesis explicit
permission to drop items and to merge duplicates across files.**

### 8.6 You accepted 3,000 gyms as the frame and never mandated "what breaks at 30?"

The company is at 4 gyms. Nothing in the roster was asked what fails at the *next* milestone. `red-ops` and
`red-team` are the only files where present-tense defects surface, and both had to argue for their own relevance
(`red-team #8`: "findings #1, #2 and #3 are all present-tense at four gyms"). **The audit optimises for a scale
the company is at 0.13% of.** A "what breaks between 4 and 100 gyms" mandate would have surfaced §7.1 and §3.2
as rank-1 and rank-2 without any of the extrapolation problems.

### 8.7 Nobody was told to ask the owner anything

Eight dashboard fields, each a sub-minute click, block findings across six files (§1 Cluster B). An owner
checklist emitted at hour one would have had answers by hour two. Instead **five agents wrote sections about the
plan tier**, which R1 then settled by inference. Your R1 method was clever; the fact that it was *needed* is the
finding.

### 8.8 Two briefing facts were stale, not one

You flagged ADR-0013 yourself. Also stale: the briefing carries `AGENTS.md`'s **"34 public functions"** while
`alt-exit-cost #6` counted **38 live** and could not reconcile them. A briefing that transmits repo-doc claims
as ground truth propagates repo-doc rot into 34 outputs. Both stale items were caught by agents — which is the
system working — but both cost paragraphs of rebuttal in files that should have been spending them elsewhere.

### 8.9 There was no security mandate, and R2/R3 arrived by luck

Your two sharpest rulings (R2 the `p_ip` bypass, R3 the universal INSERT/UPDATE/DELETE/TRUNCATE grants) both
come from `red-blastradius`, whose mandate was *blast radius*, not security. There was no pentest mandate, no
authn/authz abuse-case pass, and — verified by grep — **no dependency or supply-chain review anywhere in the
corpus** (`npm audit`, CVE posture, lockfile provenance, Dependabot: zero hits). Nor any secrets-handling review,
though `verify-region-runtime`'s blind spot notes **live secrets sit in `.env.local` on disk** (a Supabase PAT,
a Resend key, the HMAC tenant-assertion key) and `red-blastradius` row 10 notes a leaked `service_role` key would
be detected by **nothing**. A stack that ships DDL to production through an MCP with zero automated checks
deserved one agent on supply chain. **Cost: ~2h. Verdict: follow-up, medium-high.**

---

## 9. RANKED GAPS — WORST FIRST

| # | Gap | Why it matters | Cost to close | Blocks report? |
|---|---|---|---|---|
| **1** | **No observability; 69 exit triggers, nothing emits or alerts on them** (§3.2) | The report's delivery mechanism does not work. Every "keep with an exit trigger" is unenforceable. Nobody is paged for anything, including a bad migration or a leaked `service_role` key | 2h to map triggers → signals → what exists (nothing) | **BLOCK** |
| **2** | **"Stay and fix" never costed** (§2.3) — the audit's own verdict has no plan | Aaron finishes 1.2 MB with no Monday action. ~170 un-deduplicated complaints, no ordering, no hours | 4h synthesis + dedup + ordering | **BLOCK** |
| **3** | **The recommended policy-merge fix is unproven** (E1) and **prod↔repo schema is undiffed** (E3, ledgers already known to diverge 65/87), while the shipping path has **zero automated checks** (§3.6) | The top recommendation may not work, against a schema nobody has diffed, delivered through the vector the audit ranks blast-radius #1 | E1 30 min, E3 2–3h on scratch | **BLOCK (E1+E3)** |
| **4** | **Front-desk behaviour on poor connectivity never examined** (§7.1) — 17 sequential cross-continent round trips, no offline path, headline feature reportedly never worked at a real gym | The only finding class a paying customer experiences directly, and it bites at ~30 gyms not 3,000 | 3h | Follow-up, **do it first** |
| **5** | **Scratch project never seeded** (§1 Cluster A, E2) | Every scale number in the corpus is a ≤700-row extrapolation with ±2× self-declared uncertainty | 6–10h | Follow-up — but nothing quantitative is decision-grade until then |
| **6** | **Write path + WAL unmodelled** (§1 Cluster C/D) — partially closed in §5.2/5.3; writes measured at up to **8.5× the read latency** the compute model is anchored on | Every compute ceiling in the corpus errs in the direction of arriving *earlier* than published | 2h to fold in | Follow-up |
| **7** | **Caching never examined as an option** (§3.1) | The standard mitigation for the audit's rank-1 technical finding was never weighed against "buy compute" or "migrate vendor" | 3h | Follow-up — before any compute/vendor spend |
| **8** | **App tier never shopped** (§2.2a) — and it is **1.8× the Supabase bill** | 34 agents interrogated the smaller vendor | 3h | Follow-up |
| **9** | **No head-to-head alternatives table on one workload with a stated decision criterion** (§6 Q1/Q4) | Aaron's Q1 and Q4 are not crisply answered despite seven files trying | 3h synthesis | Follow-up (or fold into #2) |
| **10** | **No security mandate: zero dependency/supply-chain review, no secrets/rotation review** (§8.9) | R2 and R3 arrived from an adjacent mandate; there is no reason to think that surface is exhausted | 2h | Follow-up |
| **11** | **Async/scheduled work has no home** (§3.3) — no queue, `pg_cron`/`pg_net` not even installed | Shapes the next 12 months of product work (expiry, reminders, dunning, monthly close, bulk invite) | 2h to enumerate + price | Follow-up |
| **12** | **Seasonality unmodelled** (§1 Cluster E) — every figure is a flat average | January is a gym business's whole acquisition year; the peak trips the Resend daily cap and the auth bucket, not the monthly average | 1h | Follow-up |
| **13** | **i18n hardcoded `es-MX`** while 829 corpus lines analyse Brazil + Andean markets (§7.2) | Reorders the legal findings from "act on" to "when the market is real" | 1h | Follow-up |
| **14** | **Rate limiting never treated as a product requirement** (§3.8), only as a defect | Per-tenant quotas/backpressure are a multi-tenant SaaS requirement with no owner | 2h | Follow-up |
| **15** | **Tenant (logo) churn rate unsourced** — `red-ops #4` and `biz-model #2` both borrow a *member* churn figure | Drives re-provisioning load and zombie-tenant accumulation | 1h | Follow-up |
| **16** | Denial-suite bodies unread (§1 Cluster G); concurrency untested (Cluster F); restore untimed (E4) | Real but each self-contained | 1–4h each | Follow-up |

**Genuinely minor — do not fund, do not pad:** the un-priced niche vendors (§2.2 — CockroachDB, Turso, Timescale,
Xata, Prisma Postgres, D1, AlloyDB/Azure all duplicate categories already covered or don't fit the schema);
accessibility (§7.4); member mid-class disconnect (§7.4); partitioning (§3.5, honestly deprioritised already);
idempotency (§3.7, partially shipped). **And three things are simply sound and should be stated as such:**
timezone handling (§7.3), `next_folio`'s counter-not-sequence design (`arch-datamodel` §0), and the
`auth.users`-deletion re-activation path (§5.1 — de-escalate it).

---

## 10. IS THIS AUDIT COMPLETE ENOUGH TO ACT ON?

**Split verdict. Be precise about which half.**

**YES for the cheap structural fixes, and they should ship this week.** The two missing indexes
(`ventas.cliente_id`, `clientes.auth_user_id` — confirmed again by the live performance advisor this session),
the `gym.owner_user_id` FK index, the `p_ip` rate-limit bypass (R2), and the anon/authenticated table grants (R3)
are all measured facts about a 15 MB database, correct at 4 gyms and at 3,000, and cheap. They do not depend on
any contested number in the corpus.

**NO for anything that depends on a ceiling number.** Do not choose a compute rung, do not decide a migration,
do not set a price, and do not tell a customer a capacity figure on the strength of extrapolations from 4 gyms
/ 15 MB / 705 rows that their own authors mark ±2× — especially now that §5.2 shows the write path they all
omitted runs up to **8.5× the read latency** the model is anchored on. E2 (seed scratch) converts that whole
class from modelled to measured for under a day of work.

**And there is one hole that makes the top recommendation unsafe — not in content, but in delivery.**

The audit's headline advice is "ship two indexes and merge the duplicate SELECT policies." Three things are
simultaneously true:

1. **The policy merge is unproven.** `verify-math #9` proved the OR *breaks* the index and explicitly did not
   prove the merge *restores* it, warning that `is_staff_of` may need rewriting as an inlinable predicate first.
2. **Nobody has diffed prod against the repo.** `red-team #3` proved the migration ledgers diverge **65/87**,
   called an object diff "the single highest-value follow-up in this document," and could not run it.
3. **The delivery path has no guard.** `red-blastradius.md:46`: migrations reach production via
   `apply_migration` against the live ref, bypassing CI entirely — "the number of automated checks between an
   agent's DDL and 3,000 tenants' rows is **zero**." No canary, no staging, no dry-run, no monitoring to notice,
   and — until R1 — no confirmed backup.

So the audit's own recommendation would be executed as an unverified DDL change, against an undiffed schema,
through the exact vector the audit ranks as blast-radius #1, with nothing watching. **The fix is four hours, not
a re-audit:** run E1 and E3 on the scratch project first, then ship. That sequencing should be stated in the
report as part of the recommendation, not left as a follow-up.

**Bottom line: the audit is sound in its findings, soft in its numbers, silent on its plan, and blind on
delivery.** Close gaps 1, 2 and 3 — roughly one working day — and it becomes decision-grade.

---

## 11. MY OWN BLIND SPOTS

1. **I read 34 files at survey depth, not audit depth.** I extracted every blind-spot section verbatim and
   grepped the full corpus for topic coverage, but I read fewer than a quarter of the 1.22 MB line by line. A
   claim I report as absent could exist in a paragraph my greps did not match — I used ~50 search terms and
   verified negatives against the repo, but absence-of-grep-hit is weaker than absence-of-content.
2. **I am the last agent, and that is a bias.** Everything already written is anchoring. A gap nobody named is
   harder for me to see than a gap 34 agents named and skipped. My §3 list is built from the orchestrator's own
   prompt of candidate structural options — **the categories neither the orchestrator nor I thought to list are
   exactly the ones still missing**, and I have no method for finding them.
3. **I did not verify the sibling findings I cite.** The $809 vs $442 Vercel/Supabase split, the 167-gym latency
   ceiling, the 65/87 ledger divergence, the ~135-gym support saturation and the 210%–408%-of-revenue support
   cost are all quoted from their authors. I checked their internal consistency, not their derivations —
   which is exactly the Cluster H failure I criticise in §1.
4. **My §5.2/§5.3 measurements are from a 4-gym seed-dominated database.** The write-path constants are real but
   the workload mix is not representative; the 112 kB/gym/day WAL figure is a floor, not a projection. And I
   read `pg_stat_statements` with the query text truncated to 60 chars, so I attributed rows to "write RPCs" by
   their `dirtied`/`wal_bytes` signature rather than by name.
5. **I ran no experiment I recommend.** E1–E5 all need the scratch project, and I inherited the same read-only
   constraint I criticise the orchestrator for imposing. I did not ask for it to be lifted.
6. **I judged product scope from the outside.** §7's ranking of what is load-bearing rests on grepping for
   absent frameworks and reading route code — I never opened the app, never throttled a connection, and never
   watched a gym use it. My claim that poor-connectivity behaviour is the rank-4 gap is a structural inference
   from the round-trip count and `red-ops`'s report, not an observation. It could be wrong in either direction.
