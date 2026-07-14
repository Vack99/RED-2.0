# Handoff — prep is DONE. The next session is the loop.

Both prep sessions are complete. The harness, the local database, the seed, and a real
19-route baseline all exist. **Do not redo any of it.**

**Read `PERF-LOOP.md` first** — it is the loop's durable memory: the frozen conditions, the
seeded row volumes, the baseline table, the ranked hypotheses, and the attempt log. This
file is disposable; that one is not.

## What the loop session does

> Continue optimizing the code for speed. After each significant change, measure page-load
> performance across every page under the same repeatable test conditions. Continue until
> every page loads in under 50 ms.

Work the ranked hypotheses in `PERF-LOOP.md` top-down, run `pnpm perf <label>` after every
significant change, and append to the attempt log every time — **including the failures**,
because a reverted experiment is a finding and re-running it later is pure waste.

## Starting from cold

```bash
npx supabase start   # the local stack (Docker must be running)
pnpm perf:env        # capture its url/keys -> tools/perf/.env.local-db (gitignored)
pnpm perf:seed       # rebuild the dataset — REQUIRED after any db reset
pnpm perf <label>    # measure all 19 routes
```

## Where you stand

`003-local-baseline.json` — **15/19 routes under 50 ms, worst 318 ms, 0 BROKEN.** The four
failures (`admin/asistencia` 318 ms, `admin/vender` 167 ms, `admin/clientes` 66 ms,
`client/reservar` 51 ms) are all row-volume driven, not network. Three more routes sit
within 2 ms of the gate and will cross it as data grows — `PERF-LOOP.md` explains why they
are failures in waiting, not passes.

## The three things that will waste your time if you forget them

- **A 200 is not a healthy page.** A page whose tenant fails to resolve still answers 200,
  fast, with an empty body. That voided an entire baseline once. `run.mjs` now preflights
  for it, but if a run looks suspiciously fast, **check the `bytes` column before believing
  it.** Re-run `pnpm perf:seed` after any `supabase db reset`.
- **Never `supabase link` this repo to prod, and never `db push`/`db reset` against a
  remote.** Prod's `schema_migrations` does not match 56 of the 78 migration filenames, so a
  push would try to re-apply them — seeds included — over live client data. See PERF-LOOP.md.
- **Windows: `next start` under `pnpm` leaves the port held** if you kill only the shim.
  `stopServers` uses `taskkill /T`. If a run cannot bind 3100/3200, that is why.
- **Never `git stash`** in this worktree — the stash stack is shared with the main checkout.
