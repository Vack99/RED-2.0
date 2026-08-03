# ADR-0008 — Multi-gym platform: shared Supabase + gym-scoped RLS, two multi-tenant deploys, per-gym brand modules

**Status:** Accepted · **Date:** 2026-06-29 · **Amended:** 2026-08-02 (the hinge stands; "presentation-only" is replaced by "may only NARROW, never widen" — see [Amendment](#amendment--2026-08-02-the-tenant-may-only-narrow-never-widen) below) · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (RLS-as-boundary, no ORM, `proxy.ts`, `server-only` DAL, `getClaims()`/`getUser()`) · **Parent of:** [ADR-0009](0009-identity-two-tier-auth-member-claim.md) (member auth + member/CRM claim-by-match rides on this tenancy) and [ADR-0010](0010-class-scheduling-absolute-starts-derived-occupancy.md) (the catalog/scheduling tables are gym-scoped under this RLS) · **Realizes:** the locked platform decisions in [`docs/planning/2026-06-29-multi-gym-platform-roadmap.md`](../planning/2026-06-29-multi-gym-platform-roadmap.md) ("Decisions locked") and [`docs/planning/2026-06-29-target-data-model-and-decisions.md`](../planning/2026-06-29-target-data-model-and-decisions.md) §3, §5

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

- A request's tenant **header/host may not WIDEN authorization.** It cannot add a row to what a session may read, because no RLS policy reads it. *(Amended 2026-08-02 — this bullet used to read "it decides **nothing** about which rows a session may read or write." That was stronger than the true claim, and the extra strength was load-bearing in the wrong direction: it says a host needs no checking, which is exactly the check `apps/admin` never performed. It is also false on the write side — see the amendment.)*
- **Isolation is enforced in Postgres, by RLS policies keyed to `gym_membership` + `role`**, resolved from `(select auth.uid())` ([ADR-0001](0001-supabase-rls-no-orm.md)) — not from any value the app server passes in. An operator authenticated to Forge sees Forge rows because their `gym_membership` says so; spoofing the RED host changes the brand they see, **not** the rows the database returns.
- This is what makes a **single shared database** safe across tenants. The shared DB is not a compromise to be compensated for in app code — the RLS-by-membership boundary *is* the isolation for READS, and it holds even if `proxy.ts` is wrong or bypassed. *(Amended 2026-08-02: "and it holds even if `proxy.ts` is wrong or bypassed" is true of reads and **false of writes**. `reclamar_o_crear_cliente` takes the host-resolved gym and INSERTS a `gym_membership` row into it, so a wrong host mints a membership rather than merely mispainting one. RLS is still the read boundary; it was never a write-side host check, and nothing else was either.)* Three gym-scoped RLS classes apply (data-model §3): **curated/showcased** (operator of the gym writes; members of the gym — plus anon for marketing — read), **member-owned/transactional** (the member writes own rows via `auth_user_id = (select auth.uid())`; the gym's operator may also write, e.g. walk-ins/asistencia), and **public intake** (`contact_message` — anon writes the public form, the gym's operator reads). The validator for this boundary is a **cross-gym denial test** (extends `rls_cross_tenant_denial.sql`), written before the policy it guards (roadmap sequencing principle).

## Consequences

- **Onboarding a gym is a config act, not an infra act.** A brand module + a `gym` row + a domain — no new Supabase project, no new Vercel deployment to provision, secure, and keep in sync. The operational surface stays flat as gyms multiply; the cost is that one shared DB and two deployments are a shared blast radius, which is exactly why the RLS-by-membership boundary is non-negotiable.

- **`proxy.ts` is Node-only (no Edge).** Next 16 runs `proxy.ts` on the Node runtime; host→tenant→brand resolution and any Supabase/auth touch happen there without Edge constraints (carries [ADR-0001](0001-supabase-rls-no-orm.md)). The riskiest assumption — that `proxy.ts` can resolve tenant by host and drive brand from one deployment — is falsified early by the Phase 2 tracer, not discovered in Phase 6.

- **`headers()` / `cookies()` are async and force a dynamic render.** Reading the host (and auth cookies) to resolve the tenant opts the request into dynamic rendering. Tenant-resolved pages are dynamic by construction — acceptable, because per-gym, per-member data is request-specific anyway; do not expect these routes to be statically prerendered across tenants.

- **`NEXT_PUBLIC_*` is build-time inlined — and that is fine here.** Because there is **one shared Supabase project**, the public Supabase URL/anon-key are the same for every tenant; inlining them at build time is correct, not a leak of per-tenant config. Per-gym values are **not** environment variables — they are `gym` rows and brand modules resolved at runtime. Never push a tenant secret into a `NEXT_PUBLIC_*` var.

  *Amended 2026-08-02 — this bullet answers the wrong question and stops the right one.* "Is inlining the key a leak?" is settled: no. The question it displaces is **"what can the shared `anon` role read once the key is public?"** — and until 2026-08-02 nobody asked it. The publishable key is in every browser bundle by design, so the `anon` role's reach IS the platform's public surface: 15 catalog tables were `using (true)` across all gyms (#215), `gym_domain` returned the complete customer census in one call (#216), and `authenticated` held a column grant on `gym.legal_name`/`owner_user_id` (#213). **The key being public is fine. What it reaches is the decision, and it is a separate one.** #214 makes that surface a machine-checked allow-file so it can never drift silently again.

- **Vercel bills usage at the team level; only build-minutes multiply per app.** Two deployments do not double request/bandwidth/function cost (billed at the team level against shared usage). The one quantity that scales with app count is build-minutes — **neutralized by Turborepo remote cache + skip-unaffected builds**, so an unaffected app rebuilds from cache.

- **The sector boundary holds across the monorepo.** The extraction to `packages/{domain,data,ui,brand}` is behaviour-preserving (roadmap Phase 1): the `data → domain`, `domain → nothing` arrow and the `server-only` DAL move intact into their final package homes, so all later DAL/migration work happens once. `brand` is presentation-only and may not reach into `data`/`domain` rules — enforced by extending `.dependency-cruiser.cjs` so `brand` cannot import `data`/`domain`, carrying forward today's `src/domain` + `src/lib` ✗→ `src/components` + `src/app` boundary into the package layout.

- **What a future reader must not undo:**
  - Do **not** split tenants into a Supabase-project-per-gym or a deploy-per-gym; that re-multiplies the surface this decision flattened and breaks the shared-data premise (admin and client read the *same* gym rows).
  - Do **not** ever let the `proxy.ts` host/header **widen** authorization. The moment a policy trusts it, the shared-DB isolation guarantee is gone. RLS-by-membership is the boundary (data-model §5.6). *(Amended 2026-08-02 — this bullet used to read "It is brand/UX only", which also forbids NARROWING and is therefore stronger than the decision it protects. Narrowing to a tenant the caller already holds is not just permitted, it is required. See the amendment.)*
  - Do **not** create a tenant table without `gym_id` + RLS, and do not disable the `rls_auto_enable` trigger (invariant §5.2).
  - Do **not** merge operator and member into one role/table; they are distinct roles in `gym_membership` with distinct profile tables (invariant §5.7) — the detail is [ADR-0009](0009-identity-two-tier-auth-member-claim.md).
  - Do **not** let a brand module become anything but presentation. Divergence is tokens/logo/animation/copy; rules and schema are shared.

## Amendment — 2026-08-02 (the tenant may only NARROW, never widen)

**The hinge is not overturned.** On the question this ADR poses — *may the host widen
authorization?* — it is right, the read path matches it, and eight red-team exploit
chains built during the 2026-08-02 cross-examination all died at the read boundary. The
sentence at the top of §"The hinge" that predicts the reported symptom (*spoofing the
RED host changes the brand they see, **not** the rows the database returns*) is **kept
verbatim**: it names an outcome only this system produced, and the measurement confirmed
it. What is amended is the *wording* around it, which claimed more than the decision.

### What was wrong

The ADR wrote **"the tenant is presentation-only"** where the true statement is **"the
tenant may not WIDEN authorization."** The stronger sentence also forbids *narrowing* —
and that prohibition was:

1. **Already violated twice, deliberately, for correctness.** `apps/client/src/app/reservar/page.tsx`
   passes `x-gym` into a resolver so a multi-gym member reads *this* gym, with a comment
   that has to pre-empt the objection. `CONTEXT.md` concedes the same exception in
   writing (*el único uso autoritativo-del-lado-servidor del host…*).
2. **Already violated outright.** `apps/client/src/app/auth/confirm/route.ts` feeds the
   host-resolved gym into `reclamar_o_crear_cliente`, which **inserts a `gym_membership`
   row**. The host does not merely present a tenant — it mints membership in one.
   "Presentation-only" is literally false today.
3. **The direct cause of four gym-pickers with three rules**, one of them
   non-deterministic: `getOperatorGym` (`order by gym_id`), `staff_gym()` (`order by
   gym_id`), `resolverMiembroGym` (host-reconciled, oldest-membership fallback), and
   `mi_membresia`/`toggle_favorito_tipo` (bare `limit 1`, **no `order by`** — #219).

A rule the code has to break three times to stay correct is not protecting anything. It
was also read as *"a host needs no checking"*, which is precisely the check `apps/admin`
never performed — the defect this amendment's siblings fix (#203).

### The amendment

> **The tenant-in-effect is a server-derived request property that may only NARROW to a
> tenant the caller already holds a `gym_membership` row for, never widen; it is derived
> from the host reconciled against membership; and when the host names no membership of
> the caller, the app resolves it explicitly rather than guessing.**

Three clauses, each load-bearing:

- **"may only narrow … never widen"** — the hinge, restated at its true strength. RLS
  stays the boundary; narrowing picks *among* rows the caller already holds and can
  never add one.
- **"server-derived"** — from the host via `gym_domain`, never from a request param,
  header, or cookie the caller controls. `tenantHeaders` deletes an inbound
  `x-gym`/`x-brand` when no tenant resolves, so the header is proxy-derived on every
  path.
- **"resolves it explicitly rather than guessing"** — the clause that retires the
  `limit 1` pickers. Absent (no `gym_domain` row: previews, the bare `.vercel.app`,
  `pnpm dev`) is a real state and must still render; *mismatched* is not, and gets a
  defined answer (#212's redirect) instead of an accidental one.

**No policy changes.** Compatible with all 96 existing RLS policies — it describes what
the request layer may do with the host, not what Postgres enforces. It deletes three of
the four ad-hoc gym-pickers, and generalises the exception `CONTEXT.md` already conceded.

### Standing

This is the check Azure's Architecture Center calls out by name as *"user and tenant
conflation"*: **"if your application uses a custom domain name to map requests to the
tenant, then your application must still check that each request received by the
application is authorized for that tenant."** RED-2.0 already sits inside Azure's second
sanctioned pattern (*application-based authorization*: tokens carry no tenant; a separate
list verifies) — it simply never performed the verify step. 9 of 9 shipped products
checked (Slack, Atlassian, GitHub EMU, Zendesk, Salesforce, Shopify, Notion, Stripe,
Vercel) reconcile host/workspace against membership; none silently serves.

**Evidence:** `docs/Context/2026-08-02-cross-tenant-login-cross-examination.md` (the
audit) and `docs/Context/2026-08-02-cross-tenant-login-route.md` (the route). Epic #203.
