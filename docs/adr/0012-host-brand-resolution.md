# ADR-0012 — Host→brand resolution: one shared `proxy.ts` seam, a static registry stubbing the Phase-3 `gym`-row lookup

**Status:** Accepted · **Date:** 2026-06-30 · **Amended:** 2026-07-01 (keyspace split, `gym_domain` host modeling, admin-shell scope — per the multitenant-branding scale audit); 2026-07-02 (Phase-3 grill: the swap relocates resolution to the data tier — see §5) · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (`proxy.ts` not `middleware.ts`, Node-only, `getClaims()`/`getUser()`), [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) (host resolves brand **only, never authz**; presentation-only brand modules; two multi-tenant deploys + one shared Supabase), [ADR-0011](0011-monorepo-packaging-jit-packages-cross-package-boundary.md) (JIT `@gym/*` packages; §6 the `brand ✗→ data/domain` edge lands when `packages/brand` is created) · **Realizes:** roadmap **Phase 2** ("Multi-tenant tracer / de-risker") in [`docs/planning/2026-06-29-multi-gym-platform-roadmap.md`](../planning/2026-06-29-multi-gym-platform-roadmap.md)

## Context

[ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) settled that the tenant (`gym`) is resolved **at runtime, by hostname, in `proxy.ts`**, selecting a brand module — presentation only, never the authorization boundary (isolation is RLS-by-membership, Phase 3). It deliberately did **not** decide *how* host→brand resolves before real custom domains exist. Phase 2 is a **zero-schema tracer**: there is no `gym` table yet (Phase 3), so host→brand **cannot** be a DB lookup. The one open decision is the dev/preview/prod resolution strategy — this ADR.

The decision was verified against the vendored **Next 16.2.6** docs and current Vercel docs (2026), not memory:

- `proxy.ts` is the **Node-only** successor to `middleware.ts` (the `runtime` option throws if set) and is **explicitly not an authorization solution** — it independently confirms ADR-0008's hinge.
- On Vercel, the request **`host` header == `x-forwarded-host` == the client-facing custom/preview domain** (the internal `*.vercel.app` is a separate `x-vercel-deployment-url`). Parsing `x-forwarded-host` therefore buys nothing over `host` and is the more spoofable header off-Vercel.
- **Preview deployments get a single random `*.vercel.app` host** with no per-brand signal and no DNS; **localhost** likewise has no per-brand DNS. So hostname **alone** cannot select a brand in dev/preview — an explicit override arm is structurally required.
- One Vercel project serves **many** hostnames (unlimited custom domains + wildcard `*.domain` + automatic SSL); env vars are per-project or per-environment.

One product fact shapes the seam: **both apps are per-gym branded.** The admin console is itself re-branded per gym (Forge operator sees Forge, RED operator sees RED; RED-admin is deferred to Phase 4). Brand resolution is therefore a **shared** concern, not client-only — the admin app is a genuinely multi-brand app currently serving one brand.

## Decision

### 1. One pure resolver, host-wins precedence, no environment coupling

Host→brand is a single **pure function** `resolveBrandId(host, override): BrandId`, with precedence — highest first:

1. **known host-map** (`HOST_TO_BRAND[stripPort(host)]`), including `*.localhost` entries for DNS-free local dev;
2. **`?gym=` override** (query param or `gym` cookie), *if* it names a known brand;
3. **`DEFAULT_BRAND`** (`'forge'`).

The ordering is identical across dev/preview/prod — the environment changes the *inputs*, never the code path, so the risky assumption ("host→brand from one deployment") is falsifiable in a unit test before the live deploy confirms it. **Host wins**, so on a real mapped customer domain the override is **structurally inert** — a Forge customer cannot `?gym=red` themselves into RED chrome — which is the exact correctness property a `VERCEL_ENV` gate would otherwise cost a branch to buy. On unmapped hosts (localhost, `*.vercel.app`) the host arm misses and the override fires: the only signal that works without DNS. The resolver is a plain function over values (`(string|null, string|null) → BrandId`), mirroring the existing `decideRedirect(authed, pathname)` split; it is the **TDD target** (failing test first).

### 2. Both apps run the identical seam; per-deployment difference is host-map *data*

`apps/admin` and `apps/client` each run the same seam in their own `proxy.ts`: read **`host`** (never `x-forwarded-host`) + `?gym=` + the `gym` cookie → `resolveBrandId` → stamp **`x-brand`** on the request and persist a fresh `?gym` to a session cookie. Resolution happens **once, at the proxy** (not per RSC subtree — the Phase-3 `gym`-row read is an edge/DB lookup done once). The **only** difference between the two deployments is host-map data: admin's map serves **forge** hosts, the client's serves **forge + red**. Phase-4 RED-admin is then a one-row host-map addition + a provisioned host — **zero mechanism change** (the seam only — the admin shell's de-brand is Phase-4 work; see Consequences).

### 3. SSR-inlined tokens via a dark-safe `<style>` block — no FOUC, no second layer

The root layout reads `x-brand` (via `await headers()` — a dynamic render, accepted per ADR-0008) and **SSR-injects the resolved brand's `:root` + `.dark` token block as a `<style>` in `<head>`**. Each app's `globals.css` **drops its raw `:root` token block** so the injected block is the sole definer (no cascade fight). This fills the **existing `@gym/ui` CSS-variable contract** (`--canvas`, `--yellow`, `--fg`, … → `@theme inline` → utilities) — every primitive re-colors with zero edits. A `<style>` block (not an `<html style={vars}>` inline payload) is required: inline custom-property specificity beats the `.dark{}` class selectors and would **silently kill class-based dark mode**. No client context, no theme-provider (either would move resolution client-side and reintroduce the FOUC the SSR inline exists to prevent).

### 4. Brand lives in `@gym/brand`, consumed by both apps; Forge defined once

Brand modules live in **`@gym/brand`** (a JIT raw-TS package per [ADR-0011](0011-monorepo-packaging-jit-packages-cross-package-boundary.md) §1), consumed by **both** apps. Forge (brand #1) — its token values and logo — **relocates out of `apps/admin` into `@gym/brand`**, so it is defined **once** (retiring the token duplication and making the logo's stale "this file is in the UI kit" comment true). Phase 2 ships two brand modules: `forge`, `red`. The boundary gains **`@gym/brand ✗→ @gym/data`** and **`@gym/brand ✗→ @gym/domain`** (ADR-0008's brand rule, realized per ADR-0011 §6) — brand is presentation-only; `@gym/brand` may consume the pure `@gym/format` leaf and be consumed by `@gym/ui`/apps. No `packages/config` (ADR-0011 §7 defers it); the host-map lives where it is consumed.

### 5. The static registry is a labelled Phase-3 stub

`HOST_TO_BRAND` and the brand registry are a **temporary in-code stub** for the Phase-3 `gym`-row lookup, behind `resolveBrandId`'s `(host, override)` shape (it becomes `async`, and its bare `BrandId` return grows to carry tenant + module once the keyspaces split — see Forward-looking). *Amended 2026-07-02 (Phase-3 grill):* the swap **relocates, not rewrites in place** — a DB lookup inside `@gym/brand` is illegal (the `brand ✗→ data/domain` cruiser edge is frozen), so resolution moves to a server-only async `resolveTenant(host, override)` in `@gym/data` returning the gym row's `{id, slug, brand_module_id}` with the same host-wins precedence; `resolve-brand-id.ts` and `host-map.ts` are **deleted** (an injected-lookup wrapper in `@gym/brand` would be a single-implementation pass-through), leaving `@gym/brand` as registry + modules only. The proxy stamps **`x-gym`** (tenant slug — presentation/UX only, never authz, the ADR-0008 hinge) alongside **`x-brand`** (= the gym row's `brand_module_id`). An unknown host with no valid `?gym=` override resolves **no tenant** — chrome falls back to the default brand, and tenant-requiring writes (registration) refuse rather than silently defaulting to Forge. Map keys are production hostnames **== future `gym_domain(gym_id, hostname, app)` rows** (a gym needs ≥2 hosts — admin + client, as this map already shows — so hostnames are a table, not a column). Phase 2 is zero-schema: no `gym` table, no RLS change, no brand DB read. The "against the shared Supabase" exit criterion is met **only** by the `@gym/data` client factory **instantiating** in `apps/client` with the shared `NEXT_PUBLIC_SUPABASE_*` — instantiation, no query.

### 6. Override param is `?gym=`

The override is **`?gym=`** (tenant-addressed), forward-honest to the Phase-3 model where it names a gym slug (in Phase 2 the tenant keyspace equals the brand enum, so it costs nothing today). It reaffirms ADR-0008: **host/override resolves presentation only, never authorization.**

## Considered and rejected

- **`x-forwarded-host` parsing** — equals `host` on Vercel, weaker/spoofable off it; zero upside. Read `host`.
- **A `VERCEL_ENV` / env-policy gate on the override** — the host-wins ordering encodes the same protection for free (override is inert on every mapped prod host).
- **A `NEXT_PUBLIC_DEFAULT_BRAND` env-default arm** — speculative; `'forge'` is hardcoded; per-env default config is added only when a second default exists.
- **A `BrandSource` / `BrandProvider` interface + DI** — single implementation this phase; the plain function *is* the seam (a one-caller interface fails the phase's elegance gate).
- **A brand React context / `useBrand()` / theme-provider** — moves resolution client-side and reintroduces FOUC.
- **A `BrandModule<T>` generic + preset registry** — Phase 2 ships two concrete brands; a generic with two callers is premature abstraction.
- **An `<html style={vars}>` inline-style payload** — breaks class-based dark mode (inline specificity beats `.dark{}`); use `<style>` injection.
- **`normalizeHost()` / `tokensToCss()` extracted utils with one caller** — inlined (`host.split(':')[0].toLowerCase()`; Phase-2 stores pre-serialized css).
- **`packages/config` for the host map** — ADR-0011 §7 defers it.
- **Per-gym env vars / Supabase-project-per-gym / deploy-per-gym** — forbidden by ADR-0008 (cited, not re-decided).
- **Enumerating tenant domains in `serverActions.allowedOrigins`** — unnecessary (`Origin == Host` natively per custom domain) and unmaintainable at scale.

## Consequences

- **Brand is CODE; per-gym personalization is DATA — this is the thousands-scale mechanism.** A brand module is a small, enumerable *code* artifact (baseline tokens + logo + at most one bespoke animation hook, e.g. RED's login sequence) that grows **only** when a gym needs bespoke *code*. Per-gym palette/logo/copy becomes **data** on the `gym` row (Phase 3). So thousands of generic gyms share one default module with **zero code**; a personalized gym is the same module + a small token-override map in its row; a genuinely-bespoke gym ships one module, reused thereafter. Onboarding a gym stays a **config act** (INSERT `gym` row + point a domain), never a deploy — exactly as ADR-0008 requires.
- **Admin changes, behaviour-preserved.** Adopting the symmetric seam touches `apps/admin` (proxy + layout + token/logo relocation), a deliberate deviation from Phase 2's "admin re-deploys unchanged" framing. Its rendered output is **identical** (behaviour-preserving); the product owner chose symmetry so both apps prove the shared brand package and admin's *seam* is Phase-4-ready with a one-row change (the admin *shell* still hardcodes Forge — title, toaster, two lockups, login animation — and is de-branded in Phase 4). The per-commit gate (lint + typecheck + test + build) and the docs/boundary shields must stay green through the relocation.
- Reading host/headers makes brand-resolved routes **dynamic** — expected, not a regression.
- Acceptance for riskiest-assumption #3 ("no FOUC") is **observable, not asserted**: tokens are SSR-inlined (no client flash) and the per-brand bundle-size delta is recorded in the slice.

## Forward-looking (Phase 3+)

- Swap the static host-map for a `gym`/`gym_domain` lookup (sync → async). **Tenant slug and brand-module id are distinct keyspaces joined via the gym row** — many gyms share one module, so the resolver returns the tenant, from which the module + token-override DATA derive; the `x-brand` header semantics, the registry type, and the layout index change with it (more than a one-line ripple).
- `?gym=` then names an arbitrary tenant slug (persisted raw, **validated in the resolver**).
- `brand.css` is serialized from `module-baseline vars ⊕ gym-row token DATA`, **zod-validated before serialization** (guards the `dangerouslySetInnerHTML`).
- A hot host→id cache may move to Vercel Edge Config.
- A neutral **`base`/`default`** brand module for the thousands of generic gyms is introduced then; Phase 2 lets `'forge'` double as the default.

## What a future reader must not undo

- **Host/override is never an authorization input** (ADR-0008 hinge). The moment a policy trusts it, the shared-DB isolation guarantee is gone.
- Do not reintroduce `middleware.ts`; `proxy.ts` is Node-only (ADR-0001/0008).
- Do not push a tenant secret into `NEXT_PUBLIC_*` — the Supabase URL/anon-key are identical for every tenant (ADR-0008).
- Do not replace the `<style>` injection with an `<html style>` inline payload — it breaks class-based dark mode.
- Keep `resolveBrandId` a **pure function over values**; do not wrap it in a single-implementation interface.
