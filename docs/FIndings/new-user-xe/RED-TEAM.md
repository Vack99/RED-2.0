# RED TEAM — the new-user surface fails the RED gym

Seat: mandatory red team, tier-3 cross-examination, 2026-09-02. HEAD = `33c9087a`.
Live project `hjppxawglmukfvsgmcog`, SELECT-only. Emails masked to first 3 chars + domain
except `marcerubiogarcia07@gmail.com` (already documented).

My mandate is the strongest HONEST case against this surface. Where the code is sound I say so
with evidence (§6) and rank it anyway. Where I could not measure, the claim carries its tag.

---

## 0. The one number

```sql
with red as (select id from public.gym where slug='red')
select count(*) as vigentes,
       count(*) filter (where c.auth_user_id is not null) as con_acceso,
       count(*) filter (where c.auth_user_id is null)     as sin_acceso,
       count(*) filter (where c.auth_user_id is null and c.email is null)     as sin_correo,
       count(*) filter (where c.auth_user_id is null and c.email is not null) as con_correo
from public.clientes c where c.gym_id=(select id from red) and c.vence >= current_date;
-- {"vigentes":47,"con_acceso":37,"sin_acceso":10,"sin_correo":8,"con_correo":2}
```

**RED has 47 members with a currently-valid membership. 10 of them (21.3%) cannot open the app
today.** Eight because the roster row has no email at all and the product therefore has no path to
invite them; two because the invite went out and never converted. Basis: measured, live, this round.

The owner's question was "why are new members failing lately". The honest answer is that they have
been failing at roughly this rate the whole time, and the only reason it now looks like a spike is
that Marce complained out loud. Every instrument that should have told him — the wedge detector,
the daily alert, the roster badge — is either blind to the cohort, drowned in its own noise, or
reports a state with no age on it.

---

## 1. Ranked findings — worst first

Attack shape: a sequence a normal person performs, ending in an error string or a wrong state.

---

### RT-01 · 8 paying RED members are structurally uninvitable, and the desk shows no defect (sev 5)

**Attack.** Operator sells a package at the desk and does not type an email (the field is optional;
15 RED rows carry `email IS NULL`, oldest 2026-05-20, newest **2026-09-01** — this is still
happening). The sale succeeds, money is taken, `clientes.claim_code` is minted, and
`enviarInvitacion` returns `{ok:false, motivo:"sin-email"}` (`packages/data/src/server/invitaciones.ts:229`).
On the ficha, `estadoInvitacion` derives `sin_email`
(`packages/data/src/server/derive.ts:161`) and the invite block is **not rendered at all** —
the JSX condition is `estado === "sin_invitar" || estado === "invitacion_enviada"`
(`apps/admin/src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx:488`). The badge reads
"Sin email" and there is no call to action, no count, no roster filter.

**Member-visible symptom.** They never learn the app exists. They keep paying at the counter.

**Evidence.**
- `apps/admin/src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx:486-508` — invite control
  is conditioned on two of four states; `sin_email` renders nothing.
- `packages/data/src/server/derive.ts:160-164`, `:169-174` — the state machine has four states and
  no aging.
- Live: `select count(*) ... where gym_id=red and email is null` → **15**; of those, **8** have
  `vence >= current_date`.

**Basis.** measured (live SQL) + file:line at HEAD.

**Breaking point.** Component: the desk→invite handoff. Breaks at: **1 sale with a blank email**.
Bound by: nothing — there is no validation, no nag, no backfill queue. It has already broken 15
times on RED.

**Fix hint.** Add `sin_email` to the ficha's invite block with an "AGREGAR CORREO" action wired to
EDITAR, and surface a roster count. This is a 4-line JSX condition change plus one badge.

---

### RT-02 · `/entrar` sends every invited member to the wrong door, permanently (sev 5)

**Attack.** Member gets the invite mail, does not open it (spam / later / different phone), and
instead goes to the gym's site and taps LOGIN. `/entrar` renders an unconditional, full-width,
accented CTA: **"¿PRIMERA VEZ? / CREA TU CUENTA" → `/registro`**
(`apps/client/src/app/entrar/_components/entrar-form.tsx:341-353`). The code comment states the
intent plainly: *"an admin-registered member who hasn't self-registered yet is told 'wrong password'
… so this affordance stays on-screen unconditionally to point them the right way."* For a gym whose
members are all admin-registered, that is pointing them the wrong way. They self-register, which
mints an `auth.users` row for their address, which routes `/activar` down the `cuenta_existente`
magic-link rail **forever** (`apps/client/src/app/activar/actions.ts:80-95`).

**Member-visible symptom.** Two identities, six identically-subjected mails, and — if they bounce
between the two doors inside 60 s — `429 over_email_send_rate_limit` rendered as
**"NO SALIÓ EL CORREO — No pudimos enviarte el enlace ahora mismo."**
(`activar/actions.ts:94` → `activar/_components/activar-form.tsx:145-152`). That is Marce, verbatim.

**Evidence.**
- The split, measured live. `raw_user_meta_data ? 'full_name'` is present only on the `/registro`
  rail (`registrarSocio` passes `options.data.full_name`, `packages/data/src/server/registro.ts:158`;
  the invite rail's `admin.createUser` writes none — corroborated by the confirm deltas below):

  | rail | RED members claimed since 2026-08-15 | min `created→confirmed` |
  |---|---|---|
  | `/registro` (`full_name` present) | **20 of 27 (74%)** | 0.2 – **1704.1** min |
  | `/activar` fresh-provision | 7 of 27 (26%) | 0.0 min, every one |

- Marce triage, `docs/FIndings/2026-09-02-marce-triage.md` §2 (H6 CONFIRMED) — re-derived at HEAD
  this round: the 429→screen path still runs through `activar/actions.ts:87-94` unchanged.

**Basis.** measured (live SQL, 27 rows) + file:line at HEAD.

**Breaking point.** Component: door disambiguation. Breaks at: **1 member who taps LOGIN before
opening the mail**. Bound by: nothing — the CTA never branches on whether an unclaimed coded
`clientes` row exists for the typed address. 20 RED members have already walked it.

**Fix hint.** On `/registro`, after the email field blurs, check for an unclaimed `claim_code` row
in the host gym and offer "ya tienes una invitación — ábrela" instead of a signup. One RPC, one
branch.

---

### RT-03 · The owner's test accounts are structurally incapable of failing (sev 5)

**Claim.** Every account the owner tests with walks the `/activar` fresh-provision rail, which calls
`admin.createUser({email_confirm:true})` — the account is confirmed **inside the same request**,
with **zero mail round trips**. Every failure mode on this surface lives on the rails that require a
member to find, open and click a mail. His instrument cannot register the thing he is measuring.

**Evidence.**
- `gre***@gmail.com`, the owner's 2026-09-02 walk: `created 15:04:08.805`, `confirmed 15:04:08.842`
  — **37 ms**, `via_registro:false`, 1 session. Same shape for `atp***@gmail.com` (his reserved
  clean address), `jes***`, `lic***`, `nat***`, `ort***`, `and***`: all `0.0` min.
- The tail, all on rails he does not test: `els***` 77.4 min, `sas***` 96.3 min, `cam***` 1704.1 min
  (28.4 h), `mar***` (Marce) 1267.1 min (21.1 h). **4 of 20 `/registro` members took >10 minutes;
  0 of 7 fresh-provision members did.**
- 3 members needed **4** `auth.flow_state` rows (4 signup/OTP round trips): `els***`, `sas***`,
  `mar***`. All three are `/registro`.
- Prior register attribution: `docs/FIndings/2026-09-02-marce-triage.md` §6 already states "no owner
  test account has ever crossed `/registro` and `/activar` in the same minute". **This round extends
  it with a number**: no owner test account has ever crossed a *mailbox* either.

**Basis.** measured (live SQL).

**Breaking point.** Component: the owner's confidence. Breaks at: **0 additional members** — it is
already wrong. Bound by: the absence of any account in the roster that walks `/registro` on purpose.

**Fix hint.** Add one permanent test identity that self-registers via `/registro` on
`www.redfunctionaltraining.com` and is re-walked before each push, with the mail read in a real
inbox. Nothing else in the repo can produce that signal.

---

### RT-04 · The wedge detector sees 1 of 7 genuinely stuck RED members, and lies about the one it sees (sev 4)

**Attack.** A member gets the invite, the mail lands in spam, they never click. No `auth.users` row
is ever created. `registros_atorados()` opens with `from auth.users`
(`supabase/functions-canonical/registros_atorados.sql:2`) — so this member does not exist to the
detector, and the ficha badge says "Invitada 13 ago" with no age, no colour, no filter.

**Measured coverage.** Of the 8 RED `clientes` rows holding a live `claim_code` with an email:

| masked | invited | still stuck | has `auth.users`? |
|---|---|---|---|
| `aar***@gmail.com` | 09-01 | 1 d | yes (owner) |
| `Iva***@gmail.com` | 08-31 | 2 d 17 h | **yes** |
| `Lui***@gmail.com` | 08-31 | 2 d 17 h | no |
| `Cam***@gmail.com` | 08-23 | 10 d | no |
| `yaa***@live.com.mx` | 08-13 | 19 d | no |
| `gio***@gmail.com` | 08-13 | 19 d | no |
| `han***@gmail.com` | 08-13 | 19 d | no |
| `ale***@gmail.com` | 08-05 | **28 d** | no |

**Detector coverage: 2 of 8 rows, and one of those two is the owner's own account. Real coverage:
1 of 7 (14%).**

**And the one it does see is misreported.** Live call:

```sql
select * from public.registros_atorados();
-- ivanmontanez77@gmail.com | sin-vincular | 66 h | filas_roster: 0
```

`filas_roster` is **hardcoded to the literal `0`** on the `sin-vincular` arm
(`registros_atorados.sql:31`) while the `sin-confirmar` arm computes it
(`:20-21`). A matching RED `clientes` row *does* exist for that address — id `3de6a039…`,
"Iván Montañez", paid, `vence 2026-10-01`, live `claim_code`. The 2026-08-30 incident ruling
(memory `auth-door-incident-shield-plan.md`) left two members unrepaired citing "no roster/identity
evidence". That is the exact field this function fakes.

**Member-visible symptom.** Iván Montañez has been confirmed-and-stranded for 66 hours with a paid
membership running to 2026-10-01, 0 sessions, 0 memberships, and nobody knows.

**Basis.** measured (live SQL + function call) + file:line at HEAD.

**Breaking point.** Component: wedge detection. Breaks at: **any member who never clicks** — i.e.
the majority case. Bound by: the `from auth.users` root of the CTE.

**Fix hint.** Add a third arm rooted in `public.clientes`: `auth_user_id is null and claim_code is
not null and invitacion_enviada_at < now() - interval '48 hours'`. Compute `filas_roster` on both
arms or drop the column.

---

### RT-05 · The alert cadence was silently reverted to daily, and the alert cries wolf every day (sev 4)

**Claim.** The one channel that would tell the owner "a member cannot get in" fires with the same
content every single day, so it carries no information — and it fires at most once a day, not
hourly as the code's own reasoning insists.

**Evidence — the cadence lie, at HEAD.**
- `apps/admin/vercel.json` → `"schedule": "0 12 * * *"` (daily).
- `apps/admin/src/app/api/cron/alertas/route.ts:32` → *"SCHEDULE (`apps/admin/vercel.json` — JSON,
  so the reasoning lives here): `0 * * * *`, hourly."* Plus 11 more comment lines across
  `route.ts` and `resumen.ts` arguing why daily is indefensible (`resumen.ts:9,12,40,44,83,110,113,123`).
- `git log`: `afd7a5d5` (08-30) moved it to hourly; **`860a3893` (2026-09-02 02:36) moved it back**
  — *"Vercel Hobby caps cron at once/day, hourly schedule was rejected as a paid feature."* Only
  `vercel.json` changed. The 12 comment lines were not updated and now assert the opposite of
  the config.

**Evidence — the noise floor.**
- `resumen.ts:176-178`: `alertar = (turnoDiario && (invalidGrant > 10 || sendEmailFallos > 0)) ||
  atorados.length > 0 || errores.length > 0`. **`sendEmailFallos > 0`** — no threshold.
- Live logs, 09-01T18:00Z → 09-02T18:00Z: **6 × `500: Invalid payload sent to hook` on `/signup`**,
  all belonging to `delivered@resend.dev`, the `signup.spec.ts` fixture (see RT-09). So
  `sendEmailFallos ≥ 6` every day the suite is attempted.
- `registros_atorados()` returns **3 rows right now**, two of which the owner deliberately decided
  not to repair on 08-30. `resumen.ts:190-194` renders them under the heading *"Miembros que no
  pueden entrar:"*. Same three names, every day, since 08-30.

**Member-visible symptom.** None directly — which is the point. Iván's genuine 66-hour lockout is
line 3 of a mail whose lines 1 and 2 have been wrong for four days.

**Basis.** measured (git, config file, live log aggregation) + file:line at HEAD.

**Breaking point.** Component: signal-to-noise on the only alert. Breaks at: **2 consecutive
identical alerts** (the point a human starts archiving on sight). It is at **~4 days** of identical
alerts. Detection latency for a new wedge: up to **24 h (cron) + 24 h (`sin-vincular` floor,
`registros_atorados.sql:33`) = 48 h**.

**Fix hint.** Suppress `%@resend.dev` in `SQL_SEND_EMAIL_FALLOS` the way `registros_atorados()`
already suppresses it in its candidate CTE, and correct the 12 comment lines to `0 12 * * *`.

---

### RT-06 · Both rescue doors report "enviado" for a mail that never left (sev 4)

**Attack.** Member registers at `/registro`; the mail goes to spam. They return to `/entrar`, type
the password they set, get `email_not_confirmed`, tap **"¿Olvidaste tu contraseña?"** →
`resetAction` fires `resetPasswordForEmail` immediately (`apps/client/src/app/entrar/actions.ts:50-63`),
spending GoTrue's 60-second per-address window. Within that window they tap the resend-confirmation
button the 08-30 shield added. `permitirReenvio` allows it (its window is 5 min but its ledger has
no entry from `resetAction`), `reenviarConfirmacion` gets a `429`, **and the result is discarded**:

```ts
// apps/client/src/app/entrar/actions.ts:84-89
if (email && permitirReenvio(email)) {
  ...
  await reenviarConfirmacion(email, `${origin}/auth/confirm`);
}
return { status: "enviado" };
```

Identical shape at `apps/client/src/app/registro/actions.ts:97-102`.

**Member-visible symptom.** A green "enviado" for a mail that was refused. This is FC-16 — the
defect the 08-30 shield existed to kill — reintroduced at the doors the shield itself built.

**And the "ONE counter" claim has a hole.** `packages/data/src/server/reenvio-limite.ts:4-5` asserts
it is *"shared by ALL THREE doors that can put a confirmation mail in flight"*. `resetAction` is a
**fourth** door onto the same GoTrue per-address window and the same project-wide auth-mail bucket,
and it spends neither counter. `grep -n permitirReenvio apps/client/src/app/entrar/actions.ts` →
line 84 only; `resetAction` (line 50) has none, and no Turnstile either.

**Basis.** file:line at HEAD (measured code path); the 429-on-reset interaction is
**modelled — inputs: GoTrue's documented per-address `over_email_send_rate_limit` floor, evidenced
live at 60 s by the two 429 lines in `docs/FIndings/2026-09-02-marce-triage.md` §2 ("after 28
seconds" / "after 18 seconds"). Not reproduced end-to-end this round.**

**Breaking point.** Component: the resend rail's honesty. Breaks at: **2 mail-sending taps inside
60 s**, which is normal impatient behaviour. Bound by: nothing in the app; only GoTrue's floor.

**Fix hint.** Return the `SesionResultado` and render "espera 1 minuto" on a throttle; route
`resetAction` through `permitirReenvio` too.

---

### RT-07 · One tap on a shared device silently transfers a paid membership and rewrites the roster email (sev 4)

**Attack.** A member forwards the invite mail to a family member, or opens it on a phone where
somebody else's iBookit session is live. `/activar?codigo=XXXXXXXX` sees a session
(`apps/client/src/app/activar/page.tsx:73-79`) and renders `VincularForm` — a bare button reading
**"Vincular RED a tu cuenta"**. One tap → `vincularAction` → `intentarReclamoPorCodigo(codigo, null)`,
which **mints the firma server-side** (`packages/data/src/server/registro.ts:343`), so the RPC's only
authz gate passes unconditionally.

`reclamar_por_codigo` then:
- finds the row by `claim_code` (`supabase/functions-canonical/reclamar_por_codigo.sql:44-48`);
- checks only that the *caller* owns no row in that gym (`:54-58`);
- **never compares the session's email to the row's email**;
- `update public.clientes set auth_user_id = v_uid, email = v_email` (`:60-62`) — the paid row's
  contact address is overwritten with the wrong person's.

`vincularAction` swallows every outcome and redirects (`apps/client/src/app/activar/actions.ts:137-138`).

**Member-visible symptom.** The real member's invite link now says "Esta invitación ya no es válida"
(or, on the second visit, nothing at all), their address is gone from the roster, and someone else's
account shows their package. No screen, no mail, no log line records the transfer.

**Mitigation present and its limit.** `#150` added the signed-in address to the copy and a
"No soy yo — cerrar sesión" button (`vincular-form.tsx:125-133, 182-189`). That is a *disclosure*,
not a *gate*: the primary accented button is still the one that binds, and the form asks for no
confirmation of the invited person's identity.

**Basis.** file:line at HEAD (code path fully traced). **No live instance of this attack observed —
tag: reasoning, not sourced for the occurrence; the code path is measured.** What would confirm:
a `clientes` row whose `email` differs from the invited address recorded in the Resend ledger for
its `claim_code`. Resend has no click tracking, so the ledger cannot close this on its own.

**Breaking point.** Component: invite ownership. Breaks at: **1 tap by a signed-in non-owner**.
Bound by: nothing in the RPC.

**Fix hint.** Have `reclamar_por_codigo` refuse when `lower(v_email) <> lower(clientes.email)` and
`clientes.email is not null`, and make `VincularForm` show the invited row's masked email.

---

### RT-08 · A typo at `/registro` mints a ghost cliente and then permanently blocks the real invite (sev 4)

**Attack.** Member self-registers with a slightly different address than the desk typed
(`ana.perez@` vs `anaperez@`, or their work address). At `/auth/confirm`,
`intentarReclamoPorEmail` runs `reclamar_o_crear_cliente`, which finds no email match
(`supabase/functions-canonical/reclamar_o_crear_cliente.sql:50-52`, `v_n = 0`) and falls to the
**create** arm (`:74-86`): a brand-new `clientes` row, `clases_restantes = 0`, no venta, plus a
`gym_membership` row. `esMiembro` is now true, so `/reservar` renders the week —
`apps/client/src/app/reservar/page.tsx:69` never fires `SinMembresia`.

Then they open the invite mail. `/activar` with a live session → `vincularAction` →
`reclamar_por_codigo` → `select count(*) … where gym_id = v_gym and auth_user_id = v_uid; if v_owns
> 0 then raise exception 'Ya tienes cuenta en este gimnasio'`
(`reclamar_por_codigo.sql:54-58`). `intentarReclamo` turns that into a value
(`registro.ts:323-330`), `vincularAction` discards it (`activar/actions.ts:137`) and redirects to
`/reservar`.

**Member-visible symptom.** They tap the invite, land in the app, and see **zero classes and no
package**, with no error of any kind. RED now has two rows for one human: one paid with a live
`claim_code`, one empty and claimed. There is no merge action anywhere in the admin app.

**Live shape of this failure, today.** `iva***@gmail.com` (`86ece6c3…`): created 2026-08-29 13:43
via `/registro`, `confirmation_sent_at: null`, `email_confirmed_at 2026-08-30 23:33:39.842238` —
**the identical microsecond as `sas***@gmail.com`**, the only duplicate `email_confirmed_at` value
in the whole table:

```sql
select email_confirmed_at, count(*) from auth.users where email_confirmed_at is not null
group by 1 having count(*)>1;
-- 2026-08-30 23:33:39.842238+00 | 2 | [sas***@gmail.com, iva***@gmail.com]
```

`updated_at` on the `iva` row is *older* than `email_confirmed_at`, so this was a raw SQL UPDATE,
not the GoTrue admin API. **Two RED members required a hand-write to the auth database to get in on
08-30.** Because that write bypassed `/auth/confirm`, `intentarReclamoPorEmail` never ran: the
`iva` row still has **0 sessions, 0 memberships, 0 claimed clientes**, while a matching unclaimed
paid RED row (`3de6a039…`, `vence 2026-10-01`) sits beside it.

**Basis.** measured (live SQL) + file:line at HEAD.

**Breaking point.** Component: the two-doors join key. Breaks at: **1 character of difference
between the address the desk typed and the one the member types.** Bound by: `lower(email)` string
equality — the only join between the paid row and the identity.

**Fix hint.** Before the create arm, check for an unclaimed `claim_code` row in the gym whose
`phone_e164` matches the signup metadata and refuse-with-guidance rather than minting a ghost.

---

### RT-09 · The only browser gate on this surface has been red since 2026-08-30 (sev 3)

**Claim.** `pnpm test:e2e` is the repo's sole browser-level proof of the auth surface and the
documented pre-merge convention for any change to it (`AGENTS.md`, "Browser-level session shield").
Its signup half fails deterministically and its skip mode exits 0, so the convention has proven
nothing across the window that contains the señal rail, the modos batch and the glance-sheet pushes.

**Evidence.**
- `apps/client/playwright.config.ts:68` — `baseURL` is `http://red-demo-client.localhost:3100`.
  `apps/client/e2e/signup.spec.ts` test 1 POSTs the real `/registro` form against **live** GoTrue.
- GoTrue does not hold that host in its Redirect-URL allow-list, clamps `emailRedirectTo` to the
  Site URL (pathname `/`), and `construirUrl` fails closed
  (`supabase/functions/send-email/correo.ts:69-73`) → `index.ts:106-111` returns 400 → GoTrue
  surfaces `500: Invalid payload sent to hook`.
- Live logs, 09-01T18:00Z → 09-02T18:00Z: **6 occurrences**, all `delivered@resend.dev`, path
  `/signup`. That is six attempted runs, six failures, in one day.
- `ARMADA = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)` (`signup.spec.ts:45`) —
  unset credentials skip, exit 0.
- Prior register: this is item 6 of `docs/FIndings/2026-09-02-marce-triage.md` §9 and the "live
  signup 500 open" note in memory `senal-gym-freshness-built.md`. **Re-derived at HEAD this round**
  with the 24-hour occurrence count, which neither prior source carried.

**Basis.** measured (live log aggregation) + file:line at HEAD.

**Breaking point.** Component: the auth-surface gate. Breaks at: **0 pushes** — it is already
non-functional. Bound by: a dashboard setting nobody in this repo can read (§H of
`01-live-snapshot.md`).

**Fix hint.** Add `http://red-demo-client.localhost:3100/**` to Supabase's Redirect URLs, or pass
an already-allowed `emailRedirectTo` in the spec.

---

### RT-10 · Every write on the new-user path is unbounded; the 08-29 shield covers none of them (sev 3)

**Claim.** `fetch-shield.ts` — shipped 08-29 as the answer to "everything spins forever" — bounds
GETs and the JWKS lookup and explicitly passes everything else through untouched:

```ts
// packages/data/src/server/fetch-shield.ts:140
if (method !== "GET" && method !== "HEAD") return fetch(input, init);
```

**Count of unbounded calls on the new-user path: 11.** `/auth/v1/signup`, `/otp`, `/resend`,
`/recover`, `/verify` (×2 call sites), `/token?grant_type=password`, `PUT /auth/v1/user`,
`rpc/reclamar_o_crear_cliente`, `rpc/reclamar_por_codigo`, `POST /functions/v1/activar-cuenta`.
Plus `POST https://api.resend.com/emails` inside the hook.

And the shield's own header concedes the first-load read is on the same side of the line:
`fetch-shield.ts:51` — *"`mi_membresia` — plpgsql with no volatility marker, i.e. VOLATILE:
PostgREST refuses GET"*. So the query behind `/reservar`'s first paint is a POST, unshielded.

**Two in-repo asymmetries prove this is an omission, not a policy.**
`packages/data/src/server/invitaciones.ts:58` bounds the Resend call with
`AbortSignal.timeout(10_000)` and says why. `supabase/functions/send-email/index.ts:115` — the same
Resend call, in the auth hook — has **no signal at all**. `packages/data/src/server/activacion.ts:99`
— the `activar-cuenta` edge fetch, the whole fresh-provision rail — has none either.

**Q7 shape.** In `/auth/confirm`, the single-use token is consumed **before** the claim:
`confirmarTokenHash` (`route.ts:142`) → `finalizarAuth` (`:144`) → claim (`:84`). A claim that
fails halfway is swallowed at `:98-102` and the member is redirected to `/reservar`. On the **email**
rail `/reservar` retries once (`reservar/page.tsx:65`). On the **codigo** rail there is no retry
anywhere in the app — the member lands signed-in, unclaimed, with a burned token and a zero balance,
and their `claim_code` is still live but they have no reason to look for the mail again.

**Basis.** file:line at HEAD (measured code paths). The *consequence* under a 30-second await is
**modelled — inputs: the code paths above plus Vercel's serverless function timeout, which I did
not read for this project (unmeasured — `vercel inspect` / the project's Function Duration
setting).**

**Breaking point.** Component: new-user writes under a degraded Supabase leg. Breaks at:
**1 request that exceeds the platform function timeout**, with no retry and no idempotency key on
9 of the 11 calls. Bound by: nothing in this repo.

**Fix hint.** Extend `shieldedFetch` to POST for the two claim RPCs (both are idempotent by their
own doc-comments, `registro.ts:317-320`), and add an `AbortSignal` to `activacion.ts:99` and
`send-email/index.ts:115`.

---

### RT-11 · Six mails, one subject, and the fallback the shield built is unreachable from the rail that needs it (sev 3)

**Attack.** Every confirmation mail carries the subject `"Confirma tu cuenta"` with no send time and
no sequence number (`supabase/functions/send-email/correo.ts:112`). GoTrue keeps exactly one
confirmation token per user, so mail *n* kills mails 1…*n*−1. The member scrolls up in their inbox,
opens an older one, and gets `403 otp_expired` → `rechazar(…, "token-rechazado")`
(`apps/client/src/app/auth/confirm/route.ts:146`) → `/entrar?error=token-rechazado`.

**This is not theoretical and not only Marce.** Live logs, same 24-hour window:
**4 × `otp_expired / "One-time token not found"` on `/verify`**, all from `54.148.1.230`,
`21:58:30 → 22:02:49` on 09-01 — four dead-link clicks in four minutes, and the triage attributes
them to Andrea/Omar rather than Marce (`docs/FIndings/2026-09-02-marce-triage.md` §2).

**The fallback exists and cannot be found.**
- `bloqueCodigo` renders the 6-digit code **only** when `emailActionType === "signup"`
  (`correo.ts:91`). The `cuenta_existente` rescue rail — the one for a member who already has an
  account — sends a true `magiclink` for a *confirmed* user, whose copy is
  `"Continúa en tu cuenta"` (`correo.ts:134-138`) and which therefore carries **no code at all**.
- The mail's text is *"Escribe este código en la página de acceso"* — no URL.
- `/codigo` is linked from exactly two places, both on `/entrar`
  (`entrar-form.tsx:262`, `:361`). It is linked from **zero** of `/activar`'s three terminal
  screens (`yaReclamado`, `cuentaExistente`, `cuentaExistenteFallo` —
  `activar-form.tsx:109-166`) and from none of `/registro`'s.

**Basis.** measured (live log aggregation) + file:line at HEAD.

**Breaking point.** Component: mail disambiguation. Breaks at: **2 unopened confirmation mails in
one inbox**. Bound by: GoTrue's one-token-per-user invariant, which no repo change can lift.

**Fix hint.** Put the send time in the subject (`Confirma tu cuenta · 10:29`) and link `/codigo`
from `cuentaExistente` and `cuentaExistenteFallo`.

---

### RT-12 · 25 failed logins in 24 hours and the product cannot name a single one of them (sev 3)

**Evidence.** Live log aggregation, 09-01T18:00Z → 09-02T18:00Z, `source='auth_logs'`:

| error_code | path | n | actor logged? |
|---|---|---|---|
| `invalid_credentials` | `/token` | **25** | **no** |
| `refresh_token_not_found` | `/token` | 9 | no |
| `unexpected_failure` (hook 500) | `/signup` | 6 | — (e2e fixture) |
| `email_exists` | `/admin/users` | 5 | no — all 5 are Marce's `/activar` calls |
| `otp_expired` | `/verify` | 4 | no |
| `over_email_send_rate_limit` | `/otp` | 2 | yes (Marce) |
| `email_not_confirmed` | `/token` | 1 | no |

`actor_username` is empty on every `invalid_credentials` line — GoTrue does not log the actor on a
failed login. One residential IP (`189.237.183.74`) retried **7 times between 04:56 and 05:50 UTC**
(22:56–23:50 local) and stopped. That is a person who gave up last night, and no query in this
repo or this database can tell the owner who.

`auth.audit_log_entries` is **0 rows table-wide** (re-verified live this round; first recorded in
`docs/FIndings/2026-09-02-marce-triage.md` §1). The log stream retains **24 hours**. So there is no
durable auth forensics trail at all: everything before 2026-09-01 ~18:00Z is gone.

**Honest caveat.** 25 attempts is not 25 people — the AWS `pdx1` source IPs are the app's own
server-side `signInWithPassword`, so several lines can belong to one member. The un-attributability
is the finding, not the count.

**Basis.** measured (live log aggregation).

**Breaking point.** Component: login-failure forensics. Breaks at: **24 h + 1 minute** after any
incident. Bound by: the free-tier log retention; `auth.audit_log_entries` is not being written by
this GoTrue version.

**Fix hint.** Write an application-side `auth_evento` table from the four server actions that
already have the address in hand (`entrarAction`, `registrarAction`, `activarAction`, `codigoAction`).

---

## 2. Answers to the owner's questions, by number

**Q1 — Where are ALL the drifts?**
Four, ranked by how directly they hit a new RED member:

1. **The invite mail stopped pre-filling the email.** `afd7a5d5` (2026-08-30) removed `&correo=`
   from the invite URL — `packages/data/src/server/invitaciones.ts:237-241` documents the security
   reason. Consequence: since 08-30 every invited member must **type the exact address the desk
   registered**. A mismatch returns *"Ese correo no coincide con el que registró tu gimnasio"*
   (`activar/actions.ts:76`) with no self-service recovery. This is a real, dated, member-facing
   regression that lines up with "not presenting before".
2. **The alert cron was reverted to daily on 2026-09-02 02:36** (`860a3893`), leaving 12 comment
   lines at HEAD asserting hourly. RT-05.
3. **RED's canonical host moved to `www.redfunctionaltraining.com` on 08-28** (`95583ac9`), so all
   invite and auth links now mint on a host that has existed for 5 days. Refuted as a cause below
   (§6) — but it is the newest variable in the system and deserves to be named.
4. **`registros_atorados()` shipped 08-30 with `filas_roster` hardcoded 0** on the arm that matters.
   RT-04.

**Q2 — Where are the weak spots that would actually pop?**
RT-01 (8 uninvitable paying members, already popped), RT-02 (the wrong-door CTA, already popped 20
times), RT-06 (a green "enviado" on a refused send — one impatient double-tap away), RT-08 (one
typo). These four need no adversary and no unusual load.

**Q3 — Stressed to the top?**
The binding constraint is **not** RED's 47 members; it is the shared auth-mail bucket.
`reenvio-limite.ts:12` states the project-wide quota as **50/hr across every gym** (repo-asserted,
**unmeasured live — dashboard: Authentication → Rate Limits**), against GoTrue's 60 s per address,
i.e. 60/hr from a single member. The app-side cap is 5 min/address and 5/UTC day
(`reenvio-limite.ts:31-33`) held in a **module-level `Map` in serverless memory**, so N warm Vercel
instances permit N× that rate and a cold start forgets everything — the file says so itself at
`:23-29`. A second gym onboarding 30 members in an afternoon competes with RED for the same 50/hr.
Breaking point: **~50 auth mails in one hour across all tenants**, after which new RED members get
`DEMASIADOS_CORREOS` (`registro.ts:88-89`) with no queue and no retry.

**Q4 — Three months idle?**
Three dated fuses. (a) **All 9 TLS certs expire 2026-10-07**, issued in one 19-minute window,
renewal never verified (memory `member-reachability-todo.md`, 08-19 — **unverified this round**);
after that no door opens at all. (b) The **8 live `claim_code`s** never expire — `reclamar_por_codigo`
has no TTL check (`reclamar_por_codigo.sql:44-51`), so a bearer code leaked today is still a valid
membership takeover in January (RT-07). (c) `registros_atorados()` has a **30-day actionability
ceiling on both arms** (`:25`, `:34`), so a member wedged today becomes permanently invisible to
the detector on day 31 — the 28-day-old `ale***@gmail.com` row is 2 days from that edge.

**Q5 — Corrupting data as a normal human?**
Three taps, each measured to a file:line. (i) Tap the invite on a phone with anyone else's session →
the membership transfers and the roster email is overwritten (RT-07,
`reclamar_por_codigo.sql:60-62`). (ii) Self-register with a slightly different address → a ghost
`clientes` row is minted and the real invite is refused forever (RT-08,
`reclamar_o_crear_cliente.sql:74-86`). (iii) Lose signal mid-confirm → the token is spent before
the claim, the failure is swallowed at `auth/confirm/route.ts:98-102`, and the codigo rail has no
retry (RT-10). Force-quit and account-switch both land in (i) or (iii).

**Q6 — The most plausible one-line change next month that breaks a guarantee with all tests green.**
Adding a fifth mail-sending door — for example a "recuérdame" or a welcome mail — as one
`await enviarMagicLink(...)` call without routing it through `permitirReenvio`. `resetAction`
already proves this is the path of least resistance: it is the fourth such door and it bypasses the
counter today (`entrar/actions.ts:50-63`), and `pnpm lint && typecheck && test` are all green at
HEAD with it in place. Nothing in `tools/guards/` asserts that every GoTrue mail sender spends the
shared counter; `packages/data` mocks the `.rpc()`/auth boundary, so no vitest can see it either.
Runner-up: changing `estadoInvitacion`'s precedence at `derive.ts:161` — one reordered `if` silently
re-labels every stuck member as fine.

**Q7 — Every await takes 30 s, every network call fails halfway.**
Four operations end broken, all traced above in RT-10:
`/auth/confirm` (token spent, claim lost, no retry on the codigo rail);
`iniciarActivacion` (`activacion.ts:99`, no signal — a half-completed `admin.createUser` leaves an
`auth.users` row that permanently reroutes the member to `cuenta_existente`, exactly Marce's shape);
`completarActivacion` (`activacion.ts:161-166` — password set, claim lost, `ok:true` returned);
the `send-email` hook (`index.ts:115`, no signal — GoTrue times the hook out and answers the member
a 500 for a mail that may or may not have gone).

---

## 3. Keep-verdicts, each with a digit-bearing exit trigger

| # | Keep | Exit trigger |
|---|---|---|
| K1 | **Keep Supabase GoTrue as the auth provider.** Nothing here is a GoTrue defect; every finding is a door, a counter or a screen this repo owns. | Exit when the project-wide auth-mail bucket refuses **more than 5 sends in any 7-day window** (currently unmeasured — see CD-1). |
| K2 | **Keep the two doors (`/activar` + `/registro`).** Self-registration is genuinely working: Andrea and Omar were in within 90 s on 09-01, and 20 of 27 members used it. | Exit — i.e. hide `/registro` behind an "I have no invite" disclosure — when **more than 2 members per month** land on the `cuenta_existente` rail. Current rate: **1 confirmed (Marce) in 3 days**, so this is already close. |
| K3 | **Keep the `claim_code` bearer model (ADR-0015).** | Exit when **1** membership is claimed by an account whose email differs from the invited address (RT-07). Today: **0 observed**, but nothing detects it — see CD-3. |
| K4 | **Keep `pnpm test:e2e` as a convention rather than CI.** It genuinely needs a real auth server. | Exit — make it blocking — when **2 consecutive auth-surface pushes** land without a green run. HEAD is already at **≥3** (senal, modos, glance-card), so this trigger has fired. |
| K5 | **Keep `registros_atorados()`.** It found Iván. | Exit when its coverage of stuck RED members stays below **50%** after the `clientes`-rooted arm is added. Today: **14%** (1 of 7). |
| K6 | **Keep the `reenvio-limite` in-memory Map.** The alternative (shared state) is a real dependency for a real but bounded problem. | Exit when Vercel reports **more than 2 concurrent warm instances** for the client app under normal RED load, which makes the effective cap N× the intended one. Currently **undecided — nobody has read the concurrency number; the owner must pull it from the Vercel dashboard.** |

---

## 4. Could not determine

| # | Question | The experiment that would settle it |
|---|---|---|
| CD-1 | What are the **live** GoTrue rate limits (emails/hour, OTP verifications, sign-in attempts) and the OTP expiry? `supabase/config.toml:159,163` is local-dev only and provably not live. | Read Authentication → Rate Limits and Authentication → Email → OTP Expiry in the Supabase dashboard. One screenshot closes RT-06's modelled arm and Q3's headline number. |
| CD-2 | Which of the six identical mails did each stuck member actually open? | Turn on Resend open/click tracking (per-account setting). Without it, RT-11's blast radius is a mechanism with no incidence rate. |
| CD-3 | Has RT-07 (invite takeover on a shared device) ever actually happened on RED? | Join the Resend ledger's `to:` address per `codigo` against the final `clientes.email` for that row. Needs the Resend API and the pre-08-19 pages that this session did not fetch. |
| CD-4 | Is the daily alert mail actually **arriving**? The cron runs on Vercel; nothing in the database records a send. | Check Vercel → Cron logs for `/api/cron/alertas` and search the owner's inbox for `[iBookit] Alerta auth/correo` since 08-30. If it never arrived, RT-05's severity rises from noise to silence. |
| CD-5 | What is the Vercel function timeout for the client app's server actions? RT-10's consequence is modelled on it. | `vercel inspect` or the project's Function Duration setting. |
| CD-6 | Do the 9 TLS certs expiring **2026-10-07** auto-renew? | `openssl s_client -connect www.redfunctionaltraining.com:443` on 2026-09-10 per the owed calendar check in `member-reachability-todo.md`. |

---

## 5. Blind spots — what I did not examine

- **`supabase/functions/activar-cuenta/{index.ts,nucleo.ts}`** — I traced its *caller*
  (`activacion.ts`) and its error taxonomy but never read the edge function's own body. The
  fresh-provision rail's internal failure modes are therefore unexamined; the `422 email_exists`
  lines I attributed to it are inference from timestamps, not from its code.
- **`apps/client/src/proxy.ts` and `apps/admin/src/proxy.ts`** — I grepped for the prefetch and
  route-gating comments but did not read the 200-line body. Session rotation, cookie handling and
  the redirect matrix for a logged-in member hitting `/entrar`/`/activar` are unverified this round.
- **`supabase/tests/*.sql`** — I did not run `pnpm test:denial` and did not read
  `registro_claim.sql` / `preparar_invitacion_rules.sql` / `reclamar_por_codigo.sql`. Whether any
  suite already asserts the RT-07 email-overwrite is unknown; if one does, RT-07's severity drops.
- **`preparar_invitacion.sql`** and `marcar_invitacion_enviada` bodies — unread. Whether a code can
  be re-minted for an already-invited row (and what that does to a mail already in flight) is
  unexamined.
- **The Resend ledger** — I relied on `01-live-snapshot.md` §F and the Marce triage §3 rather than
  re-paging the API myself, so "how many mails did each member need" is attributed, not re-derived.
  The per-member mail counts in §F are **not re-verified this round**.
- **`apps/mobile/`** — untracked, out of scope, unopened.
- **Forge and red-demo** — I measured RED only. Whether forge shows the same 21% no-access rate is
  unknown; `booking_enabled=false` there may change the shape entirely.
- **`/restablecer` and `/activar/contrasena`** — read only as call sites of `actualizarPassword`;
  their own screens and error copy are unexamined.
- **The `code`/PKCE arm of `/auth/confirm`** (`route.ts:122-129`) — traced but not exercised; all
  live evidence is on the `token_hash` arm.

---

## 6. Where this surface is sound (stated with evidence, then ranked anyway)

The gate says honesty outranks severity. Four things I attacked and could not break:

1. **`send-email` v8 is byte-identical live vs repo.** Attributed to
   `docs/FIndings/new-user-xe/01-live-snapshot.md` §A (141 + 214 lines, zero differing lines) —
   **not re-derived this round.** No hook drift.
2. **The `magiclink` type is handled correctly.** I expected `auth/confirm/route.ts:138` to reject
   `type=magiclink` and wedge the entire `cuenta_existente` rail. It does not:
   `tipoOtp` maps `recovery→recovery`, `email_change→email_change`, **everything else → `email`**
   (`supabase/functions/send-email/correo.ts:91-100`), so the route's allow-list is satisfied.
   Hypothesis refuted at HEAD.
3. **Turnstile works on RED's new canonical host.** I expected the 08-28 domain cutover to have
   orphaned `www.redfunctionaltraining.com` from the widget's hostname list, blocking every
   registration. Refuted: four real members (`Oma***`, `And***`, `Alv***`, `mar***`) completed
   `/registro` with `referer: https://www.redfunctionaltraining.com/auth/confirm` between 09-01 and
   09-02, all of which are gated by `verificarTurnstile` before the `signUp`
   (`registro/actions.ts:47-50`). The captcha passes on that host.
4. **The roster's integrity constraints hold.** `clientes_email_gym_uq` (UNIQUE on
   `(gym_id, lower(email)) WHERE email IS NOT NULL`) makes per-gym duplicate emails structurally
   impossible; live duplicate count is **0**, orphan `auth_user_id` count is **0**, and the 10
   canonical RPCs show zero body drift and zero duplicate overloads. Attributed to
   `01-live-snapshot.md` §C/§G; the duplicate scan I **did** re-derive this round
   (only `karen lara` appears twice on RED, both rows email-less — an RT-01 artifact, not a claim
   collision).

Ranked anyway: none of these four change the 21.3% number in §0. A byte-perfect hook that delivers
six indistinguishable mails to a member who has no way to tell them apart is a correct component in
a failing system.

---

## 7. Draft audit — sentences cut or retagged, and the rule that caught each

| Cut / retagged | Rule |
|---|---|
| "Ivan Montañez and Ivan Acuña are the same human, duplicated by the ñ-transliteration bug." **CUT.** Live query returned two distinct names and two distinct phone numbers (`6145294722` vs `6144642930`). | R7 (never invent a finding) — I had a clean narrative and the data said no. |
| "The magic-link rail is dead because `/auth/confirm` rejects `type=magiclink`." **CUT and inverted into §6.2.** `tipoOtp` normalises it. | R5 (cite or drop) — the cite refuted my own claim. |
| "The 08-28 domain cutover broke Turnstile on RED." **CUT and inverted into §6.3.** Four post-cutover signups on that referer. | R4 (the incumbent is a candidate — and so is the accusation) + R5. |
| "5 members hit `email_exists` in 24 h." **RETAGGED to 'all 5 are Marce'.** The timestamps match her five `/activar` presses exactly. | R2 (name the number) — the raw count was true and the implication was false. |
| "25 members failed to log in yesterday." **RETAGGED to 25 attempts, un-attributable.** The AWS source IPs are the app's own server actions. | R2 + R5. |
| "The resend doors' 429 lie is confirmed." **RETAGGED to `modelled — inputs: GoTrue's 60 s floor evidenced live at 28 s/18 s`.** I traced the code but did not reproduce the sequence end-to-end. | R5 (the qualitative premise under a number is its own claim). |
| "Every write on the new-user path times out under a degraded leg." **RETAGGED**: the code paths are measured, the consequence is modelled, and the Vercel function timeout is `unmeasured — CD-5`. | R5. |
| "Supabase handles the rate limiting." **CUT before it was written** — it is exactly the substitution-test phrase R4 forbids. Replaced with `reenvio-limite.ts:12`'s own stated 50/hr, tagged repo-asserted and unmeasured live (CD-1). | R4. |
| "The e2e suite is broken." **RETAGGED with the 6-in-24-h occurrence count** rather than repeating the prior register's qualitative note. | R-prior (reuse requires attribution + fresh derivation). |
