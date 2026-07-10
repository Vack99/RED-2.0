# HITL Runbook — Issue #75: Send Email Hook (gym-branded auth mail via Resend)

**Issue:** https://github.com/Vack99/RED-2.0/issues/75 · **Parent:** #72 · **Decisions:** [ADR-0014](../adr/0014-custom-smtp-platform-sender.md) (amended 2026-07-09 — per-gym display name + templates now live) · **Supersedes:** [`hitl-72-resend-live.md`](hitl-72-resend-live.md) §B3 (its two dashboard templates become dead config once this is green)

This is an **owner-executed, agent-prepared** runbook. The code + tests already shipped on `main` (branch `feat/send-email-hook`); the Edge Function is deployed via MCP but **inert** until you register the hook. Every step below is a dashboard/CLI action a human performs, each paired with its verification.

**Project ref:** `hjppxawglmukfvsgmcog` · **Function URL:** `https://hjppxawglmukfvsgmcog.supabase.co/functions/v1/send-email`
**Sending address:** `no-reply@ibookit.lat` (shared domain, ADR-0014 — per-gym *display name*, one address)

## How the hook works (context)

Supabase's Send Email Hook *"replaces Supabase's built-in email sending"*. On every signup-confirmation / password-reset, Supabase POSTs the mail payload (`user`, `email_data.{token_hash, redirect_to, email_action_type, site_url}`) to our Edge Function `supabase/functions/send-email/`, signed with a shared secret (Standard Webhooks). The function:
1. verifies the signature (`verify_jwt: false` — the hook fires pre-JWT; integrity is the signature, not a session token);
2. resolves the gym from `redirect_to`'s host (`gym_domain` app='client' → `gym.brand_name`; no match → neutral "Notificaciones");
3. mints the confirm link **on the gym's own host** (`https://<gym-host>/auth/confirm?token_hash&type`) and sends a gym-branded es-MX mail via Resend;
4. returns 200 (sent / non-retryable drop) or 503 (network/429/5xx → Supabase retries ≤3×) — **a failed send never bricks signup**.

**Execute the steps in order (a→h).**

---

### a. Deploy-confirm gate (do this FIRST)

Verify the **client** Vercel deployment serving `red-demo.ibookit.lat` (and the other client hosts) includes the `token_hash` landing — the `/auth/confirm` route's new `?token_hash=&type=` branch (this branch's `feat(client)` commit). Enabling the hook **before** the landing is live dead-ends every confirmation click (the link would land on a route that only understands the old PKCE `?code=`).

- *Verify:* the client deployment for the merge commit is **READY**; opening `https://red-demo.ibookit.lat/auth/confirm?token_hash=x&type=email` reaches the route (a redirect to `/entrar?error=confirmacion` is the expected "invalid token" response — it proves the branch runs, not a 404).

### b. Register the hook + generate its secret — do **NOT** enable yet

Dashboard → **Authentication → Hooks (Beta) → Send Email Hook** → type **HTTPS** → URL `https://hjppxawglmukfvsgmcog.supabase.co/functions/v1/send-email` → **Generate Secret**. Copy the secret (`v1,whsec_…`). **Leave the hook DISABLED** — the moment it is enabled, GoTrue routes EVERY gym's signup/recovery mail through the function, and until step c's secret is live the function 401s each call and the mail is silently dropped platform-wide.

- *Verify:* the hook is configured (HTTPS, function URL, secret generated) and still shows **Disabled**.

### c. Set the Edge Function secrets, then enable

Dashboard → project `hjppxawglmukfvsgmcog` → **Edge Functions → send-email → Secrets**. Set:
- `RESEND_API_KEY` — the `re_…` key from hitl-72 §A4 (the same send-only key).
- `SEND_EMAIL_HOOK_SECRET` — the secret generated in step b.

*Verify:* both secrets present. (`SUPABASE_URL` / `SUPABASE_ANON_KEY` are auto-injected — do not set them.)

**Only now**, back in Authentication → Hooks, toggle the Send Email Hook to **Enabled** — enabling is deliberately the LAST action of this step.

- *Verify:* the hook shows **Enabled**, HTTPS, pointing at the function URL; the secret matches the function's `SEND_EMAIL_HOOK_SECRET`.

### d. Verification walk (the acceptance gate — real inbox, headers recorded)

Use an address you control; run against a **test gym** (red-demo, or forge-demo) so no real member is touched.

- **Signup:** `/registro` on `red-demo.ibookit.lat` → confirmation mail arrives **From `{brand_name} <no-reply@ibookit.lat>`** (e.g. `RED <no-reply@ibookit.lat>`), es-MX copy carrying the gym name; the link host is `red-demo.ibookit.lat` (NOT `…supabase.co`); click → lands authenticated on `/reservar`, the invite/email claim runs.
- **Recovery:** `/entrar` → "forgot password" → recovery mail (subject *Restablece tu contraseña*) → link → `/restablecer` with a live recovery session → new password works.
- **Unmapped host:** a signup on `app.ibookit.lat` (unmapped fallback) → mail degrades to neutral **`Notificaciones <no-reply@ibookit.lat>`** copy, still delivers + confirms.
- **Headers:** raw headers on any received message show `spf=pass`, `dkim=pass`, `d=ibookit.lat`; inbox, not spam.
- **Built-in templates never render** — every auth mail is ours (the #72 §B3 templates no longer fire).

- *Open item to confirm on the walk (AC): does `type=email` verify a **signup** confirmation?* The link uses `type=email` per Supabase's `token_hash` recipe. If GoTrue rejects it for signup confirmations, the fallback is mapping signup → `type=signup` in `correo.ts` `tipoOtp`. This is the one path a unit test can't prove — verify it here.

### e. Retire the #72 §B3 dashboard templates (ONLY after step d is green)

Once the walk passes, the two custom SMTP templates (Confirm signup + Reset Password, hitl-72 §B3) are **dead config** — the hook renders every auth mail now. Delete them in Dashboard → Authentication → Emails → Templates (or reset to default), and mark §B3 **superseded by #75** in `hitl-72-resend-live.md` (the pointer note is already in place). Do this **only** after d — until then they are the rollback path.

### f. Rollback

Disable the Send Email Hook (step c toggle). Auth mail immediately resumes through custom SMTP (#72 §B) with the neutral platform templates. No code change, no redeploy. This is why §B3 stays until step e.

### g. Rate limit (documented answer — LIVE-CONFIRMED 2026-07-10)

**Q (AC open question): does Supabase's hourly auth-email rate limit still apply when the hook sends?** **Yes — live-confirmed.** `GOTRUE_RATE_LIMIT_EMAIL_SENT` gates the auth **action** (the signup/reset that *queues* the mail) **before** the hook is invoked (`429 over_email_send_rate_limit` observed with the hook enabled, request never reaching the function).

**⚠️ The configured 50/hr exists ONLY while Custom SMTP is enabled.** During the first walk, Custom SMTP was found switched OFF (cause unconfirmed — possibly the dashboard hook-setup flow), which silently reverted the limit to the built-in **~2/hour** and rate-limited the walk after 3 test mails. **Custom SMTP must STAY ON** even though the hook does the sending (Provider ON + Hook ON → hook sends; SMTP holds the editable rate limit AND is the rollback path). If auth mail 429s early: check Auth → Emails → SMTP Settings is ON (hitl-72 §B values) and Auth → Rate Limits → "Email sent per hour" is 50.

### h. Security dependency (stated)

The minted link's host is trusted **only** because Supabase clamps `email_data.redirect_to` to the Auth **Redirect-URL allow-list** (hitl-72 §C) before invoking the hook. Keep that allow-list **host-scoped** — one `https://<host>/**` per gym — **never a bare `https://**`**, or a forged `redirect_to` could aim the confirm link off-platform. This is also noted in the function header comment.

---

## Rollback / failure notes

- **Hook secret mismatch (b/c):** the function returns 401 on every call → Supabase surfaces a hook error and (per its retry policy) the mail is not sent. Fix the secret; no data risk.
- **Resend key wrong / Resend down (b):** the function returns 503 → Supabase retries ≤3×; if still failing the auth action completes but no mail arrives (best-effort). Fix the key; the member can re-request.
- **Landing not deployed (a):** confirmation clicks dead-end. **This is why step a is first.** Disable the hook (f) until the landing is live.
- **A gym's client host missing from the allow-list (§C):** the auth mail still sends, but the click errors `redirect_to not allowed`. Add the host and re-click.
- **Anything unexpected:** disable the hook (f) — SMTP + §B3 templates resume instantly.
