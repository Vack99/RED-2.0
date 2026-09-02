# T2 — The doors: `/activar`, `/registro`, `/entrar`, recovery, `/auth/confirm`

Cross-examination seat T2, 2026-09-02. HEAD = `33c9087a`. Live project `hjppxawglmukfvsgmcog`,
SELECT-only. Emails masked `xxx***@domain` except `marcerubiogarcia07@gmail.com`, already
documented.

Every claim below carries a `file:line` at HEAD, a query + its output, or a tag. Prior findings are
attributed to their register id and re-derived at HEAD, or marked `unverified this round`.

---

## 0. The one-paragraph answer

RED's new-member surface has **four** auth-mail doors, not the three its own throttle module names.
The fourth — `/activar`'s `cuenta_existente` magic-link rail — is unthrottled, and on an
**unconfirmed** account it shares GoTrue's single token slot *and* its subject line with
`/registro`, so the two doors delete each other's links and produce inbox stacks of identical
"Confirma tu cuenta" mail. That is the Marce failure, and it is not rare by accident: since the
2026-08-30 shield wave removed the invite link's `&correo=` pre-fill, RED's completed activations
went from **17 `/activar` vs 17 `/registro`** to **1 vs 8**. Nearly every new RED member now walks
the one rail where all of these failures live.

---

## 1. State machine (what a cliente + auth user can actually be)

Five independent axes, read from the code at HEAD:

| axis | values | who writes it |
|---|---|---|
| `auth.users` for the address | absent · unconfirmed+password · confirmed+password · **confirmed+NO password** | `/registro` signUp (`registro.ts:153`), edge fn `admin.createUser({email_confirm:true})` (`activar-cuenta/index.ts:92`) |
| `clientes.auth_user_id` | null · this uid · **another uid** | `reclamar_o_crear_cliente:60`, `reclamar_por_codigo:61` |
| `clientes.claim_code` | live · null | minted `preparar_invitacion:38`, cleared **only** by `reclamar_por_codigo:67` |
| `clientes` consents | null · stamped | both claim RPCs |
| `gym_membership(user,gym)` | absent · member | both claim RPCs, `on conflict do nothing` |

The **confirmed+NO password** state is the load-bearing one nobody named: it is what the edge
function creates before the member has set anything, and it is a one-way door (§T2-06).

The claim-code axis is **not** kept in sync with the auth_user_id axis: the email-match rail writes
`auth_user_id` and leaves `claim_code` alive (`reclamar_o_crear_cliente.sql:59-65` and `:81-85` —
neither UPDATE nor INSERT mentions `claim_code`). Ten live rows are in that state (§T2-04).

---

## 2. Interleavings a human can produce — verdict table

Every row was traced through the code at HEAD. "dead-ends on a string" = the member is shown an
error and cannot proceed from that screen. "silent wrong state" = the member proceeds, and the data
is wrong.

| # | Sequence | Outcome | Where |
|---|---|---|---|
| 1 | `/registro` → invite link inside 60 s (**Marce**) | **dead-end**: `429 over_email_send_rate_limit` → `"NO SALIÓ EL CORREO / No pudimos enviarte el enlace ahora mismo. Intenta de nuevo."` | `activar/actions.ts:94` → `activar-form.tsx:148-150` |
| 2 | …then press "INTENTAR DE NUEVO" | **dead-end again**, guaranteed, for up to the remaining window | `activar-form.tsx:154-160` reloads and re-POSTs into the same GoTrue throttle |
| 3 | `/registro` → invite link **after** 60 s (unconfirmed acct) | **works**, but the new mail rotates the `/registro` link away and arrives with the **same subject** | §T2-02 |
| 4 | `/activar` twice, fresh-provision | 1st: session + `/activar/contrasena`. 2nd on the same device: `VincularForm` one-click (`activar/page.tsx:84-88`). 2nd on a different device: **`cuenta_existente`**, magic-link rail forever | `activar/page.tsx:71-79`, `index.ts:97` |
| 5 | `/activar`, then close the tab at `/activar/contrasena` | **silent wrong state**: confirmed auth user with **no password**; `/entrar` can never work for them; `/registro` tells them "Entra con tu contraseña" for a password that does not exist | `registro-form.tsx:197-213` |
| 6 | Two devices, both on `/activar`, one already signed in | Signed-in device short-circuits to `VincularForm`; **`#150` guard shows whose session it is** (`activar/page.tsx:76-78`, `sesionEmail`) — this one is handled | ok |
| 7 | Back button after signUp, resubmit `/registro` | **handled since the shield wave**: `enEsperaReenvio` answers `yaEnviado` from memory without a new signUp (`registro.ts:149`) — *but only if the same warm Vercel instance serves it* (`reenvio-limite.ts:23-29`) | partial |
| 8 | Link opened in Gmail webview, then again in Safari | 2nd open → `otp_expired` → `rechazar(…, "token-rechazado")` → `/entrar?error=token-rechazado`. **Measured: 4 of 10 `/verify` calls in the live 24 h window are exactly this** | `route.ts:146`; §T2-07 |
| 9 | Stale link then fresh link | fresh works; the stale ones are indistinguishable in the inbox — identical sender, identical subject | §T2-02 |
| 10 | Desk typed a different email than the member registers with | **silent wrong state**: `reclamar_o_crear_cliente` finds `v_n = 0` and **INSERTs a second cliente row** with `clases_restantes = 0`; the paid row keeps its live code. Member sees zero classes | `reclamar_o_crear_cliente.sql:50-52, 74-86` |
| 10b | …and then the member types the **desk's** address at `/activar` | **second auth account** for the same human; `reclamar_por_codigo`'s `v_owns` counts per-uid, so the paid row is claimed by identity #2 | `reclamar_por_codigo.sql:54-58` |
| 11 | Member claimed by email-match, later clicks their invite mail | `invitacion_info` still resolves (no `auth_user_id` filter) → invite banner renders → edge fn `ya_reclamado` → `"Tu cuenta ya está activa … Inicia sesión con tu correo y contraseña"`. **10 live rows** | `invitacion_info.sql:1-4`, `nucleo.ts:118`, `activar-form.tsx:109-127` |
| 12 | Any `/activar` or `/registro` server error, then resubmit without reloading | **dead-end loop**: the spent Turnstile token is re-sent → `"No pudimos verificar que no eres un robot."` on every subsequent attempt | §T2-05 |
| 13 | Cold deep-link to `/restablecer` | form renders (no session gate), submit answers GoTrue's **English** `AuthSessionMissingError` string | `restablecer/actions.ts:48` |
| 14 | Recovery link with an attacker-appended `&codigo=` | **refused correctly** — the firma is verified in-DB (`reclamar_por_codigo.sql:26-29`); H2 of the 2026-07-22 audit holds at HEAD | ok |

---

## 3. Ranked findings

### T2-01 — `/activar`'s magic-link rail is the fourth auth-mail door, and it is the only one not on the shared throttle · severity 5 · measured · lens: partial

`reenvio-limite.ts:5-8` states the counter is shared by "**ALL THREE** doors that can put a
confirmation mail in flight — `/entrar`'s rescue resend, `/registro`'s 'ya enviado' resend, and
`registrarSocio`'s own signUp." There is a fourth: `activar/actions.ts:87` calls `enviarMagicLink`
with no gate at all.

```
$ grep -rn "permitirReenvio|enEsperaReenvio" apps/client/src/app/activar/
(no matches)
```

Callers of `permitirReenvio`: `entrar/actions.ts:84`, `registro/actions.ts:97`. Callers of
`enEsperaReenvio`/`registrarReenvio`: `registro.ts:149,177`. `activar/actions.ts` appears on none of
them.

So `/activar` spends the shared 50/hr project auth-mail bucket without counting, and — the part that
bit Marce — it walks straight into GoTrue's own per-address floor. `activar/actions.ts:94` maps
**every** `enviarMagicLink` failure to one state:

```ts
return enviado.ok ? { status: "cuentaExistente" } : { status: "cuentaExistenteFallo" };
```

which `activar-form.tsx:145-152` renders as **"NO SALIÓ EL CORREO / No pudimos enviarte el enlace
ahora mismo. Intenta de nuevo."** A throttle is a *wait 30 seconds*, not a *the mail did not go out*.
(Prior claim P-078, marce-triage §9 #1 — re-derived at HEAD, unchanged.)

**Breaking point (measured):** GoTrue answered `"429: … you can only request this after 28 seconds"`
and `"… after 18 seconds"`. Live 24 h auth log, `/otp`: 3× 200, **2× 429**, both Marce, 10 s apart.
The retry button (`activar-form.tsx:154-160`) does `window.location.reload()` and the member
resubmits inside the same window — **the remedy the screen offers is guaranteed to fail for up to
the remaining seconds, and the screen names no number.**

**Fix hint:** route `enviarMagicLink` through `permitirReenvio`, and give
`over_email_send_rate_limit` its own state with a countdown instead of collapsing into
`cuentaExistenteFallo`.

---

### T2-02 — On an unconfirmed account the two doors share one token slot AND one subject line; the OTP-code guard silently inverts · severity 5 · measured (with one modelled premise) · lens: drift

Marce's mails #10, #11 and #13 were produced by `/otp` calls (marce-triage §2 rows 5–7) — the
magic-link rail — yet the Resend ledger records their subject as **"Confirma tu cuenta"**
(marce-triage §3). In `correo.ts`, that subject is returned by `copia()` for **one** value only:

- `correo.ts:113-127` — `if (emailActionType === "signup")` → `subject: "Confirma tu cuenta"`
- `correo.ts:137-143` — everything else (including `magiclink`) → `subject: "Continúa en tu cuenta"`

Therefore GoTrue labelled the magic-link mail for an unconfirmed account `email_action_type =
"signup"`. Two consequences follow mechanically:

**(a) The doors delete each other's links.** GoTrue keeps one `auth.one_time_tokens` row per
`(user_id, token_type)` — the repo already knows this (`registro.ts:73-80`). Because the magic link
is minted under the *signup* type, each `/activar` press kills the `/registro` link the member is
holding, and each `/registro` resubmit kills the `/activar` link. Six mails, one sender, one
subject, one live token. `auth.one_time_tokens` for her user: **0 rows** (marce-triage §1) — every
earlier token was rotated away.

**(b) The AR-11 guard does not hold on the rail it was written for.** `correo.ts:83-96`:

```ts
/* … Rendered ONLY for `signup` mail (fable review #6): the magiclink invite rail carries
   `codigo`+`firma` for the invite-claim, and typing the bare 6-digit code at `/codigo`
   would establish a session that skipped that claim — the AR-11 empty-cliente shape. */
function bloqueCodigo(token: string, emailActionType: string) {
  if (emailActionType !== "signup" || !/^\d{6}$/.test(token)) return null;
```

`copia()` and `bloqueCodigo()` read the **same** `email_action_type` (`correo.ts:158,164`). If that
value is `"signup"` — which the observed subject proves — then the magic-link mail **did** print the
6-digit code the guard exists to withhold. Typing it at `/codigo` runs
`confirmarCodigoDeCorreo` → `redirect("/reservar")` (`codigo/actions.ts:74-76`) carrying **no
`codigo` and no `firma`**, so the invite-token claim never runs and only the email-match self-heal
does — precisely the empty-cliente shape the comment names.

*Premise tag:* that the token in those payloads was a 6-digit run is **modelled** — I read the gate,
not a mail body. Experiment to settle it: `GET https://api.resend.com/emails/{id}` for mails #10/#11/#13
(ids are in the triage's ledger fetch) and grep the `text` field for `\d{6}`.

**Fix hint:** gate `bloqueCodigo` and `copia` on whether `redirect_to` carries `codigo=`, not on
GoTrue's action type — the hook already parses that URL (`correo.ts:64-77`).

---

### T2-03 — Q1, the drift: RED's completed-activation share fell from 50% to 11% at the 2026-08-30 shield-wave commit · severity 5 · measured · lens: drift

Discriminator: only `/registro`'s form writes `full_name` into `auth.users.raw_user_meta_data`
(`registro.ts:158`); the invite rail's `admin.createUser({email_confirm:true})` writes none
(`activar-cuenta/index.ts:92-95`). The marce-triage §1 already uses this signature; I re-ran it as an
aggregate.

```sql
-- RED, claimed members, split at afd7a5d5 (2026-08-30 "shield wave 1")
antes:   via_activar 17 | via_registro 17
después: via_activar  1 | via_registro  8
```

Weekly (`date_trunc('week', auth.users.created_at)`, RED only):

| week | via `/activar` | via `/registro` |
|---|---|---|
| 2026-08-10 | **12** | 6 |
| 2026-08-17 | 2 | 6 |
| 2026-08-24 | 3 | 8 |
| 2026-08-31 | **1** | 5 |

Whole-population cross-check: of RED's 43 claimed members, **25 came through `/registro`** and 18
through `/activar`; 16 invites are still outstanding.

**Why this is the answer to "these issues were not presenting before and now they don't stop":**
T2-01, T2-02, T2-04 and interleaving #10 all live on the `/registro` rail or on the collision
between it and `/activar`. Three weeks ago a third of new members were there; now it is ~89%.

**Mechanism candidate — `reasoning, not sourced`:** `afd7a5d5` (2026-08-30) removed the `&correo=`
pre-fill from the invite URL (`git log -S"correo=" -- packages/data/src/server/invitaciones.ts`;
the cut is documented in the comment at `invitaciones.ts:161-166`). Since then
`construirUrlInvitacion` emits `?codigo=` only (`:140`), so `/activar` always renders typed-input
mode (`activar-form.tsx:232-255`) and every invited member must type the **exact** address the desk
entered or receive `"Ese correo no coincide con el que registró tu gimnasio. Verifícalo con tu
gimnasio."` (`activar/actions.ts:76`) — a dead-end with no self-service remedy, whose natural next
move is `/entrar` → the full-width **"¿PRIMERA VEZ? / CREA TU CUENTA"** button
(`entrar-form.tsx:341-353`) → `/registro`.

I could **not** confirm this mechanism: the live 24 h `function_edge_logs` window holds
6 `activar-cuenta` calls (1× 200, 5× 409) and **zero 422s**. The experiment that settles it is a log
drain with ≥30-day retention counting `activar-cuenta` 422 `email_no_coincide`, or a
`console.warn` on `activar/actions.ts:73` counted for 14 days. The week-by-week collapse begins
2026-08-17, *before* the pre-fill cut, so at least part of the shift is the 08-10 bulk-invite wave
decaying — I am not attributing all of it to one commit.

---

### T2-05 — One spent Turnstile token turns both signup doors into a permanent robot accusation · severity 4 · measured code path · lens: human

`activarAction` (`activar/actions.ts:62-65`) and `registrarAction` (`registro/actions.ts:47-50`)
verify Turnstile first and return `"No pudimos verificar que no eres un robot. Intenta de nuevo."`
on failure. `verificarTurnstile` returns false for anything siteverify does not answer `success:true`
(`turnstile.ts:34`), and a siteverify response token is single-use.

The forms reset the widget in exactly two places — the widget's own failure banner
(`reintentarTurnstile`, `activar-form.tsx:87-94`) and `cuentaExistenteFallo`'s full page reload
(`:156`). They do **not** reset it when the server action returns `status: "error"`: that branch
re-renders in place (`activar-form.tsx:198-221`) with the spent `cf-turnstile-response` still in the
DOM. `registro-form.tsx` has the identical shape (`:155-160` reset wired only to
`turnstileProblema`; `:258` renders the error banner).

So the *second* submit after **any** server-side refusal — `email_no_coincide`, `codigo_invalido`,
`sin_email`, `error_interno`, a zod failure at `/registro` — accuses the member of being a bot, and
so does every attempt after that, until they think to reload the page.

**Breaking point:** attempt #2 onward, 100%, until a manual reload.
*Premise tag:* "siteverify rejects a reused token" is Cloudflare-documented but **not sourced from
this system** — experiment: POST the same `response` token twice to
`https://challenges.cloudflare.com/turnstile/v0/siteverify` with the prod secret and compare.

**Fix hint:** call `turnstile.reset()` in a `useEffect` keyed on `state.status === "error"`.

---

### T2-06 — Q7: one dropped response on the activation POST permanently moves a member onto the mail-dependent rail · severity 4 · measured mechanism, zero live population · lens: partial

Prior claim **P-054 / catalog F-32**, re-derived at HEAD.

`iniciarActivacion` (`activacion.ts:99-125`) does one `fetch`. Inside the edge function
(`activar-cuenta/index.ts`) the sequence is `admin.createUser` (`:92`) → `admin.generateLink`
(`:105`) → and back in the app `confirmarTokenHash("recovery", …)` (`activacion.ts:124`). A cut
anywhere after `:92`:

- the `auth.users` row exists, `email_confirm: true`, **no password**;
- the caller falls into `catch { return { ok:false, error:"error_interno" } }` (`activacion.ts:119-121`);
- `activar/actions.ts:102-103` renders the `default` arm — `"No pudimos activar tu cuenta. Intenta de nuevo."`;
- the retry hits `createUser` → `email_exists` → `esErrorEmailExistente` (`nucleo.ts:133-140`) → `cuenta_existente` (`index.ts:97-99`) → **the magic-link rail, permanently**, i.e. every failure in T2-01 and T2-02.

The same one-way door opens with **no network fault at all**: the member who reaches
`/activar/contrasena` and closes the tab has already been provisioned. `/registro` will then tell
them `"Ya existe una cuenta con este correo y está confirmada … Entra con tu contraseña."`
(`registro-form.tsx:197-213`) for a password that does not exist. The escape (reset) works, so this
is a soft dead-end, not a hard one.

**Honesty (M2):** live count of `email_confirmed_at is not null and (encrypted_password is null or
= '')` is **0**. The mechanism is real and currently unrealised. Corroborating shape in the 24 h
window: **6 `/admin/users` calls vs 1 `/admin/generate_link`** — five `createUser` attempts that
never reached `generateLink`, all consistent with the five `409`s.

---

### T2-07 — 4 of 10 link redemptions in the live 24 h window died `otp_expired`, and the token is still spent on a bare GET · severity 4 · measured · lens: general

Prior claims **P-020 / F-30** and **P-109** (`member-reachability-todo`), re-derived at HEAD:
`auth/confirm/route.ts:142` calls `confirmarTokenHash` inside `export async function GET`, so any
prefetcher, mail-security scanner or webview preview burns the single-use token before the member
taps.

Live measurement, `auth_logs`, 24 h:

| path | 200 | failure |
|---|---|---|
| `/verify` | 6 | **4 × 403 `otp_expired` "One-time token not found"** |
| `/otp` | 3 | 2 × 429 (T2-01) |
| `/signup` | 5 | 6 × 500 `Invalid payload sent to hook` (the e2e harness — marce-triage §5) |

A 40% failure rate on link redemption, in a window with only 10 attempts. Two mechanisms produce it
and I cannot separate them from these logs: prefetch burn (P-020) and rotation-by-the-other-door
(T2-02). The declared mitigation is `/codigo`, but the 6-digit block only renders when GoTrue calls
the mail `signup` (`correo.ts:90`) — which on the invite rail is accidental (T2-02), not designed.

**Fix hint:** the POST interstitial Supabase itself recommends (already named in P-109), plus
`bloqueCodigo` keyed on the redirect rather than the action type.

---

### T2-04 — Ten RED members hold a live invite code on an already-claimed row; their invite link answers "Tu cuenta ya está activa" forever, and the desk cannot clear it · severity 3 · measured · lens: drift

The email-match rail never clears the code. `reclamar_o_crear_cliente.sql` writes `auth_user_id`,
`phone_e164` and the two consent stamps at `:59-65`, and inserts at `:81-85` — **neither statement
touches `claim_code`**. Only `reclamar_por_codigo.sql:67` sets `claim_code = null`.

```sql
select count(*) from public.clientes where claim_code is not null and auth_user_id is not null;
-- 10   (all gym `red`; 9 of 10 have full_name metadata → came in via /registro)
```

`invitacion_info.sql:1-4` has **no `auth_user_id` filter**, so `/activar?codigo=` still renders the
"Invitación de RED para X" banner for all ten (`activar/page.tsx:39,66`). Typing the email reaches
`decidir` → `fila.auth_user_id !== null` → `ya_reclamado` (`nucleo.ts:118`) → **"Tu cuenta ya está
activa … Inicia sesión con tu correo y contraseña; si no la recuerdas, puedes recuperarla."**
(`activar-form.tsx:112-116`).

For the 9 who came via `/registro` that advice is true. For `yol***` — `email_confirmed_at` 36 ms
after `created_at`, no `full_name`, i.e. the `admin.createUser` shape — it may not be: their row was
claimed by the **email** rail (`privacy_accepted_at` set while `claim_code` survived, which only
`reclamar_o_crear_cliente` produces), meaning `completarActivacion`'s code-claim was refused and
swallowed (`activacion.ts:164-167`). *That reconstruction is `modelled` from the column shape, not
from a log.*

The desk has no repair: `preparar_invitacion.sql:26-28` raises `'La cuenta ya está activa'` for any
row with a non-null `auth_user_id`, so REENVIAR INVITACIÓN refuses.

**Fix hint:** null `claim_code` in `reclamar_o_crear_cliente` when the matched row carried one, and
filter `auth_user_id is null` in `invitacion_info`.

---

### T2-08 — Login failures are structurally unattributable: 25 `invalid_credentials` in 24 h with no actor and, for 24 of 25, no member IP · severity 3 · measured · lens: idle

```
auth_logs, /token 400:  invalid_credentials 25 · refresh_token_not_found 9 · email_not_confirmed 1
actor_username on every one of those rows: "" (GoTrue resolves no actor for a failed credential)
remote_addr: 10 of 11 distinct IPs are AWS us-west-2 (Vercel pdx1) — /entrar signs in SERVER-side
             (entrar/actions.ts:29-34), so the member's own IP never reaches GoTrue.
```

Combined with `auth.audit_log_entries` = **0** (marce-triage §1) and a 24-hour log-stream retention,
the question "which RED members are failing to get in, and is it elevated?" is **unanswerable after
one day**. That is why the owner's report is a feeling and why this audit had to reconstruct
2026-09-01 from the Resend ledger.

**Breaking point:** the forensic window is 24 h. Anything the owner reports on a Monday about a
Friday is already gone.

---

### T2-09 — Q6: the one-line change that breaks a guarantee with every test green · severity 3 · measured · lens: regression

**`apps/client/src/app/registro/actions.ts:56`** —
`const confirmUrl = \`${origin}/auth/confirm\`;` → `…/auth/confirm?next=/saldo`.

`finalizarAuth` runs the verified-email claim **only when there is no `next`**:

```ts
} else if (!next) {                                   // auth/confirm/route.ts:85
  const tenant = await resolveTenant(request.headers.get("host"), null);
  if (tenant) { … await intentarReclamoPorEmail(tenant.id, …) }
}
```

Modos Lista/Cupo (#332) landed last week and made `/saldo` the post-login landing for a Lista gym
(`entrar/actions.ts:40-45`, `destinoClases`). Making the *confirmation* landing agree is the obvious
next edit, and it silently disables the claim for every self-registration — the rail 89% of new RED
members are on (T2-03).

**Why every test stays green:** `auth/confirm/route.test.ts` has three tests
(`:69`, `:81`, `:100`), all on the four **failure** exits; nothing exercises `finalizarAuth`'s
success path or asserts which arm claims. `apps/client/src/app/registro/` and
`apps/client/src/app/activar/` contain **no `.test.ts` at all** (directory listing at HEAD).
`test:denial` covers the RPC bodies, which would not change.

**Honesty softener:** `/saldo` and `/reservar` both re-run `intentarReclamoPorEmail`
(`saldo/page.tsx:41`, `reservar/page.tsx:66`), so a `next` pointing at either self-heals. A `next`
pointing at `/perfil`, a marketing page, or a future onboarding route does not.

**Runner-up (attributed, not mine):** P-041 / P-044 — swapping `headers.get("host")` for
`x-forwarded-host` at `route.ts:88` or `registro/actions.ts:39`. Re-derived: both call sites are
still bare `host` at HEAD; the proxy comment at `proxy.ts:55` explicitly forbids the swap
(ADR-0012), and there is no test on the header name.

---

### T2-10 — Cloudflare siteverify is an unbounded single point of failure for all three account-creating doors · severity 3 · measured · lens: stress

`verificarTurnstile` fails closed on any fetch error (`turnstile.ts:36-38`) — correct posture — and
gates **`registrarAction`** (`registro/actions.ts:47`), **`activarAction`** (`activar/actions.ts:62`)
and **`vincularAction`** (`activar/actions.ts:127`). `entrarAction` does not gate on it.

**Breaking point:** siteverify unreachable → **3 of 3** doors that can create or bind an account
refuse, 100%, while existing members keep signing in. The fetch has **no timeout and no
`AbortSignal`** (`turnstile.ts:33`) — contrast `resendTransport`, which bounds its Resend call at
`AbortSignal.timeout(10_000)` precisely because it rides a critical path
(`invitaciones.ts:53-57`). Under the Q7 premise ("every await takes 30 seconds"), a hung siteverify
holds the server action open until the platform timeout and the member sees a spinner, not a
message.

*Unmeasured:* siteverify's real p99 from `pdx1`. Experiment: `curl -w '%{time_total}'` against
siteverify from a Vercel function in `pdx1`, 100 samples.

---

### T2-11 — `/restablecer` has no session gate and answers an English GoTrue string · severity 2 · measured · lens: human

`restablecer/page.tsx` (24 lines) renders the form unconditionally. Every sibling door gates on
`getClaims`: `entrar/page.tsx:35`, `registro/page.tsx:33`, `codigo/page.tsx:22`. A member who
deep-links or reloads after their recovery session lapsed gets the form, sets a password, and
receives GoTrue's raw `AuthSessionMissingError` message verbatim on a Spanish screen
(`restablecer/actions.ts:48` returns `result.error` untranslated). Same shape at
`activar/contrasena/actions.ts:61`.

Also `activar/contrasena/actions.ts:46-48`: a member holding a valid live session but no `codigo`
in the form is refused with **"Esta invitación ya no es válida. Contacta a tu gimnasio."** — and the
password they came to set is never written, even though nothing about setting it depends on the code.

---

### T2-12 — `getEsMiembro` still has no gym filter; live population that triggers it is **zero** · severity 2 latent · measured · lens: general

Prior claims **P-003 / P-007 / P-053**, re-derived at HEAD:

```ts
// packages/data/src/server/agenda-miembro.ts:139-143
const { data } = await supabase.from("gym_membership").select("gym_id").limit(1).maybeSingle();
```

No `.eq("gym_id", …)`. A member of gym A on gym B's host reads `true`, so `/reservar`'s and
`/saldo`'s claim self-heal is skipped (`reservar/page.tsx:57-69`, `saldo/page.tsx:36-44`) and they
render B's chrome with no membership in B.

**Live check, this round:**

```sql
users with membership in >1 gym: 1   (dem***@… — forge-demo operator + red-demo owner, both sandboxes)
emails holding clientes rows in 2 gyms: 4   (none claimed in both)
```

So the defect is **latent, not live**. Breaking point: **one** real member joining a second gym, or
one RED staffer acquiring a member row elsewhere.

---

## 4. What is sound — with evidence (M2)

Ranked anyway, but stated honestly: three prior findings on this surface **no longer hold at HEAD**,
and I am not re-billing them.

1. **`mi_membresia` multi-gym roulette is FIXED.** Memory `multigym-rpc-roulette.md` / P-103 claims
   `select … from clientes where auth_user_id = v_uid limit 1` with no gym filter. At HEAD the
   canonical body takes `p_gym_id` and filters on it:
   `mi_membresia.sql:17-21` — `where c.auth_user_id = v_uid and c.gym_id = p_gym_id`. Live drift
   check (01-live-snapshot §C) shows the live body is logic-identical to the canonical file.
2. **Open enrollment (D2, P-090 / P-091 / ADR-0009 I1) is bound.** `reclamar_o_crear_cliente.sql:20-28`
   reads `vault.decrypted_secrets` and refuses unless
   `p_firma = hmac(uid || ':' || p_gym_id)`. A direct PostgREST caller naming an arbitrary gym
   cannot forge it. Live overload count for the function: **1** (01-live-snapshot §C).
3. **The recovery-link `&codigo=` graft (audit §3 H2, P-096) is closed.** `route.ts:113` forwards the
   URL firma **unverified** and `reclamar_por_codigo.sql:26-29` verifies it in-DB against
   `activar:v1:${codigo}`. A grafted codigo carries no matching firma and writes nothing.
4. **Both claim RPCs are genuinely idempotent.** `reclamar_o_crear_cliente.sql:44-48` returns
   `reclamado:false` for a row the caller already owns and re-upserts membership
   `on conflict do nothing`; `reclamar_por_codigo.sql:49-51` refuses a spent code. Live integrity:
   **0** orphan `auth_user_id`, **0** duplicate `(gym_id, lower(email))` (structurally blocked by
   `clientes_email_gym_uq`), **0** claimed rows without a `gym_membership`.
5. **`#150`'s "whose session is this" guard on the vincular short-circuit is real.**
   `activar/page.tsx:76-78` reads `claims.email` and `VincularForm` shows it — a stale session for a
   different account no longer binds silently.
6. **The `/registro` three-outcome split shipped 2026-08-30 works.** `registro.ts:175` distinguishes
   `identities.length === 0` (already confirmed, no mail) from a re-send, and
   `registro-form.tsx:219-236` names *which* mail to open. That is the fix for FC-02, and it is why
   Andrea and Omar were in within 90 s on the same door that failed Marce (marce-triage §6).

---

## 5. Answers by Q-number (the ones T2 owns)

**Q2 — where are the weak spots that would actually pop?**
In descending order of how likely a real RED member trips them this month:
(1) the unthrottled `/activar` magic-link rail + its guaranteed-to-fail retry button (T2-01) —
already popped once, on a member who had just paid $1200;
(2) the shared token slot + identical subject on unconfirmed accounts (T2-02) — a 40% link-death
rate is already measurable (T2-07);
(3) the spent-Turnstile lockout after any first error (T2-05) — costs nothing to reach, and the
member has no reason to suspect a reload fixes it;
(4) the ten stale invite codes (T2-04), because the desk's natural reaction to any complaint is to
press REENVIAR, which refuses.

**Q5 — corrupting data as an ordinary human.** The full interleaving table is §2. The two that leave
**silent wrong state** rather than an error:
- **Row 10** — the desk typed a different address than the member registers with:
  `reclamar_o_crear_cliente.sql:50-52` counts `v_n = 0` and the `if v_cli is null` branch at `:74-86`
  **INSERTs a second cliente row** with `clases_restantes, 0`. The member logs in to zero classes;
  the paid row keeps a live claim code; nothing errors and nothing logs.
  *Live population of the corrupted shape: 0.* Two RED rows are in the INSERT-branch shape
  (`edg***`, `jos***` — claimed, no ventas, `clases_restantes 0`, both via `/registro`), but a name
  scan finds no unclaimed twin, so both are genuine pre-payment walk-ins, not corruption. Stated so
  I am not selling a mechanism as an incident.
- **Row 5** — force-quit at `/activar/contrasena`: a confirmed, passwordless account the product
  then advises to "entra con tu contraseña" (T2-06). Live population: **0**.

Losing signal specifically: the `reenvio-limite` counter is per-instance in-memory
(`reenvio-limite.ts:23-29`, the module says so). A retry that lands on a cold Vercel instance is
answered with a fresh signUp, which rotates the link the member is holding — the FC-01 "the retry is
the damage" shape, capped only by GoTrue's 60 s floor. **Unmeasured:** how many warm instances the
client app runs; experiment — log `process.env.VERCEL_DEPLOYMENT_ID` + a per-instance nonce on every
`registrarReenvio` for a week and count distinct nonces per address.

**Q7 — every await takes 30 s, every network call fails halfway.** Door-sequence damage, ranked:
1. `activar-cuenta` POST cut after `createUser` → confirmed passwordless account + permanent rail
   switch (T2-06). **Not recoverable by retry** — the retry is what switches the rail.
2. `enviarMagicLink` cut after GoTrue accepted → the mail leaves, the member is told "NO SALIÓ EL
   CORREO", and every retry for the next window is a 429 (T2-01).
3. Turnstile siteverify hung 30 s → all three account-creating doors hang, then refuse (T2-10).
4. `registrarSocio` cut after `signUp` succeeded but before the action response → the mail left, the
   throttle **was** charged (`registro.ts:177` runs before the return), so a resubmit on the same
   instance answers `yaEnviado` without a second send. **Handled** — on a warm instance.
5. `completarActivacion` cut between `actualizarPassword` (`activacion.ts:161`) and the claim
   (`:166`) → password set, row unclaimed. Retry is clean: the password re-sets, the code-claim
   raises `'Ya tienes cuenta en este gimnasio'` or `'…ya utilizado'` and is swallowed
   (`registro.ts:323-330`), and `/reservar` self-heals. **Handled.**
6. `finalizarAuth`'s claim throwing → wrapped in `catch {}` (`route.ts:98-102`); the member lands on
   `/reservar`, which retries the claim. **Handled**, and the only reason interleaving #10's damage
   is bounded.

---

## 6. Keep-verdicts (each with a digit)

| Keep | Exit trigger |
|---|---|
| The two-rail `/activar` design (fresh-provision vs `cuenta_existente`) — ADR-0009 §Amendment 2026-07-15 is right that a pre-existing account must have inbox proof | Collapse the rails if **3 or more** members reach `cuentaExistenteFallo` in any 30-day window, or if `/activar`'s completion share stays **below 25%** for **2** consecutive weeks (it is at 11% now, so this is one week from tripping) |
| `reenvio-limite` as best-effort in-memory state | Move to shared state (Upstash/Postgres) the first time **3** `over_email_send_rate_limit` events land in one 24 h window. Current 24 h count: **2** |
| `/auth/confirm` redeeming the token on GET | Ship the POST interstitial once `otp_expired` exceeds **3** in a 24 h window. Current: **4 — already tripped** |
| `/registro` staying open alongside `/activar` | Add the cross-link (a typed email matching an unclaimed coded row routes to `/activar`) once **1** more member reproduces the Marce interleave, or immediately if `/activar` share drops below 15% for 2 weeks (it is at 11%) |
| Turnstile on all three account doors, fail-closed | Add a bounded timeout + a distinct "verification unavailable" message after **1** hour of siteverify unavailability, or **5** members reporting the robot message |
| `getEsMiembro` without a gym filter | Fix on the **1st** real (non-sandbox) member holding membership in two gyms. Current real count: **0** |
| Server-side `signInWithPassword` at `/entrar` (which is what erases the member IP) | Undecided — **question:** is member-IP forensics worth moving login to the browser SDK, given it would also move the session cookie write? **Who answers:** the owner, with the security seat, not T2 |
| The 24 h auth-log retention as the only forensic trail | Ship a durable auth-event table or a log drain before the **next** incident that predates the window. Two have already done so (2026-08-30 Sarahí, 2026-09-01 Marce) — **already tripped, twice** |

---

## 7. Could not determine

| Question | Experiment |
|---|---|
| Are invited members actually failing the typed-email step (`email_no_coincide`), i.e. is the `&correo=` cut the cause of the door-mix inversion? | A log drain with ≥30-day retention counting `activar-cuenta` 422s, or a `console.warn` on `activar/actions.ts:73` read after 14 days |
| Did the magic-link mails actually print the 6-digit fallback code (T2-02b)? | `GET https://api.resend.com/emails/{id}` for mails #10/#11/#13 and grep the `text` field for `\d{6}` |
| What is GoTrue's real per-address email window on this project? The two 429s said 28 s and 18 s, and `config.toml` is local-dev only | Dashboard → Authentication → Rate Limits (no SQL/MCP path exists) |
| Does Cloudflare siteverify reject a reused token under this account's config? | POST the same `response` token twice with the prod secret and diff the two bodies |
| How many warm Vercel instances does the client app hold, i.e. what is `reenvio-limite`'s real multiplier? | Log a per-instance nonce on every `registrarReenvio` for 7 days; count distinct nonces per address |
| Which of the 4 `otp_expired` /verify calls were prefetch burns vs door-rotation? | Turn on Resend click tracking (marce-triage §9 #8) and compare click timestamps to `/verify` timestamps |
| Whether `yol***`'s claim really came from the `/reservar` self-heal after a swallowed code-claim | A durable auth/claim event table; the column shape is consistent but the log window is gone |

---

## 8. Blind spots — not examined this round

- **The admin desk.** The email a desk operator types is the input to interleaving #10 and to every
  `email_no_coincide`, and I never opened `vender/_components/vender.tsx`, the ficha edit form, or
  `crearVentaSchema`'s email validation. If the desk accepts an address the member would never type,
  that is upstream of half my findings.
- **`resolve-tenant.ts` / `inquilino.ts` bodies.** I treated `resolveTenant` and the `x-gym` stamp as
  given; the `gym` cookie fallback at `proxy.ts:101` is a path I did not trace.
- **`activar-cuenta` v3 live source vs the repo.** Not diffed (01-live-snapshot §A did not diff it
  either). Every claim about the edge function reads the repo file.
- **No test suite was executed** — `pnpm test`, `test:denial`, `test:e2e` all unrun. Coverage claims
  in T2-09 come from directory listings and test titles, not from a run.
- **The admin app's own auth door** (`apps/admin/src/app/(auth)`, `apps/admin/src/lib/auth.ts`) —
  out of T2's stated territory, and it has no `e2e/session.spec.ts` twin (P-053).
- **`apps/mobile/`** — untracked, out of scope.
- **No latency or query-plan measurement.** Every "30 seconds" in §Q7 is the premise handed to me,
  not a number I produced.
- **The 5 `otp_expired`/`invalid_credentials` clusters at 08:44–08:55 on 09-02** overlap the e2e
  harness window; I did not separate test traffic from member traffic in the `/token` 400 count, so
  the 25 is an upper bound on real member failures.

---

## 9. Draft audit — what I cut or retagged, and the rule that caught it

| Cut / retagged sentence | Rule |
|---|---|
| "The `&correo=` removal on 2026-08-30 caused the collapse in `/activar` completions." | Rule 5 — the correlation is measured; the causal mechanism has **zero** supporting 422s in the only observable window. Retagged to `reasoning, not sourced` with the settling experiment, and the pre-08-17 part of the trend explicitly conceded to the bulk-invite decay. |
| "Desk email mismatch is producing duplicate cliente rows in RED." | Rule 7 / M2 — a name scan against the two INSERT-branch rows (`edg***`, `jos***`) found no unclaimed twin. Downgraded to "mechanism real, live population 0", and the two rows relabelled as genuine walk-ins. |
| "Members are locked out by passwordless orphan accounts." | Rule 5 + M2 — live count of `email_confirmed_at set / password null` is **0**. Kept as T2-06 with the population stated in the finding body, not hidden in a footnote. |
| "The magic-link mail prints the 6-digit code." | Rule 5 — the gate and the subject prove `email_action_type === "signup"`; the *token shape* premise is separate and got its own `modelled` tag plus a one-call experiment. |
| "Supabase's rate limit is 50/hr, so this is bounded." | Rule 4 — that is an incumbent-substitution claim (it is true of any Supabase project). Replaced with the numbers only this system produced: 2 × 429 in 24 h, 8 `/otp` calls, 4 of 10 `/verify` deaths. |
| "`reclamar_o_crear_cliente` lets any authed user mint a membership in any gym" (P-090/P-091) | Rule 5 + the reuse rule — re-derived at HEAD and found **closed** by the Vault firma at `reclamar_o_crear_cliente.sql:20-28`. Moved out of the findings and into §4 "what is sound" rather than re-billed. |
| "`mi_membresia` picks a random gym's cliente row" (P-103) | Same — the canonical body now filters `c.gym_id = p_gym_id` (`mi_membresia.sql:17-21`). Moved to §4. |
| "Turnstile makes the doors bot-proof." | Rule 4 — substitutable reassurance. Replaced with the specific thing only this code does: fail-closed with **no timeout** on 3 of 3 account doors and 0 of 1 login doors (T2-10). |
| "There is no durable auth audit trail" (asserted from the triage) | Rule 5 — re-derived independently this round: `actor_username` empty on 25/25 `invalid_credentials` rows, `remote_addr` a Vercel egress on 10 of 11 distinct IPs. Promoted from a repeat to a measured finding (T2-08). |
| A paragraph speculating that the 2026-08-28 custom-domain cutover drove members to `/registro`. | Rule 1 + 5 — the weekly table shows the inversion starting 2026-08-17, before the cutover. Cut entirely rather than hedged. |

No finding in §3 is carried on prior-work authority alone; every one is either newly measured this
round or explicitly attributed **and** re-derived at HEAD.
