# Multi-Gym Platform — Phased Roadmap

> **Planning only — no code yet.** This roadmap *splits the path*. Each phase gets its
> own detailed task-by-task plan in `docs/superpowers/plans/YYYY-MM-DD-<phase>.md`
> (TDD, bite-sized, per `superpowers:writing-plans`) **at the time it is executed** —
> not now. Decisions were locked 2026-06-29; record them in the Phase 0 ADR before any code.
>
> **🔒 Read first — the shield:** `2026-06-29-target-data-model-and-decisions.md` (companion).
> It holds the locked identity/auth model, the target schema (derived from both RED mocks),
> and the **do-not-violate invariants**. A fresh session must read it before touching the DB.

## What we're building (one screen)

Forge is becoming a **multi-tenant gym platform**: two apps, each re-branded per gym client.

| | Job | Today | Becomes |
|---|---|---|---|
| **admin app** | operator/staff console (asistencia, clientes, vender, cuenta…) | the current repo, Forge-branded, single-operator | restructured + a new **Clases** page that curates the catalog showcased in the client app |
| **client app** | gym **members**: book classes, *(future)* buy subscriptions | does not exist | new app; the **RED** mock is its first brand design |

**Brands = gym clients:** Forge (#1), RED (#2, full rebrand), more expected. Within a gym,
admin + client **share that gym's data** (operator-curated classes → members book them).

## Decisions locked (→ Phase 0 ADR)

- **Data:** ONE shared Supabase project, isolation by **RLS**, scoped to a **gym (tenant)** — *not* a separate project per gym.
- **Deployment:** ONE multi-tenant Vercel project **per app** (2 total), each serving every gym; tenant resolved **at runtime by hostname** in `proxy.ts`. Onboard a gym = brand module + tenant row + domain. No new deploy/DB.
- **Branding:** **presentation-only** divergence — per-gym **brand modules** (tokens, logo, animation set, copy), selected at runtime.
- **Identity (two tiers):** **members self-register** (email+password, phone, terms; gym from the domain they register on); **gyms/owners are invited/provisioned manually for now** (self-serve gym onboarding is future). Operator and member are distinct roles via `gym_membership(user, gym, role)`. Members **claim** their operator-pre-created `clientes` row by email/phone match (no duplicate members). → details in the companion data-model doc.
- **Admin scope:** **full reframe** — admin gains class scheduling (Agenda), catalog mgmt (class types, coaches, plans), gym-content mgmt, and its existing sectors evolve onto the new schema. The client app is **fully operator-driven** (no hardcoded content).
- **Payments:** client `membresía/checkout` is **UI-only for v1** — no real processor wired (deferred).
- **Next 16 facts (carry into the ADR):** `middleware`→`proxy.ts` (Node-only, no Edge — see ADR-0001); `headers()`/`cookies()` are async + force dynamic render; `NEXT_PUBLIC_*` is build-time inlined (fine — one shared DB); Vercel bills usage at the team level (only build-minutes multiply per app — neutralised by Turborepo remote cache + skip-unaffected).

## Target shape

```
apps/
  admin/      # operator console — Forge today; restructured + Clases page
  client/     # member booking + (future) subscriptions — RED design is brand #2
packages/
  domain/     # pure rules: clases, vigencia, saldo, booking states   (extracted from src/domain)
  data/       # server-only Supabase DAL                              (extracted from src/lib/data)
  ui/         # design system: primitives + phone chrome + token contract
  brand/      # per-gym modules: forge/  red/  (palette, logo, animations, copy)
```

## Two tracks (after the skeleton exists)

```
Phase 0 ─ ADR
   │
Phase 1 ─ monorepo refactor (admin moved, behaviour-preserving)
   │
Phase 2 ─ TRACER: 2 multi-tenant deploys + host→brand on one page   ◄── de-risks the whole bet
   │
   ├──────────── DATA track ───────────┐     ┌──── FRONTEND track ────┐
Phase 3 ─ gym-tenant model + RLS       │     │  Phase 4 ─ brand system │   (3 ∥ 4 — independent)
   │                                   └──┬──┘                         │
   │                                      ▼                            │
Phase 5 ─ admin restructure + Clases page  (needs 3 + 4)              │
   │                                                                   │
Phase 6 ─ client app build (RED) on shared packages  (needs 3 + 4 + 5)
   │
Phase 7 ─ harden & launch (member auth, RLS denial tests, prod domains)
```

## The phases

| # | Phase | Goal (deliverable) | Depends on | Exit criteria (how we know it's done) |
|---|---|---|---|---|
| 0 | **Decide & record** | ADRs formalising the locked decisions (companion doc is the input) | — | **Accepted:** ADR-0008 platform (shared-DB gym-tenant RLS + 2 multi-tenant deploys + brand modules) · ADR-0009 member auth + member/CRM unification · ADR-0010 class-scheduling model. No code. |
| 1 | **Monorepo refactor** *(behaviour-preserving)* | Turborepo; current app → `apps/admin`; shared core extracted to `packages/{domain,data,ui}` | 0 | Forge admin builds, tests, lints, **and deploys identically** to today; `depcruise` green; a second app *can* import the shared core. Still single-tenant, single-brand. |
| 2 | **Multi-tenant tracer** *(de-risker)* | `apps/client` skeleton + `proxy.ts` host→tenant→brand on ONE trivial page; minimal `packages/brand` (forge+red); **2 Vercel projects deployed** | 1 | Forge domain renders Forge brand, RED domain renders RED brand — each from a single deployment per app, against the shared Supabase. Architecture proven end-to-end. |
| 3 | **Tenant/identity foundation** *(data track)* | `gym`, `gym_membership(user, gym, role)`, `member` (evolve `clientes` + nullable `auth_user_id`); **member self-register + claim-by-match**; RLS migrated per-`auth.uid()` → **gym-scoped + role**. *(Catalog/booking tables land in Phases 5/6 — see data-model doc §4.)* | 2 | Forge admin ops pass under gym-scoped RLS; **cross-gym denial test** (extends `rls_cross_tenant_denial.sql`) green; a member can self-register, **claim** their pre-created row, and read only their gym's data. |
| 4 | **Brand system** *(frontend track)* | Full `packages/brand/{forge,red}`: brand-keyed CSS-var token sets (generalise `globals.css`), logo components, animation modules (`forge-*` vs RED ignition), copy | 2 *(∥ 3)* | Either app renders fully in either brand by host, **no FOUC**, `prefers-reduced-motion` respected. |
| 5 | **Admin reframe + Agenda** | The admin redesign + **catalog/scheduling schema & authoring**: `class_type`, `coach`(+multi-coach join), `class_session` (absolute `starts_at`) + `schedule_template`, `plan`, gym content — the **Agenda** page | 3, 4 | Operator schedules a `class_session` (one-off or recurring) and curates plans/coaches/content; occupancy **derived**; writes gym-scoped + *"visible en la app"*. |
| 6 | **Client app build (RED)** | The 12-screen member journey on shared packages + **booking/subscription schema**: `reservation` (states), `subscription`, member stats, payment **UI-only** | 3, 4, 5 | A member can browse → **book** → see it in *mis reservas*; booking **consumes a class** (Ilimitado exempt), updates roster occupancy, and *"Pasar lista"* writes `asistencias`. *(Decomposes into vertical slices — see below.)* |
| 7 | **Harden & launch** | Member-auth security review, RLS denial tests, prod domains/SSL, per-brand QA, bundle/perf | 6 | Both gyms live in production; isolation verified at the DB layer; brand bundles within budget. |

### Phase 6 decomposes further (don't plan it as one lump)

The client app is the biggest phase; when you reach it, split it into **tracer-bullet vertical
slices** (mirrors the migration PRD's `prereqs → … → cuenta` ordering):
`marketing (comercial/nosotros/precios/contacto)` → `auth (entrar/registro)` →
`booking (reservar/clase/confirmada/reservas)` → `membresía (status/checkout — payments deferred)` → `perfil`.
Each slice = its own plan, each shippable on its own.

## What changed from the first-draft 6-step path — and why

| First draft | Refined | Why |
|---|---|---|
| Deploy + host→tenant **last** (step 6) | **Tracer** pulled forward to Phase 2 | It's the riskiest, least-proven piece. Prove the multi-tenant deploy on a thin slice *before* heavy investment, not after. |
| Build = "client app **and** admin Clases page" (step 5) | Split into Phase 5 (admin Clases) + Phase 6 (client app) | Two different apps, two deliverables; a reviewer could accept one and reject the other. Phase 6 alone is multi-slice. |
| DB (2) then monorepo (3), strictly serial | Phases **3 ∥ 4** as parallel tracks after the skeleton | Data model and brand system are independent; serialising them wastes calendar time. |
| Monorepo move bundled with feature work | Phase 1 is **behaviour-preserving only** | Moving a live, deployed app is risky enough alone — don't change structure and behaviour in the same step. Verify it deploys identically first. |
| *(none)* | **Phase 7 — harden & launch** added | The client app introduces **member login** — a new attack surface. Member auth + cross-gym RLS denial must be gated explicitly, not assumed. |

## Decisions — now resolved (no blanks left)

- ✅ **Member auth model** *(was blocking Phase 3)* — **RESOLVED:** members self-register; gyms/owners invited-for-now; claim-by-match to pre-created `clientes`. Full spec in companion doc §1–§2.
- ✅ **Admin restructure scope** *(was shaping Phase 5)* — **RESOLVED:** full reframe (Agenda + catalog + content + sector evolution). Companion doc §4.

**Still parked — but with a stated default** (see companion doc §6, safe to proceed):
- **Payments / subscriptions** — UI-only for v1; no processor. Revisit post-launch.
- **Canonical tenant name** — store `brand_name` (RED) *and* contact handles (Forge) on `gym`; confirm legal name per gym at Phase 3.
- **Room/location** — single room per gym (`class_session.room_id` nullable); revisit if a gym gets multiple venues.
- **Brand scaling** — all brands bundle into each deployment; `dynamic()`-import per brand if brands multiply (revisit at Phase 7).
- **Self-serve gym onboarding** — out of scope now; future.

## Guardrails for a fresh session (do-not-violate — full list in companion doc §5)

1. **Occupancy/spots is DERIVED** (`capacity − count(active reservations)`), never stored.
2. Every tenant table is **`gym_id`-scoped with RLS**; isolation is **RLS-by-membership**, never the `proxy.ts` header.
3. `class_session` uses **absolute `starts_at`**; recurrence lives in `schedule_template`.
4. **Multi-coach → join table.** Never a single coach column.
5. **Booking/attendance consumes a class** from the member's plan; **`Ilimitado` exempt**; **no-show on 8-class still consumes**.
6. **Operator ≠ member** — distinct roles, distinct profile tables, one `gym_membership` map.
7. Keep ADR-0001: `proxy.ts` (not `middleware.ts`, Node-only), `server-only` DAL, `getClaims()`/`getUser()` (never `getSession()`).

## Sequencing principle (foundation-first, then vertical slices)

**Not "DB-first" nor "app-first"** — both are anti-patterns here (a speculative big-bang schema on a *live* DB; or UI built against a vacuum). The rule:

- **Structure first.** The monorepo move (Phase 1) is *behaviour-preserving* and comes **before any DB change**, so all DAL/migration work happens once, in its final `packages/data` home.
- **One foundational DB-before-app step.** The tenant/identity spine + RLS migration (Phase 3) precedes every feature; its validator is *"Forge admin still green + cross-gym denial test passes"*, **not** a new app.
- **Feature schema rides with its feature** (Phases 5/6). Each vertical slice = `migration → RLS test → DAL/DTO → server action → screen`, shipped end-to-end. **Schema leads the screen by a hair** — never build UI against a shape that doesn't exist yet.
- **Expand/contract migrations.** Add nullable → backfill → enforce; add policies → cut over → drop. The live Forge app stays green at **every commit** — no destructive big-bang.
- **TDD per slice, RLS-test-first.** The cross-tenant denial test is written *before* the policy it guards.

## Riskiest assumptions (the tracer in Phase 2 exists to falsify these early)

1. `proxy.ts` (Node runtime, Next 16) can resolve tenant by `host` and drive brand selection from one deployment.
2. One shared Supabase + RLS cleanly serves **both** operator and member roles within a gym.
3. Per-gym brand (incl. RED's bespoke animation code) swaps at runtime with no FOUC and acceptable bundle cost.

If any of these fails, we learn it in Phase 2 — cheaply — not in Phase 6.

## How each phase becomes a real plan

When you start a phase, run `superpowers:writing-plans` on **that phase only** to produce a
TDD, bite-sized task plan in `docs/superpowers/plans/`, using the **companion data-model doc as
the spec**. Phases 1, 3, 5, 6 touch the data seam and the enforced sector boundary
(`.dependency-cruiser.cjs`) — keep ADR-0001's rules (`server-only` DAL, RLS-as-boundary,
no `getSession()`) and the §5 guardrails intact in those plans.

## For a brand-new session (start here)

1. Read this roadmap + `2026-06-29-target-data-model-and-decisions.md` (the shield).
2. Confirm the current phase from the phase table; do **only** that phase.
3. Run `superpowers:writing-plans` for that phase → a plan in `docs/superpowers/plans/`.
4. Honour the §5 guardrails and the companion doc's 🔒 invariants. If a decision seems
   missing, it's either in the companion doc or a 🅿️ default there — do not invent a new one.

---

**Status:** Draft — 2026-06-29. Decisions resolved (member auth · admin scope) and shielded in
the companion data-model doc. Supersedes the informal 6-step sketch. Next: Phase 0 ADRs.
