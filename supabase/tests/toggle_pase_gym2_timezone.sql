-- Slice #25 seeded-suite vector: a SYNTHETIC gym #2 (America/Mexico_City,
-- distinct from Forge/RED's live America/Chihuahua) proves toggle_pase reads
-- + uses THAT gym's own `gym.timezone` row for its hora-stamp, not a fixed
-- default. Self-contained: creates its own gym + membership + cliente inside
-- the transaction, never touches the live forge/red rows. Reuses the live
-- operator (perfil.user_id, same pattern as toggle_pase_rules.sql) rather
-- than minting new auth.users, so — unlike gym_membership_rls.sql — this is
-- safe to run directly against the live project, not only a preview branch.
-- Zero prod UUIDs. BEGIN/ROLLBACK — touches no row permanently. Composes
-- with #21's mechanized denial harness when the stacks merge (same
-- conventions, no shared fixtures, no dependency on its files).
--
-- HOW TO RUN: via the Supabase MCP execute_sql, or
--   psql "$DATABASE_URL" -f supabase/tests/toggle_pase_gym2_timezone.sql

begin;

-- ── Seed (still the privileged execute_sql role — RLS-bypassing, exactly like
-- a migration): a synthetic gym #2 (Mexico City) + the live operator's
-- membership on it. `gym`/`gym_membership` carry NO insert policy for
-- `authenticated` (default-deny, ADR-0013 §3/§4 — writes ride SECURITY
-- DEFINER RPCs only), so this seed step must run BEFORE the role switch below,
-- exactly as the registration/claim RPCs would (which run SECURITY DEFINER).
do $$
declare
  v_op   uuid := (select user_id from public.perfil order by created_at limit 1);
  v_gym2 uuid;
begin
  insert into public.gym (slug, brand_name, timezone, brand_module_id)
  values ('test-gym2-mexico-city', 'TEST Gym 2', 'America/Mexico_City', 'base')
  returning id into v_gym2;

  insert into public.gym_membership (user_id, gym_id, role)
  values (v_op, v_gym2, 'owner')
  on conflict (user_id, gym_id) do nothing;

  perform set_config('app.gym2', v_gym2::text, true);
  perform set_config('app.op', v_op::text, true);
end $$;

-- ── Act as that authenticated operator for the RLS-scoped cliente insert +
-- the toggle_pase RPC call (SECURITY INVOKER — RLS applies inside it too).
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_op       uuid := current_setting('app.op', true)::uuid;
  v_gym2     uuid := current_setting('app.gym2', true)::uuid;
  v_cliente  uuid;
  v_today_mx date := (now() at time zone 'America/Mexico_City')::date;
  v_present  boolean;
  v_hora     text;
begin
  -- One finite cliente owned by the operator, under gym #2.
  insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
  values (v_op, 'TEST gym2 finite', '0000000003', 5, v_today_mx + 20, '8 clases', v_gym2)
  returning id into v_cliente;

  -- ── The vector: a cliente under a gym whose OWN row is America/Mexico_City
  -- (not Forge/RED's America/Chihuahua) toggles ON for Mexico-City-today and
  -- gets a non-null hora-stamp — proving toggle_pase looked up AND used THIS
  -- gym's own `timezone` row, not a fixed default. (Chihuahua and Mexico City
  -- currently share the same UTC offset, so this vector alone can't catch a
  -- regression back to a Chihuahua-only literal that happens to still compute
  -- the right date for THIS gym — that's what the grep-proof (no
  -- 'America/Chihuahua' string anywhere in toggle_pase) and @gym/format's
  -- 2-zone unit tests, which use a historically-diverging fixture, are for.)
  select present, hora into v_present, v_hora from public.toggle_pase(v_cliente, v_today_mx);
  if v_present is not true then
    raise exception 'GYM2 FAIL: toggle ON did not register present';
  end if;
  if v_hora is null then
    raise exception 'GYM2 FAIL: hora-stamp did not fire for Mexico-City-today (tz not gym-derived?)';
  end if;

  raise notice 'gym #2 (America/Mexico_City) timezone vector: toggle_pase stamped hora % for its own zone', v_hora;
end $$;

select 'toggle_pase gym #2 timezone vector: OK' as result;
rollback;
