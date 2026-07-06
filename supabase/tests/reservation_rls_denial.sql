-- Cross-tenant + member-own + anon RLS denial suite for the booking core (reservation table + the two
-- booking functions) — slice #57 (PRD #49 S3; ADR-0010 §5 member-owned/transactional; ADR-0013 §3).
--
-- Denial-test-FIRST (TDD): RED before 20260706170000 creates the table/policies/functions ("relation/
-- function does not exist"), GREEN after. Mirrors scheduling_rls_denial.sql — zero prod UUIDs,
-- transaction-local, self-asserting (every check RAISEs; a clean run returns one 'OK' row).
--
-- Vectors proved:
--   1) anon: reads ZERO reservation rows; cannot EXECUTE reservar_clase or contar_reservas_activas.
--   2) member_a1 (gym A): reads their OWN reservation only (not member_a2's, same gym); EVERY direct
--      table write is denied — INSERT of any row (their own included: a free no-consume booking must be
--      impossible), and UPDATE of their own row (no self-served asistida/checked_at, no cancelada→
--      reservada free re-book) affects 0. Member writes exist ONLY inside the booking RPCs.
--   3) member_b (gym B only): reads 0 of gym A's reservations; direct update of gym A's row affects 0.
--   4) staff of gym A: reads the gym's whole reservation roster (both members).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or MCP execute_sql.

begin;

do $$
declare
  gym_a      uuid;
  gym_b      uuid := gen_random_uuid();
  operator_a uuid := gen_random_uuid();
  member_a1  uuid := gen_random_uuid();
  member_a2  uuid := gen_random_uuid();
  member_b   uuid := gen_random_uuid();
  ct_a       uuid;
  session_a  uuid;
  session_b  uuid;   -- a second, EMPTY gym-A session (the direct-insert denial target)
  c_a1 uuid; c_a2 uuid; c_b uuid;
  res_a1 uuid; res_a2 uuid;
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym'; end if;

  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'reservation-denial-gym-2', 'Reservation Denial Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'res-op-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_a1,  'authenticated', 'authenticated', 'res-a1@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_a2,  'authenticated', 'authenticated', 'res-a2@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_b,   'authenticated', 'authenticated', 'res-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (operator_a, gym_a, 'operator'),
    (member_a1,  gym_a, 'member'),
    (member_a2,  gym_a, 'member'),
    (member_b,   gym_b, 'member');

  insert into public.clientes (nombre, tel, clases_restantes, vence, gym_id, auth_user_id)
    values ('Res A1', '0000000001', 5, current_date + 20, gym_a, member_a1) returning id into c_a1;
  insert into public.clientes (nombre, tel, clases_restantes, vence, gym_id, auth_user_id)
    values ('Res A2', '0000000002', 5, current_date + 20, gym_a, member_a2) returning id into c_a2;
  insert into public.clientes (nombre, tel, clases_restantes, vence, gym_id, auth_user_id)
    values ('Res B',  '0000000003', 5, current_date + 20, gym_b, member_b) returning id into c_b;

  insert into public.class_type (gym_id, name) values (gym_a, 'Res Metcon') returning id into ct_a;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct_a, now() + interval '2 days', 60, 20) returning id into session_a;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct_a, now() + interval '3 days', 60, 20) returning id into session_b;

  -- one active reservation per gym-A member
  insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (gym_a, session_a, c_a1, 'reservada') returning id into res_a1;
  insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (gym_a, session_a, c_a2, 'reservada') returning id into res_a2;

  perform set_config('t.gym_a',     gym_a::text,     true);
  perform set_config('t.gym_b',     gym_b::text,     true);
  perform set_config('t.operator_a', operator_a::text, true);
  perform set_config('t.member_a1', member_a1::text, true);
  perform set_config('t.member_b',  member_b::text,  true);
  perform set_config('t.c_a1',      c_a1::text,      true);
  perform set_config('t.c_a2',      c_a2::text,      true);
  perform set_config('t.session_a', session_a::text, true);
  perform set_config('t.session_b', session_b::text, true);
  perform set_config('t.res_a1',    res_a1::text,    true);
end $$;

-- ── anon: zero reservation reads; the booking functions are not anon-executable ──
set local role anon;
do $$
declare
  n int;
  session_a uuid := current_setting('t.session_a', true)::uuid;
  raised boolean;
begin
  select count(*) into n from public.reservation;
  if n <> 0 then raise exception 'ANON DENIAL FAIL: anon sees % reservation rows', n; end if;

  raised := false;
  begin perform public.reservar_clase(session_a); exception when others then raised := true; end;
  if not raised then raise exception 'ANON DENIAL FAIL: anon executed reservar_clase'; end if;

  raised := false;
  begin perform public.contar_reservas_activas(array[session_a]); exception when others then raised := true; end;
  if not raised then raise exception 'ANON DENIAL FAIL: anon executed contar_reservas_activas'; end if;
end $$;
reset role;

-- ── member_a1: own-only read; EVERY direct table write denied (writes are RPC-only) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a1', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  gym_a     uuid := current_setting('t.gym_a', true)::uuid;
  c_a1      uuid := current_setting('t.c_a1', true)::uuid;
  c_a2      uuid := current_setting('t.c_a2', true)::uuid;
  session_b uuid := current_setting('t.session_b', true)::uuid;
begin
  -- reads their OWN reservation only — NOT member_a2's, though both are gym A.
  select count(*) into n from public.reservation;
  if n <> 1 then raise exception 'MEMBER READ FAIL: member_a1 sees % reservation rows (expected own 1)', n; end if;
  select count(*) into n from public.reservation where member_id = c_a2;
  if n <> 0 then raise exception 'MEMBER READ FAIL: member_a1 sees % of member_a2''s rows', n; end if;

  -- Direct INSERT of THEIR OWN row is denied: a hand-rolled insert would be a free booking that consumed
  -- nothing and skipped the capacity/expiry/zero-balance guards (ADR-0010 §4 "one reservation = one class
  -- consumed"). session_b is empty, so were the insert allowed nothing else would block it.
  begin
    insert into public.reservation (gym_id, class_session_id, member_id, status)
      values (gym_a, session_b, c_a1, 'reservada');
    raise exception 'MEMBER WRITE FAIL: member_a1 direct-inserted their own reservation (guards bypassed)';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- Direct INSERT of a row owned by another member: equally denied.
  begin
    insert into public.reservation (gym_id, class_session_id, member_id, status)
      values (gym_a, session_b, c_a2, 'reservada');
    raise exception 'MEMBER WRITE FAIL: member_a1 inserted a row owned by member_a2';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- Direct UPDATE of THEIR OWN row affects 0: no self-served asistida/checked_at (§5 reserves that
  -- transition for Pasar lista) and no cancelada→reservada free re-book outside the RPC.
  update public.reservation set status = 'asistida', checked_at = now() where member_id = c_a1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'MEMBER WRITE FAIL: member_a1 direct-updated % of their own reservation rows', n; end if;
end $$;
reset role;

-- ── member_b (gym B only): reads 0 of gym A's reservations; update affects 0 ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
begin
  select count(*) into n from public.reservation where gym_id = gym_a;
  if n <> 0 then raise exception 'CROSS-TENANT FAIL: member_b sees % of gym A''s reservations', n; end if;

  update public.reservation set status = 'cancelada' where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CROSS-TENANT FAIL: member_b updated % of gym A''s reservations', n; end if;
end $$;
reset role;

-- ── staff of gym A: reads the whole gym-A roster (both members) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
begin
  select count(*) into n from public.reservation where gym_id = gym_a;
  if n <> 2 then raise exception 'STAFF READ FAIL: operator_a sees % of gym A''s reservations (expected 2)', n; end if;
end $$;
reset role;

select 'reservation rls denial: OK' as result;
rollback;
