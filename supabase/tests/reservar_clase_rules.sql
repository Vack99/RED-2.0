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
--   * re-book RE-STAMPS THE MOMENT (slice 2 §D6) — that reused row is logically a NEW booking, so it also
--                                  stamps `created_at = now()`. The derived ledger attributes a charge to
--                                  the latest venta whose created_at precedes the charge MOMENT, and for a
--                                  booking that moment IS this column: a member who cancels, renews, and
--                                  re-books would otherwise spend the new pack and have it counted against
--                                  the old one. The fixture BACKDATES the cancelled row ten days — the
--                                  suite runs in one frozen instant, so without that a re-stamp and a
--                                  stale value are indistinguishable — and both identity paths assert it.
--   * started-class block (#165) — a session whose starts_at is already past is rejected with the SAME
--                                  message cancelar_reserva says for a class in this state, one minute
--                                  past its start ('La clase ya comenzó' — since 20260806130000 the two
--                                  cancel paths ALSO have a past tense, 'La clase ya pasó', for a class
--                                  that is fully over; reservar_clase keeps the single sentence, because
--                                  "you cannot book this" is one fact at any distance past the start), and
--                                  atomically: no reservation row, no decrement. The client hides past
--                                  classes; the client is not the rule, and a booking made after the
--                                  class ran is a consumed credit for a seat nobody can occupy. The
--                                  fixture is seeded one minute in the past — the boundary is
--                                  `starts_at <= now()`, an absolute instant, never a gym-local date.
--   * CORTE DE RESERVAS (2026-09-02) — the per-gym booking cutoff: with `gym.corte_reservas` on, a
--                                  MEMBER is refused ('Reservas cerradas para esta clase') once now() has
--                                  reached `corte_reserva(starts, tz)` — 3h before the class, or 22:00 the
--                                  previous gym-local evening for a class starting before 09:00, whichever
--                                  is EARLIER. Staff-on-behalf is exempt. Its own section at the tail of
--                                  this file explains how those vectors are made clock-independent.
--   * book-beyond-entitlement (#244 guard 1) — vence vs the SESSION's date, not just today's: a
--                                  member whose package is still valid TODAY but expires before the
--                                  class's own gym-local date is refused ('Paquete vencido'), same as
--                                  the today-gate; a session dated exactly ON vence still books
--                                  (house rule 'vence-day-valid').
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
  m_gap  uuid := gen_random_uuid();   -- #244 guard 1: vence is TOMORROW, still valid today
  c_fin  uuid; c_ilim uuid; c_zero uuid; c_exp uuid; c_full uuid; c_start uuid; c_walk uuid; c_gap uuid;
  s_open uuid; s_full uuid; s_started uuid; s_walkfull uuid; s_gap_ok uuid; s_gap_bad uuid;
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
  -- A SUITE OWNS ITS FIXTURE STATE. This suite anchors on the real forge row, and 20260826120100 set
  -- that gym's `booking_enabled` to false (the class-only containment switch) — which would refuse
  -- every booking below at setup time and fail the whole file on a product decision that has nothing
  -- to do with the rules under test. Re-enabled explicitly here, transaction-local: the suite is one
  -- BEGIN/ROLLBACK, so the live flag is untouched the moment it finishes. The switch itself is proven
  -- by the dedicated vector at the tail, which flips it off and back on around its own assertions.
  update public.gym set booking_enabled = true where id = v_gym;
  v_today := (now() at time zone v_tz)::date;

  -- auth users for the five acting members
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', m_fin,  'authenticated', 'authenticated', 'rc-fin@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_ilim, 'authenticated', 'authenticated', 'rc-ilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_zero, 'authenticated', 'authenticated', 'rc-zero@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_exp,  'authenticated', 'authenticated', 'rc-exp@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_full, 'authenticated', 'authenticated', 'rc-full@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_start,'authenticated', 'authenticated', 'rc-start@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_walk, 'authenticated', 'authenticated', 'rc-walk@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_gap,  'authenticated', 'authenticated', 'rc-gap@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (m_fin, v_gym, 'member'), (m_ilim, v_gym, 'member'), (m_zero, v_gym, 'member'),
    (m_exp, v_gym, 'member'), (m_full, v_gym, 'member'), (m_start, v_gym, 'member'),
    (m_walk, v_gym, 'member'), (m_gap, v_gym, 'member');

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
  -- #244 guard 1: vence is TOMORROW — still valid TODAY, the exact gap the old today-only gate missed.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC gap', '0000000008', 5, v_today + 1, '8 clases', v_gym, m_gap) returning id into c_gap;

  insert into public.class_type (gym_id, name) values (v_gym, 'RC Metcon') returning id into v_ct;

  -- One instant per session, an hour apart. These four used to share `v_starts` — nothing in this
  -- suite reads their hour, so the collision was incidental — but since the 2026-08-23 slot-exclusivity
  -- ruling (20260823120100) a gym holds at most ONE uncancelled class per instant, so a shared instant
  -- is now a unique_violation at seed time. Staggering keeps every vector's meaning identical: all
  -- four are still ~2 days out, still future, still bookable-or-refused for their own reasons.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 20) returning id into s_open;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts + interval '1 hour', 60, 4) returning id into s_full;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_started, 60, 20) returning id into s_started;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts + interval '2 hours', 60, 4) returning id into s_walkfull;
  -- #244 guard 1: two sessions dated relative to v_gym's OWN local calendar (never a client-side
  -- interval offset) so the vector is exact regardless of what time-of-day the suite runs.
  --   s_gap_ok  — dated v_today+1: the vence DAY ITSELF (house rule 'vence-day-valid') — must book.
  --   s_gap_bad — dated v_today+2: one day past vence — must refuse with 'Paquete vencido'.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, ((v_today + 1) + time '10:00') at time zone v_tz, 60, 20) returning id into s_gap_ok;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, ((v_today + 2) + time '10:00') at time zone v_tz, 60, 20) returning id into s_gap_bad;

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

  -- +3h, for the same slot-exclusivity reason as the four sessions above: its own instant, still future.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts + interval '3 hours', 60, 20) returning id into s_deny;

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
  perform set_config('t.m_gap',      m_gap::text,      true);
  perform set_config('t.c_gap',      c_gap::text,      true);
  perform set_config('t.s_gap_ok',   s_gap_ok::text,   true);
  perform set_config('t.s_gap_bad',  s_gap_bad::text,  true);
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
--
-- created_at is BACKDATED TEN DAYS for slice 2 §D6: the whole suite is one transaction, so now() and
-- every created_at default are the same frozen instant, and a re-stamp would be invisible against a
-- value written moments ago. Ten days out, the first booking's moment is unmistakably older than the
-- re-booking's — and a body that forgot to re-stamp reads as a charge that belongs to whatever pack was
-- live ten days ago.
update public.reservation r
   set status = 'cancelada', cancelled_at = now(), is_walk_in = true, checked_at = now(),
       created_at = now() - interval '10 days'
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
  v_ret  int; v_res uuid; v_n int; v_clases int; r record; v_before timestamptz;
begin
  -- The moment the row carries BEFORE the re-book: the backdated first booking (see the fixture above).
  select created_at into v_before from public.reservation where member_id = c_fin and class_session_id = s_open;
  if v_before is null or v_before >= now() - interval '1 day' then
    raise exception 'SETUP FAIL(rebook): the cancelled row reads created_at % — a re-stamp cannot be observed unless the fixture backdated it (NULL means the member cannot even see their own cancelled row)', v_before;
  end if;

  select reservation_id, clases_restantes into v_res, v_ret from public.reservar_clase(s_open);
  if v_ret <> 3 then raise exception 'RULE FAIL(rebook): expected clases 3 after re-book, got %', v_ret; end if;
  select count(*) into v_n from public.reservation where member_id = c_fin and class_session_id = s_open;
  if v_n <> 1 then raise exception 'RULE FAIL(rebook): expected 1 row total (reused), got %', v_n; end if;

  -- The reuse arm writes FIVE columns (status, is_walk_in, cancelled_at, checked_at, created_at). Read
  -- the row back and assert each — a count-with-filter proves which row, never what it holds (#80 AC4).
  select status, is_walk_in, cancelled_at, checked_at, created_at into r
    from public.reservation where member_id = c_fin and class_session_id = s_open;
  if r.status       is distinct from 'reservada' then raise exception 'RULE FAIL(rebook): reused row status = %', r.status; end if;
  if r.is_walk_in   is distinct from false       then raise exception 'RULE FAIL(rebook): stale is_walk_in survived the reuse (%) — untoggle would refund a booked class', r.is_walk_in; end if;
  if r.cancelled_at is not null                  then raise exception 'RULE FAIL(rebook): cancelled_at not cleared (%)', r.cancelled_at; end if;
  if r.checked_at   is not null                  then raise exception 'RULE FAIL(rebook): checked_at not cleared (%)', r.checked_at; end if;
  -- Slice 2 §D6: the CHARGE MOMENT. now() is the transaction's instant, so `>= now()` accepts now() and
  -- clock_timestamp() alike and refuses the ten-day-old value the row carried in.
  if r.created_at   < now()                      then raise exception 'RULE FAIL(rebook): created_at % survived the re-book (it was %) — this charge would be attributed to whatever pack was live at the FIRST booking', r.created_at, v_before; end if;

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
end $$;
reset role;

-- The four walk-in rows are untouched by the booking — still asistida/is_walk_in=true. Counted AFTER
-- reset role: member RLS shows a member only their own reservations, so under `authenticated` the four
-- walk-ins (other clientes) are invisible and the count reads 0 regardless of the data.
do $$
declare
  s_walkfull uuid := current_setting('t.s_walkfull', true)::uuid;
  v_n int;
begin
  select count(*) into v_n from public.reservation
    where class_session_id = s_walkfull and is_walk_in = true and status = 'asistida';
  if v_n <> 4 then raise exception 'RULE FAIL(walkfull): expected 4 untouched walk-in rows, found %', v_n; end if;
end $$;

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
-- #244 guard 1 — vence vs the SESSION's date, not just today's: a package still valid TODAY can
-- lapse before the class itself happens. m_gap's vence is TOMORROW (v_today + 1).
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_gap', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_gap_bad uuid := current_setting('t.s_gap_bad', true)::uuid;
  s_gap_ok  uuid := current_setting('t.s_gap_ok', true)::uuid;
  c_gap     uuid := current_setting('t.c_gap', true)::uuid;
  v_clases int; v_n int; v_msg text; v_res uuid; v_ret int;
begin
  -- The session is dated the day AFTER vence — refused, atomically, with the SAME message the
  -- today-gate already uses (the package will not cover that class either way).
  v_msg := null;
  begin perform public.reservar_clase(s_gap_bad); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'Paquete vencido%' then
    raise exception 'RULE FAIL(guard1 gap): got % (expected Paquete vencido)', v_msg;
  end if;
  select clases_restantes into v_clases from public.clientes where id = c_gap;
  if v_clases <> 5 then raise exception 'RULE FAIL(guard1 gap): balance moved to % on a rejected booking', v_clases; end if;
  select count(*) into v_n from public.reservation where member_id = c_gap and class_session_id = s_gap_bad;
  if v_n <> 0 then raise exception 'RULE FAIL(guard1 gap): % reservation rows created on a rejected booking', v_n; end if;

  -- The vence DAY ITSELF is valid (house rule 'vence-day-valid') — a session dated exactly on vence
  -- still books normally, same as every other consume-once vector.
  select reservation_id, clases_restantes into v_res, v_ret from public.reservar_clase(s_gap_ok);
  if v_res is null then raise exception 'RULE FAIL(guard1 boundary): no reservation returned for a session dated ON vence'; end if;
  if v_ret <> 4 then raise exception 'RULE FAIL(guard1 boundary): RPC returned clases %, expected 4', v_ret; end if;
  select clases_restantes into v_clases from public.clientes where id = c_gap;
  if v_clases <> 4 then raise exception 'RULE FAIL(guard1 boundary): stored clases %, expected 4', v_clases; end if;
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
-- DIRTY exactly as the member-path fixture above does — the reuse arm's five-column reset must be proved
-- on this path too, or an operator re-book could hand pasar_lista_sesion a walk-in row that REFUNDS, and
-- (§D6) could attribute the new charge to the pack that was live ten days ago.
update public.reservation
   set status = 'cancelada', cancelled_at = now(), is_walk_in = true, checked_at = now(),
       created_at = now() - interval '10 days'
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

  select status, is_walk_in, cancelled_at, checked_at, consumio, created_at into r
    from public.reservation where member_id = t_reuse and class_session_id = s_open;
  if r.status       is distinct from 'reservada' then raise exception 'RULE FAIL(op rebook): reused row status = %', r.status; end if;
  if r.is_walk_in   is distinct from false       then raise exception 'RULE FAIL(op rebook): stale is_walk_in survived the reuse (%)', r.is_walk_in; end if;
  if r.cancelled_at is not null                  then raise exception 'RULE FAIL(op rebook): cancelled_at not cleared (%)', r.cancelled_at; end if;
  if r.checked_at   is not null                  then raise exception 'RULE FAIL(op rebook): checked_at not cleared (%)', r.checked_at; end if;
  if r.consumio     is distinct from true        then raise exception 'RULE FAIL(op rebook): consumio % (expected true)', r.consumio; end if;
  -- §D6: an operator re-book is a booking made NOW, whoever typed it.
  if r.created_at   < now()                      then raise exception 'RULE FAIL(op rebook): created_at % survived the re-book — the charge would be attributed to the pack live at the FIRST booking', r.created_at; end if;

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

-- ════════════════════════════════════════════════════════════════════════════════
-- THE GYM SWITCH (2026-08-26): gym.booking_enabled = false refuses BOTH identity paths.
-- ════════════════════════════════════════════════════════════════════════════════
-- A class-only gym (forge) takes no member bookings at all — every call that lands there took a
-- HOLD against a balance nobody was watching. The switch closes the door at the gym, so it must
-- refuse the member self path AND the operator path alike (#235's rule stands: no staff override),
-- and it must write NOTHING: no reservation row, no decrement, on either arm.
--
-- Runs LAST and toggles the suite's own gym, so no vector above sees the flipped state. It is
-- flipped BACK at the end and a booking is made through the same session — the counter-vector that
-- proves the two refusals came from the switch and not from some other gate closing on s_deny.
do $$
begin
  update public.gym set booking_enabled = false where id = current_setting('t.gym', true)::uuid;
end $$;

-- (i) the MEMBER self path
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare s_deny uuid := current_setting('t.s_deny', true)::uuid; v_msg text;
begin
  v_msg := null;
  begin perform public.reservar_clase(s_deny); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'Reservas deshabilitadas%' then
    raise exception 'RULE FAIL(switch member): a booking landed in a gym with booking_enabled=false — got % (expected Reservas deshabilitadas)', v_msg;
  end if;
end $$;
reset role;

-- (ii) the OPERATOR path — same gym, same refusal. An operator blocked is an operator who marks
-- the roster instead; a staff override here would reopen exactly the door the switch closes.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_deny uuid := current_setting('t.s_deny', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  v_msg text;
begin
  v_msg := null;
  begin perform public.reservar_clase(s_deny, t_deny); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'Reservas deshabilitadas%' then
    raise exception 'RULE FAIL(switch operator): staff booked into a gym with booking_enabled=false — got % (expected Reservas deshabilitadas)', v_msg;
  end if;
end $$;
reset role;

-- The WRITTEN state of both refusals, read privileged (under RLS neither denied caller can see the
-- rows they failed to write, so "0 rows" measured as them would be vacuously true) — then the
-- switch back on, and the same booking succeeding through the same session.
do $$
declare
  v_gym  uuid := current_setting('t.gym', true)::uuid;
  s_deny uuid := current_setting('t.s_deny', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  c_fin  uuid := current_setting('t.c_fin', true)::uuid;
  v_n int; v_clases int;
begin
  select count(*) into v_n from public.reservation where class_session_id = s_deny;
  if v_n <> 0 then raise exception 'RULE FAIL(switch): % reservation row(s) landed while the switch was off', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = t_deny;
  if v_clases <> 5 then raise exception 'RULE FAIL(switch): the refused target''s balance moved to % (expected untouched 5)', v_clases; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fin;
  if v_clases <> 3 then raise exception 'RULE FAIL(switch): the refused member''s balance moved to % (expected untouched 3)', v_clases; end if;

  -- COUNTER-VECTOR: flip it back and the very same operator booking goes through, writing the
  -- ordinary row — so the refusals above are the switch, not a second gate on this session.
  update public.gym set booking_enabled = true where id = v_gym;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_deny uuid := current_setting('t.s_deny', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
begin
  perform public.reservar_clase(s_deny, t_deny);
end $$;
reset role;

do $$
declare
  s_deny uuid := current_setting('t.s_deny', true)::uuid;
  t_deny uuid := current_setting('t.t_deny', true)::uuid;
  v_status text; v_consumio boolean; v_walk boolean; v_clases int;
begin
  select status, consumio, is_walk_in into v_status, v_consumio, v_walk
    from public.reservation where class_session_id = s_deny and member_id = t_deny;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(switch back on): status % (expected reservada)', v_status; end if;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(switch back on): consumio % (expected true)', v_consumio; end if;
  if v_walk is distinct from false then raise exception 'RULE FAIL(switch back on): a phone booking was flagged is_walk_in'; end if;
  select clases_restantes into v_clases from public.clientes where id = t_deny;
  if v_clases <> 4 then raise exception 'RULE FAIL(switch back on): balance % (expected the single consume to 4)', v_clases; end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- CORTE DE RESERVAS — the per-gym booking cutoff (20260902120000)
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- The rule: a MEMBER cannot book once the class is within 3 hours of starting, and a class that
-- starts before 09:00 gym-local closes even earlier, at 22:00 the previous gym-local evening —
-- `public.corte_reserva(starts, tz)` returns the LEAST of the two. Gym-level boolean, default off.
--
-- DETERMINISM IS THE WHOLE DIFFICULTY HERE. Every other vector in this file is clock-independent
-- because its rule is; this one is a race between `now()` and a GYM-LOCAL wall clock, so a fixture
-- written as "a class two hours out" means something different at 07:00 than at 15:00, and a suite
-- built that way would pass or fail by the hour it ran. Two answers, both used below:
--
--   (1) THE FUNCTION, with no clock in it at all — corte_reserva() called on FIXED local starts and
--       compared against an independently constructed expected instant (`(date + time) at time
--       zone tz`, never a re-derivation of the body's own arithmetic). Five vectors, exact forever.
--
--   (2) THE RPC, on fixture gyms whose TIMEZONE is chosen at run time so that the gym-local clock
--       reads a known hour. A fixed-offset zone (`Etc/GMT±N`, DST-free by construction) is picked
--       so gym "noon" sees local 12:xx and gym "late" sees local 23:xx, whatever the suite's own
--       UTC hour is. That is what makes "two hours out" mean "14:xx local" rather than a coin
--       flip, and — on the late gym — lets a class NINE hours away be legitimately blocked, which
--       is the only way to exercise the previous-evening arm through the real RPC. Both gyms
--       assert their local hour at seed time (SETUP FAIL) before any vector runs.
--
-- Vectors: member blocked 2h out; member allowed 4h out; member allowed for tomorrow-08:00 seen
-- from midday (the 22:00 door has not shut yet); STAFF-ON-BEHALF allowed on the very session the
-- member was refused (the desk is exempt — the sharpest counter-vector available: same session,
-- same instant, different caller); the FLAG OFF on that same session with that same member, which
-- now books (so the refusal was the switch, not the session); on the late gym, tomorrow-08:00
-- REFUSED at 23:xx local though the class is ~9h away, with tomorrow-12:00 allowed beside it as the
-- counter-vector; and the PostgREST computed column `class_session.cierre_reservas` agreeing with
-- the function when the flag is on and answering NULL when it is off.

-- ── (c) THE FUNCTION, clock-free ──────────────────────────────────────────────────────────────
do $$
declare
  v_tz  text := 'America/Mexico_City';
  d     date := date '2026-03-10';
  v_got timestamptz;
begin
  -- 15:00 local — the plain 3-hour arm, same day.
  v_got := public.corte_reserva(((d + time '15:00') at time zone v_tz), v_tz);
  if v_got is distinct from ((d + time '12:00') at time zone v_tz) then
    raise exception 'RULE FAIL(corte fn 15:00): got %, expected same-day 12:00 local', v_got;
  end if;

  -- 09:00 local — the BOUNDARY of the early arm (`< 9`, so 09:00 is NOT early): 06:00 the same day,
  -- not 22:00 the night before. A body written `<= 9` fails exactly here.
  v_got := public.corte_reserva(((d + time '09:00') at time zone v_tz), v_tz);
  if v_got is distinct from ((d + time '06:00') at time zone v_tz) then
    raise exception 'RULE FAIL(corte fn 09:00): got %, expected same-day 06:00 local', v_got;
  end if;

  -- 08:59 local — one minute the other side of that boundary: the previous evening's 22:00.
  v_got := public.corte_reserva(((d + time '08:59') at time zone v_tz), v_tz);
  if v_got is distinct from (((d - 1) + time '22:00') at time zone v_tz) then
    raise exception 'RULE FAIL(corte fn 08:59): got %, expected previous-day 22:00 local', v_got;
  end if;

  -- 08:00 local — the named case: previous day 22:00 (ten hours before, not three).
  v_got := public.corte_reserva(((d + time '08:00') at time zone v_tz), v_tz);
  if v_got is distinct from (((d - 1) + time '22:00') at time zone v_tz) then
    raise exception 'RULE FAIL(corte fn 08:00): got %, expected previous-day 22:00 local', v_got;
  end if;

  -- 00:30 local — early, but the 3-hour arm is EARLIER than 22:00 the night before (21:30 vs
  -- 22:00), so `least` must pick it. This is the vector an unconditional previous-22:00 fails: it
  -- would hand a half-past-midnight class a cutoff 30 minutes AFTER the real 3-hour door.
  v_got := public.corte_reserva(((d + time '00:30') at time zone v_tz), v_tz);
  if v_got is distinct from (((d - 1) + time '21:30') at time zone v_tz) then
    raise exception 'RULE FAIL(corte fn 00:30): got %, expected previous-day 21:30 local', v_got;
  end if;
end $$;

-- ── Fixture: two gyms with a chosen local clock ───────────────────────────────────────────────
do $$
declare
  h_utc int := extract(hour from (now() at time zone 'UTC'))::int;
  off_n int;
  off_l int;
  tz_n  text;
  tz_l  text;
  g_n   uuid := gen_random_uuid();   -- local now = 12:xx
  g_l   uuid := gen_random_uuid();   -- local now = 23:xx
  d_n   date;
  d_l   date;
  ct_n  uuid;
  ct_l  uuid;
  m_a   uuid := gen_random_uuid();   -- refused 2h out, then allowed with the flag off
  m_b   uuid := gen_random_uuid();   -- allowed 4h out
  m_c   uuid := gen_random_uuid();   -- allowed for tomorrow 08:00, seen from midday
  op_n  uuid := gen_random_uuid();   -- operator of the noon gym — the staff bypass
  m_l   uuid := gen_random_uuid();   -- refused for tomorrow 08:00, seen from 23:xx
  m_l2  uuid := gen_random_uuid();   -- allowed for tomorrow 12:00, same instant, same gym
  c_a uuid; c_b uuid; c_c uuid; c_l uuid; c_l2 uuid; t_n uuid;
  s_2h uuid; s_4h uuid; s_early uuid; s_l_early uuid; s_l_noon uuid;
begin
  -- `Etc/GMT-N` is UTC+N and `Etc/GMT+N` is UTC−N (the POSIX sign inversion). Both are DST-free,
  -- which is what makes the local hour below exact rather than approximately right twice a year.
  off_n := 12 - h_utc;
  if off_n > 14 then off_n := off_n - 24; end if;
  if off_n < -12 then off_n := off_n + 24; end if;
  off_l := 23 - h_utc;
  if off_l > 14 then off_l := off_l - 24; end if;
  if off_l < -12 then off_l := off_l + 24; end if;
  tz_n := case when off_n = 0 then 'UTC' when off_n > 0 then 'Etc/GMT-' || off_n else 'Etc/GMT+' || (-off_n) end;
  tz_l := case when off_l = 0 then 'UTC' when off_l > 0 then 'Etc/GMT-' || off_l else 'Etc/GMT+' || (-off_l) end;

  if extract(hour from (now() at time zone tz_n))::int <> 12 then
    raise exception 'SETUP FAIL: tz % puts local now at %h, expected 12', tz_n, extract(hour from (now() at time zone tz_n));
  end if;
  if extract(hour from (now() at time zone tz_l))::int <> 23 then
    raise exception 'SETUP FAIL: tz % puts local now at %h, expected 23', tz_l, extract(hour from (now() at time zone tz_l));
  end if;

  insert into public.gym (id, slug, brand_name, timezone, brand_module_id, corte_reservas) values
    (g_n, 'rc-corte-noon', 'RC Corte Noon', tz_n, 'base', true),
    (g_l, 'rc-corte-late', 'RC Corte Late', tz_l, 'base', true);

  d_n := (now() at time zone tz_n)::date;
  d_l := (now() at time zone tz_l)::date;

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', m_a,  'authenticated', 'authenticated', 'rc-corte-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_b,  'authenticated', 'authenticated', 'rc-corte-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_c,  'authenticated', 'authenticated', 'rc-corte-c@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_n, 'authenticated', 'authenticated', 'rc-corte-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_l,  'authenticated', 'authenticated', 'rc-corte-l@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_l2, 'authenticated', 'authenticated', 'rc-corte-l2@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (m_a, g_n, 'member'), (m_b, g_n, 'member'), (m_c, g_n, 'member'),
    (op_n, g_n, 'operator'),
    (m_l, g_l, 'member'), (m_l2, g_l, 'member');

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC corte A', '0000000401', 5, d_n + 20, '8 clases', g_n, m_a) returning id into c_a;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC corte B', '0000000402', 5, d_n + 20, '8 clases', g_n, m_b) returning id into c_b;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC corte C', '0000000403', 5, d_n + 20, '8 clases', g_n, m_c) returning id into c_c;
  -- The staff target carries NO auth_user_id, like every other #237 target: the phone-booking member.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('RC corte target', '0000000404', 5, d_n + 20, '8 clases', g_n) returning id into t_n;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC corte L', '0000000405', 5, d_l + 20, '8 clases', g_l, m_l) returning id into c_l;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('RC corte L2', '0000000406', 5, d_l + 20, '8 clases', g_l, m_l2) returning id into c_l2;

  insert into public.class_type (gym_id, name) values (g_n, 'RC Corte Noon') returning id into ct_n;
  insert into public.class_type (gym_id, name) values (g_l, 'RC Corte Late') returning id into ct_l;

  -- Noon gym (local 12:xx): 2h out is 14:xx local, 4h out is 16:xx — both past 09:00, so both are
  -- governed by the plain 3-hour arm and neither is contaminated by the previous-evening rule.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (g_n, ct_n, now() + interval '2 hours', 60, 20) returning id into s_2h;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (g_n, ct_n, now() + interval '4 hours', 60, 20) returning id into s_4h;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (g_n, ct_n, ((d_n + 1) + time '08:00') at time zone tz_n, 60, 20) returning id into s_early;

  -- Late gym (local 23:xx): tomorrow 08:00 is ~9 hours away and MUST still be refused — its door
  -- shut an hour ago, at 22:00 tonight. Tomorrow 12:00 beside it must not be.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (g_l, ct_l, ((d_l + 1) + time '08:00') at time zone tz_l, 60, 20) returning id into s_l_early;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (g_l, ct_l, ((d_l + 1) + time '12:00') at time zone tz_l, 60, 20) returning id into s_l_noon;

  perform set_config('t.g_n', g_n::text, true);
  perform set_config('t.m_a', m_a::text, true);
  perform set_config('t.m_b', m_b::text, true);
  perform set_config('t.m_c', m_c::text, true);
  perform set_config('t.op_n', op_n::text, true);
  perform set_config('t.m_l', m_l::text, true);
  perform set_config('t.m_l2', m_l2::text, true);
  perform set_config('t.c_a', c_a::text, true);
  perform set_config('t.c_b', c_b::text, true);
  perform set_config('t.c_c', c_c::text, true);
  perform set_config('t.t_n', t_n::text, true);
  perform set_config('t.c_l', c_l::text, true);
  perform set_config('t.c_l2', c_l2::text, true);
  perform set_config('t.s_2h', s_2h::text, true);
  perform set_config('t.s_4h', s_4h::text, true);
  perform set_config('t.s_early', s_early::text, true);
  perform set_config('t.s_l_early', s_l_early::text, true);
  perform set_config('t.s_l_noon', s_l_noon::text, true);
end $$;

-- ── (a) MEMBER, 2 HOURS OUT → REFUSED ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.reservar_clase(current_setting('t.s_2h', true)::uuid);
  exception when others then
    v_raised := true;
    if sqlerrm is distinct from 'Reservas cerradas para esta clase' then
      raise exception 'RULE FAIL(corte a): wrong raise 2h out: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(corte a): a member booked a class 2h before it starts'; end if;
end $$;
reset role;

do $$
declare v_n int; v_c int;
begin
  select count(*) into v_n from public.reservation where class_session_id = current_setting('t.s_2h', true)::uuid;
  if v_n <> 0 then raise exception 'RULE FAIL(corte a): % reservation row(s) landed on a closed class', v_n; end if;
  select clases_restantes into v_c from public.clientes where id = current_setting('t.c_a', true)::uuid;
  if v_c is distinct from 5 then raise exception 'RULE FAIL(corte a): the refused member''s balance moved to % (expected an untouched 5)', v_c; end if;
end $$;

-- ── (b) MEMBER, 4 HOURS OUT → ALLOWED ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_4h', true)::uuid); end $$;
reset role;

do $$
declare v_status text; v_c int;
begin
  select status into v_status from public.reservation
   where class_session_id = current_setting('t.s_4h', true)::uuid
     and member_id = current_setting('t.c_b', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(corte b): status % 4h out (expected reservada)', v_status; end if;
  select clases_restantes into v_c from public.clientes where id = current_setting('t.c_b', true)::uuid;
  if v_c is distinct from 4 then raise exception 'RULE FAIL(corte b): balance % (expected the single consume to 4)', v_c; end if;
end $$;

-- ── (c2) MEMBER, TOMORROW 08:00 SEEN FROM MIDDAY → ALLOWED ────────────────────────────────────
-- The previous-evening arm applies (local hour 8 < 9) and puts the door at 22:00 TONIGHT — which is
-- still ten hours away. The counter-vector to (f) below: same rule, same class hour, opposite
-- verdict, and the only thing that differs is what time it is at the gym.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_c', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_early', true)::uuid); end $$;
reset role;

do $$
declare v_status text;
begin
  select status into v_status from public.reservation
   where class_session_id = current_setting('t.s_early', true)::uuid
     and member_id = current_setting('t.c_c', true)::uuid;
  if v_status is distinct from 'reservada' then
    raise exception 'RULE FAIL(corte c2): tomorrow-08:00 refused at midday (status %) — the 22:00 door had not shut', v_status;
  end if;
end $$;

-- ── (e) STAFF ON BEHALF, THE SAME CLOSED SESSION → ALLOWED ────────────────────────────────────
-- Same session and same instant the member was refused on in (a): the ONLY difference is who is
-- calling. The desk is not subject to the member's closing time.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_n', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.reservar_clase(current_setting('t.s_2h', true)::uuid, current_setting('t.t_n', true)::uuid);
end $$;
reset role;

do $$
declare v_status text; v_consumio boolean; v_walk boolean; v_c int;
begin
  select status, consumio, is_walk_in into v_status, v_consumio, v_walk from public.reservation
   where class_session_id = current_setting('t.s_2h', true)::uuid
     and member_id = current_setting('t.t_n', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(corte e): staff-on-behalf status % on a closed class (expected reservada)', v_status; end if;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(corte e): consumio % (expected true)', v_consumio; end if;
  if v_walk is distinct from false then raise exception 'RULE FAIL(corte e): a phone booking was flagged is_walk_in'; end if;
  select clases_restantes into v_c from public.clientes where id = current_setting('t.t_n', true)::uuid;
  if v_c is distinct from 4 then raise exception 'RULE FAIL(corte e): target balance % (expected the single consume to 4)', v_c; end if;
end $$;

-- ── (d) FLAG OFF, THE SAME SESSION AND THE SAME MEMBER → ALLOWED ──────────────────────────────
-- (a) refused this exact pair. Flip `corte_reservas` off and nothing else, and it books — which is
-- what proves (a) was the cutoff and not some second property of a class two hours out.
do $$
begin
  update public.gym set corte_reservas = false where id = current_setting('t.g_n', true)::uuid;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_2h', true)::uuid); end $$;
reset role;

do $$
declare v_status text; v_c int;
begin
  select status into v_status from public.reservation
   where class_session_id = current_setting('t.s_2h', true)::uuid
     and member_id = current_setting('t.c_a', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(corte d): status % with the flag OFF (expected reservada)', v_status; end if;
  select clases_restantes into v_c from public.clientes where id = current_setting('t.c_a', true)::uuid;
  if v_c is distinct from 4 then raise exception 'RULE FAIL(corte d): balance % (expected the single consume to 4)', v_c; end if;
end $$;

-- ── (h) THE READ SURFACE — class_session.cierre_reservas ──────────────────────────────────────
-- The computed column the member agenda selects. With the flag OFF (where (d) left it) it must be
-- NULL — "this gym runs no cutoff" — and with it back ON it must equal the function the RPC gate
-- calls, on the same row. One rule, one answer, both sides.
do $$
declare v_got timestamptz; v_expect timestamptz;
begin
  select public.cierre_reservas(cs) into v_got
    from public.class_session cs where cs.id = current_setting('t.s_4h', true)::uuid;
  if v_got is not null then raise exception 'RULE FAIL(corte h): cierre_reservas is % with the gym flag off (expected NULL)', v_got; end if;

  update public.gym set corte_reservas = true where id = current_setting('t.g_n', true)::uuid;

  select public.cierre_reservas(cs), public.corte_reserva(cs.starts_at, g.timezone) into v_got, v_expect
    from public.class_session cs join public.gym g on g.id = cs.gym_id
   where cs.id = current_setting('t.s_4h', true)::uuid;
  if v_got is distinct from v_expect then
    raise exception 'RULE FAIL(corte h): cierre_reservas % disagrees with corte_reserva %', v_got, v_expect;
  end if;
end $$;

-- ── (f) THE PREVIOUS-EVENING ARM THROUGH THE RPC → REFUSED NINE HOURS OUT ─────────────────────
-- The late gym reads 23:xx local. Tomorrow's 08:00 class is ~9 hours away — nowhere near the
-- 3-hour window — and must STILL be refused, because its door was 22:00 tonight. A build that
-- implemented only the 3-hour rule passes every other vector in this section and fails this one.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_l', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.reservar_clase(current_setting('t.s_l_early', true)::uuid);
  exception when others then
    v_raised := true;
    if sqlerrm is distinct from 'Reservas cerradas para esta clase' then
      raise exception 'RULE FAIL(corte f): wrong raise for tomorrow 08:00 at 23:00 local: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(corte f): the 22:00 door did not shut — tomorrow''s 08:00 class booked at 23:00'; end if;
end $$;
reset role;

do $$
declare v_n int; v_c int;
begin
  select count(*) into v_n from public.reservation where class_session_id = current_setting('t.s_l_early', true)::uuid;
  if v_n <> 0 then raise exception 'RULE FAIL(corte f): % reservation row(s) landed past the 22:00 door', v_n; end if;
  select clases_restantes into v_c from public.clientes where id = current_setting('t.c_l', true)::uuid;
  if v_c is distinct from 5 then raise exception 'RULE FAIL(corte f): the refused member''s balance moved to % (expected an untouched 5)', v_c; end if;
end $$;

-- ── (g) COUNTER-VECTOR: SAME GYM, SAME INSTANT, A CLASS AT TOMORROW 12:00 → ALLOWED ───────────
-- 12:00 is past 09:00, so the previous-evening arm does not apply at all and the door is 09:00
-- tomorrow — still ten hours away. Without this, (f) would also pass a body that simply refused
-- everything on that gym.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_l2', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_l_noon', true)::uuid); end $$;
reset role;

do $$
declare v_status text; v_c int;
begin
  select status into v_status from public.reservation
   where class_session_id = current_setting('t.s_l_noon', true)::uuid
     and member_id = current_setting('t.c_l2', true)::uuid;
  if v_status is distinct from 'reservada' then
    raise exception 'RULE FAIL(corte g): tomorrow-12:00 refused (status %) — the previous-evening arm must not reach a 12:00 class', v_status;
  end if;
  select clases_restantes into v_c from public.clientes where id = current_setting('t.c_l2', true)::uuid;
  if v_c is distinct from 4 then raise exception 'RULE FAIL(corte g): balance % (expected the single consume to 4)', v_c; end if;
end $$;

select 'reservar_clase rules: OK' as result;
rollback;
