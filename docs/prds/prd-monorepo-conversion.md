> **Tracked in:** https://github.com/Vack99/RED-2.0/issues/1

# PRD — Monorepo conversion: Forge admin → Turborepo (Phase 1, epic)

Convert the single-app **Forge** repo into a **Turborepo** monorepo — the current
app becomes `apps/admin`, and the shared core is extracted to
`packages/{domain, format, data, ui}` — **strictly behaviour-preserving**. This is
an **epic**: `/to-issues` decomposes it into shippable, green-at-every-commit
slices in the order **S0 scaffold → S1 domain → S2 format → S3 data → S4 ui →
S5 apps/admin → S6 boundary cutover + deploy verify**. It realizes roadmap
**Phase 1** and is governed by **ADR-0011** (packaging) on top of **ADR-0008**
(target shape) and **ADR-0001** (RLS-as-boundary, `server-only` DAL, `proxy.ts`).

## Problem Statement

From the platform developer's perspective: Forge is a single Next.js 16 app at the
repo root, with its shared logic living in `src/domain` (pure rules) and `src/lib`
(the `server-only` DAL, Supabase clients, es-MX formatters) behind one
machine-checked sector boundary. The roadmap requires this to become a **2-app,
multi-tenant platform** — an operator **admin** console and a member **client**
app, re-branded per gym — but **a second app cannot import the core today**: it is
welded into one app's `src/` tree under a `@/*` path alias that only resolves
inside that app. There is nowhere for `apps/client` to live, no shared package for
the client app to depend on, and no cross-package way to keep the dependency
boundary honest once code spans more than one app. Until the structure is split,
every later phase (tenant model, brand system, client app) is blocked.

The danger is that restructuring a **live, deployed** app silently changes its
behaviour or breaks its deploy. The operator must notice **nothing**: the same
screens, the same data, the same `proxy.ts` auth gate, the same Vercel deploy.

## Solution

From the platform developer's perspective: the repo becomes a **pnpm-workspace +
Turborepo monorepo**. The Forge app moves intact to **`apps/admin`**; its shared
core is lifted into four **private, brand-neutral `@gym/*` packages** consumed as
raw TypeScript (no build step) via `transpilePackages`:

- **`@gym/domain`** — the pure gym **rules** + types (`vigencia`, `saldo`, clases).
- **`@gym/format`** — es-MX locale + Chihuahua-tz formatting (the **pesos**,
  **fmtShort**, phone/WhatsApp helpers), a pure leaf both `data` and the apps use.
- **`@gym/data`** — the whole `server-only` **DAL** + `export/` + Supabase clients
  + `database.types`, exposed via `./server` ÷ `./client` ÷ root subpath exports.
- **`@gym/ui`** — the Forge primitive kit + UI-runtime utils, brand-neutral
  (consumes the token **contract**; the Forge token **values** stay in the app).

The single enforced dependency boundary survives as **one root cross-package
dependency-cruiser rule**, backstopped by pnpm workspace deps. Forge **builds,
tests, lints, and deploys identically** at every commit — verified by a real
Vercel preview deploy at the end. Still single-tenant, single-brand: this phase
ships **structure only**, no schema or feature change.

## User Stories

### Behaviour & deploy preservation (the operator must see nothing change)
1. As the **gym operator**, I want the Forge admin app to look and behave exactly as before the refactor, so that the restructure is invisible to me.
2. As the **gym operator**, I want every screen (asistencia, clientes, vender, cuenta, inicio) to work identically, so that my daily workflow is uninterrupted.
3. As the **gym operator**, I want my login and the `proxy.ts` auth gate to behave exactly as today, so that access control is unchanged.
4. As the **gym operator**, I want WhatsApp messages, recibos, and exports to render the same es-MX pesos/dates, so that nothing I send my clients drifts.
5. As the **platform developer**, I want Forge to keep deploying on Vercel exactly as today, so that no production behaviour regresses on the first deploy.
6. As the **platform developer**, I want all 268 existing tests to stay green at every commit, so that I have continuous proof behaviour is preserved.

### Workspace & tooling foundation (S0)
7. As the **platform developer**, I want a pnpm workspace with `apps/*` and `packages/*` globs, so that the repo can host multiple apps and shared packages.
8. As the **platform developer**, I want a `turbo.json` task graph (build/lint/test/typecheck), so that work fans out and caches across packages.
9. As the **platform developer**, I want shared runtime versions (react, react-dom, next, typescript, zod, vitest) pinned once via a **pnpm catalog**, so that the app and `@gym/ui` can never resolve a different React.
10. As the **platform developer**, I want root base configs (`tsconfig.base`, root ESLint flat config, root Vitest `projects`) that each package thin-extends, so that tooling stays single-sourced.
11. As the **platform developer**, I want the root package renamed off `forge` to a neutral name, so that the workspace root is not misnamed after one brand.

### `@gym/domain` (S1)
12. As the **platform developer**, I want the pure rules + types extracted to `@gym/domain` with their tests, so that the gym logic is a deep, isolated, framework-free module.
13. As the **platform developer**, I want `@gym/domain` to import nothing internal, so that it stays the dependency-free core every other package can depend on.

### `@gym/format` (S2)
14. As the **platform developer**, I want the es-MX/Chihuahua-tz formatters (`date`, `fecha`, `format`) extracted to a pure `@gym/format` leaf, so that `@gym/domain` stays strictly gym rules and the formatters have a cohesive home.
15. As the **platform developer**, I want `@gym/format` importable by both `@gym/data` and the apps, so that server-rendered strings (WhatsApp, recibos, exports) and screens share one formatter source.
16. As the **platform developer**, I want `@gym/format` to avoid becoming a junk-drawer, so that it stays a focused locale/formatting leaf.

### `@gym/data` (S3)
17. As the **platform developer**, I want the whole `server-only` DAL + `export/` + Supabase clients + `database.types` moved to `@gym/data` unchanged, so that the data seam relocates without a behaviour-changing refactor.
18. As the **platform developer**, I want `@gym/data` to expose `./server` (DAL, `server-only`) and `./client` (browser client) as **separate subpath exports**, so that client code can reach the browser client without dragging `server-only` into a client bundle.
19. As the **platform developer**, I want `database.types` at the package root export, so that `apps/admin`'s `proxy.ts` can import the type without touching the server entry.
20. As the **platform developer**, I want every DAL module to keep its `import 'server-only'`, so that the build-time tripwire that protects the server seam survives the move.
21. As the **platform developer**, I want the Vitest `server-only`→empty stub to follow the `@gym/data` tests, so that the DAL stays unit-testable with the existing `supabase-fake` helper.

### `@gym/ui` (S4)
22. As the **platform developer**, I want the Forge primitive kit + UI-runtime utils (`motion`, `utils`/`cn`, `viewport`) extracted to `@gym/ui`, so that a future client app can reuse the design system.
23. As the **platform developer**, I want `@gym/ui` to declare react/react-dom/next/next-themes/sonner as peer dependencies, so that the isolated pnpm linker resolves them from the consuming app (one React).
24. As the **platform developer**, I want `@gym/ui` to stay **brand-neutral** — consuming token CSS-variable names, never importing the app's `brand.tsx` or token values — so that the Phase-2/4 brand package slots in without surgery.
25. As the **platform developer**, I want `brand.tsx` and the token values to stay in `apps/admin`, so that the contract-vs-values split the brand system depends on is preserved.

### `apps/admin` (S5)
26. As the **platform developer**, I want the app routes, `proxy.ts`, and app-only utils (`auth`, `nav`, `swipe`) relocated to `apps/admin`, so that the app is a workspace member consuming the packages.
27. As the **platform developer**, I want `proxy.ts` kept as the exact Node-only auth gate it is today (no host/tenant logic), so that tenant resolution stays a Phase-2 concern and ADR-0001 holds.
28. As the **platform developer**, I want all Next-project-root config (`next.config`, postcss/Tailwind, `.env*`, `public/`, `globals.css`, favicon) moved into `apps/admin`, so that Next resolves them from the correct project root.
29. As the **platform developer**, I want `transpilePackages` set for `@gym/{domain,format,data,ui}`, so that Next compiles the raw-TS packages inside its own boundary.
30. As the **platform developer**, I want Tailwind v4 to register `@gym/ui` via an `@source` directive in `globals.css`, so that the UI kit's classes are generated and not tree-shaken away.
31. As the **gym operator**, I want `NEXT_PUBLIC_SUPABASE_*` present in the `apps/admin` build env, so that auth keeps working after the move.

### Dependency boundary (cross-package, S6)
32. As the **platform developer**, I want one root dependency-cruiser config scanning `apps/*` + `packages/*`, so that the crown-jewel boundary stays a single machine-checked rule across package lines.
33. As the **platform developer**, I want the forbidden edges enforced (pure/server tiers ✗→ ui/app; `@gym/ui ✗→ @gym/data`; leaves stay leaves), so that the architecture cannot silently erode.
34. As the **platform developer**, I want the boundary backstopped by pnpm workspace deps, so that a package can only import what it declares (belt-and-suspenders).
35. As the **platform developer**, I want the `@/*` alias deleted and every specifier rewritten to workspace package names, so that imports resolve through the workspace, not a per-app alias.
36. As the **platform developer**, I want the boundary flip + alias deletion isolated to the final slice, so that the boundary is never left half-enforced mid-migration.

### Deploy verification (S6 exit)
37. As the **platform developer**, I want the Vercel project's Root Directory set to `apps/admin` with auto-detected workspace install, so that `workspace:*` deps resolve and the deploy matches today.
38. As the **platform developer**, I want a real Vercel **preview deploy** to succeed before calling Phase 1 done, so that "deploys identically" is verified, not assumed.
39. As the **platform developer**, I want a second app to be *able* to import `@gym/{domain,format,data,ui}`, so that Phase 2 (`apps/client`) is unblocked.

## Implementation Decisions

All decisions are recorded in **ADR-0011** (and were adversarially verified against the repo + Next 16 / Tailwind v4 / pnpm / Vercel docs). Summary:

- **JIT internal packages** — packages ship raw TypeScript (no `tsc`/`tsup`, no `dist/`), consumed via `transpilePackages`. This is also what preserves the `server-only` directive through the move; a pre-built package could strip it.
- **Brand-neutral `@gym/*` scope** — `@gym/{domain,format,data,ui}` + app `@gym/admin`; all `"private": true`, referenced via `workspace:*`, **never published** (no registry contact). pnpm end-to-end.
- **Catalog-pinned versions; isolated linker kept** — shared runtime deps pinned once via a pnpm catalog; phantom-dependency breakages are fixed by *declaring* the dep, never by relaxing hoisting.
- **Package homes** — `domain` = pure rules+types; **`format` = the new pure leaf** for es-MX/tz formatters (NOT `ui` — the DAL consumes them, which would be a forbidden `data → ui` edge); `data` = the whole DAL + clients + types; `ui` = the Forge kit + UI-runtime utils, token *contract* only; `apps/admin` = routes, `proxy.ts`, app-only utils, Next-root config, `brand.tsx` + token *values*.
- **`@gym/data` subpath exports** — `./server` (DAL + `server-only`), `./client` (browser client), `.` (root → `database.types`). Moved **whole**; the staff/member query split is Phase 3.
- **One cross-package boundary** — forbidden edges: `{domain, format, data} ✗→ {ui, apps}`; `domain ✗→ {format, data}`, `format ✗→` everything internal (leaves), so the only intra-core edge is `data → {domain, format}`; `ui ✗→ {data, apps}`. Keep `no-circular` + `no-orphans` (rewrite orphan `pathNot` to the relocated app entries + `proxy.ts`); point `options.tsConfig` at `tsconfig.base`. A depcruise rule "no *client* module imports `@gym/data/server`" is **NOT expressible** (depcruise can't read `'use client'`); the real guards are the `server-only` poison-pill + the `./server`÷`./client` split + the `ui ✗→ data` path rule.
- **Tailwind v4 (`4.3.0`, CSS-first)** — register `@gym/ui` sources with an `@source` directive in `globals.css`; a v3 `content` glob silently no-ops in v4.
- **Vitest 4** — monorepo via `test.projects` in the root config, **not** the deprecated `vitest.workspace.ts`.
- **Vercel** — per-app Root Directory = `apps/admin`; workspace-root install is auto-detected from the root lockfile + `pnpm-workspace.yaml` `packages:` key (do not override the install command); `NEXT_PUBLIC_*` set per Vercel project, output-affecting env declared in `turbo.json`.
- **Migration order** — bottom-up, green at every commit: scaffold → domain → format → data → ui → apps/admin → boundary cutover + deploy verify.

## Testing Decisions

- **Behaviour-preservation is the contract.** A good test here asserts *external behaviour is unchanged*, not new behaviour. The primary test signal is that **all 268 existing co-located tests stay green at every commit**, relocated with the module they cover — no new feature tests, because there is no new feature.
- **Modules under test** (already covered, must stay green after relocation): `@gym/domain` (`rules.test`), `@gym/format` (`date.test`, `format.test`), `@gym/data` (DAL tests via the existing `supabase-fake` test-helper; `auth.test`), `@gym/ui` (`motion.test`, `swipe.test`, `viewport.test`, `nav.test` — homed per ADR-0011).
- **One new test — the boundary regression guard.** The cross-package dependency-cruiser run *is* the exit gate: it must **reject** the forbidden edges (`@gym/ui ✗→ @gym/data`, pure/server tiers ✗→ ui/app). Optionally add a smoke check that `@gym/data/client` pulls no `server-only`. This is the only net-new test and it tests external structure, not implementation detail.
- **Prior art** — the repo's existing `*.test.ts` suite (logic-only, no jsdom) and the `supabase-fake` DAL helper are the model; the current pre-commit (`eslint` + `depcruise` + `tsc --noEmit` + `vitest run`) is the green gate, fanned out via `turbo` after the move.

## Out of Scope

- **No schema or migration change** — the database is untouched (tenant/identity model is Phase 3).
- **No feature/behaviour change** — pure restructure; the operator sees nothing change.
- **No multi-tenant / host→tenant resolution** — `proxy.ts` stays the current auth gate; tenant-by-host is Phase 2.
- **No `packages/brand`** — brand modules are Phase 2/4; `brand.tsx` + token values stay in `apps/admin`.
- **No `apps/client`** — only the *ability* for a second app to import the core; the client app is Phase 6.
- **No member auth / claim-by-match** — Phase 3 (ADR-0009).
- **No DAL staff/member query split** — `@gym/data` moves whole; the split is Phase 3.
- **No `packages/config`, no Compiled packages, no TS project references** — deferred until a second app or build-time pressure justifies them (Phase 2+).
- **No per-tenant timezone** — `@gym/format` keeps `America/Chihuahua`; per-tenant tz is a Phase-3 revisit.

## Further Notes

- **Governing decisions:** ADR-0011 (packaging mechanism), ADR-0008 (platform target shape + Turborepo), ADR-0001 (`server-only` DAL, `proxy.ts` not `middleware.ts`, `getClaims()`/`getUser()` never `getSession()`). Roadmap Phase 1 exit criteria: "Forge admin builds, tests, lints, **and deploys identically**; `depcruise` green; a second app *can* import the shared core."
- **`/to-issues` decomposition target:** S0 scaffold → S1 `@gym/domain` → S2 `@gym/format` → S3 `@gym/data` → S4 `@gym/ui` → S5 `apps/admin` → S6 boundary cutover + deploy verify. Each slice is a vertical, green-at-every-commit commit set; S6 is the Phase-1 exit gate.
- **Top behaviour-preservation risks** (carry into the slices): Tailwind `@source` omitted → UI classes vanish; `server-only` stripped or the `./server`÷`./client` split mis-wired; `.env*`/`public/` left at repo root; the `@/*`→specifier rewrite missing an import; the depcruise boundary left half-enforced during the move.
