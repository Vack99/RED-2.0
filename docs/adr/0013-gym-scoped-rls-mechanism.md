# ADR-0013 — Gym-scoped RLS mechanism: membership-keyed SECURITY DEFINER helpers, one standard predicate, reader-side gym scoping

**Status:** Accepted · **Date:** 2026-07-02 · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (RLS-as-boundary, no ORM, the `(select auth.uid())` initplan idiom), [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) (isolation is RLS-by-membership, **never** the proxy host), [ADR-0009](0009-identity-two-tier-auth-member-claim.md) (`gym_membership(user_id, gym_id, role ∈ owner|operator|member)` is the one map every policy resolves gym+role from; the three-class read/write matrix) · **Trigger:** finding 9 of [`2026-07-01-multitenant-branding-scale-audit.md`](../superpowers/audits/2026-07-01-multitenant-branding-scale-audit.md) (mechanism pinned only in a spec whose `staff` schema ADR-0009 superseded; the mechanism ADR was never authored) · **Realizes:** roadmap **Phase 3**

## Context

ADR-0008 and ADR-0009 decided *what* the boundary is (RLS keyed to `gym_membership` + role) and *what* the surface classes are (the three-class matrix, [target-data-model §3](../planning/2026-06-29-target-data-model-and-decisions.md)). Neither decided the *mechanism* — the shape of the SQL that compiles that boundary onto the 7 tenant tables (21 per-`auth.uid()` policies today, more with each phase). That mechanism lived only in [`2026-06-29-…-tenancy-design.md` §6](../superpowers/specs/2026-06-29-monorepo-member-platform-tenancy-design.md), whose `is_staff_of`/`has_role` helper bodies read a **`staff` table that ADR-0009 superseded** (roles moved onto `gym_membership`). Those helper bodies must therefore be **re-expressed against `gym_membership`, never copied** — this is the load-bearing correction this ADR records.

Today every tenant table carries the single-operator pattern: per-table policies of the form `using ((select auth.uid()) = user_id)` (see [`20260530023224_create_ventas_core.sql`](../../supabase/migrations/20260530023224_create_ventas_core.sql)). That expresses "the lone operator owns every row" — structurally unable to express "staff of this gym" or "the member who owns this row," which the two-population model (ADR-0009) requires. This ADR settles the replacement.

## Decision

### 1. Three membership-keyed helpers, re-minted against `gym_membership`

- `public.is_member_of(p_gym uuid) → boolean` — caller has **any** `gym_membership` row for `p_gym`.
- `public.is_staff_of(p_gym uuid) → boolean` — caller's role for `p_gym` is `owner` **or** `operator`.
- `public.has_role(p_gym uuid, p_role text) → boolean` — exact-role check (owner-only surfaces, e.g. `cobro`/CLABE).

Posture on **every** helper (representative signature; the migration owns the body):

```sql
create function public.is_staff_of(p_gym uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ /* reads public.gym_membership with (select auth.uid()) */ $$;
```

`security definer` is **required, not incidental**: `gym_membership` itself carries RLS, so a policy that queried it *as invoker* would recurse into `gym_membership`'s own policies. Definer executes the membership read with RLS bypassed, breaking the recursion. `EXECUTE` is **revoked from `public` and `anon`, granted to `authenticated`** — a definer function must never be client-callable beyond its intended caller (the same lockdown [`20260531210445`](../../supabase/migrations/20260531210445_revoke_rls_auto_enable_execute.sql) applies to `rls_auto_enable`).

### 2. The helper wrap, corrected: it is per-ROW, not per-statement (corrected 2026-07-13)

> **Correction (2026-07-13, spec `2026-07-13-respaldo-mensual-design.md` §1.2).** This section originally
> claimed the `(select public.is_staff_of(gym_id))` wrap evaluates "once per statement, not once per row —
> O(1)-per-statement at all-Mexico scale." **That was false.** The initplan idiom hoists only
> **uncorrelated** subqueries: `(select auth.uid())` references no table column, so it becomes an InitPlan.
> `(select is_staff_of(gym_id))` **references the row's own `gym_id` column** → it is a **correlated
> SubPlan**, evaluated **once per row of the whole cross-tenant table**, and the planner cannot turn it
> into an index condition. Live proof at correction time: `gym_membership` (6 rows) had **214,861 seq
> scans**; `ventas` ran 1,574 seq scans against 61 index scans.

What actually holds:

- The wrap is kept for the `auth.uid()` call INSIDE the helper bodies (that one is genuinely initplan-cached),
  and the helpers stay the single home of the membership rule (§1) — none of that changes.
- **Scale comes from the readers, not the predicate:** every staff DAL read carries an explicit
  `.eq("gym_id", gym.id)` scope selector (spec §1.1), which flips the seq scan into
  `Index Cond: gym_id = …` and drops the per-row helper calls to the matched rows only. The `.eq` is
  **not redundant with RLS and must not be "cleaned up"**: RLS answers *"may I see this row?"*; the `.eq`
  answers *"which of the rows I may see belong to this gym?"* — which a per-row-per-gym predicate
  structurally cannot.
- Index **every** `gym_id` column (composite `(gym_id, fecha)` on the ledgers — `20260713180000`); the
  `gym_membership` PK `(user_id, gym_id)` already covers the helper's lookup.
- **Deferred with a named trigger:** rewriting the policies to an uncorrelated form
  (`gym_id in (select staff_gyms())`, hoistable to an InitPlan) converts "every reader must remember
  `.eq`" from a convention into a property. Adopt when any gym-scoped admin result set routinely exceeds
  ~50k rows or admin p95 exceeds 500ms.

### 3. One standard predicate per RLS class

- **Curated / showcased** — writes `using ((select public.is_staff_of(gym_id)))`; authenticated reads `(select public.is_member_of(gym_id))`. Anon reads only where a surface demands it — **in Phase 3 that is exactly `gym_domain` and `gym`** (the pre-auth proxy lookup: hostnames are public DNS facts and the `gym` row is already the shield's public/anon marketing read class). Phase 3 grants **no other anon reads**; the catalog tables' anon-read policies ride Phases 5/6 with the tables themselves.
- **Member-owned / transactional** (`clientes` + dependents `ventas`/`asistencias`) — staff of the row's gym read/write; the owning member (`clientes.auth_user_id = (select auth.uid())`) reads their own row. Member **write** surfaces beyond the claim RPC are Phase 6.
- **Owner-only secrets** — `cobro` policies use `(select public.has_role(gym_id,'owner'))`; operators and members never read CLABE.

### 4. `gym_membership`'s own policies

A user reads their own membership rows; staff read their gym's membership rows. **Writes happen only inside `SECURITY DEFINER` RPCs** (registration/claim, ADR-0009) — never direct client writes.

### 5. Cutover discipline

Every tenant table: `gym_id uuid NOT NULL` (after expand/contract backfill) + an index on `gym_id`. The `rls_auto_enable` event trigger **stays on** (belt-and-suspenders per [`20260531210400`](../../supabase/migrations/20260531210400_create_rls_auto_enable.sql); do not disable). Policy cutover is expand/contract: **add** the gym-scoped policies alongside the per-`auth.uid()` ones → verify the seeded denial suite green *before* → **drop** the per-`auth.uid()` policies → verify green *after*. The denial suite runs as **one repeatable command** against a seeded Supabase preview branch (MCP `create_branch`) with **zero hardcoded prod UUIDs** — closing audit finding 6.

## Considered and rejected

- **JWT custom-claims RLS** (gym/role carried in the access token via a custom-access-token hook, policies reading `auth.jwt()` with zero lookups) — **rejected for now.** Claims are stale until token refresh, a real correctness cost. (The 2026-07-01 audit's original performance justification rested on the O(1)-per-statement claim §2 has since retracted; the standing basis is §2-corrected: reader-side `.eq` + the `gym_id` indexes suffice, with the uncorrelated-predicate rewrite as the named next step before anything JWT-shaped.) Documented here as the scale path *if* read volume ever warrants — a future adopter must reckon with the staleness semantics. **Do not relitigate.**
- **Inline `EXISTS` subqueries per policy** instead of helpers — the membership rule would live in every policy (21 today, growing each phase) instead of one home, and there is nowhere to hang the `SECURITY DEFINER` recursion-avoidance (§1). The helper *is* what makes the recursion break expressible once.
- **Host / `x-gym`-derived scoping** — forbidden outright; the moment a policy trusts the proxy header the shared-DB isolation guarantee is gone (ADR-0008 hinge, cited not re-decided).
- **Per-role Postgres roles + `GRANT`s** instead of RLS predicates — Supabase's role model is `anon`/`authenticated` only; row-level gym scoping cannot ride table-level GRANTs.

## Consequences

- **The membership rule has exactly one home.** Change "who is staff" once (the helper body), not across every policy. The three predicates in §3 are the whole vocabulary; a reviewer audits three helpers plus a per-table class label, not 22 bespoke `WHERE` clauses.
- **The `staff`-table drift is closed.** Any code or doc still referencing `is_staff_of`/`has_role` over a `staff` table is stale (ADR-0009); the migration re-expresses them over `gym_membership`.
- **The highest-risk surface gets a machine gate.** RLS cutover is the single surface where one missing check leaks PII or CLABE; the repeatable, prod-UUID-free denial suite is the gate, run green before and after every policy drop and on every migration after.

## What a future reader must not undo

- **Never drop `SECURITY DEFINER` from the helpers** — invoker-rights helpers recurse into `gym_membership`'s own RLS.
- **Never delete a reader's `.eq("gym_id", …)` as "redundant with RLS"** — it is the scope selector §2
  (corrected) makes load-bearing: without it the read is a cross-tenant seq scan with a per-row SubPlan,
  and the export stamps one gym's name on rows RLS happens to allow from another. (The pre-correction
  bullet here said "never unwrap `(select helper(gym_id))` — that reverts O(1)-per-statement to per-row";
  that rested on the false §2 claim. The wrap is harmless and kept, but it never bought per-statement
  evaluation on a correlated predicate.)
- **Never widen anon reads past `gym`/`gym_domain` in Phase 3**, and never let a policy read the host/`x-brand` header (ADR-0008).
- **Never adopt JWT-claims RLS without confronting staleness** — it was rejected on a correctness cost, not an oversight.
