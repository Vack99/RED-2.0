# Agenda duplication — verdict & remediation record (2026-08-23)

**Ticket:** RED staff (Narda): every edit of a class duplicates it; creation issues suspected.
**Supersedes** the ranking in `2026-08-23-agenda-class-duplication-audit.md` (kept for its defect
inventory; its top-ranked mechanism was falsified by live data). Method: read-only live-DB
forensics first, then a 6-lane verification workflow (code + git history + live), then an
adversarial fable review before anything touched prod.

## The actual mechanism (live-verified)

1. **2026-08-04 18:07 local** — staff created a "Cardio HIIT Lun–Jue 07:15" recurring schedule
   (group `09bba216`) over slots where "Upper Body Lun 07:15" and "Abs Mié 07:15" templates were
   still active. Nothing refused it: the #244 guard did not exist yet (it shipped ~7h later,
   issue #244 was not even filed at create time), and even after #244 the guard's key
   `(gym_id, class_type_id, weekday, start_time)` deliberately let a *different class type*
   share a slot (multi-room rationale, `20260805110000:263-265`).
2. **Two active templates at one slot = a duplicate pair every week, forever.** Materialization
   idempotency was `(template_id, starts_at)` and the week ledger `(template_id, week_start)` —
   both per-template, so each template minted its own session. The cron re-minted a fresh pair at
   the horizon every Monday (verified 08-10, 08-17). 14 live pairs at cleanup time.
3. **"Editing duplicates it"** = perception, not an INSERT. No edit path inserts rows (verified:
   zero triggers on both tables, all three INSERT sites enumerated). Staff edited one twin →
   narrow edit detaches (`template_id = null`, ÚNICA badge) → the pre-existing twin became
   visible next to the edited card. Staff then hand-cancelled twins weekly (5 cleanup events
   08-13 → 08-22) while the cron kept minting new ones: whack-a-mole.
4. **The 07-27 past-week pairs** — staff browsed back one week 10 minutes after the create; the
   then-unclamped view-time materializer (`ensure_week_materialized`) backfilled an elapsed week.
   Closed by the 08-07 TS clamp + 08-08 SQL backward clamp; not reproducible today.
5. **Secondary generators confirmed:** blind one-off create (no collision check; produced the
   Fri 09:15 pair and both demo-gym pairs), state-based double-submit guard + missing `catch` in
   the agenda save path (create-only risk), direct PostgREST INSERT under staff RLS (latent).
6. **Member exposure at cleanup: zero.** All 6 reservations / 5 consumed credits sat on the
   surviving twins; every ghost row had 0 reservations, 0 asistencias.

Second friction behind "creation issues": staff cancel the Friday classes by hand every week —
the recurrence model has no skip/exception days (follow-up issue filed).

## What shipped (all on `main`, all live in prod as of 2026-08-23)

**Ruling encoded: ONE class per gym per instant** (reverses `20260805110000:263-265`; `room_id`
was never wired into any scheduling rule; relaxation path = add `room_id` to the keys).

- `20260823120000_agenda_slot_guards.sql` — applied live **before** the 08-24 cron:
  cross-type slot refusal in `create_recurring_schedule` + `update_recurring_schedule` (move
  only), occupied-instant refusal in `create_class_session` + `edit_class_session` (move only),
  refuse-whole when a series move would land on any occupied instant (detached one-offs
  included), materializer occupancy skip (oldest template = incumbent) + elapsed-instant skip.
  Deliberately tolerant of pre-existing pairs: guards fire only on *moves/creates*.
- **Live cleanup (same day, before the indexes):** retired the 2 ghost templates
  (`4bc7af2b` Cardio-Lun, `c1aab344` Cardio-Mié), cancelled 16 ghost sessions (14 red twins,
  1 forge-demo, 1 red-demo) — every one pre-verified 0 reservations / 0 asistencias / live
  sibling present. Fleet then verified: 0 session collisions, 0 template collisions.
- `20260823120100_agenda_slot_exclusivity_indexes.sql` — applied live after cleanup:
  `class_session_gym_starts_uq (gym_id, starts_at) WHERE cancelled_at IS NULL` +
  `schedule_template_slot_uq (gym_id, weekday, start_time) WHERE is_active`. The atomic backstop
  that closes every generator shape, including double-submit races and non-RPC writers.
- Admin agenda client (committed, **not yet deployed — rides the next consented push**):
  ref-based in-flight lock + `catch`/toast on `save()`/`cancelClass()`, series verbs gated on
  `plantilla` presence (retired-template cards no longer offer dead series scopes).
- Tests: `supabase/tests/agenda_slot_guards.sql` (9 vector groups, written-rows assertions),
  fixture fixes across 6 suites; **52/52 denial suites green on local docker** (twice, incl. a
  clean reset), vitest 1693 green. Coverage map + canon regenerated.

## Accepted trade-offs (do not "fix" without a new ruling)

- A one-off created at a slot before its series week materializes keeps that week (ledger claim
  taken, instant skipped): the hand-placed class wins, silently.
- No past-date guard on one-off creates: backdating is a supported admin workflow
  ([[gym-data-belongs-to-the-gym]]).
- `schedule_template_active_uq` kept alongside the wider index (expand-only; same-class refusal
  sentence keeps its own index).

## Residue for staff (RED)

Mar/Jue 07:15 remain generated by the surviving Cardio HIIT templates while staff re-type
instances to Lower Body weekly. One wide edit (scope: día, change class type, no time move) per
weekday fixes the series permanently — now safe under the new guards.
