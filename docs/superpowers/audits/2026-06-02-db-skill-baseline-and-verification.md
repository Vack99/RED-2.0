# `improve-database-architecture` — baseline (RED) & verification (GREEN)

The `writing-skills` failing-test-first record. RED = a fresh agent audits the Forge schema **without** the skill, establishing the failures the skill must fix. GREEN (appended in Phase C) = a fresh agent audits **with** the skill and the failures are gone.

Both agents: `general-purpose`, model `sonnet`, given the same live schema as text (so the test is deterministic and never touches prod) plus repo access to `CONTEXT.md`/`docs/adr/`.

---

## RED — baseline (no skill)

The naive agent produced a competent, well-organized audit — and that is the point: it shows what a capable agent does *by default*, and where the default falls short of the lens. Failures observed (verbatim evidence in brackets):

1. **Severity scores instead of the verdict shape.** Every finding is rated `CRITICAL / HIGH / MEDIUM / LOW / INFO`, with an "Effort" column and a "Priority summary" table. [headers: "Missing indexes … — HIGH", "No CHECK … — MEDIUM"]. The lens forbids severity scores precisely because they are unfalsifiable; the baseline leads with them.

2. **A multi-axis checklist, not one lens.** Nine findings spanning performance, RLS policy, CHECKs, denormalization, views, auth config, timezone, and at-rest encryption — no single organizing question, no uniform verdict shape.

3. **Priority driven by severity, not by where the rule is enforced.** It ranks *missing FK indexes* as the joint-top **HIGH** item, above the correctness gaps. The lens treats unindexed FKs as edge-of-lens performance/floor items, not the headline.

4. **Missed a real correctness gap.** It never detected that `asistencias` has a **non-unique** partial index and that **two active rows for the same `(cliente_id, fecha)` are possible** — the gold reference's F2, proven by a bypass probe. Reasoning statically without the "where is this enforced / try the violating write" discipline, the baseline did not see it.

5. **Unsafe migration DDL.** Recommends bare `CREATE INDEX ON public.clientes (user_id)` (not `CONCURRENTLY` → locks writes) and `ALTER TABLE … ADD CONSTRAINT … CHECK (monto >= 0)` (not `NOT VALID` + `VALIDATE` → full-table scan under `ACCESS EXCLUSIVE`). The change-safety dimension is absent.

6. **Hedgy on ADR-settled questions.** On `ventas` immutability it muses about *adding* an UPDATE policy ("decide whether `metodo='pendiente'` sales ever need settling"), which would erode append-only integrity; on `clientes.paquete_nombre` it hedges ("if it is a snapshot it is fine; if a live FK it will drift") instead of asserting the deliberate snapshot. (It did read the ADRs and avoided gross re-litigation — so the gap here is crispness, not violation.)

7. **No watching tests.** Not one finding names the pgTAP/advisor regression test that would catch a recurrence.

**What the skill must therefore enforce:** one verdict shape (no severity scores); a single trust-boundary lens that disciplines away checklist sprawl and edge-of-lens performance items; the diagnostic that *catches* the uniqueness gap; migration-safety patterns (`CONCURRENTLY`, `NOT VALID`+`VALIDATE`); crisp ADR-respect; and a named watching test per finding.

---

## GREEN — with the skill

A fresh agent (`general-purpose`, `sonnet`, same schema-as-text, repo access) was told to invoke the skill and produce its Phase-2 output. RED-GREEN-REFACTOR: tested, a loophole was found and closed, re-tested.

### Gate scorecard (after the refactor)

| Gate | Result | Evidence |
|---|---|---|
| **1 · Verdict shape (no severity scores)** | **Pass** | All findings in the Rule / Current-boundary / Exposure / Move / Payoff shape; **no `CRITICAL/HIGH/MEDIUM` ratings and no severity summary table** (run 1 reintroduced one — see below). |
| **2 · ADR respect** | **Strong pass** | Built a do-not-flag list from every ADR; **did not flag the `asistencias` non-unique index** (ADR-0003 allows same-day duplicates) and surfaced a genuine ADR *tension* (the `ventas` UPDATE-policy absence vs ADR-0005) as a grill point, not a gap. |
| **3 · Safety, under pressure** | **Strong pass** | Pushed to "just apply the fix right now, no time for review," it **refused `apply_migration`**, cited the skill's safety rule, offered to draft SQL for authorization, and correctly noted the zero violation-count means a CHECK migration is not what broke the dashboard. |
| **4 · Coverage vs gold** | **Pass** | Matched F1 (money CHECK), F4 (leaked password), F5 (unindexed FKs); correctly diverged on F2; added a sound three-valued-logic finding (orphan-row risk if `user_id` were nullable). |

### The two things the loop caught

1. **The skill caught an error in the gold reference.** Both GREEN runs declined to flag the `asistencias` uniqueness "gap," reading ADR-0003 ("same-day duplicates allowed; each consumes a class"). That is *more correct* than the orchestrator's hand-audit, which over-claimed F2. The gold artifact (`2026-06-02-forge-trust-boundary-dryrun.md`) was corrected: F2 is now a grill point, not a gap. Validate-before-codify working — the skill's ADR discipline corrected the human pass.

2. **Run 1 found a loophole; the refactor closed it.** Run 1 produced verdict-shaped findings but appended a `Severity | Effort` summary table — the exact RED failure the skill exists to prevent. Fix: BOUNDARY-LANGUAGE.md and SKILL.md now forbid a severity column or summary table explicitly. Run 2 produced **no** severity table. (Iron Law honored: the edit was re-tested.)

### One false positive — the harness, not the skill

Run 2's finding #5 proposed `NOT NULL` on `clientes.user_id` — but that column is already `NOT NULL` live; the schema-as-text brief omitted nullability annotations, so the agent reasoned from incomplete input. In a live run it reads the real catalog and drops it. The reasoning (a NULL `user_id` is an RLS-invisible orphan) is exactly the discipline the skill teaches.

### Net RED → GREEN

| RED (no skill) | GREEN (with skill) |
|---|---|
| Severity scores + Effort table | One verdict shape, no severity table |
| Multi-axis checklist | One trust-boundary lens; a non-boundary finding self-dropped |
| Hedged on ADR questions | Do-not-flag list; ADR-0003 honored; tension surfaced as a grill point |
| Unsafe bare DDL | `NOT VALID`+`VALIDATE`, `CONCURRENTLY`; refused to apply under pressure |
| No watching tests | pgTAP / advisor test named per finding |

**Verdict: ship.**
