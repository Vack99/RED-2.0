# RED-2.0 — Architecture Map

**Read this first.** This is a **pnpm + Turborepo monorepo** for a multi-tenant gym
platform (es-MX). One Next.js app today — `apps/admin`, the single-operator gym admin
(brand #1: Forge) — built from four brand-neutral `@gym/*` packages. The folders
scream the domain; this page is the map. Mechanism decisions live in
`docs/adr/0011-monorepo-packaging-jit-packages-cross-package-boundary.md`; the target
platform shape in `docs/adr/0008-platform-multitenant-gym-rls-brand-modules.md`.

## You are here → start reading
1. `CONTEXT.md` — the vocabulary (every domain noun → a type + a file).
2. `packages/domain/src/` — the business rules (pure, tested). How the gym works.
3. `apps/admin/src/app/(app)/` — the screens, one folder per sector.
4. `packages/data/src/server/` — the data seam (Supabase via a `server-only` DAL; ADR-0001).
5. `docs/adr/` — why the structure is the way it is.

## Packages & app (the homes — ADR-0011 §4)
| Package / app | Holds | May import (internal) |
|---|---|---|
| `@gym/domain` | pure gym rules + types (`rules.ts`, `types.ts`); innermost leaf | — (nothing) |
| `@gym/format` | es-MX / America-Chihuahua formatters (`date.ts`, `fecha.ts`, `format.ts`); pure leaf | — (nothing) |
| `@gym/data` | the `server-only` Supabase DAL + `export/` + browser client + `database.types`; subpath exports `./server/*` ÷ `./client` ÷ `.` | `@gym/domain`, `@gym/format` |
| `@gym/ui` | the forge primitive kit + UI-runtime utils (`motion`, `utils`/`cn`, `viewport`) | `@gym/domain`, `@gym/format` |
| `apps/admin` | app routes, `proxy.ts`, app-only utils (`auth`, `nav`, `swipe`), brand token values, Next-root config, `.env*`, `public/`, `globals.css` | all of the above |

The `@gym/*` packages are **Just-in-Time**: they ship raw TypeScript (their `exports`
point at `./src/*.ts`, no build step) and the app lists them in `transpilePackages`,
so Next compiles them in its own boundary (ADR-0011 §1). This is load-bearing for the
`server-only` poison-pill — do not add a build step / `dist/` to a package.

## Sectors (live in `apps/admin/src/app/(app)/<sector>`)
| Sector | Folder | Job |
|---|---|---|
| inicio | `inicio` | Dashboard / home metrics |
| asistencia | `asistencia` | Pase de lista (attendance) |
| clientes | `clientes` | Roster + ficha (`clientes/[id]`) |
| vender | `vender` | Venta + recibo (sell/renew) |
| cuenta | `cuenta` | Perfil + ajustes + respaldo |

No screen imports another screen's `_components`; cross-sector composition happens at the route.

## The dependency boundary (enforced)
The crown jewel survives the move into packages as **one root cross-package rule**
(`.dependency-cruiser.cjs`, run in `pnpm lint` on every commit + in CI):

- **`@gym/domain` + `@gym/format` + `@gym/data` ✗→ `@gym/ui` + `apps/*`** — the pure/server tiers never import presentation or an app.
- **`@gym/domain` ✗→ `@gym/format` / `@gym/data`**, and **`@gym/format` ✗→ everything internal** — leaves stay leaves; the only intra-core edge is `@gym/data → {domain, format}`.
- **`@gym/ui` ✗→ `@gym/data` + `apps/*`** — the UI kit may reach the pure leaves only.
- Plus `no-circular` + `no-orphans`.

pnpm's isolated linker backstops it: a package may import only what its own
`package.json` declares. The server seam has three guards (ADR-0011 §6): the
`server-only` poison-pill on every `./server` DAL module, the `./server` ÷ `./client`
export split, and `@gym/ui ✗→ @gym/data` (dependency-cruiser can't see `'use client'`,
so an ESLint rule keeps client → `@gym/data/server` imports type-only).

## Where do I add X?
- A business rule (how the gym works) → `packages/domain/src/rules.ts` (+ a test in `rules.test.ts`).
- A new screen/page → `apps/admin/src/app/(app)/<sector>/page.tsx` (+ `_components/`).
- A reusable visual primitive → `packages/ui/src/forge/`.
- A persisted entity / query → `packages/data/src/server/` (the `server-only` seam) + add its subpath to `@gym/data`'s `exports` allow-list.
- A browser-side Supabase need → `@gym/data/client` (no `server-only`).
- A pure es-MX formatting / date helper → `packages/format/src/`.
- A locked decision → a new `docs/adr/NNNN-*.md`.
