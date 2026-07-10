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
begin
  select id into v_gym from public.gym where slug = 'forge';
  if v_gym is null then raise exception 'SEED FAIL: expected the forge gym'; end if;

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
  -- raise can only come from the missing-reservation guard, not the before-start one)
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_future, 60, 20) returning id into s_unbooked;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_past, 60, 20) returning id into s_started;

  -- m_past already holds a reservada booking on the STARTED session (seeded privileged — the member holds
  -- no direct write; this stands in for a booking made before the class began).
  insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (v_gym, s_started, c_past, 'reservada');

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

select 'cancelar_reserva rules: OK' as result;
rollback;
