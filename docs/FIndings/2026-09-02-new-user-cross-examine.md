# The new-user path, cross-examined — 2026-09-02

Tier-3 cross-examination of the whole new-member surface: admin desk sale → invite →
`send-email` hook → Resend → `/activar` (both rails) → `/registro` → `/entrar` → `/auth/confirm`
→ claim RPCs → session mint → tenant resolution → first `/reservar` render.

Repo `C:\Users\Aaron\Documents\Repos\RED-2.0`. Round 1 read HEAD `33c9087a`; round 2 ran at
`e629466e` (the same tree plus round 1's own commit). Live project `hjppxawglmukfvsgmcog`
(SELECT-only). Round 1: eleven territory seats, two verification lenses per seat, one referee, plus
a mandatory coverage critic — **76 raw findings → 58 after merging duplicates → 3 refuted, 3
unmeasured.** Round 2: two refuters and two experiments against round 1's own output — **4 claims
struck, 4 corrected, 2 rows added, 32 ranked rows, and §7 executed for the first time.** See the
Round 2 revisions section immediately below; every round-2 file lives in `docs/FIndings/new-user-xe/`.

Member emails are masked (first 3 chars + domain). `marcerubiogarcia07@gmail.com` is unmasked
because it is already documented un-masked in `docs/FIndings/2026-09-02-marce-triage.md`.

Evidence tags used throughout: **measured** (a query + its output, a `file:line` at HEAD, a log
line, or a primary URL), **modelled** (a number derived from measured inputs — inputs named),
**asserted** (carried from a prior doc or memory, not re-derived this round). Prior work is cited
by its register id (`P-NN` / `F-NN`) and marked *re-derived* or *unverified this round*.

---

## Round 2 revisions (2026-09-02)

This file is **v2**. Round 1 shipped it with a coverage critic appended; round 2 ran four seats
against that critic — two refuters (R1 the headline, R2 the top rows) and two experiments (E1
**executed** §7's 17 diffs, E2 re-derived the critic's own live numbers). Every change below names
the round-2 file that forced it. Row ids (`§1 row #N`) are **stable identifiers** and were not
renumbered; the revised ranking is stated as an explicit order above §1's table.

| What changed | Where | Round-2 source |
|---|---|---|
| **Struck:** "the door mix inverted **at `afd7a5d5`**". The split cut 25 h 27 m before that commit existed; at the commit's own timestamp Fisher p goes 0.038 → **0.19**. Re-worded to a share statement with the real change point (2026-08-17) and its measured cause | §0 item 5, §2, §1 row #3, §10, §15 | `new-user-xe/R2-R1-headline-refute.md` §2–§4 |
| **Struck:** "**Every** failure mode in this document lives on the `/registro` rail" — 0 of 30 ranked rows are `/registro`-exclusive; ranks #1 and #2 are both `/activar` | §0 item 5, §1 row #3, §15 | `R2-R1-headline-refute.md` §5 |
| **Struck:** row #3's mechanism attribution — the "Crea tu cuenta" CTA shipped at `2c040430`, **2026-07-08**, 53 days earlier, and `afd7a5d5` does not touch that file | §1 row #3, §2 | `R2-R1-headline-refute.md` §3 |
| **Struck:** row #9's live-evidence sentence ("five createUser attempts that never reached generateLink"). The five are `email_exists` **422s** that mint nothing by design; row #3's reading of the same six log lines is the correct one. Mechanism held, re-ranked as latent | §1 row #9, §10 | `R2-R2-top-rows-refute.md` row #9 |
| **Re-worded:** row #1's "the 429 renders as a lie" → the copy is accurate (no mail left); the defect is the CTA, `window.location.reload()` at `activar-form.tsx:154`, inviting a retry that cannot succeed for another 50 s. A second 429 body ("after 18 seconds") beside the first ("after 28 seconds") now pins the 60 s floor from two points, and both 429s' `referer` is byte-identical to `activar/actions.ts:86-89`'s `emailRedirectTo` | §1 row #1, §0 item 9 | `R2-R2-top-rows-refute.md` row #1 |
| **Resized:** row #2's "whoever is signed in" → a caller holding **no `clientes` row in that gym**; live surface = **10 of 62** accounts, and **0** identities hold rows in two gyms | §1 row #2 | `R2-R2-top-rows-refute.md` row #2 |
| **Re-framed:** row #4's cron schedule "drift" is a **stale docstring**, not a misconfiguration (`860a3893`: Vercel Hobby rejects hourly). "Not deployed" is dead — unauthenticated `curl` → **401**; and `pg_stat_statements` (reset 2026-05-29) holds **zero** calls of the cron's literal SQL | §1 row #4, §2, §9 | `R2-R2-top-rows-refute.md` row #4 |
| **Re-scoped:** the wedge is **14 rows platform-wide**, worst **1,218 h (51 days) on forge**, not RED's 3 rows / 475 h; detector coverage is **1 of 14 = 7%** by a direct email join — not the critic's asserted "3 of 14 = 21%" | §0 item 4, §1 rows #4/#10, §9, §10 | `R2-E2-live-checks.md` §a.1, §a.4 |
| **Enlarged:** row #6 — **forge has 44 of 50 members with no email and 2 accounts total**; the row was filed as "8 paying RED members" | §1 row #6, §0 item 6 | `R2-R1-headline-refute.md` §6 |
| **§7 is executed, not read.** 12 of 17 diffs stay green exactly as claimed; **4 predicted-green rows are caught** — #3 by typecheck, #6 by vitest, #8 by lint, #15 by vitest; #13 (SQL) is unexecutable locally | §7 (new column), §11, §14, §15 | `R2-E1-regressions-executed.md` |
| **New ranked row #31** — `pnpm typecheck`'s turbo cache does not invalidate an app's typecheck when `packages/data` changes, so the pre-commit gate false-greens cross-package type errors | §1 row #31, §7 | `R2-E1-regressions-executed.md` method note |
| **New ranked row #32** — `auth_leaked_password_protection` is **DISABLED**, and the 8-character floor is client-side only | §1 row #32, §12 | `R2-E2-live-checks.md` §b |
| **New mechanism under an existing row** — 3 WARN `multiple_permissive_policies` on exactly `clientes` / `gym_membership` / `reservation` explain row #23's "2 unpredicated reads per render" mechanistically for the first time | §1 row #23, §10 | `R2-E2-live-checks.md` §b |
| **Corrected first binder:** ≈**34** new members/day, not 50 — 100/day now read from a primary (resend.com/pricing) ÷ a **measured 2.9** mails per new member, not an assumed 2. Exit trigger: any single UTC day over **60** mails (peak to date 37, on 2026-08-13) | §4, §9, §10, §12 | `R2-R2-top-rows-refute.md` §4 |
| **Corrected §11:** `email_no_coincide` **is** observable today — `nucleo.ts:126-133` maps it to a unique HTTP 422 in `function_edge_logs` (0 of 6 in the last 24 h). The 30-day version needs row #20's durable sink, not a new log line | §11, §2, §15 | critic #5, re-derived in `R2-E2-live-checks.md` §c |
| **Corrected scope:** `pnpm test:e2e` is **two** suites / **6** tests (`session.spec.ts` + `signup.spec.ts`), not one / three, and `AGENTS.md` is stale on this | §1 row #26, §7 #17, §9, §14 | critic #3 |
| **New, unranked:** live `/signup` **6 × 500** "Invalid payload sent to hook" over 11 h, all synthetic `delivered@resend.dev` against **production** `red.ibookit.lat`; `realtime.messages` = 58 rows, oldest ~13 h (same-day retention) | §5, §10, §14 | `R2-E2-live-checks.md` §c, §e |
| **Sandbox, not live:** the 4 `claim_code`-with-no-`invitacion_enviada_at` rows are **all `red-demo` seed fixtures** (`5eed…` UUIDs, 2025-12-26 → 2026-07-02). The shape is code-reachable; it has **zero** live instances | §1 row #10, §14 | `R2-E2-live-checks.md` §a.2 |
| **Confirmed, unchanged:** the `full_name` door proxy (52/52 against an orthogonal proxy; a second code-derived proxy agrees on all 12 week×gym cells); the 14-row wedge counts and hours; `activar-cuenta` 1×200 / 5×409 / 0×500 / 0×422; `auth.audit_log_entries` = 0; row #5's 47 armed-no-email rows (24/11/8/4); 67 armed codes | §1 rows #2/#5, §10 | `R2-R1` §1, `R2-E2` §a/§d, `R2-R2` row #5 |

**Revised ranking** (original ids, worst first — nothing was renumbered):
`#1, #2, #4, #10, #5, #6, #7, #8, #14, #22, #26, #23, #32, #31, #3, #12, #11, #13, #15, #16, #17,
#9, #18, #19, #20, #21, #24, #25, #27, #28, #29, #30`.

Moves that matter: **#4 and #10 up** — the wedge is 14 members and 51 days, not 3 and 20, and its
detector sees 7% of it. **#6 up** — forge's 44 of 50. **#32 and #31 in** — both new, both measured.
**#3 down, 3 → 15** — the share statement is true and it is *exposure*; its causal half is refuted,
so it no longer ranks as a regression. **#9 down, 9 → 22** — mechanism intact, never observed to fire.

---

## 0. For the owner, today

1. **Marce is already in.** Claim + `gym_membership` landed `2026-09-02 16:31:48.747Z`; her
   password login succeeded `16:35:38.559Z` (marce-triage §1, §4). Nothing is owed to her account.
2. **Tell her one sentence:** *"Ya quedó tu cuenta. Si te vuelve a pasar, abre solo el correo más
   reciente — los anteriores dejan de servir en cuanto pedimos uno nuevo."* That is literally true
   (`supabase/functions/send-email/correo.ts:109-144` — one fixed subject per rail, no send time).
3. **Nothing on live *must* change this week to keep members working.** No deploy is required. Two
   dashboard **reads** are: Vercel → admin project → Cron Jobs (is the alert cron even scheduled),
   and Supabase → Auth → Rate Limits (the number every capacity figure here rests on). A third,
   promoted this round: Resend → Billing — §4's first binder is 34 new members/day **only if** the
   account is on Free.
4. **Fourteen members are wedged right now across the platform, worst stuck 1,218 hours (51 days)
   — and the worst is on forge, the gym you do not run.** Per gym: forge 4 (max 1,218 h) · red 7
   (max 691 h) · forge-demo 2 (max 1,271 h) · red-demo 1 (965 h). The alert cron that exists to page
   you on exactly that has sent **0 alert mails in the entire Resend ledger (196 mails, 08-12 →
   09-02)**, and the detector behind it (`registros_atorados()`) sees **1 of the 14 — 7%**. Round 1
   printed "3 RED members, worst 475 h" here: RED-only, and 2.6x too small
   (`new-user-xe/R2-E2-live-checks.md` §a.1/§a.4).
5. **Most new RED members enter through `/registro`, not the invite link the desk sends — and that
   is not new.** Of RED's 43 claimed members, 25 (58%) minted their account at `/registro`; the last
   three weeks run 83–89% (n=6–9; 95% CI [44%, 98%]). Round 1 blamed commit `afd7a5d5`: **refuted.**
   Its split cut at `2026-08-30 00:00Z`, **25 h 27 m before that commit existed**
   (`2026-08-31 01:26:40Z`), putting three pre-commit `/registro` signups on the wrong side; at the
   commit's own timestamp the split is 17 vs 20 → 1 vs 5, Fisher one-sided **p = 0.19** (the doc's
   cut gave p = 0.038). The real change point is **2026-08-17** (12 vs 6 → 6 vs 19, p ≈ 0.007), and
   it coincides with a **one-day 21-invite seed wave (2026-08-13) draining**: `/activar` completions
   track invite supply (21→13, 6→1, 4→3, 7→1) at a flat 0.29–0.43/day straight across the commit.
   The "Crea tu cuenta" CTA the row blamed shipped at `2c040430` on **2026-07-08**, 53 days earlier,
   untouched by `afd7a5d5`. **Also struck: "every failure mode lives on the `/registro` rail"** —
   0 of 30 ranked rows are `/registro`-exclusive, and ranks #1 and #2 are both `/activar`
   (`R2-R1-headline-refute.md`).
6. **Exposure holds; the regression at that commit does not.** RED added 27 claimed members since
   2026-08-15, so a constant per-member failure rate produces more failures than it used to
   (**measured**). Whether the per-member *rate* moved is unfalsifiable — item 8. Worth ranking
   beside it, and new this round: **forge has 44 of 50 members with no email on file and 2 accounts
   total** — its members never reach either door (`R2-R1-headline-refute.md` §6).
7. **Your test accounts cannot reproduce any of it.** All 7 fresh-provision members confirmed in
   0.0 minutes; the entire >10-minute tail (77, 96, 1267, 1704 minutes) is on `/registro`, the rail
   you never walk (RED-TEAM-03, both lenses re-derived).
8. **You cannot measure whether it is elevated, and neither can I.** `auth.audit_log_entries` = 0
   rows; the log stream holds 24 hours; there is no log drain. Your perception is the project's only
   historical instrument.
9. **The cheapest three fixes**, all app-tier, no migration: put the send time in the mail subject;
   branch on `over_email_send_rate_limit` at `activar/actions.ts:94` and replace the
   `window.location.reload()` button (`activar-form.tsx:154`) with a countdown — the *copy* is
   truthful, the *button* is what lies; route `enviarMagicLink` through the throttle the other three
   doors share.
10. **Owner-owed inputs are in §12.** Six of the numbers in this document are modelled on values
    only you can read.

---

## 1. Ranked weaknesses, worst first

Merged across all eleven territories. Duplicates are collapsed to one row (the referee counted
roughly a dozen double-filings); contributing territory ids are listed so the notes files stay
findable. **Status**: `held` = survived both lenses and the referee. Refuted rows are struck below
the table, not in it.

**Read the ranking from the Round 2 revisions section, not from this table's row order.** Row ids
are stable identifiers (they are cited in §2, §7, §9–§12 and by the critic), so nothing was
renumbered; the revised worst-first order is stated there. Two rows were added round 2 (#31, #32),
so this is 32 rows, not 30 — and every "30 ranked rows" phrase elsewhere in the document is round-1
text left as written.

| # | Title | Member-visible symptom | Mechanism (file:line) | Status | Basis | Fix hint |
|---|---|---|---|---|---|---|
| 1 | **Two of five mail doors bypass the one shared throttle, and the 429 screen's only button cannot succeed for another 50 seconds** | "NO SALIÓ EL CORREO — Intenta de nuevo", twice, 10.1 s apart | `reenvio-limite.ts:4-9` claims "ALL THREE doors"; grep gives exactly 3 call sites (`entrar/actions.ts:84`, `registro/actions.ts:97`, `registro.ts:151,176`). `activar/actions.ts:86` → `sesion.ts:179-201` is ungated, as is `entrar/actions.ts:57` (`solicitarReset`). `activar/actions.ts:94` collapses every **send** failure (throttle, bad address, network) to `cuentaExistenteFallo` — the `codigo_invalido` / `ya_reclamado` / `email_no_coincide` arms each keep their own state at `:72-104`; then `activar-form.tsx:147-154` renders truthful copy under a `window.location.reload()` button that re-enters the same 60 s window | held — **re-worded round 2** (`R2-R2-top-rows-refute.md` row #1): the copy is accurate, the CTA is the defect | measured — live `auth_logs`: 2 x 429 `over_email_send_rate_limit` on `/otp` at 2026-09-01 19:25:16Z and 19:25:27Z, the only two in 24 h. **Two bodies, not one** — "after 28 seconds" and "after 18 seconds" both resolve to 19:25:45 = the 19:24:45.866Z `send-email` 200 **+ 60 s**, pinning the per-address floor from two independent points. **Attribution is now measured, not asserted:** both 429s carry a `referer` byte-identical to the `emailRedirectTo` built at `activar/actions.ts:86-89`, so they came from the ungated `enviarMagicLink` | Wrap `enviarMagicLink` + `solicitarReset` in `permitirReenvio`; give `over_email_send_rate_limit` its own state with a countdown **in place of the reload button**. T1-03/04, T2-01, T5-02/03, T9-03, RT-06 |
| 2 | **One tap binds someone else's paid membership to a caller who holds no row in that gym, and overwrites the invited email — no undo in the app** | Member B's paid month appears in member A's app; B's invite is dead and the desk's REENVIAR button refuses | `activar/page.tsx:83-85` renders `VincularForm` on *any* live session (and `vincularAction` is a Server Function, so that render gate is not a control); `activar/actions.ts:137` calls `intentarReclamoPorCodigo` (which mints the firma server-side, `registro.ts:343`); `reclamar_por_codigo.sql:54-58` guards only "caller owns no row in this gym", then `:60-68` sets `auth_user_id`, `email = v_email`, `claim_code = null` in one UPDATE with no comparison to the target row's email | held — **exposure resized round 2**, severity unchanged (`R2-R2-top-rows-refute.md` row #2) | measured — RPC body re-read at HEAD; **67** armed codes live (`claim_code not null and auth_user_id is null`), reproduced exactly; `clientes` has no `updated_at` (`42703` on the probe) and `auth.audit_log_entries` = 0, so the original address is unrecoverable. **Round 2 correction:** "whoever is signed in" is too wide — `:54-58` refuses any caller who already owns a row in that gym, so the live surface is the **10 of 62** accounts holding no `clientes` row, plus every future cross-gym member. **0** identities hold rows in two gyms today | Refuse in the RPC when the row's existing `email` is non-null and differs from the caller's verified address; show the invitee's **masked** email in `VincularForm`. Takes `test:denial` with a written-row assertion. T3-06, T4-07, T7-01, RT-07 |
| 3 | **Most new RED members enter through `/registro`, not the invite the desk sends — a share shift dated 2026-08-17, not caused by `afd7a5d5`** | An invited member taps LOGIN, sees "Crea tu cuenta", mints a second identity, and `/activar` is on the magic-link rail forever | `entrar-form.tsx:341-353` renders an unconditional full-width "Crea tu cuenta" to `/registro` — shipped at `2c040430`, **2026-07-08**, and **not touched by `afd7a5d5`** (full diff read: it changes only the resend/rescue block, the `AVISOS` motivo map and the `enlaceInvalido` → `motivoEnlace` rename). `registro.ts:153-158` stamps `full_name`, `activar-cuenta/index.ts:92-95` does not — that is the discriminator | **held on the share; the attribution to `afd7a5d5` and the "every failure mode" clause are REFUTED** (`R2-R1-headline-refute.md`) — re-ranked **3 → 15**, and it is exposure, not regression | measured — RED 43 claimed = 18 `/activar` + **25 `/registro` (58%)**; recent weeks 83–89%, n=6–9, 95% CI [44%, 98%]. Split at the commit's own timestamp (`2026-08-31 01:26:40Z`): 17 vs 20 → 1 vs 5, Fisher one-sided **p = 0.19**; the doc's `2026-08-30 00:00Z` cut (25 h 27 m early, 3 rows misallocated) gave p = 0.038. Best-fitting change point **2026-08-17**, p ≈ 0.007, coincident with a 21-invite seed wave (2026-08-13) draining; `/activar` per-day flat 0.29 → 0.43 → 0.38 across the commit. The proxy itself survived attack: 52/52 agreement with `email_confirmed_at − created_at < 1 s`, unchanged since `ead16db8` (2026-07-02), and a second code-derived proxy (`? 'phone_e164'`) agrees on all 12 week×gym cells | At `/registro`, an email matching an unclaimed coded row in the host gym routes to `/activar` instead of signing up. **Exit trigger for the seed-wave explanation:** RED's `/activar` rate below **0.15/day** sustained 3 weeks while the desk sends ≥4 invites/week ⇒ a rail defect, not a backlog. Re-run 2026-09-23. T2-03, T5-01, RT-02 |
| 4 | **The only automated watcher on this path has never sent an alert, while 14 members sit wedged platform-wide — worst 1,218 h** | None — that *is* the defect; the operator is never told | `resumen.ts:176-179` alerts on **any** wedged row on **every** run and mails through the same Resend key. The `0 * * * *` at `route.ts:32` vs `0 12 * * *` at `apps/admin/vercel.json:6` is **a stale docstring, not a misconfiguration** — `860a3893` (2026-09-02 08:36Z) says Vercel Hobby rejects an hourly cron as a paid feature, and `resumen.ts`'s `HORA_RESUMEN_DIARIO` was already built for the 12:00 UTC slot | held — **framing corrected round 2** (`R2-R2-top-rows-refute.md` row #4); re-ranked **4 → 3** | measured — the wedge is **14 rows platform-wide** (forge 4 / red 7 / forge-demo 2 / red-demo 1), worst **1,218 h**; Resend ledger re-paged with the admin key: **196** mails 08-12 → 09-02, **0** subjects containing "Alerta"; `pg_stat_statements` (reset `2026-05-29T20:23:34Z`, unchanged) holds **zero** calls of the cron's literal `select correo, motivo, horas from public.registros_atorados()` — the cron has never reached its own DB call. Today's 12:00Z slot had **both** arms live (atorados = 3, plus 5 × `send-email` 400s); nothing mailed. **"Not deployed" is dead:** unauthenticated `curl https://red-admin.ibookit.lat/api/cron/alertas` → **401 "No autorizado"**. Remaining candidates: the schedule never fired, or it fired and died at the `CRON_SECRET` 401 / env-guard 500 (`route.ts:161-180`) | `curl -H "Authorization: Bearer $CRON_SECRET" https://<admin-host>/api/cron/alertas` — **only the authenticated body discriminates**; `route.ts:14-16` says the 401 body is identical either way by design, so the unauthenticated probe cannot answer the first arm. Then write a liveness row per run to `public.cron_run_log`. T1-01, T6-02, RT-05 |
| 5 | **Login and roster are joined on `lower(email)` alone; a miss silently mints a second, zero-balance member** | "Pagué y la app dice 0 clases", with no error and no way back | `reclamar_o_crear_cliente.sql:50-51` matches on `gym_id` + `auth_user_id is null` + `lower(email)`; `:74-86` falls through to an INSERT with `clases_restantes = 0`; the invite tap afterwards hits `reclamar_por_codigo.sql:54-58` ("Ya tienes cuenta en este gimnasio"), and `activar/actions.ts:137-138` swallows that refusal and redirects to the same empty screen | held **verbatim** under a round-2 refutation attempt (`R2-R2-top-rows-refute.md` row #5); live occurrence still **unmeasured** | measured for the code path and the exposure — 47 rows carry a `claim_code` with **no email** (forge 24 / red-demo 11 / red 8 / forge-demo 4), all 8 RED ones with a current `vence`; 2 split-name pairs already exist (red "karen lara", `vence` {2026-09-12, 2026-07-16}; forge "joel trevizo"). No claimed row was found beside an unclaimed paid twin, by either round. Round 2 reproduced the 47 and its 24/11/8/4 split to the digit, and adds a supporting read: `reclamar_o_crear_cliente.sql:75-77` already raises `Teléfono requerido` before the INSERT, so the phone the fix hint needs is guaranteed present on that arm | Before the INSERT, refuse with `POSIBLE_DUPLICADO:<id>` when an unclaimed row in the gym shares the 10-digit-normalised phone. A refusal, not a phone claim — ADR-0009 survives. T4-01, T7-07, RT-08 |
| 6 | **Members are structurally uninvitable and the desk shows no defect — 8 paying RED members, and 44 of forge's 50** | Member paid, has no app, and nobody knows | `derive.ts:160-174` derives `sin_email`; `cliente-detalle.tsx:487-488` gates the whole invite block on `sin_invitar` OR `invitacion_enviada`, with its own comment conceding `sin_email` "has nothing to send"; `invitaciones.ts:229` returns `{ok:false, motivo:'sin-email'}` | held — **enlarged round 2**; re-ranked **6 → 5** | measured — RED with `vence >= current_date`: 47 vigentes, 37 con acceso, **10 sin acceso, 8 of them with no email at all**; 15 RED rows have `email IS NULL`; 91 platform-wide. **Round 2, the number that matters** (`R2-R1-headline-refute.md` §6): **forge = 50 clientes, 6 invited, 2 claimed, 44 `sin_email`** — the only gym the owner does not run has **4% of its roster on the member app**. Cause unmeasured: batch attendance entry with no intent to invite (memory `class-booking-unused-in-prod`, *asserted*) is as consistent with it as a defect | Add `sin_email` to the ficha's invite block with an "AGREGAR CORREO" action, plus a roster-level count. ~4 lines of JSX. **Then ask forge's operator whether 44 missing emails are intentional** — that answer decides whether this is a defect or a data-entry mode. RT-01 |
| 7 | **The 6-digit OTP rescue rail has rendered in 0 of 10 live mails since it shipped, and six mails share one subject** | Six identical "Confirma tu cuenta" mails, only the newest works, and no code to type as a fallback | `correo.ts:91` — `if (emailActionType !== "signup" || !/^\d{6}$/.test(token)) return null`. The **action-type** half passes (all 10 live mails carry the signup subject); the **regex** half fails, so the live `email_data.token` is never 6 digits. `correo.ts:109-144` has three fixed subjects with no date or sequence in the body | held | measured — both lenses fetched every auth mail sent since the real v8 deploy (`list_edge_functions` `updated_at` 2026-08-31T02:14:37Z): 10 mails / 5 recipients, **0** contain the code block; ledger subject split "Confirma tu cuenta" 45 vs "Continúa en tu cuenta" 2 over 30 days; per-address stacks 6, 6, 4, 3, 2 | One instrumented send logging `typeof token` + `token.length` (never the value) settles why. Independently: put the send time in the subject — one template line. T1-02, T7-06, RT-11 |
| 8 | **A mailed link is spent on a bare GET, and `/auth/confirm` never checks whether the member is already signed in** | "El enlace de tu correo ya expiró o ya se usó" on the member's own second tap | `auth/confirm/route.ts` GET goes straight from parsing `code`/`token_hash` to `confirmarCodigo`/`confirmarTokenHash` — **no `getClaims` anywhere in the 150-line file**; `:146` redirects to `/entrar?error=token-rechazado` | held | measured — live 24 h `/verify`: 6x200, 4x403 `otp_expired` "One-time token not found" (n=10, a shape not a rate); and***@gmail.com confirmed 200 at 2026-09-01 21:58:14Z then produced four consecutive 403s to 22:02:49Z, re-submitted `/registro`, and fell back to a password login | `const {data} = await supabase.auth.getClaims(); if (data?.claims?.sub) return finalizarAuth(...)` before the token branches; then the POST interstitial. T2-06, T5-04, T9-11 |
| 9 | **A dropped response mid-activation permanently moves the member onto a rail production has never once exercised** | Generic "No pudimos activar tu cuenta"; every retry from then on lands on the magic-link screen | `activar-cuenta/index.ts:92` `createUser` then `:105` `generateLink` then `activacion.ts:124` `confirmarTokenHash`: three uncommitted-together side effects with **no compensating `deleteUser`** on the `linkErr` path; the retry hits `email_exists` and falls to `cuenta_existente` | **mechanism held; the live-evidence sentence is STRUCK** (`R2-R2-top-rows-refute.md` row #9) — re-ranked **9 → 22** as a latent one-way door, never observed to fire | measured — the same six log lines read correctly: `/admin/users` = **1 × 200 + 5 × 422 `email_exists`**, and the single `/admin/generate_link` 200 pairs with the one successful `createUser` **in the same second, same uid**. `activar-cuenta` edge statuses in the window: 5 × 409, 1 × 200, **zero 500s** — the `linkErr` arm (`index.ts:105-111`) returns 500 and never ran. The five 422s mint nothing by explicit design (`index.ts:96-99`). Round 1 read this as "five createUser attempts that never reached generateLink"; row #3 read the identical lines correctly and the referee did not catch the collision. Still measured: live passwordless-confirmed rows = 0; identities holding `clientes` rows in two gyms = 0 | On `linkErr`, delete the user this same invocation created; or treat a pre-existing user with no password as a RESUME. T2-05, T7-02, T9-06 |
| 10 | **The wedge detector sees 1 of 14 stuck members platform-wide, mislabels the one it sees, and forgets everyone at day 30** | The member is invisible; nobody is told | `registros_atorados.sql:3` roots the CTE in `auth.users`, so a member who never clicks the invite has no row at all; `:31` hardcodes `filas_roster` to the literal `0` on the sin-vincular arm; both arms carry `> now() - interval '30 days'` (`:25`, `:34`) | held — **denominator corrected round 2**; re-ranked **10 → 4** | measured — the `clientes`-rooted wedge this row proposes as its own fix, run for the first time: **14 rows** (forge 4, max 1,218 h · red 7, max 691 h · forge-demo 2, max 1,271 h · red-demo 1, 965 h). A **direct email join** of those 14 against live `registros_atorados()` output matches **1** — iva***@gmail.com (sin-vincular, `filas_roster: 0` while a paid roster row exists). **Coverage is 1 of 14 = 7%**, not round 1's "14%, 1 of 7" and not the critic's asserted "3 of 14 = 21%": the other two `registros_atorados()` rows (jes***@hotmail.com, pau***@hotmail.com) have **no `clientes` row at all** — they are stuck `/registro` non-confirmers, a rail this row's fix does not touch. All 14 wedge rows **do** render on the desk as "Invitada {fecha}" (`derive.ts:132-182` → `clientes.tsx:343-346`, `cliente-detalle.tsx:297-298`, `vender.tsx:475-478`) — the badge simply carries no age or urgency, so 66 h and 1,271 h look identical. Separately, the 4 rows with a `claim_code` and **no** `invitacion_enviada_at` are **all `red-demo` seed fixtures** (`5eed…` UUIDs), so that risk shape has **zero** live instances | Add a third arm rooted in `public.clientes` (`auth_user_id is null and claim_code is not null and invitacion_enviada_at < now() - interval '48 hours'`); compute `filas_roster` on both arms; widen the outer bound to 365 days and cap the mail body instead; put the **age** in the roster badge. RT-04, T6-03, T1-01 |
| 11 | **The admin proxy rides auth-js's cookie teardown with no `try/catch` and no park; the client proxy has both** | Desk operator is silently signed out mid-shift and bounced to `/login` | `apps/admin/src/proxy.ts:82` is a bare `await supabase.auth.getClaims()`; `:56-71` `setAll` writes every cookie batch onto the response, including auth-js's deletions-only teardown. `apps/client/src/proxy.ts:21-23,35-44,124-135,167-181` has the two guards admin lacks | held, severity cut 5 to 4 | measured — `GoTrueClient.js:3927-3933`: a non-retryable refresh error calls `_removeSession()`; `fetch.js:30-41` `NETWORK_ERROR_CODES` excludes 500/429. **Correction:** `:4821-4830` returns `{data:null,error}` rather than throwing, so the effect is a forced sign-out, **not** a 500 on every admin route | Extract `esBorradoTotal`/`esSesionMuerta`/the try-catch into `@gym/data/server/proxy-sesion` and import it in both proxies, so the next divergence is a compile error. T3-01 |
| 12 | **A refresh-token race is classified as a revoked session and sheds the cookie — 9x in 24 h, 6 of them in 2 seconds** | Member is bounced to `/entrar` while `auth.sessions` still holds their row | `apps/client/src/proxy.ts:35-44` puts `refresh_token_not_found` and `refresh_token_already_used` in `CODIGOS_SESION_MUERTA`; `:169-178` applies the parked teardown for them. `supabase.ts:26` memoizes the client **per request only**, and `GoTrueClient.js:3908-3911` dedupes refreshes only within one client instance — cross-instance dedup does not exist | held | measured — live 24 h `/token` 400s: `refresh_token_not_found` n=9, with a 6-in-2-seconds burst at 2026-09-01T20:42:58-59Z from two egress IPs, referer bare `https://red.ibookit.lat` | Drop both race codes from `CODIGOS_SESION_MUERTA`, keeping only `session_not_found`/`session_expired`; log the code on every shed. T3-02 |
| 13 | **RED serves two client hosts with disjoint `__Host-` cookie jars and no canonical redirect** | Signed in on one URL, signed out on the other; the pre-cutover invite mail points at the other one | `gym_domain` maps both `www.redfunctionaltraining.com` (`es_principal=true`, 2026-08-28) and `red.ibookit.lat` to gym `red`; `cookie-options.ts:35-49` — `__Host-` forbids `Domain`, and its own 2026-08-28 comment states the consequence. `invitaciones.ts:128-140` mints on `es_principal` | held | measured — both lenses curled both `/entrar` and `/activar`: HTTP 200, 0 redirects, identical 31049 bytes; every server-side GoTrue call logs referer `https://red.ibookit.lat`, i.e. the project Site URL is one tenant's platform subdomain; Marce's invite #1 of 2026-08-19 names `red.ibookit.lat`, #2/#3 name `www` | 308 every non-`es_principal` client host to the principal, in `proxy.ts`, before any auth work. Never add `Domain=`. T3-03, T5-06 |
| 14 | **The `send-email` hook makes three unbounded network calls inside a documented 5-second budget, its 503 is not retry-able, and a Resend 4xx is a silent drop the monitor cannot see** | No mail arrives; GoTrue has already burned the token and rotated the previous one | Primary re-fetched this round — Supabase Auth Hooks: *"a time budget of 5s for the entire webhook invocation, including retry requests"* and *"Return a retry-able error by attaching an appropriate status code (429, 503) and a non-empty retry-after header"*. `index.ts:46-64` (two gym reads) and `:113-121` (Resend POST) carry no `AbortSignal`; `:137-140` sets only `Content-Type`. `correo.ts` `respuestaEnvio` maps any non-null/429/5xx status to **HTTP 200** (its own comment says DROP), while `resumen.ts:66-70` filters `function_edge_logs` on `status_code >= 400` | held | measured — live 24 h `send-email`: 200s n=8 avg 768 ms **max 2594 ms = 52% of budget**, 400s n=6; `invitaciones.ts:56` bounds the *identical* Resend call at 10 s | `AbortSignal.timeout(2500)` on the Resend fetch, 800 ms on the gym reads, `"retry-after": "true"` on the 503, and count `function_logs` lines matching `send-email: resend status` in the cron. T1-06, T1-07, T9-02, T10-05 |
| 15 | **The email-claim rail never clears `claim_code`, so 10 active RED members keep a live invite code and the roster's "pending" count is wrong** | The old invite link answers "Tu cuenta ya está activa" forever and the desk's REENVIAR is refused | `reclamar_o_crear_cliente.sql:59-65` never assigns `claim_code = null` (`reclamar_por_codigo.sql:67` does); `invitacion_info.sql:1-4` has no `auth_user_id` filter and is `SECURITY DEFINER` with `anon` EXECUTE; `preparar_invitacion.sql:26-28` raises "La cuenta ya está activa" for a claimed row | held | measured — live: 10 rows with both `claim_code` and `auth_user_id` set, **all gym red**, 9 of 10 carrying the `/registro` signature; calling `invitacion_info` on those codes returns full names 17-31 chars long. ADR-0015 / P-123 scoped the disclosure to an *unclaimed* invite; re-derived here as broader | Two lines: `claim_code = null` in the email rail's UPDATE, and `and c.auth_user_id is null` in `invitacion_info`. Both take `test:denial`. T2-07, T4-05, T7-03 |
| 16 | **Every new-client sale fires two Resend calls against one account-wide daily cap, and the refusal reason is discarded before the desk sees it** | Member pays, sees an on-screen receipt, and never receives the invite; the operator keeps selling | `vender/actions.ts:61-71` `Promise.all([resolverInvitacion, enviarReciboDeVenta])`; `:114` collapses to `envio.ok ? {estado:"enviada"} : {estado:"fallo", email}` — `enviarInvitacion` decodes `daily_quota_exceeded` (`invitaciones.ts:71-72`) and `InviteState` (`ventas.ts:136-140`) has no field for it. `resendTransport` has a 10 s abort and **no retry, no outbox** | held | measured for code and volume — Resend ledger 194 mails 08-04 to 09-02: peak **37/day**, peak 30/hour; account-wide bounce 3/194 = 1.55%, and 3 of the last 4 negative events are `@red-demo.test` sandbox addresses that can never resolve. **modelled** for the ceiling, **corrected round 2**: 100 mails/day ÷ **2.9 measured mails per new member** = **≈34** new members/day platform-wide, not 50. The 100/day is now read from https://resend.com/pricing (primary) and is conditional on the account being on Free; the 2.9 comes from the ledger's own subject-class split (63 invites : 63 of 75 receipts : 58 auth mails) — the member's own door spends a third mail this row never counted | Widen `InviteState` with a `motivo`; refuse `.test`/`.invalid` recipients inside `resendTransport` next to the existing non-ASCII refusal; read the Resend plan (§12). T10-01, T1-08, T1-11 |
| 17 | **Consent is stamped for an aviso that does not exist — 51 of 51 stamps are versionless** | None; the legal record is simply false | `reclamar_o_crear_cliente.sql:62-64` and `reclamar_por_codigo.sql:64-66` write `terms_accepted_at = now()` / `privacy_accepted_at = now()` **unconditionally**, regardless of `p_aviso_version`; the three rails that reach them (`auth/confirm/route.ts:84`, `activar/actions.ts:137`, `reservar/page.tsx:65`) all pass a literal `null` and render no consent surface | held | measured — live: `privacy_accepted_at` set on 51 rows, `privacy_aviso_version` null on 51 of 51; `gym_legal` has **0 rows for all four gyms**, so `identidadLegalCompleta` is false everywhere; Marce's own stamps are 2026-09-02 16:31:48.747, version null | Stamp only when `p_aviso_version` is non-null — a null timestamp is a true statement, a versionless one is a false one. Then fill `gym_legal` (owner-owed). T4-03 |
| 18 | **Every claim is a swallowed best-effort, so a half-failed network hop lands a paying member on "Aún no eres miembro" with no error and no log line** | "Aún no eres miembro de este gimnasio" after paying | `registro.ts:323-330` turns every throw into `{ok:false, motivo}` and logs **nothing**; `activacion.ts:151-167` runs getClaims, actualizarPassword, `intentarReclamoPorCodigo` and returns `{ok:true}` regardless; `auth/confirm/route.ts`'s `if (codigo) ... else if (!next)` means the email rail can never retry a failed **code** claim, because the magic-link URL always carries both | held | measured — code read end-to-end at HEAD; `reservar/page.tsx:57-68`'s self-heal is the **email** rail only, which matches nothing for the 47 email-less coded rows; `sin-membresia.tsx:21-24` is the verbatim symptom | `console.warn(JSON.stringify({event:'reclamo-fallido', motivo}))` at `registro.ts:328`, and change `finalizarAuth`'s `else if` so the email rail runs when the code rail returned `ok:false`. T4-06, T9-01 |
| 19 | **The only merge procedure names the wrong `gym_id` for RED, and every child FK cascades** | A member's entire payment and attendance history silently disappears | `docs/runbooks/duplicate-member-merge.md` Step 0 says *"the RED gym is 'd5f81022…'"*. Live, `d5f81022-0f3d-48ac-96b9-5e32a5214285` is **forge**; RED is `ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9`. `ventas_cliente_id_fkey` is `ON DELETE CASCADE` (`confdeltype='c'`); no merge RPC exists (0 grep hits for `fusionar`/`merge` in `functions-canonical/`) | held | measured — both lenses re-ran `select id, slug from public.gym`; `clientes` has 19 columns, no `updated_at`, no `deleted_at`; `auth.audit_log_entries` = 0, so the deletion would be undetectable | Replace the hard-coded hint with `select id from public.gym where slug='red'`, and move the pre-checks into an RPC so repoint-before-delete is enforced by the database. Two split pairs are queued for this runbook today. T4-02 |
| 20 | **The project cannot name a single failing member, so "elevated lately" is unfalsifiable** | None directly; it is why every other row here had to be reconstructed from a mail ledger | GoTrue records no `actor_username` on `invalid_credentials`; `/entrar` signs in server-side (`entrar/actions.ts:29-34`) so `remote_addr` is a Vercel egress IP; `auth.audit_log_entries` is empty table-wide; the log stream is capped at 24 h and there is no drain anywhere in the repo | held | measured — live 24 h `/token` 400s: 25 `invalid_credentials` + 9 `refresh_token_not_found` + 1 `email_not_confirmed`, `actor_username` blank on every row; 18 of 25 attributed to AWS egress, one residential IP recurring 7x over 54 minutes; `select count(*) from auth.audit_log_entries` returns 0, re-run by three seats | An application-side `auth_evento` table written from the four door actions that already hold the address. `sesion.ts:113,151,192` and `confirm/route.ts:49` already emit structured `console.warn` — give them a durable sink. T2-08, T5-12, T6-12, RT-12 |
| 21 | **Every write on the new-user path is unbounded, including the tenant lookup that gates every page of both apps** | White screen, then Next's built-in English error page | `fetch-shield.ts:140` — `if (method !== "GET" && method !== "HEAD") return fetch(input, init)`; `:51` documents `mi_membresia` as VOLATILE-so-POST. `resolve-tenant.ts:71-77` admits the exclusion in first person (*"The `gym_id_por_host` RPC below is NOT bounded"*) and both proxies `await` it first (`client/proxy.ts:102`, `admin/proxy.ts:34`). One GET `/auth/confirm` makes at least 4 unbounded legs | held | measured for the code; **modelled** for the consequence — no `maxDuration` is set for any door (`grep maxDuration apps` finds only `cron/alertas/route.ts:60`), so the bound is Vercel's per-plan default, unread. Live latency is healthy: `/token` n=143 avg 160.9 ms max 392.5 ms; jwks n=744 avg 2.9 ms max 51.3 ms. The 266 s reference is carried from the 2026-08-29 incident comment | Do **not** add a POST timeout in the shield (see §7 #5 — that is a top-ranked green-and-fatal one-liner). Bound the three plain fetches outside the shield: Turnstile, the hook's Resend POST, and `activacion.ts:99`. T3-04, T9-05, RT-10 |
| 22 | **Turnstile is a fail-closed single point of failure on all three account-creating doors, with no timeout, no reset on a server error, and about one gym of hostname headroom left** | "No pudimos verificar que no eres un robot" — on the second submit after *any* server error, and for 100% of a new gym's members if its hostname is unlisted | `turnstile.ts:27,33,36` — raw global `fetch`, no `AbortSignal`, catch returns `false`. Gates `registro/actions.ts:47`, `activar/actions.ts:62` and `:127`; `/entrar` is not gated. Neither `activar-form.tsx` nor `registro-form.tsx` resets the widget on `state.status === 'error'` — the single `useEffect` in each is wired only to the widget's own callbacks | held | measured — live `gym_domain` by app: **client 8, admin 7** (both lenses). The ~10-hostname widget cap is **asserted** (memory `vercel-domain-scale-verdict.md`), so the headroom figure is not primary. Lens B's caveat: Turnstile auto-refreshes about every 300 s, so "until a manual reload" overstates permanence past ~5 min | `AbortSignal.timeout(5000)`, a distinct "verificación no disponible" state, a `useEffect` keyed on `state.status === 'error'` calling `turnstile.reset()`, and either "any hostname" mode or one widget per gym. T2-04, T2-10, T9-10, T10-04 |
| 23 | **`gym_membership`'s RLS is an unindexable OR evaluated once per row over the whole platform, on every member page load** | Nothing today; RED's members get slower every time Forge onboards | Two permissive SELECT policies OR into `(user_id = auth.uid()) OR (select is_staff_of(gym_id))` — a correlated subplan. Both member-path readers send no predicate at all: `inquilino.ts:79-81` and `agenda-miembro.ts:141` | held | measured — live `EXPLAIN (ANALYZE, BUFFERS)`: `Seq Scan ... Rows Removed by Filter: 58 ... SubPlan 2 ... loops=58 ... Execution Time: 2.125 ms`; with `enable_seqscan=off` it becomes an Index **Only** Scan with the OR still in `Filter:` — structurally unindexable, not a small-table artifact; `pg_stat_user_tables`: **748,987 seq scans / 10.3 M tuples read on a 58-row table**. **Round 2 adds the mechanism for the "2 reads":** Supabase's performance advisor returns 3 × WARN `multiple_permissive_policies` on exactly `clientes` (`clientes_member_select` + `clientes_staff_select`), `gym_membership` and `reservation` — it is Postgres evaluating two permissive policies per SELECT, not a client-side double fetch (`R2-E2-live-checks.md` §b, **measured — new**). The 146 ms at 2,000 rows and >1 s at 14,000 rows stay **modelled**, a linear extrapolation of the measured 36.6 us/row | Pass the predicate the reader already knows: `.eq("user_id", uid)` on the member path. An O(platform) scan becomes an O(1) probe with no policy change. Merging each table's two permissive SELECT policies into one is the advisor's own fix and is independent of it. T10-02 |
| 24 | **All nine `*.ibookit.lat` TLS certificates expire 2026-10-07, and renewal has never once run for this account** | A bypassable browser certificate warning on the invite link — worse than a clean outage, and invisible in our logs | Nine hosts issued in one 19-minute window | held | measured — two independent `openssl s_client ... -enddate` runs: app 06:24:48, red 06:39:43, forge 06:40:00, red-demo 06:40:29, forge-demo 06:42:10, and the four admin hosts through 06:43:04, **all Oct 7 2026 GMT**. `www.redfunctionaltraining.com` is on its own cycle (notAfter Nov 26 2026) and survives. The "Vercel renews 14-30 days out" window is **asserted**, carried from `docs/Context/2026-08-19-member-reachability-todo.md` | Calendar the one-liner for 2026-09-10 and again 09-24. If `notAfter` has not moved by 09-24 there are 13 days to fix by hand. P-109 re-derived. T6-01 |
| 25 | **A second person on a shared phone lands inside the first person's app, with no way out from any public screen** | Family member taps "Entrar", books a class, and it comes out of the other person's balance | `entrar/page.tsx:35-40` and `registro/page.tsx:33-34` hard-redirect **any** session with `claims.sub`; all four `signOut` sites are membership- or invite-conditioned, and `cerrar-sesion-link.tsx`'s own comment states the two escape hatches are mutually exclusive | held | measured — grep: exactly 4 `signOut` call sites, all `{scope:'local'}`. Lens B's caveat: once bounced in, the perfil overlay's sign-out is reachable one tap deeper — the claim is about the **entry surface**, not the whole app | `/entrar` should render a chooser: *"Estás dentro como a***@gmail.com — continuar / entrar con otra cuenta"*, the same shape `VincularForm` got in #150. T7-04 |
| 26 | **The browser gate on this surface has been red since 2026-08-30, an unarmed run exits 0, and half of it was invisible to round 1** | None; it is why three auth-surface pushes shipped unproven | `playwright.config.ts:68` baseURL is `http://red-demo-client.localhost:3100`, a host GoTrue clamps to the bare Site URL, so `correo.ts:64-77` throws, `index.ts:106-111` returns 400, and GoTrue reports "500: Invalid payload sent to hook". `session.spec.ts:63-64` is a literal `test.skip` on unset credentials; neither `.github/workflows/ci.yml` nor `.husky/pre-commit` runs `test:e2e`. **Scope correction (critic #3):** `playwright.config.ts:58` is `testDir: "./e2e"`, so the gate is **two** suites and **6** tests — `session.spec.ts` (3) **plus `signup.spec.ts` (3)**, which round 1 never mentions; `AGENTS.md` still calls it "the repo's only browser test… three Chromium checks" | held, severity cut 4 to 3 on scope | measured — live 24 h: exactly **6** `unexpected_failure` 500s on `/signup`, all `delivered@resend.dev`, spread over 11 hours (21:40Z → 08:53Z) against **production** `red.ibookit.lat`, while every real member's `/signup` in the same window returned 200 with a matching Resend mail. It is a **latent config trap and a dead gate**, not a live member failure — but the producer of that synthetic production traffic is **unidentified** (`R2-E2-live-checks.md` §c: the logs carry no caller) | Add the Playwright host to Supabase's Redirect URLs (or pass an already-allowed `emailRedirectTo`), and make an unarmed `test:e2e` **fail fast without executing** — `signup.spec.ts:26-31` documents that test 1 POSTs the real form against LIVE auth, so "make it non-zero" must not mean "arm it". RT-09, T8-12, T5-05 |
| 27 | **Neither app has a single error boundary, and no door has a `loading.tsx`** | Next's built-in English error page, message stripped in production, no retry, no way back | `find apps/{client,admin}/src -name 'error.tsx' -o -name 'global-error.tsx'` returns **0 results**; 6 `loading.tsx` files exist and none is on `/activar`, `/activar/contrasena`, `/registro`, `/entrar`, `/auth/confirm`. `activar-form.tsx:5,106` and `registro-form.tsx:5,177` use `useActionState` inside `startTransition`, so a thrown action rethrows during render | held, severity cut 4 to 3 | measured for the absence; **modelled** for the trigger — the platform timeout that fires it is unread (see §12) | One `app/error.tsx` per app, in Spanish, with `unstable_retry()`. Cheapest single item in this document, and it covers every lower row's failure mode. T9-04 |
| 28 | **A replayed sale silently discards a correction and re-fires both mails** | The desk sees "No se pudo cobrar — Revisa los datos e intenta de nuevo", corrects the amount, resubmits, and gets a success receipt for the **uncorrected** sale | `registrar_venta.sql:37-49` returns the existing row on a matching idempotency key **before** the `p_metodo` validation at `:51`; `vender.tsx` resets `idemKey` only inside `resetForm`, never on the failure path. `ventas.ts:225` derives `isNew` from `input.mode === "new"` — a client-declared flag, not what the RPC did — so `vender/actions.ts:61-70` re-runs the full invite + receipt fan-out on a replay | held | measured — code at HEAD; `preparar_invitacion.sql:30` reuses the same `claim_code`, so the duplicate invite mail carries the same code. Harmless in itself, but it puts the member back at `/activar`, which spends the per-address auth-mail window (row #1) | Fix the copy first — "Revisa los datos e intenta de nuevo" is provably wrong under a live key. Then mint a fresh key when any field changes after a failure, and derive `isNew` from the RPC. T9-07, T9-08 |
| 29 | **Sessions never expire server-side and there is no per-device revocation** | Nothing today; a lost phone stays signed in indefinitely | 156 live `auth.sessions` rows, 156 with `not_after IS NULL`; `@supabase/ssr@0.10.3` `constants.js` sets `maxAge: 400*24*60*60` and `cookie-options.ts:35-37` overrides only name + secure; the only revocation in the repo is the `gym_membership` AFTER DELETE trigger, which is global per identity | held, and **this is the owner's explicit ruling** (ADR-0016, Amendment 2026-08-24) | measured — both lenses re-queried: 156/156 null `not_after`, 30 users with more than one session, max 14 for one user, oldest created 2026-07-11 20:29:21Z, one session refreshing unbroken for 19.8 days and another for 28.4 | No code fix. The only lever is a Pro-plan session time-box; the repo has no per-device revocation to build on. P-125/P-126 re-derived at 26x the prior sample. T3-09 |
| 30 | **`mi_membresia` sequential-scans `ventas` on every member page load** | The saldo card is the last thing to paint; second-long outliers already exist at 300 rows | `mi_membresia.sql:36-42` — `from public.ventas v where v.cliente_id = v_cli order by v.created_at desc, v.id desc limit 1`, and there is **no index on `ventas(cliente_id)`** | held | measured — three independent live `EXPLAIN (ANALYZE, BUFFERS)` runs: `Seq Scan on ventas ... Rows Removed by Filter: 296-297 ... Buffers: shared hit=8-10 ... 0.16-0.29 ms`; `pg_indexes` on `ventas` lists 5 indexes, none on `cliente_id`; `pg_stat_statements` over 96 days: 1,255 calls, mean 17.3/26.2 ms, **max 862 ms and 1,155 ms**. The 68 ms at 100k and 200 ms at 300k rows are **modelled** from the measured 0.68 us/row | `create index concurrently ventas_cliente_created_idx on public.ventas (cliente_id, created_at desc, id desc);` — also removes the Sort node and serves `conteo_cargable`. P-025/P-061 re-derived with a live plan. T4-09, T10-07 |
| 31 | **`pnpm typecheck` false-greens a cross-package type error: turbo never invalidates an app's typecheck when `packages/data` changes** | None directly — it is a gate that reports green on a broken build | `turbo.json`'s `typecheck` task has no `dependsOn`, so `@gym/client:typecheck` / `@gym/admin:typecheck` replay a cached hash across an edit to a `packages/data` file they import; and the root `tsconfig.json:4` **excludes `apps/`**, so `//:typecheck:root` cannot cover app-level usage either | **held — new, measured round 2** (`R2-E1-regressions-executed.md` method note) | measured — after editing `packages/data/src/server/agenda-miembro.ts`, `@gym/client:typecheck` replayed the **identical** cache hash `47ef7c9ea2411daf` as the untouched baseline. Every §7 row touching `packages/data` (4, 5, 6, 14, 16) had to be run with `--force` to get a real signal; plain `pnpm typecheck` — which is what `.husky/pre-commit` runs — would have reported green | Add `"dependsOn": ["^typecheck"]` (or `^build`) to the `typecheck` task so a dependency change busts the cache. **Exit trigger:** none needed — this is a defect, not a keep; verify by re-running the row-6 diff and confirming plain `pnpm typecheck` now fails |
| 32 | **Compromised-password protection is off, and the 8-character floor is client-side only** | Nothing visible; a member can set a known-breached password at `/registro` and `/activar/contrasena` | Supabase security advisor: `auth_leaked_password_protection` **DISABLED** (HaveIBeenPwned check off). `apps/client/src/lib/auth-validacion.ts:34` is `if (password.trim().length < 8) return "Mínimo 8 caracteres."` — it lives in `apps/client/src/lib/`, is called from the form, and the Server Function is directly POST-reachable, so the floor is browser-side only | **held — new, measured round 2** (`R2-E2-live-checks.md` §b; raised by critic #6) | measured — `get_advisors(security)` at `2026-09-02T18:36Z` returns **27** findings: 2 INFO `rls_enabled_no_policy` (`cron_run_log`, `gym_folio_counter` — neither member-facing), 3 WARN `anon_security_definer_function_executable` (`gym_id_por_host`, `invitacion_info`, `enviar_mensaje_contacto` — two already covered by rows #15/#2, one off-path), **21 WARN `authenticated_security_definer_function_executable`** (unaudited — see §14), and this one. Zero of round 1's 30 rows said anything about password policy while ranking a one-tap membership takeover at #2 | Turn the toggle on (Dashboard → Authentication → Passwords) — it is a config read/write, no deploy — and move the 8-character check server-side into the Server Function. **Exit trigger:** none; it is a one-click default the project declined by omission |

### Struck — refuted in round 1

- ~~**T2-activation-doors-02 — "the `bloqueCodigo` guard silently inverts, so the 6-digit code rides the magic-link rail and lets a member skip the invite claim"**~~ — **Refuted.** `bloqueCodigo` requires **both** `signup` **and** `/^\d{6}$/` (`correo.ts:91`), and 0 of 10 live "Confirma tu cuenta" bodies contain the block (lens B curled the raw Resend bodies with the prod key; lens A reproduced it). There is no code to type at `/codigo`, so the guard cannot invert. The surviving half — one live token per user, one fixed subject, the two doors rotating each other's links — is ranked as row #7.
- ~~**T5-drift-register-07 — "the OTP fallback renders for signup mail only, so Marce's six mails were all `/registro` signup mails"**~~ — **Refuted on its rail attribution.** A fresh cross-join of `auth_logs` against the Resend ledger shows the `/otp` 200s at 2026-09-02 16:29:42, 02:18:04 and 01:17:31 each produced a mail titled "Confirma tu cuenta" **at the same second** — `signInWithOtp` against an unconfirmed account **is** labelled `signup`, which is exactly why the ledger reads 45 vs 2. The code is absent on *every* rail because the token is never 6 digits. **Do not "correct" P-087 with this.**
- ~~**T3-session-tenant-08 — "the `gym` cookie is the sole tenant input for a call that WRITES a `gym_membership` row"**~~ — **Refuted.** All three membership-writing call sites hardcode the tenant override to `null`: `auth/confirm/route.ts` `finalizarAuth` calls `resolveTenant(request.headers.get("host"), null)`, and `reservar/page.tsx:60` and `saldo/page.tsx:38` do the same. The cookie cannot reach a write. What survives is a presentation-only tenant-stamp risk (no `Max-Age` on the `gym` cookie; the `host` to `x-forwarded-host` one-liner) — carried into §7 as a Q6 item, not as a live defect.


**Round 2 strikes** (sentences, not whole rows — the rows they sat in survive; see the Round 2 revisions
section):

- ~~"The door mix inverted **at commit `afd7a5d5`**"~~ (§0 item 5, §2, row #3, §10) — **refuted.** The cut sat 25 h 27 m before the commit existed; at the commit's own timestamp Fisher one-sided **p = 0.19**. The change point is 2026-08-17 (p ≈ 0.007) and its measured cause is a 21-invite seed wave draining. `docs/FIndings/new-user-xe/R2-R1-headline-refute.md` §2–§4.
- ~~"**Every** failure mode in this document lives on the `/registro` rail"~~ (§0 item 5, row #3) — **refuted.** 0 of 30 ranked rows are `/registro`-exclusive; #1 and #2 are `/activar`, and #5/#15 run through `intentarReclamoPorEmail`, called from `/auth/confirm`, `/reservar` and `/saldo`. `R2-R1-headline-refute.md` §5.
- ~~"live 24 h `/admin/users` 6 calls vs `/admin/generate_link` 1 (five createUser attempts that never reached generateLink)"~~ (row #9's basis) — **refuted.** Five are `email_exists` 422s that mint nothing; the one 200 pairs with the one `generate_link` 200 for the same uid in the same second, and `activar-cuenta` logged **zero** 500s. `R2-R2-top-rows-refute.md` row #9.
- ~~"the 429 renders as a lie"~~ (row #1's title) — **refuted on the copy.** "No pudimos enviarte el enlace ahora mismo" is accurate; no mail left. The defect is the `window.location.reload()` CTA at `activar-form.tsx:154`. `R2-R2-top-rows-refute.md` row #1.
- ~~"`registros_atorados()` detects 3 of the 14 wedge rows (21%)"~~ — the **critic's own** number, struck before it was ever carried into a row. A direct email join gives **1 of 14 (7%)**. `R2-E2-live-checks.md` §a.4.

### Unmeasured — mechanism real, premise or occurrence not established

- **T6-idle-decay-04 — Supabase Free-plan 7-day pause.** The code half holds (`resolve-tenant.ts:149` returns `tenant:null` on an RPC error, indistinguishable from an unmapped host, so the app renders the generic `DEFAULT_BRAND` "Gimnasio" chrome with no message). The load-bearing premise — *that this project is on the Free plan* — was verified by nobody; the `SUPABASE_ACCESS_TOKEN` in `apps/admin/.env.local` returns **HTTP 401** from the Management API. Settle at Dashboard, Settings, Billing.
- **T7-human-chaos-10 — empty-password login.** Both antecedents are real code (`activar-cuenta/index.ts:92-95` creates users with **no** password; `entrar/actions.ts:30-34` forwards an unchecked empty string to `signInWithPassword`, and `auth-validacion.ts:24-27`'s non-empty check is client-side only while Server Functions are directly POST-reachable). Whether GoTrue authenticates against an unset password was tested by nobody. Live `select length(encrypted_password), count(*) from auth.users` returns `[{60, 61}]`, consistent with both readings. Run it locally before ranking it; the missing one-line non-empty check is worth fixing regardless.
- **RED-TEAM-08 — the ghost-cliente occurrence.** The code path is genuinely there and is ranked as row #5. No live instance was found: every RED `cliente` claimed with `clases_restantes = 0` is either a 0-venta newcomer or an ordinary member, and the `auth.users` row originally cited turns out to be row #10's sin-vincular wedge counted a second time. Settle with a fuzzy-match query — claimed rows whose email is within about 2 edits of an unclaimed coded row in the same gym.

---

## 2. Q1 — Drift register: where are ALL the drifts?

**Verdict up front (revised round 2): exposure is real and measured; the "regression concentrated in
one commit-day" is refuted. One narrow copy regression survives.**

- **Exposure:** RED claimed **27 new members since 2026-08-15** (live `auth.users` joined to
  `clientes`, both lenses). A constant per-member failure rate produces visibly more failures at 27
  members in 2.5 weeks than it did before. **measured**, unchanged by round 2.
- **~~Regression at `afd7a5d5`~~ — REFUTED** (`new-user-xe/R2-R1-headline-refute.md`). The share
  shift is real: RED's claimed members are **25 `/registro` vs 18 `/activar` lifetime (58%)**, and
  the last three weeks run 83–89% (n=6–9, CI [44%, 98%]). Its **date is not**. The round-1 split cut
  at `2026-08-30 00:00Z`, 25 h 27 m before `afd7a5d5` existed (`2026-08-31 01:26:40Z`), moving three
  pre-commit `/registro` signups into the "después" bucket; at the commit's own timestamp the table
  is 17 vs 20 → 1 vs 5, Fisher one-sided **p = 0.19**. Weekly per-day rates show `/activar` falling
  6x at the **2026-08-17** boundary (p ≈ 0.007) and flat at 0.29–0.43/day straight across the
  commit, tracking invite supply (21 invites on 2026-08-13 → 13 `/activar` claims; then 6→1, 4→3,
  7→1). **The simplest sufficient explanation is a one-day seed wave leaving the numerator**, and it
  is the one the data fits. **measured.**
- **Copy regression — survives, narrowed.** Before `afd7a5d5`, a throttled magic-link send rendered
  "Revisa tu correo"; after it, the same 429 renders a full-screen "NO SALIÓ EL CORREO". Round 2
  corrects the second half: that copy is **truthful** (no mail left); what re-fails is the
  `window.location.reload()` button beneath it. **measured**
  (`git show afd7a5d5 -- apps/client/src/app/activar/actions.ts`; `activar-form.tsx:147-154`).
- **Out-of-sample check, new:** forge — the only other real gym — shows **no inversion at all**:
  both its accounts came through `/activar`, 0% `/registro`, before and after the commit. n=2, so it
  proves nothing alone, but it is the only out-of-sample test available and it does not replicate.

| Date | What changed (commit / config) | Guarantee that moved | How much of today's failure it explains | Gate that covers it |
|---|---|---|---|---|
| 2026-08-19 | *(incident, not a commit)* FortiGuard block; member-reachability TODO written | none moved; two time bombs recorded (GET token burn, 9 certs expiring 2026-10-07) | 0% of the activation failures; 100% of row #24 | none (docs) |
| 2026-08-21 | `991323d0` + `15319b29` + `97fbbe58` — session-aware auth surface, fail-soft proxy rotation, and the **birth** of `pnpm test:e2e` | `/entrar` and `/registro` began redirecting live sessions (the 465dcf4 fix) | Fixed a different failure. Its side effect is row #25: the redirect is unconditional, so a shared phone has no public exit | `e2e(convention)` — and see row #26, the gate has been red or skipped since 08-30 |
| 2026-08-24 | `50a6a207` — login-first booking CTAs | `/reservar` CTA no longer sends logged-out visitors to `/registro` | **Exonerated.** The path that produced Marce's collision was 1 tap before this commit and 3 after (`git show 50a6a207 -- public-header.tsx`; at HEAD only `entrar-form.tsx:343` and `contacto/page.tsx:180` link inbound to `/registro`) | vitest |
| 2026-08-28 | `95583ac9` + migration `20260828130000` — `gym_domain.es_principal`; RED's invite mail moves to `www.redfunctionaltraining.com` | Outbound links mint on the canonical host, while `red.ibookit.lat` stays live with a disjoint `__Host-` jar and **no** 308 | Row #13. Marce's invite #1 (2026-08-19) names the old host; #2/#3 name the new one — one code, two jars, one inbox. **measured** | `denial(convention)` + vitest; neither can see a cookie jar |
| 2026-08-29 | `826ee6b2` / `4ba89bc5` / `87f54f27` — `pdx1` pin + `fetch-shield.ts` | GET/HEAD reads bounded (2.5 s jwks, 8 s reads plus one **untimed** retry); every POST left deliberately unbounded | Rows #21 and the Q6 trap at §7 #5. Also: both apps pin `pdx1` but **Next middleware cannot be pinned** — a live curl to both RED hosts returns `X-Vercel-Id: iad1::pdx1::...`. **measured** | vitest (`fetch-shield-coverage.test.ts` asserts `fetch:`, not the region) |
| **2026-08-30** | **`afd7a5d5` (shield wave 1) — the hinge day. Four moves in one commit:** (a) `cuentaExistenteFallo` becomes a hard error screen; (b) `&correo=` pre-fill removed from every invite URL; (c) the `/codigo` OTP rail ships; (d) `registros_atorados()` ships | (a) a 60 s throttle now reads as a permanent failure; (b) invited members must retype the exact address the desk typed; (c) a rescue rail that has never been usable; (d) a wedge detector that sees 1 of 7 | Rows #1, #3, #7, #10. `git log -S 'cuentaExistenteFallo'` returns **exactly one commit**. **measured** for each mechanism — but **round 2 strikes the door-mix attribution**: the split that made this "the hinge day" cut 25 h 27 m before the commit existed, and the CTA (a)/(b) are blamed for shipped at `2c040430`, 2026-07-08 (`R2-R1-headline-refute.md` §2–§3). (d)'s "1 of 7" is now **1 of 14 (7%)** platform-wide. The magnitude of (b) is **no longer un-instrumented**: `activar-cuenta/nucleo.ts:126-133` maps `email_no_coincide` to a unique **HTTP 422**, so `function_edge_logs` answers it — **0 of 6 in the last 24 h**; only the 30-day version needs row #20's durable sink | `denial(convention)` + `e2e(convention)`, and the e2e half was already red (row #26) |
| 2026-08-30 | `17566753` — "one shared resend counter" | Three of five mail-sending doors share `reenvio-limite` | Row #1. The counter's own docstring says "ALL THREE doors"; there are five. **measured** by grep | vitest |
| 2026-08-31 02:14Z | `send-email` v8 deployed live (`list_edge_functions` `updated_at`) | Fail-closed 400 on a non-`/auth/confirm` `redirect_to`; the `/codigo` block ships | Row #7 (0 of 10 mails carry the code) and row #26 (6 owner-only `/signup` 500s per day). Live source is **byte-identical to the repo**, 0 differing lines | `EDGE_DEPLOY_OK=1` pre-push hook; no test |
| 2026-09-01 | `92c2059d` + `4292447f` + `2ecb00dd` + `63f1b48f` — the `senal_gym` freshness rail | Every write broadcasts to `gym:<id>`; every subscribed tab answers with `router.refresh()` | Raises proxy invocations per tab from 09-02 onward. **The 09-01 20:42 refresh burst PREDATES the deploy** — señal did not cause it, it raises the rate going forward. `client-senal.ts` debounce is 600 ms trailing, the only limiter | vitest + `denial(convention)` |
| 2026-09-01/02 | `108b45a0` + `24d9912b` + `491804d1` — multi-gym write/read scoping (`p_gym_id`, `.eq("gym_id")` across 18 files) | Multi-gym staff writes and reads stop landing on the wrong gym | **Genuine improvement.** Also confirms P-103 (`multigym-rpc-roulette`) is **FIXED** at HEAD — `mi_membresia.sql:18-21` and `toggle_favorito_tipo.sql:13-15` both take and filter `p_gym_id`. **Do not re-file it.** The member-path twin is not fixed: `getEsMiembro` still has no gym filter | vitest |
| **2026-09-02 02:36Z** | `860a3893` — `apps/admin/vercel.json` `0 * * * *` becomes `0 12 * * *` ("Vercel Hobby caps cron at once/day") | Wedge detection latency 1 h becomes 24 h, against a design whose own comment calls daily indefensible | Row #4. **Round 2 re-frames this: it is documentation drift, not a scheduling defect** — the commit message says Vercel Hobby rejects an hourly cron as a paid feature, and `resumen.ts`'s `HORA_RESUMEN_DIARIO` was already built for a 12:00 UTC slot, so `0 12 * * *` is the only schedule the plan allows. What is wrong is the ~12 comment lines at HEAD that still assert hourly. New-wedge latency = 24 h (cron) + 24 h (sin-vincular floor) = **48 h**. **measured** (`R2-R2-top-rows-refute.md` row #4) | none |
| **ongoing** | **Documentation drift (new category, round 2).** `AGENTS.md` states `pnpm test:e2e` is "the repo's only browser test: `apps/client/e2e/session.spec.ts`, three Chromium checks" | It is **two** suites and **6** tests (`playwright.config.ts:58` is `testDir: "./e2e"`; `signup.spec.ts` adds 3) | Row #26 and §7 #17 were both written against the wrong denominator. A stale `AGENTS.md` is exactly what a future agent reads before deciding what a gate covers. **measured** (critic #3) | none — no guard reads prose |
| **ongoing** | **Config-plane drift (new category, round 2).** This register only reads `git log`, so it cannot see the Supabase Redirect-URL list, Turnstile hostnames, Vercel env/cron state or Resend domain state | Unknown by construction | Five of §12's twelve owner asks are exactly this plane, and row #26's mechanism **is** a config trap. **unmeasured — no agent has control-plane access; see §12** | none |
| **ongoing** | Migration ordering: `senal_gym` is **first** in the repo (`20260901120000`) and **last** in prod (applied `20260902050714`, after all three modos migrations) | `supabase/migrations` is no longer a replayable history — which is what `pnpm test:denial` replays on a scratch project | Explains nothing about today's member failures; it is the reason a green scratch run does not prove prod. Of 19 applied migrations since 2026-08-20, **3** match by version — the three recovered from prod after the 08-27 outage. Platform-wide, 122 of 148 applied versions have no matching repo filename. **measured**, and it **corrects** `01-live-snapshot.md` §B's "drift confined to the pre-2026-08-23 tree" | none. `rpc-canon-drift.test.ts:20` derives its expected bodies from `readRpcFunctions()`, the same repo replay it compares against — **0 of its 3 assertions reads production** (a live check this round found 60/60 bodies match anyway) |

**Drift that is NOT explanatory, recorded so it is not re-litigated.** P-130 (JWKS re-fetched per
request) is **false at HEAD** — `GoTrueClient.js:43` holds a module-level `GLOBAL_JWKS` keyed by
storageKey with `JWKS_TTL = 10*60*1000`. P-103 is fixed (above). P-075 (host drift caused the
09-01/09-02 outbound mails) stands refuted; row #13 is the **inbound** half plus the pre-cutover mail.

---

## 3. Q2 — The weak spots that will actually pop

Top 5 by probability x damage. Each is a sequence, not a component.

**1. The 60-second collision — has already fired, twice, on the owner's newest member.**
Trigger: member taps LOGIN, sees "Crea tu cuenta", signs up at `/registro` (mail #1, token minted),
then within 60 s opens the desk's invite link. `/activar` sees `email_exists`, routes to
`cuenta_existente`, calls the **ungated** `enviarMagicLink`, GoTrue answers 429,
`activar/actions.ts:94` collapses it, and the screen says "NO SALIÓ EL CORREO". "INTENTAR DE NUEVO"
reloads and resubmits inside the same window, producing the identical screen.
**Probability: certain — it is the live 24 h log.** Damage: the member concludes the app is broken,
and the owner concludes his product is broken. (Rows #1, #3.)

**2. The second tap on a mailed link.** Trigger: the member opens the mail in Gmail's in-app browser
(the session lands in the webview's cookie jar), goes back, and taps again in Safari. The token is
already consumed, GoTrue answers `otp_expired`, and `/entrar?error=token-rechazado` renders "El
enlace de tu correo ya expiró o ya se usó" — whose on-screen remedy says "o escribe tu código",
while no mail on any rail contains a code. **Probability: 4 of 10 redemptions in the observed 24 h
window** (n=10, a shape not a rate). Damage: the member is on the password form with no password.
(Rows #7, #8.)

**3. The desk sells to someone with no email.** Trigger: the operator records a sale without an
email — 15 times on RED already. `estadoInvitacion` derives `sin_email`, `cliente-detalle.tsx:487-488`
renders **no** invite control, and the ficha shows a grey badge with no call to action. Nobody is
told. **Probability: 8 paying RED members are in this state right now.** Damage: a paid member with
no access, indefinitely. (Row #6.)

**4. The one-character typo.** Trigger: the member self-registers at an address one character off
the one the desk typed. `reclamar_o_crear_cliente` finds no match, mints a second `clientes` row
with `clases_restantes = 0` **and** a `gym_membership` row, so `/reservar` renders a normal,
bookable-looking week with a zero balance. The invite tap afterwards raises "Ya tienes cuenta en
este gimnasio", which `vincularAction` swallows and redirects to the same screen.
**Probability: the mechanism is proven, the live occurrence is unmeasured; 47 rows are one signup
away and 2 split-name pairs already exist.** Damage: a paid member on a zero balance with no in-app
path back and no merge tool. (Row #5.)

**5. One tap on a shared phone.** Trigger: any live session on the device plus an invite link.
`VincularForm` renders one full-width accent button ("No soy yo" is 11 px muted), and
`reclamar_por_codigo` binds the paid row to the signed-in account **and overwrites the invited email
in the same statement**. **Probability: low per tap, but 67 codes are armed and every failure above
pushes members onto other people's devices.** Damage: irreversible without service-role SQL; the
original address is recorded nowhere. (Row #2.)

---

## 4. Q3 — Stress to the top: breaking points

Scenarios: 200 members in one afternoon at one gym; 10 gyms onboarding the same day; a viral signup
day.

| Component | Breaks at | Bound by | Breaks first? |
|---|---|---|---|
| **Resend account daily cap** | **≈34 new members/day, platform-wide** (100 mails/day ÷ a **measured 2.9** mails per new member) — round 1 said 50 | Two concurrent sends per sale (`(app)/vender/actions.ts:61-65`) **plus the member's own door mail**, no queue, no retry, no outbox; the refusal reason is discarded at `:114` | **YES — still first to bind**, and by 20x: the GoTrue bucket (30 new users/hour = 720/day) is the next wall. 100/day is now **read from a primary** (https://resend.com/pricing, 2026-09-02: *"Free: 100 emails a day, 3 domains… 30-day data retention"*); the 2.9 divisor is **measured** from the account's own 21-day ledger (63 invites : 63 of 75 receipts : 58 auth mails). **Conditional on the account being on Free** — undecided, one owner dashboard read |
| Cloudflare Turnstile hostname list | about 10 hostnames; **8 client hostnames live, so roughly 1 more gym** | One shared widget that fails closed (`turnstile.ts:22,38`) | 2nd — and it is what makes "10 gyms in a day" impossible outright. Hostname count measured; the cap asserted |
| GoTrue project-wide auth-email bucket | **30 new users/hour** (Supabase's documented default under custom SMTP); the repo's own comment at `entrar/actions.ts:72` assumes 50/hr | ONE project-wide counter, "Sum of combined requests" across every tenant. `/auth/v1/otp` is a **separate** bucket with a 60 s per-address window — this corrects the 2026-07-22 audit and P-069, which conflate them | 3rd. The live configured value is **unread** (§12) |
| `send-email` hook wall clock | **5,000 ms** total budget including retries; worst observed single pass **2,594 ms** (1.9x margin) | Three unbounded network calls inside it; the 503 carries no `retry-after`, so it is a hard failure rather than a retry | 4th, and it degrades under exactly the burst that causes it |
| `gym_membership` RLS predicate | **about 14,000 membership rows gives >1 s of pure RLS per `/reservar` render**; 2,000 rows (10 gyms x 200) gives about 146 ms | 36.6 us/row measured, times 2 unpredicated reads per render; **linear in platform-wide membership, not in the member's own gym** | 5th. Modelled from a measured rate |
| Supabase Realtime peak connections | **200 simultaneous member tabs, platform-wide** (Free quota, no over-usage allowance) | One socket per tab; failure is a `console.warn` and the page silently stops updating | 6th. **Correction to T10-06:** RED has **66** clientes, not 183 — 183 is the platform-wide total across 4 gyms, two of them sandboxes |
| senal broadcast fan-out | N tabs x **18-20 PostgREST round trips** per write; at 50 tabs one sale costs roughly 1,000 round trips | A 600 ms trailing **client-side** debounce is the only limiter; there is no server-side fan-out control. Desk sales arrive 30-60 s apart, far outside the window, so none coalesce | 7th. The round-trip count is a static call-site trace, i.e. modelled |
| `mi_membresia` scan of `ventas` | about 68 ms/call at 100k ventas, about 200 ms at 300k; already **max 1,155 ms** live at 300 rows | No `ventas(cliente_id)` index; a full scan plus a top-N sort per call, per render | 8th |
| Postgres connections | `max_connections = 60`; PostgREST observed holding 7 idle | Free-tier compute (224 MB shared_buffers, 2.1 MB work_mem, 2 parallel workers). The risk is **occupancy from the second-long tail**, not the call rate | 9th — and the rows above are what make a request hold a connection long enough for the count to matter |
| `next_folio` row lock | **about 16 sales/second per gym** | One counter row per gym, locked for the whole `registrar_venta` transaction (measured mean 41-77 ms) | **Never.** Three orders of magnitude above anything the product produces. Recorded so nobody spends a slice on lock-free folios |
| Gym provisioning | **about 4 manual console actions per gym**, no API, no wildcard domain | Two Vercel domains, a hand-written `gym_domain` INSERT, a Supabase redirect-URL entry, and a Turnstile hostname. Three of the four are invisible to every guard in the repo | "10 gyms in one day" is **human-bound, not throughput-bound**. Asserted (memory `vercel-domain-scale-verdict.md`) except the `gym_domain` half |

**The headline number, corrected round 2: ≈34 new members per day, platform-wide — and the operator
cannot see the wall.** Round 1 said 50 and rested the whole figure on an asserted 100/day. Both
inputs moved: the 100/day is now a primary read (resend.com/pricing), and the divisor is **2.9
mails per new member measured from the account's own ledger**, not the 2 concurrent sends per sale
round 1 assumed — the member's own door spends a third mail (`Confirma tu cuenta`) on the same team,
which is exactly what ~58% of RED's members do. The `/activar` fresh-provision rail *is* the 2-mail
case (`generateLink` mails nothing, confirmed by the 15:04:08Z pair with no `send-email` beside it).

**The plan is still unread, and one attempt to infer it refuted itself:** `ratelimit-limit: 10 /
ratelimit-policy: 10;w=1` on `GET /domains` and `GET /emails` is the **documented default for every
plan** (resend.com/docs/api-reference/introduction: *"10 requests per second per team"*), so it does
not discriminate. Two weak consistency signals with Free: one verified domain (Free allows 3) and a
ledger reaching back 21 days (inside Free's 30-day retention). **Undecided — which Resend plan;
owner, one dashboard read.** If the account is on Pro (50,000/month, no daily cap), 34/day is void
rather than revised, and the first binder becomes the GoTrue auth-email bucket at a documented
30 new users/hour.

**Exit trigger (digit-bearing, replaces round 1's bare headline):** any single UTC day in the Resend
ledger above **60** mails — 40% of the Free wall. Measured peak to date **37** (2026-08-13); median
9.3/day. The cap has never been observed to bind, so this is a modelled ceiling, not an incident.
(`new-user-xe/R2-R2-top-rows-refute.md` §4.)

---

## 5. Q4 — Three months with no use

| Component | Breaks on | How it surfaces to a NEW member | Warning first? |
|---|---|---|---|
| **Supabase project pause (Free plan)** | **about day 7-14** of no DB activity; the 90-day one-click restore window closes around **day 104** | `resolve-tenant.ts:149` returns `tenant:null` on an RPC error — **identical to "this host belongs to no gym"** — so `red.ibookit.lat` renders the generic `DEFAULT_BRAND` "Gimnasio" chrome. A working-looking page belonging to nobody, with no message saying we are down | Two emails to the **owner**, about a week ahead. **Zero** to the member. **The plan itself is unverified — §11** |
| **TLS certs on all 9 `*.ibookit.lat` hosts** | **2026-10-07, 06:24:48 through 06:43:04 GMT** (day 35) | A bypassable certificate interstitial on the invite link. HSTS is only `max-age=86400`, so a member who has not visited in a day gets the warning rather than a hard fail. Converts worse than an outage and is invisible in our logs | None in-repo. `www.redfunctionaltraining.com` is on its own cycle to Nov 26 and survives |
| **pg_cron class-horizon materialisation** | last successful Monday run **plus 6 weeks** (`for o in 0..5 loop`). With today's data RED's furthest session is **2026-10-10** | The member's week renders **empty**, with no message. An unmaterialised week is indistinguishable from a gym that scheduled nothing. `agenda-miembro.ts:37,321` — the member path deliberately never materialises. forge is already in that state (0 active templates, 0 future sessions) | No. `cron_run_log` has 5 rows, every Monday 08-10 through 08-31, `errors=0` |
| **`registros_atorados()` 30-day window** | jes***@hotmail.com around **2026-09-13**; pau***@hotmail.com around **2026-09-23** | Nothing — the wedged member simply stops existing to the only detector. There is no second detector, and the durable audit table is empty | No |
| **Member memberships** | **63 of RED's 66** rows have `vence` before 2026-12-01 (17 already expired; max `vence` 2027-01-07) | The member logs in fine (no session expires) and sees a normal, bookable-looking week. The refusal is correct at every layer (`reservar_clase.sql:85,93` "Paquete vencido") — the problem is **placement**: "Plan vencido" lives in the perfil overlay and `/saldo`, not on `/reservar`'s first paint | The refusal only appears at booking time |
| **Legacy Supabase API keys in both edge functions** | **2026-12-31** by Supabase's stated cut-off, or the instant the owner deactivates legacy keys | `send-email/index.ts:31` reads `SUPABASE_ANON_KEY` and `activar-cuenta/index.ts:36` reads `SUPABASE_SERVICE_ROLE_KEY`, both with a `?? ""` fallback, so an unset var boots empty and fails later. The apps already use `sb_publishable_*`. Result: no auth mail, and the fresh-provision rail dies | No — nothing in this repo references those variable names in a test, guard or lint rule |
| **`realtime.messages` daily partitions** | **4 consecutive days with zero client subscribes** — the service pre-creates only yesterday through today+3. **Measured round 2 for the first time:** the table holds **58 rows, oldest ~13 h** (`R2-E2-live-checks.md` §e) — retention is same-day, consistent with the rail having shipped 2026-09-02 | Nothing visible: `realtime.send` swallows the failure (`EXCEPTION WHEN OTHERS THEN RAISE WARNING`, verified in the live function body), so pages simply stop being fresh | No, by design — and keeping the swallow is correct, since a broadcast must never roll back a sale |
| **iOS Safari session eviction** | about 30 days idle (**asserted**, ADR-0016) | The iPhone member returns to a password form; the Android/Chrome member returns signed in (400-day cookie). Server-side nothing expires: 156/156 sessions have `not_after IS NULL` | No |
| **The invite code** | **never** | After three months every emailed auth link is dead and every invite link still works — the invite mail becomes the only working credential in the inbox. 67 live codes, oldest invite 2026-07-11, 4 older than 30 days | n/a — ADR-0015 accepted this deliberately (#126) |
| **`pnpm test:denial` remote path** | **already broken** — the PAT in `apps/admin/.env.local` returns HTTP 401 | Invisible to members. It means the first migration-bearing change after a dormant period ships ungated, or via a local Docker stack that has itself drifted (the `senal_gym` suite needs today's `realtime.messages` partition, which only the Realtime service creates) | No |
| **Auth forensics** | **already gone at 24 hours** | Any incident older than a day is unreconstructable. 213 `auth_audit_logs` lines were written to the 24 h stream in the last day; `auth.audit_log_entries` holds 0 | No |

---

## 6. Q5 — Human chaos: how a normal person corrupts data

| # | Sequence | State left behind | Recoverable without a developer? | Code branch |
|---|---|---|---|---|
| 1 | Shared phone: person A is signed in; person B opens their invite link and taps the one big button | B's paid `clientes` row now carries A's `auth_user_id` **and A's email**; `claim_code` is nulled | **NO.** `clientes` has no `updated_at`/`deleted_at`, `auth.audit_log_entries` is empty, `preparar_invitacion` refuses to re-invite a claimed row, and four separate layers block un-claiming (P-101). Service-role SQL only | `activar/page.tsx:83-85` to `activar/actions.ts:137` to `reclamar_por_codigo.sql:60-68` |
| 2 | Self-registers with a slightly different address than the desk typed | A second `clientes` row with `clases_restantes = 0` plus a `gym_membership` row; the paid row stays unclaimed | **NO in-app.** The invite afterwards raises "Ya tienes cuenta en este gimnasio", swallowed at `activar/actions.ts:137-138`. The merge runbook exists but names the wrong `gym_id` for RED, and its final DELETE cascades `ventas` and `asistencias` | `reclamar_o_crear_cliente.sql:50-52` falling through to `:74-86` |
| 3 | Taps LOGIN, then the invite link, inside a minute | 429; a second identity permanently on the magic-link rail; each `/otp` press rotates away every mail already in the inbox | **Yes, by waiting** — but nothing on screen says so. Marce waited 21 hours | `activar/actions.ts:87-94`, `activar-form.tsx:145-160` |
| 4 | Force-quits or loses signal mid-activation | A confirmed, **passwordless** `auth.users` row with no session; the `clientes` row untouched. Every retry is `email_exists` and lands on the magic-link rail | **Yes, via the mail rail** — which is the rail that produced the only real-world 429. Live count of that exact state: 0, because it self-repairs into row 3's shape | `activar-cuenta/index.ts:92` then `:105`, with no compensating delete |
| 5 | Second person taps "Entrar" on a shared phone | Bounced straight into the first person's `/reservar`; a booking spends **their** `clases_restantes` | **Yes** — the perfil overlay's sign-out is one tap deeper, but no *public* screen offers it | `entrar/page.tsx:35-40`, `registro/page.tsx:33-34`; 4 `signOut` sites, all conditioned |
| 6 | Opens the mail in Gmail's in-app browser | Signed in inside the webview, signed out in Safari, and the single-use link is spent | **Yes** — resend. But the on-screen copy names the wrong axis: "Ábrelo desde este dispositivo". The device is fine; the **browser** is what breaks | `auth/confirm/route.ts` sets `__Host-sb-auth-token` in whichever browser ran the GET; `activar-form.tsx:136` |
| 7 | Submits `/activar` or `/registro`, gets any server-side error, presses the button again | The spent Turnstile token rides the second submit, so every subsequent attempt says "No pudimos verificar que no eres un robot" | **Yes**, by reloading — or by waiting about 5 minutes for Turnstile's own auto-refresh. Neither is stated on screen | `activar-form.tsx` / `registro-form.tsx`: the single `useEffect` is wired only to the widget's callbacks, never to `state.status === 'error'` |
| 8 | Desk operator retries a sale whose acknowledgement was lost, correcting the amount first | The **original** sale stands, the correction is discarded, a success receipt prints for the uncorrected amount, and a second invite plus a second receipt go out | **Yes** via `editar_venta` — if the operator ever notices, which the success screen argues against | `registrar_venta.sql:37-49` returns before validation; `vender.tsx` keeps `idemKey` across failures |
| 9 | Any member claims through the verified-email rail | An 8-character invite code stays live on their row forever, and `invitacion_info` keeps returning their full name to anyone holding the old mail | Harmless today; it re-arms as a working credential if the row is ever un-claimed. 10 live rows | `reclamar_o_crear_cliente.sql:59-65`, which never sets `claim_code = null` |
| 10 | Anyone claims, ever | `terms_accepted_at` and `privacy_accepted_at` stamped `now()` for an aviso that does not exist. 51 rows, 51 versionless | Not a member-visible break; a legal-record falsehood | `reclamar_o_crear_cliente.sql:62-64`, `reclamar_por_codigo.sql:64-66` |

**What is genuinely safe under human chaos, with evidence (M2).** Double-submit is blocked on all
six auth forms (`disabled={pending}` via `useActionState`, plus a single-use Turnstile token that
forces a full reload on the retry path). Email and password normalisation is identical at all four
sites (`registro.ts:37`, `sesion.ts:46-52` and `:276`, `activacion.ts:81-82`, `nucleo.ts:39-41`), so
autofill padding corrupts nothing on either the set or the verify side. `clientes_email_gym_uq`
makes every claim race benign — live: 0 duplicate `(gym_id, lower(email))` rows across 183 clientes,
0 claimed rows without a membership, 0 memberships without a claimed cliente. And `ON DELETE SET
NULL` on `clientes.auth_user_id` means the 2026-09-01 live deletion of Marce's inert row preserved
her paid row and every venta **by construction, not by luck**.

---

## 7. Q6 — One-line changes that break a guarantee with every test green

Ranked by (probability a developer writes it) x (damage). Round 1 **read** these and asserted each
survives `pnpm lint && pnpm typecheck && pnpm test`. **Round 2 ran all 17**
(`new-user-xe/R2-E1-regressions-executed.md`): apply the literal hunk → typecheck → lint → vitest →
revert → confirm `git status --short` clean. Baseline at HEAD: typecheck green (3 tasks), lint green
(0 errors), vitest green **114 files / 1975 tests**.

**Result: 12 of 17 hold exactly as claimed. 4 are caught — #3 by typecheck, #6 by vitest, #8 by
lint, #15 by vitest — and every one of those four is a miss in round 1's "why the tests stay green"
column, in each case because no gate was ever run.** #13 (canonical SQL) is unexecutable locally.
The rightmost column is the executed result, not a prediction; `test:denial` / `test:e2e` remain
conventions, not gates, and were not run.

**Method note that became ranked row #31:** `pnpm typecheck` had to be run as `turbo run typecheck
typecheck:root --force`. Turbo's `typecheck` task has no `dependsOn`, so an app's cached typecheck
is **not** invalidated by a change to a `packages/data` file it imports — confirmed by an identical
cache hash (`47ef7c9ea2411daf`) before and after editing `agenda-miembro.ts`. Plain `pnpm typecheck`
— what `.husky/pre-commit` runs — would have false-greened rows 4, 5, 6, 14 and 16.

**Operational hazard, observed not modelled:** mid-run, `package.json` was deleted and
`pnpm-lock.yaml` modified by a concurrent `pnpm install`-shaped event from a sibling round-2 agent
sharing this same working tree (recovered with `git checkout --`). Parallel experiments that edit
files need worktrees, not one shared root.

| # | The literal edit | Guarantee broken | Why the tests stay green | Member sees | Cheapest guard | Round-2 result (executed) |
|---|---|---|---|---|---|---|
| 1 | `cookieOptions: SUPABASE_COOKIE_OPTIONS` deleted at one of the four `@supabase/ssr` sites (`admin/proxy.ts:75`, `client/proxy.ts:157`, `server/supabase.ts:48`, `client.ts:18`) — or a fifth client added without it | Session cookie continuity | There is no exhaustiveness guard. The one that *looks* like it, `fetch-shield-coverage.test.ts`, asserts `fetch:` only and explicitly excludes browser clients. The `__Host-` name is a `NODE_ENV==='production'` ternary, so a local walkthrough proves nothing | Silently signed out on the affected surface, immediately on deploy | Copy `fetch-shield-coverage.test.ts`, swap the assertion to `cookieOptions`, drop the browser exclusion. About 15 lines. P-011 / P-038 re-derived | **green — executed, claim holds.** typecheck pass · lint pass (1 warning: unused `SUPABASE_COOKIE_OPTIONS`, exit 0) · vitest 1975/1975 |
| 2 | `if (esSesionMuerta(error) \|\| (!error && !data))` becomes `if (error \|\| !data)` at `client/proxy.ts:173` — an obvious simplification that also silences a noisy warn | 465dcf4's fail-soft rule: only a *dead* session sheds the cookie | `proxy.test.ts` imports only the two pure helpers. **`proxy()` itself is invoked by no test in either app**, and there is no `apps/admin/src/proxy.test.ts` at all | Every member signed out during any GoTrue 5xx window | One test: call `proxy()` with a `getClaims` that returns `{data:null, error:{status:500}}` and assert the response carries no cookie deletions | **green — executed, claim holds.** typecheck pass · lint pass · vitest 1975/1975 |
| 3 | `git mv apps/client/src/app/auth/confirm apps/client/src/app/confirmar` | Every auth mail | `construirUrl` throws unless the pathname is **exactly** `/auth/confirm` (`correo.ts:64-77`), which `index.ts:106-111` turns into a 400 and GoTrue reports as "500: Invalid payload sent to hook". The path is written in five places and asserted in none; `correo.test.ts:20` feeds its own hardcoded literal | 100% of signups, recoveries and magic links fail, with no mail | One guard test that reads the route directory name and compares it to the literal in `correo.ts` | **CAUGHT by `pnpm typecheck`** — `route.ts(13,37): TS2307: Cannot find module '../../../lib/aviso-legal'` (the move changes the import depth), plus Next's generated `validator.ts` still pointing at the old route. Round 1 reasoned only about `correo.test.ts`'s hardcoded literal and never considered tsc. Unexplained divergence, flagged not chased: **vitest resolves the same broken import fine** (1975/1975) |
| 4 | `getEsMiembro` wrapped in `cache(` — making it match its four neighbours | `/reservar`'s claim self-heal retry | React `cache()` keys on argument identity, and `reservar/page.tsx:58,65` calls it twice on the **same** `supabase` object around the re-claim, so the memoized `false` comes back. The two existing tests use separately-constructed fakes, i.e. two different cache keys | A member whose claim never landed is stranded on "Aún no eres miembro" **permanently, on every reload**, with no error | Call it twice with the same fake across a mutated membership list and assert the second call re-reads. About 6 lines | **green — executed, claim holds** (typecheck forced past the stale turbo cache — row #31). vitest 1975/1975. The *behavioural* question (does `cache()` memoize across the two calls) is still §11's named experiment; this only proves the gates stay green |
| 5 | In `fetch-shield.ts`, before the GET/HEAD branch, add a timeout targeted at `/auth/v1/token` | The deliberate no-timeout-on-refresh rule | A **blanket** POST timeout fails the existing test; a hunk targeted at that URL does not — the string `auth/v1/token` appears **exactly once** in the repo, in the comment forbidding this. Aborting a refresh past the reuse interval manufactures `refresh_token_already_used`, which the proxy treats as a dead session | Mass sign-out, worst during the exact degradation the shield exists for | Two lines in the existing POST test: assert `shieldedFetch('.../auth/v1/token?grant_type=refresh_token', {method:'post'})` is called with `signal: undefined`. P-012 / P-039 re-derived | **green — executed, claim holds** (typecheck forced). vitest 1975/1975 |
| 6 | Delete `.eq("gym_id", gymId)` from a member reader "since RLS covers it" | Tenant scoping on reads | `class_session_member_select` permits **every** gym the caller belongs to (`20260714080000:79-81`), and the DAL fake **records** `.eq()` without narrowing the seeded rows. 82 non-test call sites against 22 test assertions anywhere — **0 in `agenda-miembro.test.ts`** | Two gyms' weeks mixed under one brand's chrome. Latent today: 1 multi-gym identity, a staff account | `expect(fake.eqCalls.class_session).toContainEqual(["gym_id","gym-1"])`, one line per reader. **Never delete it on a reading of ADR-0013; that warning is documented as spent** | **CAUGHT by vitest** — 1974/1975: `agenda-miembro.test.ts:271` › *"#220: excludes a session belonging to a different gym even though it's in-window (explicit filter, not RLS alone)"* fails immediately (`expected [...] to not include 'otro-gym'`). This **directly contradicts** round 1's "0 [assertions] in `agenda-miembro.test.ts`" — the test exists and is exactly on point |
| 7 | Delete `{ scope: "local" }` from one `signOut`, or add a fifth call site without it | Per-device session revocation | All four sites are `.tsx`, and `vitest.config.ts` excludes `.tsx` "by construction". There are **zero** `.test.tsx` files in the repo and no DOM test infrastructure | Every member with two devices signed out by one tap — the lived 2026-08-24 incident, ADR-0016 Amendment | A `tools/guards` grep test: every `.signOut(` under `apps/**` must be followed by `{ scope: "local" }`. About 12 lines, no DOM infra. P-010 / P-040 re-derived | **green — executed, claim holds.** vitest 1975/1975 |
| 8 | Delete `sesionEmail` at `activar/page.tsx:78` (and the `email` prop at `:85`) | The #150 anti-hijack disclosure — the **only** app-tier guard against §1 row #2 | No `.test.*` file exists anywhere under `apps/client/src/app/{activar,registro,entrar,codigo}`; eight member-facing server actions have zero vitest coverage. `vincular-form.tsx:125-133` renders gracefully with `email` null, so the deletion is visually silent | Nothing — which is the point | vitest around `activarAction` and `vincularAction` with an injected client, asserting vincular refuses (or warns) when the session email differs from the coded row's | **CAUGHT by `pnpm lint`** — `72:7 error 'sesionEmail' is never reassigned. Use 'const' instead  prefer-const` (exit 1). Deleting the sole reassignment turns the `let` into an ESLint **error**, not a warning. Round 1 never checked lint for this row |
| 9 | Widen `{!existing.email && (` at `vender.tsx:746` so the email field renders for every EXISTENTE sale | The claimed-row email lock | `actualizar_cliente.sql:16-18` raises "No se puede editar el correo de una cuenta activa"; `registrar_venta.sql:175-183` does `email = coalesce(p_email, c.email)` with **no such guard**. Today it is unreachable only because of that render condition. vitest mocks `.rpc()`, and no denial vector seeds a claimed cliente | A member's login email silently changed by a desk sale | Copy the three-line guard into `registrar_venta`'s existing-client branch, plus one denial vector | **green — executed, claim holds.** vitest 1975/1975 |
| 10 | Add `?next=` to `/registro`'s confirm URL (`registro/actions.ts:56`) — for example to make the landing agree with #332's Lista `/saldo` | The verified-email claim on the signup rail | `finalizarAuth` runs `intentarReclamoPorEmail` only in the `else if (!next)` arm (`auth/confirm/route.ts:85-96`). `route.test.ts`'s mocks always reject, so the success path is never reached, and `registro/` and `activar/` have no test files at all | The rail 89% of new RED members use stops claiming. Partly softened: `/saldo` and `/reservar` both re-run the email claim, so only a `next` pointing elsewhere loses it permanently | Decouple them — run the claim unconditionally for an established session and let `next` decide only the destination. One test asserting the claim fires on the success path | **green — executed, claim holds.** vitest 1975/1975 |
| 11 | Simplify `auth/confirm/route.ts:117-120`'s three-clause `next` check to `next.startsWith("/")` | Open-redirect protection on a **verified** session | `route.test.ts`'s mocks always reject, so `finalizarAuth`'s redirect line is never reached by any test. `//evil` and `/\evil` are protocol-relative to both browsers and `URL()` | Phished from a real, freshly-confirmed session | Three `expect` lines asserting `//evil`, `/\evil` and `https://evil` all resolve to `/reservar` | **green — executed, claim holds.** vitest 1975/1975 |
| 12 | Change `resolveTenant(headers.get("host"), ...)` to `get("x-forwarded-host")` at `client/proxy.ts:102` | Host-to-tenant precedence (ADR-0012) | Forbidden only in prose: `grep x-forwarded-host` returns exactly 2 hits at HEAD, **both inside doc-comments**. No code reads it and no test asserts it. Next's own docs also warn that a `matcher` change can silently remove proxy coverage entirely — and the admin app's only route gate **is** the proxy | Wrong brand chrome and a wrong tenant stamp. **Not** a wrong membership write: all three writing call sites hardcode the override to `null` (see the struck T3-08) | `expect(resolveTenant).toHaveBeenCalledWith(headers.get("host"), ...)` in a proxy test — two lines turn a prose rule into a red build | **green — executed, claim holds.** vitest 1975/1975 |
| 13 | Remove `and auth_user_id is null` (or the `v_n = 1` count) from `reclamar_o_crear_cliente.sql:50-53,65` — `registro_claim.sql`'s own header argues the count is redundant | ADR-0009's "ambiguous match creates, never guesses", and the claim's compare-and-set | Of the suite's ten vectors, **every seeded `clientes` row starts with `auth_user_id` NULL**. No vector ever presents an already-claimed row to a second caller, so even a full `test:denial` run stays green | One member's paid row re-bound to another identity | One vector: seed a row bound to uid A, call as uid B with a matching email, assert `auth_user_id` is unchanged | **unexecutable locally** — canonical SQL bodies have no vitest or typecheck surface; only `pnpm test:denial` (convention, needs a scratch project + PAT) would see it. Not applied |
| 14 | Drop `{ config: { private: true } }` from the senal channel (`client-senal.ts:209`) | Realtime freshness | `senal_gym()` publishes with `private := true`, so a non-private subscription receives nothing while `subscribe()` still reports SUBSCRIBED; the only diagnostic fires on CHANNEL_ERROR or TIMED_OUT. `client-senal.test.ts`'s 7 tests cover the debounce regulator only — `useSenalGym` is never called | The 2026-09-02 staleness regression returns, with no error surface at all | A unit test asserting the second argument to `.channel()` is `{config:{private:true}}`. About 10 lines | **green — executed, claim holds** (typecheck forced). vitest 1975/1975 |
| 15 | Add `"quarantined": "..."` to one entry in `supabase/tests/rpc-coverage.json` | The guard that makes #78 impossible | `rpc-write-coverage.test.ts:56` short-circuits on `if (entry.quarantined) continue;`, and the quarantine arm only checks that the reason string is non-empty. The pressure to do it is real — the scratch PAT is dead | A write RPC ships uncovered | Require `quarantined` to carry a tracker id **and** an expiry date, and fail once the date passes. Today the quarantined count is 0 | **CAUGHT by vitest** — 1974/1975: `rpc-write-coverage.test.ts` › *"every quarantined RPC states a reason and points only at quarantined suites"* fails (`aceptar_acuerdo: quarantined but names aceptar_acuerdo.sql, which is not in QUARANTINE`). Round 1 cited only `:56`'s `if (entry.quarantined) continue;` short-circuit and missed the file's own last test, ~30 lines below |
| 16 | Update `JWKS_FALLBACK` during a key rotation and get the `kid` wrong | Local JWT verification during a `jwks.json` outage | `fetch-shield.test.ts:133-140` does nothing but `crypto.subtle.importKey` the pinned JWK — any well-formed P-256 key passes. The `kid` string appears exactly once repo-wide. Live it matches today (`76da07da-...`, re-fetched by three seats) | 0% on a healthy day; 100% of requests for the duration of any jwks outage | Fetch live `jwks.json` and fail when no `kid` matches the pin — as a fourth signal in the daily cron, not in pre-commit. P-015 / P-043 re-derived | **green — executed, claim holds** (typecheck forced). vitest 1975/1975 |
| 17 | Revert `/entrar`'s live-session redirect (`entrar/page.tsx:34-40`) "because it costs a `resolverMiembroGym` round trip on every render, including signed-out visitors" | The 465dcf4 fix itself | `session.spec.ts:94` genuinely covers it — and the suite is in neither CI nor pre-commit, and `test.skip` makes an unarmed run **exit 0**. `entrar/page.tsx` is `.tsx`, which vitest excludes | Every member with a live session walked back to a password form: the exact 8-day defect | Make the skip loud — `test:e2e` should exit non-zero when credentials are absent instead of reporting a pass | **green — executed, claim holds.** vitest 1975/1975, lint exit 0 with 5 now-unused-import warnings. Consistent with round 1: only `test:e2e` catches it — and note the scope fix, that suite is **two files / 6 tests**, not one / three |

---

## 8. Q7 — Every await takes 30 seconds and every network call fails halfway

| Operation | Step that fails | State left | Retry-safe? | Is the user told the truth? |
|---|---|---|---|---|
| `/registro` signUp | The hook fails after GoTrue committed the user | `auth.users` row created, the one-time token **rotated**, `confirmation_sent_at` stamped, no mail | **NO — anti-idempotent** | **No.** "No pudimos crear tu cuenta" for an account that now exists. Live proof: the del***@resend.dev row, created 2026-08-31 00:55:37Z, `confirmation_sent_at` 01:53:02Z, `email_confirmed_at` null, every `/signup` a hook 500 |
| `send-email` hook | Resend slow or 5xx | OTP already minted and rotated; the hook returns 503 with **no `retry-after`**, so Supabase treats it as a hard failure rather than a retry | No | No — a generic error |
| `send-email` hook | Resend returns any other 4xx | Mail **dropped**, hook returns HTTP **200**. `resumen.ts:70` filters on `status_code >= 400` and cannot see it; the only trace is `index.ts:134`'s `console.error` into `function_logs`, which the cron never queries | n/a | No — nobody is told, including the monitor |
| `/activar` fresh-provision | Cut after `createUser`, before `generateLink` | A confirmed, passwordless `auth.users` row; `clientes` untouched; **no compensating delete** | **NO — the retry is what makes it permanent**, because every later attempt is `email_exists` and lands on the magic-link rail | No — a generic "No pudimos activar tu cuenta" |
| `/activar` cuenta_existente | `signInWithOtp` 429 | Nothing written; the per-address window is spent | **NO — the retry re-spends it** | **No.** "NO SALIÓ EL CORREO — Intenta de nuevo" names no wait time, and the button reloads and resubmits |
| `/auth/confirm` | Response lost after GoTrue verified | Token **consumed**, `email_confirmed_at` set, an `auth.sessions` row created — and the browser holds no cookie | No, the token is gone | **Half false.** "El enlace de tu correo ya expiró o ya se usó" — but for a `/registro` member their email **is** now confirmed and a plain login works |
| `completarActivacion` | Cut between set-password (hop 2) and claim (hop 3) | Password set, session live, **no `clientes` claim and no `gym_membership`** | Only via `/reservar`'s email self-heal — which matches nothing for the 47 email-less coded rows | **No.** "Aún no eres miembro de este gimnasio", with no error and no log line |
| `enviarInvitacion` | Resend accepts after more than 10 s, so the abort fires | `claim_code` minted, mail sent, **`invitacion_enviada_at` never stamped** — the stamp is the last write | **NO — the desk shows the member as un-invited and the operator re-sends**, which puts them back at `/activar` and spends the auth-mail window | No. The desk's state is wrong in the safe direction, which is exactly why the operator acts |
| `crearVentaAction` | Acknowledgement lost after commit | Sale committed under the idempotency key | **NO — a corrected resubmit returns the ORIGINAL row and prints a success receipt**, and a replay re-fires both mails because `isNew` is client-declared | **No.** "Revisa los datos e intenta de nuevo" is provably wrong under a live key |
| Turnstile siteverify | Hangs — there is no `AbortSignal` anywhere | Nothing written; the action is held open until the platform timeout | Yes | **No** — a Cloudflare outage renders as "No pudimos verificar que no eres un robot" |
| `resolveTenant` to `gym_id_por_host` | Stalls (unbounded POST, the first await of every request in both apps) | Nothing written; **the whole platform hangs, signed in or not**. On a half-failure `x-gym`/`x-brand` are deleted and `/auth/confirm`'s claim silently no-ops behind `if (tenant)` | Yes | No — a white screen, then Next's built-in English error page, because no `error.tsx` exists |
| `reclamar_o_crear_cliente` / `reclamar_por_codigo` | RPC round trip lost | Either fully applied or not at all — one statement, `SECURITY DEFINER`, and the unique indexes carry the race | **Yes** — both are documented idempotent (`registro.ts:317-320`) | No — the refusal is swallowed as a value nobody inspects |
| `senal_gym` broadcast | Realtime down or partition missing | **Nothing.** `realtime.send` wraps its INSERT in `EXCEPTION WHEN OTHERS THEN RAISE WARNING`, verified in the live function body | Yes, trivially | No, and **this is correct**: a broadcast must never be able to fail a sale |

**The anti-idempotent set — where retry is the damage:**

1. **`/registro` signUp retry** — rotates the one-time token again, killing any earlier mail that did
   land. `registro.ts:149-182` returns *before* `registrarReenvio`, so the retry is not even
   throttled. (Whether earlier mail had landed in the observed case is unmeasured — the cited
   `confirmation_token: 6` is a table-wide aggregate, not that user's retry history.)
2. **`/activar` retry after `createUser` succeeded** — moves the member onto the magic-link rail
   **permanently**. There is no path back.
3. **`/activar` retry inside the 60 s window** — re-spends the throttle and re-renders the same
   screen. This is the live Marce loop, twice, 10 s apart.
4. **`crearVentaAction` resubmit with edited fields under a live idempotency key** — the edit is
   silently discarded and a success receipt prints for the uncorrected sale.
5. **REENVIAR INVITACIÓN after a slow-but-successful Resend call** — harmless for the code, which is
   reused, but it puts the member back at `/activar` and spends the auth-mail window, feeding #3.

---

## 9. Keep-verdicts and exit triggers

Every keep carries a trigger with a digit, or is explicitly undecided with the question and the
person who must answer it.

| Keep | Exit trigger |
|---|---|
| Supabase GoTrue as the auth provider — **support re-written round 2.** Round 1 kept it on *"nothing found here is a GoTrue defect; all 30 ranked rows are a door this repo owns"*, and §15 certified that as substitution-proof. It is not: **"all the defects we found are in our own code" is a statement about where the audit looked**, and it reads identically for any vendor you wrap (critic #11a). The support that does survive substitution is a **migration cost**: GoTrue mints the `__Host-` cookie the entire session model is built on, and §7 #1/#5 — both now **executed green** — show that cookie surface is one deleted line from a mass sign-out. The GoTrue-specific facts this round measured are costs, not support (60 s `/otp` floor, one project-wide mail bucket shared across tenants, `auth.audit_log_entries` empty) | The project-wide auth-mail bucket refuses **more than 5 sends in any 7-day window** attributable to distinct real members. **Still owed:** nobody has priced the `__Host-` migration — *unmeasured, and it is what the keep now rests on* |
| Both doors (`/activar` and `/registro`) — self-registration genuinely works; and*** and oma*** were in within 90 s on 09-01 | Hide `/registro` behind a "no tengo invitación" disclosure when **more than 2 members per month** land on the `cuenta_existente` rail. Current: 1 confirmed in 3 days — already close |
| The two-rail `/activar` design (ADR-0009, Amendment 2026-07-15) | Collapse the rails if **3 or more members** reach `cuentaExistenteFallo` in any 30-day window, **or** if `/activar`'s completion share stays **below 25% for 2 consecutive weeks** — it is at **11%** now, so this is one week from tripping |
| `reenvio-limite` as best-effort per-instance memory (its own docstring is honest that N warm instances allow N times the rate) | Move to shared state at **3 `over_email_send_rate_limit` events in one 24 h window**; today's count is 2, both the same member on the same day |
| `/auth/confirm` redeeming the token on a bare GET | Ship the POST interstitial once `otp_expired` exceeds **3 in a 24 h window** — the current count is **4**. **ALREADY TRIPPED** |
| The 24 h auth log stream as the only forensic trail | Ship a durable auth-event table or a log drain before the next incident that predates the window. Two already did (2026-08-30 Sarahí, 2026-09-01 Marce). **ALREADY TRIPPED TWICE** |
| `pnpm test:e2e` as a convention rather than CI — it genuinely needs a real auth server. **Scope corrected round 2: it is two suites and 6 tests** (`session.spec.ts` + `signup.spec.ts`), not one and three | Make it blocking after **2 consecutive auth-surface pushes** land without a green run. HEAD is at **3 or more** (senal, modos, glance-card). **ALREADY TRIPPED.** Constraint on the fix: `signup.spec.ts:26-31` requires an unarmed run to stay a no-op against production because test 1 POSTs the real form at LIVE auth — so "exit non-zero" must mean **fail fast without executing**, never "arm it" |
| `registros_atorados()` — it found iva*** | Its coverage staying **below 50%** after a `clientes`-rooted arm is added. **Today: 7%, 1 of 14 platform-wide** (round 1 wrote "14%, 1 of 7" against a RED-only denominator; a direct email join, not a row count, produces the 1). It also finds 2 stuck `/registro` non-confirmers that the `clientes`-rooted arm would **not** cover — the fix widens coverage, it does not replace the existing arms |
| Resend as the single mail transport (DKIM and both SPF records verified live — **measured, and the half that survives substitution**. Round 2 cuts *"190 of 194 delivered"* from the support: a vendor-reported delivery count says nothing about folder, any transport reports one, and this document itself carries two counterexamples — the 2026-08-19 FortiGuard block and the 09-01 spam placement) | A real-recipient bounce rate over **2.0%** in any rolling 30 days (today 0.52%, 1 in 191), **or** any single day over **80 mails** (today's peak 37) |
| One shared Resend key and one sending domain across all tenants | A **4th live tenant** onboards, **or** any single gym sends **30 invites in one week** (max observed 28) |
| The hook's fail-closed 400 on a bad `redirect_to` (#217 — a loud non-send beats a mis-minted cross-tenant mail) | More than **2** fail-closed 400s in 24 h from a **non-sandbox** recipient. Today 6 of 6 are `delivered@resend.dev` |
| `@supabase/ssr` plus GoTrue cookie sessions over a bespoke store | **More than 20 proxy-shed sessions in one week** *after* the `CODIGOS_SESION_MUERTA` fix ships. Today's baseline: 9 per 24 h |
| Proxy-based session refresh on every navigation | `POST /auth/v1/token` exceeding **500 calls per 24 h** on the current roughly 40-member base. Today: 143 |
| The `__Host-` cookie prefix constant-folded at build — it is why a preview cannot mint a production session | RED reaching **3 public client hosts**, or a second gym taking a custom domain. Today: 2 |
| The unbounded-POST policy in `fetch-shield.ts` — both stated reasons hold | `/token` p99 over **5,000 ms** across at least 200 calls in 24 h, or any single POST over **30,000 ms**. Today: avg 160.9 ms, max 392.5 ms |
| The `pdx1` region pin (ADR-0017; owner-ruled "pdx1 alone, never add iad1") | p95 middleware-to-Supabase read over **8 s** on **more than 1%** of navigations. Currently unmeasured — the warn goes to console and there is no drain |
| `realtime.send`'s catch-all swallow | The **first** log drain in this repo — add a counter on `WarnSendingBroadcastMessage` in the same change. Today: 0 drains, so a louder failure would be shouted into a void |
| `next_folio`'s single-row counter | Any gym recording **more than 1,000 sales in one hour** (ceiling about 16 per second) |
| `ON DELETE SET NULL` on `clientes.auth_user_id` | Re-open only if `clientes` gains a column whose meaning depends on the identity that set it. Today: **0** such columns — the consent stamps are the near-miss, §1 row #17 |
| `ventas_idem_gym_uq` plus `registrar_venta`'s replay arm | The **first** caller that does not send `p_idempotency_key`. Today there is 1 caller and it always sends it |
| `clientes_email_gym_uq` as the sole structural identity key | A **3rd** split-identity pair appearing live (today: 2), or rows with a live `claim_code` and no email crossing **60** (today: 47) |
| The 600 ms trailing senal debounce | A single gym holding **more than 50 concurrent member sockets** — one write would then cost over 1,000 PostgREST round trips |
| The 400-day cookie and never-expiring member sessions (owner ruling, ADR-0016) | The **first** report of a lost or stolen phone holding a live session, or any one user exceeding **20** concurrent sessions (today's max: 14) |
| **The alert cron in its current state — DO NOT KEEP.** Zero output in the whole 196-mail ledger against a **1,218-hour** wedge; counting it as coverage is worse than having none | **undecided** — are `CRON_SECRET`, `SUPABASE_ACCESS_TOKEN` and `ALERT_EMAIL` set on the admin Vercel project, and is the cron scheduled there? **Only the owner can read that dashboard.** Round 2 narrowed it to two candidates — never fired, or fired and died at the 401/env-guard 500 — by killing "not deployed" (unauthenticated `curl` — 401) and showing `pg_stat_statements` has **zero** calls of the cron's own SQL |
| **The `send-email` custom auth hook** — added round 2; it had **no keep row** while rows #7, #14 and #26 plus three of §8's twelve are defects *of the hook*, so the one structural alternative (Supabase's built-in auth templates: no 5 s budget, no three unbounded fetches, no silent-drop-on-4xx, no fail-closed 400 on `redirect_to`) never got the substitution test. The trade it wins is per-gym branding (#75, ruled 2026-07) | Reconsider the hook if a **3rd ranked defect originates inside it in any 30-day window** — **today that count is already 3, so this keep is running on a ruling from July, not on evidence from now** |
| **Cloudflare Turnstile** — added round 2; row #22 ranks it a fail-closed single point of failure on all three account-creating doors and §4 makes it the 2nd-binding ceiling, yet it had no keep row and no trigger | Replace it or move to per-gym widgets at a **2nd unlisted-hostname incident**, or when client hostnames reach **9** (today **8**, measured). The ~10-hostname cap itself is still *asserted* from memory `vercel-domain-scale-verdict` |
| Never-expiring claim codes (ADR-0015 / #126 accepted the bearer trade deliberately) | **undecided** — should an invite code expire, and after how many days? **The owner must rule.** 4 of the 67 live codes sit on invites older than 30 days, oldest 53 days, and the trade was priced *before* the one-tap VINCULAR bind existed |
| The VINCULAR one-tap bind at `/activar` | **undecided** — is a one-tap bind on a shared device worth the friction it saves, given the claim is irreversible and overwrites the invited email? **The owner must answer**; #126 accepted the adjacent trade and this is the same ledger |
| `red.ibookit.lat` staying live alongside `www.redfunctionaltraining.com` | **undecided** — retire it with a 308, or keep it as a fallback? **The owner must answer**: it is a customer-facing URL and all pre-2026-08-28 mail points at it |
| Hand-numbered migration filenames | **undecided** — is `supabase/migrations` a replayable history or a change log? **Only the owner can rule**, because the answer decides whether `pnpm test:denial` on a scratch project proves anything about prod |
| Server-side `signInWithPassword` at `/entrar`, which is what erases the member IP from GoTrue's logs | **undecided** — is member-IP forensics worth moving login to the browser SDK, given that also moves the session-cookie write? **The owner, with the security seat** |
| Staying on Supabase Free and Vercel Hobby | **undecided** — does the second paying gym land before 2026-12-02? **The owner must answer.** The reachability TODO already rules the ordering: Supabase Pro before Vercel Pro, and both before the next paying gym |
| DMARC at `p=none` (the 09-01 lane ruled the quarantine/reject ratchet NEVER) — but add a `rua=` reporting address, which is not a ratchet | **1** unexplained deliverability complaint that an aggregate report would have diagnosed. **Already met twice** (2026-08-19 FortiGuard, 2026-09-01 spam placement) against **0** reports collected |
| Transaction-local single-session denial suites | **undecided** — does the claim path need a concurrency test at all, given the unique indexes carry every race? **The owner or the test-strategy seat.** My read: no |

---

## 10. Confidence ledger

**Measured — a query and its output, a `file:line` at HEAD, a log line, or a primary URL, produced
this round:**

- The whole `/registro` vs `/activar` split — **four** independent live re-derivations now, and
  **re-stated round 2**: RED lifetime 18 `/activar` vs 25 `/registro`; weekly 12/6, 2/6, 3/8, 1/5;
  at the `afd7a5d5` timestamp 17 vs 20 → 1 vs 5. The **round-1 framing "17/17 → 1/8 at `afd7a5d5`"
  is struck** (wrong cut, wrong attribution). The discriminator survived a dedicated attack: 52/52
  agreement with the orthogonal `email_confirmed_at − created_at < 1 s` signature, one writer since
  `ead16db8` (2026-07-02), and a second code-derived proxy (`? 'phone_e164'`) agreeing on all 12
  week×gym cells. Also measured round 2: invite volume by day (21 on 2026-08-13), invite-cohort
  conversion by week, and median invite→claim of **1.0 h** (n=18) which bounds right-censoring to
  ≈1 claim.
- All 24 h `auth_logs` counts: 2 x 429 `over_email_send_rate_limit` on `/otp`; `/verify` 6 x 200 plus
  4 x 403 `otp_expired`; `/token` 400s 25/9/1; `/admin/users` 1 x 200 plus 5 x 422; `/signup` 5 x 200
  plus 6 x 500, all `delivered@resend.dev`; `/functions/v1/send-email` 8 x 200 (avg 768 ms, max
  2594 ms) plus 6 x 400.
- **The platform-wide wedge, measured round 2:** 14 `clientes` rows (forge 4 max 1,218 h · red 7
  max 691 h · forge-demo 2 max 1,271 h · red-demo 1 965 h), and a **direct email join** showing
  `registros_atorados()` covers 1 of them. The 4 code-with-no-stamp rows are all `red-demo` seed
  fixtures. forge's census: 50 clientes / 6 invited / 2 claimed / 44 `sin_email`.
- **Supabase advisors, run for the first time round 2:** security = 27 findings (2 INFO
  `rls_enabled_no_policy`, 3 WARN `anon_security_definer_function_executable`, **21 WARN
  `authenticated_security_definer_function_executable`**, 1 WARN
  `auth_leaked_password_protection` DISABLED); performance = 15 findings including **3 WARN
  `multiple_permissive_policies` on exactly `clientes` / `gym_membership` / `reservation`**.
- **§7's 17 diffs, executed round 2** (baseline: typecheck 3 tasks green, lint 0 errors, vitest
  114 files / 1975 tests green): 12 green as claimed, 4 caught (#3 typecheck, #6 vitest, #8 lint,
  #15 vitest), #13 unexecutable. Plus the turbo cache-hash equality (`47ef7c9ea2411daf`) behind
  ranked row #31.
- All live table counts: `registros_atorados()` = 3 rows (476/233/67 h at the round-2 read; 475/232/66
  h at the round-1 read, same clock, query-time skew); 67 armed codes; 10 claimed
  rows still holding a `claim_code`; 47 code-bearing email-less rows (24/11/8/4); 91 `clientes` with
  no email; 51 of 51 versionless consent stamps; `gym_legal` 0 rows; 156 `auth.sessions`, 156 null
  `not_after`; `auth.audit_log_entries` 0; `gym_domain` client 8 / admin 7; RED 47 vigentes / 10 sin
  acceso / 8 sin correo; RED 66 clientes / 43 claimed; 183 clientes platform-wide.
- Both `EXPLAIN (ANALYZE, BUFFERS)` plans (the `gym_membership` OR subplan at 36.6 us/row, and the
  `ventas` seq scan) plus the `pg_stat_user_tables` and `pg_stat_statements` counters behind them.
- The Resend ledger: **196** mails at the round-2 re-page (194 at the round-1 read, two sent
  since), 08-12 to 09-02, paged to `has_more:false` by three lenses; **0** subjects containing
  "Alerta"; per-address stacks 6/6/4/3/2; 3 bounces plus 1 delay, 3 of the 4 on `@red-demo.test`;
  two sender display names 119/57. **Subject-class split measured round 2** (this is what corrects
  §4's divisor): 63 invites · 46 `Confirma tu cuenta` · 10 `Restablece tu contraseña` · 2 magic
  link · 75 receipts.
- Nine `openssl` certificate expiries, two independent runs.
- Two live `curl`s per RED host: 200, 0 redirects, identical 31049 bytes,
  `Strict-Transport-Security: max-age=86400`, `Set-Cookie: gym=red; Path=/; Secure; SameSite=lax`
  with no `Max-Age`, and `X-Vercel-Id: iad1::pdx1::...`.
- Live `jwks.json` byte-identical to `JWKS_FALLBACK` (`kid 76da07da-...`), confirmed by three seats.
- `send-email` v8 live source **byte-identical** to the repo — 0 differing lines.
- 60 of 60 canonical RPC bodies match live (normalised md5).
- Every `file:line` in §1, §7 and §8 — re-read at HEAD by at least two of the three passes.
- Primaries re-fetched: Supabase Auth Hooks (5 s budget; a retry-able error needs a non-empty
  `retry-after`), Supabase going-into-prod (auth email limits are "Sum of combined requests"; 30 new
  users/hour default under custom SMTP), Supabase free-project-pausing (7-day low activity, 90-day
  restore), Supabase Realtime pricing (Free 200 peak connections), Supabase new-API-keys migration
  (legacy keys work "until the end of 2026").

**Modelled — a number derived from measured inputs, inputs named:**

- **≈34 new members/day platform-wide** = 100 mails/day ÷ **2.9 measured mails per new member**
  (round 1 said 50, dividing by an assumed 2). The 100/day is no longer asserted — it is read from
  https://resend.com/pricing (primary, 2026-09-02) — but it is **conditional on the account being on
  Free**, which is still unread. The 2.9 is measured from the account's own 21-day ledger.
- **About 146 ms at 2,000 rows and over 1 s at 14,000 rows** of RLS cost = linear extrapolation of a
  measured 36.6 us/row times 2 unpredicated reads per render.
- **About 68 ms at 100k and 200 ms at 300k** for `mi_membresia` = the measured 0.68 us/row.
- **About 16 sales/second** for `next_folio` = 1 divided by the measured 61.1 ms `registrar_venta`
  mean.
- **18 to 20 PostgREST round trips per cold `/reservar` render** = a static call-site trace,
  cross-checked against `pg_stat_statements` call ratios; not a captured network count.
- **About 7.3 tenant reads per membership read** = 9,200 `gym_id_por_host` calls divided by 1,255
  `mi_membresia` calls over the same 96-day window.
- **63 REENVIAR presses exhaust the day** = 100/day minus the measured 37/day peak.
- **Vercel's function timeout** as the thing that kills a 30 s await — the repo sets no `maxDuration`
  on any door, so the bound is a per-plan default that was not read.

**Asserted — carried from a prior doc or memory, not re-derived this round:**

- ~~Resend Free equals 100 mails/day (2026-07-22 capacity audit, P-069 / P-105)~~ — **promoted to
  measured round 2**: read from https://resend.com/pricing. What remains asserted is nothing; what
  remains **undecided** is *which plan the account is on* (§12 #4). An attempt to infer it from
  `ratelimit-limit: 10` refuted itself — that is the documented all-plan default.
- Turnstile widget cap of about 10 hostnames (memory `vercel-domain-scale-verdict.md`).
- The repo's own 50/hr auth-mail assumption (`entrar/actions.ts:72` comment) — **contradicted** by
  the primary above, which documents 30/hour under custom SMTP.
- "Vercel renews certificates 14 to 30 days out" (`2026-08-19-member-reachability-todo.md`).
- Vercel Hobby log retention of 1 hour, and Log Drains being Pro-only (same file).
- iOS Safari session eviction at about 30 days idle (ADR-0016).
- The 266 s worst stall and 65 stalls over 5 s in 24 h (the 2026-08-29 incident, quoted in
  `fetch-shield.ts:13-19`).
- The 2026-08-24 global-`signOut` incident (ADR-0016 Amendment).
- "Marce's invite had delivered to spam all along" (`email-deliverability-lane.md`, as-recorded).
- The roughly 4 manual console steps per gym (memory `vercel-domain-scale-verdict.md`); only the
  `gym_domain` step was verified here.

---

## 11. Could not determine

| Question | The experiment that settles it |
|---|---|
| Why does the live `email_data.token` fail `/^\d{6}$/`, making the OTP fallback 0-for-10? | One instrumented deploy: log `typeof token` and `token.length` (never the value) from `send-email/index.ts`, run one signup, revert. Cross-check Auth, Email, OTP length |
| Is the alert cron scheduled and armed at all, and which env var is missing? | Vercel, admin project, Cron Jobs, last invocation; then `curl -H "Authorization: Bearer $CRON_SECRET" https://<admin-host>/api/cron/alertas` — the 401-vs-500 body names it |
| Is this project on the Supabase Free plan? Every date in §5's first row depends on it | Dashboard, Settings, Billing. The `SUPABASE_ACCESS_TOKEN` in `apps/admin/.env.local` returns **401**, so the Management API is closed to all three passes |
| What are the LIVE GoTrue rate limits and the OTP expiry? | Dashboard, Authentication, Rate Limits and Email. `supabase/config.toml` is local-dev only (`site_url` is `http://127.0.0.1:3000`) and cannot be cited as live truth |
| Is `www.redfunctionaltraining.com` in the Auth Redirect-URL allow-list, and what is the Site URL? | Dashboard, Authentication, URL Configuration. I inferred Site URL equals `https://red.ibookit.lat` from GoTrue's referer fallback on roughly 895 server-side calls in 24 h — an inference, not a read |
| What Resend plan is the account on? | Resend dashboard, Billing. Turns §4's headline from modelled to measured. The API exposes only `ratelimit-policy: 10;w=1` |
| Does GoTrue actually retry a hook 503 with no `retry-after`? | On a scratch project, point the hook at a Resend key that 500s, fire one signup, count `run_hook` lines in `auth_logs` |
| Does a passwordless `admin.createUser` row authenticate against an empty string? | Locally: `supabase start`, `admin.createUser` without a password, read `encrypted_password`, then `signInWithPassword` with `''`. **Never against live** |
| Has the VINCULAR takeover ever fired in production? | Join each invite's Resend recipient address against the final `clientes.email` for that `codigo`. Needs Resend history past the 30-day page and a mail-to-row join nobody could make sound this round |
| ~~Did the 2026-08-30 `&correo=` cut actually raise the `email_no_coincide` rate?~~ **Re-scoped round 2 — it is already observable.** | **Struck: "nothing logs it."** `activar-cuenta/nucleo.ts:126-133` maps `email_no_coincide` to **HTTP 422**, uniquely (`firma_invalida` 401, `codigo_invalido` 404, `ya_reclamado`/`sin_email`/`cuenta_existente` 409), so `function_edge_logs` is a lossless proxy with no deploy: **0 of 6 in the last 24 h** (measured). The 30-day answer needs row #20's durable sink, not a new log line — the ceiling is the 24 h stream, which is already ranked. Round 1's remaining half, the activation-share comparison (n=8) establishes nothing |
| Did any member open a stale link? | Unanswerable retroactively — Resend reports `open_tracking:false` and `click_tracking:false` on the domain. Turning both on is a per-account setting |
| Does RED's invite mail land in Gmail's spam folder? | Send one invite to a fresh Gmail address the owner controls and look. Resend's "delivered" says nothing about folder |
| How many hostnames does the production Turnstile widget allow, and is the custom domain among them? | Cloudflare, Turnstile, widget `0x4AAAAAADw0zgE_N--iabPb`, Hostname Management. Cheap proxy: load `/registro` on the custom domain and watch for error 110200 |
| What is Vercel's function timeout for these apps? | `vercel inspect`, or the project's Function Duration setting. Then deploy a preview route that awaits 30 s and record status plus elapsed |
| Does React `cache()` really memoize across the two `getEsMiembro(supabase)` calls in one Next 16 request? | Apply the diff on a branch, `next build && next start`, load `/reservar` as a member whose `gym_membership` row was deleted, and count `gym_membership` SELECTs: 1 means stranded, 2 means not |
| Does a **non-private** Realtime subscription fail loudly or silently on this project? | Subscribe without `config.private` against live and observe whether `subscribe()` reports SUBSCRIBED or CHANNEL_ERROR |
| ~~Do `pnpm test`, `pnpm test:denial` and `pnpm test:e2e` pass at HEAD?~~ **Half answered round 2.** | **Run: `pnpm typecheck` (3 tasks green), `pnpm lint` (0 errors), `pnpm test` (114 files / 1975 tests green) at HEAD**, plus all 17 §7 diffs applied and reverted. **Still unrun: `pnpm test:denial`** (needs a scratch project + PAT; the PAT in `apps/admin/.env.local` 401s) **and `pnpm test:e2e`** (needs real credentials; and see the `signup.spec.ts` constraint in §9) |
| Which process is POSTing signups for `delivered@resend.dev` at **production** `red.ibookit.lat`? | New this round: 6 × `/signup` 500 "Invalid payload sent to hook" over 11 hours, actor `Prueba E2E`, all synthetic. It is **not** local `pnpm test:e2e` (that targets `red-demo`/`E2E_EMAIL`). The logs carry no caller. Settle it from the Vercel/monitor side, or by adding a caller header. It is excluded from `registros_atorados()` by the `%@resend.dev` filter, so it would never wedge-alert even if it succeeded |
| Do any of the 21 `authenticated_security_definer_function_executable` advisor WARNs actually bypass their own gate? | Most are by-design per ADR-0005. The shape to check is a **caller-supplied `p_gym_id` / `p_cliente_id` that the body trusts** — memory `multigym-rpc-roulette` already named `mi_membresia` and `toggle_favorito_tipo`, both on the list. Read the 21 bodies in `functions-canonical/`; no live query answers it |
| Is PITR or any backup configured? | Dashboard, Database, Backups. Only one logical replication slot exists (realtime), and PITR does not necessarily surface as a slot |
| Does `pg_stat_statements` eviction explain the missing cron query, or is the cron genuinely not running? | The table holds 4,845 of 5,000 entries. Raising the cap is a mutation. Settle it from the Vercel cron log instead — the Resend zero is the load-bearing evidence either way |
| How many concurrent warm Vercel instances does the client app run under normal RED load? | Log a per-instance nonce alongside every `registrarReenvio` for 7 days and count distinct nonces per address. It is `reenvio-limite`'s real rate multiplier |

---

## 12. Owner-input list — facts no agent can derive

1. **"Is the Vercel cron for `/api/cron/alertas` scheduled and enabled on the admin project, and what
   did its last invocation return?"** Still the single highest-value read in the document — it
   converts §1 row #4 from "silent, cause unproven" into a named cause. **Correction, round 2:** the
   experiment round 1 attached to this ask does **not** answer its own first arm. Round 1 said *"the
   401-vs-500 body names the missing variable"*; `route.ts:14-16` says the opposite in its own
   docstring — *"the 401 body is identical either way so a prober learns nothing about whether the
   route is armed"* — and an unauthenticated `curl` returning 401 is now measured. Only the
   **authenticated** call (and it sends mail) speaks to `SUPABASE_ACCESS_TOKEN` / `ALERT_EMAIL`; the
   dashboard read is the only thing that settles "is it scheduled at all".
2. **"Which Supabase plan is this project on — Free or Pro?"** Every date in §5's pause row, and the
   PITR and backup posture, hangs on it.
3. **"What does Authentication, Rate Limits say for auth emails per hour, token verifications and
   sign-in attempts, and what is the OTP expiry?"** Every capacity number in §4 is a range until this
   is read, and the repo's own 50/hr comment contradicts Supabase's documented 30/hour.
4. **"What plan is the Resend account on?"** The quota itself is now read from a primary (Free =
   100 mails/day, resend.com/pricing). What is unread is which plan applies. This is the difference
   between §4's binder being **≈34 new members/day** and being **void** — on Pro (50,000/month, no
   daily cap) the first binder becomes GoTrue at 30 new users/hour. The API exposes no plan endpoint,
   and the `ratelimit-limit: 10` header is the documented all-plan default, so it cannot be inferred.
5. **"What is in Authentication, URL Configuration: the Site URL, and does the Redirect-URL
   allow-list contain `www.redfunctionaltraining.com`, `red.ibookit.lat` **and**
   `http://red-demo-client.localhost:3100/**`?"** Decides §1 row #26 and whether members holding
   pre-cutover invites can still redeem them.
6. **"How many hostnames does the Turnstile widget allow, and is the custom domain listed?"**
7. **RULING NEEDED: "Should an invite code expire, and after how many days?"** ADR-0015 said no — but
   that was priced before the one-tap VINCULAR bind existed. 67 codes are live, oldest invite 53 days.
8. **RULING NEEDED: "Should VINCULAR refuse when the signed-in email differs from the invited one?"**
   It is a one-tap, irreversible bind that overwrites the invited address. Fixing it changes a
   currently-green denial-suite assertion — `supabase/tests/reclamar_por_codigo.sql:151` asserts the
   overwrite as **correct**.
9. **RULING NEEDED: "Retire `red.ibookit.lat` with a 308, or keep it?"** Customer-facing URL; all
   pre-2026-08-28 mail points at it.
10. **RULING NEEDED: "Is `supabase/migrations` a replayable history or a change log?"** The answer
    decides whether a green scratch `test:denial` run proves anything about production.
11. **CONFIG WRITE, one click: turn on `auth_leaked_password_protection`** (Dashboard →
    Authentication → Passwords). The advisor reports it **DISABLED**, so a member can set a known-
    breached password at `/registro` and `/activar/contrasena` (§1 row #32). No deploy, no migration.
12. **"Are forge's 44 members without an email intentional?"** Only forge's operator knows whether
    those rows are batch attendance entry with no intent to invite, or a roster the desk expects to
    be reachable. The answer decides whether §1 row #6 is a defect or a data-entry mode — and forge
    is the only gym with a real operator.
13. **OWED INPUT, still outstanding: the `gym_legal` content for RED and Forge.** The table is empty
    for all four gyms, which is why 51 of 51 consent stamps are versionless.
14. **OWED INPUT, carried from prior sessions: SAT persona-física details.** Unrelated to this
    surface, but still open per the end-of-session convention.

---

## 13. Dissent log

**Referee-resolved (8), and where each landed:**

1. **"Does the OTP-code gate ride the wrong rail?"** (T2-02 / T5-07 / T7-06.) The analyst and lens A
   argued opposite versions of the same claim; lens B curled the live mail bodies and found no code
   anywhere. Settled by a fresh join of `auth_logs` against the Resend ledger: the `/otp` 200s at
   2026-09-02 16:29:42, 02:18:04 and 01:17:31 each produced a mail titled "Confirma tu cuenta" **at
   the same second**, so `signInWithOtp` on an unconfirmed account really is labelled `signup`.
   **One defect, not three: the `/^\d{6}$/` gate has never once been satisfied in production.**
   T2-02 refuted, T5-07's rail attribution refuted, T7-06 held on its primary claim only.
2. **"Can the `gym` cookie reach a membership write?"** (T3-08.) Lens A held on the header evidence,
   lens B refuted the causal claim. All three writing call sites hardcode the override to `null`.
   **Refuted as written**; the header facts survive as §7 #12.
3. **"Does a GoTrue 500 produce 500s on every admin route?"** (T3-01.) Lens A cut the clause, lens B
   narrowed the window. `GoTrueClient.js:4821-4830` returns `{data:null,error}` rather than throwing.
   **Held at severity 4, outcome corrected to a silent sign-out.** The fix is unchanged.
4. **"Is the alert cron dead, or dying at the env guard?"** (T1-01 / T6-02.) **UNSETTLED.** Everyone
   agrees on the observation — 3 wedged, 0 alerts, no `pg_stat_statements` entry. Nobody can
   distinguish the two causes, because the route's only liveness signal is a `console.warn` into
   1-hour logs. Owner input #1.
5. **"Is the project on Free?"** (T6-04.) **UNSETTLED** — the PAT returns 401 for all three passes.
   Owner input #2.
6. **"Can a passwordless account be signed into with an empty string?"** (T7-10.) Lens A held the
   code facts, lens B correctly refused to call it reproduced, and the finding itself declines the
   experiment. **UNSETTLED.** The missing non-empty check is worth fixing regardless.
7. **"Has the ghost-cliente path ever fired?"** (RED-TEAM-08 / T7-07.) **UNSETTLED.** The code path is
   ranked once as §1 row #5; no live instance was found, and the person originally cited turns out to
   be row #10's wedge counted twice.
8. **"Are the capacity ceilings real?"** (T10-01 / T10-04 / T5-03.) Three load-bearing numbers —
   Resend 100/day, Turnstile about 10 hostnames, GoTrue 50/hr — were re-derived by nobody. The
   measured halves (2 sends per sale, 8 client hostnames, 2 of 5 doors ungated) all hold.
   **UNSETTLED**; owner inputs #3, #4, #6.

**Analyst-vs-lens disagreements I resolved myself:**

- **"RED alone has 183 clientes"** (T10-06's title). Lens B's live per-gym query gives red 66, forge
  50, red-demo 43, forge-demo 24 — 183 **platform-wide across four gyms, two of them sandboxes**. I
  took lens B's number and corrected the claim in §4; the 200-connection mechanism is unaffected.
- **"24 of 25 invalid_credentials have no member IP"** (T2-08). Lens A's row-level recount gives 18
  of 25 AWS-attributed, with one residential IP recurring 7 times. I used **18 of 25** in §1 row #20
  and kept the underlying mechanism, which lens B independently confirmed.
- **"16 mails, 7 recipients since v8"** (T1-02). Both lenses independently found that the real v8
  deploy is `2026-08-31T02:14:37Z` (from `list_edge_functions`), not the cited 08-30T19:14Z, and
  that the true count is **10 mails / 5 recipients**. I used 10/5 and accepted the referee's severity
  cut from 5 to 4 for the arithmetic slip. The 0% rate is unchanged.
- **"grep maxDuration returns nothing"** (T9-04). False:
  `apps/admin/src/app/api/cron/alertas/route.ts:60` sets `maxDuration = 60`. I struck that evidence
  line, kept the finding (zero `error.tsx` in either app is confirmed) and accepted the severity cut
  from 4 to 3, since the platform timeout that triggers it is unmeasured.
- **"Six `/signup` 500s equal a live member failure"** (T5-05). Lens B showed all six are the owner's
  own e2e identity, while every real member's `/signup` in the same window returned 200 with a
  matching Resend mail. I re-scoped it to a **latent config trap plus a dead e2e gate** (§1 row #26)
  and cut the severity from 4 to 3.
- **Duplication.** The referee flagged it and I applied it: one `reclamar_por_codigo` defect was
  filed four times, the ungated `/activar` door four times, the hook budget three times, the
  `createUser` one-way door three times, and the two-hosts finding twice. **Counting them separately
  would have made the severity-5 list read as five emergencies that are one RPC line and one missing
  `permitirReenvio` call.** 76 raw findings became 58.
- **`proxy.test.ts` "7 tests" vs "8 cases" vs "10".** Lens B is right: one block uses `it.each` with
  4 cases, so the running count is about 10. Immaterial to the claim (`proxy()` itself is invoked by
  no test), so I dropped the count from §7 #2 rather than argue it.

---

## 14. Blind spots

Union of all eleven seats. The coverage critic appends after this section.

**Not executed at all:**

- ~~**No gate was run this round**~~ — **true of round 1, closed by round 2.** `pnpm typecheck`,
  `pnpm lint` and `pnpm test` were run at HEAD and against all 17 §7 diffs (see §7's new column and
  ranked row #31). **Still not run: `pnpm test:denial`** (needs a scratch project and a working PAT)
  **and `pnpm test:e2e`** (needs real credentials, and its unarmed-run constraint is a design
  decision, not an oversight — §9).
- **Nothing was written to live.** Every live claim is a SELECT, a log query, a GET or a `curl`. No
  mail was sent, no login performed, no OTP redeemed, and no RLS policy probed by role-switching —
  every policy and grant claim is a catalog read of `pg_policies` and `proacl`.
- **No browser, no device, no Playwright — still true after round 2**, and the critic is right that
  this was never an access limitation: `mcp__t3-code__preview_*` was in the toolset both rounds. Two
  questions declared unanswerable are read-only browser questions (the Turnstile 110200 probe on the
  custom domain, and whether "No soy yo — cerrar sesión" is above the fold at 375 px). Every tap
  sequence is derived from source. Turnstile's
  real double-tap behaviour, iOS webview cookie semantics, ITP eviction, and whether "No soy yo —
  cerrar sesión" is above the fold on a 375 px viewport are all reasoned, never observed.
- **No load test.** Every §4 number is a live counter, a query plan, an HTTP header, a primary doc,
  or an extrapolation from one of those.

**Not accessible:**

- **No Vercel, Supabase, Cloudflare or Resend control-plane access.** Every plan, toggle, cron
  status, rate limit, redirect allow-list and usage graph is inferred or carried. See §12.
- **The pre-2026-09-01T17:00Z auth history does not exist**, so no claim about rates before that is
  measured. `auth.audit_log_entries` is empty table-wide and the log stream is 24 h. The Resend
  ledger reaches back only to 2026-08-04.

**Not opened:**

- **`apps/mobile/`** — untracked at session start, out of scope for all eleven seats. It is a second
  client that would add sockets to the Realtime ceiling and renders to the fan-out count, and it has
  its own session storage. Nothing here says anything about it.
- **The live `activar-cuenta` edge function (v3)** was never diffed against the repo. Only
  `send-email` v8 was byte-diffed. Every claim about `activar-cuenta` reads the repo file.
- **Migration bodies.** Drift was measured by filename and version (122 of 148 mismatched); whether a
  renumbered repo file's SQL differs from what actually ran was never diffed statement by statement.
- **About 45 of the roughly 55 `functions-canonical/*.sql` bodies** — only the new-member path plus
  `next_folio` were read for scan-shaped queries or write semantics.
- **`packages/ui` and `packages/brand`** — no one-liner from those packages is on the §7 list, and a
  brand-module change that alters the `/entrar` hero could plausibly break a form.
- **The `.tsx` surface generally** — roughly 95 components, zero test infrastructure. `signOut` made
  the list because it is greppable; components were not reviewed for other one-line-fatal props.
- **Supavisor**, the connection pooler sitting directly between §4's fan-out row and its
  `max_connections` row — mode, pool size and its own ceilings were not examined at all.
- **Resend's account-wide bounce and complaint budget** (under 4% and under 0.08%, suspension without
  warning). The ledger's `last_event` field would have allowed a re-measure of the 2026-07-22 audit's
  5.6%; the 1.55% / 0.52% split here is the 30-day window only.
- **Namecheap registrar state** — auto-renew, lock, 2FA, registrant verification. RDAP exposes none
  of it, and domain expiry 2027-07-09 is outside every window here.
- **Storage buckets**, admin surfaces beyond `vender` and `clientes/[id]`, the post-join write path
  (`reservar_clase`, `pasar_lista_sesion`, `toggle_pase`, `editar_venta`), the `/restablecer` and
  `/activar/contrasena` screens beyond their call sites, and the `code`/PKCE arm of `/auth/confirm`
  (traced, never exercised — all live evidence is on the `token_hash` arm).
- ~~**Forge's own funnel**~~ — **closed by round 2.** Forge: 50 clientes, 6 invited, **2 claimed,
  44 `sin_email`**, 0% `/registro`, 4 wedged rows with a 1,218 h worst case. It holds 28 live claim
  codes, more than RED, with `booking_enabled:false`. What is still **unmeasured** is the *cause* of
  the 44 (batch attendance entry vs. defect) — §12 #12 asks its operator. A fourth live gym,
  `forge-demo`, exists and is **missing from `01-live-snapshot.md` §D's tenant table**.
- **Concurrency between the desk and the member** (an operator selling while the member activates) —
  each operation's own partial failure was traced; two of them interleaving was not.


### Round 2 — the coverage critic's 13 items, folded

The critic's section stays appended below, unedited, as the round-1 artefact. This is its disposition
after round 2 ran two refuters and two experiments against it. **Six of the thirteen are closed, two
partly, five are open** — and two of the critic's own numbers were themselves wrong.

| # | Critic's item | Round-2 disposition |
|---|---|---|
| 1 | Forge never walked; the wedge is bigger than the headline | **CLOSED, and the critic corrected.** The 14-row wedge and its 1,218 h worst case reproduce exactly and are now in §0 item 4 and rows #4/#10. But the critic's *"detector coverage 3 of 14 = 21%"* is **struck** — a direct email join gives **1 of 14 = 7%**; two of the three `registros_atorados()` rows have no `clientes` row at all. The seat that flagged everyone else for asserting a number asserted this one. forge's funnel is now walked (`R2-R1` §6): 50 clientes / 6 invited / 2 claimed / 44 `sin_email` |
| 2 | §7's 17 rows were never executed | **CLOSED.** All 17 applied, gated and reverted. 12 green, **4 caught**, 1 unexecutable — see §7's new column |
| 3 | `signup.spec.ts` is missing from the deliverable | **CLOSED.** Row #26, §7 #17 and §9's e2e keep now say two suites / 6 tests; §2 gained a documentation-drift row for the stale `AGENTS.md` |
| 4 | Row #9's live evidence contradicts row #3's | **CLOSED, critic upheld.** The auth-log *bodies* prove it harder than the edge statuses did (1 × 200 + 5 × 422 `email_exists`; the one `generate_link` pairs with the one `createUser` in the same second). Row #9's evidence sentence is struck; its mechanism survives |
| 5 | `email_no_coincide` is already observable | **CLOSED, critic upheld.** §11 and §2 corrected; 0 of 6 in 24 h |
| 6 | `get_advisors` was never run; password policy is a zero | **CLOSED, and the critic corrected in both directions.** Security returns **27** findings, not the 6 the critic reported — 21 `authenticated_security_definer_function_executable` WARNs went unmentioned. The **performance** advisor was never run by anyone: it returns 3 WARN `multiple_permissive_policies` on exactly `clientes` / `gym_membership` / `reservation`, which supplies row #23's "2 unpredicated reads" mechanism for the first time. New ranked row #32 |
| 7 | Four surface-map components no territory owned | **OPEN.** Round 2 did not open `aceptar_acuerdo`'s callers, `PLATFORM_CLIENT_FALLBACK_HOST`, `ventas_count_por_cliente` or `codigo-form.tsx` either |
| 8 | `/codigo`'s brute-force cost is unpriced | **OPEN.** Nobody fired the N-POST experiment against `red-demo`. 10^6 code space, no app-tier throttle, directly POST-reachable, and it stays unpriced |
| 9 | The T10 tenant TTL-cache finding was dropped | **OPEN.** Still no ranked row, no §4 ceiling entry and no keep-verdict for per-request tenant resolution, and the 500-entry FIFO ceiling (~250 hosts/app) is still unnamed against a 5–10k-domain ambition |
| 10 | Modalities available and not run | **PARTLY CLOSED.** `get_advisors`: run (both types). Unauthenticated cron `curl`: run (401, and it kills "not deployed"). **Still not run: any browser** — the Turnstile 110200 probe and the 375 px fold check remain unanswered by anyone; `list_extensions` (is `pg_cron` installed) also unrun; the authenticated cron call deliberately left because it mails |
| 11a–c | §15 gave itself a pass on the GoTrue keep, the Resend delivery count and two missing keeps | **CLOSED.** §9's GoTrue support is re-written around the `__Host-` migration cost (and named as *unmeasured*, since nobody priced it); *"190 of 194 delivered"* is cut; keeps with digit-bearing triggers now exist for the `send-email` hook and Turnstile |
| 11d | §0 item 5's "every failure mode lives on `/registro`" | **CLOSED, and it went further than the critic did.** R1 refuted the clause *and* the commit attribution under it |
| 11e–f | Fully-tagged headlines that support no decision; §5 is thin; no config-plane drift row | **PARTLY CLOSED.** §4's binder now carries a primary source, a measured divisor and a 60-mails/day exit trigger. §2 gained config-plane and documentation-drift rows. **§5 is still the thinnest section** — its pause premise rests on an unread plan, `pg_cron` survival is unchecked, and nobody asked what a dormant Resend domain needs |
| 12 | Seven claims every seat took on faith | **4 of 7 closed:** Resend 100/day (primary read; the *plan* is still undecided), the `registros_atorados()` denominator (14, coverage 7%), "`session.spec.ts` is the gate" (two suites), "nothing logs `email_no_coincide`" (422 proxy). **3 open:** the Turnstile ~10-hostname cap (still a memory note, now at least carrying a keep and a trigger), "the project is on Supabase Free", and — closed as **refuted** rather than confirmed — "the cron's 401 body names the missing variable" (§12 #1) |
| 13 | The critic's own blind spots | **PARTLY CLOSED.** It ran no gate; round 2 ran all of them except `test:denial` and `test:e2e`. It did not open a browser; **neither did round 2**. It did not byte-diff live `activar-cuenta`; **neither did round 2**, which inherited the structural comparison — so every `activar-cuenta` claim is evidence about the deployed function only if the deployed function is HEAD's. It did not re-derive the other 27 ranked rows; round 2 attacked **five** (#1, #2, #4, #5, #9) and left #6–#8 and #11–#30 unchallenged, so a duplicate-reading error like #9's could still be sitting in the table |

**Round 2's own blind spots, on top of the above:**

- **The 24 h log ceiling bounds everything.** Rows #1 and #9 rest on one day's traffic — 6 activation
  attempts, 2 rate-limit hits. A second bad day could invert either reading, and
  `auth.audit_log_entries` = 0 means there is no history to appeal to. This is row #20, and it is
  now the limiting factor on three separate conclusions.
- **The door proxy names where an identity was *minted*, not which door was *tried first*.** A member
  who opened the invite, hit `email_no_coincide` or a 429, and then self-registered counts as
  `/registro`. R1's refutation kills the attribution to `afd7a5d5`; it does **not** show `/activar`
  is healthy. Settle it by counting `email_no_coincide` and `cuenta_existente` for 14 days — the 422
  proxy makes that a query, not a deploy.
- **n = 6 post-commit.** Detecting a 46% → 17% share change at p < 0.05 with 80% power needs ~35 post
  observations; at RED's ~2.3 claims/week that is **15 weeks**. The commit-level question is not
  answerable from this data and will not be for a quarter.
- **`invitacion_enviada_at` is presumably overwritten on resend**, which would shift a resent member
  into a later invite cohort in R1 §4's table. The migration was not read. **unmeasured.**
- **Row #5's occurrence is still unmeasured.** Round 2 confirmed the exposure counts and the code
  path and nothing about whether it has ever fired.
- **The experiments shared one working tree.** A sibling agent's `pnpm install`-shaped event deleted
  `package.json` mid-run (recovered by `git checkout --`). Any future parallel round that edits files
  needs worktrees; results from a shared root are one collision away from being unreproducible.
- **One unexplained divergence, flagged not chased:** §7 row 3's renamed directory is rejected by
  `tsc` and resolved fine by vitest/vite. Nobody knows why, and it matters because it means the two
  gates disagree about module resolution.

**Statistical caveat:** every rate in this document has a denominator between 5 and 196 over a single
Tuesday-evening-plus-Wednesday window. **Treat them as shapes, not estimates.** n=9 for the door-mix
change; n=10 for the `otp_expired` rate; n=6 for the activation-rail split.

---

## 15. Draft audit — what was cut or retagged, and the rule that caught it

Six shapes were swept for. Each cut names the rule.

**Rule 4 (the incumbent is a candidate — "standard", "proven", "Supabase handles it" is not
evidence):**

- Cut *"Supabase GoTrue is battle-tested, so the auth doors are fine"* from the keep list. Replaced
  with the only support that survives the substitution test: **nothing found here is a GoTrue defect;
  all 30 ranked rows are a door, a counter or a screen this repo owns** — and that keep now carries a
  digit-bearing trigger.
- Cut *"the unique indexes make this safe"* as a standalone reassurance about the claim races.
  Retained only with its measured proof: **0 duplicate `(gym_id, lower(email))` rows across 183
  clientes, 0 claimed rows without a membership, 0 memberships without a claimed cliente.**
- Cut *"RLS covers it"* as a reason `.eq("gym_id")` is redundant. The policy text
  (`20260714080000:79-81`) permits **every** gym the caller belongs to — the belt is load-bearing.

**Rule 5 (cite or drop; and the qualitative premise under a number is its own claim):**

- Retagged **"50 new members/day"** from measured to **modelled**, naming its asserted input (Resend
  100/day, 2026-07-22 audit).
- Retagged **"about 1 gym of Turnstile headroom"**: the 8 hostnames are measured, the roughly 10 cap
  is asserted from a memory note.
- Retagged **"the 50/hr auth-mail bucket"** as the **repo's own comment** (`entrar/actions.ts:72`),
  not a measured value — and recorded that Supabase's primary documents **30 new users/hour** under
  custom SMTP, which contradicts it.
- Retagged **"the cron is not running at all"** from a conclusion into an **inference**; the
  observation (0 alerts, 3 wedged, no `pg_stat_statements` entry) is measured, the cause is not.
- Retagged **"7% of middleware entered iad1"** (P-026): I have one live header showing
  `iad1::pdx1`, which proves the leg exists, not its share.
- Cut **"Vercel renews certificates 14 to 30 days out"** from the breaking-point line; the breaking
  point is the **measured `notAfter`**, and the renewal window is a carried assertion sitting under it.
- Cut **"1 hard bounce in 18, or 5.6%"** (P-036) as a current number; re-derived at HEAD to **1.55%
  account-wide and 0.52% real-recipient** over 194 mails, and named the sandbox as the source.

**Rule 1 plus the referee's duplication note (rank, don't rate; same mechanism means one row):**

- Merged **four** filings of the `reclamar_por_codigo` bind into one row, **four** of the ungated
  `/activar` door, **three** of the hook budget, **three** of the `createUser` one-way door, and
  **two** of the disjoint cookie jars. 76 raw findings became 58. Without this the severity-5 list
  would have read as five separate emergencies that are one RPC line and one missing throttle call.

**Rule 7 (M2 — honesty outranks severity; never invent a finding, and say so where it is sound):**

- **Struck three findings entirely** rather than soften them (§1 "Struck"), including one the analyst
  had at severity 5.
- **Demoted three to unmeasured** rather than let a real mechanism carry an unproven premise: the
  Free-plan pause, the empty-password login, and the ghost-cliente occurrence.
- **Kept five sound-and-ranked rows** with their evidence rather than dropping them: `realtime.send`
  cannot roll back a member write; `next_folio` at about 16/s is three orders above anything the
  product produces; the claim RPCs' TOCTOU is carried by the indexes; `ON DELETE SET NULL` made the
  09-01 live deletion safe by construction; and there is no PWA manifest, which is currently what
  keeps mail-link logins working.
- **Recorded two prior claims as FALSE at HEAD** so the next audit does not resurrect them: P-130
  (per-request JWKS fetch — there is a `GLOBAL_JWKS` with a 10-minute TTL) and P-103 (the multi-gym
  RPC roulette — both RPCs now filter `p_gym_id`).

**Rule 3 (every keep names an exit trigger with a digit, or is explicitly undecided):**

- Cut *"keep the alert cron"* outright. A keep whose only honest trigger was "undecided", for a
  component producing **zero** output for 30 days, is not a keep. It is listed as **DO NOT KEEP**.
- Eight keeps carry `undecided` with the question **and the named person who must answer it**; none
  is left as a bare "revisit later".

**Rule 2 (name the number; unknown reads "unmeasured — the experiment"):**

- Every "breaks at" in §4 and §5 carries either a digit or an explicit unmeasured tag with its
  experiment. The two that could not: Vercel's function wall (experiment named) and Turnstile
  siteverify latency (experiment named).
- Cut *"the project cannot handle a viral signup day"* as a bare assertion; replaced with the ordered
  ceiling table and the named first-binder.

### Round 2 additions to the audit

**Rule 5 (cite or drop) — the largest single failure of round 1.** §7's 17 rows were the biggest
block in the document and carried **no tag at all** while asserting "the tests stay green"; §15
itself admitted no gate had been run and shipped them anyway. Executed round 2: **4 of the 17 are
false** (#3 typecheck, #6 vitest, #8 lint, #15 vitest), and #6's contradiction — *"0 assertions in
`agenda-miembro.test.ts`"* against a test named `#220` asserting exactly that — was one grep away.
The correct tag was always `reasoning, not sourced — apply the hunk, run the gates, revert`.

**Rule 7 (honesty outranks severity) — four strikes, three of them against this document's own
headlines.** The `afd7a5d5` attribution, the "every failure mode lives on `/registro`" clause, row
#9's live evidence, and row #1's "the 429 renders as a lie" are all cut. A fifth strike lands on the
**coverage critic's** "3 of 14 = 21%", which was asserted by the seat whose entire job was catching
assertions. None of the five was softened; all five are struck with the file that killed them.

**Rule 4 (the incumbent is a candidate) — the GoTrue keep failed the substitution test it was
certified as passing.** *"All the defects we found are in our own code"* is a statement about where
the audit looked, and reads identically for any wrapped vendor. Replaced with a migration cost
(`__Host-` cookie), which is honest **and unmeasured** — so the keep is now visibly resting on a
number nobody has produced. Same shape cut *"190 of 194 delivered"* from the Resend keep. Two
components that were pure defect-sources with no keep row at all — the `send-email` hook and
Turnstile — now carry keeps with digit-bearing triggers, and the hook's trigger (**3rd ranked defect
inside it in 30 days**) is already tripped at 3.

**Rule 2 (name the number) — three headline digits moved.** 50 new members/day → **≈34**, on a
primary source and a measured 2.9 divisor, with an exit trigger (60 mails in a UTC day) it did not
have. "Worst stuck 475 h, 3 RED members" → **1,218 h, 14 platform-wide**. Detector coverage 14% (1
of 7) → **7% (1 of 14)**.

**Rule 1 (rank, don't rate) — the table was re-ranked, not re-scored.** #4 and #10 up on a wedge 4.7x
larger than the one they were filed against; #6 up on forge's 44 of 50; #3 down 3 → 15 because it is
exposure and not a regression; #9 down 9 → 22 because its only observation was a misread. Two new
rows (#31 gate integrity, #32 password policy) entered on measured evidence.

**One sentence round 2 cut that belongs on the record:** *"the regression is concentrated in one
commit-day."* It was the most quotable claim in the document and it is an artefact of a cut placed
25 hours early.

**One sentence I cut that belongs on the record:** *"RED's new-member failures are elevated."* I
cannot support it and neither can the project — `auth.audit_log_entries` is empty and the log stream
is 24 hours. What is supportable is in §2: the **door mix inverted** (measured, n=9), the **error copy
got worse** on 2026-08-30 (measured), and **exposure rose** (27 claimed members since 08-15,
measured). Whether the *rate* rose is unfalsifiable today, and the fix for that is §1 row #20.

---

## Blind spots — coverage critic

Mandatory seat. One question only: **what did the eleven-seat roster fail to examine?** Ranked by
how much a next round gains, worst first. Everything below is either a fresh live measurement made
this round (marked **measured — new**), a re-read at HEAD, or an explicit tag. Where I could settle
an "unmeasured" with a read-only query, I ran it and the number is here.

### 1. Forge was never walked, and it holds the worst wedge in the platform — 2.6x the owner-facing headline

§14 concedes "Forge's own funnel… its member journey was not [examined]". That concession is
load-bearing, not housekeeping: **forge is a real paying gym**, and the number §0 item 4 puts in
front of the owner ("worst stuck 475 hours") is RED-only.

**measured — new** (live, this round):

```sql
select g.slug, count(*), round(max(extract(epoch from (now()-c.invitacion_enviada_at))/3600))
from public.clientes c join public.gym g on g.id=c.gym_id
where c.auth_user_id is null and c.claim_code is not null and c.email is not null
  and c.invitacion_enviada_at < now() - interval '48 hours'
group by g.slug;
-- red 7 (max 691 h) · forge 4 (max 1218 h) · forge-demo 2 (max 1271 h) · red-demo 1 (965 h)
```

This is exactly the `clientes`-rooted arm §1 row #10 proposes as its fix, run for the first time.
Consequences the deliverable states wrongly:

- The **true worst wedge is 1,218 hours (51 days) on forge**, not 475 h on RED. §0 item 4 understates
  the platform's worst case by 2.6x, and understates it on the tenant that actually operates daily
  (memory `owner-is-dev-not-operator`: forge is the only real operator).
- **Detector coverage is 3 of 14 = 21% platform-wide**, not row #10's "14%, 1 of 7". Row #10's exit
  trigger ("coverage staying below 50%") is written against the wrong denominator.
- **4 rows carry a `claim_code` + an email with `invitacion_enviada_at` NULL** — the exact shape §8's
  `enviarInvitacion` row describes as a code-only risk ("`invitacion_enviada_at` never stamped — the
  stamp is the last write"). It now has a live count for the first time: **4**. *Which* of the two
  causes produced them (abort after Resend accepted, vs. a code minted by `preparar_invitacion` that
  was never sent) is **unmeasured — join each row's `claim_code` against the Resend ledger's
  recipient list; the 30-day page reaches 08-04 and three of the four rows predate it.**

**What a next round gains:** one tenant's funnel, and a corrected headline. **Modality not run:** nobody
queried a second tenant's member journey at all — every live count in the document except the gym
census is filtered to `red`.

### 2. §7 is the largest block in the document and not one of its 17 rows was ever executed

§14 admits "no gate was run this round". It undersells what that costs: **§7 is 17 rows whose entire
claim is "the tests stay green"**, and every one is derived from reading `.test.ts` assertions,
`vitest.config.ts`, `ci.yml` and `.husky/pre-commit`. Nothing establishes that the seventeen edits
even *compile* — `pnpm typecheck` was not run either. §7 #4 (React `cache()` on `getEsMiembro`) is
listed in §11 with a named experiment; the other sixteen are not, and are presented in a table with
no tag at all.

**Rule-5 shape the §15 Draft audit missed:** an untagged load-bearing claim, seventeen times. The
correct tag for each is `reasoning, not sourced — apply the hunk on a branch, run pnpm typecheck &&
pnpm test, revert`. **The experiment is roughly 3 minutes per row and no seat ran it once.**

### 3. `apps/client/e2e/signup.spec.ts` — a second browser suite, on the exact rail the document says is untested — is absent from the deliverable

`00-surface-map.md` §9 lists it (199 lines, 3 tests). Five territory files cite it (T5, T7, T8,
RED-TEAM, 02-drift-timeline). **The deliverable mentions it zero times** (`grep -c signup.spec` = 0).
Three places are written as if `session.spec.ts` were the whole suite:

- §1 row #26 — "**the only** browser gate on this surface".
- §9's e2e keep and §7 #17 — "make an unarmed `test:e2e` exit non-zero".
- §14 — "no Playwright" is true of this round, but the repo's Playwright coverage of `/registro` is
  understated by half.

`playwright.config.ts:58` is `testDir: "./e2e"`, so `pnpm test:e2e` runs **6 tests, not 3**
(measured, HEAD). Two things follow that no seat surfaced:

1. **The prescribed fix collides with a documented design constraint.** `signup.spec.ts:26-31`:
   *"an unarmed `pnpm test:e2e` must stay a no-op against production"* — because *"test 1 POSTs the
   real form against LIVE auth"*. §1 row #26 and §7 #17 both prescribe making the unarmed case
   non-zero without ever quoting or reconciling that comment. Fail-fast-without-executing satisfies
   both; the deliverable never says so, and a reader implementing §7 #17 literally could arm a suite
   that mints real GoTrue signups against production on every run.
2. **`AGENTS.md` is stale and Q1 never registered it.** It says `pnpm test:e2e` is *"the repo's only
   browser test: `apps/client/e2e/session.spec.ts`, three Chromium checks"*. It is two suites and six.
   §2's drift table has no row for **documentation drift**, though a stale AGENTS.md is exactly the
   input a future agent reads before deciding what a gate covers.

### 4. New live measurement contradicts §1 row #9's evidence — and reconciles it with row #3

**measured — new.** `activar-cuenta` (function_id `4769f738…`), full 24 h `function_edge_logs`:

```
POST | 409 | 2026-09-02T16:29:41 · POST | 200 | 15:04:08 · POST | 409 | 02:18:03
POST | 409 | 01:17:30 · POST | 409 | 2026-09-01T19:25:27 · POST | 409 | 19:25:16
```

**6 invocations: five 409, one 200, zero 500, zero 422.**

Row #9 reads the same window as *"6 `/admin/users` calls vs `/admin/generate_link` 1 (five createUser
attempts that never reached generateLink)"* and offers it as live evidence for the orphan-user rail.
The live function's own status map settles it the other way: the `linkErr` path row #9 describes
returns **500** (`activar-cuenta/index.ts` — `console.error("generateLink…"); responder(500)`), and
there were **zero 500s**. Five 409s is `cuenta_existente`, i.e. `createUser` **failed** with
`email_exists` — which is row #3's own measurement ("`/admin/users` 1x200 vs **5x422 `email_exists`**")
read correctly. On that arm `index.ts` mints nothing by explicit design (*"return `cuenta_existente`
and mint NOTHING"*). **No half-created user exists in that window.**

Row #9's *mechanism* survives untouched (there is genuinely no compensating `deleteUser` on the
`linkErr` path, and no test covers it). Its **live-evidence sentence should be struck**, and with it
the implication that the one-way door has fired. Two rows in the same ranked table read the same six
log lines to opposite conclusions and the referee did not catch it.

Bonus, consistent: the two 409s at 19:25:16.985 and 19:25:27.073 sit one second before row #1's two
`over_email_send_rate_limit` 429s (19:25:17Z, 19:25:27Z). The Marce loop is confirmed at the edge tier.

**Also closed this round:** §14's *"the live `activar-cuenta` edge function (v3) was never diffed
against the repo"*. I read live v3 in full via `get_edge_function`. Every branch, the `decidir` gate,
the `ESTADO` status map and both docstrings match HEAD. **Tag: structural comparison, not an md5
byte-diff** — I did not hash the live bytes.

### 5. `email_no_coincide` is already observable; §11 says it is not

§11: *"Did the 2026-08-30 `&correo=` cut actually raise the `email_no_coincide` rate? **Nothing logs
it.** Add a line at `activar/actions.ts:73` and count for 30 days."* §2's drift table repeats it:
*"the magnitude of (b) is unmeasured — nothing logs `email_no_coincide`."*

**Refuted.** `activar-cuenta/nucleo.ts:126-133` maps `email_no_coincide` to **HTTP 422**, uniquely:
`firma_invalida` 401, `codigo_invalido` 404, `ya_reclamado`/`sin_email`/`cuenta_existente` 409. The
status is therefore a lossless proxy in `function_edge_logs`, no deploy required. **measured — new:
0 of 6 in the last 24 h.** The 30-day count is unavailable only because the log stream is 24 h — the
same ceiling §1 row #20 already ranks, not a missing instrumentation line. The honest §11 entry is
*"a 24 h query answers it today; a 30-day answer needs the durable sink of row #20"*, which changes
the fix from "add a log line to `/activar`" to "row #20 already covers this".

### 6. `get_advisors` — one read-only MCP call — was never run, and password policy is a zero in a document about account doors

No seat ran `mcp__supabase__get_advisors` (`grep -ril advisors docs/FIndings/new-user-xe/` = 0
files). **measured — new**, security advisors at `2026-09-02T18:36:43Z`:

- **`auth_leaked_password_protection`: DISABLED.** Members can set a known-breached password at
  `/registro` and `/activar/contrasena`.
- `rls_enabled_no_policy` on `public.cron_run_log` and `public.gym_folio_counter` (INFO; neither is
  member-facing, and `next_folio` is `SECURITY DEFINER`, so this is noise — recorded so it is not
  re-filed).
- The three `anon`-executable definers it flags (`gym_id_por_host`, `invitacion_info`,
  `enviar_mensaje_contacto`) are covered: two by row #15 and #216, one off-path.

**Zero of the 30 ranked rows says anything about password policy.** The only related item is
§1's unmeasured T7-10 (empty-password login), which raises the *empty* case only. Re-read at HEAD:
`apps/client/src/lib/auth-validacion.ts:34` is `if (password.trim().length < 8) return "Mínimo 8
caracteres."` — it lives in `apps/client/src/lib/`, is called from the form, and the Server Function
is directly POST-reachable, so **the 8-character floor is client-side only**, exactly like the
non-empty check the document does raise. The document ranks a one-tap membership takeover at #2 and
never asks what a member's password has to be.

### 7. Four components on the surface map that **no** territory owned

`grep -rl` across all eleven territory files plus the deliverable:

| Surface-map entry | Territories citing it | Why it matters here |
|---|---|---|
| `aceptar_acuerdo` (map §7 — the consent RPC) | **0** | §1 row #17 ranks "consent stamped for an aviso that does not exist, 51 of 51 versionless" and prescribes a fix — without ever reading the RPC that exists to *record* an accepted agreement, its `acuerdo_aceptacion` table, `packages/data/src/server/legal.ts:107`, or `supabase/tests/aceptar_acuerdo.sql`. Row #17's fix ("stamp only when `p_aviso_version` is non-null, then fill `gym_legal`") may already be half-built. **Unmeasured — `select count(*), documento, version from public.acuerdo_aceptacion group by 2,3` plus whether any UI calls `aceptarAcuerdo`. I did not run it; it is a 2-minute read.** |
| `PLATFORM_CLIENT_FALLBACK_HOST` | **0** | `invitaciones.ts:122-145`: when a gym maps no non-`.localhost` client host, the invite URL becomes `https://<fallback>/activar?gym=<slug>&codigo=…`. `apps/client/src/proxy.ts:101` reads `searchParams.get("gym")` **first**, ahead of the cookie, as the tenant override, then writes it to a `Max-Age`-less `gym` cookie at `:184`. That is the one place the struck T3-08's `?gym=` input is both attacker-reachable and **mail-borne**, and no seat traced it. **measured — new: all 4 live gyms have at least 1 real client host** (red 2, forge 1, red-demo 1, forge-demo 1), so the rail is unexercised today and this is latent, not live. It fires the first time a gym is provisioned without a `gym_domain` row — which §4's own "4 manual console actions per gym, three of them invisible to every guard" row says is the likely failure. |
| `ventas_count_por_cliente` | **0** | On the desk path (map §1). Off the member path, so low value — recorded for completeness. |
| `codigo-form.tsx` | **0** (map only) | See #8. |

### 8. `/codigo` — an unthrottled, un-Turnstiled OTP verifier — has no number anywhere

`apps/client/src/app/codigo/actions.ts:27-40` (re-read at HEAD, the file is **40 lines**): a Server
Function taking `email` + a `\D`-stripped 6-digit `codigo`, calling `confirmarCodigoDeCorreo`, with
**no Turnstile gate** (unlike `/registro` and `/activar`, per row #22) and **no `permitirReenvio`**
(grep at HEAD: 2 non-test call sites, `entrar/actions.ts:84` and `registro/actions.ts:97` — neither
is this one). The only limiter is GoTrue's token-verification bucket, which §12 #3 asks the owner for
and no row connects to this door.

The document's only ranked mention of `/codigo` is row #7 — that it has never been usable. **The
door's cost when it *becomes* usable was never priced: 10^6 code space, no app-tier throttle,
directly POST-reachable.** The code's own docstring worries about the enumeration oracle and gets
the copy right; nobody gave the brute-force side a number. **Unmeasured — fire N POSTs at
`/codigo` with wrong codes for one address against `red-demo` and record at which N GoTrue answers
429; that is the real ceiling.** Never against live RED.

**Citation-integrity note:** `T2-activation-doors.md:146` cites `codigo/actions.ts:74-76`. The file is
40 lines. The referee did not catch it; the finding it supported was struck for other reasons.

### 9. A measured T10 finding with a fix hint was dropped between the territory and the deliverable

`T10-stress.md:400-420` holds a full finding: `resolve-tenant.ts:71-72` has a **module-level TTL
cache, `CACHE_TTL_MS = 60_000`, `CACHE_MAX_ENTRIES = 500`, keyed `${app}|${host}`**, and live
`pg_stat_statements` over 96 days shows **9,200 + 2,732 `gym_id_por_host` calls, 19,277 `gym_domain`
projections and 26,991 `gym` projections against 4 gym rows and 15 domain rows** — its fix hint is
"~52,000 database round trips per 96 days removed by a build-time map, no behaviour change".

The deliverable carries **only** the derived "7.3 tenant reads per membership read" into §10's
modelled list. **No ranked row, no §4 ceiling entry, no §9 keep-verdict, no exit trigger** — even
though §4's `max_connections` row names occupancy as the risk and §1 row #21 names `gym_id_por_host`
as the first unbounded await of every request in both apps. **Rule-3 shape missed by §15:** an
incumbent design (per-request tenant resolution through the DB) kept with no reversal condition, in
a section that otherwise gives every keep a digit.

Two corrections the cache also forces, both re-read at HEAD:

- §5's pause row says *"`resolve-tenant.ts:149` returns `tenant:null` on an RPC error"* and implies a
  sticky generic-chrome state. `resolveHostUncached` returns `{ value: {matched:false, tenant:null},
  cacheable: false }` on `error` — a transient error is deliberately **never** cached (the comment
  says so in first person). The symptom is per-request, not pinned for 60 s. The finding survives;
  its duration does not.
- The 500-entry FIFO is a ceiling nobody named. **modelled — inputs: 500 entries, two apps sharing
  the key space (`${app}|${host}`), so about 250 hosts per app before eviction thrash** against the
  5–10k-domain scale the memory `vercel-domain-scale-verdict` contemplates. §4's provisioning row
  calls 10 gyms "human-bound, not throughput-bound" and never reaches this.

### 10. Modalities that were available and not run

§14's "not executed" list is honest about *what* was not run and silent about *what could have been*:

- **A browser was reachable.** `mcp__t3-code__preview_*` (navigate / snapshot / click / resize) was
  in the toolset. §14 says "no browser, no device, no Playwright" as if that were an access
  limitation. Two questions the document declares unanswerable are read-only browser questions:
  §11's own *"cheap proxy: load `/registro` on the custom domain and watch for error 110200"*
  (Turnstile hostname headroom, row #22, a top-5 ceiling) and §6 row 5 / row #25's "is *No soy yo —
  cerrar sesión* above the fold at 375 px". Both were skipped as inaccessible; neither is.
- **`get_advisors`** — see #6.
- **An unauthenticated `curl` of the cron route.** **measured — new:**
  `curl -s -o /dev/null -w '%{http_code}' https://red-admin.ibookit.lat/api/cron/alertas` → **401**,
  body `No autorizado`. That rules out "the route is not deployed / not routed", which nothing in the
  document had ruled out. **But it also refutes the experiment the document names for its
  highest-value owner input.** §12 #1 and §1 row #4's fix hint both say *"the 401-vs-500 body names
  the missing variable"*. `apps/admin/src/app/api/cron/alertas/route.ts:14-16` says the opposite, in
  its own docstring: *"An unset secret fails CLOSED (401), never open, and **the 401 body is
  identical either way so a prober learns nothing about whether the route is armed**."* So the
  prescribed experiment cannot distinguish "CRON_SECRET unset" from "wrong bearer" — by design. It
  can only speak to `SUPABASE_ACCESS_TOKEN` / `ALERT_EMAIL`, and only from an authenticated call.
  **The document's #1 owner ask ships with an experiment that does not answer its own first arm.**
- **`list_extensions`** (is `pg_cron` installed; does §5's class-horizon row rest on a live job) —
  not run by any seat. I did not run it either.

### 11. Six shapes — where §15's Draft audit gave itself a pass

§15 is unusually rigorous. These four survived it.

**a) Support surviving substitution (Rule 4) — the GoTrue keep.** §9's first keep is supported by
*"nothing found here is a GoTrue defect; all 30 ranked rows are a door, a counter or a screen this
repo owns"*, and §15 explicitly certifies it as the substitution-proof replacement for "GoTrue is
battle-tested". It is not. **"All the defects we found are in our own code" is a statement about
where the audit looked** — the scope was this repo's new-user path — and it reads identically for any
vendor you wrap. Meanwhile the GoTrue-specific facts this round *did* measure are costs, not support:
a 60 s per-address `/otp` floor, one project-wide "Sum of combined requests" bucket shared across
tenants (§4, 3rd binder), `signInWithOtp` on an unconfirmed account silently labelled `signup`
(§13 #1), a hook retry contract that needs a non-empty `retry-after` (row #14), and
`auth.audit_log_entries` empty table-wide (row #20 — the reason the whole document had to be
reconstructed from a mail ledger). **What would survive substitution:** a migration cost — GoTrue
mints the `__Host-` cookie the entire session model is built on, and §7 #1/#5 show that cookie
surface is already one deleted line from a mass sign-out. That is a real number nobody produced.

**b) Same shape — the Resend keep.** §9 keeps Resend on *"DKIM and both SPF records verified live;
**190 of 194 delivered**"*. §11 refutes the second half in the same document: *"Resend's 'delivered'
says nothing about folder"*, and the 2026-08-19 FortiGuard block plus the 09-01 spam placement are
two live counterexamples §9 lists elsewhere. A vendor-reported delivery count is exactly the
substitution-vulnerable support Rule 4 targets — any transport reports it. The DKIM/SPF half is
measured and does survive; the delivery number should be cut from the support line.

**c) Keep without a reversal condition — two whole components have no keep row at all.**

- **The `send-email` hook.** Rows #7, #14 and #26, plus three of §8's twelve rows, are all defects
  *of the hook*. §9 has no keep-verdict for running auth mail through a custom hook at all, so the
  one structural alternative — Supabase's built-in auth templates, which have no 5 s budget, no three
  unbounded fetches, no silent-drop-on-4xx and no `redirect_to` fail-closed 400 — **never got the
  substitution test**. The trade it would lose (per-gym branding, #75) is real and was ruled on in
  2026-07; it is not re-priced here against six ranked rows. **Exit trigger it should carry:
  reconsider the hook if a 3rd ranked defect originates inside it in any 30-day window — today that
  count is already 3.**
- **Turnstile.** Row #22 ranks it a fail-closed single point of failure on all three account-creating
  doors, with about 1 gym of hostname headroom. §9 has **no keep row and no exit trigger for
  Turnstile**, so the document's 2nd-binding ceiling is a weakness with no keep-verdict attached.
  **It should carry: replace it or move to per-gym widgets at a 2nd unlisted-hostname incident, or
  when client hostnames reach 9 (today 8, measured).**

**d) Untagged load-bearing claim (Rule 5) — in the owner's TL;DR.** §0 item 5: *"**Every** failure
mode in this document lives on the `/registro` rail, and ~89% of new members now take it."* Untagged,
and false against §1: rows #2 (VINCULAR bind), #6 (`sin_email`), #9 (fresh-provision cut), #19 (merge
runbook), #24 (certs) and #28 (venta replay) are not on that rail, and row #1's 429 fires on
`/activar`'s `cuenta_existente` branch. The supportable version is *"the rail 89% of new members now
take is the one the owner never walks"* — which §0 item 7 already says correctly, with its evidence.
The overstatement is the single sentence in the document most likely to be quoted back.

**e) All-tagged output establishing nothing.** §4's headline (**50 new members/day**) and §5's
headline (**pause at day 7–14**) are the two most quotable numbers here. §4's rests on one asserted
input (Resend 100/day, carried from 2026-07-22); §5's rests on a premise §11 says nobody verified.
Both are stated in bold in their sections **without the caveat attached at the point of quotation** —
§4 carries it one line below, §5 carries it in the last cell of the row. §15 audits Rule 2 ("every
'breaks at' carries a digit or an unmeasured tag") and never asks whether a fully-tagged pair of
headlines still supports a decision. It does not: neither is actionable until one dashboard read
lands, and that is the honest summary §4 and §5 should open with.

**f) Ranking under the floor.** No section is missing — §§0–15 are all present and Q1–Q7 are all
answered — and 30 ranked rows is comfortably above any floor. The floor problem is **evidential, not
numerical**: §7's 17 rows (the largest block) have zero execution behind them (#2 above), and §5 (Q4)
is the thinnest answer in the document — its top row is unverified, it never states what a returning
member sees in the *likely* case (project not paused), and it omits whether `pg_cron` survives a
pause, whether a dormant Resend domain needs re-verification, and what happens to the 4 unstamped
invites. **§2's drift register is also scoped to the repo:** it has no row for **config-plane drift**
(Supabase Redirect-URL list, Turnstile hostnames, Vercel env, Resend domain state) even though five
of §12's twelve owner asks are exactly that, and §1 row #26's mechanism is a config trap. A drift
register that only reads `git log` cannot see the half of the system §12 says it cannot read.

### 12. Claims every seat took on faith

Named because each is one read from being settled, and none was:

1. **Resend Free = 100 mails/day** — carried from 2026-07-22 through three seats and the referee into
   §4's headline. `ratelimit-policy: 10;w=1` is the only live header anyone obtained; it is a
   per-second rate, not a daily quota, and says nothing about the plan.
2. **Turnstile widget cap of about 10 hostnames** — from a memory note, powering §4's 2nd binder.
   §11 names a browser-side proxy for it (error 110200) that a reachable browser could have run (#10).
3. **The project is on Supabase Free** — the entire first row of §5. The PAT 401 closed the
   Management API; the *dashboard* was never asked for, only listed.
4. **`registros_atorados()`'s denominator** — every seat used RED's 7. It is 14 platform-wide (#1).
5. **"`session.spec.ts` is the browser gate"** — three seats and the referee (#3).
6. **"Nothing logs `email_no_coincide`"** — two sections (#5).
7. **"The cron's 401-vs-500 body names the missing variable"** — the #1 owner ask (#10).

### 13. My own blind spots (Rule 6)

- **I ran no gate either.** No `pnpm test`, `typecheck`, `lint`, `test:denial` or `test:e2e`. My #2
  is a charge about missing execution that I did not remedy.
- **I did not open a browser**, so #10's two named browser experiments remain unrun by anyone.
- **I did not byte-diff live `activar-cuenta`** — structural comparison only (#4).
- **I did not read `acuerdo_aceptacion`'s rows** or trace `aceptarAcuerdo`'s callers, so #7's first
  row names an unexamined component without pricing it.
- **I did not re-verify any of the deliverable's 30 rows** except #9, #10 and #26 where a live query
  crossed them. **Absence of a challenge from me is not confirmation** — I sampled the map against
  the cites and ran the cheap unrun experiments; I did not re-derive the document.
- **I did not open `apps/mobile/`, `packages/ui`, `packages/brand`, Supavisor, or the ~45 unread
  `functions-canonical` bodies.** §14's list of those stands unchanged and unaudited by me.
- **Every new number here has an n between 4 and 20 over one 24-hour window**, except the 14-row wedge
  query, which is a full-table count. Same statistical caveat §14 states: **shapes, not estimates.**
