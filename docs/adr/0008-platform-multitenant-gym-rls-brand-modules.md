# ADR-0008 — Multi-gym platform: shared Supabase + gym-scoped RLS, two multi-tenant deploys, per-gym brand modules

**Status:** Accepted · **Date:** 2026-06-29 · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (RLS-as-boundary, no ORM, `proxy.ts`, `server-only` DAL, `getClaims()`/`getUser()`) · **Parent of:** [ADR-0009](0009-identity-two-tier-auth-member-claim.md) (member auth + member/CRM claim-by-match rides on this tenancy) and [ADR-0010](0010-class-scheduling-absolute-starts-derived-occupancy.md) (the catalog/scheduling tables are gym-scoped under this RLS) · **Realizes:** the locked platform decisions in [`docs/planning/2026-06-29-multi-gym-platform-roadmap.md`](../planning/2026-06-29-multi-gym-platform-roadmap.md) ("Decisions locked") and [`docs/planning/2026-06-29-target-data-model-and-decisions.md`](../planning/2026-06-29-target-data-model-and-decisions.md) §3, §5

## Context

Forge is a single gym's private admin app: one operator, one brand, one Supabase project, one Vercel deployment ([ADR-0001](0001-supabase-rls-no-orm.md)). It is becoming a **multi-tenant gym platform** — two apps (an operator **admin** console and a member-facing **client** booking app), each re-branded per gym client. The brands are gym clients: **Forge** (#1) and **RED** (#2, a full rebrand whose mock is the client app's first design), with more expected. Within a gym, admin and client **share that gym's data** — operators curate `clases`/`plan`(today's `paquetes`)/coaches; members book them.

That forces three structural questions, and the answers are the load-bearing decision of the platform:

1. **Where does tenant data live?** One Supabase project shared by every gym, or one project per gym?
2. **How many deploys?** One Vercel project per gym, or one multi-tenant deployment per app serving every gym?
3. **What separates one gym's data from another's** — and what must *never* be trusted to do that separation?

The naïve SaaS instinct (a DB per tenant, a deploy per tenant) multiplies operational surface with every gym onboarded and contradicts the data-model's premise that admin and client read the **same** gym rows. This ADR records the locked alternative, and pins the single invariant that makes a *shared* database safe.

This is Phase 0: this ADR formalizes already-locked decisions. It introduces **no code, no migration, and no package move** as action — it states the target schema and mechanism as the **decision**. Identity (member self-register, claim-by-match) is [ADR-0009](0009-identity-two-tier-auth-member-claim.md); the catalog/scheduling schema is [ADR-0010](0010-class-scheduling-absolute-starts-derived-occupancy.md). This ADR is strictly the tenancy/deploy/brand spine they both stand on.

## Decision

**One shared Supabase project; one multi-tenant Vercel deployment per app; tenant isolation enforced by RLS keyed to gym membership — never by the proxy host.** Concretely:

- **DATA — one shared Supabase project, RLS-scoped to a `gym` row.** There is **not** a Supabase project per gym. Every tenant table carries a `gym_id` FK to a single **`gym`** (tenant) table and is RLS-enabled (the `gym` row absorbs the brand/location/contact that today lives in `perfil` — see [ADR-0010](0010-class-scheduling-absolute-starts-derived-occupancy.md) and data-model §4). The membership map **`gym_membership (user_id → auth.users, gym_id → gym, role)`** with `role ∈ {owner, operator, member}` is the one place identity → tenant + role is resolved; RLS predicates read "which gym + what role" from it (data-model §1, §3). New `public` tables auto-acquire RLS via the existing `rls_auto_enable` event trigger (invariant §5.2) — that trigger stays on.

- **DEPLOY — two multi-tenant Vercel projects, one per app, each serving every gym.** `apps/admin` and `apps/client` are **two** Vercel deployments total — not two-per-gym. Each serves **all** gyms. The tenant is resolved **at runtime, by hostname**, in **`proxy.ts`** (Next 16's Node-only successor to `middleware.ts`; never reintroduce `middleware.ts` — [ADR-0001](0001-supabase-rls-no-orm.md), invariant §5.8): the request host maps to a `gym` row, which selects the brand module. **Onboarding a gym = a brand module + a `gym` row + a domain.** No new deployment, no new database.

- **BRANDING — presentation-only divergence via per-gym brand modules.** Per-gym **brand modules** (design tokens, logo, animation set, copy) are selected at runtime from the resolved host. Branding is **presentation-only** — it never changes data shape, rules, or authorization. Brands are gym clients (Forge #1, RED #2, more). All brands bundle into each deployment for now; switch to `dynamic()`-import per brand if brands multiply (roadmap "Still parked" — Brand scaling, revisit at Phase 7).

- **STRUCTURE — Turborepo monorepo.** Target shape (stated as the destination, not work to do now): `apps/{admin, client}` + `packages/{domain, data, ui, brand}` — `domain` extracted from today's `src/domain` (pure rules), `data` from `src/lib/data` (the `server-only` Supabase DAL), `ui` the shared design system + token contract, `brand` the new per-gym modules. The enforced sector arrow of [ADR-0001](0001-supabase-rls-no-orm.md) / `ARCHITECTURE.md` survives the move: `data → domain`, `domain` imports nothing inward, and `brand` is presentation-only (it may not import `data`/`domain` rules).

### The hinge — RLS-by-membership, never the proxy header

**The `proxy.ts` host resolves brand and UX only. It is NEVER the authorization boundary.** This is the load-bearing invariant of the architecture (data-model §3, §5.6; roadmap guardrail 2), and a future reader must treat it as inviolable:

- A request's tenant **header/host is attacker-influenced UX metadata.** It decides which logo and palette render. It decides **nothing** about which rows a session may read or write.
- **Isolation is enforced in Postgres, by RLS policies keyed to `gym_membership` + `role`**, resolved from `(select auth.uid())` ([ADR-0001](0001-supabase-rls-no-orm.md)) — not from any value the app server passes in. An operator authenticated to Forge sees Forge rows because their `gym_membership` says so; spoofing the RED host changes the brand they see, **not** the rows the database returns.
- This is what makes a **single shared database** safe across tenants. The shared DB is not a compromise to be compensated for in app code — the RLS-by-membership boundary *is* the isolation, and it holds even if `proxy.ts` is wrong or bypassed. Three gym-scoped RLS classes apply (data-model §3): **curated/showcased** (operator of the gym writes; members of the gym — plus anon for marketing — read), **member-owned/transactional** (the member writes own rows via `auth_user_id = (select auth.uid())`; the gym's operator may also write, e.g. walk-ins/asistencia), and **public intake** (`contact_message` — anon writes the public form, the gym's operator reads). The validator for this boundary is a **cross-gym denial test** (extends `rls_cross_tenant_denial.sql`), written before the policy it guards (roadmap sequencing principle).

## Consequences

- **Onboarding a gym is a config act, not an infra act.** A brand module + a `gym` row + a domain — no new Supabase project, no new Vercel deployment to provision, secure, and keep in sync. The operational surface stays flat as gyms multiply; the cost is that one shared DB and two deployments are a shared blast radius, which is exactly why the RLS-by-membership boundary is non-negotiable.

- **`proxy.ts` is Node-only (no Edge).** Next 16 runs `proxy.ts` on the Node runtime; host→tenant→brand resolution and any Supabase/auth touch happen there without Edge constraints (carries [ADR-0001](0001-supabase-rls-no-orm.md)). The riskiest assumption — that `proxy.ts` can resolve tenant by host and drive brand from one deployment — is falsified early by the Phase 2 tracer, not discovered in Phase 6.

- **`headers()` / `cookies()` are async and force a dynamic render.** Reading the host (and auth cookies) to resolve the tenant opts the request into dynamic rendering. Tenant-resolved pages are dynamic by construction — acceptable, because per-gym, per-member data is request-specific anyway; do not expect these routes to be statically prerendered across tenants.

- **`NEXT_PUBLIC_*` is build-time inlined — and that is fine here.** Because there is **one shared Supabase project**, the public Supabase URL/anon-key are the same for every tenant; inlining them at build time is correct, not a leak of per-tenant config. Per-gym values are **not** environment variables — they are `gym` rows and brand modules resolved at runtime. Never push a tenant secret into a `NEXT_PUBLIC_*` var.

- **Vercel bills usage at the team level; only build-minutes multiply per app.** Two deployments do not double request/bandwidth/function cost (billed at the team level against shared usage). The one quantity that scales with app count is build-minutes — **neutralized by Turborepo remote cache + skip-unaffected builds**, so an unaffected app rebuilds from cache.

- **The sector boundary holds across the monorepo.** The extraction to `packages/{domain,data,ui,brand}` is behaviour-preserving (roadmap Phase 1): the `data → domain`, `domain → nothing` arrow and the `server-only` DAL move intact into their final package homes, so all later DAL/migration work happens once. `brand` is presentation-only and may not reach into `data`/`domain` rules — enforced by extending `.dependency-cruiser.cjs` so `brand` cannot import `data`/`domain`, carrying forward today's `src/domain` + `src/lib` ✗→ `src/components` + `src/app` boundary into the package layout.

- **What a future reader must not undo:**
  - Do **not** split tenants into a Supabase-project-per-gym or a deploy-per-gym; that re-multiplies the surface this decision flattened and breaks the shared-data premise (admin and client read the *same* gym rows).
  - Do **not** ever let the `proxy.ts` host/header decide authorization. It is brand/UX only. The moment a policy trusts it, the shared-DB isolation guarantee is gone. RLS-by-membership is the boundary (data-model §5.6).
  - Do **not** create a tenant table without `gym_id` + RLS, and do not disable the `rls_auto_enable` trigger (invariant §5.2).
  - Do **not** merge operator and member into one role/table; they are distinct roles in `gym_membership` with distinct profile tables (invariant §5.7) — the detail is [ADR-0009](0009-identity-two-tier-auth-member-claim.md).
  - Do **not** let a brand module become anything but presentation. Divergence is tokens/logo/animation/copy; rules and schema are shared.
