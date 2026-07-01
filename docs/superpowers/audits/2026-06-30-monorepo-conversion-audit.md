# Monorepo conversion audit + hardening — 2026-06-30

Audit of the Phase-1 monorepo conversion (ADR-0011), plus the shields landed in
response. Branch: `harden/monorepo-audit-2026-06-30`.

## Method

A background Workflow fanned out **5 audit lanes** — two skill-guided
(`turborepo-RED`, `typescript-advanced-types-RED`, both activated **inside** the
subagents) plus ADR-conformance, server-seam, and hygiene — over **42 agents**.
Every finding passed a fresh **adversarial-verification** agent that tried to
refute it before it survived: **36 raw → 26 verified (10 refuted) → 20 ranked**.
The full quality gate was run independently for empirical ground truth.

## Verdict

The conversion is **structurally sound and behaviour-preserving**. The single
enforced cross-package boundary is live and correct (depcruise green), the
`server-only` pill is intact on all DAL modules, the catalog pins shared
React/Next/zod, and all gates pass. **No P0, no live defect, no secret-leak path**
(only the publishable/anon key ships). The debt was **silent drift + latent
traps** — exactly the class a single future edit trips.

Two shapes: (1) the agent-facing contract (`ARCHITECTURE.md`, `CONTEXT.md`,
`AGENTS.md`, auto-injected via `CLAUDE.md → @AGENTS.md`) still described the
deleted `src/` layout and an inverted boundary; `README.md` was stock
create-next-app. (2) Several load-bearing invariants rested on convention, not
machine checks.

## Findings (ranked, verified)

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | P1 | `ARCHITECTURE.md`/`CONTEXT.md`/`AGENTS.md` map the deleted `src/` layout + inverted boundary (auto-injected every agent turn) | **fixed** (rewritten) + docs-as-tests guard |
| 2 | P2 | `@gym/data` `./server/*` wildcard re-exposes test files + the supabase fake as client entry points | **fixed** (explicit allow-list) + no-wildcard test |
| 3 | P2 | `export/workbook.ts` imports Node-only exceljs but lacked `server-only`, reachable on the public surface | **fixed** (pill added) + coverage test |
| 4 | P2 | turbo `lint`/`test`/`typecheck` tasks are dead no-ops (false-green trap) | **fixed** (deleted) + turbo-task guard |
| 5 | P2 | `README.md` is the create-next-app default (npm/yarn/bun, app/page.tsx) | **fixed** (rewritten) + docs guard |
| 6 | P2 | Stranded root `.env.local` — Next won't load it; fresh `pnpm dev` has no creds | **fixed** (moved to apps/admin) + .env.example note |
| 7 | P3 | No guard kept client→`@gym/data/server` imports type-only (pill-less derive/plantilla-ctx) | **fixed** (ESLint seam rule) + exhaustiveness guard |
| 8 | P3 | `build` declared no `.env*` inputs → stale-cache risk on local builds | **fixed** (per-app turbo.json) |
| 9 | P3 | `@gym/format` missing `"type":"module"` | **fixed** + manifest guard |
| 10 | P3 | Phantom dep: domain/ui import vitest undeclared | **fixed** (declared) + depcruise npm-no-pkg rule |
| 11 | P3 | `@supabase/ssr`, `@types/*`, next-themes, sonner off-catalog (divergence risk) | **fixed** (catalogued) + manifest guard |
| 12 | P3 | Entity IDs are bare `string` — clienteId/paqueteId/userId mutually assignable | **fixed** (branded ids at the crearVenta swap site) |
| 13 | P3 | Routes/nav untyped, typedRoutes off → renamed route 404s at runtime | **fixed** (typedRoutes on) |
| 14 | P3 | `pnpm typecheck` doesn't see App-Router route types (typegen absent) | documented (build is the authoritative route gate) |
| 15 | P3 | `eslint-config-next` not lockstepped to catalog `next` | **fixed** (manifest guard asserts equality) |
| 16 | P3 | `AGENTS.md` understated pre-commit as `pnpm lint` | **fixed** + docs guard |
| 17 | P3 | ADR/depcruise comment claimed zod is `@gym/domain`'s dep (it isn't) | **fixed** (comment + ADR table corrected) |
| 18 | P3 | `server-only` written inconsistently (quote/semicolon) | mooted (coverage test matches the parsed specifier, AST-style) |
| 19 | P3 | CI runs all gates with no turbo cache / `--affected` | deferred (see below) |
| 20 | P3 | Dead create-next-app SVGs invisible to no-orphans | **fixed** (deleted) + public-asset guard |

Refuted/de-scoped by verification (examples): the "silent false-green" was
corrected P1→P2 (gates **do** run today); `export/rows.ts` is the ADR-sanctioned
pure carve-out and correctly pill-less.

## Decisions (HITL)

- **Turbo gates** → minimal guard (delete dead tasks + machine check), not a full per-package migration.
- **Server exports** → explicit allow-list, not a `./server` barrel.
- **Type shields** → all three (typedRoutes + branded ids + TabBar nav-as-props).
- **Execution** → on a branch, gate after each wave, review before commit.

## Shields now machine-enforced

- **`server-only` coverage** — `packages/data/src/server/server-only-coverage.test.ts`: every runtime `./server` module begins with the pill (pure carve-outs exempt; matches the parsed specifier so quote-drift can't fool it).
- **Exports allow-list** — `@gym/data` lists only real entry points; `tools/guards/manifests.test.ts` fails on any `./server/*` wildcard.
- **Client→server seam** — `eslint.config.mjs` forbids value imports of `@gym/data/server` from client components (type-only allowed); `tools/guards/client-seam.test.ts` keeps the scope exhaustive vs the real `'use client'` set.
- **Phantom deps** — `.dependency-cruiser.cjs` `no-undeclared-npm-deps` (`npm-no-pkg`).
- **Manifest/catalog consistency** — `tools/guards/manifests.test.ts`: ESM+private packages, shared libs are `catalog:`, `eslint-config-next === catalog next`.
- **Turbo tasks** — `tools/guards/turbo.test.ts`: every non-root task has an implementing workspace script.
- **Docs honesty** — `tools/guards/docs.test.ts`: cited paths exist, no `src/domain|lib|components`, real pre-commit string, no create-next-app README.
- **Public assets** — `tools/guards/public-assets.test.ts`: no orphaned files under `public/`.
- **Build cache correctness** — `apps/admin/turbo.json`: `.env*` in build inputs.
- **Typed routes** — `next.config.ts` `typedRoutes: true` (route typos are build errors).
- **Branded ids** — `@gym/domain/ids` (`ClienteId`/`PaqueteId`), kind-checked at the `crearVenta` swap site (a cliente↔paquete swap is a compile error — verified).

## Deferred (with rationale)

- **Broad branded-id adoption across all DTOs.** Today's DAL uses inline `.eq("id", string)` calls, so branding the DTO fields alone would add mint-casts everywhere with **no** swap enforcement. Meaningful coverage needs the Phase-3 typed fetch-helper refactor (where the audit itself said it pays off). The foundation + the one proven swap site are in now.
- **Full per-package turbo task graph + remote cache + `--affected`.** Premature for one app + four leaf packages; revisit when `apps/client` + `packages/brand` land. The false-green trap is already closed by the minimal guard.
- **`next typegen` before the standalone `pnpm typecheck`.** `next build` remains the authoritative route-type gate.

## Gate (final, all green)

`pnpm install --frozen-lockfile` · `typecheck` · `lint` (depcruise + eslint) ·
`test` (31 files / 304 tests) · `build` — all exit 0.
