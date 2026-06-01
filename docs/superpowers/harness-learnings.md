# Harness Learnings Ledger

**Purpose.** A running, durable capture of every lesson from building Forge that should
shape the **back-half "shipping" skill** (the architecture → working-app half of the harness;
the front half is the already-extracted `sector-map` skill). Forge is the proving ground; this
ledger is how its lessons survive across sessions so the skill is built from *accumulated,
reinforced* learnings — not reconstructed from memory.

**How to use this file (every session, not just skill-building ones):**
1. While working, when you hit a real lesson — a mistake, a gotcha, a "the harness should have
   prevented this" — note it.
2. At the **end of every session**, append a dated entry below (newest at the bottom). Keep each
   lesson as a triplet: **What happened · Why it matters · Skill implication** (how the back-half
   skill should encode/prevent it). Reference artifacts by path; don't duplicate them.
3. The **skill-creation session** (GOAL B / N+2) reads this ledger top-to-bottom as the primary
   input to `write-a-skill`, alongside the audit doc.

**Do not duplicate — reference these existing sources:**
- The architecture audit's **7 harness implications** (the structural payload):
  `docs/superpowers/audits/2026-05-31-forge-architecture-audit-learnings.md`
- The proven orchestration shape (orchestrator + 2 fresh-eyes gates, local issue store):
  `docs/prompts/goal-forge-supabase-finish.md`, `docs/prompts/resume-forge-migration.md`
- Prior cycle handoffs: `docs/superpowers/handoffs/2026-05-29-*`, `2026-05-30-*`, `2026-05-31-*`
- The `sector-map` skill (front half, the template to mirror): `~/.claude/skills/sector-map/`

---

## 2026-05-31 — architecture audit + HIGH-cluster hardening session

**Structural lessons** — captured in full in the audit doc (the 7 implications). Reference, don't
re-list. One-line reminder of the through-line: *the single enforced dependency boundary catches
import **direction**, not concept **duplication** or contract **honesty** — the back-half skill's
headline gate must add those two.*

**Process lessons:**
- **Validate the OUTPUT before codifying the PROCESS.** We almost extracted the skill on faith;
  auditing Forge's actual architecture first turned every flaw into a concrete skill gate. *Skill
  implication:* the skill should open with a "audit a reference output before trusting the
  template" step, and ship its own adversarial-audit workflow. ([[forge-validate-before-codify]])
- **Fix the output first, extract second.** Forge embodies its own lessons now, so the extracted
  skill is cut from a clean reference. *Skill implication:* document this ordering as the
  recommended way to evolve the skill from each new project.
- **Thin seam over fat when the alternative duplicates the domain.** The audit literally flagged
  "rule re-coined in two places" as finding #1; a full-plpgsql RPC would have re-coined the money
  math in SQL on the very repo that showcases that audit. We chose the thin RPC (math stays in
  tested TS). *Skill implication:* a gate — "does this change duplicate a tested domain rule in a
  second language/layer? prefer the seam that keeps it single-source."
- **Aim for good-enough that showcases the harness, not perfection.** ([[forge-good-enough-not-perfectionist]])
  *Skill implication:* the skill should calibrate every gate to the project's stated goal, not an
  abstract ideal — and say so.

**Operational gotchas (bake into the skill's "execution mechanics"):**
- **Commit messages: `git commit -F <file>`, never a multi-line `-m` here-string.** PowerShell
  `@'...'@` repeatedly mangled messages into bogus pathspecs (failed commits). The `-F` temp-file
  approach worked every time.
- **`packageManager` must match the on-disk pnpm/workspace.** Pinning `pnpm@9.x` against a pnpm-11
  `pnpm-workspace.yaml` (which has only `allowBuilds`, no `packages:`) breaks every script with
  `ERROR packages field missing or empty`. Pin to the actual local version (here `pnpm@11.0.9`).
  ([[forge-pnpm-add-prefer-offline]])
- **Don't over-batch tool calls.** When one call in a parallel batch fails, the harness cancels all
  siblings — a wall of "Cancelled…" that looks like many failures but is one. Keep DB/commit/verify
  steps in small batches.
- **After ANY live-DB DDL: immediately mirror SQL → `supabase/migrations/`, regen + write
  `database.types.ts`, run `get_advisors`, and commit — in the same step.** We deployed RPCs and
  stopped, creating a live-DB↔repo drift (the audit's own finding #7, lived in real time). *Skill
  implication:* make "mirror + regen + advisor + commit" an atomic, non-skippable sub-step of any
  schema slice; a slice with applied-but-unmirrored DDL is NOT done.
- **Classifier-gated actions are HITL by design:** bulk push to a new public repo, and DDL on a
  live/public DB, each need explicit operator authorization. *Skill implication:* the skill should
  mark these as operator-gated checkpoints, not agent-autonomous steps.

## 2026-06-01 — atomic-writes wiring (Option A): finishing the deployed-but-inert RPCs

Session N+1's STEP 1: resolve the live-DB↔repo drift by wiring the two atomic-write RPCs
(`registrar_venta`, `toggle_pase`). Done + verified; 5 commits on `master` (`cc9c427` →
`b3b9fe9`). Gates green throughout (lint 69 modules · typecheck · test 60/60 · build 10 pages);
`get_advisors(security)` still only the leaked-password item. Lessons, as triplets:

**Verification / correctness lessons:**
- **A silently-wrong tool name fails OPEN, not closed.** Early calls used bare `execute_sql` /
  `apply_migration` (the real names are `mcp__supabase__*`). They returned "No such tool available"
  — easy to skim past — and I'd already *written a migration file reconstructing the RPC bodies from
  memory*. That guess was wrong on real columns (`user_id` not `perfil_id`; no `ultima_visita`;
  `asistencias` soft-delete). *Skill implication:* before authoring ANY mirror/derived artifact from
  a remote source, the source fetch must have **succeeded with returned data** — never reconstruct a
  function/schema from memory when the canonical text is one `pg_get_functiondef` away. Gate:
  "mirror = verbatim from a confirmed read, never from inference."
- **Tests assert against the system's OWN truth, not a plausible proxy.** Two smoke-test failures
  were the *test's* fault, not the code's: (1) I seeded the JWT `sub` with `perfil.id`, but RLS +
  the FK key on `auth.users.id` — `perfil` has a separate `user_id`; (2) I used the DB's UTC
  `current_date` as "today", but `toggle_pase` correctly stamps `hora` only for *Chihuahua-local*
  today (UTC was already tomorrow at ~01:30Z). Both looked like RPC bugs. *Skill implication:* when
  a money-path test fails, first falsify the test fixture (identity, clock, tenant) against the real
  system before touching the code; bake the project's tz + auth-identity facts into the test
  template. ([[forge-validate-before-codify]])
- **Smoke-test the seam in a rolled-back txn on the REAL schema + REAL identity before wiring.**
  `begin; set local role authenticated; set request.jwt.claims …; <assert with RAISE>; rollback;`
  proved every case (new/existing client, finite/ilimitado/mes, toggle on/off, back-dated,
  zero-balance guard) against prod data at zero cost and zero writes. This is the executing-test
  the audit's finding #3 demands. *Skill implication:* ship this rolled-back-assert pattern as the
  default DB-behavior test when no local Docker/pgTAP harness exists.

**Canonical-provisioner lessons (finding #7, lived twice more):**
- **Repo migration VERSIONS must equal prod's `schema_migrations` exactly — filename is the key.**
  I applied DDL via MCP (which auto-versions, e.g. `…010843`) and separately wrote a repo file with
  a guessed name (`…011045`). Merge/push key off the version string, so a mismatch = prod re-runs or
  diverges. Fix: read `list_migrations` and name the repo file with the SAME version. *Skill
  implication:* "apply → immediately read back the assigned version → write the repo file under that
  exact version" is one atomic step; never name a migration file by guess.
- **The from-scratch rebuild proof catches gaps `get_advisors` can't.** Replaying the whole repo
  migration set into a throwaway schema (empty → asserted object count) exposed that the
  `rls_auto_enable` SECURITY DEFINER event-trigger guard lived ONLY in prod (created out of band) —
  yet a migration *revoked* on it. A clean build would have failed at the revoke and shipped without
  the auto-RLS guard. No advisor flags a missing-create; only a rebuild does. *Skill implication:*
  make "replay all migrations from empty and assert the object set" a blocking gate of any
  schema-touching slice — it's the only check that proves the repo (not the live DB) is the source
  of truth. Without local Docker, a rolled-back replay into a `_rebuild` schema is the fallback.
- **DROP+CREATE silently re-grants Supabase default privileges (incl. `anon`).** Reordering
  `registrar_venta`'s params required DROP+CREATE; that re-granted EXECUTE to `anon` on the
  money-path RPC. `get_advisors` did NOT flag it; my own grant-diff query did. *Skill implication:*
  after any function DROP+CREATE, re-assert the grant set (and diff against a sibling function);
  treat "default privileges re-applied" as a known post-condition to scrub.

**Process / mechanics lessons:**
- **`git add -A` swept an uncommitted `.commitmsg` into the tree.** The `-F` temp-file commit habit
  (good, from last session) + a broad `git add -A` = the message file got committed. Fix: `.commitmsg`
  is now gitignored. *Skill implication:* the `-F` pattern must pair with **gitignoring** the temp
  file (or staging explicit paths, never `-A`).
- **Verify the committed ARTIFACT verbatim, not just the logic.** My first RLS test file mixed psql
  `\set` (won't run via MCP) with `current_setting()`. I re-ran the exact file bytes through
  `execute_sql` to confirm it passes as-written. *Skill implication:* a test artifact isn't "done"
  until its literal on-disk content has been executed green by the path it documents.
- **The thin-RPC choice keeps the domain single-sourced — but the TS↔SQL twin is now a real seam to
  watch.** `consumirClase` (TS) and `toggle_pase`'s guarded decrement (SQL) state the same rule in
  two languages. We kept both (live path needs the SQL transaction) and cross-linked their docstrings
  rather than deleting the tested TS. *Skill implication:* when a tested domain rule is necessarily
  mirrored into a seam (SQL/edge), require a bi-directional doc link + a "keep in lockstep" note — the
  honesty the audit's finding #1 is about. ([[forge-harness-audit-lessons]])

**Still open for Aaron (HITL, unchanged from the handoff):** publish to GitHub
(`gh repo create vack99/forge --public --source=. --remote=origin --push`); enable leaked-password
protection in the Supabase dashboard. **N+2 remains the skill-extraction session** — this ledger is
its input.

## 2026-06-01 (cont.) — second improve-codebase-architecture pass: deepening the post-wiring seams

After the atomic-writes wiring, ran `improve-codebase-architecture` again (4 Explore agents → 1
adversarial Opus verifier → synthesis) on the NOW-current code, then fixed all surfaced findings.
6 findings, all adversarially CONFIRMED against committed code (verifier re-read every cited
file:line + checked findings 2/3 against the LIVE function bodies). 4 commits on `master`
(`3f8d8f9` → `5e5337c`); tests 60→76; one DB CHECK applied+mirrored (`20260601022323`); advisors
still only leaked-password. Lessons, as triplets:

**Orchestration / process lessons (the headline this session):**
- **Grilling is theatre when there's no genuine design fork — orchestrate the determined work
  instead of checkpointing it.** I over-asked the human: confirmation questions on findings whose
  shape was already fixed by an in-repo precedent (phone → mirror the `metodo` single-home) or by the
  audit's own prescribed remediation (DAL seam → default-arg client). Aaron pushed back hard:
  *"stop doing so many interruptions/human checkpoints when they are not necessary… if the work can
  easily be assigned to an agent you should clearly do so as an orchestrator."* *Skill implication:*
  the back-half skill needs an explicit **fork test** before any human checkpoint — "is there a
  decision the user's answer changes, that I can't resolve from the repo, a precedent, or the
  audit?" If no → dispatch a fix agent, review, gate, commit, move on. Reserve checkpoints for
  genuine forks, and even then lead with a senior recommendation, not a blank question.
  ([[forge-orchestrate-dont-over-checkpoint]])
- **Triage findings into "determined" vs "fork" up front, then batch the determined ones by
  file-overlap.** #1+#6+#3 were one coherent seam-deepening move on the same files → ONE agent, not
  three parallel (parallel edits to `ventas.ts`/`asistencia.ts` would collide). #2 (ADR + SQL test)
  and #5 (clientes.ts + new module) were file-disjoint → ran in parallel. *Skill implication:* the
  orchestration step should compute a file-overlap graph and serialize colliding work, parallelize
  disjoint work — never fan out agents that write the same file.
- **Adversarial verification before committing design effort is cheap insurance.** One Opus verifier
  (told to REFUTE, default-skeptic) re-checked all 6 findings against real code + live DB before any
  fix ran; it confirmed all 6 but sharpened #2 (ADR-0005 already honestly excuses rule (a), so the
  gap is only (b)/(c)) — which changed how the fix was scoped. *Skill implication:* keep the
  find → adversarially-verify → fix pipeline; the verifier's job is to catch overstated findings and
  wrong citations, and it paid off by narrowing one.

**Review-the-agent's-work lessons:**
- **Always read the agent's diff, don't just trust its green gates.** The DAL-seam agent left an
  orphaned JSDoc: it inserted the new `SupabaseServer` type BETWEEN `createClient`'s doc-comment and
  `createClient`, so the doc now described the type. Gates were green (it's cosmetic) — only reading
  the diff caught it. Also vetted a scary 335-line `clientes.ts` diff and confirmed it was pure
  re-indentation (arrow body shifted when `cache(async () =>` became `cache(\n async (client?) =>`),
  not logic churn. *Skill implication:* "agent reports green" is necessary, not sufficient — the
  orchestrator must diff-review every agent change for doc-locality, gratuitous reformatting, and
  scope creep before committing.
- **Re-run committed test artifacts verbatim against the live system yourself.** The fix agents
  reported their SQL tests passed; I still re-ran `toggle_pase_rules.sql`'s bytes through
  `execute_sql` against live before committing (got "toggle_pase rules: OK"). Same discipline as last
  session's RLS artifact. *Skill implication:* an executable test artifact is only "done" once the
  orchestrator has watched its literal committed form pass on the real target.

**Architecture / depth lessons (feed the skill's quality bar):**
- **A second architecture pass on a freshly-hardened codebase still finds real depth gaps — the
  audit's fixes don't exhaust them.** The first audit fixed import-direction + duplication + atomicity;
  this pass found the orthogonal axis the boundary still can't see: **testability-as-interface-depth**
  (the DAL was untestable by construction because the client was inlined, not injected) and
  **contract-honesty in seams we'd JUST built** (ADR-0005 over-claimed "math in tested TS" the moment
  the attendance rules moved to SQL). *Skill implication:* re-audit AFTER each hardening pass, not
  once; and add two standing lenses to the back-half skill — "can every module be tested through its
  interface (is the seam injectable)?" and "does every doc/ADR claim still match the code it
  describes after this change?"
- **Don't reclaim a rule into TS if the live path won't call it — that just re-creates the
  TS↔SQL twin.** Tempting fix for #2 was to lift the attendance rules into tested domain functions;
  but `togglePase` only calls the RPC, so any TS rule would be a dead orphan exactly like
  `consumirClase` already is. The honest move was to OWN them in the RPC + give them a committed SQL
  test, and fix the ADR's over-claim. *Skill implication:* the "single-home a rule" gate must check
  WHERE THE LIVE PATH RUNS IT — homing a rule in a layer no caller exercises is duplication wearing a
  tidiness costume. ([[forge-harness-audit-lessons]])

## 2026-06-01 (cont.) — THIRD improve-codebase-architecture pass: deepening + a validation-gate-before-design discipline

Ran the skill a third time on the post-2nd-pass code. Shape: an adversarial **workflow** (9 lens
finders → per-finding skeptic verify → completeness critic; 38 agents, 28 findings, 22 survived as
genuinely-new) → then, at Aaron's instruction, a **second holistic Opus validation gate** over the
whole survivor set → triage determined-vs-fork → fix. 9 commits on `arch/third-deepening-pass`
(`da0aa3b`→`dafe3e2`); tests **76→93**; gates green throughout (typecheck · lint 76 modules · build 10
pages). NOT pushed, NOT merged to master. Findings shipped: #1 pase `porVencer` (a real bug — see
below), #2 `shapeFicha` extraction, #3 `MetodoPago` single-home, #4 slim dashboard read + `resumirRoster`,
#5 hard-coded-year fix, #7d `resolverIdentidad`, #7f dead `Urgencia.score` removal, #7g README, #6 cobro
advisory note. Lessons, as triplets:

**Audit / depth lessons:**
- **A re-audit after two hardening passes STILL surfaced the headline failure class — at NEW sites.**
  Prior pass #3 unified the urgency *numbers* into the domain, but the `por_vencer` *projection* was
  still re-coined: `getClientesParaPase` inlined `diasRest <= 5` and **silently dropped the `clases <= 2`
  half**, so a low-clases/high-días cliente got no VENCE warning on the pase while the directorio flagged
  them por_vencer — two screens disagreeing, a real operator-visible bug the boundary + tests never saw.
  *Skill implication:* the concept-duplication gate must reconcile a named rule against **every** read
  path, not just the one a prior fix touched; "single-home a rule" isn't done until each sibling
  read/screen consumes the same derivation. ([[forge-harness-audit-lessons]])
- **The two bug fixes both lived in untestable places** (a `cache()` DAL closure; a client-component
  string literal `... 2026`). Extracting the pure cores (`derivarPaseCliente`, `shapeFicha`, `fmtEyebrow`)
  made each bug assertable. *Skill implication:* the testability lens pays off as bug-prevention, not just
  tidiness — pure-core extraction is how a latent bug becomes a failing test.

**Validation / process lessons (the headline this session):**
- **Validate the validators before investing design effort — a holistic second gate caught a per-finding
  verifier's own mistake.** The workflow's #1 verifier conflated the *correct* ficha días-color
  (`diasRest <= 5`, legitimately days-specific) with the *lossy* pase flag, and its proposed
  `estado === "por_vencer"` fix would have been a **regression** (por_vencer is a días-OR-clases union →
  would paint the días tile yellow on a clases-only shortage). A single Opus reviewer reading the whole
  survivor set together caught it; per-finding verifiers can't see cross-finding errors. *Skill
  implication:* after the per-finding adversarial pass, run ONE holistic validation over the full set
  before any code changes; treat verifier verdicts as claims to re-check, not ground truth.
  ([[forge-validate-before-codify]])

**Orchestration lessons:**
- **"Orchestrate to subagents" can mean ONE well-specced sequential agent, not N parallel.** The remaining
  6 findings all collided on shared files (`types.ts`/`ventas.ts`/`clientes.ts`/`clientes.tsx`/`rules.ts`/
  `inicio/page.tsx`) and git commits serialize regardless — so parallel fan-out buys nothing and risks
  clobbering. Handed the determined batch to a single background **Opus** agent with a precise per-finding
  spec (incl. the validated regressions-to-avoid) that gated + committed each; main session reviewed every
  diff after. *Skill implication:* when findings overlap files, the context-saving orchestration move is one
  sequential agent that offloads the editing, reserving parallel fan-out for file-disjoint work.
  ([[forge-orchestrate-dont-over-checkpoint]])
- **Triage determined-vs-fork; only ONE finding (#6 cobro) was a genuine product fork.** Gating venta
  intake on `cobro.acepta_*` is new money-path behavior, not a refactor — surfaced as Aaron's call (shipped
  only an advisory docstring), everything else was dictated by ADR/precedent/the audit and dispatched
  without a checkpoint.

**Technical gotcha (bake into the skill):**
- **A `cache()`-wrapped DAL read can't be unit-tested through React's cache outside a request, and routing
  a money-path writer through one would break the injected-fake test.** #7d single-homed the operator-identity
  defaults as a PURE `resolverIdentidad` applied at each read site (getPerfil, ventas, ficha) rather than
  forcing all reads through the `cache()`-wrapped `getPerfil`. *Skill implication:* "single-home a rule"
  must respect the test seam — home the pure rule and let each I/O caller apply it; don't collapse I/O onto
  one cached read just for DRY.

## 2026-06-01 (cont.) — back-filled: two learnings that lived only in the handoffs (registry gap-fill)

The 3rd-pass registry sweep (`docs/superpowers/shipping-skill-registry.md`, "Gaps found") flagged two
load-bearing lessons captured in earlier handoffs but never promoted into this ledger as triplets.
Registered here so the write-a-skill input is complete; provenance cited.

**Front-half "archaeology" — load-bearing for the back half too (front-half origin):**
- **What happened:** the mock targets this repo's VENDORED Next 16 / `@supabase/ssr`, whose APIs differ
  from training data (`proxy.ts` not `middleware.ts`, `await cookies()`, 2-arg `revalidateTag(tag,'max')`,
  `getClaims()` not `getSession()`); and the cloned mock hid 3 pre-existing react-hooks eslint errors.
  Both bit early — handoffs `2026-05-29-next-cycle` + `-05-30`; the rule is encoded in `AGENTS.md`.
- **Why it matters:** a shipping slice writes real code against those exact API shapes — guessing from
  training data produces code that won't build, and inherited lint errors masquerade as the slice's own.
- **Skill implication:** the back-half slice template must OPEN with an archaeology step — read the
  relevant guide in `node_modules/<framework>/dist/docs/` before writing against an API, heed deprecation
  notices, and run `eslint .` (the lint + boundary gate) on the untouched mock FIRST to baseline
  pre-existing errors. A front-half lesson that gates every back-half slice.

**Three self-inflicted orchestration mistakes (migration "Operational notes", `2026-05-30`):**
- **What happened:** (a) re-running only ONE fresh-eyes gate after a fix let a regression through (fixing
  one dimension can regress the other); (b) running my own inline edits on files a dispatched subagent
  also owned created duplicate `types.ts` declarations (TS merged them, the build passed; only a
  duplicate-identifier grep caught it); (c) guessing a migration `version`/commit sha before it existed
  produced wrong values (#6/#7 filenames, #8 sha).
- **Why it matters:** each is a silent failure green gates do NOT catch — a regressed gate, a
  build-passing duplicate, a wrong-but-plausible version string.
- **Skill implication:** bake three rules into the orchestration loop — (a) after ANY fix, re-dispatch
  BOTH fresh-eyes gates, never only the one that failed; (b) ONE subagent owns its files end-to-end — the
  orchestrator never inline-edits a file an agent is mid-edit on (reinforced this 3rd pass by delegating
  the whole determined batch to a single sequential agent); (c) read back the assigned migration
  `version` / real sha AFTER the operation, never write either before it exists. ((c) and
  review-the-agent's-diff were already in the 2026-06-01 entries; (a) and (b) are the new promotions.)

<!-- Append the next session's entry below this line. -->
