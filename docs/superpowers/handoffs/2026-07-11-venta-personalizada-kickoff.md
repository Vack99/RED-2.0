# Kickoff — venta personalizada

**You are in the worktree `.claude/worktrees/venta-personalizada`, on branch `worktree-venta-personalizada`, based on `main` @ `95ed5aa`.** Dependencies are installed and the baseline is green (lint clean, typecheck clean, 868/868 tests).

## What you're building

A `PERSONALIZADO` option at the bottom of the plan list in `/vender`'s **Paquete** step. The admin types a name, price, class grant and vigencia, and sells it — a promo, a discount, a one-off deal. It must **never** become a registered plan, because every `paquetes` row is rendered publicly on the gym's `/precios` page and pricing teaser.

## Read these two, in order

1. `docs/superpowers/specs/2026-07-11-venta-personalizada-design.md` — **why**. Six locked decisions, the rejected alternatives, and the one member-visible consequence the owner accepted.
2. `docs/superpowers/plans/2026-07-11-venta-personalizada.md` — **what**. Nine tasks, each with the actual code.

Then execute the plan with `superpowers:subagent-driven-development` (fresh subagent per task) or `superpowers:executing-plans` (inline).

## The three things that will bite you

1. **`registrar_venta` re-derives all money from the `paquetes` row** — the client is forbidden from sending a price (ruling C13). The custom path therefore *must* extend the RPC; it cannot be a client-side price. And the old 8-arg overload **must be dropped in the same migration**, or PostgREST dispatch goes ambiguous (`PGRST203`).

2. **Do not re-implement the stacking math.** Both branches fill the same locals and fall through the *existing* derivation, so C1/C4/C6/C7/C9/D2 are inherited. Vector V3 in the new suite is what catches you if you copy it instead.

3. **`pnpm test` mocks the RPC boundary.** It cannot see a migration that drops a column or stamps the wrong `gym_id` — that is exactly how #78 shipped. The SQL is only really tested by `pnpm test:denial` against a **scratch** Supabase project (Task 9). **The Supabase MCP here is bound to LIVE (`hjppxawglmukfvsgmcog`) — never `apply_migration` while implementing.**

## Open question for the owner (not a blocker)

The plan's Task 3 specifies the denial suite as an exact vector table (inputs → the rows each must write) rather than as finished SQL, and points at `supabase/tests/registrar_venta_stacking.sql` as the idiom to copy. That is the one place the plan states behavior instead of handing you code. Write it against the vector table; assert **written rows**, never the RPC's return value.

## Unrelated work in the main checkout

The primary checkout (`C:\Users\Aaron\Documents\Repos\RED-2.0`) is on branch `forge-gold-accent` with ~13 uncommitted files (brand tokens, forge logo/animation, client pages). Nothing to do with this feature — just don't be surprised by it, and don't merge it in.
