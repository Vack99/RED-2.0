# Slice 6.4 — Contacto page + contact_message intake — Implementation Plan

> **For agentic workers:** executed inline by the shipping subagent (no sub-dispatch). Steps use checkbox syntax.

**Goal:** A public Contacto page (map/address/hours/direct-channels/form) reading gym data anonymously, backed by a new `contact_message` intake (Turnstile + per-IP limit) and a minimal admin read (list + mark-read).

**Architecture:** Two new gym-scoped tables. `gym_contact` (1:1, curated/showcased RLS class + anon SELECT) holds address/coords/channels/hours as the public contact data. `contact_message` is a public-intake table whose ONLY write path is a `SECURITY DEFINER` RPC `enviar_mensaje_contacto` (resolves gym by slug, validates, enforces a per-IP hourly limit that requires reading past the staff-only RLS, inserts); staff read + staff mark-read via RLS. The client `/contacto` page mirrors `precios` (token Tailwind, anon marketing DAL). Turnstile is verified in the server action before the RPC. Admin surfaces messages as a Cuenta sheet.

**Tech Stack:** Next 16 (RSC + client islands), Supabase/Postgres migrations + the repo denial-suite harness (scratch project via `SUPABASE_TARGET_REF`), zod, Cloudflare Turnstile (test keys in dev/test), vitest.

## Global Constraints

- LIVE DB IS READ-ONLY. Migrations ship as files; every migration + its RLS suite is verified on a THROWAWAY SCRATCH project (create + delete it). Regenerate `packages/data/src/database.types.ts` from the scratch schema. `get_advisors` after each policy/function migration. NEVER destructive SQL. `rls_auto_enable` stays on.
- ADR-0001 (server-only DAL, injectable client, getClaims not getSession, RLS-as-boundary), ADR-0002 (derived-not-stored: store lat/lng, derive coords label + maps URL), ADR-0005 (atomic-write RPC posture; the DEFINER exception here is documented), ADR-0012 (host→gym; `x-gym` is UX only — the RPC resolves the gym by slug and the action re-resolves from host, never trusting a client gym id), ADR-0013 (RLS-by-membership: `is_member_of`/`is_staff_of`, `(select helper(gym_id))` initplan idiom, index every gym_id).
- Design source of truth: mock `data-slot="contacto"`. Channels render as REAL links (wa.me / mailto / instagram.com / maps), no toast stubs. Paint is token-driven (mirror `precios.tsx`), no brand import.
- Turnstile: env keys; use the documented always-pass TEST sitekey `1x00000000000000000000AA` / secret `1x0000000000000000000000000000000AA` in dev/tests. Production keys are the owner's post-queue step.
- es-MX domain vocabulary. No `husky` with an argument. Pre-commit runs `pnpm lint && pnpm typecheck && pnpm test`.

---

### Task 1: Scratch project + migration files (`gym_contact`, `contact_message` + RPC) verified RED→GREEN

**Files:**
- Create: `supabase/migrations/20260706170000_create_gym_contact.sql`
- Create: `supabase/migrations/20260706170100_create_contact_message.sql`
- Create: `supabase/migrations/20260706170200_seed_red_demo_contact.sql`
- Create: `supabase/tests/contact_intake.sql`
- Modify: `supabase/tests/anon_catalog_read.sql` (add `gym_contact` to the allowlist + a seeded row + positive anon read)
- Modify: `supabase/tests/run-denial-suite.mjs` (register `contact_intake.sql`)

**Interfaces:**
- Produces: table `public.gym_contact(gym_id pk, address_line, address_note, latitude numeric, longitude numeric, whatsapp, email, instagram, hours jsonb, updated_at)`; table `public.contact_message(id, gym_id, nombre, correo, mensaje, ip, read_at, created_at)`; function `public.enviar_mensaje_contacto(p_gym_slug text, p_nombre text, p_correo text, p_mensaje text, p_ip text) returns void` (EXECUTE to anon).

- [ ] **Step 1 (RED test first):** Write `contact_intake.sql` — self-asserting BEGIN/ROLLBACK, gyms looked up by slug (forge=A, red=B), auth users minted with `gen_random_uuid()`. Assert: (a) anon calling `enviar_mensaje_contacto('forge',…)` lands exactly one row (verified as the connecting role); (b) after `c_limit` rows for one ip, the RPC RAISEs `rate limit`; (c) direct anon INSERT into contact_message is denied; (d) anon SELECT on contact_message = 0; (e) member_a SELECT = 0; (f) staff_a SELECT = its gym's rows, staff_a UPDATE read_at hits 1 row; (g) staff_b (gym B) SELECT of gym A rows = 0 and mark-read update hits 0; (h) gym_contact: member_a reads, member_a write denied, staff_b cross-tenant read/write denied, anon reads. Also register it in the SUITE array and add `gym_contact` to `anon_catalog_read.sql`'s expected allowlist + seed a `gym_contact` row + assert anon reads it.
- [ ] **Step 2:** Create a throwaway free scratch project via the Management API (token from MAIN `apps/admin/.env.local`). Record its ref as `SUPABASE_TARGET_REF`.
- [ ] **Step 3 (verify RED):** Apply the BASE STACK migrations (all files up to and including #50's) to the scratch via `apply-sql.mjs`, then run `contact_intake.sql` — expect FAIL (tables/RPC don't exist). Record the error as RED evidence.
- [ ] **Step 4 (GREEN):** Write the three migration files. `gym_contact`: curated/showcased class replayed from `gym_content` (member select `is_member_of`, staff insert/update/delete `is_staff_of`) + `anon select using(true)` (contact data is public marketing surface). `contact_message`: RLS enabled, staff SELECT + staff UPDATE only, NO anon/member SELECT, NO INSERT policy (writes only via the DEFINER RPC — a raw anon INSERT would bypass captcha + rate limit, defeating the abuse posture); indexes on `(gym_id)` and `(gym_id, ip, created_at)`. RPC: `SECURITY DEFINER`, `SET search_path TO ''`, schema-qualified names, resolves gym by slug, validates lengths + email regex, per-IP hourly limit `>= 5` RAISEs, inserts; `revoke all from public` + `grant execute to anon`. Seed: guarded/idempotent red-demo contact row (mock values: Av. de la Fragua 124…, coords 25.6866/-100.3161, whatsapp `528112345678`, email + instagram RED-appropriate, hours 05:30–22:00 Lun–Sáb + Domingo cerrado), no-op unless red-demo gym exists.
- [ ] **Step 5:** Apply the three migrations to scratch (`apply-sql.mjs`). Re-run `contact_intake.sql` + `anon_catalog_read.sql` → GREEN. Run the FULL denial suite (`SUPABASE_TARGET_REF=<scratch> pnpm test:denial`) → all green (regression). `get_advisors` on scratch → no new security warnings on the new objects.
- [ ] **Step 6:** Regenerate `packages/data/src/database.types.ts` from the scratch schema (MCP `generate_typescript_types` against the scratch ref, or Management API). Commit migrations + tests + regenerated types.

### Task 2: Marketing DAL reader `getContacto` (anon) + admin DAL `mensajes` (staff)

**Files:**
- Modify: `packages/data/src/server/marketing.ts` (add `ContactoDTO`, `HorarioDTO`, `getContacto`)
- Test: `packages/data/src/server/marketing.test.ts` (extend)
- Create: `packages/data/src/server/mensajes.ts`
- Test: `packages/data/src/server/mensajes.test.ts`

**Interfaces:**
- Produces: `getContacto(gymId, client=anon): Promise<ContactoDTO | null>` — maps `gym_contact` row → `{ addressLine, addressNote, latitude, longitude, whatsapp, email, instagram, horarios: HorarioDTO[] }`, scoped `.eq('gym_id', gymId)`, best-effort null. `HorarioDTO = { day: string; opens: string | null; closes: string | null; closed: boolean }`.
- Produces: `listMensajes(client?): Promise<MensajeDTO[]>` (staff, RLS-scoped, newest first) where `MensajeDTO = { id, nombre, correo, mensaje, leido: boolean, createdAt: string }`; `marcarLeido(raw, client?): Promise<void>` (zod `{id:uuid}`, requireOperator, sets `read_at=now()`, throws "Mensaje no encontrado" on 0 rows).

- [ ] **Step 1 (RED):** Extend `marketing.test.ts` with a `getContacto` case (chain-recording fake) asserting row→DTO mapping, hours jsonb → `HorarioDTO[]`, gym-scoping `.eq('gym_id',…)`, and null on missing row. Create `mensajes.test.ts` asserting `listMensajes` maps rows (`read_at` → `leido` boolean) and `marcarLeido` parses + updates + throws on not-found (fake client).
- [ ] **Step 2:** Run tests → FAIL (functions undefined).
- [ ] **Step 3 (GREEN):** Implement `getContacto` in `marketing.ts` (mirror `getFaqsPublicas` posture: `cache`, anon client default, `.eq('gym_id')`, defensive hours map). Implement `mensajes.ts` (mirror `faqs.ts`: `listMensajes` read + `marcarLeido` write with `requireOperator`, zod, RLS-trusted scoping).
- [ ] **Step 4:** Run tests → PASS. `pnpm typecheck`.
- [ ] **Step 5:** Commit.

### Task 3: Turnstile verify helper + `/contacto` server action

**Files:**
- Create: `apps/client/src/app/contacto/actions.ts`
- Create: `apps/client/src/lib/turnstile.ts` (`verificarTurnstile`)
- Test: `apps/client/src/lib/turnstile.test.ts`
- Modify: `apps/client/.env.example` (add the two Turnstile vars)

**Interfaces:**
- Produces: `verificarTurnstile(token: string | null, ip: string | null, opts?: { secret?; fetchImpl? }): Promise<boolean>` — POSTs to Cloudflare siteverify, returns `success`. Consumes test secret from `TURNSTILE_SECRET_KEY` (default `1x0000000000000000000000000000000AA`).
- Produces: `enviarContactoAction(prev, formData): Promise<ContactoActionState>` where state = `{ status: "idle" } | { status: "error"; error } | { status: "invalid"; fields: {nombre?;correo?;mensaje?} } | { status: "success" }`. Re-resolves gym from host via `resolveTenant`; verifies Turnstile; reads ip from `x-forwarded-for`; calls the RPC over `createAnonClient()`; maps `rate limit`/`no encontrado` to friendly `error`.

- [ ] **Step 1 (RED):** `turnstile.test.ts` — with a fake fetch returning `{success:true}`/`{success:false}` assert the helper returns the boolean and posts secret+token+remoteip; returns false on a null token without fetching.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3 (GREEN):** Implement `verificarTurnstile`, then `enviarContactoAction` (zod-validate nombre≥2/correo email/mensaje≥4 → `invalid` with field flags; Turnstile fail → `error`; RPC error → `error`). Use `createAnonClient().rpc('enviar_mensaje_contacto', {...})`.
- [ ] **Step 4:** Run → PASS. `pnpm typecheck`.
- [ ] **Step 5:** Commit.

### Task 4: `/contacto` page + client form island (mock-faithful)

**Files:**
- Create: `apps/client/src/app/contacto/page.tsx` (RSC — reads gym + contacto, renders map/address/hours/channels, mounts the form island)
- Create: `apps/client/src/app/contacto/_components/contacto-form.tsx` (client — Turnstile widget + `useActionState`)
- Create: `apps/client/src/app/contacto/_components/map-block.tsx` (stylized map + coords + open-in-maps, pure presentation)

**Interfaces:**
- Consumes: `getMarketingGym`, `getContacto` (Task 2); `enviarContactoAction`, `ContactoActionState` (Task 3).

- [ ] **Step 1:** Build `page.tsx` mirroring `precios.tsx` (token Tailwind, `headers().get('x-gym')` → gym → `getContacto`). Sections: hero eyebrow (`Contacto · {brandName}`) + lede; "Dónde entrenamos" map block + address + "Abrir en mapas"; "Horario" table from `horarios` (Cerrado styling when `closed`); "Contacto directo" rows as real links (WhatsApp `https://wa.me/<digits>`, email `mailto:`, Instagram `https://instagram.com/<handle>` — each rendered only when its value exists); the form island; closing CTA to `/precios` + `/registro`. Graceful empty states when contacto is null/partial.
- [ ] **Step 2:** `map-block.tsx` — stylized token-painted map with the pin + `latitude/longitude` coords label + an `<a>` "Abrir en mapas" to `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` (or address fallback), `target="_blank" rel="noopener"`.
- [ ] **Step 3:** `contacto-form.tsx` — `"use client"`, `useActionState(enviarContactoAction)`, native `<form action>`, nombre/correo/mensaje fields with per-field invalid messages from state, the Turnstile widget (`next/script` load of `https://challenges.cloudflare.com/turnstile/v0/api.js` + a `.cf-turnstile` div with `NEXT_PUBLIC_TURNSTILE_SITE_KEY` default test sitekey; the widget injects `cf-turnstile-response`), success message on `status:"success"`, disabled/pending button.
- [ ] **Step 4:** `pnpm lint && pnpm typecheck` → 0. `verify`: drive `/contacto` against the scratch or a local run (render, submit happy path lands a row, rate-limit path shows the friendly error).
- [ ] **Step 5:** Commit.

### Task 5: Admin read surface — Mensajes sheet in Cuenta (list + mark-read)

**Files:**
- Create: `apps/admin/src/app/(app)/cuenta/_components/mensajes-sheet.tsx`
- Modify: `apps/admin/src/app/(app)/cuenta/actions.ts` (add `marcarMensajeLeidoAction`)
- Modify: `apps/admin/src/app/(app)/cuenta/_components/cuenta.tsx` (add a MENSAJES ajustes row + sheet + `mensajes` prop)
- Modify: `apps/admin/src/app/(app)/cuenta/page.tsx` (fetch `listMensajes`, pass down)

**Interfaces:**
- Consumes: `listMensajes`, `marcarLeido`, `MensajeDTO` (Task 2).

- [ ] **Step 1:** Add `marcarMensajeLeidoAction(raw): Promise<void>` → `marcarLeido(raw)` in cuenta/actions.ts.
- [ ] **Step 2:** `mensajes-sheet.tsx` (mirror `GymContentSheet` chrome): list of messages (nombre, correo, mensaje, relative/date, unread dot), a "Marcar como leído" button per unread row calling the action + `router.refresh()`; empty state.
- [ ] **Step 3:** In `cuenta.tsx` add a `mensajes: MensajeDTO[]` prop, an AJUSTES row `MENSAJES` (sub = `N sin leer` / `Sin mensajes`) opening the sheet; wire the sheet. In `page.tsx` add `listMensajes()` to the `Promise.all` and pass `mensajes`.
- [ ] **Step 4:** `pnpm lint && pnpm typecheck && pnpm test` → 0. `verify`: admin Cuenta → Mensajes lists the seeded/scratch row and mark-read flips it.
- [ ] **Step 6:** Delete the scratch project. Final `keep-it-lean` pass. Commit.

## Self-Review

- Spec coverage: anon submit + row lands + reads denied (Task 1 SQL + Task 3 action); captcha + per-IP limit (Task 1 RPC + Task 3 Turnstile); operator reads messages (Task 5); contact details from gym data (Tasks 1,2,4); pre-commit green (every task). ✓
- The "anon INSERT" RLS-class phrasing is honored as "anon causes inserts via the guarded DEFINER RPC" — a raw anon INSERT policy is deliberately absent because it would bypass the captcha + per-IP limit the abuse posture mandates. Documented in the migration + handoff.
- Types consistent: `ContactoDTO`/`HorarioDTO`/`MensajeDTO`/`ContactoActionState` names stable across tasks.
