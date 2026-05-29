# ADR-0001 — Supabase + RLS, no ORM

**Status:** Accepted — 2026-05-29

## Context
Forge holds a single gym's private client data, operated by one person. The
stack is locked: Next.js 16 + Supabase. We need a security model and a data
shape that a solo dev (and AI agents) can audit easily.

## Decision
- Use **Supabase** for DB + auth. **RLS is the primary security boundary** —
  every table gets RLS enabled with policies keyed to `(select auth.uid())`.
- **No ORM.** Use `supabase-js` directly inside a `server-only` Data Access
  Layer (`src/lib/data/<sector>.ts`) that returns DTOs and calls `src/domain`
  rules. The DAL is the single place every DB touch lives (auditable).
- Auth via **`@supabase/ssr`** httpOnly cookie sessions; route-gating in
  **`proxy.ts`** — Next 16 renamed `middleware.ts` → `proxy.ts` (Node runtime
  only). Do not reintroduce `middleware.ts`.
- Authorize inside server code with `getClaims()` / `getUser()`, never
  `getSession()`.

## Consequences
- Reads happen in Server Components via the DAL; writes via thin Server Actions
  that re-auth, validate (Zod), and delegate to the DAL.
- Supabase is **not installed yet**: the exact client/cookie/auth API shapes
  (`createBrowserClient`/`createServerClient`, `getAll`/`setAll`) are
  verify-at-implementation, confirmed against `@supabase/ssr` when added.
- The cookie adapter must implement only `getAll`/`setAll` (not get/set/remove).
