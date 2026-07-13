# Venta personalizada — pre-merge denial gate evidence

**Date:** 2026-07-13 · **Branch:** `worktree-venta-personalizada` @ `df5e59f`

Per the AGENTS.md contract (migration-bearing change ⇒ `pnpm test:denial` green on a scratch
project before fast-forward to `main`):

- Scratch project: `hdruuhjreeuyumecdhim` (throwaway, deleted after the run; live ref untouched).
- All 73 migrations applied in order via `supabase/tests/apply-sql.mjs` (Management API; live ref refused).
- `SUPABASE_TARGET_REF=hdruuhjreeuyumecdhim pnpm test:denial` → **`DENIAL SUITE: all 36 files green`** — run twice, both green, including the new `registrar_venta_personalizado.sql` (V1–V8 written-row vectors) and `registrar_venta_stacking.sql` against the v3 function.

First execution of migrations `20260711100000` / `20260711100100` anywhere; live apply + deploy
remain (back-to-back — the same accepted PGRST202 window as `20260710121000`).
