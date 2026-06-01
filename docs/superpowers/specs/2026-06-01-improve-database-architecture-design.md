# Design — `improve-database-architecture` skill

**Date:** 2026-06-01
**Status:** Design approved; ready for implementation plan
**Author:** Aaron + Claude (brainstorming session)
**Source/sibling skill:** `improve-codebase-architecture` (Ousterhout *depth* + Feathers *seams*)

A Postgres/Supabase **database-architecture audit** skill — the database sibling of
`improve-codebase-architecture`. It surfaces candidate findings and grills them with the
user; it **never** runs a migration on its own.

---

## 1 · Goal & provenance

Build a single-lens database audit skill that mirrors the *structure* of
`improve-codebase-architecture` (one sharp lens, locked vocabulary, falsifiable
diagnostics, explore→present→grill process, progressive disclosure, doc-ecosystem
integration, candidate-driven/never-auto-executes) but applies it to a **database** rather
than code.

This design is the product of a research workflow (7 agents): it mapped the source skill's
transferable pillars, web-researched DB-audit fundamentals across four facets (integrity,
performance, security/RLS, evolution), studied this repo's real schema, and synthesized
three candidate lenses. The decisions below were then made interactively, and the design was
hardened against a five-point audit (see §12).

## 2 · Locked decisions

| Decision | Choice | Why |
|---|---|---|
| **Name** | `improve-database-architecture` | Sibling symmetry with `improve-codebase-architecture`; discoverable beside it. |
| **Spine** | **Trust-Boundary, integrity-led** | One unifying question subsumes integrity + access + change-safety without becoming a checklist; best fit for Supabase physics. |
| **Tech scope** | **Postgres + Supabase**, with documented plain-Postgres degradation | The lens gets its bite from Supabase physics (client → Postgres directly) and machine-checked tools (`get_advisors`, `execute_sql`, pgTAP). |
| **Build approach** | **Validate-on-Forge first**, then codify, then pressure-test | Honors the *validate-before-codify* principle: fix the output before extracting the process. |
| **Execution stance** | Audit + grill only; **never** `apply_migration` without explicit human authorization | DB changes are stateful and often irreversible; the candidate-driven gate is a safety mechanism, not just UX. |

## 3 · The lens (the spine)

One question, applied to every rule the system leans on:

> **"Is this rule enforced *in the database* — for every writer, across all time — or is it
> merely *trusted from the app*?"**

**Integrity-led.** The flagship application is *make illegal states unrepresentable*. The
same one question generalizes to three rule-types:

| Rule-type | The question becomes |
|---|---|
| **Correctness** (integrity) | Can a row that breaks this rule *physically exist*? |
| **Access** (RLS / tenancy) | Can a tenant reach a row the rule should deny — on **read and on write**? |
| **Change-safety** (migrations) | Can a schema change reach prod by any path *other than* a committed, replayable migration? |

**Verdict shape (locked).** Every finding resolves to exactly one shape:
*"Rule R is enforced at layer L; it belongs at the data tier."*

**The discipline rule (what keeps this a lens, not a linter):**
**If a finding cannot be phrased as a misplaced trust boundary, it does not belong in the
audit.** This is the load-bearing constraint — the trust-boundary idea is broader than
module-depth, so without this rule it would drift into a multi-axis checklist.

**Aim** (the analog of the source skill's "testability + AI-navigability"):
**defense-in-depth + reproducibility** — the database, the one place an attacker, a buggy
code path, or a future LLM *cannot* edit the check, becomes the enforcement point for every
rule that matters; and the schema is replayable from committed migrations. Bonus: every
finding converts directly into a **pgTAP / advisor regression test**.

## 4 · Locked vocabulary → `BOUNDARY-LANGUAGE.md`

The `LANGUAGE.md` analog. Each term has a positive definition **and** an `_Avoid_` synonym
list. Plus a **Principles** block, a **Relationships** block, and a **Rejected framings**
block. The discipline (especially the rejected framings) is load-bearing, not decoration.

### 4.1 Headline principle — the two-independent-writer rule

The analog of the source skill's *"one adapter = hypothetical seam, two adapters = real
seam"*, and the headline of the Principles block:

> **One writer ⇒ the app may enforce the rule. Two or more *independent* writers — writers
> that do not share the app's checks — ⇒ only the database can.** A `psql` session, a
> migration, a second service, the Supabase dashboard, and **direct PostgREST** are each
> independent writers.

This principle *derives* the lens rather than decorating it: in a Supabase/PostgREST app the
client talks to Postgres directly, so there are **structurally always ≥ 2 independent
writers** — which is exactly *why* "trusted from the app" fails by construction. (It is also
the honest grounding for the Supabase-specific scope in §8: two *app instances* share
validation code and do **not** trigger this rule; independence is the test.)

### 4.2 Terms (definition + `_Avoid_`)

- **Trust boundary** — the layer a rule is actually enforced at (DB / app / nowhere).
  *Avoid* "security layer" (too narrow — covers correctness and change-safety too), "the
  backend" (a server-side `if` is still app-tier and bypassable on the direct-to-Postgres
  path).
- **Enforced for all writers / across all time** — holds for every connection (PostgREST,
  `psql`, a migration, a second service) **and** for pre-existing rows. *Avoid* "validated"
  (per-this-writer, skippable); a `NOT VALID` constraint enforces only *new* rows
  (check `pg_constraint.convalidated`).
- **Invariant** — a property true of every committed row regardless of which writer produced
  it. *Avoid* "business rule" (invites "belongs in the app"), "requirement" (untestable).
- **Constraint** — an engine-guaranteed declarative object: `NOT NULL`, `CHECK`, `UNIQUE`,
  `PRIMARY KEY`, `FOREIGN KEY`, `EXCLUDE`, generated column, or (last resort) trigger.
  *Avoid* "validation" — validation is app code that can be skipped or wrong.
- **Enforcement gap** — the named delta between an asserted invariant and the absent database
  object that would make its violation impossible. *Avoid* "bug" / "smell" / "issue."
- **USING vs WITH CHECK** — `USING` is the read gate (which existing rows a role may
  see/affect); `WITH CHECK` is the write gate (validates the post-image of `INSERT`/`UPDATE`).
  Independent doors; a correct `USING` with a missing/weaker `WITH CHECK` is a **write-side
  IDOR**. *Avoid* "the policy condition" as if one expression governs both; on `INSERT` there
  is no `USING` at all.
- **Default-deny vs RLS-correct** — `ENABLE` gives default-deny (no policy = zero rows):
  necessary, not sufficient. *Avoid* treating the dashboard's green "RLS enabled" as proof; a
  `USING(true)` policy is default-**allow**.
- **BYPASSRLS / SECURITY DEFINER** — roles (`service_role`, superuser) and objects (definer
  functions/views) that run *outside* the policy system; a deliberate, audited hole that must
  pin `search_path`, live in an unexposed schema, and revoke `EXECUTE` from
  anon/authenticated. *Avoid* calling `service_role` "an admin role" (it is outside RLS
  entirely, not elevated within it).
- **The migration is the unit of change** — every schema delta reaches prod only as a
  committed, ordered, reversible, idempotent migration; state at any commit is replayable from
  zero. *Avoid* "schema update" for a console hotfix — if it is not a committed migration it
  is drift, even if it "works."
- **Schema drift** — any divergence between the live schema and its sources of truth
  (committed migrations, declarative schema, generated `database.types.ts`). *Avoid* limiting
  "drift" to hand-edits; a stale generated-types snapshot is drift too.
- **Source of truth** — the single place a fact is written; an *unmechanized* duplicate is a
  divergence hazard. *Avoid* "cache" for a hand-maintained copy (a cache self-invalidates).
- **Illegal vs merely-rare state** — an illegal state can never legitimately occur (make it
  unrepresentable); a rare-but-real state (a member with no birthday) must stay representable.
  Check **both** directions. *Avoid* treating every nullable column as a defect.
- **Three-valued logic / NULL** — predicates are true / false / UNKNOWN; `CHECK` passes on
  true-OR-null; `UNIQUE` treats NULLs as distinct by default; `NULL` means exactly one of
  "unknown" or "not applicable." *Avoid* "empty" / "blank" / "zero."

### 4.3 Relationships block

A trust boundary lives at exactly one of DB / app / nowhere. RLS-correct = `ENABLE` +
per-command policies + `WITH CHECK`. Least privilege = role `GRANT` **and** row policy **and**
column `GRANT`. Entity integrity = surrogate PK **and** a natural-key `UNIQUE`.

### 4.4 Rejected framings

- *"RLS enabled = protected"* — rejected; audit the predicate, not the `ENABLE` flag.
- *"`service_role` is an admin role"* — rejected; it is outside RLS, not elevated within it.
- *"It works, so it shipped correctly"* — rejected for an un-migrated (console) change.
- *"Normalization = always go to a higher normal form"* — rejected; it ignores deliberate,
  documented stored balances (this would re-litigate ADR-0004).
- *"A JOIN is always a smell"* — rejected.
- *"`NULL` = empty"* — rejected; it hides the 3VL semantics that silently break filters,
  aggregates, and a `CHECK`-without-`NOT NULL`.

## 5 · Falsifiable diagnostic tests

Each is a **runnable, binary** experiment. **No severity scores, no 1–5 ratings** — those
kill falsifiability. Locked terminology: **#1 is the flagship; #9 is the (machine-checked)
floor.**

> **Safety classification (load-bearing — see §10).** Tests split into **read-only** (safe to
> run during the broad Phase-1 sweep) and **destructive write-probes** (run only as guarded
> Phase-3 *confirmation* of a chosen candidate, never as bare prod writes).

| # | Test | Class | What it proves |
|---|---|---|---|
| **1** | **Bypass-the-app** *(flagship)* — attempt the violating `INSERT`/`UPDATE` via `execute_sql` | **destructive** | Row created ⇒ the rule lives only in TypeScript, unenforced for every other writer. |
| 2 | **Existing-violation count** — anti-join / `GROUP BY … HAVING count>1` / `WHERE col IS NULL` against live data | read-only | Non-zero ⇒ no constraint guards it (or a `NOT VALID` was never validated — check `convalidated`). |
| 3 | **Cross-tenant denial** — set JWT to tenant B; try to reach A's rows + call both RPCs | **destructive** (RPCs mutate) | Any rows / any non-raising RPC ⇒ a leak. |
| 4 | **Write-side IDOR** — as B, `UPDATE … SET user_id=<A>` / `INSERT … user_id=<A>` | **destructive** | Re-homes/inserts ⇒ the `WITH CHECK` door is unlocked (read tests miss this). |
| 5 | **Delete-the-GRANT** *(deletion-test analog)* — `REVOKE` a privilege, run app flows | **destructive** (scratch branch) | Nothing breaks ⇒ unnecessary surface; partial break ⇒ over-granted. |
| 6 | **DEFINER + search_path** — enumerate `pg_proc.prosecdef`+`proconfig` | read-only | A definer object without pinned `search_path` / reachable by anon ⇒ a hole. |
| 7 | **From-zero replay / drift** — `db diff` vs a shadow DB built from `supabase/migrations/`; regenerate `database.types.ts` and diff | read-only | Non-empty either way ⇒ named, locatable drift. |
| 8 | **Lock-and-rewrite** — classify the riskiest recent `ALTER`'s lock level / rewrite | read-only | Bare `ADD CONSTRAINT` / type rewrite / non-concurrent index on a hot table ⇒ `ACCESS EXCLUSIVE`. |
| **9** | **Advisor-floor** *(floor)* — `get_advisors(security)` + `(performance)` | read-only | Must be empty for `rls_disabled_in_public`, `rls_enabled_no_policy`, `security_definer_view`, `function_search_path_mutable`, `unindexed_foreign_keys`, `auth_rls_initplan`. |

The **read-only surfacing / destructive confirmation** split is what makes the flagship
falsifiable *and* safe: Phase 1 *predicts* a gap by reading the catalog
(`pg_constraint`, `pg_policies`, advisors, counts); Phase 3 *proves* it with the matching
destructive probe under a rollback/branch guard. Both halves are kept; the proof can never
fire as a bare prod write.

## 6 · Process (explore → present candidates → grill)

- **Phase 0 — read first.** `CONTEXT.md` (domain nouns) + **all** `docs/adr/*`. Run
  `get_advisors(security & performance)`, `list_migrations`, `list_tables` as the
  machine-checked first pass. (The ADR-respecting behavior is a *generic mechanism* — see §9.)

- **Phase 1 — Explore (read-only).** Dispatch an `Explore` subagent to harvest every *rule*
  (from `CONTEXT.md` / Zod / forms / `pg_policies` / migrations), then ask uniformly "where is
  this enforced?" using **only read-only inspection** (tests 2, 6, 7, 8, 9, plus catalog reads
  that *predict* the gaps tests 1/3/4 would confirm). Note friction as *"rule R is enforced at
  the wrong layer"* — one verdict shape, **no per-category checklist**. **No write-probe runs
  in this phase.**

- **Phase 2 — Present candidates.** A **numbered** list of misplaced trust boundaries. Each:
  - **Rule** (in `CONTEXT.md` terms)
  - **Current boundary** (app / nowhere / DB-but-`NOT VALID` / RLS-but-`USING`-only)
  - **Tables · policies · migrations** involved
  - **The exposure** — which writer or path can violate it (cite the read-only evidence; the
    destructive proof is offered for Phase 3)
  - **Proposed boundary move** — plain English, **no DDL/migration yet**
  - **Payoff** — which writers/paths it closes for, and the pgTAP/advisor test it enables

  Mark ADR conflicts only when friction warrants reopening, clearly flagged. End:
  *"Which boundary would you like to move?"*

- **Phase 3 — Grill (chosen candidate).** Walk the design tree by sub-domain:
  - *correctness* → `CHECK` vs constraint, 3VL (`NOT NULL` beside the `CHECK`?), enum vs lookup vs `CHECK IN` by churn
  - *access* → `USING` + `WITH CHECK` pairing, `TO authenticated`, indexed policy column, InitPlan wrap
  - *change-safety* → `NOT VALID` + `VALIDATE`, `CREATE INDEX CONCURRENTLY`, `lock_timeout`, expand/contract phasing, reversibility

  **Optionally** run the destructive confirmation probe for the chosen gap (test #1/#3/#4, or
  #5 for a least-privilege gap) — **only** inside the §10 guard. End by drafting the **watching
  test** (`throws_ok`, a
  cross-tenant negative test, or a from-zero replay check). **Never `apply_migration` without
  explicit authorization.**

- **Phase 3 side-effects (inline).** New concept named ⇒ add to `CONTEXT.md`; the user keeps a
  rule app-side for a *durable* reason ⇒ offer an ADR so future audits stop re-suggesting it.
  Both reuse `grill-with-docs`'s `CONTEXT-FORMAT.md` / `ADR-FORMAT.md` (referenced, not
  duplicated), and only when a future explorer would actually need the reason.

## 7 · File structure (progressive disclosure)

```
~/.claude/skills/improve-database-architecture/
├── SKILL.md                  # thin, always-loaded spine
├── BOUNDARY-LANGUAGE.md      # LANGUAGE.md analog: vocab + two-writer principle + rejected framings
├── MOVE-THE-BOUNDARY.md      # DEEPENING.md analog: boundary-class taxonomy → safe pattern + pgTAP assertion
└── REMODEL-TWICE.md          # (conditional) INTERFACE-DESIGN.md analog — see §7.1
   # references (does NOT copy) grill-with-docs/{CONTEXT-FORMAT,ADR-FORMAT}.md
```

- **`SKILL.md`** — frontmatter (a `"Use when…"` description, **no workflow summary**, per CSO;
  Supabase named explicitly per §8), a compact glossary stub, **the flagship test (#1) and the
  floor (#9)** one line each, the §10 safety invariant stated up front, the 3-step process with
  links, and the Supabase tooling note (`get_advisors` / `execute_sql` / `db diff` /
  `apply_migration`-with-gate).
- **`BOUNDARY-LANGUAGE.md`** — §4 in full.
- **`MOVE-THE-BOUNDARY.md`** — a **boundary-class taxonomy** (column-constraint /
  cross-row-unique / cross-table-FK / row-policy-`USING` / write-policy-`WITH CHECK` /
  role-`GRANT` / definer-hardening / online-migration-required) → the safe Postgres pattern
  (`NOT VALID`+`VALIDATE`, partial/`NULLS NOT DISTINCT` unique index, `TO authenticated` +
  indexed column + InitPlan wrap, `SET search_path=''`, `CONCURRENTLY`+`lock_timeout`+
  expand/contract) → the matching pgTAP/advisor assertion (`col_not_null`, `has_unique`,
  `fk_ok`, `throws_ok`, `policy_cmd_is`, `is_definer`, `has_index`). Consulted during grilling.

### 7.1 `REMODEL-TWICE.md` — re-scoped, conditional fourth file

The source's `INTERFACE-DESIGN.md` works because interface design is a genuinely *open* design
space. The trust-boundary lens has **already answered *where*** the rule goes (the data tier),
and *which mechanism* is already covered by the Phase-3 grill and the `MOVE-THE-BOUNDARY`
taxonomy. So a "design it twice" file is only justified for the one genuinely-open question
this lens still has: **when a gap's best fix is a structural *remodel*, not a one-line
constraint.**

`REMODEL-TWICE.md` is invoked **only** when closing a gap needs restructuring (e.g. a co-NULL
cluster that should become a subtype table; a loose-domain column that is enum *vs* lookup+FK
*vs* `CHECK IN`, with materially different evolution/locality trade-offs). It frames the fact +
its legal states, spawns 3+ parallel subagents each producing a radically different *structure*
under one constraint (split-into-subtype / discriminator + partial constraints / enum /
lookup+FK), each returning a DDL sketch + which illegal states it forbids + migration/backfill
strategy + trade-offs; then compares by which gaps each closes and recommends.

**Conditional-existence rule (validate-before-codify applied to the file structure):** if the
Forge dry-run (§11) surfaces **zero** findings whose best fix is a structural remodel, ship
**three files** and fold any rare remodel case into the grill, rather than shipping a fourth
file that never fires.

## 8 · Reusability & graceful degradation

**Primary target: Supabase (Postgres) projects** — stated honestly in the `description` and
here. The flagship and the floor lean on Supabase: test #9 (`get_advisors`) and test #7
(`db diff` vs `supabase/migrations/`). On a plain-Postgres repo with no advisor and no
`supabase/migrations/` layout, those two would silently evaporate and the skill would lose its
spine — so the skill does **not** claim "any Postgres repo."

**Plain-Postgres degradation (documented, not silent):**
- **#9 floor →** direct catalog queries computing the same lints: `pg_policies` for
  RLS-enabled-without-policy, `pg_proc.prosecdef`+`proconfig` for definer-without-pinned-
  `search_path`, an FK-without-covering-index join for unindexed FKs.
- **#7 drift →** `pg_dump --schema-only` diff against the migration replay (whatever migration
  tool is present), and a generated-types diff if the project generates types.

## 9 · Guardrails — the skill is reusable; ADRs are *read*, not hardcoded

The ADR-respecting behavior is a **generic mechanism**: *Phase 0 reads `docs/adr/`; mark a
conflict only when friction warrants reopening; never re-litigate a settled decision.* The
specific Forge ADRs are **project context the skill reads when run on Forge**, not skill
content. When run on this repo, that mechanism makes the audit honor:

- **ADR-0001** — Supabase + RLS is the **primary** security boundary; **no ORM** (supabase-js
  in a server-only DAL returning DTOs); `getClaims()`/`getUser()` not `getSession()`; Next 16
  uses `proxy.ts` not `middleware.ts`. *Never* propose an ORM, moving security off RLS, or
  `getSession()`.
- **ADR-0002** — persist only stored facts; `estado`, `diasRest`, `asistEsteMes`, `inicial`
  are read-time projections. *Never* propose re-adding these as columns.
- **ADR-0003** — locked domain rules; attendance stored as **absolute América/Chihuahua
  dates**. *Never* propose offset-based or UTC attendance.
- **ADR-0004** — `clientes.clases_restantes` (NULL = ilimitado) and `vence` are a **deliberate**
  stored running balance (the one sanctioned exception to ADR-0002, because stacking is
  path-dependent). *Never* flag these two columns as denormalization to remove, nor demand
  ledger-replay on read. (*May* note the absence of a committed reconcile/drift detector — ADR-
  0004 itself anticipates one.)
- **ADR-0005** — the money path is atomic **SECURITY INVOKER** RPCs (`registrar_venta`,
  `toggle_pase`); the seam is deliberately thin (math stays in tested TS in `src/domain`; the
  DB does only the transaction). The three attendance rules live in `toggle_pase` by necessity
  with no TS twin. *Never* demand these move to TS, nor flag the SQL/TS split as an unmitigated
  smell.
- **Single-operator deployment** — contention is near-zero. *Never* raise multi-writer
  locking/serialization as a defect.
- **Canonical provisioner** — the committed `supabase/migrations/` set reproduces the live
  schema from scratch; `rls_auto_enable()` and the atomic RPCs were reconstructed verbatim. *Do
  not* re-raise live-DB drift for these already-mirrored objects.
- **Deliberate value-snapshots** — `clientes.paquete_nombre` and the `ventas` paquete fields are
  intentional snapshots (like an append-only ledger), not accidental denormalization.
- **NULL-as-sentinel** — `clases_restantes`/`clases` NULL = ilimitado; `vigencia_dias` NULL =
  a `mes` package. Do not break the DAL's `clasesFromDb`/`clasesToDb` mapping or the
  `paquetes_vigencia_ck` coupling.
- **append-only `ventas`** — SELECT + INSERT policies only; sales are immutable. Do not propose
  mutation policies.
- **Integer whole-MXN money** — `monto`/`precio` are integer pesos by design. A non-negative
  `CHECK` is a fair finding; a currency/decimal-type redesign is not.

## 10 · Safety invariants (promoted into the skill, not just the build chapter)

These live in `SKILL.md` as a named, up-front invariant — because the *shipped* skill runs
against live databases, not only the build dry-run:

1. **No write-probe ever runs unguarded against a live project.** Tests #1, #3, #4, #5 are
   destructive. They run **only** as Phase-3 confirmation of a chosen candidate, and **only**
   inside one of:
   - a Supabase **`create_branch`** ephemeral branch (preferred for a multi-probe pass), or
   - a **single self-contained `BEGIN; … ; ROLLBACK;` script in one `execute_sql` call** —
     because each MCP call runs on its own connection, a `BEGIN` and a `ROLLBACK` in *separate*
     calls do not compose. (The existing `supabase/tests/rls_cross_tenant_denial.sql` is the
     reference pattern.)
2. **Phase 1 is read-only.** Gaps are *surfaced* by catalog/advisor/count reads; they are
   *proven* by destructive probes later, under guard #1.
3. **`apply_migration` is never invoked without explicit human authorization.** The
   candidate-driven gate is a safety mechanism; DB changes are stateful and often irreversible,
   and on this project `apply_migration` goes straight to the remote project
   (`hjppxawglmukfvsgmcog`).

## 11 · Build approach — validate on Forge, then codify

Per *validate-before-codify*, the implementation plan will:

1. **Dry-run the audit on Forge's real schema** via the Supabase MCP — `get_advisors` +
   `pg_policies`/`pg_catalog` reads + `db diff`, plus any destructive confirmation **wrapped per
   §10** (ephemeral branch or single `BEGIN…ROLLBACK` script; **no `apply_migration`**). Produce
   a real numbered list of trust-boundary findings.
2. **Validate the findings.** They *should* land on the named residual risks (no CI test
   runner; frozen `database.types.ts` that can desync; direct `INSERT`/`UPDATE` doors on
   `clientes`/`asistencias` that bypass the RPC seam; `monto`/`precio` with no non-negative
   `CHECK`; `asistencias` lacking a partial-unique guard on active `(cliente_id, fecha)`). They
   *should not* flag `saldo` / `paquete_nombre` / the SQL-only attendance rules. **If the output
   is wrong, fix the lens before writing the skill.**
3. **Extract the skill** — write the files (§7), distilling the process that produced good
   findings. Apply the §7.1 conditional-existence rule to decide three vs four files.
4. **Pressure-test** — hand a fresh subagent the skill + a schema; confirm it produces
   trust-boundary findings in the locked verdict shape, respects the ADRs, **never auto-
   migrates or runs an unguarded write-probe**, and uses the locked vocabulary. Close loopholes,
   re-test (per `writing-skills`).
5. **Deploy** — commit to `~/.claude/skills/improve-database-architecture/`.

## 12 · Audit deltas folded into this design

This design was revised against a five-point audit before being written:

1. **Safety hole in the shipped Phase 1** — destructive probes (#1/#3/#4) were dispatched in the
   broad sweep with no rollback discipline. **Fixed** by the read-only-Phase-1 / guarded-Phase-3
   split (§5, §6, §10), promoted into `SKILL.md`.
2. **Fourth file at war with the thesis** — "where to place the rule" is already answered by the
   lens. **Fixed** by re-scoping to `REMODEL-TWICE.md` (structural remodels only) with a
   conditional-existence rule (§7.1), rather than the redundant "which mechanism" rename.
3. **Overstated portability** — "any Postgres/Supabase repo" but #7/#9 are Supabase-specific.
   **Fixed** by narrowing the claim to Supabase **and** documenting plain-Postgres degradation
   (§8).
4. **Missing two-writer analog** — **added** as the headline Principle (§4.1), refined to
   *independent* writers, which also supplies the honest Supabase grounding.
5. **The skill's own vocabulary drift** — "2 flagship tests" vs one flagship + one floor.
   **Fixed**: flagship = #1, floor = #9, locked across §5 and §7.

## 13 · Out of scope (YAGNI)

- The performance/access-path lens ("earns its keep", EXPLAIN-driven) — a distinct lens
  (research Candidate 2); not this skill. (Its single best line, the two-reader rule, is *not*
  imported; the two-*writer* rule is the boundary analog.)
- Auto-applying migrations or auto-fixing findings — explicitly excluded (§2, §10).
- A general data-modeling tutorial — the skill audits, it does not teach normal forms.

## 14 · Success criteria

- Run on Forge, the skill produces a numbered list of real trust-boundary findings in the
  locked verdict shape, lands on the named residual risks, and re-litigates **zero** ADRs.
- Every finding names the pgTAP/advisor test that would watch it.
- A fresh agent given only the skill + a schema applies the lens correctly, stays in the
  vocabulary, never runs an unguarded write-probe, and never `apply_migration`s unprompted.
- `SKILL.md` carries no workflow summary in its description, names Supabase honestly, and states
  the §10 safety invariant up front.
