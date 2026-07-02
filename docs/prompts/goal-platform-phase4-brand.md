GOAL — Ship every AFK slice of the Phase-4 brand system (initiative `platform-phase4-brand-2026-07`): structured tokens + the single serializer, product-motion sheet + reduced-motion coverage, login animation modules, the admin-shell de-brand, and the base module + zod-guarded token-override merge (the brand-is-DATA path), on stacked branches, Forge green at every commit.

Parent PRDs:
- #29 — PRD — Phase 4: Brand system (https://github.com/Vack99/RED-2.0/issues/29) · mirror: `docs/prds/prd-brand-system.md`

Slices in scope (labeled `platform-phase4-brand-2026-07` + `ready-for-agent`):
- #30 S0 — Structured brand tokens + the single serializer (forge/red, CSS-equivalence proven) — no blockers (turn-1 ready)
- #31 S1 — @gym/ui product-motion sheet + prefers-reduced-motion in both apps (Skeleton repair) — no blockers (turn-1 ready)
- #32 S2 — Login animation modules: Forge sequence extracted; module-optional contract + reduced-motion final-frame — blocked by #30, #31
- #33 S3 — Admin shell de-brand (copy/themeColor/lockups/toaster/favicon) + local RED-admin proof + bundle delta re-record — blocked by #32
- #34 S4 — Token-override zod schema + module⊕overrides merge + base module + DEFAULT_BRAND='base' + fixture exit demo — blocked by #30, #33 (scheduled LAST by design)

NOT in the queue (labeled `hitl`, NEVER dispatch, skip + comment once): #35 (brand fidelity sign-off vs the RED mock, admin-change approval, base copy voice, real-device reduced motion, live RED-admin go-live post-Phase-3-swap). It gates nothing in this queue; the queue completes without it. There is NO cross-initiative blocker: the exit demo drives a FIXTURE override object through the real merge path (grill (f)); Phase 3's #18 seeds the real rows but blocks nothing here.

External coordination (do not "fix"): this initiative executes IN PARALLEL with Phase 3 (`platform-phase3-rls-2026-07`). NEVER touch Phase-3-owned surfaces: `packages/brand/src/resolve-brand-id.ts` (sync→async swap is theirs), `packages/brand/src/host-map.ts` (NEVER add rows — Phase 3 deletes it at the gym_domain swap), either app's `proxy.ts` (ZERO proxy edits; any need is a cross-initiative blocker, never a parallel edit), and the HOST_TO_BRAND import/describe block + index re-export in the brand test/index. Split-file contract: Phase 4 owns the "@gym/brand registry" describe block (census + DEFAULT_BRAND assertions) and any NEW index exports; the blocks are disjoint — if a pull-rebase hits a Phase-3 edit in a split file, rebase resolves it. Phase 4 OWNS `brand-id.ts`, `registry.ts`, the new base module, the override merge, and BOTH apps' `layout.tsx` (rebase hotspot — Phase 3 never edits layouts). The `brand ✗→ data/domain` cruiser edge is FROZEN for both phases (zod enters via the workspace catalog — no cruiser edit). Depend only on the pinned `x-brand` header — never on the resolver's signature or the host-map's existence.

Pinned header contract (both phases build against this — quote it, honour it): the proxy stamps `x-gym` = the resolved tenant id/slug (NEW, Phase 3 adds it; presentation/UX only, NEVER authz — the ADR-0008 hinge) and `x-brand` = a registry key (today stamped from the static host-map; = the gym row's `brand_module_id` once Phase 3's DB lookup lands), ALWAYS validated in the layout via `Object.hasOwn` with `DEFAULT_BRAND` fallback — `DEFAULT_BRAND`'s value is Phase 4's grill (e) lock: `'base'`. Phase 3 stamps; Phase 4's layouts read both and never re-resolve.

---

THIS SESSION IS THE ORCHESTRATOR ONLY
- The orchestrator NEVER edits code, NEVER runs typecheck/build/test, NEVER reads diffs itself.
- All shipping work happens inside subagents dispatched via the Agent tool (`subagent_type` general-purpose).
- MODEL SELECTION (per CLAUDE.md's ranking): shipping subagents default `model: opus` (taste ≥ 7 — every slice here is user-facing chrome, motion, or the module API). Slice #30 (mechanical token restructuring behind a TDD'd serializer) ships on `model: sonnet` (bulk/clear-spec — cheapest capable); if its gates fail once on quality, re-dispatch on `model: opus` without asking. Gate-checkers and finalizers default `model: opus`; for #34 ONLY (the injection guard + the DEFAULT_BRAND flip — the phase's highest-stakes diff) dispatch the gate pair on `model: fable`. Never Haiku. (Codex/gpt-5.5 is NOT installed — no `codex exec`.)
- GATE MODEL — FRESH-EYES (chosen for this initiative; a hostile-payload guard on a `dangerouslySetInnerHTML` sink and a visible de-brand of the live operator's shell are the high-stakes case it exists for): the shipping subagent implements and commits but does NOT self-grade, squash, push, or close. The ORCHESTRATOR dispatches the two gate-checkers itself, in parallel, as separate agents with fresh context, then finalizes via SendMessage back to the shipping agent (it still holds the worktree context). Only WHO dispatches the gates differs from the default protocol — the verbatim gate prompts, the discipline, and the 3-re-plan cap are identical.
- Each shipping subagent gets its own git worktree based on its blocker's branch (or `origin/main` if it has no blocker — see step 7), owns its slice end-to-end, and returns its branch name + a diff summary.
- Orchestrator context per turn = prune worktrees, fetch queue, exclude parents, parse blockers, resolve base branches, dispatch shipping agents, dispatch gate pairs, relay verdicts, log one-line outcomes. Keep it dispatch + log.

END STATE
- Every in-scope slice (`ready-for-agent` AND `platform-phase4-brand-2026-07`, not a parent PRD) is CLOSED with a squashed commit on its own branch pushed to `origin`.
- `main` is NEVER touched. Dependent branches are STACKED on their blocker's branch (not on `main`) — the user reviews per branch and fast-forwards the stack to main in dependency order (solo-main workflow: no PRs).
- Sentinel emitted verbatim when the queue is empty:
  `PHASE4-BRAND GOAL COMPLETE — all AFK slices closed (platform-phase4-brand-2026-07)`
- If the queue is non-empty but every remaining slice is gated on an open dependency that cannot proceed (a `[BLOCKED]` slice, an `hitl` issue), emit instead:
  `PHASE4-BRAND GOAL HALTED — remaining slices gated on non-closeable blockers`
- Immediately AFTER emitting the sentinel (success OR halted), log `git worktree list` and, for each non-empty worktree, the slice number + last verdict + its base branch (the user's one-glance pickup list; the stack merge order is {#30, #31} → #32 → #33 → #34, order-free relative to Phase 3's stack).

SKIP LIST (issues to leave OPEN and untouched)
- None. (#35 is excluded by the `hitl` label, not the skip list.)

---

PER-TURN ALGORITHM (orchestrator)

0. `git worktree prune` — idempotent cleanup of stale tracking records.
1. Fetch the open queue:
   `gh issue list --repo Vack99/RED-2.0 --label ready-for-agent --label platform-phase4-brand-2026-07 --state open --json number,title,body`
2. Drop any number in the SKIP LIST (none today).
3. EXCLUDE parent PRDs: build the set of issue numbers referenced in any in-scope slice's `## Parent` section (bare `#<n>` anywhere in that section) and drop any candidate in that set OR carrying a `prd`/`epic` label. (#29 carries `ready-for-agent` — this step is what keeps it out of the queue.)
4. For each candidate, parse its `## Blocked by` section: take ONLY lines that BEGIN with `#<n>`. Verify each blocker CLOSED via `gh issue view <N> --json state`. READY iff every blocker is CLOSED (or none).
5. If READY set is empty:
   - If any remaining slice has a blocker that is OPEN and not closeable (a `[BLOCKED]` slice, an `hitl` issue), emit the HALT sentinel and STOP.
   - Else emit the SUCCESS sentinel and STOP.
   - Either way, log the worktree summary described in END STATE.
6. Pick up to K = 3 slices from the READY set. Selection rule: prefer slices whose closure unblocks the most open downstream slices. Tie-break by smallest scope.
7. RESOLVE THE BASE BRANCH for each selected slice:
   - No blockers → base `origin/main`.
   - Blockers (all CLOSED) → base is the blocker's branch: `git fetch origin`, then `git ls-remote --heads origin "*slice-<blockerNN>-*"` (or re-derive `slice-<blockerNN>-<blockerKEBAB>` from the blocker's title).
   - DIAMOND (multiple blockers) → base on the topologically-deepest blocker (`<BASE_REF>`); pass the rest as `<EXTRA_BLOCKER_BRANCHES>` for the subagent to `git merge` before editing. (Concretely: #32's base is #30's branch, merging #31's; #34's base is #33's branch — which already contains #30 via the stack #30→#32→#33 — with no extra merge needed.)
8. For each selected slice, dispatch a shipping subagent (SHIPPING SUBAGENT PROMPT below) IN PARALLEL within a single orchestrator response. Worktree path: `../RED-2.0-wt/slice-<NN>-<kebab>` (NN = issue number). Use `superpowers:dispatching-parallel-agents` + `superpowers:using-git-worktrees`.
9. Wait for the shipping agents to return (branch + diff summary; the harness notifies — do NOT poll, do NOT sleep).
10. FRESH-EYES GATES per returned slice: dispatch the two gate-checkers IN PARALLEL as separate fresh-context agents (`model: opus`; `model: fable` for #34's pair — see MODEL SELECTION), verbatim GATE CHECKS below; each gets the worktree path, `<BASE_REF>`, the issue body, and computes `git -C <PATH> diff <BASE_REF>..HEAD` itself.
    - BOTH YES → SendMessage the verdicts back to the shipping agent: it squashes, pushes, posts the issue comment, closes the issue, and returns `closed #<N> on slice-<NN>-<kebab> @ <short-sha>`.
    - Any NO → SendMessage the failing gate's named concern back to the shipping agent; it re-implements and re-runs feedback loops; re-dispatch BOTH gates on the new diff. Up to 3 re-plan loops TOTAL per slice, then instruct the shipping agent to abort per the gate block (`[BLOCKED]` return; branch unpushed; comment posted).
11. Log ONE line per slice outcome:
   - `closed #<N> on slice-<NN>-<kebab> @ <short-sha>`
   - `[BLOCKED] #<N>: <reason>` · `[SCOPE CREEP] #<N>: <reason>` · `[SUBAGENT FAILED] #<N>: <reason>`
12. Loop to step 0.

---

SHIPPING SUBAGENT PROMPT (the orchestrator inlines `<N>`, `<NN>`, `<KEBAB>`, `<PATH>`, `<TITLE>`, `<BASE_REF>`, `<EXTRA_BLOCKER_BRANCHES>`, and the full issue body each dispatch)

```
You are a shipping subagent for slice #<N> of the Phase-4 brand system (platform-phase4-brand) initiative.

Title: <TITLE>
Parent PRD: https://github.com/Vack99/RED-2.0/issues/29
Worktree: <PATH>
Branch (you create this): slice-<NN>-<KEBAB>
Base branch (you branch FROM this): <BASE_REF>
Extra blocker branches to merge in (diamond DAGs only, else blank): <EXTRA_BLOCKER_BRANCHES>

You work ONLY inside this worktree. The orchestrator session never touches files.

Issue body (read in full before doing anything):
<INLINED ISSUE BODY>

CONTEXT (read these BEFORE editing anything)
- The parent PRD mirror `docs/prds/prd-brand-system.md` — including all ten grill locks (a)–(j) under Implementation Decisions and the "### Design principles" section (the keep-it-lean clause + the Phase-4 Named present-need exceptions) which binds every diff in this initiative.
- `CONTEXT.md` — domain glossary (es-MX) + the multi-tenant vocabulary rows (marca, contrato de marca, módulo de marca, módulo base, token overrides, the "A escala" paragraph). Use these terms in commits and gate inputs. Do not invent synonyms.
- ADRs under `docs/adr/`. Load-bearing for this initiative: ADR-0008 (the hinge — host/brand is presentation-only, NEVER authz; one shared deployment), ADR-0011 §1/§6 (JIT raw-TS packages; the ONE cross-package boundary — `brand ✗→ data/domain` is FROZEN; zod arrives via the workspace catalog, no cruiser edit), ADR-0012 + its amendments (THE mechanism ADR: §3 dark-safe `<style>` injection and no `:root` in globals.css; brand is CODE / per-gym is DATA; the Forward-looking base-module + ⊕-merge design you are EXECUTING; the rejected list — no BrandSource/BrandModule<T>/React brand context/theme-provider — do not relitigate). CITE ADR-0012, never edit it — EXCEPT slice #34's short "Amended: (Phase 4)" pass (pull-rebase and check for Phase-3 edits to the file first).
- `~/.claude/skills/improve-codebase-architecture/LANGUAGE.md` — architectural vocabulary (Module, Interface, Depth, Seam, Deletion test).
- Next 16 has breaking changes vs your training data — read the relevant guide in `node_modules/next/dist/docs/` before writing any Next code (icon routes, metadata/viewport APIs included). AGENTS.md carries the Husky-v9 caveat (NEVER run `husky` with an argument).
- The repo's `.agents/skills/vercel-react-best-practices` + `vercel-composition-patterns` rule-packs — reference them for rerender/bundle perf and component API shape on the animation/logo/chrome work.
- Invoke `typescript-advanced-types-RED` when shaping the token/override type surfaces (the ~28-key contract enum × independent light/dark is real mapped/template-literal territory).
- Invoke `frontend-design` on taste-bearing surfaces (login animations, lockups, RED-admin chrome).
- TDD is non-negotiable on the pure targets (`superpowers:test-driven-development`): the serializer, the override schema, the merge, the registry census — failing test first, like resolveBrandId was.
- Invoke `keep-it-lean` before calling the diff done (ALWAYS, every slice): deletion test on every new module, no-op test on comments/commit message. The PRD's Named present-need exceptions are the ONLY licensed structure.
- Invoke `verify` for the observable claims — no-FOUC and reduced-motion are driven in a real browser (forge.localhost / red.localhost dev hosts; an unmapped host for the base demo), not asserted.
- ZERO database work: no migrations, no RLS, no Supabase MCP tools, no resolver/proxy/host-map edits — any DB touch is Phase-3 scope leakage and an automatic `[SCOPE CREEP]`.
- Do NOT invoke (cargo-cult for a zero-schema frontend track): improve-database-architecture, supabase-postgres-best-practices-RED, any mcp__supabase__* tool, sector-map, prototype, to-map/to-findings/to-health, improve-codebase-architecture, migrate-to-shoehorn, superpowers:brainstorming.

EXECUTION
- `git -C <PATH> fetch origin`, then create your branch off YOUR BASE: `git -C <PATH> checkout -b slice-<NN>-<KEBAB> <BASE_REF>`. For diamond DAGs, `git -C <PATH> merge <each EXTRA_BLOCKER_BRANCH>` before editing. (Branching off `main` when you have a blocker leaves your tree without the blocker's code and makes your acceptance criteria unsatisfiable.)
- Start with `superpowers:writing-plans` scoped to THIS slice (the PRD + issue body are the spec) — a short TDD task plan before code.
- Explore the relevant repo area first — do NOT assume structure; confirm the brand package tree and both apps' layouts/stylesheets with your own eyes.
- Run feedback loops continuously: `pnpm lint` && `pnpm typecheck` && `pnpm test` (and `pnpm build` before finalizing app-touching slices). Iterate until every acceptance-criteria checkbox is satisfiable.
- Use `superpowers:systematic-debugging` when something fails unexpectedly.
- If a slice contains 2+ independent sub-tasks, do them sequentially in your own context. You CANNOT dispatch sub-agents.

HANDOFF (fresh-eyes protocol — you do NOT self-grade)
- When every acceptance-criteria checkbox is satisfiable and the shields are green, run `superpowers:verification-before-completion` (`pnpm lint && pnpm typecheck && pnpm test`, exit 0), commit your work on the branch (NOT squashed yet), and return: your branch name, `<BASE_REF>`, and a ≤10-line diff summary. Do NOT squash, push, comment, or close yet.
- The orchestrator dispatches two independent gate-checkers on your diff. You will receive their verdicts by message:
  - BOTH YES → squash to ONE commit relative to your base (`git -C <PATH> reset --soft <BASE_REF>`, single commit; subject `<type>(<scope>): <summary> — closes #<N>`; body = terse description + both gate verdicts, 1 sentence each). Push: `git -C <PATH> push -u origin slice-<NN>-<KEBAB>`. DO NOT open a PR. DO NOT merge to main. Post ONE comment on issue #<N> with: every acceptance criterion ticked, command-output excerpts (and screenshot/DOM evidence for the observable criteria), both gate verdicts + reasoning + quoted hunks + concerns + ADR checklists, branch name + origin URL. Close: `gh issue close <N>`. Return verbatim: `closed #<N> on slice-<NN>-<kebab> @ <short-sha>`
  - Any NO → address the failing gate's NAMED concern only (no unrelated restructuring), re-run feedback loops, and report back for gate re-dispatch. After the 3rd failed re-plan total: post a comment on issue #<N> (final diff summary, both verdicts, what was tried each round), leave the issue OPEN, leave the branch UNPUSHED, return `[BLOCKED] #<N>: gate <Elegance|SeniorDev> failed after 3 re-plans — <one-line reason>`.

CONSTRAINTS (shipping subagent)
- Touch only files within this slice's stated scope. If scope creep is required: post `[SCOPE CREEP] <reason>` comment on the issue, leave issue OPEN, branch UNPUSHED, return `[SCOPE CREEP] #<N>: <reason>`.
- Never merge to `main`. `main` is read-only for you.
- Never finalize with failing typecheck / build / test.
- Never modify a parent PRD or any other open issue's body. Never invent new issues.
- Never edit Phase-3-owned surfaces: `resolve-brand-id.ts`, `host-map.ts` (never add rows), either app's `proxy.ts`, the HOST_TO_BRAND import/describe block or index re-export. Depend on the `x-brand` header only.
- No repo-wide `forge` renames — the grill ruled the de-brand sites IN one by one; product naming (forge-* classes/keyframes, `@gym/ui/forge/*` subpaths, storage keys) stays.
- Never weaken acceptance criteria. If a criterion can't be met, abort with `[BLOCKED]`.
```

---

GATE CHECKS (orchestrator dispatches these as two SEPARATE fresh-context agents, in parallel, per slice — verbatim prompts; paraphrase-sensitive)

Each gate-checker receives: the worktree path `<PATH>`, `<BASE_REF>`, the issue body, and these instructions. It computes the slice diff itself: `git -C <PATH> diff <BASE_REF>..HEAD` (NOT `main..HEAD` — a stacked slice's base is its blocker's branch, and diffing against main would fold in the blocker's code too). It reads, with fresh adversarial intent: the full slice diff, the issue body (acceptance criteria), the relevant ADRs and `CONTEXT.md`, the PRD mirror `docs/prds/prd-brand-system.md` (incl. Design principles), and LANGUAGE.md.

**Discipline binding both gates (non-negotiable):**
- Each verdict (YES or NO) MUST quote at least one specific diff hunk that supports it. Verdicts without a quoted hunk are disqualifying — re-prompt the gate.
- Even when returning YES, the gate-checker MUST enumerate 1-3 specific concerns it considered and rejected. Returning YES with an empty concerns list is disqualifying.
- Each gate MUST conclude with a one-line YES/N/A per ADR: `<ADR-ID>: YES/N/A — <2-7 words>`.
- Reasoning capped at 3 sentences per gate (the concerns list, hunk quote, and ADR checklist do not count toward that cap).

**Gate 1 — Elegance Check**
Prompt the gate-checker with verbatim:
> "Is every change in this slice considered the most elegant approach overall? Apply the deletion test on any new Module: 'if I delete this, does complexity vanish (it was a pass-through, bad) or concentrate (it earned its keep, good)?' Check naming uses CONTEXT.md domain vocabulary and LANGUAGE.md architectural vocabulary — no 'service', 'helper', 'utils' where a domain noun applies. Check Locality: related code lives together; types used by one Module live with it. Check there is no cleverness for cleverness's sake — the minimum diff needed to satisfy the acceptance criteria. This work favors YAGNI and KISS: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared' / base module with a single caller in this diff — DRY and SOLID do not justify structure the criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception must name its concrete present need; unnamed single-caller abstraction is a failure. **Named present-need exceptions (Phase 4 — these structures are REQUIRED by the acceptance criteria and PASS the gate; reject structure BEYOND them):** (1) the neutral `base` brand module — its consumer is the phase's own exit criterion (a gym with no dedicated code module renders from base + row data); (2) the zod token-override schema — it guards an existing dangerouslySetInnerHTML sink in BOTH apps' layouts, a real injection surface today; (3) the module-baseline ⊕ row-overrides merge/serializer — its legitimate second producer exists in-phase (ADR-0012 recorded that tokensToCss was inlined in Phase 2 precisely because it had one caller; that condition ends now); (4) animation modules — two concrete in-phase members (the Forge login sequence extracted from login-form.tsx; the extant RED ignition) plus the cross-package forge-flash Skeleton dependency to repair. Anything beyond this list — a third brand, brand presets, a theming DSL, an override editor or authoring surface, a config package — fails the gate. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "Do not return `YES` unless you are 100% confident this is the most elegant approach overall."

**Gate 2 — Senior Dev Approval**
Prompt the gate-checker with verbatim:
> "Stop for a second and think: would a senior dev approve this slice as the sole reviewer? Check: tests target the Interface (external behaviour), not implementation internals. No `as any`, no `@ts-expect-error` without a one-line justification. No TODO/FIXME passed on without a linked issue. No premature optimization, no defensive code for impossible scenarios. Commit message tells a clear story; diff is the minimum needed. Every acceptance-criteria checkbox is genuinely satisfied, not weasel-satisfied. The slice respects ADR-0001, ADR-0008, ADR-0011, ADR-0012. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
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
- Skip any open issue labeled `hitl` (#35) — leave it open; post `[BLOCKED] #<N>: HITL — needs human` on it once (subsequent turns skip silently).
- If a subagent returns `[BLOCKED]`, `[SCOPE CREEP]`, or `[SUBAGENT FAILED]`, log it and proceed with the next ready slice next turn. Do not investigate, do not retry the same slice — that's a human's job.
- Worktree hygiene: after a slice closes, remove its worktree (`git worktree remove <PATH>`). On Windows this can fail with "Filename too long" on deep `node_modules` paths — it still UNREGISTERS the worktree; delete the leftover directory with PowerShell `Remove-Item -LiteralPath "\\?\<ABS_PATH>" -Recurse -Force` (NOT `cmd /c rmdir /s` — the harness blocks the `/s` token). Then `git branch -d slice-<NN>-<KEBAB>` locally (the remote branch stays for the user's stack review). For BLOCKED / SCOPE_CREEP / FAILED slices, LEAVE the worktree for human inspection. Step 0 prunes records the user cleaned manually.

SKILLS THE ORCHESTRATOR USES
- `superpowers:dispatching-parallel-agents` — every turn, to fan out shipping agents and gate pairs.
- `superpowers:using-git-worktrees` — one isolated worktree per parallel subagent (this initiative runs in parallel with Phase 3's — worktree isolation is what keeps the two stacks from colliding locally).
- Nothing else. The orchestrator is dispatch + log only.

SKILLS THE SHIPPING SUBAGENTS USE (inlined in their prompt)
- `superpowers:writing-plans`, `superpowers:test-driven-development` (serializer/schema/merge/census test-first), `typescript-advanced-types-RED`, `frontend-design`, `keep-it-lean` (ALWAYS), `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `verify`, `diagnose`.
- NOT `superpowers:dispatching-parallel-agents` — a shipping subagent cannot fan out.

POST-QUEUE HUMAN STEPS (record in the sentinel turn's summary; not orchestrator work)
- `superpowers:requesting-code-review` (fable-5/opus-4.8) on the full brand surface — the override schema + merge + both layouts especially — BEFORE #35's sign-offs.
- The user fast-forwards the reviewed stack to `main` in dependency order ({#30, #31} → #32 → #33 → #34; order-free relative to Phase 3's stack) and then walks #35: RED-mock fidelity, admin-change approval, base copy voice, real-device reduced motion, and — after Phase 3's gym_domain swap has shipped — the live RED-admin go-live.

CAP
Stop after 5 orchestrator turns (each dispatches up to K=3 shipping subagents; the DAG's critical path #30→#32→#33→#34 is 4 turns deep, +1 slack) OR when the success / halt sentinel is emitted, whichever first. At cap, emit:
`GOAL CAP HIT after 5 turns — <X> slices closed, <Y> remaining`
