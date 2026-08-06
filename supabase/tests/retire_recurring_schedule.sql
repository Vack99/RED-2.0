-- retire_recurring_schedule contract suite — #243, migration 20260806100100.
--
-- ONE operator verb against the repeating rule: "terminar el horario". The class STOPS EXISTING, so
-- every held credit is released through the SHIPPED `cancel_class_session` — one implementation of
-- hold-release, never a copy of the refund body. ("Move" is not a verb: moving a class is retire +
-- create, through the create path that already ships.)
--
-- VECTORS
--  (1) THE ABORT PATH. A mid-loop failure leaves ZERO balances moved, zero sessions cancelled and the
--      template still active. The refund is either whole or absent, never half-paid.
--  (2) RETIRE. is_active flips; every FUTURE non-cancelled class is cancelled; the past one is not;
--      the booked finite member is refunded exactly +1, ONCE; ilimitado stays NULL; an `asistida` row
--      (a CAPTURED hold) stays asistida and is not re-credited.
--  (3) A RETIRED RULE MATERIALIZES NOTHING. ensure_week_materialized for weeks 0..5 each return 0 —
--      and the slot then accepts a fresh create_recurring_schedule, because
--      schedule_template_active_uq is partial on is_active precisely so re-creating IS the un-retire.
--  (4) THE SECOND TAP. A re-retire raises above the loop, and NO balance moves twice.
--
-- The fixture runs in its OWN GYM. ensure_week_materialized is gym-wide (it walks every active
-- template of staff_gym()), so vector (3)'s "each week returns 0" is only a statement about the
-- retired template if no other active template shares the gym.
--
-- Bookings are made through `reservar_clase` AS EACH MEMBER, never seeded by hand: `consumio` is the
-- entire gate on the refund and the only honest way to get it is the function that stamps it.
--
-- EVERY WRITTEN-ROW ASSERTION READS AFTER `reset role`, as ops. The RPC is SECURITY INVOKER, so a
-- count taken under the operator's own JWT is filtered by the very policies under test and a partial
-- write would read as a clean pass. Comparisons use `is distinct from`, never `<>`: a NULL from a
-- mistyped id makes `<>` NULL, which is not true, which silently skips the raise.
--
-- Self-asserting, transaction-local (BEGIN/ROLLBACK), zero prod UUIDs.
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or MCP execute_sql.

begin;

-- ── Seed ─────────────────────────────────────────────────────────────────────────────────────────
-- Every instant is derived from THIS ISO week's local Monday, so the fixture is the same shape
-- whenever the suite runs. now() is the transaction timestamp and is therefore fixed for the whole
-- file — every block below re-derives v_monday from it and gets the identical date.
do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  v_today  date := (now() at time zone v_tz)::date;

  gym_r uuid := gen_random_uuid();
  op_r  uuid := gen_random_uuid();
  u_fin uuid := gen_random_uuid();
  u_ilim uuid := gen_random_uuid();
  u_asis uuid := gen_random_uuid();

  ct_r uuid; coach_r uuid; t uuid;
  c_fin uuid; c_ilim uuid; c_asis uuid;
  s_past uuid; s_f1 uuid; s_f2 uuid; s_f3 uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_r, 'retire-series-gym', 'Retire Series Gym', v_tz, 'forge');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_r,   'authenticated', 'authenticated', 'rs-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_fin,  'authenticated', 'authenticated', 'rs-fin@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_ilim, 'authenticated', 'authenticated', 'rs-ilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_asis, 'authenticated', 'authenticated', 'rs-asis@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_r, gym_r, 'operator'),
    (u_fin, gym_r, 'member'), (u_ilim, gym_r, 'member'), (u_asis, gym_r, 'member');

  insert into public.class_type (gym_id, name) values (gym_r, 'RS Funcional') returning id into ct_r;
  insert into public.coach (gym_id, name, initials, role) values (gym_r, 'RS Coach', 'CR', 'coach') returning id into coach_r;

  -- The series under retire: Miércoles 18:00, 60 min, cupo 20 — alone in its gym (vector 3).
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (gym_r, ct_r, 2, '18:00', 60, 20) returning id into t;
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values (gym_r, t, coach_r);

  -- Its dated classes: one past (never touched by retire) + three future (all cancelled by it).
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday - 7) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t) returning id into s_past;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 7) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t) returning id into s_f1;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 14) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t) returning id into s_f2;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 21) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t) returning id into s_f3;

  -- Members. The three finite/ilimitado/asistida shapes the refund rule discriminates between.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RS finita', '5552200003', 7, v_today + 60, '8 clases', gym_r, u_fin) returning id into c_fin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RS ilimitada', '5552200004', null, v_today + 60, 'Ilimitado', gym_r, u_ilim) returning id into c_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RS asistida', '5552200005', 9, v_today + 60, '8 clases', gym_r, u_asis) returning id into c_asis;

  perform set_config('t.rs_tz',     v_tz,          true);
  perform set_config('t.rs_gym',    gym_r::text,   true);
  perform set_config('t.rs_op',     op_r::text,    true);
  perform set_config('t.rs_u_fin',  u_fin::text,   true);
  perform set_config('t.rs_u_ilim', u_ilim::text,  true);
  perform set_config('t.rs_u_asis', u_asis::text,  true);
  perform set_config('t.rs_ct',     ct_r::text,    true);
  perform set_config('t.rs_coach',  coach_r::text, true);
  perform set_config('t.rs_t',      t::text,       true);
  perform set_config('t.rs_c_fin',  c_fin::text,   true);
  perform set_config('t.rs_c_ilim', c_ilim::text,  true);
  perform set_config('t.rs_c_asis', c_asis::text,  true);
  perform set_config('t.rs_past',   s_past::text,  true);
  perform set_config('t.rs_f1',     s_f1::text,    true);
  perform set_config('t.rs_f2',     s_f2::text,    true);
  perform set_config('t.rs_f3',     s_f3::text,    true);
end $$;

-- ── Bookings, made AS EACH MEMBER through reservar_clase (it is what stamps `consumio`) ───────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.rs_u_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.rs_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.rs_u_ilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.rs_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.rs_u_asis', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.rs_f1', true)::uuid); end $$;
reset role;

-- c_asis' booking → `asistida`, the state a CAPTURED hold leaves behind (pasar_lista_sesion's booked
-- branch). Done privileged because the class is next week and this vector is about what RETIRE does
-- to that row, not about how it got there.
do $$
declare v_n int; v_status text; v_consumio boolean;
begin
  update public.reservation set status = 'asistida', checked_at = now()
   where member_id = current_setting('t.rs_c_asis', true)::uuid
     and class_session_id = current_setting('t.rs_f1', true)::uuid;

  -- Preconditions, so a later failure is unambiguous about which half broke.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_fin', true)::uuid;
  if v_n is distinct from 6 then raise exception 'SEED FAIL: c_fin expected 6 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'SEED FAIL: c_ilim balance % (expected an untouched NULL)', v_n; end if;
  select consumio into v_consumio from public.reservation
   where member_id = current_setting('t.rs_c_fin', true)::uuid and class_session_id = current_setting('t.rs_f1', true)::uuid;
  if v_consumio is distinct from true then raise exception 'SEED FAIL: the finite booking stamped consumio % (expected true)', v_consumio; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_asis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SEED FAIL: c_asis expected 8 after booking, got %', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.rs_c_asis', true)::uuid and class_session_id = current_setting('t.rs_f1', true)::uuid;
  if v_status is distinct from 'asistida' then raise exception 'SEED FAIL: c_asis row status % (expected asistida)', v_status; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (1) THE ABORT PATH. A mid-loop failure must leave ZERO balances moved — the refund is either whole
-- or absent, never half-paid. Forced with a temporary BEFORE UPDATE trigger that raises on the SECOND
-- future class (the loop is `order by starts_at`, so week +1 is settled before week +2 is reached).
--
-- THE TRIGGER REPORTS THE STATE IT INTERRUPTED, and the assertion pins that message exactly. Without
-- it this vector would pass on a fixture that raised on the FIRST iteration — proving only that an
-- aborted transaction rolls back, which Postgres guarantees anyway. `BOOM after 1 cancelled, balance
-- 7` is the claim that matters: one class WAS cancelled and one member HAD been paid back at the
-- instant of the failure, and the assertions below then find both undone. SECURITY DEFINER so the
-- reported counts are the truth rather than what RLS lets the operator see.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('t.rs_boom', current_setting('t.rs_f2', true), true);

create function public.rs_boom_trg() returns trigger language plpgsql security definer as $boom$
declare v_n int; v_bal int;
begin
  if new.id = current_setting('t.rs_boom', true)::uuid then
    select count(*) into v_n from public.class_session
     where template_id = new.template_id and cancelled_at is not null;
    select clases_restantes into v_bal from public.clientes
     where id = current_setting('t.rs_c_fin', true)::uuid;
    raise exception 'BOOM after % cancelled, balance %', v_n, v_bal;
  end if;
  return new;
end;
$boom$;
create trigger rs_boom before update on public.class_session
  for each row execute function public.rs_boom_trg();

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.rs_op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.retire_recurring_schedule(current_setting('t.rs_t', true)::uuid);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'RETIRE FAIL(1): the mid-loop failure fixture did not fire'; end if;
  -- The full sentence: it is what makes this a MID-loop vector rather than a first-iteration one.
  if msg is distinct from 'BOOM after 1 cancelled, balance 7' then
    raise exception 'RETIRE FAIL(1): the failure did not land mid-loop with one class already settled (got: %)', msg;
  end if;
end $$;
reset role;

drop trigger rs_boom on public.class_session;
drop function public.rs_boom_trg();

do $$
declare v_n int; v_active boolean; v_status text;
begin
  select is_active into v_active from public.schedule_template where id = current_setting('t.rs_t', true)::uuid;
  if v_active is distinct from true then raise exception 'RETIRE FAIL(1): the aborted retire left the template retired'; end if;
  select count(*) into v_n from public.class_session
   where template_id = current_setting('t.rs_t', true)::uuid and cancelled_at is not null;
  if v_n is distinct from 0 then raise exception 'RETIRE FAIL(1): % class(es) stayed cancelled after an aborted retire', v_n; end if;
  -- THE POINT: the first iteration's refund is gone with the rest.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_fin', true)::uuid;
  if v_n is distinct from 6 then raise exception 'RETIRE FAIL(1): a balance moved to % across an aborted retire (expected 6)', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'RETIRE FAIL(1): an ilimitado NULL was written across an aborted retire (%)', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.rs_c_fin', true)::uuid and class_session_id = current_setting('t.rs_f1', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RETIRE FAIL(1): a booking stayed % across an aborted retire', v_status; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (2) RETIRE, for real.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.rs_op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.retire_recurring_schedule(current_setting('t.rs_t', true)::uuid);
  if v_n is distinct from 3 then raise exception 'RETIRE FAIL(2): retire cancelled % class(es) (expected the 3 future ones)', v_n; end if;
end $$;
reset role;

do $$
declare
  t uuid := current_setting('t.rs_t', true)::uuid;
  v_n int; v_active boolean; v_status text; v_cancelled timestamptz;
begin
  select is_active into v_active from public.schedule_template where id = t;
  if v_active is distinct from false then raise exception 'RETIRE FAIL(2): the template is still active after a retire'; end if;

  -- Every FUTURE class is cancelled…
  select count(*) into v_n from public.class_session
   where template_id = t and starts_at > now() and cancelled_at is null;
  if v_n is distinct from 0 then raise exception 'RETIRE FAIL(2): % future class(es) survived the retire — still bookable, for a schedule that no longer exists', v_n; end if;
  select count(*) into v_n from public.class_session where template_id = t and cancelled_at is not null;
  if v_n is distinct from 3 then raise exception 'RETIRE FAIL(2): % class(es) carry cancelled_at (expected exactly the 3 future ones)', v_n; end if;
  -- …and the PAST one is not. Nothing in the past is touched.
  select cancelled_at into v_cancelled from public.class_session where id = current_setting('t.rs_past', true)::uuid;
  if v_cancelled is not null then raise exception 'RETIRE FAIL(2): the retire cancelled a class that already happened'; end if;

  -- THE REFUND: exactly +1, once. A loop that paid twice reads 8 here, not 7.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_fin', true)::uuid;
  if v_n is distinct from 7 then raise exception 'RETIRE FAIL(2): the finite member''s balance is % (expected 6 + 1 = 7, exactly once)', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.rs_c_fin', true)::uuid and class_session_id = current_setting('t.rs_f1', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'RETIRE FAIL(2): the released booking is % (expected cancelada)', v_status; end if;

  -- ILIMITADO: the booking releases (state), the NULL is never written (money).
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'RETIRE FAIL(2): an ilimitado NULL was written to (%) — unlimited means unlimited', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.rs_c_ilim', true)::uuid and class_session_id = current_setting('t.rs_f1', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'RETIRE FAIL(2): the ilimitado booking is % (expected cancelada)', v_status; end if;

  -- ASISTIDA: a CAPTURED hold. The member came; re-crediting it would mint a class out of an
  -- attendance record.
  select status into v_status from public.reservation
   where member_id = current_setting('t.rs_c_asis', true)::uuid and class_session_id = current_setting('t.rs_f1', true)::uuid;
  if v_status is distinct from 'asistida' then raise exception 'RETIRE FAIL(2): the retire moved an ASISTIDA row to %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_asis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'RETIRE FAIL(2): the attended member''s balance is % (expected an untouched 8)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (3) A RETIRED RULE MATERIALIZES NOTHING — and its slot is immediately re-creatable. That is what
-- makes "mover el horario" retire + create rather than a verb of its own.
-- The gym holds exactly this one template, so "0 for every week in the horizon" is a statement about
-- the retirement rather than about which other templates happen to be already materialized.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.rs_op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_tz     text := current_setting('t.rs_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  i int; added int;
begin
  for i in 0 .. 5 loop
    added := public.ensure_week_materialized(v_monday + (i * 7));
    if added is distinct from 0 then
      raise exception 'RETIRE FAIL(3): week +% materialized % session(s) from a RETIRED template', i, added;
    end if;
  end loop;

  -- schedule_template_active_uq is PARTIAL on is_active precisely so that re-creating the same slot
  -- IS the un-retire. There is no "un-retire" verb and there must never be one.
  perform public.create_recurring_schedule(
    current_setting('t.rs_ct', true)::uuid, array[2], '18:00'::time, 60, 20,
    array[current_setting('t.rs_coach', true)::uuid], 6);
end $$;
reset role;

do $$
declare
  gym_r uuid := current_setting('t.rs_gym', true)::uuid;
  t     uuid := current_setting('t.rs_t', true)::uuid;
  v_new uuid; v_n int;
begin
  select count(*) into v_n from public.schedule_template where gym_id = gym_r and is_active;
  if v_n is distinct from 1 then raise exception 'RETIRE FAIL(3): the gym has % active template(s) after the re-create (expected 1)', v_n; end if;
  select id into v_new from public.schedule_template where gym_id = gym_r and is_active;
  if v_new is not distinct from t then raise exception 'RETIRE FAIL(3): the retired template came back to life instead of a new one'; end if;
  select count(*) into v_n from public.class_session where template_id = v_new;
  if v_n is distinct from 6 then raise exception 'RETIRE FAIL(3): the re-created schedule materialized % week(s) (expected 6)', v_n; end if;
  -- The retired template's own rows stayed cancelled — the re-create did not resurrect them.
  select count(*) into v_n from public.class_session where template_id = t and cancelled_at is null;
  if v_n is distinct from 1 then raise exception 'RETIRE FAIL(3): % of the retired series'' classes are live (expected only the past one)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (4) THE SECOND TAP. `where id = ? and is_active` means the re-retire updates nothing and raises
-- ABOVE the loop — which is the whole idempotency argument, asserted on the BALANCE, not the raise.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.rs_op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.retire_recurring_schedule(current_setting('t.rs_t', true)::uuid);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'RETIRE FAIL(4): a second retire was accepted'; end if;
  if msg is distinct from 'Horario no encontrado o ya retirado' then
    raise exception 'RETIRE FAIL(4): wrong raise on a re-retire: %', msg;
  end if;
end $$;
reset role;

do $$
declare v_n int;
begin
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_fin', true)::uuid;
  if v_n is distinct from 7 then raise exception 'RETIRE FAIL(4): the balance moved to % after a refused re-retire — DOUBLE REFUND', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.rs_c_asis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'RETIRE FAIL(4): the attended member''s balance moved to % after a refused re-retire', v_n; end if;
end $$;

select 'retire recurring schedule: OK' as result;
rollback;
