# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**This repo is single-context.** One `CONTEXT.md` and one `docs/adr/` at the root — a monorepo, but the domain language and the decisions are shared across every package.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain vocabulary (gym, inquilino, marca, venta, pase, …).
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`ARCHITECTURE.md`** at the repo root — the package map and the enforced cross-package dependency boundary. Read it before adding or moving code.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md          ← domain vocabulary
├── ARCHITECTURE.md     ← package map + dependency boundary
├── docs/adr/           ← 0001…00NN, all system-wide
├── apps/{admin,client}
└── packages/{domain,format,data,ui,brand}
```

There is no `CONTEXT-MAP.md` and no per-package `CONTEXT.md`. Don't create one without a decision to split the context.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids. The domain speaks Spanish: `venta`, `cliente`, `pase`, `vence`, `saldo`. Keep it.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0005 (atomic write RPCs) — but worth reopening because…_

**One ADR is known-wrong and must not be trusted:** ADR-0013 §2/§3 claim the gym RLS helper is O(1)-per-statement and forbid changing it. Both claims are false — it is a correlated SubPlan, evaluated per row. Don't let it talk you out of a `.eq("gym_id", …)` scope selector.
