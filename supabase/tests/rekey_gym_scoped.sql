-- Gym-scoped unique re-key suite (slice #24; ADR-0008). WRITTEN FIRST (TDD).
--
-- Proves the four user_id-keyed uniques are re-keyed gym-scoped AND the old global folio unique is gone:
--   ventas   unique(folio)          -> unique(gym_id, folio)
--   perfil   unique(user_id)        -> unique(gym_id)
--   cobro    unique(user_id)        -> unique(gym_id)
--   paquetes unique(user_id,nombre) -> unique(gym_id, nombre)
--   paquetes one-popular partial index: per-operator -> per-gym
--
-- Two proofs per rule: (1) CATALOG — the old constraint/index is absent and the gym-scoped one present
-- (this block also fails loudly if the #24 migration is not applied to the branch under test); (2)
-- BEHAVIORAL — a within-gym duplicate RAISES unique_violation while the cross-gym twin is accepted.
-- Fixtures are seeded as the connecting role (RLS bypassed) and rolled back; zero prod UUIDs.
--
-- HOW TO RUN: `node supabase/tests/run-denial-suite.mjs`, or ad hoc via the Supabase MCP execute_sql.

begin;

-- ── (1) CATALOG: old uniques gone, gym-scoped uniques present ─────────────────
do $$
declare defs text;
begin
  -- Old global/user_id constraints must be GONE.
  if exists (select 1 from pg_constraint where conname in
      ('ventas_folio_uq','perfil_user_id_key','cobro_user_id_key','paquetes_nombre_uq')) then
    raise exception 'REKEY FAIL: an old user_id/global unique still exists (migration not applied?)';
  end if;
  if exists (select 1 from pg_indexes where schemaname='public' and indexname='paquetes_one_popular'
             and indexdef ilike '%(user_id)%') then
    raise exception 'REKEY FAIL: paquetes_one_popular still keyed on user_id';
  end if;

  -- Gym-scoped replacements must be PRESENT (constraint defs, order-independent match).
  select string_agg(conname||'='||pg_get_constraintdef(oid), ' | ') into defs
    from pg_constraint where conrelid in
      ('public.ventas'::regclass,'public.perfil'::regclass,'public.cobro'::regclass,'public.paquetes'::regclass)
      and contype='u';
  if position('UNIQUE (gym_id, folio)'  in defs) = 0 then raise exception 'REKEY FAIL: ventas missing UNIQUE (gym_id, folio); have %', defs; end if;
  if position('UNIQUE (gym_id, nombre)' in defs) = 0 then raise exception 'REKEY FAIL: paquetes missing UNIQUE (gym_id, nombre); have %', defs; end if;
  -- perfil + cobro each become UNIQUE (gym_id): expect the token to appear at least twice.
  if (length(defs) - length(replace(defs,'UNIQUE (gym_id)',''))) / length('UNIQUE (gym_id)') < 2 then
    raise exception 'REKEY FAIL: perfil and/or cobro missing UNIQUE (gym_id); have %', defs;
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='paquetes_one_popular'
                 and indexdef ilike '%(gym_id)%' and indexdef ilike '%popular%') then
    raise exception 'REKEY FAIL: paquetes_one_popular not re-keyed to (gym_id) WHERE popular';
  end if;
end $$;

-- ── (2) BEHAVIORAL: within-gym duplicate rejected, cross-gym twin accepted ────
do $$
declare
  gym_p uuid := gen_random_uuid();
  gym_q uuid := gen_random_uuid();
  u_p   uuid := gen_random_uuid();
  u_q   uuid := gen_random_uuid();
  cli_p uuid;
  cli_q uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_p, 'rekey-gym-p', 'Rekey Gym P', 'America/Chihuahua',  'forge'),
    (gym_q, 'rekey-gym-q', 'Rekey Gym Q', 'America/Mexico_City', 'red');
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', u_p, 'authenticated', 'authenticated', 'rekey-p@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_q, 'authenticated', 'authenticated', 'rekey-q@test.local');
  insert into public.clientes (user_id, gym_id, nombre, tel) values (u_p, gym_p, 'Cli P', '6140000003') returning id into cli_p;
  insert into public.clientes (user_id, gym_id, nombre, tel) values (u_q, gym_q, 'Cli Q', '6140000004') returning id into cli_q;

  -- ventas unique(gym_id, folio): same folio in two gyms OK; repeat within one gym rejected.
  insert into public.ventas (user_id, gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
    values (u_p, gym_p, cli_p, 2001, '8 clases', 8, 'dias', 20, 750, 'efectivo');
  insert into public.ventas (user_id, gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
    values (u_q, gym_q, cli_q, 2001, '8 clases', 8, 'dias', 20, 750, 'efectivo');  -- cross-gym twin: OK (global unique is GONE)
  begin
    insert into public.ventas (user_id, gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
      values (u_p, gym_p, cli_p, 2001, '8 clases', 8, 'dias', 20, 750, 'efectivo');
    raise exception 'REKEY FAIL: duplicate folio 2001 within gym_p was accepted';
  exception when unique_violation then null; end;

  -- perfil unique(gym_id): one perfil per gym.
  insert into public.perfil (user_id, gym_id, negocio) values (u_p, gym_p, 'P');
  insert into public.perfil (user_id, gym_id, negocio) values (u_q, gym_q, 'Q');  -- other gym: OK
  begin
    insert into public.perfil (user_id, gym_id, negocio) values (u_q, gym_p, 'P2');
    raise exception 'REKEY FAIL: second perfil in gym_p was accepted';
  exception when unique_violation then null; end;

  -- cobro unique(gym_id): one cobro per gym.
  insert into public.cobro (user_id, gym_id, titular) values (u_p, gym_p, 'P');
  insert into public.cobro (user_id, gym_id, titular) values (u_q, gym_q, 'Q');  -- other gym: OK
  begin
    insert into public.cobro (user_id, gym_id, titular) values (u_q, gym_p, 'P2');
    raise exception 'REKEY FAIL: second cobro in gym_p was accepted';
  exception when unique_violation then null; end;

  -- paquetes unique(gym_id, nombre): same nombre across gyms OK; repeat within a gym rejected.
  -- (vigencia_dias supplied to satisfy paquetes_vigencia_ck: dias-tipo requires a non-null vigencia_dias.)
  insert into public.paquetes (user_id, gym_id, nombre, precio, vigencia_dias) values (u_p, gym_p, '8 clases', 750, 30);
  insert into public.paquetes (user_id, gym_id, nombre, precio, vigencia_dias) values (u_q, gym_q, '8 clases', 750, 30);  -- cross-gym: OK
  begin
    insert into public.paquetes (user_id, gym_id, nombre, precio, vigencia_dias) values (u_p, gym_p, '8 clases', 800, 30);
    raise exception 'REKEY FAIL: duplicate paquete nombre within gym_p was accepted';
  exception when unique_violation then null; end;

  -- paquetes one-popular per gym: two popular in one gym rejected; one popular each gym OK.
  update public.paquetes set popular = true where gym_id = gym_p and nombre = '8 clases';
  insert into public.paquetes (user_id, gym_id, nombre, precio, popular, vigencia_dias) values (u_q, gym_q, 'Renovacion', 1200, true, 30);  -- other gym popular: OK
  begin
    insert into public.paquetes (user_id, gym_id, nombre, precio, popular, vigencia_dias) values (u_p, gym_p, 'Renovacion', 1200, true, 30);
    raise exception 'REKEY FAIL: a second popular paquete within gym_p was accepted';
  exception when unique_violation then null; end;

  raise notice 'gym-scoped re-keys: ventas/perfil/cobro/paquetes/one-popular all enforce per-gym, old global unique gone';
end $$;

select 'gym-scoped re-keys: OK' as result;
rollback;
