# Phase 5 Kickoff Brief — Admin reframe + Agenda

> Written 2026-07-05 for the next session (planning, on **fable**). Paths point to sources; this doc does not copy them.
> **Job of the next session:** produce the Phase 5 **plan** (PRD → issues → goal file), not code.

## Read first — the shields (in this order)

Skipping these is exactly how the prep session drifted (chased #35/#29 before finding the roadmap).

1. `docs/planning/2026-06-29-multi-gym-platform-roadmap.md` — the phase map (0–7). Phase 5 row + exit criteria.
2. `docs/planning/2026-06-29-target-data-model-and-decisions.md` — **the spec**. Target schema (§4), locked decisions, do-not-violate invariants (§5), parked defaults w/ stated values (§6).
3. `docs/adr/0010-class-scheduling-absolute-starts-derived-occupancy.md` — the Phase-5 design ADR (Accepted). Also `0008` (platform RLS + brand), `0009` (two-tier auth + member claim) for the surrounding model.

**Rule:** if a decision seems missing, it is in the companion doc (§4/§6) or a stated parked default — **do not invent a new one.**

## You are here

| 0–4 | ADRs · monorepo · tracer · **Phase 3 RLS (✅ #28 closed 2026-07-05)** · **Phase 4 brand (✅ merged)** |
|---|---|
| **5** | **Admin reframe + Agenda ← NEXT.** Depends on 3 + 4 (both done) → **unblocked, unstarted.** |
| 6 | Client app build (RED 12 screens) — needs 5 |
| 7 | Harden & launch — **go-live lives here** |

**Do not touch #35** (Phase-4 RED-admin go-live) — it is a Phase-7 concern, correctly parked until 5+6 build the actual RED product. Pointing a RED host at today's app would ship an app with no RED product in it.

## Phase 5 scope — admin/operator side only

**In:** the curated-catalog schema + operator authoring + the **Agenda** page.
- Schema (spec in data-model §4): `class_type` (+ workblock/bring-item), `coach` (+ multi-coach join), `class_session` (absolute `starts_at`), `schedule_template`, `plan` (evolve `paquetes`) + `plan_feature`, gym content (`about_value`/`facility`/`stat`/`faq`), `room`.
- Authoring UI: the **Agenda** week-view + catalog/coach/plan/content management; evolve existing admin sectors onto the new schema.
- **Exit** (roadmap): operator schedules a one-off or recurring `class_session`, curates plans/coaches/content; occupancy **derived**; all writes gym-scoped RLS.

**Out (→ Phase 6):** booking, `reservation`/`subscription`, the 12 client screens, member-facing anything.

**Design mocks** (read-only, outside repo — Desktop):
- Admin Agenda: `…\RED-1.0-Design\RED-AdminApp-Class-Page\Agenda Week View.html` — see next section.
- Client app (Phase-6 reference only): `…\RED-1.0-Design\index.html` (12 screens)
- Full path root: `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design`

## Approved Agenda design — the target UI (crucial)

The Agenda page design is **approved** — build to it, don't redesign.
- **Source of truth = the interactive HTML. OPEN IT IN A BROWSER** (self-contained, double-click to run):
  `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\RED-AdminApp-Class-Page\Agenda Week View.html`
  Only the HTML carries the **SEMANA (week) view**, the **`+` create-session flow**, and every interaction/state transition. Do not spec from a screenshot.
- `docs/Context/agenda-week-view-approved-mock.png` is a **static snapshot of the DÍA view only** — a thumbnail, not the design. Ignore it for anything beyond the day list.

**⚠️ The mock is rendered in Forge yellow/gold accents.** That is brand paint, not a spec — **build the page brand-neutral and token-driven** (accent = `var(--yellow)` etc. from the resolved brand module, per Phase 4). Never hardcode Forge's palette; RED renders the same page red by host.

Design facts the build must honor (all already in the target schema, data-model §4 — the mock confirms them, doesn't add):
- **DÍA / SEMANA** toggle — a day list **and** a week view; `+` (top-right) creates a session.
- Date strip Lun–Sáb + `HOY` — **no Domingo** (matches `gym_hours` Domingo-closed).
- Day header = derived summary (*"6 clases · 109 reservas"*).
- Each row: `starts_at` time · `duration_min` · `class_type` · coach(s) · **occupancy `18/20`**. Occupancy + states (`TERMINÓ`, `CASI LLENO`, `A CONTINUACIÓN`) are **DERIVED** (invariant #1) — never stored.
- **Multi-coach** shown (*"Marisa, Paty"*) → join table (invariant #3). **Special sessions** (*"★ NOCHE DE FUERZA"*) → `is_special`/`special_name`.
- **Nav restructure:** the mock's tab bar is `INICIO · CLIENTES · ASIST · AGENDA · CUENTA` — **AGENDA takes the slot `+ VENTA` occupies today.** Where `vender` goes is a Phase-5 restructure decision to settle in planning (don't silently drop it).

## Starting point — where new code lands (verified 2026-07-05)

Tiers (`.dependency-cruiser.cjs`, all `error`): `domain` → `format` → `data (server-only)` → `ui` / `brand`. Core (`domain|format|data`) must never import `ui`/`apps`; `ui` never imports `data`.

- **Rules + types** → `packages/domain/src/{rules,types,ids}.ts`. Follow the vigencia/saldo/urgencia pattern; mint `coach`/`class_session` branded ids in `ids.ts`.
- **DAL** → one `packages/data/src/server/<noun>.ts` per new table (+ `package.json` export). Readers `cache()`-wrapped, injectable trailing `client?`; mutations = Zod schema + atomic RPC. **No manual `gym_id` filter** — isolation is RLS-by-membership (`auth.uid()→gym_membership→gym`, ADR-0013); resolve `tz` via `getOperatorGym()`. Regenerate `packages/data/src/database.types.ts` after each migration.
- **Week/time formatting** → `packages/format` (tz-parameterized; never reads a gym row).
- **Agenda week-view + scheduling primitives** → `packages/ui/src/forge/` (**net-new — no calendar/grid/week-view primitive exists**). Reusable: `Segmented` (day switch), `Sheet` (session editor), `clases-picker` (scroll-snap time column), `Card`, `Icon` `cal`/`clock`.
- **`brand` untouched** — scheduling carries no brand seam.

**Admin app today** (`apps/admin/src/app`): 5 sectors in `(app)/layout.tsx` `TABS` → `inicio · clientes · asistencia · vender · cuenta`. Pages are async server components calling `@gym/data/server/*`; writes via `"use server"` `actions.ts` seams. Today's "clases" = a per-package integer grant edited in `cuenta/_components/paquetes-*` (ADR-0007) — **not** scheduled sessions. **No agenda/calendar/scheduling code exists anywhere** — clean greenfield.

## Load-bearing invariants (full list: data-model §5) — the ones Phase 5 will trip on

1. **Occupancy is DERIVED** (`capacity − count(active reservations)`), never stored. Mocks mutate it directly — mock-only.
2. **`class_session` = absolute `starts_at timestamptz`**; recurrence lives in `schedule_template`. Never weekday+string.
3. **Multi-coach → join table** (`class_session_coach`). Never a single coach column.
4. Every new tenant table is **`gym_id` + RLS** (the `rls_auto_enable` trigger handles enablement — don't disable it). RLS is the boundary, not the proxy header.
5. Package consumption is Phase 6, but model plans now so booking can decrement: `Ilimitado` exempt; no-show still consumes.

## Execution pipeline (same as Phases 3 & 4)

1. Plan Phase 5 only, using data-model doc as spec: **`/to-prd` → `/to-issues` → `/to-goal`** (tracer-bullet vertical slices, schema-leads-screen-by-a-hair, expand/contract, RLS-test-first TDD).
2. Templates to mirror: `docs/prompts/goal-platform-phase3-rls.md`, `docs/prompts/goal-platform-phase4-brand.md`; PRD mirrors in `docs/prds/prd-tenant-rls.md`, `prd-brand-system.md`.
3. Carry the **keep-it-lean** clause phase-local into each slice's Gate-1 (Elegance) — do not edit the global `to-goal/gate-prompts.md`.

## Live-DB ops gotchas (schema-heavy phase — matters more here)

- **Free tier = no backups/PITR** → a **manual pre-migration dump is mandatory** before any DDL (last dump `C:\Users\Aaron\Documents\RED-2.0-backups\`). Evidence pattern: `docs/runbooks/hitl-28-evidence.md`.
- **Supabase branching is Pro-gated (402).** RLS denial suite runs on a throwaway free project via the runner's `SUPABASE_TARGET_REF` override + branch-refusing `apply-sql.mjs`.
- **Free tier pauses after 7 idle days** → weekly keepalive ping still an open follow-up; check the project is awake at session start (`list_tables`).
- Live tables today: `perfil, clientes, paquetes, ventas, asistencias, plantillas, cobro, gym, gym_domain, gym_membership, gym_folio_counter` — all RLS-on. Gyms: `forge` (live) + `forge-demo` (sandbox). Phase-5 testing will want a **`red-demo` gym twin** per the per-brand demo model ([[demo-gym-testing-model]]).

## Housekeeping (independent of Phase 5)

- Close stale done-but-open PRD umbrellas: **#10** (Phase 2), **#17** (Phase 3), **#29** (Phase 4).
- Comment **#35**: parked until Phase 5+6 land (so it isn't re-litigated).
