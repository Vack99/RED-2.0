# HANDOFF — horizon batch #259/#260/#261 + queue orchestration (written 2026-08-08, session stopped at usage cap)

Next session continues from here. Worktree: `.claude/worktrees/reserva-manual-agenda`, branch `queue-batch-0807`, tip `dab962a`, working tree clean.

## Owner's orchestration protocol (applies to EVERY session — restate in every future handoff)

- Run **/caveman /ponytail /keep-it-lean** at session start.
- **Stop at ~200k session usage**; before stopping, write a handoff like this one so the next session continues seamlessly.
- New-function pipeline: **/wayfinder only if the route is unknown; if the process is already stated → /to-spec → /to-tickets → if green → implement.**
- Orchestration sessions: the main context orchestrates and **saves usage by delegating to agents** — sonnet for clear-spec implementation, opus for ALL reviews, fable escalation-only per CLAUDE.md. Agents run in the **foreground** (visible), no wide fan-outs, **never assume information** — verify or ask.
- Push is **owner-gated per push**; local commits + ff always fine. Commit before dispatching agents (a killed agent can destroy uncommitted work — happened again this session: the review-fix agent was stopped mid-task; committed state survived untouched).

## Where this session stopped — THE FRONTIER

The horizon batch (spec #259 → tickets #260 + #261, closing #247 + #248) is implemented and opus-reviewed, but **the 7 review fixes are NOT applied** (the fix agent was stopped before committing). Next session: apply the fixes below as one commit `fix(review): close opus wave on horizon frontier + prune`, then run the denial gate.

### The fix list (from the opus review — all verified findings, apply ALL)

1. **HIGH — replace the frontier `min(max(week_start))` in `20260808210100_horizon_frontier_pass_and_prune.sql` with a claim-what's-missing loop.** View-time `ensure_week_materialized` (agenda.ts:304-309, weeks (+5,+26]) claims a ledger row for every active template at a far week → frontier jumps past the window → weeks 6-7 become permanent holes (and #260's clamp locks them once past). Per gym: `for v_week in select w.d::date from generate_series(v_monday, v_monday+35, 7) w(d) where exists (select 1 from schedule_template st where st.gym_id=g.id and st.is_active and not exists (select 1 from schedule_template_week stw where stw.template_id=st.id and stw.week_start=w.d::date)) loop` → claim + `materialize_week_for_gym`. Rewrite the migration header honestly (it reasons only about cron-created holes). Also subsumes the `min()`-skips-NULL defect (never-materialized template hiding behind a materialized sibling).
2. **HIGH — suite scoping bug** `supabase/tests/class_horizon_autoroll.sql:549-556`: `n_del` declared in a sub-block, referenced after its `end;` → 42703 aborts the whole suite (denial can never go green). Hoist `n_del int;` into the enclosing DO block's declare.
3. **MED — wrap the prune DELETE in its own subtransaction** (`begin delete…; get diagnostics v_pruned = row_count; exception when others then v_errors := v_errors+1; v_notes := v_notes || ('prune: '||sqlerrm); end;`) so a prune failure can't roll back every gym's materialization + the cron_run_log row.
4. **MED — the "pruned week un-re-claimable" vector is vacuous** (gym F's template is inactive → materialize returns 0 regardless). Re-aim at an active-template gym: `materialize_week_for_gym(gym_d, cutoff - 7)`, assert 0 + no ledger/class_session row written.
5. **Regression vector for finding 1**: the suite already builds the poisoning state (`ensure_week_materialized(monday_a + 42)` ~line 525) — run `cron_materialize_horizon()` a third time after it, assert gym A's 0..5 window is fully claimed.
6. **LOW —** stale comment `20260808210000_materialization_backward_clamp.sql:67-69` (tz cast now raises before the loop).
7. **LOW —** `claims=`/`created=` over-report on mid-loop gym failure (locals survive EXCEPTION rollback): snapshot both counters at the top of the per-gym block, restore in the handler.
8. **LEAN —** drop the re-stated revokes at `20260808210100:121-124` (same-signature CREATE OR REPLACE carries ACLs — repo convention 20260806130000:31-32).

Verified clean, do not re-litigate: margin math both directions, isodow arithmetic, clamp inheritance (ensure_week_materialized delegates to materialize_week_for_gym since 20260805100000:105), clamp strictness, index sargability, summary substring compat (no consumer outside the suite), migration hygiene/idempotency, privilege posture, guards 8/8.

### Then, in order

1. `pnpm test` green locally (pre-commit runs it anyway).
2. **Denial gate:** `$env:SUPABASE_TARGET_REF='gyyujeguycxxoaqgdnjp'; $env:SUPABASE_ACCESS_TOKEN=<PAT>; pnpm test:denial` — PAT at `docs/db-testing-throwaway-project/data` (primary checkout). CAUTION: the gate0-privacy session uses the SAME scratch ref — if failures smell environmental (not assertion FAILs), re-run once. Runner refuses the live ref.
3. On green: close #260, #261, #247, #248 (closing comment on #248 names the parked class_session half — archival/partitioning, attendance-retention constrained, trigger = index working-set pressure at fleet scale). #259 (spec) closes with them.
4. Batch rides the next consented push. **Scratch-green ≠ live-current**: live apply is MCP `apply_migration` per file (MCP is bound to PROD), never `supabase link`/`db push`.

## Parallel-session boundary — DO NOT CROSS

**Gate 0.1 (#252–#258) is OWNED by a concurrent session on branch `gate0-privacy`** (primary checkout, tip `0224db7`: #253 built + review round 1, scratch-denial green). This lane must NOT duplicate it — my duplicate #253 was dropped (recoverable at tag `drop-253-dup-963f501`, delete the tag when gate0's #253 ships). At ff time the two branches serialize onto main; the 3 gate-0.1 docs commits were cherry-picked onto this branch (patch-identical to main's copies) — expect a clean merge, prefer merging/rebasing gate0-privacy AFTER this batch ffs.

## Git state (three-way, needs one reconcile at push time)

- `origin/main` = `3f77967` (#243 shipped). Local `main` = `7aedec7` (3 gate-0.1 docs commits, diverged, patch-duplicated onto this branch). `queue-batch-0807` = this branch: origin/main + 5 queue-batch commits (11 issues closed @ `aca51bd`) + 3 cherry-picked docs + spec + horizon commits.
- At push time (OWNER CONSENT REQUIRED): ff/reset local main to this branch's tip (its 3 unique commits are patch-identical duplicates), one push. Check the range for `supabase/functions/**` first (pre-push edge guard; expected absent → plain push).

## Task list state (harness tasks)

Done: spec (#259), tickets (#260/#261 + native edge), implementation (0ad4895, dab962a), opus review (findings above), gate0 docs cherry-pick. Open: **fix wave → denial → closes** (frontier), push (owner-gated), owner rulings #221+#251 together (remove/archive semantics — rule jointly), #168 (repeat-visit UI + undo), #258 (gate0 sign-off, owner), **Mon 08-10: first live run of the #243-era horizon cron — check `public.gym_horizon_depth` on live that morning** (NOTE: if this batch hasn't shipped by then, the OLD 0..5 pass runs — that's fine, it's the baseline).

## Issue map (as of session end)

Open: #152 (parked, trigger-gated billing), #168 (hitl ruling), #221+#251 (hitl, rule together), #234 (parked, fix-when-touched), #247/#248 (close when this batch ships), #252–#258 (gate0 lane, parallel session), #259/#260/#261 (this batch). Everything else closed.
