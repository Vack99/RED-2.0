# ADR-0004 — Active saldo is a stored running balance (extends ADR-0002)

**Status:** Accepted — 2026-05-29

## Context
ADR-0002 keeps `estado`, `vence`, `diasRest`, `asistEsteMes`, and `inicial`
derived, not stored. But the active **saldo** — `clases restantes` and the
package's `vence` — is **path-dependent** under stacking (ADR-0003): buying a
package early ADDS its classes and days onto whatever remains, so the expiry of
the active package cannot be recomputed from a single `fechaCompra + vigencia`.
Fully replaying it from the venta/asistencia ledger on every read is possible but
costly and complicates every query.

## Decision
Persist the active saldo as a **stored running balance** on `clientes`:
- `clases_restantes int` (NULL = ilimitado),
- `vence date` (the stacked expiry).

These are mutated **transactionally** by the write seam: `crearVenta` stacks via
`stackPaquete` and sets `vence = today + stackedDays`; attendance will decrement
via `consumirClase`. The full venta/asistencia ledger remains the audit source of
truth. Everything else stays derived per ADR-0002: `diasRest = diasRestantes(vence,
hoy)`, `estado = derivarEstado({clases: clases_restantes, dias: diasRest})`, with
`forfeit` applied lazily at read.

## Consequences
- Fast reads and simple queries; no ledger replay to show a client's balance.
- One narrow, well-named extension to ADR-0002: `vence` + `clases_restantes` are
  the only stored projections, justified by stacking's path dependence.
- The write seam must keep the running balance and the ledger consistent (both
  happen in the same Server Action). A future reconcile job could re-derive the
  balance from the ledger if drift is ever suspected.
