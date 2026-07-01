<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architecture

This repo is a **pnpm + Turborepo monorepo** with a **sector-first** app.
**Read `ARCHITECTURE.md` first** — it is the map (the package layout, the enforced
cross-package dependency boundary, and "where do I add X?"). Domain vocabulary is
in `CONTEXT.md`; locked decisions are in `docs/adr/` — the monorepo packaging
mechanism is `docs/adr/0011-monorepo-packaging-jit-packages-cross-package-boundary.md`.

Layout: `apps/admin` (the Next.js app) + `packages/{domain,format,data,ui}`
(brand-neutral `@gym/*`, shipped as raw-TypeScript JIT packages — ADR-0011 §1).
The boundary — the pure/server tiers `@gym/domain` + `@gym/format` + `@gym/data`
✗→ the UI kit `@gym/ui` + the apps `apps/*` (and `@gym/ui` ✗→ `@gym/data`) — is
enforced by `.dependency-cruiser.cjs` and runs on every commit (`pnpm lint`).

**Hooks:** the pre-commit hook (Husky v9) runs `pnpm lint && pnpm typecheck && pnpm test`. Never run `husky`
with an argument (e.g. `husky --version`) — v9 treats the argument as the hooks
path and corrupts git's `core.hooksPath`. `pnpm install` (the `prepare` script)
sets it correctly to `.husky/_`.
