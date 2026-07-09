# ADR-0015 — Invite-token claim: a deterministic join between the two member doors

**Status:** Accepted · **Date:** 2026-07-08 · **Amends:** [ADR-0009](0009-identity-two-tier-auth-member-claim.md) (claim-by-verified-email becomes the fallback rail) · **Builds on:** [ADR-0014](0014-custom-smtp-platform-sender.md) (Resend, one platform sender) · **Design:** `docs/superpowers/specs/2026-07-08-member-registration-invite-token-design.md` · **Evidence:** the 2026-07-08 gap audit (19 confirmed gaps, one root defect)

## Context

Two doors create a member: the staff sale (`registrar_venta`) and self-registration (`reclamar_o_crear_cliente`). ADR-0009 joined them on the **verified email**: optional at sale, unvalidated, exact-matched. The 2026-07-08 audit confirmed the consequence class: any absent/mismatched/ambiguous email mints a duplicate `clientes` row and orphans the paid balance on a row the member's app can never read (member RLS requires `auth_user_id = auth.uid()`), with no backfill, merge, or dedup anywhere. 31 of 39 live rows have no email — structurally unclaimable. Industry research (2026-07-08): the platform leaders (Trainerize, LegitFit, TeamUp, PushPress) all bind staff-created records to logins with a **single-use tokenized invite link**, not email matching; email-match-only platforms are the weaker tier.

## Decision

- **The primary join is a bearer token on the row itself:** `clientes.claim_code` — 8-char crypto-random (A-Z, 2-9), globally unique, no expiry, **single-use** (cleared on claim). The code resolves the row; the row resolves the gym. Email is thereby demoted to contact info — it never decides which row a login attaches to.
- **Delivery is an automatic email at the moment the sale (or a later email backfill) records an address** — Resend API, platform sender per ADR-0014, gym's name in the copy. Send is best-effort: a sale never fails because mail failed; the invite state stays re-sendable.
- **On claim, the verified login email overwrites `clientes.email`** — verified beats staff-typed; one contact truth per row.
- **ADR-0009's email claim survives unchanged as the fallback rail** for members who self-register without ever receiving an invite.
- **The host is never an authz input** (ADR-0008 held): an invite opened on the wrong gym's host is hard-redirected to the code's canonical client host; the claim writes membership for the token's gym regardless of where it was opened.

## Considered and rejected

- **Email-first hardening** (require/validate at sale, canonicalization, dedup index): the join stays a heuristic — a member registering with a different address than the one on file still duplicates. Permanent residual gap, and email requirements collide with the owner-locked "never gate a cash sale" rule.
- **Phone-fallback claim:** `phone_e164` is self-declared and unverified at signup; a typo or shared family phone claims **someone else's** paid balance — a worse failure mode than a duplicate.
- **Switching auth to Clerk** (owner-raised, researched 2026-07-08): Clerk satellite domains bill $10/mo **per domain** — $50–100k/mo at the locked 5–10k-gym-custom-domains strategy; Clerk IDs are not UUIDs so `auth.uid()` is unusable (every RLS policy rewritten to `auth.jwt()->>'sub'`), `auth.users` is never populated (FKs and `email_confirmed_at`-reading RPCs break), and Supabase still bills TP-MAU alongside Clerk's MRU. The felt gap (auth email deliverability) is fully covered by Resend as Supabase custom SMTP — a dashboard config, not an architecture change.
- **Separate invites table / expiring codes:** no multi-invite requirement exists; expiry adds re-send friction with no threat model demanding it (the code is delivered to the member's own inbox and dies on use).

## Consequences

- Duplicate-by-join-failure becomes structurally impossible on the invite rail; the only surviving duplicate path is staff using NUEVO for an already-registered member — mitigated by visibility (badges, pending-online section, soft warn), with a merge tool deliberately deferred until a first real instance exists.
- The claim code is a bearer credential for a member's balance: it must never be readable by `anon` or members (staff policies only; the pre-signup page sees `{gym, nombre}` via a dedicated SECURITY DEFINER lookup), and holding a code reveals a first name + gym — accepted.
- Multi-gym membership becomes reachable (an invited member may already belong to another gym), so member-side gym resolution must reconcile against the host tenant instead of `limit(1)` — in scope with this ADR.
- Resend is now load-bearing twice (auth SMTP + product invites); its quota/abuse posture is a shared blast radius (ADR-0014 consequence, now wider).
