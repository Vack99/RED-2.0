-- Series-edit contract suite — #243, migrations 20260806090000 / 20260806100000 / 20260806100100.
-- docs/Context/2026-08-06-243-series-edit-design.md §4/§5.
--
-- Two operator verbs against the repeating rule, and the whole design turns on the discriminator
-- between them: DOES THE CLASS STILL HAPPEN?
--   * update_recurring_schedule ("esta y las siguientes") — the class still happens, later. The
--     booking moves WITH it, because reservation.class_session_id points at the ROW, not the instant.
--     Zero rows to `reservation`, zero to `clientes`. That absence is the single most important claim
--     in this file and it is asserted directly (status still `reservada`, `clases_restantes`
--     numerically unchanged), never inferred from "no UPDATE statement is present".
--   * retire_recurring_schedule ("terminar el horario") — the class stops existing, so every held
--     credit is released through the SHIPPED cancel_class_session. One implementation of hold-release.
--
-- WHY THE VALUES ARE ALL DISTINCT FROM THE SEED (19:00/45/24 → 20:00/60/30, ct1 → ct2): a fan-out that
-- dropped `duration_min =` or `capacity =` from its SET list passes every count-based check ever
-- written. #80 AC6 — assert the WRITTEN ROWS, with values that could not have been there already.
--
-- VECTORS
--  (1) THE MOVE. Every future non-cancelled session of the series takes the new wall-clock time in the
--      gym's zone, the new duration, capacity and class_type — each re-anchored on ITS OWN ISO week.
--  (2) NOTHING ELSE MOVES. The PAST session and the CANCELLED one are byte-identical afterwards, on
--      every column the fan-out writes plus template_id/cancelled_at.
--  (3) THE SETTLEMENT ASSERTION — the heart of the design. Both bookings on a moved class are still
--      `reservada`, the finite member's balance is numerically unchanged, and the ilimitado NULL was
--      never written. A move that "helpfully" cancelled-and-refunded (the MINIMAL design the judges
--      rejected) fails here and nowhere else.
--  (4) THE COACH SET IS COALESCED, NOT REPLACED. Omitting p_coach_ids leaves the template's coaches
--      alone; passing one replaces them. `editDraftFrom` seeds coachIds from the CLICKED SESSION, so
--      an unconditional replace writes last week's substitute onto the whole series.
--  (5) THE PAST-INSTANT GUARD. A future class whose RECOMPUTED instant would land in the past keeps
--      the instant it had and is DETACHED (template_id = null) — because both release paths are shut
--      for a started class ('La clase ya comenzó'), so moving it there would silently destroy every
--      hold on it. Its sibling in a later week moves normally, and the return counts only the movers.
--  (6) THE DUPLICATE-SLOT REFUSAL, in MINIMAL's R5 shape: the identical Spanish sentence
--      create_recurring_schedule raises (one vocabulary, one index), and FULL ROLLBACK — start_time,
--      every starts_at, every reservation status and every balance byte-identical.
--  (7) RETIRE, THE ABORT PATH. A mid-loop failure leaves ZERO balances moved, zero sessions cancelled
--      and the template still active. The refund is not partially applied.
--  (8) RETIRE. is_active flips; every FUTURE non-cancelled class is cancelled; the past one is not;
--      the booked finite member is refunded exactly +1, ONCE; ilimitado stays NULL; an `asistida` row
--      (a CAPTURED hold) stays asistida and is not re-credited.
--  (9) A RETIRED RULE MATERIALIZES NOTHING. ensure_week_materialized for weeks 0..5 each return 0 —
--      and the slot then accepts a fresh create_recurring_schedule, because
--      schedule_template_active_uq is partial on is_active precisely so re-creating IS the un-retire.
-- (10) THE SECOND TAP. A re-retire raises above the loop, and NO balance moves twice.
--
-- The retire vectors run in their OWN GYM. ensure_week_materialized is gym-wide (it walks every active
-- template of staff_gym()), so vector (9)'s "each week returns 0" is only a statement about the
-- retired template if no other active template shares the gym.
--
-- Bookings are made through `reservar_clase` AS EACH MEMBER, never seeded by hand: `consumio` is the
-- entire gate on the refund and the only honest way to get it is the function that stamps it.
--
-- EVERY WRITTEN-ROW ASSERTION READS AFTER `reset role`, as ops. Both RPCs are SECURITY INVOKER, so a
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

  gym_e uuid := gen_random_uuid();   -- the EDIT gym (vectors 1-6)
  gym_r uuid := gen_random_uuid();   -- the RETIRE gym (vectors 7-10), isolated for vector (9)
  op_e  uuid := gen_random_uuid();
  op_r  uuid := gen_random_uuid();
  u_fin uuid := gen_random_uuid();
  u_ilim uuid := gen_random_uuid();
  u_rfin uuid := gen_random_uuid();
  u_rilim uuid := gen_random_uuid();
  u_rasis uuid := gen_random_uuid();

  ct1 uuid; ct2 uuid; ct_r uuid;
  coach1 uuid; coach2 uuid; coach_r uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid;
  c_fin uuid; c_ilim uuid; c_rfin uuid; c_rilim uuid; c_rasis uuid;
  se_past uuid; se_canc uuid; se_f1 uuid; se_f2 uuid; se_g uuid; se_g2 uuid;
  sr_past uuid; sr_f1 uuid; sr_f2 uuid; sr_f3 uuid;
  v_guard timestamptz;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_e, 'series-edit-gym-e', 'Series Edit Gym E', v_tz, 'forge'),
    (gym_r, 'series-edit-gym-r', 'Series Edit Gym R', v_tz, 'forge');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_e,    'authenticated', 'authenticated', 'se-op-e@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_r,    'authenticated', 'authenticated', 'se-op-r@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_fin,   'authenticated', 'authenticated', 'se-fin@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_ilim,  'authenticated', 'authenticated', 'se-ilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_rfin,  'authenticated', 'authenticated', 'se-rfin@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_rilim, 'authenticated', 'authenticated', 'se-rilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_rasis, 'authenticated', 'authenticated', 'se-rasis@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_e, gym_e, 'operator'),
    (op_r, gym_r, 'operator'),
    (u_fin, gym_e, 'member'), (u_ilim, gym_e, 'member'),
    (u_rfin, gym_r, 'member'), (u_rilim, gym_r, 'member'), (u_rasis, gym_r, 'member');

  insert into public.class_type (gym_id, name) values (gym_e, 'SE Metcon') returning id into ct1;
  insert into public.class_type (gym_id, name) values (gym_e, 'SE Yoga')   returning id into ct2;
  insert into public.class_type (gym_id, name) values (gym_r, 'SE Funcional') returning id into ct_r;
  insert into public.coach (gym_id, name, initials, role) values (gym_e, 'SE Coach Uno', 'C1', 'coach') returning id into coach1;
  insert into public.coach (gym_id, name, initials, role) values (gym_e, 'SE Coach Dos', 'C2', 'coach') returning id into coach2;
  insert into public.coach (gym_id, name, initials, role) values (gym_r, 'SE Coach R',   'CR', 'coach') returning id into coach_r;

  -- t1 — the series under edit: Martes 19:00, 45 min, cupo 24, one default coach.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (gym_e, ct1, 1, '19:00', 45, 24) returning id into t1;
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values (gym_e, t1, coach1);

  -- t2 — the past-instant guard's series (vector 5). Its OWN weekday/time never matter: the guard
  -- recomputes from each SESSION's own instant, so all that matters is which ISO week its rows sit in.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (gym_e, ct1, 3, '10:00', 60, 20) returning id into t2;

  -- t3 — the blocker for vector (6). Deliberately (ct2, Martes, 21:00): it does NOT collide with t1's
  -- seed slot, and only collides once vector (6) tries to move t1 onto it.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (gym_e, ct2, 1, '21:00', 45, 24) returning id into t3;

  -- t4 — the retired series, alone in its gym (vector 9).
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (gym_r, ct_r, 2, '18:00', 60, 20) returning id into t4;
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values (gym_r, t4, coach_r);

  -- t1's dated classes, each at the rule's instant for its own week. Week -1 is PAST; week +1 is
  -- CANCELLED; weeks +2/+3 are the movers.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, (((v_monday - 7) + 1) + '19:00'::time) at time zone v_tz, 45, 24, t1) returning id into se_past;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id, cancelled_at)
    values (gym_e, ct1, (((v_monday + 7) + 1) + '19:00'::time) at time zone v_tz, 45, 24, t1, now()) returning id into se_canc;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, (((v_monday + 14) + 1) + '19:00'::time) at time zone v_tz, 45, 24, t1) returning id into se_f1;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, (((v_monday + 21) + 1) + '19:00'::time) at time zone v_tz, 45, 24, t1) returning id into se_f2;

  -- t2's two classes. se_g sits at the LAST SECOND of the CURRENT ISO week (Sunday 23:59:59 local) —
  -- the one construction that is simultaneously (a) still in the future whenever this suite runs and
  -- (b) inside a week whose Monday 00:00 is necessarily already past, which is what makes vector (5)
  -- deterministic instead of a function of the wall clock. A precondition below states it outright.
  v_guard := ((v_monday + 7)::timestamp - interval '1 second') at time zone v_tz;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, v_guard, 60, 20, t2) returning id into se_g;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, (((v_monday + 14) + 3) + '10:00'::time) at time zone v_tz, 60, 20, t2) returning id into se_g2;

  -- t4's dated classes: one past (never touched by retire) + three future (all cancelled by it).
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday - 7) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t4) returning id into sr_past;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 7) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t4) returning id into sr_f1;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 14) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t4) returning id into sr_f2;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 21) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t4) returning id into sr_f3;

  -- Members. Finite balances differ per gym so a "+1 to everyone" bug cannot pass on a shared number.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE finita', '5552200001', 5, v_today + 60, '8 clases', gym_e, u_fin) returning id into c_fin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE ilimitada', '5552200002', null, v_today + 60, 'Ilimitado', gym_e, u_ilim) returning id into c_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE R finita', '5552200003', 7, v_today + 60, '8 clases', gym_r, u_rfin) returning id into c_rfin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE R ilimitada', '5552200004', null, v_today + 60, 'Ilimitado', gym_r, u_rilim) returning id into c_rilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE R asistida', '5552200005', 9, v_today + 60, '8 clases', gym_r, u_rasis) returning id into c_rasis;

  -- The fixture precondition vector (5) rests on. If the suite is started inside the final second of
  -- an ISO week this is the line that says so, instead of a mystifying template_id failure later.
  if v_guard <= now() then
    raise exception 'SEED FAIL: the past-instant guard fixture (% ) is not in the future — run again', v_guard;
  end if;

  perform set_config('t.se_tz',    v_tz,          true);
  perform set_config('t.se_gym_e', gym_e::text,   true);
  perform set_config('t.se_gym_r', gym_r::text,   true);
  perform set_config('t.se_op_e',  op_e::text,    true);
  perform set_config('t.se_op_r',  op_r::text,    true);
  perform set_config('t.se_u_fin',  u_fin::text,  true);
  perform set_config('t.se_u_ilim', u_ilim::text, true);
  perform set_config('t.se_u_rfin', u_rfin::text, true);
  perform set_config('t.se_u_rilim', u_rilim::text, true);
  perform set_config('t.se_u_rasis', u_rasis::text, true);
  perform set_config('t.se_ct1',   ct1::text,     true);
  perform set_config('t.se_ct2',   ct2::text,     true);
  perform set_config('t.se_ct_r',  ct_r::text,    true);
  perform set_config('t.se_coach1', coach1::text, true);
  perform set_config('t.se_coach2', coach2::text, true);
  perform set_config('t.se_coach_r', coach_r::text, true);
  perform set_config('t.se_t1',    t1::text,      true);
  perform set_config('t.se_t2',    t2::text,      true);
  perform set_config('t.se_t3',    t3::text,      true);
  perform set_config('t.se_t4',    t4::text,      true);
  perform set_config('t.se_c_fin',  c_fin::text,  true);
  perform set_config('t.se_c_ilim', c_ilim::text, true);
  perform set_config('t.se_c_rfin', c_rfin::text, true);
  perform set_config('t.se_c_rilim', c_rilim::text, true);
  perform set_config('t.se_c_rasis', c_rasis::text, true);
  perform set_config('t.se_past',  se_past::text, true);
  perform set_config('t.se_canc',  se_canc::text, true);
  perform set_config('t.se_f1',    se_f1::text,   true);
  perform set_config('t.se_f2',    se_f2::text,   true);
  perform set_config('t.se_g',     se_g::text,    true);
  perform set_config('t.se_g2',    se_g2::text,   true);
  perform set_config('t.se_sr_past', sr_past::text, true);
  perform set_config('t.se_sr_f1', sr_f1::text,   true);
  perform set_config('t.se_sr_f2', sr_f2::text,   true);
  perform set_config('t.se_sr_f3', sr_f3::text,   true);
end $$;

-- ── Bookings, made AS EACH MEMBER through reservar_clase (it is what stamps `consumio`) ───────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_ilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_rfin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_sr_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_rilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_sr_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_rasis', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_sr_f1', true)::uuid); end $$;
reset role;

-- c_rasis' booking → `asistida`, the state a CAPTURED hold leaves behind (pasar_lista_sesion's booked
-- branch). Done privileged because the class is next week and this vector is about what RETIRE does
-- to that row, not about how it got there.
do $$
declare v_n int; v_status text; v_consumio boolean;
begin
  update public.reservation set status = 'asistida', checked_at = now()
   where member_id = current_setting('t.se_c_rasis', true)::uuid
     and class_session_id = current_setting('t.se_sr_f1', true)::uuid;

  -- Preconditions, so a later failure is unambiguous about which half broke.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_fin', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SEED FAIL: c_fin expected 4 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'SEED FAIL: c_ilim balance % (expected an untouched NULL)', v_n; end if;
  select consumio into v_consumio from public.reservation
   where member_id = current_setting('t.se_c_fin', true)::uuid and class_session_id = current_setting('t.se_f1', true)::uuid;
  if v_consumio is distinct from true then raise exception 'SEED FAIL: the finite booking stamped consumio % (expected true)', v_consumio; end if;

  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rfin', true)::uuid;
  if v_n is distinct from 6 then raise exception 'SEED FAIL: c_rfin expected 6 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rasis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SEED FAIL: c_rasis expected 8 after booking, got %', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rasis', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'asistida' then raise exception 'SEED FAIL: c_rasis row status % (expected asistida)', v_status; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (1)(2)(3) THE MOVE — called as gym-E staff, asserted as ops.
-- 19:00/45/24/ct1 → 20:00/60/30/ct2, weekday untouched (p_weekday omitted).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_moved int;
begin
  v_moved := public.update_recurring_schedule(
    current_setting('t.se_t1', true)::uuid, current_setting('t.se_ct2', true)::uuid,
    '20:00'::time, 60, 30);
  if v_moved is distinct from 2 then
    raise exception 'SERIES FAIL(1): update_recurring_schedule moved % session(s) (expected the 2 future, non-cancelled ones)', v_moved;
  end if;
end $$;
reset role;

do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  se_f1 uuid := current_setting('t.se_f1', true)::uuid;
  se_f2 uuid := current_setting('t.se_f2', true)::uuid;
  ct1 uuid := current_setting('t.se_ct1', true)::uuid;
  ct2 uuid := current_setting('t.se_ct2', true)::uuid;
  t1  uuid := current_setting('t.se_t1', true)::uuid;
  r record;
  v_n int; v_status text; v_ts timestamptz;
begin
  -- THE RULE ITSELF.
  select class_type_id, weekday, start_time, duration_min, capacity, is_active into r
    from public.schedule_template where id = t1;
  if r.class_type_id is distinct from ct2 then raise exception 'SERIES FAIL(1): template class_type not written'; end if;
  if r.weekday is distinct from 1 then raise exception 'SERIES FAIL(1): an omitted p_weekday changed the weekday to %', r.weekday; end if;
  if r.start_time is distinct from '20:00'::time then raise exception 'SERIES FAIL(1): template start_time % (expected 20:00)', r.start_time; end if;
  if r.duration_min is distinct from 60 then raise exception 'SERIES FAIL(1): template duration_min % (expected 60)', r.duration_min; end if;
  if r.capacity is distinct from 30 then raise exception 'SERIES FAIL(1): template capacity % (expected 30)', r.capacity; end if;
  if r.is_active is distinct from true then raise exception 'SERIES FAIL(1): an edit retired the template'; end if;

  -- (1) EVERY FUTURE SESSION, re-anchored on ITS OWN week. Asserting the local wall clock AND the
  -- absolute instant: a fan-out that recomputed from the wrong week keeps 20:00 and fails the date.
  for r in select id, starts_at, duration_min, capacity, class_type_id, template_id
             from public.class_session where id in (se_f1, se_f2) loop
    if (r.starts_at at time zone v_tz)::time is distinct from '20:00'::time then
      raise exception 'SERIES FAIL(1): session % is at % local (expected 20:00)', r.id, (r.starts_at at time zone v_tz)::time;
    end if;
    if r.duration_min is distinct from 60 then raise exception 'SERIES FAIL(1): session % duration_min % (expected 60)', r.id, r.duration_min; end if;
    if r.capacity is distinct from 30 then raise exception 'SERIES FAIL(1): session % capacity % (expected 30)', r.id, r.capacity; end if;
    if r.class_type_id is distinct from ct2 then raise exception 'SERIES FAIL(1): session % class_type not written', r.id; end if;
    if r.template_id is distinct from t1 then raise exception 'SERIES FAIL(1): a moved session left the series (template_id %)', r.template_id; end if;
  end loop;
  select starts_at into v_ts from public.class_session where id = se_f1;
  if v_ts is distinct from ((((v_monday + 14) + 1) + '20:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(1): se_f1 landed at % (expected its OWN week''s Martes 20:00)', v_ts;
  end if;
  select starts_at into v_ts from public.class_session where id = se_f2;
  if v_ts is distinct from ((((v_monday + 21) + 1) + '20:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(1): se_f2 landed at % (expected its OWN week''s Martes 20:00)', v_ts;
  end if;

  -- (2) THE PAST SESSION IS BYTE-IDENTICAL. Nothing in the past is touched by either verb.
  select starts_at, duration_min, capacity, class_type_id, template_id, cancelled_at into r
    from public.class_session where id = current_setting('t.se_past', true)::uuid;
  if r.starts_at is distinct from ((((v_monday - 7) + 1) + '19:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(2): the PAST session moved to %', r.starts_at;
  end if;
  if r.duration_min is distinct from 45 or r.capacity is distinct from 24 or r.class_type_id is distinct from ct1 then
    raise exception 'SERIES FAIL(2): the PAST session was rewritten (dur % cap % ct %)', r.duration_min, r.capacity, r.class_type_id;
  end if;
  if r.template_id is distinct from t1 then raise exception 'SERIES FAIL(2): the PAST session was detached from the series'; end if;
  if r.cancelled_at is not null then raise exception 'SERIES FAIL(2): the PAST session was cancelled by an edit'; end if;

  -- …and so is the CANCELLED one. A cancelled instance is the ADR-0010 holiday tombstone; a move that
  -- rewrote it would resurrect a class the operator had already called off, at a new time.
  select starts_at, duration_min, capacity, class_type_id, template_id, cancelled_at into r
    from public.class_session where id = current_setting('t.se_canc', true)::uuid;
  if r.starts_at is distinct from ((((v_monday + 7) + 1) + '19:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(2): the CANCELLED session moved to %', r.starts_at;
  end if;
  if r.duration_min is distinct from 45 or r.capacity is distinct from 24 or r.class_type_id is distinct from ct1 then
    raise exception 'SERIES FAIL(2): the CANCELLED session was rewritten (dur % cap % ct %)', r.duration_min, r.capacity, r.class_type_id;
  end if;
  if r.cancelled_at is null then raise exception 'SERIES FAIL(2): the CANCELLED session was un-cancelled'; end if;

  -- (3) THE SETTLEMENT ASSERTION — the heart of #243. The class still happens, so the booking moved
  -- with it: nobody is un-booked, nobody is refunded, nobody is charged again.
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_fin', true)::uuid and class_session_id = se_f1;
  if v_status is distinct from 'reservada' then
    raise exception 'SERIES FAIL(3): a series MOVE changed a booking to % — the booking must follow the class, not be settled', v_status;
  end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_fin', true)::uuid;
  if v_n is distinct from 4 then
    raise exception 'SERIES FAIL(3): the finite member''s balance moved to % (expected an untouched 4) — a move settles NOTHING', v_n;
  end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_ilim', true)::uuid and class_session_id = se_f1;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(3): the ilimitado booking became %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'SERIES FAIL(3): an ilimitado NULL was written to (%)', v_n; end if;
  -- Nothing at all landed on the two money tables for this gym: 2 bookings, 2 clientes, no more.
  select count(*) into v_n from public.reservation where gym_id = current_setting('t.se_gym_e', true)::uuid;
  if v_n is distinct from 2 then raise exception 'SERIES FAIL(3): % reservation row(s) in the gym (expected the 2 seeded bookings)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (4) THE COACH SET IS COALESCED. Call 1 above omitted p_coach_ids — the default coach must still be
-- there. Then an explicit set replaces it (and that DELETE is what the new RLS policy exists for).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_coach uuid; v_n int;
begin
  select count(*) into v_n from public.schedule_template_coach where template_id = current_setting('t.se_t1', true)::uuid;
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(4): omitting p_coach_ids left % coach row(s) (expected the seeded 1)', v_n; end if;
  select coach_id into v_coach from public.schedule_template_coach where template_id = current_setting('t.se_t1', true)::uuid;
  if v_coach is distinct from current_setting('t.se_coach1', true)::uuid then
    raise exception 'SERIES FAIL(4): omitting p_coach_ids REPLACED the coach set — the clicked session''s substitute would overwrite the series';
  end if;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_moved int;
begin
  v_moved := public.update_recurring_schedule(
    current_setting('t.se_t1', true)::uuid, current_setting('t.se_ct2', true)::uuid,
    '20:00'::time, 60, 30,
    p_coach_ids => array[current_setting('t.se_coach2', true)::uuid]);
  if v_moved is distinct from 2 then raise exception 'SERIES FAIL(4): the coach-bearing call moved % session(s) (expected 2)', v_moved; end if;
end $$;
reset role;

do $$
declare v_coach uuid; v_n int; v_gym uuid;
begin
  select count(*) into v_n from public.schedule_template_coach where template_id = current_setting('t.se_t1', true)::uuid;
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(4): after an explicit coach set the template has % coach row(s) (expected 1)', v_n; end if;
  select coach_id, gym_id into v_coach, v_gym from public.schedule_template_coach where template_id = current_setting('t.se_t1', true)::uuid;
  if v_coach is distinct from current_setting('t.se_coach2', true)::uuid then
    raise exception 'SERIES FAIL(4): the coach set was not replaced (still %)', v_coach;
  end if;
  if v_gym is distinct from current_setting('t.se_gym_e', true)::uuid then
    raise exception 'SERIES FAIL(4): the replacement coach row carries gym_id % (expected the operator''s gym)', v_gym;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (6) THE DUPLICATE-SLOT REFUSAL, in MINIMAL's R5 full-rollback shape.
-- t3 is already active at (ct2, Martes, 21:00); moving t1 onto it must refuse with the sentence
-- create_recurring_schedule already uses — and leave EVERYTHING where it was.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.update_recurring_schedule(
      current_setting('t.se_t1', true)::uuid, current_setting('t.se_ct2', true)::uuid,
      '21:00'::time, 60, 30);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(6): moving a series onto an occupied active slot was accepted'; end if;
  -- The FULL sentence, not a prefix: `like 'Ya existe%'` passes just as happily on a message whose
  -- weekday/time interpolations are empty or off by one, and those are the computed halves.
  if msg is distinct from 'Ya existe un horario activo para esta clase el Martes a las 21:00' then
    raise exception 'SERIES FAIL(6): wrong refusal for a duplicate slot: %', msg;
  end if;
end $$;
reset role;

do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  v_time time; v_ts timestamptz; v_n int; v_status text;
begin
  -- The rule kept its 20:00 (the refusal fires from inside the template UPDATE's own subtransaction).
  select start_time into v_time from public.schedule_template where id = current_setting('t.se_t1', true)::uuid;
  if v_time is distinct from '20:00'::time then raise exception 'SERIES FAIL(6): the refused call left start_time at %', v_time; end if;

  -- Every instant, unchanged.
  select starts_at into v_ts from public.class_session where id = current_setting('t.se_f1', true)::uuid;
  if v_ts is distinct from ((((v_monday + 14) + 1) + '20:00'::time) at time zone v_tz) then raise exception 'SERIES FAIL(6): the refused call moved se_f1 to %', v_ts; end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.se_f2', true)::uuid;
  if v_ts is distinct from ((((v_monday + 21) + 1) + '20:00'::time) at time zone v_tz) then raise exception 'SERIES FAIL(6): the refused call moved se_f2 to %', v_ts; end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.se_past', true)::uuid;
  if v_ts is distinct from ((((v_monday - 7) + 1) + '19:00'::time) at time zone v_tz) then raise exception 'SERIES FAIL(6): the refused call moved the past session to %', v_ts; end if;

  -- Every status and every balance, unchanged.
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_fin', true)::uuid and class_session_id = current_setting('t.se_f1', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(6): the refused call settled a booking (%)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_fin', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SERIES FAIL(6): the refused call moved a balance to %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'SERIES FAIL(6): the refused call wrote % into an ilimitado NULL', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (5) THE PAST-INSTANT GUARD. Moving t2 to (Lunes, 00:00) puts the CURRENT week's class at this
-- week's Monday 00:00 — necessarily already past — while the week-+2 class lands on a Monday 00:00
-- that is still ahead. The first must NOT move (both release paths are shut for a started class) and
-- must leave the rule; the second moves; the return counts only the mover.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_moved int;
begin
  v_moved := public.update_recurring_schedule(
    current_setting('t.se_t2', true)::uuid, current_setting('t.se_ct1', true)::uuid,
    '00:00'::time, 60, 20, p_weekday => 0);
  if v_moved is distinct from 1 then
    raise exception 'SERIES FAIL(5): the weekday move reports % moved (expected 1 — the other class cannot legally move)', v_moved;
  end if;
end $$;
reset role;

do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  se_g  uuid := current_setting('t.se_g', true)::uuid;
  se_g2 uuid := current_setting('t.se_g2', true)::uuid;
  r record;
begin
  -- THE GUARDED ROW: same instant, no longer part of the rule.
  select starts_at, template_id, duration_min into r from public.class_session where id = se_g;
  if r.starts_at is distinct from (((v_monday + 7)::timestamp - interval '1 second') at time zone v_tz) then
    raise exception 'SERIES FAIL(5): a class whose new instant is in the PAST was moved to % — every hold on it would be unreleasable', r.starts_at;
  end if;
  if r.template_id is not null then
    raise exception 'SERIES FAIL(5): the un-movable class is still attached to the rule — the next series edit would drag it again';
  end if;

  -- ITS SIBLING moved normally: week +2's Monday 00:00, still in the series.
  select starts_at, template_id into r from public.class_session where id = se_g2;
  if r.starts_at is distinct from (((v_monday + 14) + '00:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(5): the movable class landed at % (expected week +2 Lunes 00:00)', r.starts_at;
  end if;
  if r.template_id is distinct from current_setting('t.se_t2', true)::uuid then
    raise exception 'SERIES FAIL(5): a class that DID move was detached from the rule';
  end if;

  -- The rule itself took the new weekday.
  select weekday, start_time into r from public.schedule_template where id = current_setting('t.se_t2', true)::uuid;
  if r.weekday is distinct from 0 or r.start_time is distinct from '00:00'::time then
    raise exception 'SERIES FAIL(5): the template did not take the new weekday/time (% %)', r.weekday, r.start_time;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (7) RETIRE, THE ABORT PATH. A mid-loop failure must leave ZERO balances moved — the refund is
-- either whole or absent, never half-paid. Forced with a temporary BEFORE UPDATE trigger that raises
-- on the SECOND future class (the loop is `order by starts_at`, so week +1 is settled before week +2
-- is even reached).
--
-- THE TRIGGER REPORTS THE STATE IT INTERRUPTED, and the assertion pins that message exactly. Without
-- it this vector would pass on a fixture that raised on the FIRST iteration — proving only that an
-- aborted transaction rolls back, which Postgres guarantees anyway. `BOOM after 1 cancelled, balance
-- 7` is the claim that matters: one class WAS cancelled and one member HAD been paid back at the
-- instant of the failure, and the assertions below then find both undone. SECURITY DEFINER so the
-- reported counts are the truth rather than what RLS lets the operator see.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('t.se_boom', current_setting('t.se_sr_f2', true), true);

create function public.se_boom_trg() returns trigger language plpgsql security definer as $boom$
declare v_n int; v_bal int;
begin
  if new.id = current_setting('t.se_boom', true)::uuid then
    select count(*) into v_n from public.class_session
     where template_id = new.template_id and cancelled_at is not null;
    select clases_restantes into v_bal from public.clientes
     where id = current_setting('t.se_c_rfin', true)::uuid;
    raise exception 'BOOM after % cancelled, balance %', v_n, v_bal;
  end if;
  return new;
end;
$boom$;
create trigger se_boom before update on public.class_session
  for each row execute function public.se_boom_trg();

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_r', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.retire_recurring_schedule(current_setting('t.se_t4', true)::uuid);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(7): the mid-loop failure fixture did not fire'; end if;
  -- The full sentence: it is what makes this a MID-loop vector rather than a first-iteration one.
  if msg is distinct from 'BOOM after 1 cancelled, balance 7' then
    raise exception 'SERIES FAIL(7): the failure did not land mid-loop with one class already settled (got: %)', msg;
  end if;
end $$;
reset role;

drop trigger se_boom on public.class_session;
drop function public.se_boom_trg();

do $$
declare v_n int; v_active boolean; v_status text;
begin
  select is_active into v_active from public.schedule_template where id = current_setting('t.se_t4', true)::uuid;
  if v_active is distinct from true then raise exception 'SERIES FAIL(7): the aborted retire left the template retired'; end if;
  select count(*) into v_n from public.class_session
   where template_id = current_setting('t.se_t4', true)::uuid and cancelled_at is not null;
  if v_n is distinct from 0 then raise exception 'SERIES FAIL(7): % class(es) stayed cancelled after an aborted retire', v_n; end if;
  -- THE POINT: the first iteration's refund is gone with the rest.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rfin', true)::uuid;
  if v_n is distinct from 6 then raise exception 'SERIES FAIL(7): a balance moved to % across an aborted retire (expected 6)', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rilim', true)::uuid;
  if v_n is not null then raise exception 'SERIES FAIL(7): an ilimitado NULL was written across an aborted retire (%)', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rfin', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(7): a booking stayed % across an aborted retire', v_status; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (8) RETIRE, for real.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_r', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.retire_recurring_schedule(current_setting('t.se_t4', true)::uuid);
  if v_n is distinct from 3 then raise exception 'SERIES FAIL(8): retire cancelled % class(es) (expected the 3 future ones)', v_n; end if;
end $$;
reset role;

do $$
declare
  t4 uuid := current_setting('t.se_t4', true)::uuid;
  v_n int; v_active boolean; v_status text; v_cancelled timestamptz;
begin
  select is_active into v_active from public.schedule_template where id = t4;
  if v_active is distinct from false then raise exception 'SERIES FAIL(8): the template is still active after a retire'; end if;

  -- Every FUTURE class is cancelled…
  select count(*) into v_n from public.class_session
   where template_id = t4 and starts_at > now() and cancelled_at is null;
  if v_n is distinct from 0 then raise exception 'SERIES FAIL(8): % future class(es) survived the retire — still bookable, for a schedule that no longer exists', v_n; end if;
  select count(*) into v_n from public.class_session where template_id = t4 and cancelled_at is not null;
  if v_n is distinct from 3 then raise exception 'SERIES FAIL(8): % class(es) carry cancelled_at (expected exactly the 3 future ones)', v_n; end if;
  -- …and the PAST one is not. Nothing in the past is touched by either verb.
  select cancelled_at into v_cancelled from public.class_session where id = current_setting('t.se_sr_past', true)::uuid;
  if v_cancelled is not null then raise exception 'SERIES FAIL(8): the retire cancelled a class that already happened'; end if;

  -- THE REFUND: exactly +1, once. A loop that paid twice reads 8 here, not 7.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rfin', true)::uuid;
  if v_n is distinct from 7 then raise exception 'SERIES FAIL(8): the finite member''s balance is % (expected 6 + 1 = 7, exactly once)', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rfin', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'SERIES FAIL(8): the released booking is % (expected cancelada)', v_status; end if;

  -- ILIMITADO: the booking releases (state), the NULL is never written (money).
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rilim', true)::uuid;
  if v_n is not null then raise exception 'SERIES FAIL(8): an ilimitado NULL was written to (%) — unlimited means unlimited', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rilim', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'SERIES FAIL(8): the ilimitado booking is % (expected cancelada)', v_status; end if;

  -- ASISTIDA: a CAPTURED hold. The member came; re-crediting it would mint a class out of an
  -- attendance record.
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rasis', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'asistida' then raise exception 'SERIES FAIL(8): the retire moved an ASISTIDA row to %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rasis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SERIES FAIL(8): the attended member''s balance is % (expected an untouched 8)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (9) A RETIRED RULE MATERIALIZES NOTHING — and its slot is immediately re-creatable.
-- gym R holds exactly this one template, so "0 for every week in the horizon" is a statement about
-- the retirement rather than about which other templates happen to be already materialized.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_r', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  i int; added int;
begin
  for i in 0 .. 5 loop
    added := public.ensure_week_materialized(v_monday + (i * 7));
    if added is distinct from 0 then
      raise exception 'SERIES FAIL(9): week +% materialized % session(s) from a RETIRED template', i, added;
    end if;
  end loop;

  -- schedule_template_active_uq is PARTIAL on is_active precisely so that re-creating the same slot
  -- IS the un-retire. There is no "un-retire" verb and there must never be one.
  perform public.create_recurring_schedule(
    current_setting('t.se_ct_r', true)::uuid, array[2], '18:00'::time, 60, 20,
    array[current_setting('t.se_coach_r', true)::uuid], 6);
end $$;
reset role;

do $$
declare
  gym_r uuid := current_setting('t.se_gym_r', true)::uuid;
  t4    uuid := current_setting('t.se_t4', true)::uuid;
  v_new uuid; v_n int;
begin
  select count(*) into v_n from public.schedule_template where gym_id = gym_r and is_active;
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(9): gym R has % active template(s) after the re-create (expected 1)', v_n; end if;
  select id into v_new from public.schedule_template where gym_id = gym_r and is_active;
  if v_new is not distinct from t4 then raise exception 'SERIES FAIL(9): the retired template came back to life instead of a new one'; end if;
  select count(*) into v_n from public.class_session where template_id = v_new;
  if v_n is distinct from 6 then raise exception 'SERIES FAIL(9): the re-created schedule materialized % week(s) (expected 6)', v_n; end if;
  -- The retired template's own rows stayed cancelled — the re-create did not resurrect them.
  select count(*) into v_n from public.class_session where template_id = t4 and cancelled_at is null;
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(9): % of the retired series'' classes are live (expected only the past one)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (10) THE SECOND TAP. `where id = ? and is_active` means the re-retire updates nothing and raises
-- ABOVE the loop — which is the whole idempotency argument, asserted on the BALANCE, not the raise.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_r', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.retire_recurring_schedule(current_setting('t.se_t4', true)::uuid);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(10): a second retire was accepted'; end if;
  if msg is distinct from 'Horario no encontrado o ya retirado' then
    raise exception 'SERIES FAIL(10): wrong raise on a re-retire: %', msg;
  end if;
end $$;
reset role;

do $$
declare v_n int;
begin
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rfin', true)::uuid;
  if v_n is distinct from 7 then raise exception 'SERIES FAIL(10): the balance moved to % after a refused re-retire — DOUBLE REFUND', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rasis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SERIES FAIL(10): the attended member''s balance moved to % after a refused re-retire', v_n; end if;
end $$;

select 'recurring series edit: OK' as result;
rollback;
