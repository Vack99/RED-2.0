# Issue 2 — Auth: single-operator login + first authed read (perfil on cuenta)

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** HITL · **Labels:** `hitl`
> **Status:** ✅ Done — branch `feat/supabase-infra-perfil` @ `f7b823f` (2026-05-29). Auth user + env provisioned by operator; gate verified headless (logged-out /cuenta·/·/inicio → 307 /login). In-browser login verification pending.

## What to build

Turn on authentication and prove the full stack end-to-end with the simplest real
read. A human provisions the single-operator Supabase auth user and the runtime env
keys; the slice builds the login route, completes the `proxy.ts` route gate
(authorize with `getClaims()`, never `getSession()`), inserts the operator's **perfil**
row (`negocio = "FORGE"`), and renders the real perfil identity on **cuenta** plus the
brand in root metadata. Demoable: logging in shows the real FORGE profile; logged-out
visitors are redirected to login.

**HITL** because a human must create the Supabase auth user, set the runtime env keys,
and confirm the verify-at-implementation `@supabase/ssr` auth shapes.

## Acceptance criteria

- [ ] Single-operator Supabase auth user created (human); `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + project URL set in the runtime env (human).
- [ ] `(auth)/login` route signs the operator in via the browser Supabase client; bad credentials are rejected.
- [ ] `proxy.ts` refreshes the session and gates `(app)` routes; unauthenticated requests redirect to login; authorization uses `getClaims()`/`getUser()`, never `getSession()`.
- [ ] The operator's perfil row exists (`negocio = "FORGE"`); **cuenta** renders the real perfil identity via the DAL (no `SEED_PERFIL`); root layout metadata uses the stored brand.
- [ ] Demo (logged in): cuenta shows the real FORGE identity. Demo (logged out): redirected to login.
- [ ] `pnpm lint` + `pnpm test` + `pnpm build` green.

## Blocked by

#1 — needs the Supabase clients, perfil table + RLS, and proxy scaffolding.
