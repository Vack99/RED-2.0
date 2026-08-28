-- fijar_asistencia — the IDEMPOTENT set-state check-in (#293, spec #291, map #280).
--
-- The seam exists because supabase-js ≥2.102 auto-retries a POST on a network error and the two
-- TOGGLE check-ins answer a replay by UNDOING the check-in and refunding the class
-- (docs/mobile/CROSS-EXAM-RULINGS.md, ranked finding 1). So the thing this suite has to prove is not
-- "the RPC works" but "the RPC cannot be made to move twice", and every vector is written as a REPLAY:
-- the same call, with the same arguments, two or three times in a row, asserted against the WRITTEN
-- ROWS each time — asistencias (id, consumio, perdonada, origen, deleted_at, gym_id, fecha, hora,
-- class_session_id, reservation_id), clientes.clases_restantes, and reservation (status, is_walk_in,
-- checked_at, cancelled_at). The return value is asserted too, but only ever ALONGSIDE the rows: a
-- return that agrees with a ledger that moved twice is worth nothing.
--
-- VECTORS
--   ACCESO LIBRE (no class context)
--     1) first check-in writes ONE row (origen='libre', class_session_id null, consumio=true,
--        perdonada=false, deleted_at null, gym_id = the cliente's gym) and charges 5→4; the return is
--        (true, HH:MM, null, 4, 'descontada').
--     2) IDEMPOTENCY: the identical call twice more writes NOTHING — same asistencias row id, still
--        exactly one row in total (no appended row, no soft-delete), balance still 4 (exactly ONE
--        movement), and a byte-identical return each time.
--     3) UN-CHECK-IN restores the balance EXACTLY ONCE: presente=false soft-deletes the row and
--        refunds 4→5; the identical call twice more leaves deleted_at UNCHANGED (the same timestamp,
--        not a fresh one), the balance at 5, and the row count at 1.
--     4) the seam is not stuck: after the un-check-in a fresh presente=true writes a SECOND row and
--        charges again (5→4) — idempotency is "converge on the stated state", not "write once ever".
--    12) UN-CHECK-IN of a member who was never checked in writes nothing at all — not even a
--        soft-deleted row — and does not move the balance.
--   FORGIVENESS IS AN ARGUMENT, NOT A DERIVATION (the core of #293)
--     5a) p_perdonada=true is HONOURED although `visita_reciente` — the 15-minute cooldown the
--         toggles derive inline — is asserted FALSE for this member: the row is stamped
--         perdonada=true, consumio=false, resultado 'gratis', and the balance does not move. The
--         toggles would have charged here. This is what makes a replay safe: the decision travels
--         with the call instead of being recomputed against a clock that has moved on.
--     5b) the mirror: p_perdonada=false is HONOURED although `visita_reciente` is asserted TRUE (a
--         charged class row minutes earlier, same fecha). The visit CHARGES — the RPC never pardons
--         behind the caller's back either.
--     6) a pardoned check-in is idempotent on the same terms: replaying it writes nothing, keeps
--        perdonada=true, keeps resultado 'gratis' (re-derived from the STORED row, not re-decided),
--        and never moves the balance.
--    14) the gates the siblings own still bite, and a refusal writes NOTHING: #237 zero-balance
--        ('Sin clases disponibles') and C9 vigencia ('Paquete vencido'); and a STATED pardon admits
--        the same 0-balance member the gate just refused (that visit's sibling already paid), at
--        balance 0, stamped perdonada.
--   CLASS CONTEXT
--     7) WALK-IN: the check-in creates the walk-in reservation (asistida, is_walk_in=true) and the
--        attendance row (origen='clase', class_session_id, reservation_id linked, consumio=true),
--        charging 5→4. REPLAYED: no new row, no second charge, and `checked_at` is UNCHANGED — the
--        no-op arm writes nothing at all, not even an idempotent-looking re-stamp.
--     8) BOOKED: reservar_clase takes the hold (5→4); the check-in CAPTURES it — reservation
--        reservada→asistida, attendance consumio=false, balance still 4, resultado 'reserva'.
--        REPLAYED: still 'reserva' (the replay arm re-derives it from `is_walk_in=false`, which is
--        why the booked branch insists on that flag), no second row, checked_at unchanged. Then
--        UN-CHECK-IN reverts the booking to reservada with checked_at null and refunds NOTHING (the
--        hold is cancelar_reserva's to release, never this row's), and replaying that is a no-op too.
--     9) UN-CHECK-IN of a WALK-IN refunds exactly once (4→5) and drives the reservation terminal
--        (cancelada, cancelled_at set, checked_at null); replays leave all four facts untouched.
--    13) PAST-DAY BACKFILL keeps the session's own instant (#166): marking yesterday's 07:00 roster
--        today stamps fecha=yesterday and hora=07:00, NOT now() — and a p_fecha of TODAY passed
--        alongside the session is IGNORED, exactly as documented. The replay returns the same 07:00.
--    16) WALK-IN ON A CANCELLED BOOKING (slice 2 §D6, 20260828100000): a member books (the hold sets
--        reservation.consumio=true), cancels through cancelar_reserva (which refunds by READING that
--        flag and leaves it set), and is then checked in at the door. This seam's walk-in arm reuses
--        that terminal row and must CLEAR the flag — the charge for this visit is the asistencia it
--        inserts. Asserted on the written row, on which LEG of the derived charge count (spec D0)
--        carries it — the asistencia leg, dated the CLASS, never the reservation leg, dated a booking
--        the member cancelled — and REPLAYED, because a flag that flips back on the second call would
--        be the idempotency bug in a new column. Vector 8's capture is the counter-vector: a REAL
--        booking keeps consumio = true, which is the hold the capture settles.
--   TENANT SCOPING
--    10) cross-tenant denial, four ways: gym_b's operator cannot check in gym_a's cliente (libre) nor
--        against gym_a's session; gym_a's operator cannot reach gym_b's cliente through gym_a's own
--        session (the gym pin); and `anon` cannot EXECUTE the function at all. Every refusal is
--        asserted to have written ZERO rows and moved no balance.
--    11) the positive control: gym_b's operator checking in their OWN cliente writes a row stamped
--        gym_id = gym_b — so vector 10's emptiness is SCOPING, not "the RPC never works".
--   THE ARGUMENT CONTRACT
--    15) a NULL desired state, a NULL forgiveness decision, and a libre call with no fecha are all
--        REFUSED, writing nothing. `p_perdonada` has a false default, but an explicit NULL means "I
--        did not decide" — reading that as "do not forgive" is how a pardoned arrival silently
--        becomes a double charge, so it raises instead.
--
-- FROZEN CLOCK: the whole file is one transaction, so now() and every created_at default are the same
-- instant. That is what puts vector 5b's class row inside the 15-minute window by construction. The
-- booked session is created two days out, booked, and only then moved onto today — reservar_clase
-- refuses a class that has already started (#165), so seeding it at today 19:00 would fail every run
-- after 19:00 gym-local.
--
-- Self-asserting (RAISE on any mismatch), BEGIN/ROLLBACK, transaction-local fixtures via
-- gen_random_uuid, zero prod UUIDs, its own two gyms so the cross-tenant vectors are real.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into
-- SUITE — or, on the local docker stack, `docker cp` this file into the db container and run it with
-- psql -v ON_ERROR_STOP=1 (never piped through a shell: the Spanish literals mojibake).

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ──────────────────────────────────────
do $$
declare
  gym_a uuid := gen_random_uuid();
  gym_b uuid := gen_random_uuid();
  v_tz  text := 'America/Chihuahua';
  op_a  uuid := gen_random_uuid();
  op_b  uuid := gen_random_uuid();
  m_book uuid := gen_random_uuid();   -- books for themselves and is captured (vector 8)
  m_recy uuid := gen_random_uuid();   -- books, CANCELS, and is walked in (vector 16)
  v_today date;
  v_ct_a uuid; v_ct_b uuid;
  s_walk uuid; s_book uuid; s_ayer uuid; s_b uuid;
  s_recy uuid;                        -- vector 16's own class: its own instant, moved onto today
  v_ayer timestamptz;
  c_libre  uuid;  -- vectors 1-4
  c_virgin uuid;  -- vector 12
  c_pard   uuid;  -- vectors 5a, 6
  c_nopard uuid;  -- vector 5b
  c_walk   uuid;  -- vectors 7, 9
  c_book   uuid;  -- vector 8
  c_late   uuid;  -- vector 13
  c_zero   uuid;  -- vector 14a + 14c
  c_venc   uuid;  -- vector 14b
  c_victim uuid;  -- vector 10 (gym_a's cliente, attacked by gym_b's operator)
  c_b      uuid;  -- vectors 10c + 11 (gym_b's own cliente)
  c_recy   uuid;  -- vector 16
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'fa-gym-a', 'FA Gym A', v_tz, 'base'),
    (gym_b, 'fa-gym-b', 'FA Gym B', v_tz, 'base');

  v_today := (now() at time zone v_tz)::date;

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_a,   'authenticated', 'authenticated', 'fa-op-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_b,   'authenticated', 'authenticated', 'fa-op-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_book, 'authenticated', 'authenticated', 'fa-book@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_recy, 'authenticated', 'authenticated', 'fa-recy@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_b, gym_b, 'operator'),
    (m_book, gym_a, 'member'),
    (m_recy, gym_a, 'member');

  -- Every finite member starts at 5 with a comfortably valid package, so any balance that is not 5 in
  -- an assertion below is something this suite did on purpose.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA libre', '0000000001', 5, v_today + 20, '8 clases', gym_a) returning id into c_libre;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA nunca marcado', '0000000002', 5, v_today + 20, '8 clases', gym_a) returning id into c_virgin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA perdonado', '0000000003', 5, v_today + 20, '8 clases', gym_a) returning id into c_pard;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA sin perdon', '0000000004', 5, v_today + 20, '8 clases', gym_a) returning id into c_nopard;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA walk-in', '0000000005', 5, v_today + 20, '8 clases', gym_a) returning id into c_walk;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('FA reservado', '0000000006', 5, v_today + 20, '8 clases', gym_a, m_book) returning id into c_book;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA marcado tarde', '0000000007', 5, v_today + 20, '8 clases', gym_a) returning id into c_late;
  -- 0 classes left: the #237 gate refuses it, and a STATED pardon still admits it (vector 14).
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA cero balance', '0000000008', 0, v_today + 20, '8 clases', gym_a) returning id into c_zero;
  -- Expired YESTERDAY, so a check-in dated today is past the inclusive C9 gate.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA vencido', '0000000009', 5, v_today - 1, '8 clases', gym_a) returning id into c_venc;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA victima', '0000000010', 5, v_today + 20, '8 clases', gym_a) returning id into c_victim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('FA gym B', '0000000011', 5, v_today + 20, '8 clases', gym_b) returning id into c_b;
  -- Vector 16 books for themselves, so the auth user is linked (reservar_clase's member path resolves
  -- the cliente through it; the walk-in check-in that follows is the OPERATOR's call, as always).
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('FA reciclada', '0000000012', 5, v_today + 20, '8 clases', gym_a, m_recy) returning id into c_recy;

  insert into public.class_type (gym_id, name) values (gym_a, 'FA Metcon') returning id into v_ct_a;
  insert into public.class_type (gym_id, name) values (gym_b, 'FA Yoga')   returning id into v_ct_b;

  -- s_walk: today 18:00 gym-local. Nobody books it, so it is seeded straight onto its final instant.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct_a, (v_today::timestamp + interval '18 hours') at time zone v_tz, 60, 20)
    returning id into s_walk;
  -- s_book: two days out for now; booked below, then moved onto today 19:00 (see the header).
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct_a, now() + interval '2 days', 60, 20) returning id into s_book;
  -- s_ayer: YESTERDAY 07:00 gym-local — deliberately far from any plausible run time, so "the stamp is
  -- the session's own hour" cannot pass by coincidence with now().
  v_ayer := ((v_today - 1)::timestamp + interval '7 hours') at time zone v_tz;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct_a, v_ayer, 60, 20) returning id into s_ayer;
  -- s_b: gym_b's own session, for the cross-tenant vectors.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_b, v_ct_b, now() + interval '2 days', 60, 20) returning id into s_b;
  -- s_recy: vector 16's class. Booked AND cancelled while still two days out (both RPCs refuse a class
  -- that has started), then moved onto today 20:00 — its own instant, one class per instant per gym.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct_a, now() + interval '2 days' + interval '1 hour', 60, 20) returning id into s_recy;

  perform set_config('t.gym_a', gym_a::text, true);
  perform set_config('t.gym_b', gym_b::text, true);
  perform set_config('t.op_a', op_a::text, true);
  perform set_config('t.op_b', op_b::text, true);
  perform set_config('t.m_book', m_book::text, true);
  perform set_config('t.m_recy', m_recy::text, true);
  perform set_config('t.today', v_today::text, true);
  perform set_config('t.ayer', (v_today - 1)::text, true);
  perform set_config('t.starts_book', ((v_today::timestamp + interval '19 hours') at time zone v_tz)::text, true);
  perform set_config('t.starts_recy', ((v_today::timestamp + interval '20 hours') at time zone v_tz)::text, true);
  perform set_config('t.s_walk', s_walk::text, true);
  perform set_config('t.s_book', s_book::text, true);
  perform set_config('t.s_ayer', s_ayer::text, true);
  perform set_config('t.s_b', s_b::text, true);
  perform set_config('t.c_libre', c_libre::text, true);
  perform set_config('t.c_virgin', c_virgin::text, true);
  perform set_config('t.c_pard', c_pard::text, true);
  perform set_config('t.c_nopard', c_nopard::text, true);
  perform set_config('t.c_walk', c_walk::text, true);
  perform set_config('t.c_book', c_book::text, true);
  perform set_config('t.c_late', c_late::text, true);
  perform set_config('t.c_zero', c_zero::text, true);
  perform set_config('t.c_venc', c_venc::text, true);
  perform set_config('t.c_victim', c_victim::text, true);
  perform set_config('t.c_b', c_b::text, true);
  perform set_config('t.c_recy', c_recy::text, true);
  perform set_config('t.s_recy', s_recy::text, true);
end $$;

-- ── The booked member books ahead, as themselves — reservar_clase takes the hold (5→4) ────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_book', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_clases int;
begin
  perform public.reservar_clase(current_setting('t.s_book', true)::uuid);
  select clases_restantes into v_clases from public.clientes where id = current_setting('t.c_book', true)::uuid;
  if v_clases is distinct from 4 then
    raise exception 'SEED FAIL(book): expected 4 after booking, got %', v_clases;
  end if;
end $$;
reset role;

-- ── Vector 16's arrange: book, then CANCEL through the real RPC (still as the member) ─────────────
-- cancelar_reserva rather than a privileged flip on purpose: the premise of the vector is that the
-- refund path READS `consumio` and leaves it set, so the fixture has to be the function that does it.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_recy', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s      uuid := current_setting('t.s_recy', true)::uuid;
  c      uuid := current_setting('t.c_recy', true)::uuid;
  v_clases int; v_status text; v_consumio boolean;
begin
  perform public.reservar_clase(s);
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'SEED FAIL(v16 book): expected 4 after the hold, got %', v_clases; end if;

  perform public.cancelar_reserva(s);
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'SEED FAIL(v16 cancel): expected the hold refunded to 5, got %', v_clases; end if;
  select status, consumio into v_status, v_consumio from public.reservation where member_id = c and class_session_id = s;
  if v_status is distinct from 'cancelada' then raise exception 'SEED FAIL(v16 cancel): status % (expected cancelada)', v_status; end if;
  if v_consumio is distinct from true then
    raise exception 'SEED FAIL(v16 cancel): consumio % — cancelar_reserva now clears the flag, so vector 16 no longer tests anything', v_consumio;
  end if;
end $$;
reset role;

-- Move the booked sessions onto today, 19:00 and 20:00 (privileged — no RPC moves a class, and the
-- bookings had to land first; see the header). Every vector below reads them as today-dated classes.
update public.class_session set starts_at = current_setting('t.starts_book', true)::timestamptz
 where id = current_setting('t.s_book', true)::uuid;
update public.class_session set starts_at = current_setting('t.starts_recy', true)::timestamptz
 where id = current_setting('t.s_recy', true)::uuid;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Everything below runs AS GYM_A'S OPERATOR — the check-in caller.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;

-- ── (1)(2) ACCESO LIBRE: one check-in, then two replays that must write nothing ───────────────────
do $$
declare
  c      uuid := current_setting('t.c_libre', true)::uuid;
  hoy    date := current_setting('t.today', true)::date;
  gym_a  uuid := current_setting('t.gym_a', true)::uuid;
  r1 record; r2 record; r3 record;
  v_id uuid; v_id2 uuid; v_n int; v_clases int;
  v_consumio boolean; v_perdonada boolean; v_origen text; v_deleted timestamptz;
  v_gym uuid; v_fecha date; v_hora time; v_sess uuid; v_res uuid;
begin
  -- (1) the check-in itself
  select * into r1 from public.fijar_asistencia(c, true, null, hoy, false);
  if r1.present is not true then raise exception 'VECTOR 1 FAIL: present % (expected true)', r1.present; end if;
  if r1.session_id is not null then raise exception 'VECTOR 1 FAIL: session_id % (expected null — ACCESO LIBRE has no class)', r1.session_id; end if;
  if r1.resultado is distinct from 'descontada' then raise exception 'VECTOR 1 FAIL: resultado % (expected descontada)', r1.resultado; end if;
  if r1.clases_restantes is distinct from 4 then raise exception 'VECTOR 1 FAIL: returned balance % (expected 4)', r1.clases_restantes; end if;

  -- THE WRITTEN ROW — the actual contract, asserted field by field.
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 1 FAIL: % asistencias row(s) in total (expected exactly 1)', v_n; end if;
  select id, consumio, perdonada, origen, deleted_at, gym_id, fecha, hora, class_session_id, reservation_id
    into v_id, v_consumio, v_perdonada, v_origen, v_deleted, v_gym, v_fecha, v_hora, v_sess, v_res
    from public.asistencias where cliente_id = c;
  if v_consumio is distinct from true then raise exception 'VECTOR 1 FAIL: consumio % (expected true — a finite package is charged)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'VECTOR 1 FAIL: perdonada % (expected false — no pardon was stated)', v_perdonada; end if;
  if v_origen is distinct from 'libre' then raise exception 'VECTOR 1 FAIL: origen % (expected libre)', v_origen; end if;
  if v_deleted is not null then raise exception 'VECTOR 1 FAIL: deleted_at % (expected null — the row is active)', v_deleted; end if;
  if v_gym is distinct from gym_a then raise exception 'VECTOR 1 FAIL: gym_id % (expected the cliente''s gym %)', v_gym, gym_a; end if;
  if v_fecha is distinct from hoy then raise exception 'VECTOR 1 FAIL: fecha % (expected %)', v_fecha, hoy; end if;
  if v_hora is null then raise exception 'VECTOR 1 FAIL: hora is null (expected the wall clock — this check-in is dated today)'; end if;
  if v_sess is not null then raise exception 'VECTOR 1 FAIL: class_session_id % (expected null)', v_sess; end if;
  if v_res is not null then raise exception 'VECTOR 1 FAIL: reservation_id % (expected null — a libre visit settles no booking)', v_res; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 1 FAIL: stored balance % (expected 4)', v_clases; end if;

  -- (2) THE REPLAY. Identical arguments, twice. The toggles would soft-delete and refund here.
  select * into r2 from public.fijar_asistencia(c, true, null, hoy, false);
  select * into r3 from public.fijar_asistencia(c, true, null, hoy, false);

  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 2 FAIL: % asistencias row(s) after two replays (expected 1 — a replay must append nothing)', v_n; end if;
  select id, consumio, perdonada, deleted_at into v_id2, v_consumio, v_perdonada, v_deleted
    from public.asistencias where cliente_id = c;
  if v_id2 is distinct from v_id then raise exception 'VECTOR 2 FAIL: the row was replaced (% -> %)', v_id, v_id2; end if;
  if v_deleted is not null then raise exception 'VECTOR 2 FAIL: DESTRUCTIVE REPLAY — deleted_at % (the replay un-checked the member in)', v_deleted; end if;
  if v_consumio is distinct from true then raise exception 'VECTOR 2 FAIL: consumio % after replay (expected an untouched true)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'VECTOR 2 FAIL: perdonada % after replay (expected an untouched false)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 2 FAIL: balance % after two replays (expected 4 — EXACTLY ONE movement, no refund and no second charge)', v_clases; end if;

  -- The return is idempotent too, field for field.
  if (r2.present, r2.hora, r2.session_id, r2.clases_restantes, r2.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado) then
    raise exception 'VECTOR 2 FAIL: replay 1 returned (%, %, %, %, %) vs (%, %, %, %, %)',
      r2.present, r2.hora, r2.session_id, r2.clases_restantes, r2.resultado,
      r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado;
  end if;
  if (r3.present, r3.hora, r3.session_id, r3.clases_restantes, r3.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado) then
    raise exception 'VECTOR 2 FAIL: replay 2 returned (%, %, %, %, %) vs (%, %, %, %, %)',
      r3.present, r3.hora, r3.session_id, r3.clases_restantes, r3.resultado,
      r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado;
  end if;
end $$;

-- ── (3)(4) ACCESO LIBRE un-check-in: refund EXACTLY once, then re-check-in is not blocked ─────────
do $$
declare
  c   uuid := current_setting('t.c_libre', true)::uuid;
  hoy date := current_setting('t.today', true)::date;
  r1 record; r2 record; r3 record;
  v_n int; v_clases int; v_deleted timestamptz; v_deleted2 timestamptz; v_consumio boolean;
begin
  -- (3) the un-check-in
  select * into r1 from public.fijar_asistencia(c, false, null, hoy, false);
  if r1.present is not false then raise exception 'VECTOR 3 FAIL: present % (expected false)', r1.present; end if;
  if r1.hora is not null then raise exception 'VECTOR 3 FAIL: hora % (expected null on an un-mark)', r1.hora; end if;
  if r1.resultado is not null then raise exception 'VECTOR 3 FAIL: resultado % (expected null — an undo settles nothing)', r1.resultado; end if;
  if r1.clases_restantes is distinct from 5 then raise exception 'VECTOR 3 FAIL: returned balance % (expected the refunded 5)', r1.clases_restantes; end if;

  select count(*) into v_n from public.asistencias where cliente_id = c and deleted_at is null;
  if v_n is distinct from 0 then raise exception 'VECTOR 3 FAIL: % active row(s) after the un-check-in (expected 0)', v_n; end if;
  select deleted_at into v_deleted from public.asistencias where cliente_id = c;
  if v_deleted is null then raise exception 'VECTOR 3 FAIL: the row was not soft-deleted'; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'VECTOR 3 FAIL: stored balance % (expected the refunded 5)', v_clases; end if;

  -- THE REPLAY of the un-check-in. A second refund here is the same class of bug as a second charge.
  select * into r2 from public.fijar_asistencia(c, false, null, hoy, false);
  select * into r3 from public.fijar_asistencia(c, false, null, hoy, false);
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'VECTOR 3 FAIL: DOUBLE REFUND — balance % after two replayed un-check-ins (expected 5)', v_clases; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 3 FAIL: % asistencias row(s) after the replays (expected 1 — an un-check-in must never insert)', v_n; end if;
  select deleted_at into v_deleted2 from public.asistencias where cliente_id = c;
  if v_deleted2 is distinct from v_deleted then raise exception 'VECTOR 3 FAIL: deleted_at was re-stamped (% -> %) — the replay wrote to a row it should not have touched', v_deleted, v_deleted2; end if;
  if (r2.present, r2.hora, r2.session_id, r2.clases_restantes, r2.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado)
     or (r3.present, r3.hora, r3.session_id, r3.clases_restantes, r3.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado) then
    raise exception 'VECTOR 3 FAIL: the replayed un-check-ins did not return the original answer';
  end if;

  -- (4) the seam is not stuck: a fresh check-in writes a SECOND row and charges again.
  select * into r1 from public.fijar_asistencia(c, true, null, hoy, false);
  if r1.present is not true then raise exception 'VECTOR 4 FAIL: the re-check-in was refused'; end if;
  if r1.resultado is distinct from 'descontada' then raise exception 'VECTOR 4 FAIL: resultado % (expected descontada)', r1.resultado; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 2 then raise exception 'VECTOR 4 FAIL: % asistencias row(s) (expected 2 — one soft-deleted, one fresh)', v_n; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c and deleted_at is null;
  if v_n is distinct from 1 then raise exception 'VECTOR 4 FAIL: % active row(s) (expected exactly 1)', v_n; end if;
  select consumio into v_consumio from public.asistencias where cliente_id = c and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'VECTOR 4 FAIL: the fresh row consumio % (expected true)', v_consumio; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 4 FAIL: balance % (expected 4 — the re-check-in charges again)', v_clases; end if;
end $$;

-- ── (12) UN-CHECK-IN of a member who was never checked in writes nothing at all ───────────────────
do $$
declare
  c   uuid := current_setting('t.c_virgin', true)::uuid;
  hoy date := current_setting('t.today', true)::date;
  r record; v_n int; v_clases int;
begin
  select * into r from public.fijar_asistencia(c, false, null, hoy, false);
  if r.present is not false then raise exception 'VECTOR 12 FAIL: present % (expected false)', r.present; end if;
  if r.resultado is not null then raise exception 'VECTOR 12 FAIL: resultado % (expected null)', r.resultado; end if;
  if r.clases_restantes is distinct from 5 then raise exception 'VECTOR 12 FAIL: returned balance % (expected an untouched 5)', r.clases_restantes; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 0 then raise exception 'VECTOR 12 FAIL: % asistencias row(s) (expected 0 — not even a soft-deleted one)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'VECTOR 12 FAIL: stored balance % (expected an untouched 5)', v_clases; end if;
end $$;

-- ── (5a)(6) FORGIVENESS IS HONOURED WHERE THE COOLDOWN WOULD NOT PARDON, and it replays clean ────
do $$
declare
  c   uuid := current_setting('t.c_pard', true)::uuid;
  hoy date := current_setting('t.today', true)::date;
  r1 record; r2 record;
  v_n int; v_clases int; v_consumio boolean; v_perdonada boolean; v_id uuid; v_id2 uuid;
begin
  -- The premise: the derivation the TOGGLES would run says "no pardon" for this member (no sibling
  -- row of the other kind exists at all). Asserted, not assumed — it is what makes the vector mean
  -- something.
  if public.visita_reciente(c, hoy, true) then
    raise exception 'VECTOR 5a PREMISE FAIL: visita_reciente already true — the fixture cannot prove the pardon was the ARGUMENT''s doing';
  end if;

  select * into r1 from public.fijar_asistencia(c, true, null, hoy, true);
  if r1.present is not true then raise exception 'VECTOR 5a FAIL: the pardoned check-in was refused'; end if;
  if r1.resultado is distinct from 'gratis' then raise exception 'VECTOR 5a FAIL: resultado % (expected gratis — a stated pardon charges nothing)', r1.resultado; end if;
  if r1.clases_restantes is distinct from 5 then raise exception 'VECTOR 5a FAIL: returned balance % (expected an untouched 5)', r1.clases_restantes; end if;

  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 5a FAIL: % asistencias row(s) (expected 1)', v_n; end if;
  select id, consumio, perdonada into v_id, v_consumio, v_perdonada from public.asistencias where cliente_id = c;
  if v_consumio is distinct from false then raise exception 'VECTOR 5a FAIL: consumio % (expected false — a pardoned visit is not charged)', v_consumio; end if;
  if v_perdonada is distinct from true then raise exception 'VECTOR 5a FAIL: perdonada % (expected true — the stated pardon must be STAMPED, or a visit count cannot skip the second record of one arrival)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'VECTOR 5a FAIL: balance % (expected an untouched 5 — the toggles would have charged here)', v_clases; end if;

  -- (6) the pardoned check-in replays clean, and `resultado` is re-derived from the STORED perdonada.
  select * into r2 from public.fijar_asistencia(c, true, null, hoy, true);
  if (r2.present, r2.hora, r2.session_id, r2.clases_restantes, r2.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado) then
    raise exception 'VECTOR 6 FAIL: the replayed pardon returned (%, %, %, %) vs (%, %, %, %)',
      r2.present, r2.session_id, r2.clases_restantes, r2.resultado,
      r1.present, r1.session_id, r1.clases_restantes, r1.resultado;
  end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 6 FAIL: % asistencias row(s) after the replay (expected 1)', v_n; end if;
  select id, perdonada into v_id2, v_perdonada from public.asistencias where cliente_id = c;
  if v_id2 is distinct from v_id then raise exception 'VECTOR 6 FAIL: the pardoned row was replaced'; end if;
  if v_perdonada is distinct from true then raise exception 'VECTOR 6 FAIL: perdonada % after the replay (expected an untouched true)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'VECTOR 6 FAIL: balance % after the replay (expected 5)', v_clases; end if;
end $$;

-- ── (5b) THE MIRROR: p_perdonada=false CHARGES even where the cooldown WOULD have pardoned ───────
do $$
declare
  c      uuid := current_setting('t.c_nopard', true)::uuid;
  s_walk uuid := current_setting('t.s_walk', true)::uuid;
  hoy    date := current_setting('t.today', true)::date;
  r record; v_clases int; v_consumio boolean; v_perdonada boolean;
begin
  -- Set the premise up: a CHARGED class visit, minutes ago (the frozen clock guarantees "minutes").
  select * into r from public.fijar_asistencia(c, true, s_walk, null, false);
  if r.resultado is distinct from 'descontada' then raise exception 'VECTOR 5b SEED FAIL: class resultado % (expected descontada)', r.resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 5b SEED FAIL: balance % (expected 4)', v_clases; end if;
  -- The derivation the TOGGLES would run now says "pardon this door visit".
  if not public.visita_reciente(c, hoy, true) then
    raise exception 'VECTOR 5b PREMISE FAIL: visita_reciente is false — the fixture cannot prove the RPC ignored it';
  end if;

  -- THE ASSERTION: the caller stated NO pardon, so the visit is charged anyway. The RPC never pardons
  -- behind the caller's back, because it never asks.
  select * into r from public.fijar_asistencia(c, true, null, hoy, false);
  if r.resultado is distinct from 'descontada' then raise exception 'VECTOR 5b FAIL: resultado % (expected descontada — p_perdonada was false)', r.resultado; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c and class_session_id is null and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'VECTOR 5b FAIL: libre row consumio % (expected true)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'VECTOR 5b FAIL: libre row perdonada % (expected false — nothing pardoned it)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 3 then raise exception 'VECTOR 5b FAIL: balance % (expected 3 — the RPC re-derived the cooldown instead of honouring the argument)', v_clases; end if;
end $$;

-- ── (14) The gates still bite and write NOTHING; a stated pardon admits the refused member ───────
do $$
declare
  c_zero uuid := current_setting('t.c_zero', true)::uuid;
  c_venc uuid := current_setting('t.c_venc', true)::uuid;
  hoy    date := current_setting('t.today', true)::date;
  r record; raised boolean; v_n int; v_clases int; v_perdonada boolean; v_consumio boolean;
begin
  -- (14a) #237 zero balance
  raised := false;
  begin perform public.fijar_asistencia(c_zero, true, null, hoy, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'VECTOR 14a FAIL: a finite member at 0 classes was admitted'; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_zero;
  if v_n is distinct from 0 then raise exception 'VECTOR 14a FAIL: % row(s) written by a refusal (expected 0)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c_zero;
  if v_clases is distinct from 0 then raise exception 'VECTOR 14a FAIL: balance % moved on a refusal (expected 0)', v_clases; end if;

  -- (14b) C9 vigencia
  raised := false;
  begin perform public.fijar_asistencia(c_venc, true, null, hoy, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'VECTOR 14b FAIL: an expired package was admitted'; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_venc;
  if v_n is distinct from 0 then raise exception 'VECTOR 14b FAIL: % row(s) written by a refusal (expected 0)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c_venc;
  if v_clases is distinct from 5 then raise exception 'VECTOR 14b FAIL: balance % moved on a refusal (expected 5)', v_clases; end if;

  -- (14c) the SAME 0-balance member, with a stated pardon: admitted, free, stamped, balance still 0.
  select * into r from public.fijar_asistencia(c_zero, true, null, hoy, true);
  if r.present is not true then raise exception 'VECTOR 14c FAIL: a pardoned 0-balance visit was refused'; end if;
  if r.resultado is distinct from 'gratis' then raise exception 'VECTOR 14c FAIL: resultado % (expected gratis)', r.resultado; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_zero;
  if v_n is distinct from 1 then raise exception 'VECTOR 14c FAIL: % row(s) (expected 1)', v_n; end if;
  select consumio, perdonada into v_consumio, v_perdonada from public.asistencias where cliente_id = c_zero;
  if v_consumio is distinct from false then raise exception 'VECTOR 14c FAIL: consumio % (expected false)', v_consumio; end if;
  if v_perdonada is distinct from true then raise exception 'VECTOR 14c FAIL: perdonada % (expected true)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_zero;
  if v_clases is distinct from 0 then raise exception 'VECTOR 14c FAIL: balance % (expected 0 — a pardon charges nothing, and never goes negative)', v_clases; end if;
end $$;

-- ── (7)(9) CLASS context, WALK-IN: check-in, replay, un-check-in, replay ─────────────────────────
do $$
declare
  c      uuid := current_setting('t.c_walk', true)::uuid;
  s      uuid := current_setting('t.s_walk', true)::uuid;
  hoy    date := current_setting('t.today', true)::date;
  gym_a  uuid := current_setting('t.gym_a', true)::uuid;
  r1 record; r2 record;
  v_n int; v_clases int; v_id uuid; v_id2 uuid;
  v_consumio boolean; v_perdonada boolean; v_origen text; v_deleted timestamptz; v_deleted2 timestamptz;
  v_gym uuid; v_fecha date; v_hora time; v_res uuid;
  v_status text; v_walk boolean; v_checked timestamptz; v_checked2 timestamptz; v_cancelled timestamptz;
  v_res_id uuid;
begin
  -- (7) the walk-in check-in
  select * into r1 from public.fijar_asistencia(c, true, s, null, false);
  if r1.present is not true then raise exception 'VECTOR 7 FAIL: the walk-in check-in was refused'; end if;
  if r1.session_id is distinct from s then raise exception 'VECTOR 7 FAIL: returned session_id % (expected %)', r1.session_id, s; end if;
  if r1.resultado is distinct from 'descontada' then raise exception 'VECTOR 7 FAIL: resultado % (expected descontada — no booking paid for this class)', r1.resultado; end if;
  if r1.hora is distinct from '18:00' then raise exception 'VECTOR 7 FAIL: returned hora % (expected 18:00 — the session''s own start)', r1.hora; end if;

  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 7 FAIL: % asistencias row(s) (expected 1)', v_n; end if;
  select id, consumio, perdonada, origen, deleted_at, gym_id, fecha, hora, reservation_id
    into v_id, v_consumio, v_perdonada, v_origen, v_deleted, v_gym, v_fecha, v_hora, v_res
    from public.asistencias where cliente_id = c;
  if v_consumio is distinct from true then raise exception 'VECTOR 7 FAIL: consumio % (expected true)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'VECTOR 7 FAIL: perdonada % (expected false)', v_perdonada; end if;
  if v_origen is distinct from 'clase' then raise exception 'VECTOR 7 FAIL: origen % (expected clase)', v_origen; end if;
  if v_deleted is not null then raise exception 'VECTOR 7 FAIL: deleted_at % (expected null)', v_deleted; end if;
  if v_gym is distinct from gym_a then raise exception 'VECTOR 7 FAIL: gym_id % (expected %)', v_gym, gym_a; end if;
  if v_fecha is distinct from hoy then raise exception 'VECTOR 7 FAIL: fecha % (expected the session''s gym-local day %)', v_fecha, hoy; end if;
  if v_hora is distinct from time '18:00' then raise exception 'VECTOR 7 FAIL: hora % (expected 18:00 — the session''s own instant, never now())', v_hora; end if;
  if v_res is null then raise exception 'VECTOR 7 FAIL: reservation_id is null — the attendance row must link the walk-in booking it settles'; end if;
  v_res_id := v_res;

  select status, is_walk_in, checked_at into v_status, v_walk, v_checked
    from public.reservation where id = v_res_id;
  if v_status is distinct from 'asistida' then raise exception 'VECTOR 7 FAIL: reservation status % (expected asistida)', v_status; end if;
  if v_walk is distinct from true then raise exception 'VECTOR 7 FAIL: is_walk_in % (expected true — no booking existed)', v_walk; end if;
  if v_checked is null then raise exception 'VECTOR 7 FAIL: checked_at is null'; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 7 FAIL: balance % (expected 4)', v_clases; end if;

  -- THE REPLAY: nothing at all may move, including checked_at.
  select * into r2 from public.fijar_asistencia(c, true, s, null, false);
  perform public.fijar_asistencia(c, true, s, null, false);
  if (r2.present, r2.hora, r2.session_id, r2.clases_restantes, r2.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado) then
    raise exception 'VECTOR 7 FAIL: the replayed walk-in returned a different answer';
  end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 7 FAIL: % asistencias row(s) after two replays (expected 1)', v_n; end if;
  select id, deleted_at into v_id2, v_deleted from public.asistencias where cliente_id = c;
  if v_id2 is distinct from v_id then raise exception 'VECTOR 7 FAIL: the row was replaced by a replay'; end if;
  if v_deleted is not null then raise exception 'VECTOR 7 FAIL: DESTRUCTIVE REPLAY — the class check-in was undone (deleted_at %)', v_deleted; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 7 FAIL: balance % after two replays (expected 4)', v_clases; end if;
  select checked_at into v_checked2 from public.reservation where id = v_res_id;
  if v_checked2 is distinct from v_checked then raise exception 'VECTOR 7 FAIL: checked_at was re-stamped by a replay (% -> %) — the no-op arm must write NOTHING', v_checked, v_checked2; end if;
  select count(*) into v_n from public.reservation where member_id = c and class_session_id = s;
  if v_n is distinct from 1 then raise exception 'VECTOR 7 FAIL: % reservation row(s) (expected 1)', v_n; end if;

  -- (9) the un-check-in: refund exactly once, reservation driven terminal.
  select * into r1 from public.fijar_asistencia(c, false, s, null, false);
  if r1.present is not false then raise exception 'VECTOR 9 FAIL: present % (expected false)', r1.present; end if;
  if r1.session_id is distinct from s then raise exception 'VECTOR 9 FAIL: returned session_id % (expected %)', r1.session_id, s; end if;
  if r1.resultado is not null then raise exception 'VECTOR 9 FAIL: resultado % (expected null)', r1.resultado; end if;
  select deleted_at into v_deleted from public.asistencias where cliente_id = c;
  if v_deleted is null then raise exception 'VECTOR 9 FAIL: the row was not soft-deleted'; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'VECTOR 9 FAIL: balance % (expected the refunded 5)', v_clases; end if;
  select status, checked_at, cancelled_at into v_status, v_checked, v_cancelled from public.reservation where id = v_res_id;
  if v_status is distinct from 'cancelada' then raise exception 'VECTOR 9 FAIL: reservation status % (expected cancelada — a walk-in row existed only for this visit)', v_status; end if;
  if v_checked is not null then raise exception 'VECTOR 9 FAIL: checked_at % (expected null)', v_checked; end if;
  if v_cancelled is null then raise exception 'VECTOR 9 FAIL: cancelled_at is null'; end if;

  -- THE REPLAY of the un-check-in.
  perform public.fijar_asistencia(c, false, s, null, false);
  perform public.fijar_asistencia(c, false, s, null, false);
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'VECTOR 9 FAIL: DOUBLE REFUND — balance % after two replays (expected 5)', v_clases; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 9 FAIL: % asistencias row(s) (expected 1)', v_n; end if;
  select deleted_at into v_deleted2 from public.asistencias where cliente_id = c;
  if v_deleted2 is distinct from v_deleted then raise exception 'VECTOR 9 FAIL: deleted_at was re-stamped by a replay (% -> %)', v_deleted, v_deleted2; end if;
  select status, cancelled_at into v_status, v_checked from public.reservation where id = v_res_id;
  if v_status is distinct from 'cancelada' then raise exception 'VECTOR 9 FAIL: reservation status % after the replays (expected cancelada)', v_status; end if;
  if v_checked is distinct from v_cancelled then raise exception 'VECTOR 9 FAIL: cancelled_at was re-stamped by a replay'; end if;
end $$;

-- ── (8) CLASS context, BOOKED: capture the hold, replay, un-check-in, replay ─────────────────────
do $$
declare
  c   uuid := current_setting('t.c_book', true)::uuid;
  s   uuid := current_setting('t.s_book', true)::uuid;
  hoy date := current_setting('t.today', true)::date;
  r1 record; r2 record;
  v_n int; v_clases int; v_id uuid; v_consumio boolean; v_perdonada boolean; v_origen text;
  v_deleted timestamptz; v_status text; v_walk boolean; v_checked timestamptz; v_checked2 timestamptz;
  v_res_id uuid;
begin
  select id into v_res_id from public.reservation where member_id = c and class_session_id = s;
  if v_res_id is null then raise exception 'VECTOR 8 SEED FAIL: the booking is missing'; end if;

  -- (8) THE CAPTURE
  select * into r1 from public.fijar_asistencia(c, true, s, null, false);
  if r1.present is not true then raise exception 'VECTOR 8 FAIL: the booked check-in was refused'; end if;
  if r1.resultado is distinct from 'reserva' then raise exception 'VECTOR 8 FAIL: resultado % (expected reserva — a hold was captured)', r1.resultado; end if;
  if r1.clases_restantes is distinct from 4 then raise exception 'VECTOR 8 FAIL: returned balance % (expected 4 — the hold was taken at booking)', r1.clases_restantes; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 8 FAIL: % asistencias row(s) (expected 1)', v_n; end if;
  select id, consumio, perdonada, origen into v_id, v_consumio, v_perdonada, v_origen
    from public.asistencias where cliente_id = c;
  if v_consumio is distinct from false then raise exception 'VECTOR 8 FAIL: consumio % (expected false — the booking already paid)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'VECTOR 8 FAIL: perdonada % (expected false — a capture is the arrival, not its second record)', v_perdonada; end if;
  if v_origen is distinct from 'clase' then raise exception 'VECTOR 8 FAIL: origen % (expected clase)', v_origen; end if;
  select status, is_walk_in, checked_at into v_status, v_walk, v_checked from public.reservation where id = v_res_id;
  if v_status is distinct from 'asistida' then raise exception 'VECTOR 8 FAIL: reservation status % (expected asistida)', v_status; end if;
  if v_walk is distinct from false then raise exception 'VECTOR 8 FAIL: is_walk_in % (expected false — this is a real booking, and the replay arm reads that flag to tell reserva from gratis)', v_walk; end if;
  -- §D6 counter-vector (20260828100000): the CAPTURE leaves the hold flag alone. Vector 16's walk-in
  -- reuse clears it because a terminal row's flag is dead; this one is live, and it IS this visit's
  -- charge — the asistencia beside it is consumio = false precisely because the booking paid.
  select consumio into v_consumio from public.reservation where id = v_res_id;
  if v_consumio is distinct from true then raise exception 'VECTOR 8 FAIL: reservation.consumio % — the capture cleared a LIVE hold, so this visit is now charged nowhere', v_consumio; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 8 FAIL: DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;

  -- THE REPLAY: still 'reserva', re-derived from the stored rows; nothing moves.
  select * into r2 from public.fijar_asistencia(c, true, s, null, false);
  if (r2.present, r2.hora, r2.session_id, r2.clases_restantes, r2.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado) then
    raise exception 'VECTOR 8 FAIL: the replayed capture returned (%, %, %) vs (%, %, %)',
      r2.present, r2.clases_restantes, r2.resultado, r1.present, r1.clases_restantes, r1.resultado;
  end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 8 FAIL: % asistencias row(s) after the replay (expected 1)', v_n; end if;
  select deleted_at into v_deleted from public.asistencias where cliente_id = c;
  if v_deleted is not null then raise exception 'VECTOR 8 FAIL: DESTRUCTIVE REPLAY — the capture was undone'; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 8 FAIL: balance % after the replay (expected 4 — a replayed capture must not refund the hold)', v_clases; end if;
  select checked_at into v_checked2 from public.reservation where id = v_res_id;
  if v_checked2 is distinct from v_checked then raise exception 'VECTOR 8 FAIL: checked_at was re-stamped by a replay (% -> %)', v_checked, v_checked2; end if;

  -- UN-CHECK-IN: the booking reverts and keeps its hold; NOTHING is refunded.
  select * into r1 from public.fijar_asistencia(c, false, s, null, false);
  if r1.clases_restantes is distinct from 4 then raise exception 'VECTOR 8 FAIL: un-check-in returned balance % (expected 4 — releasing the hold is cancelar_reserva''s job)', r1.clases_restantes; end if;
  select status, checked_at into v_status, v_checked from public.reservation where id = v_res_id;
  if v_status is distinct from 'reservada' then raise exception 'VECTOR 8 FAIL: reservation status % (expected reservada — a real booking reverts to its held state)', v_status; end if;
  if v_checked is not null then raise exception 'VECTOR 8 FAIL: checked_at % (expected null)', v_checked; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 8 FAIL: PHANTOM REFUND — balance % (expected 4)', v_clases; end if;

  -- and the un-check-in replays clean too
  perform public.fijar_asistencia(c, false, s, null, false);
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 8 FAIL: balance % after the replayed un-check-in (expected 4)', v_clases; end if;
  select status into v_status from public.reservation where id = v_res_id;
  if v_status is distinct from 'reservada' then raise exception 'VECTOR 8 FAIL: reservation status % after the replayed un-check-in (expected reservada)', v_status; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c and deleted_at is null;
  if v_n is distinct from 0 then raise exception 'VECTOR 8 FAIL: % active row(s) after the replayed un-check-in (expected 0)', v_n; end if;
end $$;

-- ── (13) PAST-DAY BACKFILL keeps the session's own instant; p_fecha is ignored beside a session ──
do $$
declare
  c    uuid := current_setting('t.c_late', true)::uuid;
  s    uuid := current_setting('t.s_ayer', true)::uuid;
  hoy  date := current_setting('t.today', true)::date;
  ayer date := current_setting('t.ayer', true)::date;
  r1 record; r2 record; v_fecha date; v_hora time; v_clases int;
begin
  -- p_fecha is TODAY on purpose: the session's own gym-local day must win.
  select * into r1 from public.fijar_asistencia(c, true, s, hoy, false);
  if r1.present is not true then raise exception 'VECTOR 13 FAIL: the late mark was refused'; end if;
  if r1.hora is distinct from '07:00' then raise exception 'VECTOR 13 FAIL: returned hora % (expected 07:00 — the class''s own start, not now())', r1.hora; end if;
  select fecha, hora into v_fecha, v_hora from public.asistencias where cliente_id = c;
  if v_fecha is distinct from ayer then raise exception 'VECTOR 13 FAIL: fecha % (expected yesterday % — the session''s day governs and p_fecha is ignored)', v_fecha, ayer; end if;
  if v_hora is distinct from time '07:00' then raise exception 'VECTOR 13 FAIL: hora % (expected 07:00)', v_hora; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 13 FAIL: balance % (expected 4)', v_clases; end if;

  select * into r2 from public.fijar_asistencia(c, true, s, hoy, false);
  if (r2.present, r2.hora, r2.session_id, r2.clases_restantes, r2.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado) then
    raise exception 'VECTOR 13 FAIL: the replayed backfill returned a different answer';
  end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 13 FAIL: balance % after the replay (expected 4)', v_clases; end if;
end $$;

-- ── (16) WALK-IN ON A CANCELLED BOOKING: the reuse clears the dead flag, and replays clean ──────
-- The arrange block near the top left this member with a CANCELLED row that still says consumio = true
-- (cancelar_reserva refunds by reading that flag and never clears it — asserted there, not assumed).
-- The door check-in reuses that one UNIQUE row as a walk-in, so the flag has to go: the charge for this
-- visit is the asistencia inserted alongside it, which is also where the un-check-in refund reads it.
--
-- WHY THE LEGS ARE COUNTED APART, and not just totalled: D0's asistencia leg defers to any reservation
-- that claims the charge, so the TOTAL is 1 with or without the fix and a total-only assertion would
-- pass against the unfixed body. What moves is WHICH leg carries the charge, and with it the charge
-- MOMENT — the reservation leg dates it at `created_at`, a booking this member cancelled (and, after a
-- renewal, one belonging to a pack since replaced), while the asistencia leg dates it at the class's own
-- fecha + hora, which is when the door actually charged.
--
-- And then it is REPLAYED, because this is the idempotent seam: a flag that flips back on the second
-- call would be #293's bug in a new column.
do $$
declare
  c uuid := current_setting('t.c_recy', true)::uuid;
  s uuid := current_setting('t.s_recy', true)::uuid;
  r1 record; r2 record;
  v_res_id uuid; v_status text; v_walk boolean; v_consumio boolean;
  v_cancelled timestamptz; v_checked timestamptz; v_checked2 timestamptz;
  v_a_consumio boolean; v_a_res uuid; v_a_origen text; v_a_perdonada boolean;
  v_n int; v_clases int; v_leg_a int; v_leg_r int;
begin
  select * into r1 from public.fijar_asistencia(c, true, s, null, false);
  if r1.present is not true then raise exception 'VECTOR 16 FAIL: the walk-in check-in was refused'; end if;
  -- 'descontada', not 'reserva': a CANCELLED booking is not a hold to capture, and this charge is real.
  if r1.resultado is distinct from 'descontada' then raise exception 'VECTOR 16 FAIL: resultado % (expected descontada)', r1.resultado; end if;
  if r1.hora is distinct from '20:00' then raise exception 'VECTOR 16 FAIL: returned hora % (expected the session''s own 20:00)', r1.hora; end if;
  if r1.clases_restantes is distinct from 4 then raise exception 'VECTOR 16 FAIL: returned balance % (expected 4 — one net charge across book, cancel and walk in)', r1.clases_restantes; end if;

  -- THE REUSED ROW, column by column. consumio is the §D6 edit; the other four are the reuse arm's
  -- existing contract and are asserted here because this is the first vector that reaches it from a
  -- CANCELLED row rather than from no row at all.
  select id, status, is_walk_in, consumio, cancelled_at, checked_at
    into v_res_id, v_status, v_walk, v_consumio, v_cancelled, v_checked
    from public.reservation where member_id = c and class_session_id = s;
  select count(*) into v_n from public.reservation where member_id = c and class_session_id = s;
  if v_n is distinct from 1 then raise exception 'VECTOR 16 FAIL: % reservation row(s) (expected the ONE reused row)', v_n; end if;
  if v_status is distinct from 'asistida' then raise exception 'VECTOR 16 FAIL: reservation status % (expected asistida)', v_status; end if;
  if v_walk is distinct from true then raise exception 'VECTOR 16 FAIL: is_walk_in % (expected true — the booking was cancelled, this arrival is a walk-in)', v_walk; end if;
  if v_cancelled is not null then raise exception 'VECTOR 16 FAIL: cancelled_at % not cleared by the reuse', v_cancelled; end if;
  if v_checked is null then raise exception 'VECTOR 16 FAIL: checked_at not stamped'; end if;
  if v_consumio is distinct from false then
    raise exception 'VECTOR 16 FAIL: reservation.consumio % — the CANCELLED booking''s flag survived the walk-in reuse, so this door charge is dated at the booking instant and attributed to whatever pack was live then', v_consumio;
  end if;

  -- …and the charge itself is on the attendance row, linked to the row it settles.
  select count(*) into v_n from public.asistencias where cliente_id = c and deleted_at is null;
  if v_n is distinct from 1 then raise exception 'VECTOR 16 FAIL: % active asistencias row(s) (expected 1)', v_n; end if;
  select consumio, reservation_id, origen, perdonada into v_a_consumio, v_a_res, v_a_origen, v_a_perdonada
    from public.asistencias where cliente_id = c and deleted_at is null;
  if v_a_consumio is distinct from true then raise exception 'VECTOR 16 FAIL: asistencia.consumio % (expected true — this visit is the one that paid)', v_a_consumio; end if;
  if v_a_res is distinct from v_res_id then raise exception 'VECTOR 16 FAIL: asistencia.reservation_id % (expected the reused row %)', v_a_res, v_res_id; end if;
  if v_a_origen is distinct from 'clase' then raise exception 'VECTOR 16 FAIL: asistencia.origen % (expected clase)', v_a_origen; end if;
  if v_a_perdonada is distinct from false then raise exception 'VECTOR 16 FAIL: a PAYING row was stamped perdonada %', v_a_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 16 FAIL: stored balance % (expected 4)', v_clases; end if;

  -- THE DERIVED COUNT (spec D0), leg by leg.
  select count(*) into v_leg_a from public.asistencias a
    left join public.reservation r on r.id = a.reservation_id
   where a.cliente_id = c and a.deleted_at is null and not a.perdonada
     and not coalesce(r.consumio, false);
  select count(*) into v_leg_r from public.reservation r
   where r.member_id = c and r.consumio and r.status <> 'cancelada';
  if v_leg_r <> 0 then raise exception 'VECTOR 16 FAIL: the RESERVATION leg claims % charge(s) (expected 0 — that booking was cancelled and refunded)', v_leg_r; end if;
  if v_leg_a <> 1 then raise exception 'VECTOR 16 FAIL: the ASISTENCIA leg counts % charge(s) (expected the 1 the door took)', v_leg_a; end if;

  -- THE REPLAY: the no-op arm writes nothing, including the flag and checked_at.
  select * into r2 from public.fijar_asistencia(c, true, s, null, false);
  perform public.fijar_asistencia(c, true, s, null, false);
  if (r2.present, r2.hora, r2.session_id, r2.clases_restantes, r2.resultado)
     is distinct from (r1.present, r1.hora, r1.session_id, r1.clases_restantes, r1.resultado) then
    raise exception 'VECTOR 16 FAIL: the replayed walk-in returned a different answer';
  end if;
  select consumio, checked_at into v_consumio, v_checked2 from public.reservation where id = v_res_id;
  if v_consumio is distinct from false then raise exception 'VECTOR 16 FAIL: a replay re-set the dead flag (consumio %)', v_consumio; end if;
  if v_checked2 is distinct from v_checked then raise exception 'VECTOR 16 FAIL: checked_at was re-stamped by a replay (% -> %)', v_checked, v_checked2; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 1 then raise exception 'VECTOR 16 FAIL: % asistencias row(s) after two replays (expected 1)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 4 then raise exception 'VECTOR 16 FAIL: balance % after two replays (expected 4)', v_clases; end if;
end $$;

-- ── (15) THE EXPLICIT-ARGUMENT CONTRACT: an undecided argument is refused, never defaulted ──────
-- `p_perdonada` defaults to false at the signature, but an explicit NULL means "I did not decide",
-- and reading that as "do not forgive" is exactly how a pardoned arrival silently becomes a double
-- charge. Same for the stated outcome, and for a libre call with no date to be a visit ON.
do $$
declare
  c   uuid := current_setting('t.c_virgin', true)::uuid;
  hoy date := current_setting('t.today', true)::date;
  raised boolean; v_n int; v_clases int;
begin
  raised := false;
  begin perform public.fijar_asistencia(c, null, null, hoy, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'VECTOR 15 FAIL: a NULL desired state was accepted'; end if;

  raised := false;
  begin perform public.fijar_asistencia(c, true, null, hoy, null);
  exception when others then raised := true; end;
  if not raised then raise exception 'VECTOR 15 FAIL: a NULL forgiveness decision was accepted — it must be STATED, not defaulted';  end if;

  raised := false;
  begin perform public.fijar_asistencia(c, true, null, null, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'VECTOR 15 FAIL: an ACCESO LIBRE check-in with no fecha was accepted'; end if;

  select count(*) into v_n from public.asistencias where cliente_id = c;
  if v_n is distinct from 0 then raise exception 'VECTOR 15 FAIL: % row(s) written by a refused call (expected 0)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c;
  if v_clases is distinct from 5 then raise exception 'VECTOR 15 FAIL: balance moved to % on a refused call (expected 5)', v_clases; end if;
end $$;

-- ── (10c) gym_a's operator cannot reach gym_b's cliente through gym_a's own session ──────────────
do $$
declare
  c_b uuid := current_setting('t.c_b', true)::uuid;
  s   uuid := current_setting('t.s_walk', true)::uuid;
  hoy date := current_setting('t.today', true)::date;
  raised boolean;
begin
  -- through gym_a's OWN session: the session resolves, the gym pin then refuses the cliente
  raised := false;
  begin perform public.fijar_asistencia(c_b, true, s, null, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'VECTOR 10c FAIL: gym_a''s operator marked gym_b''s cliente against a gym_a session'; end if;

  -- and through ACCESO LIBRE, where RLS alone has to carry it
  raised := false;
  begin perform public.fijar_asistencia(c_b, true, null, hoy, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'VECTOR 10c FAIL: gym_a''s operator checked gym_b''s cliente in as ACCESO LIBRE'; end if;
end $$;

reset role;

-- The written-row half of 10c runs UNPRIVILEGED-FREE, as the migration role: gym_a's operator cannot
-- READ gym_b's rows either, so asserting "nothing was written" from inside their session would be
-- vacuous — an empty count would prove RLS on the SELECT, not the absence of a write. Also runs
-- BEFORE vector 11, which legitimately writes c_b's first row.
do $$
declare
  c_b uuid := current_setting('t.c_b', true)::uuid;
  v_n int; v_clases int;
begin
  select count(*) into v_n from public.asistencias where cliente_id = c_b;
  if v_n is distinct from 0 then raise exception 'VECTOR 10c FAIL: % row(s) written for gym_b''s cliente by gym_a''s operator (expected 0)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c_b;
  if v_clases is distinct from 5 then raise exception 'VECTOR 10c FAIL: gym_b''s cliente balance moved to % (expected an untouched 5)', v_clases; end if;
end $$;

-- ── (10a)(10b) gym_b's operator cannot touch gym_a's cliente, by either context ──────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  c_victim uuid := current_setting('t.c_victim', true)::uuid;
  s_a      uuid := current_setting('t.s_walk', true)::uuid;
  hoy      date := current_setting('t.today', true)::date;
  raised boolean; v_n int; v_clases int;
begin
  -- (10a) ACCESO LIBRE against another gym's cliente
  raised := false;
  begin perform public.fijar_asistencia(c_victim, true, null, hoy, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'CROSS-TENANT FAIL(10a): gym_b''s operator checked in gym_a''s cliente';  end if;

  -- (10b) the same attempt through gym_a's session
  raised := false;
  begin perform public.fijar_asistencia(c_victim, true, s_a, null, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'CROSS-TENANT FAIL(10b): gym_b''s operator marked gym_a''s cliente against gym_a''s session'; end if;

  -- and the un-check-in direction, which would be a way to DELETE another gym's ledger row
  raised := false;
  begin perform public.fijar_asistencia(c_victim, false, null, hoy, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'CROSS-TENANT FAIL(10b): gym_b''s operator un-checked-in gym_a''s cliente'; end if;
end $$;

-- ── (11) the positive control: gym_b's operator DOES work on their own gym, stamped gym_b ────────
do $$
declare
  c_b   uuid := current_setting('t.c_b', true)::uuid;
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
  hoy   date := current_setting('t.today', true)::date;
  r record; v_gym uuid; v_clases int; v_n int;
begin
  select * into r from public.fijar_asistencia(c_b, true, null, hoy, false);
  if r.present is not true then raise exception 'VECTOR 11 FAIL: gym_b''s operator could not check in their OWN cliente — vector 10 proves nothing'; end if;
  if r.resultado is distinct from 'descontada' then raise exception 'VECTOR 11 FAIL: resultado % (expected descontada)', r.resultado; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_b;
  if v_n is distinct from 1 then raise exception 'VECTOR 11 FAIL: % row(s) (expected 1)', v_n; end if;
  select gym_id into v_gym from public.asistencias where cliente_id = c_b;
  if v_gym is distinct from gym_b then raise exception 'VECTOR 11 FAIL: gym_id % (expected gym_b % — the row is stamped with the CLIENTE''s gym, never the caller''s guess)', v_gym, gym_b; end if;
  select clases_restantes into v_clases from public.clientes where id = c_b;
  if v_clases is distinct from 4 then raise exception 'VECTOR 11 FAIL: balance % (expected 4)', v_clases; end if;
end $$;
reset role;

-- ── (10d) anon cannot EXECUTE the function at all — a stricter denial than RLS-empty ─────────────
set local role anon;
do $$
declare
  raised boolean := false;
begin
  begin perform public.fijar_asistencia(
    current_setting('t.c_victim', true)::uuid, true, null, current_setting('t.today', true)::date, false);
  exception when others then raised := true; end;
  if not raised then raise exception 'ANON DENIAL FAIL: anon executed fijar_asistencia'; end if;
end $$;
reset role;

-- ── gym_a's ledger is exactly what its own operator wrote, and nothing leaked in ─────────────────
do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
  v_n int; v_clases int;
begin
  -- The victim was attacked three ways and never got a row, active or deleted.
  select count(*) into v_n from public.asistencias where cliente_id = current_setting('t.c_victim', true)::uuid;
  if v_n is distinct from 0 then raise exception 'CROSS-TENANT FAIL: % row(s) exist for the attacked cliente (expected 0)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = current_setting('t.c_victim', true)::uuid;
  if v_clases is distinct from 5 then raise exception 'CROSS-TENANT FAIL: the attacked cliente''s balance moved to % (expected 5)', v_clases; end if;
  -- No row this suite wrote carries the wrong gym.
  select count(*) into v_n from public.asistencias a join public.clientes c on c.id = a.cliente_id
   where c.gym_id in (gym_a, gym_b) and a.gym_id is distinct from c.gym_id;
  if v_n is distinct from 0 then raise exception 'GYM SCOPING FAIL: % asistencias row(s) stamped with a gym that is not the cliente''s', v_n; end if;
end $$;

select 'fijar_asistencia rules: OK' as result;
rollback;
