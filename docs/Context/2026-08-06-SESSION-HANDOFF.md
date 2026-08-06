# Handoff — #243 built, 7 defects open (2026-08-06, supersedes 2026-08-05-SESSION-HANDOFF.md)

**Session setup: invoke `/ponytail` and `/caveman` first.**

Work lives on branch `worktree-reserva-manual-agenda` @ `d77e05a`. **Nothing pushed. Nothing applied
to live.** `origin/main` is untouched at `5f69d84`.

---

## The scope correction that reframes this issue

The owner tested manual booking mid-session and found it already working — admin books a member, the
class is held off their balance, cancel refunds it. **That is #235–#238 + the settlement epic,
shipped 2026-08-04/05.** Nothing is missing there.

#243 is a different object:

- a **booking** attaches a member to one dated class — works;
- a **`schedule_template`** is the repeating rule ("Yoga · Martes · 19:00") that the Monday cron uses
  to stamp out dated classes six weeks out — **no screen in the product touches it.**

The whole real gap is one sentence: **you cannot stop a repeating class.** `is_active` exists on the
row, both materializers filter on it (`20260805100000:71`), `schedule_template_active_uq` is already
partial on it (`20260805110000:275-277`) — and no button reaches it. Live proof: red 24 active
templates, forge 21, **zero inactive across both real gyms.** Nobody has ever retired one because it
is unsayable. (forge-demo's 9 inactive came from a seed migration, not an operator.)

**Open decision, not yet made.** Retire alone is one migration, one wrapper, one button — and
"move Tuesday 19:00 to 20:00" is then retire + create-new, which #244's partial index was designed to
permit. The move fan-out is where 6 of the 7 defects below live. The owner said he wants **retire
going** but explicitly did *not* authorize deleting the move. **Decide before building: does the move
ship, or does it get cut?** Everything else follows from that.

---

## The 7 defects — all open, none fixed

Found by two adversarial opus reviews after every mechanical gate went green. **The green suite
cannot see any of them.** Column 3 is what makes the decision above load-bearing.

| # | Defect | Dies if the move is cut? |
|---|---|---|
| 1 | `update_recurring_schedule` takes **no advisory lock** (`20260806100000:84-167`). A cron pass or agenda page read in flight during a move commits a class at the **old** time into a week that then counts as claimed. Reproduced on scratch end to end: stray 19:00 class forever, member booked it, no self-heal. Fix must be the **first** statement — taken after the template UPDATE it inverts lock order vs retire and deadlocks. | yes |
| 2 | Raw **`23505`** when two attached sessions share an ISO week (`20260806100000:144-152` vs `class_session_template_starts_uq`). No series edit ever succeeds on that template again until someone hand-detaches. Reachable because `edit_class_session` preserved `template_id` until this change. | yes |
| 3 | **No backfill.** Existing hand-moved sessions still carry `template_id`, so the first series edit drags them back — the exact case `20260806090000`'s header claims to prevent. | yes |
| 4 | A class detached by the past-instant guard **survives "Terminar el horario"** and keeps taking bookings, while the confirm says every future class is cancelled. Probe: `cancelled=1`, detached row left `cancelled_at=NULL`, live. | yes |
| 5 | `update_recurring_schedule` **accepts a retired template** and reports success (`:110-112`, no `and is_active`). Stale second tab writes into a dead rule, renders "0 clases futuras movidas" as success. | yes |
| 6 | **Scale, and it lowers the 4000-gym ceiling.** Slice 1's `pg_advisory_xact_lock_shared` is held **once per gym for the entire fleet pass** (`cron_materialize_horizon` is one transaction over every gym). Scratch: `max_locks_per_transaction=64` × `max_connections=60` ≈ **3,840 total slots**, shared with every relation and tuple lock. Binds at **~3,800 gyms — before the statement timeout does.** Also: during the pass any retire waits for the whole fleet, and once that exclusive waiter queues, every agenda page load for that gym queues behind it. | **no — needs a ruling either way** |
| 7 | A **coach change under wide scope reaches zero visible classes.** The RPC replaces `schedule_template_coach`; the agenda reads `class_session_coach` (`agenda.ts:131`), written only by materialization and `edit_class_session`. Toast says "6 clases futuras movidas"; all 6 cards still show the old coach. The Coaches multi-select is **not** hidden under wide scope, unlike "Evento especial", which this same slice hid for exactly this reason. | yes |

**Lower severity, also open:** "Solo esta clase" now silently detaches a class from its series with
unchanged copy (`Clase actualizada · Visible en la app`) — the only trace is the new `Única` badge ·
the cupo-shrink warning reads the **clicked** session's bookings while wide scope writes cupo to all
of them · the detach count is never returned, so spec §4's "named in the receipt" is unmet · the
caption says "Las pasadas no se tocan" on a past class, which the sheet freely opens · past +26 weeks
the agenda renders "Sin clases este día", inviting a duplicate create · the destructive button is
never disabled while in-flight · `fail()` titles every destructive failure "No se pudo guardar".

**Owner ruling already given on #6:** *no lock.* The unprotected race needs a page read for an
unmaterialized week inside the same instant as a retire, same gym; worst case is one stray class,
visible on the calendar and cancellable with the single-class button that already ships. If that
ruling stands, delete the lock and document the accepted race in the migration header with its
trigger (an actual report of a stray class). **Not yet implemented.**

---

## What is in the tree

Three migrations (**not applied to live**; all three ARE on scratch `gyyujeguycxxoaqgdnjp`):
`20260806090000_series_edit_prework.sql` (advisory lock + `edit_class_session` nulls `template_id`) ·
`20260806100000_update_recurring_schedule.sql` (+ the RLS DELETE policy on `schedule_template_coach`) ·
`20260806100100_retire_recurring_schedule.sql`.

App: `templateId` through `SesionRaw`/`SesionAgendaDTO`/`toDTO`/`CardVM` · `actualizarHorarioRecurrente`
+ `retirarHorarioRecurrente` + both actions · browse clamp `+1 year` → `+26 weeks` · scope toggle in
`editor-sheet.tsx` · `Única` badge on `session-card.tsx` · hand-written `database.types.ts` entries
(codegen was not run — verified argument-for-argument against the shipped signatures, no PGRST202 risk).

Gates at `d77e05a`: `lint` · `typecheck` · `test` 1348/1348. `test:denial` was **45/45 on scratch
before the incident below** and has not been re-run since.

`update_recurring_schedule`'s shipped parameter order puts `p_weekday` and `p_coach_ids` at the
**tail** — Postgres requires defaulted params last, so the spec's ordering is illegal. Invisible to
the app (PostgREST invokes by name).

---

## Incident: an agent deleted work after being rejected

A subagent was dispatched with instructions to reduce #243 to retire-only. **The owner rejected the
dispatch, but it had already executed** — deleting `20260806090000` and `20260806100000`, halving
`recurring_series_edit.sql`, and stripping the `update_recurring_schedule` vectors from
`scheduling_rls_denial.sql`. The files were untracked, so git had no copy.

Recovered at `d77e05a` by replaying the build agent's `Write`/`Edit` sequence out of its session
transcript (`~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl`, tool_use blocks). The
retire migration verified **byte-identical** to its replay, which is what validates the method.
`rpc-write-coverage.test.ts` caught the one registration that was reconstructed wrong.

**Verify before trusting:** one Edit to `scheduling_materialization.sql` did not re-apply during the
replay (NOMATCH). Re-run `pnpm test:denial` on scratch and check vector 5 (the moved-session
non-resurrection vector) explicitly.

**Lessons, both cheap to obey:** untracked work is one rejected tool call from gone — commit on the
branch before dispatching any agent that touches existing files. And a rejected dispatch is not
necessarily an unexecuted one; check the tree after a kill.

---

## Also filed this session (measured, not speculative)

The cost model ran real `EXPLAIN ANALYZE` against live. Three risks in the scheduling spine,
independent of #243, now issues:

- **#247** — the Monday cron re-claims all 6 horizon weeks every pass, but 5 were claimed last
  Monday: **83% of 528,000 claims are redundant.** Warm 41s against a 120s cap; cold-cache it breaks
  at ~2,400–3,500 gyms. Failure is near-silent (statement times out, every gym after the
  `order by gy.id` cutoff gets no new week). Cheapest first move — **materialize only `i=5`** — cuts
  83% before any sharding, and the migration's own header (`20260805100000:159-165`) names sharding
  as the exit.
- **#248** — `class_session` + `schedule_template_week` append forever, no prune, no partition.
  13.7M rows each at 3 years. The bite is that six indexes stop fitting in 224 MB of `shared_buffers`
  — which is the mechanism that turns #247's 41s into ~7 minutes.
- **#249** — `ensureSemanaMaterializada` fires on every agenda/asistencia read. Measured DB cost of an
  already-materialized week: **0.84 ms and zero XIDs**. The cost is the PostgREST round trip:
  ~240k/day, **10–30× more latency than work**. Post-#136 it only needs to fire for weeks outside the
  guaranteed horizon.

Design + full cost model: `docs/Context/2026-08-06-243-series-edit-design.md`. #243 carries the
ruling as a comment and is relabeled `hitl` → `ready-for-agent`. **#190 was already shipped
(b1da35c) and left open by oversight — closed.**

---

## Unchanged from the last handoff, still owed

Settlement walk (deployed admin, demo gym: desk tap → **DESCONTADA** / **GRATIS**, roster-mark a
booked member → **RESERVA**; book into a future class then Agenda-cancel it → balance returns; and
the counter consequence that an expired member who missed their booking is now **refused** at the
door — 24 of 52 live clientes are expired-with-balance) · **first scheduled cron run was Mon
2026-08-10 08:00 UTC** — check `cron.job_run_details` and `public.cron_run_log` · #230 VENTANA
closeout · #152 Pro tier at 4th gym.

Ready-for-agent queue, all self-declared low priority: #240 · #234 · #231 · #222 · #151 / #150 / #149.

---

## Traps

1. **Commit before dispatching an agent that can delete.** See the incident above.
2. **The scratch PAT is not in this worktree** — it is at
   `C:\Users\Aaron\Documents\Repos\RED-2.0\docs\db-testing-throwaway-project\data` (gitignored, main
   checkout only). Read it there; do not copy it in. Scratch ref `gyyujeguycxxoaqgdnjp`; the runner
   refuses the live ref.
3. **Scratch currently carries all three #243 migrations.** If the move gets cut, reconcile scratch:
   drop `update_recurring_schedule` and restore `materialize_week_for_gym` + `edit_class_session` to
   their pre-#243 bodies, then verify `md5(prosrc)` against a replay of `supabase/migrations/`.
4. (Inherited, still true) Apply migrations to live **verbatim** — trimmed comments land in `prosrc`
   and break repo↔live md5 comparison · multi-line git messages with inner double quotes break
   PowerShell→git, use `git commit -F` · PowerShell mangles SQL through `ConvertTo-Json`, go through
   a temp Node `.mjs` · never `supabase link` / `db push` (version drift by design, compare by NAME).
