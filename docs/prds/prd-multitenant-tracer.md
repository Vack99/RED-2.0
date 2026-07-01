> **Tracked in:** https://github.com/Vack99/RED-2.0/issues/10

# PRD — Multi-tenant tracer: host→brand + `packages/brand` + 2 Vercel deploys (Phase 2, epic)

Prove the multi-tenant bet on a **thin tracer** before any heavy investment: a new
skeleton **`apps/client`** and a minimal **`@gym/brand`** package (two modules:
`forge` + `red`) let **both** apps resolve **host → brand** at runtime in
`proxy.ts` and render brand-correct chrome from **one deployment each**, verified
by **two multi-tenant Vercel projects** against the **one shared Supabase**. This
is an **epic**: `/to-issues` decomposes it into shippable, green-at-every-commit
slices. It realizes roadmap **Phase 2** ("Multi-tenant tracer / de-risker") and is
governed by **ADR-0012** (host→brand resolution) on top of **ADR-0011** (JIT
packaging + cross-package boundary), **ADR-0008** (host resolves brand only, never
authz; presentation-only brand modules; two deploys + one shared DB) and
**ADR-0001** (`proxy.ts` Node-only, `server-only` DAL, `getClaims()`/`getUser()`).
It is **zero-schema**: no `gym` table, no migration, no RLS change (the
tenant/identity model is Phase 3).

## Problem Statement

From the platform developer's perspective: Phase 1 delivered the monorepo —
`apps/admin` plus `packages/{domain,format,data,ui}` — but nothing has yet proven
the platform's riskiest, least-proven claim: **that one deployment can serve many
gyms, resolving the gym by hostname and rendering that gym's brand, with a second
app importing the shared core against the same Supabase.** The roadmap deliberately
pulls this tracer forward (Phase 2) so that if the multi-tenant deploy, the
host→brand seam, or the no-FOUC brand swap fails, we learn it **cheaply now** — not
in Phase 6 after building the 12-screen client app on top of an unproven
foundation.

Concretely, today:
- there is **no second app** — only the *ability* for one to import `@gym/*`; the
  multi-tenant deploy has never been exercised;
- there is **no `@gym/brand`** — the Forge token **values** and logo still live
  inside `apps/admin` (the `@gym/ui` kit consumes the CSS-variable *contract*, but
  the *values* are welded to one app), so a second brand has nowhere to live and
  Forge is defined in exactly one, un-shareable place;
- `apps/admin`'s `proxy.ts` is the Phase-1 auth gate with **no host/brand logic**;
  nothing resolves a gym from a hostname;
- the three riskiest assumptions (host→brand from one deploy; shared Supabase
  reachable from a second app; runtime brand swap with no FOUC) are **unfalsified**.

The danger of the tracer is over-building it: a thin de-risker can quietly grow a
`BrandModule<T>` generic, a `packages/config`, a brand React context, or a
speculative env-gate — none of which the acceptance criteria require, all of which
Phase 3+ would have to unwind.

## Solution

From the platform developer's perspective: ship the **minimum** that falsifies the
three assumptions end-to-end.

- **`@gym/brand`** — a new JIT raw-TS package (ADR-0011 §1) consumed by **both**
  apps. Forge (brand #1) — its token **values** and logo — **relocates out of
  `apps/admin` into `@gym/brand`**, defined **once**. RED (brand #2) is a second
  module: tokens + logo + **one** bespoke login animation (exercising the
  code-preset path so we prove more than a palette swap). The package also owns the
  **static `HOST_TO_BRAND` registry** (production hostnames == the future
  `gym.hostname` column) including `*.localhost` entries (`forge.localhost`,
  `red.localhost`) so dev hits the real host arm with **zero DNS**. `@gym/brand`
  may consume the pure `@gym/format` leaf; it may be consumed by `@gym/ui`/apps; it
  **must not** reach `@gym/data` or `@gym/domain`.

- **One pure resolver, run identically in both apps.** `resolveBrandId(host,
  override): BrandId` is a **pure function over values** (mirrors the existing
  `decideRedirect`) — the TDD target, failing test first. Precedence, host-wins:
  **known host-map › `?gym=` override (query or `gym` cookie, if it names a known
  brand) › `DEFAULT_BRAND` ('forge')**. Both apps run the **identical** seam in
  their own `proxy.ts`: read **`host`** (never `x-forwarded-host`) + `?gym=` +
  cookie → `resolveBrandId` → stamp **`x-brand`** on the request + persist a fresh
  `?gym` cookie. The **only** per-deploy difference is host-map **data** (admin
  serves `{forge}`, client serves `{forge, red}`). Host wins, so on a real mapped
  customer domain the override is **structurally inert** — a Forge customer cannot
  `?gym=red` themselves into RED chrome.

- **No FOUC, no second layer.** The root layout reads `x-brand` (via `await
  headers()`, a dynamic render accepted per ADR-0008) and **SSR-injects the
  resolved brand's `:root` + `.dark` token block as a dark-safe `<style>`** in
  `<head>`; each app's `globals.css` **drops its raw `:root` token block** so the
  injected block is the sole definer. This fills the **existing `@gym/ui`
  CSS-variable contract** — every primitive re-colors with **zero component
  edits**, no theme-provider, no client context. A `<style>` block (not `<html
  style={vars}>`) is required so inline specificity does not silently kill
  class-based dark mode.

- **Shared-Supabase proof = instantiation only.** The `@gym/data` client **factory
  instantiates** in `apps/client` with the shared `NEXT_PUBLIC_SUPABASE_*`. That
  is the whole "against the shared Supabase" exit signal for Phase 2 —
  **instantiation, no table/policy/query/anon-read**.

- **The boundary grows two edges, and its admin-locked guards generalize.**
  `.dependency-cruiser.cjs` gains **`@gym/brand ✗→ @gym/data`** and **`@gym/brand
  ✗→ @gym/domain`** (ADR-0011 §6). The Phase-1 guards that are currently
  hardcoded to `apps/admin` — the `no-orphans` entry-point regex and the
  `manifests` / `turbo` / `client-seam` / `public-assets` guard arrays in
  `tools/guards/` — are **generalized to cover `apps/*` + `packages/*`** so
  `apps/client` and `packages/brand` are not silently unguarded. **All Phase-1
  shields stay green; lint + typecheck + test + build exit 0 at every commit.**

- **Admin changes, behaviour-preserved (product-owner-approved deviation).**
  Adopting the symmetric seam touches `apps/admin` (proxy + layout + token/logo
  relocation). Its rendered output is **identical** (behaviour-preserving). This
  deliberately deviates from the kickoff's "admin re-deploys unchanged" framing:
  the product owner chose symmetry so **both** apps prove the shared brand package
  and admin is Phase-4-ready (RED-admin) with a **one-row host-map change**.

- **Two Vercel deploys close the loop.** A single terminal **HITL** slice
  provisions the 2nd Vercel project (Root Directory `apps/client`, auto-detected
  workspace install), sets `NEXT_PUBLIC_SUPABASE_*` per project (same shared
  Supabase), assigns the forge/red hosts, and verifies each domain renders its
  brand. Every **mechanism** slice before it is AFK `ready-for-agent`, including a
  **full local proof** of host→brand via `*.localhost` + `?gym=` override +
  SSR-inline no-FOUC + a **recorded bundle-size delta**.

## User Stories

### The de-risk goal (the three riskiest assumptions become observable)
1. As the **platform developer**, I want a Forge host to render Forge chrome and a RED host to render RED chrome, each from **one deployment per app**, so that "host→brand from a single multi-tenant deployment" (assumption #1) is proven, not assumed.
2. As the **platform developer**, I want the `@gym/data` client factory to **instantiate** in `apps/client` against the shared `NEXT_PUBLIC_SUPABASE_*`, so that "a second app reaches the one shared Supabase" (assumption #2, Phase-2 slice) is proven — instantiation only, no query.
3. As the **platform developer**, I want the resolved brand's tokens **SSR-inlined** so there is **no client-side flash**, so that "runtime brand swap with no FOUC" (assumption #3) is **observable, not asserted**.
4. As the **platform developer**, I want the **per-brand bundle-size delta recorded** in the tracer, so that "acceptable bundle cost" (assumption #3) is a measured number, not a hand-wave.
5. As the **platform developer**, I want the tracer to falsify these in a **unit test + a full local run** before the live deploy, so that a failure is caught cheaply — not in Phase 6.

### `@gym/brand` package + Forge relocation
6. As the **platform developer**, I want a new `@gym/brand` JIT raw-TS package consumed by **both** apps, so that brand is one shared, boundary-checked home.
7. As the **platform developer**, I want the Forge token **values** and logo **relocated out of `apps/admin` into `@gym/brand`**, so that Forge is defined **once** and the logo's stale "this file is in the UI kit" comment becomes true.
8. As the **platform developer**, I want a `red` brand module — tokens + logo + **one** bespoke login animation — so that the tracer exercises the code-preset path, not just a palette swap.
9. As the **platform developer**, I want a **static `HOST_TO_BRAND` registry** in `@gym/brand` (keys == future `gym.hostname`), consumed by both apps through the one seam, so that it is a view-only, safely-deletable Phase-3 stub — not a new `packages/config`, not hostname-parsing duplicated per app.
10. As the **platform developer**, I want `*.localhost` host-map entries (`forge.localhost`, `red.localhost`), so that dev exercises the **real host arm** with zero DNS.
11. As the **platform developer**, I want the brand type to stay a thin **two-implementation registry** (tokens + logo + at most one animation hook), so that no `BrandModule<T>` generic and no second theming layer creep in — the existing `@gym/ui` CSS-var contract already **is** the DIP seam.

### The `resolveBrandId` seam (pure, shared, TDD)
12. As the **platform developer**, I want `resolveBrandId(host, override)` as a **pure function over values** (the TDD target, failing test first), so that host→brand is falsifiable in a unit test before any deploy.
13. As the **platform developer**, I want **host-wins precedence** (known host-map › `?gym=` override › `DEFAULT_BRAND` 'forge'), so that a mapped customer domain makes the override **structurally inert** (no `?gym=red` self-rebrand) without an env-gate branch.
14. As the **platform developer**, I want the resolver to read **`host`** (never `x-forwarded-host`), so that the seam is not the more-spoofable header off-Vercel and equals `host` on Vercel anyway.
15. As the **platform developer**, I want the override to be **`?gym=`** (persisted to a `gym` cookie), so that it is forward-honest to the Phase-3 tenant-slug model and reaffirms ADR-0008 (host/override selects presentation, never authorization).
16. As the **platform developer**, I want **both apps** to run the identical seam with the per-deploy difference being **host-map data only** (`{forge}` vs `{forge,red}`), so that Phase-4 RED-admin is a one-row change with zero mechanism change.
17. As the **platform developer**, I want `resolveBrandId` to stamp **`x-brand`** on the request once at the proxy (not per RSC subtree), so that resolution mirrors the future single edge/DB lookup.

### No-FOUC brand rendering
18. As the **platform developer**, I want the root layout to read `x-brand` and **SSR-inject the brand's `:root` + `.dark` token block as a dark-safe `<style>`**, so that the correct brand paints on first byte with no client flash.
19. As the **platform developer**, I want each app's `globals.css` to **drop its raw `:root` token block**, so that the injected block is the sole definer and there is no cascade fight.
20. As the **platform developer**, I want the injection to be a `<style>` block (not `<html style={vars}>`), so that inline custom-property specificity does not silently kill class-based dark mode.
21. As the **platform developer**, I want the swap to fill the **existing `@gym/ui` CSS-variable contract with zero component edits**, so that no theme-provider or client brand context is introduced (either would reintroduce the FOUC).

### `apps/client` skeleton + shared-Supabase proof
22. As the **platform developer**, I want a new skeleton `apps/client` with **one trivial branded page**, so that host→brand is proven on a real second app without building the Phase-6 client journey.
23. As the **platform developer**, I want `apps/client/proxy.ts` to run the shared seam (`host` + `?gym=` + cookie → `resolveBrandId` → `x-brand` + cookie), so that the client deployment resolves brand identically to admin.
24. As the **platform developer**, I want the `@gym/data` client factory to **instantiate** in `apps/client` with the shared `NEXT_PUBLIC_SUPABASE_*`, so that the shared-DB reachability is proven — instantiation only, no table/policy/query.

### `apps/admin` symmetric adoption (behaviour-preserving deviation)
25. As the **gym operator**, I want the Forge admin app to render **identically** after it adopts the shared seam, so that the symmetry change is invisible to me.
26. As the **platform developer**, I want `apps/admin` to adopt the same `proxy.ts` seam + SSR-inline layout + relocated tokens/logo (host-map `{forge}`), so that **both** apps prove the shared brand package and admin is Phase-4-ready with a one-row change.
27. As the **platform developer**, I want admin's render to stay **behaviour-preserving** through the relocation, so that the deviation from "admin re-deploys unchanged" costs no operator-visible change.

### Boundary + shields
28. As the **platform developer**, I want `.dependency-cruiser.cjs` to gain **`@gym/brand ✗→ @gym/data`** and **`@gym/brand ✗→ @gym/domain`** edges, so that brand stays presentation-only (ADR-0008 realized per ADR-0011 §6).
29. As the **platform developer**, I want the Phase-1 admin-locked guards — the `no-orphans` entry-point regex + the `manifests`/`turbo`/`client-seam`/`public-assets` guard arrays — **generalized to `apps/*` + `packages/*`**, so that `apps/client` and `packages/brand` are not silently unguarded.
30. As the **platform developer**, I want **all Phase-1 shields to stay green** (boundary, every `tools/guards/`, catalog, `server-only`) with **lint + typecheck + test + build exit 0 at every commit**, so that the tracer never leaves the repo half-enforced.
31. As the **platform developer**, I want `@gym/*` package names unchanged and **no build step / `dist/`** added, so that the JIT raw-TS packaging (ADR-0011) is preserved.

### Docs (updated only once the new paths exist)
32. As the **platform developer**, I want the execution agent to update **ARCHITECTURE.md + AGENTS.md + CONTEXT.md + README.md** once `apps/client` + `packages/brand` exist, so that the docs describe the real tree.
33. As the **platform developer**, I want **`tools/guards/docs.test.ts` to stay green** through those doc updates, so that the docs-guard shield is honored (updating docs before the paths exist would break it — so the docs land **with** the code, not in this PRD/issues/goal stage).

### Deploy verification (the single HITL exit)
34. As the **platform developer**, I want a **2nd Vercel project** (Root Directory `apps/client`, auto-detected workspace install — install command not overridden), so that `workspace:*` deps resolve and the client deploy matches the admin pattern.
35. As the **platform developer**, I want `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set **per project** (same shared Supabase), so that both deploys reach the one database.
36. As the **platform developer**, I want the **forge and red hosts/domains assigned** so each resolves its brand, so that the live deploy confirms what the unit test + local run already proved.
37. As the **platform developer**, I want the AFK agent to **not** do Vercel provisioning, so that exactly one irreducible HITL slice (owner's Vercel account/domains/env) exists — mirroring Phase-1's single `hitl` slice (#9).

## Implementation Decisions

All decisions are recorded in **ADR-0012** (adversarially verified against the
vendored Next 16.2.6 docs + current Vercel docs, not memory). Summary:

- **One pure resolver, host-wins, no environment coupling** — `resolveBrandId(host,
  override): BrandId`, precedence *known host-map (incl. `*.localhost`) › `?gym=`
  override (query or `gym` cookie, if a known brand) › `DEFAULT_BRAND` ('forge')*.
  Identical ordering across dev/preview/prod — the environment changes the
  **inputs**, never the code path. A plain function over values (mirrors
  `decideRedirect`); the TDD target. (ADR-0012 §1.)
- **Both apps run the identical seam; per-deploy difference is host-map data** —
  each `proxy.ts` reads **`host`** (never `x-forwarded-host`) + `?gym=` + `gym`
  cookie → `resolveBrandId` → stamps **`x-brand`** + persists `?gym`. Resolution
  happens **once at the proxy**. Admin's map = `{forge}`; client's = `{forge,
  red}`. (ADR-0012 §2.)
- **SSR-inlined tokens via a dark-safe `<style>`** — layout reads `x-brand` (via
  `await headers()`, dynamic render) and injects the resolved `:root` + `.dark`
  block; each `globals.css` drops its raw `:root` block. Fills the existing
  `@gym/ui` CSS-var contract, **zero component edits**, no provider/context. A
  `<style>` block, **never** `<html style={vars}>` (would kill class-based dark
  mode). (ADR-0012 §3.)
- **Brand lives in `@gym/brand`, consumed by both apps; Forge defined once** — JIT
  raw-TS package (ADR-0011 §1). Forge tokens+logo relocate out of `apps/admin`.
  Two modules ship: `forge`, `red` (red adds one bespoke login animation). New
  boundary edges **`@gym/brand ✗→ @gym/data`** and **`@gym/brand ✗→ @gym/domain`**;
  `@gym/brand` may consume `@gym/format` and be consumed by `@gym/ui`/apps. **No
  `packages/config`** (ADR-0011 §7 defers it); the host-map lives where it is
  consumed. (ADR-0012 §4.)
- **The static registry is a labelled Phase-3 stub** — `HOST_TO_BRAND` + the brand
  registry are a temporary in-code stub for the Phase-3 `gym`-row lookup, behind
  the unchanged `resolveBrandId` signature (which later becomes `async` — a
  one-line ripple; the call site already `await`s `headers()`). Map keys == the
  future `gym.hostname` column. The "against the shared Supabase" exit is met
  **only** by the `@gym/data` client factory **instantiating** in `apps/client`
  with the shared `NEXT_PUBLIC_SUPABASE_*` — instantiation, no query. (ADR-0012 §5.)
- **Override param is `?gym=`** — tenant-addressed, forward-honest to the Phase-3
  slug model; reaffirms ADR-0008 (host/override resolves presentation only, never
  authorization). (ADR-0012 §6.)
- **Boundary guards generalize** — the Phase-1 admin-locked `no-orphans`
  entry-point regex + the `manifests`/`turbo`/`client-seam`/`public-assets` guard
  arrays in `tools/guards/` generalize to `apps/*` + `packages/*` so `apps/client`
  + `packages/brand` are guarded, not silently exempt.
- **Admin changes, behaviour-preserved (owner-approved deviation)** — `apps/admin`
  adopts the symmetric seam (proxy + layout + token/logo relocation); rendered
  output is **identical**. The product owner chose symmetry over the kickoff's
  "admin re-deploys unchanged" so both apps prove the shared package and admin is
  Phase-4-ready with a one-row host-map change. The per-commit gate and the
  docs/boundary shields stay green through the relocation. (ADR-0012 Consequences.)
- **Explicitly rejected (do not reintroduce)** — `x-forwarded-host` parsing; a
  `VERCEL_ENV`/env-policy gate on the override; a `NEXT_PUBLIC_DEFAULT_BRAND` arm;
  a `BrandSource`/`BrandProvider` interface + DI; a brand React context /
  `useBrand()` / theme-provider; a `BrandModule<T>` generic; an `<html
  style={vars}>` inline payload; `normalizeHost()`/`tokensToCss()` one-caller
  utils; `packages/config` for the host-map. (ADR-0012 "Considered and rejected".)

### Design principles

This phase is a thin tracer. YAGNI and KISS dominate every elegance call: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared'/base Module that has a single caller in this phase — 'DRY' and 'SOLID' do not justify structure the acceptance criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception (an abstraction introduced with a concrete, present cross-slice need — e.g. an extraction whose second consumer exists in THIS phase) must be named explicitly in this section with its present-need justification; unnamed single-caller abstraction is a gate failure.

**Named present-need exception (the one abstraction the acceptance criteria
require):** `@gym/brand` and the shared `resolveBrandId` seam are extracted with a
**concrete second consumer in THIS phase** — `apps/admin` **and** `apps/client`
both consume the identical package and seam (User Stories 6, 16, 23, 26). This is
not speculative reuse: the second caller exists in Phase 2. Everything else stays
inline (host normalization, token serialization, the host-map object).

## Testing Decisions

- **The pure resolver is the one real unit test — TDD, failing test first.**
  `resolveBrandId(host, override)` is a plain function over values, so it is the
  single `/tdd` target: write the failing test covering every precedence arm
  (known host-map hit; `*.localhost` hit; `?gym=` override to a known brand;
  `?gym=` to an unknown brand → ignored; host-wins over override on a mapped
  domain; fallthrough to `DEFAULT_BRAND` 'forge') **before** the implementation. It
  mirrors the existing `decideRedirect` unit test — logic-only, no jsdom. The rest
  of the phase is scaffolding, not TDD.
- **A good test asserts external behaviour, not implementation detail.** For the
  resolver: the returned `BrandId` per input tuple. For the boundary: that
  `depcruise` **rejects** the new forbidden edges (`@gym/brand ✗→ @gym/data`,
  `@gym/brand ✗→ @gym/domain`) — a structural test, added to the existing
  cross-package rule set.
- **No-FOUC is proven by observation, not assertion.** The acceptance is (a) brand
  tokens are **SSR-inlined** (present in the initial HTML `<style>`, so no
  client-side flash) **and** (b) the **per-brand bundle-size delta is recorded** in
  the slice. Both are captured in a full **local** run via `*.localhost` + `?gym=`
  before any deploy — so "no FOUC" is falsifiable, not a claim.
- **Keep all Phase-1 shields green.** The existing `tools/guards/*` suite +
  boundary + catalog + `server-only` guards are the regression gate; they must pass
  after generalizing the admin-locked guard arrays to `apps/*` + `packages/*`. The
  per-commit gate stays **lint + typecheck + test + build exit 0**.
- **Prior art** — the repo's `*.test.ts` logic-only suite, the Phase-1
  cross-package `depcruise` regression guard, and `decideRedirect`'s pure-function
  test are the models. **No new feature/behaviour tests for `apps/admin`** — its
  adoption is behaviour-preserving (identical render), so the signal is the
  existing green suite plus the recorded no-FOUC/bundle observation.

## Out of Scope

Everything in Phase 3+ — this is a **zero-schema** tracer:

- **No `gym` table, no migration, no RLS change** — leave the current
  `user_id=auth.uid()` policies untouched; the tenant/identity model is Phase 3.
- **No cross-gym / cross-tenant test** — Phase 3.
- **No member auth / claim-by-match** — Phase 3 (ADR-0009).
- **No DAL staff/member query split** — `@gym/data` stays whole; the split is
  Phase 3.
- **No `packages/config`** — ADR-0011 §7 defers it; the host-map lives in
  `@gym/brand` where it is consumed.
- **No per-tenant timezone** — `@gym/format` keeps `America/Chihuahua`; per-tenant
  tz is a Phase-3 revisit.
- **No Supabase query / table / policy / anon-read** — the shared-DB proof is the
  `@gym/data` factory **instantiating** in `apps/client`, nothing more.
- **No full RED client app** — `apps/client` is a **skeleton with one trivial
  branded page**; the 12-screen member journey is Phase 6.
- **No RED-admin surface** — admin stays Forge-only chrome (host-map `{forge}`);
  RED-admin is Phase 4, reachable by a one-row host-map addition.
- **No full brand system** — Phase 4 owns brand-keyed token sets at scale, the full
  animation set, copy, and `prefers-reduced-motion` coverage; Phase 2 ships two
  modules + one bespoke animation only.
- **No `@gym/*` rename, no build step / `dist/`, no TS project references, no
  Compiled packages** — JIT raw-TS packaging (ADR-0011) is preserved.

## Further Notes

- **Governing decisions:** ADR-0012 (host→brand resolution — the locked design),
  ADR-0011 (JIT packaging + cross-package boundary; §6 brand edges, §7 defers
  `packages/config`), ADR-0008 (host resolves brand only never authz;
  presentation-only brand modules; two deploys + one shared DB), ADR-0001
  (`proxy.ts` Node-only, `server-only` DAL, `getClaims()`/`getUser()` never
  `getSession()`). Roadmap **Phase-2 exit criteria:** "Forge domain renders Forge
  brand, RED domain renders RED brand — each from a single deployment per app,
  against the shared Supabase. Architecture proven end-to-end."

- **The three riskiest assumptions → observable acceptance** (roadmap §"Riskiest
  assumptions"): **(1)** host→brand from one deployment → the resolver unit test +
  the live 2-deploy verify; **(2)** a second app reaches the one shared Supabase →
  the `@gym/data` factory **instantiates** in `apps/client` (Phase-2 slice of the
  broader "shared DB serves both roles" assumption, whose RLS/role half is Phase
  3); **(3)** runtime brand swap with no FOUC + acceptable cost → tokens
  **SSR-inlined** (no client flash) **and** the **per-brand bundle-size delta
  recorded**. If any fails, Phase 2 catches it cheaply.

- **`/to-issues` decomposition target** (thin vertical tracer-bullet slices with a
  Blocked-by DAG; the next pipeline stage owns the final cut — this is guidance,
  not a contract). Initiative label: **`platform-phase2-tracer-2026-07`**. A
  workable order:
  - **S0 — `@gym/brand` scaffold + Forge relocation** — JIT package; `BrandId`;
    brand registry (`forge`, `red` tokens+logo, RED login animation); static
    `HOST_TO_BRAND` map incl. `*.localhost`; pre-serialized token blocks; relocate
    Forge tokens+logo out of `apps/admin`; add the two boundary edges + generalize
    the admin-locked guard arrays.
  - **S1 — `resolveBrandId` pure resolver** — `/tdd`, failing test first;
    host-wins precedence; `?gym=`/cookie override; `DEFAULT_BRAND` 'forge'.
  - **S2 — `apps/client` skeleton** — one trivial branded page; `proxy.ts` seam
    (host-map `{forge,red}`); layout SSR-inlines the token `<style>`; `globals.css`
    without `:root`; `@gym/data` factory instantiation with shared
    `NEXT_PUBLIC_SUPABASE_*`. **Full local proof** (`*.localhost` + `?gym=` +
    SSR-inline no-FOUC + **recorded bundle-size delta**). AFK.
  - **S3 — `apps/admin` symmetric adoption** — same seam (host-map `{forge}`), same
    SSR-inline layout, drop raw `:root`; **behaviour-preserving** (identical
    render).
  - **S4 — docs + shields** — update **ARCHITECTURE.md + AGENTS.md + CONTEXT.md +
    README.md** now that `apps/client` + `packages/brand` exist; keep
    `tools/guards/docs.test.ts` and all Phase-1 shields green.
  - **S5 — Vercel deploy verify (`hitl`)** — the single terminal HITL slice: 2nd
    Vercel project + per-project env + host/domain assignment + verify each domain
    renders its brand. Mirrors Phase-1's `hitl` slice (#9). The AFK agent must not
    provision Vercel.

- **HITL minimization** — every mechanism slice is AFK `ready-for-agent`, including
  the full local host→brand proof; exactly **one** terminal `hitl` slice (live
  2-project Vercel provisioning + deploy verify) is irreducible (owner's Vercel
  account/domains/env).

- **Per-slice skills (wired by `/to-goal` into the goal file):** `/turborepo-RED`
  (load-bearing on every slice touching `turbo.json`/`package.json`/new-package
  wiring); `/tdd` **only** on the pure `resolveBrandId` resolver;
  `superpowers:using-git-worktrees` + `superpowers:verification-before-completion`
  (the latter critical — a live Vercel deploy + green build is the acceptance
  signal, not a claim); `keep-it-lean` (the YAGNI gate). Do **not** invoke
  (cargo-cult for a zero-schema deploy+brand tracer):
  `supabase-postgres-best-practices-RED`, `typescript-advanced-types-RED`,
  `sector-map`, `improve-codebase-architecture`, `to-map`, `setup-pre-commit`,
  `handoff`.

- **Docs-guard timing** — do **not** modify `ARCHITECTURE.md` / `AGENTS.md` /
  `README.md` / `CONTEXT.md` at the PRD/issues/goal stage: citing not-yet-existent
  `apps/client` / `packages/brand` paths would break `tools/guards/docs.test.ts`
  now. Those four docs are updated **during execution** (slice S4), once the code
  lands, keeping `docs.test.ts` green.
