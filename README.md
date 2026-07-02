# RED-2.0

A multi-tenant gym platform (es-MX), built as a **pnpm + Turborepo monorepo**.

## Layout
- `apps/admin` — the Next.js 16 single-operator gym admin app.
- `apps/client` — the Next.js 16 socio (member) panel.
- `packages/{domain,format,data,ui,brand}` — brand-neutral `@gym/*` internal packages,
  shipped as raw TypeScript and compiled Just-in-Time by each app
  (`docs/adr/0011-monorepo-packaging-jit-packages-cross-package-boundary.md`).

Both apps run one shared host→inquilino→marca seam — `@gym/data`'s `resolveTenant`
picks the gym by host (the DB-backed `gym_domain → gym` lookup), the proxy stamps
`x-gym` + `x-brand`, and the layout SSR-inlines the `@gym/brand` module's tokens
(`docs/adr/0012-host-brand-resolution.md`).

See **`ARCHITECTURE.md`** for the map, **`CONTEXT.md`** for the domain vocabulary,
and **`docs/adr/`** for the locked decisions.

## Develop
This repo is **pnpm-only** — the `packageManager` field is pinned and `workspace:*`
deps will not resolve under npm / yarn / bun. Node is pinned in `.nvmrc`.

```bash
pnpm install        # install deps + wire the Husky hooks
pnpm dev            # turbo run dev — both apps (admin + client)
pnpm build          # production build
pnpm lint           # eslint + the dependency-cruiser boundary check
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest
```

The app reads Supabase env from `apps/admin/.env.local` (copy
`apps/admin/.env.example` and fill in the publishable key). An env file at the repo
root is **not** loaded — Next reads `.env` from the app directory.

## Quality gate
The pre-commit hook runs `pnpm lint && pnpm typecheck && pnpm test`; CI additionally
runs `pnpm build`. The cross-package dependency boundary is machine-enforced on every
commit and in CI.
