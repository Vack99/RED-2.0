# ADR-0011 — Monorepo packaging: JIT internal packages, brand-neutral scope, one cross-package dependency boundary

**Status:** Accepted · **Date:** 2026-06-29 · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (RLS-as-boundary, no ORM, `server-only` DAL, `proxy.ts`, `getClaims()`/`getUser()`), [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) (Turborepo monorepo + `packages/{domain,data,ui,brand}` target shape; the sector arrow survives the move) · **Realizes:** roadmap **Phase 1** (behaviour-preserving monorepo refactor) in [`docs/planning/2026-06-29-multi-gym-platform-roadmap.md`](../planning/2026-06-29-multi-gym-platform-roadmap.md) · **Informed by:** [`docs/superpowers/specs/2026-06-29-monorepo-member-platform-tenancy-design.md`](../superpowers/specs/2026-06-29-monorepo-member-platform-tenancy-design.md) §8

## Context

[ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) locked the *target shape* — a Turborepo monorepo, `apps/{admin,client}` + `packages/{domain,data,ui,brand}`, with the enforced sector boundary (`src/domain` + `src/lib` ✗→ `src/components` + `src/app`) carried into the package layout. It did **not** decide the *mechanism*: how packages expose their code, what scope names them, where the cross-cutting utilities live, how the single machine-checked boundary is re-expressed across package lines, and how the live Forge app keeps building and **deploying identically** through the move.

Phase 1 is **strictly behaviour-preserving**: stand up the monorepo and relocate today's single Next.js 16 app into `apps/admin`, extracting `packages/{domain,data,ui}` (`brand` is Phase 2/4), with **no schema, feature, or behaviour change**. Forge must build, test, lint, and deploy identically at **every commit** (roadmap exit criteria + Sequencing principle). The defining risk is not "does the new structure work" but "did anything change that we didn't intend." Every decision below is chosen for the **smallest behaviour delta**, and several were stress-tested against the real import graph and the Next 16 / Tailwind v4 / pnpm / Vercel docs before being recorded — a few plausible-sounding alternatives turned out to violate the boundary or silently break the build (see Consequences). This ADR records those mechanism decisions so a future reader does not relitigate them, or "simplify" one and reopen a gap.

## Decision

### 1. Internal packages are Just-in-Time (raw TS, no build step)

Packages ship **raw TypeScript** — `exports` point at `./src/*.ts` — and each consuming app lists them in **`transpilePackages`**, so Next compiles them inside its own boundary. There is **no `tsc`/`tsup` build step** and no `dist/`; `'use client'`/`'use server'`/`next/headers` behave identically to inline code today (the repo already ships untranspiled TS with no build script). This is **load-bearing for security** (§5): the `server-only` poison-pill survives the move *only* because Next bundles the raw source through its own poison-aware pipeline — a *pre-built* package could strip the directive. Compiled packages and TypeScript project references are deferred; promote a single package to Compiled only if app build time later demands it.

### 2. Brand-neutral scope `@gym/*`; packages private, never published

Packages are named under **`@gym/*`** (`@gym/domain`, `@gym/format`, `@gym/data`, `@gym/ui`; app `@gym/admin`) — **not** `@forge/*` (Forge is only gym #1; the core is shared by RED #2 and more — [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md)). The root package is renamed off `forge`. Every package is **`"private": true`** and referenced via **`workspace:*`**. `@scope/` is the package-*naming* spec, **not** a registry directive: pnpm resolves `workspace:*` only from the local workspace and **refuses to fall back to a registry**, and private packages are never published. Nothing in this monorepo contacts npmjs.com; the toolchain is pnpm end-to-end (`pnpm-workspace.yaml`, pnpm **catalog**, `pnpm install`).

### 3. Workspace wiring: catalog-pinned versions, isolated linker kept

`pnpm-workspace.yaml` gains a **`packages:`** key (`apps/*`, `packages/*`) — today it carries only `allowBuilds:`. Shared runtime versions (`react`, `react-dom`, `next`, `typescript`, `zod`, `vitest`) are pinned **once** via a **pnpm catalog** and referenced as `catalog:` everywhere, so the app and `@gym/ui` resolve the **same** React/Next — divergence would mean duplicate-React / hook breakage, the opposite of behaviour-preserving. pnpm's default **isolated linker is kept** (a package imports only what it declares); any phantom-dependency breakage it surfaces is fixed by **declaring the dependency**, never by relaxing hoisting. `@gym/ui` therefore declares `react`/`react-dom`/`next`/`next-themes`/`sonner` as **`peerDependencies`**, and `clsx`/`tailwind-merge` as `dependencies` (alongside the `cn` helper, wherever it lands).

### 4. Package homes — where every sector and cross-cutting util lands

| Package / app | Holds | May import (internal) |
|---|---|---|
| `@gym/domain` | pure gym rules + types (`rules.ts`, `types.ts`) | — (nothing; `zod` only) |
| `@gym/format` | es-MX locale + Chihuahua-tz formatting (`date.ts`, `fecha.ts`, `format.ts`) | — (nothing; pure leaf) |
| `@gym/data` | the whole `server-only` DAL + `export/` + Supabase server/browser clients + `database.types` | `@gym/domain`, `@gym/format` |
| `@gym/ui` | forge primitive kit + UI-runtime utils (`motion.ts`, `utils.ts`/`cn`, `viewport.ts`); token **contract** only | `@gym/domain`, `@gym/format` |
| `apps/admin` | app routes, `proxy.ts`, app-only utils (`auth.ts`, `nav.ts`, `swipe.ts`), all Next-project-root config, `.env*`, `public/`, `globals.css`, `brand.tsx` + token **values** | all of the above |

The genuinely contested call was the **pure es-MX formatters** (`date.ts`, `fecha.ts`, `format.ts`). They are imported by **both** the `server-only` DAL (`derive.ts` builds `pesos(monto)`; `plantilla-ctx.ts` renders WhatsApp `pesos`/*"{n} días"* strings; `ventas.ts` / `export/rows.ts` use `fmtShort`) **and** app screens — so they cannot live in `apps/admin` (a package→app back-edge) and they **cannot** live in `@gym/ui` (that creates a forbidden `data → ui` edge, since `data` consumes them). They are pure (no I/O), so they get a small, **named** pure leaf — **`@gym/format`** — rather than being folded into `@gym/domain` (which stays strictly *gym rules*) or dumped into a vague `shared` junk-drawer. The Phase-2/6 client app renders the same pesos/dates, so the leaf earns its keep immediately. App-only utils with a single consumer (`auth.ts` beside `proxy.ts`; `nav.ts`, `swipe.ts`) stay in `apps/admin` for now; they become `@gym/ui`/`@gym/domain` candidates only when the client app reuses them.

### 5. `@gym/data` exposes the DAL via `./server` ÷ `./client` subpath exports — moved whole

One `@gym/data` package, three subpath exports:

- **`./server`** — `server.ts` (per-request server client; `next/headers` + React `cache`) + all 11 DAL modules + `export/`. **Every one keeps `import 'server-only'`.**
- **`./client`** — the `createBrowserClient` factory (`client.ts`); **no** `server-only`.
- **`.` (root)** — `database.types.ts` (pure generated types; also imported by `apps/admin`'s `proxy.ts`).

The DAL moves **whole** — the spec's staff/member app-local query split is Phase 3, not a Phase-1 refactor. The pure files `derive.ts` / `plantilla-ctx.ts` carry no `server-only` surface but stay in `data` as part of the seam. `@gym/data` owns the `supabase gen types` script; `NEXT_PUBLIC_SUPABASE_*` move to `apps/admin`'s build env.

### 6. The single dependency boundary survives as ONE root cross-package rule

One root **`.dependency-cruiser.cjs`** scans `apps/*` + `packages/*`. The forbidden edges (direct heirs of today's `domain|lib ✗→ components|app`):

- **`@gym/domain`, `@gym/format`, `@gym/data` ✗→ `@gym/ui`, `apps/*`** — the pure/server tiers never import presentation or app.
- **`@gym/domain` ✗→ `@gym/format`, `@gym/data`** and **`@gym/format` ✗→ everything internal** — leaves stay leaves; the only intra-core edge is `data → {domain, format}`.
- **`@gym/ui` ✗→ `@gym/data`, `apps/*`** — `ui` may reach the pure leaves only.

Keep `no-circular` + `no-orphans` (rewrite the orphan `pathNot` to `apps/admin/src/app/**/(page|layout|template|loading|error|not-found|route|default|global-error)` + `apps/admin/proxy.ts`); point `options.tsConfig` at the new `tsconfig.base.json`. This is **backstopped** by pnpm workspace deps (a package imports only what its `package.json` declares).

**A guard the audit proposed that does not exist:** "forbid any *client* module from importing `@gym/data/server`" is **not expressible** in dependency-cruiser — it operates on the static import graph and has no notion of `'use client'`, and `apps/admin` mixes client and server modules in one tree. The three real guards on the server seam are: **(a)** the `server-only` poison-pill on the `./server` entry (build-time, primary); **(b)** the `./server` ÷ `./client` export split, so app *client* code imports `@gym/data/client`; **(c)** the path rule `@gym/ui ✗→ @gym/data`. The symmetric `brand` rule from [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) (`brand` is presentation-only, ✗→ `data`/`domain`) lands when `packages/brand` is created in Phase 2/4.

### 7. Tooling, Tailwind, Vitest, Vercel — the verified specifics

- **Shared config.** A root `tsconfig.base.json` + one root ESLint flat config + one root Vitest config; each package/app **thin-extends** them. A formal `packages/config` is deferred to Phase 2 (when `apps/client` makes it pay for itself).
- **Tailwind v4 (`4.3.0`, CSS-first).** There is **no `tailwind.config` and no `content` array** — v4 auto-detects from the CSS import graph and **ignores `node_modules` / out-of-root files**, so `@gym/ui` is **not** auto-scanned. Register it with an **`@source`** directive in `globals.css` (e.g. `@source "../../../packages/ui/src";`, depth per final layout), **not** a v3-style `content` glob — which a v4 project silently ignores (no `@config` loaded), tree-shaking the UI kit's classes away.
- **Vitest 4.** Monorepo runs use **`test.projects`** in the root config — **not** the `vitest.workspace.ts` file, deprecated since 3.2. The `server-only`→empty-stub alias follows the `@gym/data` project.
- **Vercel.** Per-app **Root Directory = `apps/admin`**. Workspace-root install is **auto-detected** from the single root `pnpm-lock.yaml` + the `pnpm-workspace.yaml` `packages:` key — there is **no "install at root" toggle to set**; the failure mode (`workspace:*` unresolved) appears only when detection is *defeated* (no root lockfile / missing `packages:` key / an Install Command override that `cd`s into the subdir or forces npm). Leave Install Command on auto-detect; set `NEXT_PUBLIC_SUPABASE_*` per Vercel project; declare any other output-affecting env in `turbo.json` (`NEXT_PUBLIC_*` is auto-inferred for Next).

### 8. Migration order — green at every commit

Bottom-up, in small green commits: **(0)** scaffold the workspace (`pnpm-workspace.yaml` globs, `turbo.json`, root base configs, scope rename) with code still under `src/`; **(1)** `@gym/domain`; **(2)** `@gym/format`; **(3)** `@gym/data` (subpath exports + `server-only` travels); **(4)** `@gym/ui` (forge kit + `motion`/`utils`/`viewport`; `brand.tsx` stays in admin); **(5)** `apps/admin` (app + `proxy.ts` + `auth`/`nav`/`swipe` + Next-root config + `.env*` + `public/` + `globals.css`); **(6)** flip `.dependency-cruiser.cjs` to the cross-package rule **and delete the `@/*` alias last**, then verify build/test/lint **and a real Vercel preview deploy**. The `@/*`→workspace-specifier rewrite is the largest mechanical edit; isolating the depcruise flip to the end means the boundary is never half-enforced.

## Consequences

- **The move runs the same code it ran before.** JIT + `transpilePackages` means no build step to misconfigure and no downleveling to shift a server/client boundary; the running source is byte-for-byte today's. The cost is per-build re-transpilation of package source (negligible at this scale, cached by Turborepo).
- **The crown-jewel boundary stays machine-checked across package lines.** One root dependency-cruiser config + pnpm workspace deps is belt-and-suspenders, so "depcruise green" remains a meaningful Phase-1 exit gate. The boundary is *strengthened*, not diluted, by the move.
- **The `server-only` tripwire is preserved — and its limits are documented.** Keeping `import 'server-only'` on the `./server` entry, plus the `./server`÷`./client` split, plus `@gym/ui ✗→ @gym/data`, keeps the server Supabase client out of any client bundle. The risk is real (a DAL module that doesn't touch `next/headers` rests on `server-only` as its *sole* build-time tripwire); the precise harm is server-only code bundled client-side (a build error), not a secret-key leak — this repo ships only the publishable/anon key. Do **not** pre-build `@gym/data`: a transpile that drops the directive removes the tripwire.
- **One extra package (`@gym/format`) is deliberate.** It keeps `@gym/domain` strictly *gym rules* while giving es-MX/tz formatting a cohesive, non-junk-drawer home that `data`, `ui`, and both apps can legally import. `@gym/format`'s `fecha.ts` hardcodes `TZ = 'America/Chihuahua'`; per-tenant timezone is a Phase-3 revisit under [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) and does **not** change its Phase-1 home.
- **Forge deploys identically — if detection is respected.** Root Directory = `apps/admin` + a single root lockfile + the `packages:` key is the whole recipe; the most likely way to break it is *overriding* the auto-detected install command. `NEXT_PUBLIC_*` are build-time inlined per Vercel project (correct — one shared Supabase, [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md)).
- **What a future reader must not undo:**
  - Do **not** add a build step to the internal packages (or pre-compile `@gym/data`) without re-verifying the `server-only` directive survives — JIT is what preserves it.
  - Do **not** rename the scope to a brand (`@forge`/`@red`); it is brand-neutral on purpose (the core is shared). Keep packages `private` + `workspace:*`.
  - Do **not** place any util the **DAL** consumes (the es-MX formatters) into `@gym/ui` — it is a forbidden `data → ui` edge, not merely an awkward home.
  - Do **not** collapse `@gym/data` into a single export that drops the `./server`÷`./client` split, and do **not** strip `import 'server-only'` during any move.
  - Do **not** weaken the one root dependency-cruiser boundary into per-app configs (an app-scoped config can't see `domain ✗→ ui` across package lines), and do **not** rely on a Tailwind v3 `content` glob in this v4 project.
