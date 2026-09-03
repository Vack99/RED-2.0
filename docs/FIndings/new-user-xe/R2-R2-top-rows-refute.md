# R2 — refutation pass on §1 rows #1/#2/#4/#5/#9 and the §4 first binder

Target: `docs/FIndings/2026-09-02-new-user-cross-examine.md`. Repo HEAD **`e629466e`**
(the doc says `33c9087a`; that is now HEAD~1 — the doc itself was committed after).
Live project `hjppxawglmukfvsgmcog`, SELECT-only. Default was *refuted when uncertain*; four of
six survived intact. Emails masked except `marcerubiogarcia07@gmail.com` (already un-masked in
`docs/FIndings/2026-09-02-marce-triage.md`).

---

## Row #1 — two of five mail doors bypass the throttle — **HELD, one correction**

**Code re-read, all at HEAD.** `permitirReenvio` has exactly 3 call sites
(`apps/client/src/app/entrar/actions.ts:84`, `apps/client/src/app/registro/actions.ts:97`, and
`packages/data/src/server/registro.ts:151`+`:176` via `enEsperaReenvio`/`registrarReenvio`).
Ungated: `entrar/actions.ts:57` (`solicitarReset`) and `activar/actions.ts:86`
(`enviarMagicLink` → `packages/data/src/server/sesion.ts:179-201`). The docstring at
`packages/data/src/server/reenvio-limite.ts:4` does say "ALL THREE doors". **2 of 5 confirmed.**

**Live evidence reproduced and strengthened** (`query_logs`, `auth_logs`, window
2026-09-01T18:51Z → 2026-09-02T18:51Z): exactly two `429 / over_email_send_rate_limit`, both
`path:/otp`, both `user_confirmation_requested`, actor `marcerubiogarcia07@gmail.com`, at
`19:25:16Z` and `19:25:27Z`. The doc quoted only the 28 s body. **New:** the second reads
*"after 18 seconds"*. 19:25:17 + 28 s and 19:25:27 + 18 s both resolve to
**19:25:45 = 19:24:45 + 60 s** — the `send-email` 200 at `19:24:45.866Z`. Two independent points
now pin the 60 s per-address `/otp` floor instead of one.

**Also new — the referer settles attribution.** GoTrue logs `redirect_to` as `referer`; both 429s
carry `https://www.redfunctionaltraining.com/auth/confirm?codigo=33SDA38A&firma=…&next=/reservar`,
which is byte-for-byte the `emailRedirectTo` built at `activar/actions.ts:86-89`. These 429s came
from the ungated `enviarMagicLink`, not from any throttled door. The row asserted this; it is now
measured.

**Correction — the copy is not a lie; the CTA is.**
`activar/_components/activar-form.tsx:147-149` renders *"No salió el correo / No pudimos enviarte
el enlace ahora mismo. Intenta de nuevo."* That is **accurate** — no mail left. The defect is the
button under it: `window.location.reload()` (`:154`) drops the member back on an empty form inside
GoTrue's 60 s window, so the retry it invites cannot succeed. Measured: the two attempts are
**10.1 s apart**. Reword the row from *"renders as a lie"* to **"tells the truth, then invites a
retry that cannot succeed for another 50 seconds"**. Everything else in the row stands.

Second correction, minor: `activar/actions.ts:94` collapses every **send** failure (throttle, bad
address, network) to `cuentaExistenteFallo` — not "every failure"; the `codigo_invalido`,
`ya_reclamado` and `email_no_coincide` arms each have their own state at `:72-104`.

---

## Row #2 — one tap binds someone else's paid membership — **HELD, exposure resized**

`supabase/functions-canonical/reclamar_por_codigo.sql` at HEAD: `:54-58` guards only
`count(*) from clientes where gym_id = v_gym and auth_user_id = v_uid`; `:60-68` then sets
`auth_user_id = v_uid, email = v_email, claim_code = null` with **no comparison to the row's
existing email**. Confirmed. `vincularAction` (`activar/actions.ts:137-138`) calls it and
redirects regardless — and it is a Server Function, so `page.tsx:83-85`'s render gate is not a
control.

Irreversibility confirmed the hard way: `select … where updated_at is not null` on
`public.clientes` errored `42703: column "updated_at" does not exist`. `auth.audit_log_entries`
= **0 rows**. The overwritten address is unrecoverable.

Count reproduces exactly: **67** armed codes (`claim_code not null and auth_user_id is null`).

**Correction — "whoever is signed in" is too wide.** The `:54-58` guard refuses any caller who
*already owns a row in that gym*, so the wedge needs a session with **no `clientes` row in the
invite's gym**. Measured today: `auth.users` = 62, of which **10 hold no `clientes` row at all**,
and **0** identities hold rows in two gyms. Live surface = those 10 accounts plus every future
cross-gym member. The outcome's severity is unchanged; the population is not.

---

## Row #4 — the watcher has never fired — **HELD; the drift is stale prose, and the cause narrows**

Both cites are correct at HEAD: `apps/admin/src/app/api/cron/alertas/route.ts:32` says
`0 * * * *`, `apps/admin/vercel.json:6` says `0 12 * * *`.

**Correction to the framing.** `git show 860a3893` (2026-09-02 02:36 −0600 = **08:36Z today**):
*"Vercel Hobby caps cron at once/day, hourly schedule was rejected as a paid feature."* The
schedule is not misconfigured — it is the only one the plan allows, and `resumen.ts`'s
`HORA_RESUMEN_DIARIO` was already built for a 12:00 UTC slot. **The defect is a stale docstring at
`route.ts:32`, not a scheduling bug.** Call it that.

**The alert-never-fired claim is stronger than the doc had it.**

- `registros_atorados()` live = **3** (reproduced).
- Full Resend ledger re-paged with the admin key: **196** mails, `2026-08-12` → `2026-09-02`,
  **0** subjects containing "Alerta". (Doc said 194; 196 today, two sent since.)
- **New:** `extensions.pg_stat_statements_info.stats_reset = 2026-05-29T20:23:34Z`, unchanged, and
  the cron's exact literal `select correo, motivo, horas from public.registros_atorados()`
  (`resumen.ts:86`) has **zero** entries. The only near-match carries `order by horas desc` — an
  agent's ad-hoc query. The cron has never reached its own DB call.

**New discriminator, ruling out one candidate.** `curl https://red-admin.ibookit.lat/api/cron/alertas`
→ **401 "No autorizado"** (13 bytes). The route is deployed and serving, so *"the admin deploy
failed / the route does not exist"* is dead. Remaining: the schedule never fired, or it fired and
returned at the `CRON_SECRET` 401 or the env-guard 500 (`route.ts:161-180`) before any query. The
row's own exit trigger — an authenticated curl, whose body names the missing variable — is still
the right next act; I did **not** run it (it sends mail).

Signal the row should carry: today's 12:00 UTC slot had **both** arms live — `atorados` = 3 *and*
5 × `send-email` non-2xx in the window (`function_edge_logs`: 400s at 00:24:43, 00:25:18, 04:17:44,
08:24:28, 08:53:20Z). A run that completed would have mailed. It is 18:51Z; nothing did.

---

## Row #5 — `lower(email)` join mints a zero-balance twin — **HELD as written**

`reclamar_o_crear_cliente.sql:50-51` matches on `gym_id` + `auth_user_id is null` +
`lower(email)`, requires `v_n = 1`, and `:74-86` falls through to an INSERT with
`clases_restantes = 0`. Confirmed. The follow-on refusal at `reclamar_por_codigo.sql:54-58`
("Ya tienes cuenta en este gimnasio") and its swallow at `activar/actions.ts:137-138` are both
confirmed at HEAD.

Every exposure number reproduces to the digit: **47** rows carry a `claim_code` with no email —
**forge 24 / red-demo 11 / red 8 / forge-demo 4**, exactly as filed.

Supporting, not refuting: the row's fix hint (refuse on a matching normalised phone) is
implementable *because* `:75-77` already raises `Teléfono requerido` before the INSERT, so a phone
is guaranteed present on that arm. Status stays **held (mechanism); live occurrence unmeasured** —
I found no claimed row beside an unclaimed paid twin either.

---

## Row #9 — dropped response moves the member to an unexercised rail — **live evidence REFUTED; mechanism held**

The coverage critic (§blind-spot 4) is right, and the auth-log *bodies* prove it harder than the
edge status codes did.

`query_logs` on `auth_logs`, same 24 h window, all six `/admin/users` calls:

| time (UTC) | status | error_code |
|---|---|---|
| 2026-09-02 16:29:41 | 422 | `email_exists` |
| 2026-09-02 15:04:08 | **200** | — (`user_signedup`, `grec…@gmail.com`) |
| 2026-09-02 02:18:03 | 422 | `email_exists` |
| 2026-09-02 01:17:30 | 422 | `email_exists` |
| 2026-09-01 19:25:27 | 422 | `email_exists` |
| 2026-09-01 19:25:16 | 422 | `email_exists` |

The single `/admin/generate_link` in the window is `200`, `user_recovery_requested`, actor
`1da7b96c-…` — **the same uid the 15:04:08 `createUser` just minted, in the same second**. And
`function_edge_logs` for `activar-cuenta` in the window: `5 × 409`, `1 × 200`, **zero 500s** —
the `linkErr` arm (`supabase/functions/activar-cuenta/index.ts:105-111`) returns 500 and never ran.

So the row's *"five createUser attempts that never reached generateLink"* is a misread: those five
**failed** at `createUser` with `email_exists` and, by `index.ts:96-99`, mint nothing by design.
Row #3's reading of the identical six lines (*"1×200 vs 5×422 `email_exists`"*) is the correct one.
**Strike row #9's live-evidence sentence.**

The mechanism survives intact: `index.ts:92` `createUser` → `:105` `generateLink` with **no
compensating `deleteUser`** on the `linkErr` path, and no test covers it. Re-rank it as an
unexercised latent one-way door, not an observed one.

---

## §4 first binder — corrected

**The cap number is no longer asserted.** Primary source `https://resend.com/pricing`, read
2026-09-02: *"Free: 100 emails a day, 3 domains, Ticket support, 10,000 automation runs, 30-day
data retention"*; the first paid tier is Pro $20 at 50,000/month with **no daily cap**. The
2026-07-22 audit's 100/day is correct **for Free**.

**The divisor is wrong.** The doc divides by 2 (invite + receipt, `(app)/vender/actions.ts:61-65`
— note the doc drops the `(app)` route group from the path). That undercounts: the member's own
door then spends a **third** mail on the same Resend team. Measured from the ledger (196 mails,
21 days, one key, one verified domain `ibookit.lat`):

| subject class | count |
|---|---|
| invites (`Tu gimnasio … te invita`) | 63 |
| `Confirma tu cuenta` | 46 |
| `Restablece tu contraseña` | 10 |
| `Continúa en tu cuenta` (magic link) | 2 |
| receipts (`Tu recibo de …`) | 75 |

63 invites : 63 of the 75 receipts : 58 auth mails ⇒ **≈2.9 mails per new member**, not 2.
(The `/activar` fresh-provision rail *is* the 2-mail case — `generateLink` mails nothing, confirmed
by the 15:04:08Z pair with no `send-email` beside it. But row #3 measures ~89% of new RED members
arriving via `/registro`, which does spend a `Confirma tu cuenta`.)

> **Corrected first binder: ≈34 new members/day platform-wide** (100 ÷ 2.9), **not 50** —
> conditional on the account being on Resend Free.
> Source for 100/day: https://resend.com/pricing (primary, read 2026-09-02).
> Source for 2.9: the account's own 21-day Resend ledger via `GET /emails` (measured).

**What is still unread: which plan.** Resend exposes no plan endpoint, and
`ratelimit-limit: 10 / ratelimit-policy: 10;w=1` on both `GET /domains` and `GET /emails` is the
**documented default for every plan** (`resend.com/docs/api-reference/introduction`: *"10 requests
per second per team"*) — it does not discriminate, so my first attempt to infer the plan from the
headers **refutes itself**. Two weak consistency signals with Free: 1 verified domain (Free allows
3) and a ledger reaching back 21 days (inside Free's 30-day retention). **Undecided — which Resend
plan is the account on; owner, one dashboard read.**

**Exit trigger:** any single UTC day in the Resend ledger above **60** mails ⇒ within 40% of the
Free wall, act. Measured peak to date: **37** on 2026-08-13; median 9.3/day. The cap has never
been observed to bind, so this is a modelled ceiling, not an incident.

Ranking unchanged: Resend still binds first even at 34/day — the GoTrue bucket (30 new
users/hour = 720/day) is 20× further out.

---

## Blind spots

1. **I did not run the authenticated cron curl**, so row #4's 401-vs-500 stays undiscriminated.
   It is the cheapest remaining act and it sends mail, which is why I left it.
2. **The Resend plan is inferred, never read.** If the account is on Pro, the §4 headline changes
   binder entirely and my 34/day is void, not merely revised.
3. **The 24 h log ceiling bounds everything above.** Rows #1 and #9 rest on one day's traffic —
   6 activation attempts, 2 rate-limit hits. A second bad day could invert either reading, and
   `auth.audit_log_entries` = 0 means there is no history to appeal to.
4. **I read `activar-cuenta` from the repo, not from live.** The critic compared live v3
   structurally; I inherited that and did not re-verify, so "zero 500s" is evidence about the
   deployed function only if the deployed function is HEAD's.
5. **Row #5's occurrence is still unmeasured and I did not close it.** I confirmed the exposure
   counts and the code path, nothing about whether it has fired.
6. **I did not attack rows #3, #6–#8 or #10+**, so a duplicate-reading error like #9's could
   survive elsewhere in the table; #9 was found by a critic, not by the referee.
