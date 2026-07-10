# Runbook — correcting a mis-sold venta (authenticated gym owner)

**Date authored:** 2026-07-10 · **Ruling:** C8, "Runbook now, RPC later" (`docs/FIndings/2026-07-08-renewal-flow-findings.md`). An `anular_venta` RPC ships only if mis-sales prove frequent; until then, correction is an owner-run SQL recipe.

## The one rule: the ventas ledger is append-only

`ventas` RLS is **select + insert only** — no update, no delete policy (ADR-0005; the revenue aggregations in `resumen.ts`/`derive.ts` sum every `monto` and assume no row ever mutates or vanishes). **Never `UPDATE` or `DELETE` a `ventas` row.** A correction is a **compensating negative `ventas` row** (the reversal, so `Σ monto` stays truthful) plus a **`saldo` fix on `clientes`**, both in **one transaction**.

Run **authenticated as the gym owner** — no service role needed, and none would work:
- Nothing is deleted, and the staff RLS policies already permit the whole correction: `ventas_staff_insert` covers the negative-`monto` row (there is no sign gate) and `clientes_staff_update` grants staff direct UPDATE on the saldo columns (`20260702173309_gym_scoped_rls_policies.sql:40-50`).
- The folio draw **requires** staff: `next_folio()` raises unless `is_staff_of(p_gym)` (`20260705082018`), which is false when `auth.uid()` is NULL — so a raw service-role / `postgres` session fails at step 1.

From the SQL editor or MCP `execute_sql` (which connect as `postgres`), impersonate the owner **inside the transaction** — the same pattern the SQL test suites use (the worked example below opens with it). From an already-authenticated owner session, skip those two lines.

## What the correction touches

- **`ventas`** — one INSERT, `monto < 0`, offsetting the wrong sale. `monto` has no `>= 0` CHECK, so a negative row is legal; `metodo` must be one of `efectivo`/`transferencia`/`tarjeta` (the `pendiente` method was removed by ruling C2). Draw the folio with `public.next_folio(<gym_id>)` — the per-gym folio, same as the RPC. **Omit `idempotency_key`** — it is nullable (`20260710120000_renewal_schema_prep.sql`), and only `registrar_venta`'s own retry rail uses it; a manual compensating insert has no client key.
- **`clientes`** — one UPDATE rolling `clases_restantes` / `vence` / `paquete_nombre` back to the corrected state.
- The stored saldo is authoritative and **not** re-derivable from the ledger (ADR-0004), so the correct target state is an input you supply — from the pre-sale snapshot, a backup, or the operator's knowledge of the prior balance — not something the recipe computes.

## Pre-flight

1. Identify the wrong `ventas` row (its `id`, `cliente_id`, `monto`, `metodo`, `folio`).
2. Snapshot the client's **current** saldo and record the **target** saldo (what it should be after the correction) — see the worked example for how the wrong sale's stack is undone.
3. Wrap everything in `BEGIN … COMMIT`. Read the post-correction verify SELECT **before** `COMMIT`; `ROLLBACK` on any surprise.

## Worked example — wrong package sold

Operator sold client `<cliente_id>` the **"8 clases"** pack ($800, `efectivo`) when the member asked for **"Ilimitado"** ($1200). The sale already stacked onto the client: `clases_restantes` went `<base_clases> → <base_clases>+8`, `vence` extended, `paquete_nombre = '8 clases'`, and a +$800 `ventas` row posted (`folio <wrong_folio>`).

The clean correction is **reverse, then re-sell correctly through the normal flow**:

```sql
begin;

-- Authenticate as the gym owner (only needed from a postgres/SQL-editor/MCP session;
-- <owner_auth_uid> = the owner's auth.users id). next_folio + RLS then pass.
select set_config('request.jwt.claims',
  json_build_object('sub', '<owner_auth_uid>', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 0. Confirm current state (record the output; abort if it isn't what you expect).
select id, clases_restantes, vence, paquete_nombre
  from public.clientes where id = '<cliente_id>';

-- 1. Compensating negative venta: cancels the wrong +$800 in the ledger.
--    Same metodo as the original (the refund channel). No idempotency_key.
--    RETURNING surfaces the compensating folio for your record.
insert into public.ventas
  (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id)
values
  ('<cliente_id>', public.next_folio('<gym_id>'),
   'CORRECCIÓN: reversa 8 clases (folio <wrong_folio>)',
   null, 'dias', null, -800, 'efectivo', '<gym_id>')
returning folio, monto;

-- 2. Roll the client's saldo back to the pre-sale state (undo the wrong pack's grant).
--    Target values come from your snapshot / backup — NOT computed here.
update public.clientes
   set clases_restantes = <pre_sale_clases>,
       vence            = '<pre_sale_vence>',
       paquete_nombre   = '<pre_sale_paquete_nombre>'
 where id = '<cliente_id>';

-- 3. Verify saldo is restored, THEN commit. (The ledger nets to zero by
--    construction: +800 wrong sale + -800 compensating row.)
select clases_restantes, vence, paquete_nombre
  from public.clientes where id = '<cliente_id>';

commit;
```

Then **re-sell the correct package through the normal path** — the app's COBRAR flow / `registrar_venta` with `p_paquete_id = <ilimitado_id>` and a fresh `p_idempotency_key`. It re-derives price, balance, and vence from the paquete row and stacks onto the just-restored base (ruling C13), so the correct +$1200 sale posts with its own folio and the member ends in the right state. Do **not** hand-write the correct sale — let the RPC derive it.

### Simpler case — right package, wrong price / method only

If only the amount or method was wrong (correct package, correct saldo), skip step 2: post the compensating negative `ventas` row for the wrong `monto`, then re-sell at the correct price via `registrar_venta`. The saldo never moves; only the ledger is rebalanced.

## Do NOT

- `UPDATE`/`DELETE` the original `ventas` row — breaks `Σ monto` and folio continuity.
- Set `idempotency_key` on the compensating insert — leave it NULL.
- Compute the "pre-sale" saldo from the ledger — the stored balance is authoritative and the ledger is not a full journal of saldo deltas (por-pagar-free, but forfeit/stack are not ledgered). Use a snapshot or backup.
