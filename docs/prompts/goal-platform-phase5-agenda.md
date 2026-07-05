GOAL — Ship every AFK slice of the Phase-5 admin reframe + Agenda (initiative `platform-phase5-agenda-2026-07`): the curated-catalog schema (coach, class_type, class_session + templates, plan evolution, gym content), the pure scheduling rules, the Agenda page to the approved mock, and the nav restructure — on stacked branches, Forge green at every commit, live DB expand-only.

Parent PRDs:
- #36 — PRD — Phase 5: Admin reframe + Agenda (https://github.com/Vack99/RED-2.0/issues/36) · mirror: `docs/prds/prd-admin-agenda.md`

Slices in scope (labeled `platform-phase5-agenda-2026-07` + `ready-for-agent`):
- #37 S0 — Catalog schema spine (coach, class_type+children, room, branded ids, RLS denial-first) — no blockers (turn-1 ready)
- #38 S2 — Plan evolution (paquetes expand per binding column map + plan_feature + cuenta editor) — no blockers (turn-1 ready)
- #39 S3 — Gym content schema + authoring (about_value, facility, stat, faq) — no blockers (turn-1 ready)
- #40 S4 — Pure domain rules + agenda formatting (estado-sesión, occupancy, materialization spec, tz) — no blockers (turn-1 ready)
- #41 S6 — Agenda UI primitives (wheel picker, date strip, session card, week group, editor sheet) — no blockers (turn-1 ready)
- #42 S1 — Scheduling schema (class_session + coach join, schedule_template, atomic + idempotent RPCs) — blocked by #37
- #43 S8 — Coach + class-type authoring under cuenta — blocked by #37
- #44 S5 — Agenda DAL (day/week readers ensure-materialized + mutation seams) — blocked by #42, #40 (DIAMOND: base #42, merge #40)
- #45 S9 — red-demo gym twin (seed + demo membership + phase evidence) — blocked by #37, #42, #38 (DIAMOND: base #42, merge #38; #37 arrives via #42's stack)
- #46 S7 — Agenda page (DÍA + SEMANA + editor + quick-glance; nav restructure + vender relocation) — blocked by #44, #41 (DIAMOND: base #44, merge #41)

NOT in the queue (labeled `hitl`, NEVER dispatch, skip + comment once): #47 S10 — visual fidelity sign-off vs the interactive mock, live forge smoke, red-demo check (the Phase-5 exit gate — human-only, on-device).

External coordination (do not "fix"): no parallel initiative is running — but `packages/brand/**` is FROZEN regardless (scheduling carries no brand seam; ADR-0012/0014 own it). NEVER touch `#35` (Phase-7 concern, parked), the Phase-3/4 evidence docs, or the global `to-goal` skill files. The mock at `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\` is READ-ONLY reference.

Live-DB contract (binding for every DDL-bearing slice — #37, #38, #39, #42, #45): expand-only; a manual dump into `C:\Users\Aaron\Documents\RED-2.0-backups\` is MANDATORY before any DDL against the live project (free tier = no backups/PITR; mechanism + evidence format: `docs/runbooks/hitl-28-evidence.md`) — if a dump cannot be taken, abort `[BLOCKED]`; the RLS denial suite runs on the throwaway scratch project via the runner's `SUPABASE_TARGET_REF` override + branch-refusing `apply-sql.mjs` (Supabase branching is Pro-gated, 402); `get_advisors` after every policy/function migration; the `rls_auto_enable` trigger stays on; NEVER destructive SQL against the live project.

---

THIS SESSION IS THE ORCHESTRATOR ONLY
- The orchestrator NEVER edits code, NEVER runs typecheck/build/test, NEVER reads diffs.
- MODEL SELECTION (per CLAUDE.md's ranking): shipping default `model: sonnet` (clear-spec slices #37, #39, #40, #43, #44, #45). Named overrides — #38 (live money table) and #42 (scheduling schema + RPC seam) ship on `model: opus`; #41 and #46 (taste-bearing UI, need taste ≥ 7) ship on `model: opus` and MUST invoke the `frontend-design` skill. Standing escalation: if a slice's gates fail once on quality grounds, re-dispatch the re-implementation on the next tier up (sonnet→opus→fable) without asking.
- GATE MODEL — FRESH-EYES: the shipping subagent does NOT self-grade. The orchestrator dispatches the two gate-checkers itself, IN PARALLEL, as SEPARATE agents with fresh context, `model: opus` — EXCEPT for #42 and #46 (the highest-stakes schema slice and the product page), whose gates run on `model: fable`.
- Each shipping subagent gets its own git worktree based on its resolved base branch, owns its slice end-to-end, and returns ONE LINE.
- Orchestrator context per turn = prune worktrees, fetch queue, exclude parents, parse blockers, resolve bases, dispatch, gate, log. Constant. Sustainable.

END STATE
- Every in-scope slice is CLOSED with a squashed commit on its own branch pushed to `origin`.
- `main` is NEVER touched. Dependent branches are STACKED on their blocker's branch — the user reviews per branch and fast-forwards the stack to main in dependency order (solo-main workflow).
- Sentinel emitted verbatim when the queue is empty:
  `PHASE5-AGENDA GOAL COMPLETE — all AFK slices closed; #47 (hitl exit gate) awaits the human`
- If the queue is non-empty but every remaining slice is gated on an open dependency that cannot proceed (a `[BLOCKED]` slice, an `hitl` issue), emit instead:
  `PHASE5-AGENDA GOAL HALTED — remaining slices gated; see per-slice log`
- Immediately AFTER emitting the sentinel (success OR halted), log `git worktree list` and, for each non-empty worktree, the slice number + last verdict + its base branch (the user's one-glance pickup list / merge order).

SKIP LIST (issues to leave OPEN and untouched)
- None. (#47 is excluded via the `hitl` label, not the skip list.)

---

PER-TURN ALGORITHM (orchestrator)

0. `git worktree prune`.
1. Fetch the open queue:
   `gh issue list --repo Vack99/RED-2.0 --label ready-for-agent --label platform-phase5-agenda-2026-07 --state open --json number,title,body`
2. Drop any number in the SKIP LIST.
3. EXCLUDE parent PRDs: drop any candidate whose number appears in an in-scope slice's `## Parent` section (bare `#<n>` match) OR that carries a `prd`/`epic` label. (#36 carries `ready-for-agent` — without this step it gets grabbed turn 1.)
4. For each candidate, parse `## Blocked by`: take ONLY lines that BEGIN with `#<n>`. Verify each blocker CLOSED via `gh issue view <N> --json state`. READY iff every blocker is CLOSED (or none).
5. If READY set is empty:
   - If any remaining slice is gated on an OPEN blocker that cannot close (a `[BLOCKED]` slice, an `hitl` issue), emit the HALT sentinel and STOP.
   - Else emit the SUCCESS sentinel and STOP.
   - Either stop path: log the worktree summary from END STATE.
6. Pick up to K = 3 from the READY set. Selection rule: prefer slices whose closure unblocks the most open downstream slices (turn 1 that means #37 first — it unblocks #42/#43 and transitively everything); tie-break smallest scope.
7. RESOLVE THE BASE BRANCH per selected slice:
   - No blockers → `origin/main`.
   - Blockers (all CLOSED) → the blocker's branch: `git fetch origin`, then `git ls-remote --heads origin "*slice-<blockerNN>-*"`.
   - DIAMOND → base = topologically-deepest blocker's branch; pass the remaining blocker branches as `<EXTRA_BLOCKER_BRANCHES>` to merge before editing. Concretely: #44 bases on #42's branch merging #40's; #45 bases on #42's branch merging #38's; #46 bases on #44's branch merging #41's.
8. Dispatch the selected shipping subagents IN PARALLEL in a single response (Agent tool, `subagent_type` general-purpose, per-slice model from MODEL SELECTION). Worktree path: `C:\Users\Aaron\Documents\Repos\RED-2.0-wt\slice-<NN>-<kebab>`. Use `superpowers:dispatching-parallel-agents` + `superpowers:using-git-worktrees`.
9. Wait for returns. The harness notifies — do NOT poll, do NOT sleep.
10. FRESH-EYES GATES per returned `READY FOR GATES` slice: dispatch Gate 1 + Gate 2 (verbatim prompts below) IN PARALLEL as separate fresh-context agents (`model: opus`; `model: fable` for #42/#46). Each gate gets: worktree path, `<BASE_REF>`, issue number + body, and computes its own diff (`git -C <PATH> diff <BASE_REF>..HEAD`).
    - BOTH YES → SendMessage the verdicts to the original shipping agent: it squashes, pushes, comments, closes, returns the closed line.
    - Any NO → SendMessage the failing gate's named concern (only that) back to the shipping agent; it re-implements and returns `READY FOR GATES` again; re-dispatch BOTH gates. 3 re-plan loops TOTAL per slice, then instruct the agent to abort per the gate block.
11. Log ONE line per outcome:
    - `closed #<N> on slice-<NN>-<kebab> @ <short-sha>`
    - `[BLOCKED] #<N>: <reason>`
    - `[SCOPE CREEP] #<N>: <reason>`
    - `[SUBAGENT FAILED] #<N>: <reason>`
12. Loop to step 0.

---

SHIPPING SUBAGENT PROMPT (the orchestrator inlines `<N>`, `<NN>`, `<KEBAB>`, `<PATH>`, `<TITLE>`, `<BASE_REF>`, `<EXTRA_BLOCKER_BRANCHES>`, and the full issue body each dispatch)

```
You are a shipping subagent for slice #<N> of the Phase-5 admin reframe + Agenda initiative.

Title: <TITLE>
Parent PRD: https://github.com/Vack99/RED-2.0/issues/36
Worktree: <PATH>
Branch (you create this): slice-<NN>-<KEBAB>
Base branch (you branch FROM this): <BASE_REF>
Extra blocker branches to merge in (diamond DAGs only, else blank): <EXTRA_BLOCKER_BRANCHES>

You work ONLY inside this worktree. The orchestrator session never touches files.

Issue body (read in full before doing anything):
<INLINED ISSUE BODY>

CONTEXT (read these BEFORE editing anything)
- The parent PRD mirror `docs/prds/prd-admin-agenda.md` — especially Implementation Decisions (a)–(m) and the Design principles section; the (a) column map and (b) RLS deferral are BINDING.
- `CONTEXT.md` — domain glossary (es-MX). Use these terms in code, commits, and gate inputs; do not invent synonyms. `ARCHITECTURE.md` — the package map + enforced dependency boundary.
- ADRs (each is a locked decision — do not relitigate): ADR-0001 (proxy.ts not middleware, server-only DAL, getClaims/getUser never getSession, RLS-as-boundary), ADR-0002 (derived-not-stored — occupancy extends it), ADR-0004 (saldo = stored running balance; ilimitado = NULL guard), ADR-0005 (atomic write RPCs: SECURITY INVOKER, SET search_path TO '', EXECUTE to authenticated), ADR-0007 (nombre is DERIVED — never free-text), ADR-0010 (the Phase-5 spine: absolute starts_at, template materializes independent rows, multi-coach join, derived occupancy, consume model), ADR-0011 (JIT packages + cross-package boundary), ADR-0012 (host→inquilino→marca; header is UX only), ADR-0013 (RLS-by-membership: is_member_of/is_staff_of/has_role, initplan-cached, one predicate per class).
- This is NOT the Next.js you know: read the relevant guide in `node_modules/next/dist/docs/` before writing app code; heed deprecation notices.
- Invoke `keep-it-lean` before calling the diff done (ALWAYS, every slice).
- Schema/RLS slices (#37, #38, #39, #42, #45): invoke `supabase-postgres-best-practices-RED`; honor the Live-DB contract quoted in this goal's header (pre-DDL dump or `[BLOCKED]`, scratch-project denial suite via `SUPABASE_TARGET_REF`, `get_advisors` after policy migrations, expand-only). Regenerate `packages/data/src/database.types.ts` after each migration.
- UI slices (#41, #46): invoke `frontend-design`; the interactive mock at `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\RED-AdminApp-Class-Page\Agenda Week View.html` is the source of truth (read the file itself); brand-contract tokens only — the mock's gold accent is Forge paint, not spec.
- Do NOT invoke (cargo-cult for this initiative): `prototype`, `sector-map`, `improve-codebase-architecture`, `to-map`/`to-findings`/`to-health`, `migrate-to-shoehorn`.
- Live-system facts: gyms `forge` (live), `forge-demo`, `red` (no memberships yet); all tables RLS-on; Husky pre-commit runs `pnpm lint && pnpm typecheck && pnpm test` — NEVER run `husky` with an argument.

EXECUTION
- `git -C <PATH> fetch origin`, then `git -C <PATH> checkout -b slice-<NN>-<KEBAB> <BASE_REF>`. For diamonds, `git -C <PATH> merge <each EXTRA_BLOCKER_BRANCH>` before editing.
- Run `superpowers:writing-plans` scoped to THIS slice only, then explore the relevant repo area — do NOT assume structure.
- TDD is non-negotiable (`superpowers:test-driven-development`): the denial test / failing test comes BEFORE the policy or code it guards, per slice.
- Feedback loops continuously: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Iterate until every acceptance-criteria checkbox is satisfiable.
- Use `superpowers:systematic-debugging` when something fails unexpectedly; `verify` before handoff on slices with a runtime surface.
- You CANNOT dispatch sub-agents — all work happens in your own context, sequentially.

HANDOFF (fresh-eyes protocol — you do NOT self-grade)
- When acceptance criteria pass and shields are green: COMMIT your work on the branch (do NOT squash, push, comment, or close yet) and return exactly:
  `READY FOR GATES #<N> on slice-<NN>-<KEBAB> base <BASE_REF>`
- Wait for the orchestrator's gate verdicts via SendMessage.
- BOTH YES → `superpowers:verification-before-completion` (run `pnpm lint && pnpm typecheck && pnpm test` one final time, exit 0 required), squash to ONE commit relative to base (`git -C <PATH> reset --soft <BASE_REF>`, single commit), subject `<type>(<scope>): <summary> — closes #<N>`, body = terse description + both gate verdicts (1 sentence each). Push `git -C <PATH> push -u origin slice-<NN>-<KEBAB>`. DO NOT open a PR. DO NOT merge to main. Post ONE issue comment: every acceptance criterion ticked, command-output excerpts, both gate verdicts + hunks + concerns + ADR checklists, branch name. Then `gh issue close <N>` and return verbatim: `closed #<N> on slice-<NN>-<KEBAB> @ <short-sha>`
- Any NO → address ONLY the named concern, re-run feedback loops, return `READY FOR GATES …` again. After the 3rd failed re-plan total: post the abort comment (final diff summary, both verdicts, what was tried), leave issue OPEN, branch UNPUSHED, return `[BLOCKED] #<N>: gate <Elegance|SeniorDev> failed after 3 re-plans — <one-line reason>`

CONSTRAINTS (shipping subagent)
- Touch only files within this slice's stated scope. If creep is required: post `[SCOPE CREEP] <reason>` on the issue, leave it OPEN, branch UNPUSHED, return `[SCOPE CREEP] #<N>: <reason>`.
- Never merge to `main` — it is read-only for you. Never touch `packages/brand/**`.
- Never finalize with failing lint/typecheck/test. Never run destructive SQL against the live project.
- Never modify a parent PRD or any other issue. Never invent new issues. Never weaken acceptance criteria — abort `[BLOCKED]` instead.
```

---

GATE CHECKS (verbatim — paraphrase-sensitive; the orchestrator pastes these into each gate-checker's prompt)

Compute the slice diff relative to the base branch: `git -C <PATH> diff <BASE_REF>..HEAD` (NOT `main..HEAD` — a stacked slice's base is its blocker's branch, and diffing against main would fold in the blocker's code too).

**Discipline binding both gates (non-negotiable):**
- Each verdict (YES or NO) MUST quote at least one specific diff hunk that supports it. Verdicts without a quoted hunk are disqualifying — re-prompt the gate.
- Even when returning YES, the gate-checker MUST enumerate 1-3 specific concerns it considered and rejected. Returning YES with an empty concerns list is disqualifying.
- Each gate MUST conclude with a one-line YES/N/A per ADR: `<ADR-ID>: YES/N/A — <2-7 words>`.
- Reasoning capped at 3 sentences per gate (the concerns list, hunk quote, and ADR checklist do not count toward that cap).

**Gate 1 — Elegance Check**
Prompt the gate-checker with verbatim:
> "Is every change in this slice considered the most elegant approach overall? Apply the deletion test on any new Module: 'if I delete this, does complexity vanish (it was a pass-through, bad) or concentrate (it earned its keep, good)?' Check naming uses CONTEXT.md domain vocabulary and LANGUAGE.md architectural vocabulary — no 'service', 'helper', 'utils' where a domain noun applies. Check Locality: related code lives together; types used by one Module live with it. Check there is no cleverness for cleverness's sake — the minimum diff needed to satisfy the acceptance criteria. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "This work favors YAGNI and KISS: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared' / base module with a single caller in this diff — DRY and SOLID do not justify structure the criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception must name its concrete present need; unnamed single-caller abstraction is a failure. **Named present-need exceptions (Phase 5):** branded ids for the five new entities (cross-entity id mixups are the compile-time failure they exist to catch); `schedule_template` as a separate table (ADR-0010 locked — recurrence is not a session column); `plan_feature` / `class_type_workblock` / `class_type_bring_item` child tables (ordered display lists the mock renders); the idempotent materialization RPC (atomicity per ADR-0005 — template insert + session fan-out is one write). Anything beyond this list — a scheduling 'engine', a generic CRUD factory for catalog tables, a calendar abstraction serving one page — fails the gate."
>
> "Do not return `YES` unless you are 100% confident this is the most elegant approach overall."

**Gate 2 — Senior Dev Approval**
Prompt the gate-checker with verbatim:
> "Stop for a second and think: would a senior dev approve this slice as the sole reviewer? Check: tests target the Interface (external behaviour), not implementation internals. No `as any`, no `@ts-expect-error` without a one-line justification. No TODO/FIXME passed on without a linked issue. No premature optimization, no defensive code for impossible scenarios. Commit message tells a clear story; diff is the minimum needed. Every acceptance-criteria checkbox is genuinely satisfied, not weasel-satisfied. The slice respects ADR-0001, ADR-0002, ADR-0004, ADR-0005, ADR-0007, ADR-0010, ADR-0011, ADR-0013. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "Do not return `YES` unless you are 100% confident a senior dev would approve."

If either gate returns `NO`:
- Relay ONLY the failing gate's named concern to the shipping agent. Do not make unrelated structural changes — that risks regressing the gate that previously passed.
- The agent re-implements; re-dispatch BOTH gates with the new diff (always re-run both).
- Up to 3 re-plan loops TOTAL across both gates combined, then the abort protocol in HANDOFF.

NEVER weaken a gate verdict from `NO` to `YES` without genuinely re-implementing. If the gate-checker's reasoning seems wrong (rare), the correct move is to re-implement in a way that makes the gate trivially YES — not to argue with the gate.

---

CONSTRAINTS (orchestrator)
- NEVER edit code. NEVER run typecheck/build/test directly. NEVER read a slice diff. If you find yourself doing any of these, you have drifted out of role — stop and dispatch a subagent.
- Never modify a parent PRD or any issue body. Never invent new issues. Never merge to `main`.
- Skip any open issue labeled `hitl` — leave it open, post `[BLOCKED] #<N>: HITL — needs human` on it once (subsequent turns skip silently). That is #47.
- If a subagent returns `[BLOCKED]`, `[SCOPE CREEP]`, or `[SUBAGENT FAILED]`, log it and proceed with the next ready slice next turn. Do not investigate, do not retry — that's a human's job.
- Worktree hygiene: after a slice closes, `git worktree remove <PATH>`. On Windows "Filename too long" still UNREGISTERS the worktree — afterward delete leftovers with PowerShell `Remove-Item -LiteralPath "\\?\<ABS_PATH>" -Recurse -Force` (do NOT use `cmd /c rmdir /s` — the harness blocks the `/s` token). Then `git branch -d slice-<NN>-<KEBAB>`. For BLOCKED / SCOPE_CREEP / FAILED slices, LEAVE the worktree for human inspection.

SKILLS THE ORCHESTRATOR USES
- `superpowers:dispatching-parallel-agents` — every turn, to fan out.
- `superpowers:using-git-worktrees` — one isolated worktree per subagent.
- Nothing else. The orchestrator is dispatch + gate + log only.

SKILLS THE SHIPPING SUBAGENTS USE (already listed inline)
- `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `keep-it-lean` (ALWAYS), `verify`; `supabase-postgres-best-practices-RED` (schema slices); `frontend-design` (#41, #46); `diagnose` on stubborn failures.
- NOT `superpowers:dispatching-parallel-agents` — a shipping subagent cannot fan out.

POST-QUEUE HUMAN STEPS
1. Review the stack (`/code-review` per branch or on the whole stack), then fast-forward to main in dependency order: #37 → #42 → #43 → #38 → #39 → #40 → #41 → #44 → #45 → #46 (unblocked siblings may reorder among themselves; stacked ones may not).
2. Execute #47 (HITL exit gate): on-device mock fidelity walk, live forge smoke, red-demo check; tick the roadmap Phase-5 exit criteria.
3. Relay to Phase 6: the pinned interface (class_session / class_session_coach / plan / coach shapes) is now the contract; Phase 6 planning starts from the roadmap's Phase-6 row + data-model §4 transactional entities.

CAP
Stop after 5 orchestrator turns (each dispatches up to K=3 shipping subagents) OR when the success / halt sentinel is emitted, whichever first. At cap emit:
`GOAL CAP HIT after 5 turns — <X> slices closed, <Y> remaining`
