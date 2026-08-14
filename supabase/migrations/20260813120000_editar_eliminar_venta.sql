-- Issue #269 — payment correction from the ficha: `editar_venta` (monto + método, any age) and
-- `eliminar_venta` (hard delete + saldo clawback, windowed to 30 days from `created_at`). Rulings in
-- #266 (delete model / window / edit scope / permission = any staff) and #267 (the clawback rule).
-- Until now `ventas` was append-only by policy: `ventas_staff_select` + `ventas_staff_insert` only,
-- no UPDATE/DELETE policy had ever existed (20260702173309:44-50 says so in its own header), and
-- `docs/runbooks/venta-correction.md` was the only correction path. That runbook now covers ONLY
-- sales past the 30-day window.
--
-- ── DEVIATION from the issue's AC1 ("SECURITY INVOKER + ventas_staff_update + ventas_staff_delete") ─
-- AC1 shipped literally would OPEN a hole, because of the ambient table-grant trap 20260808130000:20-34
-- measured live on `gym`: Supabase's project scaffold runs a schema-wide `ALTER DEFAULT PRIVILEGES ...
-- GRANT ALL ON TABLES TO anon, authenticated, service_role`, so `authenticated` ALREADY holds
-- UPDATE/DELETE on every `ventas` column. That grant is inert today only because no UPDATE/DELETE
-- policy exists to compose with it. Adding the two policies activates it: any staff identity could
-- then `DELETE /rest/v1/ventas?id=eq.<x>` or `PATCH` `folio`/`clases`/`gym_id` straight through PostgREST
-- — bypassing the window AND the clawback, leaving `clases_restantes`/`vence` permanently wrong. That
-- migration's header states the obligation outright: "Anyone adding the table's NEXT write policy
-- (INSERT/DELETE) needs the same revoke-first step — RLS default-deny is not a substitute for it once
-- a policy for that command exists." So:
--
--   * editar_venta stays SECURITY INVOKER (ADR-0005) with `ventas_staff_update`, but the table grant is
--     revoked and re-granted COLUMN-SCOPED to (monto, metodo). That caps a raw PATCH at those two
--     columns — folio/clases/gym_id/fecha stay unreachable — and `ventas_metodo_check` still binds the
--     método domain. It does NOT make a raw PATCH equivalent to the RPC: PostgREST PATCH is
--     filter-based, so `?cliente_id=eq.<x>` rewrites every matching row at once, and `monto` carries no
--     table CHECK, so even the `>= 1` floor below lives only on the RPC door. The residual is therefore
--     gym-staff-scoped self-harm — a signed-in operator mangling their OWN gym's amounts (RLS still
--     pins the tenant) — accepted under the gym's-data ruling: it's the gym's data, and we optimize for
--     the administrator's agency rather than adding locks the owner did not ask for.
--   * eliminar_venta is SECURITY DEFINER and ships NO delete policy, with DELETE revoked outright.
--     DELETE has no column granularity, so an INVOKER+policy design cannot be closed the same way —
--     definer keeps the window + clawback the only door. Its gym gate (`staff_gym()` +
--     `gym_id = v_gym`) is inside the body, unchanged from AC1. ADR-0005 carries the dated note.
--
-- ── The clawback is a LOSSY inversion — deliberately, per ruling #267.4 ─────────────────────────────
-- `registrar_venta`'s stacking is path-dependent and its inputs are not all recoverable from `ventas`:
-- the sale's effective start `v_inicio` is never stored, `v_base_dias` was CLAMPED to 0 when the client
-- was already expired at `v_inicio` (so `vence - compra_dias` is exact only when no clamping happened),
-- and the ilimitado->finite branch DISCARDED the prior balance (`v_new_clases := v_pk_clases`), which is
-- genuinely irreversible. The ruling's mitigation is the approximation implemented below: subtract what
-- the sale granted, floor the balance at 0, and let the confirm dialog show the computed result before
-- anything happens (#267.6 requires that preview anyway, so the admin always sees the number first).
-- A null `clases_restantes` is ilimitado and stays null; a null `venta.clases` subtracts nothing.
--
-- Expand-only (two new functions, one new policy, grant/revoke), idempotent (create-or-replace,
-- drop-policy-if-exists, grants re-apply cleanly), safe out of order on the live project.

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. editar_venta — correct the amount or the payment method of a sale, at ANY age (#266.3).
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Close the ambient table-wide UPDATE grant FIRST (see header), then re-grant only the two columns the
-- RPC itself writes. `anon` is named explicitly: the scaffold grants it separately from PUBLIC.
revoke update on public.ventas from anon, authenticated;
grant update (monto, metodo) on public.ventas to authenticated;

drop policy if exists "ventas_staff_update" on public.ventas;
create policy "ventas_staff_update" on public.ventas for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

create or replace function public.editar_venta(p_venta_id uuid, p_monto integer, p_metodo text)
  returns void
  language plpgsql
  security invoker
  set search_path to ''
as $function$
declare
  v_gym uuid;
begin
  -- Authorization first, input second — the registrar_venta order (functions-canonical/
  -- registrar_venta.sql:30-31 gates before :46-48 validates): a caller with no staff row learns
  -- 'No autorizado' and nothing about which arguments this gym would have accepted.
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- Re-assert the domain in-body so a bad método surfaces a human message instead of a raw 23514,
  -- exactly as registrar_venta does ('pendiente' was removed by ruling C2).
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  -- `monto` has NO table CHECK, so this is the only place any bound exists at all — the Zod schema
  -- sits on the far side of the trust boundary and binds nobody calling the RPC directly. Same raise
  -- shape as registrar_venta's custom precio (functions-canonical/registrar_venta.sql:69-71), but the
  -- bound is deliberately ONE-SIDED: that 100 000 cap governs only the CUSTOM branch, while the
  -- PAQUETE branch writes `monto` from `paquetes.precio`, which carries no CHECK and no ceiling. An
  -- upper bound here would make an already-registered high-value sale permanently UNCORRECTABLE —
  -- the sheet seeds its field from the stored monto, so the operator could not even fix the método —
  -- and it would buy nothing, since the residual this migration accepts is an unbounded PATCH anyway.
  if p_monto is null or p_monto < 1 then
    raise exception 'Monto inválido';
  end if;

  -- `gym_id = v_gym` makes a cross-tenant id a REFUSAL, not a silent zero-row no-op.
  update public.ventas set monto = p_monto, metodo = p_metodo
   where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005): revoke from BOTH public AND anon (a bare revoke from PUBLIC does not
-- remove anon's separate platform default-privilege grant — 20260808130000:104-109) ───────────────
revoke execute on function public.editar_venta(uuid, integer, text) from public, anon;
grant  execute on function public.editar_venta(uuid, integer, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. eliminar_venta — hard-delete a sale within 30 days of registration and claw back what it granted.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- No `ventas_staff_delete` policy, by design (see header). The revoke below is what makes this RPC the
-- only door: with no DELETE grant, RLS never even gets a chance to compose.
--
-- Attendances are never touched — `asistencias` has no link to `ventas` (zero inbound FKs), so in the
-- duplicate-sale scenario that drove #267 both real attendance rows survive and the balance clawback
-- alone restores the as-if-never-sold state. Every earnings surface recomputes from raw `ventas` rows
-- on read, so week/month analytics correct themselves; the stored saldo is the only derived value that
-- needs fixing, and it is fixed in this same transaction.
revoke delete on public.ventas from anon, authenticated;

create or replace function public.eliminar_venta(p_venta_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_gym   uuid;
  v_venta record;
  v_dias  integer;
begin
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- FOR UPDATE on the VENTA, not just on the cliente below: two overlapping deletes of the same sale
  -- would otherwise both pass the window check, serialize on the clientes lock, and each apply the full
  -- clawback — the loser deleting zero rows but still subtracting the clases/días a second time, which
  -- corrupts the stored balance permanently. The lock makes the second call wait and then find nothing.
  select v.cliente_id, v.clases, v.vigencia_tipo, v.vigencia_dias, v.created_at into v_venta
    from public.ventas v
    where v.id = p_venta_id and v.gym_id = v_gym
    for update;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- #266.2: the window runs from registration, NOT from the backdatable sold date `fecha`.
  if v_venta.created_at < now() - interval '30 days' then
    raise exception 'La venta ya no se puede eliminar';
  end if;

  -- Lock the saldo row before the read-modify-write, same discipline as registrar_venta.
  perform 1 from public.clientes c where c.id = v_venta.cliente_id for update;

  -- The tenant predicate rides the MUTATING statement (house form), and the rowcount check makes a
  -- zero-row delete a refusal instead of a clawback with nothing to claw back.
  delete from public.ventas where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- Ruling C1: 'mes' is a flat 30 days; 'dias' uses its own count; null contributes nothing.
  v_dias := case when v_venta.vigencia_tipo = 'mes' then 30
                 else coalesce(v_venta.vigencia_dias, 0) end;

  -- The lossy inversion (see header): subtract what this sale granted, floor at 0. A null balance is
  -- ilimitado and stays null; a null `clases` (an ilimitado sale) subtracts only days. paquete_nombre
  -- reverts to the most recent REMAINING sale — the delete above already ran, so this sale is gone
  -- from the candidate set; null when none remain (#267.5).
  update public.clientes c
     set clases_restantes = case when c.clases_restantes is null then null
                                 else greatest(0, c.clases_restantes - coalesce(v_venta.clases, 0)) end,
         vence = case when c.vence is null then null else c.vence - v_dias end,
         paquete_nombre = (select v.paquete_nombre from public.ventas v
                            where v.cliente_id = c.id and v.gym_id = v_gym
                            order by v.created_at desc, v.id desc
                            limit 1)
   where c.id = v_venta.cliente_id;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005) ────────────────────────────────────────────────────────────────────
revoke execute on function public.eliminar_venta(uuid) from public, anon;
grant  execute on function public.eliminar_venta(uuid) to authenticated;
