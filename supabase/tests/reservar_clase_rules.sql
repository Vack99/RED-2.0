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
--   * walk-in-full does NOT block (20260804130000) — a session at capacity via WALK-IN rows alone
--                                  (is_walk_in=true, status='asistida') does not raise 'Clase llena': a
--                                  walk-in never consumed a bookable spot, so the guard (now reading
--                                  contar_reservas_activas_miembro) must not count it. Counter-vector is
--                                  `full block` right above — same capacity, non-walk-in rows, still blocks.
--   * duplicate block            — re-booking an already-active (member, session) is rejected; balance
--                                  is not decremented a second time.
--   * re-book reuses the row     — booking a session the member previously CANCELLED reactivates the one
--                                  UNIQUE row (no duplicate) and consumes one.
--   * started-class block (#165) — a session whose starts_at is already past is rejected with the SAME
--                                  message cancelar_reserva has always used ('La clase ya comenzó'), and
--                                  atomically: no reservation row, no decrement. The client hides past
--                                  classes; the client is not the rule, and a booking made after the
--                                  class ran is a consumed credit for a seat nobody can occupy. The
--                                  fixture is seeded one minute in the past — the boundary is
--                                  `starts_at <= now()`, an absolute instant, never a gym-local date.
--
-- THE OPERATOR PATH (#237, slice 2 of #235). `reservar_clase` gained a nullable second argument naming a
-- target cliente: NULL is the member self path above (every vector already written stays untouched, and
-- THAT is the assertion that the one-argument call is byte-for-byte unchanged), NOT NULL is an operator
-- booking a member who phoned in. The whole design claim is that the two paths converge below identity,
-- so every member vector above is RE-ASSERTED with a staff caller and a named target:
--   * operator books a member  — the WRITTEN row carries the SESSION's gym, the TARGET's id, 'reservada',
--                                is_walk_in = false (a phone booking IS a reserva, #235) and consumio =
--                                true; the target's balance drops by EXACTLY one and the OPERATOR's own
--                                balance does not move at all (the decrement targets the resolved member,
--                                never the caller). The targets carry NO auth_user_id — the members this
--                                feature exists for are the ones who never signed up for the site.
--   * op: ilimitado exempt / zero-balance / expired / full / duplicate / row-reuse / started
--                              — the same seven refusals and reuses, same messages, same atomicity. No
--                                staff override of cupo, balance or expiry (#235 ruling): an operator
--                                blocked is an operator who sells first.
--   * DENIAL: non-staff naming a target — a plain member of the gym is refused with 'No autorizado',
--                                INCLUDING when they name their own cliente id. There is no
--                                self-exception; the member's door is the one-argument call. The message
--                                itself is asserted, because "it raised" would also be true of the
--                                duplicate guard.
--   * DENIAL: staff of ANOTHER gym — is_staff_of is asked about the SESSION's gym, never the caller's.
--   * DENIAL: target of ANOTHER gym — the gym-pinned lookup finds nothing → 'Cliente no encontrado'.
--     The last three run against s_deny, a session with free seats that nobody has booked, so the ONLY
--     thing that can refuse them is the identity gate — and if the gate were missing they would SUCCEED.
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
  v_tz     text;
  v_today  date;
  v_ct     uuid;
  v_starts timestamptz := now() + interval '2 days';
  -- #165: a class that started ONE MINUTE ago. Seeded straight to the past rather than booked-then-moved
  -- (the pattern the attendance suites need) because no successful booking is required here — the point
  -- of the vector is the refusal.
  v_started timestamptz := now() - interval '1 minute';
  m_fin  uuid := gen_random_uuid();
  m_ilim uuid := gen_random_uuid();
  m_zero uuid := gen_random_uuid();
  m_exp  uuid := gen_random_uuid();
  m_full uuid := gen_random_uuid();
  m_start uuid := gen_random_uuid();
  m_walk uuid := gen_random_uuid();
  c_fin  uuid; c_ilim uuid; c_zero uuid; c_exp uuid; c_full uuid; c_start uuid; c_walk uuid;
  s_open uuid; s_full uuid; s_started uuid; s_walkfull uuid;
  d_cli  uuid;
  i int;
  -- ── #237 operator path ──
  op      uuid := gen_random_uuid();   -- STAFF of forge — the acting operator
  staff_b uuid := gen_random_uuid();   -- STAFF of a DIFFERENT gym — the cross-gym denial actor
  gym_b   uuid := gen_random_uuid();
  c_op    uuid;                        -- the operator's OWN cliente (their balance must never move)
  c_b     uuid;                        -- a cliente of gym B — the cross-tenant target denial
  t_fin uuid; t_ilim uuid; t_zero uuid; t_exp uuid; t_full uuid; t_start uuid; t_reuse uuid; t_deny uuid;
  s_deny uuid;                         -- an EMPTY future session: only the identity gate can refuse there
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
    ('00000000-0000-0000-0000-000000000000', m_full, 'authenticated', 'authenticated', 'rc-full@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_start,'authenticated', 'authenticated', 'rc-start@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_walk, 'authenticated', 'authenticated', 'rc-walk@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (m_fin, v_gym, 'member'), (m_ilim, v_gym, 'member'), (m_zero, v_gym, 'member'),
    (m_exp, v_gym, 'member'), (m_full, v_gym, 'member'), (m_start, v_gym, 'member'),
    (m_walk, v_gym, 'member');

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
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC started', '0000000006', 5, v_today + 20, '8 clases', v_gym, m_start) returning id into c_start;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC walk-in-full', '0000000007', 5, v_today + 20, '8 clases', v_gym, m_walk) returning id into c_walk;

  insert into public.class_type (gym_id, name) values (v_gym, 'RC Metcon') returning id into v_ct;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 20) returning id into s_open;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 4) returning id into s_full;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_started, 60, 20) returning id into s_started;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 4) returning id into s_walkfull;

  -- Fill s_full to capacity (4) with four distinct dummy clientes' active reservations.
  for i in 1..4 loop
    insert into public.clientes (nombre, tel, gym_id) values ('RC dummy '||i, '000000010'||i, v_gym)
      returning id into d_cli;
    insert into public.reservation (gym_id, class_session_id, member_id, status)
      values (v_gym, s_full, d_cli, 'reservada');
  end loop;

  -- Fill s_walkfull to capacity (4) with four WALK-IN rows — mirrors exactly how pasar_lista_sesion's
  -- walk-in arm writes one (status='asistida', is_walk_in=true; see pasar_lista_sesion_rules.sql's "(3)
  -- walk-in parity" block), inserted directly here since only the row's SHAPE matters to the guard, not
  -- the RPC that produced it.
  for i in 1..4 loop
    insert into public.clientes (nombre, tel, gym_id) values ('RC walkin '||i, '000000030'||i, v_gym)
      returning id into d_cli;
    insert into public.reservation (gym_id, class_session_id, member_id, status, is_walk_in, checked_at)
      values (v_gym, s_walkfull, d_cli, 'asistida', true, now());
  end loop;

  -- ── #237 operator-path fixtures ────────────────────────────────────────────────
  -- A second gym exists so "staff of another gym" and "target of another gym" are two DISTINCT vectors:
  -- the first fails half (a) of the gate, the second fails half (b), and a body that dropped either half
  -- would still pass the other's assertion.
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'rc-staff-target-gym-2', 'RC Staff Target Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op,      'authenticated', 'authenticated', 'rc-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b, 'authenticated', 'authenticated', 'rc-staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op, v_gym, 'operator'), (staff_b, gym_b, 'operator');

  -- The operator is ALSO a cliente who trains — so "the operator's own balance never moved" is a real
  -- assertion (a body that decremented the CALLER instead of the target would fail it) and not a vacuous
  -- one against a person with no balance at all.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC operator', '0000000201', 5, v_today + 20, '8 clases', v_gym, op) returning id into c_op;

  -- The TARGETS carry NO auth_user_id on purpose: this feature exists for the members who will not use
  -- the booking site, so the operator path must resolve them by (id, gym) alone — never through a user.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC target finite', '0000000202', 5, v_today + 20, '8 clases', v_gym) returning id into t_fin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC target ilim', '0000000203', null, v_today + 20, 'Ilimitado', v_gym) returning id into t_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC target zero', '0000000204', 0, v_today + 20, '8 clases', v_gym) returning id into t_zero;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC target exp', '0000000205', 5, v_today - 1, '8 clases', v_gym) returning id into t_exp;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC target full', '0000000206', 5, v_today + 20, '8 clases', v_gym) returning id into t_full;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC target started', '0000000207', 5, v_today + 20, '8 clases', v_gym) returning id into t_start;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC target reuse', '0000000208', 5, v_today + 20, '8 clases', v_gym) returning id into t_reuse;
  -- t_deny is booked by NOBODY and blocked by NOTHING: vigente, 5 classes, and the denial session has 20
  -- free seats. If the identity gate went missing, every denial vector below would SUCCEED, and the row
  -- count + balance assertions would catch it even if the message assertion did not.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC target deny', '0000000209', 5, v_today + 20, '8 clases', v_gym) returning id into t_deny;

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC gym-B cliente', '0000000210', 5, v_today + 20, '8 clases', gym_b) returning id into c_b;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 20) returning id into s_deny;

  perform set_config('t.op',      op::text,      true);
  perform set_config('t.staff_b', staff_b::text, true);
  perform set_config('t.c_op',    c_op::text,    true);
  perform set_config('t.c_b',     c_b::text,     true);
  perform set_config('t.t_fin',   t_fin::text,   true);
  perform set_config('t.t_ilim',  t_ilim::text,  true);
  perform set_config('t.t_zero',  t_zero::text,  true);
  perform set_config('t.t_exp',   t_exp::text,   true);
  perform set_config('t.t_full',  t_full::text,  true);
  perform set_config('t.t_start', t_start::text, true);
  perform set_config('t.t_reuse', t_reuse::text, true);
  perform set_config('t.t_deny',  t_deny::text,  true);
  perform set_config('t.s_deny',  s_deny::text,  true);

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
  perform set_config('t.m_start',   m_start::text,   true);
  perform set_config('t.c_start',   c_start::text,   true);
  perform set_config('t.m_walk',    m_walk::text,    true);
  perform set_config('t.c_walk',    c_walk::text,    true);
  perform set_config('t.s_open', s_open::text,  true);
  perform set_config('t.s_full', s_full::text,  true);
  perform set_config('t.s_started', s_started::text, true);
  perform set_config('t.s_walkfull', s_walkfull::text, true);
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

-- ════════════════════════════════════════════════════════════════════════════════
-- walk-in-full does NOT block (20260804130000) — a session at capacity via WALK-IN rows alone must not
-- refuse a real booking. Counter-vector is the `full block` above: same capacity, non-walk-in rows,
-- still raises 'Clase llena' — so this is specifically "walk-ins are excluded", not "capacity broke".
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_walk', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_walkfull uuid := current_setting('t.s_walkfull', true)::uuid;
  c_walk     uuid := current_setting('t.c_walk', true)::uuid;
  v_ret int; v_res uuid; v_n int; r record;
begin
  select reservation_id, clases_restantes into v_res, v_ret from public.reservar_clase(s_walkfull);
  if v_res is null then raise exception 'RULE FAIL(walkfull): a session full of WALK-INS blocked a real booking — no reservation returned'; end if;
  if v_ret <> 4 then raise exception 'RULE FAIL(walkfull): RPC returned clases %, expected 4', v_ret; end if;

  -- The written row, column by column — the contract is the row, not the return value (#80 AC4).
  select gym_id, member_id, status, is_walk_in, consumio into r
    from public.reservation where id = v_res;
  if r.gym_id     is distinct from current_setting('t.gym', true)::uuid then raise exception 'RULE FAIL(walkfull): reservation.gym_id % — not the session gym', r.gym_id; end if;
  if r.member_id  is distinct from c_walk      then raise exception 'RULE FAIL(walkfull): reservation.member_id % — not the booker', r.member_id; end if;
  if r.status     is distinct from 'reservada' then raise exception 'RULE FAIL(walkfull): status %', r.status; end if;
  if r.is_walk_in is distinct from false       then raise exception 'RULE FAIL(walkfull): is_walk_in % — a member''s own booking is never a walk-in', r.is_walk_in; end if;
  if r.consumio   is distinct from true        then raise exception 'RULE FAIL(walkfull): consumio % (expected true)', r.consumio; end if;

  select clases_restantes into v_ret from public.clientes where id = c_walk;
  if v_ret <> 4 then raise exception 'RULE FAIL(walkfull): stored clases % after booking, expected 4', v_ret; end if;

  -- The four walk-in rows are untouched by this booking — still asistida/is_walk_in=true.
  select count(*) into v_n from public.reservation
    where class_session_id = s_walkfull and is_walk_in = true and status = 'asistida';
  if v_n <> 4 then raise exception 'RULE FAIL(walkfull): expected 4 untouched walk-in rows, found %', v_n; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- started-class block (#165) — a class that has already begun cannot be booked; atomic
-- ════════════════════════════════════════════════════════════════════════════════
-- The member is valid in every other respect (5 classes, vigente, the session has 20 free seats), so the
-- ONLY thing that can refuse them is the start-time gate — and it must refuse with cancelar_reserva's own
-- sentence, because a member who books late and a member who cancels late are being told the same thing.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_start', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_started uuid := current_setting('t.s_started', true)::uuid;
  c_start   uuid := current_setting('t.c_start', true)::uuid;
  v_clases int; v_n int; raised boolean; v_msg text;
begin
  raised := false;
  begin
    perform public.reservar_clase(s_started);
  exception when others then
    raised := true;
    v_msg := sqlerrm;
  end;
  if not raised then raise exception 'RULE FAIL(started): booking a class that already started did not raise'; end if;
  if v_msg not like 'La clase ya comenz%' then
    raise exception 'RULE FAIL(started): wrong raise for a started class: % (expected cancelar_reserva''s own message)', v_msg;
  end if;
  -- Atomic: the gate sits above every write, so nothing survives the refusal.
  select clases_restantes into v_clases from public.clientes where id = c_start;
  if v_clases <> 5 then raise exception 'RULE FAIL(started): balance moved to % on a rejected booking', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = c_start and class_session_id = s_started;
  if v_n <> 0 then raise exception 'RULE FAIL(started): % reservation rows created on a rejected booking', v_n; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- #237 OPERATOR PATH — everything from here down passes a TARGET as the second argument.
-- ════════════════════════════════════════════════════════════════════════════════
-- The operator books a member who phoned in: the WRITTEN row is the contract, so every column the insert
-- sets is read back. The operator's own balance is asserted too — a body that decremented the CALLER
-- instead of the resolved target would satisfy every other assertion in this block.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  t_fin  uuid := current_setting('t.t_fin', true)::uuid;
  c_op   uuid := current_setting('t.c_op', true)::uuid;
  v_ret int; v_clases int; v_res uuid; v_n int; r record; raised boolean;
begin
  select reservation_id, clases_restantes into v_res, v_ret from public.reservar_clase(s_open, t_fin);
  if v_res is null then raise exception 'RULE FAIL(op book): no reservation returned'; end if;
  if v_ret <> 4 then raise exception 'RULE FAIL(op book): RPC returned clases %, expected 4', v_ret; end if;

  -- The written row, column by column: the SESSION's gym (never the caller's), the TARGET (never the
  -- operator), reservada, and is_walk_in = false — a phone booking IS a reserva (#235), so it must be
  -- indistinguishable from one the member made for themselves. consumio = true is what makes the later
  -- operator cancel refund exactly one class.
  select gym_id, member_id, status, is_walk_in, consumio into r
    from public.reservation where id = v_res;
  if r.gym_id     is distinct from current_setting('t.gym', true)::uuid then raise exception 'RULE FAIL(op book): reservation.gym_id % — not the session gym', r.gym_id; end if;
  if r.member_id  is distinct from t_fin       then raise exception 'RULE FAIL(op book): reservation.member_id % — not the target', r.member_id; end if;
  if r.status     is distinct from 'reservada' then raise exception 'RULE FAIL(op book): status %', r.status; end if;
  if r.is_walk_in is distinct from false       then raise exception 'RULE FAIL(op book): is_walk_in % — an operator booking is a RESERVA, not a walk-in', r.is_walk_in; end if;
  if r.consumio   is distinct from true        then raise exception 'RULE FAIL(op book): consumio % (expected true)', r.consumio; end if;

  -- The TARGET's balance moved by exactly one; the OPERATOR's did not move at all.
  select clases_restantes into v_clases from public.clientes where id = t_fin;
  if v_clases <> 4 then raise exception 'RULE FAIL(op book): target stored clases %, expected 4', v_clases; end if;
  select clases_restantes into v_clases from public.clientes where id = c_op;
  if v_clases <> 5 then raise exception 'RULE FAIL(op book): the OPERATOR''s own balance moved to % — the decrement hit the caller, not the target', v_clases; end if;

  -- duplicate, on the operator path: the same (target, session) again raises; no second consume.
  raised := false;
  begin perform public.reservar_clase(s_open, t_fin); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(op dup): second operator booking of the same session did not raise'; end if;
  select clases_restantes into v_clases from public.clientes where id = t_fin;
  if v_clases <> 4 then raise exception 'RULE FAIL(op dup): target balance moved to % on rejected duplicate', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = t_fin and class_session_id = s_open;
  if v_n <> 1 then raise exception 'RULE FAIL(op dup): expected 1 row for the target, got %', v_n; end if;
end $$;
reset role;

-- ── op: ilimitado target is exempt — books with the NULL balance untouched and consumio = false ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open uuid := current_setting('t.s_open', true)::uuid;
  t_ilim uuid := current_setting('t.t_ilim', true)::uuid;
  v_ret int; v_clases int; v_res uuid; v_consumio boolean;
begin
  select reservation_id, clases_restantes into v_res, v_ret from public.reservar_clase(s_open, t_ilim);
  if v_res is null then raise exception 'RULE FAIL(op ilim): no reservation returned'; end if;
  if v_ret is not null then raise exception 'RULE FAIL(op ilim): RPC returned clases % (expected NULL)', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = t_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(op ilim): stored clases % (expected NULL, never decremented)', v_clases; end if;
  select consumio into v_consumio from public.reservation where id = v_res;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(op ilim): consumio % (expected false — nothing was spent, so a cancel must refund nothing)', v_consumio; end if;
end $$;
reset role;

-- ── op: the four refusals, with their messages — NO staff override of balance, expiry, cupo or time ──
-- Each target is valid in every other respect, so the named message is the only thing that can be raised;
-- asserting it (not merely "it raised") is what proves the operator path took the SHARED guard rather
-- than a forked one. All four are atomic: no row, no balance movement.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open    uuid := current_setting('t.s_open', true)::uuid;
  s_full    uuid := current_setting('t.s_full', true)::uuid;
  s_started uuid := current_setting('t.s_started', true)::uuid;
  t_zero  uuid := current_setting('t.t_zero', true)::uuid;
  t_exp   uuid := current_setting('t.t_exp', true)::uuid;
  t_full  uuid := current_setting('t.t_full', true)::uuid;
  t_start uuid := current_setting('t.t_start', true)::uuid;
  v_clases int; v_n int; v_msg text;
begin
  -- zero balance
  v_msg := null;
  begin perform public.reservar_clase(s_open, t_zero); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'Sin clases disponibles%' then raise exception 'RULE FAIL(op zero): got % (expected Sin clases disponibles)', v_msg; end if;
  select clases_restantes into v_clases from public.clientes where id = t_zero;
  if v_clases <> 0 then raise exception 'RULE FAIL(op zero): balance moved to %', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = t_zero;
  if v_n <> 0 then raise exception 'RULE FAIL(op zero): % rows created on a rejected booking', v_n; end if;

  -- expired package
  v_msg := null;
  begin perform public.reservar_clase(s_open, t_exp); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'Paquete vencido%' then raise exception 'RULE FAIL(op exp): got % (expected Paquete vencido)', v_msg; end if;
  select clases_restantes into v_clases from public.clientes where id = t_exp;
  if v_clases <> 5 then raise exception 'RULE FAIL(op exp): balance moved to %', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = t_exp;
  if v_n <> 0 then raise exception 'RULE FAIL(op exp): % rows created on a rejected booking', v_n; end if;

  -- full class — cupo is not an operator's to override
  v_msg := null;
  begin perform public.reservar_clase(s_full, t_full); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'Clase llena%' then raise exception 'RULE FAIL(op full): got % (expected Clase llena)', v_msg; end if;
  select clases_restantes into v_clases from public.clientes where id = t_full;
  if v_clases <> 5 then raise exception 'RULE FAIL(op full): balance moved to %', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = t_full;
  if v_n <> 0 then raise exception 'RULE FAIL(op full): % rows created on a rejected booking', v_n; end if;

  -- class already started — an operator cannot create a booking in the past either
  v_msg := null;
  begin perform public.reservar_clase(s_started, t_start); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'La clase ya comenz%' then raise exception 'RULE FAIL(op started): got % (expected La clase ya comenzó)', v_msg; end if;
  select clases_restantes into v_clases from public.clientes where id = t_start;
  if v_clases <> 5 then raise exception 'RULE FAIL(op started): balance moved to %', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = t_start;
  if v_n <> 0 then raise exception 'RULE FAIL(op started): % rows created on a rejected booking', v_n; end if;
end $$;
reset role;

-- ── op: row-reuse — a member who changes their mind is not a dead end on the operator path either ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open  uuid := current_setting('t.s_open', true)::uuid;
  t_reuse uuid := current_setting('t.t_reuse', true)::uuid;
  v_clases int;
begin
  perform public.reservar_clase(s_open, t_reuse);
  select clases_restantes into v_clases from public.clientes where id = t_reuse;
  if v_clases <> 4 then raise exception 'SETUP FAIL(op rebook): first operator booking left clases %, expected 4', v_clases; end if;
end $$;
reset role;

-- Flip that booking to cancelada AS THE PRIVILEGED (migration) role, leaving is_walk_in + checked_at
-- DIRTY exactly as the member-path fixture above does — the reuse arm's four-column reset must be proved
-- on this path too, or an operator re-book could hand pasar_lista_sesion a walk-in row that REFUNDS.
update public.reservation
   set status = 'cancelada', cancelled_at = now(), is_walk_in = true, checked_at = now()
 where member_id = current_setting('t.t_reuse', true)::uuid
   and class_session_id = current_setting('t.s_open', true)::uuid;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_open  uuid := current_setting('t.s_open', true)::uuid;
  t_reuse uuid := current_setting('t.t_reuse', true)::uuid;
  v_ret int; v_n int; v_clases int; r record;
begin
  select clases_restantes into v_ret from public.reservar_clase(s_open, t_reuse);
  if v_ret <> 3 then raise exception 'RULE FAIL(op rebook): expected clases 3 after re-book, got %', v_ret; end if;
  select count(*) into v_n from public.reservation where member_id = t_reuse and class_session_id = s_open;
  if v_n <> 1 then raise exception 'RULE FAIL(op rebook): expected 1 row total (reused), got %', v_n; end if;

  select status, is_walk_in, cancelled_at, checked_at, consumio into r
    from public.reservation where member_id = t_reuse and class_session_id = s_open;
  if r.status       is distinct from 'reservada' then raise exception 'RULE FAIL(op rebook): reused row status = %', r.status; end if;
  if r.is_walk_in   is distinct from false       then raise exception 'RULE FAIL(op rebook): stale is_walk_in survived the reuse (%)', r.is_walk_in; end if;
  if r.cancelled_at is not null                  then raise exception 'RULE FAIL(op rebook): cancelled_at not cleared (%)', r.cancelled_at; end if;
  if r.checked_at   is not null                  then raise exception 'RULE FAIL(op rebook): checked_at not cleared (%)', r.checked_at; end if;
  if r.consumio     is distinct from true        then raise exception 'RULE FAIL(op rebook): consumio % (expected true)', r.consumio; end if;

  select clases_restantes into v_clases from public.clientes where id = t_reuse;
  if v_clases <> 3 then raise exception 'RULE FAIL(op rebook): stored clases % after re-book, expected 3', v_clases; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- #237 DENIALS — the new argument is not a privilege hole
-- ════════════════════════════════════════════════════════════════════════════════
-- All three land on s_deny (20 free seats, nobody booked) against t_deny (vigente, 5 classes) or c_b, so
-- NOTHING but the identity gate can refuse them: were the gate missing, each of these would SUCCEED.
-- The messages are asserted because they name WHICH half of the gate fired.

-- ── a plain MEMBER of the gym naming a target — including naming THEMSELVES ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_deny uuid := current_setting('t.s_deny', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  c_fin  uuid := current_setting('t.c_fin', true)::uuid;
  v_msg text;
begin
  v_msg := null;
  begin perform public.reservar_clase(s_deny, t_deny); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'No autorizado%' then
    raise exception 'DENIAL FAIL(non-staff): a plain member booked another member — got % (expected No autorizado)', v_msg;
  end if;

  -- NO SELF-EXCEPTION (#237): naming your own cliente id on the two-argument call is still a staff act.
  -- The member's door is reservar_clase(session) with one argument, and it still works — every member
  -- vector at the top of this file proves it.
  v_msg := null;
  begin perform public.reservar_clase(s_deny, c_fin); exception when others then v_msg := sqlerrm; end;
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
  s_deny uuid := current_setting('t.s_deny', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  v_msg text;
begin
  v_msg := null;
  begin perform public.reservar_clase(s_deny, t_deny); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'No autorizado%' then
    raise exception 'DENIAL FAIL(cross-gym staff): gym B staff booked into gym A — got % (expected No autorizado)', v_msg;
  end if;
end $$;
reset role;

-- ── A TARGET OF ANOTHER GYM: the caller IS legitimately staff, but the cliente is not theirs ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_deny uuid := current_setting('t.s_deny', true)::uuid;
  c_b    uuid := current_setting('t.c_b', true)::uuid;
  v_msg text;
begin
  v_msg := null;
  begin perform public.reservar_clase(s_deny, c_b); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'Cliente no encontrado%' then
    raise exception 'DENIAL FAIL(cross-gym target): a gym-B cliente was bookable into a gym-A class — got % (expected Cliente no encontrado)', v_msg;
  end if;
end $$;
reset role;

-- The denial state is read back AS THE PRIVILEGED ROLE: under RLS neither denied caller can see the rows
-- they failed to write, so "0 rows" measured as them would be vacuously true.
do $$
declare
  s_deny uuid := current_setting('t.s_deny', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  c_b    uuid := current_setting('t.c_b', true)::uuid;
  c_fin  uuid := current_setting('t.c_fin', true)::uuid;
  v_n int; v_clases int;
begin
  select count(*) into v_n from public.reservation where class_session_id = s_deny;
  if v_n <> 0 then raise exception 'DENIAL FAIL: % reservation row(s) landed on the denial session', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = t_deny;
  if v_clases <> 5 then raise exception 'DENIAL FAIL: the denied target''s balance moved to %', v_clases; end if;
  select clases_restantes into v_clases from public.clientes where id = c_b;
  if v_clases <> 5 then raise exception 'DENIAL FAIL: the gym-B cliente''s balance moved to %', v_clases; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 3 then raise exception 'DENIAL FAIL: the self-targeting member''s balance moved to %', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = c_b;
  if v_n <> 0 then raise exception 'DENIAL FAIL: % reservation row(s) written for the gym-B cliente', v_n; end if;
end $$;

select 'reservar_clase rules: OK' as result;
rollback;
