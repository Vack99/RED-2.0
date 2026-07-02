# PRD — Phase 3: Tenant/identity foundation (gym-scoped RLS, member self-register + claim, DB-backed host→gym)

> Tracked in: https://github.com/Vack99/RED-2.0/issues/17

## Problem Statement

The platform is architecturally multi-tenant (ADR-0008) but the live database is still single-operator: all 21 RLS policies across the 7 tenant tables key on `(select auth.uid()) = user_id`, which structurally cannot express "staff of this gym" or "the member who owns this row". Concretely, today:

- **Gym #2 cannot exist.** Onboarding is a code deploy (`HOST_TO_BRAND` edit), receipt folios draw from one global sequence that would interleave both gyms' numbering, and four `user_id`-keyed unique constraints pin `perfil`/`cobro`/`paquetes` to the lone operator.
- **Members cannot exist.** Clientes never authenticate; there is no registration, no `gym_membership`, and Supabase's built-in mailer (single-digit emails/hour, dev-only) would kill self-registration at roughly member #30 (audit finding 3).
- **A second timezone corrupts data.** `America/Chihuahua` is hardcoded in `@gym/format` (21 call sites) and twice in the `toggle_pase` RPC — attendance dates, expiry, and month-end revenue break at the first gym outside UTC-6 (audit finding 1).
- **The highest-risk surface has no machine gate.** The cross-tenant denial test is manual-run with hardcoded prod UUIDs (audit finding 6).

## Solution

Migrate the live single-tenant Forge admin onto a gym-scoped multi-tenant spine — expand/contract on the live DB, Forge green at every commit:

1. **Four spine structures:** `gym` (incl. the pinned Phase-4 interface columns `brand_module_id text NOT NULL` + `token_overrides jsonb NOT NULL DEFAULT '{}'::jsonb`), `gym_domain(gym_id, hostname unique, app)`, `gym_membership(user_id, gym_id, role ∈ owner|operator|member)`, and the additive `clientes` evolution (`gym_id`, permanently-nullable `auth_user_id`, `phone_e164`, terms/privacy timestamps).
2. **RLS-by-membership** (ADR-0013): initplan-cached SECURITY DEFINER helpers (`is_member_of`/`is_staff_of`/`has_role`) replace the 21 per-`auth.uid()` policies; `cobro`/CLABE becomes owner-only; cutover is gated by a seeded, repeatable denial suite (green before AND after the per-`auth.uid()` drop).
3. **Member self-register + claim-by-match** (ADR-0009 as amended): unstyled `/registro` + `/entrar` in the client app; verified-email-gated claim via one atomic SECURITY DEFINER RPC; `gym_id` server-authoritative from the resolved host.
4. **DB-backed host→gym resolution** (ADR-0012 §5 as amended): async `resolveTenant(host, override)` in `@gym/data`; proxies stamp `x-gym` + `x-brand` (= the gym row's `brand_module_id`); `HOST_TO_BRAND` and its resolver file are deleted, grep-proven.
5. **Custom SMTP** (ADR-0014): Resend as the one platform sender; deliverability verified on a real inbox (HITL).
6. **Per-gym timezone:** `gym.timezone` (IANA, NOT NULL) threaded as a per-call argument through `@gym/format`; `toggle_pase` derives tz from the cliente's gym row inside the RPC.
7. **Per-gym folio + re-keys:** `unique(gym_id, folio)` with a per-gym counter row incremented inside `registrar_venta`; the four `user_id`-keyed uniques re-keyed gym-scoped.

## User Stories

1. As the platform operator, I want onboarding a gym to be a config act (gym row + gym_domain rows + DNS), so that gym #3 never requires a code deploy or release train.
2. As the platform operator, I want the Forge admin green at every commit through the migration, so that the live business never stops working while the spine lands underneath it.
3. As the platform operator, I want a one-command denial suite against a seeded preview branch with zero prod UUIDs, so that every future policy migration has a repeatable machine gate.
4. As the platform operator, I want the denial suite recorded green before AND after the per-`auth.uid()` policy drop, so that the destructive cutover is provably safe, not asserted safe.
5. As the platform operator, I want auth mail sent through custom SMTP from a platform-owned sender, so that self-registration doesn't silently die at Supabase's dev-only mail cap.
6. As a gym owner, I want my bank details (`cobro`/CLABE) readable only by the `owner` role, so that operators and members can never see them.
7. As a gym owner, I want receipt folios to sequence independently per gym, so that my ledger's numbering never interleaves with another gym's.
8. As a gym operator, I want my existing flows (asistencia, clientes, vender, paquetes, plantillas, respaldo) to work unchanged under gym-scoped RLS, so that the migration is invisible to my daily work.
9. As a gym operator, I want to keep creating clientes and selling paquetes to people who never log in, so that self-service adoption is incremental, never a cutover forced on my members.
10. As a gym operator, I want a member who registers with a verified email that matches my CRM row to claim it (balance + history carry over), so that I never end up tracking duplicate people or orphaned paquete balances.
11. As a gym operator in a non-Chihuahua timezone, I want attendance dates, expiry, and revenue cutoffs computed in MY gym's zone, so that my records are correct even though gym #1 is in UTC-6.
12. As a gym member, I want to self-register with email+password on my gym's domain (no gym selector), so that I'm enrolled in the right gym automatically and securely.
13. As a gym member, I want a confirmation email that actually arrives, from a real sender, so that I can complete registration.
14. As a gym member, I want to log in and read exactly my own row and my own gym's data — never another member's row, never another gym's anything, so that my PII stays mine.
15. As a gym member whose phone matches someone else's CRM row but whose email doesn't, I want a fresh row instead of a claim, so that nobody can hijack another person's history by knowing their phone number.
16. As a returning member, I want password reset by email, so that I can recover access without the operator's help.
17. As a would-be attacker on gym #2, I want (and must fail) every cross-gym vector: reads, writes, `registrar_venta`/`toggle_pase` RPCs against gym #1's rows, member-vs-member reads, and non-owner reads of `cobro` — so that RLS-by-membership is the proven boundary.
18. As a developer, I want the membership rule in exactly one home (three helpers), so that "who is staff" changes in one place, not 21 policies.
19. As a developer, I want every tenant table to carry `gym_id NOT NULL` + an index and auto-enabled RLS, so that the tenancy invariant is structural, not conventional.
20. As a developer, I want `@gym/format` timezone-parameterized with honest names (no `*Chihuahua` helpers reading a global), so that the API can't silently lie about whose calendar it computes.
21. As a developer, I want the host→gym lookup in the data tier behind the frozen `brand ✗→ data` boundary, so that `@gym/brand` stays presentation-only for Phase 4 to build on.
22. As the Phase-4 planning session, I want `gym.brand_module_id` + `gym.token_overrides` created and seeded (forge/red) by this phase's first schema slice, so that the brand-render track can consume them without a mid-flight handshake.
23. As a preview/dev user on an unmapped host, I want `?gym=` to select a real gym slug and bare unknown hosts to resolve NO tenant (writes refused), so that a stray preview deployment can never register members into Forge's production roster.

## Implementation Decisions

All decisions below were locked at the 2026-07-02 grill (grill-with-docs) against the target-data-model shield, the roadmap, ADR-0001/0006/0008/0009/0012, the 2026-07-01 scale audit, and the tenancy spec. Settled decisions are cited, not restated — read ADR-0013, ADR-0014, and the ADR-0006/0009/0012 amendments (committed `f80739c`) alongside this PRD.

**Schema (expand/contract on the live DB, project `hjppxawglmukfvsgmcog`):**
- `gym`: only the columns Phase 3 exercises — `id`, `slug` (unique; the `?gym=` key), `brand_name`, `legal_name` (nullable until the HITL fact lands), `timezone text NOT NULL` (IANA), `brand_module_id text NOT NULL` (opaque registry key — NO FK/CHECK, NO DB default; render-side validation is Phase 4's), `token_overrides jsonb NOT NULL DEFAULT '{}'::jsonb` (value shape is Phase 4's zod decision — opaque here), `owner_user_id` nullable, `created_at`. Full contact/marketing graduation from `perfil` waits for its Phase-5/6 consumers.
- `gym_domain(gym_id, hostname unique, app ∈ admin|client)`; seeded from `HOST_TO_BRAND`'s 5 entries (both `*.localhost` + 3 Vercel hosts). The RED-admin host is NOT among them — its row is a later human insert (Phase-4 HITL), not this phase's scope.
- `gym_membership(user_id, gym_id, role)` PK `(user_id, gym_id)`; writes only inside SECURITY DEFINER RPCs.
- `clientes` evolves ADDITIVELY — no rename in Phase 3. Gains `gym_id` (nullable → backfill → NOT NULL + index), `auth_user_id` (nullable PERMANENTLY, per ADR-0009), `phone_e164`, `terms_accepted_at`/`privacy_accepted_at`. The shield's "member" is this same row; CONTEXT.md keeps **cliente** canonical.
- Backfill: Forge gym row (timezone `America/Chihuahua`) + `gym_membership(owner)` for the lone operator; RED gym row seeded ownerless. Seeds: `brand_module_id` 'forge'/'red', `'{}'` overrides.
- `perfil` + `cobro` gain `gym_id`; re-key `unique(user_id)` → `unique(gym_id)`; `paquetes_nombre_uq(user_id, nombre)` → `(gym_id, nombre)`; `paquetes_one_popular` partial index → per-gym. Redundant `user_id` columns drop only at the HITL-approved contract step.
- Folio: `unique(gym_id, folio)` replacing global `ventas_folio_uq`; a per-gym counter row incremented inside `registrar_venta` (NOT per-gym sequences), per the shield's migration contract.

**RLS (ADR-0013 — cite, don't re-derive):** three membership helpers, initplan-cached, one standard predicate per shield-§3 class; `ventas` stays immutable (no update/delete policies existed; none get added); anon reads in Phase 3 are exactly `gym`/`gym_domain` (the pre-auth proxy lookup); `rls_auto_enable` stays ON; every new tenant table gets `gym_id` + RLS + index.

**Registration + claim (ADR-0009 as amended):** one atomic SECURITY DEFINER RPC (match on verified email only → claim, else create; + `gym_membership(role='member')` in the same transaction; ambiguous → create). `gym_id` is server-authoritative from the resolved host — never client-supplied. Vehicle: deliberately-unstyled `/registro` + `/entrar` pages in the client app calling server actions (RED's designed screens are Phase 6).

**Host→gym resolution (ADR-0012 §5 as amended):** async `resolveTenant(host, override)` in `@gym/data` (server-only) — `gym_domain` lookup, host-wins precedence, `?gym=` names an open gym slug validated against the DB, unknown host → NO tenant (default-brand chrome; tenant-requiring writes refuse). No cache in v1. The brand package's host-map and resolver files are DELETED; `@gym/brand` keeps registry + modules only.

**Pinned header contract (coordination — quote in the goal file):** the proxy stamps `x-gym` = the resolved tenant id/slug (NEW; presentation/UX only, NEVER authz — ADR-0008 hinge) and `x-brand` = a registry key (today from the static host-map; = the gym row's `brand_module_id` once the DB lookup lands), ALWAYS validated in the layout via `Object.hasOwn` with `DEFAULT_BRAND` fallback. Phase 3 stamps; Phase 4's layouts read both and never re-resolve. Phase 3 treats `BrandId` as an opaque registry key; the open tenant-slug type lives in the data tier.

**Timezone:** per-call `tz` argument through `@gym/format` (the package stays a pure leaf); honest renames of the `*Chihuahua` helpers; 21 call sites re-threaded with the resolved gym's `timezone`; `toggle_pase` derives tz from the cliente's gym row INSIDE the RPC (server-authoritative, not a parameter).

**SMTP (ADR-0014):** Resend, one platform-owned sender for every gym (permanent project-wide constraint); platform-voiced gym-neutral es-MX templates; vendor signup, DNS, credentials, templates, rate limits, and inbox verification are HITL.

**Cross-initiative fence (Phases 3 ∥ 4):** Phase 3 owns the resolver relocation, host-map deletion, BOTH proxies' resolution edits, comment-only cruiser edits, the minimal ARCHITECTURE.md HOST_TO_BRAND scrub, and (split-file) the brand test's HOST_TO_BRAND import/describe block + the index export. Phase 3 NEVER edits `brand-id.ts`, `registry.ts`, or either app's layout (Phase-4-owned). The `brand ✗→ data/domain` cruiser edge is FROZEN for both phases.

**Docs-guard timing rule (re-derived for this phase's paths):** `tools/guards/docs.test.ts` requires every `apps/|packages/|docs/|tools/` path cited in ARCHITECTURE.md/CONTEXT.md to exist on disk. Therefore: the slice that DELETES the brand host-map/resolver files must scrub ARCHITECTURE.md's citations of them in the SAME commit; any doc row citing a new path lands in the same commit that creates the path. CONTEXT.md's Phase-3 rows (committed at the grill) cite only already-existing paths.

**Accepted-debt posture:** the unpaged clientes readers (L-001..L-003, threshold 900) stay trigger-gated debt — multi-tenancy does not grow any single gym's roster; pagination is NOT bundled into this phase.

### Design principles

This work favors YAGNI and KISS: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared' / base module with a single caller in this diff — DRY and SOLID do not justify structure the criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception must name its concrete present need; unnamed single-caller abstraction is a failure.

**Named present-need exceptions.** Phase 3 is a depth phase: its acceptance criteria REQUIRE the following structures, each with an enforced boundary or in-phase consumers, and they PASS the principles above by construction: (1) the four spine tables — gym (incl. the pinned brand_module_id + token_overrides columns), gym_domain, gym_membership, member-evolution columns; (2) gym-scoped RLS policies on every tenant table — a policy per table is the deliverable, not duplication to prefer away; (3) the SECURITY DEFINER membership-helper functions — consumed by every table's policies, so single-caller rejection does not apply; (4) the mechanized denial-suite fixtures/harness — the phase's highest-risk surface demands it; (5) tz-parameterization of @gym/format (~18 call sites) and the toggle_pase RPC; (6) the per-gym folio counter row + registrar_venta rewiring + the four user_id-keyed unique re-keys; (7) async host→gym resolution replacing HOST_TO_BRAND (lookup app-side/data-tier; pure derivation stays in @gym/brand). Structure BEYOND this list remains rejected.

## Testing Decisions

- **TDD per slice, denial-test-FIRST:** the cross-tenant denial test for a policy is written and recorded failing/green BEFORE the policy it guards, inside every RLS slice (roadmap sequencing principle; superpowers:test-driven-development is non-negotiable).
- **The denial suite** is ONE repeatable command against a SEEDED Supabase preview branch (MCP `create_branch` + seeded fixtures: two gyms, an owner, an operator, members claimed and unclaimed — zero hardcoded prod UUIDs). Vectors: cross-gym read/write, member-vs-member, member-vs-operator-surface, non-owner-vs-`cobro`/CLABE, and `registrar_venta`/`toggle_pase` cross-gym RPC calls. Prior art: `supabase/tests/rls_cross_tenant_denial.sql` (self-asserting DO blocks, BEGIN/ROLLBACK) — evolved from manual-run to seeded-repeatable.
- **Synthetic gym #2 probe** on the same seeded branch with a non-Chihuahua IANA zone (e.g. `America/Mexico_City`): self-register → claim a pre-seeded row → gym-scoped read → one sale; OBSERVED: folios sequence independently per gym; dates render in gym #2's zone.
- **Good tests exercise external behavior:** RLS tests assert row visibility/denial through the API surface, not policy internals; resolver tests are pure-function tests over (host, override) values — prior art: the existing resolver unit tests and `supabase/tests/*_rules.sql` RPC rule tests.
- **Vitest suite (319 tests) + lint (incl. dependency-cruiser) + typecheck green at every commit** (pre-commit hook); `@gym/format` tz-parameterization is unit-tested per helper with explicit zone fixtures.
- **Supabase advisors** (`get_advisors`) checked after every policy/function migration; `improve-database-architecture` runs as the post-cutover exit audit.
- **Modules under test:** the membership helpers + every policy class (denial suite), the claim RPC (match/create/ambiguous/unverified vectors), `resolveTenant` (host/override/unknown-host), tz-parameterized `@gym/format`, `registrar_venta` folio counter (two-gym independence).

## Out of Scope

- **Catalog/scheduling entities** (`class_*`, `schedule_template`, `plan`/`plan_feature`, `room`, `gym_hours`, gym content) — Phase 5. **Booking/subscription entities** (`reservation`, `subscription`, `waitlist`, `contact_message`), asistencias→reservation evolution, RED-designed auth screens, abuse posture (Turnstile/per-IP), payments — Phase 6.
- `ventas`/`paquetes` beyond the folio + re-key contract — payment/plan evolutions ride Phases 5/6.
- **ALL brand-render work** (base module, zod token merge, brand.css serialization, admin de-brand, `brand-id.ts`/`registry.ts`/layout edits) — Phase 4.
- **Audit-refuted capacity work:** JWT-claims RLS, pooling, sharding/replicas, caching layers, Edge/multi-region, Edge Config, `dynamic()` per-brand imports, Supabase MAU tiering, per-gym projects, parametrizing es-MX/MXN/+52 — the audit's "Explicitly do NOT fix" list is the full fence.
- Roles beyond `owner|operator|member`; self-serve gym onboarding; BYO-domain queue; pagination of the ledgered clientes readers (trigger-gated).

## Further Notes

**Suggested slice decomposition (guidance — /to-issues owns the final cut; DAG order):**
- **S0 — gym + gym_domain schema + seeds + anon-read policies.** FIRST in the DAG (Phase 4's merge slice may cite this issue number). Creates the pinned Phase-4 interface columns.
- **S1 — gym_membership + ADR-0013 helpers + owner backfill.** Denial tests for the helpers first.
- **S2 — denial-suite harness:** seeded preview-branch fixtures + the one-command runner, recorded green on the CURRENT policy set (baseline before any cutover).
- **S3 — gym_id expand across the 7 tenant tables** (nullable → backfill → NOT NULL + index).
- **S4 — gym-scoped policies (expand):** add alongside per-`auth.uid()` per table class; cobro→owner-only; denial vectors per class written first.
- **S5 — folio counter + the four user_id re-keys** + `registrar_venta` rewiring.
- **S6 — timezone threading:** `gym.timezone` per-call through `@gym/format` (21 call sites; bulk/mechanical → sonnet-5) + `toggle_pase` tz derivation.
- **S7 — resolveTenant + proxies + HOST_TO_BRAND deletion** (+ same-commit ARCHITECTURE.md scrub, brand test/index split-file edits, comment-only cruiser/vitest.config edits).
- **S8 — registration + claim:** RPC + unstyled `/registro`/`/entrar` + server actions (typescript-advanced-types-RED for the DAL/types surfaces).
- **S9 — custom SMTP standing-up (`hitl`):** Resend + DNS + templates + inbox verification.
- **S10 — live cutover + deploy-verify (`hitl`, terminal):** HITL-approved destructive drops (per-`auth.uid()` policies, redundant `user_id` columns), denial suite green before/after, synthetic gym-#2 probe, runbook clone of hitl-16, post-cutover `improve-database-architecture` exit audit.

**Per-slice skills (the goal file wires these):** superpowers:writing-plans; superpowers:test-driven-development (denial-test-first); supabase-postgres-best-practices-RED on EVERY migration/policy/RPC touch; Supabase MCP branch tools for the denial suite + advisors; typescript-advanced-types-RED on DAL/type surfaces (resolveTenant's tenant types, claim RPC signatures, tz-parameterized format types); keep-it-lean (depth framing per Design principles); superpowers:verification-before-completion + verify; superpowers:requesting-code-review on the RLS policies BEFORE cutover; superpowers:using-git-worktrees (parallel with Phase 4); improve-database-architecture post-cutover. Bulk/mechanical work (tz threading, constraint re-keys) → sonnet-5; escalate per CLAUDE.md's override rule.

**HITL (human-only):** SMTP vendor/DNS/credentials/templates/inbox; canonical legal name + timezone + contact facts per gym; approval of the destructive cutover steps; the terminal deploy-verify runbook + any hosts it needs; relaying the gym-schema issue number to Phase-4 planning; fast-forwarding the shipped stack to main.

**Coordination:** Phase-4 planning starts only after this PRD's issues publish; both initiatives execute in parallel under the coordination contract in the Phase-3/Phase-4 kickoffs (initiative labels `platform-phase3-rls-2026-07` vs `platform-phase4-brand-2026-07`; at most ONE cross-initiative edge — Phase 4's merge slice may cite S0's issue number).
