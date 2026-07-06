-- Notifications-preference denial + rules suite (the column + set_notificaciones toggle) — slice #62
-- (PRD #49 S5; ADR-0013 §3 member-owned RLS class; ADR-0005 atomic seam).
--
-- Denial-test-FIRST (TDD): RED before 20260706200000 adds the column/function ("column/function does not
-- exist"), GREEN after. Mirrors reservation_rls_denial.sql + cancelar_reserva_rules.sql — zero prod UUIDs,
-- transaction-local, self-asserting (every check RAISEs; a clean run returns one 'OK' row).
--
-- Vectors proved:
--   DENIAL
--     1) anon: cannot EXECUTE set_notificaciones.
--     2) member_a (gym A): direct UPDATE of notificaciones_activadas on their OWN clientes row affects 0
--        (no member UPDATE policy — the flag moves ONLY through the definer). set_notificaciones flips
--        their OWN row and returns the new value.
--     3) member_b (gym B): set_notificaciones flips member_b's own row only; member_a's row is untouched
--        (self-pin by auth.uid(), never a parameter) — cross-member/cross-tenant isolation.
--   RULES
--     4) default is TRUE on a fresh cliente (socio opted in — mock toggle ON).
--     5) toggle off -> false, on -> true; the RPC returns the stored new value.
--     6) ONLY notificaciones_activadas moves — clases_restantes (an entitlement column the member holds no
--        write on) is untouched across the flips.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or MCP execute_sql.

begin;

do $$
declare
  gym_a     uuid;
  gym_b     uuid := gen_random_uuid();
  member_a  uuid := gen_random_uuid();
  member_b  uuid := gen_random_uuid();
  c_a uuid; c_b uuid;
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym'; end if;

  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'notif-toggle-gym-2', 'Notif Toggle Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', member_a, 'authenticated', 'authenticated', 'notif-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_b, 'authenticated', 'authenticated', 'notif-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (member_a, gym_a, 'member'),
    (member_b, gym_b, 'member');

  -- clases_restantes seeded to prove the definer never touches it; notificaciones_activadas left to default.
  insert into public.clientes (nombre, tel, clases_restantes, vence, gym_id, auth_user_id)
    values ('Notif A', '0000000001', 5, current_date + 20, gym_a, member_a) returning id into c_a;
  insert into public.clientes (nombre, tel, clases_restantes, vence, gym_id, auth_user_id)
    values ('Notif B', '0000000002', 5, current_date + 20, gym_b, member_b) returning id into c_b;

  perform set_config('t.member_a', member_a::text, true);
  perform set_config('t.member_b', member_b::text, true);
  perform set_config('t.c_a',      c_a::text,      true);
  perform set_config('t.c_b',      c_b::text,      true);
end $$;

-- ── RULE: default is TRUE on a fresh cliente (checked privileged, RLS bypassed) ──
do $$
declare v_flag boolean;
begin
  select notificaciones_activadas into v_flag from public.clientes
    where id = current_setting('t.c_a', true)::uuid;
  if v_flag is not true then raise exception 'RULE FAIL(default): fresh cliente flag is % (expected true)', v_flag; end if;
end $$;

-- ── anon: cannot execute the toggle ──
set local role anon;
do $$
declare raised boolean := false;
begin
  begin perform public.set_notificaciones(false); exception when others then raised := true; end;
  if not raised then raise exception 'ANON DENIAL FAIL: anon executed set_notificaciones'; end if;
end $$;
reset role;

-- ── member_a: direct UPDATE denied; the definer flips OWN row and returns the new value ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  c_a uuid := current_setting('t.c_a', true)::uuid;
  n int; v_ret boolean; v_flag boolean; v_clases int;
begin
  -- Direct UPDATE of the preference on their OWN row affects 0 rows — the member holds no UPDATE policy.
  update public.clientes set notificaciones_activadas = false where id = c_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'MEMBER WRITE FAIL: member_a direct-updated % of their own clientes rows', n; end if;

  -- The definer flips it: true -> false, returns false.
  select public.set_notificaciones(false) into v_ret;
  if v_ret is not false then raise exception 'RULE FAIL(off): set_notificaciones(false) returned % (expected false)', v_ret; end if;
  select notificaciones_activadas, clases_restantes into v_flag, v_clases from public.clientes where id = c_a;
  if v_flag is not false then raise exception 'RULE FAIL(off): stored flag % (expected false)', v_flag; end if;
  if v_clases <> 5 then raise exception 'RULE FAIL(off): clases_restantes moved to % (definer touched an entitlement column)', v_clases; end if;

  -- Back on: false -> true, returns true; entitlement still untouched.
  select public.set_notificaciones(true) into v_ret;
  if v_ret is not true then raise exception 'RULE FAIL(on): set_notificaciones(true) returned % (expected true)', v_ret; end if;
  select notificaciones_activadas, clases_restantes into v_flag, v_clases from public.clientes where id = c_a;
  if v_flag is not true then raise exception 'RULE FAIL(on): stored flag % (expected true)', v_flag; end if;
  if v_clases <> 5 then raise exception 'RULE FAIL(on): clases_restantes moved to %', v_clases; end if;
end $$;
reset role;

-- ── member_b: the toggle self-pins — flips b's own row, never member_a's ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  c_a uuid := current_setting('t.c_a', true)::uuid;
  c_b uuid := current_setting('t.c_b', true)::uuid;
  v_a boolean; v_b boolean;
begin
  perform public.set_notificaciones(false);
  -- member_b reads only their own row (clientes_member_select); check b's flag through it.
  select notificaciones_activadas into v_b from public.clientes where id = c_b;
  if v_b is not false then raise exception 'RULE FAIL(b): member_b flag % (expected false)', v_b; end if;
end $$;
reset role;

-- member_a's row was NOT affected by member_b's toggle (checked privileged, RLS bypassed).
do $$
declare v_a boolean;
begin
  select notificaciones_activadas into v_a from public.clientes where id = current_setting('t.c_a', true)::uuid;
  if v_a is not true then raise exception 'CROSS-MEMBER FAIL: member_b''s toggle changed member_a''s flag to %', v_a; end if;
end $$;

select 'notificaciones toggle: OK' as result;
rollback;
