# alt:baas — Firebase/Firestore, Convex, Nhost, Appwrite at 100/1,000/3,000 gyms

**Agent:** alt:baas · **Date:** 2026-07-27/28 · **Method:** primary-source vendor pricing (fetched live, dated below) applied to one consistent modelled workload, plus vendor-doc-verified domain-fit checks against RED's actual schema (25 write-bearing RPCs, per-gym folio sequences, 5+ tenant-scoped UNIQUE constraints, FK graph, RLS). Read-only against live prod; no writes. This session implements nothing.

**Bottom line up front:** price is not what disqualifies these three (Firestore, Convex, Appwrite) from RED's domain — fit is. All three are structurally cheap at RED's actual data volumes. What breaks is: no engine-enforced per-tenant UNIQUE constraint (2 of 3), no server-side GROUP BY (all 3), and — for Firestore specifically — a documented hotspot-avoidance pattern that trades away the one property RED's folio sequence needs (strict per-gym ordering). Nhost is the one candidate with zero domain-fit loss, because it is the same engine (Postgres) under a different auth/API skin — its risk is entirely off the fit axis (a 6-person, $3M-raised company vs. the incumbent's $500M Series F).

---

## 0. Workload model (used for every vendor, so the comparison is apples-to-apples)

No vendor bills the same unit (Firestore = per-document read/write; Convex = per-function-call + bytes-scanned; Appwrite = per-read/write; Nhost = flat compute, like Supabase today). To compare them I built **one** modelled monthly workload per gym and applied each vendor's own published rate to it. This is **MODELLED**, not measured — RED's live baseline (4 gyms, 116 clientes) is too early-stage to extrapolate a steady-state rate directly, so I anchored the *shape* of the model on the live schema (which tables, which RPCs) and the *volume* on the mandate's target density (150–300 members/gym), showing the formula at every step so it can be checked or replaced.

**Per gym, per month, at 225 members (midpoint of 150–300):**

| Activity | Formula | Writes | Reads |
|---|---|---:|---:|
| Check-ins (`pasar_lista_sesion`/`toggle_pase`) | 225 members × 9 visits/mo | 2,025 | 6,075 (3 reads/check-in: roster, balance, dedup) |
| Sales/renewals (`registrar_venta`) | 225 × 35% monthly renewal rate | 237 (3 writes/venta: insert, balance update, folio touch) | 316 (4 reads/venta: idempotency, folio peek, cliente, catálogo) |
| Reservations (`reservar_clase`/`cancelar_reserva`) | 225 × 40% active bookers × 6 bookings/mo | 540 | — |
| Agenda views | 225 × 12 opens/mo × 3 sub-reads | — | 8,100 |
| Plan-card renders (`mi_membresia`-equivalent) | 225 × 12 opens/mo | — | 2,700 |
| Staff/desk operations | flat estimate | 300 | 1,500 |
| **Total per gym/month** | | **≈3,100 writes** | **≈18,700 reads** |

MAU/gym ≈ member count (150–300; most members open the app monthly for class booking/check-in).

At scale: **100 gyms** = 310K writes / 1.87M reads / 15,000–30,000 MAU · **1,000 gyms** = 3.1M writes / 18.7M reads / 150,000–300,000 MAU · **3,000 gyms** = 9.3M writes / 56.1M reads / 450,000–900,000 MAU.

Storage model (24-month retention — this is literally the window RED's own `respaldo.ts` standardized on, see §3): using RED's **measured** live bytes/row (asistencias 558B, ventas 936B, reservation 602B, clientes 1483B, class_session 613B) and the same activity rates: **≈37.7 MB/gym over 24 months** → 3.77 GB @ 100 gyms, 37.7 GB @ 1,000 gyms, 113 GB @ 3,000 gyms. Document-store vendors (Firestore, Appwrite) generally run 1.3–2× a Postgres row's bytes due to per-field name repetition and no columnar compression — I flagged where this matters and used a conservative 1.5× multiplier rather than inventing false precision.

**Confidence: MODELLED.** This is a workload shape, not a measurement. Treat every dollar figure below as "this order of magnitude, on this workload" — the qualitative fit findings in §3–6 do not depend on the exact multiplier and are the load-bearing part of this report.

---

## 1. Pricing, primary sources, fetched 2026-07-27/28

### Firebase / Firestore (Standard edition, Blaze plan)

| Item | Rate | Source |
|---|---|---|
| Document reads | $0.03 / 100,000 (free: 50K/day) | firebase.google.com/docs/firestore/standard-edition, fetched 2026-07-27 |
| Document writes | $0.09 / 100,000 (free: 20K/day) | same |
| Document deletes | $0.01 / 100,000 (free: 20K/day) | same |
| Stored data | $0.18 / GiB-month (free: 1 GiB) | firebase.google.com/docs/firestore/billing-example, fetched 2026-07-27 |
| Network egress | $0.12 / GiB (free: 10 GiB/mo) | same |
| Cloud Functions invocations | free to 2M/mo, then $0.40/million | firebase.google.com/pricing, fetched 2026-07-27 |
| Auth (Identity Platform, "Tier 1" — email/social/SAML/OIDC) | 0–50K MAU free; 50K–100K $0.0055/MAU; 100K–1M $0.0046/MAU; 1M–10M $0.0032/MAU; 10M+ $0.0025/MAU | cloud.google.com/identity-platform/pricing, corroborated via search 2026-07-27 (direct fetch was truncated by the tool; cross-checked: 1M MAU under this schedule = $4,415, which independently matches the figure cited in `docs/Context/2026-07-27-auth-structure-scale-audit.md` §4 — two independent derivations agree) |

**Note on Firestore's pricing history:** an older schedule ($0.06/100K reads, $0.18/100K writes, $0.02/100K deletes) is still quoted in Firebase's own `billing-example` doc and by several third-party trackers — that page appears stale relative to the dedicated `standard-edition` page, which is 3× cheaper on reads and 2× on writes. I used the newer, lower `standard-edition` numbers as authoritative since it is the more specific/current page; if that's wrong, every Firestore dollar figure below roughly doubles. Flagged, not resolved — the gap itself is a data point (pricing has moved materially in the last cycle; budget for another move).

### Convex

| Item | Free/Starter | Professional ($25/dev/mo base) |
|---|---|---|
| Function calls | 1M free | 25M included, then $2.00/1M |
| Database storage | 0.5 GB free | 50 GB included, then $0.20/GB |
| Database I/O ("bandwidth" — bytes **scanned**, not returned) | 1 GB free | 50 GB included, then $0.20/GB |
| File storage | 1 GB free | 100 GB included, then $0.03/GB |
| Data egress | 1 GB free | 50 GB included, then $0.12/GB |
| Enterprise | — | $2,500/mo minimum, custom |

Source: convex.dev/pricing, fetched 2026-07-27.

### Nhost

| Item | Starter (free) | Pro ($25/mo, incl. $15 compute credit) | Team ($599/mo) |
|---|---|---|---|
| Database | 1 GB | 10 GB, then $0.20/GB | 10 GB, then $0.20/GB |
| Storage | 1 GB | 50 GB, then $0.05/GB | same |
| Egress | 5 GB | 50 GB, then $0.10/GB | same |
| Compute (shared) | — | $15/vCPU/mo (2 GB RAM/vCPU) | same |
| Compute (dedicated) | — | $50/vCPU/mo | same |
| Auth (MAU) | **Unlimited, all plans, no metering** | | |
| Backups | — | 7 days incl. | 7 days incl. |

Source: nhost.io/pricing, fetched 2026-07-27.

### Appwrite

| Item | Free | Pro ($25/mo) | Enterprise |
|---|---|---|---|
| API bandwidth | 5 GB | 2 TB | custom |
| Storage | 2 GB | 150 GB | custom |
| Monthly reads | 500K | 1.75M, then $0.06/100K | custom |
| Monthly writes | 250K | 750K, then $0.10/100K | custom |
| **MAU ceiling** | 75,000 | **200,000 (hard cap on Pro — no listed overage rate)** | custom |
| Function executions | 750K | 3.5M, then $2/1M | custom |
| Transactions API (Oct 2025) | 100 ops/txn | 1,000 ops/txn | 2,500 ops/txn |

Source: appwrite.io/pricing, fetched 2026-07-27; appwrite.io/docs/products/databases/transactions, fetched 2026-07-28; appwrite.io/blog/post/announcing-transactions-api.

---

## 2. Cost at 100 / 1,000 / 3,000 gyms (§0 workload × §1 rates)

All figures monthly, USD. Supabase comparator column pulled verbatim from the companion audit (`docs/Context/2026-07-27-auth-structure-scale-audit.md` §4) for scale, not re-derived here.

| Gyms | Firebase/Firestore | Convex | Appwrite | Nhost | Supabase (companion audit) |
|---|---|---|---|---|---|
| **100** | ~$1–5 (Auth free <50K MAU; DB ops trivial) | ~$25 (Professional base; everything else inside included quotas) | ~$25 (Pro base + $0.07 read overage) | ~$25 (Pro base; DB/compute inside included+credit) | not modelled at 100 |
| **1,000** | $522–$1,212 (Auth $505–$1,195 dominates; DB ~$17) | ~$25 (still inside Professional's single-seat quotas — 15M calls vs 25M included, 37.7GB storage vs 50GB) | $37.6 @150 mem/gym; **Enterprise-only (price undisclosed) @300 mem/gym — 300K MAU exceeds Pro's 200K cap** | ~$115 ($25 base + $5.5 DB overage + ~$85 compute) | not modelled at 1,000 |
| **3,000** | $1,970–$4,040 (Auth $1,885–$3,955; DB ~$85) | ~$78 ($25 base + $40 call overage + $12.6 storage overage) | **Enterprise-only (price undisclosed) — 450K–900K MAU vs. Pro's 200K cap; self-serve pricing does not reach this scale** | $256–$456 (Pro, matching Supabase's own $210–410 compute range since it's the same DB engine) or $830–$1,030 (Team, for SOC2/governance parity with Supabase Team) | **$1,200–$2,300 (Supabase subtotal, companion audit §4)** |

**Reading this table honestly (Rule 7):** at RED's actual data volumes, Convex is startlingly cheap — cheaper than Supabase by 15–30×, cheaper than Firestore's Auth-dominated bill by 25–50×. That number is real given the rate card, but it is the least trustworthy number in this file (see §5 — "function calls" is a coarse proxy for Convex's actual billing unit, bytes scanned, and I cannot verify without a load test that a real Convex port of `respaldo.ts`/`mi_membresia` stays inside my modelled I/O). Appwrite is the one vendor whose *published self-serve price simply stops existing* before RED reaches its stated 3,000-gym target — that is a harder, more falsifiable finding than any of the dollar estimates, because it doesn't depend on my workload model at all: 200,000 MAU ÷ 150–300 members/gym = **667–1,333 gyms**, full stop, from the vendor's own table.

---

## 3. The demanded worked example — Firestore pricing a full-year attendance report vs. Postgres's one indexed scan

**RED's actual reporting code** (`packages/data/src/server/respaldo.ts:86-116`, read this session) is not a dashboard aggregate — it is a **row-level export**. `readAllAsistencias` selects `fecha, hora, cliente_id` for every attendance row in the window with **no date filter beyond the window bound**, paginated at `PAGE=1000` via `.range()`, because (comment, line 19-24) *"PostgREST caps a single response... the two FULL-history ledgers accumulate over years... a single read would silently truncate."* The **default** window (line 162-166) is not one month — it's **the last 24 months** (`ADR-0006 as amended 2026-07-13`), and a stale comment on the same line notes the *previous* unbounded version "413s at ~3 years" — i.e., RED has already hit and fixed one payload-size ceiling on this exact code path, on Postgres, once.

**Postgres side, measured:** one `.eq("gym_id", gymId).gte("fecha", …).order("fecha").range(0,999)` per 1,000-row page against `ventas_gym_fecha_idx` / (asistencias currently has no `(gym_id, fecha)`-leading index — only `asistencias_cliente_fecha_idx (cliente_id, fecha)`, a gap noted but out of scope for this report — the *class* of operation is still one indexed range scan per page, not a cross-tenant scan). Cost: $0 marginal (flat compute already budgeted in the companion audit's Supabase line), latency: single-digit ms per page.

**Firestore side, modelled on the same code's actual window:** attendance is naturally one document per check-in. There is **no equivalent of "return these N rows, sorted, in one round trip, server-side, for free"** — every matching document is a billed read. Firestore's aggregation queries (`count()`/`sum()`/`avg()`, batched at 1 read per 1,000 index entries — genuinely cheap) do **not** apply here: they return one scalar per query, and RED's corte needs `fecha, hora, cliente_id` per row to fold into `calcularCorteMes` (`packages/domain/src/rules.ts`) — there is no GROUP BY in Firestore's query language, so a per-day/per-método breakdown is either N separate aggregation queries (one per bucket) or a raw per-document read of everything, which is what RED's *actual* export needs (it's building an auditable Excel/CSV ledger, not a summary tile).

**The math, on RED's own 24-month default window, at 225 members/gym (§0 model — 2,025 asistencia writes/mo):**

- Rows in window: 2,025/mo × 24 = 48,600 attendance documents (per gym, one respaldo generation)
- Firestore reads: 48,600 × $0.03/100,000 = **$0.0146 per report, per gym** — trivially cheap in isolation. **Honest finding: a single report is not where the money is.**
- If regenerated **weekly** (matching the feature's own framing — "the operator's weekly Excel backup," `respaldo.ts:124`) across the full 3,000-gym fleet: 48,600 × 4.33 weeks × 3,000 gyms = 631.3M reads/month → 631,314,000/100,000 × $0.03 = **$189.39/month, fleet-wide, for this one report type alone.** Real, but modest — smaller than Firestore's own Auth bill by an order of magnitude (§2), and smaller than the companion audit's Resend line.

**So the honest verdict on this specific worked example (Rule 7 overriding the mandate's suggestive framing): the per-read metering itself does not become the dominant cost driver at RED's actual scale.** What it *does* create, which is the real fit problem:

1. **No server-side join.** `calcularCorteMes`/`buildRespaldoRows` needs `cliente.nombre`, `paquete.nombre` alongside the ledger rows for a human-readable export. Postgres gets this as a second small indexed read (roster is naturally bounded — the code's own comment says so, line 23-24) folded in JS. Firestore has two options: (a) a second read per unique `cliente_id` referenced (N+1, but N here is bounded by roster size, so not catastrophic — ~225 extra reads/report, ~$0.00007), or (b) **denormalize** the client's name onto every historical attendance document, the standard Firestore performance pattern. Option (b) means every `nombre` edit must fan out and rewrite every historical attendance/venta document that copied it — write amplification in exactly the ledger data this domain treats as immutable financial history, and exactly the failure shape (a write that silently doesn't touch every row it should) that AGENTS.md names as RED's worst production incident to date (#78 — "the create path dropped the verified email").
2. **The report-cost risk is real, just not on THIS query.** A live dashboard tile that re-runs on every keystroke of a date-range picker, or a report type this model didn't cover, can still cost real money per view — the mechanism is confirmed and priced; RED's specific default-window export just isn't the case where it bites hardest.

---

## 4. Where each vendor breaks, concretely — transactions, folios, uniqueness, joins, isolation

| Requirement (from RED's live schema/RPCs) | Postgres (today) | Firestore | Convex | Appwrite | Nhost |
|---|---|---|---|---|---|
| **Multi-row atomic write** (`registrar_venta`: insert venta + update cliente balance + touch folio, ~3–5 rows) | Native `SECURITY INVOKER` txn, serializable | Transaction API: 500 field-transforms/txn, 10 MiB, 270s (firebase.google.com/docs/firestore/quotas, fetched 2026-07-28) — comfortably fits RED's write shape | **Every mutation is one serializable transaction over arbitrary tables by default** — closest match to Postgres semantics of the three; capped at 1s exec / 1MB read+write (docs.convex.dev/production/state/limits, fetched 2026-07-27) | Transactions API, shipped Oct 2025 (appwrite.io/changelog/entry/2025-10-09): 1,000 staged ops/txn on Pro, spans multiple tables, auto-rollback on any failure — genuinely closes what used to be Appwrite's biggest gap | Native (it's Postgres — same engine) |
| **Per-gym folio sequence** (`ventas_folio_gym_uq`, strictly ordered) | `UNIQUE(gym_id, folio)` + RPC-derived next value, DB-enforced | Vendor's **own** best-practices doc prescribes a **distributed/sharded counter** for anything under sustained sequential write load (firebase.google.com/docs/firestore/best-practices, fetched 2026-07-27) — but a sharded counter's read is a **SUM across shards**, not a single atomic "next value"; it trades away strict ordering, the one property a folio needs. A single non-sharded counter doc is the alternative, and is exactly the "hotspot" the same doc warns against. | A per-gym counter document read+incremented inside the mutation is safe from lost updates (whole mutation is one txn) — best fit of the three for this specific requirement, though still a hand-rolled counter, not a DB primitive | **Native atomic increment/decrement operation**, stageable inside the Transactions API — cleanest fit of the three alt-BaaS for exactly this requirement | Native (it's Postgres, unchanged) |
| **Tenant-scoped UNIQUE** (`clientes_email_gym_uq`, `ventas_idem_gym_uq` — 5 total live) | DB-enforced, unconditional, cannot be bypassed by any code path | **No native equivalent.** Doc-ID-as-key covers exactly one composite key per collection; a second constraint (e.g. both email-uniqueness and idempotency-key-uniqueness on the same collection) needs a second shadow-document pattern per constraint, each a new place to drop the enforcement | **No native equivalent** — Convex's own docs say so explicitly: *"It's not currently possible to create a unique constraint that is enforced by Convex... enforce it yourself using db.query with withIndex... [conflicting mutations] will need to be retried"* (docs.convex.dev, cited via official Convex docs search, fetched 2026-07-27) | **Native composite unique index** — closest to Postgres's `UNIQUE` of the three | Native (it's Postgres, unchanged) |
| **Referential integrity** (`ventas.cliente_id → clientes.id`, `asistencias.cliente_id → clientes.id`) | FK, DB-enforced | None. Orphan `cliente_id` values persist silently. | None (references are just IDs by convention) | "Relationships" attributes (1.5+) with configurable on-delete behavior — app-layer, not a classic FK | Native (it's Postgres, unchanged) |
| **GROUP BY aggregate reporting** (corte by día/método) | One indexed scan, computed server-side | `count()`/`sum()`/`avg()` are single flat aggregates, no GROUP BY — RED's actual row-level export need (§3) forces the full per-doc-read path anyway | No query language for joins/aggregation/GROUP BY at all — **"you just write code, instead of JOIN statements"** (convex.dev/can-do/relational-data, fetched 2026-07-27). This is, notably, close to what RED's own `respaldo.ts` already does client-side against Postgres (folds 4 independently-fetched result sets in JS) — the porting delta here is smaller than it looks | Simple equality/range filters only, no GROUP BY; app-level fold required | Hasura can expose the *same* `plpgsql` RPC bodies nearly 1:1 as GraphQL mutations/custom functions — smallest rewrite of the four |
| **Per-tenant isolation** (25 gym-scoped RLS SELECT policies, evaluated fresh per request off live `gym_membership`) | Postgres RLS | Security Rules evaluated per-document; multi-gym membership requires custom claims (array of gym roles) that propagate to the client token on a **cache/refresh cycle, not live** — a revoked/added membership doesn't take effect until the ID token refreshes | Function-level `ctx.auth` + hand-written authorization checks per query/mutation — no declarative per-row policy language at all; every one of RED's 25 write RPCs' authorization logic gets reimplemented as imperative code, individually reviewable but with no engine-level backstop | Native document/collection "permissions," roughly RLS-shaped but a separate DSL | Hasura permissions DSL — separate from Postgres RLS; the "not one policy reads a header" invariant (companion audit §2) would need full re-verification against Hasura's model, not a port |
| **Query-based cost risk on a report/dashboard view** | None — flat compute | Real, priced in §3: modest at RED's scale (~$189/mo fleet-wide for the heaviest report type) | Real and sharper: bills **bytes scanned during execution**, not bytes returned. An unindexed `.filter()` on a shared multi-tenant table doesn't just get slow (Postgres's failure mode) — it directly inflates the monthly bill. This is exactly RED's own already-shipped bug class (ADR-0013's mis-scoped `gym_membership` predicate, 275,638 seq scans on a 9-row table per the companion audit) except on Convex the consequence is metered, not just latent | Real, modest (~$0.06/100K reads) | None — flat compute, unchanged from today |

---

## 5. Forced ranking — worst first

1. **Appwrite's Pro-plan MAU ceiling (200,000) is a hard, self-serve pricing wall that RED hits at 667–1,333 gyms** (200,000 ÷ 150–300 members/gym), well before the 3,000-gym target, forcing an opaque Enterprise negotiation with a company at Series-A-only funding ($37M raised, per Crunchbase/PitchBook/Tracxn, searched 2026-07-27) with no published price beyond that point. This is the only finding in this file that doesn't depend on my workload model — it's read straight off the vendor's own table. **Breaks at:** ~700–1,300 gyms. **Confidence: measured** (vendor's own published cap; the Enterprise price itself is unknown/ASSERTED).
2. **Firestore forces a denormalize-or-N+1 choice on every cross-collection report field, and denormalization reintroduces write-fanout risk in the exact "a write silently drops/misses a field across rows" bug class (#78) AGENTS.md already names as RED's worst production incident** — now with no `UNIQUE`/FK to ever catch a partial fan-out. **Breaks at:** any report or screen that needs a human-readable field (client name, package name) alongside ledger rows — i.e., every report RED currently has. **Confidence: modelled** (the mechanism is vendor-documented and unambiguous; the specific dollar/row impact is my estimate).
3. **Neither Firestore nor Convex has an engine-enforced per-tenant UNIQUE constraint** — RED currently has 5 live ones, each protecting money-adjacent data (`clientes_email_gym_uq`, `ventas_idem_gym_uq`, `ventas_folio_gym_uq`, `clientes_auth_user_id_per_gym`, and one more not itemized here). Porting means re-deriving a check-then-write pattern at every one of the 25 write-bearing RPCs, by hand, with the correctness burden shifted from "the database refuses the write" to "the reviewer remembered the pattern" — precisely the axis AGENTS.md's `rpc-write-coverage.test.ts` machine-guards today and would stop guarding. **Breaks at:** the first missed pattern, which by definition is invisible until it corrupts a row (this is #78's own shape). **Confidence: modelled**, mechanism confirmed by both vendors' own docs.
4. **Firestore's documented fix for write-hotspots (sharded/distributed counters) breaks the one property RED's per-gym folio sequence needs: strict ordering.** A sharded counter answers "how many," not "what's next, atomically, in order" — RED's folio is a legal/audit-trail artifact (`ventas_folio_gym_uq`), not just a display number. **Breaks at:** whatever concurrent-sale rate first produces hotspot contention on a single un-sharded counter doc — vendor docs decline to give an exact number ("depends highly on the workload," firebase.google.com/docs/firestore/best-practices), so this is a qualitative, vendor-acknowledged risk rather than a measured threshold. **Confidence: asserted mechanism, unmeasured threshold.**
5. **Convex's query pricing bills bytes scanned, not bytes returned — a real but under-verified risk given my Convex cost estimate is the least trustworthy number in this file.** My §2 estimate (~$78/mo at 3,000 gyms) is 15–30× cheaper than Supabase's own modelled bill, which is a large enough gap that I do not trust it without a load test: it hinges entirely on every hot query (`mi_membresia`, `respaldo`, `resumen`) being written against a proper `withIndex()` call rather than an unindexed `.filter()` — exactly the mistake this repo's own `gym_membership` finding (companion memo, §"C3") shows a reviewer can miss even in Postgres, where the failure mode is merely slow. On Convex the identical mistake directly inflates a metered bill. **Breaks at:** unmeasured — this is the item most in need of a follow-up spike before anyone trusts the $78/mo figure. **Confidence: modelled, low-trust on my own number.**

**Honest counterweight (Rule 7):** Nhost does not appear in this ranking because, on the fit axis, it has nothing to rank — it is Postgres. Every row in §4's fit matrix is "native, unchanged" for Nhost. Its risk is entirely off this axis: a 6-person team, ~$660K ARR, $3M raised (seed, 2021 — Nauta Capital/Antler; searched via Tracxn/Crunchbase/getlatka, 2026-07-27) against Supabase's $500M Series F at $10.5B (companion audit §6), and an "unlimited MAU, no metering, on every plan including free" claim that is genuinely the cheapest Auth line of all five options compared here (Nhost/Supabase/Firebase/Convex+3rd-party/Appwrite) — but is exactly the kind of promise a company that size is most likely to re-tier later (Supabase's own branching-went-paid precedent, cited in the companion audit, is the direct analogy). If Nhost is ever seriously considered, the due-diligence question is company continuity and the Hasura-permission-DSL rewrite cost, not domain fit.

---

## 6. Falsification — what would have to be true, and did I check it

- **"Firestore's per-read billing makes reporting prohibitively expensive"** — CHECKED, found FALSE at RED's actual scale (§3: $0.0146/report, $189/mo fleet-wide for the heaviest report type). The real cost is in what per-document billing *forces you to do architecturally* (denormalize or N+1), not the meter itself. I did not let the mandate's suggestive framing stand unchecked.
- **"Convex is dramatically cheaper than Supabase"** — my model says yes (~$78 vs. $1,200–2,300 at 3,000 gyms), but I flag this as the number I trust least in the file (§5.5) because "function calls × my assumed reads-per-call" is a proxy for the actual billing unit (bytes scanned), and I have no load-test evidence that RED's real query shapes stay index-bound on Convex. **What would falsify "Convex is cheap": a spike porting `mi_membresia`/`respaldo`/`resumen` to real Convex `withIndex` queries and measuring actual database-bandwidth GB against my 39.3 GB/mo-at-3,000-gyms estimate.** Not done this session — recommend as the single highest-value follow-up if Convex stays on the table.
- **"Appwrite's new Transactions API (Oct 2025) closes the ACID gap"** — CHECKED against the vendor's own docs (appwrite.io/docs/products/databases/transactions, fetched 2026-07-28): yes, multi-table, 1,000 ops/txn on Pro, auto-rollback. This reverses what would have been the obvious pre-2025 verdict ("Appwrite has no transactions") — I did not let stale general knowledge stand; I checked the current state and found the feature is 9 months old at the time of this audit, i.e., genuinely new and comparatively unbattle-tested at RED's scale, which is a different (softer) risk than "doesn't exist."
- **"Nhost's unlimited-MAU auth pricing is fine because it's Postgres-based, low-risk"** — NOT fully checked. I confirmed the pricing page's claim but did not verify it against Nhost's ToS/fair-use language for a hard cap or "abuse" clause that could reclassify RED's usage — a genuine gap, listed in blind spots.
- **"ADR-0013's O(1) RLS claim doesn't affect this comparison"** — checked: correct, nothing in this file relies on it; the companion memo's correction (correlated SubPlan, not O(1)) is cited only as the analogy for Convex's bandwidth-billing risk (§5.5), not as a load-bearing premise here.

---

## Sources (all fetched 2026-07-27 unless noted)

- firebase.google.com/docs/firestore/standard-edition — Firestore Standard edition per-op pricing
- firebase.google.com/docs/firestore/billing-example — worked example, storage/egress rates
- firebase.google.com/pricing — Cloud Functions pricing
- cloud.google.com/identity-platform/pricing (direct fetch truncated; MAU tiers corroborated via search, cross-checked against companion audit's independently-derived $4,415-at-1M-MAU figure)
- firebase.google.com/docs/firestore/quotas — transaction/document size limits (fetched 2026-07-28)
- firebase.google.com/docs/firestore/best-practices — hotspot/counter guidance
- firebase.google.com/docs/firestore/understand-reads-writes-scale — write-transaction mechanics (no single-doc numeric cap found on this page)
- convex.dev/pricing — plan pricing
- docs.convex.dev/production/state/limits — transaction time/size limits (via search, fetched 2026-07-27)
- convex.dev/can-do/relational-data — "no JOIN language, write code instead" (official Convex docs, via search)
- docs.convex.dev (unique-constraint statement) — via search of official Convex docs, fetched 2026-07-27
- nhost.io/pricing — plan pricing, unlimited-MAU claim
- appwrite.io/pricing — plan pricing, MAU ceilings
- appwrite.io/docs/products/databases/transactions — Transactions API limits (fetched 2026-07-28)
- appwrite.io/changelog/entry/2025-10-09 / appwrite.io/blog/post/announcing-transactions-api — Transactions API announcement, Oct 2025
- Tracxn / PitchBook / Crunchbase / getlatka (via search, 2026-07-27) — Nhost, Convex, Appwrite funding/team-size figures
- Repo evidence (this session): `packages/data/src/server/respaldo.ts` (full read), `packages/domain/src/rules.ts` (partial read) — RED's actual report query shape and 24-month retention window
- `docs/Context/2026-07-27-auth-structure-scale-audit.md`, `docs/Context/2026-07-27-multigym-rpc-scoping-decision-memo.md` — companion audits, challenged not adopted (Convex bandwidth-risk analogy to the live `gym_membership` finding; Supabase comparator figures in §2 pulled, not re-derived)

## Blind spots

1. **No prototype, no load test, on any of the 4 vendors.** Every dollar figure is a vendor rate card applied to a modelled workload. The Convex number in particular (§5.5) needs a real spike before anyone trusts it.
2. **Realtime/subscriptions unpriced.** RED currently uses zero realtime features (confirmed in the mandate's own baseline), so this was out of scope — but Convex's core differentiator *is* reactive subscriptions, and if RED's roadmap ever wants live-updating class rosters, Convex's value proposition changes and this audit would need to be redone with that workload included.
3. **No migration/rewrite cost.** This is price-and-fit only. Porting 25 write-bearing RPCs, every RLS policy, and every denial-suite assertion to any of these 4 platforms is a real engineering-months cost that almost certainly dwarfs any monthly hosting delta found here — I did not estimate it.
4. **Auth production track record unverified for 3 of 4.** I priced Nhost's/Convex's/Appwrite's auth; I did not check breach history, CVE history, or support SLAs the way the companion audit did for Supabase's GoTrue.
5. **Firestore Enterprise edition (per-unit, KiB-tranche pricing) was found but not modelled** — only Standard edition is priced here. Enterprise edition's economics at 3,000-gym scale are unknown and could differ materially.
6. **No LatAm region check.** I did not verify whether Firestore, Convex, Nhost, or Appwrite have a São Paulo (or any LatAm) region, or what the latency/data-residency story is for any of them — the companion audit flagged this as material for Supabase (`sa-east-1` vs `us-east-1`) and I did not extend that check to the alternatives.
