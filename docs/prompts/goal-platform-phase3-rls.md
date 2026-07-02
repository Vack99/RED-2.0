GOAL — Ship every AFK slice of the Phase-3 tenant/identity foundation (initiative `platform-phase3-rls-2026-07`): the gym-scoped multi-tenant spine + RLS-by-membership + member self-register/claim + DB-backed host→gym resolution, on stacked branches, Forge green at every commit.

Parent PRDs:
- #17 — PRD — Phase 3: Tenant/identity foundation (https://github.com/Vack99/RED-2.0/issues/17) · mirror: `docs/prds/prd-tenant-rls.md`

Slices in scope (labeled `platform-phase3-rls-2026-07` + `ready-for-agent`):
- #18 S0 — Tenant spine: gym + gym_domain tables, forge/red seeds, anon-read policies (the Phase-4 interface) — no blockers (turn-1 ready)
- #19 S1 — gym_membership + ADR-0013 membership helpers + live owner backfill — blocked by #18
- #20 S3 — gym_id expand across the 7 tenant tables + clientes member-evolution columns — blocked by #18
- #21 S2 — Mechanized denial suite: seeded preview-branch fixtures + one-command runner — blocked by #19
- #22 S7 — resolveTenant in @gym/data, x-gym/x-brand stamping, HOST_TO_BRAND deleted — blocked by #18
- #23 S4 — Gym-scoped RLS policies (expand half, denial-test-first); cobro owner-only — blocked by #19, #21, #20
- #24 S5 — Per-gym folio counter + registrar_venta rewiring + user_id unique re-keys — blocked by #20, #21
- #25 S6 — Per-gym timezone: tz-parameterize @gym/format + toggle_pase — blocked by #20, #19
- #26 S8 — Member self-register + verified-email claim — blocked by #20, #22, #23

NOT in the queue (labeled `hitl`, NEVER dispatch, skip + comment once): #27 (custom SMTP — human does vendor/DNS/credentials/inbox) and #28 (live cutover + deploy-verify — human approves the destructive prod drops and walks the runbook). They gate nothing in this queue; the queue completes without them.

External coordination (do not "fix"): this initiative executes IN PARALLEL with Phase 4 (`platform-phase4-brand-2026-07`). Phase 4's merge slice may cite #18 as a blocker — that inbound edge is expected and none of ours. NEVER touch Phase-4-owned surfaces: `packages/brand/src/brand-id.ts`, `packages/brand/src/registry.ts`, either app's `layout.tsx`, or the "@gym/brand registry" describe block in the brand test. Split-file contract: Phase 3 owns only the HOST_TO_BRAND import/describe block + index re-export in that test/index. If a pull-rebase hits a Phase-4 edit in a split file, the blocks are disjoint — rebase resolves it.

Pinned header contract (both phases build against this — quote it, honour it): the proxy stamps `x-gym` = the resolved tenant id/slug (NEW, Phase 3 adds it; presentation/UX only, NEVER authz — the ADR-0008 hinge) and `x-brand` = a registry key (today stamped from the static host-map; = the gym row's `brand_module_id` once Phase 3's DB lookup lands), ALWAYS validated in the layout via `Object.hasOwn` with `DEFAULT_BRAND` fallback. Phase 3 stamps; Phase 4's layouts read both and never re-resolve.

---

THIS SESSION IS THE ORCHESTRATOR ONLY
- The orchestrator NEVER edits code, NEVER runs typecheck/build/test, NEVER reads diffs itself.
- All shipping work happens inside subagents dispatched via the Agent tool (`subagent_type` general-purpose).
- MODEL SELECTION (per CLAUDE.md's ranking): shipping subagents default `model: opus`. Slice #25 (mechanical tz threading) ships on `model: sonnet` (bulk/clear-spec — cheapest capable model); if its gates fail once on quality, re-dispatch on `model: opus` without asking. Gate-checkers and finalizers always `model: opus`. Never Haiku. (Codex/gpt-5.5 is NOT installed — no `codex exec`.)
- GATE MODEL — FRESH-EYES (chosen for this initiative; live-DB tenant isolation is the high-stakes case it exists for): the shipping subagent implements and commits but does NOT self-grade, squash, push, or close. The ORCHESTRATOR dispatches the two gate-checkers itself, in parallel, as separate agents with fresh context, then finalizes via SendMessage back to the shipping agent (it still holds the worktree context). Only WHO dispatches the gates differs from the default protocol — the verbatim gate prompts, the discipline, and the 3-re-plan cap are identical.
- Each shipping subagent gets its own git worktree based on its blocker's branch (or `origin/main` if it has no blocker — see step 7), owns its slice end-to-end, and returns its branch name + a diff summary.
- Orchestrator context per turn = prune worktrees, fetch queue, exclude parents, parse blockers, resolve base branches, dispatch shipping agents, dispatch gate pairs, relay verdicts, log one-line outcomes. Keep it dispatch + log.

END STATE
- Every in-scope slice (`ready-for-agent` AND `platform-phase3-rls-2026-07`, not a parent PRD) is CLOSED with a squashed commit on its own branch pushed to `origin`.
- `main` is NEVER touched. Dependent branches are STACKED on their blocker's branch (not on `main`) — the user reviews per branch and fast-forwards the stack to main in dependency order (solo-main workflow: no PRs).
- Sentinel emitted verbatim when the queue is empty:
  `PHASE3-RLS GOAL COMPLETE — all AFK slices closed (platform-phase3-rls-2026-07)`
- If the queue is non-empty but every remaining slice is gated on an open dependency that cannot proceed (a `[BLOCKED]` slice, an `hitl` issue), emit instead:
  `PHASE3-RLS GOAL HALTED — remaining slices gated on non-closeable blockers`
- Immediately AFTER emitting the sentinel (success OR halted), log `git worktree list` and, for each non-empty worktree, the slice number + last verdict + its base branch (the user's one-glance pickup list; the stack merge order is #18 → {#19, #20, #22} → {#21, #25} → {#23, #24} → #26).

SKIP LIST (issues to leave OPEN and untouched)
- None. (#27/#28 are excluded by the `hitl` label, not the skip list.)

---

PER-TURN ALGORITHM (orchestrator)

0. `git worktree prune` — idempotent cleanup of stale tracking records.
1. Fetch the open queue:
   `gh issue list --repo Vack99/RED-2.0 --label ready-for-agent --label platform-phase3-rls-2026-07 --state open --json number,title,body`
2. Drop any number in the SKIP LIST (none today).
3. EXCLUDE parent PRDs: build the set of issue numbers referenced in any in-scope slice's `## Parent` section (bare `#<n>` anywhere in that section) and drop any candidate in that set OR carrying a `prd`/`epic` label. (#17 carries `ready-for-agent` — this step is what keeps it out of the queue.)
4. For each candidate, parse its `## Blocked by` section: take ONLY lines that BEGIN with `#<n>`. Verify each blocker CLOSED via `gh issue view <N> --json state`. READY iff every blocker is CLOSED (or none).
5. If READY set is empty:
   - If any remaining slice has a blocker that is OPEN and not closeable (a `[BLOCKED]` slice, an `hitl` issue), emit the HALT sentinel and STOP.
   - Else emit the SUCCESS sentinel and STOP.
   - Either way, log the worktree summary described in END STATE.
6. Pick up to K = 3 slices from the READY set. Selection rule: prefer slices whose closure unblocks the most open downstream slices (e.g. #19 and #20 before #22 when all three are ready). Tie-break by smallest scope.
7. RESOLVE THE BASE BRANCH for each selected slice:
   - No blockers → base `origin/main`.
   - Blockers (all CLOSED) → base is the blocker's branch: `git fetch origin`, then `git ls-remote --heads origin "*slice-<blockerNN>-*"` (or re-derive `slice-<blockerNN>-<blockerKEBAB>` from the blocker's title).
   - DIAMOND (multiple blockers) → base on the topologically-deepest blocker (`<BASE_REF>`); pass the rest as `<EXTRA_BLOCKER_BRANCHES>` for the subagent to `git merge` before editing. (Concretely: #23's base is #21's branch, merging #20's; #24's base is #21's branch, merging #20's; #25's base is #20's branch, merging #19's; #26's base is #23's branch, merging #22's — #23 already contains #20.)
8. For each selected slice, dispatch a shipping subagent (SHIPPING SUBAGENT PROMPT below) IN PARALLEL within a single orchestrator response. Worktree path: `../RED-2.0-wt/slice-<NN>-<kebab>` (NN = issue number). Use `superpowers:dispatching-parallel-agents` + `superpowers:using-git-worktrees`.
9. Wait for the shipping agents to return (branch + diff summary; the harness notifies — do NOT poll, do NOT sleep).
10. FRESH-EYES GATES per returned slice: dispatch the two gate-checkers IN PARALLEL as separate `model: opus` agents with fresh context (verbatim GATE CHECKS below; each gets the worktree path, `<BASE_REF>`, the issue body, and computes `git -C <PATH> diff <BASE_REF>..HEAD` itself).
    - BOTH YES → SendMessage the verdicts back to the shipping agent: it squashes, pushes, posts the issue comment, closes the issue, and returns `closed #<N> on slice-<NN>-<kebab> @ <short-sha>`.
    - Any NO → SendMessage the failing gate's named concern back to the shipping agent; it re-implements and re-runs feedback loops; re-dispatch BOTH gates on the new diff. Up to 3 re-plan loops TOTAL per slice, then instruct the shipping agent to abort per the gate block (`[BLOCKED]` return; branch unpushed; comment posted).
11. Log ONE line per slice outcome:
   - `closed #<N> on slice-<NN>-<kebab> @ <short-sha>`
   - `[BLOCKED] #<N>: <reason>` · `[SCOPE CREEP] #<N>: <reason>` · `[SUBAGENT FAILED] #<N>: <reason>`
12. Loop to step 0.

---

SHIPPING SUBAGENT PROMPT (the orchestrator inlines `<N>`, `<NN>`, `<KEBAB>`, `<PATH>`, `<TITLE>`, `<BASE_REF>`, `<EXTRA_BLOCKER_BRANCHES>`, and the full issue body each dispatch)

```
You are a shipping subagent for slice #<N> of the Phase-3 tenant/identity (platform-phase3-rls) initiative.

Title: <TITLE>
Parent PRD: https://github.com/Vack99/RED-2.0/issues/17
Worktree: <PATH>
Branch (you create this): slice-<NN>-<KEBAB>
Base branch (you branch FROM this): <BASE_REF>
Extra blocker branches to merge in (diamond DAGs only, else blank): <EXTRA_BLOCKER_BRANCHES>

You work ONLY inside this worktree. The orchestrator session never touches files.

Issue body (read in full before doing anything):
<INLINED ISSUE BODY>

CONTEXT (read these BEFORE editing anything)
- The parent PRD mirror `docs/prds/prd-tenant-rls.md` — including its "### Design principles" section (the keep-it-lean clause + Named present-need exceptions) which binds every diff in this initiative.
- `CONTEXT.md` — domain glossary (es-MX) + the multi-tenant vocabulary rows (inquilino, gym_domain, gym_membership, reclamar, RLS-por-membresía). Use these terms in commits and gate inputs; the domain term is **cliente**, not member.
- Every ADR under `docs/adr/`. Load-bearing for this initiative: ADR-0001 (RLS is the boundary; server-only DAL; no ORM; `proxy.ts` not middleware; `getClaims()` never `getSession()`), ADR-0002 (derived-at-read, never stored), ADR-0004 (saldo is a stored running balance — the one exception), ADR-0005 (atomic write RPCs, SECURITY INVOKER, thin transaction seam), ADR-0008 (one shared Supabase; RLS-by-membership, NEVER the proxy host; brand is presentation-only), ADR-0009 + its 2026-07-02 amendment (two-tier identity; claim-by-match is verified-email-gated, phone never claims, atomic definer RPC), ADR-0011 (JIT packages; the enforced cross-package boundary), ADR-0012 + its 2026-07-02 amendment (resolver relocates to @gym/data; x-gym/x-brand contract; unknown host → no tenant), ADR-0013 (the RLS mechanism: three definer helpers, initplan-cached, one standard predicate per class; JWT claims rejected — do not relitigate), ADR-0014 (custom SMTP: one platform sender).
- `~/.claude/skills/improve-codebase-architecture/LANGUAGE.md` — architectural vocabulary (Module, Interface, Depth, Seam, Deletion test).
- Next 16 has breaking changes vs your training data — read the relevant guide in `node_modules/next/dist/docs/` before writing any Next code. AGENTS.md carries the Husky-v9 caveat (NEVER run `husky` with an argument).
- Supabase work: invoke `supabase-postgres-best-practices-RED` on EVERY migration/policy/RPC touch (initplan caching, `search_path=''`, index-every-gym_id). Use the Supabase MCP tools (`create_branch`, `execute_sql`, `get_advisors`) for the seeded denial suite and run `get_advisors` after every policy/function migration. Prefer preview branches; NEVER run destructive SQL against the live project — the destructive contract steps are #28 (hitl, human-approved).
- Invoke `typescript-advanced-types-RED` when shaping DAL/type surfaces (resolveTenant's tenant types, RPC signatures, tz-parameterized format types).
- Invoke `keep-it-lean` before calling the diff done (ALWAYS, every slice): deletion test on every new module, no-op test on comments/commit message.
- Live DB facts: Supabase project hjppxawglmukfvsgmcog; the live operator uuid is in the tenancy spec §9; Forge stays green at EVERY commit — expand/contract only, additive migrations in your slices.

EXECUTION
- `git -C <PATH> fetch origin`, then create your branch off YOUR BASE: `git -C <PATH> checkout -b slice-<NN>-<KEBAB> <BASE_REF>`. For diamond DAGs, `git -C <PATH> merge <each EXTRA_BLOCKER_BRANCH>` before editing. (Branching off `main` when you have a blocker leaves your tree without the blocker's code and makes your acceptance criteria unsatisfiable.)
- Start with `superpowers:writing-plans` scoped to THIS slice (the PRD + issue body are the spec) — a short TDD task plan before code.
- Explore the relevant repo area first — do NOT assume structure.
- TDD is non-negotiable (`superpowers:test-driven-development`): the denial test / failing test comes BEFORE the policy or code it guards, per slice.
- Run feedback loops continuously: `pnpm lint` && `pnpm typecheck` && `pnpm test` (and `pnpm build` before finalizing app-touching slices). Iterate until every acceptance-criteria checkbox is satisfiable.
- Use `superpowers:systematic-debugging` when something fails unexpectedly; `verify` — drive the real flow (a real registro, a real sale on the preview branch), not just tests.
- If a slice contains 2+ independent sub-tasks, do them sequentially in your own context. You CANNOT dispatch sub-agents.
- Do NOT invoke (cargo-cult for this initiative): superpowers:brainstorming, sector-map, improve-codebase-architecture, to-map/to-findings/to-health, grill-me, prototype/frontend-design.

HANDOFF (fresh-eyes protocol — you do NOT self-grade)
- When every acceptance-criteria checkbox is satisfiable and the shields are green, run `superpowers:verification-before-completion` (`pnpm lint && pnpm typecheck && pnpm test`, exit 0), commit your work on the branch (NOT squashed yet), and return: your branch name, `<BASE_REF>`, and a ≤10-line diff summary. Do NOT squash, push, comment, or close yet.
- The orchestrator dispatches two independent gate-checkers on your diff. You will receive their verdicts by message:
  - BOTH YES → squash to ONE commit relative to your base (`git -C <PATH> reset --soft <BASE_REF>`, single commit; subject `<type>(<scope>): <summary> — closes #<N>`; body = terse description + both gate verdicts, 1 sentence each). Push: `git -C <PATH> push -u origin slice-<NN>-<KEBAB>`. DO NOT open a PR. DO NOT merge to main. Post ONE comment on issue #<N> with: every acceptance criterion ticked, command-output excerpts, both gate verdicts + reasoning + quoted hunks + concerns + ADR checklists, branch name + origin URL. Close: `gh issue close <N>`. Return verbatim: `closed #<N> on slice-<NN>-<KEBAB> @ <short-sha>`
  - Any NO → address the failing gate's NAMED concern only (no unrelated restructuring), re-run feedback loops, and report back for gate re-dispatch. After the 3rd failed re-plan total: post a comment on issue #<N> (final diff summary, both verdicts, what was tried each round), leave the issue OPEN, leave the branch UNPUSHED, return `[BLOCKED] #<N>: gate <Elegance|SeniorDev> failed after 3 re-plans — <one-line reason>`.

CONSTRAINTS (shipping subagent)
- Touch only files within this slice's stated scope. If scope creep is required: post `[SCOPE CREEP] <reason>` comment on the issue, leave issue OPEN, branch UNPUSHED, return `[SCOPE CREEP] #<N>: <reason>`.
- Never merge to `main`. `main` is read-only for you.
- Never finalize with failing typecheck / build / test. Never run destructive SQL on the live project.
- Never modify a parent PRD or any other open issue's body. Never invent new issues.
- Never edit Phase-4-owned surfaces: `brand-id.ts`, `registry.ts`, either `layout.tsx`, the "@gym/brand registry" describe block.
- Never weaken acceptance criteria. If a criterion can't be met, abort with `[BLOCKED]`.
```

---

GATE CHECKS (orchestrator dispatches these as two SEPARATE fresh-context `model: opus` agents, in parallel, per slice — verbatim prompts; paraphrase-sensitive)

Each gate-checker receives: the worktree path `<PATH>`, `<BASE_REF>`, the issue body, and these instructions. It computes the slice diff itself: `git -C <PATH> diff <BASE_REF>..HEAD` (NOT `main..HEAD` — a stacked slice's base is its blocker's branch, and diffing against main would fold in the blocker's code too). It reads, with fresh adversarial intent: the full slice diff, the issue body (acceptance criteria), the relevant ADRs and `CONTEXT.md`, the PRD mirror `docs/prds/prd-tenant-rls.md` (incl. Design principles), and LANGUAGE.md.

**Discipline binding both gates (non-negotiable):**
- Each verdict (YES or NO) MUST quote at least one specific diff hunk that supports it. Verdicts without a quoted hunk are disqualifying — re-prompt the gate.
- Even when returning YES, the gate-checker MUST enumerate 1-3 specific concerns it considered and rejected. Returning YES with an empty concerns list is disqualifying.
- Each gate MUST conclude with a one-line YES/N/A per ADR: `<ADR-ID>: YES/N/A — <2-7 words>`.
- Reasoning capped at 3 sentences per gate (the concerns list, hunk quote, and ADR checklist do not count toward that cap).

**Gate 1 — Elegance Check**
Prompt the gate-checker with verbatim:
> "Is every change in this slice considered the most elegant approach overall? Apply the deletion test on any new Module: 'if I delete this, does complexity vanish (it was a pass-through, bad) or concentrate (it earned its keep, good)?' Check naming uses CONTEXT.md domain vocabulary and LANGUAGE.md architectural vocabulary — no 'service', 'helper', 'utils' where a domain noun applies. Check Locality: related code lives together; types used by one Module live with it. Check there is no cleverness for cleverness's sake — the minimum diff needed to satisfy the acceptance criteria. This work favors YAGNI and KISS: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared' / base module with a single caller in this diff — DRY and SOLID do not justify structure the criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception must name its concrete present need; unnamed single-caller abstraction is a failure. This is a depth phase, not a tracer. The PRD's Named present-need exceptions — the four spine tables, per-table gym-scoped RLS policies, the many-consumer SECURITY DEFINER membership helpers, the seeded denial-suite harness, tz-parameterization, the per-gym folio counter, and the async host→gym resolver — are acceptance-criteria-required structure and PASS this gate. Reject only structure BEYOND that list: any generic multi-tenancy framework, policy-builder DSL, roles beyond owner|operator|member, tables/columns/indexes no acceptance criterion exercises, per-tenant config surfaces, or caching layers. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "Do not return `YES` unless you are 100% confident this is the most elegant approach overall."

**Gate 2 — Senior Dev Approval**
Prompt the gate-checker with verbatim:
> "Stop for a second and think: would a senior dev approve this slice as the sole reviewer? Check: tests target the Interface (external behaviour), not implementation internals. No `as any`, no `@ts-expect-error` without a one-line justification. No TODO/FIXME passed on without a linked issue. No premature optimization, no defensive code for impossible scenarios. Commit message tells a clear story; diff is the minimum needed. Every acceptance-criteria checkbox is genuinely satisfied, not weasel-satisfied. The slice respects ADR-0001, ADR-0002, ADR-0004, ADR-0005, ADR-0008, ADR-0009, ADR-0011, ADR-0012, ADR-0013, ADR-0014. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "Do not return `YES` unless you are 100% confident a senior dev would approve."

If either gate returns `NO`:
- Relay the failing gate's NAMED concern to the shipping agent. **Address that concern only — no unrelated structural changes (that risks regressing the gate that previously passed).**
- The shipping agent restructures, re-implements, re-runs feedback loops.
- Re-dispatch BOTH gates with the new diff (always both — fixing one may regress the other).
- Up to 3 re-plan loops TOTAL per slice across both gates combined.
- After the 3rd failed re-plan, instruct the shipping agent to abort: comment on issue #<N> (final diff summary, both gate verdicts, what was tried each round), issue stays OPEN, branch UNPUSHED, return verbatim:
  `[BLOCKED] #<N>: gate <Elegance|SeniorDev> failed after 3 re-plans — <one-line reason>`

NEVER weaken a gate verdict from `NO` to `YES` without genuinely re-implementing. If the gate-checker's reasoning seems wrong (rare), the correct move is to re-implement in a way that makes the gate trivially YES — not to argue with the gate.

---

CONSTRAINTS (orchestrator)
- NEVER edit code. NEVER run typecheck/build/test directly. NEVER read a slice diff yourself — gate-checkers read diffs. If you find yourself doing any of these, you have drifted out of role — stop and dispatch a subagent.
- Never modify a parent PRD or any issue body. Never invent new issues. Never merge to `main`.
- Skip any open issue labeled `hitl` (#27, #28) — leave it open; post `[BLOCKED] #<N>: HITL — needs human` on it once (subsequent turns skip silently).
- If a subagent returns `[BLOCKED]`, `[SCOPE CREEP]`, or `[SUBAGENT FAILED]`, log it and proceed with the next ready slice next turn. Do not investigate, do not retry the same slice — that's a human's job.
- Worktree hygiene: after a slice closes, remove its worktree (`git worktree remove <PATH>`). On Windows this can fail with "Filename too long" on deep `node_modules` paths — it still UNREGISTERS the worktree; delete the leftover directory with PowerShell `Remove-Item -LiteralPath "\\?\<ABS_PATH>" -Recurse -Force` (NOT `cmd /c rmdir /s` — the harness blocks the `/s` token). Then `git branch -d slice-<NN>-<KEBAB>` locally (the remote branch stays for the user's stack review). For BLOCKED / SCOPE_CREEP / FAILED slices, LEAVE the worktree for human inspection. Step 0 prunes records the user cleaned manually.

SKILLS THE ORCHESTRATOR USES
- `superpowers:dispatching-parallel-agents` — every turn, to fan out shipping agents and gate pairs.
- `superpowers:using-git-worktrees` — one isolated worktree per parallel subagent.
- Nothing else. The orchestrator is dispatch + log only.

SKILLS THE SHIPPING SUBAGENTS USE (inlined in their prompt)
- `superpowers:writing-plans`, `superpowers:test-driven-development` (denial-test-first), `supabase-postgres-best-practices-RED`, `typescript-advanced-types-RED`, `keep-it-lean` (ALWAYS), `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `verify`, `diagnose`.
- NOT `superpowers:dispatching-parallel-agents` — a shipping subagent cannot fan out.

POST-QUEUE HUMAN STEPS (record in the sentinel turn's summary; not orchestrator work)
- `superpowers:requesting-code-review` on the full RLS policy surface BEFORE #28 executes (highest-stakes surface), then #27 (SMTP) and #28 (cutover + deploy-verify + post-cutover `improve-database-architecture` exit audit) per their issue bodies.
- The user fast-forwards the reviewed stack to `main` in dependency order (#18 → {#19, #20, #22} → {#21, #25} → {#23, #24} → #26) and relays #18's issue number to the Phase-4 planning session.

CAP
Stop after 5 orchestrator turns (each dispatches up to K=3 shipping subagents; cap = ceil(11 slices / 3) + 1, and the DAG's critical path #18→#19→#21→#23→#26 is exactly 5 turns deep) OR when the success / halt sentinel is emitted, whichever first. At cap, emit:
`GOAL CAP HIT after 5 turns — <X> slices closed, <Y> remaining`
