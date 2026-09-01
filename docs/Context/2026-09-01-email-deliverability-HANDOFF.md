# 2026-09-01 — Email deliverability: execute the green list — HANDOFF

**Canonical source:** `docs/research/2026-09-01-email-deliverability-build-vs-buy.md` — 20-agent
verified research (build-vs-buy verdict, per-fix risk audit, 1000-gym architecture, 12-step rollout,
critique appendix). This handoff extracts only what the next session executes. Read §4–§6 of the
research doc before touching anything; the risk tables there are the spec.

**Verdict recap:** buy nothing, stay on Resend, build the bounce/complaint feedback loop. DMARC
ratchet (F4) and one-click unsubscribe (F5) are ruled **NEVER as scoped** — do not resurrect them.

## Mission

Plan and ship the fully-green items below. The five-minute config items need NO tickets
(pipeline-earns-its-place); the webhook build is the one substantive piece — give it ONE issue
(split only if webhook and desk-badge verify independently).

## Green — execute in this order

1. **Google Postmaster Tools, apex `ibookit.lat`.** FIRST — data is not retroactive; every
   unregistered day is lost baseline. DNS-only verification (TXT or CNAME). Add as a NEW host —
   never edit the existing `send.ibookit.lat` SPF TXT value. Verify after: `Resolve-DnsName -Type TXT send.ibookit.lat` byte-identical.
2. **`rua=` on `_dmarc.ibookit.lat` → Postmark DMARC Digests (free).** NEVER `mailto:` on
   `ibookit.lat` (apex has no MX — reports would silently vanish) and never a bare Gmail (RFC 9990
   external-destination verification fails). Confirm the Digests address accepts mail BEFORE the DNS
   edit; confirm reports arrive at 24–48h. Caveat: zero-report weeks send no digest — silence is
   ambiguous at current volume.
3. **Same TXT edit: add `sp=reject; np=reject`** (keep `p=none`). Free anti-spoof for subdomains —
   nothing sends From any `ibookit.lat` subdomain today. Record in runbook: any FUTURE subdomain
   sender must publish its own `_dmarc` first.
4. **Reply-To on BOTH send paths** (`packages/data/src/server/invitaciones.ts` transport +
   `apps/admin/.../vender/recibo-envio.ts` + the Deno hook `supabase/functions/send-email/index.ts`):
   `gym_contact.email` where set (column exists — `20260706165900_create_gym_contact.sql`), fallback
   `soporte@ibookit.lat`. MX via **Namecheap free email forwarding** on the apex — NOT Cloudflare
   (zone is on registrar-servers NS; Cloudflare Email Routing would force a nameserver migration).
   ⚠️ Resend REST is snake_case — `reply_to`, not `replyTo`; a wrong key is silently ignored.
   **Verify with a live send + raw-header inspection** — no test suite checks the wire.
   ⚠️ Owner input needed first: forwarding destination + who reads it (see Owner inputs).
5. **Tags `tipo=auth|invitacion|recibo` on both send paths + envelope drift guard** — a source-text
   test asserting both send sites carry the same envelope key set (same shape as
   `tools/guards/denial-suite-drift.test.ts`). The Deno hook is the path that drifts.
6. **THE BUILD: Svix-verified `/api/webhooks/resend` → `clientes.correo_estado`** (`rebotado|queja|baja`)
   + `correo_estado_at` + desk badge on ficha/invite/receipt buttons ("este correo rebotó — pídele
   otro"). Rules are non-negotiable (research §5): verify Svix signature before trusting anything;
   dedupe on `svix-id`; act only on `bounce_type=Permanent` or `suppression.added` (Transient/
   Undetermined = no write); editing the email clears the state; **auth mail never suppressed;
   receipts never gated on `baja`**. Migration touches what an RPC reads → `test:denial` convention
   applies if any write RPC changes; the webhook itself is app-side.
7. **`escapeHtml()` in `mensajeInvitacion`** (`invitaciones.ts`) + metacharacter regression test
   (`< > & "` through `gymNombre`/`saludo`). Sibling receipt template already has the helper — copy
   that pattern. Gates item 8.
8. **Invite body reshape (F6):** carry the transaction forward ("tu pago de $X del [fecha] en
   [gym]"), name the destination domain in the body. NO hero images, NO shorteners, NO
   click-tracking, NO urgency copy. Postmaster (item 1) provides the before/after.
9. **`_dmarc` p=none on per-gym link domains**, starting `redfunctionaltraining.com` (currently
   NXDOMAIN with live MX — the actual phishing lane). Becomes a per-tenant provisioning step later.

## NOT green — do not execute

- **Per-gym-per-day send cap** — gated on the bulk-import feature existing (ships WITH it).
- **Invite stream split to `invitaciones.ibookit.lat`** — gated on first bulk onboarding approaching.
- **Resend Scale / dedicated IP / Postmark auth fallback / outbox** — measured triggers only (research §6.12).
- **F4 DMARC ratchet, F5 one-click unsub** — NEVER as scoped. Reasons in research §4.

## Owner inputs owed (ask before item 4; rest don't block)

1. `soporte@ibookit.lat` forwarding destination + triage cadence (blocks item 4 fallback).
2. One Resend support ticket: do they expose Microsoft SNDS/JMRP for shared pools? (~half our
   recipients are hotmail-shaped; zero visibility today.)
3. Is bulk member-import on the roadmap? (Trigger for send cap + the 5k/day Gmail threshold.)
4. LFPDPPP counsel question (research §8.5) — flag, not block.
5. Standing debt: SAT persona-física details (RFC / régimen / domicilio fiscal) for CFDI.

## Session residue (verify, cheap)

- **Marce (marcerubiogarcia07@gmail.com) RESOLVED:** invite was delivered all along → spam folder.
  Her inert unconfirmed auth row was DELETED on live (uid c371856c…, conditional+pinned, 09-01);
  cliente unclaimed, claim_code live, fresh invite delivered 17:18Z. She must mark not-spam + click
  → deterministic fresh-provision. **Check:** did she activate? (`clientes.auth_user_id` set?)
- **`aztrid_eb@hotmail.com` (FORGE):** recibo F-1063 soft-bounced 08-12 ("mailbox full") — the only
  real delivery failure in the fleet (179 sends). Worth a REENVIAR from the venta.
- **Peer terminal session** was prompted to "fix the email case mismatch" — verify it didn't ship
  churn: claim path is ALREADY case-insensitive (`activar-cuenta/nucleo.ts:119`,
  `reclamar_o_crear_cliente.sql:51`). Capitalized stored emails are cosmetic.
- **Supabase MCP in t3 sessions:** handshake is per-session at launch; a CONNECT_TIMEOUT stays dead
  all session. Terminal Claude Code sessions connect fine; cross-session SendMessage is the bridge.

## Conventions that bit this session

- `RESEND_API_KEY` lives in `apps/admin/.env.local`; Resend `GET /emails` is the delivery ledger
  (~28-day window) — independent of Supabase.
- The PAT in `apps/admin/.env.local` is DEAD (401). Local docker denial path or fresh PAT for
  `test:denial`.
- Any DNS edit: verify with `Resolve-DnsName` immediately; rollback = single TXT edit.
