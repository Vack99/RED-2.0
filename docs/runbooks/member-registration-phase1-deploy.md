# Deploy runbook — Member Registration SSOT, Phase 1

**Date authored:** 2026-07-07 · **Branch:** `member-registration-phase1` (off `main` 9693a21) · **Status:** code complete, reviewed "ready with deploy notes", gate green (lint + typecheck + 728 Vitest). **Live DB is untouched** — this runbook is the owner-gated deploy step.

## What shipped on the branch
Closes the two live registration defects with zero Stripe (spec: `docs/superpowers/specs/2026-07-06-member-registration-payment-strategy-design.md`):
- **Defect B (Ilimitado hole):** fresh self-registrants got `clases_restantes = NULL` (= Ilimitado = free unlimited booking). Now start at finite `0`.
- **Defect A (two doors never meet):** admin sales didn't capture email, so admin-created and self-registered members minted duplicate `clientes` rows. `registrar_venta` now stores the email the claim RPC matches on.

Commits (6): reclamar clases=0 migration · registrar_venta p_email migration + email test + repaired money-path bootstrap · types hand-add · DAL forward · admin form field · migration-comment deploy-order clarification.

## Why this is deferred (not done this session)
The Supabase MCP is bound to **LIVE** (`hjppxawglmukfvsgmcog`) and no scratch project exists, so `apply_migration` would hit prod. Per owner decision (2026-07-07) the migrations were **authored + committed only**; RED was proven by running the SQL tests against live in **rolled-back** `BEGIN/ROLLBACK` transactions (zero mutation). See memory `supabase-mcp-bound-to-live`.

## ⚠️ Deploy order is load-bearing — MIGRATE FIRST
New app code forwards `p_email` **only** for a new-client sale that carries an email. Against the current live **11-arg** `registrar_venta`, that named-arg call errors (**PGRST202** → "No se pudo registrar la venta"). Existing-client and new-client-**without**-email sales are unaffected (they omit `p_email`).

- **Apply BOTH migrations to live BEFORE the apps deploy.** Migrate-first = **zero** broken-sale window (the old, still-deployed app's 11 named args resolve to the new 12-arg function with `p_email` defaulting NULL; only one overload exists after the DROP, so no ambiguity).
- App-first (e.g. fast-forwarding `main` triggers a Vercel deploy before the migration lands) breaks new-client-with-email sales until the migration is applied.

## Deploy sequence

1. **Pre-gate dump** (free tier has no PITR): manual dump per the Phase-3 practice (`C:\Users\Aaron\Documents\RED-2.0-backups\`).
2. **Apply migration `20260707030000_reclamar_create_zero_saldo.sql`** to live via MCP `apply_migration` (order-immune; `create or replace`).
3. **Apply migration `20260707031000_registrar_venta_capture_email.sql`** to live via MCP `apply_migration` (DROP 11-arg + CREATE 12-arg + re-grant).
   - Use **MCP `apply_migration`**, NOT `supabase db push` without `--include-all`: the new files sort after live's newest `20260707013533`, but there is a local↔live history divergence (local `20260706230000_seed_...` isn't in the live migrations table; local `red_remediation` filename `20260706220000` is recorded live as `20260707013533`), so a plain `db push` could skip out-of-order files.
4. **Confirm PostgREST picked up the new signature** — a DROP+CREATE forces a schema-cache reload (seconds, not instant). Verify with one test sale-with-email (or the SQL green below) before treating the app deploy as live.
5. **Fast-forward `main` to the branch and deploy the apps** (solo-main workflow).

## Post-apply verification (SQL green — run ad hoc against live via MCP `execute_sql`; all are `BEGIN/ROLLBACK`)
The two money-path tests are now **wired into** `pnpm test:denial` (#80), but they read the forge owner/operator from `gym_membership`, so the scratch project must carry a seeded forge operator membership (a fresh preview branch has none). Against live they still run ad hoc as below:
- `supabase/tests/registrar_venta_email.sql` → `registrar_venta email capture: OK` (Defect A proven).
- `supabase/tests/registrar_venta_stamps_gym_id.sql` → `registrar_venta gym_id stamping: OK` (money-path regression).
- `supabase/tests/registro_claim.sql` → `registro claim suite: OK` (V2 now sees `clases_restantes = 0`). Also covered by `pnpm test:denial` if you set `SUPABASE_TARGET_REF` + `SUPABASE_ACCESS_TOKEN` against a seeded scratch.

## Acceptance on red-demo (both onboarding directions — plan Task 6 §3–5)
- **Operator-first:** operator sells a NEW client **with** email → that person self-registers with the **same** email → `reclamar_o_crear_cliente` returns `reclamado = true`, the paid row is claimed (`auth_user_id` set, balance carries), **no duplicate**.
- **Member-first:** self-register → `clases_restantes = 0`, `reservar_clase` blocked ("Sin clases disponibles") while schedule/class detail still browse → operator sells in **EXISTENTE** mode → same row updates → booking succeeds.
- **Regressions:** a NEW-client sale with email **blank** still succeeds; with a **malformed** email (`"maria@"`) still succeeds (never blocked — just won't converge at claim time); Forge admin unaffected.

## After deploy
Unblocks the Phase-6 `#63` exit-gate re-walk and, with it, `#49`. (Separate `#63` owner items from the `phase6-client-execution-progress` memory — Supabase Auth URL config, red-demo content seed, reaching red-demo via `?gym=` — are not part of this deploy.) Phase 2 (Stripe / BYO-Stripe subscription) stays gated on pilot demand + MX counsel.
