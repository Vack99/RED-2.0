# Handoff — the #89-map wave (2026-08-03)

**First two commands of the next session: `/ponytail` then `/caveman`.** Owner's instruction.

## WORK HERE

```
.claude/worktrees/post-89-followups        branch: post-89-followups        off main @ 0a9fead
```

**Do not work in the primary checkout.** A second session works `main` there (#223–#230, the VENTANA
epic) and the two collided all evening. This worktree is yours; both `.env.local` files are already
copied in, so `pnpm dev` works from it.

Fast-forward it from `main` before you start (`git -C <worktree> merge --ff-only main`) — the other
session keeps moving `main`. Merge back the same way when the owner says so. **Never push.**

---

## 0. READ THIS BEFORE RE-ANALYSING ANYTHING — a wrong conclusion was published and corrected

An earlier pass in this session concluded **"forge is a pure open-gym, 99% ACCESO LIBRE, stop
worrying about the split."** **That is WRONG.** The owner corrected it: every gym is class-only.
Verified by a 4-agent investigation:

- forge runs a **21-slot template schedule** (L–V 06/07/18/19 + Sáb 08:00, cupo 15), 126 sessions
  materialised, **0 cancelled**, newest generated 09:03 on 2026-08-03. Every paquete is denominated
  in clases (1/8/12/Ilimitado). **There is no open-gym SKU.**
- The unlinked attendance had two causes, **neither operator error**: (1) the class-aware desk only
  shipped 2026-07-28 (`1058911`), so 267 of 342 rows predate the class tab existing; (2) forge
  **transcribes attendance in batches 1.5–2.5 h after class** (median inter-tap gap 5.2 s, 66 bursts
  over 44 days), and `sesionCercana` (`marcadas.ts:78`) preselects a class only within ±90 min, so a
  21:00 transcription of a 19:00 class falls back to LIBRE.
- The clock predicted the outcome on **6 of 6** operating days. On 2026-08-03 the batch landed 10 min
  from a class start and **all 17 rows came out class-linked — forge's first ever.**
- **#136 is real but secondary**: it explains 24 historical rows and moves **0** of the 45 post-ship
  misfiles.

**Do NOT "fix" this by widening the ±90 preselect.** That was recommended and then retracted: it
would silently mis-attribute genuine late walk-ins to a class, and it solves a problem the unmerged
`worktree-reserva-manual-agenda` branch already removes — see §0.1.

### 0.1 There is unmerged work that already rules on things you may be tempted to re-ask

Branch **`worktree-reserva-manual-agenda`** (8 commits, worktree mounted, NOT merged). It holds
`#235`–`#238` and already decides two questions raised today:

- **Zero balance blocks a booking.**
  `supabase/migrations/20260803140000_reserva_manual_staff_target.sql:154-157` —
  `if v_clases is not null and v_clases <= 0 then raise exception 'Sin clases disponibles'`, with a
  second guarded raise at `:207`. **Ilimitado is exempt by decision.** `reservar_clase` is now
  staff-callable, so a staff-made booking obeys the same rule.
- **The Agenda class sheet is the class-first surface.** "Agregar visita" fires the same pasar-lista
  check-in, and `antesDeVentanaArribo(startsAt, ahora, previaMin = VENTANA_ARRIBO_PREVIA_MIN)` routes
  a tap to *book* before the window opens and *check in* after. The commit body explicitly assigns
  the clock to **#231** and the per-gym lead to **#234** — both filed today.

**Still NOT covered by that branch:** `toggle_pase` / `pasar_lista_sesion` (the desk tap) have no
zero-balance check at all — verified against live `pg_get_functiondef`. Their only refusal is
`Paquete vencido` (`20260729120000:270` / `:552`), and `v_consumio := (v_clases > 0)` (`:272` / `:563`)
just writes a free row. **So the app says no and the desk says yes.** That gap is real and unruled.

### 0.2 Owner ruling taken 2026-08-03 — class over cupo

Today's forge 19:00 recorded **17 attendances against a cupo of 15**; `pasar_lista_sesion` has no
capacity check. **Ruling: let staff exceed capacity, and fix the READER instead** — stop staff marks
from driving the member-facing state to LLENO, so RED members are never locked out of booking by a
roster correction. A desk that refuses a member physically standing in the gym is worse than an
over-count.

---

## 1. What landed — 5 commits on local `main`, UNPUSHED

```
0125365  fix(reservar): perfil name from clientes row, not auth metadata (#177)
bdbb630  fix(db): attendance-retention CASCADE -- deletes now RESTRICT (epic #203 slice 4)
cfc66ad  fix(membresia): booked class visits now count toward the plan card gauge (#173)
0bd81ae  fix(ficha): name the class on every visit in the 30-day historial (#178)
9b4c151  fix(admin): RESERVA chip renders only inside the arrival window (#179)
```

Every one passed the pre-commit gate (`lint && typecheck && test`). Latest counts seen: 1196 tests /
87 files, 0 dependency-cruiser violations.

**No issue is closed.** Nothing is pushed, so GitHub has not seen these commits. #173/#177/#178/#179
are still OPEN and must be closed by hand or by the push.

---

## 1.5 The gate DID run — results, and three defects still unfixed

**`test:denial`: 41/41 green on scratch `gyyujeguycxxoaqgdnjp`** (up from a 40 baseline; the new
`class_session_delete_restrict.sql` suite is wired into `run-denial-suite.mjs:84`). Verified as real
DDL, not a bare stamp — all three FKs read `confdeltype = 'r'`.

**Filed:** #231 (desk has no clock) · #232 (tap discloses nothing, `hitl`) · #233 (charge-at-booking,
`hitl`, supersedes #167 / absorbs #166) · #234 (90-min lead hard-coded). Lineage comments on #166/#167.
Ruling recorded on #179.

**An adversarial SQL review found 4 defects in the two SQL commits. The scariest was CLEAN:** the
`mi_membresia` re-emit **did** preserve #219's `p_gym_id` tenant pin — verified line by line, not
reverted. Still open:

| id | defect | fix |
|---|---|---|
| **D1** | `#173`'s new rule counts VISITS but `clasesDenom = clasesRest + attendedSincePurchase` (`derive.ts:234`) is a CHARGE ledger. A member at 0 balance with valid `vence` taps through free (`consumio=false, perdonada=false`) and now counts → card reads **"13 de 13"** on a 12-class package. | **Gated on the desk zero-balance gap in §0.1.** If the desk starts refusing or confirming a 0-balance tap, there is no uncharged visit left to over-count and D1 dissolves. Decide that first. |
| **D2** | `FichaAsistRow` (`derive.ts:279-283`) never gained `perdonada`; the doc comment at `:267-270` says the rows are filtered on it. Typechecks only because the raw PostgREST row is a structural superset. A future narrowing silently makes every pardoned row count again. | one line: add `perdonada: boolean;` |
| **D3** | CASCADE→RESTRICT made an FK probe hot on `asistencias.class_session_id`, which is covered only by a **partial** index (`20260728120000:67-69`). That migration's own header says a partial index cannot serve a referential probe, and dismissed it because sessions "are never hard-deleted" — which this change disproves. Every `class_session` delete now seq-scans a table planned for 1–2 years of retention. | one line: `create index if not exists asistencias_class_session_id_idx on public.asistencias (class_session_id);` |
| D4 | `RESTRICT` chosen where `NO ACTION` is strictly better (RESTRICT disables the deferred end-of-statement check). Low, latent. | leave unless it bites |

Also noted, not filed: **#178 labels a probable class visit "ACCESO LIBRE"** (`cliente-detalle.tsx:454`,
`{row.clase ?? "ACCESO LIBRE"}`). At forge 189 of 206 rows in the 30-day window render that literal
and — per §0 — every one was a class. One-line copy amendment: render `—` for rows whose `origen IS
NULL` (exactly what `export/rows.ts:122-127` already does). Needs `origen` on `FichaAsistencia`;
bundle it with D2. **Not a push blocker.**

---

## 2. Other unfinished jobs

The owner stopped the session for usage. These were its remaining tasks, in priority order.

### 2.1 Verify the tree independently. Agent reports are not evidence.

`git log --oneline -8`, `git diff --stat f505e6d..HEAD`, and confirm each commit contains what its
message claims. Two of the five were written by agents whose reports were never cross-checked
(#173 and CASCADE).

### 2.2 Run `test:denial` — two migrations landed and have never met the gate

`cfc66ad` (mi_membresia re-emit) and `bdbb630` (three FK constraints → RESTRICT) both ship SQL.
Per AGENTS.md the pre-merge obligation is a green suite on scratch.

```bash
# apply + stamp the two new migrations on scratch first (Management API database/query, node+fetch — no jq on this box)
SUPABASE_TARGET_REF=gyyujeguycxxoaqgdnjp SUPABASE_ACCESS_TOKEN=<docs/db-testing-throwaway-project/data> pnpm test:denial
```

**Baseline measured this session: `DENIAL SUITE: all 40 files green`, QUARANTINE empty.** Scratch was
already fully current at 96 migrations — the old handoff's "6 behind" claim was stale. The runner
refuses the live ref (`run-denial-suite.mjs:147-150`).

### 2.3 File four deferred findings as issues

1. **The desk has no clock.** `apps/admin/.../asistencia/page.tsx:54` stamps `ahora` once at SSR;
   no `setInterval` or `router.refresh` anywhere under `/asistencia`. A tab open across an
   arrival-window boundary shows a stale chip — re-creating #179 on a long-lived tab even after the
   predicate fix. Fix: a post-hydration per-minute tick. Only matters once a tenant has bookings.
2. **The tap never discloses what it charged.** Success toast
   (`_components/asistencia.tsx:325-334`) shows only `NOMBRE · HH:MM`; the sole signal a class was
   spent is the balance sub-line repainting. Surfacing free/charged/pardoned needs a
   `TogglePaseOutcome` shape change ⇒ DROP+CREATE on both toggle RPCs ⇒ a `test:denial` run. `hitl`.
3. **Charge-at-booking vs settle-at-check-in.** `hitl`. The structural root — see §4.
   **Supersedes #167, absorbs #166.**
4. **`ventana_arribo`'s 90-min lead is hard-coded** where every sourced vendor makes it
   operator-configurable. Low priority; file so it is not rediscovered.

### 2.4 Comment the #179 ruling onto the issue

So it is never relitigated. Evidence is in §4 and `docs/Context/2026-08-03-gym-checkin-prior-art.md`.

---

## 3. The owner's HITL queue

He asked for these; they are the only things requiring a human.

**#177 — perfil name.** `pnpm --filter @gym/client dev` → `http://localhost:3000/reservar?gym=red-demo`.
**Do NOT test with his own account** — `supabase/seeds/red-demo/sql/08_config.sql:56` bakes
`full_name = 'Aarón Talavera'` into it, so it passes before *and* after. Use
`aarontalavera.271099@gmail.com` (cliente `testing magic link2`). Expect the cliente-row name, not
the email; avatar `TL`, not `A`.

**#178 — ficha labels.** Admin `/clientes/{id}` for a red-demo member with two class visits on one
day (Karla Domínguez). Expect **two separate rows**, each naming its own class — `METCON 19:45` —
with the arrival stamp in its own column. Not one joined line.

**#179 — chip silence.** Admin `/asistencia`, ACCESO LIBRE tab, a member whose booking is >90 min
out. Expect **no gold chip**.

**Push.** His ruling: `test:denial` 40/40 green → **full `/code-review` on the whole diff** → then he
decides. A push deploys both apps to Vercel production. **Never push without his consent for that
specific push.**

---

## 4. The rulings taken this session — do not relitigate

| # | ruling | basis |
|---|---|---|
| **#179** | **SILENCE** — the chip renders only inside the arrival window. No grey variant, no second state. | 3-leg research fan-out + live measurement. 9 platforms sourced; **none** marks "has a booking later" on a class-less roster. The steelman for always-on lost on its own evidence: the desk has no clock, so an always-on chip on a stale tab re-creates #179 verbatim. |
| **#178** | `mié 29 · METCON 19:45 · 23:11` — class name **and** class hour in the label, arrival stamp in its own column, `ACCESO LIBRE` for walk-ins. **One row per visit** (two same-day classes = two rows, never joined). Whole 30-day window. No migration — nested embed inside the existing `Promise.all`. | owner, 2026-08-03 |
| **#173** | Fix **both** surfaces in one slice — `mi_membresia` and the admin ficha count at `clientes.ts:348-385`. Shipping half means operator and member see different "clases usadas" for the same client. | owner, 2026-08-03 |
| **CASCADE** | `ON DELETE RESTRICT` on all three FKs. `SET NULL` rejected — the origen/coherence CHECK from `20260728120000` would ERROR on newer rows and silently null older ones. | defaulted, owner informed |
| **#177** | Ship the blank-name edge as-is. A member with no cliente row in the resolved gym renders blank, matching the function's own no-data convention. No "Socio" placeholder. | defaulted |

### The finding that outranks all of them

**`reservar_clase` charges the class at BOOKING with no settlement at check-in**
(`supabase/migrations/20260710123000_reservation_consume_flag.sql`). Sourced comparison: PushPress
*holds* the credit and returns it on check-in; Wodify counts the sign-in; Mindbody deducts only on
late-cancel. **Fitco charges at booking like us — and needed a whole no-show-debt subsystem to
survive it.**

Everything downstream traces here: the chip only had to promise anything *because the money already
moved*; the pre-window double-charge exists because a second visit cannot settle against a spent
credit; the closed-window "pardon" is a hand-rolled apology for the same thing.

Deferred deliberately — it is a ledger migration **plus** a published-Terms change ("la clase se
descuenta"), and it has cost $0 (see below). Full sourcing with URLs:
`docs/Context/2026-08-03-gym-checkin-prior-art.md` (written, **uncommitted**).

---

## 5. The measurement that should drive priority

Measured against LIVE, read-only, 2026-08-03. **Do not re-run this.**

| gym | asistencias | class-linked | reservations ever |
|---|---|---|---|
| **forge** (only real operator) | 325 | **0** | **3 — all walk-in, all cancelled** |
| **red** (real) | 0 | 0 | **0** |
| red-demo | 351 | 334 | 444 |

**forge is a pure open-gym** and has never used the booking subsystem. Every "occurrence" of these
defects in the data is red-demo seed from 2026-07-14 — 15 days *before* the code that could produce
them shipped.

**So #179/#178/#173 are not repairs of observed damage. They are pre-launch fixes for RED**, whose
28 real members were just seeded and whose whole model is class booking. Forge will never hit them;
RED hits all three on day one. Read "0 occurrences" as "fires on RED's day one", not "low priority".

**Armed, not disarmed:** against forge's 226 real timed taps on class days, 8.4% would land
pre-window (→ double charge). Breaking point ≈ 12 booked-and-tapped visits/month for the first peso;
~$710 MXN/mo at full adoption.

**What is measurably fine — stop re-auditing it:** 340/340 class-linked rows carry their
`reservation_id`. Zero orphans, zero mislinks.

---

## 6. Everything still open in this scope

| # | title | disposition |
|---|---|---|
| 166 | late marking charges wrong package | **absorbed** by the charge-at-booking issue |
| 167 | entitlement ledger | **superseded** by the same |
| 168 | same-context repeat visits | parked — no operator has asked |
| 171 | no-show consequences | `hitl` — one session has ever hit capacity |
| 172 | cancelled session strands credits | `hitl` — zero cancelled sessions with bookings have ever existed |
| 173 · 177 · 178 · 179 | | **fixed locally, still OPEN on GitHub** |

Beyond this scope and untouched: #149, #150, #151, #152, #136, and the VENTANA epic (#222–#230,
being worked by the other session).

---

## 7. Repo state and traps

- `main` is **~20 commits ahead of `origin/main`**, unpushed. Includes epic #203, the #215 suites, the
  other session's VENTANA work, and this wave.
- Uncommitted: `CLAUDE.md`, `docs/superpowers/plans/2026-07-20-red-gym-live-seed.md`, and a pile of
  untracked `docs/Context/` files including this session's
  `2026-08-03-gym-checkin-prior-art.md` — **commit that one, it is the research deliverable**.
- Worktrees: several `agent-*` registered by the other session, plus `issue-177-perfil-nombre`
  (@ `a55f44e`) which is now **redundant** — #177 was cherry-picked to main as `0125365`. Its
  worktree and branch can be swept once verified.
- **`--ff-only` does not work for old branches.** `main` has diverged far past them; cherry-pick.
- **Supabase MCP is bound to LIVE** (`hjppxawglmukfvsgmcog`). Never `apply_migration`,
  `supabase link`, or `db push`. Scratch is `gyyujeguycxxoaqgdnjp`, reached via the Management API.
- Two sessions sharing one checkout caused real problems. **Resolve where you are working first.**
