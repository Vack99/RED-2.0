-- cambiar_modo_reservas — the "Reservas en línea" switch, #331 (spec #326), migration
-- 20260901140000.
--
-- The rules this suite pins, all on the WRITTEN ROWS (an `int`-returning RPC's count is the
-- other half — asserted too, but never a substitute for reading the tables):
--   * STAFF-ONLY, gym-scoped through the caller's OWN membership — a plain member is refused
--     ('No autorizado'), and so is staff of a DIFFERENT gym naming this one as `p_gym_id`;
--     neither refusal touches `gym.booking_enabled` or any reservation;
--   * turning OFF flips `gym.booking_enabled` to false and cancels every FUTURE (`starts_at >
--     now()`), still-`reservada` reservation of THAT gym into `cancelada` + `cancelled_at`,
--     refunding the class it spent — exactly `cancelar_reserva`'s own write, since this RPC
--     calls it per row rather than re-implementing its consumio-gated refund;
--   * a PAST reservation (its class already started) is left exactly alone — the `starts_at >
--     now()` filter, not a status coincidence;
--   * a reservation on ANOTHER gym is left exactly alone, and that gym's own switch is
--     untouched — the `res.gym_id = v_gym` scoping;
--   * the returned int IS the cancelled count, not the refunded-member count (an ilimitado
--     cancellation counts but refunds nothing);
--   * IDEMPOTENT ON THE TARGET STATE: a second call asking for the state already in effect
--     changes nothing — not the gym row, not a reservation planted AFTER the first flip —
--     and returns 0. This is what proves the early equality check runs BEFORE the cancel loop,
--     not that the loop merely finds nothing left to do;
--   * turning ON flips the switch back and touches ZERO reservations (spec #326: "seeds
--     nothing"), also idempotent.
--
-- Bookings are made through `reservar_clase` AS EACH MEMBER (never seeded by hand) so
-- `consumio` — the whole refund gate `cancelar_reserva` reads — is the real thing a live
-- booking would stamp, same discipline `cancel_class_session_release.sql` uses.
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row.
-- BEGIN/ROLLBACK, zero prod UUIDs. Comparisons use `is distinct from`, never `<>`.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs — wired into SUITE.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  gym_a   uuid := gen_random_uuid();
  gym_b   uuid := gen_random_uuid();
  v_tz    text := 'America/Mexico_City';
  op_a    uuid := gen_random_uuid();   -- staff of gym A — the caller under test
  op_b    uuid := gen_random_uuid();   -- staff of gym B only — the cross-tenant probe
  mem_a   uuid := gen_random_uuid();   -- plain MEMBER of gym A — the non-staff probe
  m_fin   uuid := gen_random_uuid();   -- finite balance, future booking — refunded
  m_ilim  uuid := gen_random_uuid();   -- ilimitado, future booking — cancelled, NOT refunded
  m_past  uuid := gen_random_uuid();   -- finite, booking moved into the past — untouched
  m_gymb  uuid := gen_random_uuid();   -- member of gym B, future booking — untouched
  c_fin uuid; c_ilim uuid; c_past uuid; c_gymb uuid;
  v_ct_a uuid; v_ct_b uuid;
  s_fin uuid; s_ilim uuid; s_past uuid; s_gymb uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'cmr-suite-gym-a', 'CMR Gym A', v_tz, 'base'),
    (gym_b, 'cmr-suite-gym-b', 'CMR Gym B', v_tz, 'base');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_a,   'authenticated', 'authenticated', 'cmr-op-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_b,   'authenticated', 'authenticated', 'cmr-op-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', mem_a,  'authenticated', 'authenticated', 'cmr-mem-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_fin,  'authenticated', 'authenticated', 'cmr-fin@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_ilim, 'authenticated', 'authenticated', 'cmr-ilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_past, 'authenticated', 'authenticated', 'cmr-past@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_gymb, 'authenticated', 'authenticated', 'cmr-gymb@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    -- op_a ALSO staffs gym B (the two-membership operator, #219's shape): the app
    -- (modo-reservas.ts:52) always sends p_gym_id explicitly, so the suite must exercise a
    -- caller for whom the OMITTED-arm fallback (staff_gym(), lowest-uuid-first) would be
    -- ambiguous between two staffed gyms — proving the explicit arg, not the default, is what
    -- pins the flip to gym A.
    (op_a, gym_b, 'operator'),
    (op_b, gym_b, 'operator'),
    (mem_a, gym_a, 'member'),
    (m_fin, gym_a, 'member'), (m_ilim, gym_a, 'member'), (m_past, gym_a, 'member'),
    (m_gymb, gym_b, 'member');

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CMR finita', '5552200001', 5, current_date + 20, '8 clases', gym_a, m_fin) returning id into c_fin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CMR ilimitada', '5552200002', null, current_date + 20, 'Ilimitado', gym_a, m_ilim) returning id into c_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CMR pasada', '5552200003', 5, current_date + 20, '8 clases', gym_a, m_past) returning id into c_past;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CMR otro gym', '5552200004', 5, current_date + 20, '8 clases', gym_b, m_gymb) returning id into c_gymb;

  insert into public.class_type (gym_id, name) values (gym_a, 'CMR Metcon') returning id into v_ct_a;
  insert into public.class_type (gym_id, name) values (gym_b, 'CMR Metcon B') returning id into v_ct_b;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct_a, now() + interval '2 days', 60, 20) returning id into s_fin;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct_a, now() + interval '3 days', 60, 20) returning id into s_ilim;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct_a, now() + interval '4 days', 60, 20) returning id into s_past;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_b, v_ct_b, now() + interval '2 days', 60, 20) returning id into s_gymb;

  perform set_config('t.gym_a',  gym_a::text,  true);
  perform set_config('t.gym_b',  gym_b::text,  true);
  perform set_config('t.op_a',   op_a::text,   true);
  perform set_config('t.op_b',   op_b::text,   true);
  perform set_config('t.mem_a',  mem_a::text,  true);
  perform set_config('t.m_fin',  m_fin::text,  true);
  perform set_config('t.m_ilim', m_ilim::text, true);
  perform set_config('t.m_past', m_past::text, true);
  perform set_config('t.m_gymb', m_gymb::text, true);
  perform set_config('t.c_fin',  c_fin::text,  true);
  perform set_config('t.c_ilim', c_ilim::text, true);
  perform set_config('t.c_past', c_past::text, true);
  perform set_config('t.c_gymb', c_gymb::text, true);
  perform set_config('t.s_fin',  s_fin::text,  true);
  perform set_config('t.s_ilim', s_ilim::text, true);
  perform set_config('t.s_past', s_past::text, true);
  perform set_config('t.s_gymb', s_gymb::text, true);
end $$;

-- Every member books AS THEMSELVES — reservar_clase is what stamps `consumio`, the whole
-- gate on cancelar_reserva's refund.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_fin', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_ilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_ilim', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_past', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_past', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_gymb', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_gymb', true)::uuid); end $$;
reset role;

-- s_past → now moved into the past, AFTER its booking landed (#165 refuses booking a started
-- class, so "a past session with a live hold on it" can only be built in this order).
do $$
declare v_n int; v_status text;
begin
  update public.class_session set starts_at = now() - interval '3 hours'
   where id = current_setting('t.s_past', true)::uuid;

  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_fin', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SEED FAIL: c_fin expected 4 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_past', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SEED FAIL: c_past expected 4 after booking, got %', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_ilim', true)::uuid and class_session_id = current_setting('t.s_ilim', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SEED FAIL: c_ilim booking status % (expected reservada)', v_status; end if;
end $$;

-- ── (1) NON-STAFF REFUSED — a plain member cannot flip their own gym's switch ─────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.mem_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.cambiar_modo_reservas(false);
  exception when others then
    v_raised := true;
    if sqlerrm is distinct from 'No autorizado' then
      raise exception 'DENIAL FAIL(1): wrong raise for a non-staff caller: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'DENIAL FAIL(1): a plain member flipped the gym''s booking switch'; end if;
end $$;
reset role;

-- ── (2) CROSS-TENANT REFUSED — staff of gym B cannot name gym A as p_gym_id ───────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.cambiar_modo_reservas(false, current_setting('t.gym_a', true)::uuid);
  exception when others then
    v_raised := true;
    if sqlerrm is distinct from 'No autorizado' then
      raise exception 'DENIAL FAIL(2): wrong raise for a cross-tenant caller: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'DENIAL FAIL(2): staff of gym B flipped gym A''s switch'; end if;
end $$;
reset role;

-- Written rows read as OPS: neither refused call above may have moved anything, in either gym.
do $$
declare v_bool boolean; v_status text;
begin
  select booking_enabled into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from true then raise exception 'DENIAL FAIL: gym A booking_enabled % after refused calls (expected untouched true)', v_bool; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_fin', true)::uuid and class_session_id = current_setting('t.s_fin', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'DENIAL FAIL: c_fin booking moved to % by a refused call', v_status; end if;
end $$;

-- ── (3) THE OFF FLIP — future holds cancelled + refunded, past and other-gym left alone ───────
-- Called with p_gym_id EXPLICIT (not defaulted): this is the arm the app actually calls
-- (modo-reservas.ts:52 always sends p_gym_id), and op_a now staffs BOTH gym A and gym B, so
-- the omitted-arm fallback (staff_gym(), lowest-uuid-first) would be ambiguous between the
-- two. Naming gym A is what proves the explicit arg pins the flip correctly.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.cambiar_modo_reservas(false, current_setting('t.gym_a', true)::uuid);
  if v_n is distinct from 2 then raise exception 'RULE FAIL(3): cambiar_modo_reservas(false, gym_a) returned % (expected 2 — c_fin + c_ilim, not c_past)', v_n; end if;
end $$;
reset role;

do $$
declare
  v_bool boolean; v_n int; v_status text; v_cancelled timestamptz;
begin
  select booking_enabled into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from false then raise exception 'RULE FAIL(3): gym A booking_enabled % (expected false)', v_bool; end if;

  -- Finite hold: released and refunded exactly +1.
  select status, cancelled_at into v_status, v_cancelled from public.reservation
   where member_id = current_setting('t.c_fin', true)::uuid and class_session_id = current_setting('t.s_fin', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'RULE FAIL(3): c_fin booking status % (expected cancelada)', v_status; end if;
  if v_cancelled is null then raise exception 'RULE FAIL(3): c_fin booking cancelled_at not stamped'; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_fin', true)::uuid;
  if v_n is distinct from 5 then raise exception 'RULE FAIL(3): c_fin balance % (expected 4 + 1 = 5)', v_n; end if;

  -- Ilimitado hold: released, NULL balance untouched (never refunded).
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_ilim', true)::uuid and class_session_id = current_setting('t.s_ilim', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'RULE FAIL(3): c_ilim booking status % (expected cancelada)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_ilim', true)::uuid;
  if v_n is not null then raise exception 'RULE FAIL(3): c_ilim balance % — an ilimitado NULL was written to', v_n; end if;

  -- PAST booking: the class already started — starts_at > now() excludes it, not status.
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_past', true)::uuid and class_session_id = current_setting('t.s_past', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(3): a PAST booking was cancelled (status %)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_past', true)::uuid;
  if v_n is distinct from 4 then raise exception 'RULE FAIL(3): c_past balance % (expected an untouched 4 — no refund for a hold never released)', v_n; end if;

  -- ANOTHER GYM: its own switch and its own member's future booking are none of this call's business.
  select booking_enabled into v_bool from public.gym where id = current_setting('t.gym_b', true)::uuid;
  if v_bool is distinct from true then raise exception 'RULE FAIL(3): gym B booking_enabled % — flipped by gym A''s own call', v_bool; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_gymb', true)::uuid and class_session_id = current_setting('t.s_gymb', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(3): gym B''s booking moved to % by gym A''s cancel', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_gymb', true)::uuid;
  if v_n is distinct from 4 then raise exception 'RULE FAIL(3): c_gymb balance % (expected an untouched 4)', v_n; end if;
end $$;

-- ── (4) IDEMPOTENT ON THE TARGET STATE — a second OFF call touches NOTHING, not even a row ────
-- planted AFTER the first flip. Proves the early `v_actual = p_habilitar` return runs before the
-- cancel loop — a build that dropped the check would still return 0 here by coincidence (nothing
-- left `reservada`) were it not for this freshly-inserted row.
do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  v_ct  uuid;
  s_new uuid;
begin
  select id into v_ct from public.class_type where gym_id = gym_a limit 1;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct, now() + interval '5 days', 60, 20) returning id into s_new;
  -- Planted directly (booking_enabled is already false, so reservar_clase itself would refuse) —
  -- models a row that predates the switch flip and must still survive an idempotent re-call.
  insert into public.reservation (gym_id, class_session_id, member_id, status, consumio)
    values (gym_a, s_new, current_setting('t.c_fin', true)::uuid, 'reservada', true);
  perform set_config('t.s_new', s_new::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.cambiar_modo_reservas(false, current_setting('t.gym_a', true)::uuid);
  if v_n is distinct from 0 then raise exception 'RULE FAIL(4): a second OFF call returned % (expected 0 — already off)', v_n; end if;
end $$;
reset role;

do $$
declare v_status text; v_n int;
begin
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_fin', true)::uuid and class_session_id = current_setting('t.s_new', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(4): the idempotent re-call cancelled a row planted after the flip (status %)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_fin', true)::uuid;
  if v_n is distinct from 5 then raise exception 'RULE FAIL(4): c_fin balance % after the idempotent re-call (expected the untouched 5)', v_n; end if;
end $$;

-- ── (5) THE ON FLIP — flips back, seeds/cancels nothing ───────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.cambiar_modo_reservas(true, current_setting('t.gym_a', true)::uuid);
  if v_n is distinct from 0 then raise exception 'RULE FAIL(5): cambiar_modo_reservas(true, gym_a) returned % (expected 0 — turning on cancels nothing)', v_n; end if;
end $$;
reset role;

do $$
declare v_bool boolean; v_status text;
begin
  select booking_enabled into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from true then raise exception 'RULE FAIL(5): gym A booking_enabled % (expected true)', v_bool; end if;
  -- The row planted in (4) is still there, untouched, still reservada — turning ON never seeds or cancels.
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_fin', true)::uuid and class_session_id = current_setting('t.s_new', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(5): turning ON moved a reservation to %', v_status; end if;
end $$;

-- ── (6) IDEMPOTENT ON — a second ON call is also a no-op ──────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.cambiar_modo_reservas(true, current_setting('t.gym_a', true)::uuid);
  if v_n is distinct from 0 then raise exception 'RULE FAIL(6): a second ON call returned % (expected 0)', v_n; end if;
end $$;
reset role;

select 'cambiar_modo_reservas rules: OK' as result;
rollback;
