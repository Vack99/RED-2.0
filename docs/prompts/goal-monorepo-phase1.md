GOAL — Ship the Phase-1 monorepo conversion (epic #1) as autonomous, gated slices. Behaviour-preserving: Forge builds/lints/typechecks/tests/deploys identically; `main` is never touched.

Repo: Vack99/RED-2.0 · Label: `monorepo-phase1-2026-06` · K=3 parallel · cap 8 turns.
Parent PRD: #1 (mirror: docs/prds/prd-monorepo-conversion.md).

Slices (blockers in parens):
#2 S0 scaffold (—) → #3 domain (#2), #4 format (#2) → #5 data (#3,#4), #6 ui (#3) → #7 apps/admin (#5,#6) → #8 cutover (#7) → #9 deploy-verify (`hitl` — skip, human-only).

---

THIS SESSION = ORCHESTRATOR ONLY. Never edit code, run builds, or read diffs. Each turn: dispatch shipping subagents (Agent tool, `subagent_type` general-purpose, `model: opus`) in isolated git worktrees, log one line each, loop. A dispatched subagent has no Agent tool, so it runs its own gates.

PER TURN:
1. `git worktree prune` and `git fetch origin`.
2. Fetch the queue: `gh issue list --repo Vack99/RED-2.0 --label ready-for-agent --label monorepo-phase1-2026-06 --state open --json number,title,body`.
3. Drop `prd`/`epic`-labeled issues and any number referenced in another slice's `## Parent`. Skip `hitl` issues (comment `[BLOCKED] #9: HITL — needs human` once on #9, then ignore).
4. A slice is READY iff every `## Blocked by` line that *begins* with `#N` is CLOSED (`gh issue view N --json state`).
5. READY empty → log `git worktree list`, emit `MONOREPO-PHASE1-ALL-SLICES-SHIPPED ✅` (or `MONOREPO-PHASE1-HALTED-NEEDS-HUMAN ⛔` if the only remaining blockers are open + non-closeable), STOP.
6. Dispatch up to K=3 READY slices, preferring those that unblock the most others. Each subagent gets worktree `../red-wt/slice-<N>-<kebab>` and its BASE branch: `origin/main` if no blocker, else the blocker's branch (`git ls-remote --heads origin "*slice-<blockerN>-*"`); for multiple blockers, base on the deepest and pass the rest to merge.
7. Wait for returns (the harness notifies — don't poll). Log each: `closed #N on slice-<N>-<kebab> @ <sha>` / `[BLOCKED] #N: <reason>` / `[SCOPE CREEP] #N: <reason>`. Loop.

On `[BLOCKED]`/`[SCOPE CREEP]`/failure: log it, leave that worktree for inspection, move on next turn — don't retry (human's job). After a clean close: `git worktree remove <PATH>`; on Windows "Filename too long" use `Remove-Item -LiteralPath "\\?\<ABS_PATH>" -Recurse -Force`; then `git branch -d slice-<N>-<kebab>`.

CAP: stop after 8 turns; emit `GOAL CAP HIT after 8 turns — <X> closed, <Y> remaining`.

---

SHIPPING SUBAGENT PROMPT (orchestrator inlines `<N>`, `<KEBAB>`, `<PATH>`, `<TITLE>`, `<BASE_REF>`, any extra blocker branches, and the full issue body):

```
You are an Opus shipping subagent for slice #<N> of the monorepo conversion (Phase 1). Title: <TITLE>. Parent PRD: github.com/Vack99/RED-2.0/issues/1 (mirror docs/prds/prd-monorepo-conversion.md). Work ONLY inside worktree <PATH>.

Issue body (read in full first):
<INLINED ISSUE BODY>

1. `git -C <PATH> fetch origin && git -C <PATH> checkout -b slice-<N>-<KEBAB> <BASE_REF>` — branch off the BASE (your blocker's branch, NOT main, or you won't have its code). Diamond DAG: `git merge` the extra blocker branches before editing.
2. Read CONTEXT.md + docs/adr/ before editing. This is a behaviour-preserving MOVE: change no behaviour and re-introduce nothing an ADR rejects — especially ADR-0001 (server-only DAL; proxy.ts not middleware; getClaims()/getUser(), never getSession()), ADR-0002 (derived-not-stored), ADR-0008 (Turborepo target shape), ADR-0011 (JIT raw-TS packages + transpilePackages; @gym/* private scope; @gym/format leaf — formatters never in @gym/ui; @gym/data ./server÷./client + server-only travels; one root cross-package dependency-cruiser boundary; Tailwind v4 @source not a content glob; Vitest test.projects; Vercel Root Directory=apps/admin).
3. Implement until every acceptance-criteria checkbox holds. TDD where the slice adds tests. Run continuously until green: `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

GATES — after AC pass, before finalizing. Diff against your base: `git -C <PATH> diff <BASE_REF>..HEAD`. Run BOTH gates yourself, adversarially; each verdict MUST quote a diff hunk and list 1-3 concerns you considered (mandatory even on YES):
- Elegance: "Is every change the most elegant approach overall? Apply the deletion test to any new Module (delete it — does complexity vanish or concentrate?). Naming uses CONTEXT.md/LANGUAGE.md vocabulary (no service/helper/utils where a domain noun fits); related code lives together; the diff is the minimum to satisfy the AC. Return YES/NO, quote a hunk, list 1-3 concerns. Do not return YES unless 100% confident."
- Senior Dev: "Would a senior dev approve this as the sole reviewer? Tests target external behaviour not internals; no `as any`/`@ts-expect-error` without a one-line reason; no stray TODO; minimum diff; every AC genuinely (not weasel-) satisfied; respects ADR-0001/0002/0008/0011. Return YES/NO, quote a hunk, list 1-3 concerns. Do not return YES unless 100% confident."
On NO: fix the named concern, re-run BOTH gates. Max 3 re-plans total; then comment both verdicts and return `[BLOCKED] #<N>: gate failed after 3 re-plans — <reason>`. Never flip NO→YES without re-implementing.

FINALIZE (both gates YES + all AC met): re-run the build loop once (must exit 0); `git -C <PATH> reset --soft <BASE_REF>` then ONE commit `<type>(<scope>): <summary> — closes #<N>` (body = what changed + both gate verdicts); `git -C <PATH> push -u origin slice-<N>-<KEBAB>` (NO PR, never touch main); comment on #<N> with ticked AC + both verdicts + branch URL; `gh issue close <N>`; return verbatim `closed #<N> on slice-<N>-<KEBAB> @ <sha>`.

Scope: touch only this slice's files. If creep is required, comment `[SCOPE CREEP] <reason>`, leave the issue open + branch unpushed, and return `[SCOPE CREEP] #<N>: <reason>`. Never weaken an acceptance criterion or a gate verdict.
```
