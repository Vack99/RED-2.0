-- toggle_pase money-path rules (ADR-0005 atomic seam; ADR-0004 saldo; rulings C15 + C9).
--
-- toggle_pase is the front-desk (date-keyed) Pasar lista. Its write-rules live ONLY in the RPC — they are
-- inseparable from the atomic on/off transaction (no orphan TS twin) — so this self-asserting SQL suite is
-- their committed test home, run against the REAL deployed function on a scratch project in a rolled-back
-- transaction. The vectors:
--   * refund-iff-consumed-and-not-ilimitado — finite ON consumes one (5->4); OFF refunds exactly one
--                                             (4->5). Ilimitado (clases_restantes NULL) ON/OFF never touches
--                                             the NULL. The `v_active_consumio and v_clases is not null` guard.
--   * gym_id stamped from the cliente's gym  — the new asistencia is born tenant-scoped, never null (slice #20).
--   * no-negative-balance                    — a finite cliente at 0 marked present writes consumio=false and
--                                             does NOT decrement below zero (the guarded `> 0` decrement).
--   * hora-stamp-today-only                  — hora stamped only when p_fecha is the gym's today (server tz),
--                                             null for a back-entry.
--   * C9 vigencia (inclusive)                — a WALK-IN mark on an expired package (vence < p_fecha) raises
--                                             'Paquete vencido'; the vence day itself (vence = p_fecha) passes.
--   * C15 active-reservation no-consume      — a member holding a reservada booking on today's session is
--                                             marked present with consumio=false and NO decrement (the class
--                                             was paid at booking); toggle-OFF then refunds nothing.
--   * origen = 'libre' on every desk row     — #89: ACCESO LIBRE is a STATED visit kind, not the absence of a
--                                             class. Every row this seam writes carries it (and the schema's
--                                             asistencias_origen_kind_ck forbids pairing it with a session).
--   * delegation to pasar_lista_sesion       — #89: the 3-arg call (p_session_id set) is the desk marking a
--                                             member IN A CLASS, which is the same act as the Agenda roster.
--                                             It must produce the Agenda's written rows exactly — the
--                                             reservation flipped to asistida (which the 2-arg path never
--                                             touches), a SESSION-linked asistencia with origen='clase',
--                                             consumio=false, and NO class-less desk row — and the 3-arg undo
--                                             must revert the reservation to reservada.
--   * C9 THROUGH the delegation (#163)       — #89: because the desk's DEFAULT state is a class pill, the 3-arg
--                                             path is now the desk's ordinary path, so the vence gate had to
--                                             move to the ROOT (pasar_lista_sesion, 20260728121000) or an
--                                             expired member would be admitted and charged off a dead package.
--                                             Two arms, the same split the 2-arg path has always had: an
--                                             expired WALK-IN raises 'Paquete vencido' and writes nothing (no
--                                             asistencia, no reservation, balance untouched); an expired
--                                             member who HOLDS a reservada booking is still marked, consumio
--                                             =false — the booked branch is exempt, because that class was
--                                             already paid for and expiring afterwards must not strand them.
--                                             Asserted here rather than in pasar_lista_sesion_rules because
--                                             the delegation is a straight `return query select * from
--                                             pasar_lista_sesion(...)`: proving it through the desk proves the
--                                             Agenda path too, and it reuses this suite's expired seeds.
--
-- Per-gym & Contract-B clean (was quarantined pre-B for seeding the dropped user_id columns): a synthetic
-- gym, its operator (gym_membership), and all clientes are minted tx-local with gen_random_uuid(); zero
-- prod UUIDs, zero user_id references. Self-asserting: every check RAISEs on a mismatch; a clean run returns
-- one 'OK' row. BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into SUITE —
-- or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  v_gym    uuid := gen_random_uuid();
  v_tz     text := 'America/Mexico_City';
  v_today  date := (now() at time zone 'America/Mexico_City')::date;
  v_starts timestamptz := (v_today::timestamp + interval '18 hours') at time zone 'America/Mexico_City';
  op       uuid := gen_random_uuid();   -- the operator (staff) — the toggle_pase caller
  m_res    uuid := gen_random_uuid();   -- member who books a class (reservar_clase runs as them)
  c_finite uuid; c_ilim uuid; c_zero uuid; c_expired uuid; c_venceday uuid; c_res uuid;
  c_expres uuid;                        -- expired AND holding a reservada booking (#163 booked-exempt arm)
  v_ct     uuid; s_id uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (v_gym, 'toggle-pase-rules-suite-gym', 'Toggle Pase Rules Suite', v_tz, 'base');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op,    'authenticated', 'authenticated', 'tp-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_res, 'authenticated', 'authenticated', 'tp-res@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op, v_gym, 'operator'),
    (m_res, v_gym, 'member');

  -- CRM rows (no auth_user_id needed — the operator marks them); one linked member (c_res) who books.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP finite', '5550000001', 5, v_today + 20, '8 clases', v_gym) returning id into c_finite;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP ilimitado', '5550000002', null, v_today + 20, 'mes', v_gym) returning id into c_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP zero', '5550000003', 0, v_today + 20, '8 clases', v_gym) returning id into c_zero;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP expired', '5550000004', 5, v_today - 1, '8 clases', v_gym) returning id into c_expired;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP vence hoy', '5550000005', 5, v_today, '8 clases', v_gym) returning id into c_venceday;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('TP reservado', '5550000006', 5, v_today + 20, '8 clases', v_gym, m_res) returning id into c_res;
  -- Balance 4 = the class already consumed at booking (the state reservar_clase leaves behind).
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP expirado con reserva', '5550000007', 4, v_today - 1, '8 clases', v_gym) returning id into c_expres;

  insert into public.class_type (gym_id, name) values (v_gym, 'TP Metcon') returning id into v_ct;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 20) returning id into s_id;

  -- c_expres' booking is seeded DIRECTLY rather than through reservar_clase, which refuses an expired
  -- booker outright ('Paquete vencido', 20260706170000:173-175). The only way to be booked AND expired
  -- in real life is a package that lapses BETWEEN the booking and the class — exactly the state the
  -- booked-branch exemption exists for, and the one the walk-in gate must not swallow.
  insert into public.reservation (gym_id, class_session_id, member_id, status, is_walk_in)
    values (v_gym, s_id, c_expres, 'reservada', false);

  perform set_config('t.gym',       v_gym::text,      true);
  perform set_config('t.today',     v_today::text,    true);
  perform set_config('t.op',        op::text,         true);
  perform set_config('t.m_res',     m_res::text,      true);
  perform set_config('t.c_finite',  c_finite::text,   true);
  perform set_config('t.c_ilim',    c_ilim::text,     true);
  perform set_config('t.c_zero',    c_zero::text,     true);
  perform set_config('t.c_expired', c_expired::text,  true);
  perform set_config('t.c_venceday',c_venceday::text, true);
  perform set_config('t.c_res',     c_res::text,      true);
  perform set_config('t.c_expres',  c_expres::text,   true);
  perform set_config('t.s_id',      s_id::text,       true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- The reserved member books ahead (as themselves) — reservar_clase consumes ONCE (5->4).
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_res', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare s_id uuid := current_setting('t.s_id', true)::uuid; v_clases int;
begin
  perform public.reservar_clase(s_id);
  select clases_restantes into v_clases from public.clientes where id = current_setting('t.c_res', true)::uuid;
  if v_clases <> 4 then raise exception 'SEED FAIL(res book): expected 4 after booking, got %', v_clases; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- Everything below runs AS THE OPERATOR (staff) — the front-desk Pasar lista caller.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_gym      uuid := current_setting('t.gym', true)::uuid;
  v_today    date := current_setting('t.today', true)::date;
  v_back     date := current_setting('t.today', true)::date - 3;   -- a back-entry day, never gym-today
  c_finite   uuid := current_setting('t.c_finite', true)::uuid;
  c_ilim     uuid := current_setting('t.c_ilim', true)::uuid;
  c_zero     uuid := current_setting('t.c_zero', true)::uuid;
  c_expired  uuid := current_setting('t.c_expired', true)::uuid;
  c_venceday uuid := current_setting('t.c_venceday', true)::uuid;
  v_agym uuid; v_clases int; v_present boolean; v_hora text; v_stored time; v_raised boolean; v_origen text;
begin
  -- ── refund-iff-consumed-and-not-ilimitado + gym_id stamp + origen ───────────────
  select present into v_present from public.toggle_pase(c_finite, v_today);
  if v_present is not true then raise exception 'RULE FAIL(b): finite ON not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_finite;
  if v_clases <> 4 then raise exception 'RULE FAIL(b): finite ON expected 4, got %', v_clases; end if;
  select gym_id, origen into v_agym, v_origen from public.asistencias
   where cliente_id = c_finite and fecha = v_today and deleted_at is null order by created_at desc limit 1;
  if v_agym is distinct from v_gym then raise exception 'RULE FAIL(gym): asistencia.gym_id % expected %', v_agym, v_gym; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(origen): desk row origen % (expected libre — a STATED ACCESO LIBRE visit, #89)', v_origen; end if;

  select present into v_present from public.toggle_pase(c_finite, v_today);
  if v_present is not false then raise exception 'RULE FAIL(b): finite OFF not absent'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_finite;
  if v_clases <> 5 then raise exception 'RULE FAIL(b): finite OFF expected refund to 5, got %', v_clases; end if;

  select present into v_present from public.toggle_pase(c_ilim, v_today);
  if v_present is not true then raise exception 'RULE FAIL(b): ilimitado ON not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(b): ilimitado ON should stay null, got %', v_clases; end if;
  select present into v_present from public.toggle_pase(c_ilim, v_today);
  if v_present is not false then raise exception 'RULE FAIL(b): ilimitado OFF not absent'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(b): ilimitado OFF should stay null (no phantom refund), got %', v_clases; end if;

  -- ── no-negative-balance: a finite cliente at 0 marks present but never decrements below zero ──
  select present into v_present from public.toggle_pase(c_zero, v_today);
  if v_present is not true then raise exception 'RULE FAIL(neg): zero ON not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_zero;
  if v_clases <> 0 then raise exception 'RULE FAIL(neg): zero-balance ON drove clases to % (expected 0, never negative)', v_clases; end if;
  select consumio, origen into v_present, v_origen from public.asistencias
   where cliente_id = c_zero and fecha = v_today and deleted_at is null order by created_at desc limit 1;
  if v_present is distinct from false then raise exception 'RULE FAIL(neg): zero-balance row consumio % (expected false)', v_present; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(neg): zero-balance row origen % (expected libre)', v_origen; end if;
  -- toggle OFF must refund NOTHING (nothing was consumed) — balance stays 0.
  perform public.toggle_pase(c_zero, v_today);
  select clases_restantes into v_clases from public.clientes where id = c_zero;
  if v_clases <> 0 then raise exception 'RULE FAIL(neg): zero-balance OFF phantom-refunded to % (expected 0)', v_clases; end if;

  -- ── hora-stamp-today-only ───────────────────────────────────────────────────────
  select present, hora into v_present, v_hora from public.toggle_pase(c_finite, v_today);
  if v_hora is null then raise exception 'RULE FAIL(c): toggle ON today returned null hora'; end if;
  select hora into v_stored from public.asistencias
   where cliente_id = c_finite and fecha = v_today and deleted_at is null order by created_at desc limit 1;
  if v_stored is null then raise exception 'RULE FAIL(c): toggle ON today stored null hora'; end if;
  perform public.toggle_pase(c_finite, v_today);   -- OFF (cleanup so the back-entry row is fresh)

  select present, hora into v_present, v_hora from public.toggle_pase(c_finite, v_back);
  if v_present is not true then raise exception 'RULE FAIL(c): back-entry ON not present'; end if;
  if v_hora is not null then raise exception 'RULE FAIL(c): back-entry ON returned hora % (expected null)', v_hora; end if;
  select hora into v_stored from public.asistencias
   where cliente_id = c_finite and fecha = v_back and deleted_at is null order by created_at desc limit 1;
  if v_stored is not null then raise exception 'RULE FAIL(c): back-entry ON stored hora % (expected null)', v_stored; end if;

  -- ── C9 vigencia (inclusive): vence-day valid ON succeeds; expired raises 'Paquete vencido' ──
  -- vence = today: the vence day itself still passes (vence < p_fecha blocks; equality does not).
  select present into v_present from public.toggle_pase(c_venceday, v_today);
  if v_present is not true then raise exception 'RULE FAIL(vig): vence-day ON refused (expected valid)'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_venceday;
  if v_clases <> 4 then raise exception 'RULE FAIL(vig): vence-day ON expected consume to 4, got %', v_clases; end if;

  -- vence < today: expired — a walk-in mark must be refused, and nothing written.
  v_raised := false;
  begin
    perform public.toggle_pase(c_expired, v_today);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Paquete vencido%' then raise exception 'RULE FAIL(vig): wrong raise for expired: %', sqlerrm; end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(vig): expired package ON was NOT refused'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_expired;
  if v_clases <> 5 then raise exception 'RULE FAIL(vig): expired ON moved balance to % (expected untouched 5)', v_clases; end if;
  select count(*) into v_clases from public.asistencias where cliente_id = c_expired and deleted_at is null;
  if v_clases <> 0 then raise exception 'RULE FAIL(vig): expired ON wrote % attendance rows (expected 0)', v_clases; end if;
end $$;

-- ── C15 active-reservation no-consume: the booked member (reservada on today's session) ──────────
do $$
declare
  c_res uuid := current_setting('t.c_res', true)::uuid;
  v_today date := current_setting('t.today', true)::date;
  s_id uuid := current_setting('t.s_id', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_status text; v_origen text;
begin
  -- precondition: reservada booking + balance 4 (consumed at booking), no attendance yet.
  select status into v_status from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'SEED FAIL(res): expected reservada, got %', v_status; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'SEED FAIL(res): expected 4 pre-pase, got %', v_clases; end if;

  -- ON: front-desk mark of a booked member consumes NOTHING (paid at booking) — consumio=false, balance 4.
  select present into v_present from public.toggle_pase(c_res, v_today);
  if v_present is not true then raise exception 'RULE FAIL(res ON): not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(res ON): DOUBLE CONSUME — balance % (expected 4, class paid at booking)', v_clases; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_res and fecha = v_today and deleted_at is null and class_session_id is null
   order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(res ON): front-desk row consumio % (expected false)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(res ON): front-desk row origen % (expected libre)', v_origen; end if;
  -- the reservation is the front desk's non-business: it stays reservada (only pasar_lista_sesion flips it).
  select status into v_status from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(res ON): front desk touched the reservation (% )', v_status; end if;

  -- OFF: refunds NOTHING (the front-desk row consumed nothing) — balance stays 4.
  select present into v_present from public.toggle_pase(c_res, v_today);
  if v_present is not false then raise exception 'RULE FAIL(res OFF): still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(res OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
end $$;

-- ── DELEGATION (#89): the 3-arg call IS pasar_lista_sesion, not a second implementation ─────────
-- The desk marking a member in a class context and the Agenda roster marking them are the same act, so
-- toggle_pase(cliente, fecha, session) delegates wholesale rather than re-deriving the semantics — which
-- is precisely how the two surfaces drifted apart in the first place (the 2026-07-10 guards). The proof
-- is in the WRITTEN ROWS: the outcomes below are byte-for-byte pasar_lista_sesion's booked branch,
-- including the reservation flip the 2-arg desk path deliberately never performs (vector 'res ON' above
-- asserts it stays reservada). p_fecha is ignored on this path — the session's own date governs.
--
-- Continues from the vector above: c_res still holds its reservada booking at balance 4, and its
-- class-less desk row was toggled back off.
do $$
declare
  c_res   uuid := current_setting('t.c_res', true)::uuid;
  s_id    uuid := current_setting('t.s_id', true)::uuid;
  v_today date := current_setting('t.today', true)::date;
  v_gym   uuid := current_setting('t.gym', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text;
  v_res_id uuid; v_checked timestamptz; v_walk boolean; v_gym_id uuid; v_n int;
begin
  -- precondition: the booking is back to reservada and nothing was refunded.
  select status into v_status from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'SEED FAIL(deleg): expected reservada, got %', v_status; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'SEED FAIL(deleg): expected 4 pre-pase, got %', v_clases; end if;

  -- ON (3-arg): the booked branch of pasar_lista_sesion, reached through the desk.
  select present into v_present from public.toggle_pase(c_res, v_today, s_id);
  if v_present is not true then raise exception 'RULE FAIL(deleg ON): not present'; end if;

  -- The RESERVATION flipped — the written row the 2-arg desk path never touches.
  select status, checked_at, is_walk_in into v_status, v_checked, v_walk
    from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(deleg ON): reservation status % (expected asistida)', v_status; end if;
  if v_checked is null then raise exception 'RULE FAIL(deleg ON): reservation.checked_at not stamped'; end if;
  if v_walk is not false then raise exception 'RULE FAIL(deleg ON): a real booking was flagged is_walk_in'; end if;

  -- The attendance row is SESSION-linked, origen='clase', consumio=false, gym-stamped, reservation-linked.
  select consumio, origen, gym_id, reservation_id into v_consumio, v_origen, v_gym_id, v_res_id
    from public.asistencias where cliente_id = c_res and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(deleg ON): asistencia.consumio % (expected false — paid at booking)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(deleg ON): asistencia.origen % (expected clase)', v_origen; end if;
  if v_gym_id is distinct from v_gym then raise exception 'RULE FAIL(deleg ON): asistencia.gym_id % expected %', v_gym_id, v_gym; end if;
  if v_res_id is null then raise exception 'RULE FAIL(deleg ON): asistencia.reservation_id null (expected linked)'; end if;

  -- …and NO class-less desk row was written alongside it: one act, one row.
  select count(*) into v_n from public.asistencias
   where cliente_id = c_res and fecha = v_today and deleted_at is null and class_session_id is null;
  if v_n <> 0 then raise exception 'RULE FAIL(deleg ON): a class-less desk row was written too (% , expected 0)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(deleg ON): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;

  -- OFF (3-arg): the undo reverts the reservation to its held state and refunds nothing.
  select present into v_present from public.toggle_pase(c_res, v_today, s_id);
  if v_present is not false then raise exception 'RULE FAIL(deleg OFF): still present'; end if;
  select status, checked_at into v_status, v_checked
    from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(deleg OFF): reservation status % (expected reservada)', v_status; end if;
  if v_checked is not null then raise exception 'RULE FAIL(deleg OFF): checked_at not cleared on revert (%)', v_checked; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(deleg OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_res and class_session_id = s_id and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(deleg OFF): active session asistencia rows % (expected 0)', v_n; end if;
end $$;

-- ── C9 THROUGH THE DELEGATION (#89 closes #163): the class pill is vence-gated too ──────────────
-- Before #89 the vence gate lived only in toggle_pase's class-less path, and pasar_lista_sesion had none
-- (#163). The delegation made that asymmetry a live hole rather than a filed one: a class pill is the
-- desk's DEFAULT state, so the 3-arg call is the ordinary desk tap, and an ungated root would admit an
-- expired member and charge the class off a dead package — a REGRESSION on what the 2-arg path has always
-- done. The fix is at the root, so both surfaces share one rule; these two arms prove both halves of it
-- through the desk, which is also proof for the Agenda path (the delegation is a straight
-- `return query select * from public.pasar_lista_sesion(...)`).
do $$
declare
  c_expired uuid := current_setting('t.c_expired', true)::uuid;
  c_expres  uuid := current_setting('t.c_expres',  true)::uuid;
  s_id      uuid := current_setting('t.s_id',      true)::uuid;
  v_today   date := current_setting('t.today',     true)::date;
  v_gym     uuid := current_setting('t.gym',       true)::uuid;
  v_present boolean; v_raised boolean; v_clases int; v_n int;
  v_consumio boolean; v_origen text; v_status text; v_walk boolean; v_sess uuid; v_gym_id uuid;
begin
  -- ── (a) EXPIRED WALK-IN through the class pill: refused, and NOTHING survives ────
  v_raised := false;
  begin
    perform public.toggle_pase(c_expired, v_today, s_id);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Paquete vencido%' then
      raise exception 'RULE FAIL(vig deleg): wrong raise for an expired walk-in on the class path: %', sqlerrm;
    end if;
  end;
  if not v_raised then
    raise exception 'RULE FAIL(vig deleg): an EXPIRED member was admitted through the class pill (the #163 hole)';
  end if;
  -- Written rows: none. Not the asistencia, not the walk-in reservation the walk-in branch would have
  -- minted, and not the balance — the gate sits above every write in that branch.
  select clases_restantes into v_clases from public.clientes where id = c_expired;
  if v_clases <> 5 then raise exception 'RULE FAIL(vig deleg): expired ON moved balance to % (expected untouched 5)', v_clases; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_expired and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(vig deleg): expired ON wrote % attendance rows (expected 0)', v_n; end if;
  select count(*) into v_n from public.reservation where member_id = c_expired and class_session_id = s_id;
  if v_n <> 0 then raise exception 'RULE FAIL(vig deleg): expired ON minted % walk-in reservation(s) (expected 0)', v_n; end if;

  -- ── (b) EXPIRED but BOOKED: still marked, and still not charged ──────────────────
  -- The booked branch is exempt from the gate, exactly as it is in the 2-arg desk path: that class was
  -- paid for at booking, and a package lapsing between the booking and the class must not lock the
  -- member out of a class they already own.
  select status into v_status from public.reservation where member_id = c_expres and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'SEED FAIL(vig booked): expected reservada, got %', v_status; end if;

  select present into v_present from public.toggle_pase(c_expres, v_today, s_id);
  if v_present is not true then raise exception 'RULE FAIL(vig booked): an expired member with a BOOKING was refused'; end if;
  -- the reservation flipped, the attendance row is session-linked + stated 'clase' + unpaid…
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_expres and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(vig booked): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not false then raise exception 'RULE FAIL(vig booked): a real booking was flagged is_walk_in'; end if;
  select consumio, origen, class_session_id, gym_id into v_consumio, v_origen, v_sess, v_gym_id
    from public.asistencias where cliente_id = c_expres and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(vig booked): asistencia.consumio % (expected false — paid at booking)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(vig booked): asistencia.origen % (expected clase)', v_origen; end if;
  if v_sess is distinct from s_id then raise exception 'RULE FAIL(vig booked): asistencia.class_session_id mismatch'; end if;
  if v_gym_id is distinct from v_gym then raise exception 'RULE FAIL(vig booked): asistencia.gym_id % expected %', v_gym_id, v_gym; end if;
  -- …and the balance never moved (4 = the class consumed at booking, nothing since).
  select clases_restantes into v_clases from public.clientes where id = c_expres;
  if v_clases <> 4 then raise exception 'RULE FAIL(vig booked): balance % (expected an untouched 4)', v_clases; end if;
end $$;

reset role;

select 'toggle_pase rules: OK' as result;
rollback;
