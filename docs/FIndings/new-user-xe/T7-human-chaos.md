# T7 — A real human on a phone

Cross-examination seat T7. Territory: what a normal person does with two thumbs, a
patchy LTE connection, a shared device and an inbox — and what state that leaves in the
browser, `auth.users`, `public.clientes`, `public.gym_membership` and the mail ledger.
Owner question **Q5** is mine; I answer my slice of Q1–Q4, Q6, Q7 explicitly below.

HEAD = `33c9087a`. Every code cite is `file:line` at that commit. Every number is either
a query printed with its output, or tagged. Emails masked to first 3 chars.

---

## 0. The single most useful thing I found, stated first

I came in expecting to confirm the triage's story — that RED's new members are getting
stuck. **The live data does not support "stuck" at the volume the roster suggests, and
the reason it looked that way is itself a defect.**

RED shows 18 `clientes` rows that were mailed an invite and still hold a live
`claim_code`. That reads as 18 stranded members. It is not:

```sql
-- 18 RED rows: invite mail sent, claim_code still live
with atorados as (
  select c.id, c.nombre, c.email, u.id as uid
  from public.clientes c join public.gym g on g.id=c.gym_id
  left join auth.users u on lower(u.email)=lower(c.email)
  where g.slug='red' and c.claim_code is not null and c.invitacion_enviada_at is not null
    and u.id is not null)
select ... from atorados a join public.clientes o on o.auth_user_id = a.uid;
--  → 11 rows; 10 of them with `es_la_misma_fila = true`
```

Ten of those eighteen rows are **already claimed** (`auth_user_id` set) and still carry a
live `claim_code`, because `reclamar_o_crear_cliente` — the verified-email claim rail —
claims the row without ever clearing the code (`supabase/functions-canonical/reclamar_o_crear_cliente.sql:59-65`;
compare `reclamar_por_codigo.sql:67`, which *does* `claim_code = null`). Those ten
members are active and fine. The true "invited and never got in" count for RED is:

| bucket | n | who |
|---|---|---|
| claimed + stale live code (fine, state is lying) | 10 | Kat/Yol/Ayi/Rox/Pao/Mat/Sar/Gen/And/Mar |
| genuine duplicate — two `clientes` rows, one paid+stuck, one claimed | 1 | `Aar***` (the owner's own account) |
| auth account exists, never signed in | 1 | `Ivá***` |
| no `auth.users` row at all — never started | 6 | Ale/Han/Gio/Yad/Cam/Lui |
| **truly not in** | **7 of 61 invites (11%)** | |

I drafted a much louder version of this section (see §Draft audit) and cut it. That
matters for the owner's premise: RED's new-member failure rate is real but it is ~11%,
not ~30%, and it is **not** measurably worse after 2026-08-30. What *is* worse after
2026-08-30 is a code change with a plausible mechanism and no measured effect yet (F-05).

---

## 1. Ranked findings — worst first

Rank is by (irreversibility × how normal the tap sequence is), not by frequency.

---

### F-01 — One tap on a borrowed phone permanently rebinds a paid roster row to the wrong account and destroys the invitee's email

**Severity 5. Basis: measured (code + live counts). Lens: human.**

**Tap sequence.** Mother is signed in to RED on the family phone. Daughter's invite mail
arrives on the same phone (or the mother forwards the link, or the daughter opens her own
mail in the same browser). Tap the `ACTIVAR MI CUENTA` button → `/activar?codigo=XXXXXXXX`
→ `activar/page.tsx:71-79` reads `getClaims()`, sees a live session, and renders
`VincularForm` instead of the email door. One accent-filled, full-width button:
**"Vincular RED a tu cuenta"**. Tap it.

**What the tap does.** `vincularAction` (`apps/client/src/app/activar/actions.ts:115-139`)
verifies Turnstile and calls `intentarReclamoPorCodigo(codigo, null)` at :137 — which mints
the firma server-side and calls the RPC. `reclamar_por_codigo`
(`supabase/functions-canonical/reclamar_por_codigo.sql:60-71`):

```sql
update public.clientes
   set auth_user_id = v_uid,
       email = v_email,                      -- the SESSION's email, not the invitee's
       phone_e164 = coalesce(v_phone, phone_e164),
       terms_accepted_at = now(),
       privacy_accepted_at = now(),
       claim_code = null
 where id = v_cli;
```

There is **no comparison anywhere between the session's email and the coded row's email**.
The only guard is `v_owns` at :54-58 — refuse if the signed-in account already owns a
`clientes` row *in that gym*. A Forge-only member, a coach with two gyms, a parent who
self-registered but never claimed, or anyone whose account belongs to a different tenant
sails straight through.

**Resulting state.** Browser: mother's cookies, unchanged, now redirected to `/reservar`
(actions.ts:138) where the daughter's paid balance is rendered as the mother's.
`auth.users`: unchanged. `clientes`: the daughter's paid row now has
`auth_user_id = <mother>`, `email = <mother's>`, `phone_e164 = <mother's>`, and
`claim_code = NULL`. `gym_membership`: a new `(mother, red, 'member')` row. Mails: none.

**Recoverable without a developer? No.** `claim_code` is gone (so no re-invite:
`preparar_invitacion.sql:26-28` raises `La cuenta ya está activa` on any row with a
non-null `auth_user_id`). The invitee's email is overwritten and cannot be restored to a
value the desk no longer has on screen. `auth_user_id` cannot be nulled from any app
surface — memory `unclaim-cliente-recipe.md` documents four layers that block it, all
still at HEAD. This needs a `postgres`-role UPDATE.

**Compounding: the design says the overwrite is correct.** `supabase/tests/reclamar_por_codigo.sql:72`
seeds the fixture with the comment *"staff typed a different email at the sale"* and V1 at
:151 **asserts** the email is overwritten. So the denial suite is green on exactly the
write that does the damage, and would stay green under any fix that adds an identity
check only in the app tier.

**Live exposure (measured):**
```sql
select count(*) filter (where claim_code is not null and auth_user_id is null) from public.clientes;
-- → 67 unclaimed live codes platform-wide (RED 16, forge 28, forge-demo 6, red-demo 17)
```
Invite codes never expire (ADR-0015 rejected a TTL — prior register P-028/F-44, not
re-derived this round beyond the count above). 67 one-tap hijacks are armed today.

**Breaking point: 1 tap, by a person with no bad intent.** The affordance asymmetry is
the mechanism: the bind is a `bg-accent py-4 font-extrabold` full-width button
(`vincular-form.tsx:170-176`); the escape is `text-[11px] text-muted` plain text at the
bottom of the page (`vincular-form.tsx:182-189`). The #150 guard that shows *whose*
session it is (`vincular-form.tsx:125-133`) is a sentence above a bigger button.

**Unmeasured:** how often this has already happened. No log line records a vincular where
the session email ≠ the row email. **Experiment:** add one `console.warn` in
`vincularAction` comparing `claims.email` to `invitacionInfo`'s row before the claim, run
for 30 days, count. That is also the fix's own detector.

**Fix hint.** Two layers. DB: `reclamar_por_codigo` refuses when
`lower(v_email) is distinct from lower(<row>.email)` unless the caller passes an explicit
`p_confirmar_distinto := true` — the denial suite's V1 then needs a second fixture, which is
the point. App: `VincularForm` renders the invitee's first name and *masked* invite email
and offers two equal-weight choices ("Soy Yolanda" / "No soy Yolanda"), not one primary CTA.

---

### F-02 — A dropped `/activar` submit is a one-way door: the retry can only ever reach the magic-link rail, and the second attempt inside 60 s is Marce's exact error screen

**Severity 5. Basis: measured (code) + modelled (incidence). Lens: partial / stress. Q7's answer.**

**Tap sequence.** Member taps "Activar mi cuenta". The action runs
`iniciarActivacion` → POST to the edge function. Now lose signal, or force-quit, or
background the app past the iOS suspension, or hit a Vercel function timeout — *anywhere
after the edge function's line 92*.

**Why the retry can't work.** `supabase/functions/activar-cuenta/index.ts` is three
sequential non-transactional side effects:

| line | effect | committed where |
|---|---|---|
| :92-95 | `admin.createUser({ email, email_confirm: true })` | **GoTrue, permanently** |
| :105-108 | `admin.generateLink({ type: 'recovery' })` | GoTrue `one_time_tokens` |
| `activacion.ts:124` | `confirmarTokenHash('recovery', ...)` → Set-Cookie | the member's browser |

A cut after :95 leaves the auth user created and the member holding nothing. The next
attempt with the same code re-runs :92, `createUser` fails with `email_exists`,
`esErrorEmailExistente` (`nucleo.ts:133-140`) returns true, the function answers 409
`cuenta_existente`, and `activar/actions.ts:80-95` falls to the magic-link rail. **The
fresh-provision rail is gone for that member forever** — there is no branch that says "this
auth user was provisioned by an activation that never finished, resume it".

**And the retry's own failure mode is the one the owner is already looking at.**
`enviarMagicLink` inside GoTrue's 60 s-per-address floor returns 429
`over_email_send_rate_limit`; `activar/actions.ts:94` maps *every* non-ok send to
`cuentaExistenteFallo`, which renders **"No salió el correo"** (`activar-form.tsx:145-166`).
That is the Marce screen (triage §7 H6 / P-076) reached **without ever visiting `/registro`** —
by nothing more than tapping the button twice on a bad connection.

**Resulting state after the cut.** Browser: no session cookies. `auth.users`: a
confirmed row with no password the member ever chose. `clientes`: untouched
(`auth_user_id` still null, `claim_code` still live — this part is the #126 ordering
working as designed, `activacion.ts:16-21`). `gym_membership`: none. Mails: none from the
first attempt; one "Continúa en tu cuenta" from the retry, or zero if throttled.

**Recoverable without a developer? Partially, and only if the member guesses.** The magic
link works if it arrives and if they open it in the right browser. If it doesn't, the
member's only other doors are `/entrar` (they have no password) and "¿Olvidaste tu
contraseña?" — which does work, but nothing on screen suggests a password reset to
someone who has never set a password. `/codigo` does **not** help: the magic-link mail
prints no 6-digit code (see F-06).

**Live incidence:** `Ivá***` in RED — auth row exists, `last_sign_in_at` null,
`clientes.claim_code` still live, invited 2026-08-31. One row, exactly this shape.
Whether the cause was a dropped submit or an abandoned tab is **unmeasured** —
`auth.audit_log_entries` is empty (P-089, re-confirmed: the live-snapshot §G read 0 rows)
and the log stream holds 24 h.

**Breaking point.** One interrupted request between `index.ts:95` and
`activacion.ts:125` — a window that spans a network round trip, a JSON parse and a second
GoTrue call. Under Q7's "every await takes 30 s", the window is ~90 s wide and the member
will certainly have tapped again.

**Fix hint.** In the edge function, when `createUser` returns `email_exists`, look up
whether that user has ever set a password / has any `identities` with a password factor,
and if the roster row is still unclaimed and the emails match, treat it as a **resume**:
mint the recovery link anyway. That is the same inbox-proof posture, because the invite
mail already proved the inbox. Failing that, at minimum stop mapping 429 to "no salió el
correo" (triage code-fix #1 / P-078, still unfixed at HEAD — `actions.ts:94`).

---

### F-03 — `reclamar_o_crear_cliente` never clears `claim_code`, so 23% of RED's active members carry a live invite code and the roster's "pending" state is a lie

**Severity 4. Basis: measured. Lens: drift. NEW this round.**

`reclamar_por_codigo.sql:67` sets `claim_code = null`. `reclamar_o_crear_cliente.sql:59-65`
— the email rail, which is what fires from `/auth/confirm` (`route.ts:95`) and from
`/reservar`'s self-heal (`reservar/page.tsx:65`) — does not:

```sql
update public.clientes
   set auth_user_id = v_uid,
       phone_e164 = coalesce(v_phone, phone_e164),
       terms_accepted_at = now(), privacy_accepted_at = now(),
       privacy_aviso_version = p_aviso_version
 where id = v_cli and auth_user_id is null;     -- no `claim_code = null`
```

**Measured, live:**
```sql
select count(*) filter (where claim_code is not null and auth_user_id is not null) from public.clientes;
-- → 10   (all 10 are RED; 10 / 43 claimed RED members = 23%)
```

**Consequences, in order:**

1. **Any count of "invited but not activated" is wrong by 10 rows** for RED. That is why
   the roster read 18 stranded members when 7 are stranded. Every dashboard, alert and
   human triage that keys on `claim_code is not null` inherits the error — including the
   `registros_atorados` alert (`supabase/tests/registros_atorados.sql`, not read this round).
2. **`invitacion_info` does not filter on `auth_user_id is null`**
   (`supabase/functions-canonical/invitacion_info.sql:1-4`): `where c.claim_code = p_codigo`,
   nothing else. So the stale code still resolves a live invite banner. ADR-0015 accepted
   bearer disclosure of *an unclaimed invitee's* first name + gym; it did not accept
   permanent disclosure of an **active member's** name to anyone holding an old mail.
3. **The stale code renders a dead-end primary button.** A signed-in member opening their
   own old link gets `VincularForm` (page.tsx:73 gates on `codigo && invitacion`, and
   `invitacion` is non-null), taps "Vincular RED a tu cuenta", and `reclamar_por_codigo`
   refuses at :44-51 (`auth_user_id is null` is in the WHERE). The refusal is swallowed by
   `intentarReclamo` (`registro.ts:323-330`) and the member is redirected to `/reservar`
   (actions.ts:138) with no feedback at all. Nothing breaks; nothing is explained either.

**Recoverable without a developer?** For the member, yes — nothing is broken for them.
For the operator's *view of the world*, no: there is no desk control that clears a
`claim_code`, and `preparar_invitacion` refuses the row outright (`:26-28`).

**Breaking point: 10 rows today, growing by one per member who claims by email rather
than by code.** Since `/auth/confirm`'s plain-signup arm and `/reservar`'s self-heal both
use the email rail, that is the *majority* path.

**Fix hint.** One line in `reclamar_o_crear_cliente`: add `claim_code = null` to the
UPDATE at :59-65. Guard it with an assertion in `supabase/tests/registro_claim.sql` on the
written row (the AGENTS.md rule: assert the rows written, not the return value).

---

### F-04 — `/entrar` and `/registro` bounce every live session to `/reservar`, so the second person on a shared phone cannot reach a login form and ends up spending the first person's classes

**Severity 4. Basis: measured (code). Lens: human. Part of Q5.**

`apps/client/src/app/entrar/page.tsx:36-41` and `registro/page.tsx:34` both:

```ts
const { data } = await supabase.auth.getClaims();
if (data?.claims?.sub) redirect(destinoClases(...));   // entrar
if (data?.claims?.sub) redirect("/reservar");          // registro
```

**Tap sequence.** Two members share a phone (a couple, a mother and daughter, a coach
using the front-desk iPad). A is signed in. B opens `red.ibookit.lat`, taps the header's
"Entrar" affordance (`layout.tsx:107` → `PublicHeader`), and lands **inside A's app**. B
taps "Registrarme" — same thing. There is no login form B can reach.

**Where the sign-out actually lives.** Three call sites, all `scope:'local'` (good — P-010
re-derived at HEAD, `grep -rn signOut` returns exactly `logout-button.tsx:30`,
`vincular-form.tsx:61`, `cerrar-sesion-link.tsx:28`, `perfil-overlay.tsx:396`):

| site | reachable when |
|---|---|
| `perfil-overlay.tsx:394-404` | only from `/reservar`'s avatar → drawer → scroll; requires the session to HAVE a membership |
| `cerrar-sesion-link.tsx:28` | only inside `SinMembresia`, i.e. only when the session does NOT have a membership |
| `vincular-form.tsx:61` | only on `/activar?codigo=` with a valid unclaimed code |

So the two escape hatches are mutually exclusive by construction, and neither is on a
public page. From the marketing home, `/entrar`, `/registro`, `/precios` or `/contacto`,
a shared-device user has **zero** ways to sign out.

**Resulting state.** B, believing the app is theirs, taps a class and books it.
`reservar_clase` runs against A's `cliente_id`. Browser: unchanged. `clientes`: A's
`clases_restantes` decremented. `reservation`: a row for A on a class B will attend, or
neither will. Mails: none. **Recoverable without a developer:** the booking can be
cancelled from the sheet (memory `cancel-booking-in-sheet.md`), so yes — *if* anyone
notices. Nothing flags it.

**Breaking point: 2 people, 1 phone, 0 public sign-out affordances.**

**Fix hint.** `/entrar` should not bounce blind: render the form with a small
"Estás dentro como `a***@gmail.com` — continuar, o entrar con otra cuenta" chooser,
matching the shape `VincularForm` already got in #150. That is one screen, not a redesign.

---

### F-05 — Invite links stopped carrying the member's email on 2026-08-30, so every invited member now has to retype the exact address the desk typed for them

**Severity 4. Basis: measured (git) + honest negative on the outcome data. Lens: drift. Q1 candidate.**

```
$ git log --format='%h %ad %s' --date=short -S "pre-fill DISPLAY param" -- packages/data/src/server/invitaciones.ts
afd7a5d5 2026-08-30 feat(auth): shield wave 1 — resend door, honest registro, instrumented confirm, OTP rail, wedge detection
```

`packages/data/src/server/invitaciones.ts:151-155` now says the `?correo=` param was cut
(URL-history / referrer / mail-log exposure — a defensible security call). The link is
`https://<host>/activar?codigo=XXXXXXXX` (`construirUrlInvitacion:140`).

**What that does to the screen.** `ActivarForm` takes `correo` from
`activar/page.tsx:38` (`sp.correo`), which is now always absent, so it renders the
**typed-input branch** (`activar-form.tsx:232-255`) instead of the read-only branch
(:223-231). The member must produce, from memory, the address a desk operator typed for
them — possibly weeks earlier, possibly with a typo, possibly an address they don't
consider "theirs" (the RED roster has invite emails whose local part does not match the
member's name at all: `Mar***`→`oli***`, `Rox***`→`lac***`, `Gen***`→`Oma***`,
`Mat***`→`a36***@uach.mx`).

**The mismatch is a dead end.** `iniciarActivacion` → edge `decidir` (`nucleo.ts:121`) →
`email_no_coincide` → `activar/actions.ts:73-77`: *"Ese correo no coincide con el que
registró tu gimnasio. Verifícalo con tu gimnasio."* No resend, no "usar otro correo", no
contact link, no `login: true` flag (contrast :100, which at least offers `/entrar`).
Uppercase and whitespace are handled correctly on both sides
(`activacion.ts:81-82`, `nucleo.ts:39-41`), so this is purely *the wrong address*, not
formatting. iOS autofill offering the member's iCloud Hide-My-Email alias, or a Google
account address they never gave the gym, produces exactly this screen.

**Honest negative on the outcome data.** I expected this to show up as a post-08-30
activation cliff. Corrected for F-03's stale codes, it does not:

| invites sent | n | truly not in | rate |
|---|---|---|---|
| 2026-08-05 → 08-29 | 31 | 5 | 16% |
| 2026-08-30 → 09-01 (≥24 h old) | 8 | 2 | 25% |

n=8 on the post-cut side. **This does not establish a regression.** The mechanism is real
and cited; the effect is unmeasured. **Experiment that would settle it:** log
`email_no_coincide` at `activar/actions.ts:73` (nothing logs it today) and count over 30
days against the same window's invite volume.

**Fix hint.** Keep the email out of the URL; put it back on the *screen*. `/activar` can
call `invitacion_info` (already does, page.tsx:39) — extend that RPC to return a **masked**
invite email (`o•••@g•••.com`) so the member is reminded which address to type without the
plaintext ever entering a URL. That is a 2-line SQL change and one JSX line.

---

### F-06 — Six identical "Confirma tu cuenta" mails with no timestamp, and the one escape hatch is printed on the one mail type that least needs it

**Severity 4. Basis: measured (code). Attribution: prior register P-080/P-087 (marce-triage §3, code-fix #3); re-derived at HEAD. Lens: human.**

`supabase/functions/send-email/correo.ts:109-144` — three fixed subjects, chosen purely by
`emailActionType`:

| action type | subject |
|---|---|
| `signup` | **"Confirma tu cuenta"** |
| `recovery` | "Restablece tu contraseña" |
| everything else, incl. `magiclink` | "Continúa en tu cuenta" |

`construirCorreoAuth` (:151-193) builds a body with no date, no sequence number, no
"este enlace reemplaza al anterior". Six signup mails in one inbox are byte-identical
except for the URL, and only the newest works — GoTrue's `one_time_tokens` is
`UNIQUE(user_id, token_type)` (P-021/P-056). Sorting a Gmail thread by "newest" is not a
skill this cohort has.

**The escape hatch is mis-targeted.** `bloqueCodigo` (`correo.ts:90-91`):

```ts
if (emailActionType !== "signup" || !/^\d{6}$/.test(token)) return null;
```

So the 6-digit code that `/codigo` redeems (`codigo/actions.ts:27-40`,
`sesion.ts:254-266` → `verifyOtp({ type: 'email' })`) is printed **only** on signup mail.
The rails that actually break are the other two:

- the **magic-link** rail (`activar/actions.ts:87-90`) — single-use, prefetch-burnable,
  webview-jar-trappable, and the *only* way back in for an F-02 victim → **no code**;
- the **recovery** rail — the only way in for anyone who never set a password → **no code**.

The gating comment at `correo.ts:83-86` gives the reason: a bare OTP on the magiclink rail
would establish a session that skipped the `codigo`+`firma` claim ("the AR-11 empty-cliente
shape"). That reason is sound *and* it is exactly the wedge: the fix is not to remove the
gate but to make `/reservar`'s self-heal reliable enough that a claim-less session is
harmless — which it nearly is (`reservar/page.tsx:59-68`), except that the self-heal is
gated on `getEsMiembro`, which is broken (see F-08).

**Recoverable without a developer?** For signup mail, yes (`/codigo`). For magic-link and
recovery mail, **no** — the member's only move is to request another mail, which is
throttled and which invalidates the one they hold.

**Fix hint.** Put the send time in the body of every auth mail ("Enviado el 2 de
septiembre a las 19:25 — usa siempre el correo más reciente"). Then either print the code
on `magiclink` too and have `/codigo`'s success path run `intentarReclamoPorEmail` (it
already lands on `/reservar`, which tries), or add a `?codigo=`-carrying variant of the
`/codigo` form.

---

### F-07 — Self-registering under a different address mints a second `clientes` row at zero classes, and the invite link then refuses to repair it

**Severity 4. Basis: measured (code + 1 live instance). Lens: human. Prior: P-009/P-046, re-derived at HEAD.**

**Tap sequence.** Member paid at the desk; the operator typed `oli***@gmail.com`. The
member never opens that inbox, finds the app themselves, and registers at `/registro` with
`maria***@gmail.com`.

**What happens.** `/auth/confirm`'s plain-signup arm (`route.ts:88-96`) →
`intentarReclamoPorEmail` → `reclamar_o_crear_cliente.sql:50-52` counts unclaimed rows
whose `lower(email)` equals the verified email. `v_n = 0`, so :74-86 runs the INSERT:

```sql
insert into public.clientes (..., clases_restantes, ...) values (p_gym_id, v_uid, ..., 0, ...);
```

The member is now a member of RED with **zero classes** and a paid row sitting beside
them, unclaimed.

**And the repair path is closed.** They eventually find the invite mail and open
`/activar?codigo=`. `reclamar_por_codigo.sql:54-58`:

```sql
select count(*) into v_owns from public.clientes where gym_id = v_gym and auth_user_id = v_uid;
if v_owns > 0 then raise exception 'Ya tienes cuenta en este gimnasio'; end if;
```

Refused. Via `vincularAction` the refusal is swallowed and they are silently redirected to
`/reservar` (actions.ts:137-138) — the same zero-class screen, no message. Via the
email door, the edge function answers `ya_reclamado`? No — the row is still unclaimed, so
`decidir` returns `email_no_coincide` (`nucleo.ts:121`) and they get F-05's dead-end copy.

**Resulting state.** Two `clientes` rows in RED for one person: one paid, unclaimed, code
live; one claimed, empty. `gym_membership`: one row. **Recoverable without a developer:**
only through `docs/runbooks/duplicate-member-merge.md`, whose delete-before-repoint step
cascades child rows (P-047, not re-derived this round — tagged **unverified this round**).

**Live:** `Aar***` — the owner's own account — is in exactly this state (paid+stuck row
with 1 venta invited 2026-09-01, plus a claimed row from 2026-05-07 with 3 ventas and 6
classes). Also 2 RED rows are claimed with zero ventas and zero classes
(`Jos***` 2026-08-25, `Edg***` 2026-08-31) — the INSERT-branch signature; I could **not**
prove either is a duplicate of a paid row (no name collision found), so I am not counting
them.

**Breaking point: one address the member likes better than the one the gym has.**

**Fix hint.** When `reclamar_o_crear_cliente` is about to INSERT and the gym has an
unclaimed row with a matching `phone_e164` or a matching name, do not insert — return a
`posible_duplicado` flag and let `/auth/confirm` land the member on a "¿eres tú? confirma
con tu gimnasio" screen instead of a silently empty app.

---

### F-08 — Every mailed link is spent on a GET, and the self-heal that is supposed to catch the fallout is gated on a membership check with no gym filter

**Severity 3. Basis: measured (code). Attribution: P-020/P-035/P-057/P-109 (link burn) and P-003/P-007/P-053 (`getEsMiembro`); both re-derived at HEAD. Lens: human / partial.**

Two halves.

**(a) The link is consumed by whoever GETs it first.** `apps/client/src/app/auth/confirm/route.ts`
redeems on a plain `GET`: `confirmarCodigo(code)` at :124, `confirmarTokenHash(tipo, tokenHash)`
at :142. A corporate mail scanner, an iOS/macOS link preview, a Slack/WhatsApp unfurl, or a
double-tap on a slow phone burns it and the member gets `?error=token-rechazado`
(:146) at `/entrar`. The route's own comment block (:34-37) is honest that this is the
2026-08-30 failure it was instrumented for.

**(b) The self-heal is the wrong shape.** `/reservar` re-runs `intentarReclamoPorEmail`
only when `getEsMiembro` is false, and `getEsMiembro`
(`packages/data/src/server/agenda-miembro.ts:139-143`) is:

```ts
const { data } = await supabase.from("gym_membership").select("gym_id").limit(1).maybeSingle();
return data != null;
```

**No gym filter.** Any membership in any gym makes it true. So a Forge member who lands on
RED with a live session — or an F-01 victim, or a coach with two gyms — never gets the
self-heal, `esMiembro` is true, and `/reservar` renders RED's week against a `clientes`
row that does not exist in RED. Live incidence of multi-gym users today: **1**
(`select n, count(*) from (select user_id, count(*) n from gym_membership group by 1) group by 1`
→ `{1: 56, 2: 1}`), so this is armed but barely loaded.

**Recoverable without a developer?** (a) yes — `/codigo` for signup mail, resend for the
rest, though see F-06. (b) yes, by signing out — but only via the two mutually-exclusive
sign-out affordances of F-04.

**Fix hint.** `getEsMiembro` takes the request's gym and filters on it — the same
`slugDelHost` every other member reader already resolves (`reservar/page.tsx:71-76`
describes the convention it is violating). One `.eq("gym_id", ...)`.

---

### F-09 — Opening the mail in Gmail's in-app browser puts the session in a jar the member's real browser never sees, and the copy points at the wrong axis

**Severity 3. Basis: modelled (platform behaviour) + measured (code, hosts). Lens: human.**

`/auth/confirm` sets `__Host-sb-auth-token` (`packages/data/src/cookie-options.ts:36`) in
whatever browser executed the GET. On iOS, Gmail, Outlook, Instagram and WhatsApp all open
links in an embedded `WKWebView` with its own cookie store. The member sees `/reservar`,
believes they are in, closes the mail app, opens Safari — and gets `/entrar`. The link is
single-use, so re-opening it from the mail is already dead (F-08a).

The `cuentaExistente` screen makes it worse by naming the wrong thing
(`activar-form.tsx:136`): *"Ábrelo desde este **dispositivo** para entrar directo a tu app."*
Device is the axis that is *fine*; **browser** is the axis that breaks. A member who
follows this instruction literally does exactly the failing thing.

**RED also has two member origins with disjoint `__Host-` jars.** Live-snapshot §D:
`red.ibookit.lat` (client) and `www.redfunctionaltraining.com` (client, `es_principal=true`).
Invite mail targets the principal (`invitaciones.ts:128-140` orders `es_principal desc`),
so a member who bookmarked or previously signed in on `red.ibookit.lat` gets a session on
the *other* origin. There is no canonical-host redirect anywhere in `proxy.ts` (read at
HEAD, lines 99-190 — it stamps `x-gym`/`x-brand` and rotates cookies; no host
normalisation). Prior register P-030, re-derived at HEAD.

**Recoverable without a developer?** Only via the 6-digit code — which, for the magic-link
rail this screen belongs to, is not printed (F-06). So for the `cuenta_existente` cohort:
**no**.

**Fix hint.** Change the sentence to name the browser ("Ábrelo en Safari o Chrome, no
dentro de la app de correo"), and print the code on this mail type.

---

### F-10 — `entrarAction` never checks that the password is non-empty, and `activar-cuenta` creates users without one

**Severity 3. Basis: modelled — I did not and will not verify this against live accounts. Lens: general / Q6.**

`supabase/functions/activar-cuenta/index.ts:92-95` calls
`admin.createUser({ email, email_confirm: true })` with **no `password`**. The password is
set later, at `activacion.ts:161` (`completarActivacion`), which an F-02 cut skips entirely.

`apps/client/src/app/entrar/actions.ts:30-34` passes the form field through unguarded:

```ts
const result = await iniciarSesion(
  String(formData.get("email") ?? ""),
  String(formData.get("password") ?? ""),
  supabase);
```

and `sesion.ts:59-62` does `signInWithPassword({ email, password: password.trim() })`.
`validarPasswordRequerida` (`auth-validacion.ts:24-27`) is **client-side only**, and Server
Functions are directly POST-reachable (a fact `registro/actions.ts:16-17` and
`activar/actions.ts:108-109` both state explicitly for other reasons).

So the question is: does GoTrue's `admin.createUser` with no password store an *unusable*
hash, or `bcrypt("")`? If the latter, a direct POST with `password=""` signs in as any
account provisioned by `activar-cuenta` that never finished.

**What I measured, which does not settle it:**
```sql
select coalesce(length(encrypted_password),-1) as len, count(*) from auth.users group by 1;
-- → [{"len":60,"count":61}]
```
All 61 live users carry a 60-char bcrypt hash and **none** is null or empty. That is
consistent with *both* "everybody set a password" and "GoTrue hashes the empty string
unconditionally". I am not going to distinguish them by attempting a login against a real
member's account.

**Experiment that settles it:** `supabase start` locally, `admin.createUser({email, email_confirm:true})`,
then read `encrypted_password`, then `signInWithPassword({email, password:''})`. Ten
minutes, zero production risk. Memory `local-docker-denial-path.md` documents the stack.

**Fix hint regardless of the answer:** one line in `entrarAction` —
`if (!password) return { status: "error", error: "Escribe tu contraseña." }`. Defence in
depth costs nothing here and the client already renders that exact string.

---

### F-11 — The entire `/activar` app tier has zero tests, in either gate

**Severity 3. Basis: measured. Lens: regression. Q6's answer.**

```
$ find apps/client/src/app/activar apps/client/src/app/registro apps/client/src/app/entrar apps/client/src/app/codigo -name "*.test.*"
(nothing)
$ find apps/client/src -name "*.test.*"
apps/client/src/app/auth/confirm/route.test.ts
apps/client/src/lib/{auth-validacion,aviso-legal,brand,ics,reserva-vista,token-overrides,turnstile}.test.ts
apps/client/src/proxy.test.ts
```

Eight server actions on the member's four doors — `activarAction`, `vincularAction`,
`activarContrasenaAction`, `registrarAction`, `entrarAction`, `resetAction`,
`reenviarAction`, `codigoAction` — have **no vitest at all**. The DAL under them is
covered (`packages/data/src/server/{activacion,registro,sesion}.test.ts`), the route above
them is covered, the actions themselves are not. `pnpm test` cannot see any of the
branching in this document.

The e2e suite that could see it (`apps/client/e2e/signup.spec.ts`, 3 tests) is
convention-gated, not in CI or pre-commit, and **skips silently on unset credentials**
(AGENTS.md; prior register P-001/P-005). Per the triage, `signup.spec.ts` currently cannot
pass at all against a host GoTrue clamps (P-083) — unverified this round.

**The most plausible one-line change that breaks a guarantee with all tests green**
(Q6, ranked):

1. **`activar/page.tsx:78`** — delete `sesionEmail = claims?.claims?.email ?? null`, or
   drop the `email` prop at :85. `VincularForm` renders "Ya iniciaste sesión." with no
   address (`vincular-form.tsx:125-133` handles `null` gracefully), and the #150 guard —
   the *only* thing standing between F-01 and a silent bind — is gone. Nothing fails.
2. **`agenda-miembro.ts:141`** — someone "optimising" `getEsMiembro` to `.select('gym_id')`
   already has no gym filter; the inverse, someone adding a filter, would *fix* it. The
   one-liner that breaks something new is adding `.limit(1)` to the *`clientes`* reads.
3. **`registro.ts:149`** — remove the `enEsperaReenvio` short-circuit "because GoTrue
   throttles anyway". Every double-tap on `/registro` then rotates the member's live
   confirmation link (P-021/P-056). No test covers it.
4. **`entrar/page.tsx:36`** — someone adds `/entrar` to the list of pages that *don't*
   bounce, to fix F-04, and simultaneously removes the bounce that stops the 465dcf4
   session-blind regression. `session.spec.ts` covers that one — but only if run.

---

### F-12 — There is no PWA today, and that is what keeps mail-link logins working. Adding one is a one-line change.

**Severity 2. Basis: measured. Lens: human. This is a soundness verdict with a trigger, not a defect.**

```
$ grep -rn "manifest|apple-mobile-web-app|standalone|start_url" apps/client/src apps/client/public
(only two unrelated hits: a doc comment and icon.tsx)
```

`apps/client/src/app/layout.tsx` exports `generateMetadata` (:19-25) with title +
description and nothing else; there is no `manifest` field, no `apple-mobile-web-app-capable`
meta, no `public/manifest.json`, no service worker. **Consequence: "Add to Home Screen" on
iOS produces a webclip that opens in Safari and shares Safari's cookie jar, and on Android
a shortcut that opens in Chrome.** A session established by a mail link in the default
browser is therefore visible to the home-screen icon. That is the correct behaviour for
this product and it is currently free.

**Exit trigger (digit-bearing): the day a `manifest.json` with `"display": "standalone"`
or an `apple-mobile-web-app-capable` meta lands in `apps/client`, 1 line is enough to give
iOS webclips a separate cookie store, and every mail-link login lands outside the installed
app.** If that ships, the OTP rail (F-06) stops being a nice-to-have and becomes the only
door. Re-open this finding at that commit.

---

## 2. The owner's questions, by number

**Q1 — where are all the drifts (my territory's share).**
One code drift on the member's own path, dated: `?correo=` was removed from invite links
on 2026-08-30 (`afd7a5d5`), turning `/activar` from a read-only-email confirmation into a
from-memory typing test (F-05). One *data* drift that has been accumulating silently since
the email claim rail existed: `reclamar_o_crear_cliente` never clears `claim_code`, so 10
of RED's 43 active members look pending (F-03) — this is why the roster reads worse than
it is. **I did not find a change that makes activation fail more often after 08-30 in the
outcome data**: corrected for F-03, 5/31 pre-cut invites and 2/8 post-cut invites are
truly not in (16% vs 25%, n=8). Say the honest thing to the owner: the elevated *feeling*
is partly F-03's bookkeeping error.

**Q2 — weak spots that would actually pop.**
F-01 (one tap, irreversible, 67 codes armed) and F-02 (a dropped submit downgrades the
member permanently). Both are single-interaction, both are silent, both need a
`postgres`-role fix afterwards.

**Q3 — stressed to the top.** Not my seat's axis, but the human-facing consequence is
F-02 widening: under load, more requests get cut between `createUser` and the Set-Cookie,
so more members fall onto the magic-link rail, which is throttled to 1 mail/60 s/address by
GoTrue and to 1/5 min + 5/day by `reenvio-limite.ts:31-33` — and `reenvio-limite` is
**per-serverless-instance memory** (:22-29 says so explicitly), so at scale it is N warm
instances × the rate, and the real ceiling is the shared 50/hr project auth-mail bucket
(P-069). The member-visible symptom is "No salió el correo" for everyone at once.

**Q4 — three months idle.** Invite codes never expire (67 live today), so a code mailed
today is still a valid one-tap bind in December — including F-01's. GoTrue's
`otp_expiry` is 3600 s (local-dev value, `config.toml`; live **unmeasured**, live-snapshot
§H), so every mailed *link* is dead but every mailed *code* is live. The asymmetry is the
trap: a member who returns after three months finds their invite mail, taps, and gets
`ya_reclamado` or a silently-refused vincular, with no explanation and no re-invite path
(`preparar_invitacion.sql:26-28` refuses claimed rows).

**Q5 — corrupting your own data as a normal human. This is my seat's answer, in order:**

| # | tap sequence | state left | app can recover? | branch |
|---|---|---|---|---|
| 1 | signed-in phone + someone else's invite link + 1 tap | wrong `auth_user_id`, invitee's `email`/`phone_e164` overwritten, `claim_code` gone, extra `gym_membership` | **no** — needs `postgres` | `activar/page.tsx:73-79` → `actions.ts:137` → `reclamar_por_codigo.sql:60-71` |
| 2 | lose signal / force-quit mid-`/activar`, retry | `auth.users` row created, no session, roster row untouched; every future attempt is magic-link only | partly — reset password, if they guess | `activar-cuenta/index.ts:92-95` before `activacion.ts:124` |
| 3 | shared phone, second person taps "Entrar" | bookings + balance spent on the first person's row | yes, if noticed (cancel in sheet) | `entrar/page.tsx:36-41`, `registro/page.tsx:34` |
| 4 | register at `/registro` with a different address | 2 `clientes` rows, 0 classes shown, invite link refuses | no — desk merge runbook | `reclamar_o_crear_cliente.sql:74-86` + `reclamar_por_codigo.sql:54-58` |
| 5 | double-tap the emailed link / mail scanner GETs it | token spent, `?error=token-rechazado` | signup mail: yes (`/codigo`). magic-link / recovery: **no** | `auth/confirm/route.ts:124,142` + `correo.ts:90-91` |
| 6 | open the mail in Gmail's in-app browser | session in the webview jar; real browser still signed out; link now dead | no, for the magic-link cohort | `cookie-options.ts:36` + `activar-form.tsx:136` |
| 7 | resubmit `/registro` while impatient | previous confirmation link rotated away; 6 identical mails | yes (`/codigo`), if they find the newest | `registro.ts:149,177` + `correo.ts:112` |
| 8 | autofill an iCloud alias / a different Google address at `/activar` | nothing written; dead-end error screen with no next step | no next step offered | `nucleo.ts:121` → `activar/actions.ts:73-77` |
| 9 | uppercase / trailing space in the email or password | **nothing** — normalised on both sides | n/a — this one is sound | `activacion.ts:81-82`, `nucleo.ts:39-41`, `registro.ts:37`, `sesion.ts:46-52` |
| 10 | double-tap a submit button | **nothing** — every form is `disabled={pending}` | n/a — sound | `activar-form.tsx:283`, `vincular-form.tsx:172`, `registro-form.tsx:439`, `entrar-form.tsx:317`, `restablecer-form.tsx:94`, `activar-contrasena-form.tsx:170` |
| 11 | member re-invited after being un-claimed | `preparar_invitacion` refuses while `auth_user_id` is set; nulling it doesn't log the device out | no — memory `unclaim-cliente-recipe.md`, P-068, **unverified this round** | `preparar_invitacion.sql:26-28` |
| 12 | Add to Home Screen | shares the browser jar today (see F-12) | n/a — sound today | no manifest exists |

Rows 9, 10 and 12 are the honest "this is sound" answers, with evidence, per M2.

**Q6 — the one-line change.** Ranked in F-11. My pick: deleting `sesionEmail` at
`activar/page.tsx:78`. It is a plausible cleanup ("why do we read `email` off claims here,
we don't use it for authz"), it removes the sole guard against F-01, nothing under
`apps/client/src/app/activar` has a test, and the e2e suite skips itself when credentials
are unset.

**Q7 — every await 30 s, every network call fails halfway.** Three operations end broken:

1. `activar-cuenta` (`index.ts:92 → 105 → activacion.ts:124`) — three uncoordinated side
   effects, permanent downgrade on a cut. **F-02.**
2. `completarActivacion` (`activacion.ts:161 → 166`) — password committed, claim not. The
   member has a password and no membership; the code is still live. `/reservar` self-heals
   *unless* they belong to another gym (F-08b), and they never see a redirect because the
   action never returns.
3. `enviarInvitacion` (`invitaciones.ts:222-249`) — `preparar_invitacion` mints and
   persists the code, `transport.send` is bounded at 10 s (`:58`), and
   `marcar_invitacion_enviada` at :248 is best-effort. A cut between the send and the stamp
   leaves a mailed invite that the desk believes was never sent — and the operator's resend
   mails a *second* copy of the same code. Combined with F-06's identical subjects, that is
   how one member ends up with six mails.

Contrast, and it is worth saying: `/auth/confirm`'s `finalizarAuth` (`route.ts:64-104`)
and every `intentarReclamo*` call (`registro.ts:323-330`) are correctly built for this —
a refusal is a value, the member reaches the app regardless, and the RPCs are idempotent.
The failure modes above are all in the three places that are *not* on that ceremony.

---

## 3. Keep-verdicts

| what | verdict | exit trigger |
|---|---|---|
| Double-submit protection on all 6 auth forms (`disabled={pending}` + single-use Turnstile) | **keep** | Re-open if any auth form ships without `disabled={pending}`, or if the Turnstile widget's single-use token stops forcing the `window.location.reload()` retry (`activar-form.tsx:152-160`) — i.e. **1** form regressing |
| Email/password trim parity across set + verify (`registro.ts:37`, `sesion.ts:46-52`, `activacion.ts:81-82`, `nucleo.ts:39-41`) | **keep** | Re-open if the count of trim/lowercase sites diverges from **4** — one site normalising differently is the whole bug |
| No PWA manifest (F-12) | **keep, deliberately** | The commit that adds `"display":"standalone"` or `apple-mobile-web-app-capable` — **1** line |
| `intentarReclamo*` never-strand ceremony (`registro.ts:308-376`) | **keep** | Re-open if a 6th door starts calling `reclamarCliente`/`reclamarPorCodigo` directly instead of through the ceremony — today it is **5** doors, all routed |
| `signOut({ scope: 'local' })` at all 4 call sites | **keep** | Re-open at the **1st** `signOut()` with no scope argument (P-010's lived incident) |
| Invite codes with no TTL (ADR-0015) | **undecided** — is a never-expiring one-tap bind acceptable now that F-01 exists? Owner must answer; the security premise ("holding the code reveals a first name") was priced before the vincular short-circuit shipped | — |
| `reclamar_por_codigo` overwriting `clientes.email` with the session's email | **undecided** — the denial suite asserts it as correct (`supabase/tests/reclamar_por_codigo.sql:151`) and it genuinely fixes the "desk typed the wrong address" case. Owner must rule whether the fix is an identity check or an explicit operator confirmation | — |

---

## 4. Could not determine

| question | experiment |
|---|---|
| Does GoTrue's `admin.createUser` without a password store `bcrypt("")`, making an empty-password direct POST to `entrarAction` a valid login? (F-10) | Local `supabase start`; `admin.createUser({email, email_confirm:true})`; read `auth.users.encrypted_password`; then `signInWithPassword({email, password:''})`. Never against live. |
| How often has F-01 already fired — a vincular where the session email ≠ the coded row's email? | Add one structured `console.warn` in `vincularAction` before `intentarReclamoPorCodigo` comparing `getClaims().email` to `invitacionInfo`'s row; 30 days. |
| Did the 2026-08-30 `?correo=` cut actually raise the `email_no_coincide` rate? (F-05) | Nothing logs `email_no_coincide` today (`activar/actions.ts:73`). Add a log line; count against invite volume for 30 days. |
| Has a mail scanner or link preview ever burned a RED link? (F-08a) | Turn on Resend click tracking (currently off — P-085) and correlate `confirm-fallo` `motivo:token-rechazado` lines against click timestamps. Both sides are currently blind. |
| Which of RED's 6 no-auth-account invitees never clicked vs clicked and bounced? | Same: click tracking. `auth.audit_log_entries` is empty (0 rows, live) and the log stream holds 24 h, so there is no retrospective answer. |
| Do the two RED zero-venta claimed rows (`Jos***`, `Edg***`) duplicate an existing paid row under another address? | Ask the RED operator to eyeball both names against the roster; the DB has no phone or name collision to join on. |
| Whether `pnpm test:denial` and `pnpm test:e2e` are green at HEAD | Not run this round (read-only mandate + no scratch PAT). Both are convention gates, not CI. |

---

## 5. Blind spots

- **I never ran the app.** No browser, no device, no Playwright. Every tap sequence above
  is derived from source, not observed. The Turnstile widget's behaviour under a real
  double-tap, the exact iOS webview cookie semantics, and whether `VincularForm`'s
  "No soy yo" is visible above the fold on a 375 px viewport are all reasoned, not seen.
- **I did not read `apps/mobile/`** (untracked at session start) — if the native shell
  handles auth links, F-09 and F-12 change shape entirely.
- **I did not diff the live `activar-cuenta` edge function against the repo.** Live is v3,
  updated 2026-08-06 (live-snapshot §A); the repo file is what I read. F-02 assumes they
  match. `send-email` v8 *was* diffed byte-identical by the gatherer; `activar-cuenta` was not.
- **I did not read the admin ficha's invite-state UI**, so F-03's claim that the operator's
  view is wrong is inferred from `claim_code` semantics, not from the rendering code.
- **I did not read `registros_atorados.sql`** or the alert that consumes it, so I cannot
  say whether F-03 corrupts the wedge alert or whether that alert already filters on
  `auth_user_id`.
- **I did not exercise any auth flow against live**, deliberately: no logins, no OTP
  redemptions, no writes. Every live query in this document is a `SELECT`.
- **Rate limits, OTP expiry, redirect allow-list and the Site URL are all dashboard-only**
  and remain unmeasured (live-snapshot §H). F-02's "60 s floor" and Q4's "3600 s OTP" are
  `config.toml` local-dev values, not live truth.
- **`docs/runbooks/duplicate-member-merge.md` was not opened this round** — F-07's recovery
  claim rests on P-047 and is tagged unverified this round.

---

## 6. Draft audit — what I cut or retagged, and the rule that caught it

1. **Cut: "RED's post-08-30 invites are failing at 86% vs 39% before."** I had this as the
   headline drift. It came from counting `claim_code is not null` as "not activated". F-03
   proves ten of those rows belong to active members. Corrected to 16% → 25% on n=8, which
   establishes nothing. *Rule 7 (M2 honesty outranks severity) and Rule 2 (name the
   number).* This retraction is the reason F-03 exists as a finding at all.

2. **Cut: "18 RED members are stranded."** Same defect, same correction — 7.
   *Rule 5 (cite or drop): the query I first ran didn't join `auth.users`; the one that
   did changed the answer.*

3. **Retagged: "accounts created by `activar-cuenta` are passwordless and anyone can log
   in with an empty password."** I drafted this as measured. The live query
   (`length(encrypted_password)` → 60 for all 61 users) is consistent with the opposite
   conclusion, so it became F-10 with basis `modelled` and a named local-only experiment.
   *Rule 5 (the qualitative premise under a number is its own claim) and Rule 7 (a
   criticism you cannot support is cut exactly like an unsupported reassurance).*

4. **Cut: "the PWA has its own cookie jar, so mail-link logins break."** There is no PWA.
   The grep returned nothing. Rewritten as F-12, a keep-verdict with a one-line exit
   trigger. *Rule 7 — say so where something is sound, with evidence, then rank it anyway.*

5. **Cut: "six identical mails is a new problem."** It is P-080/P-087 from the 2026-09-02
   triage. Kept only because I re-derived the mechanism at HEAD (`correo.ts:109-144`,
   `:90-91`) and added something the prior work did not have: the OTP gate excludes exactly
   the rails that need it. *Rule (reuse requires attribution + fresh re-derivation).*

6. **Cut: "`getEsMiembro` has no gym filter" as a standalone finding.** It is P-003/P-007/
   P-053. Folded into F-08 as the reason the self-heal doesn't catch link-burn fallout,
   with the line re-read at HEAD (`agenda-miembro.ts:139-143`) and the live multi-gym count
   measured (1). *Same rule.*

7. **Cut: "Supabase handles session persistence, so the cookie jar story is fine."** Never
   written down, but it was my first instinct on F-09. *Rule 4 — "Supabase handles it" is
   not evidence. What replaced it: the two RED origins from the live `gym_domain` read and
   the absence of any host normalisation in `proxy.ts:99-190`.*

8. **Retagged: F-07's recovery path.** I wrote "the desk can merge them" as fact; the merge
   runbook was not opened this round, so it carries `unverified this round` and cites P-047.
   *Rule 5.*
