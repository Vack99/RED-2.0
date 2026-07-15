# Current member registration flow — two-email root cause (research asset, 2026-07-14)

Wayfinder research asset. Maps the CURRENT invite → signup → confirm flow end to end, with file refs, to ground the single-email activation redesign.

## A. Current flow (Door 1 — staff registers a paying member)

1. **Admin records sale.** Vender screen → server action `crearVentaAction` (`apps/admin/src/app/(app)/vender/actions.ts:40`).
2. **Sale written.** `crearVenta` (`packages/data/src/server/ventas.ts`) → RPC `registrar_venta`. NEW-client path INSERTs `clientes` row and mints single-use 8-char `claim_code` atomically (`supabase/migrations/20260708200001_registrar_venta_generate_claim_code.sql:47-66`; latest signature `20260711100100_registrar_venta_personalizado.sql`).
3. **EMAIL #1 (invite) auto-sent.** `resolverInvitacion` (`actions.ts:49-56,92-99`) → `enviarInvitacion` (`packages/data/src/server/invitaciones.ts:184`):
   - RPC `preparar_invitacion` returns `{codigo, email, nombre, gym_slug, gym_nombre, gym_id}` (`20260708210000_preparar_invitacion_rpc.sql`).
   - `construirUrlInvitacion` (`invitaciones.ts:89-115`) builds `https://{gym-client-host}/registro?codigo=XXXXXXXX` (fallback host: `?gym={slug}&codigo=`).
   - Copy via `mensajeInvitacion` (`invitaciones.ts:119-153`); sent DIRECTLY via Resend REST (`resendTransport`, `invitaciones.ts:49-80`) — NOT the auth hook.
   - Success stamps `invitacion_enviada_at` via `marcar_invitacion_enviada`. Best-effort, never blocks the sale.
4. **Member opens link** → `apps/client/src/app/registro/page.tsx` — parses `?codigo=`, `invitacion_info(codigo)` RPC renders banner; cross-tenant shield redirects to canonical host (`page.tsx:52-63`).
5. **FULL signup form** (`registro-form.tsx`): name, email, password, phone, terms, Turnstile. Codigo rides as hidden input.
6. **signUp fires EMAIL #2.** `registrarAction` (`apps/client/src/app/registro/actions.ts:27`) → `registrarSocio` (`packages/data/src/server/registro.ts:74`) → `supabase.auth.signUp` (`registro.ts:86-93`) with `emailRedirectTo={origin}/auth/confirm?codigo={codigo}`. Confirm-required → no session → "Revisa tu correo".
7. **Send Email Hook brands EMAIL #2** (`supabase/functions/send-email/index.ts`, `correo.ts:117`): action `signup` → "Confirma tu cuenta", link minted on gym host: `/auth/confirm?codigo=…&token_hash=…&type=email` (`correo.ts:56-62`; `tipoOtp` maps signup→"email" `correo.ts:43-47`). Sent via Resend.
8. **Member clicks EMAIL #2** → `apps/client/src/app/auth/confirm/route.ts`: `?token_hash=&type=` → `confirmarTokenHash`/`verifyOtp` (`route.ts:79-84`; accepted types `email|recovery|email_change`), or PKCE `?code=` arm (`route.ts:73-77`).
9. **Claim.** `finalizarAuth` (`route.ts:33-58`): `?codigo=` → `reclamar_por_codigo` (binds `auth_user_id`, overwrites email with verified, clears `claim_code`, upserts `gym_membership`); else email-match fallback `reclamar_o_crear_cliente`. Redirect `/reservar`. Claim failures swallowed.

Door 2 (pure self-registration, no codigo): steps 5–9, email-match claim, one email (the confirmation).

## B. Why two emails

EMAIL #1 = product invite (claim_code bearer token, Resend direct). EMAIL #2 = Supabase signup confirmation (GoTrue → hook → Resend), fired by `auth.signUp` because the invite link deliberately drops into full self-signup (ADR-0009 mandates email+password self-registration; claim runs only post-verification). Documented as accepted shape in `docs/superpowers/specs/2026-07-08-member-registration-invite-token-design.md:23`. Spam risk on lap 2 loses members.

## C. DB / RPC contract (latest defs)

- `registrar_venta(...)` — INVOKER; NEW path INSERTs clientes + mints claim_code (A-Z2-9, retry-on-collision).
- `preparar_invitacion(p_cliente_id)` — DEFINER, staff-gated; lazily ensures claim_code; sibling `marcar_invitacion_enviada`.
- `invitacion_info(p_codigo)` — DEFINER STABLE, anon+authenticated; returns ONLY `{gym_nombre, gym_slug, cliente_nombre}` (no email — deliberate).
- `reclamar_por_codigo(p_codigo)` — DEFINER; requires `email_confirmed_at`; locks unclaimed row `WHERE claim_code=… AND auth_user_id IS NULL`; sets auth_user_id, overwrites email with verified, fills phone/terms/privacy stamps, clears claim_code, upserts gym_membership(member). **Password-independent.**
- `reclamar_o_crear_cliente(p_gym_id, p_firma)` — DEFINER; HMAC tenant firma (`20260713190000`); email-match or create.
- Tables: `clientes` (nullable auth_user_id/email/claim_code, `invitacion_enviada_at`), `gym_membership`, `ventas`, `gym`/`gym_domain`.

## D. Binding constraints (ADRs)

- **ADR-0015**: claim_code = primary join, single-use, no expiry, cleared on claim; email demoted to contact; host never an authz input; delivery = automatic Resend at sale time, best-effort.
- **ADR-0009**: members self-register email+password only; gym server-resolved; claim only on verified-email session; `auth_user_id` nullable forever. ← the structural reason for the signup+confirm lap; single-email redesign needs an amendment for the invited-member path.
- **ADR-0014 + #75**: one sending domain `no-reply@ibookit.lat`; per-gym branding per-message via Send Email Hook; redirect allowlist host-scoped per gym.
- **ADR-0008**: host→tenant is UX only; RLS keyed to gym_membership is the boundary.

## E. Already half-built toward one-email

1. Send Email Hook `correo.ts` has a generic fallthrough already covering `magiclink`/`invite`/`email` action types (`correo.ts:100-109`); `tipoOtp` maps all non-recovery to `"email"`. Nothing generates those types today.
2. `confirmarTokenHash`/`verifyOtp` session-from-link (no password) already wired in `/auth/confirm`.
3. `finalizarAuth` runs the claim on ANY session-establishing arm carrying `?codigo=`.
4. `reclamar_por_codigo` never touches a password; magic-link session satisfies its gate.

**Missing piece:** the sending primitive — a passwordless verified-session link carrying `?codigo=` as the single invite email, plus a set-password step (ADR-0009 amendment).
