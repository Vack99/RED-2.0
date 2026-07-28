# Handoff — #89 grill kickoff (attendance ledger: two same-day classes + two consume edges)

Written 2026-07-27, in the worktree, by the session that recovered from the power outage.
The outage killed a session that had *only* created the worktree — no code, no commits, nothing lost.
This handoff replaces the 2026-07-10 kickoff (`2026-07-10-issue-89-kickoff.md`), whose mechanics table
was 17 days old. **Everything below was re-verified against the tree on 2026-07-27.**

## Where you are

- **Worktree** `C:/Users/Aaron/Documents/Repos/RED-2.0/.claude/worktrees/issue-89-attendance-ledger`
- **Branch** `worktree-issue-89-attendance-ledger`, based at `c43111f` — byte-identical to `main`/`origin/main`
- Dependencies installed (`pnpm install` completed); the stale worktree lock has been cleared
- Nothing is in flight. `git diff main` is empty apart from this handoff.

## Start here

1. **Invoke the `grilling` skill.** #89 is an owner-semantics decision first, implementation second.
2. **Do not write a line of SQL until the ledger question is ruled.** The edges below are the test cases
   for the ruling, not a to-do list. Patching them piecemeal is explicitly the wrong move (the issue says so).

---

## TL;DR — what #89 actually is

Owner direction (2026-07-10, during the #82.1 ruling): *"later we have to ship a way for the user to be
able to mark a member present in two different classes."* Today's guards get in the way — the second mark
is either consume-free or refused, depending on which surface does it.

The question to settle: **what does attending two different classes on the same day consume?**

And the reason it is not a one-line fix: **the invariant everyone believes is in place is not the one that
is implemented.** See the next section — it is the single most useful thing in this document.

---

## Ground truth, re-verified 2026-07-27

### The RPC bodies have NOT moved since 2026-07-10

No migration after `20260710132000` redefines `toggle_pase`, `pasar_lista_sesion`, `reservar_clase`, or
`cancelar_reserva`. The 16 migrations that landed since (`20260711100000` → `20260722120000`: personalizado
sale, respaldo indexes, tenant binding, the perf wave, backdate, mi_membresia re-anchor, activation firma)
touch adjacent things — RLS predicates, read-path RPCs, indexes — but none re-emit these four bodies.
**The Jul-10 mechanics table is still accurate.** Latest definition per function:

| function | defined by | surface |
|---|---|---|
| `toggle_pase` | `20260710124000_toggle_pase_unify_surfaces.sql` | front desk (owns only `class_session_id IS NULL` rows) |
| `pasar_lista_sesion` | `20260710132000_pasar_lista_front_desk_no_reconsume.sql` | Agenda roster |
| `reservar_clase` | `20260710123000_reservation_consume_flag.sql` | client app booking |
| `cancelar_reserva` | `20260710123000_reservation_consume_flag.sql` | client app cancel |

The data/UI layer around them *did* move (`fd0599c` gym_id scoping, `fa975b5`/`59e73b9` perf wave,
`96eb785` loading skeletons, `a198ad9` vencido boundary). None change consume semantics, but re-read
`packages/data/src/server/asistencia.ts` and `agenda.ts` before touching the call sites.

### What actually consumes a class today (verified from the bodies)

| scenario, same day | consumes | why |
|---|---|---|
| Front desk → Agenda class | **1** | `20260710132000` walk-in branch: same-day FD row exists → `v_consumio := false` |
| Agenda class → front desk | **1** (refused) | `20260710124000` addition (1): mistap guard raises `'Asistencia de clase ya registrada'` |
| Booked class (app) → Agenda mark | **1** | consumed at `reservar_clase`; the booked branch marks `consumio=false` |
| **Agenda class 1 → Agenda class 2 (both walk-in)** | **2** | the `exists` check at `20260710132000:118-124` filters `class_session_id is null` — i.e. **front-desk rows only**. A second session-linked mark sees no FD row and consumes again. |
| **Book class 1 → book class 2 (app)** | **2** | `reservar_clase` has **no same-day guard at all** — only `'Ya reservaste esta clase'` (same-session dupe) |

**So C15's "one visit = one consume" spans FD↔Agenda only.** It is a cross-*surface* collision guard, not a
per-day cap. Two classes on the same day already cost two classes through the two paths a real member
actually uses (the app, and the Agenda roster) — while the front desk, which is unused in practice, is the
only place the one-per-day rule bites.

That inconsistency is the heart of the grill: the system is not currently enforcing "a day is a visit". It is
enforcing "don't double-charge when two admin surfaces see the same visit". Those are different rules, and
#89 has to pick one.

---

## The decision space (put these to the owner)

**1. Two classes = two consumes** — each class attendance decrements.
Closest to what the member-facing paths already do (booking two classes already charges two). Makes the
ledger "one class attended = one class spent", which is the simplest thing to explain to a member.
Blast radius: the `20260710132000` FD guard must key on *purpose* rather than existence, and C15's
cross-surface guards get rethought as per-class accounting rather than per-visit protection.

**2. Two classes = one consume** — a day is a visit; extra classes are free.
Requires *adding* a guard that does not exist today: the second Agenda mark must write `consumio=false`,
and `reservar_clase` needs a same-day check it has never had. Note this makes the client app's booking
flow refund-aware in a new way (book 2 classes, get charged once — what does the balance show at booking
time?). Biggest surprise surface for members.

**3. Keep one-per-day, but unblock the UX** — mark present in class 2 with `consumio=false`, mirroring the
existing pattern. Smallest change. Decide explicitly whether this is the end state or a stopgap; if it is a
stopgap, it is really option 2 arriving without the `reservar_clase` half, which leaves the app and the
Agenda disagreeing.

Whatever is ruled must also settle the two accepted edges below — they are facets of the same ledger.

### Edge A — FD-untoggle-after-Agenda → net-zero-consume attended class

FD check-in (consumes) → Agenda mark (`consumio=false` per the C15 mirror) → untoggle the FD row (refunds).
The member stands marked present with nothing consumed; an FD re-tap is refused by the `20260710124000`
mistap guard. Operator-repairable (untoggle + retoggle the Agenda mark). Unreachable in practice while the
front desk is unused.

### Edge B — the `20260710132000` guard keys on FD-row *existence*, not `consumio`

A `consumio=false` FD row (zero balance at check-in) + a same-day purchase + an Agenda mark → the class is
marked free although nothing was ever consumed for that visit. An `and consumio` filter on the `exists` at
`20260710132000:118-124` closes it **if** the ruling wants that. Under option 1 the guard may disappear
entirely, which is why this is not a standalone patch.

---

## Grill agenda — the questions that actually need Aaron

1. **What is the unit of entitlement — a class, or a day?** "10 clases" sold: does that mean 10 attendances
   or 10 days of access? Everything else follows from this.
2. **Does the answer differ for Ilimitado?** (Ilimitado is `clases_restantes IS NULL` and is exempt from
   every decrement today, so it is unaffected mechanically — but the *policy* answer may differ.)
3. **Which surface is the source of truth going forward?** The front desk is unused in practice. If it stays
   unused, is the C15 cross-surface machinery worth keeping, or is it complexity guarding a dead path?
4. **What should the member see when booking a second class the same day?** Charged again, free, or blocked?
   This is the only part of the ruling with a client-app surface.
5. **Is "two classes" a real operational need, or the doble-turno case?** (Someone doing two disciplines in a
   day vs. an operator fixing a mismarked roster.) The answer changes whether this is an entitlement change
   or a correction affordance.
6. **Retroactivity:** does the ruling apply to already-written `asistencias` rows, or from the migration
   forward only? (No backfill has been scoped.)

---

## Implementation constraints, once ruled

- **AGENTS.md rule:** a migration that changes what an RPC *writes* ships in the same change with a suite
  assertion on the **written rows** — `consumio`, `clases_restantes`, `reservation.status`, `gym_id` — not on
  the return value. #78 and #80 were exactly this failure.
- **Suites to extend (do not rewrite):** `pasar_lista_sesion_rules.sql` (324 lines; vector 5 is the
  FD-then-Agenda no-reconsume written-row vector), `toggle_pase_rules.sql` (229),
  `toggle_pase_gym2_timezone.sql`, `reservar_clase_rules.sql` (277), `cancelar_reserva_rules.sql` (252),
  `roster_clase_rules.sql` (127). All six are live in `SUITE` in `supabase/tests/run-denial-suite.mjs`;
  `QUARANTINE` is empty and must stay that way.
- **The `test:denial` gate:** any migration-bearing change runs `pnpm test:denial` green against a **scratch**
  project before it fast-forwards to `main`. The runner refuses the live ref. Scratch project
  `gyyujeguycxxoaqgdnjp` is kept as the test bed (credentials in the gitignored
  `docs/db-testing-throwaway-project`); it was 1 migration behind as of the perf run — re-check before relying
  on it.
- **The Supabase MCP is bound to LIVE** (`hjppxawglmukfvsgmcog`). `apply_migration` hits production. Never
  `supabase link` to prod or `db push` — prod's `schema_migrations` does not recognise 56 of the migration
  filenames and a push would re-apply them, seeds included.
- **Live data now exists.** 19 real RED members were seeded on 2026-07-24 with real ventas (folios 1001–1019).
  A ledger migration is no longer operating on an empty gym — consider what it does to rows already written.

## Reference index

- Issue: `gh issue view 89` (open, unlabelled — the only non-`hitl`/non-`ready-for-agent` item on the board)
- Prior kickoff (superseded by this one, kept for the decision history): `docs/superpowers/handoffs/2026-07-10-issue-89-kickoff.md`
- Owner ruling context: `docs/superpowers/plans/2026-07-10-81-82-fastfollows.md` (Task 6)
- Migration headers are the real design docs — `20260710124000` and `20260710132000` both open with the
  full C15/C9 rationale. Read them before proposing any change to either body.
