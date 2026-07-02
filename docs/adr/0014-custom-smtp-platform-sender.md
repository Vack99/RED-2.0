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
