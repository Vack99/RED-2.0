# T6 — Three months with no use (Q4)

Cross-examination seat T6. Territory: everything on the new-user path that **expires, rotates,
pauses, or is forgotten**. HEAD = `33c9087a`. All live probes run 2026-09-02 between 17:26Z and
17:55Z against the LIVE project `hjppxawglmukfvsgmcog` (SELECT-only), against public DNS/TLS, and
against the Resend + Supabase Management APIs (GET-only). Emails masked (first 3 chars + domain)
except `marcerubiogarcia07@gmail.com`, already documented.

**The clock.** Day 0 = 2026-09-02. Day 91 = 2026-12-02. Every date below is placed on that line.

```
day  0  2026-09-02  today
day  5  2026-09-07  Vercel's first-ever cert-renewal attempt window OPENS (14–30d before notAfter)
day  7  2026-09-09  Supabase Free: 7-day low-activity assessment window closes; warning mail ~here
day 11  2026-09-13  jes***@hotmail.com (wedged 475h) rolls OUT of registros_atorados()'s 30d window
day 21  2026-09-23  Vercel's cert-renewal window CLOSES. Nothing has renewed at day 0.
day 21  2026-09-23  pau***@hotmail.com rolls out of the wedge detector
day 35  2026-10-07  ALL NINE ibookit.lat TLS certs expire, 06:24:48–06:43:04 GMT
day 38  2026-10-10  RED's last materialized class_session (14:15Z). Member agenda empty past here
                    if pg_cron stops (it stops when the project pauses).
day 85  2026-11-26  www.redfunctionaltraining.com cert expires (its own, later cycle)
day 91  2026-12-02  ← three months
day~104 2026-12-15  Supabase's 90-day one-click restore window closes (if paused ~day 14)
day120  2026-12-31  Supabase legacy anon/service_role JWT keys stop working (both edge functions)
```

Ranked worst-first; earliest-first among equals. 12 findings. Sound-with-evidence section at §13.

---

## 1. All nine `ibookit.lat` TLS certificates expire 2026-10-07 and renewal has still never run — severity 5

**Claim.** Every public `*.ibookit.lat` host — both RED doors, both Forge doors, both demo doors and
`app` — presents a Let's Encrypt certificate whose `notAfter` is `Oct 7 2026 06:24–06:43 GMT`,
unchanged from the 2026-08-19 hand-audit. Vercel renews 14–30 days out, so the first renewal this
account has ever attempted is due between day 5 and day 21. If it does not fire, day 35 is a total
outage of the client app AND both admin desks simultaneously, with no page to read and nothing that
warns first.

**Measured, by hand, 2026-09-02 17:26–17:50Z** (`openssl s_client -servername <h> -connect <h>:443
| openssl x509 -noout -enddate`):

| host | notAfter | issuer |
|---|---|---|
| `app.ibookit.lat` | `Oct  7 06:24:48 2026 GMT` | Let's Encrypt YR1 |
| `red.ibookit.lat` | `Oct  7 06:39:43 2026 GMT` | Let's Encrypt YR2 |
| `forge.ibookit.lat` | `Oct  7 06:40:00 2026 GMT` | Let's Encrypt YR1 |
| `red-demo.ibookit.lat` | `Oct  7 06:40:29 2026 GMT` | YR2 |
| `red-admin.ibookit.lat` | `Oct  7 06:42:29 2026 GMT` | YR2 |
| `forge-demo.ibookit.lat` | `Oct  7 06:42:10 2026 GMT` | YR2 |
| `forge-admin.ibookit.lat` | `Oct  7 06:42:41 2026 GMT` | YR2 |
| `red-demo-admin.ibookit.lat` | `Oct  7 06:42:52 2026 GMT` | YR2 |
| `forge-demo-admin.ibookit.lat` | `Oct  7 06:43:04 2026 GMT` | YR2 |

That is 9 of 9 — the complete set from `gym_domain` (live query, §D of `01-live-snapshot.md`
re-derived: `select g.slug, string_agg(d.hostname||'/'||d.app) … group by g.id` returns exactly
these nine plus four `*.localhost` rows) plus `app.ibookit.lat`.

**Attribution.** `docs/Context/2026-08-19-member-reachability-todo.md`, "Time bombs" table, first row
("all 9 hosts issued in one 19-min window on 2026-07-09, `notAfter` 2026-10-07. Renewal has never
once run") — and prior register row **P-109**. **Re-derived this round**: the numbers above are a
fresh probe at HEAD, 14 days after that audit, and **nothing has moved**. The renewal window that
audit predicted (2026-09-07 to 09-23) has not yet opened, so this is still live, not stale.

**The one host that is fine.** `www.redfunctionaltraining.com` → `notAfter=Nov 26 03:08:59 2026 GMT`
(measured). It was issued at the 2026-08-28 cutover and sits on its own 90-day cycle. RED's members
who arrive on the custom domain survive day 35. RED members who arrive on `red.ibookit.lat` do not
— and that is where every invite/receipt/auth link minted before the cutover points.

**Member-visible symptom.** A NEW member taps the WhatsApp invite link on day 35 and gets
`NET::ERR_CERT_DATE_INVALID` / "La conexión no es privada". There is no app behind it to show a
Spanish message; the browser answers before Vercel does. `Strict-Transport-Security: max-age=86400`
is set on every response (measured live: `curl -I https://red.ibookit.lat/` → `Strict-Transport-
Security: max-age=86400`, and `apps/client/vercel.json` / `apps/admin/vercel.json` both set it).
That cuts two ways and the second way is the one nobody has said out loud:

- A member who visited within the last 24 h has HSTS pinned → the interstitial is **non-bypassable**.
- A member who has been away three months, or has **never visited** — i.e. exactly the new member
  this cross-examination is about — has no HSTS entry → the interstitial **is** bypassable
  ("Configuración avanzada → Continuar"). They can technically get in by clicking through a
  full-page security warning on a gym booking app. That is worse for trust than a clean outage and
  it is invisible to us, because a click-through produces a normal 200 in our logs.

**Does anything warn first?** No. There is no TLS monitor (item 6 of the reachability TODO is still
`[ ]`), no uptime check, and the one alert cron in the repo (`apps/admin/src/app/api/cron/alertas/
route.ts`) watches three signals — `invalid_grant`, `send-email` non-2xx, wedged registrations — and
none of them is TLS. Vercel emails on renewal *failure*, but only to the account owner and only
after the attempt.

**Breaking point.** Component: Let's Encrypt leaf certs on the nine Vercel-managed `ibookit.lat`
hosts. Breaks at: `2026-10-07 06:24:48 GMT` (first, `app`) through `06:43:04 GMT` (last). Bound by:
Vercel's automatic renewal, whose window is 2026-09-07 → 2026-09-23 and which has never executed for
this account.

**Fix hint.** Two lines of defence, both cheap: (a) the calendar item the reachability TODO already
specifies — re-run the openssl one-liner on all nine hosts on **2026-09-10** and again **09-24**; if
`notAfter` has not moved past Oct 7 by 09-24 there are 13 days to fix by hand instead of zero;
(b) an external TLS monitor with alerts at 21/14/7 days (reachability TODO item 6). (b) makes (a)
unnecessary forever.

---

## 2. The only automated watcher on the new-user path is silent while three members are locked out right now — severity 5

**Claim.** `public.registros_atorados()` returns **three** wedged members at this moment, the oldest
stuck for **475 hours (19.8 days)**. The alert cron's rule is to page on *any* wedged row on *every*
run (`resumen.ts:177`, `(atorados?.length ?? 0) > 0`). The Resend ledger contains **zero** alert
emails across the entire window. Whatever the cause, the shield that exists to make this exact
failure visible has not made it visible.

**Measured — the wedge (live SQL, 2026-09-02 17:45Z):**

```sql
select left(correo,3)||'***@'||split_part(correo,'@',2), motivo, horas, filas_roster
  from public.registros_atorados();
```

| correo | motivo | horas | días | filas_roster |
|---|---|---|---|---|
| `jes***@hotmail.com` | `sin-confirmar` | 475 | 19.8 | 0 |
| `pau***@hotmail.com` | `sin-confirmar` | 232 | 9.7 | 0 |
| `iva***@gmail.com` | `sin-vincular` | 66 | 2.8 | 0 |

Two of these three (`pau***`, `iva***`) also appear in the gatherer's funnel table
(`01-live-snapshot.md` §F) — `pau***@hotmail.com` as "never confirmed, gym `(none)`, 0 sessions" and
`iva***@gmail.com` (86ec…) as "confirmed but never signed in". So this is not a detector artefact;
two independent reads of the live database agree that these people are not in.

**Measured — the alert rule.** `apps/admin/src/app/api/cron/alertas/resumen.ts:173-181`:

```ts
const alertar =
  (turnoDiario && ((invalidGrant ?? 0) > UMBRAL_AUTH || (sendEmailFallos ?? 0) > 0)) ||
  (atorados?.length ?? 0) > 0 ||
  errores.length > 0;
```

The wedge arm has no threshold and no daily gate — it fires on every run. The error arm fires too,
and the file says why in its own words: *"an expired PAT would otherwise read as 'all clear'
forever"* (`resumen.ts:169-170`).

**Measured — the silence.** `GET https://api.resend.com/emails?limit=100` (production key from
`apps/admin/.env.local:13`, value never printed) returns 100 messages spanning
`2026-08-19 18:27:40Z → 2026-09-02 17:08:17Z`. Subject histogram: 30 × "Confirma tu cuenta", 20 ×
"Tu gimnasio RED te invita a su app", 6 × "Restablece tu contraseña", 3 × RED Demo invite, 3 × Forge
invite, 1 × "Continúa en tu cuenta", the rest receipts. **Zero** subjects containing "Alerta". The
alert subject is `[iBookit] Alerta auth/correo — …` (`resumen.ts:205`), so it would be unmissable.
Delivery states across those 100: `delivered` 99, `delivery_delayed` 1 — the account is healthy and
sending.

The wedge detector shipped 2026-08-30 (`afd7a5d5`), so the honest window is three daily 12:00 UTC
runs: 08-31, 09-01, 09-02. On all three, at least `jes***` (wedged since ~08-14) and `pau***`
(since ~08-24) were already in the table. **Three consecutive runs that must have mailed; zero mails.**

**Measured — the corroborating trace.** `extensions.pg_stat_statements` has not been reset since
`2026-05-29 20:23:34+00` (96 days). It holds:

- `select * from public.registros_atorados()` → **calls = 2** (this is the *manual* form; it is what
  I and a prior session typed)
- `select correo, motivo, horas from public.registros_atorados()` — the cron's **exact** literal
  (`resumen.ts:86`, `SQL_REGISTROS_ATORADOS`) → **zero rows in `pg_stat_statements`.**

*Caveat, stated rather than hidden:* the table holds 4,845 entries against Postgres's default
`pg_stat_statements.max = 5000`, so eviction of a low-call entry cannot be excluded. Treat this as
corroboration, not proof. The Resend zero is the load-bearing evidence.

**Measured — a dead PAT sitting in the file the Vercel env was almost certainly copied from.**
`SUPABASE_ACCESS_TOKEN` in `apps/admin/.env.local` (44 chars, `sbp_` prefix) →
`GET https://api.supabase.com/v1/projects` → **HTTP 401 `{"message":"Unauthorized"}"`**
(2026-09-02 17:41Z). Attribution: memory `ibookit-app-ui-worktree.md` recorded "scratch PAT DEAD";
**re-derived at HEAD this round** against the *Management API root*, not the scratch project, so this
is the token's own validity, not a project-scope issue.

If that same string is what is set in Vercel, the cron passes the `!token` guard (the string exists),
every `contar()` returns `{total:null, error:"…: HTTP 401"}`, `consultarAtorados` returns
`{filas:null, error:"…: HTTP 401"}`, `errores.length > 0` → alert shaped → mail sent. **That path
also produces an alert email.** Zero alert emails therefore rules out "the cron ran with a dead PAT"
just as firmly as it rules out "the cron ran clean". The parsimonious remainder is: **the cron is
not running at all** — `CRON_SECRET` unset (route 401s, `route.ts:158-161`), or the cron disabled in
Vercel, or the deployment it was attached to superseded.

**Member-visible symptom.** `jes***@hotmail.com` created an account 19.8 days ago, never confirmed,
has no `clientes` row (`filas_roster: 0`), and has told nobody. Nobody has told the desk. They are
simply gone. Multiply by three today; by three months of new signups at RED's current rate, by more.

**Breaking point.** Component: `apps/admin/src/app/api/cron/alertas/route.ts` + its Vercel cron
trigger. Breaks at: already broken — 3 wedged members, 0 alerts, ≥3 missed runs. Bound by: the fact
that the route's liveness signal is a `console.warn` into **Vercel Hobby runtime logs, retention
1 hour** (see finding 7), so "did it run" is unanswerable after 60 minutes.

**Fix hint.** Give the run a durable trace in a place we can read: append one row per run to a
`cron_run_log`-style table (the pattern already exists — `public.cron_run_log`, written by
`cron_materialize_horizon`, holds every Monday run since 08-10). Then "the shield stopped looking"
becomes a SELECT, not a guess. Separately: rotate the PAT and re-set it in Vercel, and verify the
cron by reading Vercel → admin project → Cron Jobs → last invocation.

---

## 3. The wedge detector forgets at exactly 30 days — and the oldest wedged member is 10 days from being forgotten — severity 4

**Claim.** Both arms of `registros_atorados()` are bounded by a 30-day upper window. A member who is
wedged and does not complain simply disappears from the only detector that can see them, permanently,
on day 30. `jes***@hotmail.com` is at day 19.8 today; they fall off the list around **2026-09-13**.

**Measured (live `pg_get_functiondef`, 2026-09-02):**

```sql
-- arm 1: never confirmed
where c.email_confirmed_at is null
  and c.created_at < now() - interval '2 hours'
  and c.created_at > now() - interval '30 days'   -- ← forgets here
-- arm 2: confirmed but never linked to a clientes row
where c.email_confirmed_at < now() - interval '24 hours'
  and c.email_confirmed_at > now() - interval '30 days'   -- ← and here
```

Nothing else in the system tracks a wedged member. `auth.audit_log_entries` is **empty** (0 rows,
table-wide — re-derived live this round; prior register **P-089**, marce-triage §1), and the log
stream holds 24 h. So the 30-day window is not a *display* filter over a durable record; past day 30
the fact is unrecoverable from anything but a hand-written query against `auth.users`.

**Why the bound exists and why it is wrong at this size.** The bound is there so the list does not
fill up with ancient abandoned signups. At 37 real accounts in the whole 2026-08-15+ window
(`01-live-snapshot.md` §F), the list has nothing to fill up with — it returned 3 rows today. The
bound is buying noise-suppression this project cannot spend.

**Member-visible symptom.** None, ever. That is the point: the member sees a login form that does
not work and stops trying. This is the same shape as the 2026-08-30 Sarahí wedge (34 h) and the
"one 17 days" case in prior register **P-064** — both of which were inside 30 days and were still
only found because a human complained.

**Breaking point.** Component: `public.registros_atorados()`. Breaks at: day 30 after a member's
`created_at` / `email_confirmed_at`. Concretely: `jes***@hotmail.com` ≈ 2026-09-13,
`pau***@hotmail.com` ≈ 2026-09-23. Bound by: nothing — there is no second detector.

**Fix hint.** Widen arm 1's outer bound to 365 days and add `filas_roster` (already returned) to the
ordering, or drop the outer bound entirely and cap the *alert body* at the 10 worst. Either way the
row must stay queryable after 30 days.

---

## 4. Supabase Free pauses after 7 days of low activity, and the app fails SOFT to an unbranded generic page rather than an error — severity 4

**Claim.** Three months with no use is, for a Free-plan Supabase project, three months **paused**.
The pause itself warns (two emails). What does not warn is the app: when the database is unreachable,
`resolveTenant` swallows the error and returns `null`, so `red.ibookit.lat` renders the generic
`DEFAULT_BRAND` "Gimnasio" chrome instead of RED — a working-looking page belonging to nobody. And
the one-click restore window closes 90 days after the pause, which lands just past the three-month
mark.

**Measured — the fail-soft.** `packages/data/src/server/resolve-tenant.ts:149-153`:

```ts
const { data: gymId, error } = await client.rpc("gym_id_por_host", { p_hostname: hostname, p_app: app ?? null });
if (error) return { value: { matched: false, tenant: null }, cacheable: false };
```

An RPC error and "this host belongs to no gym" are the same value to every caller. The function's own
doc comment (`:180-183`) then specifies the consequence: *"3. NO tenant (`null`) — chrome falls back
to `DEFAULT_BRAND`"*. The `cacheable:false` flag is a good, deliberate detail — a blip does not pin
the wrong resolution for 60 s — but it does not make the failure visible.

**Primary source — the pause policy.** https://supabase.com/docs/guides/platform/free-project-pausing
(fetched via `search_docs`, 2026-09-02): *"Supabase pauses Free Plan projects that show low activity
over a 7-day period"*; *"Supabase sends two emails to the project owner … A warning email roughly one
week before the pause takes effect. A confirmation email once the project has been paused"*; *"You can
restore a paused project for up to 90 days after it was paused"*.

**Is the project on Free?** Not directly measurable from this seat. The supporting evidence:
`AGENTS.md` states as repo fact that *"preview branching is Pro-gated / 402; the free tier fits
exactly one scratch beside live"*; `pg_replication_slots` returns exactly one slot
(`supabase_realtime_messages_replication_slot_…`, logical, pgoutput) and **no physical/PITR slot**;
and the reachability TODO's O7 ("Supabase dashboard: which plan?") is still unchecked as of HEAD.
Tag: **reasoning, not sourced — the experiment that settles it is one look at Supabase → Billing.**

**Member-visible symptom.** Day ~14 of a dormant gym: a new member taps the invite link and lands on
a page that is *not* RED. Not an outage page — a generic gym page, with the platform's default
tokens, a "Hoy no hay clases programadas" body, and a login form that fails. Nothing on the screen
says "we are down"; it says "you are in the wrong place".

**Breaking point.** Component: the Free-plan Supabase project `hjppxawglmukfvsgmcog`. Breaks at:
~day 7–14 of no database activity (pause), and again at ~day 104 (90-day one-click restore window
closes, if paused at day 14). Bound by: Supabase's 7-day activity assessment. Warns: **yes**, twice,
by email to the project owner only.

**Fix hint.** For the pause, the cheapest keep-alive already exists — the daily alert cron issues a
`database/query` against the project every run; making that cron actually run (finding 2) is the same
fix. For the fail-soft, give `resolveTenant`'s error branch a `console.error` so a paused/degraded DB
is at least distinguishable from an unmapped host in whatever log surface exists.

---

## 5. The member agenda never materializes — so the class week goes silently empty six weeks after the cron stops — severity 4

**Claim.** The admin agenda materializes weeks on demand; the member agenda deliberately never does.
The member's week is therefore whatever the Monday `pg_cron` job last wrote. That job writes six
weeks (indices 0..5). If it stops — and it stops the moment the project pauses — the member-facing
class week goes empty six weeks later, with no message and no distinguishing signal from "the gym
scheduled nothing".

**Measured — the asymmetry.** `packages/data/src/server/agenda.ts:305-311` (`ensureSemanaMaterializada`,
called by every admin read) vs `packages/data/src/server/agenda-miembro.ts:37` and `:321`, which say
in the file's own words: *"this one has NO operator check and NEVER materializes"* and *"NEVER
materializes — a member reads only what"* exists. `grep -rn "ensure_week_materialized"` over
`packages/data/src` returns exactly one non-test call site: `agenda.ts:309`.

**Measured — the horizon today (live SQL):**

| gym | future sessions | last `starts_at` |
|---|---|---|
| red | 125 | `2026-10-10 14:15:00+00` |
| red-demo | 112 | `2026-10-10 17:30:00+00` |
| forge-demo | 5 | `2026-10-07 13:30:00+00` |
| **forge** | **0** | `2026-09-02 01:00:00+00` (already past) |

RED's horizon ends **day 38**. That is exactly the cron's 6-week window
(`cron_materialize_horizon`, `for o in 0..5`, live `pg_get_functiondef`).

**Measured — the cron is healthy today.** `public.cron_run_log` holds 5 rows, all `errors=0`:
`2026-08-05 07:43:42` (bootstrap), then `08-10`, `08-17`, `08-24`, `08-31`, every one at
`08:00:00.1–0.2Z`. `cron.job` holds exactly one job: `roll-class-horizon`, `0 8 * * 1`, `active:true`.
So the mechanism works; it is the *dependency on the project being awake* that is the decay.

**Measured — `forge` is already in the failure state.** `forge` has **0 active `schedule_template`
rows**, so the cron's `where exists (… st.is_active)` filter excludes it entirely and it has zero
future sessions. It survives only because `forge.booking_enabled = false` (live query) means members
never see a booking surface there. That is a coincidence, not a guard.

**Member-visible symptom.** Day 38+ (or 6 weeks after any pause): a new RED member activates, lands
on `/reservar`, and sees a week with no classes in it. `HORIZONTE_SEMANAS` and the "past the horizon
vs genuinely empty" distinction exist (`agenda.ts:285-289`, #243) — **for the operator's Agenda**.
The member's `reservar-semana` has no equivalent; an unmaterialized week and a gym that scheduled
nothing render identically.

**Breaking point.** Component: `public.cron_materialize_horizon()` via `pg_cron` job 1, read by
`getAgendaSemanaMiembro`. Breaks at: last successful run + 6 weeks. With today's data: **2026-10-10**
if the Monday job never runs again. Bound by: the 0..5 week claim window in the function body.

**Fix hint.** Cheapest honest fix is not to materialize on the member path (that would let a member
write rows) — it is to surface the horizon: if the requested week is past `max(class_session.starts_at)`
for the gym, render "todavía no publicamos esta semana" instead of an empty grid. Second, add
`gym_horizon_depth` (the ops view already exists — `comment on view public.gym_horizon_depth is
'Ops health check for the #136 weekly auto-roll…'`, seen in `pg_stat_statements`) to whatever the
alert cron watches, once the cron is alive again.

---

## 6. 63 of RED's 66 members lapse inside the three-month window, and a lapsed member still logs in and still sees a bookable-looking week — severity 3

**Claim.** After three months of dormancy essentially the whole roster is expired. Expiry does not
touch login: `gym_membership` has no expiry column and **none of the 156 live sessions carries a
`not_after`**. So the member gets in, sees the agenda, and only learns the plan is dead at the moment
they try to book — or by opening the profile overlay, which they have no reason to.

**Measured (live SQL, 2026-09-02):**

| gym | clientes | reclamados | `vence < today` | `vence < today+90` | max `vence` |
|---|---|---|---|---|---|
| red | 66 | 43 | 17 | **63** | 2027-01-07 |
| red-demo | 43 | 6 | 27 | 41 | 2026-10-09 |
| forge | 50 | 2 | 21 | 50 | 2026-09-30 |
| forge-demo | 24 | 1 | 15 | 24 | 2026-10-03 |

**63 of 66 (95%) of RED's roster expires before 2026-12-01.** Only three rows reach past the
three-month line, and the furthest is 2027-01-07.

**Measured — sessions never expire server-side.**

```sql
select count(*) from auth.sessions;                        -- 156
select count(*) from auth.sessions where not_after is not null;  -- 0
select min(created_at) from auth.sessions;                 -- 2026-07-11 20:29:21Z  (53 days, still live)
select min(updated_at) from auth.refresh_tokens where revoked = false; -- 2026-07-30 05:13:40Z (34 days)
```

Zero of 156 sessions are time-boxed. This re-derives prior register **P-125** / ADR-0016 §Decision 1-2
("all six `auth.sessions` rows `not_after=null`") at 26× the sample size, and it is *by owner ruling*
(ADR-0016 §Amendment 2026-08-24: members must stay logged in across multi-week absences). So this is
not a defect — it is the reason the next sentence matters.

**Measured — the cookie.** `@supabase/ssr@0.10.3`, `dist/main/utils/constants.js:10`:
`maxAge: 400 * 24 * 60 * 60`. `SUPABASE_COOKIE_OPTIONS` (`packages/data/src/cookie-options.ts:36`)
overrides only `name` and `secure`, so 400 days is what ships. A three-month absence does not expire
the cookie on desktop. On iOS Safari, Apple's ~30-day website-data eviction for sites with no user
interaction does remove it — **documented behaviour, not measured here**; the experiment is a real
iPhone left untouched for 31 days, or a `Storage.evictAllRecords` run in the WebKit inspector.

**Where the code is honest, and it is.** The lapsed state is handled correctly everywhere I looked:
`supabase/functions-canonical/reservar_clase.sql:85` and `:93` both `raise exception 'Paquete
vencido'` (two guards — today's date and the session's date, so booking a future class on a plan that
expires before it is also refused); `apps/client/src/app/reservar/_components/perfil-overlay.tsx:213`
renders "**Plan vencido** · renueva para reservar"; `apps/client/src/lib/reserva-vista.ts:62-65`
gives each blocked row the label "Vencido"; `saldo-vista.tsx:46-63` says it again.

**The gap.** None of that is on the first screen. `/reservar` renders the week; the "Plan vencido"
line lives in the *profile overlay* (`?perfil=1`) and in `/saldo`. A returning member after three
months sees a normal-looking week of classes with dimmed rows and has to tap one to find out why.

**Member-visible symptom.** "Entré pero no me deja reservar" — with the explanation one tap away
instead of on the screen.

**Breaking point.** Component: `clientes.vence` vs the `/reservar` first paint. Breaks at: 63 of 66
RED rows between today and 2026-12-01; the median is inside 60 days. Bound by: nothing — expiry is
correct, its *placement in the UI* is the issue.

**Fix hint.** Promote the `vencido` state to a banner on `/reservar` itself, above the week. The DTO
already carries it (`getSaldoMiembro` → `membresia.vencido`); this is a render, not a query.

---

## 7. Vercel is on Hobby, which makes the cron's own liveness signal unreadable and caps the cron at once a day — severity 3

**Claim.** The plan is Hobby, and it is Hobby on the record. Three idle-relevant consequences: the
alert cron runs at most once a day (it was written for hourly and says so), runtime logs retain 1 hour
so the "I ran" line the route deliberately writes every run cannot be read, and there are no log
drains to move it anywhere durable.

**Measured — the plan, from this repo's own history.** `git log --oneline -- apps/admin/vercel.json`:

```
860a3893 fix(cron): alertas cron daily at 12:00 UTC — Vercel Hobby caps cron at once/day, hourly schedule was rejected as a paid feature
```

That is a commit message recording a rejection by the platform, not an assumption about the plan.
This is the substitution test's answer to "Vercel handles it": nothing generic about Vercel produced
that line — this account's plan did.

**Measured — the resulting drift between the code and its config.**
`apps/admin/src/app/api/cron/alertas/route.ts:36-38` states: *"SCHEDULE (`apps/admin/vercel.json` —
JSON, so the reasoning lives here): `0 * * * *`, hourly. It was daily at 12:00 UTC until 2026-08-30.
Daily was indefensible once the wedge signal landed: the Iván wedge sat 34h, already 3× that detection
interval."* `apps/admin/vercel.json` at HEAD says `"schedule": "0 12 * * *"`. The file that explains
the reasoning and the file that carries the schedule disagree, and the platform won.

So the detection interval for a locked-out member is **24 hours**, in a design that documented 24 hours
as indefensible. (Finding 2 says it is currently ∞.)

**Measured — the unreadable liveness line.** `route.ts:227-232` writes
`console.warn(JSON.stringify({evento:"registros-atorados", …}))` on **every** run, with the comment
*"Written every run, clean or not — a signal that only appears when it is bad cannot be distinguished
from a signal that stopped running."* Correct reasoning; the channel defeats it. Per the reachability
TODO item 11 (verified there): *"Vercel Runtime Logs retain 1 hour on Hobby, 1 day on Pro, and Log
Drains are Pro-only."* Tag on the retention numbers: **as-recorded from `docs/Context/
2026-08-19-member-reachability-todo.md`, not re-fetched from Vercel's pricing page this round.**

**Member-visible symptom.** Indirect: a wedged member waits up to a day longer than the design
intended, and in practice (finding 2) indefinitely.

**Breaking point.** Component: Vercel Hobby cron + log retention on the `admin` project. Breaks at:
already — 24 h detection interval vs the 1 h the code asks for; 1 h log retention vs "was it alive
yesterday?". Bound by: the plan.

**Fix hint.** Write the liveness line to Postgres, not to `console.warn` — `public.cron_run_log`
already exists and already proves this pattern works (finding 5). That makes the shield's own health a
`select max(ran_at)` and removes the dependency on the plan entirely.

---

## 8. The JWKS pin in the repo is only ever consulted when it is most likely to be stale — severity 3

**Claim.** `fetch-shield.ts` ships a hard-coded copy of the project's public signing key and serves it
whenever `jwks.json` is unreachable. Supabase's signing-key rotation is designed to be zero-downtime
*because* clients re-read the discovery endpoint. This repo's pin opts out of that guarantee for
exactly the case where it matters, and the only thing keeping it fresh is a comment.

**Measured — the pin matches live today.**
`GET https://hjppxawglmukfvsgmcog.supabase.co/auth/v1/.well-known/jwks.json` (2026-09-02 17:33Z) →
one key, `kid: "76da07da-65ca-404a-a1ab-00c3d0b59d38"`, `alg: ES256`, `crv: P-256`,
`x: "WmTwZR8rVIGrBbU2NZuH3Nxx6DjEbyum9Hy9u2a7g6E"`. Byte-identical to `JWKS_FALLBACK` in
`packages/data/src/server/fetch-shield.ts`. **No drift today.**

**Measured — the obligation is human-only.** `fetch-shield.ts` (the block above `JWKS_FALLBACK`):
*"ROTATION OBLIGATION: if the Auth signing key is ever rotated, replace this block in the same
change. A stale pin is only ever consulted while `jwks.json` is unreachable — but there it would hand
auth-js a `kid` it cannot match, and every operator gets bounced to the login form.
`fetch-shield.test.ts` asserts the key still imports."* The test asserts *importability*, not
*identity with live*. A rotated key set plus a stale pin passes `pnpm test`, `pnpm lint`,
`pnpm typecheck` and CI.

**Primary source on why rotation is otherwise safe.**
https://supabase.com/docs/guides/auth/signing-keys — *"revocation is automatic via the key discovery
endpoint"*; the discovery endpoint is edge-cached 10 min + client-cached 10 min, *"cleared every 20
minutes"*. Twenty minutes is the whole exposure for a normal client. For this one the exposure is
"until someone edits the file".

**Why this is an idle finding.** Rotation is a thing that happens *while you are not looking* — a
security incident, a compliance ratchet, a Supabase-side migration. Three months of not touching the
repo is three months in which the pin can go stale with nothing failing until the day
`jwks.json` also stalls (which has happened here: the 2026-08-29 IAD incident, 266 s worst,
prior register **P-063** — that incident is *the reason the pin exists*).

**Member-visible symptom.** Two failures compound: the discovery endpoint stalls (the condition the
shield exists for) *and* the pin no longer matches → `getClaims()` cannot verify → `/reservar`
redirects to `/entrar` → a signed-in member is asked for a password. That is the 465dcf4 symptom
(prior register **P-062**, **P-094**) reproduced by a config drift rather than a code defect.

**Breaking point.** Component: `JWKS_FALLBACK`, `packages/data/src/server/fetch-shield.ts`. Breaks at:
the first Auth signing-key rotation not accompanied by an edit to that block, **and only during a
`jwks.json` outage**. Unmeasured date — Supabase does not rotate on a schedule; the trigger is a
human or an incident. Bound by: `fetch-shield.test.ts`, which cannot see it.

**Fix hint.** One assertion turns this from a comment into a guard: a test (or a line in the alert
cron) that fetches live `jwks.json` and fails when no `kid` in the response matches
`JWKS_FALLBACK.keys[0].kid`. It cannot run in pre-commit (network), but it can run in the daily cron
alongside the three signals already there.

---

## 9. Both edge functions still read the legacy JWT-based keys, which Supabase retires at the end of 2026 — severity 3

**Claim.** The apps have already migrated to the new key model; the two edge functions have not. A
one-click "deactivate legacy keys" in the dashboard — or Supabase's own end-of-2026 cut-off — kills
the auth-mail hook and the fresh-provision activation rail simultaneously, with every test green.

**Measured — the apps are migrated.** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in both
`apps/admin/.env.local` and `apps/client/.env.local` has prefix `sb_publishable` (46 chars; value
never printed) — the new key format, not a JWT.

**Measured — the edge functions are not.** `grep -rn "Deno.env.get" supabase/functions/*/index.ts`:

```
supabase/functions/activar-cuenta/index.ts:36:const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
supabase/functions/send-email/index.ts:31:const supabaseAnonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
```

Both are the legacy JWT-based variables. Note both also use `?? ""` — an unset variable becomes an
empty string and the function starts anyway, failing later at the API call rather than at boot.

**Primary source.** https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys —
*"The legacy `anon` and `service_role` keys keep working until the end of 2026."* And on the new
variables: *"Supabase adds two new ones to your functions' environment, `SUPABASE_PUBLISHABLE_KEYS`
and `SUPABASE_SECRET_KEYS`, alongside the legacy `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`."*

**Member-visible symptom.** `send-email` is GoTrue's auth hook — its failure is *every* confirmation
mail, magic link and password reset for every gym at once. `activar-cuenta` is the fresh-provision
rail — its failure is every invited member who has no auth account yet, i.e. the majority of new
members (prior register **P-098**: all 18 RED members at the 2026-07-27 check had zero auth accounts).
The member sees "NO SALIÓ EL CORREO" (`activar-form.tsx:145-152`) — the same string Marce saw, from a
completely different cause.

**Breaking point.** Component: `supabase/functions/{send-email,activar-cuenta}/index.ts`. Breaks at:
**2026-12-31** by Supabase's stated cut-off (day 120 — just past the three-month line), or **the
instant** the owner clicks "deactivate legacy keys" in Settings → API Keys, whichever is first.
Bound by: nothing in this repo — no test, no guard, no grep-check references these variable names.

**Fix hint.** Two lines, and they can ship today:
`JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!)["default"]` and the publishable equivalent, with a
fallback to the legacy variable during the overlap. Remember `send-email` is not deployed by
`git push` (AGENTS.md pre-push hook) — deploy first, then `EDGE_DEPLOY_OK=1 git push`.

---

## 10. `pnpm test:denial` cannot run remotely — the PAT is dead and the scratch project is gone — severity 3

**Claim.** The migration gate that proves what an RPC *writes* is a documented pre-merge convention
(AGENTS.md), and its remote path is currently non-functional. After three months of not exercising it,
the first migration-bearing change either ships without it or is gated by a local Docker stack that
has itself drifted.

**Measured.** `SUPABASE_ACCESS_TOKEN` from `apps/admin/.env.local` → `GET
https://api.supabase.com/v1/projects` → **HTTP 401** (2026-09-02 17:41Z). The runner requires exactly
that token: `supabase/tests/run-denial-suite.mjs:207` — `FATAL: set SUPABASE_ACCESS_TOKEN and either
SUPABASE_PROJECT_REF or SUPABASE_TARGET_REF` — and talks to the Management API's `database/query`
endpoint (file header). `:211` refuses the live ref outright, correctly.

**Attribution.** Memory `ibookit-app-ui-worktree.md` ("scratch PAT DEAD → local docker path") and
`local-docker-denial-path.md`. **Re-derived at HEAD this round** with a fresh 401 against the API root.

**The second-order decay, which is the idle part.** The runner's own header documents an environment
requirement that rots on its own: *"Its one environment requirement is that TODAY'S
`realtime.messages` partition already exists … the Realtime SERVICE — not SQL, and not this suite —
creates the daily partitions (yesterday..today+3) … on a fresh cloud scratch, open one Realtime
subscription against the project before running it."* Live `pg_inherits` confirms the shape:
partitions `messages_2026_09_01` … `messages_2026_09_05` only — five days, rolling. A Docker stack
that has sat unused for three months has no partition for today either, and the `senal_gym.sql` suite
then stops at `SETUP FAIL` — which reads as a code failure and is an environment failure.

**Member-visible symptom.** None directly. Indirectly: this is the gate that would have caught #78
(the create path dropping the verified `email`) and #80. Its absence is how a write-path defect
reaches a new member's first login.

**Breaking point.** Component: `pnpm test:denial` remote path. Breaks at: already — 401 today.
Bound by: a working PAT plus a scratch project, neither of which exists.

**Fix hint.** Rotate the PAT once (it is also finding 2's fix) and write down which project ref
`SUPABASE_TARGET_REF` should point at, in `AGENTS.md`, next to the command. Two sentences.

---

## 11. The apex has no front door at all — `ibookit.lat` does not resolve and `www.ibookit.lat` hard-fails TLS — severity 2

**Claim.** Not decay — already broken — but it is the fallback door every "the member's network blocks
our host" plan depends on, and it has been broken for at least 14 days with nothing tracking it.

**Measured (2026-09-02 17:27Z):**

```
curl -I https://ibookit.lat/       → curl: (6) Could not resolve host: ibookit.lat
curl -I https://www.ibookit.lat/   → curl: (35) schannel: failed to receive handshake, SSL/TLS connection failed
dns.google A ibookit.lat           → no Answer (SOA only) — no A record at the apex
dns.google A www.ibookit.lat       → CNAME cname.vercel-dns.com → 76.76.21.164, 66.33.60.34
```

`www` resolves into Vercel's edge and dies in the handshake because no Vercel project claims that
hostname, so no certificate exists for it. Safari renders that as "cannot establish a secure
connection", which reads to a member as an attack. Because the handshake dies before the HTTP request,
there is no 404 anywhere to count — this is invisible to us by construction (reachability TODO,
"silent failures" #4).

**Also re-derived at HEAD:** no CAA record on `ibookit.lat` (`dns.google type=257` → SOA only), which
is *correct today* — Vercel's `cname.vercel-dns.com` carries its own CAA and CAA does not climb past
an alias. It arms the moment an apex A record is added. Attribution: reachability TODO "Time bombs",
CAA row; **re-derived this round.**

**Member-visible symptom.** A member who types "ibookit.lat" (the name on the receipt footer and in
every `mailto:` in the marketing candidates) gets nothing. And per the reachability TODO item 8, all
six marketing candidates carry the *wrong* domain (`ibooki.lat`) in `og:url` and every contact link.

**Breaking point.** Component: apex + `www` DNS/TLS. Breaks at: now. Bound by: a Vercel project
claiming both hostnames, which does not exist.

**Fix hint.** Reachability TODO item 7 as written — new static Vercel project, add both hostnames,
apex A record read off the domain card (**never** hardcode `76.76.21.21`), `www` → apex redirect.

---

## 12. Nothing on the auth side self-cleans across an idle period — severity 2

**Claim.** Every auth-adjacent table accumulates and nothing prunes it. The volumes are small, so this
is not an outage; it is the observation that three idle months produce three months of residue and no
process removes any of it, including residue that is actively confusing during an incident.

**Measured (live, 2026-09-02):**

| table | rows | oldest | age |
|---|---|---|---|
| `auth.sessions` | 156 (0 with `not_after`) | `2026-07-11 20:29:21Z` | 53 d |
| `auth.refresh_tokens` | 635 (156 unrevoked) | oldest unrevoked `updated_at` `2026-07-30 05:13:40Z` | 34 d |
| `auth.one_time_tokens` | 8 (`confirmation_token` 6, `recovery_token` 2) | `2026-07-22 22:25:04Z` | 42 d |
| `auth.flow_state` | 64 | `2026-07-06 20:09:20Z` | 58 d |
| `auth.audit_log_entries` | **0** | — | — |
| `realtime.messages` | 56, 5 daily partitions (`2026_09_01`…`2026_09_05`) | — | rolling 5 d |

Two of these matter beyond housekeeping:

- **A 42-day-old `one_time_tokens` row.** GoTrue keeps one token per `(user_id, token_type)`, which is
  the mechanism behind Marce's six-deep "Confirma tu cuenta" stack where only the newest works
  (marce-triage §1, prior register **P-077**, **P-087**). A row that old is dead but occupies the slot,
  and during triage it looks like a live credential until you check the timestamps.
- **`auth.audit_log_entries` = 0, against 213 `auth_audit_logs` lines in the last 24 h of the log
  stream** (measured: `select source, count(*) from logs group by source` over
  2026-09-01T18:00Z → 2026-09-02T17:40Z). The durable table is empty; the readable record is capped at
  24 hours. Attribution: prior register **P-084**/**P-089**, marce-triage §1 — **re-derived this
  round**, and the 213-line figure is new: it quantifies exactly how much is being written to a place
  that forgets. After three months idle, an incident from month 1 is unreconstructable from anything
  but the Resend ledger.

**Member-visible symptom.** None, until someone is trying to work out why a member cannot get in,
three days after the fact.

**Breaking point.** Component: the auth log/token estate. Breaks at: 24 h — the age past which any
auth event on the new-user path is unrecoverable. Bound by: Supabase Free's log retention; no drain.

**Fix hint.** The application-side auth event table already proposed in prior register **P-084** — one
insert per door decision, in our own schema, where it lives as long as we want it to.

---

## 13. Where this is sound — with evidence, and ranked anyway

Honesty outranks severity. These were checked as hard as the findings above and came back clean. Each
is a claim with a cite, not a reassurance.

1. **A missing `realtime.messages` partition after a pause cannot break a write.** This was my leading
   hypothesis for the worst idle failure — the `senal_gym()` triggers fire on `clientes`, `ventas`,
   `asistencias`, `class_session`, `reservation` (15 triggers, `01-live-snapshot.md` §E), so a failed
   `INSERT` into a partitioned table with no partition for today would abort every new-member write.
   **Refuted by the live function body:** `realtime.send` wraps its insert in
   `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM; END`
   (live `pg_get_functiondef(realtime.send)`). The señal dies silently; the sale, the claim and the
   membership all commit. That is the right trade and it is already made.
2. **The live JWKS equals the pinned JWKS.** One key, `kid 76da07da-…`, exact match (finding 8's
   measurement). No drift today.
3. **Live Turnstile is a real production key, not the always-pass test key.** `apps/client/.env.local`
   holds `1x000000000000…` (Cloudflare's documented test sitekey), which would have been a serious
   finding if it had shipped. It did not: `curl https://red.ibookit.lat/registro` and
   `curl https://www.redfunctionaltraining.com/registro` both render
   `sitekey="0x4AAAAAADw0zgE_N--iabPb"`. Both hosts, same key, measured.
4. **Resend is healthy and its DNS is intact.** `GET /domains` → one domain, `ibookit.lat`,
   `status: "verified"`, `capabilities.sending: "enabled"`, region `us-east-1`. DNS re-derived at HEAD:
   `resend._domainkey.ibookit.lat` TXT present (RSA p=…), `send.ibookit.lat` TXT `v=spf1
   include:amazonses.com ~all`, `send.ibookit.lat` MX `10 feedback-smtp.us-east-1.amazonses.com`,
   `_dmarc.ibookit.lat` `v=DMARC1; p=none;`. Delivery over the last 100 messages: 99 `delivered`, 1
   `delivery_delayed`, 0 bounced. The API key is live (`last_used_at` 2026-09-02, by this probe).
   Caveats that are real but not decay: `p=none` with **no `rua=`** (reachability TODO item 3) so
   nothing reports; `open_tracking`/`click_tracking` both **false**, which is why "did she open the
   link" was unanswerable in the Marce triage (prior register **P-085**).
5. **The weekly class-horizon cron is working.** Five `cron_run_log` rows, every Monday 08-10 through
   08-31 at `08:00:00.1Z`, `errors=0` throughout; `cron.job` has one active job. Finding 5 is about
   what happens when it *stops*, not about it being broken.
6. **The invite rail is the one door that does not decay.** Claim codes have no expiry by decision
   (ADR-0015; prior register **P-028**, **P-123**), and the activation token is minted *and consumed*
   server-side in the same request (**P-124**, **P-100**), so neither the ~1 h link window nor a mail
   scanner is in play. Measured: 26 live `claim_code` rows at RED, 18 of them already mailed and not
   yet claimed, oldest invite `2026-08-05`. Every one of those 18 still works after three months. That
   is a deliberate trade (a forwarded link is a full credential — **P-096** H3, accepted under #126),
   and it is the reason a dormant gym can restart without re-inviting anybody.
7. **The lapsed-member refusal is correct at every layer** — two date guards in `reservar_clase.sql`
   (`:85`, `:93`), "Plan vencido · renueva para reservar" in the overlay, "Vencido" on the row. Finding
   6 is about *placement*, not correctness.
8. **`www.redfunctionaltraining.com` survives the October cliff** (`notAfter Nov 26 2026`), so RED's
   primary member-facing domain is not in finding 1's blast radius. Its admin desk
   (`red-admin.ibookit.lat`) is.

---

## Answers by Q-number

**Q4 — If the project sat 3 months with no use, where are the breaking points?** This whole document.
The short form, in date order:

| day | date | what breaks | new member sees | warns? |
|---|---|---|---|---|
| 7–14 | 2026-09-09..16 | Supabase Free pauses (7-day low activity) | generic unbranded "Gimnasio" page, no error (finding 4) | **yes** — 2 owner emails |
| 11 | 2026-09-13 | oldest wedged member ages out of the only detector (finding 3) | nothing — they were already invisible | no |
| 21 | 2026-09-23 | Vercel's cert-renewal window closes (finding 1) | nothing yet | no |
| 35 | **2026-10-07** | **all 9 `ibookit.lat` certs expire** (finding 1) | browser cert interstitial; both admin desks dead too | no |
| 38 | 2026-10-10 | class horizon runs out if pg_cron stopped (finding 5) | empty week, no explanation | no |
| ~60 | mid-Oct | most of RED's roster is `vencido` (finding 6) | bookable-looking week that refuses at the tap | no |
| ~91 | 2026-12-02 | 63/66 RED members lapsed | — | no |
| ~104 | 2026-12-15 | Supabase 90-day one-click restore closes (finding 4) | — | no |
| 120 | 2026-12-31 | legacy anon/service_role keys retired → both edge functions (finding 9) | "NO SALIÓ EL CORREO" on every door | no |

Things that do **not** break in three months, with evidence: refresh tokens and sessions (0 of 156
carry `not_after`), the auth cookie on desktop (400-day `maxAge`), claim codes and invite links (no
expiry by design, 18 live at RED), Resend's domain verification, the JWKS pin (matches live today),
DNS for every mapped host, the Turnstile production key.

The single sentence that matters: **of the nine dated fuses above, exactly one warns first, and the
thing that was built to warn about the rest is itself silent today while three real people are locked
out (finding 2).**

---

## Could not determine

| question | the experiment that settles it |
|---|---|
| Is the Supabase org actually on Free? Everything in finding 4 is conditional on it. | Open Supabase → Organization → Billing. Or `GET /v1/organizations` with a **live** PAT — the one in the repo 401s. |
| Is the alert cron enabled in Vercel at all, and what did its last invocation return? | Vercel → `admin` project → Cron Jobs → last run status + response code. This is the one read that converts finding 2 from "silent, cause unproven" to a named cause. |
| Is PITR / any backup configured? No physical replication slot exists, but Supabase's PITR does not necessarily surface as one. | Supabase → Database → Backups. Free plan has none per the Production Checklist. |
| Live `MAILER_OTP_EXP`, `refresh_token_reuse_interval`, email rate limits. `supabase/config.toml` is local-dev only (`site_url: http://127.0.0.1:3000`, `:159`). | Supabase → Authentication → Rate Limits / Email. Prior register **P-052** carries the assumed values (3600 / 10 s); they were never read from the live control plane. |
| How many hostnames does the Turnstile widget allow, and does `www.redfunctionaltraining.com` appear in that list? Memory `vercel-domain-scale-verdict.md` puts the ceiling at 10 hostnames per widget. | Cloudflare → Turnstile → the `0x4AAAAAADw0zgE…` widget → Hostname Management. Cheap proxy: load `/registro` on the custom domain in a real browser and watch for Turnstile error `110200` (domain not allowed). |
| Does an iOS Safari member actually lose the session at ~30 days idle? | An iPhone left untouched for 31 days, or `Storage → evict all` in the WebKit inspector, then reload `/reservar`. |
| Which host is set as the Supabase **Site URL**, and does it survive the Oct 7 cliff? `docs/runbooks/hitl-72-resend-live.md` §C1 pins it to `https://red.ibookit.lat` — a host in finding 1's blast radius. | Supabase → Authentication → URL Configuration. |
| Does `pg_stat_statements` eviction explain the missing cron query, or is the cron genuinely not running? | `alter system set pg_stat_statements.max = 10000` is a mutation and out of scope here. Settle it from the Vercel cron log instead. |

---

## Blind spots — what I did not examine

- **Anything in the Vercel or Supabase control planes.** No dashboard access this session. Every plan,
  toggle, cron status, rate limit, redirect allow-list and env-var value in this document is either
  inferred from repo evidence or explicitly tagged unmeasured.
- **The `activar-cuenta` edge function body.** I read only its `Deno.env.get` lines (finding 9). Its
  logic, HMAC handling and failure modes were not reviewed — T6 owns decay, not correctness.
- **Whether the *Vercel* `SUPABASE_ACCESS_TOKEN` is the same string as the dead local one.** I proved
  the local one is 401. I did not prove they are the same value, and finding 2's argument is
  constructed so it does not depend on that.
- **Resend beyond the newest 100 messages.** I did not page past `has_more:true`. The gatherer paged to
  194 (back to 2026-08-04) and its subject list also contains no alert mail, but I did not re-page.
- **`apps/mobile/`** (untracked). Out of scope by the task's own framing, and it has its own session
  storage lifecycle that this document says nothing about.
- **Migration-body drift.** `01-live-snapshot.md` §B measured 122/148 applied versions with no matching
  repo filename. I did not check whether that renumbering interacts with anything on a three-month
  timeline; it is a "next time someone runs `db push`" hazard, not an idle one.
- **Namecheap registrar state** (auto-renew, lock, 2FA, registrant verification). RDAP exposes none of
  it and I have no panel access; the domain expiry `2027-07-09` is outside the window either way.
- **Storage buckets, if any.** `storage_logs` showed 7 lines in 24 h, so something touches Storage; I
  did not look at what, or whether anything there expires.
- **Load/stress behaviour.** T3's territory, not mine — I asserted nothing about it.

---

## Draft audit — sentences cut or retagged, and the rule that caught each

1. **Cut:** "Supabase pauses free projects, which is standard for the free tier and well understood."
   → Rule 4 (the incumbent is a candidate). "Standard" survives the substitution test — it says nothing
   about *this* project. Replaced with the primary URL, the 7-day/90-day numbers, and the two things
   only this code does: `resolveTenant` returning `null` on an RPC error, and `DEFAULT_BRAND` painting.
2. **Retagged:** "The alert cron is dead." → **"The alert cron is silent; the cause is not proven."**
   Rule 5 (cite or drop). I have the Resend zero (measured), the wedge rows (measured), the 401 PAT
   (measured) and the absent `pg_stat_statements` entry (measured, with an eviction caveat). I do not
   have a Vercel cron log. The claim was narrowed to what the evidence carries and the settling
   experiment named.
3. **Cut:** "A missing `realtime.messages` partition after a pause would break every new-member write."
   → Rule 7 (never invent a finding) and rule 5. I wrote it, then read `realtime.send`'s live body and
   found the `EXCEPTION WHEN OTHERS THEN RAISE WARNING` wrapper. It was going to be finding 2. It is
   now §13 item 1, stated as sound, with the body quoted.
4. **Cut:** "Turnstile ships with the always-pass test key in production." → Rule 5 / rule 7. True of
   `apps/client/.env.local`; **false in production** — both live hosts render
   `0x4AAAAAADw0zgE_N--iabPb`. An unsupported criticism is cut exactly like an unsupported
   reassurance, so it moved to §13 item 3 as the honest version.
5. **Retagged:** "Vercel Hobby retains runtime logs for 1 hour." → tagged **as-recorded** from
   `docs/Context/2026-08-19-member-reachability-todo.md` item 11 rather than presented as measured.
   Rule 5's qualitative-premise clause: I measured the *plan* (commit `860a3893`), not the retention.
6. **Retagged:** "iOS Safari evicts the session at 30 days." → tagged **documented behaviour, not
   measured here**, with the experiment. Rule 5. The 400-day cookie `maxAge` beside it *is* measured
   (`@supabase/ssr@0.10.3 constants.js:10`).
7. **Cut:** "The certs expire in ~49 days." → Rule 1/rule 2 and the reuse rule. That is the
   2026-08-19 audit's number, stale by 14 days. Replaced with a fresh nine-host probe at HEAD and
   **35 days**, with the prior audit attributed by row (**P-109**) rather than silently re-used.
8. **Cut:** "The `.nvmrc` pins Node 24.16.0, the version that fork-bombs `next dev`." → Rule 1
   (rank, don't rate) and keep-it-lean. True, and irrelevant to three months of idleness: `next dev`
   is banned by AGENTS.md and Playwright's `webServer` runs `next build && next start`. It is not a
   decay finding and it was crowding out one that is.
9. **Cut:** "`engines: node >=22.13 <25` will fail the Vercel build when the default runtime moves."
   → Rule 5. Vercel pins the Node version per project; nothing here shows it changes on its own. It
   would have been "reasoning, not sourced", and the reasoning was thin.
10. **Retagged:** "The project is on the Supabase Free plan." → **reasoning, not sourced**, with three
    supporting observations (AGENTS.md's 402 statement, no physical replication slot, O7 still open)
    and the one-look experiment. Rule 5. Finding 4's severity is stated as conditional on it.
