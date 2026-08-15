-- Fast-follow to #269 — `ventas.fecha` becomes editable in place through `editar_venta`.
--
-- Ruling #266.3 ("edit covers monto + metodo; a wrong fecha is delete + re-sell") was REVERSED by the
-- owner on 2026-08-14, from real desk use: the operator forgets to register a sale on the day it
-- happened and registers it days later, so the money lands on the wrong day — and across a month
-- boundary, in the wrong EARNINGS MONTH. That is a pure attribution error, and deleting a real sale
-- to re-post it is a disproportionate tool for it.
--
-- Scope is exactly that attribution — the sold date and the month it counts in. `clientes.vence`,
-- `clases_restantes` and `paquete_nombre` are deliberately NOT recomputed: registrar_venta's stacking
-- is path-dependent and not invertible from `ventas` alone (20260813120000's header spells out why),
-- so re-deriving a saldo from a moved fecha would be a guess dressed as a correction. When the
-- vigencia itself must move, delete + re-sell through the normal flow remains the tool.
--
-- The bounds MIRROR registrar_venta's backdate window verbatim, messages included (functions-canonical/
-- registrar_venta.sql:106-120 + :137-139): not future, not older than 30 days, not before the cliente's
-- alta — so the edit door cannot write a fecha the create door would have refused. The written instant
-- is registrar's convention too (:232-236): midday in the gym's timezone on the chosen day, which keeps
-- the sale's gym-tz DAY stable no matter which timezone reads it back.

-- The column-scoped UPDATE grant from 20260813120000 has to widen to `fecha`: editar_venta is SECURITY
-- INVOKER, so the UPDATE below runs with the CALLER's privileges and a column missing from the grant is
-- a hard `permission denied`, not a policy question. The residual is the one that migration already
-- accepted for `monto` — a raw PostgREST PATCH reaches the column without the RPC's bounds — and it
-- lands the same way: gym-staff-scoped self-harm on the gym's own data (RLS still pins the tenant),
-- accepted under the gym's-data ruling rather than answered with a lock the owner did not ask for.
-- folio, clases, cliente_id and gym_id stay unreachable.
grant update (fecha) on public.ventas to authenticated;

-- Drop the 3-arg overload FIRST. PostgREST resolves an RPC by the NAME SET of the posted arguments, so
-- leaving the old signature beside a 4-arg-with-default makes every 3-arg call — the one the app
-- already ships — ambiguous (PGRST203, "could not choose the best candidate function").
drop function if exists public.editar_venta(uuid, integer, text);

create or replace function public.editar_venta(p_venta_id uuid, p_monto integer, p_metodo text,
                                               p_fecha date default null)
  returns void
  language plpgsql
  security invoker
  set search_path to ''
as $function$
declare
  v_gym      uuid;
  v_tz       text;
  v_hoy      date;
  v_alta     timestamptz;
  v_fecha_ts timestamptz;
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

  -- null p_fecha = "don't touch the date": the 3-arg call this replaces keeps its exact old behavior.
  if p_fecha is not null then
    select g.timezone into v_tz from public.gym g where g.id = v_gym;
    v_hoy := (now() at time zone v_tz)::date;

    if p_fecha > v_hoy then
      raise exception 'La fecha de inicio no puede ser futura';
    end if;
    if p_fecha < v_hoy - 30 then
      raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad';
    end if;

    -- The alta floor is registrar's third bound: a sale cannot predate the client it belongs to. Read
    -- through the venta so the lookup carries the tenant gate — a cross-tenant id is 'Venta no
    -- encontrada' here too, the same refusal the UPDATE below would give, so the bound leaks nothing.
    select c.created_at into v_alta
      from public.ventas v
      join public.clientes c on c.id = v.cliente_id
     where v.id = p_venta_id and v.gym_id = v_gym;
    if not found then raise exception 'Venta no encontrada'; end if;
    if p_fecha < (v_alta at time zone v_tz)::date then
      raise exception 'La fecha de inicio es anterior al alta del cliente';
    end if;

    v_fecha_ts := (p_fecha::timestamp + interval '12 hours') at time zone v_tz;
  end if;

  -- `gym_id = v_gym` makes a cross-tenant id a REFUSAL, not a silent zero-row no-op.
  update public.ventas set monto = p_monto, metodo = p_metodo, fecha = coalesce(v_fecha_ts, fecha)
   where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005): revoke from BOTH public AND anon (a bare revoke from PUBLIC does not
-- remove anon's separate platform default-privilege grant — 20260808130000:104-109) ───────────────
revoke execute on function public.editar_venta(uuid, integer, text, date) from public, anon;
grant  execute on function public.editar_venta(uuid, integer, text, date) to authenticated;
