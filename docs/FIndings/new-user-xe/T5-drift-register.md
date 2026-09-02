# T5 — DRIFT register (Q1 owner)

Cross-examination of the iBookit new-user surface, 2026-09-02. Territory T5: **drift**. HEAD =
`33c9087a` (the only unpushed commit is a docs commit; `origin/main` = `bdea9ed3`, so **HEAD ≈ live**,
verified below). Live Supabase project `hjppxawglmukfvsgmcog`, read-only.

Emails masked `xxx***@domain` except `marcerubiogarcia07@gmail.com` (already documented).

---

## 0. The measurement that frames everything

The owner's sentence is *"these issues were not presenting before and now they don't stop."* Two
claims live in it — a **rate** claim and a **cause** claim — and this project can only answer one of
them.

**The rate claim is unfalsifiable historically.** `auth.audit_log_entries` = 0 rows (prior register
P-089, re-derived this round: `select count(*) from auth.audit_log_entries` → 0). The log stream is
capped at 24 h. There is no log drain, no application-side auth-event table, no Vercel log retention
in this repo. **Nothing durable records a member hitting an error screen.** So "before" is gone. What
survives is `auth.users` (terminal outcomes only) and the Resend ledger (mails only).

**What I could measure — the 24 h window 2026-09-01T17:30Z → 2026-09-02T17:30Z**
(`mcp__supabase__query_logs`, `source='auth_logs'`, grouped by path + status):

| GoTrue endpoint | 2xx | failures | failure rate | what the member saw |
|---|---|---|---|---|
| `/token` (password login) | 110 | **36** (25 `invalid_credentials`, 9 `refresh_token_not_found`, 1 `email_not_confirmed`, 1 `validation_failed`) | **25%** | "correo o contraseña incorrectos" / silent re-login |
| `/signup` | 5 | **6** (`unexpected_failure` 500) | **55%** | registration failed, no mail |
| `/verify` (mailed-link click) | 6 | **4** (`otp_expired` 403) | **40%** | "El enlace de tu correo ya expiró o ya se usó" |
| `/otp` (magic-link send) | 3 | **2** (`over_email_send_rate_limit` 429) | **40%** | "NO SALIÓ EL CORREO" |
| `/admin/users` (activation provisioning) | 1 | **5** (`email_exists` 422) | **83%** | routed onto the `cuenta_existente` rail |

**48 failure responses across the five member-facing auth endpoints in one day**, at a gym taking
~2–3 new members a day. 7 of the 25 `invalid_credentials` came from `189.237.183.74` — a single
Mexican residential IP that also produced all six `/signup` 500s and matches the owner's own machine
(local `pnpm test:e2e` / dev). Netting those out, **~41 of the 48 are real members.**

So: the owner is right that failures are constant. He is measuring something real. The rest of this
document is about **why**, and the answer is not one commit — it is a **population inversion**
(D-01) walking into a rail that four separate 08-30 changes made louder without making it survivable
(D-02, D-03, D-05, D-07).

**The exposure counter-hypothesis, measured** (`auth.users` by week, test addresses excluded):

| week starting | real auth users created | never confirmed | never signed in |
|---|---|---|---|
| 2026-05-25 → 2026-08-03 (10 weeks) | **7 total** | 0 | 0 |
| 2026-08-10 | 19 | 1 | 1 |
| 2026-08-17 | 8 | 0 | 0 |
| 2026-08-24 | 13 | 1 | 2 |
| 2026-08-31 | 7 | 0 | 0 |

**7 real members in the 10 weeks to 2026-08-09; 47 in the 4 weeks since.** Arrival rate went from
0.7/week to ~12/week — a **17×** step. Terminal failure (never confirmed / never signed in) did
**not** scale with it: 2 unconfirmed and 3 never-signed-in across 47, and **zero of both in the most
recent week**. Basis: measured.

**Verdict on the framing question.** Exposure explains the *count*; it does not explain the *shape*.
The failures now are not the same failures as before — before 2026-08-10 there were essentially no
new members to fail. The honest statement is: **the surface was never load-bearing until 2026-08-10,
and every latent trap in it is now being walked several times a day by strangers. Four 08-30 changes
then converted several of those traps from silent-and-recoverable into loud-and-self-perpetuating.**
That combination — not any single regression — is "they don't stop".

---

## 1. Ranked drifts

Ranked by *share of the measured 24 h failure surface each explains*, worst first.

---

### D-01 — The activation population inverted: 5 of 6 activations now take the *fragile* rail
**Severity 5 · basis: measured · lens: drift**

`/activar` has two rails (memory `activation-rails-two-paths.md`, 2026-07-27): **fresh-provision**
(no auth account → `admin.createUser` → password → claim; *zero extra mail, scanner-proof, no expiry
cliff*) and **`cuenta_existente`** (the address already has an account anywhere on the platform →
`createUser` fails `email_exists` → a passwordless magic link is mailed).

That memory note recorded, verified live on 2026-07-27: *"all 18 real RED members have zero auth
accounts → every one walks fresh-provision."*

**That has inverted.** Live logs, 24 h: `/admin/users` returned **1 × 200 and 5 × 422 `email_exists`**.
Five of six activation attempts in a day now fall to `cuenta_existente`.

Why it inverted is structural, not a commit: `auth.users` is global to the platform, and RED's roster
is now large enough that a large share of desk-invited members *already have an account* — because
they self-signed-up at `/registro` first (Marce's exact path), because they were invited previously,
or because they exist under another gym.

Why it hurts: the `cuenta_existente` rail is the one with **every** weakness stacked on it —
- not gated by the shared mail throttle (D-03);
- mails a **single-use** magic link that dies on re-click (D-04);
- carries **no** 6-digit OTP fallback (D-07);
- and since 2026-08-30 its throttle failure renders a hard "NO SALIÓ EL CORREO" screen whose retry
  button re-spends the throttle (D-02).

**Member-visible symptom:** the newest members — the ones who touched `/registro` first — are routed
onto the rail with no rescue path, while the older ones (who never had an account) sailed through.
That is exactly the pattern "it worked before and now it doesn't".

**Evidence:** live `query_logs` `/admin/users` 1 × 200 / 5 × 422 (2026-09-01T19:25:16Z,
2026-09-02T01:17:30Z, 02:18:03Z, 16:29:41Z, plus Marce's 19:25:27Z);
`supabase/functions/activar-cuenta/nucleo.ts` → `esErrorEmailExistente`;
`apps/client/src/app/activar/actions.ts:74-94`; memory `activation-rails-two-paths.md` (attributed;
its 18/18 figure re-tested against today's log and found reversed).

**Breaking point:** the fraction of invited members who already hold an `auth.users` row. It is
monotonically increasing and irreversible. Today ≈ **83%** (5/6 in 24 h; n small).
**Fix hint:** stop treating `cuenta_existente` as the exception. Give it the same three shields the
fresh rail has — throttle gating, an OTP fallback in the mail, and idempotent link re-click.

---

### D-02 — `afd7a5d5` (08-30) turned a silent throttle into a hard error screen, and its retry button re-spends the throttle
**Severity 5 · basis: measured · lens: drift · prior: P-078 (marce-triage §9 #1), re-derived at HEAD**

Before 2026-08-30 the `cuenta_existente` branch was:

```
      await enviarMagicLink(email, `${origin}/auth/confirm?...`);
      return { status: "cuentaExistente" };            // "Revisa tu correo" — always
```

`git show afd7a5d5 -- apps/client/src/app/activar/actions.ts` changed it to:

```
      const enviado = await enviarMagicLink(...);
      return enviado.ok ? { status: "cuentaExistente" } : { status: "cuentaExistenteFallo" };
```

`git log -S 'cuentaExistenteFallo'` → **one commit: `afd7a5d5`, 2026-08-30**. The state did not exist
before that date.

The intent was honesty (FC-16: a rescue rail failing in total silence). The effect on a **throttled**
send — which is a *wait 60 seconds*, not a failure — is a full-screen dead end
(`apps/client/src/app/activar/_components/activar-form.tsx:145-165`):

> **NO SALIÓ EL CORREO** / "No pudimos enviarte el enlace ahora mismo. Intenta de nuevo."
> [ INTENTAR DE NUEVO ] → `window.location.reload()`

**The retry is the damage, again.** Tapping "Intentar de nuevo" re-renders the form; submitting it
calls `signInWithOtp` again, inside the same 60 s GoTrue per-address window, and returns the same 429
and the same screen. Nothing on the screen says "wait", names a duration, or counts down. There is no
code path that distinguishes `over_email_send_rate_limit` from a real send failure —
`activar/actions.ts:94` collapses every `enviarMagicLink` error into one state.

This is the best single explanation for the *"don't stop"* half of the owner's sentence: one member,
in one sitting, can produce this screen three or four times in a row and reasonably conclude the app
is broken.

**Member-visible symptom:** Marce, 2026-09-01 19:25:17Z and 19:25:27Z — two `/otp` 429s ten seconds
apart, the only two in the whole 24 h window, both hers. She reported "error, can't enter".

**Evidence:** `git show afd7a5d5 -- apps/client/src/app/activar/actions.ts`;
`apps/client/src/app/activar/actions.ts:88-94`; `activar-form.tsx:145-165`; live logs
2026-09-01T19:25:17Z / 19:25:27Z `/otp` 429 `over_email_send_rate_limit`.
**Breaking point:** **2** sends to the same address inside **60 s**. Reached by a member who touches
both doors in under a minute — which is what a confused member does.
**Fix hint:** branch on `error.code === 'over_email_send_rate_limit' || error.status === 429` (that
predicate already exists at `packages/data/src/server/sesion.ts:28-35` and is used only by
`iniciarSesion`) and render a countdown, not a dead end. Disable the retry for the rest of the window.

---

### D-03 — The 08-30 shared mail throttle covers 3 of the 5 mail doors; the 2 it misses are the two a stuck member reaches next
**Severity 5 · basis: measured · lens: drift**

`packages/data/src/server/reenvio-limite.ts` (created 08-30) is explicit that it must be **one**
counter: *"ONE counter, or the second door reopens what the first closes"* (`:3-9`), sized against
the project-wide 50/hr auth-mail bucket — one send per address per 5 minutes, 5 per UTC day.

`grep -rn "permitirReenvio\|enEsperaReenvio"` across `apps/` + `packages/` at HEAD — **all callers**:

- `apps/client/src/app/entrar/actions.ts:84` — `/entrar` rescue resend ✅
- `apps/client/src/app/registro/actions.ts:97` — `/registro` resend ✅
- `packages/data/src/server/registro.ts:149` — `registrarSocio`'s own signUp ✅

**Ungated, at HEAD:**

- `apps/client/src/app/activar/actions.ts:85` — `enviarMagicLink`, the `cuenta_existente` rail
  (**the door D-01 says 83% of activations now take, and the door that produced both 429s**).
- `apps/client/src/app/entrar/actions.ts:57` — `resetAction` → `solicitarReset`, the forgot-password
  mail. Every submit spends the shared 50/hr bucket with no cap at all, and the action
  unconditionally returns `{status:"sent"}`, so a member can hammer it invisibly.

The shield built on 08-30 to stop a wedged member draining the platform's mail budget is absent from
exactly the two doors a wedged member reaches after the first one fails.

**Member-visible symptom:** raw GoTrue 429s reach the app (D-02's screen) instead of a friendly
"espera 5 minutos"; and one member's forgot-password taps can spend mail budget shared by **every
gym on the platform**.

**Evidence:** `packages/data/src/server/reenvio-limite.ts:1-73`; the `grep` output above;
`apps/client/src/app/activar/actions.ts:85`; `apps/client/src/app/entrar/actions.ts:50-62`.
**Breaking point:** 50 auth mails/hour, project-wide, shared across all gyms (prior register P-069,
`asserted`, not re-measured this round — the dashboard rate-limit page is not reachable from here).
An ungated `/restablecer` loop reaches that in **50 taps**.
**Fix hint:** move the `permitirReenvio` call *inside* `enviarMagicLink` and `solicitarReset` in
`packages/data/src/server/sesion.ts`, so the counter cannot be bypassed by adding a new caller (Q6).

---

### D-04 — `/auth/confirm` never checks for an existing session; a second click on the same link is a hard error. Measured 4× in 24 h from one member.
**Severity 5 · basis: measured · lens: human · prior: P-020/F-30, P-057 — re-derived at HEAD with fresh live evidence**

`apps/client/src/app/auth/confirm/route.ts:106-149`. The `GET` handler reads `code` / `token_hash`
and immediately calls `confirmarCodigo` / `confirmarTokenHash`. **There is no `getClaims()` call
anywhere in the file.** A failed verification falls to `rechazar(...)` →
`/entrar?error=token-rechazado`, which renders (`entrar-form.tsx:31-36`):

> *"El enlace de tu correo ya expiró o ya se usó. Pide uno nuevo o escribe tu código."*

**Live, 2026-09-01:** `and***@gmail.com` (real RED member) signed up at 21:56:43Z, confirmed
successfully at 21:58:14Z (`/verify` 200) — and then produced **four consecutive `/verify` 403
`otp_expired`** at 21:58:30, 21:58:45, 21:59:53 and 22:02:49Z, all from Vercel egress
`54.148.1.230`. She then re-submitted `/registro` at 22:04:02Z (a `/signup` 200 that minted no user
and mailed nothing — GoTrue's anti-enumeration answer for an already-confirmed address) and finally
logged in with a password at 22:04:30Z. Her `auth.users` row carries 2 sessions.

That is a member who **had already succeeded**, was told four times her link was dead, went back to
the signup form, and had to fall back to a password. The classic generator is the mail app's in-app
webview: the first click establishes the session inside the webview's cookie jar; she then opens her
real browser, taps the link again, and gets the error — `/entrar`'s live-session bounce
(`entrar/page.tsx:35-40`) cannot save her because *that* browser has no session.

**4 of 10 `/verify` calls in the window were this.** It is the second-largest single failure class
after password login.

**Evidence:** `apps/client/src/app/auth/confirm/route.ts:106-149` (no session read);
`apps/client/src/app/entrar/_components/entrar-form.tsx:31-36`; live `query_logs` for the
2026-09-01 21:57:47Z → 22:04:30Z sequence; `auth.users` row for `and***@gmail.com` (created
21:56:43Z, confirmed 21:58:14Z, last_sign_in 22:04:30Z, 2 sessions).
**Breaking point:** the **2nd** click on any mailed link.
**Fix hint:** before the `code`/`tokenHash` branches —
`const {data} = await supabase.auth.getClaims(); if (data?.claims?.sub) return finalizarAuth(...)`.
A member holding a valid session who re-opens a spent link should land in the app, not on a login
form.

---

### D-05 — send-email v8's fail-closed path turns a dashboard-only config gap into a hard signup 500. 6 of 11 signups in 24 h.
**Severity 4 · basis: measured · lens: drift**

`supabase/functions/send-email/correo.ts:66-71`:

```
  if (u.pathname !== "/auth/confirm") {
    throw new Error(`redirect_to con ruta inesperada (${u.pathname}) … probablemente un Site URL sin ruta`);
```

→ `index.ts:105-110` catches it and returns HTTP **400** → GoTrue maps a non-2xx hook response to
`unexpected_failure` **500** on `/signup`. The member's registration fails outright and **no mail is
ever queued.**

The trigger is not in this repo. GoTrue silently **clamps** `emailRedirectTo` to the project **Site
URL** whenever the requested redirect is not on the Auth Redirect-URL allow-list. The Site URL has no
`/auth/confirm` path, so the clamp *guarantees* the throw. The hook's own header comment names this
dependency (`index.ts:11-14`), and prior register P-029/F-49 records that the Site URL was at one
point a **retired host**.

Before `afd7a5d5` the same input degraded (the mail went out on the platform host). Since 08-30 it is
a hard failure — and the failure surface is invisible to every gate in the repo: no migration, no
vitest, no `test:denial` suite, no dependency-cruiser rule, no guard can read a dashboard allow-list.

**Live:** 6 `/signup` 500s in 24 h vs 5 200s. All six from `189.237.183.74`, which is also the source
of 7 `invalid_credentials` — consistent with the owner's own `pnpm test:e2e` (prior triage P-083
states `signup.spec.ts` fails permanently for exactly this reason). **No `auth.users` row exists at
any of the six timestamps**, confirming the signup was fully rejected.

I am **not** claiming those six were RED members — the IP evidence says otherwise. I *am* claiming the
path is live-reachable today, has a 100% failure rate when reached, and its trigger is one
`gym_domain` row without a dashboard edit away for the next gym (see Q6).

**Evidence:** `supabase/functions/send-email/correo.ts:54-71`;
`supabase/functions/send-email/index.ts:97-110`; live `query_logs` `/signup` 5 × 200 / 6 × 500;
`select … from auth.users where created_at >= '2026-09-01'` → no row at 21:40, 00:24, 00:25, 04:17,
08:24, 08:53. Prior: P-083 (attributed).
**Breaking point:** **1** host in `gym_domain` that is not in the Auth Redirect-URL allow-list →
100% signup failure for that gym.
**Fix hint:** degrade instead of throwing when the path is wrong *and* the host resolves to a known
gym; log loudly. Or add a probe asserting every `gym_domain(app='client')` hostname round-trips
through a signup.

---

### D-06 — The 08-28 cutover gave RED two live client hosts with disjoint `__Host-` cookie jars and no canonical redirect
**Severity 4 · basis: measured · lens: drift · prior: P-030/F-50 — re-derived live this round**

`gym_domain` for `red`: `red-admin.ibookit.lat` (admin), `red.ibookit.lat` (client),
`red.localhost` (client), **`www.redfunctionaltraining.com` (client, `es_principal = TRUE`)** — the
only `es_principal=true` row in the whole table.

`packages/data/src/server/invitaciones.ts:118-135` orders by `es_principal desc`, so **every desk
invite link is minted on `www.redfunctionaltraining.com`.** Meanwhile
`apps/client/src/app/activar/actions.ts:84` and `entrar/actions.ts:54` build their outbound links
from `h.get("host")` — the host the member happens to be on.

`packages/data/src/cookie-options.ts:36` sets `{ name: '__Host-sb-auth-token', secure: true }`.
`__Host-` forbids a `Domain` attribute by RFC, and the file's own comment (added 2026-08-28)
acknowledges the consequence and forbids the obvious fix.

**Measured live this round** — `curl -sL -w '%{http_code} %{num_redirects}'` on both hosts:

```
https://www.redfunctionaltraining.com/activar → 200, redirects: 0
https://red.ibookit.lat/activar               → 200, redirects: 0
```

Identical byte length (31 049), identical Turnstile sitekey `0x4AAAAAADw0zgE_N--iabPb`. **Neither
host redirects to the other.** Two fully functional front doors, two separate cookie jars, no
canonicalisation.

**Member-visible symptom:** a member signed in on `red.ibookit.lat` (the host RED used from July, and
whatever is saved to her home screen) taps the new desk invite on `www.redfunctionaltraining.com` and
is logged out there — so `/activar` cannot take the one-click `vincularAction` short-circuit and
routes her onto the mail rails instead (D-01 → D-02). And symmetrically in the other direction.

**Not measured:** how many members actually hold sessions on both hosts. Vercel access logs are not
reachable from this session, and `auth.sessions` is not host-attributed. Tag: *unmeasured — the
experiment is a Vercel log query on the `Host` header vs `set-cookie` over the last 7 days.*

**Evidence:** `execute_sql` on `gym_domain`; `packages/data/src/server/invitaciones.ts:118-135`;
`packages/data/src/cookie-options.ts:36,44-51`; the live `curl` above. Prior: P-030 (attributed).
**Breaking point:** **2** client hosts for one gym with no 308. RED is at 2 today.
**Fix hint:** 308 every non-`es_principal` client host to the principal in `proxy.ts` before any auth
work. One redirect collapses the jar problem outright.

---

### D-07 — The 08-30 OTP rescue covers `signup` mail only; the rail 83% of activations now take carries no code
**Severity 4 · basis: measured · lens: drift · prior: P-082 (marce-triage §9 #5), re-derived at HEAD**

`supabase/functions/send-email/correo.ts:90-91`:

```
function bloqueCodigo(token: string, emailActionType: string) {
  if (emailActionType !== "signup" || !/^\d{6}$/.test(token)) return null;
```

The 6-digit fallback — whose entire point is *"a link that dies to query-stripping / webview mangling
/ prefetch burn still leaves the code readable"* — renders **only** for signup mail. The `magiclink`
action type (the `cuenta_existente` rail) falls through to the generic copy (`correo.ts:134-140`),
subject **"Continúa en tu cuenta"**, with no code block.

The `/codigo` landing and the `verifyOtp` rail exist (`packages/data/src/server/sesion.ts:263`,
`type:"email"`), and `/entrar`'s banner tells the member *"o escribe tu código"* — but for a member
on the magic-link rail **there is no code in any of her mail.** The advertised remedy does not exist
for the majority rail.

The gating had a reason (`correo.ts:82-88`: typing a bare code would establish a session that skipped
the invite claim — the AR-11 empty-cliente shape). That reason is real. It is also why this is a
design gap needing a decision, not a patch.

**Sharpening of the prior triage:** the triage recorded six mails to Marce sharing the subject
*"Confirma tu cuenta"*. Given `copia()` at `correo.ts:113-140`, all six must have been **`signup`**
mails (the magiclink subject is *"Continúa en tu cuenta"*). So her six-identical-subjects problem is
the `/registro` re-POST token-rotation loop (FC-01/02), **not** the `/activar` rail — and every one
of those six carried a live-at-the-time 6-digit code that nothing on screen pointed her at.

**Evidence:** `supabase/functions/send-email/correo.ts:80-96,113-140`;
`packages/data/src/server/sesion.ts:251-263`;
`apps/client/src/app/entrar/_components/entrar-form.tsx:31-36`. Prior: P-082, P-087 (attributed;
P-087's implicit attribution of the six subjects to the magic-link rail is corrected here).
**Breaking point:** **1** magic-link mail whose URL is mangled by a webview = zero remaining remedies.
**Fix hint:** mint the code for `magiclink` too, and have `/codigo` require the `codigo` + `firma`
from the pending-activation state before establishing the session — closing AR-11 without deleting
the rescue.

---

### D-08 — The 2026-09-01 migration batch was applied to prod in a **different order** than the repo declares
**Severity 3 · basis: measured · lens: drift · corrects a prior claim**

Repo (`ls supabase/migrations`) vs live (`supabase_migrations.schema_migrations`):

| repo file (declared order) | applied version | applied order |
|---|---|---|
| `20260901120000_senal_gym.sql` | `20260902050714` | **4th** |
| `20260901130000_lista_member_surface.sql` | `20260902010314` | 1st |
| `20260901140000_cambiar_modo_reservas.sql` | `20260902010333` | 2nd |
| `20260901150000_reservar_clase_booking_enabled_for_share.sql` | `20260902010410` | 3rd |

`senal_gym` is **first** in the repo and **last** in prod. A rebuild from `supabase/migrations/` —
which is exactly what `pnpm test:denial` does against a scratch project — replays an ordering
production has never run.

**Correction to `01-live-snapshot.md` §B**, which states *"Files from `20260823222957` onward match
exactly by both name and version — the drift is confined to the pre-2026-08-23 tree."* Measured this
round: of the **19** applied migrations from 2026-08-20 onward, only **3** match by version —
`20260825145937`, `20260825151534`, `20260825151556` — and those three are precisely the ones
**recovered from prod** by `8f78cc1b` after the 08-27 outage. Every migration *authored in the repo*
since 08-23 carries a version prod does not recognise, including all four from 09-01. §B's headline
(148 applied vs 145 files; 122/148 versions unrecognised) is right; the "confined to pre-08-23"
qualifier is wrong.

**Evidence:** `select version, name from supabase_migrations.schema_migrations order by version desc
limit 14`; `ls supabase/migrations/ | grep -E '^2026082|^2026083|^2026090'`; `01-live-snapshot.md` §B
(attributed and corrected).
**Breaking point:** the first migration pair whose *outcome* is order-dependent. Not reached yet (the
09-01 four are independent — a trigger set, a column + policy, and two `CREATE OR REPLACE` bodies),
but nothing enforces that.
**Fix hint:** stop hand-numbering. Name migration files with the timestamp the apply actually
returns — or accept that `supabase/migrations/` is a *change log*, not a *replayable history*, and
say so in AGENTS.md.

---

### D-09 — The RPC drift guard compares the repo to itself; it structurally cannot see prod
**Severity 3 · basis: measured · lens: regression**

`tools/guards/rpc-canon-drift.test.ts:22`: `const functions = readRpcFunctions();` — the same
migration replay `denial-suite.ts` uses. The guard asserts that
`supabase/functions-canonical/<name>.sql` equals *the body derived by replaying
`supabase/migrations/`*. Both sides are the repo. **Nothing in `pnpm test` reads the live database.**
The same holds for `tools/guards/rpc-overload.test.ts`, added *after* the 08-27 outage.

This is the exact blind spot that produced that outage: three prod-only migrations applied from the
mobile lane on 2026-08-25, never committed, and a `CREATE OR REPLACE` at a stale signature that
created a second `registrar_venta` overload (`8f78cc1b`; memory
`registrar-venta-overload-outage.md`). Both guards would have stayed green throughout.

**Honesty (M2):** live currently agrees with the repo, and I measured it rather than assuming — see
SOUND-2, **60 of 60** bodies match. So the guard is telling the truth today by luck (a human
regenerated the canon after recovering the prod migrations), not by construction.

**Evidence:** `tools/guards/rpc-canon-drift.test.ts:19-59`; SOUND-2 below; memory
`registrar-venta-overload-outage.md` (attributed).
**Breaking point:** **1** `CREATE OR REPLACE` applied to prod outside a committed migration.
**Fix hint:** the comparison I ran here is a two-query script (`md5(prosrc)`, normalised the same way
on both sides). Wire it as an opt-in `pnpm check:live-rpc` and run it in the same pre-merge slot as
`test:denial`.

---

### D-10 — The `pdx1` pin does not cover the proxy; my own live request entered `iad1`
**Severity 3 · basis: measured · lens: stress · prior: P-026/F-42 — re-derived live this round**

`apps/client/vercel.json` pins `"regions": ["pdx1"]` (ADR-0017, 2026-08-29).
`apps/client/src/proxy.ts` ends with `export const config = { matcher: [...] }` — it is Next
**middleware**, which runs on Vercel's edge network and is **not** covered by `regions`.

Live probe this round, from Mexico:

```
$ curl -sI https://www.redfunctionaltraining.com/entrar
X-Vercel-Id: iad1::pdx1::w4z26-1788370675236-888a5076cdc5
```

Entry PoP **`iad1`** (Washington DC), function **`pdx1`**. The middleware leg is the one that runs
`getClaims()` + `POST /auth/v1/token` on every navigation — the exact leg the 08-29 degradation
incident was about.

Corroborating volume: **757 `/.well-known/jwks.json` fetches from 512 distinct source IPs in 24 h**
(`query_logs`, grouped by first octet: 54.x = 173, 44.x = 76, 18.x = 72, 35.x = 63, 3.x = 53,
34.x = 43, 52.x = 41, 13.x = 37, plus ~110 from Vercel edge/carrier ranges
100.x/32.x/98.x/16.x/184.x/50.x). The us-east-1 blocks in that list are middleware invocations that
never touched pdx1.

Also unchanged: `packages/data/src/server/fetch-shield.ts` leaves `POST /auth/v1/token` unbounded
**on purpose** (prior register P-002/F-04) — so the unpinnable leg is also the untimed leg.

**Member-visible symptom:** under a degraded far-region leg, a page that "spins forever" — the 08-29
complaint. The pin reduced it; it did not remove it.

**Evidence:** the live `curl -sI` header above; `apps/client/vercel.json:2`;
`apps/client/src/proxy.ts` (`export const config`, tail); the `query_logs` JWKS histogram. Prior:
P-026, P-063 (attributed).
**Breaking point:** any Supabase-side latency spike ≥ the browser's patience, on any request whose
edge PoP is far from `us-west-2`. Today that is ~**100%** of RED's traffic, entering at `iad1`.
**Fix hint:** either cache JWKS across middleware invocations with a longer TTL, or accept the leg
and bound it — the shield already has the machinery.

---

### D-11 — Password login is the largest single failure class, and no commit explains it
**Severity 3 · basis: measured · lens: general**

36 of 146 `/token` calls in 24 h failed — **25%**. Netting the owner's 7:

- **18 real `invalid_credentials`**, in tight bursts from Vercel egress IPs: 5 in 25 s on
  09-01 22:35:13 → 22:35:38; 2 on 09-02 04:36; 8 across 09-02 08:44 → 08:55; 1 at 17:29.
- **9 `refresh_token_not_found`** — six of them in a 2-second cluster at 09-01 20:42:58-59 from two
  IPs, which is the consume-not-deliver shape of P-002/F-04 (the client proxy parks the teardown for
  that code; the admin proxy does not).
- **1 `email_not_confirmed`** (09-02 02:16:39Z) — a member with an unconfirmed account typing a
  password, i.e. still landing in the dead end the 08-30 wave was built to close.

Five failed password attempts in 25 seconds is one human, not a bot, and it is very likely a member
who **has no password** — both the fresh-provision and magic-link rails produce accounts a member may
never have set a password on, and `/entrar` is where every bounce lands them.

I cannot attribute this to a commit. It is the largest bucket and the one with the least evidence
about cause, because the failing user id is not logged on a 400.

**Evidence:** `query_logs` `invalid_credentials` timestamps + IPs (25 rows);
`refresh_token_not_found` × 9; `/token` 110 × 200 / 36 × 400.
**Breaking point:** unmeasured. *The experiment: log a hashed attempted address on
`invalid_credentials` in `iniciarSesion`, or enable Supabase auth-audit retention, then re-read after
7 days.*
**Fix hint:** on `invalid_credentials`, check whether the address has an account with no password
identity and offer the magic link instead of the error.

---

### D-12 — The project cannot measure its own failure rate
**Severity 3 · basis: measured · lens: drift · prior: P-084/P-089, re-derived**

`select count(*) from auth.audit_log_entries` → **0**. The log stream is capped at 24 h. No log drain
exists in the repo. The Resend ledger (194 mails, back to 2026-08-04) is the only durable artifact,
and it records *sends*, not *outcomes*.

Consequence for this whole exercise: **"elevated lately" cannot be tested.** I can tell you what today
looks like, in detail. I cannot tell you what 2026-08-20 looked like, and neither can anyone else.
The owner's perception is the only historical instrument this project has — which is exactly why he
is right to distrust a clean answer.

Second consequence: the 08-21 daily auth-log alert cron (`97fbbe58`,
`apps/admin/src/app/api/cron/alertas/`) watches a 24 h window over the same stream. Prior register
P-064 records that during the Sarahí incident it matched on `invalid_grant` + send-email non-2xx and
**both were 0** while a member was wedged for 34 hours. Today's dominant failure codes —
`otp_expired`, `over_email_send_rate_limit`, `email_exists` — are not `invalid_grant` either.
*Whether the current matcher covers them is unverified this round; I did not open `resumen.ts`.*

**Evidence:** `execute_sql` count = 0; the 24 h `query_logs` cap; prior register P-084, P-089, P-064
(attributed).
**Breaking point:** already reached — **0** days of retained auth history.
**Fix hint:** the cheapest durable instrument is an `auth_evento` table written by the app tier at the
five places that already `console.warn` a structured line (`sesion.ts:145-157,192-200`,
`confirm/route.ts:49-58`). No Supabase plan change required.

---

### D-13 — The 08-24 CTA change is the *anti*-case: it made the two-door collision less likely, not more
**Severity 1 (informational — a cleared suspect) · basis: measured · lens: drift**

The two-door design (`/registro` self-signup + `/activar` invite) frames the Marce incident, so I
tested whether a recent commit widened it.
`git show 50a6a207 -- apps/client/src/app/_components/public-header.tsx`:

```
-  const reservar: Href = signedIn ? "/reservar" : "/registro";
+  const reservar: Href = "/reservar";
```

**Before 2026-08-24, a logged-out visitor tapping "Clases" or the drawer's "Reservar clase" went
straight to `/registro`.** After, they go to `/reservar` → guard → `/entrar`, and `/registro` is
reachable only behind the "Crea tu cuenta" link (`entrar-form.tsx:343`). `grep` at HEAD confirms only
two inbound links to `/registro` remain in the entire client app (`entrar-form.tsx:343`,
`contacto/page.tsx:180`).

So the "an invited member wandered into `/registro`" path was **one tap** before 08-24 and is **three**
now. That commit is exonerated. Saying so is the point: I went looking for it to be the culprit and
found the opposite.

The residual real risk is smaller and worth naming: `/entrar` is where every failure in D-02, D-04 and
D-11 dumps the member, and `/entrar` is the one screen that offers "Crea tu cuenta". A member bounced
there by a dead link is offered self-signup as her way out — which is how a single-account member
acquires the `auth.users` row that puts her permanently on D-01's fragile rail.

**Evidence:** `git show 50a6a207 -- apps/client/src/app/_components/public-header.tsx`;
`grep -rn '/registro' apps/client/src` at HEAD.
**Fix hint:** on `/entrar?error=token-rechazado`, suppress "Crea tu cuenta" — a member who just
clicked a confirmation link demonstrably already has an account.

---

## 2. Where this is sound (M2 — stated with evidence, then still ranked)

**SOUND-1 — Zero duplicate function overloads, project-wide.** `select proname, count(*) from
pg_proc … where nspname='public' group by 1 having count(*)>1` → **empty set**, across all 60 public
functions. The 2026-08-27 PostgREST-300 outage class is closed *and* now has a repo guard
(`tools/guards/rpc-overload.test.ts`, added in `8f78cc1b`). Measured this round; extends
`01-live-snapshot.md` §C, which checked 10.

**SOUND-2 — All 60 live RPC bodies match their canonical file.** I hashed `pg_proc.prosrc` for all 60
`public` functions with comments and whitespace normalised out, hashed the 60
`supabase/functions-canonical/*.sql` files the same way, and joined: **60 of 60 identical, 0 drifted.**
The name sets are also 1:1 in both directions — no prod-only function, no orphan file. This is a
materially stronger result than §C's 10-function sample, and the first time in this pack that
live-vs-repo was checked in full. Measured.

**SOUND-3 — The 09-01 `senal_gym` triggers cannot abort a member's write.** Fifteen statement-level
triggers now fire on `clientes` / `ventas` / `asistencias` / `reservation` / `class_session` —
including the member-claim table. `pg_get_functiondef` for `realtime.send` (live) wraps its INSERT in
`EXCEPTION WHEN OTHERS THEN RAISE WARNING`. So a missing `realtime.messages` daily partition, a policy
change, or a Realtime outage degrades the freshness signal **silently** and does **not** roll back the
claim. `senal_gym.sql` additionally dedupes with a transaction-local GUC, so a batch write emits one
broadcast per gym per transaction, not one per row. Measured. (The flip side — that a dead rail is
silent — belongs to another territory.)

**SOUND-4 — Both edge functions match the repo.** `send-email` is v8, `verify_jwt:false`, and
`01-live-snapshot.md` §A found it byte-identical to
`supabase/functions/send-email/{index,correo}.ts` (attributed; not re-diffed this round).
`activar-cuenta` v3 was flagged out-of-scope there; I read its live `files[].content` this round
against `supabase/functions/activar-cuenta/{index,nucleo}.ts` and found **no drift** — every branch,
doc comment and status map matches. **Correction to §A:** its `updated_at` of `1784102166796` decodes
to **2026-07-15**, not 2026-08-06 — the same day as its last repo commit (`00a0c8f6`). It is in sync;
it is simply a function untouched since before every 08-2x / 09-0x change on this surface.

**SOUND-5 — Turnstile failures are member-visible and recoverable.** `activar-form.tsx:63-93,258-262`
wires all three widget outcomes (`success` / `expired` / `error`) plus a load timeout (`sinCargar`) to
distinct Spanish copy and a re-render button — `c43fbc63` (08-12) removed the always-pass fallback and
this is the replacement. `verificarTurnstile` fails **loud** on a missing secret and **closed** on
everything else (`apps/client/src/lib/turnstile.ts:22-25`). Both RED hosts serve the identical
sitekey `0x4AAAAAADw0zgE_N--iabPb` (live curl). *Unmeasured:* whether
`www.redfunctionaltraining.com` is registered in that widget's Cloudflare hostname list — the
Cloudflare dashboard is not reachable from here. It is at least not fully broken, since members
activated on that host on 08-28, 08-30, 08-31, 09-01 and 09-02.

**SOUND-6 — The 465dcf4 session-blind fix is intact at HEAD.** `entrar/page.tsx:35-40` still calls
`getClaims()` and bounces a live session to `destinoClases(...)`. The one-line regression prior
register P-062 warned about has not happened.

---

## 3. Answer to Q1, explicitly

> **Q1 — Where are ALL the drifts? "These issues were not presenting before and now they don't stop."**

**Thirteen, ranked in §1.** The short version:

1. The drift that matters most is **not a commit** — it is D-01, a population inversion. On
   2026-07-27 every RED member walked the safe activation rail; in the last 24 h **5 of 6** walked
   the fragile one. That single number reframes the whole complaint.
2. The drift that makes it *feel* new is **08-30, `afd7a5d5`** — four changes in one commit
   (D-02 hard error screen, D-03 partial throttle, D-05 fail-closed hook, D-07 signup-only OTP) that
   collectively converted quiet-and-recoverable into loud-and-looping. `cuentaExistenteFallo` did not
   exist before that commit; `git log -S` returns exactly one hash.
3. The drift that makes it *persistent* is D-04 — `/auth/confirm` has no session check, so the
   member's own second tap is a failure. Measured 4× in one evening from one member.
4. The drift that will bite the *next* gym is D-05 + D-06 — both depend on dashboard state (the Auth
   allow-list, the host mapping) that no test, guard, migration or type in this repo can read.
5. **Live-vs-repo drift, ranked:** deployed hook = repo (**no drift**, SOUND-4); RPC bodies = canon
   (**60/60, no drift**, SOUND-2); duplicate overloads (**none**, SOUND-1); migration ledger
   (**148 applied vs 145 files; 16 of the newest 19 versions unrecognised; the 09-01 batch applied in
   a different order** — D-08); the guards that check any of this (**repo-vs-repo only** — D-09). So
   the *code* is in sync; the *ledger* and the *console* are not, and the console is where D-05/D-06
   live.
6. **Exposure vs regression:** exposure is real and large (7 real members in 10 weeks → 47 in 4
   weeks, **17×**) and it explains the count. It does not explain the shape, because the terminal
   failure rate did not rise with it (2 unconfirmed of 47; **0 in the most recent week**). The correct
   sentence is: **the failures are not new, the members are.** The traps were always there; until
   2026-08-10 there was nobody to walk them.

---

## 4. Keep-verdicts

| keep | exit trigger |
|---|---|
| **Keep the two-door design (`/registro` + `/activar`).** Deleting `/registro` would strand walk-ins and prospects; it is a real product surface. | Exit when **≥ 3** members in any rolling 7-day window produce an `email_exists` 422 on `/admin/users` within **60 minutes** of their own `/signup` — i.e. the doors are colliding routinely, not exceptionally. Today's count for that exact pattern: **1** (Marce, 32 s apart). |
| **Keep the `cuenta_existente` magic-link rail** (never a password reset — activation audit §4; the reason is sound: no inbox proof means account takeover). | Exit when a shipped fix gives it all three shields it lacks (throttle gating, OTP fallback, idempotent re-click) — **or** when its share of `/activar` attempts exceeds **90%** over 7 days, at which point it is the primary rail and must stop being the exception. Today: **83%** (5/6, n = 6). |
| **Keep `send-email` v8's fail-closed on a wrong `redirect_to` path.** The alternative (#217) auto-enrols a user into whichever gym owns the platform Site URL. That is worse than a 500. | Exit when **any** `/signup` 500 in a 24 h window traces to a real member address rather than a test address. Today: **6 of 6** trace to `189.237.183.74` (owner/dev). One real one flips this to "fix now". |
| **Keep the in-memory `reenvio-limite` counter** despite being per-instance — the module comment is honest about it and it does cap a single wedged human. | Exit at **> 50** auth mails in any clock hour (the shared project-wide bucket), or the first hour with **≥ 2** distinct addresses hitting `over_email_send_rate_limit`. Today: **1** address, **2** events. |
| **Keep the `pdx1` pin (ADR-0017)** — the post-deploy colo check was green and the ruling "pdx1 alone, never add iad1" stands. | Exit when a p95 middleware→Supabase read exceeds **8 s** (the fetch-shield GET timeout) on **> 1%** of navigations. Currently **unmeasured** — no Vercel log access this session. |
| **Keep the two RED client hosts** — the custom domain is a customer-facing commitment. | Exit **now, at 2 hosts**: this one has already met its trigger. A 308 from every non-`es_principal` client host to the principal is the smallest fix and it closes D-06 outright. |
| **Keep hand-numbered migration filenames** — or don't. | **Undecided** — the question is "is `supabase/migrations/` a replayable history or a change log?", and only the owner can answer it, because the answer decides whether `pnpm test:denial` on a scratch project proves anything about prod. Ask him. |
| **Keep `rpc-canon-drift.test.ts`** — it does catch repo-internal staleness, which is a real class. | Exit when a live-vs-repo check exists as a named script. Until then the guard's name overstates it: **0** of its 3 assertions reads production. |

---

## 5. Could not determine

| question | experiment that would settle it |
|---|---|
| Is the failure rate actually *elevated* versus, say, 2026-08-20? | Impossible retroactively (`auth.audit_log_entries` = 0; logs 24 h). Ship the `auth_evento` table from D-12, wait 14 days, compare. |
| Do RED members hold sessions on both `red.ibookit.lat` and `www.redfunctionaltraining.com`? | Vercel access-log query over 7 days: distinct `Host` per client IP/UA on `/reservar` and `/entrar`. |
| Is `www.redfunctionaltraining.com` registered in the Turnstile widget's hostname list? | Cloudflare dashboard → Turnstile → widget `0x4AAAAAADw0zgE_N--iabPb` → Hostname Management. Or a headless load of `/activar` on that host asserting a non-empty `cf-turnstile-response`. |
| Is `www.redfunctionaltraining.com` in the Supabase Auth Redirect-URL allow-list, and what is the Site URL? | Supabase dashboard → Authentication → URL Configuration. Decides whether D-05 is armed for RED or only for unlisted hosts. |
| What are the live GoTrue rate limits (emails/hour, `token_refresh` per 5 min per IP, OTP expiry)? | Dashboard → Authentication → Rate Limits. `supabase/config.toml` is local-dev only and cannot be cited (`01-live-snapshot.md` §H). |
| Who were the 18 real `invalid_credentials` (D-11) — members without passwords, or typos? | Log a hashed address on `invalid_credentials` in `iniciarSesion`, re-read after 7 days. Or query `auth.identities` for accounts whose only provider row has no password set. |
| Does the daily auth alert cron match today's dominant codes (`otp_expired`, `over_email_send_rate_limit`, `email_exists`)? | Read `apps/admin/src/app/api/cron/alertas/resumen.ts` and check its matcher list. I did not open it this round. |
| Did the six `/signup` 500s include any real member? | Correlate `189.237.183.74` against the owner's ISP, or add the attempted address (hashed) to the hook's error log. |

---

## 6. Blind spots — what I did not examine

- **`apps/admin` beyond confirming `resumen.ts` exists.** The desk side of the funnel (crear cliente,
  `preparar_invitacion`, REENVIAR INVITACIÓN) is another territory's; I traced only where it mints the
  invite URL (`invitaciones.ts:118-135`).
- **`apps/mobile/`** — untracked, out of scope, not opened.
- **The `senal_gym` browser hook** (`client-senal.ts`, `useSenalGym`) and the 09-01/09-02 realtime
  commits, beyond confirming the trigger cannot abort a write.
- **The modos batch's member-facing behaviour** (`/saldo`, Lista landing) — I read only the routing
  branch in `entrar/page.tsx` and `entrar/actions.ts`.
- **I did not run `pnpm test`, `pnpm test:denial`, or `pnpm test:e2e`.** Every "the guard checks X"
  claim comes from reading the guard source, not from a run.
- **`proxy.ts` line-by-line.** I confirmed it is middleware (`export const config`) and read its tail;
  the cookie-teardown/parking logic is prior register P-048/P-049's territory and I did not re-derive
  it.
- **Vercel-side anything** — deploy history, access logs, function region distribution beyond the
  single `X-Vercel-Id` header I captured.
- **Statistical significance.** Every rate in §0 has a denominator between 5 and 146 over one day.
  The window is a Tuesday evening plus a Wednesday; a class night is not a Sunday. Treat the rates as
  *shapes*, not as *estimates*.
- **~55 of the 65 commits in `02-drift-timeline.md`** were not re-diffed by me. I opened `afd7a5d5`
  and `50a6a207` and ran `git log -S` on three symbols; the rest of the timeline is inherited
  (attributed, `as-recorded`).

---

## 7. Draft audit — what I cut or retagged, and the rule that caught each

- **Cut:** *"The 08-28 custom-domain cutover caused the elevated failures."* I could not connect the
  cutover to any measured failure — the triage's H5 already refuted the tenant-mismatch theory with
  live data, and my own probe shows both hosts serving correctly. Rule 5 (cite or drop). What
  survived is the narrower, cited D-06 (disjoint cookie jars, no redirect, measured by curl).
- **Cut:** *"Turnstile is failing on the new host and blocking activations."* I built the chain
  (08-12 removed the always-pass fallback → 08-28 added a host → an unregistered hostname yields no
  token → the form refuses) and then killed it: members demonstrably activated on that host on 08-28,
  08-30, 08-31, 09-01 and 09-02. Rule 7 (a criticism you cannot support is cut exactly like an
  unsupported reassurance). It survives only as an *unmeasured* item in §5.
- **Retagged:** the six `/signup` 500s. My first draft called them a live member-facing failure at
  55%. Netting the IP (`189.237.183.74`, shared with the owner's `invalid_credentials` bursts and
  with prior triage P-083) forced it down to "the path is live-reachable and 100% fatal when reached,
  but today's six are the owner's e2e". Rules 5 + 7. The *rate* stayed in §0 because it is the
  measured rate for that endpoint; the *attribution* changed.
- **Retagged:** *"`realtime.send` failure could abort a member's claim."* I read the live function
  definition rather than assuming, found `EXCEPTION WHEN OTHERS THEN RAISE WARNING`, and moved the
  whole item from a severity-4 finding to SOUND-3. Rule 7.
- **Retagged:** *"the senal_gym trigger set adds a subtransaction per row."* The triggers are
  statement-level and deduped by a transaction-local GUC, so it is one send per gym per transaction.
  Deleted the scale claim rather than hedge it. Rule 4 (the number has to come from this code).
- **Corrected, not cut:** `01-live-snapshot.md` §B's "drift confined to the pre-2026-08-23 tree" and
  §A's `activar-cuenta` date. Both are prior-round claims I re-derived and found wrong; Rule 5
  required naming the correction rather than silently restating the right number (D-08, SOUND-4).
- **Corrected:** the marce-triage's implicit attribution of the six identical "Confirma tu cuenta"
  subjects to the activation rail. `correo.ts:113-140` gives magiclink a *different* subject, so those
  six were `/registro` signup mails. Attribution kept (P-087), claim sharpened (D-07). Rule 1 —
  attribute, then re-derive.
- **Did not invent findings to hit a floor.** The floor was 8; there are 13 because the 24 h log
  window handed me five I had not expected (D-01, D-04, D-05, D-10, D-11). D-13 is ranked severity 1
  on purpose: it is a *cleared* suspect, and saying so is part of the answer.
