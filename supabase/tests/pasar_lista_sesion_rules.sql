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
--   * cooldown, clase → libre (#89)               — a member marked in an Agenda class (consume 5->4) is then tapped
--                                                   at the FRONT DESK minutes later. No refusal any more: a SECOND
--                                                   row is written — a real ACCESO LIBRE visit, origen='libre' —
--                                                   with consumio=false, balance still 4, and the session row +
--                                                   reservation untouched. Desk undo refunds nothing.
--   * cooldown, libre → clase (#89)               — the reverse: a member checked in at the front desk (5->4) is then
--                                                   marked present in an Agenda class. The walk-in branch writes the
--                                                   attendance row (origen='clase') + walk-in reservation with
--                                                   consumio=false — present, NO second consume; untoggle refunds nothing.
--   * BEYOND the cooldown, libre → clase (#89)    — the same pair, but the front-desk row is backdated 20 minutes:
--                                                   the class mark CONSUMES (4->3, consumio=true). The cooldown is a
--                                                   15-minute window, not a per-day pardon.
--   * two DIFFERENT classes, same minute (#89)    — ruling R1, the market's unanimous rule: a recent CLASS row never
--                                                   pardons another class. Both marks consume (5->3), both rows
--                                                   origen='clase' consumio=true.
--   * the ORPHANED PARDON (#89, accepted edge)    — pinning behaviour we chose, not behaviour we want back: when the
--                                                   PARDONING class mark is undone, the pardoned libre row stays
--                                                   active and unpaid (consumio=false). The cooldown is deliberately
--                                                   one-directional — pairing heuristics were withdrawn by the owner —
--                                                   so this vector exists to make a future "fix" a conscious change
--                                                   rather than an accident, and to prove the operator's recovery
--                                                   path (untoggle + retoggle the libre row re-charges it).
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
  v_ct      uuid;
  v_starts  timestamptz;
  v_starts2 timestamptz;
  op       uuid := gen_random_uuid();   -- the operator (staff)
  m_bkfin  uuid := gen_random_uuid();   -- booked finite member
  m_bkilim uuid := gen_random_uuid();   -- booked ilimitado member
  m_walk   uuid := gen_random_uuid();   -- walk-in finite member (never books)
  m_fd     uuid := gen_random_uuid();   -- front-desk-then-Agenda member (cooldown, libre → clase)
  c_bkfin  uuid; c_bkilim uuid; c_walk uuid; c_fd uuid;
  c_beyond uuid;                        -- front-desk row backdated past the window (vector 6)
  c_dos    uuid;                        -- two different classes in one day (vector 7)
  c_orph   uuid;                        -- the pardoning class mark is undone (vector 8)
  s_id     uuid; s2_id uuid;
begin
  select id, timezone into v_gym, v_tz from public.gym where slug = 'forge';
  if v_gym is null then raise exception 'SEED FAIL: expected the forge gym'; end if;
  v_today := (now() at time zone v_tz)::date;
  -- Session today at 18:00 gym-local (so hora stamps; reservar_clase has no start-time gate).
  v_starts := (v_today::timestamp + interval '18 hours') at time zone v_tz;
  -- A SECOND class the same day — vector (7)'s R1 proof needs two distinct class instances.
  v_starts2 := (v_today::timestamp + interval '19 hours') at time zone v_tz;

  -- auth users: one operator + the four acting members that book or are looked up as members
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op,       'authenticated', 'authenticated', 'pl-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_bkfin,  'authenticated', 'authenticated', 'pl-bkfin@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_bkilim, 'authenticated', 'authenticated', 'pl-bkilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_walk,   'authenticated', 'authenticated', 'pl-walk@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_fd,     'authenticated', 'authenticated', 'pl-fd@test.local');

  -- the operator is STAFF of forge; the four members are members
  insert into public.gym_membership (user_id, gym_id, role) values
    (op, v_gym, 'operator'),
    (m_bkfin, v_gym, 'member'), (m_bkilim, v_gym, 'member'), (m_walk, v_gym, 'member'), (m_fd, v_gym, 'member');

  -- one cliente per acting member (auth_user_id links them so reservar_clase resolves them)
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL booked finite', '0000000001', 5, v_today + 20, '8 clases', v_gym, m_bkfin) returning id into c_bkfin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL booked ilim', '0000000002', null, v_today + 20, 'Ilimitado', v_gym, m_bkilim) returning id into c_bkilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL walk-in', '0000000003', 5, v_today + 20, '8 clases', v_gym, m_walk) returning id into c_walk;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL front-desk', '0000000004', 5, v_today + 20, '8 clases', v_gym, m_fd) returning id into c_fd;
  -- The two #89 members never book, so they need no auth user — the operator marks them.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL beyond window', '0000000005', 5, v_today + 20, '8 clases', v_gym) returning id into c_beyond;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL dos clases', '0000000006', 5, v_today + 20, '8 clases', v_gym) returning id into c_dos;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL pardon huerfano', '0000000007', 5, v_today + 20, '8 clases', v_gym) returning id into c_orph;

  insert into public.class_type (gym_id, name) values (v_gym, 'PL Metcon') returning id into v_ct;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 20) returning id into s_id;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts2, 60, 20) returning id into s2_id;

  perform set_config('t.gym',      v_gym::text,     true);
  perform set_config('t.today',    v_today::text,   true);
  perform set_config('t.op',       op::text,        true);
  perform set_config('t.m_bkfin',  m_bkfin::text,   true);
  perform set_config('t.m_bkilim', m_bkilim::text,  true);
  perform set_config('t.c_bkfin',  c_bkfin::text,   true);
  perform set_config('t.c_bkilim', c_bkilim::text,  true);
  perform set_config('t.c_walk',   c_walk::text,    true);
  perform set_config('t.c_fd',     c_fd::text,      true);
  perform set_config('t.c_beyond', c_beyond::text,  true);
  perform set_config('t.c_dos',    c_dos::text,     true);
  perform set_config('t.c_orph',   c_orph::text,    true);
  perform set_config('t.s_id',     s_id::text,      true);
  perform set_config('t.s2_id',    s2_id::text,     true);
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
  v_checked timestamptz; v_gym_id uuid; v_fecha date; v_stored_hora time;
begin
  -- pasar lista ON: booked member marked present, NO second consume (balance stays 4)
  select present, hora into v_present, v_hora from public.pasar_lista_sesion(s_id, c_bkfin);
  if v_present is not true then raise exception 'RULE FAIL(bkfin ON): not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_bkfin;
  if v_clases <> 4 then raise exception 'RULE FAIL(bkfin ON): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_bkfin and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(bkfin ON): reservation status % (expected asistida)', v_status; end if;
  -- checked_at is stamped on every asistida flip and cleared on every revert — a genuine state-transition
  -- column the suite proved only via `status` before #80 AC4.
  if v_checked is null then raise exception 'RULE FAIL(bkfin ON): reservation.checked_at not stamped'; end if;
  -- the attendance row: consumio=false (already consumed at booking) + linked to session + reservation
  select consumio, reservation_id, class_session_id, gym_id, fecha, hora into v_consumio, v_res_id, v_sess, v_gym_id, v_fecha, v_stored_hora
    from public.asistencias where cliente_id = c_bkfin and class_session_id = s_id and deleted_at is null
    order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(bkfin ON): asistencia.consumio % (expected false)', v_consumio; end if;
  if v_res_id is null then raise exception 'RULE FAIL(bkfin ON): asistencia.reservation_id null (expected linked)'; end if;
  if v_sess is distinct from s_id then raise exception 'RULE FAIL(bkfin ON): asistencia.class_session_id mismatch'; end if;
  if v_hora is null then raise exception 'RULE FAIL(bkfin ON): hora null on a session dated today'; end if;
  -- …and the STORED row, not just the RPC's return: hora/gym_id/fecha were written and never read back.
  if v_stored_hora is null then raise exception 'RULE FAIL(bkfin ON): stored asistencia.hora null though the RPC returned %', v_hora; end if;
  if v_gym_id is distinct from current_setting('t.gym', true)::uuid then raise exception 'RULE FAIL(bkfin ON): asistencia.gym_id % not the session gym', v_gym_id; end if;
  if v_fecha is distinct from current_setting('t.today', true)::date then raise exception 'RULE FAIL(bkfin ON): asistencia.fecha % (expected today in the gym tz)', v_fecha; end if;

  -- pasar lista OFF (untoggle): reservation reverts to reservada, balance UNCHANGED (no refund — the
  -- pase consumed nothing; the booking consume stays until a #58 cancel).
  select present into v_present from public.pasar_lista_sesion(s_id, c_bkfin);
  if v_present is not false then raise exception 'RULE FAIL(bkfin OFF): still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_bkfin;
  if v_clases <> 4 then raise exception 'RULE FAIL(bkfin OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_bkfin and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(bkfin OFF): reservation status % (expected reservada)', v_status; end if;
  if v_checked is not null then raise exception 'RULE FAIL(bkfin OFF): checked_at not cleared on revert (%)', v_checked; end if;
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

-- ── (4) COOLDOWN, clase → libre: the desk RECORDS the second visit and does not charge it ──
-- #89 replaces the C15 mistap RAISE this vector used to assert. A member marked present via the Agenda
-- (pasar_lista_sesion, 5 -> 4) is tapped at the FRONT DESK minutes later. The desk no longer refuses —
-- refusing was the defect: ACCESO LIBRE is a real visit kind and the operator is entitled to record it.
-- What must NOT happen is a second CHARGE, and that is the cooldown's job: an active row of the OTHER
-- kind on this fecha, created inside the 15-minute window, forces consumio=false.
--
-- The pair is inside the window BY CONSTRUCTION: the whole suite runs in one transaction, so now() and
-- every created_at default are the same frozen instant. Vector (6) below is the only way out of it.
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  c_walk uuid := current_setting('t.c_walk', true)::uuid;
  v_fecha date := current_setting('t.today', true)::date;   -- the session's date (seeded today 18:00)
  v_present boolean; v_clases int; v_status text; v_n int;
  v_consumio boolean; v_origen text; v_sess uuid; v_gym_id uuid;
begin
  -- Arrange: mark the walk-in via the SESSION seam (5 -> 4; asistida/is_walk_in, session-linked row).
  select present into v_present from public.pasar_lista_sesion(s_id, c_walk);
  if v_present is not true then raise exception 'SEED FAIL(cool clase→libre): session pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'SEED FAIL(cool clase→libre): expected 4 after session pase, got %', v_clases; end if;

  -- Act: the FRONT-DESK toggle on the session's date. Present — no raise, no refusal.
  select present into v_present from public.toggle_pase(c_walk, v_fecha);
  if v_present is not true then raise exception 'RULE FAIL(cool clase→libre): front-desk toggle did not mark present'; end if;

  -- Written rows: a SECOND row exists and it is a stated ACCESO LIBRE visit, consumio=false, gym-stamped.
  select consumio, origen, class_session_id, gym_id into v_consumio, v_origen, v_sess, v_gym_id
    from public.asistencias
   where cliente_id = c_walk and fecha = v_fecha and deleted_at is null and class_session_id is null
   order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(cool clase→libre): libre row consumio % (expected false — inside the cooldown)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(cool clase→libre): libre row origen % (expected libre)', v_origen; end if;
  if v_sess is not null then raise exception 'RULE FAIL(cool clase→libre): the desk row carries a class_session_id (%)', v_sess; end if;
  if v_gym_id is distinct from current_setting('t.gym', true)::uuid then raise exception 'RULE FAIL(cool clase→libre): libre row gym_id % not the session gym', v_gym_id; end if;
  -- …the balance did NOT move, and the session row + reservation are untouched (the desk owns only its own row).
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'RULE FAIL(cool clase→libre): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_walk and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(cool clase→libre): session row consumio % (expected true, it paid)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(cool clase→libre): session row origen % (expected clase)', v_origen; end if;
  select status into v_status from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(cool clase→libre): reservation drifted to % (expected asistida)', v_status; end if;

  -- Desk untoggle: the libre row consumed nothing, so it refunds nothing; the class mark stays whole.
  select present into v_present from public.toggle_pase(c_walk, v_fecha);
  if v_present is not false then raise exception 'RULE FAIL(cool clase→libre OFF): still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'RULE FAIL(cool clase→libre OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_walk and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_n <> 0 then raise exception 'RULE FAIL(cool clase→libre OFF): active libre rows % (expected 0)', v_n; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_walk and class_session_id = s_id and deleted_at is null;
  if v_n <> 1 then raise exception 'RULE FAIL(cool clase→libre OFF): session asistencia disturbed (% active, expected 1)', v_n; end if;
end $$;

-- ── (5) COOLDOWN, libre → clase: the Agenda mark records the class and does not re-charge it ──
-- The reverse of (4), and the reason the cooldown is the right shape: it is ORDER-INDEPENDENT. A member
-- checked in at the FRONT DESK (toggle_pase, 5 -> 4) is then marked present in an Agenda class minutes
-- later. The walk-in branch writes the attendance row (origen='clase') + walk-in reservation with
-- consumio=false — present, no SECOND consume. Same outcomes the deleted 20260710132000 mirror produced,
-- now reached by a window instead of a per-day existence test. Balance seeded so a wrongful decrement is
-- visible: the desk takes 5 -> 4; the Agenda mark must LEAVE it at 4 (a bug would drop it to 3).
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  c_fd   uuid := current_setting('t.c_fd', true)::uuid;
  v_fecha date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int; v_status text; v_walk boolean; v_consumio boolean; v_origen text; v_n int;
begin
  -- Arrange: a real consuming FRONT-DESK check-in today (5 -> 4; class-less row, origen='libre').
  select present into v_present from public.toggle_pase(c_fd, v_fecha);
  if v_present is not true then raise exception 'SEED FAIL(cool libre→clase): front-desk toggle ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fd;
  if v_clases <> 4 then raise exception 'SEED FAIL(cool libre→clase): expected 4 after front-desk consume, got %', v_clases; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_fd and fecha = v_fecha and deleted_at is null and class_session_id is null
   order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(cool libre→clase): desk row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'SEED FAIL(cool libre→clase): desk row origen % (expected libre)', v_origen; end if;

  -- Act: mark present in the Agenda class (walk-in branch — no prior reservation). Present, NO re-consume.
  select present into v_present from public.pasar_lista_sesion(s_id, c_fd);
  if v_present is not true then raise exception 'RULE FAIL(cool libre→clase ON): not present'; end if;
  -- Written-rows rule: balance UNCHANGED at 4 (no second decrement — the desk arrival already paid).
  select clases_restantes into v_clases from public.clientes where id = c_fd;
  if v_clases <> 4 then raise exception 'RULE FAIL(cool libre→clase ON): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;
  -- …and the session-linked attendance row was still written, origen='clase', with consumio=false.
  select consumio, origen into v_consumio, v_origen from public.asistencias
    where cliente_id = c_fd and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(cool libre→clase ON): asistencia.consumio % (expected false)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(cool libre→clase ON): asistencia.origen % (expected clase)', v_origen; end if;
  -- …and the walk-in reservation exists as asistida/is_walk_in (the mark is still recorded, just not charged).
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_fd and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(cool libre→clase ON): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(cool libre→clase ON): is_walk_in not true'; end if;

  -- Untoggle: consumio=false ⇒ NO credit-back (the Agenda mark charged nothing; the desk consume stays).
  select present into v_present from public.pasar_lista_sesion(s_id, c_fd);
  if v_present is not false then raise exception 'RULE FAIL(cool libre→clase OFF): still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fd;
  if v_clases <> 4 then raise exception 'RULE FAIL(cool libre→clase OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_fd and class_session_id = s_id;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(cool libre→clase OFF): reservation status % (expected cancelada)', v_status; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_fd and class_session_id = s_id and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(cool libre→clase OFF): active session asistencia rows % (expected 0)', v_n; end if;
end $$;

-- ── (6) BEYOND the cooldown: the same pair, 20 minutes apart, CONSUMES ──────────────────────
-- The cooldown is a 15-minute WINDOW, not a per-day pardon — which is exactly the distinction the
-- deleted 20260710132000 mirror could not make (it suppressed the consume for any same-day desk row,
-- however old). A member who checks in at the desk in the morning and attends a class in the evening
-- made TWO visits and spends TWO classes (R1).
--
-- Arrange the desk mark first (5 -> 4)…
do $$
declare
  c_beyond uuid := current_setting('t.c_beyond', true)::uuid;
  v_fecha  date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int;
begin
  select present into v_present from public.toggle_pase(c_beyond, v_fecha);
  if v_present is not true then raise exception 'SEED FAIL(beyond): front-desk toggle ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_beyond;
  if v_clases <> 4 then raise exception 'SEED FAIL(beyond): expected 4 after front-desk consume, got %', v_clases; end if;
end $$;

-- …then step OUT of the operator role and age that row past the window. Everything in this suite shares
-- one transaction, so now() is frozen and every created_at default lands on the same instant; backdating
-- is the ONLY way to observe the far side of the window, and no RPC can do it — hence the privileged UPDATE.
reset role;
update public.asistencias set created_at = created_at - interval '20 minutes'
 where cliente_id = current_setting('t.c_beyond', true)::uuid
   and class_session_id is null and deleted_at is null;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  s_id     uuid := current_setting('t.s_id', true)::uuid;
  c_beyond uuid := current_setting('t.c_beyond', true)::uuid;
  v_fecha  date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text; v_walk boolean;
begin
  -- Act: the Agenda mark now sees NO recent libre row → the walk-in branch consumes (4 -> 3).
  select present into v_present from public.pasar_lista_sesion(s_id, c_beyond);
  if v_present is not true then raise exception 'RULE FAIL(beyond ON): not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_beyond;
  if v_clases <> 3 then raise exception 'RULE FAIL(beyond ON): expected a real consume to 3, got % — the cooldown pardoned a visit 20 minutes old', v_clases; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
    where cliente_id = c_beyond and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(beyond ON): asistencia.consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(beyond ON): asistencia.origen % (expected clase)', v_origen; end if;
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_beyond and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(beyond ON): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(beyond ON): is_walk_in not true'; end if;
  -- The backdated desk row is still there, still charged — the two visits are two rows and two credits.
  select consumio, origen into v_consumio, v_origen from public.asistencias
    where cliente_id = c_beyond and fecha = v_fecha and deleted_at is null and class_session_id is null
    order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(beyond ON): the earlier desk row lost its consume (%)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(beyond ON): the earlier desk row origen % (expected libre)', v_origen; end if;
end $$;

-- ── (7) TWO DIFFERENT CLASSES in the same minute: both consume (the #89 headline) ───────────
-- Ruling R1 and the unanimous practice of ~20 competing products: the unit of entitlement is the CLASS
-- INSTANCE, never the day. No backdating here — the second mark lands well INSIDE the 15-minute window,
-- and it must consume anyway, because visita_reciente is asked about the OTHER kind: a recent CLASS row
-- can never pardon another class. A regression that keys the cooldown on the day instead of the kind
-- would leave the balance at 4 here and quietly give the second class away.
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  s2_id  uuid := current_setting('t.s2_id', true)::uuid;
  c_dos  uuid := current_setting('t.c_dos', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text; v_walk boolean; v_n int;
begin
  -- First class: walk-in consume 5 -> 4.
  select present into v_present from public.pasar_lista_sesion(s_id, c_dos);
  if v_present is not true then raise exception 'SEED FAIL(dos clases): first class pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_dos;
  if v_clases <> 4 then raise exception 'SEED FAIL(dos clases): expected 4 after the first class, got %', v_clases; end if;

  -- Second, DIFFERENT class, same transaction ⇒ same instant ⇒ deep inside the cooldown. Must consume.
  select present into v_present from public.pasar_lista_sesion(s2_id, c_dos);
  if v_present is not true then raise exception 'RULE FAIL(dos clases): second class pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_dos;
  if v_clases <> 3 then raise exception 'RULE FAIL(dos clases): FREE SECOND CLASS — balance % (expected 3: one class attended, one class spent)', v_clases; end if;

  -- Written rows: TWO active class rows, both stated 'clase', both charged; two asistida walk-in bookings.
  select count(*) into v_n from public.asistencias
   where cliente_id = c_dos and deleted_at is null and class_session_id is not null;
  if v_n <> 2 then raise exception 'RULE FAIL(dos clases): active class asistencias % (expected 2)', v_n; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_dos and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(dos clases): class-1 row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(dos clases): class-1 row origen % (expected clase)', v_origen; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_dos and class_session_id = s2_id and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(dos clases): class-2 row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(dos clases): class-2 row origen % (expected clase)', v_origen; end if;
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_dos and class_session_id = s2_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(dos clases): class-2 reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(dos clases): class-2 is_walk_in not true'; end if;
end $$;

-- ── (8) THE ORPHANED PARDON: undoing the PARDONING mark leaves the pardoned row unpaid ──────
-- An ACCEPTED edge (named in 20260728121000's header), pinned here so it stays a decision. The cooldown
-- is ONE-DIRECTIONAL by design: the pardon is decided at write time from what already exists and is never
-- revisited, because revisiting it means pairing heuristics — inferring which two rows are "the same
-- arrival" and keeping them linked — and the owner withdrew those explicitly.
--
-- So: Agenda mark consumes (5->4), the desk tap inside the window is pardoned (consumio=false), and then
-- the operator undoes THE AGENDA MARK. The refund fires, the class row is soft-deleted, the reservation
-- reverts — and the libre row is left active and unpaid. That is correct on its own terms (the member DID
-- walk in; recording it is exactly what #89 restored) and the operator recovers the charge with the two
-- taps they already know: untoggle the libre row and re-toggle it. With the pardoning sibling gone the
-- re-mark charges, which the tail of this vector proves.
do $$
declare
  s_id    uuid := current_setting('t.s_id', true)::uuid;
  c_orph  uuid := current_setting('t.c_orph', true)::uuid;
  v_fecha date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text; v_n int;
begin
  -- Step 1 — the AGENDA mark: walk-in consume 5 -> 4, class row charged.
  select present into v_present from public.pasar_lista_sesion(s_id, c_orph);
  if v_present is not true then raise exception 'SEED FAIL(huerfano 1): session pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 4 then raise exception 'SEED FAIL(huerfano 1): expected 4 after the class mark, got %', v_clases; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_orph and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(huerfano 1): class row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'SEED FAIL(huerfano 1): class row origen % (expected clase)', v_origen; end if;

  -- Step 2 — the DESK tap inside the window: recorded, pardoned, balance still 4.
  select present into v_present from public.toggle_pase(c_orph, v_fecha);
  if v_present is not true then raise exception 'SEED FAIL(huerfano 2): front-desk toggle ON failed'; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_orph and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'SEED FAIL(huerfano 2): libre row consumio % (expected false — pardoned)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'SEED FAIL(huerfano 2): libre row origen % (expected libre)', v_origen; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 4 then raise exception 'SEED FAIL(huerfano 2): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;

  -- Step 3 — undo THE AGENDA MARK (the row that paid). Refund 4 -> 5, class row soft-deleted, walk-in
  -- reservation cancelled… and the pardoned libre row survives untouched, active and unpaid.
  select present into v_present from public.pasar_lista_sesion(s_id, c_orph);
  if v_present is not false then raise exception 'RULE FAIL(huerfano 3): session pase OFF still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 5 then raise exception 'RULE FAIL(huerfano 3): expected the class refund to 5, got %', v_clases; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_orph and class_session_id = s_id and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(huerfano 3): active class asistencias % (expected 0 — soft-deleted)', v_n; end if;
  select status into v_status from public.reservation where member_id = c_orph and class_session_id = s_id;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(huerfano 3): reservation status % (expected cancelada)', v_status; end if;
  -- THE EDGE, asserted as the accepted outcome it is: the libre row is still there, still consumio=false.
  select count(*) into v_n from public.asistencias
   where cliente_id = c_orph and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_n <> 1 then raise exception 'RULE FAIL(huerfano 3): the recorded libre visit vanished (% active rows, expected 1)', v_n; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_orph and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(huerfano 3): orphaned libre row consumio % (expected false — the pardon is NOT revisited)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(huerfano 3): orphaned libre row origen % (expected libre)', v_origen; end if;

  -- Step 4 — the RECOVERY the accepted edge relies on: untoggle refunds nothing (it never charged)…
  select present into v_present from public.toggle_pase(c_orph, v_fecha);
  if v_present is not false then raise exception 'RULE FAIL(huerfano 4): front-desk toggle OFF still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 5 then raise exception 'RULE FAIL(huerfano 4): PHANTOM REFUND — balance % (expected 5)', v_clases; end if;

  -- …and the re-mark CHARGES, because the class row that pardoned it is gone (soft-deleted ⇒ invisible
  -- to visita_reciente, which filters on deleted_at is null). 5 -> 4, consumio=true.
  select present into v_present from public.toggle_pase(c_orph, v_fecha);
  if v_present is not true then raise exception 'RULE FAIL(huerfano 4): front-desk re-toggle ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 4 then raise exception 'RULE FAIL(huerfano 4): the re-mark did not charge — balance % (expected 4)', v_clases; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_orph and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(huerfano 4): re-marked libre row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(huerfano 4): re-marked libre row origen % (expected libre)', v_origen; end if;
end $$;

reset role;

select 'pasar_lista_sesion rules: OK' as result;
rollback;
