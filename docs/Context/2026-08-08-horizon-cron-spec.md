# Spec: horizon cron frontier pass + template-week ledger retention (#247 + #248)

## Problem Statement

The Monday horizon cron re-claims all 6 weeks for every gym every week, though 5 of the 6 were claimed the Monday before — 83% of its work is provably redundant, and the single serial statement stops fitting the 120s timeout at ~2,400 gyms (cold cache), silently truncating the fleet. Separately, `schedule_template_week` — the materialization idempotency ledger — appends forever with no retention path: rows older than ~2 weeks are unreachable dead weight that grows to 13.7M rows at 3 years/4,000 gyms, and that table growth is precisely what evicts the working set from `shared_buffers` and detonates the cron timeout.

A fact both open issues predate: **#249's fix removed the view-time self-heal for the cron-guaranteed window.** `ensureSemanaMaterializada` now skips the RPC for any week at or inside Monday+5, so a Monday the cron misses is no longer healed by staff browsing that week. #247's "materialize only i=5 and lean on the view-time self-heal" is therefore not viable as written — plain i=5 would turn one missed Monday into a permanent hole.

## Solution

One migration, three moves on the same subsystem:

1. **Frontier catch-up pass.** The weekly cron stops iterating a fixed `0..5`. Per gym it reads the ledger frontier (the oldest per-template `max(week_start)` among that gym's active templates), and claims only the weeks from `frontier + 1 week` (floored at the gym-local current Monday) through `Monday + 5 weeks`. Steady state that is exactly one new week per gym — the 83% is gone — and after any outage the next pass claims whatever is missing, so recovery is automatic and the removed view-time self-heal is no longer load-bearing.
2. **Backward clamp in SQL.** The authenticated-reachable materialization path refuses (no-op, returns 0) any week older than the gym-local current Monday. Past weeks are history; nothing legitimate materializes them. This is what makes retention safe against direct RPC calls that bypass the app-layer clamp.
3. **Ledger retention.** After the gym loop, the same cron run deletes `schedule_template_week` rows with `week_start` older than current Monday − 2 weeks, supported by a new `week_start` index. The clamp boundary (current Monday) is strictly newer than the prune cutoff, so a pruned week can never be re-claimed — resurrection of moved/cancelled sessions is structurally impossible.

The run summary keeps its shape and gains the claims/prune counts; per-gym failures already land in `cron_run_log` with the failing gym ids.

## User Stories

1. As a member, I want next week's classes to exist when I open the agenda, so that I can book without finding an empty week.
2. As a member of a gym whose cron pass failed last Monday, I want the following Monday's pass to fill the missing week, so that a one-off infrastructure fault never becomes a permanent hole in my gym's schedule.
3. As an operator, I want the weekly horizon roll to keep working as the platform grows, so that my gym's schedule doesn't silently stop extending because the fleet got big.
4. As an operator browsing a past week, I want history to stay exactly as it happened, so that cancelled or moved classes never resurrect.
5. As the platform owner, I want the Monday pass to do only the work that produces rows, so that the job fits its timeout with years of headroom instead of 3×.
6. As the platform owner, I want the ledger to stop growing without bound, so that index bloat doesn't degrade every agenda read and detonate the cron.
7. As the platform owner, I want the run summary in `cron_run_log` to state claims made and rows pruned, so that a glance at one row tells me what the pass actually did.
8. As the platform owner, I want a gym that errors during the pass to cost exactly that gym and be named in the summary, so that triage starts from the log, not from a member report.
9. As a staff member using the agenda normally, I want materialization behavior at the seams I can reach to be unchanged, so that nothing about creating schedules or browsing future weeks moves under me.
10. As the next developer, I want the ledger's retention contract stated where the table is defined, so that "immutable idempotency ledger" and "pruned after 2 weeks" don't read as a contradiction.

## Implementation Decisions

- Single expand-only migration; no TypeScript changes. The app-side clamp (`HORIZONTE_SEMANAS`, the `(garantizada, horizonte]` window) is untouched and remains correct: the cron still guarantees weeks 0–5.
- `cron_materialize_horizon` keeps its structure — SECURITY DEFINER, per-gym subtransactions, summary written to `cron_run_log`, EXECUTE revoked from all client roles, same jobname — the inner loop stays fixed `0..5`, but now claims only the weeks that are missing a ledger row for an active template instead of reclaiming all 6 unconditionally (a frontier aggregate is poisoned by view-time far-week claims — see the shipped migration's header for the mechanism). A gym with no ledger rows at all (active templates, never materialized) gets the full 6 weeks.
- Frontier = `min` over active templates of each template's `max(week_start)`, one indexed aggregate per gym. Interior holes cannot form (a gym's pass is all-or-nothing per subtransaction), so top-of-ledger catch-up is complete.
- The backward clamp lives in the CURRENT definitions of the authenticated-reachable materialization functions (`ensure_week_materialized`, `materialize_week_for_gym` — the implementer works from the latest redefinition in the migration chain, not the first). Clamp semantics: target Monday < gym-local current Monday → return 0 without writing. Not an exception — reads that trigger it must not break. No forward clamp in SQL: the +26 bound is app-owned (#244 guard 3) and duplicating the constant into SQL is duplicated knowledge.
- Prune: one set-based DELETE at the end of the weekly pass, outside the per-gym subtransactions; cutoff = current Monday − 14 days computed once per run; count appended to the summary. No new cron job, no new function surface. Runs as the definer (postgres, table owner), so the deliberate absence of a client DELETE policy is unchanged — clients still cannot delete ledger rows.
- New btree index on `schedule_template_week (week_start)` in the same migration, before the first prune runs.
- 2-week margin between clamp boundary (Monday) and prune cutoff (Monday − 14d) absorbs timezone skew between gym-local Mondays and the run's clock; exact tz precision is deliberately not required.
- `class_session` retention is NOT touched (see Out of Scope). `gym_horizon_depth` (view) is untouched; no new alert infrastructure — with a self-healing pass, a truncated run repairs itself next Monday, per-gym errors are already named in `cron_run_log`, and the residual "cron entirely dead" detection remains the ops view by design.
- On ship: close #247 and #248; #248's closing comment names the parked `class_session` half and its re-file trigger (index working-set pressure at fleet scale — archival/partitioning, attendance-retention constrained).

## Testing Decisions

- The contract is the WRITTEN rows, not return values (#78/#80 rule): suites assert ledger rows and `class_session` rows that each pass creates, skips, refuses, and deletes.
- SQL suites in `supabase/tests/` extend the existing autoroll suite (transaction-local fixtures, per-vector JWT impersonation, `RAISE ... FAIL`, rollback), covering:
  - steady state: fleet claimed through +5 → a pass claims exactly the one new week per template, no duplicates;
  - outage heal: a gym with frontier at +3 → the pass claims +4 and +5, both with sessions and coach joins;
  - never-materialized gym: full 6 weeks;
  - backward clamp: an authenticated call for a past Monday writes nothing — ledger and sessions unchanged;
  - prune: rows older than cutoff gone, boundary and newer rows intact, and a pruned past week stays un-re-claimable through the clamped RPC;
  - denial vectors: cron function still unreachable by anon/authenticated; client DELETE on the ledger still refused.
- `tools/guards/rpc-write-coverage.test.ts` obligations: any function whose write set changes keeps/gains its `rpc-coverage.json` entry; new suite files register in the runner's `SUITE` (drift guard).
- vitest is not the proving ground here (RPC boundary is mocked); the app clamp's existing tests in `agenda.test.ts` keep passing untouched — that absence-of-change is itself the assertion that the TS seam didn't move.
- Gate: `pnpm test:denial` green on the scratch project before fast-forward (house convention).

## Out of Scope

- `class_session` retention/partitioning — the hard half of #248; attendance-retention constrained, trigger named in the closing comment.
- Sharding the cron by gym hash — the migration header's own exit, triggered before ~2,000 gyms; the frontier pass pushes that boundary out, it doesn't remove it.
- Push-channel alerting (email/webhook) for a dead cron — no queue infra exists (documented non-goal), and an in-DB alert cannot fire when the job doesn't run.
- Any change to `ventana_arribo` (#234) or other agenda behavior.

## Further Notes

Seams: the highest existing seam — the cron function itself plus the two authenticated RPCs — proven by the SQL suites; no new seam is introduced. The owner was AFK at seam-check time; seams are stated here and are the existing ones, the lowest-risk reading of the skill's checkpoint.

Sources: #247, #248 (measured arithmetic in `docs/Context/2026-08-06-243-series-edit-design.md` appendix), the #249 clamp as shipped on this branch, and the autoroll migration's own scaling-ceiling comment.
