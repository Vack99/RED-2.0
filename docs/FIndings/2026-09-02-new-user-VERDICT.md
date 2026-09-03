# New-user path — final verdict (2026-09-02, read 2026-09-03 00:40Z)

Examiner seat over `2026-09-02-new-user-cross-examine.md` (v2), `2026-09-02-marce-triage.md`, and the
`new-user-xe/` notes. HEAD `35e8c246`. Live `hjppxawglmukfvsgmcog`, SELECT-only; every number below was
re-run by me at 00:40Z unless marked *(carried)*. Emails masked 4 chars + domain.

## 1. Verdict

**Both, unequally — exposure is measured, the regression is one screen, and the commit-day story is dead.**
Exposure: RED claimed **27** members since 08-15, and **14** clientes rows sit invited-but-unclaimed platform-wide
(RED 7, worst 697 h; forge 4, worst 1,224 h) while the only watcher has mailed **0** alerts in 196 Resend mails
(rows #4/#10, R2-E2 §a, reproduced). Regression: `afd7a5d5` (2026-08-31 01:26Z) turned a refused magic-link send
into "NO SALIÓ EL CORREO" with a `window.location.reload()` button that re-enters the same 60 s window
(`activar/actions.ts:94`, `activar-form.tsx:154`); it fired **twice**, 10 s apart, 09-01 19:25Z, for the only member
to hit it in that day (triage §2). The claimed door-mix inversion *at that commit* is refuted: Fisher p = **0.19** at
the commit's own timestamp; the change point is 08-17 and tracks a 21-invite seed wave draining (R1 §2–§4; my re-run
gives the same 12/6 → 2/6 → 3/8 → 1/5 weeks). The number nobody produced: the per-member failure rate before vs
after. The nearest instrument, built here from `auth.users` (real `/registro` signups since 08-10, n=30): **20**
confirmed within 10 min, **6** took 77–2,030 min, **4** never (13%). By week the not-fast share is 29%, 17%, 40%,
43% (n = 7, 6, 10, 7) — consistent with the owner's perception, not significant, right-censored (two of the 4 are
3 h and 6 h old), and biased low by the 09-01 deletion of Marce's first row.

## 2. Q1–Q7

**Q1 drifts** (ranked, `git log`/live): (1) `afd7a5d5` — refused send → hard error + retry-inside-window; the one
regression; measured. (2) `17566753` — throttle "for ALL THREE doors" covers 3 of 5; `enviarMagicLink` and
`solicitarReset` ungated (grep at HEAD: 3 call sites). (3) `95583ac9` 08-28 — two RED client hosts, disjoint
`__Host-` jars, no 308 (row #13, *carried*). (4) `860a3893` — cron `0 12 * * *` vs "hourly" docstring: stale prose;
the defect is 0 alerts ever (`pg_stat_statements` holds 0 calls of the cron's SQL, R2-R2 #4). (5) The door mix — not
a code drift: 08-17 change point, seed wave (R1 §4). Config-plane drift (Redirect URLs, Turnstile hosts, Vercel env)
is unmeasured — no agent has console access.

**Q2 weak spots** (ranked by probability × damage): (1) `/registro` then invite link inside 60 s → 429 → error
screen → retry loop; 2 of 2 in the 09-01 window. (2) Opening any but the newest of N identical-subject "Confirma tu
cuenta" mails → `otp_expired` → password form; 4 of 10 `/verify` on 09-01, 1 more 09-02 22:42Z; Marce held 6.
(3) Desk sale with no email → uninvitable, no CTA: RED 8 vigentes, forge 44 of 50 (row #6). (4) One-character typo →
second `clientes` row with 0 balance, no merge tool (row #5): 47 code-bearing email-less rows; occurrence
unmeasured — fuzzy-match query. (5) Shared-phone VINCULAR binds another's paid row and overwrites the invited email,
irreversibly (row #2): 68 armed codes, 10 accounts with no `clientes` row; occurrence unmeasured.

**Q3 stress**: first binder is the Resend daily cap — **≈34 new members/day platform-wide** = 100 ÷ 2.9 measured
mails per new member (R2-R2 §4); *modelled, conditional on the account being on Free — undecided, owner, one billing
read*. Next: Turnstile ~10 hostnames (8 live; cap asserted), then GoTrue 30 new users/hour. Exit trigger: any UTC day
over **60** mails (peak 37).

**Q4 three months idle**: earliest *measured* date is TLS `notAfter` **2026-10-07** on all 9 `*.ibookit.lat` hosts
(T6 §1, two openssl runs, *carried*) — and Vercel's renewal window only opens 09-07, so this is a check on **09-24**,
not a break. Earliest *possible* break is the Supabase Free pause at day 7–14; the plan is unread (owner). The
class-horizon cron (`cron.job` active, 5 Monday runs, `errors=0`) and Realtime partitions only fail downstream of a
pause. The detector's 30-day window drops jess…@hotmail.com on 09-13 — nothing lost, it has never alerted.

**Q5 human corruption**: (1) shared phone + one VINCULAR tap → paid row rebound, email overwritten — **NO**, service-
role SQL only (no `updated_at`, audit table 0). (2) typo at `/registro` → zero-balance twin — **NO** in-app; runbook
names forge's `gym_id` as RED's, DELETE cascades `ventas`. (3) `/registro` then invite inside 60 s — **yes, by
waiting**; nothing says so. (4) stale mail of N → resend — **yes**. (5) desk resubmit with a corrected amount under a
live idempotency key → original stands, receipt prints for the wrong amount — **yes via `editar_venta`** if noticed.

**Q6 the one-liner** (from executed §7, R2-E1): `client/proxy.ts:173` `if (esSesionMuerta(error) || (!error &&
!data))` → `if (error || !data)` — an obvious simplification; typecheck, lint and 1975/1975 vitest stay green because
`proxy()` is invoked by no test; every member is signed out during any GoTrue 5xx window (the 08-29 shape).
Runner-up: a fifth `signOut` without `{scope:"local"}` (row 7, green; the 08-24 incident).

**Q7 anti-idempotent** (§8, code re-read): (1) `/registro` retry rotates the one-time token, killing any mail that
landed. (2) `/activar` retry after `createUser` succeeded → permanently on the magic-link rail; no compensating
delete (never observed: 0 × 500 on `activar-cuenta`). (3) `/activar` retry inside 60 s re-spends the window — the
Marce loop. (4) `crearVentaAction` resubmit with edited fields → edit discarded, both mails re-fired. (5) REENVIAR
after a slow-but-accepted send → member back at `/activar`, feeds (3).

## 3. Fix queue (ship in this order; smallest diff at the root)

| # | What | Size | Prevents | Guard that keeps it fixed |
|---|---|---|---|---|
| 1 | `sesion.ts:enviarMagicLink` returns `error.code`; `activar/actions.ts:94` branches `over_email_send_rate_limit` into a wait state (seconds parsed from GoTrue's "after N seconds", default 60); form shows "Ya te enviamos un correo hace un momento — ábrelo" with the retry disabled for N s; wrap `enviarMagicLink` + `solicitarReset` in `permitirReenvio` | S | row #1 | vitest on `activarAction` with a fake client returning that code → asserts state + seconds |
| 2 | Send time in the auth-mail subject (`correo.ts:109-144`, one line per rail) | S | rows #7, Q2-2 | `correo.test.ts` asserts subject carries HH:MM |
| 3 | Owner reads Vercel → admin → Cron Jobs; then `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/alertas` (it mails); ship the missing var. Make `resumirAlerta` always return a message (subject "Sin novedades" when clean) | S + 1 read | row #4 | The daily mail is the heartbeat: **2** consecutive 12:00Z slots without one = dead |
| 4 | `reclamar_por_codigo.sql:60`: raise when the row's `email` is non-null and differs from `v_email`; `VincularForm` shows the invitee's masked email | M | row #2 | Flip `supabase/tests/reclamar_por_codigo.sql:151` (asserts the overwrite today) to assert the refusal; `test:denial` |
| 5 | `auth/confirm/route.ts`: `getClaims()` before token redemption; live session → `finalizarAuth` | S | row #8 | `route.test.ts` case: session present + spent token → `/reservar` |
| 6 | `reclamar_o_crear_cliente.sql:59-65` sets `claim_code = null`; `invitacion_info` adds `and auth_user_id is null` | S (migration) | row #15 | denial vector asserts the written `claim_code` |
| 7 | `registros_atorados()` third arm rooted in `clientes` (48 h); age in the roster badge | M (migration) | row #10 | `supabase/tests/registros_atorados.sql` vector seeding a never-clicked invite |
| 8 | `turbo.json` typecheck: add `$TURBO_ROOT$/packages/*/src/**` to `inputs` — `^typecheck` alone is a no-op, no package declares that script | S | row #31 | Re-run R2-E1 row 6 with plain `pnpm typecheck`; must fail |

Zero-code, not counted: turn on `auth_leaked_password_protection` (advisor WARN, reproduced); `create index
concurrently` on `ventas(cliente_id, created_at desc, id desc)` (row #30).

## 4. Keep / revert

- **Two doors (`/registro` + `/activar`) — KEEP**, with fix #1 making them aware of each other. `/registro` works
  (and*/oma* in <90 s, triage §6). Exit: `/registro` never-confirmed rate above **20%** in any 4-week window (today
  4/30 = 13%, censored), or **3** members in 30 days reaching the wait state. I do not sign §9's "collapse the rails
  below 25% `/activar` share for 2 weeks": the share is invite-supply-driven (R1 §4) and would trip on a seed wave.
- **`afd7a5d5` — KEEP, do not revert.** Reverting restores "Revisa tu correo" on a refused send — for Marce's
  sequence it would have pointed at a live mail by accident; for a bad address or a Resend outage it lies (FC-16).
  The commit also carries the wedge detector, `/codigo`, the signup e2e and the fail-closed hook. Fix #1 replaces the
  arm. Exit for its `&correo=` removal alone: `activar-cuenta` **422** (`email_no_coincide`) above **3** in 7 days
  (today 0 of 6 in 24 h) → restore the pre-fill, one line, not a revert.
- **`send-email` hook — KEEP**, bound its three fetches and add `retry-after` (row #14). Exit: **>2** hook non-2xx on
  non-sandbox recipients in 24 h (today 0; the 6 × 400 are `delivered@resend.dev`), or max duration over **4,000 ms**
  (today 2,594). I do not sign §9's "3rd ranked defect in 30 days — already tripped": it counts audit output, not
  production events.
- **Resend-only mail — KEEP** (DKIM/SPF verified, *carried*). Exit: any UTC day over **60** mails, or real-recipient
  bounce over **2.0%** rolling 30 d (0.52%). Undecided — which plan; owner, one read. Add DMARC `rua=` regardless.

## 5. Not established

1. Whether the per-member failure *rate* rose — the weekly not-fast table above is the instrument; needs ~15 weeks
   at 2.3 claims/week; never delete `auth.users` rows again (it erases the denominator).
2. Resend plan, Supabase plan, Vercel cron state, Auth rate limits — four owner dashboard reads (§12 #1–#4).
3. Why `email_data.token` fails `/^\d{6}$/` — one instrumented deploy logging `token.length`, then revert.
4. Whether the VINCULAR takeover ever fired — join each invite's Resend recipient to the row's final `email`.
5. Whether GoTrue retries a 503 without `retry-after` — scratch project, hook pointed at a 500ing key.
6. Whether dieo…@hotmail.com (6 h) and marq…@gmail.com (3 h) are wedged or slow — re-read `registros_atorados()`
   on 09-04; both signed up at `www.redfunctionaltraining.com`, hook OK, no `clientes` row by name.
7. Who POSTs `delivered@resend.dev` signups at production (3 more 09-02 04:17–08:53Z) — needs the caller.

## 6. Disbelieved

- Row #32 "the 8-character floor is client-side only" — **false**: `packages/data/src/server/registro.ts:37`
  (`z.string().trim().min(8)`) and `activar/contrasena/actions.ts:37` both enforce it server-side. The
  leaked-password half stands.
- Row #24 / T6 §1 "renewal has never once run", severity 5 — trivially true: 90-day certs issued 07-09, renewal
  window opens 09-07 (T6 line 13). A calendar check, not a defect.
- §0 item 8 / §15 "whether the rate rose is unfalsifiable" — overstated: `auth.users` carries `created_at` and
  `email_confirmed_at` for every surviving `/registro` signup (table in §1). What is unfalsifiable is deleted rows
  and struggle-then-success.
- Row #4's "worst 1,218 h" is a **floor**: `marcar_invitacion_enviada` resets `invitacion_enviada_at` on every
  resend (body read), so wedge age is time since the *last* resend; R1's 21-invite day is likewise ≥21.
- Row #31's fix hint `dependsOn: ["^typecheck"]` — no package has a `typecheck` script; it changes nothing.
- §5 "class-horizon materialisation breaks on last Monday + 6 weeks" — only downstream of a pause; the job is
  active and ran 08-31 `errors=0`.

## 7. Draft audit

- Cut "RED's failures are elevated" (Rule 5, cite or drop) → replaced with the weekly not-fast table and its n.
- Retagged "34/day" measured → **modelled**, conditional on Free (Rule 5, the premise under a number is its own claim).
- Cut "reverting `afd7a5d5` restores a working screen" (Rule 4, the incumbent screen is a candidate) → it restores
  a lie that was accidentally right for one sequence.
- Retagged "two new members wedged today" → "two non-confirmers at 3 h and 6 h, right-censored" (Rule 2).
- Cut "TLS expiry is the first break" → a dated check (Rule 5).
- Cut "replace the hook" (Rule 7, honesty over severity) → no production event supports it; kept with a trigger.
- Cut "liveness row in `cron_run_log`" from fix #3 → the admin app holds no service-role client; not S.

Blind spots: no browser, no device, no mail sent, nothing written; `activar-cuenta` live v3 compared structurally
only (*carried*); all log counts are one 24 h window; I re-derived rows #1–#5, #8, #10, #15, #31, #32 and the door
split, and took the rest on the round-2 files' word.
