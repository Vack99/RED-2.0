# Forge → Monorepo + Member Platform — Architecture & Tenancy Foundation

**Date:** 2026-06-29
**Status:** Design approved (direction + the architecture forks); ready for ADRs + implementation planning.
**Scope of THIS spec:** the overall decomposition/sequencing as the roadmap, and a senior-grade, cleared design for the **tenancy + membership foundation**. Scheduling, booking, the client-app UI, and payments are deferred to their own spec cycles (a frontend mock for classes/booking — the "RED" design — already exists).
**Relates to / extends:** `docs/planning/2026-06-29-multi-gym-platform-roadmap.md` (the canonical *phasing* doc — this spec is its **Phase 3** design + closes its parked "member auth model" decision), `docs/superpowers/specs/2026-05-27-forge-gym-admin-architecture.md` (original brief — placed member apps, booking, scheduling, payments *out of scope*; this brings them in), `docs/adr/0001-supabase-rls-no-orm.md`, `docs/adr/0004-saldo-stored-running-balance.md`.

---

## 1. Why this document exists

Forge today is a **single-operator** gym admin app: one Supabase auth user *is* the tenant, every domain row scoped by `user_id = auth.uid()` via RLS, members are plain data rows (`clientes`) with no login, and there is no concept of scheduled classes or bookings. The platform vision (see the roadmap) turns this into a **white-label multi-gym product**: a Turborepo monorepo hosting the existing admin app **plus a new member-facing client app**, each re-branded per gym client (Forge #1, RED #2, …), served from one multi-tenant deployment per app with the tenant resolved by hostname.

The load-bearing problem is **tenancy**. "The DB is already prepared for multi-tenancy" is only half-true: it is prepared for **operator isolation** (one auth user per gym), **not** for **members or staff who belong to a gym but aren't the lone operator**. `auth.uid() = user_id` structurally cannot express "members/staff of my gym," so this requires a deliberate tenancy model and an RLS rewrite. That foundation is the subject of this spec; everything member-facing depends on it.

## 2. Scope & sequencing

The canonical phasing lives in `docs/planning/2026-06-29-multi-gym-platform-roadmap.md` (Phases 0–7, tracer-first). This spec is the design for its **Phase 3 (gym-tenant DB model + RLS + member auth)** and supplies the content for the identity/RLS/onboarding ADRs. Phase map:

| Roadmap phase | This spec |
|---|---|
| Phase 0 — ADRs | §12 (ADRs to author) |
| Phase 1 — monorepo refactor (behavior-preserving) | §8 (package layout) |
| Phase 2 — multi-tenant tracer (deploy + host→brand) | out of scope here (deploy/brand) |
| **Phase 3 — gym-tenant model + RLS + member auth** | **§3–§10 (full design)** |
| Phase 4 — brand system | out of scope here (presentation) |
| Phase 5 — admin restructure + Clases page | deferred — §11 |
| Phase 6 — client app build (RED) | deferred — §11 |
| Phase 7 — harden & launch | §6 denial-test suite feeds this |

**Non-goals of this spec:** scheduling/session model, booking↔quota semantics, client-app UI, brand system, deployment, payment provider. Designed *on top of* this foundation, not now.

## 3. The reframe: `account` is not `cliente`

The current schema fuses two concepts. Separate them:

- **`cliente`** — the gym-owned **domain record**. `ventas`, `asistencias`, saldo (`clases_restantes`, `vence`), vigencia all FK to `cliente_id`. It exists regardless of whether the human ever opens the app.
- **account** — an **auth identity** (`auth.users` row) that may *claim* a cliente to gain self-service.

**Consequence:** keep `clientes` as the domain entity it already is — every existing rule, RPC, and ledger keeps operating on `cliente_id` unchanged. The account layer is bolted *beside* it via one nullable FK. Member login is added **without rewriting the domain core or the saldo/attendance machinery**; only the *scoping* layer changes. A `cliente` with no linked account is exactly today's behavior (operator-managed member who never logs in).

## 4. Decision — introduce a real `gym` tenant

**Decision:** add a first-class `gyms` (tenant) table; every gym-owned row carries `gym_id`; staff and members relate to a gym.

**Rejected alternatives:** *operator-`user_id`-as-tenant* (a second staff login breaks the implicit 1:1; member RLS degrades to "find my operator, then match") and *defer tenancy* (hardcodes the lone operator into member RLS; re-migrate at gym #2). **Decisive reason:** the tenant key must be something **staff and members share**. `auth.uid()` is per-person and never shared, so it cannot be the membership key. `gym_id` is. It is also the correct base for gym-level billing and staff roles.

## 5. Identity model — two populations, not one role enum

**Correction (2026-06-29):** an earlier draft of this spec unified everyone into one `profiles` table with `role ∈ {operator, member}`. That conflated two genuinely different populations. They split:

**(a) Staff** — the people who *operate* a gym (admin app). Multiple per gym, distinct roles:
```sql
create table public.staff (
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id  uuid not null references public.gyms(id) on delete cascade,
  role    text not null check (role in ('owner','coach','secretary')),  -- vocab finalised in Phase 5
  primary key (user_id, gym_id)
);
```
Today's lone "operator" becomes a single `owner` row. This enables **intra-gym permission granularity** the single-operator model lacked: only `owner` reads `cobro`/CLABE + financials; `coach` marks asistencia; `secretary` edits the roster. (Staff↔gym is technically M:N — a coach at two gyms — but the dominant case is "many staff in one gym".)

**(b) Members** — gym *customers* (client app). **Not** rows in `staff`. A member is the existing `clientes` domain record plus an optional auth account:
```sql
alter table public.clientes
  add column gym_id     uuid references public.gyms(id),   -- backfilled (§9), NOT NULL after
  add column account_id uuid references auth.users(id);    -- nullable bridge to an account
-- bridge invariant:
create unique index clientes_account_per_gym
  on public.clientes (gym_id, account_id) where account_id is not null;
```
**Member↔gym M:N falls out for free:** one auth account ↔ many `clientes`, one per gym the person is a customer of. A member registered at both Forge and RED has two `clientes` rows linked to the **same login**; host (§6) picks which gym's app they're in. A member's gyms = `select gym_id from clientes where account_id = auth.uid()`. No separate member-membership table is needed — the `clientes` rows *are* the customer-membership records.

```sql
create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'FORGE',
  slug text unique,                       -- host/route → gym mapping
  created_at timestamptz not null default now()
);
```
`perfil` and `cobro` migrate from **per-operator** to **per-gym** settings (`gym_id` FK, one row per gym).

## 6. RLS model — identity is the security boundary, host is the view selector

**Decision (confirmed):** function-based RLS via `SECURITY DEFINER` helpers, called via `(select …)` for initplan caching (the optimization the codebase already applies to `auth.uid()`). The key principle:

- **RLS = "you only ever see your own clientes / your staff-gyms' data," regardless of host.** Policies key on **membership**, never on host:
  - Member-private rows (their cliente, bookings): `using (account_id = (select auth.uid()) or (select public.is_staff_of(gym_id)))`.
  - Staff-managed rows: `using ((select public.is_staff_of(gym_id)))` — staff see data for any gym they work at.
  - Owner-only secrets (`cobro`/CLABE, financials): `using ((select public.has_role(gym_id,'owner')))`. Members and non-owner staff never read these.
- **Host = which of your gyms you're viewing.** The DAL adds `where gym_id = $hostGym` so the UI shows that gym's slice. Because RLS already confines you to your own data, host is a *view narrowing*, **never a trust input** — a spoofed host can't widen access. For authenticated requests the gate also coherence-checks `hostGym ∈ your memberships` (else redirect) so brand and data never mismatch.

```sql
create function public.is_staff_of(p_gym uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.staff
                   where user_id = (select auth.uid()) and gym_id = p_gym)
$$;
create function public.has_role(p_gym uuid, p_role text) returns boolean
  language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.staff
                   where user_id = (select auth.uid()) and gym_id = p_gym and role = p_role)
$$;
```
**Why `SECURITY DEFINER`:** bypasses RLS on `staff` while computing → **prevents policy recursion**. **Performance:** index every `gym_id` column + `staff(user_id, gym_id)` (the PK covers it); initplan caching keeps helpers O(1) per statement. **Scale path (documented, not v1):** a JWT custom-access-token-hook can later carry staff gyms/roles into the token so policies read `auth.jwt()` with zero lookups — adopt if read volume warrants; tradeoff is staleness until token refresh.

**Testing (mandatory before the client app ships):** extend `supabase/tests/rls_cross_tenant_denial.sql` into a member-vs-staff + member-vs-member + cross-gym + non-owner-vs-`cobro` denial suite. Assert: a member sees only their own cliente/bookings in the host gym; cannot read `cobro`/other clientes/others' ventas; staff confined to their gyms; only `owner` reads financials. **The single highest-risk surface in the whole effort — one missing check leaks PII or bank details.**

## 7. Member onboarding — staff invites existing clientes (= the RED mock's `registro` screen)

**Decision (confirmed):** a staff member invites a cliente that already exists in the roster; the person sets a password; their account links to that cliente. No duplicate records, no dedup flow, staff stay in control. The RED mock's `registro` screen **is** this invite-acceptance flow — **not** open self-signup.

Flow:
1. Staff trigger an invite for a `cliente` (delivered via the WhatsApp spine — a deep link with a single-use token; or email).
2. The person opens the link → **if they have no account, create one** (`auth.users`); **if they already have one** (already a member at another of our gyms), they sign in — one identity, many gyms.
3. A single-use, atomic consume step (a `SECURITY DEFINER` RPC, e.g. `aceptar_invitacion(token)`, or an auth hook — `verify-at-implementation`) sets `clientes.account_id = uid` for that gym's cliente and marks the token consumed. (Members are **not** rows in `staff`; their gym membership is the set of clientes their account links to — §5.)

```sql
create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  token text not null unique,
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','expirada')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```
`verify-at-implementation`: the exact Supabase signup/sign-in → token-consume mechanism (client `signUp`/`signInWithPassword` then RPC, vs the admin invite API, vs an auth hook) — confirm against current Supabase docs at ADR time.

## 8. How it threads through the rest

- **`proxy.ts` gate gains an identity dimension.** The admin app admits only `staff` (of the host gym); the client app admits members (with a linked cliente in the host gym). `decideRedirect` (pure, already tested in `src/lib/auth.test.ts`) extends to take the membership/role; it also performs the `hostGym ∈ memberships` coherence check (§6). Each app gets its own proxy gate.
- **DAL.** Reads still trust RLS (no explicit owner filter) — now membership/role-aware — plus the host-gym `where gym_id = $hostGym` view narrowing. Staff write-RPCs (`registrar_venta`, `toggle_pase`, …) stamp `gym_id` = the host-resolved gym, with `is_staff_of(gym_id)` enforced, instead of `user_id`. Member actions (book/cancel — Phase 6) are *new* RPCs scoped to the member's own cliente in the host gym.
- **Monorepo package layout** (matches the roadmap's target shape):
  ```
  apps/   admin/  client/
  packages/
    domain/  # pure rules + types (today's src/domain) — shared, framework-free
    data/    # server-only Supabase DAL (today's src/lib/data) + database.types + client factories
    ui/      # shared design-system primitives (today's src/components/forge) + phone chrome + token contract
    brand/   # per-gym brand modules (forge/, red/): tokens, logo, animations, copy  [roadmap Phase 4]
  ```
  The DAL splits: shared types + client factories in `packages/data`; **app-local query modules** (staff vs member reads diverge sharply).
- **Preserve the crown jewel.** The single enforced dependency boundary (`domain`/`data` ✗→ `ui`/`app`) becomes **cross-package** (`packages/domain` imports nothing inward; apps depend on packages, never the reverse). Keep one machine-checked rule; do not let the monorepo dilute it.

## 9. Migration of live data (project `hjppxawglmukfvsgmcog`)

Reversible, table-by-table, no data loss:
1. Create one `gyms` row for FORGE.
2. Insert an `owner` `staff` row for the existing auth user (`forge-1.0@outlook.com`, uuid `b63053f1-9202-4789-bc5b-fd4ccd091de0`).
3. Backfill `gym_id` on all gym-owned rows from the lone operator's `user_id`; migrate `perfil`/`cobro` to per-gym.
4. Swap RLS policies from `user_id = auth.uid()` to the membership model (§6).
5. Drop the redundant `user_id` columns once policies are cut over and verified; set `clientes.gym_id` NOT NULL.

Each migration follows the repo's discipline (idempotent, `SET search_path=''` on definer functions; the RLS auto-enable trigger still applies).

## 10. Risks & verify-at-implementation

1. **RLS rewrite is the highest-risk surface** — one missing membership/role check leaks member↔member PII or `cobro`/CLABE. Gate behind the denial-test suite (§6) before the client app ships.
2. **Host coherence check** — confirm the gate rejects/redirects a logged-in user whose host gym isn't in their memberships, so brand never wraps another gym's data.
3. **`SECURITY DEFINER` + initplan performance** on realistic row counts — verify with `explain analyze`.
4. **Onboarding token-consume mechanism** (§7) and **multi-gym account linking** (existing account → link new cliente) — confirm Supabase API at ADR time.
5. **Monorepo migration is mechanical but broad** — `@/*` aliases per package, two Next builds, dependency-cruiser re-expressed cross-package, Husky/pnpm workspace. Keep Phase 1 strictly behavior-preserving with green tests.

## 11. Deferred to later sub-project specs

- **Phase 5 — admin restructure + Clases:** class/session model (template vs ad-hoc vs both), capacity, instructor; the Clases management page; finalised staff-role vocabulary + per-role permissions. A frontend mock exists; design against this spec's `gym_id` scoping + `staff` roles.
- **Phase 6 — client app (RED) + booking:** booking↔prepaid-quota semantics (does a booking consume `clases_restantes`?), cancellation/no-show/waitlist, reconciliation with the operator's after-the-fact `asistencias` marking; the 12-screen member journey; the brand system (Phase 4).
- **Phase 7 / future — purchases/subscriptions:** MX payment provider (e.g. Mercado Pago vs Stripe), gym-level billing, member self-purchase. Roadmap builds the `membresía/checkout` flow UI only; payment processing deferred.

## 12. ADRs to author (via grill-with-docs) — numbering reconciled with the roadmap

- **ADR-0008 — Platform shape** (roadmap-owned): shared-DB gym-tenant RLS + 2 multi-tenant deploys (host→tenant) + per-gym brand modules.
- **ADR-0009 — Gym tenant + two-population identity**: `gyms` tenant; `staff(user,gym,role)` for operators; members = `clientes` + optional `account_id` (no member-membership table). Supersedes ADR-0001's operator-as-tenant RLS posture.
- **ADR-0010 — `cliente` vs account separation**: the bridge invariant; domain record is gym-owned, account is an optional claim; member↔gym M:N via clientes.
- **ADR-0011 — Identity-keyed function-based RLS + host-as-view-selector**: `is_staff_of`/`has_role` helpers, `SECURITY DEFINER` recursion avoidance, initplan caching, host narrows the view but is never a trust input; JWT scale path.
