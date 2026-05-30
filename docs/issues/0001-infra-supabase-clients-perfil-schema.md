# Issue 1 — Infra: Supabase clients, perfil schema + RLS, deps

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`

## What to build

Lay the Supabase foundation so every later slice has clients, a typed schema, and a
session-refresh proxy to build on — without any runtime auth yet. Install the
data-layer dependencies, create the browser + server Supabase client factories per
ADR-0001 (`@supabase/ssr`, cookie adapter implementing **only** `getAll`/`setAll`),
scaffold `proxy.ts` for session refresh (Node runtime; never `middleware.ts`), create
the **perfil** table with RLS, and add a server-only DAL module that returns a perfil
DTO. The authed read can't be exercised until auth lands in the next slice, so this
slice is verified structurally (compiles, lint/test/build green, table + RLS present).

## Acceptance criteria

- [ ] `@supabase/ssr`, `@supabase/supabase-js`, and `zod` installed via **pnpm** (no npm; `allowBuilds` untouched).
- [ ] Browser + server Supabase client factories exist; the cookie adapter implements only `getAll`/`setAll` (not get/set/remove); shapes verified against the installed `@supabase/ssr`.
- [ ] `proxy.ts` scaffolds session refresh (Node runtime); no `middleware.ts` is introduced.
- [ ] `perfil` table created via Supabase MCP `apply_migration` with RLS enabled, policies keyed to `(select auth.uid())`; `get_advisors` (security) reports no missing-RLS issue for perfil.
- [ ] A server-only DAL module returns a perfil DTO (no raw rows cross the boundary).
- [ ] TypeScript DB types generated (`generate_typescript_types`).
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` documented in an env example (value set by a human in #2).
- [ ] `pnpm lint` (incl. dependency-cruiser `domain-data-no-upward-ui`) + `pnpm test` + `pnpm build` all green; nothing under `src/lib/supabase` imports `src/components` or `src/app`.

## Blocked by

None - can start immediately
