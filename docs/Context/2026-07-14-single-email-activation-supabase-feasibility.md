# Supabase single-email invite → set-password feasibility (research asset, 2026-07-14)

Wayfinder research asset. Web research against official Supabase docs + supabase/auth GitHub. Verdict: **feasible; recommended primitive = `admin.createUser({email_confirm:true})` + `admin.generateLink({type:'recovery'})` + self-sent branded email.**

## Key facts (cited)

1. **`admin.inviteUserByEmail`** creates the auth user (unconfirmed, `invited_at` set), sends the `invite` template through the Send Email hook (`email_action_type='invite'`); `email_confirmed_at` is stamped on acceptance (`verifyOtp({type:'invite'})`). Errors if email already exists → NOT idempotent/resendable for existing users. https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
2. **`admin.generateLink({type})`** (`signup|invite|magiclink|recovery|email_change_*`) returns `properties: {action_link, email_otp, hashed_token, redirect_to, verification_type}` and **sends NO email** — purpose-built for send-it-yourself. Creates the user for `invite`/`signup`; `recovery` requires existing user. **Not PKCE** — output carries `token_hash`, not `?code=` (auth-js#767) → complete with `verifyOtp`, never `exchangeCodeForSession`. https://supabase.com/docs/reference/javascript/auth-admin-generatelink
3. **`admin.createUser({email, email_confirm:true, user_metadata})`** marks `email_confirmed_at` AT CREATION — no confirmation email ever fires. https://supabase.com/docs/reference/javascript/auth-admin-createuser
4. **Completion pattern (Next.js App Router):** server route/action: `verifyOtp({type, token_hash})` → SSR client sets cookies → full session. Then `updateUser({password})` sets the first password. Caveat: "Secure password change" (reauth nonce) must be OFF or first-password set demands a reauth the invited user can't satisfy. https://supabase.com/docs/guides/auth/passwords
5. **Scanner prefetch is real** (Outlook SafeLinks, Gmail proxies GET links, burn single-use tokens → `otp_expired`). Official mitigation: put `{{ .TokenHash }}` in a link to YOUR page; verify only on explicit user action. Hardening: verify via **POST on button click**, not on the landing GET. https://supabase.com/docs/guides/auth/auth-email-templates (§email-prefetching); discussions 28903, 3961.
6. **Expiry:** invite/recovery links inherit Email OTP Expiration, default **1 hour**, configurable. Tokens single-use. Regenerating invalidates the prior token (resend works).
7. **Send Email hook** receives all action types incl. `invite`; when enabled, the hook FULLY REPLACES SMTP sending (custom SMTP config still raises rate-limit ceiling to 30/hr+). `generateLink` used for its `hashed_token` fires NO hook and NO email — exactly one email, fully under our Resend/DKIM control. https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
8. **Deliverability:** one self-sent email from our verified domain (SPF+DKIM+DMARC aligned) is the strongest spam lever; also removes the second Supabase-origin mail entirely. https://supabase.com/docs/guides/auth/auth-smtp
9. **Rate limits:** `/auth/v1/verify` 360/hr/IP; admin create/generateLink don't consume email limits. https://supabase.com/docs/guides/auth/rate-limits
10. **Security:** link possession = access until expiry; mitigations = short expiry, single-use (default), explicit-click POST verify, TLS. verifyOtp mints a fresh session (no fixation vector). Showing the registered email read-only is UX, not security.
11. **magiclink generateLink** has an intermittent auto-create bug for missing users (supabase#22521) → prefer `createUser` first + `recovery` type (semantically "set a password").

## Recommended architecture (primary)

On invitation send (server, service-role):
1. `admin.createUser({email, email_confirm:true, user_metadata})` — if "already exists", proceed (recovery works on existing users; for them the flow is a legitimate password reset).
2. `admin.generateLink({type:'recovery', email})` → `properties.hashed_token`. No Supabase email.
3. Send ONE branded email via the existing Resend pipeline, link → `https://{gym-host}/activar?codigo={claim_code}&token_hash={hashed_token}&type=recovery`.

Client:
4. `/activar` page: shows gym brand + member name (via `invitacion_info`); explicit button → POST server action → `verifyOtp({type:'recovery', token_hash})` → session cookies.
5. Claim (`reclamar_por_codigo(codigo)`) once session exists; then set-password step: show `session.user.email` read-only, `updateUser({password})` → redirect logged-in.
6. Expired/consumed token fallback: `/activar` offers "send me a fresh link" — server regenerates recovery link for the codigo's registered email (email goes only to the owner; throttle on `invitacion_enviada_at`).

Config prerequisites: "Secure password change" OFF; custom SMTP stays configured; we never use `redirect_to` (own link build) so no new allowlist entries strictly required; `SUPABASE_SERVICE_ROLE_KEY` available to the admin-app server.

Fallback variant: `inviteUserByEmail` + hook branding (`email_action_type='invite'`, rebuild link from `token_hash`). Fewer moving parts but errors on existing emails and couples delivery to the hook path. Rejected as primary.

Rejected: PKCE `?code=` for admin links (not emitted); legacy access_token fragment (invisible to server).
