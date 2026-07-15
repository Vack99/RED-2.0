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
- Every request pins the tenant with `?gym=forge-demo`.
- One login, session reused across all authenticated routes.
- Gate is on `html`, **not `ttfb`** — Next streams SSR, so a first byte can arrive in 5 ms
  while the page is still blocked on the DB. `ttfb` and `lcp` are recorded, not gated.
- **`lcp` and `bytes` are ratcheted, not gated** (see "The ratchet" below). You optimize the
  low-noise server metric; the ratchet stops you winning it by pushing work into the browser.
- **Seeded row volumes are part of the conditions** (see below). Change them and every
  previous number becomes meaningless.

### The ratchet (warn-level — `run.mjs` `ratchet()`)

Gating `html` alone has a hole: convert an SSR data-fetch into a **client-side** fetch and the
document shrinks (`html` drops, gate "won") while the data wait reappears in the browser (`lcp`
climbs). Gating `html` instead of `ttfb` does **not** catch this — the document really does
arrive fast, it just no longer carries the data. So after every run the harness compares two
recorded-but-ungated metrics against the previous run and **warns** (never fails):

- **LCP regression** — flagged if a route's LCP rose by >30% *and* >25 ms. Generous on purpose:
  LCP is 5 cold-context Playwright samples and swings hard, so a tight gate would cry wolf. It
  is warn-level until its noise floor is characterized over a few iterations; promote it to a
  fail-gate only then.
- **Bytes moved materially** — flagged on a >15% *and* >1 KB move in **either** direction. Not
  a one-way ratchet: a big DROP is how the empty-page bug announced itself; a big RISE is
  unexpected in a pure-optimization loop. This is the home-page preflight, generalized to all
  19 routes. **If the ratchet flags a bytes drop, the run is probably measuring an empty page —
  do not trust its `html` numbers.**

### The seed (`pnpm perf:seed` → `tools/perf/seed-local.mjs`)

One gym, `forge-demo`, rebuilt from scratch on every run (idempotent).

| | seeded | production today |
|---|---|---|
| `clientes` | **500** | 48 |
| `ventas` | **3000** | 53 |
| `asistencias` | **5000** | 285 |
| `class_session` | **197** | 219 |
| `reservation` | **1000** | 14 |

Production is a demo-scale dataset. Mirroring it would seed a fixture too small for a
per-row cost to show up on localhost — the gate would pass while a real gym crawled — so
the owner chose to seed **one real operating gym** instead. Read every number below
against that.

The seeded operator (`perf@local.test`) is both **staff** (`gym_membership` role `owner`)
and **member** (a `clientes` row with `auth_user_id`), so one login covers all 19 routes.

## How to run

```bash
pnpm perf:seed                 # rebuild the local dataset (after ANY db reset)
pnpm perf <label>              # local DB (Docker) — all 19 routes. The real gate.
pnpm perf <label> --no-build   # skip the rebuild (only if you changed nothing but data)
PERF_DB=live pnpm perf <label> # live remote DB — 9 public routes only. Never writes to prod.
```

Each run writes `tools/perf/results/NNN-<label>.json` and prints a per-route diff against
the previous run. **A change is only real if the diff moves by more than 2 ms** — below
that is measurement noise, not signal.

⚠️ The 2 ms rule holds for the **cheap, stable** routes. The **expensive and borderline**
ones (`admin/asistencia`, `admin/vender`, `client/reservar`, and the three near-misses) have
a much wider run-to-run spread — two identical-code runs saw `admin/agenda` flip 48.7→50.9
(PASS→FAIL) and `reservar` move 50.8→67.8. **Do not trust a single run's pass/fail within
~15 ms of the gate on those routes; re-run before believing a borderline flip either way.**

## Status

| | |
|---|---|
| Baseline (live DB, 9 public routes) | `001-baseline.json` — 0/9 under 50 ms, worst 509 ms |
| ~~Local, run 002~~ | **VOID — do not trust it.** Measured empty pages (see "The grants trap") |
| Baseline (local DB, all 19 routes) | `003-local-baseline.json` — 15/19 under 50 ms, worst 318 ms, 0 BROKEN |
| **FINAL (2026-07-14, loop complete)** | **`011` + `012-confirm-final.json` — 19/19 under 50 ms in BOTH runs; worst 39.0 / 43.4 ms. Denial suite 36/36 green on scratch. Awaiting: live migrations → push (see runbook at bottom).** |

## The baseline (`003-local-baseline`)

| ms (p50) | route | bytes | |
|---|---|---|---|
| **317.9** | `admin/asistencia` | 57KB | **FAIL** |
| **167.4** | `admin/vender` | 25KB | **FAIL** |
| **65.8** | `admin/clientes` | 47KB | **FAIL** |
| **50.8** | `client/reservar` | 19KB | **FAIL** |
| 49.2 | `admin/inicio` | 12KB | *near miss* |
| 48.7 | `admin/agenda` | 12KB | *near miss* |
| 44.7 | `admin/cuenta` | 14KB | *near miss* |
| 32.3 | `admin/clientes/[id]` | 15KB | |
| 30.0 | `client/confirmada/[id]` | 7KB | |
| 29.5 | `client/clase/[id]` | 7KB | |
| 24.5 | `client/` | 11KB | |
| 21.7 | `client/precios` | 14KB | |
| 16.9 | `client/nosotros` | 13KB | |
| 15.2 | `client/contacto` | 10KB | |
| 13.3 | `admin/login` | 9KB | |
| 10.6 | `client/entrar` | 10KB | |
| 10.2 | `client/registro` | 10KB | |
| 9.6 | `client/legal` | 8KB | |
| 9.3 | `client/restablecer` | 9KB | |

## What the baseline actually says

Read the numbers, not the vibes. **This is a different world from the live-DB baseline —
the old conclusions are dead.**

- **The ~200 ms floor is gone.** It was network, exactly as suspected. The pages that fetch
  nothing (`/legal`, `/restablecer`, `/registro`, `/entrar`, `admin/login`) now land at
  **9–13 ms**, down from 197–209 ms. `resolveTenant`'s two sequential queries now cost a
  couple of ms, not two round-trips.
- **Every failure is now row-volume driven, and they are all admin roster pages.** The cost
  is no longer "does the page touch the DB" but "how many rows does it drag back".
- **`admin/asistencia` (318 ms) is the worst by 2×.** `getMarcadas()` reads the **entire**
  `asistencias` history with no date filter, paginated at 1000 rows/page — with 5000 rows
  that is **5 sequential round-trips** before the page can render. It gets strictly worse
  every day the gym operates.
- **`admin/vender` (167 ms)** — `getClientesLite()` selects 500 `clientes` with an embedded
  `ventas(count)`, i.e. a correlated count **per client row**.
- **`admin/clientes` (66 ms)** — 500 `clientes` plus this month's `asistencias`.
- **The three "near misses" are not safe.** `admin/inicio` (49.2), `admin/agenda` (48.7) and
  `admin/cuenta` (44.7) are inside the gate only because the gym is small. They read the
  same unbounded shapes and will cross 50 ms as data grows. Treat them as failures in
  waiting, not as passes.
- `ttfb ≈ html` on every route → still nothing streams; the document arrives in one piece.
- `lcp ≈ html + 60–90 ms` → the client bundle and hydration remain cheap. **The cost is
  server + DB. Do not spend the loop on bundle size.**

## What the 50 ms gate does and does not capture (read before trusting the proxy)

The local gate is a **proxy** for production, and it is easy to mis-state which proxy. Three
different latencies get conflated into one; keep them apart.

1. **User → server (WAN + CDN).** The latency a real user in the field pays before the server
   even starts. The gate **does not capture this at all**, and it is the main reason a green
   50 ms local run is *not* a 50 ms experience for a user. This is the honest caveat — not the
   DB round-trip.
2. **Server → DB, in production (Vercel function → Supabase).** This is inside the `html`
   number and is the thing the gate is really pressure-testing. **If Vercel and Supabase are
   co-located in one region, this is single-digit ms** — close to localhost — which would make
   the local gate a *good* proxy for production server-render time, not merely a directional
   one. ⚠️ **KNOWN UNKNOWN: region colocation is unconfirmed. Confirm it before leaning on
   either the optimistic or pessimistic reading of these numbers.**
3. **Dev-machine → live Supabase.** The 112–152 ms round-trip and the ~200 ms live-baseline
   floor were measured on *this* path — home broadband to remote Supabase. It is **not** the
   production serving path, so "prod round-trips cost 150 ms, therefore no page loads in 50 ms"
   does not follow: that reasoning measures path 3 but the production render pays path 2.

**What genuinely transfers to production is round-trip COUNT and row VOLUME** — a page that
does 5 sequential DB round-trips or drags back 5000 rows is slow on any path, co-located or
not. That is exactly what the failures below are, and why the loop is worth running even though
the absolute local milliseconds are optimistic. Optimize the transferable quantity; don't
mistake the local number for the user's number.

## Ranked hypotheses (highest expected win first)

Each one gets measured, not assumed. Record the result in the Attempt log even when it loses.

1. **Kill the unbounded reads on the admin pages.** This is where 4/4 of the failures live.
   `admin/asistencia` fetching all-history attendance in 5 sequential pages is the single
   biggest number on the board (318 ms); it needs a bounded window or an aggregate, not
   pagination. `admin/vender`'s per-row `ventas(count)` (167 ms) wants one grouped count,
   not 500 correlated ones. Expect the largest wins here by a wide margin.
2. **The RLS predicate — now that it is finally visible.** `adr-0013-rls-per-row-claim-is-false`
   records that the gym RLS helper is a correlated SubPlan evaluated **per row**, not once
   per statement (ADR-0013 §2/§3 claim otherwise and *forbid* the fix — the ADR is wrong).
   With the network gone and 500–5000 row reads, this is exactly the regime where it bites.
   Measure it with `EXPLAIN ANALYZE` before and after, on the roster queries above.
3. **Cache / collapse `resolveTenant`.** Locally this is now worth only a few ms per route —
   but it runs on **every request of both apps**, and against the live DB it *is* the entire
   ~200 ms floor. Cheap, safe, and the one item on this list that matters more in production
   than it does on the bench. Do it, but do not expect it to move the local gate.
4. **`getClaims()` in the proxy** — check whether it verifies the JWT locally or costs a
   network call per request.
5. **Static/ISR for the pages that need no per-request data** (`/legal`, `/nosotros`,
   `/precios`). All three already pass comfortably; this is now a polish item, not a fix.

## Two defects found while standing this up (both real, neither is perf)

**1. Duplicate migration versions — FIXED here.** `supabase start` was hard-broken: two pairs
of migrations shared a version timestamp, and `version` is the primary key of
`schema_migrations`. Fixed by an order-preserving rename (`…170000_create_gym_contact` →
`…165900`, `…180000_asistencias_reservation_link` → `…175900`); replay order is byte-identical.
Nothing had ever caught it because the CLI's local replay is the only path where the filename
is a primary key, and this repo had never run it.

**2. ⚠️ Prod's `schema_migrations` does not match the migration filenames — NOT fixed.**
`apply_migration` stamps its own version at apply time, so **56 of the 78 local migration
filenames have versions prod has never recorded**. `supabase db push` diffs on exactly those
versions, so against prod it would try to re-apply all 56 — *including the seed migrations* —
over live client data. It is currently unreachable only because the repo is **unlinked**
(no `supabase/.temp/project-ref`). **Never `supabase link` this repo to prod, and never
`db push`/`db reset` against a remote.** Migrations keep going up via `apply_migration`.

### The grants trap (cost a whole baseline run — do not fall in it again)

Run 002 came back **17/19 under 50 ms, worst 21 ms** and was completely worthless: every page
was rendering an empty state.

The migrations assume Supabase's *platform* default privileges, which grant table-level
SELECT to `anon`/`authenticated`. **The local Docker stack does not** — migrations there run
as `postgres`, whose default ACL grants only `Dxtm` (no SELECT). PostgREST could read nothing,
`resolveTenant` found no tenant, and every page fell back to its "no gym" copy — while still
answering **200**, in ~10 ms, because it touched no data.

Two guards now exist:
- `seed-local.mjs` grants the missing table privileges locally, mirroring prod exactly
  (including the deliberate #93/D3 `gym` anon column-narrowing). It is **not** a migration:
  prod already has these grants, and a migration would *broaden* anon's surface on prod.
- `run.mjs` **preflights** the client home for the seeded gym's brand name and aborts the run
  if it is missing. A hollow page can no longer masquerade as a fast one.

**If a run ever looks suspiciously fast, check the `bytes` column before believing it.**

## Known unknowns / owner items surfaced by the loop

- **JWT verification path**: `getClaims()` verifies locally ONLY with asymmetric signing keys (ES*/RS* + JWKS). On the legacy HS256 secret it silently falls back to `getUser()` = one auth-server round trip **per request per app**. Local Docker uses HS256 → part of the measured per-request floor. **Check the prod project's signing-key config; migrating to asymmetric keys is a dashboard action, not code.**
- **Region colocation** (from "What the gate captures"): still unconfirmed; determines how well these local numbers transfer.
- **admin/clientes product lever (HELD)**: profiling attributes ~26–35 ms of that route to SSR+flight of all 500 roster rows through one client boundary. If the proxy-cache wave doesn't get it under 50, the remaining lever is server-side search/pagination — a product change needing owner sign-off.
- ~~**asistencia presence-only follow-up**~~ — SHIPPED in wave 5 (migration 20260714100000).

## Ship runbook (ORDER MATTERS — read before pushing main)

Pushing `main` auto-deploys both Vercel apps, and the new code calls RPCs that do not
exist on live yet. **Apply the migrations to live FIRST, then push.**

1. **Live migrations** (owner, via MCP `apply_migration` or dashboard SQL — never `db push`),
   in exactly this order:
   `20260714060000_marcadas_por_gym_rpc` → `20260714070000_ventas_count_por_cliente_rpc` →
   `20260714080000_rls_uncorrelated_predicates` → `20260714090000_marcadas_por_gym_windowed` →
   `20260714100000_marcadas_presencia`.
   (090000 DROPs the 1-arg `marcadas_por_gym` created by 060000 — apply 060000 anyway so the
   ledger matches the files; the pair is idempotent in sequence. 080000 is the RLS rewrite —
   denial-proven on scratch, 36/36.)
2. Sanity on live (read-only): `select public.marcadas_presencia(...)` for a real gym returns
   counts; spot-check one staff SELECT (roster loads in admin).
3. `git push origin main`.
4. Watch the two Vercel deploys; admin `/asistencia`, `/clientes`, `/vender` are the routes
   that exercise every new RPC.
5. Optional but recommended (surfaced by profiling): check the prod project's JWT **signing-key
   config** — on legacy HS256, `getClaims()` = one auth round trip per request per app;
   asymmetric keys make verification local. Dashboard action, no code.

## Attempt log

Newest last. Every entry: what changed, the measured delta, kept or reverted, and why.

| # | Change | Result | Kept? |
|---|--------|--------|-------|
| — | baseline, live DB | 0/9 pass, worst 509 ms, floor ~200 ms | — |
| — | local DB, run 002 | 17/19 "pass", worst 21 ms — **VOID**, measured empty pages (missing local grants) | — |
| — | local grants fixed + preflight added | run 003: **15/19 pass, worst 318 ms, 0 BROKEN** — the real baseline of record | ✔ |
| — | LCP + bytes ratchet added (warn-level) | self-test vs 003 was clean — no false alarm even though reservar's LCP swung +28 ms (+18%) on identical code; the >30%-AND-25 ms threshold held. Self-test run discarded so 003 stays the reference | ✔ |
| — | `004-baseline-reconfirm` (no code change, fresh session) | 14/19 pass, worst 335.3. FAILs: asistencia 335.3, vender 162.1, clientes 72.5, reservar 63.1, inicio 53.8. agenda 46.8 / cuenta 46.4 now barely pass (still failures-in-waiting). Confirms 003 within run-noise; this is the anchor for diffs. | ✔ |
| 1 | `getMarcadas` → single `marcadas_por_gym(p_gym_id)` SQL RPC (jsonb_object_agg, SECURITY INVOKER, migration 20260714060000). 5 sequential 1000-row pages → 1 round trip. Types regen'd (`gen types --local`, picked up 3 pre-existing hand-file drifts). asistencia.test.ts reasserted on `.rpc()` mechanic; fake helper got `rpcCalls`. | run 005: **asistencia 335.3 → 119.8 (−215.5)**, still FAIL — residual ≈ getClientesParaPase (500 rows) + RLS-per-row + 55KB doc. 15/19. reservar 63.1→53.3, inicio 53.8→47.6 (both borderline-noise per the ±15 ms rule). 962 tests + typecheck green. | ✔ |
| 2 | Wave 2, three fixes at once: (a) `getClientesLite` ventas(count) embed → `ventas_count_por_cliente` RPC; (b) `getClientesRoster` month-asistencias rows → `asistencias_mes_por_cliente` RPC (both in migration 20260714070000); (c) `getRosterResumen` full-roster read → 2 head-count queries + auth_user_id-scoped subset (predicate proven equivalent on all 500 seeded rows). (d) reservar: `resolverMiembroGym` cache()d (6→2 trips), 4 clientes reads → 1 `fetchClienteRow`, contarActivos into the batch. | run 006: **vender 168.7 → 66.3 (−102.4)**. clientes 72.3→67.4 (−5, weak — cost is the 500-row select itself + RLS, not the count leg). reservar 56.8 (no change — why? see profiling). **APPARENT regression: client/clase/[id] 27.9→60.2 (+32.3), confirmada 26.5→40.5 (+14)** — diagnosed as NOT caused by (d): confirmada makes zero agenda-miembro runtime calls (type-only imports), clase's one touchpoint (getSaldoMiembro) has identical RT depth before/after. Likely run artifact (fresh migrations + cold DB, fixed route order). Re-check next run before believing it. Also learned: (d) deduped work that was already parallel → cuts DB load, cannot cut html p50; reservar's real lever = sequential depth (resolverMiembroGym 2→1 query, fetchProximasReservas 6-deep chain). 12/19. Tests 963 green. | ✔ (d) kept |
| 3 | Wave 3: (a) migration 20260714080000 — 25 SELECT policies rewritten correlated→uncorrelated set-membership (hashed InitPlan once/statement; `gym_membership_staff_select` left correlated: self-referential = infinite recursion, single-digit rows; write policies untouched; denial re-proven 0 rows for non-member on all 25; ADR-0013 adoption note added). EXPLAIN: asistencias 42.2→2.98 ms, clientes 3.81→0.33 ms. (b) `getOperatorGym` cache-key normalized (inner cache on resolved client) — the only demonstrated double-fire in packages/data; ~15 DAL fns + every page share one bucket now. | run 007: **17/19**. asistencia 115.9→55.9, vender 66.3→28.8 PASS, clientes 67.4→61.5, reservar 43 PASS, inicio 40.4, cuenta 37.5, agenda 48.7 (no margin). clase 28.4 / confirmada 28.9 — **run-006 spike confirmed artifact, not the refactor**. Tests 963 green. ⚠️ RLS migration ⇒ pre-merge `test:denial` on scratch is MANDATORY. | ✔ |
| 4 | Wave 4: (a) `marcadas_por_gym` windowed (migration 20260714090000, 3-arg only — 1-arg dropped to avoid PGRST203 overload ambiguity); initial window = firstOfMonth(hoy−104d)..firstOfNextMonth (day strip DAYS_BACK=104 is the floor), past months lazy via `marcadasDeMesAction` merged client-side; gzip doc 54→43 KB. (b) `resolveTenant` module-level TTL cache (60 s, negatives cached, FIFO 500, Edge-safe) + host/slug lookups parallel on miss; host-wins precedence bit-identical. (c) agenda `fetchSesionesEnRango` depth 4→3 (contarActivos into the batch; ensure_week_materialized left alone — its writes are read by the fetch). | run 008: **18/19, worst 58.4**. Board-wide −3..−12 ms from (b): agenda 48.7→36.7, inicio 32.1, vender 22, login 7.9, static pages 5–6. asistencia 55.9→49.6 PASS-with-zero-margin. clientes 61.5→58.4 = the only FAIL (SSR/flight of 500 rows — the held lever, now being attacked UX-identically via windowed initial SSR). Tests 973 green. Profiling insight of record: admin/clientes ≈26–35 ms is SSR+flight of 500 rows; every authed route paid ~16–20 ms proxy floor (target of (b)). | ✔ |
| 5 | Wave 5: (a) clientes roster **windowed initial SSR** (`ROSTER_WINDOW=50` + rAF reveal-all after mount; search/sort stay over the full 500 from first keystroke; Playwright-verified 50 SSR anchors → 500 post-hydration, off-window search instant). Raw HTML 1.2 MB→315 KB, gzip 47→27.5 KB. (b) asistencia **presence contract**: `marcadas_presencia` count-RPC (migration 20260714100000) for strip/calendar dots + ids only for today initially; `getMarcadasDelDia` action per selected day; loaded-day ids authoritative over presence count (toggle-safe). Initial marcadas jsonb 107.6 KB→2.9 KB (−97%). | run 009: **19/19 first time, worst 46.6** (clientes 58.4→27.3). Run 010 (no-change confirm): asistencia flipped back to **50.6 FAIL** on board-wide +2–7 ms drift — borderline rule vindicated, margin was luck. Tests 978 green. | ✔ |
| 6 | Wave 6: asistencia pase roster gets the same windowed initial SSR (50 rows + reveal; toggle/optimistic/day-select untouched; Playwright-verified). Doc raw 1 MB→268 KB, gzip 45.4→26.4 KB. Local DB re-seeded before measuring (agents' drive-toggles perturbed rows). | run 011: **19/19, worst 39.0** — asistencia 50.6→23.3 (−27). run 012 (no-change confirm): **19/19 again, worst 43.4**, asistencia 26.6. **GOAL MET, stable across two runs.** | ✔ |
| — | Pre-merge DB contract: scratch project synced via Management API only (no link/push; live ref hard-excluded) — 6 missing migrations applied (recibo drop-default + 5 perf), ledger created/backfilled 83/83. | `pnpm test:denial` vs scratch: **36/36 suites green** (covers the RLS-rewrite migration). | ✔ |
| 7 | Post-audit fix set (senior verdict APPROVED-WITH-RESERVATIONS, elegance ELEGANT-WITH-NITS): M1 resolveTenant no longer caches transient errors (cacheable flag); L1 fetchClienteRow per-consumer error contracts restored (saldo throws, favorito/perfil best-effort); L2 104-day lockstep guard test (fs-read, boundary-clean); L3 two lying comments fixed; windowed-SSR trio extracted to `useRevealedWindow` in @gym/ui; `(perf wave N)` tags dropped. Migration 060000→090000 churn deliberately left (scratch/local ledgers already carry both; squashing desyncs denial-run provenance). | runs 013/014: reservar noise-flipped 50.4→42 — thin margin confirmed. Tests 984 green. | ✔ |
| 8 | reservar structural margin: `resolverMiembroGym` (both twins, agenda-miembro + clase-miembro) and `fetchProximasReservas` collapsed via FK embeds (`gym_membership→gym`, `reservation→class_session`) — 2 sequential round trips each → 1; JS-filters over single-digit member rows preserve cancelled/gte/order/dedupe semantics. Embed shape verified against live stack + generated types. | runs 015/016 + final confirm: **19/19 three consecutive runs, worst 46→44.9→44.1; reservar 46→44.9(p50 44.1 on confirm), p95 49.1**. Tests 986 green. **LOOP CLOSED.** | ✔ |
| — | **Profiling (run 005 state, asistencia residual)**: RLS-on EXPLAIN ANALYZE proves `asistencias_staff_select` is a correlated SubPlan, `is_staff_of` × loops=5000 → 38.2 ms vs 3.4 ms RLS-off (ADR-0013's O(1) claim false, as memory says). RPC wall over PostgREST 75–88 ms: ~35 ms RLS + ~45 ms HTTP/JSON-encode of the **123 KB** jsonb (PostgREST does NOT gzip RPC responses). `getOperatorGym` fires twice per page (cache() keyed on client-arg identity; page passes no arg, DAL passes client). clientes select RLS delta +4.4 ms @ 500 rows, same mechanism. | Levers ranked: (1) RLS uncorrelated rewrite ≈ −35 ms asistencia + −4 ms per 500-row page; (2) getOperatorGym dedupe ≈ −9–18 ms; (3) 123 KB payload — windowing = contract change, hold for wave 4 if needed. | — |
