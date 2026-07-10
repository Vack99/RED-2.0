# Phase 6 Kickoff Brief — Client app build (RED)

> Written 2026-07-05 by the Phase-5 orchestration session. Paths point to sources; this doc does not copy them.
> **Job of the next session:** produce the Phase 6 **plan** (PRD → issues → goal file), not code.

## Read first — the shields (in this order)

1. `docs/planning/2026-06-29-multi-gym-platform-roadmap.md` — Phase 6 row + exit criteria, **and the "Phase 6 decomposes further" section: do NOT plan it as one lump** — vertical slices `marketing → auth (entrar/registro) → booking → membresía (payment UI-only) → perfil`.
2. `docs/planning/2026-06-29-target-data-model-and-decisions.md` — **the spec**. §4 transactional entities (`reservation` + states, `subscription`, member stats), §5 invariants, §6 parked defaults (payments = "paga en tu gym", no processor).
3. ADRs: `0009` (two-tier member auth + claim-by-match — **already shipped in Phase 3**, Phase 6 builds screens on it), `0010` (consume model: booking consumes a clase, Ilimitado exempt, no-show consumes), `0012`/`0013` (host→brand, RLS-by-membership), `0005` (booking writes = atomic RPCs).
4. `docs/prds/prd-admin-agenda.md` **decision (b)**: anon-read RLS on showcased tables was **deferred TO Phase 6** — the marketing pages (precios/nosotros) need those policies. This is Phase-6 schema work, easy to miss.

**Rule:** if a decision seems missing, it is in the data-model doc (§4/§6) or a parked default — **do not invent one.**

## You are here

Phases 0–5 all ✅. Phase 5 closed 2026-07-05: 10 slices merged to `main @ b06e61a`, exit gate #47 walked+passed (`docs/runbooks/red-demo-seed-evidence.md` §Phase-5 exit gate), roadmap ticked @ `dba11e0`, both Vercel projects deployed. **Phase 6 is unblocked, unstarted.** Phase 7 owns go-live; **#35 stays parked** — do not touch.

## The Phase-5 contract Phase 6 builds on (all LIVE on the DB + in `main`)

- **Schema live:** `coach`, `class_type`(+workblock/bring_item), `room`, `class_session`, `class_session_coach`, `schedule_template`(+coach, +week guard ledger), `paquetes` marketing columns + `plan_feature`, `about_value`/`facility`/`stat`/`faq`. All curated-class RLS (member read / staff write, **no anon yet** — see decision (b) above).
- **Write seams:** 5 scheduling RPCs (`create_class_session`, `create_recurring_schedule`, `ensure_week_materialized` — idempotent via the append-only `schedule_template_week` ledger, NOT `(template_id, starts_at)` alone — `edit_class_session`, `cancel_class_session`); `actualizar_paquete_marketing`, `set_plan_features`.
- **Pinned interfaces:** `@gym/domain` scheduling rules (estado-sesión, `disponibles`, materialization spec, bounds), `@gym/format` agenda/tz formatters, `@gym/data/server/{agenda,catalog,paquetes,…}` DAL, `@gym/ui/forge/agenda/*` primitives + `fixtures.ts` (canonical hora/duración/cupo bounds).
- **Booking's key touchpoint:** occupancy today reads a **0-active projection** (`activosDeSesion()` in `packages/data/src/server/agenda.ts` returns constant 0) — Phase 6's `reservation` table repoints that ONE seam. `consumirClase` (NULL = ilimitado) stays the single consume source.

## Design mock — the client app design IS the RED mock

`C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html` — 12 screens, interactive, **open in a browser** (read-only reference; do not spec from screenshots). ⚠️ Rendered in RED paint — build brand-neutral token-driven; Forge renders the same pages by host.

## Where new code lands

`apps/client` exists (Phase-2 tracer skeleton; shares the host→inquilino→marca seam via `@gym/data`'s `resolveTenant`). Tiers unchanged (`.dependency-cruiser.cjs`): domain → format → data → ui/brand; core never imports ui/apps. Brand modules (`forge`, `red`, `base`) complete from Phase 4 — consume, don't touch `packages/brand/**`. Member auth flows (self-register, claim-by-match via `reclamar_o_crear_cliente`) shipped in Phase 3 — reuse.

## Invariants Phase 6 will trip on (full list: data-model §5)

1. Occupancy DERIVED from `count(active reservations)` — never stored; the mock mutates it directly (mock-only).
2. Booking = one atomic RPC (reserve + consume + occupancy read consistency); Ilimitado exempt via the `clases IS NULL` guard; **no-show still consumes**.
3. One login = one gym until the host-picks-membership slice ships ([[demo-gym-testing-model]]).
4. Payment is UI-only ("paga en tu gym") — no processor, no dead card fields.
5. New tenant tables: `gym_id` + RLS (auto-enable trigger on), member-class policies; anon read ONLY on the showcased/marketing tables decision (b) names.

## Execution pipeline (same as Phases 3–5)

`/to-prd` → `/to-issues` → `/to-goal`. Templates: `docs/prompts/goal-platform-phase5-agenda.md` (the best one yet — copy its orchestrator/gate structure), PRD mirror `docs/prds/prd-admin-agenda.md`. Carry the keep-it-lean clause phase-local into Gate 1; do not edit the global `to-goal/gate-prompts.md`.

## Ops facts the last session paid to learn (encode into the goal file)

- `SUPABASE_ACCESS_TOKEN` lives in `apps/admin/.env.local` (MAIN checkout — **gitignored; fresh worktrees never inherit it**). Say so in every schema slice's dispatch.
- Free tier fits exactly **one** throwaway scratch project beside live → **DDL slices serialize, one per orchestrator turn**; each agent creates + deletes its own scratch (mechanism proven, see any Phase-5 schema slice's issue comments).
- The permission classifier **hard-blocks agents** on (a) full-row PII dumps and (b) live `apply_migration` — both need the **owner interactively in-session** (dump via user-typed `!` command, apply via explicit in-transcript authorization). Plan live-DDL slices assuming an owner touchpoint, or batch the applies into one HITL step.
- Pre-DDL dump stays MANDATORY (free tier, no PITR) — pattern: `docs/runbooks/hitl-28-evidence.md`.
- `red-demo` gym is the RED sandbox: `demo@red-demo.test` (password in the #45 plan doc), host `red-demo.localhost` (admin-only — Phase 6 should add its client-app host row). Its gym-content sections are **unseeded** (tables went live after the seed) — seed rides well with the Phase-6 marketing slice.
- Weekly keepalive ping still an open follow-up; check the project is awake at session start (`list_tables`).

## Housekeeping (independent of Phase 6)

- Close **#36** (Phase-5 PRD umbrella — all children done).
- **#48** open (vender phone silent validation — small UX fix, could ride any slice or ship solo).
- **#27** (SMTP HITL, deferred) and **#35** (Phase-7, parked) stay open — leave them.
- The 10 merged `slice-*` branches (+ older phase branches) still exist on origin — delete when convenient.
