# ADR-0007 — Operator-editable clases: future-only grant, derived nombre, single favorite

**Status:** Accepted · **Date:** 2026-06-05 · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (RLS, no ORM), [ADR-0004](0004-saldo-stored-running-balance.md) (the venta snapshot), [ADR-0005](0005-atomic-write-rpcs.md) (the single atomic write seam) · **Supersedes** the clases-exclusion of [prd-paquetes-editor](../prds/prd-paquetes-editor.md) (now annotated v2)

## Context

The package editor shipped per [prd-paquetes-editor](../prds/prd-paquetes-editor.md) (v1) made
**precio**, **nombre**, and **popular** editable and **deliberately excluded `clases`** — its
load-bearing decision. The v1 reasoning: `crearVenta` re-reads `clases` **live** from the
`paquetes` row at sale time, so changing `clases` would silently change what *future* buyers
receive. v1 treated that as a hazard to design *out*.

On review, the exclusion was the wrong default. Changing what a package grants **to future buyers**
is exactly the operator capability the catalog editor exists to provide — "I now sell a 10-class
pack instead of 8" is a maintenance task, not a developer ticket. The hazard v1 feared
(retroactively altering *past* sales) does not exist: a sale is **snapshotted** onto the immutable
`ventas` row at the moment it happens ([ADR-0004](0004-saldo-stored-running-balance.md) —
`registrar_venta` stores the stacked saldo; `crearVenta` re-reads `clases` live only to *compute*
that snapshot). Editing a package's grant changes future sales only; every past sale keeps the
classes it was sold with. So the capability is safe, and excluding it was over-caution.

Two further problems surfaced once `clases` became editable:

- **Label/grant drift.** v1 let the operator type a free-text `nombre` independent of `clases`.
  With `clases` now editable, a free-text name can lie — a package labelled "8 clases" that grants
  10. The label must be a *function of* the grant, not a parallel free-text field.
- **Multiple favorites.** The catalog surfaces one **popular** (gold-star) package as the steer.
  Nothing in-DB stopped two rows from both being `popular = true`; "the popular package" was a
  convention the UI hoped held, not an invariant.

## Decision

**The package catalog is operator-editable, and editing a package's class grant (`clases`) applies
to FUTURE sales only.** Concretely:

- **`clases` is editable** via a **1–30 / Ilimitado** picker (`null` = ilimitado). The edit payload
  is `{ id, clases, precio, popular }` — there is **no `nombre` input** (see below). A defense-in-depth
  CHECK (`paquetes_clases_ck`: `clases is null or clases between 1 and 30`) mirrors the app's 1–30
  gate; `clases` is the trailing `DEFAULT NULL` RPC param (mirroring `registrar_venta`'s nullable
  bridge, [ADR-0005](0005-atomic-write-rpcs.md)) so the generated TS keeps it optional with no `as any`.

- **Past sales are safe by snapshot; only future sales see the new grant.** `crearVenta` re-reads
  `clases`/`vigencia` **live** from the `paquetes` row at sale time and **snapshots** the result onto
  the immutable `ventas` row ([ADR-0004](0004-saldo-stored-running-balance.md)). A `clases` edit
  therefore changes what *future* buyers receive and **never** touches a recorded sale. This is the
  intended operator capability — the explicit reversal of v1's exclusion — made safe by the snapshot
  that already existed.

- **The display `nombre` is DERIVED from `clases` in-DB — single source of truth.** The RPC stores
  the name it computes from the grant (`null → "Ilimitado"`, `1 → "1 clase"`, `n → "{n} clases"`),
  **mirroring `nombrePaquete` in [`src/domain/rules.ts`](../../src/domain/rules.ts)** (the tested-TS
  *spec* counterpart, [ADR-0005](0005-atomic-write-rpcs.md)). Label and grant cannot drift because
  there is one input. The free-text `nombre` field of v1 is **removed**. The pre-existing
  `paquetes_nombre_uq (user_id, nombre)` unique constraint now reads as a **duplicate-grant** guard:
  two packages that derive to the same class count collide, surfaced to the operator as
  **"Ya tienes un paquete con esa cantidad de clases"**.

- **At most one favorite per operator (`popular`), enforced in-DB.** A partial unique index
  `paquetes_one_popular on (user_id) where popular` makes "≤ 1 popular" an invariant, not a
  convention. *At most one* — zero is allowed; the operator may have no starred package. To avoid a
  legitimate promotion tripping the index, the RPC **demotes siblings before promoting**: when the
  edit sets `popular = true` it first `update ... set popular = false where popular and id <> p_id`
  (RLS owner-scoped), then writes the target row. The demote + promote are one atomic RPC
  ([ADR-0005](0005-atomic-write-rpcs.md)), so the index can never be violated mid-edit, and the two
  distinct 23505s (the `paquetes_nombre_uq` duplicate-grant and the `paquetes_one_popular` favorite
  index) are disambiguated by **constraint name** in the DAL — only the former maps to the friendly
  duplicate message.

The write stays the **single atomic SECURITY INVOKER RPC** of [ADR-0005](0005-atomic-write-rpcs.md)
(`actualizar_paquete`, redefined — the signature changed, so `DROP + CREATE`, `SET search_path TO ''`,
EXECUTE revoked from `public`/`anon` and granted to `authenticated`). The catalog stays
single-operator and owner-scoped by RLS ([ADR-0001](0001-supabase-rls-no-orm.md)); a forged `id`
matches zero rows and raises `'Paquete no encontrado'`.

### Consciously reversing the v1 PRD

[prd-paquetes-editor](../prds/prd-paquetes-editor.md) deliberately excluded `clases` editing as its
load-bearing decision. This ADR **reverses that on purpose.** The rationale: the future-buyer-grant
change *is* the intended operator capability, and the v1 hazard (retro-altering sales) never applied
because [ADR-0004](0004-saldo-stored-running-balance.md)'s snapshot already insulates past sales.
The v1 PRD is annotated as superseded (a v2 banner + inline corrections); this ADR is the durable
home for the decision.

## Consequences

- The operator can change a package's grant and the change flows to **future sales only**; past
  sales keep their snapshotted classes ([ADR-0004](0004-saldo-stored-running-balance.md)). Every
  downstream consumer of the derived `nombre` (vender, recibo, the catalog card, respaldo) auto-flows
  — the label is computed in one place, not restated.
- **Label and grant cannot drift:** removing the free-text `nombre` and deriving it in-DB closes the
  "name says 8, grants 10" gap by construction. The cost is one duplicated derivation (the SQL
  `case` mirrors `nombrePaquete`); it is kept honest by the tested-TS spec counterpart in
  `src/domain/rules.ts`, exactly the TS↔SQL twin discipline of
  [ADR-0005](0005-atomic-write-rpcs.md).
- **"≤ 1 favorite" is now an in-DB invariant**, not UI etiquette: the partial unique index enforces
  it and the RPC's demote-before-promote keeps a legitimate edit from tripping it. Zero favorites is
  a valid state.
- The duplicate-grant message changed from v1's name-based "Ya tienes un paquete con ese nombre" to
  the grant-based **"Ya tienes un paquete con esa cantidad de clases"**, matching what the operator
  actually collided on (two packages granting the same class count). The two 23505 paths are
  disambiguated by constraint name so the favorite index is never mislabeled as a duplicate.
- The 30-day vigencia normalization and the atomic single-RPC write seam are unchanged from v1 /
  [ADR-0005](0005-atomic-write-rpcs.md); only the editable field set and the nombre source moved.
- A future reader must treat the derived `nombre` as read-only output: re-introducing a free-text
  name reopens the drift gap this ADR closes, and would have to reckon with the `paquetes_nombre_uq`
  guard now standing in for duplicate-grant detection.
