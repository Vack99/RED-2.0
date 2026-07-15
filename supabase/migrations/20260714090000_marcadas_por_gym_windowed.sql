-- Perf wave 4: WINDOW getMarcadas' initial load. 20260714060000 shipped
-- marcadas_por_gym(p_gym_id) returning the WHOLE active-attendance ledger — every
-- date since the gym opened → uuid[]. That is 123 KB of jsonb for a gym at 120 days
-- of history and grows unbounded with every operating day; PostgREST does not gzip
-- RPC responses, and the map is serialized a second time into the RSC flight payload.
-- The full-history contract was a DELIBERATE deferral (see the getMarcadas docblock);
-- this migration ends it by taking a [p_desde, p_hasta) date window.
--
-- HALF-OPEN [p_desde, p_hasta): `fecha >= p_desde and fecha < p_hasta`. Chosen so a
-- month is addressed as [firstOf(M), firstOf(M+1)) with no shared-boundary double count
-- and no leap/DST edge — the lazy month-fetch and the initial multi-month window both
-- speak the same half-open grammar. Callers pass gym-local dates (asistencias.fecha is a
-- bare DATE in gym-local terms, ADR-0003), resolved via @gym/format's hoyEnZona/toIsoDay.
--
-- EXACTLY ONE function named marcadas_por_gym: the 1-arg signature is DROPPED, not kept
-- alongside. Two same-named functions of different arity make PostgREST refuse the RPC
-- with PGRST203 (overload ambiguity), so the old signature must go.
--
-- SECURITY INVOKER + `search_path = ''` with schema-qualified names, matching the hardened
-- convention of 20260714070000 (clears the function_search_path_mutable advisor). RLS on
-- `asistencias` still scopes every row to the caller's gym; the `gym_id = p_gym_id` filter
-- is defense-in-depth on top. EXECUTE is granted to `authenticated` only (the operator
-- reads this) rather than left at PUBLIC — tighter than the dropped 1-arg version.
drop function if exists public.marcadas_por_gym(uuid);

create or replace function public.marcadas_por_gym(p_gym_id uuid, p_desde date, p_hasta date)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  select coalesce(jsonb_object_agg(fecha_txt, cids), '{}'::jsonb)
  from (
    select fecha::text as fecha_txt, array_agg(distinct cliente_id) as cids
    from public.asistencias
    where gym_id = p_gym_id
      and deleted_at is null
      and fecha >= p_desde
      and fecha < p_hasta
    group by fecha
  ) t;
$$;

revoke execute on function public.marcadas_por_gym(uuid, date, date) from public;
grant execute on function public.marcadas_por_gym(uuid, date, date) to authenticated;
