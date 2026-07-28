# referee — resolving the 34 agents

**Agent:** `referee` · **Date:** 2026-07-28 · **DB:** live prod `hjppxawglmukfvsgmcog`, read-only
(SELECT / EXPLAIN-without-ANALYZE / pg_catalog). No writes, no DDL.
**Method:** I re-measured every constant the disputes turn on rather than picking a side. Vendor rates
re-fetched this session with the URL named inline. Where I could not settle a dispute I say so and put
it on the owner-input list (§9) instead of guessing.

---

## 0. WHAT I MEASURED MYSELF (the constants every dispute turns on)

| constant | my measurement | agents' values | verdict |
|---|---|---|---|
| **`is_staff_of()` per call** | `select count(*) from generate_series(1,20000) i where is_staff_of(…)` = **304.175 ms**; control without the call = **18.812 ms** ⇒ **(304.175−18.812)/20,000 = 14.27 µs net / 15.21 µs gross** | verify-math 15.06 · red-breakfirst 14.54 · arch-authz 16.75 | **NOT A DISAGREEMENT.** All four inside ±15%. Use **14.5 µs**. |
| **warm seq-scan tuple cost on `ventas`** | two-point differenced: 35,000 tuples/20.823 ms vs 350,000/43.507 ms ⇒ **(43.507−20.823)/315,000 = 72.0 ns/tuple = 3,250 MB/s** at the measured 234 B/row | verify-math 68.4 ns (3,422 MB/s) · red-breakfirst 88.8 ns (2,600 MB/s) · **model-tiers 282 MB/s** | Three independent probes agree within 25%. **model-tiers' 282 MB/s is refuted — it is 11.5× too low** (§1.3). |
| **`gym_membership` plan under RLS** | `set local role authenticated` + EXPLAIN VERBOSE: `Seq Scan … Filter: ((SubPlan 1) OR (user_id = (InitPlan 2).col1))`, `SubPlan 1 → Result: is_staff_of(gym_membership.gym_id)` | identical in verify-math, verify-authz, red-breakfirst | **CONFIRMED, four independent EXPLAINs.** Correlated SubPlan, expensive arm first, no index path. |
| **`.eq("gym_id")` coverage** | `grep -rn '\.from(' packages/data/src/server` minus tests = **122**; `.eq("gym_id"` = **40** ⇒ **32.8%** | arch-tenancy 40/118 · red-team 40/122 | **red-team is right.** arch-tenancy's denominator is 4 short (§6.1). |
| **anon/authenticated TRUNCATE** | 29 public tables, `has_table_privilege(...,'TRUNCATE')` true on **29/29 for both roles**; `relforcerowsecurity` **false on 29/29** | red-blastradius | **CONFIRMED** (matches orchestrator R3). |
| **ventas indexes** | `ventas_pkey, ventas_gym_id_idx, ventas_folio_gym_uq, ventas_idem_gym_uq, ventas_gym_fecha_idx` | all agents | **CONFIRMED: no index leads on `cliente_id`.** |
| **duplicate permissive SELECT policies, `authenticated`** | exactly **3 tables**: `clientes`, `gym_membership`, `reservation` | all agents | **CONFIRMED** (matches R4). |
| **activation** | 116 `clientes`, **5** with `auth_user_id`, 9 `gym_membership` rows, 9 `auth.users` | 4.3% | **CONFIRMED, 5/116.** |
| **anon-EXECUTE functions** | 7: 5 scheduling RPCs (`prosecdef=false`) + `enviar_mensaje_contacto` (`prosecdef=true`) + `invitacion_info` (`prosecdef=true`) | red-blastradius, red-team | **CONFIRMED** (matches R4). |

**One new primary source that settles a mechanism dispute:** PostgreSQL 17
`src/backend/access/heap/heapam.c`, `initscan()` —
`if (!RelationUsesLocalBuffers(…) && scan->rs_nblocks > NBuffers / 4)` selects the `BAS_BULKREAD`
strategy; `src/backend/storage/buffer/README` — *"instead of running the normal clock sweep algorithm and
**blowing out the entire buffer cache**, a small ring of buffers is allocated … For sequential scans, a
**256KB ring** is used."* (both fetched from `raw.githubusercontent.com/postgres/postgres/REL_17_STABLE`,
2026-07-28). This refutes red-breakfirst's eviction mechanism and relocates its threshold. See §1.3.

---

# D1 — WHICH CEILING ARRIVES FIRST

## 1.1 The ruling in one paragraph

**Email arrives first, at both activation rates, and it is not close.** Three ceilings arrive before any
gym count matters at all (per-tenant restore, the Resend bounce budget, and the absence of a tenant
provisioning surface). Then Resend Free's shared caps bind at **12–25 gyms** — a number that does **not**
move with activation, which is why it is first at 4.3% *and* at 60%. The five-way database disagreement
resolves into **one curve read at five different points on two dials nobody declared**: activation `α`
and fleet tenure `Y`. At today's α=4.3% the first database ceiling is the **`ventas` scan (~53 gyms)**;
at α=60% it is the **`gym_membership` policy-OR (~26 gyms)**. The crossover is **α ≈ 9% (young fleet,
Y=1) to α ≈ 29% (Y=3)**. Every agent was right about their own regime and none of them named the regime.

## 1.2 The ordered ceiling table, with activation as an explicit parameter

`M` = 225 members/gym (midpoint of the 150–300 mandate) · `s` = 2 staff/gym · `κ` = 1.3 cumulative-churn
multiplier on `gym_membership` (rows are never deleted — no DELETE policy) · `m = M·α·κ + s`.
Latency budget for a "ceiling" = **+100 ms** added to a member page render. `Y` = fleet tenure, central 3.

| # | Ceiling | **@ α = 4.3% (today)** | **@ α = 60% (success)** | moves with α? | cost to clear | eng or purchase |
|---|---|---|---|---|---|---|
| 1 | **Per-tenant restore does not exist** (§4) | gym **#2** | gym **#2** | no | ~1 eng-week, or ~$10/mo of nightly JSONL to Storage | engineering |
| 2 | **Resend bounce/complaint budget** — account-wide 4% / 0.08%, rolling window, "shutdown without warning" | **any day** | **any day** | no | suppression table + per-tenant subdomains, ~3 eng-days, $0 | engineering |
| 3 | **No tenant provisioning surface** — the only `gym`/owner inserts in 87 migrations are seeds | gym **#5**, compounding | gym **#5** | no | ~1 eng-week | engineering |
| 4 | **Resend Free burst cap 100/day**, platform-wide | gym **#2** (one 225-roster invite drive = 2.25 days of the whole platform's budget) | gym **#2** | no | **$20/mo** | purchase |
| 5 | **Resend Free 3,000/mo**, platform-wide | **12–25 gyms** | **12–25 gyms** | no | **$20/mo** | purchase |
| 6 | **`gym_membership` policy-OR** (`resolverMiembroGym` ×2 per `/reservar`) | **315 gyms** | **26 gyms** | **yes, ∝1/α** | **`.eq("user_id", uid)` at 4 sites, ZERO DDL** | engineering |
| 7 | **`ventas` scan** (`mi_membresia`, `getClienteFicha`) — regime-2 rate | **53 gyms** (Y=3) / 160 (Y=1) | **53 gyms** | **no** | **one `CREATE INDEX`, +$1.7/mo** | engineering |
| 8 | **Vercel domain provisioning by hand** — 2 records/gym, no wildcard possible under `<gym>-admin.ibookit.lat` | **50–100 gyms** (founder's hands) | same | no | rename to `<gym>.admin.…` + 2 wildcards, ~2 eng-days | engineering |
| 9 | **`ventas` leaves the OS page cache → Micro disk at 11 MB/s** | **~317 gyms** (Y=3), render → 55 s | same | no | same `CREATE INDEX` | engineering |
| 10 | **Roster payload** — `getClientesLite`/`Roster`/`ParaPase` have no `.limit()` | not gym-count: 300 members/gym | same | no | pagination, ~2 eng-days | engineering |
| 11 | **`resolveTenant` cache** — `CACHE_MAX_ENTRIES = 500`, FIFO not LRU, per-isolate | 500 gyms/isolate | same | no | raise constant, ~1 eng-day | engineering |
| 12 | **Supabase MAU 100,000** — and see §7, this is a **wall not a bill** if Spend Cap is on | **8,547 gyms** | **730 gyms** | **yes, ∝1/α** | $0.00325/MAU, **or an outage** | purchase / **break** |
| 13 | **Compute, egress, storage, realtime, edge functions** | >1,000 gyms, all soft | same | mixed | $ | purchase |

**Read the table in one sentence:** rows 1–5 arrive before the 26th gym, none of them is a database
problem, three of them are engineering and two are the same $20/month.

## 1.3 Re-deriving the `ventas` mechanism — I rule against BOTH published models

Three claims are in play. I measured the inputs to all three.

**(a) model-tiers' 282 MB/s constant: REFUTED.** It was derived as `292.5 blocks × 8,192 B / 8.488 ms`
from `mi_membresia()`'s `pg_stat_statements` row. But `ventas` heap is **5 pages** (40,960 B / 175 rows),
so ≥98% of those 292 blocks are plpgsql frame + `clientes` index scan + `gym` lookup + PostgREST
wrapper — all constant in `G`. My differenced two-point probe cancels exactly that fixed overhead and
gives **72.0 ns/tuple = 3,250 MB/s warm**. red-breakfirst said "~8× too pessimistic"; verify-math said
"~12×". **My number says 11.5×.** Both refutations stand; verify-math's magnitude is the better one.

**(b) red-breakfirst's "buffer eviction at 118 gyms": WRONG THRESHOLD AND WRONG HARM.** Its model is
"`ventas` heap exceeds `shared_buffers` (224 MB) ⇒ the scan evicts every other tenant's pages." Postgres
does not do that. `initscan()` switches a seq scan to the `BAS_BULKREAD` 256 KB ring the moment
`rs_nblocks > NBuffers/4` — **56 MB, i.e. G ≈ 30 gyms (M=225, Y=3)** — and the buffer README says the ring
exists precisely so a large scan does *not* blow out the cache. So the transition **starts 4× earlier
than red-breakfirst says**, and the collateral damage it emphasises (evicting other tenants) is the one
thing Postgres's design prevents.

**(c) verify-math's three-regime model: CORRECT.** Its regimes are the right shape; I refine the
boundaries with the source-confirmed ring threshold. At M=225, Y=3, `ventas` heap = **G × 1.895 MB**:

| regime | condition | gyms (Y=3) | rate | added latency per render |
|---|---|---|---|---|
| 1 — normal strategy, `shared_buffers` | heap < `NBuffers/4` = 56 MB | **G < 30** | 3,250 MB/s *[measured]* | < 17 ms |
| 2 — 256 KB ring over OS page cache | 56 MB → ~600 MB (Micro RAM less shared_buffers/overhead) | **30 – 317** | ~1,000 MB/s *[modelled]* | 57 ms → 600 ms |
| 3 — 256 KB ring over disk | > ~600 MB | **> 317** | **11 MB/s** *[Supabase Micro baseline, doc-fetched]* | **55 s and climbing** |

**+100 ms is crossed at G ≈ 53 gyms.** model-tiers' "+1 s at 167 gyms" is wrong in derivation and lands
near the truth by luck (its 282 MB/s sits between the warm and cold rates, which is exactly why the
error cancelled). **All three agents converge on the same fix, and the fix is total:**
`create index on ventas (cliente_id, created_at desc, id desc)` collapses the per-call working set from
`G × 1.895 MB` to ~3 blocks **regardless of G** and deletes rows 7 and 9 from the table above.

**Confidence:** regime boundaries **measured** (ring threshold from source, warm rate from my probe, disk
baseline from Supabase's doc); the regime-2 rate of ~1,000 MB/s is **modelled** and is the softest number
in this section — it moves ceiling #7 between ~30 and ~170 gyms.

## 1.4 Re-deriving the `gym_membership` mechanism — and the crossover that settles the dispute

Cost per unfiltered read = `G · m · 14.5 µs`. `/reservar` pays ≈1.5× because `getEsMiembro`
(`agenda-miembro.ts:172`) is a second, deliberately un-`cache()`d read of the same table.
verify-authz found a 4th call site the others missed (`clase-miembro.ts:133-136`, the class-detail page)
— **I accept that; the fix is 4 sites, not 3.**

| α | `m` = 225·α·1.3 + 2 | +100 ms on a single read | **+100 ms on `/reservar`** | +1 s on `/reservar` |
|---|---|---|---|---|
| 4.3% (measured) | 14.6 | 472 gyms | **315 gyms** | 3,150 |
| 20% | 60.5 | 114 | **76** | 760 |
| 60% | 177.5 | 39 | **26** | 260 |
| 100% | 294.5 | 23 | **16** | 160 |

**The crossover.** Set the two per-gym costs equal — this is the number that dissolves the whole dispute:

```
ventas (regime 2, Y=3):   1.90 ms per gym      gym_membership: m × 0.02175 ms per gym
1.90 = m × 0.02175  ⇒  m = 87.4  ⇒  225·α·1.3 + 2 = 87.4  ⇒  α = 29.2%
same at Y=1 (ventas 0.633 ms/gym):                              ⇒  α =  9.3%
```

> **Below α ≈ 9–29% (the band spanned by fleet tenure Y=1→3), `ventas` is the first database ceiling.
> Above it, `gym_membership` is. Production today is at α = 4.3%, so `ventas` is first today by ~6×.
> The stated product goal is to raise α, and the day it passes ~15% the ordering flips.**

**Rulings, agent by agent:**

| agent | claim | ruling |
|---|---|---|
| model-tiers | ventas index; +1 s at ~167 gyms | **RIGHT TABLE, WRONG DERIVATION, ACCIDENTALLY-NEAR NUMBER.** Its load-bearing constant is 11.5× off; the error cancelled against a regime it did not model. |
| red-breakfirst | 282 MB/s is 8× too pessimistic; real mechanism is eviction at 118 gyms | **HALF RIGHT.** The refutation is correct and valuable. The replacement threshold (118) and the harm (cache blowout) are both wrong — `BAS_BULKREAD` at `NBuffers/4` = 30 gyms, and the ring exists to prevent blowout. |
| verify-math | `gym_membership` duplicate policy; 33 gyms full-activation / 692 at 4.3% | **RIGHT MECHANISM, WRONG RANK.** Its three-regime `ventas` model is the best in the audit — and it ranked `gym_membership` above the very model it authored without noticing `ventas` is 6× larger per render at today's α. |
| arch-authz | `resolverMiembroGym` at 10–32 gyms | **RIGHT MECHANISM.** The number is a 60–100%-activation number presented without the qualifier. |
| verify-authz-ceiling | "one curve, not a disagreement"; 10–41 @ 60–100%, 200–400 @ 4.3% | **CORRECT, and the single most useful reframing in the audit.** My numbers (26–39 and 315) sit inside its bands. |
| verify-email / alt-email | email is first at ~9–18 gyms | **CORRECT ON THE ORDERING.** My recompute puts it at 12–25 gyms, and it is the only top-5 ceiling that is activation-independent. |

**Confidence: measured** on both mechanisms and all four constants; **modelled** on every gym count
(this database has 4 gyms, 15 MB and a 99.996% cache-hit rate — every projection is into a regime it has
never entered).

## 1.5 The correction to the "success detonates the database" headline

red-breakfirst and verify-authz both lead with *"the sharpest ceiling gets nearer as the product
succeeds."* That is **true of exactly one row in §1.2 (row 6) and false of the other four in the top
five.** `ventas` volume is driven by *sales*, not activations. Resend volume is driven by roster size and
renewals, not activations — a member who never activates still gets receipts. The restore gap and the
provisioning gap are activation-blind. **The framing is memorable and it over-weights one ceiling that is
currently sixth.** State it as: *raising activation moves one ceiling by 12×, and it is the one whose fix
is a one-line `.eq()` with zero DDL.*

---

# D2 — IS THE VERCEL NUMBER RIGHT?

## 2.1 The rates: every one verified, including the one verify-math distrusted

| rate | verify-math | my fetch (2026-07-28) | source |
|---|---|---|---|
| Pro platform fee | $20/mo, 1 seat, $20 credit | **$20/mo, 1 deploying seat, $20 monthly credit** | `vercel.com/docs/plans/pro-plan` |
| Included Edge Requests | 10,000,000 | **10,000,000** | same |
| Included Fast Data Transfer | 1 TB | **1 TB** | same |
| Edge Requests overage (iad1) | $2.00/M | **$2.00 per 1,000,000** | `vercel.com/docs/pricing/regional-pricing/iad1` |
| Fast Data Transfer overage (iad1) | $0.15/GB | **$0.15 per 1 GB** | same |
| Active CPU (iad1) | $0.128/hr | **$0.128/hour** | `vercel.com/docs/functions/usage-and-pricing` |
| Provisioned Memory (iad1) | $0.0106/GB-hr | **$0.0106/GB-hr** | same |
| Invocations | $0.60/M — *"the weakest number here"* | **$0.60 per million** — stated as a rate, not only an example: *"If your function receives 1.5 million requests on a Pro plan, Vercel bills those invocations at $0.60 per million"* | same |

**All eight rates confirmed. verify-math's self-flagged weak link (Invocations) is fine.** It is also
correct that Provisioned Memory is billed through I/O wait — verbatim: *"Vercel bills Provisioned Memory
continuously until the last in-flight request finishes… If the request is waiting on I/O, CPU billing
pauses but memory billing continues."* The us-west-2 ↔ iad1 argument survives.

## 2.2 Two lines verify-math omitted — both increase its number

1. **Fast Origin Transfer: $0.06/GB with NO included allowance.** verify-math listed the rate and then
   left it out of the cost table. Vercel: *"Fast Origin Transfer is incurred when using several Vercel
   products including Vercel Functions, **Middleware**…"* and *"If using Middleware, it is possible to
   accrue Fast Origin Transfer **twice** for a single Function request."* This app's `proxy.ts` runs on
   every navigation. At verify-math's own 1.68 TB of function-generated bytes at 3,000 gyms, FOT is
   **$100–200/month** and there is no free tier to absorb it.
2. **Edge Request CPU Duration: $0.30/hour beyond 10 ms per request.** `proxy.ts` awaits `resolveTenant`
   (2 sequential Supabase round trips on a cache miss, cross-continent) and `supabase.auth.getClaims()`.
   Whether this bills as Edge Request CPU Duration or as fluid-compute Invocations depends on which
   runtime `proxy.ts` deploys to — a dashboard fact (§9). Band: **$10–150/month at 3,000 gyms.**

**One thing verify-math got right that is easy to get wrong:** the 10M Edge Requests and 1 TB FDT are
**team-wide, not per project**. RED has two Vercel projects on one team, so the allowance is deducted
once. verify-math modelled it that way.

## 2.3 Sanity-checking 112,000 edge requests/gym/month

That figure is `7,000 page views × 16 edge requests/page view`. I checked both factors against the code
and against Vercel's own definitions.

**Edge requests per page view — the 16 is defensible but the band is wide.**
Vercel: *"Static assets and functions all incur CDN Requests"* — so every JS chunk, CSS file, font and
icon counts, and only browser-cache hits (which never reach the CDN) are free.
- The client app ships **16 self-hosted `.woff2` files** in `.next/static/media`, plus a Next 16 App
  Router chunk set (webpack/main-app/framework/layout/page/polyfills + shared) typically 8–12 files, plus
  CSS and icons. **A cold first visit is realistically 15–25 edge requests.**
- A **warm repeat visit** is far cheaper: `_next/static/*` ships `immutable` cache headers, so a client
  navigation costs ~1 RSC payload request plus prefetches. **Warm ≈ 1–5.**
- The multiplier Vercel itself warns about is the other direction: *"Excessive polling or data
  fetching… can contribute to increased requests"*, and `<Link>` viewport prefetch is on by default.
  **A link-dense screen can cost 10+ prefetch RSC requests per view.**

**Page views per gym per month — verify-math's own rank-1 sensitivity, and it is right to flag it.**
Its 7,000 = 3,000 member + 3,000 admin desk + 1,050 anon. Cross-check against the one measured anchor:
`pg_stat_statements` shows 913 PostgREST requests/day platform-wide across 4 tiny gyms ≈ 228/gym/day; at
~4 queries/render that is ~57 renders/gym/day *today, at ~29 members and 1 activated member per gym*.
Scaling that to M=225 with real booking adoption lands anywhere in **4,000–25,000 page views/gym/month**.

**My defensible range, replacing the point estimate:**

| scenario | page views/gym/mo | edge req/page view | edge req/gym/mo | @3,000 gyms | **Edge Request cost** |
|---|---|---|---|---|---|
| Low (light adoption, warm caches) | 4,000 | 4 | 16,000 | 48 M | **$76/mo** |
| **Central** | 7,000 | 10 | 70,000 | 210 M | **$400/mo** |
| verify-math | 7,000 | 16 | 112,000 | 336 M | **$652/mo** |
| High (heavy booking, prefetch-dense, busy desk) | 18,000 | 20 | 360,000 | 1,080 M | **$2,140/mo** |

## 2.4 Ruling

> **Vercel's rates are all correct. The $809/mo total is defensible but carries a ±5× band
> ($150 – $3,000), and the headline "Vercel is 1.8× Supabase" does NOT survive that band.**

Two reasons the comparison is weaker than it reads:
1. Both sides are dominated by an unmeasured number. Vercel's is page views/gym/month; **Supabase's $442
   is 90% a $400 compute rung that verify-math itself marks `asserted`.** This is a comparison between
   two guesses, not between a guess and a measurement.
2. Adding the two omitted lines (§2.2) pushes Vercel *up* by $110–350, which strengthens the direction
   while widening the band.

**What survives, and it is genuinely important:** *Vercel is the same order of magnitude as Supabase and
plausibly larger; **Edge Requests alone is the single largest meter in the entire stack**; and exactly
one of 34 agents priced it.* That finding stands. The specific dollar figure should be quoted as a range
until Vercel Web Analytics is sampled for one month (Pro plan, $0.03/1K events — sample 4 gyms, do not
leave it on: at 21M page views/month it would cost $630/mo itself).

**Confidence:** rates **measured** (all fetched today). Volume **modelled** with a ±5× band. The
conclusion "cost is not this business's risk" is unaffected: even the $3,000 high case is **$1/gym/month
= 17 MXN = 5.8% of the 300 MXN floor**.

---

# D3 — HOW BAD IS THE ANON SURFACE, REALLY?

Orchestrator R2/R3 settle the mechanism. Here is the quantification, and it is worse than red-blastradius
modelled — because of a field nobody read and a Supabase behaviour nobody looked up.

## 3.1 What the attacker actually gets

Live signature and body (`pg_proc`, read this session):

```sql
enviar_mensaje_contacto(p_gym_slug text, p_nombre text, p_correo text, p_mensaje text,
                        p_ip text DEFAULT NULL)  -- SECURITY DEFINER, anon EXECUTE, search_path=''
  …
  if p_ip is not null then          -- ← omit p_ip and the rate limit does not exist
    select count(*) into v_recent from public.contact_message
     where gym_id = v_gym and ip = p_ip and created_at > now() - interval '1 hour';
    if v_recent >= 5 then raise exception 'Demasiados mensajes…'; end if;
  end if;
  insert into public.contact_message (gym_id, nombre, correo, mensaje, ip) values (…);
```

Prerequisites, all free: the **publishable key** (ships in the browser bundle) and **a gym slug**.
`has_table_privilege('anon','public.gym_domain','SELECT')` = **true** with policy
`gym_domain_anon_select USING (true)` — so the attacker can enumerate all 3,000 tenants' hostnames and
gym UUIDs in one request and spread writes across every tenant to defeat per-gym alerting. (`gym` itself
is correctly revoked from anon — that was good work; `gym_domain` was missed.)
Turnstile lives in the Next server action (`apps/client/src/app/contacto/actions.ts`); the RPC is
reachable directly at `POST /rest/v1/rpc/enviar_mensaje_contacto`. **Different door, no lock.**

## 3.2 The amplification nobody found: `ip` is unvalidated free text

`contact_message` CHECK constraints (live): `nombre ≤ 80`, `correo ≤ 160`, `mensaje ≤ 2000`.
**`ip` has no CHECK and no validation anywhere in the function.** It is attacker-controlled `text`,
bounded only by the btree entry limit on `contact_message_ratelimit_idx (gym_id, ip, created_at)`
(~2,704 B) — so an attacker can write **~2.6 KB of garbage into `ip` on top of the 2 KB `mensaje`, and
have it duplicated into the index**. That roughly **3.5×'s the bytes per request**:

| payload | heap + TOAST | 3 indexes | **total/row** |
|---|---|---|---|
| naive (2 KB mensaje, real-looking IP) | ~2.4 KB | ~90 B | **~2.5 KB** (matches red-blastradius) |
| **max (2 KB mensaje + 2.6 KB `ip`)** | ~6.0 KB | ~2.76 KB | **~8.7 KB** |

## 3.3 How fast it fills the disk — and the disk figure I am assuming

**Provisioned disk assumption: 8 GB, the Pro included baseline.** Source: Supabase compute-and-disk,
fetched 2026-07-28 — *"8 GB included"*, then *"$0.125 per GB"*, and *"You can increase disk size but
cannot decrease it."* **I could not read the actual provisioned size from SQL** (`pg_database_size` is
data, not disk); it is a dashboard field → §9.

**Autoscale changes the answer completely, and nobody modelled it.** Supabase database-size doc, fetched
2026-07-28: disk expands at **90% utilization**, grows **+50%** (max +200 GB), **maximum four resizes per
rolling 24 h**, and — *"If your project reaches **95% disk utilization** and has exhausted your
modification quota, your project will enter **read-only mode**."*

So the attack has a defined terminus: `8 → 12 → 18 → 27 → 40.5 GB`, quota exhausted, then read-only at
95% of 40.5 GB ≈ **38.5 GB written inside one rolling 24-hour window.**

| sustained rate | naive 2.5 KB/row | **max 8.7 KB/row** |
|---|---|---|
| 100 req/s | 21.6 GB/day → read-only in **~43 h** (2 windows) | 75 GB/day → **read-only in ~12 h** |
| 1,000 req/s | 216 GB/day → **~4.3 h** | 751 GB/day → **~75 minutes** |

**Cost to the attacker: a $5/month VPS.** No account, no key theft, no authentication. DB-side work per
request is one indexed `gym.slug` lookup (`gym_slug_key` exists) + three length checks + one insert —
under 2 ms, so the database is not the throttle. The only unmodelled brake is an undocumented Supabase
gateway rate limit on `/rest/v1/rpc/*` (§10, blind spot).

**The damage is worse than an outage, because it is irreversible.** Disk never shrinks. Deleting every
`contact_message` row and running `VACUUM FULL` leaves the disk at 40.5 GB — **+32 GB × $0.125 =
+$4/month, forever, per attack**, and the attack is repeatable monthly. And read-only mode is
**platform-wide**: every one of 3,000 gyms stops taking sales simultaneously.

## 3.4 The cheapest fix — ranked

| # | fix | cost | closes |
|---|---|---|---|
| **1** | **Derive the IP inside the function instead of trusting the parameter:** drop `p_ip` from the signature and read `current_setting('request.headers', true)::json ->> 'cf-connecting-ip'` (set by Supabase's edge, not spoofable by the caller). Fail closed if NULL. | **~1 hour**, one migration + one call-site edit | the whole vector — the rate limit becomes real |
| 2 | `revoke execute on function public.enviar_mensaje_contacto(…) from anon;` and route the server action (which already gates on Turnstile) through a service-role client | ~20 min, but puts a `service_role` key in the public-facing app's env | the whole vector, at a credential-posture cost |
| 3 | `alter table public.contact_message add constraint … check (char_length(ip) <= 45);` | **5 minutes** | 3.5× of the amplification. Defense in depth, ship it regardless |
| 4 | `revoke select on public.gym_domain from anon;` — `resolveTenant` runs server-side (`proxy.ts`), verify no browser path reads it first | ~30 min | tenant-directory enumeration |
| 5 | `revoke truncate, references, trigger on all tables in schema public from anon, authenticated;` + `alter default privileges … revoke truncate …` | ~20 min | R3's latent hole |
| 6 | A `tools/guards/` test asserting no new `public` function is anon-EXECUTE unless allow-listed — same shape as the existing `rpc-write-coverage` guard, so the pattern is proven in this repo | ~2 h | the systemic defect that produced all of the above |

**Ruling:** red-blastradius is **correct and under-stated**. The vector is live, unauthenticated,
unbounded, free, and — because of the unvalidated `ip` field plus Supabase's 4-resize autoscale terminus
— it converts from "fills the disk eventually" to **"platform-wide read-only in 1–12 hours, plus a
permanent bill ratchet."** Fix #1 + #3 is under two hours of work and it is the highest
value-per-minute engineering item in this entire audit.

**Confidence:** function body, grants, constraints and index **measured live**. Autoscale and disk rates
**primary-sourced today**. Attacker throughput **modelled** — I did not send a single request.

---

# D4 — PER-TENANT EXPORT AND THE TRUE RTO

## 4.1 The dispute is mostly an artefact of summary compression

I read both files. **arch-tenancy is not wrong.** Its detail row says *"`respaldo.ts` … reads `ventas`,
`asistencias`, `clientes`, `paquetes` … — **4 of 28 tables**, read-only, for a CSV/Excel export"*, and its
summary line says *"the **reimport** half of a per-gym restore exists for 0 of 28 tables (respaldo.ts
reads 4 tables, export-only)"*. Both statements are correct and consistent. The "0 of 28" that
red-blastradius refutes is a compression of arch-tenancy's *summary*, not its finding.

**red-blastradius is still the more useful file** because it went and read the export and found five
properties that decide whether it functions as a recovery artefact. I verified each:

| claim | my check | verdict |
|---|---|---|
| Export covers 4 of 29 tables | `grep 'from("' respaldo.ts` → `ventas, asistencias, clientes, paquetes` (each appearing twice for the paged reader). `count(*)` of public tables = **29**. | **CONFIRMED. 4/29 = 13.8%.** |
| Primary keys dropped | `rows.ts:174-206` `shapeClientes` emits Nombre/Teléfono/Email/…/Alta — **no `id`** | **CONFIRMED** |
| FKs denormalized to display names | `rows.ts:161-164`: `const nombrePorId = new Map(...); const nombreDe = (id) => nombrePorId.get(id) ?? EM_DASH;` then `shapeVentas`/`shapeAsistencias` emit `nombreDe(v.cliente_id)` | **CONFIRMED — the referential graph is destroyed at export time** |
| Collisions are possible | live: **61/116 `clientes` have `email is null`**, no unique constraint on `tel`, PK on `id` is surrogate | **CONFIRMED — two members named "Juan Pérez" are indistinguishable on reimport** |
| Default window is 24 months, not full history | `respaldo.ts:166` `getMonth() - 23` | **CONFIRMED** |
| Import path is 0 of 29 | `grep -rn "xlsx.read\|readFile\|parse.*csv\|bulkInsert" packages/data/src apps/*/src` → only two `.test.ts` hits | **CONFIRMED — zero import code anywhere** |

## 4.2 The 25 tables with no export at all

`about_value, class_session, class_session_coach, class_type, class_type_bring_item,
class_type_workblock, coach, cobro, contact_message, facility, faq, gym, gym_contact, gym_domain,
gym_folio_counter, gym_membership, perfil, plan_feature, plantillas, reservation, room,
schedule_template, schedule_template_coach, schedule_template_week, stat`

That is the entire agenda, schedule, branding, billing-config and **membership** subgraph. A gym restored
from `respaldo.xlsx` would have a roster and a sales list and **no classes, no coaches, no schedule, no
brand, no staff account**.

## 4.3 The ruling on RTO

| scenario | RTO | basis |
|---|---|---|
| Bad Vercel deploy | ~1 min | Vercel instant rollback — **asserted**, never exercised in this project |
| Bad migration, forward-fixable | ~10 min | assumed |
| Bad migration, needs a restore | 4–24 h, **all 3,000 tenants rolled back together** | modelled from size ÷ published tier throughput |
| **One tenant's data destroyed** | **∞** | **measured.** No import for any of 29 tables; the export covers 4, drops PKs, and denormalizes FKs to names |

> **The true per-tenant RTO is ∞, and it is worse than "no mechanism": the mechanism that exists is
> lossy in exactly the way that makes reconstruction impossible.** The best available recovery is a
> human retyping a spreadsheet, guessing which "Juan Pérez" each sale belonged to, into a system whose
> `ventas_folio_gym_uq (gym_id, folio)` will collide with every folio `next_folio` has since issued.

**Cheapest fix, and it is cheap:** a nightly per-gym `COPY (select * from <t> where gym_id = $1) TO …`
for all 28 gym-scoped tables into Supabase Storage as JSONL — **IDs intact, FK graph intact,
restorable**. At the measured 15 MB / 4 gyms that is ~11 GB/night at 3,000 gyms; Storage is $0.021/GB-mo.
**~$5–15/month + ~2 days.** Second half, free: add `deleted_at` and an `audit` table to
`clientes`/`ventas` so the common case (operator error) never needs a restore at all.
**Exit trigger:** the first paying gym that asks for its data back and cannot get it.

---

# D5 — DELETION SEMANTICS: BOTH ARE TRUE, AND THEY ARE DIFFERENT FKs

I read all 50 foreign keys from `pg_constraint`. **This was never a contradiction.** Precisely:

## 5.1 FKs pointing at `gym` — 28 of them, and they split

| ON DELETE | count | tables |
|---|---|---|
| **NO ACTION** | **8** | `asistencias`, `clientes`, `cobro`, `paquetes`, `perfil`, `plan_feature`, `plantillas`, `ventas` |
| **CASCADE** | **20** | `about_value`, `class_session`, `class_session_coach`, `class_type`, `class_type_bring_item`, `class_type_workblock`, `coach`, `contact_message`, `facility`, `faq`, `gym_contact`, `gym_domain`, `gym_folio_counter`, `gym_membership`, `reservation`, `room`, `schedule_template`, `schedule_template_coach`, `schedule_template_week`, `stat` |

**red-blastradius's claim, restated precisely:** the **eight money/roster-bearing** FKs to `gym` are
NO ACTION, so `delete from gym where id = …` **errors out**. That is correct and it is a real,
load-bearing shield. It is *not* true that all FKs to `gym` are NO ACTION — 20 of 28 are CASCADE. The
shield works because the eight that matter are the blockers, not because the topology is uniform.

## 5.2 FKs pointing at `clientes` — all three CASCADE

`ventas_cliente_id_fkey`, `asistencias_cliente_id_fkey`, `reservation_member_id_fkey` — **all
`ON DELETE CASCADE`, confirmed.** arch-datamodel and verify-datamodel-invariants are correct: deleting
one member destroys their entire revenue ledger, attendance history and reservations, with no trigger,
no soft-delete, no archive.

## 5.3 FKs pointing at `auth.users` — the third topology, and the sharpest one

| edge | ON DELETE | consequence |
|---|---|---|
| `gym_membership.user_id → auth.users` | **CASCADE** | deleting one auth user silently strips their memberships |
| `gym.owner_user_id → auth.users` | SET NULL | …and orphans the gym's ownership pointer |
| `clientes.auth_user_id → auth.users` | SET NULL | …and unlinks the member from their roster row |

Measured: **4 staff rows for 4 gyms — exactly one owner account per gym**, and no product surface
creates an owner membership. So one deleted `auth.users` row = one gym with **zero staff, permanently**,
recoverable only by the founder hand-writing SQL. At 3,000 gyms that is 3,000 independent lockout risks.

## 5.4 The ruling on the actual hazard

`clientes` has **four** policies live: `clientes_member_select`, `clientes_staff_select`,
`clientes_staff_insert`, `clientes_staff_update`. **No DELETE policy on `clientes`. No DELETE policy on
`ventas`.** So the cascade in §5.2 is unreachable from the app today.

> **red-blastradius is right about the present tense: the realistic in-app destruction verb is `UPDATE`.**
> `clientes_staff_update` grants an operator UPDATE on every column of every row in their gym —
> `nombre`, `tel`, `email`, `clases_restantes`, `vence` — with no audit table, no soft delete, and no
> history anywhere except `asistencias.deleted_at`.
>
> **arch-datamodel is right about the future tense:** `ON DELETE CASCADE` on `ventas_cliente_id_fkey` is
> a landmine sitting directly under the single most obvious next admin feature ("remove a member"), and
> given that `ventas` has no UPDATE policy, no DELETE policy, no void RPC and no trigger, the destroyed
> history is **unreconstructable** — the same table that cannot be corrected also cannot be recovered.

**Both should be fixed and they are different fixes.** `alter constraint ventas_cliente_id_fkey … on
delete restrict` (or `set null`) is one migration with zero data impact today. The UPDATE hazard needs an
audit table, which is the same $0 change §4.3 already recommends.

---

# D6 — THE THREE MINORS

## 6.1 `.eq("gym_id")` coverage: 40/122, and red-team is right

My own grep over `packages/data/src/server` excluding tests: **122** `.from(` call sites across 27 files,
**40** `.eq("gym_id"` occurrences ⇒ **32.8%**. arch-tenancy's `40/118 = 34%` has a denominator 4 short.
Trivially, red-team's number is the correct one.

**But I rule against how both files interpret it.** Two qualifications neither states:
- **28 of 29 public tables carry a `gym_id` column** (only `gym` does not), so the denominator objection
  is weak — but ~10 of the 122 calls are on `gym` (3), `gym_domain` (3) and `gym_membership` (4), where
  `.eq("gym_id")` is either impossible or the wrong predicate. The honest denominator is ~112 ⇒ **35.7%**.
- **This is a performance metric, not a security metric.** Migration `20260714080000` rewrote 25 SELECT
  policies to a hashed InitPlan, so the gym scope *is* in every plan — as a filter, not an index cond. A
  missing `.eq("gym_id")` costs a scan, not a leak. Both files should say so; red-team's framing as a
  defect rate invites the wrong conclusion.

## 6.2 MAU cost: $0, $0–465, $0–559 and $845–1,430 are **the same formula at four different φ**

```
MAU_overage($) = max(0, G · (M·φ + s) − 100,000) × $0.00325     [rate + 100k included: primary-fetched]
```
At `G = 3,000`, `M = 225`, `s = 2`:

| φ (monthly-active fraction of roster) | MAU | overage |
|---|---|---|
| 0.75% (measured today) | 11,060 | **$0** |
| 10.5% | 76,900 | **$0** |
| **14.5% — the break-even** | 100,000 | **$0** |
| 20% | 141,000 | $133 |
| 38.5% | 265,900 | $539 |
| 60% | 411,000 | $1,011 |
| 100% | 681,000 | $1,888 |

**Nobody is wrong.** `$845–1,430` is a φ≈50–75% assumption; `$0–559` and `$0–465` are the corrected
low-φ bands; `$0` is today. **Ruling: MAU is $0 and stays $0 until platform-wide monthly-active accounts
exceed 100,000 — at 3,000 gyms × 225 members that is φ = 14.5%.** Report it as a formula, never a number.

Two things that *do* matter and only one agent noticed either:
- **Third-Party MAU is billed at the identical rate and quota** (`$0.00325`, 100,000 included) —
  alt-auth-only, primary-sourced. So "swap the auth provider to cut the MAU line" saves **nothing** while
  you still use Supabase RLS with a JWT. That closes the entire alt-auth branch on cost grounds.
- **See §7 — with the Spend Cap on, this is not a bill.**

## 6.3 "A medium" vs "the hardest ceiling": measuring present vs future, and that IS the resolution

arch-tenancy measured the `gym_membership` bare call sites at **0.69–0.72 ms** — a true statement about a
**9-row** table. arch-authz modelled the same query at **G × m** rows. **They are the same finding at two
points on a slope, and red-breakfirst already said so.** I confirm it, and add the number that makes it
decidable: the slope is `14.5 µs per row`, so arch-tenancy's 0.7 ms and arch-authz's 100 ms differ by a
factor of exactly the row count. Neither is a "rating" of severity; one is `f(9)` and one is `f(G·m)`.

**Where I break the tie:** at today's α it is **sixth** in §1.2, behind five non-database ceilings, and
arch-tenancy's "a medium" is the better description of production *today*. At the activation the roadmap
is trying to reach it is **second**, and arch-authz's framing is the better description of production
*next year*. Because the fix is `.eq("user_id", uid)` at four call sites with **zero DDL** — the covering
index `gym_membership_pkey btree (user_id, gym_id)` already exists — the disagreement has no decision
attached to it. Ship the four lines and the dispute is moot.

---

# 7. DISPUTES I FOUND THAT NOBODY FILED

## 7.1 ⚠️ The Spend Cap converts most "purchase" ceilings into "break" ceilings — and every cost agent classified them wrong

Supabase cost-control doc, fetched 2026-07-28, verbatim: *"After exceeding the quota for a usage item,
**further usage of that item is disallowed** until the next billing cycle. You don't get charged for
over-usage."* Covered items include **Disk Size, Egress, MAU (all variants), Edge Function Invocations,
Storage Size, Realtime**. Not covered: Compute, PITR, Custom Domain, IPv4, Disk IOPS/Throughput.

Every cost file in this audit — model-tiers, verify-math, price-meters, red-breakfirst's §1 column
"eng or purchase?" — classifies disk, MAU and egress overages as **bills you can choose to pay**. With
the Spend Cap **on**, they are not. They are hard walls, and each one is platform-wide:

| meter | with Spend Cap OFF | **with Spend Cap ON** |
|---|---|---|
| MAU > 100,000 | $133–1,888/mo | **new logins disallowed for all 3,000 gyms** |
| Disk > provisioned | $0.125/GB-mo | **writes disallowed for all 3,000 gyms** |
| Egress > 250 GB | $0.09/GB | **reads disallowed for all 3,000 gyms** |

**Ruling:** red-breakfirst's "eng or purchase?" column and verify-math's "$16.97 of meters, no meter
produces a wall" are both **conditionally wrong**, and the condition is a checkbox nobody has read. This
also changes D3: with the cap on, the `enviar_mensaje_contacto` attack does not ratchet a bill — it
turns the platform read-only, and stays that way until the next billing cycle.
**→ owner-input list (§9). 30 seconds, and it re-classifies six rows of two different agents' tables.**

## 7.2 The Free-tier analysis is now dead budget, and two files still carry it

Orchestrator R1 settles this (paid plan, 60/60 `pg_backup_start`/`pg_backup_stop` pairs over 59.43 days).
I flag it only because **verify-math §3/§4(a) and red-breakfirst §4.7/§5 still present Free-tier
ceilings as live**, and red-breakfirst ranks "Supabase Free 500 MB → 12–67 gyms" as its **row #7**.
That row should be **deleted**, which moves everything below it up one place. Its §5 ("the unresolved
plan question", ~600 words) is void. No agent is at fault — R1 landed after they wrote — but a reader of
those files without R1 in hand will act on a deleted risk.

## 7.3 `getEsMiembro`'s `LIMIT 1` with no `ORDER BY` is worst for exactly the wrong population

verify-authz §6.3 found this and no one else engaged with it; I confirm the mechanism from the plan
shape. `agenda-miembro.ts:172` is `select gym_id … limit 1` with no `user_id` predicate and no
`ORDER BY`, so Postgres scans until it finds one visible row. RLS makes only the caller's own row
visible, and a **newly activated** member's row is physically the most recently inserted — so they must
scan past nearly the entire table. **The query is structurally worst-case for first-time claimers,
immediately after `/activar`, on the exact request that decides whether activation felt like it worked.**
Same one-line fix. Worth calling out separately because it is a *conversion* risk, not just latency.

## 7.4 `is_staff_of` is evaluated on every row on BOTH paths, not just the member path

Three files argue the OR does not short-circuit usefully on the member path (true — `is_staff_of` is
false for every row, so both arms run). Nobody checked the **staff** path. `resolveOperatorGym`
(`gym.ts:49-55`) runs on every admin-app request, and there `is_staff_of` returns **true** for the
caller's own rows — so the short circuit fires, but only after the expensive arm has already been
evaluated, because it is written first. **Both paths pay `G · m · 14.5 µs`.** The `role = ANY(...)`
prefilter on Q3 bounds the function calls to staff rows (≈ `G · s`, gym-count-linear rather than
member-count-linear), which is a real and under-stated mitigation — but the `ORDER BY gym_id LIMIT 1`
still forces materializing every surviving row. arch-authz and verify-authz both got this right in
detail; I am promoting it because the admin app's ceiling is `G · 2 · 14.5 µs` = **+100 ms at ~3,400
gyms**, i.e. the admin side is genuinely fine and should not be lumped in with the member side.

## 7.5 The three "one email account" findings are one finding with three fixes, and the cheapest was buried

red-blastradius, alt-email, verify-email-ceiling and red-breakfirst all rank the shared Resend identity
highly, but only red-blastradius names the cheapest mitigation, and it is buried in its §5.4(a):
**one `re_…` key is simultaneously the Supabase custom-SMTP password and `RESEND_API_KEY`**
(`hitl-72-resend-live.md:59`, verbatim: *"the same key serves both roles"*). **Splitting it into two keys
is $0 and ten minutes**, and it decouples "invites got suspended" from "nobody on the platform can log
in." That is the single highest value-per-minute item in the email cluster and it is not in any file's
top-5 list.

---

# 8. HONEST COUNTERPOINT — what is sound, said plainly before it is ranked

Rule 7 requires this and it is not a formality. Measured this session or confirmed across agents:

- **All 101 RLS policies use `(select auth.uid())`** — zero bare calls. This is the single most common
  Supabase performance mistake and it is absent. Migration `20260714080000` deliberately rewrote 25 SELECT
  policies to hashed InitPlans and **correctly documented why `gym_membership`'s two could not be**
  (`infinite recursion detected in policy`). The one remaining per-row predicate in the schema is there
  for a stated, correct reason.
- **RLS is enabled on 29/29 public tables**, with an `ensure_rls` event trigger to keep it that way, and
  `search_path=''` on every function. There are **no `FOR ALL` policies**.
- **`ventas` and `clientes` have no DELETE policy** — the ledgers are append-only by construction, not by
  convention.
- **`gym_folio_counter` is deny-all by design**, and the migration comment says so explicitly. The
  advisor's `rls_enabled_no_policy` INFO on it is a false positive.
- **Connection exhaustion is structurally impossible.** PostgREST connects from the DB host; Vercel opens
  zero Postgres sockets; the repo has no Postgres driver, only `@supabase/supabase-js` over HTTP.
- **Three of Supabase's seven meters are literally zero** — `storage.objects` = 0, `realtime.subscription`
  = 0, and no `.channel(` anywhere in the repo. Nobody should invent a concern about them.
- **The `gym` table is correctly revoked from anon** at the grant level, which is why its
  `USING (true)` policy is inert. That was deliberate, careful work.
- **The fix for the sharpest database ceiling requires zero DDL** because `gym_membership_pkey` is
  already `btree (user_id, gym_id)` with `user_id` leading.

**Nothing in §1.2 requires a redesign.** Seven of the first ten items are between one line and one week
of work, and the two purchasable ones cost **$45/month combined**.

---

# 9. OWNER-INPUT LIST — unresolvable from a read-only SQL session, ranked by value per minute

| # | question | why it matters | where | time |
|---|---|---|---|---|
| **1** | **Is the Supabase Spend Cap ON or OFF?** | §7.1 — decides whether disk/MAU/egress overages are bills or **platform-wide outages**, and re-classifies six rows across two agents' tables. Also decides the outcome of the §3 attack. | Dashboard → Organization → Billing | 30 s |
| **2** | **What is the provisioned disk size today?** | §3.3 assumes the Pro 8 GB baseline. If it has already autoscaled, the attack terminus moves. | Dashboard → Settings → Database | 30 s |
| **3** | **Is the Resend account on Free or Pro?** | Ceilings #4 and #5 in §1.2 — the whole 12–25-gym band. The repo's last record (`2026-07-22-email-infrastructure-investigation.md:69`) says Free; the API key is send-only restricted and cannot read billing. | Resend → Settings → Billing | 30 s |
| **4** | **What is `/auth/v1/otp`'s configured rate limit?** | red-breakfirst ranks it #3 (gym #1 of any launch) on an **asserted** default. Not in `pg_settings`, not in the public `/auth/v1/settings` endpoint. Supabase's own two docs pages contradict each other on the default (30/hr vs 360/hr — both re-fetched and both current, so this is a vendor documentation defect). | Dashboard → Auth → Rate Limits | 30 s |
| **5** | **Pro vs Team, and is PITR purchased?** | R1 proves *paid*, not *which paid*. Team is +$574/mo and raises **zero** meter limits, so this only matters for support SLA. PITR decides whether RPO is ≤24 h or ≤2 min. | Dashboard → Billing | 1 min |
| **6** | **Sample one month of Vercel Web Analytics on the 4 live gyms.** | §2.3 — page views/gym/month is the largest single uncertainty in the entire cost model (±5× on the biggest vendor line). Sample, then turn it **off**: at 21M page views/mo it would cost $630/mo itself. | Vercel → Analytics toggle | 1 month, $0 |
| **7** | **Does `proxy.ts` deploy to the edge runtime or to a Node fluid function?** | §2.2 — decides whether tenant resolution bills as Edge Request CPU Duration ($0.30/hr over 10 ms) or as Invocations + Active CPU + Provisioned Memory. $10–150/mo swing. | Vercel → project → Functions | 2 min |
| **8** | **Time one real restore into the existing scratch project (`gyyujeguycxxoaqgdnjp`).** | §4.3's 4–24 h band is `size ÷ published throughput` with no WAL-replay or provisioning term. This converts the entire RTO section from modelled to measured, and it is the only fact in this audit that nobody can obtain from a keyboard in under an hour. | scratch project | half a day, $0 |

---

# 10. MY BLIND SPOTS

1. **I did not send a single HTTP request.** The §3 attack is read from the function body, the grants and
   the constraints — the *bypass* is certain, the *throughput* is modelled. Supabase may impose an
   undocumented gateway rate limit on `/rest/v1/rpc/*`; I searched their docs and found none, but absence
   of documentation is not absence of a limit. If one exists at, say, 100 req/s per IP, the §3.3 timings
   stretch by however many IPs the attacker rents — which is a cost of cents, not a barrier.
2. **Every gym count in §1.2 is an extrapolation from a 4-gym, 15 MB database with a 99.996% cache-hit
   rate.** The regime-2 scan rate (~1,000 MB/s) is the softest number in the document and it moves
   ceiling #7 between ~30 and ~170 gyms. The honest way to settle the entire top half of §1.2 is to seed
   the existing scratch project to 500 gyms and re-run my three probes. Read-only access cannot build
   that and I did not.
3. **`EXPLAIN ANALYZE` was forbidden**, so "`is_staff_of` fires on every row" rests on plan text plus the
   documented fact that Postgres does not reorder `OR` operands — not on an observed `loops=` count.
4. **I did not re-derive the Supabase side of the cost curve.** verify-math and model-tiers arrived at
   $441.97 independently and agreed to the cent, which is strong — but **$400 of it is one asserted
   compute rung**, so my D2 ruling compares a modelled Vercel number against a modelled Supabase number
   and I said so rather than pretending one side was solid.
5. **I did not audit the write path.** Twenty-five write RPCs are absent from every latency model here,
   mine included. `pg_stat_statements` shows one at **13.6 ms mean / 400 blocks per call** — more
   expensive than `mi_membresia` — and at 3,000 gyms that is ~675k `ventas`/month plus ~7.2M `clientes`
   UPDATEs/year against a table whose row *count* grows by ~210k/year. That vacuum/bloat profile is 35×
   its row growth and it is in nobody's table.
6. **I did not resolve the 30-vs-360 `/auth/v1/otp` contradiction** — it is a live defect inside
   Supabase's own two documentation pages, reproduced independently by two agents today. It is
   unresolvable from outside Supabase and I put the configured value on the owner list instead.
7. **Seasonality is unmodelled everywhere in this audit, including here.** Every monthly figure is a flat
   average on a two-month-old dataset. A January signup surge concentrates invites, activation and
   auth-bucket consumption into one month; every flat average in §1.2 understates the peak that actually
   trips the cap — and the caps that bind first (Resend 100/day, the auth buckets) are *daily* ones.
