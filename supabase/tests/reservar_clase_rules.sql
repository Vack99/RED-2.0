-- reservar_clase money-path rules (slice #57; ADR-0010 §4 consume rules; ADR-0005 atomic seam).
--
-- The reservation insert + guarded balance decrement are ONE transaction. These rules live ONLY in the
-- RPC (transaction-inseparable, ADR-0005 posture) — this is their committed test home, run against the
-- REAL deployed function on a scratch project in a rolled-back transaction:
--   * consume-once (finite)      — booking decrements clases_restantes by EXACTLY one, and creates a
--                                  'reservada' row.
--   * ilimitado exempt           — a NULL-balance member books with clases_restantes staying NULL.
--   * zero-balance block         — a finite member at 0 is rejected; no row, no decrement (atomic).
--   * expired block              — a finite member past `vence` is rejected; no row, balance untouched.
--   * full block                 — capacity checked against the DERIVED active count; the (cap+1)th
--                                  booker is rejected atomically (no decrement).
--   * duplicate block            — re-booking an already-active (member, session) is rejected; balance
--                                  is not decremented a second time.
--   * re-book reuses the row     — booking a session the member previously CANCELLED reactivates the one
--                                  UNIQUE row (no duplicate) and consumes one.
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
  v_tz     text;
  v_today  date;
  v_ct     uuid;
  v_starts timestamptz := now() + interval '2 days';
  m_fin  uuid := gen_random_uuid();
  m_ilim uuid := gen_random_uuid();
  m_zero uuid := gen_random_uuid();
  m_exp  uuid := gen_random_uuid();
  m_full uuid := gen_random_uuid();
  c_fin  uuid; c_ilim uuid; c_zero uuid; c_exp uuid; c_full uuid;
  s_open uuid; s_full uuid;
  d_cli  uuid;
  i int;
begin
  select id, timezone into v_gym, v_tz from public.gym where slug = 'forge';
  if v_gym is null then raise exception 'SEED FAIL: expected the forge gym'; end if;
  v_today := (now() at time zone v_tz)::date;

  -- auth users for the five acting members
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', m_fin,  'authenticated', 'authenticated', 'rc-fin@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_ilim, 'authenticated', 'authenticated', 'rc-ilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_zero, 'authenticated', 'authenticated', 'rc-zero@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_exp,  'authenticated', 'authenticated', 'rc-exp@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_full, 'authenticated', 'authenticated', 'rc-full@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (m_fin, v_gym, 'member'), (m_ilim, v_gym, 'member'), (m_zero, v_gym, 'member'),
    (m_exp, v_gym, 'member'), (m_full, v_gym, 'member');

  -- one cliente per acting member (auth_user_id links them; balances/vence per case)
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC finite', '0000000001', 5, v_today + 20, '8 clases', v_gym, m_fin) returning id into c_fin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC ilim', '0000000002', null, v_today + 20, 'Ilimitado', v_gym, m_ilim) returning id into c_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC zero', '0000000003', 0, v_today + 20, '8 clases', v_gym, m_zero) returning id into c_zero;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC exp', '0000000004', 5, v_today - 1, '8 clases', v_gym, m_exp) returning id into c_exp;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC full', '0000000005', 5, v_today + 20, '8 clases', v_gym, m_full) returning id into c_full;

  insert into public.class_type (gym_id, name) values (v_gym, 'RC Metcon') returning id into v_ct;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 20) returning id into s_open;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 4) returning id into s_full;

  -- Fill s_full to capacity (4) with four distinct dummy clientes' active reservations.
  for i in 1..4 loop
    insert into public.clientes (nombre, tel, gym_id) values ('RC dummy '||i, '000000010'||i, v_gym)
      returning id into d_cli;
    insert into public.reservation (gym_id, class_session_id, member_id, status)
      values (v_gym, s_full, d_cli, 'reservada');
  end loop;

  perform set_config('t.gym',    v_gym::text,   true);
  perform set_config('t.m_fin',  m_fin::text,   true);
  perform set_config('t.m_ilim', m_ilim::text,  true);
  perform set_config('t.m_zero', m_zero::text,  true);
  perform set_config('t.m_exp',  m_exp::text,   true);
  perform set_config('t.m_full', m_full::text,  true);
  perform set_config('t.c_fin',  c_fin::text,   true);
  perform set_config('t.c_ilim', c_ilim::text,  true);
  perform set_config('t.c_zero', c_zero::text,  true);
  perform set_config('t.c_exp',  c_exp::text,   true);
  perform set_config('t.c_full', c_full::text,  true);
  perform set_config('t.s_open', s_open::text,  true);
  perform set_config('t.s_full', s_full::text,  true);
end $$;

-- Helper to act as a member: set the jwt sub + authenticated role.
-- (Inlined per block below — set_config('request.jwt.claims', …) + set local role authenticated.)

-- ════════════════════════════════════════════════════════════════════════════════
-- consume-once (finite) + duplicate (re-book follows in its own block below)
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  c_fin  uuid := current_setting('t.c_fin', true)::uuid;
  v_ret  int; v_clases int; v_res uuid; v_n int; v_consumio boolean; raised boolean;
begin
  -- book: 5 → 4, one 'reservada' row, RPC returns the new balance
  select reservation_id, clases_restantes into v_res, v_ret from public.reservar_clase(s_open);
  if v_res is null then raise exception 'RULE FAIL(consume): no reservation returned'; end if;
  if v_ret <> 4 then raise exception 'RULE FAIL(consume): RPC returned clases %, expected 4', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 4 then raise exception 'RULE FAIL(consume): stored clases %, expected 4', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = c_fin and class_session_id = s_open and status = 'reservada';
  if v_n <> 1 then raise exception 'RULE FAIL(consume): expected 1 reservada row, got %', v_n; end if;
  -- The fresh INSERT stamps gym_id from the SESSION (never a client parameter) — assert the stamp (#80 AC4).
  perform 1 from public.reservation
    where id = v_res and gym_id = current_setting('t.gym', true)::uuid;
  if not found then raise exception 'RULE FAIL(consume): reservation.gym_id not stamped with the session gym'; end if;
  -- C12: a finite booking that decremented records consumio = true on its reservation row
  select consumio into v_consumio from public.reservation where member_id = c_fin and class_session_id = s_open;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(consume): reservation.consumio % (expected true)', v_consumio; end if;

  -- duplicate: booking the same active session again raises; balance stays 4 (no second consume)
  raised := false;
  begin perform public.reservar_clase(s_open); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(dup): second book of the same session did not raise'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 4 then raise exception 'RULE FAIL(dup): balance moved to % on rejected duplicate', v_clases; end if;
end $$;
reset role;

-- Flip the finite member's row to cancelada AS THE PRIVILEGED (migration) role — a member holds no
-- direct reservation write (reservation_rls_denial.sql proves it); the member-facing cancel RPC proper
-- is #58's scope. This stands in for it to exercise the re-book-reuses-the-row path.
--
-- is_walk_in + checked_at are left DIRTY here so the reuse arm's reset has real state to clear (#80 AC4):
-- a reused row that kept is_walk_in = true would take pasar_lista_sesion's untoggle walk-in arm
-- (cancel + REFUND) instead of the booked arm (reservada, no refund) — money drift the old count-only
-- assertion could not see.
update public.reservation r
   set status = 'cancelada', cancelled_at = now(), is_walk_in = true, checked_at = now()
  from public.clientes c
 where r.member_id = c.id and c.nombre = 'RC finite'
   and r.class_session_id = current_setting('t.s_open', true)::uuid;

-- ── re-book reuses the row: same (member, session) row reactivated, one more consume (4 → 3) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  c_fin  uuid := current_setting('t.c_fin', true)::uuid;
  v_ret  int; v_res uuid; v_n int; v_clases int; r record;
begin
  select reservation_id, clases_restantes into v_res, v_ret from public.reservar_clase(s_open);
  if v_ret <> 3 then raise exception 'RULE FAIL(rebook): expected clases 3 after re-book, got %', v_ret; end if;
  select count(*) into v_n from public.reservation where member_id = c_fin and class_session_id = s_open;
  if v_n <> 1 then raise exception 'RULE FAIL(rebook): expected 1 row total (reused), got %', v_n; end if;

  -- The reuse arm writes FOUR columns (status, is_walk_in, cancelled_at, checked_at). Read the row back
  -- and assert each — a count-with-filter proves which row, never what it holds (#80 AC4).
  select status, is_walk_in, cancelled_at, checked_at into r
    from public.reservation where member_id = c_fin and class_session_id = s_open;
  if r.status       is distinct from 'reservada' then raise exception 'RULE FAIL(rebook): reused row status = %', r.status; end if;
  if r.is_walk_in   is distinct from false       then raise exception 'RULE FAIL(rebook): stale is_walk_in survived the reuse (%) — untoggle would refund a booked class', r.is_walk_in; end if;
  if r.cancelled_at is not null                  then raise exception 'RULE FAIL(rebook): cancelled_at not cleared (%)', r.cancelled_at; end if;
  if r.checked_at   is not null                  then raise exception 'RULE FAIL(rebook): checked_at not cleared (%)', r.checked_at; end if;

  -- The consume is a WRITE to clientes; the RPC's return value is not proof it persisted.
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 3 then raise exception 'RULE FAIL(rebook): stored clases % after re-book, expected 3', v_clases; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- ilimitado NEVER decrements
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_ilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  c_ilim uuid := current_setting('t.c_ilim', true)::uuid;
  v_ret int; v_clases int; v_res uuid; v_consumio boolean;
begin
  select reservation_id, clases_restantes into v_res, v_ret from public.reservar_clase(s_open);
  if v_res is null then raise exception 'RULE FAIL(ilim): no reservation returned'; end if;
  if v_ret is not null then raise exception 'RULE FAIL(ilim): RPC returned clases % (expected NULL)', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = c_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(ilim): stored clases % (expected NULL, never decremented)', v_clases; end if;
  -- C12: an ilimitado booking consumes nothing, so its reservation row records consumio = false — this is
  -- what makes a later cancel refund nothing (no phantom class) even if the plan flips to finite.
  select consumio into v_consumio from public.reservation where member_id = c_ilim and class_session_id = s_open;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(ilim): reservation.consumio % (expected false)', v_consumio; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- zero-balance block (finite) — atomic: no row, no decrement
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_zero', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  c_zero uuid := current_setting('t.c_zero', true)::uuid;
  v_clases int; v_n int; raised boolean;
begin
  raised := false;
  begin perform public.reservar_clase(s_open); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(zero): zero-balance booking did not raise'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_zero;
  if v_clases <> 0 then raise exception 'RULE FAIL(zero): balance moved to %', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = c_zero and class_session_id = s_open;
  if v_n <> 0 then raise exception 'RULE FAIL(zero): % reservation rows created on a rejected booking', v_n; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- expired block (finite, vence in the past) — atomic
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_exp', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  c_exp  uuid := current_setting('t.c_exp', true)::uuid;
  v_clases int; v_n int; raised boolean;
begin
  raised := false;
  begin perform public.reservar_clase(s_open); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(exp): expired booking did not raise'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_exp;
  if v_clases <> 5 then raise exception 'RULE FAIL(exp): balance moved to % on expired reject', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = c_exp and class_session_id = s_open;
  if v_n <> 0 then raise exception 'RULE FAIL(exp): % rows created on expired reject', v_n; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- full block — capacity vs derived active count; atomic (no decrement)
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_full', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_full uuid := current_setting('t.s_full', true)::uuid;
  c_full uuid := current_setting('t.c_full', true)::uuid;
  v_clases int; v_n int; raised boolean;
begin
  raised := false;
  begin perform public.reservar_clase(s_full); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(full): booking a full session did not raise'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_full;
  if v_clases <> 5 then raise exception 'RULE FAIL(full): balance moved to % on full reject', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = c_full and class_session_id = s_full;
  if v_n <> 0 then raise exception 'RULE FAIL(full): % rows created on full reject', v_n; end if;
end $$;
reset role;

select 'reservar_clase rules: OK' as result;
rollback;
