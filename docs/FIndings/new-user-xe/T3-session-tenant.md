# T3 — Session + tenant

Cross-examination seat T3, 2026-09-02. Repo HEAD = `33c9087a`. Live project
`hjppxawglmukfvsgmcog` (SELECT / read-only only; no mutation, no migration, no deploy).
Emails masked `xxx***@domain` except `marcerubiogarcia07@gmail.com` (already documented).

**Territory:** cookie mint, both `proxy.ts` files, the server + browser Supabase clients, refresh
and reuse, fetch shield + `pdx1` pin, `resolveTenant` / `x-gym` / `x-brand`, `es_principal` after
the 08-28 RED cutover, the redirect fallback, multi-gym membership resolution, switch-account on
one device, logout, cookie decay, two tabs. The question this seat owns: **where does a new member
on `red.ibookit.lat` land in the wrong gym, get bounced to `/entrar`, or hold a session the server
no longer honours?**

Answer, up front: **all three happen, and two of them are measurable in the last 24 hours of live
auth logs.** Nine devices were handed a server response this code classifies as "session is dead,
shed the cookie" — six of them inside a two-second burst. That is the mechanism behind "bounced to
`/entrar`", and it is not the incident the 465dcf4 shield was built for.

---

## Ranked findings (worst first)

### T3-01 — The admin proxy signs the desk out on any GoTrue 500/429, and 500s every admin route on a throw (severity 5)

**Claim.** `apps/admin/src/proxy.ts` calls `await supabase.auth.getClaims()` at line 82 with no
`try/catch`, and its `setAll` (lines 56-71) rides *every* cookie batch back to the response —
including auth-js's teardown. The client proxy has both guards; the admin proxy has neither.
The two files were written from the same template and only one of them was hardened on 2026-08-21.

**Why a GoTrue 500 is enough.** auth-js 2.106.2 treats only
`[502, 503, 504, 520, 521, 522, 523, 524, 530]` as retryable
(`@supabase/auth-js/dist/main/lib/fetch.js:32`, `NETWORK_ERROR_CODES`). A plain **500** and a
**429** are *not* in that list, so `_callRefreshToken` falls into
`if (!isAuthRetryableFetchError(error)) await this._removeSession()`
(`GoTrueClient.js:3929-3932`). `_removeSession` fires `setAll` carrying nothing but deletions.
The client proxy parks that batch (`apps/client/src/proxy.ts:124-135`) and only lets it ride for
four codes; the admin proxy writes it straight onto the response.

**Member-visible symptom.** Not the member's screen — the *desk's*. The operator is thrown to
`/login` mid-shift, or (on a throw) gets a 500 on every admin route including `/login` itself,
with no way back in. Every new member on this platform is created at that desk: no desk, no
`crear cliente`, no venta, no `REENVIAR INVITACIÓN`. It is upstream of the whole new-user funnel.

**Evidence**
- `apps/admin/src/proxy.ts:82` — `const { data } = await supabase.auth.getClaims()`, bare.
- `apps/admin/src/proxy.ts:56-71` — `setAll` with no `esBorradoTotal` park.
- `apps/client/src/proxy.ts:21-23, 35-44, 111, 124-135, 167-181` — the two guards the admin file lacks.
- `node_modules/.pnpm/@supabase+auth-js@2.106.2/.../lib/fetch.js:30-41` — 500/429 are non-retryable.
- `node_modules/.pnpm/@supabase+auth-js@2.106.2/.../GoTrueClient.js:3928-3933` — non-retryable ⇒ `_removeSession()`.
- No `apps/admin/src/proxy.test.ts` exists (`ls`, 2026-09-02). No admin twin of `e2e/session.spec.ts`.

**Basis:** measured (code + library source at HEAD). The *frequency* of GoTrue 500/429 on
`/token` in this project is **unmeasured this round** — the 24 h window showed no 500 on `/token`,
only `invalid_credentials` (25) and `refresh_token_not_found` (9).

**Breaking point.** One non-retryable GoTrue response on `POST /auth/v1/token` — count = 1.
Bound by nothing; there is no retry, no park, no floor.

**Prior art.** `03-prior-register.md` P-019 (catalog F-29) and P-048 (evidence.md §Two proxies)
state the same asymmetry. **Re-derived at HEAD this round** with the auth-js line numbers that
prove a 500 (not just a dead token) reaches `_removeSession` — that part is new.

**Fix hint.** Copy `esBorradoTotal` / `esSesionMuerta` / the `try{}catch{}` out of the client
proxy into a shared `@gym/data/server/proxy-sesion` module and have both proxies import it. One
module, two call sites, and the next drift is a compile error rather than a silent divergence.

---

### T3-02 — `refresh_token_not_found` is classified as "session is dead" and sheds the cookie; it fired 9× in 24 h, 6 of them in 2 seconds (severity 5)

**Claim.** `CODIGOS_SESION_MUERTA` (`apps/client/src/proxy.ts:35-40`) contains
`refresh_token_not_found` and `refresh_token_already_used`. When `getClaims()` returns either,
the parked teardown is *applied* — `__Host-sb-auth-token` is deleted from the browser and the
member is on the password form. But both codes are *also* the normal outcome of two concurrent
requests replaying the same refresh token: the first rotates it, the losers get "not found".
The code treats a concurrency race and a real revocation as the same event.

**Live measurement (this round).** GoTrue `auth_logs`, 24 h to 2026-09-02T17:30Z:

| error_code | path | n |
|---|---|---|
| `invalid_credentials` | `/token` | 25 |
| **`refresh_token_not_found`** | **`/token`** | **9** |
| `unexpected_failure` | `/signup` | 6 |
| `email_exists` | `/admin/users` | 5 |
| `otp_expired` | `/verify` | 4 |
| `over_email_send_rate_limit` | `/otp` | 2 |
| `validation_failed` | `/token` | 1 |
| `email_not_confirmed` | `/token` | 1 |

The 9 are not spread evenly. Six of them land in **two seconds**:

```
2026-09-01T20:42:58  refresh_token_not_found  ip 3.101.19.78
2026-09-01T20:42:58  refresh_token_not_found  ip 18.145.191.32
2026-09-01T20:42:58  refresh_token_not_found  ip 3.101.19.78
2026-09-01T20:42:58  refresh_token_not_found  ip 18.145.191.32
2026-09-01T20:42:59  refresh_token_not_found  ip 3.101.19.78
2026-09-01T20:42:59  refresh_token_not_found  ip 18.145.191.32
```

Three failures per IP inside one second, from two distinct server IPs, `referer` = the bare
`https://red.ibookit.lat` (i.e. server-side, no browser `Referer` — see T3-03). That is the
signature of parallel proxy invocations replaying one stale refresh token, which is precisely the
case this classifier calls unrecoverable.

**Member-visible symptom.** "I was logged in and now it asks for my password again." The member
is not signed out server-side (`auth.sessions` still has the row) — only the cookie was deleted,
by our own proxy, on our own response.

**Evidence**
- `apps/client/src/proxy.ts:35-44` — the four dead codes.
- `apps/client/src/proxy.ts:169-178` — `if (esSesionMuerta(error) …) borradoPendiente.aplicar()`.
- `mcp__supabase__query_logs` (2 queries), 24 h window; raw rows quoted verbatim above.
- `packages/data/src/server/fetch-shield.ts:33-36` — the module's own comment names this exact
  hazard for `already_used` and forbids "completing" the shield over `POST /auth/v1/token`;
  it does **not** address the classifier that then rides the teardown.
- `GoTrueClient.js:3908-3911` — auth-js dedupes concurrent refreshes only *within one client
  instance* (`this.refreshingDeferred`). `@supabase/ssr` builds a new client per request
  (`packages/data/src/server/supabase.ts:26`), so cross-request concurrency is undeduped by design.

**Basis:** measured (log counts + code). Attribution of the 6-in-2 s burst to a specific member
is **unmeasured** — GoTrue emits no `actor_id` on a token it cannot resolve.

**Breaking point.** Two proxy invocations for the same session whose gap exceeds
`refresh_token_reuse_interval`. The repo's local value is **10 s**
(`supabase/config.toml`, per `01-live-snapshot.md` §H); the **live** value is unmeasured. At 10 s,
any two navigations more than 10 s apart on a token that has just rotated is a sign-out.

**Fix hint.** Cheapest correct change: drop `refresh_token_not_found` and
`refresh_token_already_used` out of `CODIGOS_SESION_MUERTA` and keep only `session_not_found` /
`session_expired`. A live-but-unrotatable cookie costs one extra failed refresh per load; a
wrongly-shed cookie costs a login. Second: log the code on every shed so this is countable
without a log-stream regex.

---

### T3-03 — RED serves two public client hosts with disjoint `__Host-` cookie jars, no canonical redirect, and GoTrue's own fallback names the *non*-canonical one (severity 4)

**Claim.** `gym_domain` maps two public `app='client'` hosts to gym `red`:
`www.redfunctionaltraining.com` (`es_principal=true`, created 2026-08-28) and `red.ibookit.lat`
(created 2026-07-09). `__Host-` forbids a `Domain` attribute by RFC, so their cookie jars are
disjoint — `packages/data/src/cookie-options.ts:44-49` documents this and explicitly forbids the
`Domain=` "fix". Nothing redirects one host to the other.

**Live verification (curl, 2026-09-02T17:31Z):** both hosts answer `GET /entrar` with
**HTTP 200** — not a 301/308 — and both mint `Set-Cookie: gym=red; Path=/; Secure; SameSite=lax`.
No `redirects()` in `apps/client/next.config.ts`; no `redirects` key in `apps/client/vercel.json`.

**And GoTrue's fallback is the wrong one.** Every server-side GoTrue call in the 24 h window logs
`referer: https://red.ibookit.lat` with **no path** — `/verify` (10), `/token` (142),
`/.well-known/jwks.json` (743) — regardless of which gym's user it is
(`dem***@red-demo.test`, `for***@outlook.com`, `tes***@outlook.com` all logged out under it).
A server-side fetch sends no `Referer`, so this is GoTrue's own fallback value, i.e. the project's
**Site URL is `https://red.ibookit.lat`** — one tenant's platform subdomain, not the canonical
customer domain and not tenant-neutral. Requests that *do* carry a real value show the other host:
`/otp` ×8 and `/signup` ×9 for real members carry `https://www.redfunctionaltraining.com/auth/confirm`,
and `/logout` ×5 carries the browser `Referer` `https://www.redfunctionaltraining.com/`.

**The concrete member consequence, in Marce's own inbox.** `construirUrlInvitacion`
(`packages/data/src/server/invitaciones.ts:128-137`) orders `es_principal DESC, created_at ASC`.
Before 2026-08-28 that column did not exist, so `created_at ASC` picked `red.ibookit.lat`. Her
invite #1 (Resend ledger, `2026-08-19 18:27:40`, per `2026-09-02-marce-triage.md` §3) therefore
named `red.ibookit.lat/activar?codigo=33SDA38A`, while invites #2 and #3 (`09-01 17:18`,
`09-02 16:28`) named `www.redfunctionaltraining.com/activar?codigo=33SDA38A`. **Same code, two
hosts, two cookie jars, three mails.** Signing in via the old one leaves no session on the new one
and vice versa, and neither host tells the member the other exists.

**Member-visible symptom.** "I logged in yesterday and today it asks me again" — because today's
link is a different host. Or: the member is signed in on one host while a mailed link opens the
other and shows `/entrar`.

**Evidence**
- `execute_sql` on `gym` ⋈ `gym_domain`: 4 gyms (`forge`, `forge-demo`, `red`, `red-demo` — note
  `01-live-snapshot.md` §D lists only 3 and misses `forge-demo`), 5 public client hosts, `red`
  holds 2 of them; `www.redfunctionaltraining.com` is the only `es_principal=true` row on the platform.
- `curl -D - https://red.ibookit.lat/entrar` and `.../www.redfunctionaltraining.com/entrar` →
  both `HTTP/1.1 200 OK`, `X-Matched-Path: /entrar`.
- `packages/data/src/cookie-options.ts:35-37, 44-49`.
- `query_logs` referer-host aggregate (quoted above).
- `docs/FIndings/2026-09-02-marce-triage.md` §3 (Resend ledger + link URLs).

**Basis:** measured for the hosts, the 200s, the link URLs and the log distribution. **Modelled**
for "the member is signed in on one host and not the other" — I cannot read a browser cookie jar
from here. **Unmeasured:** the Supabase Redirect-URL allow-list and the Site URL dashboard values;
the Site URL is inferred from the GoTrue `referer` fallback pattern, not read.

**Prior art.** P-030 (catalog F-50) and P-051 state the two-jar hazard. `2026-09-02-marce-triage.md`
§3 refutes H5 ("host drift") *for the outbound mails of 09-01/09-02*, and that refutation is
correct and stands. This finding is the **inbound** half plus the pre-cutover mail, which the
triage did not cover.

**Breaking point.** Number of jars = 2 today. It becomes member-visible the first time one member
authenticates on both hosts — and Marce's inbox already contains links to both.

**Fix hint.** Two lines, no schema: (1) a Vercel/Next 308 from `red.ibookit.lat` to
`www.redfunctionaltraining.com` for gym `red` — the `es_principal` row already declares which way;
(2) set the Supabase Site URL to a host that is nobody's tenant (or to the `es_principal` host).
Do **not** try to share the jar with `Domain=` — that voids `__Host-` outright.

---

### T3-04 — `gym_id_por_host` is the first `await` on every request of both apps and is deliberately unbounded (severity 4)

**Claim.** Both proxies open with
`const tenant = await resolveTenant(request.headers.get("host"), override, undefined, <app>)`
(`apps/client/src/proxy.ts:102`, `apps/admin/src/proxy.ts:34`) before any response exists.
`resolveTenant` → `resolveHostUncached` → `client.rpc("gym_id_por_host", …)` — a **POST**.
`shieldedFetch` bounds GET/HEAD only: `if (method !== "GET" && method !== "HEAD") return fetch(input, init)`
(`packages/data/src/server/fetch-shield.ts:140`). The shield's own header comment names this
exclusion on purpose (`fetch-shield.ts:48-49`) because `p_app ?? null` would serialise as the
literal string `'null'` in a query string.

So the one call that gates *every* page of *both* apps is the one call with no timeout, no retry
and no fallback.

**Q7 answer for this seat.** If this await takes 30 s, every route on both apps takes 30 s — the
member sees a white screen, not a degraded page, because the proxy has not yet constructed a
response. If the call fails halfway, `resolveHostUncached` returns `{matched:false, tenant:null}`
(`resolve-tenant.ts:150`), so the member gets an unbranded, tenant-less render — `tenantHeaders`
*deletes* `x-gym`/`x-brand` (`resolve-tenant.ts:284-287`) — and `/auth/confirm`'s email-claim arm
silently does nothing (`auth/confirm/route.ts:88-96`: `if (tenant)`). A half-failed tenant read
turns a confirmation into a signed-in member with no membership.

**Member-visible symptom.** "It spins forever." Exactly the 2026-08-29 complaint shape.

**Evidence**
- `packages/data/src/server/resolve-tenant.ts:146-154, 196-212`.
- `packages/data/src/server/fetch-shield.ts:45-52` (the admitted exclusion), `:140` (the gate).
- `apps/client/src/proxy.ts:102`; `apps/admin/src/proxy.ts:34`.
- The 08-29 precedent is quantified inside the shield itself: `fetch-shield.ts:13-19` — 65
  requests over 5 s in 24 h, **worst 266 s**, all HTTP 200.

**Basis:** measured (code). The 266 s figure is quoted from the shield's own comment
(**as-recorded**, from the 2026-08-29 incident; not re-measured this round).

**Breaking point.** Unbounded — there is no number. The observed worst case for a *bounded*
sibling call on the same wire was 266 s; this one has no ceiling at all, only whatever Vercel's
function wall is (**unmeasured** — the experiment is a synthetic `gym_id_por_host` stall and a
stopwatch on `GET /entrar`).

Second, separate ceiling on the same code: the TTL cache is **500 entries / 60 s**, keyed
`${app}|${host}` (`resolve-tenant.ts:71-72, 161`). At 5 public client hosts the headroom is 100×.
It thrashes — every request paying the unbounded POST — once one isolate sees more than 500
distinct hosts in 60 s.

**Fix hint.** Give the RPC a bounded variant: either accept the `'null'` serialisation by
splitting into two GET-able RPCs (`gym_id_por_host_app` / `gym_id_por_host_any`), or wrap this one
call site in an `AbortController` with an 8 s budget and fall through to `{matched:false}`. It is
a *read*; the "a timed-out write may already have committed" reason in the shield's doc-comment
does not apply to it.

---

### T3-05 — `getEsMiembro` has no gym filter, so a membership in *any* gym suppresses the claim self-heal and the host renders another gym's week (severity 4)

**Claim.** `getEsMiembro` is `supabase.from("gym_membership").select("gym_id").limit(1).maybeSingle()`
— no `gym_id` predicate (`packages/data/src/server/agenda-miembro.ts:139-143`). Both member
landing pages gate the self-heal on it: `/reservar` (`page.tsx:58-67`) and `/saldo`
(`page.tsx:36-45`) run `intentarReclamoPorEmail` **only if `!esMiembro`**. A caller who holds a
membership in gym B and none in gym A therefore (a) never gets the claim retry on gym A's host,
and (b) falls into `resolverMiembroGym`, which prefers the host match and otherwise takes
**the oldest membership** (`packages/data/src/server/inquilino.ts:85-86`).

Result: on `red.ibookit.lat` the chrome is RED (`x-brand` comes from the host,
`resolve-tenant.ts:281-283`) and the agenda, the plan card and the timezone come from the other
gym.

**Member-visible symptom.** "I opened my gym's app and it's showing another gym's classes / my
plan is missing." Not a crash — `fetchMembresia` returns `{membresia: null}` for a missing cliente
row (`agenda-miembro.ts:499`) — a quiet lie.

**Evidence**
- `packages/data/src/server/agenda-miembro.ts:132-143` (no filter, and the doc-comment explains it
  is deliberately un-`cache()`d for the self-heal, i.e. this line is load-bearing).
- `apps/client/src/app/reservar/page.tsx:58-67`; `apps/client/src/app/saldo/page.tsx:36-45`.
- `packages/data/src/server/inquilino.ts:78-88`.
- Live liveness, measured this round:
  `auth_users_claimed_in_2plus_gyms = 0`, `users_with_2plus_memberships = 1`.
  The one is `dem***@red-demo.test` — `owner` on `red-demo` (2026-07-06) and `operator` on
  `forge-demo` (2026-08-21), **zero `clientes` rows in either**. So today the defect fires only
  for a staff identity on the client app; for real members it is latent.

**Basis:** measured (code + live counts).

**Breaking point.** Fires the first time one `auth.users` row holds memberships in two gyms and
opens the client app on the host of the *newer* one. Count today = 1 account, and it is staff.

**Prior art.** P-033 (catalog F-55) and P-053 state this. **Re-derived at HEAD**, and the live
counts are new this round.

**Honest correction to a prior claim.** The related `multigym-rpc-roulette` finding (P-103, memory
`multigym-rpc-roulette.md`, 2026-07-27) — "`mi_membresia()` and `toggle_favorito_tipo()` resolve
the caller's cliente row with a bare `limit 1`, no gym filter" — is **fixed at HEAD**. Both bodies
now take `p_gym_id` and filter on it:
`supabase/functions-canonical/mi_membresia.sql:18-21` and
`supabase/functions-canonical/toggle_favorito_tipo.sql:13-15`. Do not re-file it.

**Fix hint.** `getEsMiembro(gymId)` — pass the host tenant the pages already resolve two lines
later. One argument; the self-heal then runs for exactly the gym the member is looking at.

---

### T3-06 — One tap on VINCULAR binds someone else's paid roster row to the signed-in account and overwrites the invited email; there is no un-do (severity 5, Q5)

**Claim.** `/activar?codigo=…` with a live session on the device short-circuits both email rails
and renders `<VincularForm>` — a one-click bind (`apps/client/src/app/activar/page.tsx:68-87`).
`reclamar_por_codigo` verifies the HMAC `firma` and that the caller's email is *confirmed*, but
**never compares the session's email to the invited `clientes.email`**. It then
`set auth_user_id = v_uid, email = v_email, … claim_code = null`
(`supabase/functions-canonical/reclamar_por_codigo.sql:44-68`).

So member B's paid row is bound to member A's account **and B's address is destroyed in the same
statement** — `clientes.email` is overwritten with A's, `claim_code` is nulled, and per
`unclaim-cliente-recipe.md` (P-101) four separate layers block un-claiming a claimed row.

**The one guard, and exactly when it fails.** Lines 54-58 raise
`'Ya tienes cuenta en este gimnasio'` if A already holds a `clientes` row in B's gym. That covers
the common case (a RED member opening another RED member's link). It does **not** cover:

- A signed in from a *different* gym (red-demo / forge) on RED's host;
- A holding a bare `/registro`-minted `auth.users` row with no `clientes` claim anywhere — which
  is **exactly the state Marce was in from 2026-09-01 19:24 until 09-02 16:31**
  (`2026-09-02-marce-triage.md` §1: `auth.users` created 09-01, `gym_membership` created 09-02);
- a shared or front-desk device.

**Member-visible symptom.** B taps her invite link on a phone that is signed in as someone else,
taps the big button, and her paid month lands on their account. B is then permanently locked out
(her code is spent) and support has no record of her address.

**Mitigations that exist and are real.** The form *shows* the signed-in email and offers
"no soy yo" → `signOut({scope:'local'})` + `router.refresh()`
(`activar/_components/vincular-form.tsx:57-66`, #150). Turnstile gates the submit. But the
affirmative action is BIND and the escape is the secondary control; the guard is a label, not a
check.

**Evidence**
- `apps/client/src/app/activar/page.tsx:66-87`.
- `apps/client/src/app/activar/_components/vincular-form.tsx:36-66`.
- `supabase/functions-canonical/reclamar_por_codigo.sql:31-37` (confirmed-email check),
  `:44-58` (the only ownership guard), `:60-68` (the destructive UPDATE).
- P-096 (`activation-security-audit.md` H1, 2026-07-22) named the missing caller-email check;
  P-131 (`2026-08-28-atp404951-unclaim-session.md`) named the vincular short-circuit as the third,
  session-bearing rail. **Re-derived at HEAD** — the `email = v_email` overwrite on line 62 and its
  irreversibility is the part I am adding.

**Basis:** measured (code). The *rate* at which this fires in production is **unmeasured** — the
experiment is a query for `clientes` rows whose `email` no longer matches the address the invite
was mailed to, joined against the Resend ledger; I did not run it because it needs Resend history
beyond the 24 h log window and a mail-to-row join I could not make sound.

**Breaking point.** Count = 1 tap, by a member acting normally, on a device that is not theirs.

**Fix hint.** Add to `reclamar_por_codigo`, before the UPDATE: refuse when the target row already
names a *different* non-null address than the caller's verified email. Rows with `email is null`
(91 live, `01-live-snapshot.md` §G) keep today's behaviour. This is a migration and takes the
`test:denial` gate with a written-row assertion on `clientes.email`.

---

### T3-07 — Nothing in any automated gate can see any of the above (severity 3)

**Claim.** `apps/client/src/proxy.test.ts` contains **8 cases across 2 `describe` blocks**, and
both blocks test *pure predicates* (`esBorradoTotal`, `esSesionMuerta`). The `proxy()` function
itself — the tenant resolve, the `setAll` park, the teardown decision, the `gym` cookie write — has
**zero tests**. `apps/admin/src/proxy.test.ts` does not exist. `apps/client/e2e/session.spec.ts`
is 3 tests, is not in CI or pre-commit (AGENTS.md), and skips (exit 0) on unset credentials.

**Member-visible symptom.** None directly — this is why the other findings survive. Every one of
T3-01 … T3-06 is compatible with a fully green `pnpm lint && pnpm typecheck && pnpm test`.

**Evidence**
- `grep -n "describe\|it(" apps/client/src/proxy.test.ts` → lines 11, 12, 21, 31, 35, 43, 56, 60.
- `ls apps/admin/src/proxy.test.ts` → absent.
- `grep -n "test(" apps/client/e2e/session.spec.ts` → 3 (lines 72, 94, 105).
- AGENTS.md, "Browser-level session shield": "**Like `test:denial`, it is NOT in CI or pre-commit**
  … Unset credentials skip the suite rather than fail it."

**Basis:** measured.

**Prior art.** P-001 / P-005 (breaking-points ranked #1) make the general claim. This is the
T3-scoped count, re-derived at HEAD.

**Breaking point.** Already breached — 465dcf4 shipped 8 days of a session-blind auth surface with
every unit test green (P-062 / P-094).

**Fix hint.** One test that would have caught T3-01: call `proxy()` (admin) with a `getClaims`
that rejects, assert the response is not a 500. It needs no browser and no server.

---

### T3-08 — The `gym` cookie is a browser-session cookie and, on any unmapped host, is the sole tenant input for a call that mints membership (severity 3, Q6)

**Claim.** Both proxies persist the resolved slug as
`response.cookies.set("gym", tenant.slug, {path, sameSite, secure})` with **no `maxAge` and no
`expires`** (`apps/client/src/proxy.ts:183-188`, `apps/admin/src/proxy.ts:92-97`), so it dies with
the browser process. **Verified live**: `Set-Cookie: gym=red; Path=/; Secure; SameSite=lax` on both
RED hosts (curl, 2026-09-02T17:31Z) — no `Max-Age`, no `Expires`.

On a **mapped** host this is inert: `resolveTenant` returns the host arm first
(`resolve-tenant.ts:209-211`), so the cookie/`?gym=` override cannot widen. On an **unmapped**
host — a Vercel preview, the bare `*.vercel.app` alias, `pnpm dev` — the override is the *only*
tenant input, and `/auth/confirm`'s email-claim arm feeds that tenant into
`intentarReclamoPorEmail(tenant.id, …)` (`auth/confirm/route.ts:88-96`), which per ADR-0008's
2026-08-02 amendment (P-114) *inserts a `gym_membership` row*. The host mints membership.

**Q6 — the most plausible one-line change that breaks a guarantee with tests still green.** In my
territory, not the `cookieOptions` one-liner everyone already knows (P-038), but this:

> change `apps/client/src/proxy.ts:102` from `request.headers.get("host")` to
> `request.headers.get("x-forwarded-host")`.

Both proxy doc-comments explicitly forbid it (`client/proxy.ts:52`, `admin/proxy.ts:15`, "never
`x-forwarded-host` — ADR-0012") — which is exactly the shape of a rule that lives only in prose.
`grep -rn "x-forwarded-host" apps packages supabase` returns **two hits at HEAD, both inside those
comments**: no code reads it and **no test asserts the header name**. On Vercel both headers are
present and usually equal, so preview and production would look fine; a client-supplied
`X-Forwarded-Host` on any deployment that does not strip it makes the *caller* choose the tenant,
and on `/auth/confirm` that tenant becomes a `gym_membership` row.

Runner-up one-liner, same file: adding `|api` to the matcher negative lookahead. Next's own docs
warn that "a matcher change or a refactor that moves a Server Function to a different route can
silently remove Proxy coverage"
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:213-215`) —
and the **admin app's only route gate is the proxy** (`decideRedirect`, `apps/admin/src/lib/auth.ts`).

**Member-visible symptom.** For the cookie half: none on the mapped hosts (honest). For the Q6
half: a member confirming on the wrong host is enrolled in the wrong gym — and enrolment is a
write, not a render.

**Evidence:** cites above, plus the live `Set-Cookie` header.

**Basis:** measured for the cookie shape and the grep; **reasoning, not sourced** for the exploit
path (what would confirm it: a request to a preview deployment carrying `X-Forwarded-Host` and a
`gym` cookie, checking whether a `gym_membership` row lands — I did not run it, it is a write).

**Prior art.** P-018 (F-28) for the missing maxAge; P-013 (F-15) and P-044 for the resolver
one-liners. Re-derived at HEAD plus the live header and the Next-doc cite.

**Fix hint.** For the Q6 half: `expect(resolveTenant).toHaveBeenCalledWith(headers.get('host'), …)`
in a proxy test — a two-line assertion turns a prose rule into a red build.

---

### T3-09 — Sessions never expire server-side: 155 live, 155 with `not_after = null`, one alive 53 days and one refreshing continuously for 20 (severity 3, Q4/Q5)

**Claim + live measurement (this round):**

| metric | value |
|---|---|
| `auth.sessions` rows | **155** |
| … with `not_after IS NULL` | **155** (100 %) |
| unrevoked `auth.refresh_tokens` | **155** |
| users holding >1 session | **30** |
| max sessions for one user | **14** |
| oldest session `created_at` | **2026-07-11 20:29:21Z** (53 days) |
| single session created 2026-08-13 22:24, last `updated_at` | **2026-09-02 16:49Z** — 20 days of unbroken refresh |

**Q4 (three months idle) — my territory's answer.** Nothing in the *server* half decays. The
refresh token is never revoked; the session has no `not_after`; the cookie's `maxAge` is
**400 days** (`@supabase/ssr` `DEFAULT_COOKIE_OPTIONS`, verified in
`node_modules/.pnpm/@supabase+ssr@0.10.3_…/dist/main/utils/constants.js`) and the repo overrides
only `name` and `secure` (`packages/data/src/cookie-options.ts:35-37`). A Chrome/Android member
who returns after 90 days is refreshed transparently. The decay is entirely browser-side and it is
**iOS**: the cookie is `httpOnly: false` (same constants file), and Safari evicts all website data
after ~30 days without interaction (ADR-0016 amendment 2026-08-24, **asserted**, not measured
here). So: Android member returns logged in, iPhone member returns at a password form. That is the
honest split.

Two things that *do* decay and are mine: (a) the `gym` cookie (T3-08) — gone at browser restart,
inert on mapped hosts; (b) the `resolveTenant` TTL cache — a cold isolate after idle pays the
unbounded POST of T3-04 on the very first request.

**Q5 (switch account / lost phone).** The only revocation mechanism in the repo is the
`gym_membership` AFTER DELETE trigger `revocar_sesiones_al_quitar_membresia`
(`01-live-snapshot.md` §E, ADR-0016), and it is **global per identity** — `auth.sessions` carries
no gym column. So removing a member from gym A signs them out of gym B too, and there is *no*
per-device revocation at all: 14 sessions on one user, all `not_after = null`, none individually
killable from any surface in this repo. All four `signOut` call sites pass `{scope:'local'}`
(grep, 4 hits: `admin/.../logout-button.tsx:30`, `activar/_components/vincular-form.tsx:61`,
`reservar/_components/cerrar-sesion-link.tsx:28`, `reservar/_components/perfil-overlay.tsx:396`) —
correct for the 2026-08-24 incident (P-128), and it means "cerrar sesión" on a stolen phone that
you no longer hold does nothing to that phone.

**Member-visible symptom.** Benign for the common case (this is the owner's stated intent —
"members must stay logged in… the longest period possible", P-128). The bad case is a shared or
lost device: the session on it is valid forever and nothing in the product can end it.

**Basis:** measured (`execute_sql`, quoted). The iOS-eviction window is **asserted** (ADR-0016);
the experiment that would settle it is a real iPhone parked for 35 days.

**Keep-verdict.** Keep — see K4.

---

### T3-10 — The freshness rail is keyed on the host gym while the data is keyed on the membership gym, and it multiplies proxy invocations per tab (severity 2)

**Claim.** `SenalGym gymId={tenant.id}` where `tenant = await resolveTenant(headers().get("host"))`
(`apps/client/src/app/reservar/layout.tsx:25-30`, same at `clase/layout.tsx:19`). Every *data*
read on the same page is keyed on `resolverMiembroGym` instead. In the T3-05 mismatch case the tab
subscribes to `gym:<hostGym>`, the `senal_gym_select` policy
(`topic LIKE 'gym:%' AND is_member_of(...)`, `01-live-snapshot.md` §E) denies it, and the failure
surfaces as a single `console.warn("[senal] canal", estado)`
(`packages/data/src/client-senal.ts:218-224`) — invisible to the member and to us.

Second half, and the one with the timing: `onSenal` calls `router.refresh()`
(`apps/client/src/app/_components/senal-gym.tsx:22-25`), and the hook fires a `visible` motive on
every `visibilitychange` to foreground (`client-senal.ts:184-196`). Each `router.refresh()` is a
full RSC round trip → the proxy runs → `getClaims()` → a refresh attempt if the token is inside
auth-js's 90 s expiry margin
(`EXPIRY_MARGIN_MS = AUTO_REFRESH_TICK_THRESHOLD(3) × AUTO_REFRESH_TICK_DURATION_MS(30 000)`,
`@supabase/auth-js/dist/main/lib/constants.js:6-13`). With N tabs open, N foreground events
produce N concurrent refresh attempts on one refresh token — feeding **T3-02** directly.

**This is the newest thing on the surface.** `92c2059d` / `4292447f` / `2ecb00dd` / `63f1b48f`
landed 2026-09-01 and were pushed 2026-09-02 (`02-drift-timeline.md`). Before them,
`router.refresh()` fired only after the member's own book/cancel.

**Member-visible symptom.** Bring the app back from the lock screen a few times in a row on a
weak connection and land on `/entrar`.

**Basis:** measured (code + library constants) for the mechanism. **Modelled** for "this is what
produced the 09-01 20:42:58 burst" — the burst is 20:42 on 09-01, the señal apps were pushed
09-02, so the burst *predates* the deploy and cannot be blamed on it. Stated so it is not
overclaimed: señal makes T3-02 more likely from 09-02 onward, it did not cause the measured burst.

**Fix hint.** Pass the membership gym (`resolverMiembroGym`) into `SenalGym`, and debounce the
`visible` motive against a "last refresh < 30 s ago" floor.

---

### T3-11 — `Strict-Transport-Security: max-age=86400` on both apps (severity 2)

**Claim.** Both `vercel.json` files set HSTS to **1 day** (`apps/client/vercel.json`,
`apps/admin/vercel.json`; confirmed live in the curl headers above). `__Host-` cookies require
`Secure`, so a member whose HSTS pin has lapsed (>24 h since last visit — which describes most of
a gym roster) and who types the bare host makes one plaintext request before the redirect. On that
request the session cookie is not sent (Secure), so the member sees a signed-out page even though
they are signed in; on a hostile network it is also a downgrade window.

**Member-visible symptom.** An occasional, unreproducible "it logged me out" on the first tap of
the day.

**Evidence:** `apps/client/vercel.json`, `apps/admin/vercel.json`; live response header
`Strict-Transport-Security: max-age=86400`.

**Basis:** measured for the header; **reasoning, not sourced** for the member-visible link (what
would confirm it: a proxy trace of a cold `http://red.ibookit.lat` on a device whose pin has
expired).

**Fix hint.** `max-age=31536000; includeSubDomains` once the owner is happy the custom domain is
permanent. One value, two files.

---

### T3-12 — Sound, with evidence (M2): four things this seat expected to be broken and are not (severity 1)

Honesty outranks severity; these are ranked last, not omitted.

1. **JWKS is *not* refetched per request.** `auth-js` 2.106.2 caches the key set in a
   **module-level** `GLOBAL_JWKS` keyed by `storageKey`, TTL **10 minutes**
   (`GoTrueClient.js:43, 48-61, 4734`; `lib/constants.js:30`). Because
   `cookieOptions.name = '__Host-sb-auth-token'` is constant across all four construction sites,
   every per-request client in an isolate shares one cache entry. **P-130's claim**
   (`2026-08-29-supabase-degradation-jwks-HANDOFF.md` §3, "`@supabase/ssr` builds a new client per
   request, so auth-js's in-instance JWKS cache never survives → every request re-fetches the
   JWKS") **is false at HEAD.** `02-drift-timeline.md` already records that the 08-29 incident row
   corrected this; I am confirming it against the library source. The 743 jwks fetches in 24 h are
   isolate churn, not per-request churn.
2. **The multi-gym RPC roulette is fixed.** See T3-05's correction — `mi_membresia` and
   `toggle_favorito_tipo` both filter `c.gym_id = p_gym_id`.
3. **The client proxy's fail-soft is correct and non-obvious.** `esBorradoTotal` uses `every`, not
   `any`, precisely because a successful rotation also emits deletions of surplus chunk cookies
   (`apps/client/src/proxy.ts:9-23`), and a rotation in the same request supersedes a parked
   teardown (`:136`). That is the right shape; T3-02 is a defect in the *classifier*, not in the
   parking machinery.
4. **Cookie writing at `/auth/confirm` is legitimate.** Next's own docs confirm `cookies().set()`
   is supported in Route Handlers
   (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:6, 71-82, 152`),
   so the `createClient()` → `cookieStore.set` path in
   `packages/data/src/server/supabase.ts:37-46` mints the session correctly there. Live
   corroboration: `gre***@gmail.com` `/verify 200` at 2026-09-02T15:04:09Z with no follow-up
   password grant.

Also sound and worth naming: the `next` param at `/auth/confirm` is properly constrained to a
local path — `startsWith("/")` and not `//` and not `/\` (`auth/confirm/route.ts:114-119`) — so
there is no open redirect on the confirm landing.

---

## The owner's questions, answered by number

### Q1 — Where are the drifts? ("not presenting before, now they don't stop")

Three dated movements on *this* surface, in order of how well the date fits "lately":

1. **2026-08-28, `95583ac9` + the live `es_principal` migration** — RED went from one public client
   host to **two**, and outbound link minting moved to the new one. Mail sent before 2026-08-28
   names `red.ibookit.lat`; mail sent after names `www.redfunctionaltraining.com`. Nothing
   redirects between them and their `__Host-` jars are disjoint. Marce's inbox holds both.
   This is the single best-fitting drift in my territory: it created a *class* of member — anyone
   holding pre-cutover mail or a pre-cutover bookmark — that did not exist before 08-28. **T3-03.**
2. **2026-09-01/09-02, the señal rail (`92c2059d` … `ddeddf95`)** — `router.refresh()` now fires on
   every tab foreground and on every same-gym write, where before it fired only after the member's
   own action. Each one is a proxy invocation, i.e. a refresh opportunity, i.e. an entry into the
   `refresh_token_not_found` classifier of **T3-02**. Deployed 09-02; too new to have caused the
   09-01 burst, but it raises the rate from here on. **T3-10.**
3. **2026-08-29, `826ee6b2` / `4ba89bc5`** — the fetch shield bounded reads and pinned `pdx1`, and
   in doing so *documented* that the one call gating every request (`gym_id_por_host`) stays
   unbounded. The shield made the surface much better and left one hole marked on the map.
   **T3-04.**

What I can say with the log window I have: in the last 24 h the failures that actually land on a
member are **25 `invalid_credentials`** (people at a password form who shouldn't be, or who have
forgotten it) and **9 `refresh_token_not_found`** (people our own proxy signed out). Everything
before 2026-09-01T17:00Z is unrecoverable — `auth.audit_log_entries` is **empty, table-wide**
(re-verified this round: `count = 0`), and the log stream is capped at 24 h. **The honest answer to
"where are all the drifts" is that this project cannot answer it**, because the only durable auth
ledger it has is 24 hours deep. That is itself the finding under Q1.

### Q2 — Weak spots that would actually pop

In order: **T3-01** (one GoTrue 500 takes the desk out), **T3-02** (already popping, 9× in 24 h),
**T3-06** (one wrong tap, unrecoverable), **T3-03** (already in a member's inbox).

### Q3 — Stressed to the top (concurrent sessions / refresh storms)

- **Refresh storms are the binding constraint, and they are not rate-limit-bound — they are
  classifier-bound.** The measured burst is 6 failures in 2 s on one session. The failure mode is
  not a 429; it is `refresh_token_not_found` being read as "revoked". Adding members makes it
  linearly more likely; adding *tabs per member* makes it worse than linearly (T3-10).
- **GoTrue `token_refresh` = 150 / 5 min / IP** (`supabase/config.toml`, local-dev value —
  **live value unmeasured**, dashboard path Authentication → Rate Limits). Two IP concentrations
  exist. Real members behind gym NAT: measured **17 sessions from `189.154.5.65` in 85 minutes**
  (2026-08-19 08:47 → 10:11) and **12 from `189.237.183.74` over 11 hours**. Server-side refreshes
  egress from Vercel `pdx1` and are shared **across every tenant**: `auth.sessions` records
  `35.84.200.140`, `44.234.115.147`, `34.222.x` and others in that range. At 150 / 5 min the
  member-NAT side has ~100× headroom today; the *Vercel egress* side is the one that scales with
  total platform traffic rather than with one gym.
- **`resolveTenant` cache: 500 entries, 60 s TTL, keys `${app}|${host}`.** Two apps double the key
  space. 5 public client hosts today ⇒ 100× headroom. Past 500 distinct hosts per isolate per
  minute, every request pays the unbounded POST of T3-04.
- **Realtime concurrent connections** — one private channel per open member tab
  (`client-senal.ts`). The plan's concurrent-connection ceiling is **unmeasured** (experiment:
  read the project's plan limits in the dashboard, or ramp synthetic subscribers until
  `CHANNEL_ERROR`).

### Q4 — Three months idle

Covered in **T3-09**. Server side: nothing decays (155/155 `not_after = null`, one session already
53 days old, refresh tokens unrevoked, cookie `maxAge` 400 days). Browser side: Android/Chrome
returns signed in; iOS returns at a password form (~30-day website-data eviction, **asserted**).
Cold-start side: the first request after idle pays the unbounded `gym_id_por_host` POST (T3-04),
and the `gym` cookie is gone (T3-08, inert on mapped hosts).

### Q5 — Corrupting your own data as a human (tapping, signal loss, force quit, switching account)

- **Switching account on one device is the corrupting one, and it is one tap.** T3-06: VINCULAR
  binds and *overwrites the invited email*, irreversibly. The guard only fires when the signed-in
  account already has a row in that same gym.
- **Losing signal mid-refresh** is handled correctly on the client (the wipe is parked) and
  incorrectly on admin (T3-01). But a *slow* refresh that succeeds server-side while the
  `Set-Cookie` never lands leaves the browser holding a consumed token — the next load past the
  reuse interval is `refresh_token_already_used`, which T3-02 reads as death.
- **Force quit** loses the `gym` cookie only (T3-08); the auth cookie survives (400 d).
- **Two tabs** is the refresh-storm case of Q3 / T3-02.
- **Logout** is `scope:'local'` at all 4 sites — correct — which also means a device you no longer
  hold cannot be signed out at all (T3-09).

### Q7 — Every await takes 30 s, every network call fails halfway (session ops)

| operation | at 30 s | failing halfway |
|---|---|---|
| `resolveTenant` (proxy, first await, **unbounded**) | every route on both apps blanks for 30 s+ | `tenant = null` ⇒ `x-gym`/`x-brand` **deleted**, default brand, and `/auth/confirm`'s email claim silently no-ops (`route.ts:88` `if (tenant)`) → member confirms, gets a session, gets **no membership** |
| proxy `getClaims()` → token rotation | client: page still serves with the arriving cookies (`proxy.ts:179-181`). admin: no catch ⇒ **500** | GoTrue rotated, `Set-Cookie` lost ⇒ next load is `already_used` ⇒ T3-02 sheds the cookie |
| `POST /auth/v1/token` | **not shielded by design** (`fetch-shield.ts:30-36`) — hangs as long as the wire does | see above; this is the documented reason the shield stops at GETs |
| JWKS GET | bounded 2.5 s → pinned key set (`fetch-shield.ts:66-80, 123-137`) | **safe** — a stale pin only bites after a signing-key rotation, and the file carries that rotation obligation in writing |
| PostgREST reads (`gym_membership`, `clientes`) | bounded 8 s + one untimed retry (`fetch-shield.ts:142-148`) | degrades to slow-but-renders |
| `/auth/confirm` claim RPC (POST) | unbounded | `intentarReclamoConFirma` / `…PorEmail` return a refusal as a *value* and the route still redirects to `/reservar` (`route.ts:84-103`) → member lands signed-in with no membership, and `/reservar`'s self-heal is skipped if T3-05's any-gym check says "member" |

The one-line summary: **the two operations with no bound are the two that decide who you are and
which gym you are in.**

---

## Keep-verdicts

| # | What | Verdict | Exit trigger |
|---|---|---|---|
| K1 | `@supabase/ssr` + GoTrue cookie session (over a bespoke session store) | **Keep** | Exit when a single week shows **>20** proxy-shed sessions (`refresh_token_not_found` / `already_used` on `/token`) after T3-02's classifier fix ships — i.e. the fix did not hold. Today's baseline: **9 / 24 h**. |
| K2 | Proxy-based session refresh on every navigation (vs. refresh-on-401 only) | **Keep** | Exit when `/token` calls exceed **500 / 24 h** on the current member base (~40 real RED members). Today: **143 / 24 h**. |
| K3 | `__Host-` cookie prefix, constant-folded at build | **Keep** — it is the reason a preview cannot mint a production session | Exit when RED has **≥3** public client hosts, or when any second gym takes a custom domain: 3 disjoint jars is past what a canonical redirect can paper over. Today: **2**. |
| K4 | Free-tier session lifetime (no `not_after`, no inactivity timeout) | **Keep** — it *is* the owner's ruling (P-128) | Exit on the **first** report of a lost/stolen phone holding a live session, or when any one user exceeds **20** concurrent sessions. Today's max: **14**. |
| K5 | `pdx1` region pin + the GET/HEAD fetch shield | **Keep** | Exit when a single 24 h window shows **≥5** shield timeouts (the `[fetch-shield]` warn line) — which would mean the bound is now the normal case, not the exception. Currently **unmeasured**: the warn goes to `console`, and there is no log drain anywhere in the repo. |
| K6 | Host-wins tenant precedence with a `?gym=` / cookie fallback | **Keep** on mapped hosts | Exit the day any *production* host resolves no tenant — i.e. `gym_id_por_host` returns null for a host serving real members. Count today: **0** (both RED hosts resolve; verified live). |
| K7 | The VINCULAR one-tap short-circuit | **Undecided** — question: is a one-tap bind on a shared device worth the friction it saves, given the claim is irreversible and destroys the invited email? **Owner must answer**, because #126 already accepted the adjacent tradeoff and this is the same ledger. |
| K8 | `red.ibookit.lat` staying live alongside `www.redfunctionaltraining.com` | **Undecided** — question: retire it (308 to the canonical host) or keep it as a fallback? **Owner must answer**; it is a customer-facing URL change and pre-08-28 mail points at it. |

---

## Could not determine (+ the experiment that would settle each)

| Question | Experiment |
|---|---|
| Live `refresh_token_reuse_interval` (T3-02's breaking-point number) | Read Authentication → Sessions in the Supabase dashboard. Repo has only the local-dev **10 s**. |
| Live `token_refresh` and `sign_in_sign_ups` rate limits | Authentication → Rate Limits. Repo has only local-dev 150 / 5 min and 30 / 5 min. |
| The project's **Site URL** and Redirect-URL allow-list | Authentication → URL Configuration. I inferred Site URL = `https://red.ibookit.lat` from GoTrue's `referer` fallback on ~895 server-side calls in 24 h; that is an inference, not a read. |
| Whether any real member currently holds sessions on **both** RED hosts | Not readable from SQL — `auth.sessions` carries no host. Experiment: add the request host to a structured log line at the proxy for 7 days, then group by `(user, host)`. |
| Vercel's function wall for the proxy (the ceiling on T3-04's unbounded await) | Synthetic: point a preview at a `gym_id_por_host` that sleeps, stopwatch `GET /entrar`. |
| How often T3-06 has already fired in production | Join `clientes.email` at claim time against the address the invite was mailed to. Needs Resend history beyond the 24 h log window and a mail → row join I could not make sound this round. |
| Realtime concurrent-connection ceiling for the señal rail | Read the plan limits, or ramp synthetic subscribers until `CHANNEL_ERROR`. |
| Whether `/auth/confirm` can be reached on an unmapped host (T3-08's exploit path) | Requires a write to observe (`gym_membership` insert). Out of this seat's read-only mandate. |
| Why the 09-01 20:42:58 burst egressed from `3.101.19.78` (us-west-1) and `18.145.191.32` (eu-central-1) rather than `pdx1` / us-west-2 | Correlate Vercel function logs for that minute against the proxy invocation; the `pdx1` pin is in both `vercel.json` files, so either those were edge nodes or a non-pinned surface called GoTrue. |

---

## Blind spots (not examined)

- **`apps/mobile/`** — untracked at session start, out of the web-path scope. The Expo app has its
  own session storage and its own cookie/jar story, and none of it is covered here.
- **`supabase/functions/activar-cuenta`** (edge, v3) — it mints a recovery token server-side and is
  a session-establishing surface, but it belongs to another seat's territory.
- **Turnstile** — I did not check whether the live keys are non-default (the launch gate in P-096).
- **RLS correctness** — I traced *which gym* the code resolves; I did not re-audit whether RLS
  would stop a wrong-gym read if the resolver picked wrong. Prior work (P-102) says 8 red-team
  chains died at the read boundary; unverified this round.
- **`registrar_venta` / desk write paths**, the send-email hook body, and the Resend ledger beyond
  what the triage already quoted.
- **`test:denial` and `test:e2e` were not executed** this round — I read the runner and the specs,
  I did not run them.
- **The pre-2026-09-01T17:00Z auth history** is not blind by choice: it does not exist
  (`auth.audit_log_entries` = 0 rows, 24 h log cap).
- **Browser-side state** — cookie jars, ITP behaviour, PWA vs Safari storage: everything I say
  about them is modelled or asserted from ADR-0016, never measured on a device.

---

## Draft audit — sentences cut or retagged, and the rule that caught each

Rule 4 (the incumbent is a candidate) and rule 5 (cite or drop) did most of the cutting.

1. **Cut:** "Supabase handles refresh-token rotation correctly, so concurrency is not a concern."
   — Rule 4: pure substitution language, and rule 5 killed it outright when the log query returned
   9 `refresh_token_not_found` in 24 h.
2. **Cut:** "The 6-in-2-seconds burst at 20:42:58 was caused by the señal rail's `router.refresh()`."
   — Rule 5 + rule 7: the señal apps were pushed 2026-09-02 (`02-drift-timeline.md`), the burst is
   2026-09-01. The causal sentence was replaced with an explicit note in T3-10 that señal *raises
   the rate from 09-02 onward* and did not cause the measured burst.
3. **Retagged:** "auth-js re-fetches the JWKS on every request (P-130)" — inherited from the prior
   register and drafted as a finding. Rule 4 + rule 5: reading `GoTrueClient.js:43` showed a
   module-level `GLOBAL_JWKS` with a 10-minute TTL. Demoted from a finding to an **explicit
   correction** in T3-12, with the line cite.
4. **Retagged:** the multi-gym roulette (P-103). Drafted as a live finding; re-deriving at HEAD
   showed both RPC bodies now take and filter `p_gym_id`. Rule 7 (honesty outranks severity):
   moved to a correction inside T3-05 and to T3-12, with "do not re-file it".
5. **Retagged:** "the two-jar split is why members are being bounced." Rule 5 — I cannot read a
   browser cookie jar. Demoted to **modelled**, with the measurable parts (two hosts, both 200, no
   redirect, two different link hosts in one inbox) kept as measured and the inference stated as
   inference.
6. **Retagged:** "the Supabase Site URL is `https://red.ibookit.lat`." Rule 5 — I have ~895
   server-side GoTrue calls whose `referer` fallback is that string, which is strong but is not
   the dashboard value. Stated as an inference with the confirming experiment named.
7. **Cut:** "HSTS `max-age=86400` is a security hole." Rule 5 — I have the header but no trace of a
   member actually hitting a plaintext first request. Rewritten as a severity-2 finding with the
   member-visible link explicitly tagged *reasoning, not sourced*.
8. **Cut:** a paragraph asserting the `token_refresh` rate limit "will be the first thing to break
   under a 6 am class." Rule 2 + rule 5 — the local-dev limit is 150 / 5 min and the largest
   measured real-IP concentration is 17 sessions in 85 minutes, ~100× under it. Replaced in Q3
   with the number and the honest statement that the classifier, not the rate limit, is what binds.
9. **Cut:** "the admin proxy's missing try/catch has caused outages." Rule 5 — there is no 500 on
   `/token` in the 24 h window and no durable audit table. Kept as a code-level certainty with the
   *frequency* explicitly tagged unmeasured.
10. **Cut:** "a `/reservar` ↔ `/saldo` redirect loop bounces Lista-gym members." Rule 5 — I read
    both pages (`reservar/page.tsx:86`, `saldo/page.tsx:31-45`) and `/saldo` does not redirect
    back. There is no loop; the sentence was invented and is deleted rather than softened.
