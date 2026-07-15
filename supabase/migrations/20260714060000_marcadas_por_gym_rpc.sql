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
-- NOTE: this function is left without an explicit EXECUTE grant here. Under Supabase's
-- default ACL, PUBLIC is NOT granted EXECUTE on new functions, so this definition alone
-- is not reachable by anon/authenticated — this is superseded by 20260714090000, which
-- recreates the function (windowed signature) WITH explicit grants to the API roles.
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
