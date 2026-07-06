# Slice #42 — S1 Scheduling Schema + Atomic Write Seam — Implementation Plan

> **For agentic workers:** the shipping agent for this slice executes inline, sequentially (no subagent dispatch). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the scheduling spine of ADR-0010 (expand-only, on the #37 catalog base): `class_session` + `class_session_coach`, `schedule_template` + `schedule_template_coach`, the atomic write RPCs (one-off create, recurring create, idempotent per-week materialization, edit, cancel), curated/showcased RLS on all four tables, denial-test-first, branded ids, types regenerated.

**Architecture:** Two expand-only SQL migrations. (1) `create_scheduling_spine` — four gym-scoped tables mirroring the #37 curated/showcased RLS byte-for-byte (`is_member_of` select, `is_staff_of` insert/update, no delete, no anon), with the ADR-0010 invariants realized as constraints: `starts_at timestamptz` (never weekday+string), `duration_min` CHECK ∈ {30,45,60,75,90}, `capacity` CHECK 4–40, `weekday` CHECK 0–5, **no occupancy/spots column ever**, `unique (template_id, starts_at)` guarding idempotent materialization, multi-coach join tables (no single coach column). (2) `scheduling_write_rpcs` — the ADR-0005 seam (SECURITY INVOKER, `SET search_path TO ''`, EXECUTE to `authenticated`): `create_class_session` (one-off + coach joins, one txn), `create_recurring_schedule` (templates + default coaches + materialize the horizon, one txn), `ensure_week_materialized` (idempotent per-week materialization — the same RPC the agenda calls when viewing a future week), `edit_class_session` (single row + coach joins, never fans out), `cancel_class_session`. Gym is derived from `staff_gym()` (ADR-0013), never trusted from a parameter; FK targets (`class_type`, `room`, `coach`) are validated to belong to the caller's gym, so a cross-gym RPC call refuses. Two new denial/behavior SQL files register in `run-denial-suite.mjs`'s `SUITE`. Two branded ids (`ClassSessionId`, `ScheduleTemplateId`) added to `packages/domain/src/ids.ts`.

**Tech Stack:** Postgres/Supabase migrations, the repo's denial-suite harness (`supabase/tests/*.mjs`), TS branded-id pattern, Supabase MCP (`apply_migration`, `get_advisors`, `generate_typescript_types`) for the live apply, a throwaway free scratch project via the Management API for the RED→GREEN rehearsal (`SUPABASE_TARGET_REF`).

## Global Constraints

- Expand-only: no `ALTER`/`DROP` of any existing table; every new object idempotent (`create table if not exists` / `create or replace function` / `drop policy if exists` then `create policy`).
- Every new table: `gym_id uuid not null references public.gym (id) on delete cascade`, indexed, RLS enabled explicitly. Join tables denormalize `gym_id` so each policy is one predicate, no join (ADR-0013 §2).
- RLS shape (curated/showcased, ADR-0013 §3, PRD #36 decision b): select → `is_member_of(gym_id)`; insert+update → `is_staff_of(gym_id)`; **no delete policy**; **no anon grant**.
- RPCs: SECURITY INVOKER (default), `SET search_path TO ''`, revoke EXECUTE from public+anon, grant authenticated (ADR-0005). Gym via `staff_gym()`; FK targets validated in-gym.
- **No occupancy/spots/quedan column, ever** (invariant §5.1). **No single coach column, ever** (§5.4). `starts_at` is the absolute instant (§5.3). Template edits never reach existing sessions (independent rows).
- Manual pre-DDL dump into `C:\Users\Aaron\Documents\RED-2.0-backups\` before ANY live apply; abort `[BLOCKED]` if it cannot be taken.
- Denial suite recorded RED (relations absent) before the migration, GREEN after. `get_advisors` clean of new findings. Regenerate `packages/data/src/database.types.ts`.
- `keep-it-lean`: nothing beyond what data-model §4 + ADR-0010 + the PRD (c)/(e) decisions name.

## Task 1: Branded ids — `ClassSessionId`, `ScheduleTemplateId`
- [ ] Append the two brands + mint functions to `packages/domain/src/ids.ts` (after `RoomId`). `pnpm typecheck` → 0.

## Task 2: Denial + materialization tests — write FIRST, prove RED
- [ ] `supabase/tests/scheduling_rls_denial.sql`: staff-of-A positive control (RPC create + read), anon reads 0 on all four tables, cross-tenant operator_b reads 0 / writes 0 / RPC refuses gym A's rows, member-of-A reads sessions but writes 0 and cannot call the staff RPC.
- [ ] `supabase/tests/scheduling_materialization.sql`: as staff, `create_recurring_schedule` materializes weekday×horizon sessions with coach joins; re-running `ensure_week_materialized` for the same week adds 0 (idempotent); a deactivated template materializes 0 new; editing a template leaves existing sessions' `starts_at` untouched.
- [ ] Register both files in `run-denial-suite.mjs` `SUITE`. Record RED on the scratch project (relations don't exist).

## Task 3: Migration — scheduling spine (4 tables + constraints + RLS)
- [ ] `supabase/migrations/20260706120000_create_scheduling_spine.sql`. Prove the denial file GREEN on scratch after apply.

## Task 4: Migration — atomic write RPCs
- [ ] `supabase/migrations/20260706120100_scheduling_write_rpcs.sql`. Prove the materialization file GREEN on scratch after apply.

## Task 5: Live apply (pre-DDL dump gate) + advisors + types regen
- [ ] Manual pre-DDL dump → `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-06-slice-42\` (abort `[BLOCKED]` if impossible).
- [ ] `apply_migration` ×2 (spine, then RPCs). `get_advisors` (security) clean. `generate_typescript_types` → overwrite `packages/data/src/database.types.ts`. `pnpm typecheck` → 0.

## Task 6: Final verification + handoff
- [ ] `pnpm lint && pnpm typecheck && pnpm test` → 0. `keep-it-lean` self-check. Full denial suite green (regression). Delete scratch project. Acceptance-criteria checklist.

## Execution evidence (2026-07-06)

- **Scratch rehearsal** (throwaway free project `nmqasbqdbzlicjmfnkua`, created + deleted this run; only the live project `hjppxawglmukfvsgmcog` remains): 29 base migrations replayed → `scheduling_rls_denial.sql` + `scheduling_materialization.sql` recorded **RED** (`relation "public.schedule_template" does not exist` / `function public.create_recurring_schedule(...) does not exist`) → the two slice-42 migrations applied → both **GREEN** → full 11-file suite **all green**.
- **Pre-DDL dump** (MANDATORY, taken before any live apply): `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-06-slice-42\` — 16 public tables + `auth_users.json` + `_manifest.json`. Live baseline counts: asistencias 199, clientes 36, ventas 32, paquetes 6, plantillas 8, gym 3, gym_membership 2, catalog spine (coach/class_type/room+children) 0, auth.users 2.
- **Live apply**: `apply_migration create_scheduling_spine` → `{success:true}`; `apply_migration scheduling_write_rpcs` → `{success:true}`. Expand-only (four new tables + five SECURITY INVOKER RPCs); no existing table altered, zero data mutation.
- **`get_advisors(security)`**: no new findings — output is exactly the pre-existing accepted baseline (gym_folio_counter deny-all INFO; the 6 SECURITY DEFINER helper WARNs incl. staff_gym/is_member_of/is_staff_of; the HaveIBeenPwned auth WARN). None of the five new RPCs appear (all INVOKER); all four new tables carry policies.
- **Types**: `packages/data/src/database.types.ts` regenerated from live — `class_session`/`class_session_coach`/`schedule_template`/`schedule_template_coach` + `create_class_session`/`create_recurring_schedule`/`ensure_week_materialized`/`edit_class_session`/`cancel_class_session`. `pnpm typecheck` = 0.

## Gate-2 fix evidence (2026-07-06, re-plan loop 1)

- **Named defect**: a moved session (edit_class_session mutating `starts_at`, keeping `template_id`) vacated its `(template_id, starts_at)` guard slot; the next `ensure_week_materialized` resurrected the original slot — both classes on the calendar.
- **Fix** (`20260706130000_materialization_week_guard.sql`, expand-only NEW migration; the two applied migrations untouched): idempotency re-keyed onto an immutable ledger `schedule_template_week (template_id, week_start)` + `create or replace` of `ensure_week_materialized` (same signature; grants preserved — the 20260702233000 additive-redefinition precedent). `unique (template_id, starts_at)` stays in place (still forbids true duplicate slots). New test vector (5) in `scheduling_materialization.sql`: move the earliest session +1 day via the RPC, re-materialize its week → 0 new, total unchanged.
- **Scratch rehearsal** (throwaway `mhfntndxhkrdnpryveta`, created + deleted this loop): 31 base migrations (incl. the two live slice-42 files) → vector 5 recorded **RED** (`MAT FAIL: re-materializing after a session move resurrected 1 session(s) at the vacated slot` — the exact gate defect) → guard migration applied → **GREEN** → full 11-file suite **all green**.
- **Pre-DDL dump** (before the live apply): `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-06-slice-42b-week-guard\` — 20 public tables + auth; row counts unchanged vs the first dump (asistencias 199, clientes 36, ventas 32; all scheduling tables 0).
- **Live apply**: `apply_migration materialization_week_guard` → `{success:true}`. `get_advisors(security)` → identical pre-existing baseline, zero new findings. Types regenerated (`schedule_template_week` present); `pnpm typecheck` = 0.
