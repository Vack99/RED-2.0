# Multi-Tenant Branding Architecture Audit — All-Mexico / 10k-Member Scope

> **Date:** 2026-07-01 · **Trigger:** end-of-Phase-2 HITL checkpoint — "are we taking the most
> elegant approach for multi-tenant branding, given all-Mexico deployment and ~10,000 members?"
> **Method:** 43-agent workflow — 4 code/plan readers (brand seam, locale/timezone, data/RLS,
> plan gaps), 3 judges (scale skeptic, elegance vs alternatives, Mexico ops), 36 adversarial
> verifiers. 34 findings confirmed, 2 refuted. Every claim below survived a refutation attempt
> against the repo.

# Verdict: yes — the architecture is the right one. Your scaling axis is not the one you named.

All three judges independently converged: **one shared Supabase + RLS-by-membership + one
multi-tenant Vercel deploy per app + brand-modules-as-code is the correct and elegant
architecture for all-Mexico at 10k members**, and every steelmanned alternative loses:

- **Vercel Platforms `/[tenant]/` rewrite pattern** — buys per-tenant static generation your
  product can't use (admin is fully authed, client is member-authed), while charging a tenant
  URL segment through every link and redirect forever. Your header-stamping puts the same
  behaviour behind one 9-line pure function. Strictly deeper.
- **Per-tenant Vercel/Supabase projects** — ADR-0008's rejection gets *more* sound at
  all-Mexico scope, not less: hundreds of gyms would mean migration fan-out across hundreds of
  databases and a fragmented claim-by-match identity story.
- **Schema-per-tenant / separate DBs** — 10k members is low-millions of rows; one small
  Postgres with initplan-cached RLS wins decisively.
- **Brand-as-DB-data from day one** — would have coupled the zero-schema Phase-2 tracer to the
  unbuilt `gym` table. Code-now-data-later is the more elegant sequencing, *provided the data
  half actually lands* (see finding 2).

And the honest scale math: **10k members is a non-problem.** ~10–20k `gym_membership` rows,
single-digit requests/second at peak, a PostgREST-over-HTTPS DAL with zero direct Postgres
connections. No pooling, sharding, caching, or replica work is needed anywhere before 10k. The
axis that actually stresses this architecture is **gym count and gym geography** — and
chronologically, the first three things that break have nothing to do with 10,000 users:

1. **Supabase's default SMTP** (single-digit emails/hour) kills self-registration at roughly
   **member #30**.
2. **`America/Chihuahua` hardcoded** corrupts attendance dates, package expiry, and month-end
   revenue at the **first gym outside UTC-6** (even Ciudad Juárez, in your home state, is a
   different zone).
3. **Onboarding-as-code-deploy** becomes a release train at **gym #3**.

## The one elegance flaw (worth fixing this week — it's a comment and a sentence)

**The seam resolves a *brand* where it should resolve a *tenant*.**
`packages/brand/src/brand-id.ts:5` declares that in Phase 3 the BrandId keyspace "equals the
tenant (gym) slug" — the exact **opposite** of ADR-0012's own thousands-scale mechanism
(line 66: hundreds of generic gyms share ONE default code module; palette/logo/copy become
gym-row *data*). Tenant keys and brand-module keys must **diverge**, not merge. Everything
downstream currently assumes they're the same key: the closed union, the
`Record<BrandId, BrandModule>` registry, both layouts indexing `brands[brandId].css`, the
`x-brand` header semantics. The ADR's "one-line ripple / same signature" framing also
understates Phase 3 — per-gym token overrides can't ride `x-brand` plus a static registry.

Nothing fails at runtime today, and ADR-0012's Forward-looking section already contains the
right design. But in a repo where fresh agent sessions implement from docs and comments, that
comment is a planted wrong invariant at the exact spot the Phase-3 implementer will read.
**Fix:** correct the comment now, add one sentence to ADR-0012 (tenant slug = open set from
DB; brand-module id = enumerable code; joined via the gym row), and design Phase 3 to stamp
the **gym** at the proxy and derive the brand *from* it.

## Confirmed findings, ordered by when they bite

| # | Finding | Severity | Bites at | Fix lands in |
|---|---|---|---|---|
| 1 | `gym.timezone` missing from the Phase-3 target schema (§4) while `America/Chihuahua` is hardcoded in `fecha.ts:13` (~18 call sites) and the `toggle_pase` RPC | significant | first out-of-zone gym | **one doc line now** + Phase 3 threading |
| 2 | The thousands-scale brand mechanism (neutral base module + gym-row token merge) and the host-map retirement have **no phase owner** — Phase 3's exit criteria never mention the gym-row swap; the target schema has **no hostname column** at all | significant | gym #3 onboarding | two plan lines **now** (Phase 3 + 4 exit criteria) |
| 3 | Custom SMTP for auth email planned nowhere — and ADR-0006 actively codifies the wrong assumption ("Supabase only sends auth mail") | significant | Phase 3 signup testing; ~dozens of real members | named Phase 3 deliverable + Phase 7 exit criterion |
| 4 | Global `venta_folio_seq` interleaves all gyms' receipt numbers; worse, the target `payment` entity **omits folio entirely** (silent-drop risk); 4 `user_id`-keyed unique constraints also need re-keying | significant | first sale at gym #2 | Phase 3 contract checklist |
| 5 | Unpaged PostgREST reads truncate at ~1,000 rows — your accepted-debt ledger's triggers (L-001..L-003) fire at >2,000, *above* the truncation point; `getClientesParaPase` (check-in!) missed entirely | significant | one flagship gym crossing ~1,000 lifetime clientes | recalibrate triggers now; page/push-to-SQL in Phase 3 |
| 6 | RLS denial suite is manual-run with hardcoded prod UUIDs — no machine-executable gate for Phase 3's highest-risk surface | significant | Phase-3 policy cutover, then every migration after | Phase 3 deliverable: seeded fixtures on a preview branch |
| 7 | No abuse posture for the two anon-writable surfaces — `contact_message` INSERT via the publishable key has **zero** built-in rate limiting; shared project = one spammed form burns every tenant's email quota | significant | Phase 6 launch, one gym | parked default line now; Turnstile/per-IP in Phase 6 |
| 8 | Tenant/brand keyspace conflation (detailed above) | minor (doc-level) | Phase-3 kickoff | comment + ADR sentence **now** |
| 9 | Phase-3 RLS mechanism pinned only in a spec whose `staff` schema ADR-0009 superseded; the planned mechanism ADR was never authored | minor | Phase-3 kickoff | one-page ADR amendment before Phase 3 |
| 10 | Domain strategy has no stated default; each gym needs ≥2 hosts → model as `gym_domain(gym_id, hostname, app)`, not the promised single `gym.hostname` column | minor | Phase-3 schema design | parked default + schema note now |
| 11 | "RED-admin = one host-map row" is true for the seam, false for the app — admin hardcodes Forge in 4 places (title, toaster, 2 lockup imports, login animation) | minor | Phase 4 (its own exit gate would catch it) | ADR wording now; debrand checklist in Phase 4 |
| 12 | Fake card fields in the v1 checkout + payment revisit has no trigger — make it an honest "paga en tu gym" screen; name the trigger (first non-founder-operated gym); weight OXXO/SPEI alongside cards | minor | Phase 6 slice planning | Phase 6 note |
| 13 | Notification channel undefined (waitlist promotion is a no-op without one); `waLink`'s 52-prefix heuristic breaks when `phone_e164` arrives — normalize at one seam | minor | Phase 6 waitlist slice | parked default: v1 = in-app only |
| 14 | Phase 7 omits observability/alerting/support entirely | minor | ~5–10 gyms | one Phase 7 exit-criteria line |
| 15 | Vercel function region vs Supabase region co-location is unverified and recorded nowhere — a mismatch is a permanent ~200–400ms TTFB tax on every render | minor | **now** (it's config, not scale) | 5-minute check **during your still-open #16 HITL** |

## Explicitly do NOT fix (the verified over-engineering traps)

The all-Mexico/10k framing invites capacity work the numbers don't justify. All of these were
verified as correctly parked: Postgres capacity work (sharding/partitions/replicas/caching),
connection pooling (your DAL has zero direct pg connections), Supabase MAU tiers (10k fits the
*free* tier's 50k), the JWT custom-claims RLS path (initplan helpers suffice; claims staleness
is a real cost), `dynamic()` per-brand imports, Edge runtime/multi-region, parametrizing
es-MX/MXN/+52 (national constants, exactly right), self-serve onboarding UI, and — obviously —
per-gym projects.

Two findings were refuted outright: the marketing-pages-dynamic-rendering concern (re-litigates
ADR-0008's explicit rendering clause; per-host CDN caching can be layered on anytime) and
"every gym is a code deploy" as a *current* defect (the roadmap's sequencing makes gym #3
impossible before Phase 3 ships; `brand.test.ts`'s pinned census is a deliberate tripwire, not
a smell).

## Bottom line

You are not over-built and not under-built — the bet is placed correctly, and Phase 2 proved
the risky half. What the audit surfaced is almost entirely **~12 one-line doc/plan edits** that
shield Phase 3 from being implemented against incomplete source-of-truth docs (timezone column,
hostname modeling, host-map retirement gate, brand-data path owner, SMTP, folio, the keyspace
comment), plus one config check that belongs in the #16 HITL you already have open (region
co-location). The architecture's ceiling genuinely is "all Mexico" — provided the brand-is-data
half of ADR-0012 gets a phase owner instead of living as a forward-looking note.

## Proposed follow-up: the doc-level shield pass

All edits to docs/comments, no behaviour change, committable straight to main:

- `timezone text not null` (IANA) added to the `gym` columns in the target-data-model doc §4.
- Host modeling note in the same §4: `gym_domain(gym_id, hostname, app)` (each gym needs ≥2
  hosts), superseding ADR-0012's single-`gym.hostname` phrasing.
- Phase 3 exit criteria (roadmap) += "host→gym resolution reads the gym row; `HOST_TO_BRAND`
  deleted" and "custom SMTP provisioned + auth email templates verified".
- Phase 4 deliverables += "neutral base brand module + zod-validated gym-row token-override
  merge" and the admin debrand checklist.
- Phase 7 exit criteria += observability line (error tracking + RPC-error alerts + per-gym
  support contact) and a TTFB spot-check from a Mexican vantage point.
- §6 parked defaults += abuse posture (auth rate limits + Turnstile + per-IP on
  `contact_message`), notification channel (v1 = in-app only), payment revisit trigger (first
  non-founder-operated gym; OXXO/SPEI weighted), domain strategy default (platform wildcard
  subdomain; customer apex as premium).
- Phase 3 contract checklist += folio re-key to `unique(gym_id, folio)` + the 4 `user_id`-keyed
  constraints; carry folio into the `payment` entity field list.
- Fix `brand-id.ts:5` comment + one-sentence ADR-0012 amendment (tenant slug ≠ brand-module id).
- Recalibrate accepted-debt triggers L-001..L-003 to below 1,000 rows.
- Region co-location check + record, folded into the open #16 HITL runbook.
