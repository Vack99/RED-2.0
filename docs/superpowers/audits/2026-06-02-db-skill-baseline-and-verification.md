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

_(appended in Phase C — Task 8.)_
