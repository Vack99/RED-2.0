# Shipping-Skill Learnings Registry

**What this is.** The single, deduplicated, authoritative index the *write-a-skill* session
reads top-to-bottom to build the **back-half "shipping" skill** of the harness. It synthesizes
and cross-references the scattered corpus (the ledger, the audit, five handoffs, the orchestration
prompts, the specs/plans, and the exemplar Forge outputs) into the skill's proposed
**gates / sections**, with every learning mapped to the **Forge artifact that proves it** and its
**source citation**. It does not duplicate those sources — it points at them by path.

**How to read it.** Sections 1–8 are the skill's proposed shape. Section 3 (the GATES) is the
heart — each subsection is a candidate gate stated as: *what it catches · why the one enforced
boundary structurally can't catch it · proving Forge artifact · source*. A learning that maps to
more than one gate is stated once in its best home and cross-referenced. The closing **Gaps found**
coda flags anything that lived only in a transient doc.

**The canonical sources (do not re-derive — read these alongside this registry):**
- Ledger (SIX dated sections): `docs/superpowers/harness-learnings.md`
- Audit (7 implications + "got right" + shortlist): `docs/superpowers/audits/2026-05-31-forge-architecture-audit-learnings.md`
- External-benchmark audit (3 Vercel skills vs Forge `src/`; 0 bugs, 0 HIGH, 1 convergent hygiene theme): `docs/superpowers/audits/2026-06-01-vercel-skills-benchmark.md`
- Orchestration skeleton: `docs/prompts/goal-forge-supabase-finish.md`, `docs/prompts/resume-forge-migration.md`
- Handoffs (the arc): `docs/superpowers/handoffs/2026-05-29-*`, `-05-30-*`, `-05-31-*`, `2026-06-01-extract-back-half-shipping-skill.md`
- Front-half template to MIRROR (structure/voice/progressive-disclosure): `~/.claude/skills/sector-map/{SKILL,PHASES,TEMPLATES}.md`

---

## 1. Purpose & framing

**What the back-half skill does.** The harness turns a `claude.ai/design` mock → a working,
production-grade app in two halves. The **front half** is the already-extracted `sector-map` skill
(`~/.claude/skills/sector-map/`): it shapes a non-working mock into a sectored, book-readable
architecture with one machine-checked dependency boundary, BEFORE any behavior exists. The **back
half** — this skill — takes that sectored mock → a real, tested, deployed app via a
**`to-prd → to-issues → to-goal`** flow on a **local issue store**, run as **vertical tracer-bullet
slices** through an **orchestrator + TWO fresh-eyes gates** (Elegance + Senior Dev, K=1, commit only
on YES/YES), **PLUS the hardening gates proven on Forge** (Section 3).

**Sibling relationship.** `sector-map` and the shipping skill are siblings: **front shapes, back
ships.** The front half ends at `MIGRATION.md` and hands off to exactly the chain the back half
codifies. The back half then closes with `improve-codebase-architecture` (deepens working code),
and — newly — `improve-database-architecture` (a DB-specific audit skill now being designed; see
`docs/spec` for the latest, commit `0510f0d`). The shipping skill should mirror `sector-map`'s
shape: a `SKILL.md` entry + `PHASES.md` + `TEMPLATES.md`, progressive disclosure, terse maps not
maintained-for-their-own-sake docs.

**The OPEN framing question (resolve in brainstorming — do NOT resolve here).** Is the back-half:
- **(a) a gate-layer ON `to-goal`** — i.e. `to-goal` stays the engine and the skill adds the
  hardening gates + the two fresh-eyes gates as a wrapper;
- **(b) a standalone twin of `sector-map`** — a sibling skill with its own phases that composes
  `to-prd`/`to-issues`/`to-goal` as sub-steps; or
- **(c) an enhancement of `to-goal` itself** — fold the gates into `to-goal` directly.

State it; the corpus does not decide it. (Source: every handoff's "open framing question" bullet,
e.g. `2026-05-31-...harness-extraction.md` "Session N+2" and `2026-06-01-extract-back-half...md`
"How to build it" §1.) A leaning the corpus supports but does not mandate: the orchestration
skeleton (Section 4) was *built by hand as a local-issue-store adaptation of `/to-goal`*, which
argues the back-half is closer to (b)/(a) than a from-scratch engine — but the gates are the
net-new value regardless of which shell holds them.

---

## 2. What the harness GOT RIGHT (codify verbatim — these are positives to PRESERVE)

These are the strengths the audit verdict (`structure_quality: good`) rests on; the skill must
keep them, not just add gates. Full list: audit doc "What the harness GOT RIGHT" section.

- **Sector-first map that screams the domain** + a readable `ARCHITECTURE.md` "Where do I add X?"
  map — the single most reusable output of the whole harness. *Proof:* `ARCHITECTURE.md`,
  `CONTEXT.md`. *(This is the front half's deliverable; the back half consumes + preserves it.)*
- **The locked exemplar shape reproduced WITHOUT drift across all six sectors:** every `page.tsx` is
  an async RSC that server-resolves Chihuahua-local "today" (never a client clock) and reads the DAL
  via `Promise.all`; `'use client'` only on `_components` leaves; every `actions.ts` a thin
  `'use server'` delegate with no business logic. *Proof:* the `src/app/(app)/*` sectors; the
  vertical-slice template in `sector-map/PHASES.md` Phase 5.
- **A pure, side-effect-free, unit-tested domain core** as the genuine single home for stacking /
  vigencia / estado / consume / forfeit / resumen / template-render — ADR-0002 "derived-not-stored"
  is real. *Proof:* `src/domain/rules.ts` + `rules.test.ts`; `docs/adr/0002-derived-not-stored.md`.
- **One machine-enforced boundary on a Husky pre-commit hook** that held through an 8-slice
  mock→real migration with zero false violations. The discipline of "one cheap enforced invariant"
  is correct — it just needs companions (Section 3). *Proof:* `.dependency-cruiser.cjs`.
- **Version-controlled RLS** (owner-scoped policies on every table, no `service_role` import,
  `getClaims`/`getUser` over `getSession`, append-only `ventas`). Correctly *written* — the only
  audit gap was it shipped un-*exercised* (closed since: see Gate 3.3). *Proof:*
  `supabase/migrations/*`, `docs/adr/0001-supabase-rls-no-orm.md`.
- **ADRs capture the load-bearing decisions; CONTEXT.md establishes a real ubiquitous language.**
  *Proof:* `docs/adr/0001`–`0006`, `CONTEXT.md`.
- **Timezone discipline centralized:** all "today" flows through `hoyChihuahua` resolved
  server-side. *Proof:* `src/lib/fecha.ts`.

Source: audit doc "What the harness GOT RIGHT" + `sector-map/SKILL.md` "Principles".

---

## 3. The GATES (the heart of the skill)

The through-line, stated once: **the single enforced dependency boundary catches import
*direction*, not concept *duplication* or contract *honesty*** — and the enforced loop verified the
easy (pure) half while the security/correctness-critical half shipped with zero executing tests
behind a hand-typed "45/45." Every gate below is a companion the cruiser structurally cannot be.
(Audit verdict, doc top.)

### 3.1 Concept-duplication gate — THE HEADLINE (reconcile a named rule against EVERY read path)

- **Catches:** a core domain rule re-coined as inline branch logic in a screen / on a write path /
  in a second language, divergent from its `src/domain` home. Forfeit re-implemented inline on the
  write path vs the read path; a full urgency engine hard-coded in a `'use client'` roster; "running
  out" thresholds in 3+ disagreeing places; `MetodoPago` declared 4× under 2 names; and — the
  third-pass discovery — a *projection* of a unified rule still re-coined: the pase `porVencer`
  inlined `diasRest <= 5` and **silently dropped the `clases <= 2` dimension**, a REAL
  operator-visible bug (two screens disagreeing on the same client).
- **Why the boundary can't catch it:** a rule *re-typed as a literal* inside a client screen is not
  an import, so it is structurally invisible to dependency-cruiser. Boundary-green + tests-green +
  slices-done all reported success while core rules quietly forked.
- **The sharpened form (3rd pass):** "single-home a rule" is NOT done until **every sibling
  read/screen consumes the same derivation** — reconcile a named rule against *every* read path, not
  just the one a prior fix touched. A 3rd re-audit still found the headline class at NEW sites two
  prior passes hadn't reached.
- **Mechanics the gate runs:** (a) grep `_components`/screens for branch logic on domain quantities
  (diasRest/clasesRest threshold comparisons, estado enum literals, sentinels) and FAIL if found
  without importing from `src/domain`; (b) reconcile each named domain rule against all call sites
  AND scan writers for open-coded reimplementations; (c) flag any new string-literal union whose
  members duplicate an existing domain union; (d) wire `ts-prune`/`knip` + a small duplication
  scanner into the lint gate (catches dead *exports* + re-coined synonyms `no-orphans` misses).
- **Proving artifacts:** the fix commits `27240c8` (homed `baseParaStack`+`urgenciaCliente`,
  removed the inline forfeit + the `CL_DAYS/CL_CLS` engine), `3f8d8f9` (single-homed the phone-digit
  rule across form/Zod/DB), `da0aa3b` (`derivarPaseCliente` restoring the clases dimension),
  `894f7fd` (`MetodoPago` single-home); the domain home `src/domain/rules.ts`.
- **Source:** audit Cluster 1 (the headline failure); ledger 2026-05-31, 2026-06-01-cont (2nd),
  2026-06-01-cont (3rd, the `por_vencer` bug). Cross-ref Gate 3.9 (pure-core makes the bug
  assertable) and Operating discipline §5 (re-audit after every pass).

### 3.2 Docs-as-assertions / contract-honesty gate

- **Catches:** prose (README/ADR/glossary/copy-pasted "protocol" lines) that has drifted from the
  code it describes. `revalidateTag('clientes','max')` called in 3 writers but **no reader ever tags
  a cache entry** (an inert no-op reading as a cache-coherence guarantee); CONTEXT.md +
  `types.ts:7` pointing at a **deleted** file; an exported `diasLabel` with zero importers; and —
  the lens added in pass 2 — an ADR over-claiming "math in tested TS" the moment the attendance
  rules moved to SQL.
- **Why the boundary can't catch it:** nothing verifies a documented contract against code;
  `no-orphans` catches dead *files*, not stale *mentions* or no-op *prose*.
- **Mechanics:** make "docs follow code" a definition-of-done. A **glossary-integrity linter** on
  the pre-commit hook (every `src/` path cited in CONTEXT.md must exist); a **cleanup-slice rule**
  that a deleted path has zero references in comments + markdown before the slice closes; the
  **deletion test** on every copy-pasted protocol line (a no-op ⇒ remove or complete it); for
  invalidation, every writer `revalidateTag(X)` needs a matching reader `cacheTag(X)`. Standing lens:
  "does every doc/ADR claim still match the code after this change?"
- **Proving artifacts:** `20fdfb6` (removed the 3 inert `revalidateTag` no-ops; documented (app)
  reads are intentionally dynamic), `976fc60` (reconciled CONTEXT.md/`domain/types.ts`/MIGRATION.md
  with code), `64043b7` (ADR-0005 honesty fix + committed SQL test), `0e05864` (reconciled the seam
  README with the honest no-revalidateTag flow), `c9d73d7` (dropped the dead `Urgencia.score` limb +
  its false "drives the sort" docstring). The honest exemplar:
  `docs/adr/0005-atomic-write-rpcs.md` "Where each attendance rule lives" table.
- **Source:** audit Cluster 2; ledger 2026-06-01 (TS↔SQL twin doc-link), 2026-06-01-cont (2nd,
  "contract-honesty in seams we'd JUST built").

### 3.3 Slice-done = typecheck + test + build green in CI (not lint-only)

- **Catches:** a "slice done" that means only "lint+boundary green at commit" — the
  security/correctness-critical half (RLS, auth redirect, balance mutations) shipping unverified
  behind a hand-typed "45/45." All 45 tests were in the pure core; the pre-commit hook ran *only*
  eslint+depcruise; the suite, `tsc --noEmit` (no script existed), and `next build` ran **nowhere
  automatically, and there was no CI** (`.github/` absent).
- **Why the boundary can't catch it:** the enforced loop gated lint only — it never even *ran* the
  suite, so coverage scope was never challenged; the green "45/45" masked an untested money path
  (the phone bug reached production precisely because its layer was both untested and untestable).
- **Mechanics:** **redefine slice-done as "typecheck + tests + build green in CI,"** never "lint
  green at commit." Make a CI definition a **required first-class artifact** of the vertical-slice
  template, with a simulated clean-clone run in the fresh-eyes gate. Append `vitest run` to
  pre-commit. For DB-touching slices, any authorization claim in a README/ADR requires ≥1 executing
  cross-tenant RLS-denial test before close. Refuse a slice on a hand-typed "test N/N."
- **Proving artifacts:** `6bf0fd8` (added `typecheck` script + `pnpm@11.0.9` pin; the CI workflow;
  pre-commit now lint+typecheck+test); the workflow itself `.github/workflows/ci.yml`
  (`install --frozen-lockfile && lint && typecheck && test && build`, with placeholder Supabase env
  so a red build is always a real failure); the executing RLS proof
  `supabase/tests/rls_cross_tenant_denial.sql` (commit `9dd7100`).
- **Source:** audit Cluster 3.

### 3.4 Keep-the-seam-injectable gate

- **Catches:** the mock→real migration inlining the client (`createClient()`/`getClaims()`) into
  every DAL function, making DTO mapping, Zod schemas, and write orchestration **untestable by
  construction** — and `no-orphans` then flagging a future test double as dead code.
- **Why the boundary can't catch it:** testability-as-interface-depth is an orthogonal axis the
  import-direction rule can't see; the cost was invisible because the loop never tried to test the
  DAL.
- **Mechanics:** carry a **"keep the seam injectable"** invariant through the mock→real phase (DAL
  functions accept a client via default-arg defaulting to `createClient()`); require a DAL-level test
  for any slice that maps rows or validates input; ship the `no-orphans` config with `__mocks__/**`,
  `*.test-helper`, fixtures already in the `pathNot` exemption list from day one. Standing lens: "can
  every module be tested through its interface?"
- **Proving artifacts:** `c4478ca` (restored the injectable client seam + extracted
  `requireOperator`); the `.dependency-cruiser.cjs` `no-orphans.pathNot` exemption list.
- **Source:** audit Cluster 4; ledger 2026-06-01-cont (2nd, testability-as-interface-depth).
  Cross-ref Gate 3.9 (`cache()` reads can't be unit-tested — home a pure rule at each read site, do
  not collapse I/O onto one cached read).

### 3.5 ADR consequence-clauses → per-slice gates

- **Catches:** an ADR "consequences" section written as prose with no enforcement, so the
  responsibility it removed/asserted smeared across call sites. ADR-0001 "no ORM" → every
  cross-entity read hand-rolls a JS join (an N+1-shaped full client-id-list scan on every ficha load
  for prev/next neighbors). ADR-0004 "stored running balance" → balance + ledger writes were
  **non-atomic read-modify-write across separate calls** with no transaction and no concurrency
  guard.
- **Why the boundary can't catch it:** the boundary sees imports, not whether a removed abstraction's
  responsibility landed in one named seam vs re-derived per slice.
- **Mechanics:** turn **ADR consequence-clauses into per-slice gates.** For any "no-X" decision, the
  fresh-eyes step locates the responsibility X used to own and requires it land in **one named
  seam**. For any slice whose writer mutates a stored running balance or writes 2+ tables, the
  template **defaults to an RPC/transaction stub** and the gate answers "is balance+ledger one
  transaction?" + "is the update concurrency-safe?" + a partial-failure rollback test, or records a
  written waiver.
- **Proving artifacts:** `docs/adr/0005-atomic-write-rpcs.md` (the atomic-write RPC seam that
  *realizes* ADR-0004's atomicity consequence-clause — the canonical example of an ADR consequence
  becoming a named seam with a committed test); the roster-nav extraction `5e5337c` (homed the
  hand-rolled prev/next neighbor scan into a tested seam). ADRs: `docs/adr/0004-saldo-stored-running-balance.md`.
- **Source:** audit Cluster 5; ledger 2026-05-31 (thin-seam-over-fat), 2026-06-01 (atomic-write
  wiring).

### 3.6 Stack-aware default rule set (server-only DAL split + formatter/threshold-home)

- **Catches:** App Router's most important boundaries left as prose, not sectors — `src/lib` fusing
  pure client-safe helpers with the server-only DAL + Supabase server client behind one tier, so the
  rule **cannot express the single most important App Router invariant** (a client component must
  never import `@/lib/data/*` or `supabase/server`). Plus formatters/thresholds re-growing per
  screen, and a `date.ts`/`fecha.ts` split by *language* not *responsibility* (`isoDay === toIsoDay`,
  byte-identical).
- **Why the boundary can't catch it:** `sector-map` produced a generic domain-vs-UI boundary and
  stopped — it carries no stack-specific rule set; "one boundary, not many" was taken literally where
  a *second* cheap rule was warranted.
- **Mechanics:** give the harness a **stack-aware default rule set**. For Next App Router: always
  ship the server-only DAL vs pure-lib split as distinct sectors with a forbidden
  client→DAL/`supabase/server` rule. Add a **formatter-home/helper-home gate** (grep for an existing
  same-shape helper before emitting a user-facing string or adding a date helper). Treat any
  user-facing numeric threshold driving a label/sort as **domain vocabulary** named in CONTEXT.md and
  homed in `src/domain` before screens are built. Route input validation through one pure validator
  (domain/lib + test) that the UI form *and* the Zod schema *and* a DB CHECK all call.
- **Proving artifacts:** `b3b9fe9` (single-sourced `isoDay`; dropped dead exports/deps), `416c5a3`
  (threaded the year through the greeting + homed the header formatters into `fmtEyebrow`),
  `3f8d8f9` (the form/Zod/DB phone validator single-home). The seam contract:
  `src/lib/data/README.md`.
- **Source:** audit Cluster 6. *(Note: a second forbidden client→DAL rule was downgraded to medium
  on Forge because all current client→DAL edges are type-only, resting on the `server-only` package
  throwing at build — but the skill should still ship the rule for projects where they aren't.)*
- **Extended (2026-06-01, external Vercel-skills benchmark — see that audit doc):** the stack-aware
  rule set gains a **client re-render hygiene lens** — the one gap that two of three Vercel skills
  independently found (`vercel-react-best-practices` Re-render + `vercel-react-native-skills` List
  Performance): list-item components over a collection get `React.memo` + stable callbacks + stable
  style refs; per-collection derivations get `useMemo`; interaction logic lives in event handlers,
  not effects. **Advisory + scale-triggered** (calibrate to dataset size), never blocking — Forge's
  small rosters make it hygiene, not a defect. Two micro-mechanics ride along: hoist `Intl`
  formatters (`js-hoist-intl`; `fecha.ts:17,44`, `format.ts:4`), and animate `transform` not
  `width`/layout props (`animation-gpu-properties`; `asistencia.tsx:109`). **New companion process
  rule:** *gate rule-pack applicability by the project's platform/stack before auditing* — an
  RN/Expo pack against a web app is ~90% N/A noise. Composition-patterns enters as a fresh-eyes
  **review vocabulary** (Section 4 Elegance gate, e.g. cite `architecture-avoid-boolean-props` when
  a slice grows boolean modes), not a standing gate. The CRITICAL/HIGH web categories (waterfalls,
  bundle, server, composition) **passed by construction** — external corroboration of Section 2's
  "got right" list. *Proving artifact:* `docs/superpowers/audits/2026-06-01-vercel-skills-benchmark.md`.

### 3.7 Migrations = canonical provisioner + definer/grant audit

- **Catches:** the repo following the live DB instead of being its source of truth. A
  `database.types.ts` frozen snapshot with no freshness gate; a live `SECURITY DEFINER
  rls_auto_enable()` (EXECUTE-able by anon over PostgREST) in **no committed migration and no
  REVOKE**; a from-scratch rebuild that would have failed at a revoke on an out-of-band-created
  function. Plus the live-time drift: RPCs deployed but never mirrored/typed/committed (the audit's
  finding #7 lived in real time).
- **Why the boundary can't catch it:** schema provenance is entirely outside the import graph;
  `get_advisors` flags a reachable definer but **not** a missing-create or a re-granted `anon`
  EXECUTE after a DROP+CREATE — only a from-empty rebuild does.
- **Mechanics:** committed migrations must reproduce the live schema on a fresh `db reset` (without
  Docker, a rolled-back replay into a `_rebuild` schema asserting the object count is the fallback);
  any generated type snapshot gets a regenerate-and-diff gate; a mandatory per-DB-slice **definer &
  grant audit** (enumerate all `SECURITY DEFINER` functions + all EXECUTE grants to anon/authenticated,
  FAIL unless each is allow-listed in a committed migration); treat `get_advisors(security)` "definer
  reachable by anon" as **blocking**, run it in the final hardening slice, every WARN resolved or
  waived as a tracked artifact. (Detailed operational steps in Section 6.)
- **Proving artifacts:** `9925f52` (REVOKE EXECUTE on `rls_auto_enable` from anon/authenticated,
  migration `20260531210445`, mirrored); `docs/adr/0005-atomic-write-rpcs.md` "Consequences" (the
  reconstructed-verbatim mirror + the DEFAULT-NULL redefinition + the anon re-revoke as their own
  migrations; "a from-scratch build now reproduces prod"). The committed migration set:
  `supabase/migrations/*`.
- **Source:** audit Cluster 7; ledger 2026-05-31 (mirror+regen+advisor+commit atomic) and 2026-06-01
  (canonical-provisioner lessons: version-string equality, from-scratch rebuild proof, DROP+CREATE
  re-grants anon).

### 3.8 Testability-as-interface-depth (extract pure cores; the lens that finds latent bugs)

- **Catches:** logic trapped in untestable places — a `cache()`-wrapped DAL closure, a
  client-component string literal — that the boundary + the pure-core tests never see. Both bugs the
  3rd pass fixed lived in exactly such places.
- **Why the boundary can't catch it:** it's an interface-depth property, not an import direction.
- **Mechanics:** extracting the pure cores (`derivarPaseCliente`, `shapeFicha`, `fmtEyebrow`,
  `resumirRoster`, `resolverIdentidad`) turned each latent bug into a failing test. The testability
  lens pays off as **bug-prevention, not just tidiness** — pure-core extraction is how a latent bug
  becomes a failing test. *Constraint (from Gate 3.4 / 3.9):* a `cache()`-wrapped DAL read can't be
  unit-tested through React's cache outside a request, and routing a money-path writer through one
  would break the injected-fake test — so single-home a PURE rule applied at each read site, don't
  collapse I/O onto one cached read just for DRY.
- **Proving artifacts:** `3555697` (`shapeFicha`), `2d9762e` (`resumirRoster` via a slim read),
  `28b4445` (`resolverIdentidad` at each read site), `416c5a3` (`fmtEyebrow`), `da0aa3b`
  (`derivarPaseCliente`). Tests grew 76→93 over the 3rd pass.
- **Source:** ledger 2026-06-01-cont (3rd pass, pure-core makes bugs assertable + the `cache()`
  constraint); ledger 2026-06-01-cont (2nd pass, testability-as-interface-depth as a standing lens).
  Cross-ref Gates 3.1 and 3.4.

---

## 4. Orchestration skeleton

The runnable skeleton the skill generalizes — **already built by hand** as a local-issue-store
adaptation of `/to-goal` and kept as a reference. Read it verbatim before re-deriving:
`docs/prompts/goal-forge-supabase-finish.md` (the full orchestrator) and
`docs/prompts/resume-forge-migration.md` (the resume variant).

**The shape:**
- **Orchestrator-only session.** It NEVER edits code / runs lint-test-build / does schema-MCP work /
  judges a diff itself. Per-turn loop = read the local queue → pick the next ready slice → dispatch
  ONE Opus shipping subagent → dispatch TWO fresh-eyes gate-checkers → relay/finalize → log one line.
  Constant context per turn (that's the point of a clean orchestrator session).
- **Local issue store.** The markdown files in `docs/issues/` ARE the tracker — every `gh`-style
  step is replaced by a local-file step; no `gh`, no push. The `to-prd → to-issues → to-goal` chain
  runs on plain markdown (`docs/prds/` + `docs/issues/`); a GitHub/Linear tracker is ONE backend, not
  a requirement. *Proof:* `docs/issues/README.md` + `0001`–`0008`; `docs/prds/prd-supabase-migration.md`.
- **Vertical tracer-bullet slices.** Each slice = schema/data → `server-only` DAL (DTOs + domain rule
  calls, never reimplement) → thin write action (re-auth `getClaims`, Zod-validate, delegate,
  revalidate) → wire the screen off real data. Only the seam mechanics change per stack. *Proof:* the
  issue files; `sector-map/PHASES.md` Phase 5.
- **TWO fresh-eyes gates, K=1, commit only on YES/YES.** After the shipping subagent reports, the
  orchestrator dispatches two INDEPENDENT Opus gate-checkers with fresh context and the VERBATIM
  prompts: **Gate 1 Elegance** (deletion test on every new Module; CONTEXT.md/LANGUAGE.md vocabulary,
  no "service"/"helper"/"utils"; Locality; minimum diff) and **Gate 2 Senior Dev** (tests target the
  Interface not internals; no `as any`/unjustified `@ts-expect-error`; no orphan TODO; no premature
  optimization; every acceptance criterion genuinely satisfied; ADRs respected). Discipline binding
  both: each verdict quotes ≥1 diff hunk; even a YES enumerates 1–3 rejected concerns; each concludes
  with a per-ADR YES/N/A checklist; reasoning capped at 3 sentences. ANY NO → relay only the failing
  gate's named concern → re-implement → **re-dispatch BOTH** (fixing one can regress the other), up to
  3 re-plans, then `[BLOCKED]` + HALT. Verbatim prompts live in
  `~/.claude/skills/to-goal/gate-prompts.md` and inline in `goal-forge-supabase-finish.md` (GATE
  CHECKS block).
- **Sequential vs parallel.** Run SEQUENTIAL K=1 when slices share mutable state (the Supabase
  project + `database.types.ts` regen would race; later slices hard-depend on earlier). See Operating
  discipline §8 for the orchestrate-as-one-sequential-agent refinement.
- **End-state sentinels.** Emit a fixed COMPLETE / HALTED sentinel + an END-STATE log
  (`git log --oneline`, the README progress line) so the operator sees exactly where the run stopped.
  A turn cap stops a runaway sweep.

**Source:** the two prompt files; handoffs `2026-05-30-...migration-complete.md` ("per-slice pattern
that worked") and `2026-05-29-...midcycle.md` GOAL B (local-issue-store mode confirmed).

---

## 5. Operating discipline (Aaron's standing directives — bake into the skill's posture)

1. **Validate the OUTPUT before codifying the PROCESS.** We almost extracted the skill on faith;
   auditing Forge's actual architecture first turned every flaw into a concrete gate. The skill
   should open with an "audit a reference output before trusting the template" step and ship its own
   adversarial-audit workflow (Section 7). (Ledger 2026-05-31; `[[forge-validate-before-codify]]`.)
2. **Fix the output first, extract second.** Forge embodies its own lessons now, so the extracted
   skill is cut from a clean reference. Document this ordering as how to evolve the skill from each
   new project. (Ledger 2026-05-31; handoff `2026-05-31` "Aaron's explicit sequencing".)
3. **Orchestrate; don't over-checkpoint — run the fork test.** Grilling is theatre when there's no
   genuine design fork. Before any human checkpoint: "is there a decision the user's answer changes,
   that I can't resolve from the repo, a precedent, or the audit?" If no → dispatch a fix agent,
   review, gate, commit, move on. Reserve checkpoints for genuine forks, and lead with a senior
   recommendation, not a blank question. (Ledger 2026-06-01-cont 2nd; `[[forge-orchestrate-dont-over-checkpoint]]`.)
4. **Good-enough that showcases the harness, not perfection.** Calibrate every gate to the project's
   stated goal, not an abstract ideal — and say so. (Ledger 2026-05-31; `[[forge-good-enough-not-perfectionist]]`.)
5. **Re-audit AFTER every hardening pass, not once.** A 3rd pass still found the headline failure
   class (concept duplication) at NEW sites a prior fix didn't reach — including a real
   operator-visible bug. Each fix can reveal the next layer; the deepening passes don't exhaust the
   gaps. (Ledger 2026-06-01-cont 2nd + 3rd. Cross-ref Gate 3.1.)
6. **Validate the validators.** After per-finding adversarial verifiers, run ONE holistic validation
   gate over the whole survivor set — it caught a per-finding verifier's own mistake whose proposed
   fix would have been a regression (painting the días tile yellow on a clases-only shortage).
   Verifier verdicts are claims to re-check, not ground truth; per-finding verifiers can't see
   cross-finding errors. (Ledger 2026-06-01-cont 3rd; `[[forge-validate-before-codify]]`. Cross-ref
   Section 7.)
7. **Triage determined-vs-fork up front.** Of the 3rd pass's 9 findings, only ONE (gating venta
   intake on `cobro.acepta_*`) was a genuine product fork; the rest were dictated by
   ADR/precedent/audit and dispatched without a checkpoint. Compute this triage before any dispatch.
   (Ledger 2026-06-01-cont 3rd.)
8. **Orchestrate as ONE sequential agent when findings collide on shared files.** Git commits
   serialize regardless, and parallel edits to the same file clobber — so parallel fan-out buys
   nothing and risks corruption; the context-saving win is *offloading editing*, not parallelism.
   Hand a determined batch to a single well-specced sequential agent (with the validated
   regressions-to-avoid baked in) that gates + commits each; reserve parallel fan-out for
   **file-disjoint** work. Compute a file-overlap graph: serialize colliding work, parallelize
   disjoint work. (Ledger 2026-06-01-cont 2nd + 3rd; `[[forge-orchestrate-dont-over-checkpoint]]`.)
9. **Review the agent's diff — green gates are necessary, not sufficient.** A DAL-seam agent left an
   orphaned JSDoc (the doc now described the wrong symbol); gates were green because it's cosmetic —
   only reading the diff caught it. The orchestrator must diff-review every agent change for
   doc-locality, gratuitous reformatting, and scope creep before committing; and re-run committed
   test artifacts verbatim against the live system itself. (Ledger 2026-06-01-cont 2nd; handoff
   `2026-05-30` "three self-inflicted mistakes".)

---

## 6. Operational mechanics (bake into the skill's "execution mechanics")

- **Commit messages: `git commit -F .commitmsg`** (the temp file is gitignored), then delete it.
  PowerShell here-strings (`@'...'@`) repeatedly mangled multi-line `-m` messages into bogus
  pathspecs. **Never `git add -A`** (it once swept an uncommitted `.commitmsg` into the tree) — stage
  explicit paths. (Ledger 2026-05-31 + 2026-06-01.)
- **`packageManager` must match the on-disk pnpm.** Pinning `pnpm@9.x` against a pnpm-11
  `pnpm-workspace.yaml` (only `allowBuilds`, no `packages:`) breaks every script with `ERROR packages
  field missing or empty`. Pin to the actual local version (`pnpm@11.0.9`). (Ledger 2026-05-31;
  commit `6bf0fd8`.)
- **`pnpm add <pkgs> --prefer-offline`** — bare `pnpm add` 404s on `@next/swc` on this vendored
  Next 16; `--prefer-offline` uses cached metadata and a failed add leaves package.json/lockfile
  untouched. (`[[forge-pnpm-add-prefer-offline]]`; handoff `2026-05-29-midcycle`.)
- **Don't over-batch tool calls.** When one call in a parallel batch fails, the harness cancels all
  siblings — a wall of "Cancelled…" that looks like many failures but is one. Keep DB/commit/verify
  steps in small batches. (Ledger 2026-05-31.)
- **After ANY live DDL: mirror SQL → `supabase/migrations/` → regen + write `database.types.ts` →
  `get_advisors(security)` → commit — as ONE atomic, non-skippable step.** A slice with
  applied-but-unmirrored DDL is NOT done (the drift was the audit's finding #7 lived in real time).
  (Ledger 2026-05-31; cross-ref Gate 3.7.)
- **Migration version string MUST equal prod's `schema_migrations` exactly** — the filename is the
  merge key. Apply → immediately read back the assigned version (`list_migrations`) → write the repo
  file under THAT exact version. Never name a migration file by guess (it produced wrong values in
  #6/#7/#8). (Ledger 2026-06-01; handoff `2026-05-30` mistake #1.)
- **DROP+CREATE silently re-grants Supabase default privileges (incl. `anon` EXECUTE).** After any
  function DROP+CREATE, re-assert the grant set + diff against a sibling function; `get_advisors` does
  NOT flag it. (Ledger 2026-06-01; ADR-0005 type-bridge note.)
- **Mirror = verbatim from a confirmed read, never from inference.** A silently-wrong tool name fails
  OPEN (`execute_sql` returns "No such tool available" — the real names are `mcp__supabase__*`), and a
  migration reconstructed from memory was wrong on real columns. Before authoring any
  mirror/derived artifact, the source fetch must have **succeeded with returned data**; the canonical
  text is one `pg_get_functiondef` away. (Ledger 2026-06-01.)
- **Classifier-gated actions are HITL by design** — bulk push to a new public repo, and DDL on a
  live/public DB, each need explicit operator authorization. Mark them operator-gated checkpoints,
  not agent-autonomous steps. (Ledger 2026-05-31; every handoff's HITL section.)
- **A `cache()`-wrapped DAL read can't be unit-tested** through React's cache outside a request.
  Single-home a PURE rule applied at each read site; don't collapse I/O onto one cached read for DRY.
  (Ledger 2026-06-01-cont 3rd; cross-ref Gates 3.4 + 3.8.)
- **Bake the project's tz + auth-identity facts into the test templates.** Two money-path smoke-test
  failures were the *test's* fault: seeding the JWT `sub` with `perfil.id` instead of the separate
  `user_id`; using the DB's UTC `current_date` as "today" when the rule stamps Chihuahua-local today.
  When a money-path test fails, first falsify the fixture (identity, clock, tenant) against the real
  system before touching the code. (Ledger 2026-06-01.)
- **The rolled-back self-asserting SQL test pattern** — the default DB-behavior test when there's no
  local Docker/pgTAP: `begin; set local role authenticated; set request.jwt.claims …; <RAISE on
  every mismatch>; rollback;`. Self-asserting (a clean run returns one `OK` row, any failure aborts),
  zero writes, run against prod data via the MCP `execute_sql`. Verify the committed artifact verbatim
  — re-run its literal on-disk bytes green by the path it documents (a first RLS test mixed psql
  `\set` with `current_setting()` and wouldn't run via MCP). *Proof:*
  `supabase/tests/rls_cross_tenant_denial.sql`, `supabase/tests/toggle_pase_rules.sql` (both carry a
  HOW-TO-RUN + PORTING header making them env-portable). (Ledger 2026-06-01 + 2026-06-01-cont 2nd.)
- **Stack-API grounding:** verify Next 16 / `@supabase/ssr` APIs against the BUNDLED docs
  (`node_modules/next/dist/docs`) + installed types, never training data — `proxy.ts` not
  `middleware.ts`; `await cookies()`; 2-arg `setAll`/`revalidateTag(tag,'max')`; `getClaims()` not
  `getSession()`. Chihuahua-local dates ONLY via `src/lib/fecha.ts`. `forgeToast` tones =
  success|warning|info. Never run `husky` with an argument (v9 treats it as the hooks path and
  corrupts `core.hooksPath`). (Handoffs `2026-05-29`/`-05-30`; AGENTS.md.)

---

## 7. The adversarial audit / re-audit workflow (reusable harness machinery)

The audit/re-audit shape is itself reusable machinery the skill should ship, not a one-off. It is
how the skill audits a reference output (Operating discipline §1) AND re-audits after each hardening
pass (§5).

**The pipeline:** **N lens finders** (each a fresh agent with one architectural lens) → **per-finding
skeptic verify** (a default-refute verifier re-reads each cited file:line + checks against live code
before any fix — catches overstated findings and wrong citations; on Forge it confirmed all 6 of the
2nd pass but *narrowed* one) → **completeness critic** (did the finders miss a class?) → **holistic
validation gate** (ONE reviewer reads the WHOLE survivor set together — catches cross-finding errors
a per-finding verifier can't, e.g. the proposed-regression in the 3rd pass; Operating discipline §6)
→ **triage determined-vs-fork** (§7) → **fix** (one sequential agent for file-colliding work, §8;
diff-review every change, §9).

**Scale seen on Forge:** the 1st audit ran 8 lenses → 53 agents, 41/42 findings survived; the 3rd
pass ran 9 lens finders → 38 agents, 28 findings, 22 genuinely-new survived → then the holistic
gate. The verbatim audit-workflow prompt is being formalized into a sibling skill
(`improve-database-architecture`, spec at commit `0510f0d`); the existing
`improve-codebase-architecture` skill is the working-code variant.

**Source:** audit doc (the methodology header); ledger 2026-05-31 (8-lens audit), 2026-06-01-cont 2nd
(4 Explore → 1 Opus verifier) + 3rd (9 finders → skeptic → critic → holistic gate). Cross-ref
Operating discipline §§1, 5, 6.

---

## 8. Exemplar outputs to point at (the skill references patterns; it does not hard-code them)

| Artifact | Path | What it exemplifies |
|---|---|---|
| Tracer-bullet vertical-slice issues | `docs/issues/0001`–`0008-*.md` + `README.md` | local-issue-store slices with acceptance criteria + a `Blocked by` dep graph (e.g. `0003-ventas-tracer-bullet.md`) |
| The PRD | `docs/prds/prd-supabase-migration.md` | the `to-prd` source-of-record a `to-issues` split keys off |
| ADRs (Nygard) | `docs/adr/0001`–`0006` | locked irreversibles; `0005` is the gold contract-honesty exemplar ("Where each attendance rule lives"); `0006` shows naming-a-tension (respaldo = operational export, NOT DR backup) |
| Glossary | `CONTEXT.md` | term → meaning → type+file; a rename surfaces drift |
| Architecture map | `ARCHITECTURE.md` | read-first sector table + dependency arrow + "where do I add X?" |
| The ONE boundary | `.dependency-cruiser.cjs` | the enforced rule + `no-circular` + a now-enabled `no-orphans` with a real `pathNot` exemption list |
| Rolled-back self-asserting SQL tests | `supabase/tests/rls_cross_tenant_denial.sql`, `supabase/tests/toggle_pase_rules.sql` | the DB-behavior test pattern (Section 6) with portable HOW-TO-RUN headers |
| CI workflow | `.github/workflows/ci.yml` | slice-done = lint+typecheck+test+build (Gate 3.3), with placeholder Supabase env |
| Domain core | `src/domain/rules.ts` + `rules.test.ts` | the pure, tested single-home of every rule |
| Orchestrator prompts | `docs/prompts/goal-forge-supabase-finish.md`, `resume-forge-migration.md` | the runnable orchestration skeleton (Section 4) |

---

## Gaps found (learnings that lived ONLY in a transient place — back-fill into the ledger)

These were surfaced from handoffs/prompts and are **either absent from or only partially in** the
ledger. The write-a-skill session should treat them as first-class, and a future session should
append them to `docs/superpowers/harness-learnings.md`:

1. **The "verify framework APIs against the BUNDLED docs, run `eslint .` early" archaeology lesson
   lives in the FRONT-half handoffs/`sector-map`, not the back-half ledger.** It is load-bearing for
   the shipping skill too (the API shapes a slice writes against) but appears only in handoffs
   `2026-05-29-next-cycle` ("3 pre-existing react-hooks errors hidden in the mock") and
   `-05-30`. Recorded here in Section 6; not in the ledger as a back-half triplet.
2. **"Re-run BOTH gates after any fix (fixing one can regress the other)" + "never write a
   migration-mirror filename or commit sha into docs/code before it exists" + "don't run your own
   inline edits on the same files a dispatched subagent is editing"** — the three self-inflicted
   mistakes are captured crisply in handoff `2026-05-30-...migration-complete.md` "Operational notes"
   but only partially echoed in the ledger (the version-string and review-the-diff halves made it;
   the re-run-both-gates rule is implicit in the orchestration prompt, not a ledger triplet).
   Surfaced here in Section 4 + Operating discipline §9.
3. **The `respaldo` operational-export work is NOT in the ledger at all.** `docs/adr/0006-respaldo-operational-export.md`
   and `docs/prds/prd-respaldo-export.md` exist (currently untracked on `arch/third-deepening-pass`,
   alongside a modified `CONTEXT.md`) and embody a reusable lesson — **name an overloaded term to a
   decision (respaldo = operational export, explicitly NOT a DR backup) and let the ADR carry the
   exclusion as a guard against a future "fix"**, plus the I/O-stays-in-`src/lib`-never-`src/domain`
   boundary discipline and a phase-1/phase-2 split that lets the later trigger reuse the earlier code
   verbatim. This is a clean Gate 3.2 (contract-honesty) / Gate 3.5 (ADR-as-seam) exemplar that
   should be cited once it's committed. NOTE: this is in-flight WIP, not a registered learning — left
   untouched per the registration-only scope of this task.

**No conflicts/duplications required resolving in the ledger itself** — its four dated sections are
internally consistent and append-only. The dedup work was across *sources*: a learning that appears
in both the audit (as a structural cluster) and the ledger (as a process triplet) is stated once in
its best gate home above and cross-referenced, rather than re-listed from each source.
