# Handoff — Execute Member Registration SSOT, Phase 1 (subagent-driven)

**Date:** 2026-07-07 · **Branch:** `main` (see Working Tree caveat). **Your job:** *execute* an already-gated plan. Do NOT re-plan, re-brainstorm, or re-review — the design and the plan already passed an adversarial Elegance + Senior-Dev gate at 100%. Just implement it, task by task, with review checkpoints.

## Start here (three files — read in this order)
1. **Plan (your script):** `docs/superpowers/plans/2026-07-06-member-registration-phase1.md` — 6 bite-sized TDD tasks, every migration/test/edit written out in full. This is what you execute.
2. **Spec (the why):** `docs/superpowers/specs/2026-07-06-member-registration-payment-strategy-design.md` — the decisions and the wider Stripe/tiering strategy Phase 1 sits inside. Read §1–§3.
3. **Memory:** `member-registration-payment-strategy` (in the auto-memory) — one-screen orientation.

## What Phase 1 does (one paragraph)
Client-app member registration currently can't produce a bookable account: fresh self-registrants get `clases_restantes = NULL` (= Ilimitado = free unlimited booking — a live hole, unexploited only because 0 members have self-registered), and admin sales don't capture the email that the self-registration claim matches on (so the two "doors" mint duplicate `clientes` rows). Phase 1 = **two additive migrations** (reclaim-create sets `clases_restantes = 0`; `registrar_venta` gains a nullable `p_email`) + **one DAL edit** + **one admin-form field**. No Stripe. Reuses the live claim RPC, balance writer, and booking gate — no new architecture.

## Already done — do NOT redo
- Strategy brainstorm (convergence-tested, 4 vantages), the spec, and the plan.
- **Elegance Check + Senior Dev Approval gate: both 100% PASS** (3 Opus rounds, 2 revisions). The plan on disk IS the gated, revised version.
- **Live DB verified** to match migrations (via MCP `execute_sql`): `clientes.clases_restantes` is nullable/no-default; `perfil.user_id` was dropped by Contract-B (`20260705082018`); `gym_membership` = `{user_id, gym_id, role, created_at}`; forge has 1 owner membership; 38 clientes, all staff-created, 0 self-registered.

## Load-bearing facts for execution (reinforced, not duplicated from the plan)
- **DB test/apply target = the scratch Supabase ref** via the Supabase MCP (`apply_migration`, `execute_sql`, `generate_typescript_types`). SQL tests are `BEGIN/ROLLBACK` (mutate nothing). **Applying the two migrations to LIVE is the deploy step, owner-gated — not part of the TDD loop.**
- **Two of the SQL tests bootstrap the operator from `gym_membership` (owner/operator of forge), never `perfil.user_id`** (dropped by Contract-B). Task 2 Step 1 *repairs the pre-existing, already-broken* `registrar_venta_stamps_gym_id.sql` before it's used as a regression baseline — do not skip that step.
- **The email is NEVER a gate.** Schema is `z.string().trim().optional()` (normalizer, not validator) — no `.email()`, because `crearVenta` calls `.parse()` unguarded and a format throw would reject the cash sale. A malformed email is forwarded as-entered (harmless; just won't match at claim).
- **Green gate to preserve:** `pnpm lint && pnpm typecheck && pnpm test` (pre-commit hook) + `pnpm test:denial`.
- **Do NOT relax the `reservar_clase` money-gate.** Test-member / free-demo booking access = an operator sale marked `pendiente` (balance lands regardless of método) — runbook, no code.

## Sequencing option
The plan is one branch of 6 tasks. Task 1 (the Ilimitado hole) is a standalone security fix and may be shipped first on its own if the owner prefers — the owner raised this. Otherwise execute all 6 in order.

## After execution (owner-gated, next session or owner)
Per the solo-main workflow: branch → implement → fast-forward to `main` → **apply the two migrations to live** → then the Phase 6 `#63` exit-gate re-walk. This unblocks the still-open `#49`/`#63` (see the `phase6-client-execution-progress` memory). Phase 2 (Stripe, BYO-Stripe/subscription model) stays gated on pilot demand + MX counsel — not this session.

## Working Tree caveat
The repo has uncommitted work from the prior auth-hardening session (admin/client component edits, `packages/data` edits) plus this initiative's new docs (spec/plan/memory/this handoff). **Branch off `main` before implementing** (solo-main workflow), and don't sweep the prior session's changes into your commits — keep the Phase 1 commits scoped to the plan's `git add` lists.

## Suggested skills
- **`superpowers:subagent-driven-development`** — PRIMARY. Dispatch a fresh subagent per plan task, two-stage review between tasks. (The plan's header requests exactly this.)
- `superpowers:executing-plans` — alternative if you prefer inline batch execution with checkpoints.
- `keep-it-lean` — run the deletion/no-op test on each diff before calling a task done.
- `superpowers:verification-before-completion` — evidence (real command output) before claiming any task green.
- Supabase MCP tools (`apply_migration`, `execute_sql`, `generate_typescript_types`) — for the migrations, the SQL tests, and the types regen against the scratch ref.
