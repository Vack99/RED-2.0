# Perf loop — every page under 50 ms

**Read this file first.** It is the loop's memory. The conversation gets compacted; this
does not. Update the Attempt log after **every** measured change, including the failures —
a reverted experiment is a finding, and re-running it later is pure waste.

## The goal

Every route in `tools/perf/config.mjs` lands under **50 ms**, measured as `html` p50
(last byte of the HTML document) under the frozen conditions below.

## The conditions (frozen — do not vary these mid-loop)

All of them live in `tools/perf/config.mjs`. Changing any of them makes previous runs
incomparable, so bump `CONDITIONS_ID` if you do, and take a fresh baseline.

- Production build (`next build` + `next start`), never `next dev`.
- Fixed ports (client 3100, admin 3200), one request at a time, keep-alive connection.
- 5 warmup requests discarded, then 20 timed samples. **p50 reported, never the mean.**
- Every request pins the tenant with `?gym=forge-demo`, so request 1 and request 20 travel
  an identical path.
- One login, session reused across all authenticated routes.
- Gate is on `html`, **not `ttfb`** — Next streams SSR, so a first byte can arrive in 5 ms
  while the page is still blocked on the DB. Gating TTFB would let us "win" by streaming an
  empty shell. `ttfb` and `lcp` are still recorded every run, just not gated.

## How to run

```bash
pnpm perf <label>              # local DB (Docker) — all 19 routes. The real gate.
PERF_DB=live pnpm perf <label> # live remote DB — 9 public routes only. Never writes to prod.
pnpm perf <label> --no-build   # skip the rebuild (only if you changed nothing but data)
```

Each run writes `tools/perf/results/NNN-<label>.json` and prints a per-route diff against
the previous run. **A change is only real if the diff moves by more than 2 ms** — below that
is measurement noise, not signal.

## Status

| | |
|---|---|
| Baseline (live DB, 9 public routes) | `001-baseline.json` — **0/9 under 50 ms**, worst 509 ms |
| Baseline (local DB, all 19 routes) | not taken yet — **blocked on Docker Desktop** |

### The blocker

The 50 ms gate is only physically reachable against a **local** database. Measured from this
machine, one round-trip to the live remote Supabase costs **~112–152 ms** (TCP connect ~29 ms,
TLS ~63 ms, query ~50 ms on a warm connection). A page making even one query therefore cannot
finish in 50 ms, no matter how good the code is. Localhost Postgres answers in ~1–3 ms.

Docker Desktop is not installed. Until it is, `PERF_DB=live` measures the 9 public routes and
we track the *round-trip count* coming down rather than absolute milliseconds.

## What the baseline actually says

Read the numbers, not the vibes:

- **There is a ~200 ms floor on every single page, including pages with no data at all.**
  `/legal`, `/entrar`, `/registro`, `/restablecer`, `/login` are all 197–209 ms and none of
  them fetch anything. 200 ms ≈ 2 × the ~100 ms remote round-trip.
- That floor is almost certainly `resolveTenant` (`packages/data/src/server/resolve-tenant.ts`),
  which the proxy runs on **every request** and which does **two sequential queries**
  (`gym_domain` → then `gym`), with the source explicitly noting "no cache (v1)".
- Data pages sit on top of that floor: `/` 509 ms, `/precios` 416 ms, `/nosotros` 411 ms,
  `/contacto` 393 ms.
- `ttfb ≈ html` on every route → nothing is streaming; the document arrives in one piece.
- `lcp ≈ html + 40 ms` → the client bundle and hydration are cheap. **The cost is server + DB.**
  Do not spend the loop on bundle size until the server numbers come down.

## Ranked hypotheses (highest expected win first)

Each one gets measured, not assumed. Record the result in the Attempt log even when it loses.

1. **Cache the host→tenant resolution.** Kills 2 sequential round-trips on *every* request of
   *both* apps. Expected to remove the entire ~200 ms floor. Biggest single win available.
   Note the two queries are also *sequential* — even uncached, the `gym_domain` and `gym` reads
   could collapse into one join/RPC.
2. **`getClaims()` in the proxy** — check whether it costs a network call per request or verifies
   the JWT locally. If it hits the network, that is another round-trip on every request.
3. **Per-page query waterfalls.** `/` costs ~300 ms *above* the floor. Find out whether that is
   one slow query or several sequential ones; parallelize with `Promise.all`, or fold into one RPC.
4. **Static/ISR the pages that do not need per-request data.** `/legal`, `/nosotros`, `/precios`
   are prime candidates. A cached page skips the DB entirely and is trivially under 50 ms.
5. **The RLS predicate.** Memory note `adr-0013-rls-per-row-claim-is-false` records that the gym
   RLS helper is a correlated SubPlan evaluated **per row**, not once per statement — despite
   ADR-0013 §2/§3 claiming otherwise and *forbidding* the fix. This will not show up against a
   remote DB (network dominates) but will matter a lot once round-trips are ~1 ms.

## Attempt log

Newest last. Every entry: what changed, the measured delta, kept or reverted, and why.

| # | Change | Result | Kept? |
|---|--------|--------|-------|
| — | baseline, live DB | 0/9 pass, worst 509 ms, floor ~200 ms | — |
