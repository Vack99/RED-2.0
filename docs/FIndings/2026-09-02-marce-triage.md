# Marce (marcerubiogarcia07@gmail.com) — activation triage, 2026-09-02

Triage run 2026-09-02 ~16:58Z (10:58 local, America/Chihuahua). Live project `hjppxawglmukfvsgmcog`.
SELECT-only. No live mutation performed.

## TL;DR

**She is already in.** Claim + `gym_membership` landed `2026-09-02 16:31:48.747Z`; a password login
succeeded `16:35:38.559Z` — 23 minutes before this triage ran. The owner's report is stale.

The error she saw was real and is fully evidenced:

1. **`"No salió el correo — No pudimos enviarte el enlace ahora mismo. Intenta de nuevo."`**
   (`apps/client/src/app/activar/_components/activar-form.tsx:145-152`), shown TWICE on 2026-09-01 at
   19:25:17Z and 19:25:27Z (13:25 local). Cause: GoTrue `429 over_email_send_rate_limit`.
2. A **six-deep stack of "Confirma tu cuenta" mails in her inbox, of which only the newest ever
   works** — every `/otp` request rotates `auth.one_time_tokens` for her user, so each new request
   kills every link she was already holding. Opening a stale one yields GoTrue
   `403 otp_expired "One-time token not found"` → `auth/confirm/route.ts:146` `rechazar(…,
   "token-rechazado")` → `/entrar?error=token-rechazado`.

The **root trigger for both** is that she used the **public self-registration door `/registro`**
(linked from `/entrar` — `apps/client/src/app/entrar/_components/entrar-form.tsx:343`) instead of /
in addition to the invite link. That minted an `auth.users` row for her address, which permanently
routes `/activar` down the `cuenta_existente` magic-link rail
(`apps/client/src/app/activar/actions.ts:80-95`) and, on 09-01, spent the 60-second per-address email
window 32 seconds before she pressed the invite button.

It also **voided the 09-01 remediation**: the prior session deleted her inert `auth.users` row at
~18:22Z so the invite would fresh-provision — she recreated the row herself at 19:24:45Z, one hour
later, putting her straight back on `cuenta_existente`.

The known `500: Invalid payload sent to hook` defect is **NOT hers** — see §5.

---

## 1. Evidence: live auth state

### `auth.users`

```sql
select id, email, created_at, updated_at, email_confirmed_at, confirmation_sent_at,
       (confirmation_token is not null and confirmation_token <> '') as has_conf_token,
       recovery_sent_at, invited_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
       banned_until, deleted_at, is_sso_user, is_anonymous,
       (encrypted_password is not null and encrypted_password <> '') as has_password, aud, role
  from auth.users
 where lower(email) like '%marcerubiogarcia07%' or lower(email) like '%rubio%';
```

| field | value |
|---|---|
| `id` | `4f405fde-5a36-43ea-a538-0a7726590a4f` |
| `created_at` | `2026-09-01 19:24:45.217031+00` |
| `email_confirmed_at` | `2026-09-02 16:31:48.600671+00` |
| `confirmation_sent_at` | `2026-09-02 16:29:41.391518+00` |
| `confirmation_token` present | **false** (consumed) |
| `recovery_sent_at` | `null` |
| `invited_at` | `null` (never a GoTrue `invite`) |
| `last_sign_in_at` | `2026-09-02 16:35:38.559646+00` |
| `has_password` | **true** |
| `banned_until` / `deleted_at` | `null` / `null` |
| `is_sso_user` / `is_anonymous` | false / false |
| `raw_user_meta_data` | `{"sub":"4f405fde…","email":"marcerubiogarcia07@gmail.com","full_name":"Marcela Rubio Garcia","phone_e164":"+526144625778","email_verified":true,"phone_verified":false}` |

`full_name` + `phone_e164` in the metadata is the **`/registro` form's** payload shape — the invite
rail's `admin.createUser({email_confirm:true})` writes no such metadata and confirms instantly.
This is the first proof she came in through self-registration.

### `auth.identities`

One row, `provider=email`, `id 6d7a985d-e3c8-430e-aff8-d70f980a325a`,
`created_at 2026-09-01 19:24:45.256449+00`. No OAuth identity. Clean.

### `auth.one_time_tokens`

**Zero rows** for her user / her address. Every minted token has been consumed or rotated away.
This is the mechanism behind the stale-link failure: GoTrue keeps **one** confirmation token per
user, so mail #6 invalidated mails #1–#5.

### `auth.flow_state` — four `email/signup` PKCE flows

| created_at | auth_code | authentication_method |
|---|---|---|
| `2026-09-01 19:24:45.264240+00` | `e6f82431-38df-49ae-ad26-b9a8d8aa9018` | `email/signup` |
| `2026-09-02 01:17:30.873393+00` | `2eeaa0d2-e48a-42ea-a879-640ebca6e1f0` | `email/signup` |
| `2026-09-02 02:18:03.968217+00` | `510083f4-e1e4-4731-bf1b-b0847a67748c` | `email/signup` |
| `2026-09-02 16:29:41.369043+00` | `f8586d38-41b2-4df4-8ca2-eeeb79cf3435` | `email/signup` |

### `auth.sessions` — two live sessions, both today

| id | created_at | ip |
|---|---|---|
| `78b90813-c6c7-4446-8b61-4026b1ca095e` | `2026-09-02 16:31:48.613428+00` | `184.32.34.144` |
| `855a4f3f-71d2-4dbd-bc34-c092d0f1d0f8` | `2026-09-02 16:35:38.560708+00` | `35.84.200.140` (Vercel `pdx1`, server-side `signInWithPassword`) |

`not_after` null on both — neither is revoked.

### `auth.audit_log_entries` — **EMPTY (0 rows, table-wide)**

```sql
select count(*), min(created_at), max(created_at) from auth.audit_log_entries;
-- {"total":0,"oldest":null,"newest":null}
```

The durable audit table this project version writes nothing to. The audit ledger lives **only** in
the log stream (`source='auth_audit_logs'` / `'auth_logs'`), which is capped at a **24-hour window**.
Everything before 2026-09-01 ~17:00Z is unrecoverable from logs — the Resend ledger (§3) is the only
surviving record of that period.

---

## 2. Evidence: the auth ledger (log stream, `auth_logs`)

Query (window 2026-09-01T18:00Z → 2026-09-02T18:00Z):

```sql
select timestamp, substring(event_message,1,700)
  from logs
 where source='auth_logs'
   and event_message ilike '%4f405fde-5a36-43ea-a538-0a7726590a4f%'
 order by timestamp asc;
```

GoTrue logs the request's `redirect_to` in the `referer` field for `/signup` and `/otp`, and the
actual `Referer` header for `/verify` and `/token`. That makes `referer` a reliable discriminator of
**which app door** issued each call.

| # | UTC | local | path | status | `referer` (= `redirect_to`) | verdict |
|---|---|---|---|---|---|---|
| 1 | `09-01 19:24:45` | 13:24 | `/signup` | **200** | `https://www.redfunctionaltraining.com/auth/confirm` | **`/registro`** (`registro/actions.ts:56`) — user created |
| 2 | `09-01 19:24:45` | | `run_hook` | `error:null` "Hook ran successfully" | | mail queued |
| 3 | `09-01 19:25:17` | 13:25 | `/otp` | **429** | `…/auth/confirm?codigo=33SDA38A&firma=ef876e…&next=/reservar` | **`/activar` `cuenta_existente`** — ERROR SHOWN |
| 4 | `09-01 19:25:27` | 13:25 | `/otp` | **429** | same | ERROR SHOWN |
| 5 | `09-02 01:17:31` | 19:17 (09-01) | `/otp` | 200 | same | magic link sent, hook OK |
| 6 | `09-02 02:18:04` | 20:18 (09-01) | `/otp` | 200 | same | magic link sent, hook OK |
| 7 | `09-02 16:29:41` | 10:29 | `/otp` | 200 | same | magic link sent, hook OK |
| 8 | `09-02 16:31:48` | 10:31 | `/verify` | **200** | `https://red.ibookit.lat` | `user_signedup`, `login_method:"otp"` — **CONFIRMED + CLAIMED** |
| 9 | `09-02 16:35:38` | 10:35 | `/token` | **200** | `https://red.ibookit.lat` | `grant_type=password` — **LOGGED IN** |

### The two 429 lines — verbatim

```json
{"auth_event":{"action":"user_confirmation_requested","actor_id":"4f405fde-5a36-43ea-a538-0a7726590a4f",
 "actor_name":"Marcela Rubio Garcia","actor_username":"marcerubiogarcia07@gmail.com"},
 "component":"api","duration":6535208,
 "error":"429: For security purposes, you can only request this after 28 seconds.",
 "error_code":"over_email_send_rate_limit","level":"warning","method":"POST",
 "msg":"request completed","path":"/otp",
 "referer":"https://www.redfunctionaltraining.com/auth/confirm?codigo=33SDA38A&firma=ef876e5c6ef25d8936e4fcc7c77566e97159a6990dc6a78cec0b79c1e0c7da1d&next=/reservar",
 "remote_addr":"35.90.190.68", "time":"2026-09-01T19:25:17Z"}
```

```json
{"error":"429: For security purposes, you can only request this after 18 seconds.",
 "error_code":"over_email_send_rate_limit", "path":"/otp", "time":"2026-09-01T19:25:27Z"}
```

Cross-check — **she is the ONLY account that hit this 429 in the entire 24h window**:

```sql
select timestamp, extract(event_message,'"actor_username":"([^"]*)"') as who,
       extract(event_message,'"path":"([^"]*)"') as path,
       extract(event_message,'"error":"([^"]*)"') as err
  from logs where source='auth_logs' and event_message ilike '%over_email_send_rate_limit%'
 order by timestamp desc;
-- only 2 rows, both marcerubiogarcia07@gmail.com, 19:25:17 and 19:25:27
```

### Path from the 429 to the screen she saw

`activar/actions.ts:87-94`:

```ts
const enviado = await enviarMagicLink(email, `${origin}/auth/confirm?codigo=${codigo}&firma=${firmaCodigo(codigo)}&next=/reservar`);
return enviado.ok ? { status: "cuentaExistente" } : { status: "cuentaExistenteFallo" };
```

`activar-form.tsx:145-152` renders `cuentaExistenteFallo` as:

> **NO SALIÓ EL CORREO**
> No pudimos enviarte el enlace ahora mismo. Intenta de nuevo.
> [ INTENTAR DE NUEVO ] · Iniciar sesión

That is verbatim "an error is shown and I can't enter at all."

### Stale-link failures in the window (attribution NOT proven for her)

```sql
select timestamp, substring(event_message,1,450) from logs
 where source='auth_logs' and event_message ilike '%/verify%'
   and (event_message ilike '%otp_expired%' or event_message ilike '%expired%')
 order by timestamp desc;
```

Four hits, all `403 / otp_expired / "One-time token not found"`, all `referer:"https://red.ibookit.lat"`,
all `remote_addr 54.148.1.230`:
`2026-09-01 21:58:30Z`, `21:58:45Z`, `21:59:53Z`, `22:02:49Z`.

GoTrue cannot resolve a user from a token it can't find, so these carry **no `actor_id`**. Timing
(21:56 signups by `andreanayelli0404@` and `omarolivas0507@`) and host (`red.ibookit.lat`, whereas
**every one of Marce's links is on `www.redfunctionaltraining.com`** — see §3) make Andrea/Omar the
likelier owners. **Not attributable to Marce on this evidence.**

---

## 3. Evidence: Resend delivery ledger

Key read from `apps/admin/.env.local` (`RESEND_API_KEY`, 36 chars, never printed).
`GET https://api.resend.com/emails?limit=100` — page 1 covers `2026-08-19 18:27:40Z` → now, so no
paging was needed; `has_more:true` refers to older mail only.

**Every mail to her is `last_event: "delivered"`. Not one bounce, not one deferral.**

| # | created_at (UTC) | subject | last_event |
|---|---|---|---|
| 1 | `2026-08-19 18:27:40.147` | Tu recibo de RED Functional Training — F-1066 | delivered |
| 2 | `2026-08-19 18:27:40.373` | **Tu gimnasio RED te invita a su app** (invite #1) | delivered |
| 3 | `2026-08-26 21:08:20.699` | recibo F-1072 | delivered |
| 4 | `2026-08-31 21:08:06.218` | recibo F-1088 | delivered |
| 5 | `2026-09-01 02:06:40.692` | recibo F-1091 | delivered |
| 6 | `2026-09-01 02:50:16.154` | **Confirma tu cuenta** (signup #1) | delivered |
| 7 | `2026-09-01 14:12:39.254` | **Confirma tu cuenta** (signup #2) | delivered |
| 8 | `2026-09-01 17:18:53.318` | **Tu gimnasio RED te invita a su app** (invite #2, owner re-send) | delivered |
| — | *~2026-09-01 18:22* | *(prior session DELETES her `auth.users` row)* | — |
| 9 | `2026-09-01 19:24:45.934` | **Confirma tu cuenta** (signup #3 → user `4f405fde`) | delivered |
| — | `2026-09-01 19:25:17 / 19:25:27` | **429 — NO MAIL SENT, error screen shown twice** | — |
| 10 | `2026-09-02 01:17:31.554` | **Confirma tu cuenta** (magic link #1) | delivered |
| 11 | `2026-09-02 02:18:04.619` | **Confirma tu cuenta** (magic link #2) | delivered |
| 12 | `2026-09-02 16:28:48.050` | **Tu gimnasio RED te invita a su app** (invite #3, owner re-send) | delivered |
| 13 | `2026-09-02 16:29:42.036` | **Confirma tu cuenta** (magic link #3) | delivered → **this is the one she clicked** |

Note #6 and #7 (`09-01 02:50`, `09-01 14:12`) predate the 24h log window entirely — they exist
**only** in the Resend ledger. They prove she had been self-registering at `/registro` since the
early hours of 09-01, i.e. before the remediation, not just after it.

**That is six `Confirma tu cuenta` mails with identical subject and identical sender in one inbox.
Only #13 was live.**

### The actual link URLs (`GET /emails/{id}`, `text` body)

```
#9  (09-01 19:24, /registro signup)
https://www.redfunctionaltraining.com/auth/confirm?token_hash=pkce_79d3dab36bf2e8a6f67d5972d2cf402112aa4ec7e0e30e7cc3c1bbed&type=email

#10 (09-02 01:17, /activar magic link)
https://www.redfunctionaltraining.com/auth/confirm?codigo=33SDA38A&firma=ef876e5c6ef25d8936e4fcc7c77566e97159a6990dc6a78cec0b79c1e0c7da1d&next=%2Freservar&token_hash=pkce_b891acc841ddf91cbf162bde3518d611b53a90600c2d0f98f7721643&type=…

#11 (09-02 02:18)
…&token_hash=pkce_a0698fe908a1923ebff4dcc462d2e1a67f12247e892c29c5db7f72db&type=…

#13 (09-02 16:29)
…&token_hash=pkce_715cb7e5abf89ba4c576459ad223e81c1ea5907bb1c2c944fadfe813&type=…

#12 (09-02 16:28, invite)
https://www.redfunctionaltraining.com/activar?codigo=33SDA38A
```

Three observations that kill three hypotheses at once:

* **Every link is on `www.redfunctionaltraining.com`** — the `es_principal` host. No host drift, no
  `red.ibookit.lat` leakage, no `__Host-` cookie split. **H5 refuted.**
* **`codigo=33SDA38A` and `firma=ef876e…` are byte-identical across #10/#11/#13.** The invite code and
  its HMAC never rotate and never expire. Only `token_hash` differs. **H1 and H4 refuted.**
* Resend has **no open/click tracking enabled** on this account (`GET /emails/{id}` returns only
  `last_event`, no `events[]`, no `opened_at`/`clicked_at`). So delivery is provable; *opening* is not.

Which of the six she opened before 16:29 cannot be recovered.

---

## 4. Evidence: live app state

### `public.clientes` — one row, no duplicates, fully claimed

```sql
select c.id, c.gym_id, g.slug, c.auth_user_id, c.email, c.nombre, c.tel, c.phone_e164, c.created_at,
       c.claim_code, c.invitacion_enviada_at, c.terms_accepted_at, c.privacy_accepted_at,
       c.privacy_aviso_version, c.clases_restantes, c.vence, c.paquete_nombre,
       (au.id is not null) as auth_user_exists
  from public.clientes c
  left join public.gym g on g.id=c.gym_id
  left join auth.users au on au.id=c.auth_user_id
 where c.email ilike '%marcerubiogarcia07%' or c.email ilike '%rubio%'
    or c.nombre ilike '%rubio%' or c.nombre ilike '%marce%'
    or c.phone_e164 like '%6144625778%' or c.tel like '%6144625778%';
```

| field | value |
|---|---|
| `id` | `78d08c65-450f-45e9-ae4f-afc70927fa44` |
| `gym_id` / slug | `ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9` / **`red`** |
| `auth_user_id` | `4f405fde-5a36-43ea-a538-0a7726590a4f` |
| **`auth_user_exists`** | **true** — no orphan claim. **H3 refuted.** |
| `email` | `marcerubiogarcia07@gmail.com` |
| `nombre` / `tel` | `Marcela rubio` / `6144625778` (`phone_e164 +526144625778`) |
| `created_at` | `2026-08-19 18:27:39.321987+00` |
| `claim_code` | `null` — consumed |
| `invitacion_enviada_at` | `2026-09-02 16:28:48.013834+00` |
| `terms_accepted_at` / `privacy_accepted_at` | both `2026-09-02 16:31:48.74795+00` |
| `privacy_aviso_version` | `null` (correct — `finalizarAuth` passes `null` on the firma rail, `auth/confirm/route.ts:84`, no aviso is rendered upstream) |
| `clases_restantes` / `vence` / `paquete_nombre` | `null` / `2026-09-30` / `Mensualidad ilimitada` |

`clases_restantes = null` is **correct** for an unlimited package, not drift.

Duplicate scan across all gyms — she is not in it:

```sql
select lower(email), count(*), array_agg(distinct g.slug) from public.clientes c
  join public.gym g on g.id=c.gym_id where c.email is not null group by 1 having count(*)>1;
-- only aaron.talavera6@, ajtalaverapalos@, d3bigwlf@, no.waitercuu@ (all owner test rows on demo gyms)
```

### `public.gym_membership`

```
user_id 4f405fde-5a36-43ea-a538-0a7726590a4f | gym red | role member | created_at 2026-09-02 16:31:48.74795+00
```

### `public.ventas` — paid, current

| folio | paquete | clases | vigencia | monto | metodo | fecha |
|---|---|---|---|---|---|---|
| 1091 | Mensualidad ilimitada | null | 30 días | 1200 | transferencia | `2026-09-01 02:06:40` |
| 1088 | Clase individual | 1 | 30 días | 120 | efectivo | `2026-08-31 21:08:05` |
| 1072 | Clase individual | 1 | 30 días | 120 | efectivo | `2026-08-26 21:08:19` |
| 1066 | Clase individual | 1 | 30 días | 120 | transferencia | `2026-08-19 18:27:39` |

She paid $1200 for an unlimited month on 09-01 and spent the next 21 hours unable to open the app.
That is the churn risk.

### `public.gym_domain` — RED client hosts

| hostname | app | es_principal | created_at |
|---|---|---|---|
| `red.localhost` | client | false | 2026-07-02 |
| `red.ibookit.lat` | client | false | 2026-07-09 |
| **`www.redfunctionaltraining.com`** | client | **true** | 2026-08-28 |
| `red-admin.ibookit.lat` | admin | false | 2026-07-09 |

All of her mail targets the `es_principal` host. The `/verify` and `/token` `Referer` of
`https://red.ibookit.lat` at 16:31/16:35 is the **app host she was browsing** at that moment (both
hosts resolve `x-gym=red`, so it is inert) — not the link host.

---

## 5. Evidence: hook drift + the `500: Invalid payload sent to hook` defect (NOT hers)

`list_edge_functions`: `send-email` is **version 8**, `ACTIVE`, `verify_jwt:false`,
`updated_at 1788142477036` (= 2026-08-30 ~19:34Z), matching the repo's
`supabase/functions/send-email/index.ts` mtime of `Aug 30 19:24`. `activar-cuenta` is v3.
**No live-vs-repo drift indicated.**

**Every single hook run for Marce logged `"error":null` / `"msg":"Hook ran successfully"`** — at
`09-01 19:24:45`, `09-02 01:17:31`, `09-02 02:18:04`, `09-02 16:29:41`. Her mail always left.
**H2 refuted.**

The `500: Invalid payload sent to hook` errors in the same window belong **exclusively** to
`delivered@resend.dev` ("Prueba E2E", user `7c464e4f-a15d-4192-9aa2-89d728c249ef`) at
`09-01 21:40:14`, `09-02 00:24:43`, `00:25:18`, `04:17:44`, `08:24:28`, `08:53:20`.

Root cause, evidenced — the `redirect_to` on those calls is a **bare origin with no path**:

```sql
select timestamp, extract(event_message,'"referer":"([^"]*)"') as redirect_to,
       extract(event_message,'"path":"([^"]*)"') as path,
       extract(event_message,'"error":"([^"]*)"') as err
  from logs where source='auth_logs' and event_message ilike '%delivered@resend.dev%';
-- redirect_to = "https://red.ibookit.lat"   path = "/signup"   err = "500: Invalid payload sent to hook"
```

`supabase/functions/send-email/correo.ts:64-77`:

```ts
function construirUrl(redirectTo: string, tokenHash: string, tipo: string): string {
  if (!redirectTo) throw new Error("redirect_to vacío: …");
  const u = new URL(redirectTo);
  if (u.pathname !== "/auth/confirm") {
    throw new Error(`redirect_to con ruta inesperada (${u.pathname}): solo /auth/confirm es válido — probablemente un Site URL sin ruta`);
  }
  // …
}
```

`supabase/functions/send-email/index.ts:106-111`:

```ts
} catch {
  // Empty/unparseable/wrong-path redirect_to: fail closed rather than defaulting
  // to the platform's global Site URL, which would auto-enroll this user into
  // whichever gym owns that host (#217).
  return json(400, { error: { http_code: 400, message: "redirect_to vacío o inválido" } });
}
```

So the hook is **working exactly as designed** (FC-07/FC-10, #217): the Playwright suite runs against
a host GoTrue does not have in its redirect allow-list, GoTrue clamps `emailRedirectTo` to the Site
URL `https://red.ibookit.lat` (pathname `/`), and the hook refuses rather than mis-minting a
cross-tenant link. GoTrue surfaces the hook's 400 to the caller as `500: Invalid payload sent to hook`.

**This is a test-harness/config gap, not a production defect, and it never touched Marce.**

---

## 6. Why the owner's test accounts pass, and how far this spreads

```sql
select u.email, u.created_at, u.email_confirmed_at, u.last_sign_in_at, c.id, g.slug,
       c.auth_user_id is not null as claimed, c.claim_code is not null as codigo_vivo,
       c.invitacion_enviada_at
  from auth.users u
  left join public.clientes c on lower(c.email)=lower(u.email)
  left join public.gym g on g.id=c.gym_id
 where u.created_at >= '2026-08-28' order by u.created_at desc;
```

| email | created | confirmed | Δ | rail |
|---|---|---|---|---|
| `greciarguez3000@` | `09-02 15:04:08.805` | `09-02 15:04:08.842` | **37 ms** | `/activar` fresh-provision (`admin.createUser({email_confirm:true})`) |
| `alva.valles311@` | `09-02 01:28:33` | `09-02 01:29:11` | 38 s | `/registro` → clicked first mail |
| `andreanayelli0404@` | `09-01 21:56:43` | `09-01 21:58:14` | 91 s | `/registro`; `codigo_vivo:true` → claimed by **email-match fallback**, invite code never used |
| `omarolivas0507@` | `09-01 21:56:27` | `09-01 21:57:47` | 80 s | `/registro`; `codigo_vivo:true` → email-match fallback |
| **`marcerubiogarcia07@`** | **`09-01 19:24:45`** | **`09-02 16:31:48`** | **21 h 7 m** | the outlier |

Two things this table settles:

* **`/registro` normally works.** Andrea and Omar walked exactly the same door and were in within 90
  seconds, claimed by `intentarReclamoPorEmail` (`auth/confirm/route.ts:85-96`) with their invite
  codes still unspent. Self-registration is not itself the bug.
* **The differentiator is the 32-second interleave.** Marce alone bounced from `/registro` to
  `/activar` inside the 60-second per-address email window, which is the only way to reach
  `cuentaExistenteFallo`. Then she never opened the newest of six identically-subjected mails.

**Why the owner's accounts never reproduce it:** he tests `/activar` only, from a clean state, one
door at a time. `aaron.talavera6@gmail.com` additionally has an `auth.users` row minted by `red-demo`
on 2026-07-09 (memory `activation-rails-two-paths`) and is `claimed:false, codigo_vivo:true` on `red`
— so it is *permanently* stuck on the `cuenta_existente` rail and structurally cannot exercise the
fresh-provision rail. `atp404951@gmail.com` (the reserved clean address) and `testingibookit@outlook.com`
both confirm in ~30 ms — i.e. they walk the fresh-provision rail, which sends one mail and never
touches the `/otp` throttle. **No owner test account has ever crossed `/registro` and `/activar` in
the same minute, which is the only sequence that produces her error.**

**Blast radius:** any RED member who (a) self-registers at `/registro` and then presses the invite
link within 60 s → the 429 error screen; or (b) accumulates more than one unopened
`"Confirma tu cuenta"` mail and opens any but the newest → `otp_expired` → `/entrar?error=…`. Both
are reachable by ordinary member behaviour, and (b) grows more likely with every re-send. Currently
8 RED clientes still hold live invite codes:
`aaron.talavera6@`, `Ivanmontanez77@`, `Luisaapodaca29@`, `Camisofi48@`, `yaah10@live.com.mx`,
`giovanna.estrada.r@`, `hannaminjarez03@`, `alealvaradorv@`.

---

## 7. Hypothesis scorecard

| # | Hypothesis | Verdict | Killing evidence |
|---|---|---|---|
| H1 | Invite link bound to the auth user deleted on 09-01 | **REFUTED** | `codigo=33SDA38A` + `firma=ef876e…` byte-identical in mails #10/#11/#13 across the deletion; the invite carries no user id |
| H2 | Her rail hit the `send-email` hook 500 | **REFUTED** | all four of her `run_hook` lines log `"error":null` / "Hook ran successfully"; the 500 belongs only to `delivered@resend.dev` with `redirect_to="https://red.ibookit.lat"` |
| H3 | `clientes.auth_user_id` orphaned at a deleted user | **REFUTED** | join to `auth.users` returns `auth_user_exists:true`; single cliente row |
| H4 | token / firma TTL exceeded | **REFUTED** | firma never changes; the 16:29 token was minted and consumed 2 min later; the failure mode is **rotation**, not expiry |
| H5 | Tenant/host mismatch after the 08-28 cutover | **REFUTED** | every mailed link is on `www.redfunctionaltraining.com` (`es_principal`) |
| **H6** | **`/registro` → `/activar` inside 60 s → `429 over_email_send_rate_limit` → `cuentaExistenteFallo` error screen** | **CONFIRMED** | two `429 over_email_send_rate_limit` lines at 19:25:17 / 19:25:27, sole occurrences in the 24h window; `activar/actions.ts:94` → `activar-form.tsx:145` |
| **H7** | **Six identical-subject mails, only the newest live; opening a stale one → `otp_expired` → `/entrar?error=token-rechazado`** | **PLAUSIBLE — mechanism proven, her click not** | `auth.one_time_tokens` empty; 6 delivered mails with 3 distinct `token_hash`; four `403 otp_expired` in-window are on `red.ibookit.lat` and more likely Andrea/Omar. Resend has no click tracking, so her specific click is unrecoverable |

---

## 8. Quick-fix recipe (ranked) — **superseded by the fact that she is already in**

Verified at `2026-09-02 16:58:38Z`: `email_confirmed_at` set, `gym_membership` row present,
`last_sign_in_at 16:35:38Z`, two unrevoked sessions, `vence 2026-09-30`. **Do nothing to the database.**

**Step 0 (no consent needed): confirm with her before touching anything.** Ask whether she is inside
the app right now. Her last successful password login was 16:35:38Z / 10:35 local.

If — and only if — she reports still being locked out:

1. **Re-send the invite from the admin ficha** — the `INVITAR` / `REENVIAR INVITACIÓN` button on her
   cliente card in the admin app. `[CONSENT]` (writes `clientes.invitacion_enviada_at`, sends mail).
   Tell her **"borra los correos viejos de RED primero y abre solamente el último."** This is the
   whole fix for H7.
2. **Password reset** — she has a password (`has_password:true`) set at `/registro`; if she forgot it,
   `/entrar` → "¿Olvidaste tu contraseña?" → `/restablecer`. No live mutation by us, no `[CONSENT]`.
3. **Admin API temp password** — `auth.admin.updateUserById('4f405fde-5a36-43ea-a538-0a7726590a4f',
   { password: '<temp>' })` from the Supabase dashboard (Authentication → Users → her row → Reset
   password / Update user). `[CONSENT]` — mutates live auth. Hand her the temp password out of band
   and have her change it. Use only if 1 and 2 both fail.
4. **Do NOT** delete her `auth.users` row again. It is what created this whole episode, and
   `unclaim-cliente-recipe` says so explicitly ("Never delete `auth.users`"). It is also now
   destructive rather than inert: the row owns a claimed cliente, a `gym_membership`, and two live
   sessions.

**Her side, in either case:** mark the RED mail **"No es spam" / move it out of Spam** in Gmail, delete
every older `Confirma tu cuenta`, and open only the newest one, on the same phone she will use the app on.

**Spanish message the RED owner can send her:**

> Hola Marce, ya quedó tu cuenta — puedes entrar en www.redfunctionaltraining.com con tu correo y la
> contraseña que creaste. Si te aparece algún error, borra los correos viejos de RED y abre únicamente
> el más reciente; y si no recuerdas tu contraseña, usa "¿Olvidaste tu contraseña?" en la pantalla de
> acceso. ¡Nos vemos en el gym!

---

## 9. What still needs a code fix

1. **`cuentaExistenteFallo` swallows a 429 and tells the member the wrong thing.** `activar/actions.ts:94`
   maps every `enviarMagicLink` failure to one screen; a throttle is a *wait 30 seconds*, not a
   *no salió el correo*. Surface `over_email_send_rate_limit` distinctly with a countdown.
2. **`/activar` does not detect that the same person just signed up at `/registro` seconds earlier.**
   The `cuenta_existente` branch should recognise an **unconfirmed** account for the same address and
   say "ya te mandamos un correo hace un momento — ábrelo" instead of spending another `/otp`.
3. **Six mails with the identical subject `"Confirma tu cuenta"` are indistinguishable in an inbox,
   and only the newest works.** Number them, timestamp the subject, or state the send time in the body.
4. **`/registro` and `/activar` are two doors to one outcome with no cross-links.** A member holding an
   invite has no reason to be at `/registro` (`entrar-form.tsx:343`); a member at `/registro` whose
   email matches an unclaimed coded cliente should be routed to the invite rail.
5. **The 6-digit OTP fallback (`bloqueCodigo`, `correo.ts:90-96`) renders only for
   `emailActionType === "signup"`, and the `/codigo` landing exists** — her magic-link mails never
   carried a usable fallback. Re-evaluate now that `/codigo` is live.
6. **`e2e/signup.spec.ts` runs against a host GoTrue clamps**, so it will fail forever on
   `500: Invalid payload sent to hook`. Either add the e2e host to the Supabase redirect allow-list or
   pass an allowed `emailRedirectTo`.
7. **`auth.audit_log_entries` is empty and the log stream holds 24 h.** There is no durable auth
   forensics trail; the Resend ledger was the only record of 09-01 02:50 and 14:12. Ship a log drain or
   an application-side auth event table.
8. **Resend open/click tracking is off**, so "did the member open the link" is unanswerable during an
   incident. Turn it on (per-account Resend setting) — this is the single experiment that would have
   settled H7.
