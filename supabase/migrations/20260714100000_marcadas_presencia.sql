-- Perf wave 5: PRESENCE for dots, IDS only where identity is needed.
--
-- 20260714090000 windowed getMarcadas to the initial [desde, hasta) reach, but it still
-- ships FULL uuid[] arrays for ~4 months — 107,600 bytes of jsonb on the seed. Yet the
-- day strip and the month calendar only render a per-day DOT: they need PRESENCE (did
-- anyone attend that day), not identity. Identity — WHICH clientes — is only needed for
-- the ONE selected day, whose roster the operator toggles. So the window collapses to
-- per-day COUNTS (~1,890 bytes) and the ids travel only for the day in view.
--
-- This migration adds the presence variant. It does NOT touch marcadas_por_gym — that
-- id-map function stays exactly as 20260714090000 left it and is reused, unchanged, for
-- the single-day id fetch (a 1-day [fecha, fecha+1) window). ONE signature per function
-- name (no overloads) keeps PostgREST dispatch unambiguous (PGRST203).
--
-- COUNTS, not just presence booleans: count(distinct cliente_id) is the same DISTINCT
-- the id-map already dedupes on (a member marked front-desk AND via a session that day is
-- one attendance, ruling C15), costs nothing extra over a bare presence check, and gives
-- the dot a real number to grow a future badge from without another schema change.
--
-- HALF-OPEN [p_desde, p_hasta): `fecha >= p_desde and fecha < p_hasta` — the same grammar
-- marcadas_por_gym speaks, so the initial multi-month window and the lazy month-fetch
-- address a month as [firstOf(M), firstOf(M+1)) with no shared-boundary double count.
--
-- SECURITY INVOKER + `search_path = ''` with schema-qualified names (mirrors 20260714090000,
-- clears the function_search_path_mutable advisor). RLS on `asistencias` scopes every row to
-- the caller's gym; the `gym_id = p_gym_id` filter is defense-in-depth. EXECUTE granted to
-- `authenticated` only (the operator reads this), not left at PUBLIC.
create or replace function public.marcadas_presencia(p_gym_id uuid, p_desde date, p_hasta date)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  select coalesce(jsonb_object_agg(fecha_txt, n), '{}'::jsonb)
  from (
    select fecha::text as fecha_txt, count(distinct cliente_id) as n
    from public.asistencias
    where gym_id = p_gym_id
      and deleted_at is null
      and fecha >= p_desde
      and fecha < p_hasta
    group by fecha
  ) t;
$$;

revoke execute on function public.marcadas_presencia(uuid, date, date) from public;
grant execute on function public.marcadas_presencia(uuid, date, date) to authenticated;
