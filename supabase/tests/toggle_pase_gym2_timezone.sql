-- toggle_pase per-gym timezone vector: a SYNTHETIC gym in America/Mexico_City (distinct from Forge/RED's
-- live America/Chihuahua) proves toggle_pase reads + uses THAT gym's OWN `gym.timezone` row for its
-- hora-stamp and its is-p_fecha-today day boundary, never a fixed default.
--
--   * gym-tz hora stamp        — a cliente under the Mexico_City gym toggled ON for Mexico-City-today gets a
--                                non-null hora — toggle_pase looked up AND used this gym's timezone row.
--   * gym-tz day boundary      — the SAME cliente toggled ON for (gym-today − 1) gets hora NULL: the
--                                "is p_fecha the gym's today" comparison is evaluated in the gym's own zone.
--   (Chihuahua and Mexico City currently share a UTC offset, so this vector alone can't catch a regression
--   to a Chihuahua-only literal that still computes the right date for THIS gym — that's what the grep-proof
--   (no 'America/Chihuahua' string anywhere in toggle_pase) and @gym/format's 2-zone unit tests, on a
--   historically-diverging fixture, are for. This suite guards the gym-derived LOOKUP, not offset math.)
--
-- Per-gym & Contract-B clean (was quarantined pre-B for reusing perfil.user_id / seeding dropped columns): a
-- synthetic gym, its operator (gym_membership), and the cliente are minted tx-local with gen_random_uuid();
-- zero prod UUIDs, zero user_id references. BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into SUITE —
-- or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

-- ── Seed (still the privileged connecting role — RLS-bypassing, exactly like a migration). gym /
-- gym_membership carry NO insert policy for `authenticated` (default-deny, ADR-0013 §3/§4 — writes ride
-- SECURITY DEFINER RPCs), so this seed runs BEFORE the role switch below.
do $$
declare
  v_gym2 uuid := gen_random_uuid();
  op     uuid := gen_random_uuid();
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (v_gym2, 'toggle-pase-gym2-mexico-city', 'TEST Gym 2', 'America/Mexico_City', 'base');

  insert into auth.users (instance_id, id, aud, role, email)
    values ('00000000-0000-0000-0000-000000000000', op, 'authenticated', 'authenticated', 'tp-gym2-op@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values (op, v_gym2, 'operator');

  perform set_config('t.gym2', v_gym2::text, true);
  perform set_config('t.op',   op::text,     true);
end $$;

-- ── Act as the operator (SECURITY INVOKER — RLS applies inside toggle_pase too). ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_gym2     uuid := current_setting('t.gym2', true)::uuid;
  v_cliente  uuid;
  v_today_mx date := (now() at time zone 'America/Mexico_City')::date;
  v_present  boolean;
  v_hora     text;
begin
  -- One finite cliente under gym #2 (the operator is staff of it, so RLS admits the write).
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TEST gym2 finite', '5551230001', 5, v_today_mx + 20, '8 clases', v_gym2)
    returning id into v_cliente;

  -- gym-tz hora stamp: Mexico-City-today toggle ON → non-null hora (tz was gym-derived, not a default).
  select present, hora into v_present, v_hora from public.toggle_pase(v_cliente, v_today_mx);
  if v_present is not true then raise exception 'GYM2 FAIL: toggle ON did not register present'; end if;
  if v_hora is null then raise exception 'GYM2 FAIL: hora-stamp did not fire for Mexico-City-today (tz not gym-derived?)'; end if;
  -- cleanup so the day-boundary row below is fresh
  perform public.toggle_pase(v_cliente, v_today_mx);

  -- gym-tz day boundary: (gym-today − 1) is NOT the gym's today → hora NULL (comparison in the gym's zone).
  select present, hora into v_present, v_hora from public.toggle_pase(v_cliente, v_today_mx - 1);
  if v_present is not true then raise exception 'GYM2 FAIL: back-entry toggle ON did not register present'; end if;
  if v_hora is not null then raise exception 'GYM2 FAIL: back-entry (gym-today − 1) stamped hora % (expected null — day boundary not gym-derived?)', v_hora; end if;

  raise notice 'gym #2 (America/Mexico_City) timezone vector: toggle_pase used its own zone for stamp + day boundary';
end $$;

reset role;

select 'toggle_pase gym #2 timezone vector: OK' as result;
rollback;
