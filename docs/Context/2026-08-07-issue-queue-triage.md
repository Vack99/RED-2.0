# Issue queue triage — all 17 open issues, re-verified against the code (2026-08-07)

Every claim below was checked against the tree at `3f77967` (= `origin/main`) and, where noted,
against the live DB. Four opus agents did the verification; the issue bodies were **not** trusted.

**Headline: the queue is not 17 tasks. It is ~150 lines of code, 2 decisions, and 11 notes that
should never have been labelled work.**

---

## 1 — What is wrong with the issue corpus

The issues are **research artifacts, not work orders**. Each was written by the agent that *found*
the thing, at the moment of finding, carrying all of its evidence. Body size tracks the finder's
excitement, not the diff size: #250 spends 4,000 characters to justify an 80-line change; #234
spends 1,600 to say "a constant is a constant, no incident, low priority."

Three consequences, all confirmed by this pass:

1. **Four kinds of thing wear one label.** Specs (#222), rulings the owner must make (#251, #221,
   #168, #152), forecasts off a cost model (#247, #248, #240, #234), and real defects (#249, #250,
   #220, #150). Only the last kind is agent work. `ready-for-agent` currently sits on all four.
2. **The work lists inside them go stale, and get trusted anyway.** #250's own 5-item list is wrong
   in 5 places — two cited line numbers point at a prose comment and at a policy that must *stay*,
   and one table it calls "no TS reader" is read by #243's code. #248's prerequisite 1 was closed by
   #243 two days after filing. An agent that trusts the issue ships the wrong diff.
3. **4000-gym arithmetic filed against a 2-gym product.** #247's "83% redundant" is not redundancy —
   it is the fleet's only cron-side self-heal. Its real cost today is **7.8 ms per week against a
   120,000 ms statement timeout** (0.0065% of budget).

**The rule going forward: an issue must name who pays today.** If it cannot, it is a backlog note,
not a ticket.

---

## 2 — Verdicts

| verdict | issues |
|---|---|
| **DONE — close it** | **#222** — all 23 stories shipped, live-verified; the `ready-for-agent` label is stale |
| **Real cost today** | #249 · #250 · #220 · #150 · #151 part 1 · #231 *(not as filed — see below)* |
| **One-line slice worth taking, rest parked** | #240 · #149 |
| **Owner decision, no code possible** | #251 · #221 · #230 walk · #152 · #168 |
| **Forecast — backlog, do not build** | #247 · #248 · #234 · rest of #240 / #149 / #151 |

### Corrections that change what gets built

- **#222 is built.** All 23 stories verified in code on `origin/main` (`1c733ca` → `6eb2675`),
  migration `20260804090000` applied live. The single judgement call is story 22 (the "cap + y N más"
  ceiling), which was **designed away rather than built**: the tiles ship count-only with no member
  rows, so there is nothing to cap; AÚN A TIEMPO discloses the day-16 horizon instead
  (`inicio.tsx:458-462`). Judge that, then close.
- **#230's machine work is zero hours.** `/proto` was deleted in `f91e800` (21 files, 4.4k lines);
  the proxy auth bypass never existed (the audit finding was retracted); the perf gate passes —
  INICIO p50 **33.4 ms**, CLIENTES p50 **25.3 ms** (`tools/perf/results/018-230-ventana-closeout.json`).
  The #226 plantilla live sweep was re-run read-only during this pass: **0 rows**, discharged.
  What remains is the owner's ~45-minute walk + the 5-minute IMPI Marcanet lookup.
  Caveat: INICIO's p95 is 50.7 ms — it would fail a p95 gate by 0.7 ms. The gate is p50.
- **#231 as filed cannot happen.** The stale `ahora` only shows through `reservaAtribuible`, whose
  chip renders solely on the LIBRE tab, and both gyms have zero non-walk-in bookings. **The real bug
  on that axis:** `hoyIso` (`asistencia/page.tsx:23`) is also stamped at SSR and is the toggle's
  *write key* (`asistencia.tsx:307`) — a kiosk tab open past gym-local midnight **writes attendance
  to yesterday, silently**. Reachable at forge today. Retitle the issue around this.
  Trap: a naive `router.refresh()` makes midnight *worse* — `hoyIso` is a live prop but `selDate` is
  a `useState` initializer, so after midnight a refresh flips `esHoy` false and the desk silently
  becomes a read-only past-day screen mid-shift. The refresh must be paired with a
  "hoyIso changed → advance selDate" reconcile.
- **#220 is wider than its AC.** Two more unfiltered reads on the same axis:
  `agenda-miembro.ts:605-608` (`fetchProximasReservas`, no `gym_id`) and `agenda.ts:139-149` (the
  **staff** agenda reader, which does not even accept a `gymId`). Same one-line fix, same review.
- **#248 prerequisite 1 is DONE.** `HORIZONTE_SEMANAS = 26` landed in `6873ed9`
  (`packages/data/src/server/agenda.ts:286`), pinned by `agenda.test.ts:430,440`. The issue's
  citation of `agenda.ts:207` and "+1 year" is stale. The remaining half is a ~300-gym runway:
  986 ledger rows and 994 `class_session` rows live today, growing 4,472/yr per table.
- **#247's headline is wrong.** Re-claiming weeks 0–4 every Monday *is* the recovery mechanism for a
  gym whose per-gym subtransaction errored. The fix is not `for i in 5..5` — that breaks
  `class_horizon_autoroll.sql` vector (1) and leaves any seed-inserted gym with week 5 only. The
  version that works is a downward walk with early exit (`for i in reverse 5..0 … exit when c = 0`),
  ~8 LOC + a migration + a new denial vector. 3–4× the issue's claimed cost.
- **#250's finding is right, its work list is not.** Verified: all five policies survive
  (`20260802140000_anon_catalog_per_gym.sql:76,80,88,92,120`), `createAnonClient` has exactly one
  consumer (`marketing.ts`, reading 11 tables), and all five carry an `authenticated` `*_member_select`
  so the drop breaks nothing. But `catalog_rls_denial.sql` needs **6** line edits, not 2 (:94, :95,
  :96, :101, :102, :103); `scheduling_rls_denial.sql`'s two cited lines are **both wrong** (:113 is
  prose, :124 must stay — the real lines are :122, :123, :133, :134); and "the matching anon grants"
  is a no-op, because no migration ever issued per-table grants. Re-derive the list, don't trust it.

---

## 3 — The strategy: batch by GATE, not by theme

Writing the code is not the expensive part. The gates are. A migration costs a scratch
`pnpm test:denial` run plus a two-pass live apply; an edge function costs a deploy handshake; a UI
change costs an owner walk. **Group work by which gate it pays, and pay each gate once.**

### Step 1 — housekeeping (~10 min of `gh`, no code)

Deletes ~40% of the queue and stops the next agent building a forecast.

- Close **#222**.
- **#248**: strike prerequisite 1, drop to backlog.
- **#247**: rewrite the framing (the redundancy is the self-heal), backlog. Keep only item 3
  (alert on `gym_horizon_depth`) as the piece with present-day value.
- **#231**: retitle around the midnight rollover.
- **#251 / #221 / #168 / #152**: `hitl` only, remove any agent label.

### Step 2 — one branch, no migration, no walk (~150 LOC, one gate run)

Everything vitest can prove:

| issue | change | size |
|---|---|---|
| #220 | `.eq("gym_id", gymId)` on `fetchSesionesMiembro`, `clase-miembro`, **+ `fetchProximasReservas` + the staff agenda** | 4 lines + ~50 of test |
| #249 | lower-bound `ensureSemanaMaterializada` at the cron's guaranteed horizon (weeks 6–26 only) | ~4 LOC |
| #240 | `.order("nombre")` on `getRosterResumen` — kills the only *wrong-numbers* symptom | 1 line |
| #150 | parts 1+2: show the signed-in email, add "No soy yo — cerrar sesión" | ~16 LOC |
| #149 | item 1a only: `Referrer-Policy: no-referrer` via `next.config.ts` `headers()` | ~8 LOC |
| #151 | part 1's error taxonomy only: split `rate_limit_exceeded` / `daily_quota_exceeded` | ~10 LOC |
| #231 | the midnight `hoyIso` reconcile (+ refresh cadence) | ~16 LOC |

#249's off-by-one: the cron loop `0..5` claims week **index 5**, so the bound is
`lunesActual + 5*7`, not `+6*7`. Two existing vectors at `agenda.test.ts:398-446` need re-pointing —
the week-0 vector currently *asserts* the call fires.

#151: ship the taxonomy, **skip the retry**. The transport rides the sale critical path under a 10 s
abort, so any retry must stay bounded or a succeeded sale reads as a spinner.

### Step 3 — one migration branch, one scratch denial run: **#250 alone**

The only migration worth paying that gate for right now. ~80 LOC net across the migration,
`anon-read-allowlist.json`, `anon_catalog_read.sql`, `catalog_rls_denial.sql`,
`scheduling_rls_denial.sql`. Re-derive the edit list from the code; the issue's is wrong.
Worth doing while in there: flip the five read assertions to `n <> 0 → raise` denials rather than
deleting them, so the seeds stay load-bearing and the suite *proves* the drop.

### Step 4 — the owner's two decisions

- **The #230 walk** (10 items across INICIO + CLIENTES) + the IMPI Marcanet lookup or an explicit waiver.
- **One question that unblocks both #221 and #251:**
  > Is removing a member a **product feature** — an admin action that writes a durable marker — or an
  > **out-of-band DB operation** we harden by convention?

  Every candidate design for #221 (tombstone / invite-gated self-heal / ban row) requires the
  *remover* to write a second durable marker that today **nobody writes**: `gym_membership` carries
  no INSERT/UPDATE/DELETE policy at all, and there is no removal UI. #251's four sub-questions
  collapse into this one. Ship a guard without this answer and it never triggers.

  Given the current schema the smallest design is an explicit `gym_membership_ban` table + a 4-line
  `raise` before `20260713190000_reclamar_tenant_binding.sql:81` — a `removed_at` tombstone would
  drag `is_member_of` / `has_role` / `staff_gym` / `mi_membresia` (all keyed on row existence) **and**
  break #218's `after delete` trigger.

### Do not build

#247's sharding · #248's prune · #240's pagination program (33× under its own trigger) · #149's
`claim_code` TTL (5–8 h, needs an edge-function deploy and a two-pass live apply, and it fights the
RED live seed's pending-by-design invites) · #149's resend cooldown (GoTrue already enforces a
per-address interval and an hourly cap) · #151's bounce-webhook chain (8–11 h and a new public
unauthenticated endpoint, to protect ~60 members).

---

## 4 — The one conflict to remember

**#249 and #247 delete complementary halves of the same safety net.** Three heals exist today: the
cron re-claims weeks 0–5 weekly, the view-time call fires on any week in [0,26], and
`create_recurring_schedule` materializes 0..5 at create time. #247's *stated fallback is the
view-time call #249 removes*. Ship both naively and nothing heals weeks 0–4 at all — a gym whose
subtransaction errors once has a permanent hole, detectable only by `gym_horizon_depth`, which
nobody polls.

Since #247 goes to backlog, **#249 is safe alone** (the cron's `0..5` loop stays intact). If #247 is
ever revived, it must take the downward-walk form, and item 3's alert must land first.
