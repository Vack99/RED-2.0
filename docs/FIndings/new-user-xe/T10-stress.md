# T10 — the new-user path stressed to the top (Q3)

Territory T10. HEAD = `33c9087a`. Live project = `hjppxawglmukfvsgmcog` (SELECT-only). All
member emails masked. Written 2026-09-02.

Three stress scenarios, as briefed:
- **S1** — one gym onboards **200 members in an afternoon** at the desk.
- **S2** — **10 gyms** do S1 **the same day**.
- **S3** — a **viral signup day**: members arrive through `/registro` / `/activar` on their own.

---

## 0. The answer up front

**The single component that binds first is Resend's Free-plan 100-emails-per-day cap, and the
number is 50.** The desk fires exactly two Resend calls per new-member sale
(`apps/admin/src/app/(app)/vender/actions.ts:61-69` — `Promise.all([resolverInvitacion,
enviarReciboDeVenta])`), so **the platform can onboard 50 new members per day across ALL gyms
combined**. S1 dies at member #50 of 200. S2 dies at gym #1's member #50. There is no queue, no
retry and no outbox anywhere (`packages/data/src/server/invitaciones.ts:46-92`), and the desk
operator cannot tell "the platform's daily mail budget is spent" from "that address is bad",
because `InviteState` has no reason field (`packages/data/src/server/ventas.ts:136-140`).

The second thing to break is not a quota — it is a query plan. `gym_membership`'s two permissive
SELECT policies OR together into a predicate Postgres **cannot index**, so every member page load
scans the *whole platform's* membership table and calls `is_staff_of()` **once per row**. Measured
live: `loops=58`, 194 shared buffers, 2.125 ms — on a 58-row table. That cost is linear in total
platform membership, not in the member's own gym, so RED's members get slower when Forge onboards.

Everything else — Postgres connections, Realtime, PostgREST, Vercel, the signal rail — has more
headroom than those two.

---

## 1. The breaking-point table

Ranked by which pops first under S1/S2/S3. "breaks at" is the number; "bound by" is what sets it.

| # | Component | Breaks at | Bound by | Breaks FIRST? |
|---|---|---|---|---|
| 1 | **Resend account daily cap (Free)** | **50 new members/day, platform-wide** (100 mails / 2 per sale) | Resend plan quota; 2 concurrent sends per sale at `vender/actions.ts:61-69`; no queue/retry at `invitaciones.ts:46-92` | **YES — this is the binding constraint** |
| 2 | **`gym_membership` RLS (unindexable OR + per-row `is_staff_of`)** | **~14,000 membership rows** -> >1 s of pure RLS per `/reservar`; already 2.125 ms at **58 rows** | measured plan below; `inquilino.ts:78-81` and `agenda-miembro.ts:141` both send **zero** predicates | Second — and the one that never recovers on its own |
| 3 | **GoTrue project-wide auth-email bucket** | **30 new users/hour** (Supabase documented default under custom SMTP); repo runbook claims a configured 50/hr — unread this round | "Sum of combined requests", project-wide, one bucket for every tenant | Third; binds S3 at 30–50 signups/hr |
| 4 | **Cloudflare Turnstile hostname cap** | **~10 hostnames; 8 already used** -> ~1 more gym | one shared widget; `verificarTurnstile` fails CLOSED (`apps/client/src/lib/turnstile.ts:22,38`) | Not throughput — a cliff. Members at hostname #11 cannot activate or register at all |
| 5 | **`send-email` hook 5 s total budget** | **1 slow Resend call** (the fetch at `send-email/index.ts:115` has **no timeout**; compare `invitaciones.ts:58`) | Supabase Auth Hooks: "time budget of 5s for the entire webhook invocation, including retry requests" | Fifth; the amplifier that turns a burst into Marce's failure screen |
| 6 | **Realtime peak connections (Free)** | **200 simultaneous member tabs, platform-wide**. RED alone holds 183 `clientes` rows | Supabase Realtime pricing: Free quota 200 peak connections, no over-usage | Degrades quietly (`client-senal.ts:213` logs `console.warn` and stops) |
| 7 | **`mi_membresia` seq-scan on `ventas`** | measured **max 1,155 ms today** at 300 rows; 0.68 us/row => **~68 ms at 100k rows**, per call, per render | no `ventas(cliente_id)` index (confirmed live) | Sixth; a latency tax, not a cliff |
| 8 | **Signal-rail fan-out (1 write -> N refreshes)** | **N x 18–20 PostgREST round trips per write**, damped only by a **600 ms client-side** debounce | `client-senal.ts:170` `debounceMs = 600`; no server-side fan-out limit exists | Seventh; harmless at today's N, quadratic-feeling at S2 |
| 9 | **Postgres connections / PostgREST pool** | **`max_connections = 60`** (measured); 17 in use, PostgREST holds 7 | Free-tier compute: `shared_buffers` 224 MB, `work_mem` 2.1 MB, `max_parallel_workers` 2 | Eighth; the tail (`mi_membresia` max 1.15 s) is what fills it, not the count |
| 10 | **`resolveTenant` amplification** | **~7 tenant reads per member read** (measured 9,200 `gym_id_por_host` + 39,102 `gym`/`gym_domain` selects vs 1,255 `mi_membresia`) | 60 s TTL / 500-entry **in-isolate** cache, defeated by serverless isolate churn | Ninth; it multiplies #9 rather than breaking alone |
| 11 | **Single pinned region (`pdx1`) + unpinnable proxy** | unmeasured — no concurrency ceiling read; **measured** 96 of 156 sessions from AWS ranges across **92 distinct IPs**, including us-east-1 ranges | `apps/{client,admin}/vercel.json` `"regions": ["pdx1"]`; middleware cannot be region-pinned | Tenth |
| 12 | **Gym provisioning has no API** | **~4 manual console steps per gym** (Vercel domain x2, `gym_domain` SQL, Supabase redirect URL, Turnstile hostname) | no RPC creates a gym; no wildcard domain exists yet | S2 is **human-bound, not throughput-bound** — it cannot happen at all today |
| 13 | **`next_folio` counter row lock** | **~16 sales/second per gym** (1 / measured `registrar_venta` 41–77 ms mean) | `next_folio.sql` UPDATEs one `gym_folio_counter` row, lock held to commit | Never reached at human pace — recorded so nobody "optimises" it first |

---

## 2. Findings, worst first

### T10-stress-01 — 2 emails per sale x 100/day = the platform onboards 50 members a day, and the desk cannot see the wall

**Claim.** Every new-member sale fires two Resend calls concurrently. On Resend's Free plan
(100 emails/day) the platform's *entire* onboarding capacity — all gyms, all days — is 50 members.
There is no queue, no retry and no outbox, and the daily-quota reason is thrown away before it
reaches the operator's screen.

**Member-visible symptom.** Members #51–#200 pay at the desk, get a receipt printed on screen, and
**never receive the invite email or the receipt email**. They cannot activate. The operator sees the
same red "fallo" chip they'd see for a typo, so they keep selling.

**Evidence.**
- `apps/admin/src/app/(app)/vender/actions.ts:61-69` — `const [invite, reciboEmail] = await
  Promise.all([resolverInvitacion(result), enviarReciboDeVenta(...)])`. Two sends, one sale.
- `packages/data/src/server/invitaciones.ts:46-92` — `resendTransport`: one `fetch`, 10 s abort,
  **no retry**; 429 is decoded into `rate_limit_exceeded` / `daily_quota_exceeded` and returned as a
  value.
- `apps/admin/src/app/(app)/vender/actions.ts:114` — `return envio.ok ? {estado:"enviada", email} :
  {estado:"fallo", email}` — the decoded reason is discarded here.
- `packages/data/src/server/ventas.ts:136-140` — `InviteState` is
  `"enviada" | "fallo" | "sin-email" | "no-aplica"`. No reason field exists to carry it.
- Live Resend ledger (paged `GET https://api.resend.com/emails?limit=100`, 194 unique messages,
  2026-08-04 -> 2026-09-02): peak day **37 mails on 2026-08-13**; mean 6.5/day. Composition:
  74 receipts, 63 invites, 45 "Confirma tu cuenta", 10 "Restablece", 2 "Continua en tu cuenta".
- Live probe of the account's own rate-limit headers with the prod key
  (`GET /emails?limit=1`): `ratelimit-policy: 10;w=1`, `ratelimit-limit: 10`. **10 requests per
  second** — measured on this account, this key, this round.

**Basis.** measured (code + live ledger + live header probe). The **100/day plan cap itself is
asserted** — carried from `docs/Context/2026-07-22-invite-mail-capacity-audit.md` §2 and
`docs/research/2026-09-01-email-deliverability-build-vs-buy.md` line 27; Resend's API exposes the
per-second policy but not the plan quota, so whether the account is still Free is **unmeasured —
experiment: open the Resend dashboard billing page, or send the 101st mail of a UTC day and read
the `name` on the 429.**

**Breaking point.** 50 new members/day, platform-wide, all gyms combined.

**Fix hint.** Two lines and a plan change: widen `InviteState` to carry `motivo` so the desk can
show "el correo del gimnasio esta al tope hoy", and move Resend off Free before the 3rd gym.
Attribution: this is the prior audit's recommendation #1 (2026-07-22, "1. Resend Free -> Pro"),
re-derived at HEAD this round.

---

### T10-stress-02 — every member page load scans the whole platform's `gym_membership` and calls `is_staff_of()` once per row

**Claim.** `gym_membership` has two permissive SELECT policies. They OR into
`(user_id = (select auth.uid())) OR (select is_staff_of(gym_membership.gym_id))`. The second arm is
a correlated subplan, so the predicate is **structurally unindexable** — Postgres must evaluate it
for every row, and both member-path readers send **no `WHERE` clause of their own**, leaving RLS as
the only filter. Page cost is therefore linear in the *platform's* membership count, not the
member's gym.

**Member-visible symptom.** `/reservar` gets slower for RED's members every time any *other* gym
onboards. At the S2 scale it is a visibly slow first paint; past ~14k rows it is a page that takes
over a second in RLS alone before a single class card is fetched.

**Evidence (all live this round).**
- Policies: `select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid =
  'public.gym_membership'::regclass` -> `gym_membership_self_select: (user_id = (SELECT auth.uid()))`,
  `gym_membership_staff_select: (SELECT is_staff_of(gym_membership.gym_id))`.
- Plan, `EXPLAIN (ANALYZE, BUFFERS)` of that exact OR:

```
Seq Scan on gym_membership (actual time=1.999..2.000 rows=0 loops=1)
  Filter: ((user_id = (InitPlan 1).col1) OR (SubPlan 2))
  Rows Removed by Filter: 58
  Buffers: shared hit=191
  SubPlan 2
    ->  Result (actual time=0.034..0.034 rows=1 loops=58)
          Buffers: shared hit=190
Execution Time: 2.125 ms
```

  **`loops=58`** — one `is_staff_of()` call per row, and those calls own 190 of the 194 buffers.
- Not a small-table artifact: with `set local enable_seqscan=off` the plan becomes
  `Index Only Scan using gym_membership_pkey ... Filter: ((user_id = ...) OR (SubPlan 2))` — still a
  full traversal with the filter applied to every row, no index *condition*. The OR cannot be
  turned into a BitmapOr because the staff arm is a function call.
- `pg_stat_user_tables`: `gym_membership` — **seq_scan 748,351, seq_tup_read 10,327,121,
  idx_scan 31,896, n_live_tup 58**. 13.8 rows read per scan, i.e. the whole table, every time.
- Both member-path readers pass no predicate:
  `packages/data/src/server/inquilino.ts:78-81` —
  `.from("gym_membership").select("gym_id, created_at, gym(...)").order("created_at")`;
  `packages/data/src/server/agenda-miembro.ts:141` —
  `.from("gym_membership").select("gym_id").limit(1).maybeSingle()`.
- `/reservar` calls `getEsMiembro` **and** `resolverMiembroGym` — at least 2 of these per render
  (`apps/client/src/app/reservar/page.tsx:57,74-78`).

**Basis.** measured for the plan, the loop count, the table stats and the call sites.
**Modelled for the extrapolation**, inputs named: 2.125 ms / 58 rows = **36.6 us/row**, held
constant (`is_staff_of` itself reads an indexed ~3-buffer lookup, so it should not degrade), x 2
reads per render.

**Breaking point.** 2,000 rows (S2: 10 gyms x 200) -> ~73 ms per read, **~146 ms of pure RLS per
`/reservar` render**, up ~34x from today. 1 s of RLS overhead per render at **~14,000 membership
rows**. This is prior finding P-104 / memory `auth-structure-scale-audit.md` ("275,638 seq scans vs
867 idx on a 9-row table") — **re-derived at HEAD and grown 2.7x in scans while the table grew
6.4x** — and it is the concrete instance of memory `adr-0013-rls-per-row-claim-is-false.md`
(ADR-0013 §2/§3 claim correlated subplans do *not* run per row; the `loops=58` above refutes that).

**Fix hint.** Give both readers the predicate they already know (`.eq("user_id", uid)` on the member
path), so the index condition runs before the OR. That alone converts an O(platform) scan into an
O(1) index probe without touching a policy.

---

### T10-stress-03 — the auth-email bucket is one project-wide counter shared by every tenant, and the documented default under custom SMTP is 30 new users/hour

**Claim.** Supabase's rate-limit table lists "All endpoints that send emails"
(`/auth/v1/signup`, `/auth/v1/recover`, `/auth/v1/user`) as limited by **"Sum of combined
requests"** — a single project-wide bucket, not per user, not per gym. A viral signup day at one
gym starves password resets at every other gym.

**Member-visible symptom.** Member #31 (or #51) of the hour at *any* gym sees
"NO SALIO EL CORREO"; a member at a *different* gym trying to reset a password sees the same thing,
with nothing in their own gym's behaviour to explain it.

**Evidence.**
- Primary: supabase.com/docs/guides/deployment/going-into-prod#auth-rate-limits, read this round —
  the row "All endpoints that send emails ... Limited By: **Sum of combined requests**".
- Primary: same page, Availability section — "The default rate limit for auth emails when using a
  custom SMTP provider is *30 new users per hour*. If you are doing a major public announcement,
  you will likely require more than this."
- The same table also gives **`/auth/v1/otp` — "Last request" — 60 seconds window before a new
  request is allowed**. That is the exact throttle the Marce triage caught
  (`docs/FIndings/2026-09-02-marce-triage.md` §7 H6, register row P-076): `/registro` then
  `/activar` 32 s later -> `over_email_send_rate_limit`.
- **Correction to the prior model:** `/auth/v1/otp` has its *own* project-wide bucket of
  **360 OTPs/hour**, and is **not** in the "endpoints that send emails" list. The 2026-07-22 audit
  (point 4) and register row P-069 treat the magic-link rail as drawing on the same 50/hr email
  bucket. Per the current docs table it does not.
- The `cuenta_existente` magic-link rail at `apps/client/src/app/activar/actions.ts:85` calls
  `enviarMagicLink` **without** passing through `permitirReenvio` — a grep of
  `permitirReenvio|enEsperaReenvio|registrarReenvio` finds callers only in
  `entrar/actions.ts:84`, `registro/actions.ts:97` and `registro.ts:149,177`. So the one rail that
  produced the live 429 is the one rail with no app-side counter in front of it.
- The app-side counter that does exist is explicitly best-effort: `reenvio-limite.ts:29-31` —
  5 min/address, 5/UTC-day, in a **module-level `Map`**, so N warm serverless instances allow Nx
  the rate and a cold start forgets everything (the file says so itself).

**Basis.** measured for the code paths and the doc text. The project's **configured** value is
**unmeasured — experiment: Dashboard -> Authentication -> Rate Limits, or
`GET https://api.supabase.com/v1/projects/hjppxawglmukfvsgmcog/config/auth` with a PAT and read
`rate_limit_email_sent`.** The prior register's "50/hr" (P-069, memory
`send-email-hook-shipped.md`) is carried as a runbook value, **not re-verified this round**.

**Breaking point.** 30 auth mails/hour platform-wide at the documented default (50 if the runbook
value holds). S1 spread over 5 hours is 40/hr — straddling the line. S3 blows it in minutes.

**Fix hint.** Raise `rate_limit_email_sent` *only after* the Resend plan moves — the 2026-07-22
audit's point 4 stands: raising it on Free just relocates the failure from GoTrue to Resend.

---

### T10-stress-04 — 8 of ~10 Turnstile hostnames are spent; the 11th gym's members cannot get in at all

**Claim.** One shared Turnstile widget gates `/activar` and `/registro`. Its hostname list is
capped at ~10 on the current plan, and **8 client hostnames are already registered live**. The
verifier fails closed, so a hostname the widget does not know is not a degraded experience — it is a
door that cannot open.

**Member-visible symptom.** At the new gym, every member who taps ACTIVAR sees
"No pudimos verificar que no eres un robot. Intenta de nuevo." forever. Retrying never helps. The
gym looks broken on day one.

**Evidence.**
- Live: `select app, count(*), string_agg(hostname,', ') from public.gym_domain group by app` ->
  **client: 8** (`forge-demo-client.localhost, forge-demo.ibookit.lat, forge.ibookit.lat,
  red-demo-client.localhost, red-demo.ibookit.lat, red.ibookit.lat, red.localhost,
  www.redfunctionaltraining.com`); admin: 7.
- Fails closed by construction: `apps/client/src/lib/turnstile.ts:22` (`if (!token) return false`),
  `:38` (`return data.success === true`), and the callers refuse the submit —
  `activar/actions.ts:64-66` and `:127-129`.
- The 10-hostname cap and the "no wildcard exists yet; every gym = 2 hand-added Vercel domains +
  `gym_domain` SQL + a Supabase redirect URL + a Turnstile hostname" finding are **carried** from
  memory `vercel-domain-scale-verdict.md` (2026-09-02 follow-up) and the uncommitted
  `docs/research/2026-09-02-domain-provisioning-automation-research.md`. The hostname **count of 8
  is measured this round**; the **cap of 10 is asserted — experiment: open the Turnstile widget's
  settings and read the hostname list length and the plan's documented maximum.**

**Breaking point.** ~1 more gym (2 hostnames each if both `*.ibookit.lat` and a custom domain are
used, so possibly 0 more).

**Fix hint.** Move the widget to Turnstile's "any hostname" mode, or one widget per gym keyed off
`gym_domain`. This blocks S2 outright and is cheap.

---

### T10-stress-05 — the send-email hook has a 5-second total budget, an unbounded Resend fetch inside it, and returns 503 with no `retry-after`

**Claim.** Supabase gives an HTTP auth hook a **5 s budget for the entire invocation including
retries**. Inside that budget the hook makes two Postgres round trips and then an **untimed**
`fetch` to Resend. Under exactly the burst that stresses this path (Resend queuing behind its
10 req/s policy), the hook overruns the budget, GoTrue errors the auth request, and the OTP is
already minted — so the member's retry hits the 60 s per-address window.

**Member-visible symptom.** The Marce screen, at scale: "NO SALIO EL CORREO" for a mail that in some
cases *did* go out, plus a second identical-subject mail in the inbox where only the newest link
works (`docs/FIndings/2026-09-02-marce-triage.md` §3, register rows P-086/P-087).

**Evidence.**
- Primary: supabase.com/docs/guides/auth/auth-hooks, read this round — "On a retry-able error, such
  as an error with a `429` or `503` status code, HTTP Hooks will attempt up to three retries with a
  back-off of two seconds. **We have a time budget of 5s for the entire webhook invocation,
  including retry requests.**" The worked schedule on that page has retry #1 already timing out at
  00:00:05.
- Same page: "Return a retry-able error by attaching an appropriate status code (`429`, `503`)
  **and a non-empty `retry-after` header**."
- `supabase/functions/send-email/index.ts:139` — the response headers are
  `{ "Content-Type": "application/json" }`. **No `retry-after`.** `respuestaEnvio`
  (`correo.ts:206-214`) maps null/429/>=500 -> HTTP 503 as designed, but the header the docs say
  makes a 503 retry-able is not attached.
- `supabase/functions/send-email/index.ts:115` — `await fetch("https://api.resend.com/emails", {...})`
  with **no `signal`**. Contrast `packages/data/src/server/invitaciones.ts:58`, which does set
  `AbortSignal.timeout(10_000)` on the same endpoint — and even 10 s is 2x the hook's whole budget.
- Two Postgres round trips per invocation before the send, on a fresh client each time:
  `index.ts:52-66` (`createClient` -> `rpc("gym_id_por_host")` -> `.from("gym").select("brand_name")`).
  Measured cost of the first: `gym_id_por_host(p_hostname,p_app)` — **9,200 calls, mean 1.76 ms,
  max 44.3 ms**.
- Same page: "Both HTTP Hooks and Postgres Hooks are run in a transaction" — a slow hook therefore
  also holds a GoTrue database transaction against `max_connections = 60`.
- **Correction to the prior register:** P-023 / catalog F-33 states "GoTrue will not retry". The
  current primary doc says it retries up to 3x within the 5 s budget. The real defect is the missing
  `retry-after` plus the unbounded fetch, not the absence of retry.

**Basis.** measured for the code; primary-doc cite for the budget and the header requirement.
**Unmeasured — experiment:** deploy a copy of the hook to the scratch project with
`performance.now()` logging around the Resend call and drive 60 signups in 60 s; read the p95.

**Breaking point.** One Resend call slower than ~5 s minus two Postgres round trips (~4.9 s).

**Fix hint.** One line: `signal: AbortSignal.timeout(3_000)` on `index.ts:115`, plus
`"retry-after": "true"` in the 503 branch's headers.

---

### T10-stress-06 — Realtime Free caps at 200 peak connections; one gym already has 183 members

**Claim.** The signal rail opens one WebSocket per member tab. Supabase's Free plan quota is 200
peak connections with **no over-usage allowance**. RED alone holds 183 `clientes` rows. A single
6 a.m. class where most of the gym opens the app, or S2's 2,000 onboarded members, is past it.

**Member-visible symptom.** Silent staleness: the week view and saldo stop updating and nothing on
screen says so. The only trace is one `console.warn` in the browser.

**Evidence.**
- Primary: supabase.com/docs/guides/realtime/pricing — Free quota **200 peak connections**,
  over-usage column "-"; messages Free quota 2 million/month.
- One socket per tab: `packages/data/src/client-senal.ts:186` uses the per-tab memoised singleton
  ("this is one socket per tab no matter how many mounts").
- Failure is a warn, not a state: `client-senal.ts:207-216` —
  `console.warn("[senal] canal", estado)` on `CHANNEL_ERROR`/`TIMED_OUT`, then `return`.
- Live row counts: `clientes` **183**, `auth.users` **61**, `gym_membership` **58**.

**Basis.** measured (docs + code + live counts). The **actual peak connection count is unmeasured —
experiment: Dashboard -> Reports -> Realtime, peak connections for the last 30 days.**

**Breaking point.** 200 simultaneous member tabs platform-wide.

**Sound-but-ranked note (M2):** the rail's *message* budget is not the problem. `senal_gym()`
dedupes to **one broadcast per gym per transaction** via a transaction-local GUC
(`supabase/migrations/20260901120000_senal_gym.sql`, whose own header measures 986 rows -> 89
statement-level -> 1 deduped), so S1's 200 sales emit 200 messages, not 200 x rows.

---

### T10-stress-07 — `mi_membresia` sequential-scans `ventas` on every saldo render; measured max 1,155 ms today

**Claim.** `mi_membresia` reads `from ventas where cliente_id = v_cli order by created_at desc
limit 1`. There is no index on `ventas(cliente_id)`. It is the slowest hot RPC on the member's first
load and it already produces second-long outliers at 300 rows.

**Member-visible symptom.** The saldo card and the "clases restantes" number are the last thing to
paint; on a bad draw the whole `/reservar` render waits a second on it.

**Evidence.**
- Live plan: `EXPLAIN (ANALYZE, BUFFERS)` of that predicate ->
  `Seq Scan on ventas v (actual time=0.068..0.203 rows=3) / Rows Removed by Filter: 297 /
  Buffers: shared hit=10`. 0.203 ms / 300 rows = **0.68 us/row**.
- Live indexes on `ventas`: `ventas_pkey`, `ventas_folio_gym_uq`, `ventas_gym_fecha_idx`,
  `ventas_gym_id_idx`, `ventas_idem_gym_uq`. **No `cliente_id` index.**
- `pg_stat_user_tables`: `ventas` — seq_scan 6,319, **seq_tup_read 947,343** on 300 live rows
  (150 rows per scan).
- `pg_stat_statements` (96-day window, `stats_reset 2026-05-29`): `public.mi_membresia(p_gym_id)`
  across its two call shapes — **1,255 calls, mean 17.3 / 26.2 ms, max 862 ms and 1,155.4 ms**.
- Body: `supabase/functions-canonical/mi_membresia.sql`, the
  `from public.ventas v where v.cliente_id = v_cli order by v.created_at desc, v.id desc limit 1`
  block.

**Basis.** measured. Extrapolation **modelled** from 0.68 us/row: ~68 ms/call at 100,000 `ventas`
rows, ~200 ms at 300,000.
Attribution: prior register rows P-025 / P-104 / catalog F-40 ("no `ventas(cliente_id)` index"),
here re-derived at HEAD with a live plan and a live latency distribution rather than a code read.

**Fix hint.** `create index ventas_cliente_created_idx on ventas (cliente_id, created_at desc, id desc)`.
One line, and it also kills the `Sort` node.

---

### T10-stress-08 — one write fans out to N full page re-renders, damped only by a 600 ms client-side debounce

**Claim.** The freshness rail's only rate control lives in the browser. A DB write broadcasts to
`gym:<id>`; every subscribed tab answers with `router.refresh()`, which re-runs the whole
`/reservar` server render — **18–20 PostgREST round trips, counted from the call sites**. There is
no server-side fan-out limit, no per-gym budget, and no coalescing above the socket.

**Member-visible symptom.** Nothing, until it is everything: at S1/S2 scale the same second sees
every open tab in a gym re-fetch its entire week because one member at the desk bought a package.

**Evidence.**
- `packages/data/src/client-senal.ts:170` — `debounceMs = 600`, trailing. `crearRegulador`
  (`:96-135`) is the entire damping mechanism.
- Round-trip count per cold `/reservar` render, from the call sites at HEAD:
  proxy `resolveTenant` (2) + `getEsMiembro` (1, `agenda-miembro.ts:141`) + `resolverMiembroGym`
  (1, `inquilino.ts:78`) + `fetchSesionesMiembro` (`class_session` 1, then the `Promise.all` of
  `class_type` / `class_session_coach` / `reservation` / `fetchFavoritoId` / `contarActivosMiembro`
  = 5, then `coach` 1 -> 7) + `getPerfilResumenMiembro` (`fetchProximasReservas` 3, `fetchMembresia`
  = `mi_membresia` + `paquetes` 2, `getPlanesPublicos` 1–2 -> 6–7) = **18–20**.
- The debounce does *not* collapse a desk onboarding session: sales arrive ~30–60 s apart, far
  outside a 600 ms window, so each one costs a full round of refreshes.
- Cross-check on the ratio: `pg_stat_statements` shows `class_session_coach` 5,138 calls,
  `coach` 4,285, `paquetes` 4,670 against the `gym_membership` embed at 7,008 — consistent with
  several reads per member render.

**Basis.** measured for the debounce, the call sites and the statement counts. The N x 20 arithmetic
is **modelled** — inputs: 200 concurrent tabs (S2), 200 sales, 20 round trips.
**Unmeasured — experiment:** open 50 tabs on `red-demo`, run 20 scripted sales, and read the
`pg_stat_statements` delta on `class_session`.

**Fix hint.** Nothing yet — this is correct at today's N (see keeps). The exit trigger is in §4.

---

### T10-stress-09 — tenant resolution costs ~7 database reads for every member read, and the cache that should stop it lives inside a serverless isolate

**Claim.** `resolveTenant` runs in the proxy on every navigation, again in `reservar/page.tsx`, and
again inside `resolverMiembroGym` via `slugDelHost`. Its cache is a 500-entry, 60-second,
**module-level** Map — which a serverless platform re-creates per isolate. Live counters show the
tenant seam is the hottest thing in the database.

**Member-visible symptom.** None directly. It is the multiplier that turns finding 10's connection
budget and finding 2's RLS cost into a wall sooner than either would alone.

**Evidence (live `pg_stat_statements`, 96-day window).**
- `gym_id_por_host(p_hostname, p_app)` — **9,200 calls**, mean 1.76 ms, max 44.3 ms.
- a second `gym_id_por_host(p_hostname)` shape — 2,732 calls, mean 2.66 ms.
- `gym` projections — 26,991 + 10,133 + 2,978 (`token_overrides`) calls.
- `gym_domain` projection — 19,277 calls, mean 0.13 ms.
- Against `mi_membresia(p_gym_id)` at **1,255 calls**: roughly **7.3 host resolutions per membership
  read**.
- Cache constants: `packages/data/src/server/resolve-tenant.ts:71-72` — `CACHE_TTL_MS = 60_000`,
  `CACHE_MAX_ENTRIES = 500`, keyed `${app}|${host}` (so the two apps halve the effective slots).
- Proxy runs it on every non-asset request: `apps/client/src/proxy.ts:102`, matcher at `:193-199`.
- `pg_stat_user_tables`: `gym` idx_scan **71,693** against 4 live rows; `gym_domain` idx_scan
  27,459 against 15 live rows.

**Basis.** measured. Attribution: prior register rows P-024 / P-060 / catalog F-39 named the
500/60 s constants; the **call-count ratio is new and measured this round**.

**Fix hint.** These are 4 gym rows and 15 domain rows. A build-time or KV-backed map removes ~52,000
database round trips per 96 days without changing a single behaviour.

---

### T10-stress-10 — the database is a 60-connection Free-tier instance, and the tail latency is what fills it, not the request count

**Claim.** `max_connections = 60` on ~224 MB of shared buffers and 2.1 MB `work_mem`. PostgREST
holds 7 backends at idle. The mean statement is fast (0.05–2.4 ms), so throughput is not the risk —
the risk is that a handful of second-long RPCs (finding 7's 1,155 ms `mi_membresia`) occupy the pool
while a burst arrives behind them.

**Member-visible symptom.** Under S2, a page that times out or 500s rather than one that is merely
slow — the failure mode flips from "slow" to "broken" once the pool is saturated.

**Evidence (live).**
- `select current_setting('max_connections')` -> **60**. `pg_stat_activity`: 17 total, 7
  `authenticator`/`postgrest` idle, 9 idle overall.
- `pg_settings`: `shared_buffers` 28,672 x 8 kB = **224 MB**, `effective_cache_size` 384 MB,
  `work_mem` 2,184 kB, `max_parallel_workers` **2**, `max_worker_processes` 6 — Free-plan compute.
- Tail: `mi_membresia` max 862 / 1,155 ms; `toggle_pase` max 422 ms;
  `contar_reservas_activas_miembro` max 354 ms; `registrar_venta` mean 41–77 ms, max 162 ms.
- Total volume over the whole 96-day window is small (top statement 95,263 calls), so today's
  utilisation is nowhere near the ceiling.

**Basis.** measured for every number above. **The PostgREST configured `db-pool` size and the
historical connection high-water are unmeasured — experiment: Dashboard -> Reports -> Database,
"Max connections used", 30-day view; or `select max(numbackends)` sampled over a load test.**

**Breaking point.** 60 connections; unknown fraction reserved for GoTrue / Realtime / Supavisor.

**Fix hint.** Fix findings 2 and 7 first — they are what makes a request hold a connection long
enough for the count to matter.

---

### T10-stress-11 — one pinned region, and the one component that cannot be pinned still isn't

**Claim.** Both apps pin `pdx1`. The proxy (Next middleware) cannot carry a region pin, so the seam
that runs `resolveTenant` and `getClaims` on **every** request still executes wherever Vercel places
it. Live session records show auth calls arriving from both us-west-2 and us-east-1 ranges.

**Member-visible symptom.** The 2026-08-29 shape: a cross-region leg to Supabase's us-west-2 turning
ordinary page loads into multi-second waits for some members and not others.

**Evidence.**
- `apps/client/vercel.json` and `apps/admin/vercel.json` — `"regions": ["pdx1"]`.
- `apps/client/src/proxy.ts:99-102` — `resolveTenant` on every matched request; `:168` `getClaims()`.
  No region control exists for middleware.
- Live `auth.sessions.ip`: **96 of 156 sessions from AWS ranges, across 92 distinct IPs**, including
  `54.175.199.2`, `54.91.255.225`, `54.166.25.96` (us-east-1 ranges) alongside `18.237.85.163`,
  `35.95.55.95` (us-west-2). The IAD leg is still live post-pin.
- `packages/data/src/server/fetch-shield.ts:83-84` — `JWKS_TIMEOUT_MS = 2_500`,
  `READ_TIMEOUT_MS = 8_000`, and the header note that **writes are deliberately unbounded**.

**Basis.** measured for the config and the session IPs. Attribution: prior register rows P-026 /
catalog F-42 ("~7% of middleware entered IAD post-pin") and memory
`supabase-degradation-2026-08-29.md` — **re-derived here from `auth.sessions.ip` rather than
reused.**
**Unmeasured — experiment:** Vercel plan and per-region concurrency ceiling; read the plan page and
the Functions usage graph.

**Sound-but-ranked note (M2):** I looked for a per-IP auth-rate-limit concentration on the server
side (`/auth/v1/token` 1800/hr, `/auth/v1/verify` 360/hr, both per IP with a burst of 30) and
**found none** — 96 sessions across 92 distinct IPs means Vercel's egress pool defeats it. The
per-IP buckets are a real ceiling only for members sharing one NAT, e.g. a gym's own WiFi; the
largest single-IP hour measured live is **10 sessions from `189.154.5.65` at 2026-08-19 09:00**,
33% of the smallest per-IP burst allowance.

---

### T10-stress-12 — S2 cannot happen: onboarding a gym is ~4 manual console actions with no API behind them

**Claim.** "10 gyms the same day" is not a throughput question. There is no RPC that creates a gym,
no wildcard domain, and four separate consoles must be touched per gym: two Vercel domains
(client + admin), a hand-written `gym_domain` INSERT, a Supabase redirect-URL entry, and a Turnstile
hostname. Three of those four are invisible to every guard in the repo.

**Member-visible symptom.** A gym goes live with one of the four steps missed, and its members hit a
door that fails closed — the Turnstile miss (finding 4), or the redirect-URL miss (the hook's own
header comment at `supabase/functions/send-email/index.ts:11-14` says the allow-list is what makes
its host-trust safe).

**Evidence.**
- Carried, with attribution: memory `vercel-domain-scale-verdict.md`, 2026-09-02 follow-up —
  "every gym today = 2 hand-added Vercel domains (client+admin) + hand-written `gym_domain` SQL +
  hand-added Supabase redirect URL + hand-added Turnstile hostname; no RPC creates a gym."
  **Unverified this round** for the Vercel and Turnstile halves; the `gym_domain` half is confirmed
  live (15 rows, hand-shaped, and `gym_id_por_host_create` has **no migration file in the repo at
  all** — `docs/FIndings/new-user-xe/01-live-snapshot.md` §B).
- Console-only surfaces the repo's guards cannot see: prior register row P-029 / catalog F-49.

**Basis.** asserted (carried) + measured for `gym_domain`.

**Fix hint.** Out of scope for a stress fix, but it reorders the roadmap: automating provisioning
buys nothing until findings 1 and 4 are fixed, because both cap you below 2 gyms of real onboarding
anyway.

---

### T10-stress-13 — the folio counter serialises a gym's sales, and it is nowhere near binding (recorded so it isn't "optimised" first)

**Claim.** `next_folio` takes a row lock on one `gym_folio_counter` row per gym and holds it for the
rest of the `registrar_venta` transaction. That serialises all of a gym's sales. The ceiling is
about **16 sales/second per gym** — three orders of magnitude above anything S1 can produce.

**Evidence.**
- `supabase/functions-canonical/next_folio.sql` — `update public.gym_folio_counter set last_folio =
  last_folio + 1 where gym_id = p_gym returning last_folio`.
- `ventas_folio_gym_uq` UNIQUE `(gym_id, folio)` — the counter is what keeps concurrent sales off a
  23505.
- `pg_stat_statements`: `registrar_venta` shapes — mean **41.7 / 46.8 / 61.1 / 77.4 ms**, max
  161.9 ms. 1 / 0.062 s is about 16/s.

**Basis.** measured.
**Verdict: sound.** Ranked last on purpose — the arithmetic is here so a future reader does not
spend a slice on lock-free folios while finding 1 caps onboarding at 50 members a day.

---

## 3. Q-numbers this territory owns

**Q3 — if the project were stressed to the top, where are the breaking points?**

Answered in full by §1's table and §2's thirteen findings. The compressed answer:

- **S1 (one gym, 200 members in an afternoon):** dies at **member #50** on Resend's 100/day cap
  (finding 1). If mail were unlimited it would next hit the GoTrue project-wide auth-email bucket at
  **30–50/hour** for whichever members route through `/registro` (finding 3). Neither the database
  nor Vercel is touched — `registrar_venta` at 41–77 ms and 60 connections are not close.
- **S2 (10 gyms the same day):** cannot start — provisioning is ~4 manual steps per gym with no API
  (finding 12) and **Turnstile has ~2 hostname slots left** (finding 4). If both were solved, the
  100/day cap becomes 50 members across all ten gyms combined, and `gym_membership`'s per-row RLS
  (finding 2) makes every existing gym's members slower as the new ones land — the cross-tenant
  coupling is the part that does not heal.
- **S3 (viral signup day):** the GoTrue bucket (30–50/hr, project-wide) binds first, and the
  send-email hook's 5 s budget with an unbounded Resend fetch (finding 5) converts the overload into
  the exact "NO SALIO EL CORREO" screen from the Marce incident — plus duplicate identical-subject
  mails where only the newest link works. Beyond ~200 simultaneous open tabs the signal rail
  silently stops (finding 6).

**The single component that binds first, with its number: Resend's daily cap -> 50 new members per
day, platform-wide.**

I own no other Q-number. Q1 / Q2 / Q4 / Q5 / Q6 / Q7 belong to other seats; where my evidence
touches them I have said so and stopped (e.g. the Free-plan 7-day inactivity pause I read in the
Supabase production checklist is Q4's, not mine, and I have not developed it).

---

## 4. Keep-verdicts, each with a digit-bearing exit trigger

| Keep | Why it is sound now | Exit trigger |
|---|---|---|
| **`senal_gym` statement-level trigger + transaction-local GUC dedupe** | Emits **1** message per gym per transaction; the migration header measures the worst case at 986 rows -> 89 statements -> 1 message | Exit when any single transaction emits **>1** `realtime.send` to the same `gym:` topic, or when Realtime monthly messages exceed **500,000** (25% of the Free 2M quota) |
| **`realtime.messages` growth** | Bounded, not unbounded: **56** rows live, **5** daily partitions attached (`messages_2026_09_01`…`_05`), Realtime's own Janitor deletes partitions older than 72 h | Exit when **>6** partitions are attached at once, or `realtime.messages` exceeds **100,000** rows |
| **`resendTransport`'s 10 s abort and no-retry policy** | Correct on the sale critical path — a retry could turn a succeeded sale into a stuck spinner (`invitaciones.ts:69-74`); peak concurrency is **2** | Exit the day one operator action fans out to **>10** emails, or the day daily volume exceeds **60** (60% of the Free cap; measured peak is 37) |
| **Resend's 10 req/s policy** | Measured live (`ratelimit-policy: 10;w=1`) and unreachable: the GoTrue bucket caps sends three orders of magnitude below it, and no bulk path exists | Exit the day any code path issues **>10** Resend calls within 1 second — i.e. the day a bulk-invite or CSV-import screen ships |
| **`clientes` indexing** | Well-shaped: `clientes_email_gym_uq` UNIQUE `(gym_id, lower(email))`, `clientes_auth_user_id_per_gym` UNIQUE `(gym_id, auth_user_id)`, `clientes_gym_id_idx`. Live ratio **0.2** seq-scans per index-scan (4,419 vs 21,766) | Exit when `pg_stat_user_tables` shows `seq_scan / idx_scan > 2` for `clientes`, or `seq_tup_read` exceeds **5,000,000** |
| **`next_folio`'s single-row counter** | Serialises a gym's sales at ~**16/second**; nothing in the product produces that | Exit when any gym records **>1,000** sales in one hour |
| **The 600 ms client-side signal debounce** | Correct at today's N — the whole rail costs less than the 5-minute desk poll it replaced | Exit when a single gym has **>50** concurrent member sockets, at which point one write costs >1,000 PostgREST round trips |
| **The pdx1 region pin** | Ruled by the owner after the 2026-08-29 incident: pdx1 alone, never add iad1 (memory `supabase-degradation-2026-08-29.md`) | undecided — **the question is whether the account is on Vercel Pro and what its per-region function-concurrency ceiling is; the owner must answer it, or grant a read of the Vercel plan page** |
| **The project-wide auth-email rate limit's current value** | — | undecided — **is `rate_limit_email_sent` 30 (Supabase default under custom SMTP) or 50 (the 2026-07-22 runbook)? The owner, or anyone with dashboard/PAT access, must read it before any capacity number here is more than a range** |

---

## 5. Could not determine — and the experiment that would settle each

| Question | Experiment |
|---|---|
| The configured project auth-email rate limit (30? 50? something else?) | Dashboard -> Authentication -> Rate Limits; or `GET https://api.supabase.com/v1/projects/hjppxawglmukfvsgmcog/config/auth` with a PAT, read `rate_limit_email_sent` |
| Whether the Resend account is still on Free (100/day) or already Pro | Resend dashboard -> Billing; the API exposes only the per-second policy header |
| The `send-email` hook's real p95 under burst, and how close it runs to the 5 s budget | Deploy the hook to the scratch project with `performance.now()` around the Resend call; drive 60 signups in 60 s from a script; read the function logs |
| PostgREST's configured `db-pool` size and the historical connection high-water | Dashboard -> Reports -> Database -> "Max connections used", 30-day view |
| Vercel plan and per-region function concurrency | Vercel dashboard plan page + Functions usage graph |
| Realtime peak-connection usage to date | Dashboard -> Reports -> Realtime -> peak connections, 30-day view |
| How Supabase counts a Realtime "message" — per publish or per delivery | supabase.com/docs/guides/platform/manage-your-usage/realtime-messages; not read this round. It decides whether 200 sales x 200 tabs is 200 or 40,000 against the 2M monthly quota |
| The Turnstile widget's actual hostname list and its plan's documented maximum | Cloudflare dashboard -> Turnstile -> the widget -> Hostname Management |
| Whether `gym_membership`'s per-row `is_staff_of` cost stays at 36.6 us/row as the table grows | Seed 5,000 membership rows on the scratch project and re-run the same `EXPLAIN (ANALYZE, BUFFERS)` |
| Edge-function cold-start time under a signup burst | Same scratch-project burst; read `boot_time` in the edge-function logs |

---

## 6. Blind spots — what I did not examine

- **Every other Q-number.** Q1 (drift), Q2 (weak spots), Q4 (3 months idle), Q5 (human misuse), Q6
  (one-line regression), Q7 (30 s awaits / half-failed calls) belong to other seats. Several of my
  findings have obvious Q7 edges (the unbounded `fetch` at `activacion.ts:99`, the unbounded Resend
  fetch in the hook, `registrar_venta` writes deliberately untimed by the fetch shield) — I named
  them and did **not** develop them.
- **No load test was run.** Every number above is either a live counter, a live query plan, a live
  HTTP header, a primary doc, or an extrapolation from one of those, explicitly tagged. Nothing was
  driven under synthetic load.
- **No dashboard or control-plane access this session.** All Supabase Auth settings, the Resend
  plan, the Vercel plan, the Turnstile widget config and the Realtime usage graphs are inferred or
  carried, never read.
- **`apps/mobile/`** (untracked at session start) was not opened — it is a second client that would
  add sockets and page renders to findings 6 and 8, and I have not counted it.
- **The admin app's own load** beyond `vender` and `asistencia`: I did not count round trips for
  `/clientes`, `/inicio` or `/agenda`, which are what the desk operator actually hammers during a
  200-member afternoon.
- **The other ~45 `functions-canonical/*.sql` bodies** were not read for scan-shaped queries; I only
  chased the ones on the new-user path plus `next_folio`.
- **Supavisor** (the connection pooler in front of Postgres) — its mode, pool size and its own
  ceilings were not examined at all. It sits directly between findings 8 and 10.
- **Resend's bounce/complaint budget** (<4% / <0.08%, account-wide, suspension without warning) is a
  real S2 ceiling and belongs in this territory, but the 2026-07-22 audit already measured it at
  5.6% (1 hard bounce in 18) and I did **not** re-measure it this round — the ledger's `last_event`
  field would have let me, and I ran out of budget before doing it.

---

## 7. Draft audit — what I cut or retagged, and the rule that caught it

| Cut / retagged sentence | Rule | Why |
|---|---|---|
| *"`/auth/v1/signup` is limited to 30 requests/hour per IP, so a gym running a signup drive on its own WiFi is refused at member #31."* — **CUT** | 5 (cite or drop) | Reading the primary rate-limit table properly: that row is **"Anonymous sign-ins"**, `/auth/v1/signup[^2]`. This repo uses no anonymous sign-in. The claim was built on a misread footnote marker. |
| *"All tenants' server-side auth calls egress from Vercel's pinned pdx1 IP, so they share one per-IP token/verify bucket."* — **CUT** | 7 (honesty outranks severity) + 5 | Refuted by my own measurement: `auth.sessions` shows **96 AWS-range sessions across 92 distinct IPs**. The egress pool is wide enough that per-IP buckets do not concentrate server-side. Kept as a sound-note under finding 11 rather than deleted. |
| *"GoTrue will not retry the hook's 503, so the OTP is burned with no inbox."* — **RETAGGED, and flagged as a correction to the prior register** | 5 + the reuse rule | Prior register row P-023 / catalog F-33 asserts no retry. The current primary doc (supabase.com/docs/guides/auth/auth-hooks, read this round) documents up to 3 retries within a 5 s budget. The defect survives but its mechanism changed: the missing `retry-after` header and the unbounded fetch, not the absence of retry. |
| *"The auth-email bucket is 50/hour."* — **RETAGGED to a range with a named experiment** | 5 | 50/hr is a runbook value carried in P-069 and memory `send-email-hook-shipped.md`. I could not read the live setting. The documented default under custom SMTP is 30 new users/hour. Stated as 30–50 with the dashboard / Management-API path to settle it. |
| *"`/auth/v1/otp` draws on the same 50/hr email bucket."* — **CORRECTED** | 5 | The primary table lists `/auth/v1/otp` separately at 360 OTPs/hour, "Sum of combined requests", and it is **not** among the "endpoints that send emails". The 2026-07-22 audit's point 4 conflates them. |
| *"`gym_membership` RLS costs 73 ms at 2,000 rows."* — **RETAGGED `modelled`** | 5 | The 36.6 us/row and `loops=58` are measured; the 2,000-row figure is linear extrapolation holding `is_staff_of`'s own cost constant. Named as such, with the seeding experiment that would settle it. |
| *"Supabase pauses Free projects after 7 days of inactivity, so an idle platform wakes up dead."* — **CUT from this file** | territory discipline | True and primary-cited (production checklist, Availability), but it is Q4's finding, not Q3's. Flagged in Blind spots and left for that seat. |
| *"Realtime messages will exceed the 2M/month Free quota under S2."* — **CUT** | 5 | It depends entirely on whether Supabase counts a message per publish or per delivery, which I did not read. Moved to Could-not-determine with the doc URL. |
| *"Turnstile caps at exactly 10 hostnames."* — **RETAGGED `asserted`** | 5 | The **count of 8 in use is measured live**; the cap of 10 is carried from memory `vercel-domain-scale-verdict.md` and an uncommitted research doc. Experiment named. |

Nothing else was cut. Where a component is sound I said so with its number and ranked it anyway
(finding 6's dedupe note, finding 11's per-IP note, finding 13 in full, and five of the nine keeps).
