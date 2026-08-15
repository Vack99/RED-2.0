# Runbook — correcting a mis-sold venta (authenticated gym owner)

**Date authored:** 2026-07-10 · **Ruling:** C8, "Runbook now, RPC later" (`docs/FIndings/2026-07-08-renewal-flow-findings.md`). An `anular_venta` RPC ships only if mis-sales prove frequent; until then, correction is an owner-run SQL recipe.

## Amended 2026-08-13 (#269) — this runbook is now the PAST-WINDOW escape hatch only

Correction shipped in-product. From a client's ficha, any staff member can now:

- **Edit `monto` + `metodo` at any age** — `editar_venta(p_venta_id, p_monto, p_metodo, p_fecha)`, SECURITY INVOKER under `ventas_staff_update`. No compensating row, no window.
- **Delete a sale within 30 days of its `created_at`** — `eliminar_venta(p_venta_id)`, SECURITY DEFINER, one transaction: hard-deletes the `ventas` row and claws the saldo back (subtracts the sale's `clases` and its vigencia-days, floored at 0; reverts `paquete_nombre` to the most recent remaining sale). Wrong paquete = delete + re-sell through `/vender?cliente=<id>`. Past 30 days the affordance is simply absent.

**Amended 2026-08-14 (#269 fast-follow):** ruling #266.3 was reversed — the sold date is editable in product too. `editar_venta`'s 4th argument `p_fecha` moves a sale's `fecha` inside `registrar_venta`'s own backdate bounds (not future, no more than 30 days back, never before the client's alta) and writes midday gym-tz on the chosen day, exactly as a backdated sale does (`20260814120000_editar_venta_fecha.sql`). It re-attributes the sale's day and its **earnings month, and nothing else**: `clases_restantes`, `vence` and `paquete_nombre` stay untouched, because a moved fecha is not invertible into a new vigencia — when the vigencia is what's wrong, it is still delete + re-sell. Only a date **outside** those bounds (older than 30 days, or before the client's alta) has no in-product path; that one is still a hand-fix as `postgres` — a direct `update public.ventas set fecha = …` on the single row by `id`, which likewise re-derives no saldo.

`ventas` is **no longer append-only**: `ventas_staff_update` exists, DELETE is revoked from `authenticated` outright, and UPDATE is column-scoped to `(monto, metodo, fecha)` (`20260813120000_editar_eliminar_venta.sql`; ADR-0005's 2026-08-13 note carries why).

**Use the recipe below only for a sale older than the 30-day delete window** — that is the one case with no in-product path. Everything below still applies verbatim for it: never `UPDATE`/`DELETE` an old `ventas` row by hand, post a compensating negative row instead.

## The one rule (past the window): the ventas ledger is append-only

Since #269 `ventas` RLS is **select + insert + a column-scoped update** — `ventas_staff_update` exists, but the table grant is revoked and re-granted on `(monto, metodo, fecha)` only (`fecha` since the 2026-08-14 fast-follow), so those three columns are the *only* thing any direct write can reach. There is still **no delete policy at all**: DELETE is revoked from `authenticated` outright and `eliminar_venta` (SECURITY DEFINER) is the only door, which is what keeps the 30-day window and the saldo clawback unskippable.

For a sale **past that window** — the only case this runbook covers — nothing here has changed: **never `DELETE` the row, and never hand-`UPDATE` anything but `monto`/`metodo`/`fecha` (and for those, use the in-product edit below, not SQL)**. A correction is a **compensating negative `ventas` row** (the reversal, so `Σ monto` stays truthful) plus a **`saldo` fix on `clientes`**, both in **one transaction**.

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

### Right package, wrong price / method only — do NOT use SQL for this

Superseded by #269: `editar_venta` fixes `monto` and `metodo` in place at **any age**, window or no window. Open the client's ficha → tap the row in HISTORIAL DE PAGOS → correct the amount / method → GUARDAR. No compensating row, no folio hole, no saldo to touch. The old two-row recipe is strictly worse here and is not reproduced.

## Do NOT

- `UPDATE`/`DELETE` the original `ventas` row — breaks `Σ monto` and folio continuity.
- Set `idempotency_key` on the compensating insert — leave it NULL.
- Compute the "pre-sale" saldo from the ledger — the stored balance is authoritative and the ledger is not a full journal of saldo deltas (por-pagar-free, but forfeit/stack are not ledgered). Use a snapshot or backup.
