# ADR-0014 — Custom SMTP for auth mail: Resend, one platform-owned sender for every gym

**Status:** Accepted · **Date:** 2026-07-02 · **Builds on:** [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) (one shared Supabase project) · **Amends:** [ADR-0006](0006-respaldo-operational-export.md) (its mail-provider clause) · **Realizes:** roadmap **Phase 3** exit criterion "custom SMTP live for auth mail + auth email templates verified" in [`docs/planning/2026-06-29-multi-gym-platform-roadmap.md`](../planning/2026-06-29-multi-gym-platform-roadmap.md)

## Context

Members self-register by email+password ([ADR-0009](0009-identity-two-tier-auth-member-claim.md)), so every signup and password reset fires a Supabase Auth email. Supabase's built-in mailer is **dev-only — single-digit emails/hour** — and the [multitenant-branding scale audit](../superpowers/audits/2026-07-01-multitenant-branding-scale-audit.md) (finding 3) puts the wall at roughly **member #30**: self-registration silently breaks the first day a real gym onboards more than a handful of members. Custom SMTP is therefore a **Phase-3 deliverable, not a launch nicety** — auth mail is on the critical path the moment members can register.

## Decision

- **Provider: Resend, wired into Supabase Auth as custom SMTP** via dashboard-entered credentials. Chosen because [ADR-0006](0006-respaldo-operational-export.md) already designates Resend for the future weekly-export email — **one mail vendor platform-wide** — and it exposes plain SMTP credentials with a free tier that covers auth volume at current scale.

- **THE PERMANENT CONSTRAINT — one sender identity for every gym.** Supabase custom SMTP is **project-wide**. One shared Supabase project ([ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md)) therefore means **one sender identity for EVERY gym on the platform** — auth mail cannot carry a per-gym branded sender. A per-gym sender would require a per-gym Supabase project, which ADR-0008 rejects. This is a **permanent, structural consequence**, not a v1 shortcut a later phase unwinds.

- **Sender identity: a platform-owned domain** (`no-reply@<platform-domain>`), gym-neutral by construction. The concrete domain + DNS (SPF/DKIM/DMARC) + entering credentials into the dashboard + template edits + the rate-limit raise are a **human-only (HITL) slice** the platform operator performs; deliverability is **verified on a real inbox** with headers recorded (signup-confirmation + reset, links clicked, session established).

- **Templates: platform-voiced, gym-neutral, es-MX** rewrites of the Supabase auth templates (confirm-signup + password-reset).

## Considered and rejected

- **AWS SES** — cheaper only at volume we do not have; sandbox-exit and IAM friction; a *second* mail vendor alongside ADR-0006's Resend.
- **Postmark** — paid from the first email; again a second vendor, covering nothing Resend does not.
- **Per-gym branded sender / per-gym templates** — impossible under one shared project without a Supabase-project-per-gym (ADR-0008 forbids it). One sender serves every gym, so **any** gym's brand on the envelope or template body is wrong for **every other** gym; per-tenant auth-mail branding would need custom auth flows Phase 3 does not ship.

## Consequences

- Auth mail is **platform-branded, never gym-branded** — a deliberate, permanent trade of the shared-project architecture, not a gap. A future reader who wants per-gym auth mail must reckon with ADR-0008 first: it means a project per gym.
- Onboarding a gym stays a config act (ADR-0008) — **no per-gym mail setup**; the one sender and its verified domain already serve every new tenant.
- The Phase-3 exit gate is **observable, not asserted**: deliverability confirmed against a live inbox with headers, per the roadmap criterion; auth-mail deliverability is re-checked at the Phase-7 launch gate.
- Resend is now load-bearing for auth (not just the deferred weekly export), so its free-tier ceiling and the shared abuse posture on anon surfaces (audit finding 7 — a spammed `contact_message` burns the shared quota) are a real, shared blast radius.

## Amendment — 2026-07-09 (#75)

**The "permanent, structural" per-gym constraint above held only while the mailer was project-wide custom SMTP.** It reasoned from one true premise (custom SMTP is a project-wide setting) to an over-broad conclusion — that *auth mail* can never be per-gym. It did not consider Supabase's **Send Email Hook**, which per Supabase's docs *"replaces Supabase's built-in email sending"* and is available on our plan. The hook is invoked **per message** with the payload (`user`, `token_hash`, `redirect_to`, `email_action_type`), so branding is a per-message decision, not a project-wide one.

**What changes (now live via #75):** auth mail is sent by our own Edge Function (`supabase/functions/send-email/`) through Resend, with:
- **per-gym display name** on `From:` — the gym resolved from `redirect_to`'s host (`gym_domain` → `gym.brand_name`), neutral "Notificaciones" when no gym maps;
- **per-gym template copy** (es-MX, the gym's name woven into the body) — our templates, never Supabase's built-in ones;
- **the confirm link minted on the gym's OWN host** (`https://<gym-host>/auth/confirm?token_hash&type`), retiring the `…supabase.co/auth/v1/verify` spam-signal mismatch.

**What stays true (do NOT re-read the original as forbidding this):**
- **One sending DOMAIN / address** — `no-reply@ibookit.lat`, the single Resend-verified sender. Per-gym *addresses* would require verifying each gym's domain in Resend; still out of scope. The domain constraint is real; the *branding* constraint was not.
- **One shared Supabase project** — [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) is unchanged. The hook does not need a project per gym; it reads the gym from the mail's own `redirect_to`.

The original **Decision / Considered-and-rejected / Consequences** sections are left intact as the record of the SMTP-era reasoning; this amendment **supersedes their per-gym-branding claims by reference** for the auth-mail path. Custom SMTP (#72 §B) remains the **fallback** — one dashboard toggle disables the hook and auth mail resumes through SMTP with the neutral platform templates.
