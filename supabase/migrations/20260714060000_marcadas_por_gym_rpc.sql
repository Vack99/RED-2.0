-- Perf: collapse getMarcadas' 5-round-trip / 1000-row `.range()` pagination loop
-- (packages/data/src/server/asistencia.ts) into ONE aggregation round trip. The
-- day->clienteId[] map is built here, DB-side, instead of paging the whole
-- `asistencias` ledger into the app and deduping/grouping in JS.
--
-- SECURITY INVOKER (not DEFINER): the caller's own role runs this function, so
-- the existing `asistencias` RLS policy still enforces gym scoping exactly as it
-- does for the direct-select it replaces (ADR-0005's INVOKER default for reads
-- that don't need to cross a privilege boundary). The explicit `gym_id = p_gym_id`
-- filter is defense-in-depth ON TOP of RLS, not a substitute for it.
--
-- Postgres grants EXECUTE on functions to PUBLIC by default (unlike tables), so
-- no explicit grant is needed here.
create or replace function public.marcadas_por_gym(p_gym_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(fecha_txt, cids), '{}'::jsonb)
  from (
    select fecha::text as fecha_txt, array_agg(distinct cliente_id) as cids
    from asistencias
    where gym_id = p_gym_id
      and deleted_at is null
    group by fecha
  ) t;
$$;
