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

Layout: `apps/{admin,client}` (two Next.js apps) + `packages/{domain,format,data,ui,brand}`
(brand-neutral `@gym/*`, shipped as raw-TypeScript JIT packages — ADR-0011 §1). Both apps
run one shared host→inquilino→marca seam (`@gym/data`'s `resolveTenant` → `x-gym` + `x-brand`; ADR-0012).
The boundary — the pure/server tiers `@gym/domain` + `@gym/format` + `@gym/data`
✗→ the UI kit `@gym/ui` + the apps `apps/*` (plus `@gym/ui` ✗→ `@gym/data`, and
`@gym/brand` ✗→ `@gym/data` + `@gym/domain`) — is enforced by `.dependency-cruiser.cjs`
and runs on every commit (`pnpm lint`).

**Hooks:** the pre-commit hook (Husky v9) runs `pnpm lint && pnpm typecheck && pnpm test`. Never run `husky`
with an argument (e.g. `husky --version`) — v9 treats the argument as the hooks
path and corrupts git's `core.hooksPath`. `pnpm install` (the `prepare` script)
sets it correctly to `.husky/_`.

# Database RPC contract tests (the `test:denial` gate)

The 34 `public` functions (18 `SECURITY DEFINER`, the whole write rail: `registrar_venta`,
`reclamar_o_crear_cliente`, `reclamar_por_codigo`, `reservar_clase`, `preparar_invitacion`, …) are
invisible to vitest — `packages/data` mocks the RPC boundary, so a function that drops a column,
stamps the wrong `gym_id`, or forgets `where auth_user_id is null` passes all of `pnpm test`. #78
shipped exactly this way (the create path dropped the verified `email`). Their real contract is
proven by the self-asserting SQL suites in `supabase/tests/`, driven by `pnpm test:denial`
(`run-denial-suite.mjs`), which each seed transaction-local fixtures, `RAISE` on failure, and roll back.

**The rule (enforced by convention, not a hook):** a migration that changes what an RPC *writes*
ships in the same change with a suite assertion on the *written rows* — not just on the return value
or on which row is touched. An RPC's return value is not its contract; the rows it writes are (#78,
#80). Assert `email`/`gym_id`/consent-stamps/balances that the write sets, and the membership rows it
upserts.

**Wiring is machine-guarded, running is not.** `tools/guards/denial-suite-drift.test.ts` (in the
normal `pnpm test` gate) fails if any `*.sql` in `supabase/tests/` is in neither the runner's `SUITE`
(runs) nor its `QUARANTINE` (parked, with a reason) — so a new suite can't be orphaned silently
(Gap 1 of #80). But `test:denial` itself is **not** in CI or pre-commit, and deliberately so: it needs
a `SUPABASE_ACCESS_TOKEN` and a throwaway scratch project (preview branching is Pro-gated / 402; the
free tier fits exactly one scratch beside live), which pre-commit can't provide. **The gate is
therefore a documented pre-merge convention: any migration-bearing change runs `pnpm test:denial`
green against a scratch project** (`SUPABASE_TARGET_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=<pat>
pnpm test:denial`) **before it fast-forwards to `main`.** The runner refuses the live ref. This is the
same Live-DB contract the phase goal-files require before/after DDL slices.
