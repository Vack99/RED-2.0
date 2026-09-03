-- cambiar_corte_reservas — the per-gym booking-cutoff switch, migration 20260902120000.
--
-- The sibling of `cambiar_modo_reservas` (20260901140000) MINUS its cancel cascade, and the
-- absence is the interesting half: turning the cutoff ON closes the door for future booking
-- ATTEMPTS and says nothing about seats already held. A member who booked tomorrow's 07:00 class
-- yesterday keeps it when the gym flips the cutoff on tonight. `cambiar_modo_reservas` cancels
-- precisely because ITS off-state means "this gym takes no bookings at all", which a live hold
-- contradicts; "the member's door has closed" does not.
--
-- The rules this suite pins, all on the WRITTEN ROWS (the RPC returns void, so the rows are the
-- ONLY contract there is):
--   * STAFF-ONLY, gym-scoped through the caller's OWN membership — a plain member is refused
--     ('No autorizado'), and so is staff of a DIFFERENT gym naming this one as `p_gym_id`;
--     neither refusal touches `gym.corte_reservas` in either gym;
--   * the ON flip sets `corte_reservas` true for the NAMED gym and leaves the other gym's own
--     column alone — the same explicit-`p_gym_id` pin `cambiar_modo_reservas_rules` proves, with
--     the same two-gym operator (`staff_gym()`'s omitted-arm fallback would be ambiguous for him,
--     so naming gym A is what makes the flip land on gym A);
--   * NO CASCADE: a future, still-`reservada` booking on that gym survives the ON flip with its
--     status, its `cancelled_at` and its member's balance all untouched. This is the assertion
--     that would fail if somebody copied `cambiar_modo_reservas`' loop across;
--   * the OFF flip sets it back, and it too cancels/refunds nothing;
--   * IDEMPOTENT: a second call at the state already in effect changes nothing and raises nothing;
--   * `booking_enabled` is a DIFFERENT switch — this RPC never moves it (a body that flipped the
--     wrong column would otherwise pass every assertion above that only reads `corte_reservas`).
--
-- The booking is made through `reservar_clase` AS THE MEMBER (never seeded by hand) so the row and
-- its `consumio` stamp are the real thing a live booking writes — the same discipline
-- `cambiar_modo_reservas_rules.sql` and `cancel_class_session_release.sql` use.
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row.
-- BEGIN/ROLLBACK, zero prod UUIDs. Comparisons use `is distinct from`, never `<>`.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs — wired into SUITE.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  gym_a uuid := gen_random_uuid();
  gym_b uuid := gen_random_uuid();
  v_tz  text := 'America/Mexico_City';
  op_a  uuid := gen_random_uuid();   -- staff of gym A *and* gym B — the caller under test
  op_b  uuid := gen_random_uuid();   -- staff of gym B only — the cross-tenant probe
  mem_a uuid := gen_random_uuid();   -- plain MEMBER of gym A — the non-staff probe
  m_res uuid := gen_random_uuid();   -- member of gym A holding a FUTURE booking
  c_res uuid;
  v_ct  uuid;
  s_fut uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'ccr-suite-gym-a', 'CCR Gym A', v_tz, 'base'),
    (gym_b, 'ccr-suite-gym-b', 'CCR Gym B', v_tz, 'base');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_a,  'authenticated', 'authenticated', 'ccr-op-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_b,  'authenticated', 'authenticated', 'ccr-op-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', mem_a, 'authenticated', 'authenticated', 'ccr-mem-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_res, 'authenticated', 'authenticated', 'ccr-res@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_a, gym_b, 'operator'),
    (op_b, gym_b, 'operator'),
    (mem_a, gym_a, 'member'),
    (m_res, gym_a, 'member');

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CCR reserva', '5553300001', 5, current_date + 20, '8 clases', gym_a, m_res) returning id into c_res;

  insert into public.class_type (gym_id, name) values (gym_a, 'CCR Metcon') returning id into v_ct;

  -- Two days out: far past any cutoff this switch could impose, so the booking below succeeds
  -- regardless of what time of day the suite runs — the vector is the CASCADE, not the cutoff.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct, now() + interval '2 days', 60, 20) returning id into s_fut;

  perform set_config('t.gym_a', gym_a::text, true);
  perform set_config('t.gym_b', gym_b::text, true);
  perform set_config('t.op_a',  op_a::text,  true);
  perform set_config('t.op_b',  op_b::text,  true);
  perform set_config('t.mem_a', mem_a::text, true);
  perform set_config('t.m_res', m_res::text, true);
  perform set_config('t.c_res', c_res::text, true);
  perform set_config('t.s_fut', s_fut::text, true);
end $$;

-- The member books AS THEMSELVES — reservar_clase is what stamps `consumio`, the gate any refund
-- would read. Both gyms start at the DEFAULT: corte_reservas = false.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_res', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_fut', true)::uuid); end $$;
reset role;

do $$
declare v_n int; v_bool boolean;
begin
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_res', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SEED FAIL: c_res expected 4 after booking, got %', v_n; end if;
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from false then raise exception 'SEED FAIL: gym A corte_reservas % (expected the default false)', v_bool; end if;
end $$;

-- ── (1) NON-STAFF REFUSED — a plain member cannot flip their own gym's cutoff ─────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.mem_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.cambiar_corte_reservas(true);
  exception when others then
    v_raised := true;
    if sqlerrm is distinct from 'No autorizado' then
      raise exception 'DENIAL FAIL(1): wrong raise for a non-staff caller: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'DENIAL FAIL(1): a plain member flipped the gym''s cutoff'; end if;
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
    perform public.cambiar_corte_reservas(true, current_setting('t.gym_a', true)::uuid);
  exception when others then
    v_raised := true;
    if sqlerrm is distinct from 'No autorizado' then
      raise exception 'DENIAL FAIL(2): wrong raise for a cross-tenant caller: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'DENIAL FAIL(2): staff of gym B flipped gym A''s cutoff'; end if;
end $$;
reset role;

do $$
declare v_bool boolean;
begin
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from false then raise exception 'DENIAL FAIL: gym A corte_reservas % after refused calls (expected an untouched false)', v_bool; end if;
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_b', true)::uuid;
  if v_bool is distinct from false then raise exception 'DENIAL FAIL: gym B corte_reservas % after refused calls (expected an untouched false)', v_bool; end if;
end $$;

-- ── (3) THE ON FLIP — the named gym only, and NOTHING is cancelled ────────────────────────────
-- Called with p_gym_id EXPLICIT, and op_a staffs BOTH gyms, so the omitted-arm fallback
-- (staff_gym(), lowest-uuid-first) would be ambiguous: naming gym A is what proves the pin.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.cambiar_corte_reservas(true, current_setting('t.gym_a', true)::uuid); end $$;
reset role;

do $$
declare v_bool boolean; v_status text; v_cancelled timestamptz; v_n int;
begin
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from true then raise exception 'RULE FAIL(3): gym A corte_reservas % (expected true)', v_bool; end if;

  -- The OTHER gym is none of this call's business.
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_b', true)::uuid;
  if v_bool is distinct from false then raise exception 'RULE FAIL(3): gym B corte_reservas % — flipped by gym A''s own call', v_bool; end if;

  -- The OTHER SWITCH is a different fact: this RPC must not have touched booking_enabled.
  select booking_enabled into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from true then raise exception 'RULE FAIL(3): gym A booking_enabled % — the cutoff switch moved the WRONG column', v_bool; end if;

  -- NO CASCADE: the future hold and the balance it spent are exactly where the booking left them.
  select status, cancelled_at into v_status, v_cancelled from public.reservation
   where member_id = current_setting('t.c_res', true)::uuid
     and class_session_id = current_setting('t.s_fut', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(3): turning the cutoff ON cancelled a future booking (status %)', v_status; end if;
  if v_cancelled is not null then raise exception 'RULE FAIL(3): turning the cutoff ON stamped cancelled_at'; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_res', true)::uuid;
  if v_n is distinct from 4 then raise exception 'RULE FAIL(3): balance % after the ON flip (expected the untouched 4 — no refund, because nothing was released)', v_n; end if;
end $$;

-- ── (4) IDEMPOTENT ON — a second identical call changes nothing and raises nothing ────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.cambiar_corte_reservas(true, current_setting('t.gym_a', true)::uuid); end $$;
reset role;

do $$
declare v_bool boolean; v_status text; v_n int;
begin
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from true then raise exception 'RULE FAIL(4): gym A corte_reservas % after an idempotent re-call', v_bool; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_res', true)::uuid
     and class_session_id = current_setting('t.s_fut', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(4): the re-call moved a reservation to %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_res', true)::uuid;
  if v_n is distinct from 4 then raise exception 'RULE FAIL(4): balance % after the re-call', v_n; end if;
end $$;

-- ── (5) THE OFF FLIP — back to false, still no cascade ────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.cambiar_corte_reservas(false, current_setting('t.gym_a', true)::uuid); end $$;
reset role;

do $$
declare v_bool boolean; v_status text; v_n int;
begin
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from false then raise exception 'RULE FAIL(5): gym A corte_reservas % (expected false)', v_bool; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.c_res', true)::uuid
     and class_session_id = current_setting('t.s_fut', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(5): turning the cutoff OFF moved a reservation to %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_res', true)::uuid;
  if v_n is distinct from 4 then raise exception 'RULE FAIL(5): balance % after the OFF flip', v_n; end if;
end $$;

-- ── (6) THE OMITTED-ARM FALLBACK still resolves through the caller's OWN membership ───────────
-- op_b staffs gym B alone, so `staff_gym()` is unambiguous for him: the defaulted call must land on
-- HIS gym and nowhere near gym A — the same probe as (2), from the other direction.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.cambiar_corte_reservas(true); end $$;
reset role;

do $$
declare v_bool boolean;
begin
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_b', true)::uuid;
  if v_bool is distinct from true then raise exception 'RULE FAIL(6): the defaulted call did not flip the caller''s own gym (gym B = %)', v_bool; end if;
  select corte_reservas into v_bool from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if v_bool is distinct from false then raise exception 'RULE FAIL(6): the defaulted call reached gym A (%)', v_bool; end if;
end $$;

select 'cambiar_corte_reservas rules: OK' as result;
rollback;
