# Activation / invitation / recovery — security + UX audit

**Date:** 2026-07-22 · **Trigger:** owner test of single-email activation surfaced a "confirm your email
again" + unexpected password-reset email · **Method:** 4 adversarial finder lenses → per-finding
skeptic verification (26 agents). Severities below are the **post-verification** ratings.

## The incident that started this — NOT a bug

The owner tested with `d3bigwlf@gmail.com`, which is a **genuine multi-gym member**: a roster row on gym
`daa1c888` (claimed since 2026-01-23, real account + password) and a new unclaimed row on gym `968bafb0`
(claim_code `5QIOUHS2`, created during the test). Activating the second gym's invite for an email that
already owns an account correctly took the **`cuenta_existente` branch** (`activar/actions.ts:71-77`) →
recovery email. Auth log confirms: `POST /admin/users → 422 email_exists`, then `POST /recover`.

This is the existing-account rail working as designed: a pre-existing account requires **inbox proof**
before it gets a session, so it never gets the frictionless new-account path. The friction is real but
scoped to the multi-gym subset — and its fix is the UX redesign in §4, not a bug fix.

## Root cause of the security exposure (one sentence)

The 8-char `claim_code` is a **no-expiry, single-use bearer token**, and the only gates on redeeming it
are (a) that it stays secret, (b) an app-tier email-match that a leaked link satisfies trivially, and (c)
Turnstile — which defaults to Cloudflare's **always-pass test keys** and has no rate limit behind it. So in
practice **possession of a code ≈ possession of the paid membership.** Every high/medium finding is a
variation on that.

## 1. HIGH — three faces of "the code/link is the only credential"

### H1 · `reclamar_por_codigo` binds any verified session to a coded row with no identity check
`supabase/migrations/20260708200002_reclamar_por_codigo_rpc.sql:57-83`. The RPC resolves the row by
`claim_code` alone, then stamps `auth_user_id`, **overwrites `clientes.email` with the caller's login
email**, clears the code, and upserts membership — **never comparing the caller's email to the row's**.
It's `grant execute … to authenticated` and called as a plain `supabase.rpc` (`registro.ts:167`), so it's
**directly reachable via PostgREST** with any user JWT. The edge-fn email-match (`nucleo.ts:121`) and
Turnstile are in front of the *app* path, entirely off the RPC path.

**Impact:** an attacker with any verified account + one leaked/forwarded/shared-history code POSTs
`{p_codigo}` and takes the victim's paid balance, hijacks the contact email, gains membership at a gym they
never paid, and **locks the real member out** (code cleared, `auth_user_id` set → their own link returns
`codigo_invalido`). One code = one victim (not mass-exploitable; enumeration is impractical at 34⁸).

**`by_design` caveat:** the email-agnostic bind is *required* for the legitimate multi-gym case (staff may
have typed a different email than the member's login), so the fix **cannot** be a naive email-match — see §3.

### H2 · `/auth/confirm` honors an attacker-controlled `&codigo=` on any recovery session
`apps/client/src/app/auth/confirm/route.ts:40-45`. `finalizarAuth` runs `reclamarPorCodigo(codigo)`
whenever `codigo` is in the URL — even on `next=/restablecer`. The plain forgot-password link
(`entrar/actions.ts:38`) carries **no** codigo and its query string is attacker-controlled, so H1 becomes a
**zero-tooling UI attack**: request a password reset for your *own* account, append `&codigo=VICTIM_CODE`
to the link, click. Second vector: `/registro?codigo=VICTIM_CODE` + confirm your own inbox. Same root
cause and same fix as H1.

### H3 · New-account path provisions a logged-in account with **no inbox proof**
`supabase/functions/activar-cuenta/index.ts:92` — `createUser({email_confirm:true})` + an in-request
recovery session. The invite link is now fully self-contained: it carries the no-expiry code **and**
`&correo=<member-email>` (`invitaciones.ts:206`), which the page pre-fills read-only. So a
forwarded/leaked/kiosk-history link is a complete activation credential — the holder sets *their own*
password and claims the balance, with the account under the victim's real email. Deliberate #126 tradeoff
("nothing to steal on a brand-new account"), but worth reconsidering for a paying client, and the
`&correo=` addition materially widened it.

## 2. Config — the amplifier that makes everything above worse (LAUNCH GATE)

**Turnstile defaults to always-pass TEST keys and nothing else throttles the path.** Both
`TURNSTILE_SECRET_KEY` (server, `turnstile.ts:14/23`) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (widget,
`activar-form.tsx:14`) fall back to Cloudflare's always-pass test keys when unset. There is **no
`middleware.ts` and no per-IP/per-code rate limit** anywhere on `activarAction`, the edge fn, or the claim
RPCs (the contact form, by contrast, has a per-IP DB limit). If prod ships with these env vars unset (the
owner's documented "post-queue step"), the sole anti-automation gate is a no-op. **Verify these are set in
the client Vercel project before launch** and add a boot/health assertion that refuses the known test
secret. The same helper backs the contact-form and registration surfaces, so this protects more than
activation.

## 3. The security fix that closes H1 + H2 without breaking multi-gym

`reclamar_por_codigo` must stop being freely callable with just a code. Match the pattern the **email-claim
rail already uses**: `reclamar_o_crear_cliente` requires a **server firma over `uid:gym_id`**
(`20260713190000`), so only the app server (after its gates) can invoke it. `reclamar_por_codigo` passes
**no firma at all** — that asymmetry is the hole.

- **H1 fix:** require a server-minted firma (e.g. over `codigo`, minted only after the app-tier gates run)
  before the RPC will bind. A bare PostgREST call with just `p_codigo` then fails. Preserves the
  email-agnostic bind (staff-typo tolerance) while removing the direct trust-boundary bypass.
- **H2 fix:** on the recovery arm, only run the code-claim if the `codigo` was cryptographically bound to
  *that specific* reset — otherwise gate the `/auth/confirm` code-claim to the invite-signup arm and drop
  "runs even when `next` is set."
- **Do not** simply require `caller.email == row.email` — that breaks the deliberate multi-gym linking.

## 4. The UX fix the owner actually asked for — magic-link, no password reset

Replace the `cuenta_existente` → `solicitarReset` call (`activar/actions.ts:76`) with a magic link.
**All primitives already exist:**

- **Step 1 — logged-in short-circuit:** on `/activar?codigo=`, `getClaims()`; if a live verified session
  exists, render "Vincular {gym} a tu cuenta" with a one-click button → `reclamarPorCodigo(codigo)` on the
  current session → `/reservar`. No email, no password. *(Owner note: this introduces a new reachable
  claim path — live session + code → immediate bind — so decide it explicitly; it stays inside the
  ADR-0015 bearer model but is not a pure no-op.)*
- **Step 2 — existing account, not logged in:** `signInWithOtp({ email, options: { shouldCreateUser:
  false, emailRedirectTo: \`${origin}/auth/confirm?codigo=CODE&next=/reservar\` } })`. The send-email hook
  already mints `/auth/confirm?…&token_hash&type=email` for magiclink, the confirm route already accepts
  `type=email` and runs `reclamarPorCodigo` on the session, landing at `/reservar`. **Membership linked,
  member logged straight in, password never touched.**

**Boundary:** a magic link proves inbox ownership exactly as the recovery link does, so the
takeover protection is fully retained — and it's strictly *safer* (no password-change surface, can't
overwrite the member's working credential). This also removes the two medium/low UX findings below.

Keep the reset rail only for the true "I forgot my password" flow at `/entrar`.

## 5. Medium / Low / Info (deduplicated)

| Sev | Finding | Location | Note |
|-----|---------|----------|------|
| Med | `claim_code`+`correo` ride cleartext URLs into logs/history/Referer | `invitaciones.ts:206`; no `Referrer-Policy` set | Set `Referrer-Policy: no-referrer` on activar/confirm; strip params post-read; scrub logs; give code a TTL |
| Med | Multi-gym invite sends a "reset your password" email that contradicts the in-app "vincular tu membresía" promise + forces a gratuitous account-wide password change | `activar/actions.ts:76` | Fixed by §4 (magic-link) |
| Low | One identity across gyms: setting a new password at gym B invalidates the gym-A login | `activar/actions.ts:76` | Fixed by §4 (no password touched) |
| Low | No throttle/dedupe on `solicitarReset` → targeted reset-mail nuisance + shared Resend/GoTrue budget | `sesion.ts:45` | Add a `codigo+email` cooldown; chains with the 6th ficha-edit auto-send rail |
| Low | `invitacion_info` is an anon, unthrottled code-validity + {gym, first-name} oracle | `20260708200003:27` | By-design ADR-0015; keyspace blocks mass harvest; same data the `/activar` page shows |
| Low | Non-constant-time firma compare | `nucleo.ts:80` | Immaterial (server mints firmas anyway); one-line constant-time swap |
| Low | `cuentaExistente` branch reveals a member has an account elsewhere | `activar/actions.ts:71` | Minor cross-tenant existence leak |
| Info | Firma domain separation is only accidental (one key, two message schemes, no context tag) | `nucleo.ts:46` | Add `activar:v1:` / `tenant:v1:` prefixes when convenient |
| Info | Frictionless new-account vs inbox-proof existing-account asymmetry confuses testers | `index.ts:92` | Document the deliberate boundary; soften the "invitation IS the verification" comment |

**Positive findings (verified sound):** the `token_hash` / in-request session handling is correct;
`reclamar_o_crear_cliente` is correctly tenant- and identity-bound (firma over `uid:gym_id`). One finder
finding — "activarAction is a firma-minting takeover oracle" — was **REFUTED** on verification (its real
levers are the rate-limit and Turnstile findings; a live code can't be found without brute-forcing 34⁸).

## Recommended order

1. **Before launch (config, owner):** set real Turnstile keys in the client Vercel project + boot assertion. (§2)
2. **Before launch (code):** firma-bind `reclamar_por_codigo` + gate the `/auth/confirm` codigo-claim. (§3 → closes H1, H2v1; H2v2 residual — see addendum)
3. **Before/at launch (UX):** magic-link redesign for existing accounts. (§4 → closes the incident + 2 UX findings)
4. **Soon:** code TTL + `Referrer-Policy` + strip `&correo=`/params from URLs + reset-send cooldown. (§5)
5. **Owner decision:** keep `email_confirm:true` no-inbox-proof for new accounts, or restore inbox proof. (H3)

## Addendum — 2026-07-22, post-implementation review (branch `activation-magic-link`)

§3/§4 were implemented (magic-link existing-account rail + one-click `vincular` + firma-bind).
An adversarial review (3 lenses → skeptic-verified) confirmed **one gap the original §3 over-claimed**:

**H2 is only *partly* closed. The firma binds the CODE (`activar:v1:${codigo}`), not the caller.**
`§3` assumed a code-firma would close *both* H2 vectors, but the second vector — **`/registro?codigo=`**
— survives. `registrarAction` mints a valid firma for **any** code the caller submits, with no
identity gate, then the confirmation link lands in the **caller's own** inbox. So a holder of a
leaked/forwarded code can: sign up with *their* email + the victim's code → confirm *their* inbox →
`reclamar_por_codigo(code, valid-firma)` passes every gate → **victim's paid row rebound to the
attacker, email overwritten, victim locked out.** Same one-victim-per-code, non-enumerable (34⁸)
bound as H1; **pre-existing on `main`** (not a regression — `main` does the identical one-arg claim);
**same class as the `vincular` short-circuit the owner explicitly accepted** under the ADR-0015 bearer
model.

- **What the firma DID close (shipped):** H1 (direct PostgREST `reclamar_por_codigo(code)`), and H2v1
  (attacker-appended `&codigo=` on a plain recovery link — it carries no firma → RPC refuses, writes
  nothing). Both verified by denial-suite V8.
- **What remains (H2v2 residual, owner decision):** the invite email now targets **`/activar`** only,
  so the `/registro?codigo=` claim arm is **legacy** — no legit invite traverses it. Options: **(a)**
  accept it (consistent with the accepted `vincular`); **(b)** remove the `/registro` code-claim arm so
  `/activar`'s email-gated door is the sole invite path (small diff, closes H2v2, but retires an
  ADR-0015-documented rail — check no in-flight invite links still point at `/registro`); **(c)**
  recipient-bind the code (deeper; conflicts with the deliberate staff-typo email-agnostic tolerance).
- **Not chosen autonomously:** removing a live ADR rail and adding the forbidden `caller.email ==
  row.email` gate were both left for this decision.
