# R1 — Refutation of the §0/§2 headline: "the door mix inverted at `afd7a5d5`"

Seat: REFUTER R1 (opus). Mandate: build the strongest honest case that the headline is wrong or
mis-stated, then rule. Repo HEAD `33c9087a`. Live project `hjppxawglmukfvsgmcog`, SELECT only.
Emails masked (4 chars + domain).

**The claim under examination**, as carried in `docs/FIndings/2026-09-02-new-user-cross-examine.md`
§0 item 5, §2, ranked row #3, and §10:

> The door mix inverted at commit `afd7a5d5` (2026-08-30): RED members claimed via `/activar` vs
> `/registro` went 17/17 before → 1/8 after; every failure mode lives on the `/registro` rail;
> regression AND exposure.

**Verdict: held-with-corrections — and the corrections gut the load-bearing half.**
The *share* shift is real and reproduces exactly. The *attribution to `afd7a5d5`* is refuted on four
independent grounds. The *"every failure mode lives on the `/registro` rail"* clause is refuted
outright. The *exposure* half holds untouched.

---

## 1. What survives, re-derived independently this round

I re-ran the split from scratch rather than reading the doc's numbers back.

**The `full_name` proxy is valid.** (Check 2 — the one place the refutation attempt failed.)

- Only `/registro` writes it: `packages/data/src/server/registro.ts:153-158` —
  `supabase.auth.signUp({ … options: { data: { full_name, phone_e164 } } })`.
- The invite rail writes none: `supabase/functions/activar-cuenta/index.ts:92-95` —
  `admin.auth.admin.createUser({ email, email_confirm: true })`, no `user_metadata`.
- The `cuenta_existente` rail writes none: `packages/data/src/server/sesion.ts:185-187` —
  `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } })`.
- Nothing writes it later: the only `updateUser` on the surface is `sesion.ts:276` —
  `updateUser({ password })`.
- **Stable for the whole window.** `git log -S'full_name' -- packages/data/src/server/registro.ts`
  returns exactly one commit, `ead16db8` (2026-07-02). `git log -S'user_metadata' --
  supabase/functions/activar-cuenta/` returns **zero**. The discriminator has been what it is since
  before any member in this dataset existed. **measured.**

**Second, independent proxy agrees 52/52.** `admin.createUser({email_confirm:true})` confirms in the
same request, so `email_confirmed_at - created_at < 1 s` is an orthogonal signature of the
`/activar` rail:

```sql
select count(*) as total,
 count(*) filter (where (u.raw_user_meta_data ? 'full_name')
                   <> (u.email_confirmed_at - u.created_at >= interval '1 second')) as disagree
from public.clientes c join auth.users u on u.id = c.auth_user_id;
-- {"total": 52, "disagree": 0}
```

**measured.** The doc's discriminator is sound. I could not break it.

**The weekly table reproduces byte-for-byte** (RED, `date_trunc('week', auth.users.created_at)`):

| week | via `/activar` | via `/registro` |
|---|---|---|
| 2026-08-10 | 12 | 6 |
| 2026-08-17 | 2 | 6 |
| 2026-08-24 | 3 | 8 |
| 2026-08-31 | 1 | 5 |

**Lifetime share is real:** RED 43 claimed = 18 `/activar` + 25 `/registro`; recent weeks run
83–89% `/registro`. That much is not in dispute.

---

## 2. Refutation A — the cut is 25.4 hours before the commit it is named after, and moving it to the commit's own timestamp destroys the effect

`afd7a5d5` was authored **and** committed `2026-08-30T19:26:40-06:00` = **`2026-08-31 01:26:40Z`**
(`git log -1 --format='%aI %cI' afd7a5d5`; author and committer dates identical, so no rebase skew).
The follow-up `17566753` is `2026-08-31 01:52:08Z`. The `send-email` v8 deploy is `2026-08-31 02:14Z`
(the doc's own drift table). **Nothing in this change set existed before `2026-08-31 01:26:40Z`.**

The doc's split cuts at **`2026-08-30 00:00Z`** — 25 h 27 min *earlier*. I recovered the cut by
reproducing the exact numbers:

```
-- RED claimed members, split at four candidate cuts
| cut                     | antes_activar | antes_registro | desp_activar | desp_registro |
| 2026-08-17 00:00Z       | 12            | 6              | 6            | 19            |
| 2026-08-30 00:00Z       | 17            | 17             | 1            | 8   <- the doc
| 2026-08-31 01:26:40Z    | 17            | 20             | 1            | 5   <- the commit
| 2026-08-31 02:14:00Z    | 17            | 20             | 1            | 5   <- the deploy
```

**measured.** Three RED `/registro` signups land in the doc's "después" bucket that predate the
commit's existence by 3–4 hours:

| member | `auth.users.created_at` | rail | vs `afd7a5d5` (01:26:40Z) |
|---|---|---|---|
| `sasu@gmail.com` | 2026-08-30 21:57:20Z | `/registro` | **3 h 29 m before** |
| `aile@gmail.com` | 2026-08-30 22:19:08Z | `/registro` | **3 h 08 m before** |
| `euni@gmail.com` | 2026-08-30 22:33:05Z | `/registro` | **2 h 54 m before** |

Corrected to the commit's own timestamp the split is **17/20 → 1/5**, i.e. `/activar`'s share moves
from **46% to 17%**, not from 50% to 11%.

**Significance, before and after the correction** (one-sided Fisher exact, hypergeometric,
N=43, K=18 `/activar`):

| cut | table | one-sided p |
|---|---|---|
| doc's `2026-08-30 00:00Z` | 17/17 vs 1/8 (n=9) | **p = 0.038** |
| commit `2026-08-31 01:26:40Z` | 17/20 vs 1/5 (n=6) | **p = 0.186** |
| `2026-08-17 00:00Z` | 12/6 vs 6/19 (n=25) | **p ≈ 0.007** *(normal approx, continuity-corrected: z = −2.46)* |

*(Arithmetic for the two exact rows: P(X≤1) = [C(25,9) + 18·C(25,8)] / C(43,9) = (2 042 975 +
19 468 350) / 563 921 995 = 0.0381; P(X≤1) = [C(25,6) + 18·C(25,5)] / C(43,6) = (177 100 + 956 340) /
6 096 454 = 0.1859. **modelled — inputs are the live counts above.**)*

**The entire statistical signal for "at `afd7a5d5`" is an artefact of a cut placed a day early.**
At the commit's own timestamp the result is indistinguishable from noise (p = 0.19), and the
*best-fitting* change point in the series is **2026-08-17 — thirteen days earlier** and five times
more significant than the one the headline names.

---

## 3. Refutation B — the mechanism the claim names shipped 53 days before the commit, and `afd7a5d5` did not touch it

Ranked row #3's mechanism cell reads: *"`entrar-form.tsx:341-353` renders an unconditional
full-width 'Crea tu cuenta' to `/registro`."* That affordance is not a product of `afd7a5d5`:

```
git log --oneline -S'Crea tu cuenta' -- apps/client/src/app/entrar/_components/entrar-form.tsx
2c040430  2026-07-08  fix(client): persistent enumeration-safe "¿Primera vez?" nudge on /entrar
```

**One commit, 2026-07-08 — 53 days before `afd7a5d5`.** And `git show afd7a5d5 --
apps/client/src/app/entrar/_components/entrar-form.tsx` (full diff read this round) touches only the
resend/rescue block, the `AVISOS` motivo map, and the `enlaceInvalido` → `motivoEnlace` prop rename.
**The `/registro` CTA block is not in the diff at all.** `git log --oneline -- <that file>` puts
`afd7a5d5` seventh in a ten-commit history whose CTA-bearing entry is `2c040430`.

So the claim pairs a date (`afd7a5d5`) with a mechanism (the unconditional CTA) that the commit
neither introduced, moved, nor modified. **measured.**

The doc's own §2 offers a *different* mechanism for `afd7a5d5` — the `&correo=` pre-fill removal —
and tags it `reasoning, not sourced`, noting the 24 h edge log holds **zero** `activar-cuenta` 422s.
That candidate is unmeasured, and §2 says so. Neither candidate supports the headline.

---

## 4. Refutation C — the simplest sufficient explanation is a one-day invite backlog draining, and it is measured

The `/activar` rail can only convert members the desk has invited. Invite volume:

```
select c.invitacion_enviada_at::date, count(*) …  -- RED
2026-08-05: 1 | 2026-08-13: 21 | 2026-08-17: 1 | 2026-08-18: 3 | 2026-08-23: 2
2026-08-27: 2 | 2026-08-29: 1 | 2026-08-30: 1 | 2026-08-31: 4 | 2026-09-01: 2 | 2026-09-02: 1
```

**Twenty-one invites went out on a single day, 2026-08-13** — the RED live-seed backlog
(`red-gym-live-seed-progress`: 28 members seeded 2026-08-02, *asserted*, carried from memory).
After that day the desk sends 1–4/day, sporadically. Weekly: **1, 21, 6, 4, 7.**

Per-day rates (the 2026-08-31 bucket is 2.63 days long — data ends `2026-09-02 15:04Z` — so weekly
counts are not comparable without this normalisation, which the doc's table does not do):

| week | `/activar` per day | `/registro` per day | invites sent |
|---|---|---|---|
| 08-10 | **1.71** | 0.86 | 21 |
| 08-17 | 0.29 | 0.86 | 6 |
| 08-24 | 0.43 | 1.14 | 4 |
| 08-31 (2.63 d) | 0.38 | 1.90 | 7 |

**The `/activar` rail fell 6× at the 08-17 boundary and has been flat (0.29 → 0.43 → 0.38/day) ever
since. `afd7a5d5` sits inside the flat region.** The "inversion" is the seed wave leaving the
numerator, not a door change. **measured.**

**The behaviour the claim says began at `afd7a5d5` was already at its maximum two weeks earlier.**
Invite-cohort conversion — of members the desk invited in week W, how many claimed via `/registro`
(i.e. walked past their invite to the signup door):

| invite week | invited | claimed via `/activar` | claimed via `/registro` | still unclaimed | **% invited-but-went-`/registro`** |
|---|---|---|---|---|---|
| 2026-08-10 | 21 | 13 | 5 | 3 | 24% |
| 2026-08-17 | 6 | 1 | 4 | 1 | **67%** |
| 2026-08-24 | 4 | 3 | 1 | 0 | 25% |
| 2026-08-31 | 7 | 1 | 3 | 3 | 43% |

**measured.** The maximum is the 08-17 cohort, thirteen days before `afd7a5d5`. There is no step at
the commit; there is scatter around a rate that has been non-zero since mid-August.

**Alternative explanations tested (Check 3):**

- *"The desk stopped sending invites."* **No.** Post-cut weeks carry 4 and 7 invites, at or above
  the 08-24 week's 4. Invite supply did not collapse. **measured.**
- *"A different acquisition path (e.g. an Instagram link straight to `/registro`)."* **Unmeasured —
  no referrer or UTM is recorded anywhere on this surface.** The nearest observable: of RED's
  claimed members, how many had **no** prior `invitacion_enviada_at`? By week: 2, 3, 5, 2 — 12 of 43
  lifetime, no post-cut step. Weak evidence against a new external funnel, not proof. **measured,
  but indirect.**
- *"Right-censoring inflates the effect"* — the post window is only 2.63 days and slow `/activar`
  conversions would be missing. **I checked and this argument is weak, so I am cutting it:** median
  invite→claim on the `/activar` rail is **1.0 h** (n=18, mean 12.3 h, max 92.1 h). A 2.6-day window
  captures the large majority. Honest weight: censoring accounts for at most ~1 additional
  `/activar` claim. **measured.**
- *"n is too small."* **Yes** — see §2. n=6 post-commit at the correct cut.

---

## 5. Refutation D — "every failure mode lives on the `/registro` rail" is false, and the top two ranked rows are the counter-examples

Check 5, over the 30 ranked rows. Counting rows whose mechanism *cannot* fire on the `/activar`
rail:

- **Row #1** (rank 1 — the Marce "NO SALIÓ EL CORREO" screen). Its own mechanism cell names the
  ungated doors as **`activar/actions.ts:87` → `sesion.ts:179-201`** and **`entrar/actions.ts:57`**
  (`solicitarReset`). `/registro` is one of the three doors that **is** gated
  (`registro/actions.ts:97`, `registro.ts:149,177`). The #1-ranked defect fires on `/activar` and
  `/entrar`, not `/registro`.
- **Row #2** (rank 2 — one tap binds someone else's membership). `activar/page.tsx:83-85`,
  `activar/actions.ts:137`, `reclamar_por_codigo.sql:54-68`. Purely the `/activar` invite rail.
- **Rows #5 and #15** are the two that look `/registro`-anchored (`reclamar_o_crear_cliente`). They
  are not: the only entry point is `intentarReclamoPorEmail` (`registro.ts:370-375`), whose callers
  are **`apps/client/src/app/auth/confirm/route.ts:95`** (any mailed confirmation *or* magic link —
  including the `/activar` `cuenta_existente` rail), **`apps/client/src/app/reservar/page.tsx:65`**
  and **`apps/client/src/app/saldo/page.tsx:41`** (every member page load with no membership yet,
  whatever door they came through), and `/codigo`. **measured** by grep at HEAD.
- **Row #22** explicitly says "all three account-creating doors".
- Rows #4, #6, #10, #11, #12, #14, #16, #17, #19, #20, #21, #23, #24, #25, #26, #27, #28, #29, #30
  are monitoring, desk-side, session-layer, infrastructure or process defects with no door in them
  at all. Row #6 (8 uninvitable RED members) has no rail — those members never reach either door.
  Rows #7, #8, #13 are mail-layer and hit `/activar`'s magic-link rail hardest.
- Row #9 is `/activar` only (the `activar-cuenta` edge function's dropped response).

**Count: 0 of 30 rows are exclusive to the `/registro` rail.** The clause is not a mis-emphasis; it
is false as written, and the two rows the document itself ranks highest are the clearest
counter-examples.

---

## 6. Check 4 — forge, never walked in round 1

| gym | `clientes` | invited | claimed | via `/registro` | `sin_email` |
|---|---|---|---|---|---|
| red | 66 | 39 | 43 | 25 (58%) | 15 |
| **forge** | **50** | **6** | **2** | **0 (0%)** | **44** |

**measured.** Two things follow.

1. **The only other real gym shows no inversion — it shows the opposite.** Both forge accounts
   (one pre-cut, one post-cut) came through `/activar`, 0% `/registro`, throughout. n=2, so this
   proves nothing on its own, but it is the only out-of-sample test available and it does not
   replicate the headline.
2. **Ranked row #6 is far larger than the document states.** It reports "8 paying RED members are
   structurally uninvitable". The same query on forge returns **44 of 50 members with no email** —
   the real operator (`owner-is-dev-not-operator`: forge is the only gym Aaron does not run) has
   **4% of its roster on the member app at all**. Whatever is happening at RED's doors, forge's
   members are not reaching them. This is a genuinely new number and it belongs in the deliverable.

---

## 7. Minor: the "17/17 → 1/8" shorthand is misread by its own readers

§0 item 5 spells the numbers out correctly ("17 via `/activar`, 17 via `/registro`"). But §2 and §10
compress it to **"antes 17/17, después 1/8"**, which parses naturally as *17 of 17* (100%) → *1 of 8*
(12.5%) rather than *17 vs 17* (50%) → *1 vs 8* (11%). The brief that commissioned this refutation
reproduces exactly that misreading ("went 17/17 before → 1/8 after"), which is the evidence that the
shorthand misleads. Write it as `17 vs 17 → 1 vs 8`, or as percentages.

Likewise **"~89%"** (ranked row #3's title) is an n=9 point estimate. Wilson 95% CI for 8/9 is
**[57%, 98%]**; at the corrected cut, 5/6 gives **[44%, 97%]**. **modelled — inputs 8/9 and 5/6.**
A title should not carry a two-significant-figure share with a ~50-point confidence interval.

---

## 8. Ruling

| sub-claim | ruling |
|---|---|
| `raw_user_meta_data ? 'full_name'` is a valid door discriminator | **held** — 52/52 agreement with an orthogonal proxy; stable since 2026-07-02 |
| RED's recent claims are dominated by `/registro` (83–89%, wide CI) | **held** |
| RED's lifetime mix is 25 `/registro` / 18 `/activar` | **held** |
| The mix inverted **at commit `afd7a5d5`** | **refuted** — cut 25.4 h early; 3 rows misallocated; p 0.038 → **0.186** at the true cut; change point is 2026-08-17 (p≈0.007); the named mechanism shipped at `2c040430`, 2026-07-08, untouched by `afd7a5d5` |
| "Every failure mode lives on the `/registro` rail" | **refuted** — 0 of 30 ranked rows are `/registro`-exclusive; ranks #1 and #2 are `/activar` |
| "Regression **and** exposure" | **half held** — exposure holds (27 claims in 2.5 weeks, measured); the *regression at this commit* is unsupported |
| The simplest sufficient explanation | **one-day invite backlog (21 invites, 2026-08-13) draining** — `/activar` fell 6× at 08-17 and has been flat since |

**Substitution test.** The incumbent explanation ("a commit inverted the doors") and the challenger
("a one-day seed wave left the numerator") both predict a falling `/activar` share. Only the
challenger predicts (a) the break at 08-17 rather than 08-30/31, (b) the flat `/activar` per-day rate
across the commit, and (c) invite volume tracking `/activar` completions 21→13, 6→1, 4→3, 7→1. All
three are observed. The incumbent additionally predicts a step at the commit; none is observed.

**Exit trigger for the challenger.** If RED's `/activar` per-day rate falls below **0.15/day**
(≈1 per week) sustained over 3 weeks *while* the desk keeps sending ≥4 invites/week, the backlog
explanation is dead and a rail defect is the live hypothesis. Re-run §4's per-day table 2026-09-23.

---

## 9. Corrected claim text for the deliverable

> **RED's members mostly enter through `/registro`, not through the invite link the desk sends —
> and that is not new.** Of RED's 43 claimed members, 25 (58%) minted their account at `/registro`;
> over the last three weeks the share runs 83–89% (n=6–9; 95% CI [44%, 98%] — small). The shift is
> real but it is **not** attributable to `afd7a5d5`: the doc's split cut at `2026-08-30 00:00Z`,
> 25 h 27 min before that commit existed (`2026-08-31 01:26:40Z`), putting three pre-commit
> `/registro` signups on the wrong side. At the commit's own timestamp the split is 17 vs 20 → 1 vs 5
> (Fisher one-sided **p = 0.19** — not significant). The actual change point is **2026-08-17**
> (12 vs 6 → 6 vs 19, p ≈ 0.007), and it coincides with the draining of a **one-day, 21-invite seed
> wave sent 2026-08-13**: `/activar` completions track invite supply (21→13, 6→1, 4→3, 7→1) and its
> per-day rate has been flat at 0.29–0.43 across the commit. The `/entrar` → "Crea tu cuenta" CTA the
> row blames shipped at `2c040430` on **2026-07-08**, 53 days earlier, and `afd7a5d5` does not touch
> it. **Correct the "every failure mode lives on the `/registro` rail" clause: it is false** — the
> two highest-ranked defects (#1, the 429 screen at `activar/actions.ts:87`; #2, the vincular
> mis-bind at `activar/actions.ts:137`) are on the `/activar` rail, and rows #5/#15 run through
> `intentarReclamoPorEmail`, called from `/auth/confirm`, `/reservar` and `/saldo` on every rail.
> **Keep the exposure half unchanged** — 27 new RED claims in 2.5 weeks multiplies a constant
> per-member failure rate. What is worth ranking instead: **forge, the only gym the owner does not
> run, has 44 of 50 members with no email on file and 2 accounts total** — its members never reach
> either door.

---

## 10. Blind spots

1. **The proxy measures where the identity was *minted*, not which door the member *tried first*.**
   A member who opened the invite, hit `email_no_coincide` or a 429, and then self-registered is
   counted `/registro`. So a rising `/registro` share is equally consistent with *"the CTA pulls
   people away"* and with *"the `/activar` rail broke and pushed them out."* My refutation kills the
   **attribution to `afd7a5d5`**; it does **not** establish that `/activar` is healthy. Settle it:
   `console.warn` a counter on `activar/actions.ts:73` (`email_no_coincide`) and at the
   `cuenta_existente` branch, count for 14 days. Nothing logs this today.
2. **`invitacion_enviada_at` is presumably overwritten on resend** (`preparar_invitacion` sets it),
   so the invite-cohort table in §4 may shift a resent member into a later week, inflating later
   cohorts. I did not read the migration to confirm. **unmeasured — read
   `supabase/migrations/*preparar_invitacion*` and check for `invitacion_enviada_at = now()` on the
   update path.**
3. **I did not confirm the Vercel client deploy time of `afd7a5d5`.** I used the commit timestamp and
   the `send-email` v8 deploy (02:14Z) as bounds; both give the same 17/20 → 1/5 split, so the
   conclusion is insensitive to it — and a deploy that lagged by a day would push the true cut later
   still, weakening the headline further. **unmeasured — Vercel dashboard, client project,
   deployment list.**
4. **n=6 post-commit.** Every conclusion about the post-commit period, including mine, is
   underpowered. To detect a 46%→17% share change at p<0.05 with 80% power needs roughly 35 post
   observations; at RED's ~2.3 claims/week that is **15 weeks**. The commit-level question is not
   answerable from this data and will not be for a quarter. **modelled — inputs: the two rates and
   a two-proportion power calculation.**
5. **`gre***@gmail.com`, the single post-cut `/activar` claim, is the owner's own 2026-09-02 walk**
   (attributed to RED-TEAM-03, not re-derived here). Among *members*, the post-cut `/activar` count
   is 0 — which makes the headline effect look **larger**, not smaller. I have deliberately not used
   it as a refutation point because it cuts against me. Recorded for honesty.
6. **forge's 44/50 `sin_email` is measured but its cause is not.** It may be batch attendance entry
   with no intent to invite (`class-booking-unused-in-prod`, *asserted*), not a defect.
