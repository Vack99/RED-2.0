-- Perf: replace two correlated per-row embeds (clientes.select("...ventas(count)") and a
-- whole-month asistencias row pull) with DB-side grouped counts, called once per read and
-- merged in JS. SECURITY INVOKER (RLS still scopes every row to the calling operator) +
-- `SET search_path TO ''` with schema-qualified names, mirroring the existing invoker RPCs
-- (20260531211105_atomic_write_rpcs.sql) — keeps the functions injection-safe and clears the
-- function_search_path_mutable advisor. `count(*)::int` (not bare bigint) mirrors
-- contar_reservas_activas so the generated TS type is `number`, never a stringified bigint.

-- getClientesLite (admin/vender): one ventas-per-cliente count instead of a correlated
-- `ventas(count)` embed evaluated once per row of the 500-cliente roster.
create or replace function public.ventas_count_por_cliente(p_gym_id uuid)
returns table (cliente_id uuid, n int)
language sql
stable
security invoker
set search_path to ''
as $$
  select cliente_id, count(*)::int as n
  from public.ventas
  where gym_id = p_gym_id and cliente_id is not null
  group by cliente_id;
$$;

-- getClientesRoster (admin/clientes): this month's attendance count per cliente, instead of
-- pulling every asistencias row for the month and counting them in JS.
create or replace function public.asistencias_mes_por_cliente(p_gym_id uuid, p_desde date)
returns table (cliente_id uuid, n int)
language sql
stable
security invoker
set search_path to ''
as $$
  select cliente_id, count(*)::int as n
  from public.asistencias
  where gym_id = p_gym_id and deleted_at is null and fecha >= p_desde
  group by cliente_id;
$$;

revoke execute on function public.ventas_count_por_cliente(uuid) from public;
revoke execute on function public.asistencias_mes_por_cliente(uuid, date) from public;
grant execute on function public.ventas_count_por_cliente(uuid) to authenticated;
grant execute on function public.asistencias_mes_por_cliente(uuid, date) to authenticated;
