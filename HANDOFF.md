# Handoff — finish the prep, then hand off to the loop

You are the **prep session**. A previous session built the measurement harness and took a
baseline; a reboot was needed to activate a fresh Docker Desktop install, which killed it.
Your job is to stand up the local database and take the real 19-route baseline. You are
**not** the loop — do not start optimizing. A third session does that.

Read `PERF-LOOP.md` too. It is the loop's durable memory (frozen test conditions, ranked
hypotheses, attempt log). This file is disposable; that one is not.

## Where you are

Worktree `.claude/worktrees/perf-50ms`, branch `worktree-perf-50ms`, based on `main` @ `dcfd9b3`.
Re-enter it with `EnterWorktree` using the `path` parameter — do **not** create a new one, and
do not `cd` to the repo root.

Deps are installed, `.env.local` files are copied in (gitignored, they survived the reboot),
Playwright + Chromium are installed, and the pre-commit gate (lint + typecheck + 964 tests)
was green at the last commit.

## What already exists

- `pnpm perf <label>` — `tools/perf/run.mjs`. Production build, both apps on fixed ports
  (client 3100, admin 3200), one login reused, 5 warmups discarded + 20 timed samples per
  route, p50/p95. Writes `tools/perf/results/NNN-<label>.json` and diffs against the previous run.
- `pnpm perf:env` — `tools/perf/env.mjs`. Captures the running local stack's URL/keys into
  `tools/perf/.env.local-db` (gitignored), which `PERF_DB=local` requires.
- `tools/perf/config.mjs` — **every** knob that defines the test conditions, in one file.
  The 19 routes, the fixture UUIDs, the seeded operator's credentials, the gate.
- Baseline `001-baseline.json` — live remote DB, 9 public routes, **0/9 under 50 ms**, worst 509 ms.

`PERF_DB=live` measures only the 9 public routes and never writes to production. `PERF_DB=local`
(the default) measures all 19 and is the real gate. `pointAtLocalDatabase()` hard-refuses to run if
the URL is not localhost, so a mis-set env cannot seed or measure prod by accident.

## Your tasks

### 1. Bring up the local stack

```bash
docker --version          # must work now; if not, Docker Desktop isn't running yet
supabase init             # no config.toml exists yet — this creates it. Safe.
supabase start            # applies all 78 migrations in supabase/migrations
pnpm perf:env             # writes tools/perf/.env.local-db
```

`supabase start` is slow the first time (image pulls). If migrations fail to apply, that is a
real finding — report it, do not paper over it.

### 2. Write `tools/perf/seed-local.mjs`

The seed is the part that decides whether the whole loop measures anything real. Requirements:

- **Deterministic.** It must use the exact UUIDs already declared in `tools/perf/config.mjs`
  (`FIXTURES.clienteId`, `FIXTURES.sessionId`) and gym slug `forge-demo` — the route table
  points at those literals. It must be re-runnable (truncate/upsert), so a run never depends
  on how many times it was seeded.
- **One operator who is both staff and member.** `ADMIN_USER` in config (`perf@local.test`).
  Cookies ignore port, so a single login on :3200 is also a valid session on :3100 — but only if
  that user is staff of the gym *and* has an active membership. Create the auth user via the
  local **service-role admin API** (`SUPABASE_SERVICE_ROLE_KEY` is in `.env.local-db`), with the
  email pre-confirmed; do not hand-insert into `auth.users`.
- **A `gym_domain` row**, so `resolveTenant` behaves as it does in production.
- **The Vault secret `tenant_assertion_key`**, matching `TENANT_ASSERTION_KEY` in `.env.local-db`
  (issue #93 D2 tenant binding). The app will not work without it. This is exactly the kind of
  thing that was a manual step on live and is easy to miss locally.
- **Realistic row volumes — this matters more than it looks.** See the open decision below.

Tables you'll be touching (full list is in the migrations):
`gym`, `gym_domain`, `gym_membership`, `clientes`, `ventas`, `asistencias`, `paquetes`,
`class_type`, `class_session`, `reservation`, `coach`, `schedule_template`, `perfil`,
plus the content tables the public client pages read: `about_value`, `faq`, `stat`,
`plan_feature`, `gym_contact`, `facility`.

Cross-check against the page code — `/nosotros`, `/precios`, `/contacto` each read specific
content tables, and a page that renders an empty state because its table is empty is a page
whose real cost you did **not** measure.

### 3. Take the real baseline

```bash
pnpm perf local-baseline
```

Acceptance: **19/19 routes reported, 0 BROKEN.** A `BROKEN` row means the route 3xx'd or 5xx'd —
usually a missing session or missing seed data. A redirect to `/login` returns in ~5 ms and would
otherwise look like a spectacular win. Do not hand a run with BROKEN rows to the loop.

### 4. Record it and stop

Update `PERF-LOOP.md`: fill the local-DB baseline row in Status, and rewrite "What the baseline
actually says" against the *local* numbers. The live-DB observations there are about a
network-bound world that no longer applies — the ~200 ms floor will collapse to a few ms, and
whatever is *then* slowest is the loop's actual target. Re-rank the hypotheses accordingly.

Commit. Then stop and hand off.

## Open decision for the owner (ask at the start of the session)

**How many rows should the seed carry?** Row counts change what we measure. Memory note
`adr-0013-rls-per-row-claim-is-false` records that the gym RLS helper is a correlated SubPlan
evaluated **per row**, not once per statement. With 5 clientes seeded, that bug is invisible and
the loop would "pass" 50 ms while the real app crawls.

Ideal: mirror production's real counts. Reading them needs owner approval — the Supabase MCP is
bound to **prod** (`hjppxawglmukfvsgmcog`), and an attempt to read row counts was correctly denied
in the previous session because prod was never authorized as a target. Ask; a read-only
`select count(*)` per table is harmless with a green light.

Failing that, seed a defensible synthetic volume and **write the numbers into `PERF-LOOP.md`** so
every later result is interpretable: ~500 `clientes`, ~3000 `ventas`, ~5000 `asistencias`,
~200 `class_session`, ~1000 `reservation`. Under-seeding is the single easiest way to make this
entire loop measure nothing.

## Gotchas that already bit us

- **`NEXT_PUBLIC_*` is inlined at build time.** Pointing the apps at local Supabase is not a
  runtime env swap; the *build* must carry it. `run.mjs` calls `pointAtLocalDatabase()` before
  `build()` for exactly this reason. Don't reorder that. (It is not named `use*` because ESLint's
  `react-hooks/rules-of-hooks` rule reads any `use`-prefixed function as a React hook and fails
  the lint gate.)
- **The gate is on `html` (last byte of the document), not TTFB.** Next streams SSR, so TTFB can
  arrive in 5 ms while the page is still blocked on the DB — gating it would let us win by
  streaming an empty shell. The owner originally picked TTFB and was told about this change.
- **Windows: `next start` under `pnpm` leaves the port held** if you kill only the shim.
  `stopServers` uses `taskkill /T`. If a run dies and the next one cannot bind 3100/3200, that's why.
- **Never `git stash`** in this worktree — the stash stack is shared with the main checkout.

## Then: the loop session

Once the local baseline is green, the next session runs the loop with this prompt:

> Continue optimizing the code for speed. After each significant change, measure page-load
> performance across every page under the same repeatable test conditions. Continue until every
> page loads in under 50 ms.

That session should read `PERF-LOOP.md` first, work the ranked hypotheses top-down, run
`pnpm perf <label>` after every significant change, and append to the attempt log every time —
**including the failures**, because a reverted experiment is a finding and re-running it later is
pure waste.
