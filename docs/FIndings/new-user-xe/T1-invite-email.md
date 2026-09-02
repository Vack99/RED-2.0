# T1 — Invitation + email pipeline

Cross-examination seat T1, 2026-09-02. HEAD = `33c9087a`. Read-only: `cat`/`sed`/`grep`/`git log`,
`SELECT`-only Supabase MCP against LIVE `hjppxawglmukfvsgmcog`, `GET`-only Resend REST with the key
from `apps/admin/.env.local` (value never printed), `nslookup` TXT.

Member emails masked `xxx***@domain` except `marcerubiogarcia07@gmail.com` (already documented).

Territory: admin ficha INVITAR / REENVIAR → `preparar_invitacion` → GoTrue (`/signup`, `/otp`,
`/recover`, `/admin/users`) → `send-email` auth hook → Resend → the member's inbox. Everything past
the click (`/auth/confirm`, the claim RPCs, cookies, session) belongs to another seat.

---

## What I measured this round (the raw numbers everything below rests on)

| # | Measurement | Value | How |
|---|---|---|---|
| M1 | Resend ledger, full pagination | **194 mails**, 2026-08-04 21:59Z → 2026-09-02 17:08Z | `GET /emails?limit=100` ×2 pages (`has_more:false` on p2) |
| M2 | Mail mix | recibo 74 · invite 63 · `Confirma tu cuenta` 45 · `Restablece…` 10 · `Continúa en tu cuenta` **2** | same ledger, subject bucketing |
| M3 | Peak volume | **37 mails/day** (08-13) · **30 mails/hour** (08-13 22:00Z) | same |
| M4 | Delivery outcomes | delivered 190 · bounced 3 · delivery_delayed 1 | same |
| M5 | Bounce rate | account **1.55%** (3/194); **real recipients 0.52%** (1/191); `*.test` recipients **2 of 3 bounced** | same, split on `.test` suffix |
| M6 | Identical-subject stacking | `Confirma tu cuenta` per address: **6, 6, 4, 3, 2**, rest 1 | same |
| M7 | 6-digit OTP fallback | **0 of 16** auth mails since hook v8 (2026-08-30T19:20Z) contain "Escribe este código" | `GET /emails/{id}` ×16, regex on `text` |
| M8 | Resend domain | `ibookit.lat` **verified**; DKIM verified; SPF (MX+TXT) verified; **`open_tracking:false`, `click_tracking:false`** | `GET /domains/{id}` |
| M9 | DMARC | `_dmarc.ibookit.lat` = `"v=DMARC1; p=none;"` — **no `rua=`** | `nslookup -type=TXT _dmarc.ibookit.lat 8.8.8.8` |
| M10 | Alert-cron mails | **0** of the 194 carry a subject containing `Alerta` / `iBookit` | ledger, 80 distinct subjects enumerated |
| M11 | Wedged registrations, live NOW | `sin-confirmar` **2** (max **475 h** ≈ 19.8 days) · `sin-vincular` **1** (66 h) | `select motivo,count(*),max(horas) from public.registros_atorados()` |
| M12 | Hook health, 24 h | `Hook ran successfully` **8** · `Hook errored out (500: Invalid payload)` **6** | `logs`, `source='auth_logs'`, group by `msg`/`error` |
| M13 | Hook latency, 24 h | 200s: n=8, **avg 768 ms, max 2594 ms**; 400s: n=6, avg 331 ms | `function_edge_logs`, `execution_time_ms` |
| M14 | GoTrue errors, 24 h | `over_email_send_rate_limit` **2** (both one member) · `email_exists` on `/admin/users` **5** (same member) · `otp_expired` **4** · `unexpected_failure` on `/signup` **6** | `logs`, group by path/error_code/status |
| M15 | Live claim codes | **67** platform-wide (`red` 16, `forge` 28, `red-demo` 17, `forge-demo` 6); oldest invite sent **2026-07-11**; **4** codes on invites older than 30 days | live SQL over `public.clientes` grouped by gym |
| M16 | Sender identity split | `gym.brand_name` `red`=**"RED"**, `perfil.negocio` `red`=**"RED Functional Training"** — 57 receipts vs 100 invite+auth mails, one address | live SQL + ledger `from` field |
| M17 | Auth-mail growth (weekly, Mon-start) | invite 3→28→11→12→9; `Confirma tu cuenta` **0→8→8→13→16** | ledger weekly buckets |
| M18 | Non-ASCII addresses in `clientes` | **0** across all 4 gyms (6 RED rows carry uppercase, harmless) | live SQL |

Primary Supabase doc facts (`mcp__supabase__search_docs`, Auth Hooks guide):

> "On a retry-able error, such as an error with a `429` or `503` status code, HTTP Hooks will attempt
> up to three retries with a back-off of two seconds. **We have a time budget of 5s for the entire
> webhook invocation, including retry requests.**"

> "| 403, 400 | Treated as Internal Server Errors and return a 500 Error Code |"

> Sample retry-able response in the docs: `{ status: 429, headers: { 'Content-Type': 'application/json', 'retry-after': 'true' } }`

---

## Ranked findings — worst first

### T1-01 · The auth/mail health cron has never sent a single alert, and it regressed from hourly to daily

**Severity 5 · basis: measured**

`resumen.ts:176-179` alerts whenever `(atorados?.length ?? 0) > 0` — on *every* run, no tolerance band,
deliberately ("a wedge is a person locked out right now"). `route.ts:226-233` mails through
`resendTransport()`, i.e. the **same Resend key whose entire 30-day ledger I just paged**. Right now
`public.registros_atorados()` returns **3 rows**, the worst standing at **475 hours** (M11). Over the
ledger's whole 30 days that wedge existed, so the cron owed the owner at least one alert per run. It
sent **zero** (M10) — the 194 mails are only receipts, invites and auth mail; there is no
`[iBookit] Alerta auth/correo …` subject (the string built at `resumen.ts:205`) anywhere in the window.

An alert that was *shaped* but failed to send would still have produced a Resend row and a 502
(`route.ts:238-248`). Zero rows means the run never reached line 226 — which narrows the cause to the
fail-closed guards above it: `CRON_SECRET` unset or mismatched → 401 (`route.ts:161`), or
`SUPABASE_ACCESS_TOKEN`/`ALERT_EMAIL`/derivable ref missing → 500 (`route.ts:170-180`), or the cron is
not scheduled on the deployed project at all. All three are invisible except as a red tick in a Vercel
cron log nobody reads.

Separately, at HEAD `apps/admin/vercel.json:5` is `"schedule": "0 12 * * *"` — **daily** — while
`route.ts:32` still documents "`0 * * * *`, hourly. It was daily at 12:00 UTC until 2026-08-30." The
revert is deliberate (`860a3893`, "Vercel Hobby caps cron at once/day, hourly schedule was rejected as
a paid feature") but the route's own justification for hourly is now false in place: it argues "the
Iván wedge sat 34h, already 3× that detection interval" — at daily the interval is 24 h, i.e. **0.7×**
that wedge, not 3×.

**Member-visible symptom:** Marce paid $1,200 on 09-01 and could not open the app for 21 hours; the
owner learned about it from Marce. The shield built after the 2026-08-30 incident specifically to catch
this produced nothing.

**Evidence:** `apps/admin/src/app/api/cron/alertas/resumen.ts:176-179,205`;
`apps/admin/src/app/api/cron/alertas/route.ts:32-36,161,170-180,226-233,238`;
`apps/admin/vercel.json:5`; `git log -p -- apps/admin/vercel.json` → `860a3893`; M10; M11.

**Breaking point:** detection latency for a wedged member is **unbounded today** (nothing fires);
**24 h at best** once armed, against a lived 34 h wedge and a 21 h one.

**Fix hint:** the route already answers 502 when it did not do its job. One
`curl -H "Authorization: Bearer $CRON_SECRET" https://<admin-host>/api/cron/alertas` says immediately
which env var is missing (the 500 body names them). Then treat "no alert mail in 7 days" as its own
signal — today a dead cron and a clean window are the same observation.

*Prior attribution:* `03-prior-register.md` P-095 recorded the cron as "unarmed until owner sets Vercel
env vars" (2026-08-25); P-064 recorded "Alert cron watched `invalid_grant` + send-email non-2xx — both
0". Neither measured the *output*. The 0-mails-in-30-days-against-a-475-hour-wedge measurement is new.

---

### T1-02 · The 6-digit OTP fallback has rendered in 0 of 16 live auth mails since it shipped

**Severity 5 · basis: measured (outcome); unmeasured (cause)**

`bloqueCodigo` (`correo.ts:90-96`) renders the "¿El enlace no funciona? Escribe este código…" block
only when `emailActionType === "signup"` **and** `/^\d{6}$/.test(token)`. I pulled the `text` body of
**every** auth mail sent after `send-email` v8 went live (2026-08-30T19:14Z per `01-live-snapshot.md`
§A) — 16 mails, 7 distinct recipients including 3 real RED members and Marce's 6 — and **none** of them
contains the block (M7). All 16 have subject `Confirma tu cuenta`, which only `copia("signup")` can
produce (`correo.ts:110-120`), so the action-type half of the gate passed. The failing half is the
regex: the live `email_data.token` is not a 6-digit string.

The tests cannot see this. `correo.test.ts:19` sets `token: ""` as the shared default — its own comment
says "an empty token is `bloqueCodigo`'s no-render case anyway" — and the only cases that exercise the
block hardcode `"123456"` (`correo.test.ts:163,175,186,195,206`). The suite proves the *function*; the
*payload* is untested and unlogged (`index.ts:18`: "NEVER log token_hash / token / payload").

**Member-visible symptom:** the `/codigo` landing page and the whole "type the code if the link dies"
escape hatch — the fable-verdict #1 mitigation of the 2026-08-30 incident, and precisely the rail that
would have rescued Marce from her stack of dead links — has never once been usable by a real member.

**Evidence:** M7 (16 `GET /emails/{id}` bodies); `supabase/functions/send-email/correo.ts:90-96,110-120`;
`supabase/functions/send-email/correo.test.ts:13-20,163`.

**Breaking point:** 0/16 — the feature's live success rate is 0% over its entire deployed life (3 days,
16 sends).

**Fix hint:** one instrumented send — log `typeof token` and `token.length` (never the value) from
`index.ts` — settles it in a single signup. Second candidate for the same pass: Auth → Email → OTP
length in the dashboard.

*Prior attribution:* P-082 (marce-triage §9 #5) claimed "her *magic-link* mails never carried a usable
fallback". That framing is too narrow — re-derived at HEAD, the three genuine `/registro` **signup**
mails lack it too, and so does every other member's. Widened, not reused.

---

### T1-03 · `/activar`'s magic-link rail sits outside the "one shared counter" — and it is the door the 429 comes from

**Severity 4 · basis: measured**

`reenvio-limite.ts:4-9` opens: "Per-address auth-mail throttle shared by **ALL THREE** doors that can
put a confirmation mail in flight — `/entrar`'s rescue resend, `/registro`'s 'ya enviado' resend, and
`registrarSocio`'s own signUp." A grep for its exports across `apps/` + `packages/` returns exactly
those three call sites (`entrar/actions.ts:7,84`; `registro/actions.ts:5,97`;
`registro.ts:10,149,177`).

There are **five** GoTrue mail rails in this repo, not three. The two ungoverned ones are
`enviarMagicLink` (`sesion.ts:179-203`, called from `activar/actions.ts:87`) and `solicitarReset`
(`sesion.ts:103-124`, `/restablecer`). Both spend the same project-wide auth-mail budget the counter
was built to protect, and `/activar`'s is the door that produced the only two
`over_email_send_rate_limit` 429s in the whole 24 h log window (M14). The docstring is accurate about
its scope; the scope is the defect.

**Member-visible symptom:** a member who signed up at `/registro` and then presses the invite link
inside 60 s gets `429` from GoTrue and the screen at `activar-form.tsx:145-152`. The app-side guard
that would have answered "ya te mandamos un correo hace un momento" without spending a GoTrue call is
imported two files away and never reached.

**Evidence:** `packages/data/src/server/reenvio-limite.ts:4-9`; grep of
`permitirReenvio|enEsperaReenvio|registrarReenvio` across `apps/`+`packages/` (3 production call sites,
all in `/entrar`, `/registro`, `registro.ts`); `apps/client/src/app/activar/actions.ts:86-90`;
`packages/data/src/server/sesion.ts:103-124,179-203`; M14.

**Breaking point:** GoTrue's floor is 60 s per address (its own 429 text: "you can only request this
after 28 seconds"). The `/activar` rail can request one per request; the only thing between a member
and the 429 is how fast they tap.

**Fix hint:** wrap `enviarMagicLink` and `solicitarReset` the way `registrarSocio` wraps `signUp`
(`registro.ts:149,177`) — `enEsperaReenvio` before, `registrarReenvio` after a mail really left.

---

### T1-04 · The 429 arrives with a diagnosis and is thrown away one line later

**Severity 4 · basis: measured**

`enviarMagicLink` deliberately reports the real outcome — `sesion.ts:189-201` logs `error.code`
(`over_email_send_rate_limit`) and returns `{ ok:false, error: error.message }` ("For security purposes,
you can only request this after 28 seconds"). `activar/actions.ts:94` is
`return enviado.ok ? { status: "cuentaExistente" } : { status: "cuentaExistenteFallo" }` — code and
message discarded — and `activar-form.tsx:145-152` renders one screen: **"NO SALIÓ EL CORREO / No
pudimos enviarte el enlace ahora mismo. Intenta de nuevo."**

"Intenta de nuevo" is the worst instruction available here: retrying inside the window re-spends the
budget and re-renders the same screen, which is exactly what happened at 19:25:17 and 19:25:27.

**Member-visible symptom:** verbatim "an error is shown and I can't enter at all", with a button that
guarantees the error repeats.

**Evidence:** `packages/data/src/server/sesion.ts:189-201`;
`apps/client/src/app/activar/actions.ts:87-94`;
`apps/client/src/app/activar/_components/activar-form.tsx:145-152`; M14 (2 × 429, 10 s apart).

**Fix hint:** branch on `over_email_send_rate_limit` → "ya te enviamos un correo hace unos segundos —
revísalo, o espera 30 s", with the button disabled and a countdown. The information is already in hand
at line 94.

*Prior attribution:* P-078 (marce-triage §9 #1). Re-derived at HEAD this round — both line numbers still
match, nothing has been fixed.

---

### T1-05 · Two rails, one subject: `Confirma tu cuenta` 45, `Continúa en tu cuenta` 2

**Severity 4 · basis: measured**

`copia()` (`correo.ts:109-144`) has a third branch — subject "Continúa en tu cuenta" — meant for the
magic-link rail, so an invite-rescue mail would be distinguishable from a self-signup mail. In 30 days
that branch fired **twice**; "Confirma tu cuenta" fired **45 times** (M2).

The reason is structural: `enviarMagicLink` calls `signInWithOtp({ shouldCreateUser:false })` against
an account that is typically **unconfirmed** (that is why the member is stuck), and GoTrue answers an
unconfirmed account with a *confirmation* mail, i.e. `email_action_type = "signup"`. Proof at HEAD:
Marce's mails #10/#11/#13 were minted by `/otp` calls (log `path:"/otp"`, marce-triage §2 rows 5–7) and
all three carry subject `Confirma tu cuenta` (M7 listing), which only `copia("signup")` produces.

GoTrue then keeps exactly **one** live token per user, so each new mail voids all older ones. Measured
stacking across the account (M6): one address at 6, another at 6, then 4, 3, 2. Four real recipients
already hold more than one indistinguishable, identically-subjected, identically-sent mail of which
only the newest works.

**Member-visible symptom:** an inbox with N mails titled "Confirma tu cuenta" from the same sender.
Opening any but the newest → GoTrue `403 otp_expired` → `/entrar?error=token-rechazado`. Four such
`otp_expired` events in the 24 h window (M14).

**Evidence:** M2, M6, M7; `supabase/functions/send-email/correo.ts:109-144`;
`packages/data/src/server/sesion.ts:185-188`; marce-triage §2 rows 5–7, §3 #10/#11/#13.

**Breaking point:** the probability of opening the right mail is 1/N, and N grows by one on every
resend. It is already **1/6** for two addresses.

**Fix hint:** put the send time in the subject (`Confirma tu cuenta · 10:29`). One template line, and it
is the only fix that survives the fact that this rail cannot control `email_action_type`.

*Prior attribution:* marce-triage §9 #3 / P-087 asserted the stack for Marce. The population count
(5 addresses ≥2, max 6) and the 45-vs-2 rail split are measured new this round.

---

### T1-06 · The hook makes three unbounded network calls inside a documented 5-second budget

**Severity 4 · basis: measured + primary doc**

Supabase's own Auth Hooks guide: "**We have a time budget of 5s for the entire webhook invocation,
including retry requests**", with retries "up to three … back-off of two seconds". Inside that budget
`index.ts` does, sequentially and with **no `AbortSignal` on any of them**:

1. the `gym_id_por_host` RPC (`index.ts:57-60`),
2. the `gym.brand_name` select (`index.ts:62-66`),
3. `POST https://api.resend.com/emails` (`index.ts:115-125`).

Its sibling transport in the same repo *does* bound its Resend call — `AbortSignal.timeout(10_000)` at
`invitaciones.ts:56-58`, with a comment explaining exactly why ("a hung Resend must fail fast as a
value"). The hook has no such bound, and 10 s would in any case be 2× the whole budget.

Measured headroom (M13): successful invocations average **768 ms**, worst **2594 ms** — 52% of budget
already spent on a good day. The fail-closed 400s average 331 ms, which prices the Resend leg at roughly
440 ms of the 768.

Two further gaps fall out of the same doc:

- `correo.ts:196-198` claims a 503 means "Supabase RETRIES (≤3×)". With a 2 s back-off inside a 5 s
  total budget and a ~770 ms attempt, the doc's own worked example times out on retry #1. The real
  ceiling is **one** retry, not three.
- The docs' retry-able sample response carries `'retry-after': 'true'`. `index.ts:137-140` sets only
  `Content-Type: application/json`. Whether GoTrue retries a 503 with no `retry-after` at all is
  **unmeasured** — and the entire "a failed send is retried" design rests on it.

**Member-visible symptom (Q7):** if Resend stalls, the hook stalls, GoTrue times the hook out, and the
auth action fails *after* the token was minted — the member sees a generic signup failure and, on the
`/registro` path, may still receive a mail for an account that was rolled back. `correo.ts:200-204`
records that exact shape being live-verified once already on 2026-07-10 (non-JSON body → whole auth
action rolled back after the mail went out).

**Evidence:** `supabase/functions/send-email/index.ts:57-66,115-125,137-140`;
`packages/data/src/server/invitaciones.ts:56-58`;
`supabase/functions/send-email/correo.ts:196-213`; M13; Supabase Auth Hooks guide (quoted above).

**Breaking point:** **5 000 ms** total, of which **2 594 ms** is the worst observed single pass. Two
cold Postgres round trips plus a slow Resend crosses it with no margin, and there is no timeout to
degrade gracefully.

**Fix hint:** `AbortSignal.timeout(2500)` on the Resend fetch and `AbortSignal.timeout(800)` on the two
gym reads; `gymNombre` already degrades to `null` by contract (`index.ts:43-44`), so a timed-out gym
lookup should send neutral copy rather than nothing.

---

### T1-07 · A Resend 4xx is a permanent silent drop that the only monitor is structurally unable to see

**Severity 4 · basis: measured**

`respuestaEnvio` (`correo.ts:206-213`) returns HTTP **200** for every Resend status that is not `null`,
429, or ≥500 — explicitly "any other 4xx (a config bug a retry can't fix) → 200 `{}` DROP". GoTrue
therefore completes the auth action, the one-time token is already minted and any older one already
rotated away, no mail exists, and no retry will ever happen.

The alert cron's detector for this is `SQL_SEND_EMAIL_FALLOS` (`resumen.ts:66-70`):
`source='function_edge_logs' … and toInt32OrZero(log_attributes['response.status_code']) >= 400`. A
dropped mail leaves a **200**. The one query built to notice "GoTrue could not hand off a
recovery/invite mail, i.e. a member is silently not receiving it" (its own docstring,
`resumen.ts:59-62`) filters out the exact case where that is true. The only trace is
`console.error("send-email: resend status 422")` (`index.ts:134`), which lands in `function_logs` — a
source the cron does not query.

The class is not hypothetical: Resend answers 422 for a non-ASCII `to` (the 2026-08-29 RED incident,
`invitaciones.ts:80-90`) and 4xx for a suppressed recipient after a hard bounce.

**Member-visible symptom:** the member is told "revisa tu correo", the mail never exists, and the
previous working link was destroyed in order to mint it.

**Evidence:** `supabase/functions/send-email/correo.ts:196-213`;
`supabase/functions/send-email/index.ts:132-135`;
`apps/admin/src/app/api/cron/alertas/resumen.ts:59-70`;
`packages/data/src/server/invitaciones.ts:80-90`.

**Fix hint:** count `function_logs` lines matching `send-email: resend status` instead of (or as well
as) gateway 4xx/5xx — the log line already exists and already carries the status.

*Prior attribution:* P-023 (catalog F-33) and P-055 (evidence.md half-fail table) both stated the
4xx→200 mapping. Re-derived at HEAD; the **monitoring blind spot that pairs with it**
(`resumen.ts:70`'s `>= 400` filter) is new this round.

---

### T1-08 · The invite rail has no throttle at all, on a Resend key shared by every tenant and every mail kind

**Severity 3 · basis: measured**

`reenviarInvitacionAction` (`clientes/[id]/actions.ts:64-71`) → `reenviarInvitacion`
(`packages/data/src/server/clientes.ts:590-598`) → `requireOperator` → `enviarInvitacion` → Resend.
There is **no** per-address or per-gym counter anywhere on this path; `permitirReenvio` is never
imported by it. `preparar_invitacion.sql` has no rate check either — it only refuses an already-claimed
row (`:26-28`). The only brake is a client-side in-flight boolean
(`cliente-detalle.tsx:76-78,494`), which stops a double-tap and nothing else, and every completed send
toasts "Invitación enviada" (`:82-86`) — exactly the feedback that invites another press when the
member says the mail never arrived.

One `RESEND_API_KEY` backs invites, receipts, the auth hook and the alert mail, across all 4 gyms
(`invitaciones.ts:49`, `recibo-envio.ts:30`, `index.ts:29`, `route.ts:47`). Measured load leaves room
today — peak 37 mails/day and 30 mails/hour (M3) — but the quota is account-wide and the presses are
unbounded.

**Member-visible symptom:** none directly; the failure lands on *every other* member and every other
gym when the shared quota or the shared bounce budget goes.

**Evidence:** `apps/admin/src/app/(app)/clientes/[id]/actions.ts:64-71`;
`packages/data/src/server/clientes.ts:590-598`;
`apps/admin/src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx:76-107,486-508`;
`supabase/functions-canonical/preparar_invitacion.sql:26-28`; M3.

**Breaking point:** Resend Free is 100 mails/day (plan tier **unmeasured** — see
could-not-determine). At today's 37/day baseline, **63 REENVIAR presses in one day** exhaust the
platform's mail for every tenant. An operator working through RED's 16 unactivated members (M15) with
three presses each gets a third of the way there.

**Fix hint:** the counter already exists and is already a shared module. Wrap `enviarInvitacion` in
`enEsperaReenvio`/`registrarReenvio` and render the remaining wait on the button.

---

### T1-09 · 67 live claim codes are non-expiring bearer credentials sitting in inboxes; the oldest invite is 53 days old

**Severity 3 · basis: measured**

`preparar_invitacion.sql:30` mints a code only `if v_code is null` — once set it is reused forever, is
never rotated by a resend, and has no TTL column. The invite URL is
`https://{host}/activar?codigo={code}` (`invitaciones.ts:140`) and, per marce-triage §3, the `codigo`
and its `firma` were byte-identical across mails sent 15 hours apart and across a live deletion of the
user row.

Live count (M15): **67** unclaimed codes — `forge` 28, `red-demo` 17, `red` 16, `forge-demo` 6. Oldest
outstanding invite: **2026-07-11** (`forge-demo`); `forge`'s is **2026-07-14** — 50–53 days. Four of
the 67 sit on invites older than 30 days.

**Member-visible symptom:** none while it works. The risk runs the other way — a forwarded, archived or
breached mailbox hands over a complete activation credential with no second factor and no expiry
(P-096 H3; the deliberate #126 trade-off).

**Q4 relevance (3 idle months):** the emailed *auth* links all die (`otp_expiry`, local-dev intent
3 600 s, `supabase/config.toml:234`; live value unmeasured), and `auth.one_time_tokens` currently holds
8 outstanding tokens that would all be dead. The **invite** links do not die. After 3 months the invite
mail is the only credential left in a member's inbox that still works — the asymmetry, not the expiry,
is the finding.

**Evidence:** `supabase/functions-canonical/preparar_invitacion.sql:30-44`;
`packages/data/src/server/invitaciones.ts:139-145`; M15; `supabase/config.toml:232,234`;
`01-live-snapshot.md` §G (`confirmation_token: 6`, `recovery_token: 2`).

**Fix hint:** none proposed — this is an owner ruling, not a defect (see keeps).

---

### T1-10 · One gym, one sending address, two sender display names — and the member gets both mails in the same second

**Severity 3 · basis: measured**

The invite and the auth hook brand from `gym.brand_name`; the receipt brands from `perfil.negocio`.
Live values for `red` (M16): `brand_name = "RED"`, `negocio = "RED Functional Training"`. Measured
ledger split: **57** receipts from `RED Functional Training <no-reply@ibookit.lat>` against **55 invites
+ 45 auth mails + 2 magic-link mails** from `RED <no-reply@ibookit.lat>` — same mailbox, two identities,
interleaved 15 times over the month.

A desk sale fires both rails at once: Marce's receipt landed `2026-08-19 18:27:40.147Z` and her invite
`18:27:40.373Z` — **226 ms apart** (marce-triage §3 #1/#2). The member's first ever contact with the
platform is two mails from two apparent senders.

**Member-visible symptom:** the receipt (the mail they expect, carrying the name on their gym's sign)
and the invitation (the mail they must act on, carrying a shorter unfamiliar name) do not group as one
sender in Gmail; the actionable one is the less recognisable one.

**Evidence:** M16; `packages/data/src/server/invitaciones.ts:194-200,242-243`;
`apps/admin/src/app/(app)/vender/recibo-envio.ts:30-36`;
`packages/data/src/server/ventas.ts:340-349`; `supabase/functions/send-email/correo.ts:186`;
marce-triage §3 rows 1–2.

**Fix hint:** one source for the envelope name. `remitenteConNombre` is already the single seam — pass
it the same value on all three rails, and let `negocio` stay the *fiscal* name inside the receipt body,
where it legally belongs.

---

### T1-11 · The sandbox twin sends real mail to a TLD that cannot exist, and it is 3 of the 4 negative delivery events

**Severity 3 · basis: measured**

`red-demo` holds members at `@red-demo.test`. `.test` is a reserved non-resolvable TLD, so every receipt
to one is a guaranteed hard bounce against the shared account. Measured over 30 days (M4/M5): 3 bounces
+ 1 delivery_delayed, of which **3 of 4 are `@red-demo.test`** — `rod***` (08-19), `bre***` (08-12), and
`val***` delayed **today, 2026-09-02 09:13Z**. Real recipients bounced **once** in 191 mails (0.52%);
the account reads **1.55%** because of the sandbox.

`registros_atorados()` already knows to suppress `%@red-demo.test` (its `not like all` array), so the
*wedge* detector is sandbox-aware. The *mail rail* is not.

**Member-visible symptom:** none, until Resend's account-wide AUP threshold (documented at ~4% bounce)
suspends the domain and every tenant loses invites, receipts and auth mail simultaneously — the same
key, per P-036/P-105.

**Breaking point:** at today's 194-mail volume, **8 bounces** crosses 4%. Three of the last four came
free from the sandbox.

**Evidence:** M4, M5; `supabase/functions-canonical/registros_atorados.sql` (suppression array);
`apps/admin/src/app/(app)/vender/recibo-envio.ts:26-27` (sends whenever an email exists).

**Fix hint:** refuse `.test` / `.invalid` / `.localhost` recipients inside `resendTransport`, next to
the existing non-ASCII refusal (`invitaciones.ts:85-90`) — one predicate, and the sandbox becomes
structurally unable to spend the production bounce budget.

---

### T1-12 · Q6's answer: renaming one route folder silently kills every auth mail, with all tests green

**Severity 3 · basis: measured (the coupling), modelled (the developer act)**

`construirUrl` (`correo.ts:64-77`) throws unless `new URL(redirectTo).pathname === "/auth/confirm"`
**exactly**. `index.ts:106-111` catches that and returns 400, which per the Supabase docs GoTrue
translates to `500: Invalid payload sent to hook` at the caller. That is by design (#217 — fail closed
rather than mis-mint cross-tenant) and it is currently the only reason the e2e sink produces 6 hook
failures a day (M12; M14 `unexpected_failure` ×6).

The path string is written in five places and asserted in none: the route directory
`apps/client/src/app/auth/confirm/`, the three senders that build it (`registro/actions.ts`,
`entrar/actions.ts`, `activar/actions.ts:89`), the hook's literal at `correo.ts:69`, and the test
fixture `correo.test.ts:20` (`"https://red-demo.ibookit.lat/auth/confirm"`).

Rename the folder to `confirmar` — a one-line act, one `git mv` plus whatever the developer greps for
in the app — and: `pnpm lint` passes, `pnpm typecheck` passes (nothing is typed on the string),
`pnpm test` passes (`correo.test.ts` keeps feeding its own literal), `test:denial` passes (no SQL
involved), and `test:e2e` is convention-only and already failing on this host for an unrelated reason
(marce-triage §5). Live result: every signup, every recovery, every magic link 500s. The one guard that
would catch it — the hook's own fail-closed 400 — is the thing that causes the outage, and nothing
alerts on it (T1-01, T1-07).

Runner-up one-liners, same shape: adding a fourth mail sender without wrapping it in the resend counter
(nothing enforces the wrap — T1-03), and adding a `copia()` branch whose subject collides with an
existing one (nothing asserts subject uniqueness).

**Evidence:** `supabase/functions/send-email/correo.ts:64-77`;
`supabase/functions/send-email/index.ts:106-111`;
`supabase/functions/send-email/correo.test.ts:13-20`;
`apps/client/src/app/activar/actions.ts:89`; `ls apps/client/src/app/auth/` → `confirm`;
Supabase Auth Hooks guide, "403, 400 | Treated as Internal Server Errors and return a 500 Error Code".

**Fix hint:** export the path as one constant from a place both tiers already share, or add a one-line
guard test that reads the route directory name and compares it to the literal in `correo.ts`.

---

### T1-13 · Desk-typed and operator-typed strings are interpolated raw into mail HTML

**Severity 2 · basis: measured**

`mensajeInvitacion` builds HTML by template literal with no escaping: `${saludo}` derives from the
`nombre` a desk operator typed (`invitaciones.ts:162,165`) and `${gymNombre}` comes from
`gym.brand_name` (`:166,171`). The hook does the same with `${url}` inside `href="${url}"`
(`correo.ts:170,172`) and `${s}` inside `<strong>` (`:161`).

Blast radius is small — mail clients strip scripts, `url` is clamped by the Supabase redirect
allow-list, and `brand_name` is operator-owned — so this is a rendering-correctness bug (a member named
`Ana <casa>` breaks the layout) more than a security one. Listed because it is a five-minute fix in a
file that is otherwise disciplined about exactly this.

**Evidence:** `packages/data/src/server/invitaciones.ts:161-181`;
`supabase/functions/send-email/correo.ts:161,165-175`.

---

## Explicit answers to the owner's questions, by number

### Q1 — Where are ALL the drifts? ("not presenting before, now they don't stop")

Five, in my territory, ordered by how much each raises the per-member failure rate. Each is dated.

**D1 — the mix shifted from the invite door to the self-registration door (M17).** Weekly
`Confirma tu cuenta` volume: **0 → 8 → 8 → 13 → 16**, while invites went 3 → 28 → 11 → 12 → 9. Auth
mail doubled over the month; invite mail did not. Every failure mode above (the 429, the
identical-subject stack, the rotated token) lives on the *auth* rail, not the invite rail. That is the
single best answer to "why now": the door that produces these failures is the one growing.
`basis: measured.`

**D2 — the 2026-08-30 shield wave traded a wedge for an inbox stack, and its own mitigation is dead on
arrival (`afd7a5d5`, `17566753`).** The wave added a resend door so a member no longer has to re-POST
`/registro` for a fresh link. Working as designed, each press adds another mail with the same subject
and voids the previous link (T1-05). The mitigation for that — the 6-digit fallback, so a dead link
would not matter — has rendered **0 of 16 times** (T1-02). Net effect on a confused member: worse than
before the fix, not better. `basis: measured.`

**D3 — the alert cron went hourly on 2026-08-30 (`afd7a5d5`) and back to daily on `860a3893`, and has
emitted nothing in 30 days (T1-01).** "They don't stop" is partly a statement about detection: the owner
finds out when a member texts him. `basis: measured.`

**D4 — the 2026-08-28 `es_principal` cutover split RED's link hosts (`95583ac9`).** Invites are minted
from `gym_domain` principal-first (`invitaciones.ts:134-140`) → `www.redfunctionaltraining.com`. Auth
mail is minted from the *request* origin (`activar/actions.ts:86` reads `h.get("host")`) → whatever host
the member happened to be on. Live evidence that they diverge: all of Marce's mail links are on
`www.redfunctionaltraining.com` while her `/verify` and `/token` calls carry
`Referer: https://red.ibookit.lat` (marce-triage §2 rows 8–9, §3). Members holding a pre-08-28 invite
hold a `red.ibookit.lat` link; whether that host is still in the Auth redirect allow-list is
**unmeasured** (dashboard). `basis: measured (the split); unmeasured (the allow-list).`

**D5 — NOT a drift, stated because I went looking for it:** the `/registro` link on `/entrar`
(`entrar-form.tsx:343`, the "¿Primera vez? Crea tu cuenta" nudge) is the entry point of the whole
episode, but `git log -L 343,343` dates it to **`2c040430`, 2026-07-08** — 56 days before the incident.
It is not new. What changed around it is D1 (more members walking it) and D2 (what happens when they
do). `basis: measured — git blame.`

### Q2 — Where are the weak spots that would actually pop?

In order: **T1-01** (nothing is watching — already popped, silently, for 475 hours); **T1-02** (a
shipped rescue rail with a 0% live success rate); **T1-03 + T1-04** (the ungoverned `/activar` rail plus
a screen that tells the member to do the thing that re-triggers the error); **T1-05** (the probability
of picking the right mail is 1/N and N only grows); **T1-08 + T1-11** (one shared Resend key with no
throttle, and a sandbox spending the production bounce budget).

### Q3 — Stressed to the top, where does it break?

| Component | Ceiling | Measured today | Margin |
|---|---|---|---|
| `send-email` hook wall clock | **5 000 ms** total incl. retries (Supabase doc) | max **2 594 ms**, avg 768 ms (M13) | **1.9×** — with 3 unbounded fetches inside it (T1-06) |
| Hook retries on 503 | doc says ≤3; arithmetic says **1** (2 s back-off × 770 ms attempt vs 5 s) | 0 observed | `correo.ts:197` overstates by 3× |
| GoTrue per-address mail | **60 s** floor | 2 × 429 in 24 h, one member (M14) | binds first for any single member |
| GoTrue project-wide auth mail | 50/hr (asserted, P-069 — **live value unmeasured**) | peak 30 mails/hour, all kinds (M3) | ~1.7× if 50/hr is real |
| Resend daily quota | 100/day on Free (**plan tier unmeasured**) | peak **37/day** (M3) | 2.7×; **63 REENVIAR presses** closes it (T1-08) |
| Resend bounce budget | ~4% account-wide; suspension without warning | **1.55%** account / 0.52% real (M5) | **8 bounces** at current volume crosses it |
| Invite sends | **unbounded** — no throttle anywhere (T1-08) | — | the human finger is the only limiter |

The first thing to break under load is not throughput; it is the **shared bounce budget** — account-wide,
cross-tenant, penalised by suspension rather than by 429s, and already 3-of-4 poisoned by synthetic
`.test` addresses (T1-11).

### Q4 — Three months idle, what breaks?

Ordered by when it bites; all of these land inside the window.

1. **TLS certificates expire 2026-10-07** — 35 days out. Nine certs issued in one 19-minute window,
   renewal never verified (`02-drift-timeline.md` row 43; memory `member-reachability-todo`;
   **as-recorded, not re-verified this round**). Every link in every mail already sent stops opening.
2. **Every emailed auth link dies.** `otp_expiry` local-dev intent is 3 600 s (`config.toml:234`; live
   value unmeasured). The 8 currently outstanding `auth.one_time_tokens` (`01-live-snapshot.md` §G) are
   dead within the hour, let alone the quarter.
3. **The 67 claim codes do NOT die** (T1-09). After 3 months the invite mail is the only working
   credential left in a member's inbox.
4. **The Supabase project pauses.** Free-tier projects pause after ~7 days of inactivity, and this
   project is on Free by inference (AGENTS.md: "preview branching is Pro-gated / 402; the free tier fits
   exactly one scratch beside live"). A paused project = no GoTrue, no hook, no mail at all.
   `basis: reasoning, not sourced — experiment: read the org's plan on the Supabase billing page.`
5. **The cron's `SUPABASE_ACCESS_TOKEN` PAT expires** and the shield goes from silent to
   silent-with-a-reason (`route.ts:167`; `resumen.ts:179` would set `alertar`, but the mail never sends
   anyway — T1-01). Precedent: memory `ibookit-app-ui-worktree` records the scratch PAT already dying
   once.
6. **What does NOT decay, with evidence:** DKIM and both SPF records are `verified` today (M8) and
   Resend does not auto-rotate them; the deployed `send-email` v8 is byte-identical to the repo
   (`01-live-snapshot.md` §A) and the `.husky/pre-push` gate (`EDGE_DEPLOY_OK=1`) makes silent version
   drift structurally hard. Those three are sound. Ranked anyway, at the bottom, because "sound today"
   is not "monitored".

### Q7 — Every await takes 30 s, every network call fails halfway. Which sends leave a broken state?

1. **The hook, worst case.** `index.ts:115-125` has no abort. At 30 s it blows the 5 s budget; GoTrue
   times the hook out and fails the auth action **after** the one-time token was minted and the previous
   one rotated away. If Resend accepted the message before the connection died, the member receives a
   mail for an account that was rolled back. `correo.ts:200-204` documents that exact shape being
   live-verified on 2026-07-10.
2. **The hook, half-fail.** Resend accepts (2xx) but the response never arrives → `catch` at
   `index.ts:127` sets `status = null` → `respuestaEnvio` → 503 → GoTrue retries → **a duplicate mail**,
   deepening the identical-subject stack (T1-05). Re-derivation of P-055 at HEAD.
3. **The invite, half-fail.** `resendTransport` aborts at 10 s (`invitaciones.ts:58`), but the abort is
   local — Resend may already have queued the message. The action returns `envio-fallido`, the ficha
   toasts "Intenta de nuevo más tarde" (`cliente-detalle.tsx:96-104`), the operator presses again, and
   the member gets two invites carrying the same code.
4. **The invite, stamp-after-send.** `invitaciones.ts:244` sends, `:248` stamps
   `marcar_invitacion_enviada`. Fail between them and the mail is out while the ficha still reads
   `sin_invitar` — the badge actively instructs the operator to send again. No idempotency key and no
   outbox exist anywhere on this rail (P-105).
5. **The `/activar` rail.** `enviarMagicLink` awaiting 30 s stalls the server action past the browser's
   patience; the member re-submits, spends the GoTrue 60 s window, and lands on `cuentaExistenteFallo` —
   the T1-03 + T1-04 pair, triggered by latency instead of by a double-tap.
6. **The alert cron** bounds both its calls at 20 s (`route.ts:105,139`) and answers 502 rather than a
   green tick — this one is correct. Stated as sound, with the cite; still ranked at the bottom because
   the 502 goes to a Vercel log with no reader (T1-01).

---

## Keep-verdicts

| Verdict | Exit trigger |
|---|---|
| **KEEP Resend** as the single transport | Real-recipient bounce rate exceeds **2.0%** in any rolling 30-day window (today **0.52%**, 1/191 — M5), **or** any single day exceeds **80** mails (today's peak **37** — M3). |
| **KEEP the hook's fail-closed 400** on a bad `redirect_to` | More than **2** fail-closed 400s in a 24 h window from a **non-sandbox** recipient (today **6 of 6** are `delivered@resend.dev` — M12, marce-triage §5). Below that it is the e2e harness, not production. |
| **KEEP one shared Resend key + one sending domain** across tenants | A **4th** live tenant onboards, **or** any single gym sends **30** invites in one week (max observed **28**, week of 08-10, across all gyms — M17). Either makes one gym's bad list able to mute the others. |
| **KEEP `permitirReenvio` in process memory** (best-effort by construction) | More than **1** `over_email_send_rate_limit` per week attributable to a distinct real member (today **2**, both the same member on the same day — M14). Above that the per-instance Map is provably not the binding constraint and shared state is warranted. |
| **KEEP the hook byte-identical-to-repo posture** (`EDGE_DEPLOY_OK=1` pre-push gate) | Any live-vs-repo diff at all — **1** differing line. Today **0** (`01-live-snapshot.md` §A). |
| **DO NOT KEEP the alert cron in its current state** | **Undecided — question: are `CRON_SECRET`, `SUPABASE_ACCESS_TOKEN` and `ALERT_EMAIL` set on the admin Vercel project, and is the cron scheduled there? Only the owner can read that dashboard.** Until answered, the cron is a shield that produced 0 output in 30 days against a 475-hour wedge, and counting it as coverage is worse than having none. |
| **KEEP the never-expiring claim code** | **Undecided — question: should an invite code expire, and after how many days? The owner must rule.** Note 4 of the 67 live codes sit on invites older than 30 days, oldest 53 days (M15), and ADR-0009 / #126 accepted the bearer-token trade deliberately. |
| **KEEP `p=none` DMARC** (no ratchet — the 2026-09-01 lane ruled p=quarantine/reject **NEVER**) | Not the ratchet, but: **0** aggregate reports are collected today because there is no `rua=` (M9). Exit trigger for adding `rua=` only: **1** unexplained deliverability complaint a report would have diagnosed — which already happened twice (2026-08-19 FortiGuard, 2026-09-01 Marce/spam). By that trigger it is already met. |

---

## Could not determine — and the experiment that settles each

| Question | Experiment |
|---|---|
| Why does `email_data.token` fail `/^\d{6}$/`, making T1-02 a 100% failure? | One instrumented deploy: log `typeof token` + `token.length` (never the value) from `index.ts`, run one signup, revert. Second look: Auth → Email → OTP length in the dashboard. |
| Live GoTrue rate limits (emails/hour, sign-in attempts, token verifications) | Dashboard → Authentication → Rate Limits. `config.toml` is local-dev only (`01-live-snapshot.md` §H). The whole Q3 auth-mail row stays asserted until this is read. |
| Live `otp_expiry`, and the Redirect-URL allow-list contents (does it still hold `red.ibookit.lat` after the 08-28 cutover?) | Dashboard → Authentication → Email / URL Configuration. Settles D4's second half. |
| Resend plan tier and daily quota | Resend dashboard → billing. Turns T1-08's "63 presses" from modelled to measured. |
| Does GoTrue actually retry a 503 that carries **no** `retry-after` header? | On a scratch project, point the hook at a Resend key that 500s, fire one signup, count `run_hook` lines. The whole "a failed send is retried" design depends on the answer. |
| Is the alert cron deployed and armed? | `curl -H "Authorization: Bearer $CRON_SECRET" https://<admin-host>/api/cron/alertas` — 401 vs 500 vs 200 names the missing piece (`route.ts:161,170-180`). |
| Did any member ever open a stale link (H7's missing half)? | Unanswerable retroactively: `open_tracking:false`, `click_tracking:false` (M8). Turning them on is the only fix; it is a per-account Resend setting. |
| Does RED's invite mail land in Gmail's spam folder? | Send one invite to a fresh Gmail address the owner controls and look. `email-deliverability-lane` (2026-09-01) recorded "invite had delivered to spam all along" for Marce — **as-recorded, not re-verified this round**; Resend reports `delivered`, which says nothing about folder. |
| Will `www.redfunctionaltraining.com`'s TLS cert renew before 2026-10-07? | `openssl s_client -connect www.redfunctionaltraining.com:443 \| openssl x509 -noout -dates`, and again on 10-01. |

---

## Blind spots — what I did not examine

- **Everything past the click.** `/auth/confirm/route.ts`, `activar-cuenta` (edge fn v3),
  `reclamar_o_crear_cliente`, `reclamar_por_codigo`, `intentarReclamoPorEmail`, cookies, `proxy.ts`,
  session mint. Other seats own these; I stopped at the inbox.
- **The `/codigo` landing page.** I proved the code never reaches the mail (T1-02); I did not open the
  page that would consume it, so "the rail is dead" is proven on the mail side only.
- **Turnstile.** `verificarTurnstile` gates `activarAction` before any mail is attempted
  (`activar/actions.ts:59-65`); I did not read it, did not check whether the live site keys are
  non-default (P-096's launch gate), and did not treat a Turnstile outage as a mail-path failure.
- **The receipt template** beyond its `From:` name and its subject shape.
- **Forge's own funnel.** Forge holds **28** live claim codes — more than RED — with
  `booking_enabled:false`. I measured its mail but did not trace its member journey. A fourth gym,
  `forge-demo`, exists live and is absent from `01-live-snapshot.md` §D's tenant table.
- **I sent no mail and ran no gate.** No test send, no `pnpm test:e2e`, no `pnpm test:denial`, no
  `pnpm test`. Every claim is a read, a log query, or a `GET`.
- **The Resend ledger's horizon.** It reaches back only to 2026-08-04 21:59Z (M1) — 29 days. Nothing
  older is recoverable, and `auth.audit_log_entries` is empty with a 24 h log window (P-089/P-084), so
  any pattern older than a month is invisible to this seat.
- **`apps/mobile/`** — untracked and out of scope.

---

## Draft audit — sentences cut or retagged, and the rule that caught each

1. **CUT:** "The `/registro` link on `/entrar` is the recent change that started pushing members onto
   the public door." — `git log -L 343,343:entrar-form.tsx` dates it to `2c040430`, **2026-07-08**, 56
   days before the incident. **Rule 5 (cite or drop)** killed it; it survives only as D5, restated as a
   non-drift with the blame line attached.
2. **RETAGGED:** P-082's "her *magic-link* mails never carried a usable fallback" was going to be reused
   as-is. Measuring 16 bodies showed the three genuine **signup** mails lack it too, and so does every
   other member's. **Rule 7 + the attribution rule** — reframed as T1-02 with a new measurement, the
   prior cited as the narrower predecessor rather than as the finding.
3. **RETAGGED:** P-036's "1 hard bounce in 18 = 5.6% vs <4% shutdown" was going to lead the bounce
   finding. Re-derived at HEAD the number is **1.55% account / 0.52% real over 194 mails**.
   **Rule 5 + the re-derivation rule** — the prior is attribution, the live number leads, and the real
   finding moved to *where the bounces come from* (T1-11), which the prior did not identify.
4. **CUT:** "The `500: Invalid payload sent to hook` errors are a production defect." — my own log read
   confirms all 6 in the 24 h window belong to `delivered@resend.dev`, matching marce-triage §5.
   **Rule 7 (never invent a finding)**; it survives only as the *cover-noise* problem inside T1-12.
5. **CUT:** "DMARC `p=none` is a deliverability weakness." — the 2026-09-01 email-deliverability lane
   ruled the ratchet **NEVER**, with reasons. **Rule 4 (an incumbent ruling is not overturned by a
   generic best practice).** Only the non-ratcheting half survives: there is no `rua=`, so no reports
   exist.
6. **CUT:** "The apex `ibookit.lat` has no SPF TXT record, which hurts deliverability." — DKIM
   `d=ibookit.lat` is verified (M8) and DMARC relaxed alignment covers the `send.` subdomain envelope.
   No number here is produced by this system. **Rule 4 (substitution test) + rule 5.**
7. **RETAGGED:** "The Supabase project pauses after 7 days idle" — I could not read the plan tier.
   **Rule 5** → tagged `reasoning, not sourced`, with the billing-page experiment, inside Q4.
8. **CUT:** "GoTrue retries the hook up to 3× on a 503, so a transient Resend failure is covered." —
   that is `correo.ts:197`'s own claim, i.e. the code speaking about itself. **Rule 4 (the incumbent is
   a candidate).** Replaced by the doc's 5 s budget arithmetic (one retry at most) and by the missing
   `retry-after` header, both inside T1-06.
9. **KEPT DELIBERATELY, flagged:** the TLS-expiry item in Q4 is carried from `02-drift-timeline.md`
   row 43 / memory `member-reachability-todo` and is tagged **as-recorded, not re-verified this round**
   — I did not run `openssl s_client`. **Rule 5's tagging clause.**
