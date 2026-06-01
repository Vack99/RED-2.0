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

- **The stacking / forfeit / vigencia math stays in the tested TS domain** (`src/domain`):
  `crearVenta` still computes the stacked saldo (`baseParaStack` + `stackPaquete`) and new `vence`,
  then hands the *results* to the RPC. The DB does the write, never *that* math. `toggle_pase`
  carries the attendance transaction rules — the on/off decision, the guarded ±1 consume/decrement,
  the refund guard, and the hora stamp — because each is inseparable from the transaction itself,
  not freestanding business policy (detailed in *Where each attendance rule lives* below).
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

### Where each attendance rule lives

`toggle_pase` carries three write-rules. None is a freestanding policy that could sit in `src/domain`
without re-creating the TS↔SQL twin the audit warns against (`togglePase` only calls the RPC — a
mirrored TS rule would be a dead orphan). Each is inseparable from the atomic on/off transaction and
so lives in the RPC by necessity; this table is the honest map of where each is stated and tested.

| Attendance rule | Live home | Tested-TS *spec* counterpart | Committed test home |
| --- | --- | --- | --- |
| Consume one class on toggle ON — guarded `clases_restantes - 1 where clases_restantes > 0`; ilimitado (`null`) never decremented, count never below 0 | `toggle_pase` RPC | `consumirClase` in `src/domain/rules.ts` is the read-side / *spec* statement of the consume rule (brief Q6), unit-tested; the RPC mirrors it but is the live path | `supabase/tests/toggle_pase_rules.sql` |
| (b) Refund a class on toggle OFF **iff** the attendance actually consumed one **and** the client is finite — `if v_active_consumio and v_clases is not null then ... + 1` | `toggle_pase` RPC | none — no TS twin (would be a dead orphan) | `supabase/tests/toggle_pase_rules.sql` |
| (c) Stamp `hora` only when `p_fecha` is Chihuahua-today, else `null` — `case when p_fecha = (now() at time zone 'America/Chihuahua')::date then ... else null end` | `toggle_pase` RPC | none — no TS twin (needs the server clock inside the txn) | `supabase/tests/toggle_pase_rules.sql` |

The carve-out for *toggle_pase carries logic the math does not* is **transaction-inseparability**, and
it covers all three: the consume decrement is the write half of the read-modify-write; (b)'s refund
must read the toggled-off row's own `consumio` flag and act on the same balance atomically, so it
cannot be a pure function of the inputs the DAL holds; and (c)'s stamp needs the server clock read
*inside* the transaction (the client clock is not authoritative, and a back-entry must not be stamped
as if it happened now). They live in SQL by necessity, not by oversight — and `toggle_pase_rules.sql`
proves (b) and (c) against the deployed function in a rolled-back transaction.

## Consequences

- The saldo mutation + venta insert (and the attendance toggle + decrement) are now all-or-nothing.
  A mid-write failure rolls back cleanly; no half-applied money state.
- The canonical provisioner is the migration set (audit finding #7): the as-deployed RPCs are
  mirrored in `supabase/migrations/20260531211105_atomic_write_rpcs.sql` (reconstructed verbatim
  from the live DB after the prior session applied them without mirroring), and the DEFAULT-NULL
  redefinition + the anon revoke are their own migrations. A from-scratch build now reproduces prod.
- Each RPC is smoke-tested in a rolled-back transaction on the real schema (new/existing client,
  finite/ilimitado/mes packages, toggle on/off, back-dated day, zero-balance guard) before wiring —
  finding #3: a behavior claim needs an executing test. `toggle_pase`'s two SQL-only rules ((b)
  refund guard, (c) hora stamp) have a durable, MCP-runnable home in
  `supabase/tests/toggle_pase_rules.sql`.
- Trade-off: business-adjacent logic now lives in two languages. Mitigated by keeping the
  stacking / forfeit / vigencia math in `src/domain` and confining the SQL to the transaction —
  including the three attendance rules that are inseparable from it (consume decrement, (b) refund
  guard, (c) hora stamp; see *Where each attendance rule lives*). Those three are owned honestly in
  the RPC rather than mirrored as orphan TS, and are covered by the committed test
  `supabase/tests/toggle_pase_rules.sql`; the RPC bodies are reviewed against the TS they replace.
- Single-operator concurrency context (ADR-0004) is unchanged: contention is near-zero, but the
  transaction is now correct under it regardless.
