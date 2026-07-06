GOAL — Ship every AFK slice of the Phase-6 client app build (initiative `platform-phase6-client-2026-07`): the member-facing RED journey — marketing pages on anon catalog reads, the RED-designed auth screens, real booking (`reservation` + atomic RPCs consuming the existing balance), membresía with honest "paga en tu gym", and the account hub — on stacked branches, Forge admin green at every commit, ZERO live DDL during the run (batched owner apply after the queue).

Parent PRDs:
- #49 — PRD — Phase 6: Client app build (RED) (https://github.com/Vack99/RED-2.0/issues/49) · mirror: `docs/prds/prd-client-app.md`

Slices in scope (labeled `platform-phase6-client-2026-07` + `ready-for-agent`):
- #50 6.1 — Anon catalog foundation + Precios page (decision-(b) policies, red-demo client host row, seed, public shell) — no blockers (turn-1 ready) [SCHEMA]
- #51 6.2 — Comercial landing page — blocked by #50
- #52 6.3 — Nosotros page — blocked by #50
- #53 6.4 — Contacto page + contact_message intake (Turnstile + per-IP limit, minimal admin read) — blocked by #50 [SCHEMA]
- #54 6.5 — Entrar + Restablecer screens (UI over shipped Phase-3 flows) — blocked by #50
- #55 6.6 — Registro screen (claim-by-match untouched, captcha) — blocked by #54
- #56 6.7 — Reservar screen read-only (member agenda read, week picker, class cards) — blocked by #55
- #57 6.8 — Booking core: reservation table + reservar_clase RPC + occupancy repoint — blocked by #56 [SCHEMA]
- #58 6.9 — Mis reservas + cancelar_reserva (overlay shell) — blocked by #57 [SCHEMA]
- #59 6.10 — Clase detail + Confirmada + favorita — blocked by #58 [SCHEMA]
- #60 6.11 — Pasar lista reservation-aware (admin roster, no double consume, walk-in parity) — blocked by #57 [SCHEMA]
- #61 6.12 — Membresía: plan card + change-plan flow (paga en tu gym) — blocked by #58
- #62 6.13 — Perfil hub completion (notifications column, logout) — blocked by #58 [SCHEMA]

The DAG has NO diamonds — every slice has at most one blocker; base resolution is always single-parent.

NOT in the queue (labeled `hitl`, NEVER dispatch, skip + comment once): #63 6.14 — the Phase-6 exit gate (full member-journey walkthrough vs the mock, Forge paint spot-check — human-only, on-device, AFTER the batched live apply).

External coordination (do not "fix"): no parallel initiative is running — but `packages/brand/**` is FROZEN regardless (consume tokens, never edit; ADR-0012/0014 own it). NEVER touch #35 (Phase-7, parked), #27 (SMTP HITL, deferred), #36/#47 or any Phase-3/4/5 evidence docs, or the global `to-goal` skill files. The claim-by-match RPC's accepted-debt item (ADR-0009 amendment I1) is DOCUMENTED DEBT — do not "fix" it. The mock at `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html` is READ-ONLY reference.

Live-DB contract (binding for every schema slice — #50, #53, #57, #58, #59, #60, #62):
- **ZERO live DDL/DML during this run.** The live project is READ-ONLY for every agent. All migrations + seeds ship as files on the slice branch; the owner batch-applies the whole stack ONCE after the queue (POST-QUEUE HUMAN STEPS) — the permission classifier hard-blocks agent live applies anyway, by design.
- Every migration + its RLS denial suite is verified on a THROWAWAY SCRATCH PROJECT via the runner's `SUPABASE_TARGET_REF` override + branch-refusing `apply-sql.mjs` (Supabase branching is Pro-gated, 402). Free tier fits exactly ONE scratch project beside live → the orchestrator dispatches AT MOST ONE schema slice per turn, and each agent CREATES its own scratch project and DELETES it before returning (mechanism proven — see any Phase-5 schema slice's issue comments). A stacked schema slice applies its base branch's migrations to the scratch first, then its own.
- `SUPABASE_ACCESS_TOKEN` lives in `apps/admin/.env.local` of the MAIN checkout (`C:\Users\Aaron\Documents\Repos\RED-2.0`) — it is gitignored and worktrees NEVER inherit it; read it from the main checkout path. If it is missing, abort `[BLOCKED]`.
- `get_advisors` (or its scratch-side equivalent) after every policy/function migration; the `rls_auto_enable` trigger stays on; regenerate `packages/data/src/database.types.ts` from the scratch schema after each migration; NEVER destructive SQL anywhere.
- Cloudflare Turnstile (#53, #55): implement against env-var keys and use Turnstile's documented always-pass TEST sitekey/secret in dev and tests; production keys are an owner post-queue step, not yours.

---

THIS SESSION IS THE ORCHESTRATOR ONLY
- The orchestrator NEVER edits code, NEVER runs typecheck/build/test, NEVER reads diffs.
- MODEL SELECTION (per CLAUDE.md's ranking): every slice in this initiative is user-facing (taste ≥ 7) → shipping subagents run `model: opus` ACROSS THE BOARD, and every slice with a screen (all of them; #60's screen is the admin roster) MUST invoke the `frontend-design` skill. Standing escalation: if a slice's gates fail once on quality grounds, re-dispatch the re-implementation on `model: fable` without asking.
- GATE MODEL — FRESH-EYES: the shipping subagent does NOT self-grade. The orchestrator dispatches the two gate-checkers itself, IN PARALLEL, as SEPARATE agents with fresh context, `model: opus` — EXCEPT for #57 and #60 (the money-path consume slices), whose gates run on `model: fable`.
- Each shipping subagent gets its own git worktree based on its resolved base branch, owns its slice end-to-end, and returns ONE LINE.
- Orchestrator context per turn = prune worktrees, fetch queue, exclude parents, parse blockers, resolve bases, dispatch, gate, log. Constant. Sustainable.

END STATE
- Every in-scope slice is CLOSED with a squashed commit on its own branch pushed to `origin`.
- `main` is NEVER touched. Dependent branches are STACKED on their blocker's branch — the user reviews per branch and fast-forwards the stack to main in dependency order (solo-main workflow).
- Sentinel emitted verbatim when the queue is empty:
  `PHASE6-CLIENT GOAL COMPLETE — all AFK slices closed; batched live apply + #63 (hitl exit gate) await the human`
- If the queue is non-empty but every remaining slice is gated on an open dependency that cannot proceed (a `[BLOCKED]` slice, an `hitl` issue), emit instead:
  `PHASE6-CLIENT GOAL HALTED — remaining slices gated; see per-slice log`
- Immediately AFTER emitting the sentinel (success OR halted), log `git worktree list` and, for each non-empty worktree, the slice number + last verdict + its base branch (the user's one-glance pickup list / merge order).

SKIP LIST (issues to leave OPEN and untouched)
- None. (#63 is excluded via the `hitl` label, not the skip list. #48 is not in this initiative's label — leave it alone.)

---

PER-TURN ALGORITHM (orchestrator)

0. `git worktree prune`.
1. Fetch the open queue:
   `gh issue list --repo Vack99/RED-2.0 --label ready-for-agent --label platform-phase6-client-2026-07 --state open --json number,title,body`
2. Drop any number in the SKIP LIST.
3. EXCLUDE parent PRDs: drop any candidate whose number appears in an in-scope slice's `## Parent` section (bare `#<n>` match) OR that carries a `prd`/`epic` label. (#49 carries `ready-for-agent` — without this step it gets grabbed turn 1.)
4. For each candidate, parse `## Blocked by`: take ONLY lines that BEGIN with `#<n>`. Verify each blocker CLOSED via `gh issue view <N> --json state`. READY iff every blocker is CLOSED (or none).
5. If READY set is empty:
   - If any remaining slice is gated on an OPEN blocker that cannot close (a `[BLOCKED]` slice, an `hitl` issue), emit the HALT sentinel and STOP.
   - Else emit the SUCCESS sentinel and STOP.
   - Either stop path: log the worktree summary from END STATE.
6. Pick up to K = 3 from the READY set, with the hard constraint: AT MOST ONE schema slice (#50, #53, #57, #58, #59, #60, #62) per turn (one scratch project exists). Selection rule: prefer slices whose closure unblocks the most open downstream slices (that means #50 first; later prefer #54→#55→#56→#57 chain progress and #58 over siblings); tie-break smallest scope.
7. RESOLVE THE BASE BRANCH per selected slice:
   - No blockers → `origin/main`.
   - Blocker (CLOSED) → the blocker's branch: `git fetch origin`, then `git ls-remote --heads origin "*slice-<blockerNN>-*"`.
   - (No diamonds in this initiative — `<EXTRA_BLOCKER_BRANCHES>` is always blank.)
8. Dispatch the selected shipping subagents IN PARALLEL in a single response (Agent tool, `subagent_type` general-purpose, `model: opus`). Worktree path: `C:\Users\Aaron\Documents\Repos\RED-2.0-wt\slice-<NN>-<kebab>`. Kebabs: 50 anon-precios, 51 comercial, 52 nosotros, 53 contacto, 54 entrar, 55 registro, 56 reservar-readonly, 57 booking-core, 58 mis-reservas, 59 clase-detail, 60 pasar-lista, 61 membresia, 62 perfil-hub. Use `superpowers:dispatching-parallel-agents` + `superpowers:using-git-worktrees`.
9. Wait for returns. The harness notifies — do NOT poll, do NOT sleep.
10. FRESH-EYES GATES per returned `READY FOR GATES` slice: dispatch Gate 1 + Gate 2 (verbatim prompts below) IN PARALLEL as separate fresh-context agents (`model: opus`; `model: fable` for #57/#60). Each gate gets: worktree path, `<BASE_REF>`, issue number + body, and computes its own diff (`git -C <PATH> diff <BASE_REF>..HEAD`).
    - BOTH YES → SendMessage the verdicts to the original shipping agent: it squashes, pushes, comments, closes, returns the closed line.
    - Any NO → SendMessage the failing gate's named concern (only that) back to the shipping agent; it re-implements and returns `READY FOR GATES` again; re-dispatch BOTH gates. 3 re-plan loops TOTAL per slice, then instruct the agent to abort per the gate block.
11. Log ONE line per outcome:
    - `closed #<N> on slice-<NN>-<kebab> @ <short-sha>`
    - `[BLOCKED] #<N>: <reason>`
    - `[SCOPE CREEP] #<N>: <reason>`
    - `[SUBAGENT FAILED] #<N>: <reason>`
12. Loop to step 0.

---

SHIPPING SUBAGENT PROMPT (the orchestrator inlines `<N>`, `<NN>`, `<KEBAB>`, `<PATH>`, `<TITLE>`, `<BASE_REF>`, and the full issue body each dispatch)

```
You are a shipping subagent for slice #<N> of the Phase-6 client app initiative.

Title: <TITLE>
Parent PRD: https://github.com/Vack99/RED-2.0/issues/49
Worktree: <PATH>
Branch (you create this): slice-<NN>-<KEBAB>
Base branch (you branch FROM this): <BASE_REF>

You work ONLY inside this worktree. The orchestrator session never touches files.

Issue body (read in full before doing anything):
<INLINED ISSUE BODY>

CONTEXT (read these BEFORE editing anything)
- The parent PRD mirror `docs/prds/prd-client-app.md` — the Implementation Decisions section is BINDING (no subscription table; consume-once at booking; anon lands with its consumer; paga-en-tu-gym with zero entitlement writes; no waitlist; the Perfil overlay consolidation is the approved design).
- `CONTEXT.md` — domain glossary (es-MX). Use these terms in code, commits, and gate inputs; do not invent synonyms. `ARCHITECTURE.md` — the package map + enforced dependency boundary.
- ADRs (each is a locked decision — do not relitigate): ADR-0001 (proxy.ts not middleware, server-only DAL, getClaims/getUser never getSession, RLS-as-boundary), ADR-0002 (derived-not-stored), ADR-0004 (saldo = stored running balance; ilimitado = NULL guard), ADR-0005 (atomic write RPCs: SECURITY INVOKER, SET search_path TO '', EXECUTE to authenticated), ADR-0009 (two-tier auth, claim-by-match, RLS read/write matrix — its accepted-debt item I1 stays), ADR-0010 (absolute starts_at, derived occupancy, reservation shape, the three consume rules), ADR-0011 (JIT packages + cross-package boundary), ADR-0012 (host→inquilino→marca; header is UX only, NEVER an authz input), ADR-0013 (RLS-by-membership: is_member_of/is_staff_of/has_role, initplan-cached `(select helper(gym_id))`, one predicate per class).
- This is NOT the Next.js you know: read the relevant guide in `node_modules/next/dist/docs/` before writing app code; heed deprecation notices.
- Invoke `keep-it-lean` before calling the diff done (ALWAYS, every slice).
- Schema slices (#50, #53, #57, #58, #59, #60, #62): invoke `supabase-postgres-best-practices-RED`; honor the Live-DB contract quoted in this goal's header — LIVE IS READ-ONLY, migrations ship as files, scratch-verify via `SUPABASE_TARGET_REF` (create your own scratch project, delete it before returning; token in the MAIN checkout's `apps/admin/.env.local`, worktrees don't inherit it). Regenerate `packages/data/src/database.types.ts` from the scratch schema.
- Screen slices (all): invoke `frontend-design`; the interactive mock at `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html` is the source of truth for layout, behavior, and copy (read the file itself; your screens live in its `data-slot` sections) — brand-contract tokens only: the mock's crimson/neon paint is RED brand, not spec; the dev toolbar/gallery harness, prefilled credentials, and toast-stub integrations are NOT part of the spec; occupancy is DERIVED (the mock's direct spot mutation is mock-only).
- Do NOT invoke (cargo-cult for this initiative): `prototype`, `sector-map`, `improve-codebase-architecture`, `to-map`/`to-findings`/`to-health`, `migrate-to-shoehorn`.
- Live-system facts: gyms `forge` (live), `forge-demo`, `red`, `red-demo` (sandbox: member `demo@red-demo.test`, password in the #45 plan doc; admin-only host row today — #50 adds the client one); all tables RLS-on; Husky pre-commit runs `pnpm lint && pnpm typecheck && pnpm test` — NEVER run `husky` with an argument.

EXECUTION
- `git -C <PATH> fetch origin`, then `git -C <PATH> checkout -b slice-<NN>-<KEBAB> <BASE_REF>`.
- Run `superpowers:writing-plans` scoped to THIS slice only, then explore the relevant repo area — do NOT assume structure (the Phase-3 auth flows, the agenda DAL seams, and the `activosDeSesion()` 0-projection already exist; reuse, don't rebuild).
- TDD is non-negotiable (`superpowers:test-driven-development`): the denial test / failing test comes BEFORE the policy or code it guards, per slice.
- Feedback loops continuously: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Iterate until every acceptance-criteria checkbox is satisfiable (schema checkboxes are satisfied by scratch-verified tests + shipped migration files — live apply is the owner's post-queue step, NOT yours).
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
- LIVE DB IS READ-ONLY. Never apply a migration, seed, or any DML to the live project — not even if it seems safe. Scratch only.
- Never finalize with failing lint/typecheck/test. Never run destructive SQL anywhere.
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
> "This work favors YAGNI and KISS: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared' / base module with a single caller in this diff — DRY and SOLID do not justify structure the criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception must name its concrete present need; unnamed single-caller abstraction is a failure. **Named present-need exceptions (Phase 6):** the `reservation` table + `reservar_clase`/`cancelar_reserva` RPCs (ADR-0005/0010 locked — the consume math is transaction-inseparable); the member-facing agenda reader beside the staff-gated one (two auth contexts, not duplication); the `contact_message` intake table (the public-intake RLS class exists for exactly this surface); the Perfil overlay as ONE component with modes (the approved design's consolidation); single-column additions (favorita, notifications-enabled) on the member row. Anything beyond this list — a booking 'engine', a generic marketing-page/section factory, a notification framework behind a preference flag, a payments abstraction under a UI-only flow — fails the gate."
>
> "Do not return `YES` unless you are 100% confident this is the most elegant approach overall."

**Gate 2 — Senior Dev Approval**
Prompt the gate-checker with verbatim:
> "Stop for a second and think: would a senior dev approve this slice as the sole reviewer? Check: tests target the Interface (external behaviour), not implementation internals. No `as any`, no `@ts-expect-error` without a one-line justification. No TODO/FIXME passed on without a linked issue. No premature optimization, no defensive code for impossible scenarios. Commit message tells a clear story; diff is the minimum needed. Every acceptance-criteria checkbox is genuinely satisfied, not weasel-satisfied. The slice respects ADR-0001, ADR-0002, ADR-0004, ADR-0005, ADR-0009, ADR-0010, ADR-0011, ADR-0012, ADR-0013. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
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
- Skip any open issue labeled `hitl` — leave it open, post `[BLOCKED] #<N>: HITL — needs human` on it once (subsequent turns skip silently). That is #63.
- If a subagent returns `[BLOCKED]`, `[SCOPE CREEP]`, or `[SUBAGENT FAILED]`, log it and proceed with the next ready slice next turn. Do not investigate, do not retry — that's a human's job.
- Worktree hygiene: after a slice closes, `git worktree remove <PATH>`. On Windows "Filename too long" still UNREGISTERS the worktree — afterward delete leftovers with PowerShell `Remove-Item -LiteralPath "\\?\<ABS_PATH>" -Recurse -Force` (do NOT use `cmd /c rmdir /s` — the harness blocks the `/s` token). Then `git branch -d slice-<NN>-<KEBAB>`. For BLOCKED / SCOPE_CREEP / FAILED slices, LEAVE the worktree for human inspection.

SKILLS THE ORCHESTRATOR USES
- `superpowers:dispatching-parallel-agents` — every turn, to fan out.
- `superpowers:using-git-worktrees` — one isolated worktree per subagent.
- Nothing else. The orchestrator is dispatch + gate + log only.

SKILLS THE SHIPPING SUBAGENTS USE (already listed inline)
- `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `keep-it-lean` (ALWAYS), `verify`; `supabase-postgres-best-practices-RED` (schema slices); `frontend-design` (every screen slice); `diagnose` on stubborn failures.
- NOT `superpowers:dispatching-parallel-agents` — a shipping subagent cannot fan out.

POST-QUEUE HUMAN STEPS
1. Review the stack (`/code-review` per branch or on the whole stack), then fast-forward to main in dependency order: #50 → (#51, #52, #53, #54 in any order) → #55 → #56 → #57 → (#58, #60 in any order) → (#59, #61, #62 in any order). Stacked chains may not reorder.
2. BATCHED LIVE APPLY (owner, in-session): manual dump into `C:\Users\Aaron\Documents\RED-2.0-backups\` FIRST (mandatory — free tier, no PITR; mechanism + evidence: `docs/runbooks/hitl-28-evidence.md`), then apply the merged migration stack + red-demo seed to live in order, `get_advisors` after, verify `pnpm typecheck` against regenerated live types.
3. Add production Turnstile keys to the deploy env (the run ships with test keys).
4. Execute #63 (HITL exit gate): the full member-journey walkthrough vs the mock on red-demo, Forge paint spot-check, evidence to the runbook, tick roadmap row 6, close #49.

CAP
Stop after 10 orchestrator turns (each dispatches up to K=3 shipping subagents, max one schema slice per turn) OR when the success / halt sentinel is emitted, whichever first. At cap emit:
`GOAL CAP HIT after 10 turns — <X> slices closed, <Y> remaining`
