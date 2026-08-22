# Login & Session Persistence — Full Analysis (5 passes)

**Date:** 2026-08-21
**Type:** Analysis only — no code or data was modified. Fixes execute in a follow-up session.
**Trigger:** Two members at gym RED (Katya, folio 1010 · Camila, folio 1011, coach/owner Narda) repeatedly report "wrong password" on the booking page; owner observed members must re-type their password on **every** visit.

---

## TL;DR

1. **Katya & Camila are probably not forgetting their passwords — they may not have one.** Both were seeded as `clientes`-only rows (`auth_user_id` NULL, `sin_invitar`, no claim_code). A login attempt against a nonexistent account returns the *same* opaque error as a bad password ("Correo o contraseña incorrectos."), so "the app says my password is wrong" is exactly what an accountless member experiences. One read-only query against `auth.users` settles it.
2. **Forced re-login every visit is real and structural.** Session persistence funnels all token rotation through two independent actors (the Node proxy on every request — including prefetches — plus visibility-gated browser auto-refresh) sharing ONE cookie-stored refresh token. Any raced/duplicated refresh returns `invalid_grant`, which auth-js treats as a hard sign-out: cookies wiped, BroadcastChannel signs out every open tab, refresh-token family revoked server-side. No retry, no grace.
3. Secondary amplifiers: host-only `__Host-` cookies fragment sessions across every hostname; reset emails fail silently while the UI always says "sent"; rate-limit lockout renders as "wrong password"; iOS ITP caps the script-written cookie to ~7 days; up to 4 sequential Supabase round trips per navigation multiply abort windows.
4. Ruled out: Narda's admin work (no admin path can delete memberships or touch auth.users), cookie maxAge (400 days), membership checks (graceful), caching (none).

---

## How to read this doc

- Sections: [Confirmed facts](#confirmed-facts--context) → [Wrong-password causes](#problem-1-wrong-password-reports-katya--camila) → [Re-login causes](#problem-2-forced-re-login-every-visit-critical-scope) → [Confirmation checklist](#confirmation-checklist-read-only-before-fixing) → [Hardening plan](#hardening-plan-for-the-execution-session) → [Handoff](#handoff-for-the-execution-session).
- Every finding has file:line evidence. Items marked **[VERIFY]** need a live-system check (read-only) before fixes are chosen.

---

## Confirmed facts / context

### Architecture of auth (as built today)

| Piece | Detail | Evidence |
|---|---|---|
| Cookie | Prod: `__Host-sb-auth-token`, `Secure`, `httpOnly:false`, chunked `.0/.1`, maxAge forced to **400 days** by `@supabase/ssr@0.10.3`. Dev: bare name over http. | `packages/data/src/cookie-options.ts:33-45` |
| Browser client | `createBrowserClient`, defaults ON: `persistSession`, `autoRefreshToken`; storage = `document.cookie` | `packages/data/src/client.ts:14-20` |
| Server/RSC client | `setAll` = try/catch **no-op during render**; can write during Server Actions only; comment defers rotation to the proxy | `packages/data/src/server/supabase.ts:25-50` |
| Proxy | Node runtime (Next 16 `proxy.ts`). Per request: tenant resolve → `getClaims()` to rotate expiring tokens → re-clones response with rotated cookies. Matcher covers everything except static assets — including prefetches. | `apps/client/src/proxy.ts:40-101` |
| JWT config | `jwt_expiry=3600`, refresh rotation ON, `reuse_interval=10s`, sessions table unbounded (`not_after=null`) → sessions renew forever if rotation never hard-fails | `supabase/config.toml:165-174`; ADR-0016 |
| Login | `signInWithPassword` in DAL; errors collapsed to two messages; success = Server Action writes cookies then `redirect('/reservar')` | `packages/data/src/server/sesion.ts:20-35`; `entrar/actions.ts:15-25` |
| Gate | `/reservar` reads claims server-side; no session → hard `redirect('/entrar')` | `reservar/page.tsx:53-69` |

### Member context

- Seed plan put Katya (`katya_jauregui@hotmail.com`) and Camila (`camilitarguez@icloud.com`) on LIVE as Stage-5 rows: **`clientes` only, `auth_user_id` NULL, `sin_invitar`, NO claim_code**. Accounts exist only after Narda sends each invite in-class and the member finishes `/activar`. (`docs/superpowers/plans/2026-07-20-red-gym-live-seed.md:371-372`; handoff `2026-07-20-red-gym-seed-members-handoff.md:10,66`)
- Precedent: Finding #16 (CONFIRMED) of the 2026-08-07 registration-gap audit — *"Admin-registered member who tries to LOG IN before self-registering gets a misleading 'wrong password'"* (`docs/Context/2026-07-08-red-member-registration-gap-audit-findings.md:54`).

---

## Problem 1 — Wrong-password reports (Katya & Camila)

All credential failures surface as exactly `"Correo o contraseña incorrectos."` (`sesion.ts:34`) — deliberate anti-enumeration, but it means members say "wrong password" for at least four distinct underlying states.

### Ranked root-cause candidates

**P1-1. No `auth.users` account exists (seeded-but-never-activated). — most likely**
Evidence: seed state above + Finding #16 precedent. Invites are sent manually one-by-one; an unsent/unopened invite leaves them accountless indefinitely.
**[VERIFY]** Query 1 in checklist below.

**P1-2. Account exists but with a password nobody knows (abandoned activation).**
`activar-cuenta` runs `admin.createUser(email_confirm:true)` immediately; the password is set later at `/activar/contrasena`. Abandon mid-flow ⇒ account with unknown password; magic-link fallback expires in 1h (`docs/superpowers/handoffs/2026-07-20-red-gym-seed-members-handoff.md:43`).
**[VERIFY]** auth row exists but `clientes.auth_user_id` still NULL.

**P1-3. Reset emails silently failing while UI always says "sent".**
`solicitarReset` discards the SDK error entirely (`sesion.ts:44-46`); `resetAction` hard-codes `{status:"sent"}`. Known failure modes: stale deployed `send-email` (live served v6 until 2026-08-04 per AGENTS.md), shared Resend key quota/suspension (`docs/Context/2026-07-22-invite-mail-capacity-audit.md`), documented Gmail spam landings, GoTrue mail cap 50/hr firing before the hook (`verify-email-ceiling.md`).
**[VERIFY]** Auth + edge-function logs around their reset attempts; Resend dashboard bounces; ask members to check spam.

**P1-4. Rate-limit lockout rendering as "wrong password".**
Only `email_not_confirmed` is special-cased; `over_request_rate_limit` / any 429 collapses into the wrong-password string (`sesion.ts:28-34`). Repeated retries (the reported behavior!) trigger and extend it.
**[VERIFY]** 429s on `/auth/v1/token` in Auth logs near complaint timestamps.

**P1-5. Duplicate accounts / email-variant mismatch.**
No unique constraint on `clientes.email/tel` (documented root cause of renewal duplicates); case/spelling variants create parallel auth identities; member remembers password A, types email of account B.

**Ruled out:** `email_not_confirmed` (distinct message, cannot present as wrong password); Narda-side breakage (see P4a below); client regex gate (correct autocomplete attrs, Enter works, paste allowed, banner visible).

### Owner-side audit (Pass 4a — clean bill)

- No admin flow deletes `gym_membership`; the table has **no INSERT/UPDATE/DELETE policy** (ADR-0013 §4) — revocation trigger fires only via direct DB surgery or gym deletion (which cascades to sign out everyone).
- Email edits on claimed rows are DB-blocked (`'No se puede editar el correo de una cuenta activa'`, migration `20260708220000…:51-53`).
- Duplicate-merge runbook halts on claimed rows; never touches auth.
- Zero password-reset/magic-link calls exist in apps/admin.

---

## Problem 2 — Forced re-login every visit (critical scope)

### Core mechanism (highest leverage)

**P2-1. Refresh-token replay = permanent family revocation, broadcast to all tabs.**
The proxy rotates server-side on EVERY request (`proxy.ts:83`) AND each visible tab independently rotates via `autoRefreshToken` (`createBrowserClient.js:38`) — both consume the same cookie-stored refresh token. A used-token 400 throws non-retryable `AuthApiError` (only fetch failures + 502/503/504/520–524/530 are retryable — `fetch.js:22-31,72`), so `_callRefreshToken` calls `_removeSession()` unconditionally (`GoTrueClient.js:3927-3931`): cookies deleted, `SIGNED_OUT` broadcast via BroadcastChannel to every tab. Server side revokes the whole token family outside the 10s reuse window. **No retry-with-backoff, no "already used" special-case exists in auth-js 2.106.2.** Flaky mobile networks (gym Wi-Fi, phone-first audience) make races routine.

**P2-2. Consumed-but-not-delivered rotation.**
Rotation sequence: POST /token succeeds (old RT consumed server-side) → new tokens ride back as Set-Cookie on the response. Abandoned navigation / aborted request / function death mid-response leaves the browser holding a CONSUMED token. Next attempt >10s later ⇒ P2-1. Amplifier: proxy awaits tenant DB lookup *before* auth work (`proxy.ts:42`→83), widening the window on every request.

**P2-3. Prefetch amplification.**
Matcher does not exclude `next-router-prefetch` requests (Next docs show the recommended exclusion; unused). Hover/tap-prefetched links run the full proxy exactly when tokens sit inside the 90s expiry margin (`EXPIRY_MARGIN_MS=90s`), multiplying race opportunities from P2-1/P2-2.

**P2-4. Round-trip pile-up.**
HS256 forces network verification: proxy `getClaims()` → remote `getUser()`; layout.tsx:58 repeats it; page gates repeat it again (`reservar/page.tsx:54`, `clase/[sessionId]:30`, `confirmada/:30`, `legal/:74`, `activar/:74`). React `cache()` memoizes the client instance, not results ⇒ **up to 4 sequential Auth round trips + 1 tenant DB lookup per navigation**, each an abort window feeding P2-2 and a chance for P2-5.

**P2-5. Transient GoTrue 500 = immediate local logout.**
A bare HTTP 500 from Auth is non-retryable ⇒ `_removeSession()`. One blip inside the pre-expiry window signs the member out permanently.

### Structural amplifiers

**P2-6. Host-only cookie fragmentation (dominant for cross-host behavior).**
`__Host-` prefix forbids a Domain attribute by RFC — `red.ibookit.lat`, `forge…`, `red-demo…`, `app.ibookit.lat` (deliberately unmapped fallback door), previews, and apex variants each hold a completely separate jar. Member who logs in via invite link on one host but bookmarks another = logged out with zero explanation. No canonical-host redirects exist anywhere (no www rows, exact-match RPC, nothing in proxy/next.config/vercel.json).

**P2-7. Pending domain move.**
`ibookit.lat` → `ibooki.lat` is pending (`PRODUCT-BRIEF.md:109-116`). Cutover orphans every `__Host-` cookie platform-wide; concurrent answering fragments sessions permanently across both registrable domains. Needs an explicit decision before cutover.

**P2-8. Email links bind sessions to the requesting host.**
Register/reset/activation links mint on the request's own host (`registro/actions.ts:45-58`, `entrar/actions.ts:34-38`, `activar/actions.ts:85-88`) — correct anti-hardcoding design (#217), but the resulting session lives in that host's jar alone. Recovery completed on the fallback host ⇒ later visits to `red.ibookit.lat` look signed-out.

**P2-9. iOS Safari ITP 7-day cap.**
Cookie is `httpOnly:false`; the browser client rewrites it via `document.cookie` on JS-side refreshes ⇒ ITP caps it to ~7 days regardless of the SDK's 400-day maxAge. iOS members lose sessions after a week away. Fix direction: make the cookie httpOnly server-written, or accept and document.

**P2-10. Chunked-cookie partial-write corruption.**
ssr 0.10.3 treats mismatched/partial `.0/.1` chunks as ABSENT (its own source names "random logouts"). An interrupted Set-Cookie sequence kills that device's session until manual re-login. Chunk size itself is safe (3180 < 4096 ceiling).

**P2-11. Legacy cookie-name orphaning (one-time, mostly historical).**
Cookies minted before #209 (old bare name) never resolve under `__Host-sb-auth-token`. One forced re-login per device post-deploy; easy to misread as recurring.

**P2-12. Background-refresh starvation.**
Browser auto-refresh is visibility-gated; the proxy is the only other seam. Router-Cache hits skip the proxy entirely. Returning after >1h relies wholly on the first proxy load succeeding — any transient failure there (P2-2/P2-5, tenant DB hiccup upstream of auth) lands on `/entrar`.

### Device/UX residue

- Password value never trimmed (email IS trimmed, `sesion.ts:26`) — trailing space from autofill fails invisibly.
- `/entrar?error=confirmacion` written by `auth/confirm/route.ts:110` but **never read** — dead-end blank login after expired recovery link.
- Clean: autocomplete attrs, no PWA/SW storage eviction, no caching hazards, error banner visible, membership checks graceful, clock skew immaterial.

---

## Confirmation checklist (read-only, before fixing)

1. **Discriminates P1-1/P1-2/P1-5 in one shot:**
   ```sql
   select id, email, email_confirmed_at, created_at, last_sign_in_at
   from auth.users
   where email ilike 'katya_jauregui%' or email ilike 'camilitarguez%';
   ```
   Then join `clientes.auth_user_id` (RED gym row) for each hit. NULL/no row ⇒ P1-1. Row exists + cliente unclaimed ⇒ P1-2. Multiple rows ⇒ P1-5.
2. Auth logs near complaint timestamps: 400 `invalid_grant` on `/token` (⇒ P2-1/P2-2 confirmed in the wild), 429s (⇒ P1-4), `send-email` function invocations with non-2xx (⇒ P1-3).
3. Resend dashboard: bounces/complaints for the two addresses.
4. Ask Narda whether she ever sent the invites to Katya/Camila, and ask the members to search spam for "ACTIVAR MI CUENTA" / "Restablece tu contraseña".

---

## Hardening plan (for the execution session)

Ordered by leverage. Nothing here is applied yet.

### A. Immediate member recovery (no code)
- Run checklist #1; depending on result: re-send invite from ficha, or walk through `/registro`, or send a fresh reset.

### B. Wrong-password surface
- Map `over_request_rate_limit` (and other codes) to honest, distinct copy instead of collapsing into "Correo o contraseña incorrectos."
- Trim submitted password (client + server parity with the email trim).
- Read and display `?error=confirmacion` on `/entrar`.
- Consider surfacing "cuenta no activada aún — revisa tu invitación" affordance within anti-enumeration constraints (e.g., unconditional first-time nudge already exists at `entrar-form.tsx:237-255`; evaluate strengthening it).
- Make reset-path failures observable: stop discarding `solicitarReset` errors internally (still show generic copy outward, but log/alert).

### C. Session persistence core (critical scope)
1. **Exclude prefetches from the proxy matcher** (`next-router-prefetch` header condition per Next docs) — removes the biggest race amplifier.
2. **Graceful invalid_grant in proxy:** on refresh failure, respond without rotating (do not propagate a sign-out); let whichever actor holds newer valid cookies win. Investigate upgrading/auth-js patching for used-token tolerance.
3. **Dedupe the per-render `getClaims()` calls** (layout + page gate double/triple the Auth round trips).
4. **Move tenant resolution off the critical pre-auth path** in the proxy (or cache aggressively) to shrink the consumed-token exposure window.
5. **Evaluate `httpOnly:true`** for the auth cookie (kills the ITP 7-day cap, P2-9; requires moving all browser-side session reads server-side — check perfil-overlay usage) and/or **asymmetric signing keys** so `getClaims()` verifies locally without a network `getUser()`.
6. **Canonical-host policy:** decide redirect strategy for variant hosts (www/apex) and document the `app.ibookit.lat` fallback-door trade-off.
7. **Domain-migration plan** for ibookit→ibooki before cutover (accept mass re-login once, or bridge).

### D. Shielding — tests/guards/observability (prevent recurrence)
- E2E regression test: "login → close context → revisit `/reservar` stays logged in" (would have caught this class).
- Log-based alert on `invalid_grant` spikes and on `send-email` non-2xx rates.
- Drift-guard test asserting identical cookie options across ALL client construction sites (#209-style guard generalized).
- Denial-suite assertion: no new RPC/migration may delete `auth.sessions`/`refresh_tokens` outside the documented revocation trigger (write-bearing coverage rule applies).
- Document the session architecture contract in an ADR addendum (rotation ownership: who rotates, who must tolerate races).

---

## Handoff for the execution session

**Mission:** restore "login once, stay logged in" for gym members, and close the false-wrong-password surface.

**Ground rules (inherited from AGENTS.md / this analysis):**
- Live DB is production. Read-only queries only until Phase 0 completes; never push migrations to remote; scratch project required for `test:denial`.
- Edge-function changes deploy separately from git pushes (pre-push hook blocks `supabase/functions/**` ranges).

**Suggested slicing:**
1. **Slice 0 (evidence, read-only):** run the confirmation checklist; record results here. Determines whether A is invite-vs-reset-vs-duplicate handling.
2. **Slice 1 (member recovery):** apply remedy A for Katya/Camila based on evidence; confirm with Narda they can book.
3. **Slice 2 (quick wins, small diffs):** B items — rate-limit copy, password trim, `?error=confirmacion`, reset-error observability. Each independently shippable.
4. **Slice 3 (core persistence):** C1–C4 (matcher filter, invalid_grant grace, getClaims dedupe, tenant-off-critical-path). Ship behind measurement; verify with the new e2e test from D.
5. **Slice 4 (structural):** C5–C7 (httpOnly/signing keys evaluation, canonical hosts, domain-move plan). These deserve their own wayfinding/spec pass — bigger blast radius.
6. **Slice 5 (shielding):** D guards land alongside their related fixes; e2e test should land BEFORE Slice 3 changes so it proves the improvement.

**Definition of done:** Katya/Camila resolved and confirmed booking; a returning member with a prior session reaches `/reservar` logged-in across days and across normal mobile network flakiness (proven by e2e); false-wrong-password states are distinguishable to members; guards green in `pnpm test`.

---

## Execution session results (2026-08-21)

### Slice 0 — evidence (checklist ran against LIVE, read-only)

- **Katya (`katya_jauregui@hotmail.com`)**: fully activated 08-13 23:55 (auth row + `clientes.auth_user_id` linked + terms stamped). Her activation session stayed alive and **auto-refreshed for 8 days** — last rotation 08-21 21:56:48 UTC, status 200 — and **37 seconds later she signed in with her password anyway** (new session 21:57:25). Server-side persistence works; the browser flow put her in front of a password form regardless. Not P1-1/P1-2.
- **Camila (`camilitarguez@icloud.com`)**: **P1-1 CONFIRMED.** Invite sent 08-14 00:36 (`invitacion_enviada_at` set, claim_code `FOKKTA8E`), never activated, NO `auth.users` row. Her "wrong password" is a login attempt against a nonexistent account. Same state: Camila Reyes (`Camisofi48@gmail.com`), invited 08-14, unactivated.
- **Auth logs (24h)**: **ZERO `invalid_grant`** — the P2-1/P2-2 race class is not occurring in prod. 4× `invalid_credentials` 20:44–20:45 from `red.ibookit.lat` (consistent with an accountless member retrying). No real 429s.
- **Re-login epidemic confirmed at scale**: members hold stacks of password-login sessions (elsa 8 in 4 days, sandynuta 7, vallesyeira 6, yolandaaraly 6) while old sessions keep refreshing server-side.
- **P2-4 stale**: `/.well-known/jwks.json` is actively fetched — asymmetric signing keys are LIVE; `getClaims()` verifies locally, not via network `getUser()`.
- `auth.audit_log_entries` is empty on hosted Supabase (audit rides the 24h log pipeline); Resend dashboard not checked (no access from this session).

### Corrected root cause (not in the analysis above)

**The auth surface is session-blind.** `/entrar` and `/registro` never checked claims, and the public-header drawer's "Clases" + "Reservar clase" CTAs targeted `/registro` for everyone — signed-in members included. A member whose session the proxy had just refreshed successfully was still funneled: drawer CTA → `/registro` → "¿Ya tienes cuenta? Entrar" → password form. Katya's 37-second gap is exactly that walk. The doc's race mechanisms (P2-1/P2-2) are real-but-latent; they were not the live pain.

### Shipped (branch `session-persistence-fix`)

- `/entrar` + `/registro`: live session (`getClaims`) → `redirect("/reservar")`.
- Drawer "Clases" / "Reservar clase" → `/reservar` when signed in.
- Proxy fail-soft: a `setAll` batch that is deletions-only (auth-js `_removeSession` after a failed refresh) is suppressed — a transient refresh failure can no longer wipe a device's cookies (`esBorradoTotal` + tests); `getClaims()` throw no longer 500s the request.
- §B quick wins: `over_request_rate_limit`/429 → distinct honest copy; password trim parity across ALL set/verify sites + one-shot raw retry for pre-parity hashes (retry gated to genuine credential failures, its own throttle mapped honestly); `?error=confirmacion` now renders a banner on `/entrar`; `solicitarReset` failures logged (packages/data JSON log shape), outward copy unchanged.
- SinMembresia sign-out escape hatch (`cerrar-sesion-link.tsx`): the /entrar redirect would otherwise trap a wrong-account member (live session, no membership in this gym) with no path back to the login form — found by the final adversarial review pass.
- **C1 prefetch exclusion investigated and REJECTED** (recorded in `proxy.ts` doc-comment): Next 16 strips flight headers before the proxy runs; a matcher-level skip breaks marca stamping; a `purpose: prefetch` in-handler skip relocates rotation into the RSC render where rotated tokens are discarded (manufactures P2-2). Revisit only if `invalid_grant` appears in auth logs.

### Deferred (deliberate)

C3 (`getClaims` dedupe), C4 (tenant off critical path), C5–C7 (httpOnly/signing-key follow-through, canonical hosts, domain move — own spec pass), §D e2e (no e2e infra exists in the repo; the routing gate ships untested at the browser level — named debt), shared-constant for `confirmacion`, shared password-normalization module, admin login-form trim asymmetry (outside the DAL, latent).

### Owner actions (Slice 1 — member recovery)

- **Camila**: no code fixes her — she needs her ACTIVAR email. Have her search inbox/spam for "ACTIVAR MI CUENTA", or Narda re-sends the invite from her ficha. Claim code `FOKKTA8E` is still unclaimed. Same for Camila Reyes if she reports trouble.
- **Katya**: nothing to do — after this deploy her existing session carries her straight to `/reservar`.
