# Incident report — Sarahí wedge, RED gym, 2026-08-30

Read-only synthesis of 5 recon seats (34 findings, adversarially verified). Nothing was edited; all SQL was SELECT-only against live prod.

---

## 1. Root cause

At 21:57 Sarahí signed up on the correct host — `/signup`'s logged `redirect_to` echoed `https://www.redfunctionaltraining.com/auth/confirm` unclamped, which GoTrue only returns for an allow-listed URL, so the mail was minted on www and **H-A is refuted**. Her ~22:18 click then produced **zero `/auth/v1/verify` requests project-wide** (only two exist in the whole window, both other members, both 200), which means `apps/client/src/app/auth/confirm/route.ts` fell through to `:110` without ever calling `verifyOtp` — the URL that reached the route carried no usable `token_hash`/`type`. Why it arrived that way is **unproven and unprovable from Supabase**; it needs the Vercel access log (open question Q1). What is fully proven is everything downstream: that route collapses four structurally distinct failures into one unlogged redirect to `/entrar?error=confirmacion` (`route.ts:94-110`), whose banner (`entrar-form.tsx:24-25`) tells her to "entra con tu contraseña" — guaranteed to fail with `email_not_confirmed` for an unconfirmed account (8 logged 400s, 22:07–22:44) — "o pide uno nuevo", a control that **does not exist anywhere in the product** (`grep "\.resend("` over `apps/` + `packages/` returns zero hits). Her only remaining affordance was re-POSTing `/registro`, which `packages/data/src/server/registro.ts:93-103` executes unconditionally with a byte-identical "Revisa tu correo" success screen (`registro-form.tsx:92-97`) — while `auth.one_time_tokens` carries a `UNIQUE (user_id, token_type)` index, so **every resubmit provably destroys the previous link**. Four mails, four `flow_state` rows all with `auth_code_issued_at NULL`, one surviving token stamped 22:25:18. Meanwhile the desk sale at 22:22 (`registrar_venta.sql:142-150`, dedupe scoped to `public.clientes` only, live `prosrc` contains zero references to `auth.users`) minted a **second, disconnected identity** with `claim_code YC2YQCPJ` and `auth_user_id NULL`, and no admin surface anywhere reads auth state (`grep "auth\.users" apps/admin/src packages/data/src` → zero), so neither she nor the gym had a way to see or exit the wedge. Repair required a developer running raw SQL against prod.

**One-line version:** an unexplained first-click failure was converted into a permanent wedge by three confirmed defects — an undiagnosable catch-all error path, a nonexistent resend door advertised in the copy, and a retry affordance whose only effect is to kill the newest link — with zero detection on either side.

---

## 2. Failure catalog

### P0

| ID | Mechanism (one line) | Scope | Verdict |
|---|---|---|---|
| **FC-01** | No resend-confirmation door exists: `grep "\.resend("` over `apps/`+`packages/` = 0 hits; the only fresh link comes from re-POSTing `/registro`. | all-gyms | CONFIRMED (LM-3, AR-2) |
| **FC-02** | Each `/registro` resubmit silently rotates the single confirmation token (`auth.one_time_tokens` UNIQUE `(user_id, token_type)`) while `registro.ts:93-103` → `registro-form.tsx:92-97` reports identical success — **the retry is the damage**. | all-gyms | CONFIRMED (AR-1, LM-3, F1) |
| **FC-03** | `auth/confirm/route.ts:110` is one unconditional catch-all for four distinct causes (no params / bad `type` / PKCE reject / OTP reject) with **zero log lines** — sibling `solicitarReset` (`sesion.ts:93-106`) already logs, so this is an omission, not a constraint. This is why the root cause is unproven. | all-gyms | CONFIRMED (AR-3) |
| **FC-04** | Wedged accounts are invisible to everyone: no code anywhere reads `auth.users`; `reclamar_o_crear_cliente.sql:33-35` refuses while `email_confirmed_at is null`, so the "Registrados online" tile (`lifecycle.ts:503`, keyed on `clientes.auth_user_id`) can never fire. Live: 4 of 53 accounts wedged, one for 17 days. | all-gyms | CONFIRMED (ADM-1, AR-4) |
| **FC-05** | The only alerting mechanism (`apps/admin/src/app/api/cron/alertas/resumen.ts:32-55`) watches exactly two signals — `invalid_grant` and `send-email` non-2xx — and **both returned 0 for the incident window when re-run live**. A clean "all clear" would have gone out. | all-gyms | CONFIRMED (F3) |
| **FC-06** | Desk sale mints a parallel identity: `registrar_venta.sql:142-150` dedupes only on `public.clientes`; `vender.tsx:134-146` matches only the loaded roster. Her auth metadata carried `phone_e164 "+526144869633"` and an exact email match — **both dedupe axes had the signal and neither was consulted**. | all-gyms | CONFIRMED (ADM-2, ADM-5) |
| **FC-07** | The send-email hook fails open on a clamped `redirect_to`: `correo.ts:58-66` throws only on empty, so a Site-URL-clamped value mints happily as `https://red.ibookit.lat/?token_hash=…` — no `/auth/confirm`, token stranded, RED-branded mail to another gym's member (`index.ts:46-68`), Resend 2xx, hook 200, zero trace. **Latent today** (all live hosts verified allow-listed); armed for the next BYO domain. | at-scale | CONFIRMED, latent (LM-2) |
| **FC-08** | One `RESEND_API_KEY` backs four rails (`send-email/index.ts:29,113`; `invitaciones.ts:49-66`; `recibo-envio.ts:32`; `cron/alertas/route.ts:154`) and is also the Supabase custom-SMTP password. Resend's 0.08% complaint / 4% bounce thresholds are account-level, "shut down without warning". **The alert channel shares the failure domain with the thing it detects.** | all-gyms | CONFIRMED (F2) |
| **FC-09** | The auth-email quota is one project-wide bucket (Supabase docs: "Sum of combined requests project-wide", live-set 50/hr) with zero app-side throttle; GoTrue's only floor is 60s per address = **60/hr, above the whole platform's 50/hr budget**. One wedged member can starve every other gym. Live proof of resend: `confirmation_sent_at` − `created_at` = +27m57s. | all-gyms | CONFIRMED, exposure not yet triggered (F1) |

### P1

| ID | Mechanism | Scope | Verdict |
|---|---|---|---|
| **FC-10** | Site URL is one tenant's retired host (`https://red.ibookit.lat`, proven by 4 controlled GoTrue probes). Any non-allow-listed or missing `redirect_to` 303s to RED's branded home page with the path stripped — and because the clamp happens *before* the hook fires, the mail body is branded "RED" too. | all-gyms | CONFIRMED (D2, D1) |
| **FC-11** | RED has two live member-facing hosts with disjoint `__Host-` cookie jars (`cookie-options.ts:36-52`); `proxy.ts`/`resolve-tenant.ts` never compare request host to `es_principal`, and no Vercel redirect exists. Sign in on one, be signed out on the other. | this-gym (all-gyms on any future domain change) | CONFIRMED, but a **ruled tradeoff** — runbook §7 mandates permanent dual-door (LM-4, D3, D6, AR-10) |
| **FC-12** | Three outbound host policies coexist: invite mail reads `es_principal` (`invitaciones.ts:129-137`), the three auth rails mint on the live request host (`registro/actions.ts:45`, `entrar/actions.ts:34`, `activar/actions.ts:85`), inbound resolution ignores `es_principal` entirely. | all-gyms | CONFIRMED (D8, LM-4) |
| **FC-13** | Adding a `gym_domain` row silently requires 3–4 console-only companions (Auth allow-list, Turnstile hostnames, Vercel domain attach, ±Site URL) with **zero machine guard** — all 16 `tools/guards/*` replay migrations and are blind to console state. The 2026-08-27 near-incident is this exact shape. | all-gyms | CONFIRMED (D4) |
| **FC-14** | Turnstile is a hard silent gate: `disabled={!turnstileToken}` (`registro-form.tsx:284`, `activar-form.tsx:199`), no `onError` on the `<Script>` tags, no message, no timeout, no retry — and **nothing is POSTed, so this failure has zero server-side trace**. Instagram in-app webview is the gym's actual traffic source. | all-gyms | CONFIRMED (AR-7) |
| **FC-15** | One platform Turnstile widget with a build-inlined sitekey (`turbo.json` `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); 6 of Cloudflare's 10 hostnames used. **BYO domain #5 kills signup for that gym, undiagnosably.** | at-scale | CONFIRMED (D5) |
| **FC-16** | `enviarMagicLink` (`sesion.ts:119-130`) discards the entire `signInWithOtp` result and returns `{ok:true}` unconditionally; `activar-form.tsx:90` then promises "Revisa tu correo". The rescue rail can fail in total silence. | all-gyms | CONFIRMED (AR-5) |
| **FC-17** | The dead-link banner gives two impossible instructions (`entrar-form.tsx:24-25`): password login is *guaranteed* to fail for this cohort (`sesion.ts:52-55`), and "pide uno nuevo" names no control. | all-gyms | CONFIRMED (AR-6) |
| **FC-18** | `registrarSocio` never reads `data.user.identities`, so re-registering an already-**confirmed** email shows "Revisa tu correo" for a mail GoTrue never sends. | all-gyms | CONFIRMED (AR-8) — exact GoTrue branch depends on a dashboard toggle not readable via SQL |
| **FC-19** | Raw English GoTrue `error.message` rendered verbatim in the Spanish signup form (`registro.ts:101` → `registro-form.tsx`), while `sesion.ts:16-25` already maps codes for login. | all-gyms | CONFIRMED (AR-9) |
| **FC-20** | The 4-state invite badge (`derive.ts:138-165`) is a pure function of 3 `clientes` columns — no `email_confirmed_at`, no send count, no expiry. Schema check confirms **no column exists** that could feed a richer state. | all-gyms | CONFIRMED (ADM-3) |
| **FC-21** | REENVIAR (`clientes.ts:587-595` → `preparar_invitacion.sql`) only regenerates `clientes.claim_code`; it cannot touch a Supabase Auth confirmation token. The one self-serve remediation button cannot reach this failure class. | all-gyms | CONFIRMED (ADM-4) |
| **FC-22** | `/auth/confirm` consumes the single-use `token_hash` on a bare GET (`route.ts:100-110`), burnable by any prefetcher/scanner — flagged as "highest-severity finding" in `docs/Context/2026-08-19-member-reachability-todo.md` item 2, still unchecked. | all-gyms | CONFIRMED defect; **PLAUSIBLE only** as tonight's cause (F6) |
| **FC-23** | `test:e2e` drives one origin (`playwright.config.ts:58`) and there is **no signup-rail e2e at all** — the registration/confirmation door has never been exercised end-to-end by any automated test. | all-gyms | CONFIRMED (D7) |
| **FC-24** | A signed-in member on another gym's host is served *their own* gym's agenda under the host gym's brand: `agenda-miembro.ts:139-143` `limit(1)` with no gym filter, `inquilino.ts:80-84` falls back to the oldest membership. | at-scale | CONFIRMED (D9) |

### P2 (verified, deferred)

`LM-5` no invariant requiring exactly one `es_principal` per (gym, app) — only a partial unique index forbidding two · `LM-6` the documented one-toggle SMTP rollback is **not** behaviour-preserving (swaps browser-independent `token_hash` for browser-and-host-bound PKCE `?code=`, fatal for the Instagram funnel) · `LM-7` member email in the invite query string (`invitaciones.ts:240`) lands in CDN logs and third-party Referers · `AR-11` `reclamar_o_crear_cliente.sql:50-53` silently creates an empty cliente when the email matches 0 or ≥2 unclaimed rows · `AR-12` `'Teléfono requerido'` refusal swallowed forever by `/reservar`'s retry (`reservar/page.tsx:65`) · `AR-13` identical subjects (`correo.ts:82`) thread all resends into one Gmail conversation · `AR-14` the manual repair left live `confirmation_token`s on both rows · `D10` no self-serve domain provisioning (1 migration + ~3 console visits per host) · `F5` DMARC `p=none` with no `rua=`, no MX — the platform cannot detect its own spam placement.

### Graveyard (refuted — do not re-find)

- **H-A (hook picks the wrong host)** — REFUTED. `correo.ts:58-66` takes `redirect_to` verbatim and reads no table; the only `gym_domain` read (`index.ts:46-68`) sets the display name. `/signup` echoed the full www redirect, which only survives an allow-list pass.
- **"auth_logs `referer` shows the member's host"** — REFUTED as a general reading. It is `validated redirect_to → validated Referer → SiteURL`, proven by 4 controlled probes; `/token` and `/.well-known/jwks.json` are server-side Vercel calls, so their `red.ibookit.lat` value is the SiteURL fallback, not a member location.
- **H-C as this incident's cause** — REFUTED (mechanism real, see FC-11): her signup and confirmation link were both on www.
- **"The gym saw nothing / no cliente row existed"** — FALSE. Both victims had desk rows with invites already sent (Sarahí 22:22, Iván 2026-08-29 20:48). The invisible thing was the *auth-side wedge*, not the member.
- **"Iván invisible 34h"** — wrong figure. Invisible ~7h, wedged ~34h.
- **F4 (uncaught `gymNombrePorHost` throw → GoTrue rolls back the user)** — REFUTED. postgrest-js v2 never throws without `.throwOnError()`; zero call sites in the repo use it.
- **"Token burned by the clamp"** — corrected to *stranded*. Nothing calls `verifyOtp` on the clamped landing, so it expires unused and the same email works once the allow-list entry lands.
- **`hitl-72-resend-live.md:224,248` still claims a loud error** — REFUTED, fixed at 95583ac. The stale copy lives at `docs/Context/2026-08-19-member-reachability-todo.md:154`.
- **"Gmail expands the oldest message"** — inverted; identical subjects are what matter.
- **"~50/hr is definitely the operative cap"** — project-wide *scoping* is confirmed from Supabase docs; the *value* is attested only by this repo's runbook.
- **The 08-30 23:44–23:52 `/verify` rows across six hosts** — recon-agent probe traffic, not production signal.

---

## 3. Shield plan

### (a) Code fixes, in order

**1. Instrument `/auth/confirm` — prerequisite for everything else.**
`apps/client/src/app/auth/confirm/route.ts:94-110`. One structured `console.warn(JSON.stringify({event:"confirm-fallo", motivo, tipo, status}))` per exit (never the token), matching the shape `sesion.ts:93-106` already uses, plus a distinct `?error=` per motivo (`sin-token` / `tipo-no-soportado` / `code-rechazado` / `token-rechazado`). Also default a missing `type` to `"email"` instead of discarding a present `token_hash`. Return `error.message` from `confirmarCodigo`/`confirmarTokenHash` (`sesion.ts:138-167`) into the log. Without this, the next Sarahí is equally unexplainable.

**2. Build the resend door and fix the copy that already promises it.**
New `reenviarConfirmacion(email, emailRedirectTo)` in `packages/data/src/server/sesion.ts` wrapping `supabase.auth.resend({type:'signup', email, options:{emailRedirectTo}})`, origin built the same way the three existing senders do. Surface it in `entrar-form.tsx` on both the `email_not_confirmed` arm (`sesion.ts:52`) and the `ENLACE_INVALIDO` banner (`:24-25`), behind a ≥60s cooldown, always reporting "enviado" (same enumeration posture as `solicitarReset`). Rewrite `:24-25` to branch on step 1's `motivo`: `sin-token` → "El enlace llegó incompleto. Pide uno nuevo." with the button; `token-rechazado` → today's wording plus the button. Delete "entra con tu contraseña" from the signup-confirmation arm — it cannot work.

**3. Make `/registro` honest and idempotent.**
`packages/data/src/server/registro.ts:93-103`. Branch the three signUp outcomes: new user → today's screen; `data.user.identities?.length === 0` (already confirmed) → route to `/entrar` with "Ya tienes una cuenta con este correo"; existing-unconfirmed → a distinct screen, "Ya te habíamos enviado un correo — **abre el más reciente**", with the step-2 resend button and copy stating that resending invalidates the previous link. Add a server-side cooldown so a page reload cannot spend another unit of the shared 50/hr bucket. This closes FC-02 and caps FC-09's multiplier at 1× per real intent.

**4. Map GoTrue error codes to es-MX.** `registro.ts:101` — at minimum `over_email_send_rate_limit`, `email_address_invalid`, `weak_password`, `signup_disabled`, one Spanish fallback. Pattern already exists at `sesion.ts:16-25`.

**5. Fail the hook closed on a clamped link.**
`supabase/functions/send-email/correo.ts:58` — parse and refuse unless `new URL(redirectTo).pathname === '/auth/confirm'` (the only path any of the three senders builds), throwing so `index.ts:104-109` returns its existing 400. Converts a silent cross-tenant mis-mint into a loud non-send plus an edge-function error line. **Do not "fix" this by giving the Site URL a path** — that arms the #217 cross-tenant enrollment fuse.

**6. Stop swallowing the rescue rail's failure.** `sesion.ts:119-130` — return the real result and `console.warn` code/status; add a `cuentaExistente` failure variant to `activar/actions.ts:79-91` and `activar-form.tsx:90` ("No pudimos enviarte el enlace ahora mismo…" + retry).

**7. Cross-door identity check before a desk sale creates a client.**
The NEW-client path in `registrar_venta` cannot see `auth.users` (no service role, ADR/#126). Add a pre-flight call from `vender.tsx` to a privileged edge function that looks up `auth.users` by typed email **and** by `phone_e164` last-10 (both axes carried the signal for Sarahí), routing to "vincular a cuenta existente" — mirroring the `cuenta_existente` check `activar-cuenta/nucleo.ts:133-140` already performs.

**8. Turnstile: never leave a dead button.** All four forms (`registro-form.tsx:277-284`, `activar-form.tsx:192-199`, `vincular-form.tsx:111`, `contacto-form.tsx:133`) — on error/expired render an inline message with a retry calling `turnstile.reset()`, plus an `onError` on the `<Script>` tag and a load timeout so a script that never arrives says so.

**9. Make the newest mail identifiable.** `correo.ts:82` — append a send-time marker to the subject or first body line. Cheap; only matters until fix 3 lands.

**10. Drop `&correo=` from invite URLs.** `invitaciones.ts:240` — `activar/page.tsx:39` already fetches `invitacionInfo` from the code; resolve the address there. This is a delete.

**11. Deferred until Q3 is answered:** one `hostCanonicoDeGym(gymId)` helper (the rule already exists at `gym.ts:145-159`) used by `registro/actions.ts:45`, `entrar/actions.ts:34`, `activar/actions.ts:85`, so auth mail and invite mail agree by construction. Only worth it if the dual-door ruling changes.

### (b) Owner config / HITL — exact and checkable

| # | Action | How to verify |
|---|---|---|
| B1 | **Repair the two remaining wedges today**: `jessica_s_h6@hotmail.com` (unconfirmed since 08-13, 17 days), `paucasavantes@hotmail.com` (since 08-24). Use `admin.updateUserById({email_confirm:true})`, not raw SQL. | `select email from auth.users where email_confirmed_at is null` → 0 rows |
| B2 | **Clean up 08-30's manual repair**: both repaired rows still carry a live `confirmation_token`/`confirmation_sent_at`, which a future "pending confirmations" audit will misread. | `select confirmation_token from auth.users where email in (…)` → empty string |
| B3 | **Repoint Auth → URL Configuration → Site URL** from `https://red.ibookit.lat` to `https://app.ibookit.lat`. Keep it **path-less**. `app.ibookit.lat` must stay absent from `gym_domain` and `PLATFORM_CLIENT_FALLBACK_HOST` must stay pointed at it. (Gated on Q2 — needs an honest "Sitio no reconocido" page there first.) | `curl -sI -o /dev/null -w '%{redirect_url}' 'https://hjppxawglmukfvsgmcog.supabase.co/auth/v1/verify?token=bogus&type=recovery&redirect_to=https://not-allowlisted.example.com/auth/confirm'` → host is `app.ibookit.lat`, not any gym's |
| B4 | **Auth → Redirect URLs**: one `https://<client-host>/**` per gym, added **before** the `gym_domain` row. Present today: `www.redfunctionaltraining.com`, `red.ibookit.lat`, `forge.ibookit.lat`, `forge-demo.ibookit.lat`, `red-demo.ibookit.lat`. Absent: `red-admin.ibookit.lat` (harmless — admin mints no auth mail). | Same curl with the real host → the `/auth/confirm` path is **echoed**, not stripped |
| B5 | **Do not remove or reorder the Vercel apex 308** (`redfunctionaltraining.com` → www) without allow-listing the apex first — the apex clamps today, and the 308 is what makes that unreachable. | `curl -sI https://redfunctionaltraining.com/entrar` → 308 to www |
| B6 | **Resend dashboard: read the current bounce + complaint rates now** (`member-reachability-todo.md` O8, still unchecked) and confirm the plan tier (Free vs Pro). Four near-identical mails to one address in 28 minutes is exactly the shape that spends a 0.08% account-wide complaint budget. | O8 ticked with the two numbers recorded |
| B7 | **Issue a second Resend API key** (same verified domain) so auth mail no longer shares a suspension blast radius with invites, receipts, and the alert cron. Today one suspension takes down the detector too. | `send-email` edge function env uses a different key than `RESEND_API_KEY` in Vercel |
| B8 | **Confirm Auth → Rate Limits still reads 50/hr** and custom SMTP is still ON. Silent reversion to the ~2/hr default is a documented failure mode and looks identical from outside. | Dashboard screenshot in the runbook |
| B9 | **Keep the send-email hook registered.** The documented one-toggle SMTP rollback is *not* behaviour-preserving — it swaps browser-independent `token_hash` links for browser-and-host-bound PKCE `?code=` links, which fail outright for the Instagram in-app-browser funnel. Record this next to the toggle. | Note added to `docs/runbooks/hitl-75-send-email-hook.md` |
| B10 | **DNS at Namecheap**: `_dmarc.ibookit.lat` → `v=DMARC1; p=none; rua=mailto:dmarc@ibookit.lat; fo=1;` and route that mailbox somewhere read. Today there is no reporting address and no MX, so spam placement is undetectable. | `dig TXT _dmarc.ibookit.lat` shows `rua=` |
| B11 | **Turnstile hostname list**: 6 of 10 slots used. Every new host needs a manual add, and never add a bare registrable domain (suffix matching silently widens the grant). | Widget list = exactly the serving hosts |
| B12 | **Decide `red.ibookit.lat`** (Q3): permanent dual-door per runbook §7, or Vercel 308 → www preserving path+query, then delete the row. Do not delete the row without the 308 — it strands every never-expiring invite code. | Either a 308 in `curl -sI https://red.ibookit.lat/entrar`, or the ruling re-affirmed in writing |

### (c) Machine guards

1. **Signup-rail e2e — the missing one.** `apps/client/e2e/signup.spec.ts`, same `red-demo` sandbox convention as `session.spec.ts`. Three assertions that need no mailbox: (i) submitting `/registro` with an email that already has an unconfirmed auth row renders the "abre el más reciente" screen, **not** the generic success; (ii) `/entrar?error=confirmacion` renders a resend control that is enabled and reachable; (iii) `/auth/confirm` with no params and with a bogus `type` produce **different** `?error=` codes. For a real round-trip, add a scratch-project-only RPC that reads the live `auth.one_time_tokens` row so the test can assert the emailed link redeems and that a second signUp invalidates it. Pre-merge convention, same tier as `test:e2e`/`test:denial`.
2. **Two-host session test** (closes FC-11's blind spot): give `red-demo` a second `*.localhost` client host row (free), then one test — sign in on host A, open host B in the same context, assert whatever the product promises there. Pin the promise, whatever it is.
3. **Host-provisioning probe** (`tools/probe-host.mjs`, not `tools/guards/` — it needs the network). Takes a hostname, asserts in order: `gym_domain` row exists, app-scoped, lowercase, non-localhost → GoTrue **echoes** `https://HOST/auth/confirm` rather than clamping → the Turnstile widget lists the host → the host serves 200 with the expected `data-brand`. Hard gate before any `gym_domain` insert; becomes the provisioning job's exit test at scale.
4. **`es_principal` invariant guard**: for every `(gym_id, app)` with ≥2 non-localhost rows, exactly one `es_principal = true`. Today `gym_domain_principal_uniq` forbids two but never requires one, and RED is the only gym with any row flagged.
5. **Hook path assertion test**: a Deno test in `supabase/functions/send-email/` asserting `construirUrl` throws for a `redirect_to` whose pathname is not `/auth/confirm` (pairs with fix a5).
6. **Route-branch unit test**: each `/auth/confirm` exit emits a distinct `?error=` and exactly one log line. Cheap, and it is what makes fix a1 non-regressable.
7. **`registrarSocio` branch tests**: new / existing-unconfirmed / `identities: []`. `registro.test.ts` currently has no error-path coverage at all.
8. **Outbound-host policy test** (only if a11 lands): all three auth senders resolve through the same helper; fails if any reintroduces a raw `h.get("host")`.

### (d) Runtime detection — how a wedged member pages someone first

**The one query that would have caught both victims**, added as a third signal to `apps/admin/src/app/api/cron/alertas/resumen.ts:32-55`. It needs `auth.users`, which the apps cannot read, so it ships as a `SECURITY DEFINER` RPC (write-coverage rule does not apply — it writes nothing):

```sql
-- registros_atorados(): platform-wide, no gym scope needed for the ops alert
select u.email, u.created_at, u.confirmation_sent_at,
       (select count(*) from public.clientes c
         where lower(c.email) = lower(u.email)) as filas_roster
from auth.users u
where u.email_confirmed_at is null
  and u.created_at < now() - interval '2 hours'
union all
-- confirmed but never linked: the second wedge shape, invisible even post-repair
select u.email, u.created_at, u.confirmation_sent_at, 0
from auth.users u
where u.email_confirmed_at is not null
  and not exists (select 1 from public.clientes c where c.auth_user_id = u.id)
  and u.email_confirmed_at < now() - interval '24 hours';
```

Three things must change around it:
- **Cadence.** The cron is daily at 12:00 UTC (`apps/admin/vercel.json`). A 34h wedge is already 3× the detection interval. Run this signal hourly.
- **Channel.** The alert rides `resendTransport()` on the same suspended-together account (FC-08). Give it a non-Resend fallback — a webhook, or at minimum a persisted counter the admin `/inicio` screen renders, so the detector does not die with the thing it detects.
- **Desk-visible surface.** Once step 1 exists, surface the same rows as a "Pendiente de confirmar" list in CLIENTES with a per-row resend. That is what turns "the member complains in person" into "the desk sees it at the counter" — the only reason Sarahí was caught within the hour and Iván sat for 34.

Fourth signal, once fix a1 lands: alert on `confirm-fallo` count per hour from the structured logs. A spike of `sin-token` is the fingerprint of a link-integrity problem (webview mangling); a spike of `token-rechazado` is the fingerprint of the rotation storm. Today those are indistinguishable.

### (e) At-scale obligations — what must become per-gym automation

| Manual thing today | Must become | Forcing function |
|---|---|---|
| A `gym_domain` row is a hand-written migration applied to LIVE, plus 3–4 console visits (FC-13, D10) | A write RPC + a job calling the Vercel Domains API and the Supabase Management API for the redirect allow-list, with the (c)3 probe as the exit test | 1000 gyms = 1000 prod migrations + ~3000 console interactions, each with a silent failure mode |
| One Turnstile widget, build-inlined sitekey, 6/10 hostnames (FC-15) | Per-tenant sitekey read at request time from the resolved tenant (architecture change — removes the build-time inline), **or** drop Turnstile for a server-side rate limit on the two write actions | **Decide before BYO domain #3, not #9.** Domain #5 silently kills that gym's signup |
| One Resend account, one sending identity, one account-wide complaint budget (FC-08) | Per-tenant sending subdomain or at minimum per-rail keys; a suppression/bounce webhook the platform actually reads | A single member's spam click can suspend mail for every gym |
| One project-wide 50/hr auth-email bucket, no queue, no retry, no per-gym budget (FC-09) | Per-tenant SMTP, or a queue with per-gym budgets and a visible ceiling | 60/hr from one address already exceeds the whole platform's budget |
| Site URL is one tenant's host (FC-10) | A neutral platform origin with a real "Sitio no reconocido" page — never any customer's home page | Every clamped link from every gym lands on one customer's branded site |
| Admin sees zero auth state; wedges need a dev with prod SQL (FC-04, FC-20, FC-21) | A first-class auth-state projection (definer RPC) feeding the invite badge, plus a break-glass resend/confirm action through a privileged edge function | Tonight's fix was a developer running raw SQL against prod. That does not scale past one gym |
| Host retirement is ad-hoc (FC-11) | One ruled contract — 308-then-retire or permanent dual-door — applied by the provisioning job, not per incident | Every gym that ever changes domain inherits the split-jar |

---

## 4. Open questions for the owner

Only the ones that change the plan.

**Q1. Can you pull the Vercel access log for `GET /auth/confirm` on `www.redfunctionaltraining.com` at ~22:18 UTC (full query string + status)?**
This is the single artifact that separates "the link arrived intact and the token was stale" from "the link arrived stripped." If stripped, fix (a)1 is not sufficient on its own and we also need link-integrity work for the Instagram/mail-webview path — a shorter opaque path, or the POST interstitial already scoped in `member-reachability-todo.md` item 2 (FC-22). If stale, (a)2+(a)3 close it outright. Everything in section 3(a) is worth doing either way; this decides whether a twelfth item joins the list.

**Q2. Site URL: move to `app.ibookit.lat`, or leave it on `red.ibookit.lat`?**
The two seats disagreed. Both agree it must stay **path-less** (a path arms the #217 cross-tenant enrollment fuse). Moving it means every clamped link lands on a neutral "Sitio no reconocido" page instead of RED's branded home — which requires that page to exist and be honest first. Leaving it means one customer's marketing site is the platform's permanent error page. My recommendation is move it, after building the page.

**Q3. `red.ibookit.lat`: permanent dual-door, or 308-then-retire?**
Runbook §7 currently rules permanent dual-door, and the verifier confirmed that was a deliberate, reasoned choice (a 308 cannot make sessions portable across registrable domains anyway). But dual-door means FC-11 is permanent and every future BYO domain inherits it, which makes fix (a)11 (canonical-host minting) load-bearing rather than optional. Re-affirm or reverse — the answer decides whether (a)11 ships.

**Q4. Should `/registro` refuse a signup when the email already has an unclaimed roster row in the host gym, and route the person to `/activar` instead?**
Today the two doors race: Sarahí had 4 confirmation mails and 1 invite mail in one inbox within 30 minutes, each leading to a different flow with a different outcome, and the `/activar` door was **actually open to her the whole time** (`activar-cuenta` returns `cuenta_existente` for an unconfirmed auth user; her `claim_code YC2YQCPJ` and exact email match would have passed `decidir()`). Merging the doors is a bigger change than (a)3 but it removes the race rather than papering over it.

**Q5. Do you want a break-glass admin action — resend a Supabase Auth confirmation link, or mark an email confirmed — for a matched pending account?**
This needs a privileged edge function and sits against the stated no-service-role-in-apps posture (#126). Without it, every future wedge is a developer with prod SQL access. With it, (a)7 and (d)'s "Pendiente de confirmar" list both get a working button instead of a read-only list.

**Q6. Does GoTrue's re-signup on an unconfirmed user also overwrite `encrypted_password`?**
`auth.users.updated_at` moved to 22:25:18 on her fourth submit, consistent with a full row rewrite. If it does, only the password typed on the *last* attempt works — which changes what you tell Sarahí (and may independently explain some of the 22:07–22:44 400s). Cheapest resolution is to just push her through a password reset rather than confirm the behaviour.

---

⚠️ **Owner-owed inputs still outstanding:** SAT persona-física details (pre-existing debt), plus new from this incident — B6 (Resend bounce/complaint rates + plan tier, `member-reachability-todo.md` O8, unchecked for 11 days) and B1 (two members still wedged right now: `jessica_s_h6@hotmail.com` 17 days, `paucasavantes@hotmail.com` 6 days).

---

# FABLE ADVISOR VERDICT

All load-bearing claims independently re-verified. Composing the review.

---

**1. ROOT CAUSE — chain holds; three corrections to the evidence text**

Independent re-verification: `route.ts:94-110` catch-all confirmed; the `/entrar?error=confirmacion` banner (`entrar-form.tsx:25`) renders identical "ya expiró o ya se usó" copy for every failure shape, so her error message carries zero branch information — consistent. My own gateway-log query (edge_logs, 21:40–23:40 UTC) confirms exactly two `/auth/v1/verify` rows, both 200 (22:20:15, 22:35:07, pairing with the other members' signups at 22:19:08 and 22:33:05) and **zero verify 4xx of any kind**. `proxy.ts` forwards `/auth/confirm` untouched (no query rewrite, matcher passthrough). Hook mints `type=email` (`correo.ts` `tipoOtp`), which the route accepts. No `.resend(` call site exists. The chain is airtight up to the Q1 boundary. Corrections:

- **C1. The H-A refutation's first leg is invalid as stated.** The `?redirect_to=` on the `/signup` log lines is `request.search` — the client-sent parameter from `registro/actions.ts`, logged by the gateway before any validation. It proves nothing about allow-listing. H-A still falls, but only on the other two legs (`correo.ts` takes `redirect_to` verbatim + the direct allow-list probes in B4/B5). Fix the report text before "the log echoes only validated values" calcifies into log-reading doctrine — the team already built a referer-interpretation doctrine on the adjacent field.
- **C2. FC-22 is REFUTED for tonight, not PLAUSIBLE.** Any prefetcher/scanner fetching a well-formed link executes the GET route → `verifyOtp` → a `/verify` row. Zero rows in the window = no redemption was ever *attempted* on any of her four tokens, by her, a scanner, or anyone. Same evidence also makes H-B **non-causal tonight**: a click on a rotated older mail would log a `/verify` 4xx; none exists. Rotation (confirmed real via `one_time_tokens` uniqueness) is a latent amplifier, not this incident's mechanism. The synthesis implies this; state it flatly, because the incident brief's H-B "expired-link retry loop" story is what the team will remember otherwise.
- **C3. The loop started before any click failed.** First password 400 at 22:07:57 *precedes* signup #2 (22:08:57). Driver at that point was the login copy — `sesion.ts:52-55` "Revisa el enlace que te enviamos" — pointing at mail that hadn't worked/arrived, plus the silent-success `/registro`. Doesn't change the fixes; changes the narrative fix 2/3 copy should address (she retried *before* seeing "expired").

Missed alternative: none found that fits better. But the plan mis-prices its own evidence: zero-verify + deterministic per-user failure while two same-rail users succeeded minutes apart already establishes client-side link damage (webview/mail-client) as the only surviving mechanism. Q1 is forensics, not a decision gate — see change 1.

**2. SHIELD PLAN — one surviving failure mode, one inconsistency, one new hole, three cuts**

- **Surviving failure mode (the incident itself):** if her client damages links, fix 2's resend mints an identical link that dies identically — an instrumented resend→`sin-token`→resend loop, member still wedged. The plan defers link-integrity work behind Q1; wrong gating.
- **Highest-leverage missing change: an OTP-code fallback rail.** The hook payload already carries the 6-digit `email_data.token`; print it in the mail ("o escribe este código"), add a code-entry field on the `sin-token`/`token-rechazado` landing calling `verifyOtp({email, token, type})`. Immune to query stripping, prefetch burn, host split-brain, and webviews; structurally closes FC-22; un-gates the whole plan from Q1. The POST-interstitial alternative still requires the token to survive the URL — strictly weaker.
- **Internal inconsistency:** fix 2's "≥60s cooldown" = 60/hr per address, above the 50/hr project bucket the plan's own FC-09 names as the platform-starving exposure. Size cooldowns against the bucket (≥5 min + per-address daily cap).
- **New hole in fix 7:** a privileged edge function answering "does this email/phone have an auth account" to any gym desk is a cross-tenant enumeration oracle — the same #217-shaped fuse the plan cites elsewhere. Scope the answer to this-gym matches or a rate-limited boolean, with an audit log.
- **Detection query arm 2** (confirmed-but-unlinked >24h, platform-wide) will page forever on demo/sandbox/test auth users with no suppression mechanism — rebuilding FC-05's alert-fatigue failure inside its own fix. Add exclusions before shipping.
- **Cuts/holds:** fix 9 (subject marker) — obsoleted by fix 3 in the same batch and adds a deliverability variable; cut. Guard (c)2 — "pin the promise, whatever it is" pins today's behavior before Q3 rules what it should be; hold until Q3. Q6 — don't investigate; force password reset on every repaired user unconditionally (the plan already leans there; make it the action, delete the question).
- **Dependency to name:** fix 5 fail-closed makes a misprovisioned gym's signup hard-fail until noticed; the existing send-email non-2xx signal is daily. (d)'s hourly cadence is load-bearing for fix 5 — ship them together.

**3. VERDICT: APPROVE-WITH-CHANGES**

1. Add the OTP-code fallback rail (hook mail + code-entry on the error landing) as a first-class fix; demote Q1 from gate to forensics.
2. Resize fix 2/3 cooldowns against the 50/hr project bucket.
3. Tenant-scope + audit-log fix 7's account lookup.
4. Add suppression/scoping to `registros_atorados` arm 2.
5. Correct the report: `request.search` redirect_to is client-sent (C1); FC-22 and H-B refuted-for-tonight (C2); loop predates the click (C3).
6. Cut fix 9; hold guard (c)2 behind Q3; replace Q6 with unconditional password reset.
7. Ship fix 5 only together with (d)'s hourly cadence.

Everything else in 3(a)-(e) stands as written.