# Slice #26 — Member self-register + verified-email claim (RPC + unstyled registro/entrar)

> **For agentic workers:** TDD, task-by-task. Steps use `- [ ]`.

**Goal:** End-to-end member self-registration with a verified-email claim: one atomic SECURITY DEFINER RPC (`reclamar_o_crear_cliente`) that claims an unclaimed `cliente` on VERIFIED EMAIL ONLY (else creates), writing `gym_membership(role='member')` in the same transaction; plus deliberately-UNSTYLED `/registro` + `/entrar` pages in `apps/client` calling server actions, with `gym_id` sourced ONLY from the host-resolved tenant.

**Architecture:** SQL RPC (definer, `search_path=''`, revoke public/anon → grant authenticated, `FOR UPDATE` on the claim). It reads the caller's VERIFIED email + name/phone from `auth.users` (metadata) — the only param is server-authoritative `p_gym_id`. Server DAL (`registro.ts`, `sesion.ts`) wraps signUp/claim/login/reset. Client-app routes: `/registro`, `/entrar`, `/restablecer`, `/auth/confirm` (post-verification claim).

**Tech Stack:** Postgres/Supabase, Next 16 (App Router, server actions, route handlers), TypeScript, zod, vitest.

## Global Constraints
- Domain term is **cliente**, not member (CONTEXT.md). RPC named `reclamar_o_crear_cliente` (es-MX, `reclamar` verb).
- Phase-4 fence: NEVER touch `packages/brand/src/brand-id.ts`, `registry.ts`, either `layout.tsx`, or the "@gym/brand registry" describe block.
- Pages are UNSTYLED — structural HTML only, no CSS beyond the minimum, no component kit.
- `gym_id` is server-authoritative: from `resolveTenant(host)` server-side; NEVER a client field / `x-gym` header for authz.
- House RPC posture (ADR-0013): `security definer`, `set search_path = ''`, `revoke execute … from public, anon`, `grant … to authenticated`, schema-qualified refs.
- Claim gated on VERIFIED email (`email_confirmed_at IS NOT NULL`, re-checked in RPC); phone NEVER claims; ambiguous → create.
- Forge green at every commit. Migrations idempotent, additive; do NOT rename shipped migrations.

---

### Task 1: The atomic claim-or-create RPC (SQL-suite TDD)

**Files:**
- Create: `supabase/migrations/20260702180000_reclamar_o_crear_cliente_rpc.sql`
- Create (test-first): `supabase/tests/registro_claim.sql`
- Modify: `supabase/tests/run-denial-suite.mjs` (add `registro_claim.sql` to SUITE)

**RPC contract (Produces):** `public.reclamar_o_crear_cliente(p_gym_id uuid) returns table(cliente_id uuid, reclamado boolean)`. Reads `auth.users.{email,email_confirmed_at,raw_user_meta_data}` for `(select auth.uid())`; unverified → raise. Idempotent (existing own cliente in gym → ensure membership, return). Claim: exactly one unclaimed `cliente` in `p_gym_id` with `lower(email)=lower(caller email)` → `FOR UPDATE`, set `auth_user_id`/`phone_e164`/terms/privacy, `reclamado=true`. Else insert fresh cliente (`user_id=auth.uid()`, `tel`=last-10 of e164, terms/privacy now()). Always insert `gym_membership(uid,gym,'member') on conflict do nothing`.

- [ ] Write `supabase/tests/registro_claim.sql` — BEGIN/ROLLBACK, gen_random_uuid fixtures, eight self-asserting vectors: claim-on-verified-match (balance carried + membership), create-on-no-match, create-on-phone-only, create-on-ambiguous, unverified-rejected, membership-atomicity (temp `NOT VALID` check on `role<>'member'` → RPC raises → assert no cliente persisted), cross-gym-claim-denied, member-scoped-read (own row only via RLS). Final `select 'OK'`.
- [ ] Run it via `execute_sql` against live (transaction-local) → expect FAIL ("function does not exist").
- [ ] Write the migration RPC (house posture + FOR UPDATE + revoke/grant).
- [ ] Apply the RPC transaction-locally + re-run the suite via `execute_sql` (BEGIN … create func … run vectors … ROLLBACK) → expect all vectors green.
- [ ] Add `registro_claim.sql` to `run-denial-suite.mjs` SUITE array.
- [ ] `get_advisors(security)` after → clean (no new function_search_path_mutable / definer warnings).
- [ ] Commit.

### Task 2: Regenerate types + DAL registro/sesion (TS TDD)

**Files:**
- Modify: `packages/data/src/database.types.ts` (regen from live + hand-add the RPC)
- Create: `packages/data/src/server/registro.ts`, `registro.test.ts`
- Create: `packages/data/src/server/sesion.ts`
- Modify: `packages/data/package.json` (exports `./server/registro`, `./server/sesion`)

**Produces:** `registroSchema`, `RegistroInput`, `telefonoAE164(tel10)`, `registrarSocio(raw, opts, client?)`, `reclamarCliente(gymId, client?)`, `iniciarSesion`, `solicitarReset`, `actualizarPassword`.

- [ ] Write `registro.test.ts` — schema accepts a valid payload; rejects short nombre, bad email, non-10-digit phone, unchecked terms; `telefonoAE164('6141112233') === '+526141112233'`.
- [ ] Run → FAIL (module missing).
- [ ] Regenerate `database.types.ts` from live (`generate_typescript_types`), hand-add `reclamar_o_crear_cliente` to Functions. Verify gym_membership + clientes columns now present.
- [ ] Write `registro.ts` (zod + normalization + signUp-with-metadata + rpc call) and `sesion.ts`; add package exports.
- [ ] Run tests → PASS. `pnpm typecheck` green.
- [ ] Commit.

### Task 3: Client-app routes — /registro, /entrar, /restablecer, /auth/confirm

**Files:** under `apps/client/src/app/`: `registro/{page.tsx,actions.ts,_components/registro-form.tsx}`, `entrar/{page.tsx,actions.ts,_components/entrar-form.tsx}`, `restablecer/{page.tsx,actions.ts,_components/restablecer-form.tsx}`, `auth/confirm/route.ts`.

- [ ] `registro/page.tsx`: read `headers()`; unknown host (no `x-gym`) → refusal text; else render form.
- [ ] `registro/actions.ts`: `'use server'`; re-resolve tenant from host (`resolveTenant`), refuse if null; `emailRedirectTo` = `${origin}/auth/confirm`; `registrarSocio`.
- [ ] `auth/confirm/route.ts`: `verifyOtp({token_hash,type})`; on success `resolveTenant(host)` → `reclamarCliente(gymId)` → redirect `/`.
- [ ] `entrar` + `restablecer`: login (`getClaims` posture), forgot-password (`solicitarReset`), update-password (`actualizarPassword`). Unstyled.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.
- [ ] Commit.
