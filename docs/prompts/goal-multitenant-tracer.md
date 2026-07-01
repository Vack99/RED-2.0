GOAL — Ship the Phase-2 multi-tenant tracer (epic #10) as autonomous, gated slices. De-risker: prove host→tenant→brand end-to-end on a shared Supabase. Behaviour-preserving for admin (identical render); `main` is never touched; ZERO schema / migration / RLS change.

Repo: Vack99/RED-2.0 · Label: `platform-phase2-tracer-2026-07` · K=3 parallel · cap 6 turns.
Parent PRD: #10 (mirror: docs/prds/prd-multitenant-tracer.md).

Slices (blockers in parens) — a strictly LINEAR chain:
#11 S0 @gym/brand scaffold + Forge relocation (—) → #12 S1 resolveBrandId pure resolver (#11) → #13 S2 apps/client skeleton + full local host→brand proof (#12, #11) → #14 S3 apps/admin symmetric adoption (#13) → #15 S4 docs + shields refresh (#14) → #16 S5 Vercel deploy-verify (`hitl` — EXCLUDED from the queue, human exit gate).

AUTONOMOUS SCOPE = the AFK chain #11→#15 ONLY. The orchestrator ships #11 through #15, then STOPS and hands off to the human for #16. #16 carries `hitl` + `platform-phase2-tracer-2026-07` but NOT `ready-for-agent`, so the per-turn queue fetch (`--label ready-for-agent`) never surfaces it; even if it did, the `hitl` skip-rule excludes it. The AFK agent must NOT do Vercel provisioning.

K note: the DAG is linear, so K=3 yields one READY slice per turn in practice (no parallelism is available on this critical path). K=3 is retained as specified — it is the per-turn dispatch cap, not a promise of parallel work — and would only bind if a future turn surfaced independent ready slices.

---

THIS SESSION = ORCHESTRATOR ONLY. Never edit code, run builds/tests, or read diffs. Each turn: dispatch shipping subagents (Agent tool, `subagent_type` general-purpose, `model: opus`) in isolated git worktrees, log one line each, loop. A dispatched subagent has NO Agent/Task tool, so it runs its own gates in its own context (the authorized self-grading protocol for this run).

PER TURN:
1. `git worktree prune` and `git fetch origin`.
2. Fetch the queue: `gh issue list --repo Vack99/RED-2.0 --label ready-for-agent --label platform-phase2-tracer-2026-07 --state open --json number,title,body`.
3. Drop `prd`/`epic`-labeled issues and any number referenced in another slice's `## Parent` (that excludes epic #10). Skip `hitl` issues: comment `[BLOCKED] #16: HITL — needs human (Vercel deploy-verify)` once on #16 if it ever appears, then ignore. (It should never appear — it lacks `ready-for-agent`.)
4. A slice is READY iff every `## Blocked by` line that *begins* with `#N` is CLOSED (`gh issue view N --json state`). Ignore `#N` mentioned mid-prose.
5. READY empty → log `git worktree list` (+ each non-empty worktree's slice number, last verdict, base branch), then:
   - If the only remaining open in-scope work is #16 (hitl) or a `[BLOCKED]` slice → emit `PHASE2-TRACER-AFK-SLICES-SHIPPED ✅ → HANDOFF TO HUMAN FOR #16 (Vercel deploy-verify — see issue #16 acceptance)` and STOP.
   - If a genuine non-closeable block remains that is NOT the planned #16 handoff → emit `PHASE2-TRACER-HALTED-NEEDS-HUMAN ⛔` and STOP.
6. Dispatch up to K=3 READY slices, preferring those that unblock the most others (tie-break: smallest scope). On this linear chain that is normally exactly one slice.
7. Resolve each slice's BASE branch: `origin/main` if it has no blocker, else the blocker's branch — `git ls-remote --heads origin "*slice-<blockerN>-*"` (or re-derive `slice-<blockerN>-<kebab>` from the blocker's title). Diamond DAGs: base on the deepest blocker, pass the rest as extra branches to `git merge`. Each subagent gets worktree `../red-wt/slice-<N>-<kebab>`.
8. Wait for returns (the harness notifies — don't poll). Log each: `closed #N on slice-<N>-<kebab> @ <sha>` / `[BLOCKED] #N: <reason>` / `[SCOPE CREEP] #N: <reason>` / `[SUBAGENT FAILED] #N: <reason>`. Loop.

On `[BLOCKED]`/`[SCOPE CREEP]`/failure: log it, leave that worktree for inspection, move on next turn — don't retry (human's job). NOTE: this chain is linear, so a blocked slice halts everything downstream; extra turns cannot route around it. After a clean close: `git worktree remove <PATH>`; on Windows "Filename too long" use `Remove-Item -LiteralPath "\\?\<ABS_PATH>" -Recurse -Force` (never `cmd /c rmdir /s`); then `git branch -d slice-<N>-<kebab>`.

DOCS-GUARD TIMING (do not break the green build): the four tree-describing docs — ARCHITECTURE.md, AGENTS.md, CONTEXT.md, README.md — are updated ONLY inside slice #15 (S4), AFTER `apps/client` + `packages/brand` actually exist. Citing not-yet-existent `apps/`/`packages/` paths earlier trips `tools/guards/docs.test.ts`. Slices #11–#14 must NOT touch those four docs for the new paths; #15 updates them and keeps `docs.test.ts` green. This timing is already encoded in each issue body — do not front-run it.

CAP: stop after 6 turns; emit `GOAL CAP HIT after 6 turns — <X> AFK slices closed, <Y> remaining (then hand off to human for #16)`.

---

SHIPPING SUBAGENT PROMPT (orchestrator inlines `<N>`, `<KEBAB>`, `<PATH>`, `<TITLE>`, `<BASE_REF>`, any extra blocker branches, and the FULL issue body incl. its `## Skills` section):

```
You are an Opus shipping subagent for slice #<N> of the Phase-2 multi-tenant tracer (epic #10). Title: <TITLE>. Parent PRD: https://github.com/Vack99/RED-2.0/issues/10 (mirror docs/prds/prd-multitenant-tracer.md). Work ONLY inside worktree <PATH>. The orchestrator session never touches files.

Issue body (read in FULL first — its acceptance criteria + `## Skills` are binding):
<INLINED ISSUE BODY>

CONTEXT (read BEFORE editing anything):
- The parent PRD #10 body + its mirror docs/prds/prd-multitenant-tracer.md, and ADR-0012 (docs/adr/0012-host-brand-resolution.md) — the LOCKED host→brand design.
- CONTEXT.md — the "Plataforma multi-inquilino" domain vocabulary (tenant, host→tenant→brand, brand module/contract). Use these terms in code, commits, and gate inputs; invent no synonyms.
- Every ADR under docs/adr/. Load-bearing for this phase:
  - ADR-0001 — Supabase RLS, no ORM; server-only DAL; `proxy.ts` (NOT `middleware.ts`); `getClaims()`/`getUser()`, never `getSession()`.
  - ADR-0002 — derived-not-stored.
  - ADR-0008 — host resolves brand/UX PRESENTATION only, never authz; brand is presentation-only; 2 deploys + shared DB; a dynamic render for the brand read is accepted.
  - ADR-0011 — JIT raw-TS packages via `transpilePackages` (no `dist/`); private `@gym/*` scope; `@gym/format` leaf; `@gym/data` `./server`÷`./client` + `server-only` travels; ONE root cross-package dependency-cruiser boundary; §6 adds the `@gym/brand ✗→ @gym/data|@gym/domain` edge; §7 defers `packages/config`; Tailwind v4 `@source` (not a content glob); Vitest `test.projects`; Vercel per-app Root Directory.
  - ADR-0012 — host-wins precedence (`HOST_TO_BRAND` hit › `?gym=` override › `DEFAULT_BRAND` 'forge'); read `host` (never `x-forwarded-host`); `resolveBrandId` is a PURE function over values; NO `BrandModule<T>` / provider / context / second theming layer.
- Architectural vocabulary (LANGUAGE.md): Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality, Deletion test.
- Next 16 has breaking changes vs training data — read node_modules/next/dist/docs/ before writing any Next code (proxy.ts is the middleware.ts successor). AGENTS.md carries the Husky-v9 caveat (never run `husky` with an argument).

PER-SLICE SKILLS (the issue's `## Skills` block is authoritative; this is the phase-wide wiring):
- ALWAYS: `superpowers:using-git-worktrees` (you are in an isolated worktree) + `superpowers:verification-before-completion` (CRITICAL — a green `pnpm lint && typecheck && test && build` and the slice's observable proof are the acceptance signal, NOT a claim) + `keep-it-lean` (the YAGNI gate; guard every abstraction against the acceptance criteria).
- `/turborepo-RED` — on every slice that touches `turbo.json` / `package.json` / new-package or new-app wiring (#11, #12, #13, #14). NOT needed for the docs-only slice #15.
- `/tdd` — ONLY on #12 (the pure `resolveBrandId` resolver): write the FAILING test first covering every precedence arm; the rest of the phase is scaffolding. Do NOT apply `/tdd` to any other slice.
- DO NOT INVOKE (cargo-cult for a zero-schema deploy+brand tracer): `supabase-postgres-best-practices-RED`, `typescript-advanced-types-RED`, `sector-map`, `improve-codebase-architecture`, `to-map`, `setup-pre-commit`, `handoff`.

EXECUTION
1. `git -C <PATH> fetch origin && git -C <PATH> checkout -b slice-<N>-<KEBAB> <BASE_REF>` — branch off YOUR BASE (the blocker's branch, NOT `main`, or you won't have its code). Diamond DAG: `git -C <PATH> merge` the extra blocker branches before editing.
2. Explore the relevant repo area (Explore subagent or grep) — do NOT assume structure. This is a thin tracer: ship the minimum diff that satisfies the acceptance criteria and nothing more (no `BrandModule<T>`, no provider/context, no `packages/config`, no second theming layer — the `@gym/ui` CSS-var contract already IS the seam).
3. Implement until every acceptance-criteria checkbox holds. Use `/tdd` where the issue names it (#12 only). Run continuously until green: `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Keep ALL Phase-1 shields green; lint+typecheck+test+build exit 0 per commit. ZERO schema / migration / RLS / cross-gym test — leave `user_id=auth.uid()` policies untouched.

GATES — after AC pass, before finalizing. Compute the slice diff against YOUR base: `git -C <PATH> diff <BASE_REF>..HEAD` (NOT `main..HEAD`). You have no Agent/Task tool, so you run BOTH gates yourself, sequentially, with fresh adversarial intent — re-reading the full diff, the issue body, the relevant ADRs, CONTEXT.md, and LANGUAGE.md. The discipline below IS the review; a lazy YES is the only way it fails.

Discipline binding BOTH gates (non-negotiable):
- Each verdict (YES or NO) MUST quote at least one specific diff hunk. No hunk → disqualified, re-run the gate.
- Even on YES, enumerate 1-3 specific concerns you considered and rejected. Empty concerns list on YES → disqualified.
- Conclude each gate with a one-line YES/N/A per ADR: `<ADR-ID>: YES/N/A — <2-7 words>` for ADR-0001, ADR-0002, ADR-0008, ADR-0011, ADR-0012.
- Reasoning capped at 3 sentences per gate (the concerns list, hunk quote, and ADR checklist do not count).

Gate 1 — Elegance Check. Prompt yourself with verbatim:
> "Is every change in this slice considered the most elegant approach overall? Apply the deletion test on any new Module: 'if I delete this, does complexity vanish (it was a pass-through, bad) or concentrate (it earned its keep, good)?' Check naming uses CONTEXT.md domain vocabulary and LANGUAGE.md architectural vocabulary — no 'service', 'helper', 'utils' where a domain noun applies. Check Locality: related code lives together; types used by one Module live with it. Check there is no cleverness for cleverness's sake — the minimum diff needed to satisfy the acceptance criteria. This slice is a thin tracer: YAGNI and KISS dominate this call. Reject speculative abstraction — any new interface, generic, dependency injection point, indirection layer, or extracted 'shared'/base Module that has a SINGLE caller in this diff FAILS; 'DRY' and 'SOLID' are NOT a licence to add structure the acceptance criteria do not require. The deletion test decides: a one-caller wrapper whose removal makes complexity VANISH is a pass-through — cut it inline. Prefer a little duplication over the wrong abstraction. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "Do not return `YES` unless you are 100% confident this is the most elegant approach overall."

Gate 2 — Senior Dev Approval. Prompt yourself with verbatim:
> "Stop for a second and think: would a senior dev approve this slice as the sole reviewer? Check: tests target the Interface (external behaviour), not implementation internals. No `as any`, no `@ts-expect-error` without a one-line justification. No TODO/FIXME passed on without a linked issue. No premature optimization, no defensive code for impossible scenarios. Commit message tells a clear story; diff is the minimum needed. Every acceptance-criteria checkbox is genuinely satisfied, not weasel-satisfied. The slice respects ADR-0001, ADR-0002, ADR-0008, ADR-0011, ADR-0012. Return `YES` or `NO`. Quote at least one specific diff hunk supporting your verdict. List 1-3 concerns you considered (mandatory even on YES). Conclude with the ADR YES/N/A checklist. Reasoning capped at 3 sentences."
>
> "Do not return `YES` unless you are 100% confident a senior dev would approve."

On NO: address ONLY the failing gate's named concern (unrelated structural changes risk regressing the gate that passed), re-run feedback loops, re-dispatch BOTH gates. Up to 3 re-plan loops TOTAL. After the 3rd failed re-plan: comment on #<N> with the diff summary + both verdicts + what was tried, leave the issue OPEN and branch UNPUSHED, and return `[BLOCKED] #<N>: gate <Elegance|SeniorDev> failed after 3 re-plans — <reason>`. NEVER flip NO→YES without genuinely re-implementing.

FINALIZE (both gates YES + all AC met): use `superpowers:verification-before-completion` — re-run `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` once (must exit 0; if not, you are NOT done). For #15, also confirm `tools/guards/docs.test.ts` is green with the newly-cited paths. Then `git -C <PATH> reset --soft <BASE_REF>` and make ONE commit `<type>(<scope>): <summary> — closes #<N>` (body = what changed + both gate verdicts). `git -C <PATH> push -u origin slice-<N>-<KEBAB>` — DO NOT open a PR, DO NOT merge to `main`. Comment on #<N> with every AC ticked + command-output excerpts + both gate verdicts (reasoning + hunk + concerns + ADR checklist) + branch URL. `gh issue close <N>`. Return verbatim `closed #<N> on slice-<N>-<KEBAB> @ <sha>`.

CONSTRAINTS (shipping subagent)
- Touch only this slice's stated-scope files. If creep is required: comment `[SCOPE CREEP] <reason>` on the issue, leave it OPEN + branch UNPUSHED, and return `[SCOPE CREEP] #<N>: <reason>`.
- Never touch `main`. Never modify a parent PRD or another open issue's body. Never invent issues. Never weaken an acceptance criterion or a gate verdict. Never finalize with a failing build.
- Docs-guard: slices #11–#14 do NOT edit ARCHITECTURE.md/AGENTS.md/CONTEXT.md/README.md for the new `apps/client`/`packages/brand` paths — that is slice #15's job (keep `tools/guards/docs.test.ts` green).
```

---

AFTER THE AFK CHAIN — HUMAN HANDOFF (#16, `hitl`)
Once #15 closes and the success sentinel fires, the autonomous run is DONE. The human then executes slice #16 (S5 Vercel deploy-verify) — the irreducible exit gate the AFK agent cannot do: create the 2nd Vercel project (Root Directory `apps/client`, install command left on auto-detect so `workspace:*` resolves), set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` per project (same shared Supabase), assign the forge + red hosts/domains, and verify each domain renders its brand live with no FOUC and the `@gym/data` factory reaching the shared DB. See issue #16 for the full acceptance. The orchestrator must NEVER attempt #16.
