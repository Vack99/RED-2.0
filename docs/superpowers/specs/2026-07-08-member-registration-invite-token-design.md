# Member Registration — Invite-Token Claim + Gap Remediation (design)

**Date:** 2026-07-08 · **Status:** approved in grill session (owner) · **Supersedes the join model of** `2026-07-06-member-registration-payment-strategy-design.md` §2-Decision 2 (email as sole join key) — every other locked decision there stands. · **Remediates:** the 19 confirmed gaps in `docs/Context/2026-07-08-red-member-registration-gap-audit-findings.md`. · **ADR:** 0015 (invite-token claim), building on 0009 (two-tier identity) + 0014 (Resend platform sender).

## 1. The one-sentence problem and the one-sentence fix

Email is today the only join key between the two doors that create a member (admin sale ↔ self-registration); it is optional, unvalidated, and exact-matched, so the join fails in ordinary ways and every failure mints a duplicate `clientes` row with the paid balance orphaned. **Fix: make the join deterministic — a single-use invite code on the `clientes` row, delivered by an automatic email at sale time, claimed at registration — so email becomes contact info, never the connector.** This is the pattern the industry leaders converge on (Trainerize, LegitFit, TeamUp, PushPress: staff action fires a tokenized invite that binds login → existing record).

## 2. Decisions locked (grill session 2026-07-08)

| # | Decision | Rejected alternatives |
|---|---|---|
| D1 | **Invite-token claim** is the primary door-1→login rail; the existing exact-email claim (`reclamar_o_crear_cliente`) stays as unchanged fallback | Email-first hardening (join stays a guess); phone-fallback claim (unverified phone can claim someone else's balance) |
| D2 | Token = nullable `claim_code` on `clientes`: 8-char crypto-random (A-Z, 2-9), globally unique, **no expiry, single-use** (cleared on claim), ensured lazily whenever an invite is needed | Separate invites table (no multi-invite need); expiring codes (re-send friction, no threat model requiring it) |
| D3 | **Auto-send invite email on sale** when email present; email backfill on an existing row triggers the same auto-send; REENVIAR re-sends the same code | Operator-relayed WhatsApp/QR as primary channel (kept as future secondary; industry standard is the automatic email at the moment the sale is recorded) |
| D4 | **Supabase Auth stays. Resend duo:** (i) custom SMTP for Supabase auth mail (realizes ADR-0014 / closes #27), (ii) Resend API from app code for the invite email itself | Clerk switch: satellite domains cost $10/mo/domain → $50–100k/mo at the locked 5–10k-gym-domains strategy; full RLS/FK/RPC rewrite (`auth.uid()` unusable, `auth.users` never populated); double MAU billing |
| D5 | On claim, **the verified login email overwrites `clientes.email`** (verified beats staff-typed; no duplicate contact truth) | Keeping both (two email fields = permanent ambiguity) |
| D6 | Prevent-only dedup this week: app-account badges + pending-payment section + soft NUEVO warn. **No merge tool** — zero duplicates exist live (0/39 self-registered); build on first real instance (spec §3.8 posture holds) | Merge/relink tool now (real scope for a zero-instance problem) |
| D7 | **Stripe is the next phase**, not this week; nothing in this design may block it | Stripe now (rushes the doors); scaffold-only (dead structure) |

## 3. Door flows (target state)

**Door 1 — staff registers the member (with email):** Vender → NUEVO with email → `registrar_venta` creates the row → app auto-sends the invite email (Resend) → member clicks `/registro?codigo=…` on the gym's own client host → sees "Invitación de {gym} para {nombre}" → signs up with **any** email + password → Supabase confirm mail → `/auth/confirm` runs `reclamar_por_codigo` → `auth_user_id` stamped on the paid row, email overwritten with the verified one, code cleared, `gym_membership` upserted → member books.

**Door 1 without email:** sale succeeds exactly as today (cash is never gated — §3.4 stands). Roster/ficha show "sin email — sin acceso a la app". Staff later adds the email via the (new) email field in the edit sheet → same auto-invite fires. This is the repair path for the ~31 legacy emailless rows: backfill → invite.

**Door 2 — member self-registers first:** unchanged mechanics (`reclamar_o_crear_cliente`, 0-balance row) plus: admin **inicio tile "Nuevos registros online"** (count) and a **roster filter "registrado online — sin paquete"** surface the row; member walks in, staff finds the profile there (or by name/email), sells **EXISTENTE** onto it — same account, package lands on the claimed row. Soft warn on NUEVO when an existing row matches on tel or email ("¿Es este cliente? → EXISTENTE"), never blocking.

**Invite lifecycle states (derived, not stored):** `sin email` (email NULL) → `sin invitar` (email set, no `invitacion_enviada_at`, rare/transient) → `invitación enviada {fecha}` (+ REENVIAR) → `cuenta activa` (`auth_user_id` set). Shown on ficha, roster badge, Vender picker, and the post-sale recibo (whose copy stops implying the member is done: "cuenta pendiente — invitación enviada a {email}").

## 4. Schema + RPC surface (expand-only, after `20260707074214`)

- `clientes.claim_code text` nullable + partial unique index; `clientes.invitacion_enviada_at timestamptz` nullable.
- **`reclamar_por_codigo(p_codigo)`** — SECURITY DEFINER, `search_path=''`; requires `email_confirmed_at`; resolves the row by `claim_code` (cleared/absent code → clear error); stamps `auth_user_id`, overwrites `email` with the verified email, fills `phone_e164`/terms like the existing claim, **clears `claim_code`**, upserts `gym_membership(role='member')`; returns the gym slug for redirect. Caller already owning a row in that gym (partial unique index) → explicit error ("ya tienes cuenta en este gimnasio") for staff to resolve — never a second row.
- **`invitacion_info(p_codigo)`** — SECURITY DEFINER lookup for the pre-signup page: `{gym nombre, gym slug, cliente nombre}` only. Bearer-token semantics: holding the code reveals first name + gym — accepted.
- **`preparar_invitacion(p_cliente_id)`** — staff-gated: ensures `claim_code` (generates if NULL), returns `{code, email, nombre}`; DAL sends via Resend and stamps `invitacion_enviada_at` on success (send is best-effort — a sale NEVER fails because email failed; a failed send leaves the state at `sin invitar`/re-sendable).
- `registrar_venta` NEW-path generates `claim_code` inline (atomic with the INSERT); signature unchanged beyond current 12 args.
- `actualizar_cliente` gains `p_email` (edit sheet adds the field, `.email()`-validated **here** — this surface is not a sale, so validation is safe; the sale-path `nuevoEmail` normalizer stays untouched).
- Drop orphaned `set_notificaciones` + regen types (cleanup).
- Postures preserved: `reclamar_*` DEFINER, `registrar_venta` INVOKER, `search_path=''`, no `user_id` writes, RLS classes per ADR-0013. `claim_code` is never readable by `anon`/members (staff reads via existing staff policies; the pre-signup page reads only via `invitacion_info`).

## 5. Cross-tenant shields (owner-flagged focus)

1. **URL construction:** invite links target the gym's own client host — `gym_domain (gym_id, app='client')`; unmapped gym (red-demo) → platform default client host + `?gym={slug}`.
2. **Wrong-host open:** `/registro?codigo=` compares the code's gym against the host-resolved tenant; mismatch → hard redirect to the code's canonical client URL. No mixed branding is renderable.
3. **Identity proof pre-signup:** the claim page always shows "Invitación de {gym} para {nombre}" before any form.
4. **RPC authority:** the code resolves the row, the row resolves the gym. The host is NEVER an authz input (ADR-0008 held); the claim writes membership for the token's gym, period.
5. **Multi-gym reconciliation:** invites make multi-`gym_membership` reachable, so the member readers' `limit(1)` nondeterminism (audit #17) is now in scope: `resolverMiembroGym` (+ `clase-miembro` twin) prefer the membership matching the host tenant, falling back to the sole membership. No switcher UI this phase.

## 6. Client-app robustness (Cluster C, all confirmed in scope)

1. `/reservar` no longer 500s for a signed-in account without `gym_membership`: graceful "sin membresía" state in `resolverMiembroGym` + re-run of the idempotent claim on entry (heals the swallowed-claim and password-reset-first paths; audit #10/#15).
2. 0-balance member gets a fourth CTA branch (reservar-semana sheet + clase-detalle): route to precios/pay-at-gym copy instead of an enabled book button with "usa 1 de tus 0 clases" (audit #9).
3. `/entrar` copy: persistent, enumeration-safe "¿Primera vez? Crea tu cuenta" nudge (audit #16).
4. `getOperatorGym` requires a staff role (`owner|operator`) → a member hitting the admin app sees SinGimnasio, not the empty shell (audit #19).

## 7. Owner HITL (runbook to be written alongside)

Resend↔Supabase integration (auto-provisions SMTP; lifts 2/hr→30/hr+, adjustable), sending-domain verification (SPF/DKIM/DMARC; testing + real domain both available), `RESEND_API_KEY` + default-client-host env vars in Vercel, Supabase Auth URL configuration (closes the #63 Slice-0 leftover), es-MX platform-voiced auth templates (per ADR-0014: one platform sender for every gym — invite copy carries the gym's *name*, never a per-gym sender).

## 8. Explicitly deferred

Stripe phase (Connect Standard, `registrar_venta_stripe` webhook writer — next phase, design intact in the 2026-07-06 spec); merge/relink tool (first real duplicate triggers it); trial-class booking for online registrants (product option, not this week); WhatsApp/QR invite as secondary channel; email canonicalization (token rail makes it moot); gym-switcher UI; push notifications (dashboard visibility only).

## 9. Success criteria

- A staff-sold member with an email receives an invite automatically and, following only that email, ends with the **same** `clientes` row carrying their login, verified email, and paid balance — bookable immediately. Zero duplicate rows mintable via the invite rail.
- A staff-sold member without an email is visibly "sin acceso a la app" until backfill → invite → claim converges on the same row.
- An online self-registrant is visible to staff (tile + filter) and an EXISTENTE sale lands on their claimed row.
- An invite opened on the wrong gym's host can only land on the right gym's registro, correctly branded.
- No path 500s: failed/never-run claim degrades to a graceful state.
- Cash sale without email remains exactly as frictionless as today.
