GOAL: ship the Forge client branding & seed initiative — every `ready-for-agent` slice labeled `forge-client-branding-2026-07` closed, each on its own pushed branch, main untouched.

Parent PRDs:
- #83 — PRD — Forge client branding & seed: calm-gold dark client, F-mark landing ignition, real program + content (mirror: `docs/prds/prd-forge-client-branding.md`)

Slices in scope (labeled `forge-client-branding-2026-07`):
- #84 — Forge client goes calm-gold dark, RED glows brand-scoped (no blockers) — kebab `dark-brandscope`
- #85 — F-mark landing ignition + Forge tagline (no blockers) — kebab `fmark-ignition`
- #86 — Real forge seed — program, CLASE INDIVIDUAL, contact, marketing copy (no blockers; SCHEMA slice) — kebab `forge-seed`
- #87 — forge-demo mirror — full content, demo coaches, client host row (blocked by #86; SCHEMA slice) — kebab `forge-demo-mirror`

NOT in scope: #83 (parent PRD — never "ship" it), #88 (`hitl` exit gate — human's, skip + comment once).

---

THIS SESSION IS THE ORCHESTRATOR ONLY
- The orchestrator NEVER edits code, NEVER runs typecheck/build/test, NEVER reads diffs.
- All shipping work happens inside Opus subagents dispatched via the Agent tool (`subagent_type` general-purpose, `model: opus`).
- Each shipping subagent gets its own git worktree based on its resolved base branch, owns its slice end-to-end, and returns ONE LINE (or `READY FOR GATES …` under the fresh-eyes protocol below).
- FRESH-EYES GATES (this run's authorized protocol): shipping subagents do NOT self-grade. The ORCHESTRATOR dispatches Gate 1 + Gate 2 as separate fresh-context Opus agents per returned slice, then relays verdicts back to the shipping agent via SendMessage.
- Orchestrator context per turn = prune worktrees, fetch queue, exclude parents, parse blockers, resolve bases, dispatch, gate, log. Constant. Sustainable.

LIVE-DB CONTRACT (binds every agent in this run)
- **ZERO live DDL/DML during this run.** The live Supabase project is READ-ONLY for every agent. The repo's Supabase MCP is bound to LIVE (`hjppxawglmukfvsgmcog`) — NEVER `apply_migration`/`execute_sql` writes through it. All migrations + seeds ship as FILES on the slice branch; the owner batch-applies the stack ONCE after the queue (POST-QUEUE HUMAN STEPS).
- Every migration is verified on a THROWAWAY SCRATCH PROJECT via the denial-suite runner's `SUPABASE_TARGET_REF` override (Supabase branching is Pro-gated, 402; the free tier fits exactly ONE scratch project beside live). Therefore AT MOST ONE schema slice per turn (#86 and #87 are chained, so this is automatic). The schema-slice agent CREATES its own scratch project, applies its base branch's migrations first, then its own, runs `pnpm test:denial` (`SUPABASE_TARGET_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial`), and DELETES the scratch before returning — mechanism proven in Phase-5/6 schema slices' issue comments.
- `SUPABASE_ACCESS_TOKEN` lives in `apps/admin/.env.local` of the MAIN checkout (`C:\Users\Aaron\Documents\Repos\RED-2.0`) — gitignored; worktrees NEVER inherit it; read it from the main checkout path. If missing, abort `[BLOCKED]`.
- The runner refuses the live ref by design. Never destructive SQL anywhere.

END STATE
- Every in-scope slice is CLOSED with a squashed commit on its own branch pushed to `origin`.
- `main` is NEVER touched. #84/#85/#86 base on `origin/main`; #87 is STACKED on #86's branch (its only blocker) and is not independently mergeable. The user merges in dependency order (#86 before #87) and reviews per branch.
- Sentinel emitted verbatim when the queue is empty:
  `FORGE CLIENT BRANDING QUEUE COMPLETE — all slices closed, branches pushed, main untouched`
- If the queue is non-empty but every remaining slice is gated on something that cannot proceed (a `[BLOCKED]` slice, an `hitl` issue), emit instead:
  `FORGE CLIENT BRANDING HALTED — remaining slices gated; human input needed`
- Immediately AFTER emitting either sentinel, log `git worktree list` and, per surviving worktree, the slice number + last verdict + base branch (the user's one-glance pickup list / merge order).

SKIP LIST (issues to leave OPEN and untouched)
- None. (#88 is excluded by its `hitl` label, #83 by the parent-PRD exclusion.)

---

PER-TURN ALGORITHM (orchestrator)

0. `git worktree prune`.
1. Fetch the open queue:
   `gh issue list --repo Vack99/RED-2.0 --label ready-for-agent --label forge-client-branding-2026-07 --state open --json number,title,body`
2. Drop SKIP LIST numbers (none).
3. EXCLUDE parent PRDs: drop any candidate whose number appears in an in-scope slice's `## Parent` section (bare `#<n>` match) OR that carries a `prd`/`epic` label. (#83 dies here if it ever enters the queue.)
4. For each candidate, parse `## Blocked by`: take ONLY lines that BEGIN with `#<n>` (ignore mid-prose mentions). Verify each blocker CLOSED via `gh issue view <N> --json state`. READY iff every blocker is CLOSED or none exist.
5. If READY set is empty:
   - Any remaining slice blocked by an OPEN, non-closeable issue (a `[BLOCKED]` slice, an `hitl` issue) → emit the HALT sentinel and STOP.
   - Else → emit the SUCCESS sentinel and STOP.
   - Either stop path: log the worktree summary from END STATE.
6. Pick up to K = 3 from the READY set, hard constraint: AT MOST ONE schema slice (#86, #87) per turn. Selection rule: prefer slices whose closure unblocks the most open downstream slices (#86 unblocks #87); tie-break smallest scope. Turn 1 is expected to be #84 + #85 + #86; turn 2 is #87.
7. RESOLVE THE BASE BRANCH per selected slice:
   - No blockers → `origin/main`.
   - Blockers (all CLOSED) → the blocker's branch: `git fetch origin`, then `git ls-remote --heads origin "*slice-<blockerNN>-*"` (#87 → `origin/slice-86-forge-seed`).
   - No diamonds exist in this DAG.
8. Dispatch the selected shipping subagents IN PARALLEL in a single response (Agent tool, `subagent_type` general-purpose, `model: opus`). Worktree path: `C:\Users\Aaron\Documents\Repos\RED-2.0-wt\slice-<NN>-<kebab>`. Kebabs: 84 dark-brandscope, 85 fmark-ignition, 86 forge-seed, 87 forge-demo-mirror. Use `superpowers:dispatching-parallel-agents` + `superpowers:using-git-worktrees`.
9. Wait for returns. The harness notifies — do NOT poll, do NOT sleep.
10. FRESH-EYES GATES per returned `READY FOR GATES` slice: dispatch Gate 1 + Gate 2 (verbatim prompts below) IN PARALLEL as separate fresh-context agents (`model: opus`). Each gate gets: worktree path, `<BASE_REF>`, issue number + body, and computes its own diff (`git -C <PATH> diff <BASE_REF>..HEAD`). Relay both verdicts to the shipping agent via SendMessage; it finalizes (both YES) or re-plans (any NO, max 3 loops total).
11. For each final verdict, log ONE line to chat:
   - `closed #<N> on slice-<NN>-<kebab> @ <short-sha>`
   - `[BLOCKED] #<N>: <reason>`
   - `[SCOPE CREEP] #<N>: <reason>`
   - `[SUBAGENT FAILED] #<N>: <reason>`
12. Worktree hygiene: after a slice CLOSES, `git worktree remove <PATH>`; on Windows "Filename too long" still UNREGISTERS — then delete leftovers with PowerShell `Remove-Item -LiteralPath "\\?\<ABS_PATH>" -Recurse -Force` (never `cmd /c rmdir /s`). Then `git branch -d slice-<NN>-<kebab>` locally (the origin branch survives). Leave BLOCKED/CREEP/FAILED worktrees in place for the human.
13. Loop to step 0.

---

SHIPPING SUBAGENT PROMPT (the orchestrator inlines `<N>`, `<NN>`, `<KEBAB>`, `<PATH>`, `<TITLE>`, `<BASE_REF>`, and the full issue body each dispatch)

```
You are an Opus shipping subagent for slice #<N> of the Forge client branding & seed initiative.

Title: <TITLE>
Parent PRD: https://github.com/Vack99/RED-2.0/issues/83
Worktree: <PATH>
Branch (you create this): slice-<NN>-<KEBAB>
Base branch (you branch FROM this): <BASE_REF>

You work ONLY inside this worktree. The orchestrator session never touches files.

Issue body (read in full before doing anything):
<INLINED ISSUE BODY>

CONTEXT (read these BEFORE editing anything)
- The parent PRD's mirror: `docs/prds/prd-forge-client-branding.md` — the spec; its Implementation Decisions are locked rulings, not suggestions.
- `CONTEXT.md` — domain glossary + architectural vocabulary. Use these terms in commits and gate inputs; do not invent synonyms.
- ADRs (each is a locked decision — do not relitigate): ADR-0001 (proxy.ts not middleware, server-only DAL, getClaims/getUser never getSession, RLS-as-boundary), ADR-0002 (derived-not-stored), ADR-0005 (atomic write RPCs: SECURITY INVOKER, SET search_path TO '', EXECUTE to authenticated), ADR-0008 (platform multitenant, gym RLS, brand modules), ADR-0010 (absolute starts_at, derived occupancy, week materialization), ADR-0011 (JIT packages + cross-package boundary, enforced by dependency-cruiser), ADR-0012 (host→inquilino→marca; brand module = tokens + logo + copy{name,description,tagline?} + appIcon + at most one bespoke animation; brand is CODE, personalization is DATA; SSR-inlined token `<style>`; header never an authz input; `@gym/brand` ✗→ `@gym/data`/`@gym/domain`), ADR-0013 (RLS-by-membership predicates, initplan-cached).
- This is NOT the Next.js you know: read the relevant guide in `node_modules/next/dist/docs/` before writing app code; heed deprecation notices.
- Invoke `keep-it-lean` before calling the diff done (ALWAYS, every slice).
- Paint slices (#84, #85): invoke `frontend-design`. The fidelity reference is the FORGE ADMIN app's design language (calm gold-on-black, the existing `@gym/brand` forge module: tokens, F-mark geometry, the login bar-build hero) — NOT the RED mock. RED's client experience must stay byte-identical; brand-contract tokens only, no literal hexes in app code.
- Schema slices (#86, #87): invoke `supabase-postgres-best-practices-RED`; honor the LIVE-DB CONTRACT quoted in this goal's header — LIVE IS READ-ONLY, the Supabase MCP points at LIVE (never write through it), migrations ship as files, scratch-verify via `SUPABASE_TARGET_REF` (create your own scratch project, apply your base branch's migrations first, run `pnpm test:denial`, delete the scratch before returning; token in the MAIN checkout's `apps/admin/.env.local` — worktrees don't inherit it). These are DATA seed migrations — no RPC body changes, so no new denial suites; the run proves regression. Follow the red-demo seed migrations' idempotent self-asserting pattern (RAISE on missing gym row, re-run safe).
- Do NOT invoke (cargo-cult for this initiative): `prototype`, `sector-map`, `improve-codebase-architecture`, `to-map`/`to-findings`/`to-health`, `migrate-to-shoehorn`.
- Live-system facts: gyms `forge` (LIVE REAL GYM — treat its data with respect), `forge-demo` (operator sandbox), `red`, `red-demo`; all tables RLS-on; forge already has 3 paquetes (8 clases $799 / 12 clases $1,199 popular / Ilimitado $1,350) — the seed ADDS, never rewrites them; Husky pre-commit runs `pnpm lint && pnpm typecheck && pnpm test` — NEVER run `husky` with an argument.

EXECUTION
- `git -C <PATH> fetch origin`, then `git -C <PATH> checkout -b slice-<NN>-<KEBAB> <BASE_REF>`.
- Run `superpowers:writing-plans` scoped to THIS slice only, then explore the relevant repo area — do NOT assume structure (the client's brand seam, the `.dark`-scoped glow blocks, the animate logo slot, and the red-demo seed migrations all already exist; reuse their patterns, don't rebuild).
- TDD where the slice introduces testable behavior (`superpowers:test-driven-development`): the failing census/vitest assertion comes BEFORE the change it guards.
- Feedback loops continuously: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Iterate until every acceptance-criteria checkbox is satisfiable (schema checkboxes are satisfied by scratch-verified runs + shipped migration files — live apply is the owner's post-queue step, NOT yours).
- Use `superpowers:systematic-debugging` when something fails unexpectedly; `verify` before handoff on slices with a runtime surface.
- You CANNOT dispatch sub-agents — all work happens in your own context, sequentially.

HANDOFF (fresh-eyes protocol — you do NOT self-grade)
- When acceptance criteria pass and shields are green: COMMIT your work on the branch (do NOT squash, push, comment, or close yet) and return exactly:
  `READY FOR GATES #<N> on slice-<NN>-<KEBAB> base <BASE_REF>`
- Wait for the orchestrator's gate verdicts via SendMessage.
- BOTH YES → `superpowers:verification-before-completion` (run `pnpm lint && pnpm typecheck && pnpm test` one final time, exit 0 required), squash to ONE commit relative to base (`git -C <PATH> reset --soft <BASE_REF>`, single commit), subject `<type>(<scope>): <summary> — closes #<N>`, body = terse description + both gate verdicts (1 sentence each). Push `git -C <PATH> push -u origin slice-<NN>-<KEBAB>`. DO NOT open a PR. DO NOT merge to main. Post ONE issue comment: every acceptance criterion ticked, command-output excerpts, both gate verdicts + hunks + concerns + ADR checklists, branch name. Then `gh issue close <N>` and return verbatim: `closed #<N> on slice-<NN>-<KEBAB> @ <short-sha>`
- Any NO → address ONLY the named concern, re-run feedback loops, return `READY FOR GATES …` again. After the 3rd failed re-plan total: post the abort comment (final diff summary, both verdicts, what was tried), leave issue OPEN, branch UNPUSHED, return `[BLOCKED] #<N>: gate <Elegance|SeniorDev> failed after 3 re-plans — <one-line reason>`

CONSTRAINTS (shipping subagent)
- Touch only files within this slice's stated scope. `packages/brand/**` edits are IN scope for #84/#85 (that's where brand content lives per ADR-0012) — but the brand census stays at three modules, and `@gym/brand` never imports `@gym/data`/`@gym/domain`.
- `apps/admin/**` is OUT of scope for every slice — the admin app is untouched by this initiative.
- If creep is required: post `[SCOPE CREEP] <reason>` on the issue, leave it OPEN, branch UNPUSHED, return `[SCOPE CREEP] #<N>: <reason>`.
- Never merge to `main` — it is read-only for you.
- LIVE DB IS READ-ONLY. Never apply a migration, seed, or any DML to the live project — not through the CLI, not through the Supabase MCP, not even if it seems safe. Scratch only.
- Never finalize with failing lint/typecheck/test. Never run destructive SQL anywhere.
- Never modify a parent PRD or any other issue. Never invent new issues. Never weaken acceptance criteria — abort `[BLOCKED]` instead.
```

---

GATE CHECKS (verbatim — paraphrase-sensitive; the orchestrator pastes these into each gate-checker's prompt)

Compute the slice diff relative to the base branch: `git -C <PATH> diff <BASE_REF>..HEAD` (NOT `main..HEAD` — a stacked slice's base is its blocker's branch, and diffing against main would fold in the blocker's code too).

For each gate, read with fresh, adversarial intent: the full slice diff, the issue body (with acceptance criteria), the relevant ADRs under `docs/adr/`, and `CONTEXT.md`.

**Discipline binding both gates (non-negotiable):**
- Each verdict (YES or NO) MUST quote at least one specific diff hunk that supports it. Verdicts without a quoted hunk are disqualifying — re-prompt the gate.
- Even when returning YES, the gate-checker MUST enumerate 1-3 specific concerns it considered and rejected. Returning YES with an empty concerns list is disqualifying.
- Each gate MUST conclude with a one-line YES/N/A per ADR: `<ADR-ID>: YES/N/A — <2-7 words>`.
- Reasoning capped at 3 sentences per gate (the concerns list, hunk quote, and ADR checklist do not count toward that cap).

**Gate 1 — Elegance Check**
Prompt the gate-checker with verbatim:
> "Is every change in this slice considered the most elegant approach overall? Apply the deletion test on any new Module: 'if I delete this, does complexity vanish (it was a pass-through, bad) or concentrate (it earned its keep, good)?' Check naming uses CONTEXT.md domain vocabulary — no 'service', 'helper', 'utils' where a domain noun applies. Check Locality: related code lives together; types used by one Module live with it. Check there is no cleverness for cleverness's sake — the minimum diff needed to satisfy the acceptance criteria. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "Do not return `YES` unless you are 100% confident this is the most elegant approach overall."

**Gate 2 — Senior Dev Approval**
Prompt the gate-checker with verbatim:
> "Stop for a second and think: would a senior dev approve this slice as the sole reviewer? Check: tests target the Interface (external behaviour), not implementation internals. No `as any`, no `@ts-expect-error` without a one-line justification. No TODO/FIXME passed on without a linked issue. No premature optimization, no defensive code for impossible scenarios. Commit message tells a clear story; diff is the minimum needed. Every acceptance-criteria checkbox is genuinely satisfied, not weasel-satisfied. The slice respects ADR-0001, ADR-0002, ADR-0005, ADR-0008, ADR-0010, ADR-0011, ADR-0012, ADR-0013. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "Do not return `YES` unless you are 100% confident a senior dev would approve."

If either gate returns `NO`:
- Relay the failing gate's named concern to the shipping agent. **It addresses that concern only — no unrelated structural changes (that risks regressing the gate that previously passed).**
- Re-dispatch BOTH gates with the new diff (always re-run both — fixing one may regress the other).
- Up to 3 re-plan loops TOTAL across both gates combined.
- After the 3rd failed re-plan: the shipping agent posts the abort comment and returns `[BLOCKED]` exactly as its prompt specifies.

NEVER weaken a gate verdict from `NO` to `YES` without a genuine re-implementation. If a gate's reasoning seems wrong (rare), the correct move is to re-implement so the gate is trivially YES — not to argue with the gate.

---

CONSTRAINTS (orchestrator)
- NEVER edit code. NEVER run typecheck/build/test directly. NEVER read a slice diff. If you catch yourself doing any of these, you have drifted out of role — stop and dispatch a subagent.
- Never modify a parent PRD or any issue body. Never invent new issues. Never merge to `main`.
- Skip any open issue labeled `hitl` (#88) — leave it open; post `[BLOCKED] #<N>: HITL — needs human` on it once, then skip silently.
- If a subagent returns `[BLOCKED]`, `[SCOPE CREEP]`, or `[SUBAGENT FAILED]`, log it and move on next turn. Do not investigate, do not retry the same slice — that's a human's job.

CAP
Stop after 3 orchestrator turns (each dispatches up to K=3 shipping subagents) OR when the success/halt sentinel is emitted, whichever first. At cap, emit:
`GOAL CAP HIT after 3 turns — <X> slices closed, <Y> remaining`

---

POST-QUEUE HUMAN STEPS (the owner, after the sentinel — not the orchestrator's job)
1. Review + merge branches in dependency order: `slice-84-dark-brandscope`, `slice-85-fmark-ignition`, `slice-86-forge-seed`, then `slice-87-forge-demo-mirror` (stacked on 86).
2. BATCHED LIVE APPLY: manual dump into `C:\Users\Aaron\Documents\RED-2.0-backups\` FIRST (mandatory — free tier, no PITR; mechanism: `docs/runbooks/hitl-28-evidence.md`), then apply the merged #86 + #87 migrations to live in order, `get_advisors` after, spot-check `/reservar` materializes the forge program.
3. #88 HITL exit gate: attach the forge-demo client domain in Vercel, walk the checklist in #88, record the verdict in a runbook, close #88 → that closes out PRD #83.
