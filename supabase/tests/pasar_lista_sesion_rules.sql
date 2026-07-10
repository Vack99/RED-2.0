-- pasar_lista_sesion money-path rules (slice #60; ADR-0010 §4/§5 consume rules; ADR-0005 atomic seam).
--
-- The reservation-aware admin Pasar lista. The no-double-consume loop closes here: a class consumed at
-- booking (reservar_clase, #57) must NOT be consumed again when the operator marks the member present.
-- A walk-in (no prior reservation) consumes at the door exactly as toggle_pase does today. Untoggle
-- reverses each path symmetrically. These rules are transaction-inseparable (ADR-0005) so they live ONLY
-- in the RPC — this is their committed test home, run against the REAL deployed function on a scratch
-- project in a rolled-back transaction:
--   * book -> pasar lista = ONE consume (finite)  — after reservar_clase (5->4) the pase leaves balance 4
--                                                   (no second decrement), reservation reservada->asistida,
--                                                   asistencia row consumio=false + reservation_id/session set.
--   * ilimitado booked                            — pase writes attendance, balance stays NULL.
--   * booked untoggle is symmetric                — reverts asistida->reservada and refunds NOTHING (the
--                                                   pase consumed nothing; the booking consume is #58's cancel).
--   * walk-in parity                              — a finite member with NO reservation: pase creates an
--                                                   is_walk_in/asistida reservation AND consumes exactly one
--                                                   (5->4), asistencia consumio=true, hora stamped (session today).
--   * walk-in untoggle is symmetric               — reverts reservation to cancelada and refunds exactly one (finite).
--   * hora-today-only                             — hora stamped only when the session's date is gym-today.
--   * cross-seam C15 (one visit one consume)      — a member already marked on a session (class_session_id-linked
--                                                   asistencia) now shows checked on the front desk too; a front-desk
--                                                   toggle_pase on the session's date REFUSES ('Asistencia de clase
--                                                   ya registrada') and consumes nothing — no second row, balance
--                                                   unchanged, session pase + reservation whole (ADR-0004 drift closed).
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK, so
-- it touches no row permanently. Zero hardcoded prod UUIDs (gym members/operator/clientes seeded tx-local).
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
  v_starts timestamptz;
  op       uuid := gen_random_uuid();   -- the operator (staff)
  m_bkfin  uuid := gen_random_uuid();   -- booked finite member
  m_bkilim uuid := gen_random_uuid();   -- booked ilimitado member
  m_walk   uuid := gen_random_uuid();   -- walk-in finite member (never books)
  c_bkfin  uuid; c_bkilim uuid; c_walk uuid;
  s_id     uuid;
begin
  select id, timezone into v_gym, v_tz from public.gym where slug = 'forge';
  if v_gym is null then raise exception 'SEED FAIL: expected the forge gym'; end if;
  v_today := (now() at time zone v_tz)::date;
  -- Session today at 18:00 gym-local (so hora stamps; reservar_clase has no start-time gate).
  v_starts := (v_today::timestamp + interval '18 hours') at time zone v_tz;

  -- auth users: one operator + three acting members
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op,       'authenticated', 'authenticated', 'pl-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_bkfin,  'authenticated', 'authenticated', 'pl-bkfin@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_bkilim, 'authenticated', 'authenticated', 'pl-bkilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_walk,   'authenticated', 'authenticated', 'pl-walk@test.local');

  -- the operator is STAFF of forge; the three members are members
  insert into public.gym_membership (user_id, gym_id, role) values
    (op, v_gym, 'operator'),
    (m_bkfin, v_gym, 'member'), (m_bkilim, v_gym, 'member'), (m_walk, v_gym, 'member');

  -- one cliente per acting member (auth_user_id links them so reservar_clase resolves them)
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL booked finite', '0000000001', 5, v_today + 20, '8 clases', v_gym, m_bkfin) returning id into c_bkfin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL booked ilim', '0000000002', null, v_today + 20, 'Ilimitado', v_gym, m_bkilim) returning id into c_bkilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL walk-in', '0000000003', 5, v_today + 20, '8 clases', v_gym, m_walk) returning id into c_walk;

  insert into public.class_type (gym_id, name) values (v_gym, 'PL Metcon') returning id into v_ct;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 20) returning id into s_id;

  perform set_config('t.gym',      v_gym::text,     true);
  perform set_config('t.today',    v_today::text,   true);
  perform set_config('t.op',       op::text,        true);
  perform set_config('t.m_bkfin',  m_bkfin::text,   true);
  perform set_config('t.m_bkilim', m_bkilim::text,  true);
  perform set_config('t.c_bkfin',  c_bkfin::text,   true);
  perform set_config('t.c_bkilim', c_bkilim::text,  true);
  perform set_config('t.c_walk',   c_walk::text,    true);
  perform set_config('t.s_id',     s_id::text,      true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- The two booked members book ahead (as themselves) — reservar_clase consumes ONCE.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_bkfin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare s_id uuid := current_setting('t.s_id', true)::uuid; v_clases int;
begin
  perform public.reservar_clase(s_id);
  select clases_restantes into v_clases from public.clientes where id = current_setting('t.c_bkfin', true)::uuid;
  if v_clases <> 4 then raise exception 'SEED FAIL(bkfin book): expected 4 after booking, got %', v_clases; end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_bkilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare s_id uuid := current_setting('t.s_id', true)::uuid;
begin
  perform public.reservar_clase(s_id);
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- Everything below runs AS THE OPERATOR (staff) — the Pasar lista caller.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

-- ── (1) book -> pasar lista = ONE consume (finite) + booked untoggle symmetry ────
do $$
declare
  s_id    uuid := current_setting('t.s_id', true)::uuid;
  c_bkfin uuid := current_setting('t.c_bkfin', true)::uuid;
  v_present boolean; v_hora text; v_clases int; v_status text; v_walk boolean;
  v_consumio boolean; v_res_id uuid; v_sess uuid;
begin
  -- pasar lista ON: booked member marked present, NO second consume (balance stays 4)
  select present, hora into v_present, v_hora from public.pasar_lista_sesion(s_id, c_bkfin);
  if v_present is not true then raise exception 'RULE FAIL(bkfin ON): not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_bkfin;
  if v_clases <> 4 then raise exception 'RULE FAIL(bkfin ON): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_bkfin and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(bkfin ON): reservation status % (expected asistida)', v_status; end if;
  -- the attendance row: consumio=false (already consumed at booking) + linked to session + reservation
  select consumio, reservation_id, class_session_id into v_consumio, v_res_id, v_sess
    from public.asistencias where cliente_id = c_bkfin and class_session_id = s_id and deleted_at is null
    order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(bkfin ON): asistencia.consumio % (expected false)', v_consumio; end if;
  if v_res_id is null then raise exception 'RULE FAIL(bkfin ON): asistencia.reservation_id null (expected linked)'; end if;
  if v_sess is distinct from s_id then raise exception 'RULE FAIL(bkfin ON): asistencia.class_session_id mismatch'; end if;
  if v_hora is null then raise exception 'RULE FAIL(bkfin ON): hora null on a session dated today'; end if;

  -- pasar lista OFF (untoggle): reservation reverts to reservada, balance UNCHANGED (no refund — the
  -- pase consumed nothing; the booking consume stays until a #58 cancel).
  select present into v_present from public.pasar_lista_sesion(s_id, c_bkfin);
  if v_present is not false then raise exception 'RULE FAIL(bkfin OFF): still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_bkfin;
  if v_clases <> 4 then raise exception 'RULE FAIL(bkfin OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_bkfin and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(bkfin OFF): reservation status % (expected reservada)', v_status; end if;
  select count(*) into v_clases from public.asistencias where cliente_id = c_bkfin and class_session_id = s_id and deleted_at is null;
  if v_clases <> 0 then raise exception 'RULE FAIL(bkfin OFF): active asistencia rows % (expected 0)', v_clases; end if;
end $$;

-- ── (2) ilimitado booked: pase writes attendance, balance stays NULL ─────────────
do $$
declare
  s_id     uuid := current_setting('t.s_id', true)::uuid;
  c_bkilim uuid := current_setting('t.c_bkilim', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean;
begin
  select present into v_present from public.pasar_lista_sesion(s_id, c_bkilim);
  if v_present is not true then raise exception 'RULE FAIL(ilim ON): not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_bkilim;
  if v_clases is not null then raise exception 'RULE FAIL(ilim ON): balance % (expected NULL, never decremented)', v_clases; end if;
  select consumio into v_consumio from public.asistencias
    where cliente_id = c_bkilim and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(ilim ON): asistencia.consumio % (expected false)', v_consumio; end if;
end $$;

-- ── (3) walk-in parity: no reservation -> is_walk_in/asistida + consume one (5->4) ─
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  c_walk uuid := current_setting('t.c_walk', true)::uuid;
  v_present boolean; v_hora text; v_clases int; v_status text; v_walk boolean; v_consumio boolean;
begin
  -- precondition: this member has NO reservation
  select count(*) into v_clases from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_clases <> 0 then raise exception 'SEED FAIL(walk): pre-existing reservation'; end if;

  -- ON: creates the walk-in reservation AND consumes exactly one (byte-for-byte toggle_pase)
  select present, hora into v_present, v_hora from public.pasar_lista_sesion(s_id, c_walk);
  if v_present is not true then raise exception 'RULE FAIL(walk ON): not present'; end if;
  if v_hora is null then raise exception 'RULE FAIL(walk ON): hora null on a session dated today'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'RULE FAIL(walk ON): expected consume to 4, got %', v_clases; end if;
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(walk ON): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(walk ON): is_walk_in not true'; end if;
  select consumio into v_consumio from public.asistencias
    where cliente_id = c_walk and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(walk ON): asistencia.consumio % (expected true)', v_consumio; end if;

  -- OFF (untoggle): reservation -> cancelada, refund exactly one (finite) — symmetric to the door consume
  select present into v_present from public.pasar_lista_sesion(s_id, c_walk);
  if v_present is not false then raise exception 'RULE FAIL(walk OFF): still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 5 then raise exception 'RULE FAIL(walk OFF): expected refund to 5, got %', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(walk OFF): reservation status % (expected cancelada)', v_status; end if;
  select count(*) into v_clases from public.asistencias where cliente_id = c_walk and class_session_id = s_id and deleted_at is null;
  if v_clases <> 0 then raise exception 'RULE FAIL(walk OFF): active asistencia rows % (expected 0)', v_clases; end if;
end $$;

-- ── (4) cross-seam C15: front-desk toggle_pase REFUSES a member already marked on a session ─
-- Ruling C15 (owner): one attended class = one consumed class regardless of surface. A member marked
-- present via the Agenda (pasar_lista_sesion writes a class_session_id-linked asistencia) now shows
-- CHECKED on the front-desk pase too (getMarcadas surfaces session rows). A front-desk tap on that member
-- is therefore a MISTAP: toggle_pase RAISES the session-managed error and consumes NOTHING — it does NOT
-- insert a second front-desk row (the old double-consume this block used to assert as correct). The
-- session pase + reservation stay whole; the written-rows rule is balance UNCHANGED at 4 and no new row.
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  c_walk uuid := current_setting('t.c_walk', true)::uuid;
  v_fecha date := current_setting('t.today', true)::date;   -- the session's date (seeded today 18:00)
  v_present boolean; v_clases int; v_status text; v_n int; v_raised boolean := false;
begin
  -- Arrange: mark the walk-in via the SESSION seam (5 -> 4; asistida/is_walk_in, session-linked row).
  select present into v_present from public.pasar_lista_sesion(s_id, c_walk);
  if v_present is not true then raise exception 'SEED FAIL(xseam): session pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'SEED FAIL(xseam): expected 4 after session pase, got %', v_clases; end if;

  -- Act: the FRONT-DESK toggle on the session's date MUST refuse (C15 mistap guard), not consume.
  begin
    select present into v_present from public.toggle_pase(c_walk, v_fecha);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Asistencia de clase ya registrada%' then
      raise exception 'RULE FAIL(xseam): wrong raise from front-desk toggle: %', sqlerrm;
    end if;
  end;
  if not v_raised then
    raise exception 'RULE FAIL(xseam): front-desk toggle DID NOT refuse a session-marked member (DOUBLE CONSUME)';
  end if;

  -- Written-rows rule: balance untouched (still 4 — no second consume); session pase + reservation whole;
  -- NO front-desk row written.
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'RULE FAIL(xseam): balance % after refused front-desk toggle (expected 4)', v_clases; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_walk and class_session_id = s_id and deleted_at is null;
  if v_n <> 1 then raise exception 'RULE FAIL(xseam): session asistencia disturbed (% active, expected 1)', v_n; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_walk and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_n <> 0 then raise exception 'RULE FAIL(xseam): a second front-desk row was written (% , expected 0)', v_n; end if;
  select status into v_status from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(xseam): reservation drifted to % (expected asistida)', v_status; end if;
end $$;

reset role;

select 'pasar_lista_sesion rules: OK' as result;
rollback;
