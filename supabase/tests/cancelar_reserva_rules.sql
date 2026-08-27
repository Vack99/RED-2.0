-- cancelar_reserva money-path rules (slice #58; ADR-0010 §4/§5 cancel rules; ADR-0004 refund; ADR-0005
-- atomic seam). The mirror of reservar_clase_rules.sql — the cancelada flip + finite refund are ONE
-- transaction, so their rules live ONLY in the RPC and this is their committed test home. Run against the
-- REAL deployed function on a scratch project in a rolled-back transaction:
--   * refund-before-start (finite) — cancelling before starts_at flips the row to cancelada (stamping
--                                    cancelled_at), refunds EXACTLY one class, and frees the spot (the
--                                    derived active count drops).
--   * ilimitado state-only         — a NULL-balance member's cancel flips the row but leaves the NULL
--                                    untouched (no phantom refund).
--   * after-start rejected         — a still-reservada past booking cannot be cancelled; balance and row
--                                    are untouched (a no-show consumes, ADR-0010 §5).
--   * re-book reuses the row       — after a cancel, reservar_clase reactivates the SAME unique row and
--                                    consumes one (one row total, ADR-0010 §5).
--   * double-cancel blocked        — cancelling an already-cancelled booking raises; the balance is NOT
--                                    refunded a second time (the guarded flip closes the race).
--   * no-reservation blocked       — cancelling a session the member never booked raises.
--
-- THE OPERATOR PATH (#237, slice 2 of #235). `cancelar_reserva` gained the same nullable target argument
-- `reservar_clase` did, and it is NOT optional: charging happens at booking, so an operator who taps the
-- wrong name has spent a class the member cannot get back from the admin app (the roster's present-toggle
-- would mark them ATTENDED, not cancel them). This is undo for a money-touching action. NULL is the member
-- self path above — every vector already written stays untouched, and THAT is the assertion that the
-- one-argument call is byte-for-byte unchanged.
--   * operator cancel refunds EXACTLY what the booking spent — an operator-made finite booking (consumed
--                                    one) refunds one and the row goes cancelada with cancelled_at
--                                    stamped and consumio left standing as the historical fact; the
--                                    OPERATOR's own balance never moves.
--   * op double-cancel              — the guarded flip closes the race on this path too: the second
--                                    cancel raises and the balance is refunded exactly ONCE.
--   * op re-book after cancel       — reactivates the SAME unique row (one row total) and consumes again.
--   * op ilimitado cancel           — spent nothing, refunds nothing; the NULL is never touched.
--   * op cancel after start refused — attendance history cannot be rewritten after the fact by an
--                                    operator either; the row stays reservada and the balance untouched.
--   * DENIALS (all four halves of the gate, and each one would SUCCEED were the gate missing — the denial
--     target holds a live consumio=true booking, so a leak shows up as a flipped row AND a minted class):
--     a plain member naming a target; that same member naming THEMSELVES (no self-exception); staff of
--     ANOTHER gym; a target cliente of another gym ('Cliente no encontrado').
--   (anon holds no EXECUTE on either signature: reservation_rls_denial.sql owns that vector.)
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK, so
-- it touches no row permanently. Zero hardcoded prod UUIDs (gyms/users/clientes seeded transaction-local).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into the
-- SUITE — or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  v_gym    uuid;
  v_ct     uuid;
  v_future timestamptz := now() + interval '2 days';
  v_past   timestamptz := now() - interval '2 hours';   -- a session that has already started
  m_fin  uuid := gen_random_uuid();
  m_ilim uuid := gen_random_uuid();
  m_past uuid := gen_random_uuid();
  m_flip uuid := gen_random_uuid();
  c_fin  uuid; c_ilim uuid; c_past uuid; c_flip uuid;
  s_open uuid; s_unbooked uuid; s_started uuid;
  -- ── #237 operator path ──
  op      uuid := gen_random_uuid();   -- STAFF of forge — the acting operator
  staff_b uuid := gen_random_uuid();   -- STAFF of a DIFFERENT gym
  gym_b   uuid := gen_random_uuid();
  c_op    uuid;                        -- the operator's OWN cliente (their balance must never move)
  c_b     uuid;                        -- a cliente of gym B — the cross-tenant target denial
  t_fin uuid; t_ilim uuid; t_start uuid; t_deny uuid;
  s_op  uuid;                          -- the operator path's OWN future session, so the member vectors'
                                       -- contar_reservas_activas assertions on s_open stay exactly as
                                       -- they were — the member path is not rewritten to make room
begin
  select id into v_gym from public.gym where slug = 'forge';
  if v_gym is null then raise exception 'SEED FAIL: expected the forge gym'; end if;
  -- A SUITE OWNS ITS FIXTURE STATE. 20260826120100 set forge's `booking_enabled` to false (the
  -- class-only containment switch), and every vector here needs a booking to exist before it can be
  -- cancelled — so the setup would die at reservar_clase on a product decision unrelated to the
  -- cancel rules under test. Re-enabled explicitly, transaction-local: one BEGIN/ROLLBACK, so the
  -- live flag is untouched. (cancelar_reserva has no such gate of its own by design — a gym that
  -- stops taking bookings must still let the ones it already holds be cancelled.)
  update public.gym set booking_enabled = true where id = v_gym;

  -- auth users for the acting members
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', m_fin,  'authenticated', 'authenticated', 'cx-fin@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_ilim, 'authenticated', 'authenticated', 'cx-ilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_past, 'authenticated', 'authenticated', 'cx-past@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_flip, 'authenticated', 'authenticated', 'cx-flip@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (m_fin, v_gym, 'member'), (m_ilim, v_gym, 'member'), (m_past, v_gym, 'member'), (m_flip, v_gym, 'member');

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CX finite', '0000000001', 5, current_date + 20, '8 clases', v_gym, m_fin) returning id into c_fin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CX ilim', '0000000002', null, current_date + 20, 'Ilimitado', v_gym, m_ilim) returning id into c_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CX past', '0000000003', 5, current_date + 20, '8 clases', v_gym, m_past) returning id into c_past;
  -- C12 flip fixture: books while ILIMITADO (null balance), then the fixture flips it to a finite saldo
  -- mid-test to simulate C4 purchase-wins between booking and cancel.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CX flip', '0000000004', null, current_date + 20, 'Ilimitado', v_gym, m_flip) returning id into c_flip;

  insert into public.class_type (gym_id, name) values (v_gym, 'CX Metcon') returning id into v_ct;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_future, 60, 20) returning id into s_open;
  -- a second FUTURE session m_fin never books — the no-reservation rejection target (future, so the
  -- raise can only come from the missing-reservation guard, not the before-start one). An hour after
  -- s_open rather than at the same instant: since the 2026-08-23 slot-exclusivity ruling
  -- (20260823120100) one gym holds at most ONE uncancelled class per instant. Nothing here reads the
  -- hour — only "future" matters — so the vector is unchanged.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_future + interval '1 hour', 60, 20) returning id into s_unbooked;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_past, 60, 20) returning id into s_started;

  -- m_past already holds a reservada booking on the STARTED session (seeded privileged — the member holds
  -- no direct write; this stands in for a booking made before the class began).
  insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (v_gym, s_started, c_past, 'reservada');

  -- ── #237 operator-path fixtures ────────────────────────────────────────────────
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'cx-staff-target-gym-2', 'CX Staff Target Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op,      'authenticated', 'authenticated', 'cx-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b, 'authenticated', 'authenticated', 'cx-staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op, v_gym, 'operator'), (staff_b, gym_b, 'operator');

  -- The operator trains here too, so "the refund went to the member, not the operator" is a real assertion.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CX operator', '0000000201', 5, current_date + 20, '8 clases', v_gym, op) returning id into c_op;

  -- Targets carry NO auth_user_id: the phone-in member who never signed up for the booking site.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('CX target finite', '0000000202', 5, current_date + 20, '8 clases', v_gym) returning id into t_fin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('CX target ilim', '0000000203', null, current_date + 20, 'Ilimitado', v_gym) returning id into t_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('CX target started', '0000000204', 5, current_date + 20, '8 clases', v_gym) returning id into t_start;
  -- The DENIAL target: 4 classes and a live booking that CONSUMED one. Every denied cancel below would,
  -- if it leaked, flip this row to cancelada AND mint a class back — so the leak is visible in two places.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('CX target deny', '0000000205', 4, current_date + 20, '8 clases', v_gym) returning id into t_deny;

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('CX gym-B cliente', '0000000206', 5, current_date + 20, '8 clases', gym_b) returning id into c_b;

  -- +2h, same slot-exclusivity reason as s_unbooked above: its own instant, still future.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_future + interval '2 hours', 60, 20) returning id into s_op;

  -- t_start's booking predates the class starting; t_deny's is the denial bait. Both seeded privileged
  -- with consumio = true, the state reservar_clase leaves behind for a finite booking.
  insert into public.reservation (gym_id, class_session_id, member_id, status, consumio)
    values (v_gym, s_started, t_start, 'reservada', true);
  insert into public.reservation (gym_id, class_session_id, member_id, status, consumio)
    values (v_gym, s_op, t_deny, 'reservada', true);

  perform set_config('t.s_op',    s_op::text,    true);
  perform set_config('t.op',      op::text,      true);
  perform set_config('t.staff_b', staff_b::text, true);
  perform set_config('t.c_op',    c_op::text,    true);
  perform set_config('t.c_b',     c_b::text,     true);
  perform set_config('t.t_fin',   t_fin::text,   true);
  perform set_config('t.t_ilim',  t_ilim::text,  true);
  perform set_config('t.t_start', t_start::text, true);
  perform set_config('t.t_deny',  t_deny::text,  true);

  perform set_config('t.gym',        v_gym::text,      true);
  perform set_config('t.m_fin',      m_fin::text,      true);
  perform set_config('t.m_ilim',     m_ilim::text,     true);
  perform set_config('t.m_past',     m_past::text,     true);
  perform set_config('t.m_flip',     m_flip::text,     true);
  perform set_config('t.c_fin',      c_fin::text,      true);
  perform set_config('t.c_ilim',     c_ilim::text,     true);
  perform set_config('t.c_past',     c_past::text,     true);
  perform set_config('t.c_flip',     c_flip::text,     true);
  perform set_config('t.s_open',     s_open::text,     true);
  perform set_config('t.s_unbooked', s_unbooked::text, true);
  perform set_config('t.s_started',  s_started::text,  true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- refund-before-start (finite): book 5→4, cancel → 5, row cancelada + cancelled_at, spot freed;
-- then double-cancel is blocked (no second refund); then no-reservation cancel is blocked.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  s_unbooked uuid := current_setting('t.s_unbooked', true)::uuid;
  c_fin  uuid := current_setting('t.c_fin', true)::uuid;
  v_ret int; v_clases int; v_status text; v_cancelled timestamptz; v_active int; v_consumio boolean; raised boolean;
begin
  -- book first (5 → 4), one reservada row, active count = 1
  perform public.reservar_clase(s_open);
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 4 then raise exception 'SETUP FAIL(refund): booking left clases %, expected 4', v_clases; end if;
  select coalesce((select activos from public.contar_reservas_activas(array[s_open])), 0) into v_active;
  if v_active <> 1 then raise exception 'SETUP FAIL(refund): active count % after book, expected 1', v_active; end if;

  -- cancel before start: refund 4 → 5, row cancelada, cancelled_at stamped, RPC returns the new balance
  select clases_restantes into v_ret from public.cancelar_reserva(s_open);
  if v_ret <> 5 then raise exception 'RULE FAIL(refund): RPC returned clases %, expected 5', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 5 then raise exception 'RULE FAIL(refund): stored clases %, expected refunded 5', v_clases; end if;
  select status, cancelled_at, consumio into v_status, v_cancelled, v_consumio from public.reservation
    where member_id = c_fin and class_session_id = s_open;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(refund): row status % (expected cancelada)', v_status; end if;
  if v_cancelled is null then raise exception 'RULE FAIL(refund): cancelled_at not stamped'; end if;
  -- C12: consumio stays the historical fact on the cancelled row (a finite booking DID consume) — the
  -- refund fired precisely because this was true.
  if v_consumio is distinct from true then raise exception 'RULE FAIL(refund): row consumio % (expected true)', v_consumio; end if;

  -- the spot frees itself — the derived active count drops to 0 (cancelada excluded)
  select coalesce((select activos from public.contar_reservas_activas(array[s_open])), 0) into v_active;
  if v_active <> 0 then raise exception 'RULE FAIL(refund): active count % after cancel, expected 0', v_active; end if;

  -- double-cancel: cancelling the now-cancelled booking raises; balance is NOT refunded a second time
  raised := false;
  begin perform public.cancelar_reserva(s_open); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(double): second cancel of the same booking did not raise'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 5 then raise exception 'RULE FAIL(double): balance moved to % on rejected double-cancel', v_clases; end if;

  -- re-book reuses the row: reservar_clase reactivates the SAME unique row and consumes one (5 → 4, 1 row)
  perform public.reservar_clase(s_open);
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 4 then raise exception 'RULE FAIL(rebook): expected clases 4 after re-book, got %', v_clases; end if;
  select count(*) into v_ret from public.reservation where member_id = c_fin and class_session_id = s_open;
  if v_ret <> 1 then raise exception 'RULE FAIL(rebook): expected 1 row total (reused), got %', v_ret; end if;

  -- no-reservation: cancelling a FUTURE session the member never booked raises on the
  -- missing-reservation guard specifically (the before-start guard cannot fire here)
  raised := false;
  begin perform public.cancelar_reserva(s_unbooked); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(none): cancelling an unbooked session did not raise'; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- ilimitado: cancel changes state only — the NULL balance is never touched
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_ilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  c_ilim uuid := current_setting('t.c_ilim', true)::uuid;
  v_ret int; v_clases int; v_status text; v_consumio boolean;
begin
  -- book (stays NULL), then cancel: RPC returns NULL, stored stays NULL, row cancelada
  perform public.reservar_clase(s_open);
  -- C12: the ilimitado booking recorded consumio = false — nothing was spent, so nothing may be refunded
  select consumio into v_consumio from public.reservation where member_id = c_ilim and class_session_id = s_open;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(ilim): booked row consumio % (expected false)', v_consumio; end if;
  select clases_restantes into v_ret from public.cancelar_reserva(s_open);
  if v_ret is not null then raise exception 'RULE FAIL(ilim): RPC returned clases % (expected NULL)', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = c_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(ilim): stored clases % (expected NULL, never refunded)', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_ilim and class_session_id = s_open;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(ilim): row status % (expected cancelada)', v_status; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- after-start rejected: a started session's still-reservada booking cannot be cancelled — atomic
-- (row untouched, balance untouched)
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_past', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_started uuid := current_setting('t.s_started', true)::uuid;
  c_past uuid := current_setting('t.c_past', true)::uuid;
  v_clases int; v_status text; raised boolean;
begin
  raised := false;
  begin perform public.cancelar_reserva(s_started); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(started): cancelling a started session did not raise'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_past;
  if v_clases <> 5 then raise exception 'RULE FAIL(started): balance moved to % on rejected cancel', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_past and class_session_id = s_started;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(started): row flipped to % (expected reservada)', v_status; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- C12 flip (the phantom-class bug, pinned dead): an ilimitado booking records consumio=false; the plan
-- then flips ilimitado → finite between booking and cancel (C4 purchase-wins); cancel must refund NOTHING
-- — the old unconditional +1 would have minted a class the member never paid for.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_flip', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  c_flip uuid := current_setting('t.c_flip', true)::uuid;
  v_clases int; v_consumio boolean;
begin
  -- book while ilimitado: no consume, the reservation row records consumio = false
  perform public.reservar_clase(s_open);
  select clases_restantes into v_clases from public.clientes where id = c_flip;
  if v_clases is not null then raise exception 'SETUP FAIL(flip): booked balance % (expected NULL ilimitado)', v_clases; end if;
  select consumio into v_consumio from public.reservation where member_id = c_flip and class_session_id = s_open;
  if v_consumio is distinct from false then raise exception 'SETUP FAIL(flip): booked row consumio % (expected false)', v_consumio; end if;
end $$;
reset role;

-- The plan flips ilimitado → finite between booking and cancel (simulates C4 purchase-wins). Done AS THE
-- PRIVILEGED (migration) role — a member holds no direct clientes write.
update public.clientes set clases_restantes = 3, paquete_nombre = '8 clases'
 where id = current_setting('t.c_flip', true)::uuid;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_flip', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  c_flip uuid := current_setting('t.c_flip', true)::uuid;
  v_ret int; v_clases int; v_status text;
begin
  -- cancel: the booking consumed NOTHING (consumio=false), so despite the member now being finite the
  -- refund must NOT fire — the finite balance stays 3, no phantom class minted.
  select clases_restantes into v_ret from public.cancelar_reserva(s_open);
  if v_ret <> 3 then raise exception 'RULE FAIL(flip): RPC returned clases % (expected 3, NO phantom refund)', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = c_flip;
  if v_clases <> 3 then raise exception 'RULE FAIL(flip): stored clases % (expected 3, no phantom credit)', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_flip and class_session_id = s_open;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(flip): row status % (expected cancelada)', v_status; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- #237 OPERATOR PATH — the undo for a money-touching action
-- ════════════════════════════════════════════════════════════════════════════════
-- Booked by the operator, cancelled by the operator: the class comes back to the MEMBER who was charged,
-- exactly once, and the operator's own balance never moves. Everything runs on s_op, the operator path's
-- own session, so the member vectors' active-count assertions on s_open are untouched.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_op  uuid := current_setting('t.s_op', true)::uuid;
  t_fin uuid := current_setting('t.t_fin', true)::uuid;
  c_op  uuid := current_setting('t.c_op', true)::uuid;
  v_ret int; v_clases int; v_n int; r record; raised boolean;
begin
  -- book on behalf of the target: 5 → 4, consumio true (that flag is what the refund is gated on)
  perform public.reservar_clase(s_op, t_fin);
  select clases_restantes into v_clases from public.clientes where id = t_fin;
  if v_clases <> 4 then raise exception 'SETUP FAIL(op refund): operator booking left clases %, expected 4', v_clases; end if;

  -- cancel on behalf of the target: refund EXACTLY what the booking spent — one class, back to the member
  select clases_restantes into v_ret from public.cancelar_reserva(s_op, t_fin);
  if v_ret <> 5 then raise exception 'RULE FAIL(op refund): RPC returned clases %, expected 5', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = t_fin;
  if v_clases <> 5 then raise exception 'RULE FAIL(op refund): stored clases %, expected refunded 5', v_clases; end if;
  select clases_restantes into v_clases from public.clientes where id = c_op;
  if v_clases <> 5 then raise exception 'RULE FAIL(op refund): the OPERATOR''s own balance moved to % — the refund credited the caller, not the member', v_clases; end if;

  select status, cancelled_at, consumio into r
    from public.reservation where member_id = t_fin and class_session_id = s_op;
  if r.status       is distinct from 'cancelada' then raise exception 'RULE FAIL(op refund): row status % (expected cancelada)', r.status; end if;
  if r.cancelled_at is null                      then raise exception 'RULE FAIL(op refund): cancelled_at not stamped'; end if;
  -- consumio stays the HISTORICAL fact on the cancelled row; the refund fired precisely because it was true.
  if r.consumio     is distinct from true        then raise exception 'RULE FAIL(op refund): row consumio % (expected true)', r.consumio; end if;

  -- double-cancel on the operator path: the guarded flip means the second one raises and the class is
  -- refunded exactly ONCE — two operators racing the same mis-tap cannot mint two classes.
  raised := false;
  begin perform public.cancelar_reserva(s_op, t_fin); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(op double): second operator cancel did not raise'; end if;
  select clases_restantes into v_clases from public.clientes where id = t_fin;
  if v_clases <> 5 then raise exception 'RULE FAIL(op double): balance moved to % on a rejected double-cancel', v_clases; end if;

  -- re-book after the cancel reuses the SAME unique row and consumes again (5 → 4, one row total)
  perform public.reservar_clase(s_op, t_fin);
  select clases_restantes into v_clases from public.clientes where id = t_fin;
  if v_clases <> 4 then raise exception 'RULE FAIL(op rebook): expected clases 4 after re-book, got %', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = t_fin and class_session_id = s_op;
  if v_n <> 1 then raise exception 'RULE FAIL(op rebook): expected 1 row total (reused), got %', v_n; end if;
end $$;
reset role;

-- ── op: an ilimitado booking spent nothing, so the operator cancel refunds nothing ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_op   uuid := current_setting('t.s_op', true)::uuid;
  t_ilim uuid := current_setting('t.t_ilim', true)::uuid;
  v_ret int; v_clases int; v_status text;
begin
  perform public.reservar_clase(s_op, t_ilim);
  select clases_restantes into v_ret from public.cancelar_reserva(s_op, t_ilim);
  if v_ret is not null then raise exception 'RULE FAIL(op ilim): RPC returned clases % (expected NULL)', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = t_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(op ilim): stored clases % (expected NULL, never refunded)', v_clases; end if;
  select status into v_status from public.reservation where member_id = t_ilim and class_session_id = s_op;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(op ilim): row status % (expected cancelada)', v_status; end if;
end $$;
reset role;

-- ── op: once the class has started the operator cancel is refused too — atomic ──
-- Attendance history is not an operator's to rewrite after the fact: a still-reservada past booking is a
-- no-show that must consume (ADR-0010 §5), and the before-start gate is SHARED, not forked per path.
--
-- THE TENSE: s_started began two hours ago and runs 60 minutes, so it is OVER, and since 20260806130000
-- the refusal says 'La clase ya pasó'. Same one condition as before — only the sentence knows the
-- difference between a class that is running and one that finished last Tuesday. The full sentence is
-- pinned, not a prefix: both tenses share 'La clase ya ', so a prefix match would prove nothing.
-- ('La clase ya comenzó' is still what a mid-run class says; cancel_class_session_release.sql (2b)
-- holds that half.)
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_started uuid := current_setting('t.s_started', true)::uuid;
  t_start   uuid := current_setting('t.t_start', true)::uuid;
  v_clases int; v_status text; v_msg text;
begin
  v_msg := null;
  begin perform public.cancelar_reserva(s_started, t_start); exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'La clase ya pasó' then
    raise exception 'RULE FAIL(op started): got % (expected La clase ya pasó — the class is over, not running)', v_msg;
  end if;
  select clases_restantes into v_clases from public.clientes where id = t_start;
  if v_clases <> 5 then raise exception 'RULE FAIL(op started): balance moved to % on a rejected cancel', v_clases; end if;
  select status into v_status from public.reservation where member_id = t_start and class_session_id = s_started;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(op started): row flipped to % (expected reservada)', v_status; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- #237 DENIALS — the new argument is not a privilege hole on the cancel side either
-- ════════════════════════════════════════════════════════════════════════════════
-- Each denied caller aims at a LIVE consumio=true booking, so a leak would flip a row AND mint a class.

-- ── a plain MEMBER of the gym naming a target — including naming THEMSELVES ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_op   uuid := current_setting('t.s_op', true)::uuid;
  s_open uuid := current_setting('t.s_open', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  c_fin  uuid := current_setting('t.c_fin', true)::uuid;
  v_msg text;
begin
  v_msg := null;
  begin perform public.cancelar_reserva(s_op, t_deny); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'No autorizado%' then
    raise exception 'DENIAL FAIL(non-staff): a plain member cancelled another member''s booking — got % (expected No autorizado)', v_msg;
  end if;

  -- NO SELF-EXCEPTION (#237): the member's door is the ONE-argument call, which still works — every
  -- member vector at the top of this file proves it.
  v_msg := null;
  begin perform public.cancelar_reserva(s_open, c_fin); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'No autorizado%' then
    raise exception 'DENIAL FAIL(self-target): a member used the operator argument on themselves — got % (expected No autorizado)', v_msg;
  end if;
end $$;
reset role;

-- ── STAFF OF ANOTHER GYM: is_staff_of is asked about the SESSION's gym, never the caller's ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_op   uuid := current_setting('t.s_op', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  v_msg text;
begin
  v_msg := null;
  begin perform public.cancelar_reserva(s_op, t_deny); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'No autorizado%' then
    raise exception 'DENIAL FAIL(cross-gym staff): gym B staff cancelled a gym A booking — got % (expected No autorizado)', v_msg;
  end if;
end $$;
reset role;

-- ── A TARGET OF ANOTHER GYM: the caller IS legitimately staff, but the cliente is not theirs ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_op uuid := current_setting('t.s_op', true)::uuid;
  c_b  uuid := current_setting('t.c_b', true)::uuid;
  v_msg text;
begin
  v_msg := null;
  begin perform public.cancelar_reserva(s_op, c_b); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'Cliente no encontrado%' then
    raise exception 'DENIAL FAIL(cross-gym target): a gym-B cliente resolved inside a gym-A cancel — got % (expected Cliente no encontrado)', v_msg;
  end if;
end $$;
reset role;

-- The denial state is read back AS THE PRIVILEGED ROLE: under RLS neither denied caller can see the rows
-- they failed to touch, so "still reservada" measured as them would be vacuously true.
do $$
declare
  s_op   uuid := current_setting('t.s_op', true)::uuid;
  s_open uuid := current_setting('t.s_open', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  c_fin  uuid := current_setting('t.c_fin', true)::uuid;
  c_b    uuid := current_setting('t.c_b', true)::uuid;
  v_clases int; v_n int; v_status text; v_cancelled timestamptz;
begin
  select status, cancelled_at into v_status, v_cancelled
    from public.reservation where member_id = t_deny and class_session_id = s_op;
  if v_status is distinct from 'reservada' then raise exception 'DENIAL FAIL: the denial target''s booking flipped to %', v_status; end if;
  if v_cancelled is not null then raise exception 'DENIAL FAIL: cancelled_at got stamped on a denied cancel'; end if;
  select clases_restantes into v_clases from public.clientes where id = t_deny;
  if v_clases <> 4 then raise exception 'DENIAL FAIL: the denial target''s balance moved to % — a class was minted', v_clases; end if;

  select status into v_status from public.reservation where member_id = c_fin and class_session_id = s_open;
  if v_status is distinct from 'reservada' then raise exception 'DENIAL FAIL: the self-targeting member''s own booking flipped to %', v_status; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 4 then raise exception 'DENIAL FAIL: the self-targeting member''s balance moved to %', v_clases; end if;

  select clases_restantes into v_clases from public.clientes where id = c_b;
  if v_clases <> 5 then raise exception 'DENIAL FAIL: the gym-B cliente''s balance moved to %', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = c_b;
  if v_n <> 0 then raise exception 'DENIAL FAIL: % reservation row(s) exist for the gym-B cliente', v_n; end if;
end $$;

select 'cancelar_reserva rules: OK' as result;
rollback;
