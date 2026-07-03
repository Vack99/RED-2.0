# HITL Runbook — Issue #27: Custom SMTP for auth mail (Resend, one platform sender)

**Issue:** https://github.com/Vack99/RED-2.0/issues/27 · **Decision:** [ADR-0014](../adr/0014-custom-smtp-platform-sender.md) · **Realizes:** roadmap Phase-3 exit "custom SMTP live for auth mail + templates verified" · **Label:** `hitl`

This slice wires **Resend** into Supabase Auth as project-wide custom SMTP so member
signup-confirmation and password-reset mail is delivered from **one platform-owned,
gym-neutral sender** (ADR-0014 — one shared Supabase project means one sender for
**every** gym; this is permanent, not a v1 shortcut).

## What the agent could NOT automate, and why

- **Resend domain discovery / registration** — the key in `apps/admin/.env.local`
  (`RESEND_API_KEY`) is a **restricted, send-only** key: `GET /domains` returns
  `401 restricted_api_key`. It can send mail (which is all Supabase SMTP needs) but
  cannot read or add domains. The **sending domain is Aaron's deferred decision**
  anyway (ADR-0014) — see the human checklist.
- **Supabase auth config (SMTP / templates / rate limits)** — no Supabase Management
  API token is reachable (`SUPABASE_ACCESS_TOKEN` unset, no CLI login/config dir).
  The Supabase MCP surface covers SQL/migrations/advisors only, not `/config/auth`.
  So all of Step 2–4 below is a **dashboard action**, pre-filled here.

---

## Step 1 — (Human) Pick + verify the platform sending domain in Resend

The sender domain was **deliberately deferred to this slice** (ADR-0014) — it is your
call. Do NOT reuse a gym's brand domain: one sender serves every gym, so the envelope
must be gym-neutral (e.g. a platform/ops domain you own).

1. Resend dashboard → **Domains → Add Domain** → enter the platform domain.
2. Resend shows the exact DNS records to add — typically:

   | Type | Host / Name | Value | Purpose |
   |------|-------------|-------|---------|
   | TXT  | `send` (subdomain) | `v=spf1 include:amazonses.com ~all` | SPF |
   | TXT / CNAME | `resend._domainkey` (+ 1–2 more) | Resend-provided DKIM value(s) | DKIM (must PASS) |
   | MX   | `send` | `feedback-smtp.<region>.amazonses.com` (priority 10) | bounce/feedback |
   | TXT  | `_dmarc` | `v=DMARC1; p=none;` | DMARC (recommended) |

   **Copy the real values from YOUR Resend domain page** — the table above is the
   shape, not the literal values (they are per-domain/region). Add them at your
   registrar's DNS.
3. Back in Resend → **Verify**. Wait until status = **Verified** (DNS can take
   minutes–hours). **Supabase SMTP will fail to deliver until this is Verified**, so
   this step comes first.

---

## Step 2 — (Human) Enable custom SMTP in Supabase

Dashboard → project `hjppxawglmukfvsgmcog` → **Authentication → Emails → SMTP Settings**
→ enable **Custom SMTP**, fill:

| Field | Value |
|-------|-------|
| Sender email | `no-reply@<your-verified-domain>` (ADR-0014 pins the `no-reply` mailbox) |
| Sender name  | **Neutral display name — FLAG: confirm.** Proposed: `Notificaciones` (gym-neutral, es-MX). Must carry NO gym brand. |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | paste `RESEND_API_KEY` from `apps/admin/.env.local` (the send-only key is correct here — SMTP only sends) |
| Minimum interval between emails | leave default (e.g. 60s) |

Save.

---

## Step 3 — (Human) Replace the two auth templates (es-MX, gym-neutral, platform-voiced)

Dashboard → **Authentication → Emails → Templates**. Edit **Confirm signup** and
**Reset Password**. No gym name, no brand colors, plain accessible HTML,
`{{ .ConfirmationURL }}` preserved.

### Confirm signup

**Subject:** `Confirma tu cuenta`

```html
<p>Hola,</p>
<p>Recibimos una solicitud para crear tu cuenta con este correo. Para activarla, confirma tu dirección:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi cuenta</a></p>
<p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
<p>{{ .ConfirmationURL }}</p>
<p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
```

### Reset Password

**Subject:** `Restablece tu contraseña`

```html
<p>Hola,</p>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Para elegir una nueva contraseña, abre este enlace:</p>
<p><a href="{{ .ConfirmationURL }}">Restablecer mi contraseña</a></p>
<p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
<p>{{ .ConfirmationURL }}</p>
<p>Si no solicitaste este cambio, puedes ignorar este mensaje; tu contraseña seguirá igual.</p>
```

---

## Step 4 — (Human) Raise the email rate limit off the dev default

Dashboard → **Authentication → Rate Limits** → **Rate limit for sending emails**:
raise from the dev default **2/hour** to **30/hour**. (**FLAG: confirm value** — 30/hr
is a modest production floor; bump later if a real gym's signup burst needs it. The
scale-audit wall was ~member #30 on the built-in mailer.)

---

## Step 5 — (Human) Verify on a real inbox (the acceptance gate)

This is Aaron's acceptance step; the agent must not send unsolicited mail.

1. With the domain **Verified** and SMTP saved, register a real member at the
   forge-demo gym's `/registro` (or use Supabase's "send test email" if shown).
2. Confirm in a real inbox:
   - [ ] Signup-confirmation mail **received**, **From** the custom sending domain.
   - [ ] Password-reset mail received (trigger via "forgot password").
   - [ ] **DKIM = pass** (view raw headers: `Authentication-Results: … dkim=pass`).
   - [ ] Clicking the link establishes a session (lands authenticated).
   - [ ] Templates render es-MX, no gym brand, links work.
3. On all green, close #27 with the header evidence recorded.

---

## Reference (secrets-free)

- **Vendor:** Resend (SMTP `smtp.resend.com:465`, user `resend`). One mail vendor
  platform-wide (ADR-0006 + ADR-0014).
- **Sending domain:** `<TBD — Aaron picks in Step 1>`, platform-owned, gym-neutral.
- **Sender address:** `no-reply@<domain>` · **Sender name:** `Notificaciones` *(flagged)*.
- **Credential:** SMTP password = `RESEND_API_KEY` env var in `apps/admin/.env.local`
  — **never** committed to the repo.
- **Rate limit:** 30 emails/hour *(flagged)*.
- **Templates:** Supabase-hosted (Authentication → Emails → Templates); source of
  truth for the copy is Step 3 above.
