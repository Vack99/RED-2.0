# ADR-0005 — Atomic write seam: Postgres RPCs for the money path

**Status:** Accepted · **Date:** 2026-06-01 · **Realizes:** the atomicity consequence-clause of [ADR-0004](0004-saldo-stored-running-balance.md); builds on [ADR-0001](0001-supabase-rls-no-orm.md)

## Context

ADR-0004 made the saldo (`clases_restantes` + `vence`) a stored running balance and noted its
consequence: *"a write that stacks must be atomic (read-modify-write under the operator's
session)."* The two money-path writes did not honor that. Each was **two separate statements**
from the DAL with no transaction around them:

- `crearVenta`: `UPDATE clientes` (new saldo) **then** `INSERT ventas` (folio). A failure between
  them leaves the saldo mutated with no venta recorded (or vice-versa).
- `togglePase`: `SELECT` the active row **then** conditionally `INSERT`/soft-delete + a separate
  `UPDATE clientes` for the ±1 class. The read and the guarded decrement are not isolated.

Postgres is the only place a true transaction spanning both statements can live (ADR-0001: no ORM,
no app-server DB session). So the atomic unit must be a database function.

## Decision

Move **only the transaction** into two `plpgsql` RPCs — `registrar_venta` and `toggle_pase` —
called via `supabase.rpc(...)` from the DAL. The seam is deliberately **thin**:

- **Math stays in the tested TS domain** (`src/domain`): `crearVenta` still computes the stacked
  saldo (`baseParaStack` + `stackPaquete`) and new `vence`, then hands the *results* to the RPC.
  The DB does the write, never the rules. `toggle_pase` carries the small on/off + guarded ±1
  decision because it is inseparable from the transaction itself, not business policy.
- **`SECURITY INVOKER`** (the default): the function runs as the calling operator, so the existing
  RLS policies on `clientes`/`ventas`/`asistencias` remain the authorization boundary (ADR-0001).
  `auth.uid()` inside the function is the operator. **`SET search_path TO ''`** keeps the functions
  injection-safe (every object schema-qualified) and clears the `function_search_path_mutable`
  advisor.
- **EXECUTE granted to `authenticated` only** — revoked from `anon`/`public`. (A `DROP+CREATE`
  re-triggers Supabase's default privileges, which re-grant `anon`; the migrations re-revoke it —
  see the type-bridge note.)

### The type-bridge: `DEFAULT NULL` + trailing params

Supabase generates RPC params as non-nullable. But ilimitado clients pass `clases_restantes = null`
and `mes` packages pass `vigencia_dias = null`, and a new-client sale has no `cliente_id`. Rather
than `as any` at the call site, `registrar_venta`'s nullable params were **reordered to trail with
`DEFAULT NULL`** (migration `20260601010721`). The generated type then makes exactly those keys
optional; the DAL **omits** a key when its value is null (object-spread guard) so the SQL default
applies. No `as any`, the types stay honest. `toggle_pase` needed no change (its two args are never
null).

## Consequences

- The saldo mutation + venta insert (and the attendance toggle + decrement) are now all-or-nothing.
  A mid-write failure rolls back cleanly; no half-applied money state.
- The canonical provisioner is the migration set (audit finding #7): the as-deployed RPCs are
  mirrored in `supabase/migrations/20260531211105_atomic_write_rpcs.sql` (reconstructed verbatim
  from the live DB after the prior session applied them without mirroring), and the DEFAULT-NULL
  redefinition + the anon revoke are their own migrations. A from-scratch build now reproduces prod.
- Each RPC is smoke-tested in a rolled-back transaction on the real schema (new/existing client,
  finite/ilimitado/mes packages, toggle on/off, back-dated day, zero-balance guard) before wiring —
  finding #3: a behavior claim needs an executing test.
- Trade-off: business-adjacent logic now lives in two languages. Mitigated by keeping the SQL
  strictly transactional and leaving every *rule* in `src/domain`; the RPC bodies are reviewed
  against the TS they replace.
- Single-operator concurrency context (ADR-0004) is unchanged: contention is near-zero, but the
  transaction is now correct under it regardless.
