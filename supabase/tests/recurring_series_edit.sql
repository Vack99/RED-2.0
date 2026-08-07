-- Series-edit contract suite — #243, migrations 20260806090000 / 20260806100000 / 20260806100100.
-- docs/Context/2026-08-06-243-series-edit-design.md §4/§5.
--
-- Two operator verbs against the repeating rule, and the whole design turns on the discriminator
-- between them: DOES THE CLASS STILL HAPPEN?
--   * update_recurring_schedule ("esta y las siguientes") — the class still happens, later. The
--     booking moves WITH it, because reservation.class_session_id points at the ROW, not the instant.
--     Zero rows to `reservation`, zero to `clientes`. That absence is the single most important claim
--     in this file and it is asserted directly (status still `reservada`, `clases_restantes`
--     numerically unchanged), never inferred from "no UPDATE statement is present". It returns the
--     RECORD `(moved, kept)` — every call site below reads both columns BY NAME, because those names
--     are the PostgREST contract (`{"moved": N, "kept": M}`), not an implementation detail.
--   * retire_recurring_schedule ("terminar el horario") — the class stops existing, so every held
--     credit is released through the SHIPPED cancel_class_session. One implementation of hold-release.
--
-- WHY THE VALUES ARE ALL DISTINCT FROM THE SEED (19:00/45/24 → 20:00/60/30, ct1 → ct2): a fan-out that
-- dropped `duration_min =` or `capacity =` from its SET list passes every count-based check ever
-- written. #80 AC6 — assert the WRITTEN ROWS, with values that could not have been there already. The
-- same rule is what makes the SKIP vectors meaningful: vector (5) moves t2 to values none of its rows
-- already carry, so "byte-identical" is a real claim about the skipped row and not a tautology.
--
-- VECTORS
--  (1) THE MOVE. Every future non-cancelled session of the series takes the new wall-clock time in the
--      gym's zone, the new duration, capacity and class_type — each re-anchored on ITS OWN ISO week.
--  (2) NOTHING ELSE MOVES. The PAST session and the CANCELLED one are byte-identical afterwards, on
--      every column the fan-out writes plus template_id/cancelled_at.
--  (3) THE SETTLEMENT ASSERTION — the heart of the design. Both bookings on a moved class are still
--      `reservada`, the finite member's balance is numerically unchanged, and the ilimitado NULL was
--      never written. A move that "helpfully" cancelled-and-refunded (the MINIMAL design the judges
--      rejected) fails here and nowhere else.
--  (4) THE COACH SET IS COALESCED, NOT REPLACED — AND IT REACHES THE DATED ROWS. Omitting p_coach_ids
--      leaves both the template's coaches and every class_session_coach row alone; passing one
--      replaces the template's set AND the join rows of exactly the sessions that moved. The agenda
--      reads the DATED join (packages/data/src/server/agenda.ts:131), so a write that stopped at
--      schedule_template_coach would report success while every card kept the old coach.
--  (5) THE PAST-INSTANT GUARD SKIPS. A future class whose RECOMPUTED instant would land in the past is
--      NOT WRITTEN AT ALL — same instant, same class_type, same duration/capacity, and STILL ATTACHED
--      to the template — and is reported as `kept`. Both release paths are shut for a started class
--      ('La clase ya comenzó'), so moving it there would silently destroy every hold on it.
--  (6) THE DUPLICATE-SLOT REFUSAL, in MINIMAL's R5 shape: the identical Spanish sentence
--      create_recurring_schedule raises (one vocabulary, one index), and FULL ROLLBACK — start_time,
--      every starts_at, every reservation status and every balance byte-identical.
-- (11) RETIRE REACHES THE SKIPPED CLASS — the D4 regression. An earlier build DETACHED the class the
--      guard could not move, and a detached class survives "terminar el horario" (retire's loop is
--      `where template_id = ?`) while going on taking bookings for a schedule the confirm dialog said
--      was cancelled in full. Because (5) skips instead, retire cancels it and its member's credit
--      comes back exactly +1, once.
-- (12) A RETIRED RULE REFUSES A MOVE. update_recurring_schedule on the template (11) just retired
--      raises retire's OWN sentence — one fact, one spelling — and writes nothing: the template's
--      start_time, every starts_at, every reservation status and every balance are byte-identical.
-- (13) NO COLLISION AFTER A HAND MOVE. edit_class_session moves a session into the ISO WEEK of its own
--      sibling — the shape that would make two attached rows recompute to the SAME instant and raise a
--      raw 23505 on class_session_template_starts_uq. Because the edit DETACHES (20260806090000 §1),
--      the series move succeeds, touches only the still-attached sibling, and leaves the one-off alone.
--  (7) RETIRE, THE ABORT PATH. A mid-loop failure leaves ZERO balances moved, zero sessions cancelled
--      and the template still active. The refund is not partially applied.
--  (8) RETIRE. is_active flips; every FUTURE non-cancelled class is cancelled; the past one is not;
--      the booked finite member is refunded exactly +1, ONCE; ilimitado stays NULL; an `asistida` row
--      (a CAPTURED hold) stays asistida and is not re-credited.
--  (9) A RETIRED RULE MATERIALIZES NOTHING. ensure_week_materialized for weeks 0..5 each return 0 —
--      and the slot then accepts a fresh create_recurring_schedule, because
--      schedule_template_active_uq is partial on is_active precisely so re-creating IS the un-retire.
-- (10) THE SECOND TAP. A re-retire raises above the loop, and NO balance moves twice.
--
-- ── #243 follow-up: "TODOS LOS DÍAS" (20260806120000 / 20260806120100) ───────────────────────────
-- The owner's walk: "repetir en N días" mints N INDEPENDENT templates and both verbs acted on ONE, so
-- "Terminar el horario" from the Lunes card left Miércoles and Viernes running. `group_id` records the
-- batch; `p_all_days` fans the verb out over it. Vectors (14)-(20) run in gym G (and gym B), never in
-- E or R, so every count those earlier vectors assert still stands.
-- (14a) THE BACKFILL KEY, on the rows that already exist — the half of this feature that decides what
--      happens to every schedule live is already running. 20260806120000's partition expression is
--      re-run as a plain SELECT over fixtures with a known answer: three rows differing only in
--      weekday are ONE group; a row differing in start_time (the pre-group_id per-day hora move) is
--      its own; another gym's identical schedule is its own. All five share one created_at, which is
--      the hard case, not the easy one.
-- (14) GROUP IDENTITY, going forward. A 3-weekday create_recurring_schedule mints exactly ONE group
--      across its three rows, and a template created by any other act is NOT in that group —
--      otherwise "todos los días" would reach a schedule the operator never created with it.
-- (15) THE ALL-DAYS COLLISION IS ATOMIC. A sibling template already occupies the Miércoles member's
--      target slot. The whole call raises, naming the COLLIDING member's weekday (not the anchor's),
--      and the LUNES member — which the loop had already written, since it runs `order by weekday` —
--      is byte-identical afterwards, along with every session, booking and balance.
-- (16) THE ALL-DAYS MOVE. Every member's rule takes the new class_type/time/duration/capacity while
--      KEEPING ITS OWN WEEKDAY; every member's future classes are re-anchored on their own ISO weeks;
--      `moved` is the SUM across members; the coach replace reaches every member's rule and exactly
--      the union of the sessions that moved; and — the settlement claim again, at group scale — every
--      booking is still `reservada` and every balance numerically unchanged.
-- (17) A WEEKDAY MOVE ACROSS A SCHEDULE IS REFUSED. p_weekday with p_all_days would collapse
--      Lun/Mié/Vie onto one day; it raises and writes nothing.
-- (18) THE SINGLE-DAY VERB IS STILL SINGLE-DAY. A p_all_days=false call on one member leaves its
--      sibling's rule, its sibling's sessions and their coach joins byte-identical.
-- (19) THE ALL-DAYS RETIRE. Every member is retired, every future class of every member is cancelled,
--      every consumed hold comes back exactly once, the PAST class is untouched, a template OUTSIDE
--      the group is untouched, and the second tap raises with no balance moving twice.
-- (20) edit_class_session, THE HOLES THE WALK FOUND — and the one the first build of the fix missed.
--      A CANCELLED target refuses ('La clase ya fue cancelada') and stays byte-identical: the
--      stale-tab edit that used to report success against a dead row. A FUTURE class refuses to move
--      to a PAST instant (both release paths shut past the start, so every hold would be stranded).
--      And the REVERSE crossing refuses too when a hold is on it: a forfeit is a ZERO-WRITE outcome
--      derived from starts_at, so dragging a passed class forward re-arms both release gates over a
--      hold the gym already kept — asserted on the BALANCE, not just the row. Both the retro edit
--      (past→past) and the forward move of an UN-BOOKED passed class still succeed: the guard is
--      about the hold, not the direction.
--
-- Vectors (7)-(10) run in their OWN GYM. ensure_week_materialized is gym-wide (it walks every active
-- template of staff_gym()), so vector (9)'s "each week returns 0" is only a statement about the
-- retired template if no other active template shares the gym. Vector (11) also retires — in gym E,
-- deliberately — but it makes no materialization claim, so it needs no such isolation. Vector (14)'s
-- create_recurring_schedule materializes GYM-WIDE for the same reason, which is why it gets gym B to
-- itself instead of running beside gym G's hand-placed fixtures.
--
-- Bookings are made through `reservar_clase` AS EACH MEMBER, never seeded by hand: `consumio` is the
-- entire gate on the refund and the only honest way to get it is the function that stamps it.
--
-- EVERY WRITTEN-ROW ASSERTION READS AFTER `reset role`, as ops. Both RPCs are SECURITY INVOKER, so a
-- count taken under the operator's own JWT is filtered by the very policies under test and a partial
-- write would read as a clean pass. Comparisons use `is distinct from`, never `<>`: a NULL from a
-- mistyped id makes `<>` NULL, which is not true, which silently skips the raise.
--
-- Self-asserting, transaction-local (BEGIN/ROLLBACK), zero prod UUIDs.
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or MCP execute_sql.

begin;

-- ── Seed ─────────────────────────────────────────────────────────────────────────────────────────
-- Every instant is derived from THIS ISO week's local Monday, so the fixture is the same shape
-- whenever the suite runs. now() is the transaction timestamp and is therefore fixed for the whole
-- file — every block below re-derives v_monday from it and gets the identical date.
do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  v_today  date := (now() at time zone v_tz)::date;

  gym_e uuid := gen_random_uuid();   -- the EDIT gym (vectors 1-6, 11-13)
  gym_r uuid := gen_random_uuid();   -- the RETIRE gym (vectors 7-10), isolated for vector (9)
  op_e  uuid := gen_random_uuid();
  op_r  uuid := gen_random_uuid();
  u_fin uuid := gen_random_uuid();
  u_ilim uuid := gen_random_uuid();
  u_gfin uuid := gen_random_uuid();
  u_rfin uuid := gen_random_uuid();
  u_rilim uuid := gen_random_uuid();
  u_rasis uuid := gen_random_uuid();

  ct1 uuid; ct2 uuid; ct_r uuid;
  coach1 uuid; coach2 uuid; coach_r uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid;
  c_fin uuid; c_ilim uuid; c_gfin uuid; c_rfin uuid; c_rilim uuid; c_rasis uuid;
  se_past uuid; se_canc uuid; se_f1 uuid; se_f2 uuid; se_g uuid; se_g2 uuid;
  sr_past uuid; sr_f1 uuid; sr_f2 uuid; sr_f3 uuid;
  v_guard timestamptz;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_e, 'series-edit-gym-e', 'Series Edit Gym E', v_tz, 'forge'),
    (gym_r, 'series-edit-gym-r', 'Series Edit Gym R', v_tz, 'forge');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_e,    'authenticated', 'authenticated', 'se-op-e@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_r,    'authenticated', 'authenticated', 'se-op-r@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_fin,   'authenticated', 'authenticated', 'se-fin@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_ilim,  'authenticated', 'authenticated', 'se-ilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_gfin,  'authenticated', 'authenticated', 'se-gfin@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_rfin,  'authenticated', 'authenticated', 'se-rfin@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_rilim, 'authenticated', 'authenticated', 'se-rilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_rasis, 'authenticated', 'authenticated', 'se-rasis@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_e, gym_e, 'operator'),
    (op_r, gym_r, 'operator'),
    (u_fin, gym_e, 'member'), (u_ilim, gym_e, 'member'), (u_gfin, gym_e, 'member'),
    (u_rfin, gym_r, 'member'), (u_rilim, gym_r, 'member'), (u_rasis, gym_r, 'member');

  insert into public.class_type (gym_id, name) values (gym_e, 'SE Metcon') returning id into ct1;
  insert into public.class_type (gym_id, name) values (gym_e, 'SE Yoga')   returning id into ct2;
  insert into public.class_type (gym_id, name) values (gym_r, 'SE Funcional') returning id into ct_r;
  insert into public.coach (gym_id, name, initials, role) values (gym_e, 'SE Coach Uno', 'C1', 'coach') returning id into coach1;
  insert into public.coach (gym_id, name, initials, role) values (gym_e, 'SE Coach Dos', 'C2', 'coach') returning id into coach2;
  insert into public.coach (gym_id, name, initials, role) values (gym_r, 'SE Coach R',   'CR', 'coach') returning id into coach_r;

  -- t1 — the series under edit: Martes 19:00, 45 min, cupo 24, one default coach.
  -- group_id is NOT NULL with no default since 20260806120000. t1..t4 are four INDEPENDENT schedules,
  -- so each is its own group of one — which is also what makes the p_all_days=false vectors below
  -- statements about scoping rather than accidents of a shared group.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_e, ct1, 1, '19:00', 45, 24, gen_random_uuid()) returning id into t1;
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values (gym_e, t1, coach1);

  -- t2 — the past-instant guard's series (vectors 5, 11, 12). Its OWN weekday/time never matter: the
  -- guard recomputes from each SESSION's own instant, so all that matters is which ISO week its rows
  -- sit in.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_e, ct1, 3, '10:00', 60, 20, gen_random_uuid()) returning id into t2;

  -- t3 — the blocker for vector (6). Deliberately (ct2, Martes, 21:00): it does NOT collide with t1's
  -- seed slot, and only collides once vector (6) tries to move t1 onto it.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_e, ct2, 1, '21:00', 45, 24, gen_random_uuid()) returning id into t3;

  -- t4 — the retired series, alone in its gym (vector 9).
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_r, ct_r, 2, '18:00', 60, 20, gen_random_uuid()) returning id into t4;
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values (gym_r, t4, coach_r);

  -- t1's dated classes, each at the rule's instant for its own week. Week -1 is PAST; week +1 is
  -- CANCELLED; weeks +2/+3 are the movers.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, (((v_monday - 7) + 1) + '19:00'::time) at time zone v_tz, 45, 24, t1) returning id into se_past;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id, cancelled_at)
    values (gym_e, ct1, (((v_monday + 7) + 1) + '19:00'::time) at time zone v_tz, 45, 24, t1, now()) returning id into se_canc;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, (((v_monday + 14) + 1) + '19:00'::time) at time zone v_tz, 45, 24, t1) returning id into se_f1;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, (((v_monday + 21) + 1) + '19:00'::time) at time zone v_tz, 45, 24, t1) returning id into se_f2;

  -- The DATED coach joins, exactly as materialize_week_for_gym writes them (20260805100000:90-92) —
  -- ALL FOUR of t1's classes, including the past and cancelled ones. Vector (4) is only a real claim
  -- about "the moved rows and only the moved rows" if the rows that must NOT change have a coach to
  -- lose, and if the null-coach call has something to leave alone.
  insert into public.class_session_coach (gym_id, session_id, coach_id) values
    (gym_e, se_past, coach1), (gym_e, se_canc, coach1), (gym_e, se_f1, coach1), (gym_e, se_f2, coach1);

  -- t2's two classes. se_g sits at the LAST SECOND of the CURRENT ISO week (Sunday 23:59:59 local) —
  -- the one construction that is simultaneously (a) still in the future whenever this suite runs and
  -- (b) inside a week whose Monday 00:00 is necessarily already past, which is what makes vector (5)
  -- deterministic instead of a function of the wall clock. A precondition below states it outright.
  v_guard := ((v_monday + 7)::timestamp - interval '1 second') at time zone v_tz;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, v_guard, 60, 20, t2) returning id into se_g;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_e, ct1, (((v_monday + 14) + 3) + '10:00'::time) at time zone v_tz, 60, 20, t2) returning id into se_g2;

  -- t4's dated classes: one past (never touched by retire) + three future (all cancelled by it).
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday - 7) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t4) returning id into sr_past;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 7) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t4) returning id into sr_f1;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 14) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t4) returning id into sr_f2;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_r, ct_r, (((v_monday + 21) + 2) + '18:00'::time) at time zone v_tz, 60, 20, t4) returning id into sr_f3;

  -- Members. Finite balances all differ so a "+1 to everyone" bug cannot pass on a shared number.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE finita', '5552200001', 5, v_today + 60, '8 clases', gym_e, u_fin) returning id into c_fin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE ilimitada', '5552200002', null, v_today + 60, 'Ilimitado', gym_e, u_ilim) returning id into c_ilim;
  -- c_gfin books the class the past-instant guard will SKIP — the member vector (11) is about.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE guardada', '5552200006', 3, v_today + 60, '8 clases', gym_e, u_gfin) returning id into c_gfin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE R finita', '5552200003', 7, v_today + 60, '8 clases', gym_r, u_rfin) returning id into c_rfin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE R ilimitada', '5552200004', null, v_today + 60, 'Ilimitado', gym_r, u_rilim) returning id into c_rilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SE R asistida', '5552200005', 9, v_today + 60, '8 clases', gym_r, u_rasis) returning id into c_rasis;

  -- The fixture precondition vectors (5) and (11) rest on. If the suite is started inside the final
  -- second of an ISO week this is the line that says so, instead of a mystifying failure later.
  if v_guard <= now() then
    raise exception 'SEED FAIL: the past-instant guard fixture (% ) is not in the future — run again', v_guard;
  end if;

  perform set_config('t.se_tz',    v_tz,          true);
  perform set_config('t.se_gym_e', gym_e::text,   true);
  perform set_config('t.se_gym_r', gym_r::text,   true);
  perform set_config('t.se_op_e',  op_e::text,    true);
  perform set_config('t.se_op_r',  op_r::text,    true);
  perform set_config('t.se_u_fin',  u_fin::text,  true);
  perform set_config('t.se_u_ilim', u_ilim::text, true);
  perform set_config('t.se_u_gfin', u_gfin::text, true);
  perform set_config('t.se_u_rfin', u_rfin::text, true);
  perform set_config('t.se_u_rilim', u_rilim::text, true);
  perform set_config('t.se_u_rasis', u_rasis::text, true);
  perform set_config('t.se_ct1',   ct1::text,     true);
  perform set_config('t.se_ct2',   ct2::text,     true);
  perform set_config('t.se_ct_r',  ct_r::text,    true);
  perform set_config('t.se_coach1', coach1::text, true);
  perform set_config('t.se_coach2', coach2::text, true);
  perform set_config('t.se_coach_r', coach_r::text, true);
  perform set_config('t.se_t1',    t1::text,      true);
  perform set_config('t.se_t2',    t2::text,      true);
  perform set_config('t.se_t3',    t3::text,      true);
  perform set_config('t.se_t4',    t4::text,      true);
  perform set_config('t.se_c_fin',  c_fin::text,  true);
  perform set_config('t.se_c_ilim', c_ilim::text, true);
  perform set_config('t.se_c_gfin', c_gfin::text, true);
  perform set_config('t.se_c_rfin', c_rfin::text, true);
  perform set_config('t.se_c_rilim', c_rilim::text, true);
  perform set_config('t.se_c_rasis', c_rasis::text, true);
  perform set_config('t.se_past',  se_past::text, true);
  perform set_config('t.se_canc',  se_canc::text, true);
  perform set_config('t.se_f1',    se_f1::text,   true);
  perform set_config('t.se_f2',    se_f2::text,   true);
  perform set_config('t.se_g',     se_g::text,    true);
  perform set_config('t.se_g2',    se_g2::text,   true);
  perform set_config('t.se_sr_past', sr_past::text, true);
  perform set_config('t.se_sr_f1', sr_f1::text,   true);
  perform set_config('t.se_sr_f2', sr_f2::text,   true);
  perform set_config('t.se_sr_f3', sr_f3::text,   true);
end $$;

-- ── Bookings, made AS EACH MEMBER through reservar_clase (it is what stamps `consumio`) ───────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_fin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_ilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_f1', true)::uuid); end $$;
reset role;

-- The booking on the class the guard will SKIP (vector 11): it is what makes "retire still reaches it"
-- a MONEY claim rather than a `cancelled_at` claim.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_gfin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_g', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_rfin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_sr_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_rilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_sr_f1', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_u_rasis', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.se_sr_f1', true)::uuid); end $$;
reset role;

-- c_rasis' booking → `asistida`, the state a CAPTURED hold leaves behind (pasar_lista_sesion's booked
-- branch). Done privileged because the class is next week and this vector is about what RETIRE does
-- to that row, not about how it got there.
do $$
declare v_n int; v_status text; v_consumio boolean;
begin
  update public.reservation set status = 'asistida', checked_at = now()
   where member_id = current_setting('t.se_c_rasis', true)::uuid
     and class_session_id = current_setting('t.se_sr_f1', true)::uuid;

  -- Preconditions, so a later failure is unambiguous about which half broke.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_fin', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SEED FAIL: c_fin expected 4 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'SEED FAIL: c_ilim balance % (expected an untouched NULL)', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_gfin', true)::uuid;
  if v_n is distinct from 2 then raise exception 'SEED FAIL: c_gfin expected 2 after booking, got %', v_n; end if;
  select consumio into v_consumio from public.reservation
   where member_id = current_setting('t.se_c_fin', true)::uuid and class_session_id = current_setting('t.se_f1', true)::uuid;
  if v_consumio is distinct from true then raise exception 'SEED FAIL: the finite booking stamped consumio % (expected true)', v_consumio; end if;

  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rfin', true)::uuid;
  if v_n is distinct from 6 then raise exception 'SEED FAIL: c_rfin expected 6 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rasis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SEED FAIL: c_rasis expected 8 after booking, got %', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rasis', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'asistida' then raise exception 'SEED FAIL: c_rasis row status % (expected asistida)', v_status; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (1)(2)(3) THE MOVE — called as gym-E staff, asserted as ops.
-- 19:00/45/24/ct1 → 20:00/60/30/ct2, weekday untouched (p_weekday omitted).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_moved int; v_kept int;
begin
  -- BY NAME, not `select *`: `moved`/`kept` are the JSON keys the sheet reads, so a silent rename is a
  -- broken client, and this is the only place a suite can catch it.
  select moved, kept into v_moved, v_kept
    from public.update_recurring_schedule(
      current_setting('t.se_t1', true)::uuid, current_setting('t.se_ct2', true)::uuid,
      '20:00'::time, 60, 30);
  if v_moved is distinct from 2 then
    raise exception 'SERIES FAIL(1): update_recurring_schedule moved % session(s) (expected the 2 future, non-cancelled ones)', v_moved;
  end if;
  if v_kept is distinct from 0 then
    raise exception 'SERIES FAIL(1): update_recurring_schedule kept % session(s) (expected 0 — nothing recomputes into the past here)', v_kept;
  end if;
end $$;
reset role;

do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  se_f1 uuid := current_setting('t.se_f1', true)::uuid;
  se_f2 uuid := current_setting('t.se_f2', true)::uuid;
  ct1 uuid := current_setting('t.se_ct1', true)::uuid;
  ct2 uuid := current_setting('t.se_ct2', true)::uuid;
  t1  uuid := current_setting('t.se_t1', true)::uuid;
  r record;
  v_n int; v_status text; v_ts timestamptz;
begin
  -- THE RULE ITSELF.
  select class_type_id, weekday, start_time, duration_min, capacity, is_active into r
    from public.schedule_template where id = t1;
  if r.class_type_id is distinct from ct2 then raise exception 'SERIES FAIL(1): template class_type not written'; end if;
  if r.weekday is distinct from 1 then raise exception 'SERIES FAIL(1): an omitted p_weekday changed the weekday to %', r.weekday; end if;
  if r.start_time is distinct from '20:00'::time then raise exception 'SERIES FAIL(1): template start_time % (expected 20:00)', r.start_time; end if;
  if r.duration_min is distinct from 60 then raise exception 'SERIES FAIL(1): template duration_min % (expected 60)', r.duration_min; end if;
  if r.capacity is distinct from 30 then raise exception 'SERIES FAIL(1): template capacity % (expected 30)', r.capacity; end if;
  if r.is_active is distinct from true then raise exception 'SERIES FAIL(1): an edit retired the template'; end if;

  -- (1) EVERY FUTURE SESSION, re-anchored on ITS OWN week. Asserting the local wall clock AND the
  -- absolute instant: a fan-out that recomputed from the wrong week keeps 20:00 and fails the date.
  for r in select id, starts_at, duration_min, capacity, class_type_id, template_id
             from public.class_session where id in (se_f1, se_f2) loop
    if (r.starts_at at time zone v_tz)::time is distinct from '20:00'::time then
      raise exception 'SERIES FAIL(1): session % is at % local (expected 20:00)', r.id, (r.starts_at at time zone v_tz)::time;
    end if;
    if r.duration_min is distinct from 60 then raise exception 'SERIES FAIL(1): session % duration_min % (expected 60)', r.id, r.duration_min; end if;
    if r.capacity is distinct from 30 then raise exception 'SERIES FAIL(1): session % capacity % (expected 30)', r.id, r.capacity; end if;
    if r.class_type_id is distinct from ct2 then raise exception 'SERIES FAIL(1): session % class_type not written', r.id; end if;
    if r.template_id is distinct from t1 then raise exception 'SERIES FAIL(1): a moved session left the series (template_id %)', r.template_id; end if;
  end loop;
  select starts_at into v_ts from public.class_session where id = se_f1;
  if v_ts is distinct from ((((v_monday + 14) + 1) + '20:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(1): se_f1 landed at % (expected its OWN week''s Martes 20:00)', v_ts;
  end if;
  select starts_at into v_ts from public.class_session where id = se_f2;
  if v_ts is distinct from ((((v_monday + 21) + 1) + '20:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(1): se_f2 landed at % (expected its OWN week''s Martes 20:00)', v_ts;
  end if;

  -- (2) THE PAST SESSION IS BYTE-IDENTICAL. Nothing in the past is touched by either verb.
  select starts_at, duration_min, capacity, class_type_id, template_id, cancelled_at into r
    from public.class_session where id = current_setting('t.se_past', true)::uuid;
  if r.starts_at is distinct from ((((v_monday - 7) + 1) + '19:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(2): the PAST session moved to %', r.starts_at;
  end if;
  if r.duration_min is distinct from 45 or r.capacity is distinct from 24 or r.class_type_id is distinct from ct1 then
    raise exception 'SERIES FAIL(2): the PAST session was rewritten (dur % cap % ct %)', r.duration_min, r.capacity, r.class_type_id;
  end if;
  if r.template_id is distinct from t1 then raise exception 'SERIES FAIL(2): the PAST session was detached from the series'; end if;
  if r.cancelled_at is not null then raise exception 'SERIES FAIL(2): the PAST session was cancelled by an edit'; end if;

  -- …and so is the CANCELLED one. A cancelled instance is the ADR-0010 holiday tombstone; a move that
  -- rewrote it would resurrect a class the operator had already called off, at a new time.
  select starts_at, duration_min, capacity, class_type_id, template_id, cancelled_at into r
    from public.class_session where id = current_setting('t.se_canc', true)::uuid;
  if r.starts_at is distinct from ((((v_monday + 7) + 1) + '19:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(2): the CANCELLED session moved to %', r.starts_at;
  end if;
  if r.duration_min is distinct from 45 or r.capacity is distinct from 24 or r.class_type_id is distinct from ct1 then
    raise exception 'SERIES FAIL(2): the CANCELLED session was rewritten (dur % cap % ct %)', r.duration_min, r.capacity, r.class_type_id;
  end if;
  if r.cancelled_at is null then raise exception 'SERIES FAIL(2): the CANCELLED session was un-cancelled'; end if;

  -- (3) THE SETTLEMENT ASSERTION — the heart of #243. The class still happens, so the booking moved
  -- with it: nobody is un-booked, nobody is refunded, nobody is charged again.
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_fin', true)::uuid and class_session_id = se_f1;
  if v_status is distinct from 'reservada' then
    raise exception 'SERIES FAIL(3): a series MOVE changed a booking to % — the booking must follow the class, not be settled', v_status;
  end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_fin', true)::uuid;
  if v_n is distinct from 4 then
    raise exception 'SERIES FAIL(3): the finite member''s balance moved to % (expected an untouched 4) — a move settles NOTHING', v_n;
  end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_ilim', true)::uuid and class_session_id = se_f1;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(3): the ilimitado booking became %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'SERIES FAIL(3): an ilimitado NULL was written to (%)', v_n; end if;
  -- Nothing at all landed on the two money tables for this gym: 3 bookings, 3 clientes, no more.
  select count(*) into v_n from public.reservation where gym_id = current_setting('t.se_gym_e', true)::uuid;
  if v_n is distinct from 3 then raise exception 'SERIES FAIL(3): % reservation row(s) in the gym (expected the 3 seeded bookings)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (4) THE COACH SET IS COALESCED — AND REACHES THE DATED ROWS. Call 1 above omitted p_coach_ids, so
-- BOTH tables must be untouched. Then an explicit set replaces the template's coaches AND the join
-- rows of exactly the sessions that moved (that DELETE is what the new RLS policy exists for).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_coach uuid; v_n int;
begin
  select count(*) into v_n from public.schedule_template_coach where template_id = current_setting('t.se_t1', true)::uuid;
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(4): omitting p_coach_ids left % coach row(s) (expected the seeded 1)', v_n; end if;
  select coach_id into v_coach from public.schedule_template_coach where template_id = current_setting('t.se_t1', true)::uuid;
  if v_coach is distinct from current_setting('t.se_coach1', true)::uuid then
    raise exception 'SERIES FAIL(4): omitting p_coach_ids REPLACED the coach set — the clicked session''s substitute would overwrite the series';
  end if;

  -- The DATED join, same claim: a null coach set writes class_session_coach zero times, so all four
  -- of t1's classes still carry the seeded coach.
  select count(*) into v_n from public.class_session_coach csc
    join public.class_session cs on cs.id = csc.session_id
   where cs.template_id = current_setting('t.se_t1', true)::uuid
     and csc.coach_id = current_setting('t.se_coach1', true)::uuid;
  if v_n is distinct from 4 then
    raise exception 'SERIES FAIL(4): a null p_coach_ids rewrote the dated coach joins (% of 4 still on the seeded coach)', v_n;
  end if;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_moved int; v_kept int;
begin
  select moved, kept into v_moved, v_kept
    from public.update_recurring_schedule(
      current_setting('t.se_t1', true)::uuid, current_setting('t.se_ct2', true)::uuid,
      '20:00'::time, 60, 30,
      p_coach_ids => array[current_setting('t.se_coach2', true)::uuid]);
  if v_moved is distinct from 2 then raise exception 'SERIES FAIL(4): the coach-bearing call moved % session(s) (expected 2)', v_moved; end if;
  if v_kept is distinct from 0 then raise exception 'SERIES FAIL(4): the coach-bearing call kept % session(s) (expected 0)', v_kept; end if;
end $$;
reset role;

do $$
declare
  se_f1 uuid := current_setting('t.se_f1', true)::uuid;
  se_f2 uuid := current_setting('t.se_f2', true)::uuid;
  coach1 uuid := current_setting('t.se_coach1', true)::uuid;
  coach2 uuid := current_setting('t.se_coach2', true)::uuid;
  gym_e uuid := current_setting('t.se_gym_e', true)::uuid;
  v_coach uuid; v_n int; v_gym uuid; s uuid;
begin
  select count(*) into v_n from public.schedule_template_coach where template_id = current_setting('t.se_t1', true)::uuid;
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(4): after an explicit coach set the template has % coach row(s) (expected 1)', v_n; end if;
  select coach_id, gym_id into v_coach, v_gym from public.schedule_template_coach where template_id = current_setting('t.se_t1', true)::uuid;
  if v_coach is distinct from coach2 then
    raise exception 'SERIES FAIL(4): the coach set was not replaced (still %)', v_coach;
  end if;
  if v_gym is distinct from gym_e then
    raise exception 'SERIES FAIL(4): the replacement coach row carries gym_id % (expected the operator''s gym)', v_gym;
  end if;

  -- THE DATED JOIN — the half the agenda actually reads (agenda.ts:131). A write that stopped at
  -- schedule_template_coach reports "2 clases movidas" while both cards keep showing coach1.
  foreach s in array array[se_f1, se_f2] loop
    select count(*) into v_n from public.class_session_coach where session_id = s;
    if v_n is distinct from 1 then raise exception 'SERIES FAIL(4): moved session % has % coach row(s) (expected exactly the 1 new one)', s, v_n; end if;
    select coach_id, gym_id into v_coach, v_gym from public.class_session_coach where session_id = s;
    if v_coach is distinct from coach2 then
      raise exception 'SERIES FAIL(4): moved session % still carries coach % — the series coach change never reached the agenda', s, v_coach;
    end if;
    if v_gym is distinct from gym_e then raise exception 'SERIES FAIL(4): the dated coach row for % carries gym_id %', s, v_gym; end if;
  end loop;

  -- …and ONLY the moved rows. The past and the cancelled class keep the coach they had.
  foreach s in array array[current_setting('t.se_past', true)::uuid, current_setting('t.se_canc', true)::uuid] loop
    select coach_id into v_coach from public.class_session_coach where session_id = s;
    if v_coach is distinct from coach1 then
      raise exception 'SERIES FAIL(4): session % (past/cancelled) had its coach rewritten to % — the fan-out is not scoped to the movers', s, v_coach;
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (6) THE DUPLICATE-SLOT REFUSAL, in MINIMAL's R5 full-rollback shape.
-- t3 is already active at (ct2, Martes, 21:00); moving t1 onto it must refuse with the sentence
-- create_recurring_schedule already uses — and leave EVERYTHING where it was.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.update_recurring_schedule(
      current_setting('t.se_t1', true)::uuid, current_setting('t.se_ct2', true)::uuid,
      '21:00'::time, 60, 30);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(6): moving a series onto an occupied active slot was accepted'; end if;
  -- The FULL sentence, not a prefix: `like 'Ya existe%'` passes just as happily on a message whose
  -- weekday/time interpolations are empty or off by one, and those are the computed halves.
  if msg is distinct from 'Ya existe un horario activo para esta clase el Martes a las 21:00' then
    raise exception 'SERIES FAIL(6): wrong refusal for a duplicate slot: %', msg;
  end if;
end $$;
reset role;

do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  v_time time; v_ts timestamptz; v_n int; v_status text;
begin
  -- The rule kept its 20:00 (the refusal fires from inside the template UPDATE's own subtransaction).
  select start_time into v_time from public.schedule_template where id = current_setting('t.se_t1', true)::uuid;
  if v_time is distinct from '20:00'::time then raise exception 'SERIES FAIL(6): the refused call left start_time at %', v_time; end if;

  -- Every instant, unchanged.
  select starts_at into v_ts from public.class_session where id = current_setting('t.se_f1', true)::uuid;
  if v_ts is distinct from ((((v_monday + 14) + 1) + '20:00'::time) at time zone v_tz) then raise exception 'SERIES FAIL(6): the refused call moved se_f1 to %', v_ts; end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.se_f2', true)::uuid;
  if v_ts is distinct from ((((v_monday + 21) + 1) + '20:00'::time) at time zone v_tz) then raise exception 'SERIES FAIL(6): the refused call moved se_f2 to %', v_ts; end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.se_past', true)::uuid;
  if v_ts is distinct from ((((v_monday - 7) + 1) + '19:00'::time) at time zone v_tz) then raise exception 'SERIES FAIL(6): the refused call moved the past session to %', v_ts; end if;

  -- Every status and every balance, unchanged.
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_fin', true)::uuid and class_session_id = current_setting('t.se_f1', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(6): the refused call settled a booking (%)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_fin', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SERIES FAIL(6): the refused call moved a balance to %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_ilim', true)::uuid;
  if v_n is not null then raise exception 'SERIES FAIL(6): the refused call wrote % into an ilimitado NULL', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (5) THE PAST-INSTANT GUARD SKIPS. Moving t2 to (Lunes, 00:00) puts the CURRENT week's class at this
-- week's Monday 00:00 — necessarily already past — while the week-+2 class lands on a Monday 00:00
-- that is still ahead. The first must NOT be written AT ALL (both release paths are shut for a started
-- class) and must stay ATTACHED; the second moves; the return is (moved 1, kept 1).
--
-- ct1 → ct2, 60/20 → 90/15: every value the call carries is one neither t2 row already had, so
-- "byte-identical" below is a claim about the skipped row rather than a coincidence (#80 AC6).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_moved int; v_kept int;
begin
  select moved, kept into v_moved, v_kept
    from public.update_recurring_schedule(
      current_setting('t.se_t2', true)::uuid, current_setting('t.se_ct2', true)::uuid,
      '00:00'::time, 90, 15, p_weekday => 0);
  if v_moved is distinct from 1 then
    raise exception 'SERIES FAIL(5): the weekday move reports % moved (expected 1 — the other class cannot legally move)', v_moved;
  end if;
  if v_kept is distinct from 1 then
    raise exception 'SERIES FAIL(5): the weekday move reports % kept (expected the 1 class left in its own horario)', v_kept;
  end if;
end $$;
reset role;

do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  se_g  uuid := current_setting('t.se_g', true)::uuid;
  se_g2 uuid := current_setting('t.se_g2', true)::uuid;
  t2    uuid := current_setting('t.se_t2', true)::uuid;
  r record;
begin
  -- THE SKIPPED ROW, BYTE-IDENTICAL — and STILL ATTACHED. The `template_id` half is the whole D4
  -- regression: an earlier build detached it here, and a detached class survives the retire in (11).
  select starts_at, template_id, class_type_id, duration_min, capacity, cancelled_at into r
    from public.class_session where id = se_g;
  if r.starts_at is distinct from (((v_monday + 7)::timestamp - interval '1 second') at time zone v_tz) then
    raise exception 'SERIES FAIL(5): a class whose new instant is in the PAST was moved to % — every hold on it would be unreleasable', r.starts_at;
  end if;
  if r.class_type_id is distinct from current_setting('t.se_ct1', true)::uuid
     or r.duration_min is distinct from 60 or r.capacity is distinct from 20 then
    raise exception 'SERIES FAIL(5): the skipped class was partially rewritten (ct % dur % cap %) — a kept row is byte-identical or it is nothing',
      r.class_type_id, r.duration_min, r.capacity;
  end if;
  if r.cancelled_at is not null then raise exception 'SERIES FAIL(5): the skipped class was cancelled by a move'; end if;
  if r.template_id is distinct from t2 then
    raise exception 'SERIES FAIL(5): the un-movable class left the rule (template_id %) — "terminar el horario" would never reach it again', r.template_id;
  end if;

  -- ITS SIBLING moved normally: week +2's Monday 00:00, new values, still in the series.
  select starts_at, template_id, class_type_id, duration_min, capacity into r
    from public.class_session where id = se_g2;
  if r.starts_at is distinct from (((v_monday + 14) + '00:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(5): the movable class landed at % (expected week +2 Lunes 00:00)', r.starts_at;
  end if;
  if r.class_type_id is distinct from current_setting('t.se_ct2', true)::uuid
     or r.duration_min is distinct from 90 or r.capacity is distinct from 15 then
    raise exception 'SERIES FAIL(5): the movable class took (ct % dur % cap %) — expected the new values', r.class_type_id, r.duration_min, r.capacity;
  end if;
  if r.template_id is distinct from t2 then
    raise exception 'SERIES FAIL(5): a class that DID move was detached from the rule';
  end if;

  -- The rule itself took the new weekday.
  select weekday, start_time into r from public.schedule_template where id = t2;
  if r.weekday is distinct from 0 or r.start_time is distinct from '00:00'::time then
    raise exception 'SERIES FAIL(5): the template did not take the new weekday/time (% %)', r.weekday, r.start_time;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (11) RETIRE REACHES THE SKIPPED CLASS — the D4 regression, in one vector.
-- t2 still owns BOTH its classes after (5): the one that moved and the one the guard kept. "Terminar
-- el horario" must therefore cancel both and release the hold on the kept one. Under the DETACH build
-- this returned 1, se_g stayed live and bookable for a schedule the confirm dialog said was gone, and
-- c_gfin's class was destroyed with it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.retire_recurring_schedule(current_setting('t.se_t2', true)::uuid);
  if v_n is distinct from 2 then
    raise exception 'SERIES FAIL(11): retire cancelled % class(es) (expected 2 — the mover AND the class the move kept)', v_n;
  end if;
end $$;
reset role;

do $$
declare
  se_g uuid := current_setting('t.se_g', true)::uuid;
  v_n int; v_status text; v_cancelled timestamptz;
begin
  select cancelled_at into v_cancelled from public.class_session where id = se_g;
  if v_cancelled is null then
    raise exception 'SERIES FAIL(11): the class the move KEPT survived "terminar el horario" — it is still live and still bookable for a retired schedule';
  end if;
  select cancelled_at into v_cancelled from public.class_session where id = current_setting('t.se_g2', true)::uuid;
  if v_cancelled is null then raise exception 'SERIES FAIL(11): the moved class survived the retire'; end if;

  -- THE MONEY: exactly +1, once. 3 at seed, 2 after the booking, 3 again once the hold is released.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_gfin', true)::uuid;
  if v_n is distinct from 3 then
    raise exception 'SERIES FAIL(11): the kept class''s member has % (expected 2 + 1 = 3, exactly once)', v_n;
  end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_gfin', true)::uuid and class_session_id = se_g;
  if v_status is distinct from 'cancelada' then raise exception 'SERIES FAIL(11): the released booking is % (expected cancelada)', v_status; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (12) A RETIRED RULE REFUSES A MOVE. Without the `and is_active` pin, this call rewrites the retired
-- template and reports "0 clases movidas" — a success receipt for a schedule that no longer exists and
-- will never materialize again. The sentence is retire's OWN: one fact, one spelling.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.update_recurring_schedule(
      current_setting('t.se_t2', true)::uuid, current_setting('t.se_ct1', true)::uuid,
      '11:00'::time, 45, 24, p_weekday => 4);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(12): a move against a RETIRED schedule was accepted'; end if;
  if msg is distinct from 'Horario no encontrado o ya retirado' then
    raise exception 'SERIES FAIL(12): wrong refusal for a retired schedule: %', msg;
  end if;
end $$;
reset role;

do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  r record; v_ts timestamptz; v_n int; v_status text;
begin
  -- The retired rule kept every value (5) left on it, is_active included.
  select weekday, start_time, duration_min, capacity, is_active into r
    from public.schedule_template where id = current_setting('t.se_t2', true)::uuid;
  if r.weekday is distinct from 0 or r.start_time is distinct from '00:00'::time
     or r.duration_min is distinct from 90 or r.capacity is distinct from 15 or r.is_active is distinct from false then
    raise exception 'SERIES FAIL(12): the refused call rewrote the retired template (wd % t % dur % cap % active %)',
      r.weekday, r.start_time, r.duration_min, r.capacity, r.is_active;
  end if;

  -- Every instant, unchanged.
  select starts_at into v_ts from public.class_session where id = current_setting('t.se_g', true)::uuid;
  if v_ts is distinct from (((v_monday + 7)::timestamp - interval '1 second') at time zone v_tz) then
    raise exception 'SERIES FAIL(12): the refused call moved the kept class to %', v_ts;
  end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.se_g2', true)::uuid;
  if v_ts is distinct from (((v_monday + 14) + '00:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(12): the refused call moved the retired series'' class to %', v_ts;
  end if;

  -- Every status and every balance, unchanged.
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_gfin', true)::uuid and class_session_id = current_setting('t.se_g', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'SERIES FAIL(12): the refused call moved a booking to %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_gfin', true)::uuid;
  if v_n is distinct from 3 then raise exception 'SERIES FAIL(12): the refused call moved a balance to % (expected 3)', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_fin', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SERIES FAIL(12): the refused call moved an unrelated balance to %', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (13) NO COLLISION AFTER A HAND MOVE. se_f1 and se_f2 are t1's week-+2 and week-+3 classes. Move
-- se_f2 BY HAND into week +2 — the same ISO week as its sibling. If edit_class_session had kept
-- template_id (its pre-#243 behaviour, 20260706120100:208), the next series move would recompute BOTH
-- to the same instant and die on class_session_template_starts_uq with a raw 23505 that no operator
-- can clear. Because the edit detaches, the move succeeds, reaches only se_f1, and the hand-placed
-- one-off is left exactly where the operator put it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_e', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  v_moved int; v_kept int;
begin
  -- Week +2, Jueves 08:00 — se_f1's own ISO week, at 90/15/ct1 (values t1's rows do not carry).
  perform public.edit_class_session(
    current_setting('t.se_f2', true)::uuid, current_setting('t.se_ct1', true)::uuid,
    (((v_monday + 14) + 3) + '08:00'::time) at time zone v_tz, 90, 15,
    array[current_setting('t.se_coach1', true)::uuid]);

  select moved, kept into v_moved, v_kept
    from public.update_recurring_schedule(
      current_setting('t.se_t1', true)::uuid, current_setting('t.se_ct2', true)::uuid,
      '18:00'::time, 60, 30);
  if v_moved is distinct from 1 then
    raise exception 'SERIES FAIL(13): the move after a hand edit reports % moved (expected 1 — the one-off left the series)', v_moved;
  end if;
  if v_kept is distinct from 0 then raise exception 'SERIES FAIL(13): the move reports % kept (expected 0)', v_kept; end if;
end $$;
reset role;

do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  se_f2 uuid := current_setting('t.se_f2', true)::uuid;
  r record; v_coach uuid;
begin
  -- THE ONE-OFF, untouched by the series move that ran right past it.
  select starts_at, template_id, class_type_id, duration_min, capacity into r
    from public.class_session where id = se_f2;
  if r.starts_at is distinct from ((((v_monday + 14) + 3) + '08:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(13): the hand-placed class was dragged to % by a series move', r.starts_at;
  end if;
  if r.template_id is not null then raise exception 'SERIES FAIL(13): edit_class_session left the class attached (template_id %)', r.template_id; end if;
  if r.class_type_id is distinct from current_setting('t.se_ct1', true)::uuid
     or r.duration_min is distinct from 90 or r.capacity is distinct from 15 then
    raise exception 'SERIES FAIL(13): the one-off was rewritten (ct % dur % cap %)', r.class_type_id, r.duration_min, r.capacity;
  end if;
  select coach_id into v_coach from public.class_session_coach where session_id = se_f2;
  if v_coach is distinct from current_setting('t.se_coach1', true)::uuid then
    raise exception 'SERIES FAIL(13): the one-off''s coach is % (expected the one the hand edit set)', v_coach;
  end if;

  -- …and the sibling that stayed in the series took the move.
  select starts_at, template_id, duration_min, capacity into r
    from public.class_session where id = current_setting('t.se_f1', true)::uuid;
  if r.starts_at is distinct from ((((v_monday + 14) + 1) + '18:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(13): the still-attached sibling landed at % (expected week +2 Martes 18:00)', r.starts_at;
  end if;
  if r.template_id is distinct from current_setting('t.se_t1', true)::uuid then
    raise exception 'SERIES FAIL(13): the moved sibling left the series';
  end if;
  if r.duration_min is distinct from 60 or r.capacity is distinct from 30 then
    raise exception 'SERIES FAIL(13): the moved sibling took (dur % cap %)', r.duration_min, r.capacity;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (7) RETIRE, THE ABORT PATH. A mid-loop failure must leave ZERO balances moved — the refund is
-- either whole or absent, never half-paid. Forced with a temporary BEFORE UPDATE trigger that raises
-- on the SECOND future class (the loop is `order by starts_at`, so week +1 is settled before week +2
-- is even reached).
--
-- THE TRIGGER REPORTS THE STATE IT INTERRUPTED, and the assertion pins that message exactly. Without
-- it this vector would pass on a fixture that raised on the FIRST iteration — proving only that an
-- aborted transaction rolls back, which Postgres guarantees anyway. `BOOM after 1 cancelled, balance
-- 7` is the claim that matters: one class WAS cancelled and one member HAD been paid back at the
-- instant of the failure, and the assertions below then find both undone. SECURITY DEFINER so the
-- reported counts are the truth rather than what RLS lets the operator see.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('t.se_boom', current_setting('t.se_sr_f2', true), true);

create function public.se_boom_trg() returns trigger language plpgsql security definer as $boom$
declare v_n int; v_bal int;
begin
  if new.id = current_setting('t.se_boom', true)::uuid then
    select count(*) into v_n from public.class_session
     where template_id = new.template_id and cancelled_at is not null;
    select clases_restantes into v_bal from public.clientes
     where id = current_setting('t.se_c_rfin', true)::uuid;
    raise exception 'BOOM after % cancelled, balance %', v_n, v_bal;
  end if;
  return new;
end;
$boom$;
create trigger se_boom before update on public.class_session
  for each row execute function public.se_boom_trg();

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_r', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.retire_recurring_schedule(current_setting('t.se_t4', true)::uuid);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(7): the mid-loop failure fixture did not fire'; end if;
  -- The full sentence: it is what makes this a MID-loop vector rather than a first-iteration one.
  if msg is distinct from 'BOOM after 1 cancelled, balance 7' then
    raise exception 'SERIES FAIL(7): the failure did not land mid-loop with one class already settled (got: %)', msg;
  end if;
end $$;
reset role;

drop trigger se_boom on public.class_session;
drop function public.se_boom_trg();

do $$
declare v_n int; v_active boolean; v_status text;
begin
  select is_active into v_active from public.schedule_template where id = current_setting('t.se_t4', true)::uuid;
  if v_active is distinct from true then raise exception 'SERIES FAIL(7): the aborted retire left the template retired'; end if;
  select count(*) into v_n from public.class_session
   where template_id = current_setting('t.se_t4', true)::uuid and cancelled_at is not null;
  if v_n is distinct from 0 then raise exception 'SERIES FAIL(7): % class(es) stayed cancelled after an aborted retire', v_n; end if;
  -- THE POINT: the first iteration's refund is gone with the rest.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rfin', true)::uuid;
  if v_n is distinct from 6 then raise exception 'SERIES FAIL(7): a balance moved to % across an aborted retire (expected 6)', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rilim', true)::uuid;
  if v_n is not null then raise exception 'SERIES FAIL(7): an ilimitado NULL was written across an aborted retire (%)', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rfin', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(7): a booking stayed % across an aborted retire', v_status; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (8) RETIRE, for real.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_r', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.retire_recurring_schedule(current_setting('t.se_t4', true)::uuid);
  if v_n is distinct from 3 then raise exception 'SERIES FAIL(8): retire cancelled % class(es) (expected the 3 future ones)', v_n; end if;
end $$;
reset role;

do $$
declare
  t4 uuid := current_setting('t.se_t4', true)::uuid;
  v_n int; v_active boolean; v_status text; v_cancelled timestamptz;
begin
  select is_active into v_active from public.schedule_template where id = t4;
  if v_active is distinct from false then raise exception 'SERIES FAIL(8): the template is still active after a retire'; end if;

  -- Every FUTURE class is cancelled…
  select count(*) into v_n from public.class_session
   where template_id = t4 and starts_at > now() and cancelled_at is null;
  if v_n is distinct from 0 then raise exception 'SERIES FAIL(8): % future class(es) survived the retire — still bookable, for a schedule that no longer exists', v_n; end if;
  select count(*) into v_n from public.class_session where template_id = t4 and cancelled_at is not null;
  if v_n is distinct from 3 then raise exception 'SERIES FAIL(8): % class(es) carry cancelled_at (expected exactly the 3 future ones)', v_n; end if;
  -- …and the PAST one is not. Nothing in the past is touched by either verb.
  select cancelled_at into v_cancelled from public.class_session where id = current_setting('t.se_sr_past', true)::uuid;
  if v_cancelled is not null then raise exception 'SERIES FAIL(8): the retire cancelled a class that already happened'; end if;

  -- THE REFUND: exactly +1, once. A loop that paid twice reads 8 here, not 7.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rfin', true)::uuid;
  if v_n is distinct from 7 then raise exception 'SERIES FAIL(8): the finite member''s balance is % (expected 6 + 1 = 7, exactly once)', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rfin', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'SERIES FAIL(8): the released booking is % (expected cancelada)', v_status; end if;

  -- ILIMITADO: the booking releases (state), the NULL is never written (money).
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rilim', true)::uuid;
  if v_n is not null then raise exception 'SERIES FAIL(8): an ilimitado NULL was written to (%) — unlimited means unlimited', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rilim', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'SERIES FAIL(8): the ilimitado booking is % (expected cancelada)', v_status; end if;

  -- ASISTIDA: a CAPTURED hold. The member came; re-crediting it would mint a class out of an
  -- attendance record.
  select status into v_status from public.reservation
   where member_id = current_setting('t.se_c_rasis', true)::uuid and class_session_id = current_setting('t.se_sr_f1', true)::uuid;
  if v_status is distinct from 'asistida' then raise exception 'SERIES FAIL(8): the retire moved an ASISTIDA row to %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rasis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SERIES FAIL(8): the attended member''s balance is % (expected an untouched 8)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (9) A RETIRED RULE MATERIALIZES NOTHING — and its slot is immediately re-creatable.
-- gym R holds exactly this one template, so "0 for every week in the horizon" is a statement about
-- the retirement rather than about which other templates happen to be already materialized.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_r', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_tz     text := current_setting('t.se_tz', true);
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  i int; added int;
begin
  for i in 0 .. 5 loop
    added := public.ensure_week_materialized(v_monday + (i * 7));
    if added is distinct from 0 then
      raise exception 'SERIES FAIL(9): week +% materialized % session(s) from a RETIRED template', i, added;
    end if;
  end loop;

  -- schedule_template_active_uq is PARTIAL on is_active precisely so that re-creating the same slot
  -- IS the un-retire. There is no "un-retire" verb and there must never be one.
  perform public.create_recurring_schedule(
    current_setting('t.se_ct_r', true)::uuid, array[2], '18:00'::time, 60, 20,
    array[current_setting('t.se_coach_r', true)::uuid], 6);
end $$;
reset role;

do $$
declare
  gym_r uuid := current_setting('t.se_gym_r', true)::uuid;
  t4    uuid := current_setting('t.se_t4', true)::uuid;
  v_new uuid; v_n int;
begin
  select count(*) into v_n from public.schedule_template where gym_id = gym_r and is_active;
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(9): gym R has % active template(s) after the re-create (expected 1)', v_n; end if;
  select id into v_new from public.schedule_template where gym_id = gym_r and is_active;
  if v_new is not distinct from t4 then raise exception 'SERIES FAIL(9): the retired template came back to life instead of a new one'; end if;
  select count(*) into v_n from public.class_session where template_id = v_new;
  if v_n is distinct from 6 then raise exception 'SERIES FAIL(9): the re-created schedule materialized % week(s) (expected 6)', v_n; end if;
  -- The retired template's own rows stayed cancelled — the re-create did not resurrect them.
  select count(*) into v_n from public.class_session where template_id = t4 and cancelled_at is null;
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(9): % of the retired series'' classes are live (expected only the past one)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (10) THE SECOND TAP. `where id = ? and is_active` means the re-retire updates nothing and raises
-- ABOVE the loop — which is the whole idempotency argument, asserted on the BALANCE, not the raise.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.se_op_r', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.retire_recurring_schedule(current_setting('t.se_t4', true)::uuid);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(10): a second retire was accepted'; end if;
  if msg is distinct from 'Horario no encontrado o ya retirado' then
    raise exception 'SERIES FAIL(10): wrong raise on a re-retire: %', msg;
  end if;
end $$;
reset role;

do $$
declare v_n int;
begin
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rfin', true)::uuid;
  if v_n is distinct from 7 then raise exception 'SERIES FAIL(10): the balance moved to % after a refused re-retire — DOUBLE REFUND', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.se_c_rasis', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SERIES FAIL(10): the attended member''s balance moved to % after a refused re-retire', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SEED for (14)-(20) — "todos los días". Two fresh gyms, so nothing above can shift underneath.
--   gym G: a hand-placed SCHEDULE — two templates (Lunes + Miércoles) sharing ONE group_id, exactly
--          the shape one "repetir en N días" create mints — with its dated classes pinned to weeks +2
--          and +3 so no recomputed instant can land in the past whichever day the suite runs. The
--          past-instant guard already has its own vector (5); these are about SCOPE.
--   gym B: nothing but the create_recurring_schedule call of vector (14). It gets its own gym because
--          that RPC materializes GYM-WIDE, and beside gym G's fixtures it would stamp extra classes
--          onto the very templates (16)-(19) count.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone v_tz))::date;
  v_today  date := (now() at time zone v_tz)::date;

  gym_g uuid := gen_random_uuid();
  gym_b uuid := gen_random_uuid();
  op_g  uuid := gen_random_uuid();
  op_b  uuid := gen_random_uuid();
  u_ga  uuid := gen_random_uuid();
  u_gb  uuid := gen_random_uuid();

  ct_g1 uuid; ct_g2 uuid; ct_b uuid;
  coach_g1 uuid; coach_g2 uuid; coach_b uuid;
  gid uuid := gen_random_uuid();
  tg_lun uuid; tg_mie uuid; tg_block uuid;
  c_ga uuid; c_gb uuid;
  sg_l2 uuid; sg_l3 uuid; sg_m0 uuid; sg_m2 uuid; sg_m3 uuid;
  sg_canc uuid; sg_past uuid; sg_fut uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_g, 'series-group-gym-g', 'Series Group Gym G', v_tz, 'forge'),
    (gym_b, 'series-group-gym-b', 'Series Group Gym B', v_tz, 'forge');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_g, 'authenticated', 'authenticated', 'sg-op-g@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_b, 'authenticated', 'authenticated', 'sg-op-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_ga, 'authenticated', 'authenticated', 'sg-ga@test.local'),
    ('00000000-0000-0000-0000-000000000000', u_gb, 'authenticated', 'authenticated', 'sg-gb@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_g, gym_g, 'operator'), (op_b, gym_b, 'operator'),
    (u_ga, gym_g, 'member'),   (u_gb, gym_g, 'member');

  insert into public.class_type (gym_id, name) values (gym_g, 'SG Metcon') returning id into ct_g1;
  insert into public.class_type (gym_id, name) values (gym_g, 'SG Yoga')   returning id into ct_g2;
  insert into public.class_type (gym_id, name) values (gym_b, 'SG Batch')  returning id into ct_b;
  insert into public.coach (gym_id, name, initials, role) values (gym_g, 'SG Coach Uno', 'G1', 'coach') returning id into coach_g1;
  insert into public.coach (gym_id, name, initials, role) values (gym_g, 'SG Coach Dos', 'G2', 'coach') returning id into coach_g2;
  insert into public.coach (gym_id, name, initials, role) values (gym_b, 'SG Coach B',   'GB', 'coach') returning id into coach_b;

  -- THE SCHEDULE: two rules, one group. Same class type, time, duration and capacity; different
  -- weekday — the exact shape a "repetir Lunes y Miércoles" create leaves behind.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_g, ct_g1, 0, '19:00', 45, 24, gid) returning id into tg_lun;
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_g, ct_g1, 2, '19:00', 45, 24, gid) returning id into tg_mie;
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values
    (gym_g, tg_lun, coach_g1), (gym_g, tg_mie, coach_g1);

  -- tg_block — deliberately NOT in the group, and doing double duty: it occupies (ct_g2, Miércoles,
  -- 20:00), which is free of every seed slot and collides only once (15) aims the schedule at it; and
  -- it is (19)'s scope probe, because an all-days retire that reached it would be retiring by gym
  -- rather than by group.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_g, ct_g2, 2, '20:00', 60, 30, gen_random_uuid()) returning id into tg_block;

  -- The dated classes. Weeks +2/+3 per member, plus ONE past class on the Miércoles member so
  -- "nothing in the past" is a claim about this verb too and not an inherited one.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_g, ct_g1, ((v_monday + 14) + '19:00'::time) at time zone v_tz, 45, 24, tg_lun) returning id into sg_l2;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_g, ct_g1, ((v_monday + 21) + '19:00'::time) at time zone v_tz, 45, 24, tg_lun) returning id into sg_l3;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_g, ct_g1, (((v_monday - 7) + 2) + '19:00'::time) at time zone v_tz, 45, 24, tg_mie) returning id into sg_m0;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_g, ct_g1, (((v_monday + 14) + 2) + '19:00'::time) at time zone v_tz, 45, 24, tg_mie) returning id into sg_m2;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_g, ct_g1, (((v_monday + 21) + 2) + '19:00'::time) at time zone v_tz, 45, 24, tg_mie) returning id into sg_m3;

  -- The DATED coach joins, as the materializer writes them — including the past class, which is what
  -- makes (16)'s "exactly the union of the movers" a real claim about the coach fan-out.
  insert into public.class_session_coach (gym_id, session_id, coach_id) values
    (gym_g, sg_l2, coach_g1), (gym_g, sg_l3, coach_g1),
    (gym_g, sg_m0, coach_g1), (gym_g, sg_m2, coach_g1), (gym_g, sg_m3, coach_g1);

  -- (20)'s three one-offs. template_id is null on all three — they belong to no rule, so no series
  -- verb above or below can touch them and each vector is about edit_class_session alone.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, cancelled_at)
    values (gym_g, ct_g1, (((v_monday + 14) + 1) + '12:00'::time) at time zone v_tz, 45, 24, now()) returning id into sg_canc;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_g, ct_g1, (((v_monday - 7) + 1) + '12:00'::time) at time zone v_tz, 45, 24) returning id into sg_past;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_g, ct_g1, (((v_monday + 14) + 1) + '13:00'::time) at time zone v_tz, 45, 24) returning id into sg_fut;

  -- Two members, different balances, one booking each on a DIFFERENT member of the schedule: the move
  -- must leave both numerically alone and the retire must pay both back exactly once.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SG Lunes', '5552300001', 5, v_today + 60, '8 clases', gym_g, u_ga) returning id into c_ga;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SG Miércoles', '5552300002', 8, v_today + 60, '8 clases', gym_g, u_gb) returning id into c_gb;

  perform set_config('t.sg_gym_g', gym_g::text, true);
  perform set_config('t.sg_gym_b', gym_b::text, true);
  perform set_config('t.sg_op_g',  op_g::text,  true);
  perform set_config('t.sg_op_b',  op_b::text,  true);
  perform set_config('t.sg_u_ga',  u_ga::text,  true);
  perform set_config('t.sg_u_gb',  u_gb::text,  true);
  perform set_config('t.sg_ct_g1', ct_g1::text, true);
  perform set_config('t.sg_ct_g2', ct_g2::text, true);
  perform set_config('t.sg_ct_b',  ct_b::text,  true);
  perform set_config('t.sg_coach_g1', coach_g1::text, true);
  perform set_config('t.sg_coach_g2', coach_g2::text, true);
  perform set_config('t.sg_coach_b',  coach_b::text,  true);
  perform set_config('t.sg_gid',   gid::text,   true);
  perform set_config('t.sg_lun',   tg_lun::text, true);
  perform set_config('t.sg_mie',   tg_mie::text, true);
  perform set_config('t.sg_block', tg_block::text, true);
  perform set_config('t.sg_c_ga',  c_ga::text,  true);
  perform set_config('t.sg_c_gb',  c_gb::text,  true);
  perform set_config('t.sg_l2',    sg_l2::text, true);
  perform set_config('t.sg_l3',    sg_l3::text, true);
  perform set_config('t.sg_m0',    sg_m0::text, true);
  perform set_config('t.sg_m2',    sg_m2::text, true);
  perform set_config('t.sg_m3',    sg_m3::text, true);
  perform set_config('t.sg_canc',  sg_canc::text, true);
  perform set_config('t.sg_past',  sg_past::text, true);
  perform set_config('t.sg_fut',   sg_fut::text,  true);
end $$;

-- The two bookings, made AS EACH MEMBER through reservar_clase — `consumio` is the entire gate on the
-- refund and the only honest way to stamp it is the function that stamps it.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_u_ga', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.sg_l2', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_u_gb', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.sg_m2', true)::uuid); end $$;
reset role;

do $$
declare v_n int;
begin
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_ga', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SEED FAIL: c_ga expected 4 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_gb', true)::uuid;
  if v_n is distinct from 7 then raise exception 'SEED FAIL: c_gb expected 7 after booking, got %', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (14a) THE BACKFILL KEY. What the backfill in 20260806120000 does to rows that ALREADY existed —
-- which is every schedule live is running — is decided entirely by its partition expression, and that
-- expression is a judgement call with a live-probed trade behind it (that migration's header). So the
-- expression is re-run HERE as a plain SELECT over fixtures whose right answer is known by
-- construction.
--
-- An earlier revision asserted `count(*) where group_id is null = 0` and called it the backfill
-- vector. On a NOT NULL column that check cannot fail, in any build, ever — it covered nothing.
--
-- The fixtures are the HARD case, not an easy one: every row this suite inserts shares one created_at
-- (it is the transaction timestamp), exactly the condition the backfill meets inside a seed
-- transaction, where created_at alone would fuse an entire gym's grid into one group.
--   * three rows differing ONLY in weekday   → one batch, ONE group   (the "repetir en N días" shape)
--   * one row differing in start_time        → its OWN group          (the pre-group_id per-day hora
--                                                                      move; live carries exactly one)
--   * one row in ANOTHER GYM, same values    → its OWN group          (tenant isolation)
-- Scoping the SELECT to the two fixture gyms is faithful to the real backfill because gym_id LEADS
-- the partition: a partition can never span gyms, which is the third bullet.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  gym_k  uuid := gen_random_uuid();
  gym_k2 uuid := gen_random_uuid();
  ct_k uuid; ct_o uuid;
  t_k0 uuid; t_k2 uuid; t_k4 uuid; t_kx uuid; t_o uuid;
  v_sizes int[];
  g_k0 uuid; g_k2 uuid; g_k4 uuid; g_x uuid; g_o uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_k,  'series-key-gym-k',  'Series Key Gym K',  'America/Mexico_City', 'forge'),
    (gym_k2, 'series-key-gym-k2', 'Series Key Gym K2', 'America/Mexico_City', 'forge');
  insert into public.class_type (gym_id, name) values (gym_k,  'SK Metcon') returning id into ct_k;
  insert into public.class_type (gym_id, name) values (gym_k2, 'SK Metcon') returning id into ct_o;

  -- THE BATCH — one "repetir Lun/Mié/Vie": identical on every key column but weekday.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_k, ct_k, 0, '07:00', 60, 20, gen_random_uuid()) returning id into t_k0;
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_k, ct_k, 2, '07:00', 60, 20, gen_random_uuid()) returning id into t_k2;
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_k, ct_k, 4, '07:00', 60, 20, gen_random_uuid()) returning id into t_k4;
  -- THE DIVERGED DAY — the shape a per-day hora move made BEFORE group_id existed leaves behind.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_k, ct_k, 1, '08:00', 60, 20, gen_random_uuid()) returning id into t_kx;
  -- ANOTHER TENANT, same weekday and the same values.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_k2, ct_o, 0, '07:00', 60, 20, gen_random_uuid()) returning id into t_o;

  -- The migration's OWN expression, verbatim, as a read.
  with grp as (
    select id,
           min(id::text) over (
             partition by gym_id, class_type_id, start_time, duration_min, capacity, created_at
           )::uuid as derived
      from public.schedule_template
     where gym_id in (gym_k, gym_k2)
  )
  select array_agg(c order by c desc) into v_sizes
    from (select derived, count(*)::int c from grp group by derived) s;
  if v_sizes is distinct from array[3, 1, 1] then
    raise exception 'SERIES FAIL(14a): the backfill key partitions these 5 rules as % (expected {3,1,1})', v_sizes;
  end if;

  with grp as (
    select id,
           min(id::text) over (
             partition by gym_id, class_type_id, start_time, duration_min, capacity, created_at
           )::uuid as derived
      from public.schedule_template
     where gym_id in (gym_k, gym_k2)
  )
  select (select derived from grp where id = t_k0), (select derived from grp where id = t_k2),
         (select derived from grp where id = t_k4), (select derived from grp where id = t_kx),
         (select derived from grp where id = t_o)
    into g_k0, g_k2, g_k4, g_x, g_o;

  if g_k0 is distinct from g_k2 or g_k0 is distinct from g_k4 then
    raise exception 'SERIES FAIL(14a): the three weekdays of ONE create derived groups % / % / % — "todos los días" would reach one card',
      g_k0, g_k2, g_k4;
  end if;
  if g_x is not distinct from g_k0 then
    raise exception 'SERIES FAIL(14a): a rule differing in start_time joined the batch''s group — a per-day hora move would drag the untouched days back onto its values';
  end if;
  if g_o is not distinct from g_k0 then
    raise exception 'SERIES FAIL(14a): ANOTHER GYM''s identical schedule landed in this group — "Terminar el horario" would cross a tenant boundary';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (14) GROUP IDENTITY, going forward. The whole feature rests on one claim: rows created together
-- share a group_id, and rows created apart do not. A create that minted N groups leaves "todos los
-- días" reaching one weekday — the bug this slice exists to close, with the button now lying about it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.create_recurring_schedule(
    current_setting('t.sg_ct_b', true)::uuid, array[0, 2, 4], '07:00'::time, 60, 20,
    array[current_setting('t.sg_coach_b', true)::uuid], 6);
end $$;
reset role;

do $$
declare
  gym_b uuid := current_setting('t.sg_gym_b', true)::uuid;
  v_n int; v_group uuid;
begin
  -- (b) ONE BATCH, ONE GROUP, THREE WEEKDAYS.
  select count(*) into v_n from public.schedule_template where gym_id = gym_b;
  if v_n is distinct from 3 then raise exception 'SERIES FAIL(14): the 3-weekday create left % template row(s)', v_n; end if;
  select count(distinct group_id) into v_n from public.schedule_template where gym_id = gym_b;
  if v_n is distinct from 1 then
    raise exception 'SERIES FAIL(14): a 3-weekday create minted % group(s) (expected 1) — "todos los días" would reach only the clicked card', v_n;
  end if;
  select count(distinct weekday) into v_n from public.schedule_template where gym_id = gym_b;
  if v_n is distinct from 3 then raise exception 'SERIES FAIL(14): the batch holds % distinct weekday(s) (expected 3)', v_n; end if;

  -- (c) AND NOTHING ELSE IS IN IT. tg_block was created on its own, so a group it shared with the
  -- hand-placed schedule would make "todos los días" reach a schedule the operator never created.
  select group_id into v_group from public.schedule_template where id = current_setting('t.sg_block', true)::uuid;
  if v_group is not distinct from current_setting('t.sg_gid', true)::uuid then
    raise exception 'SERIES FAIL(14): an unrelated template shares the schedule''s group';
  end if;
  select count(distinct group_id) into v_n from public.schedule_template
   where id in (current_setting('t.sg_lun', true)::uuid, current_setting('t.sg_mie', true)::uuid);
  if v_n is distinct from 1 then raise exception 'SERIES FAIL(14): the fixture schedule''s two weekdays are in % groups', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (17) A WEEKDAY MOVE ACROSS A WHOLE SCHEDULE IS REFUSED. Each member IS its own weekday, so
-- "move Lun/Mié to Jueves" would collapse the schedule onto one day (and self-collide on
-- schedule_template_active_uq). Refused explicitly rather than silently ignored — a dropped parameter
-- is how a UI ships a control that does nothing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op_g', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.update_recurring_schedule(
      current_setting('t.sg_lun', true)::uuid, current_setting('t.sg_ct_g2', true)::uuid,
      '21:00'::time, 60, 30, p_weekday => 3, p_all_days => true);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(17): a weekday move across a whole schedule was accepted'; end if;
  if msg is distinct from 'No se puede cambiar el día al editar todo el horario' then
    raise exception 'SERIES FAIL(17): wrong refusal for a weekday move across a schedule: %', msg;
  end if;
end $$;
reset role;

do $$
declare r record;
begin
  select class_type_id, weekday, start_time, duration_min, capacity into r
    from public.schedule_template where id = current_setting('t.sg_lun', true)::uuid;
  if r.class_type_id is distinct from current_setting('t.sg_ct_g1', true)::uuid
     or r.weekday is distinct from 0 or r.start_time is distinct from '19:00'::time
     or r.duration_min is distinct from 45 or r.capacity is distinct from 24 then
    raise exception 'SERIES FAIL(17): the refused call wrote the Lunes rule (ct % wd % t % dur % cap %)',
      r.class_type_id, r.weekday, r.start_time, r.duration_min, r.capacity;
  end if;
  select weekday, start_time into r from public.schedule_template where id = current_setting('t.sg_mie', true)::uuid;
  if r.weekday is distinct from 2 or r.start_time is distinct from '19:00'::time then
    raise exception 'SERIES FAIL(17): the refused call wrote the Miércoles rule (wd % t %)', r.weekday, r.start_time;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (15) THE ALL-DAYS COLLISION NAMES THE RIGHT DAY.
-- tg_block already owns (ct_g2, Miércoles, 20:00). The loop runs `order by weekday`, so the LUNES
-- member is written first and the MIÉRCOLES member is what raises — and the sentence must say
-- Miércoles. Naming the anchor's Lunes would send the operator to change a day that was never in the
-- way, which is the one thing this vector can actually detect.
--
-- IT DOES NOT CLAIM ATOMICITY. The call sits in a BEGIN…EXCEPTION block, which is an implicit
-- subtransaction, so Postgres rolls back everything the function wrote before any assertion below
-- runs — "no member row changed" would be true of a completely non-atomic function too. An earlier
-- revision raised 'the call is not atomic' here and could never have fired. The state checks that
-- remain are cheap regression cover in the shape vector (6) already uses, and are read as exactly
-- that.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op_g', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.update_recurring_schedule(
      current_setting('t.sg_lun', true)::uuid, current_setting('t.sg_ct_g2', true)::uuid,
      '20:00'::time, 60, 30, p_all_days => true);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(15): an all-days move onto an occupied slot was accepted'; end if;
  if msg is distinct from 'Ya existe un horario activo para esta clase el Miércoles a las 20:00' then
    raise exception 'SERIES FAIL(15): wrong refusal for the colliding member (%) — the sentence must name the day that actually collided', msg;
  end if;
end $$;
reset role;

do $$
declare
  v_tz  text := 'America/Mexico_City';
  ct_g1 uuid := current_setting('t.sg_ct_g1', true)::uuid;
  r record; v_n int; v_status text;
begin
  select class_type_id, start_time into r from public.schedule_template where id = current_setting('t.sg_mie', true)::uuid;
  if r.class_type_id is distinct from ct_g1 or r.start_time is distinct from '19:00'::time then
    raise exception 'SERIES FAIL(15): the colliding Miércoles rule was written anyway';
  end if;

  -- Every dated class, still at 19:00 in its own week.
  select count(*) into v_n from public.class_session
   where template_id in (current_setting('t.sg_lun', true)::uuid, current_setting('t.sg_mie', true)::uuid)
     and (starts_at at time zone v_tz)::time is distinct from '19:00'::time;
  if v_n is distinct from 0 then raise exception 'SERIES FAIL(15): % class(es) moved across a refused all-days call', v_n; end if;

  -- Every booking and every balance, byte-identical.
  select status into v_status from public.reservation
   where member_id = current_setting('t.sg_c_ga', true)::uuid and class_session_id = current_setting('t.sg_l2', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(15): the refused call settled a booking (%)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_ga', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SERIES FAIL(15): the refused call moved a balance to %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_gb', true)::uuid;
  if v_n is distinct from 7 then raise exception 'SERIES FAIL(15): the refused call moved a balance to %', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (16) THE ALL-DAYS MOVE. 19:00/45/24/ct_g1 → 21:00/60/30/ct_g2 with a new coach, across BOTH
-- weekdays in ONE call: every value differs from what either member's rows already carried, so every
-- "was written" below is a real claim (#80 AC6). Each member KEEPS ITS OWN WEEKDAY — Lunes stays
-- Lunes — and `moved` is the SUM over members, 4, not one member's 2.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op_g', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_moved int; v_kept int;
begin
  select moved, kept into v_moved, v_kept
    from public.update_recurring_schedule(
      current_setting('t.sg_lun', true)::uuid, current_setting('t.sg_ct_g2', true)::uuid,
      '21:00'::time, 60, 30,
      p_coach_ids => array[current_setting('t.sg_coach_g2', true)::uuid], p_all_days => true);
  if v_moved is distinct from 4 then
    raise exception 'SERIES FAIL(16): the all-days move reports % moved (expected 4 — BOTH weekdays'' future classes)', v_moved;
  end if;
  if v_kept is distinct from 0 then
    raise exception 'SERIES FAIL(16): the all-days move reports % kept (expected 0 — every fixture class is two weeks out)', v_kept;
  end if;
end $$;
reset role;

do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone 'America/Mexico_City'))::date;
  ct_g2  uuid := current_setting('t.sg_ct_g2', true)::uuid;
  tg_lun uuid := current_setting('t.sg_lun', true)::uuid;
  tg_mie uuid := current_setting('t.sg_mie', true)::uuid;
  coach_g2 uuid := current_setting('t.sg_coach_g2', true)::uuid;
  r record; v_ts timestamptz; v_n int; v_status text; v_coach uuid; s uuid;
begin
  -- BOTH RULES took the edit, and each kept its OWN weekday. A fan-out that wrote the anchor's
  -- weekday onto the group collapses Lunes and Miércoles onto one day here.
  select class_type_id, weekday, start_time, duration_min, capacity, is_active into r
    from public.schedule_template where id = tg_lun;
  if r.class_type_id is distinct from ct_g2 or r.weekday is distinct from 0
     or r.start_time is distinct from '21:00'::time or r.duration_min is distinct from 60
     or r.capacity is distinct from 30 or r.is_active is distinct from true then
    raise exception 'SERIES FAIL(16): the Lunes rule reads (ct % wd % t % dur % cap % active %)',
      r.class_type_id, r.weekday, r.start_time, r.duration_min, r.capacity, r.is_active;
  end if;
  select class_type_id, weekday, start_time, duration_min, capacity, is_active into r
    from public.schedule_template where id = tg_mie;
  if r.class_type_id is distinct from ct_g2 or r.weekday is distinct from 2
     or r.start_time is distinct from '21:00'::time or r.duration_min is distinct from 60
     or r.capacity is distinct from 30 or r.is_active is distinct from true then
    raise exception 'SERIES FAIL(16): the Miércoles rule reads (ct % wd % t % dur % cap % active %)',
      r.class_type_id, r.weekday, r.start_time, r.duration_min, r.capacity, r.is_active;
  end if;

  -- EVERY FUTURE CLASS OF EVERY MEMBER, re-anchored on its own ISO week and its own weekday.
  select starts_at into v_ts from public.class_session where id = current_setting('t.sg_l2', true)::uuid;
  if v_ts is distinct from (((v_monday + 14) + '21:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(16): the Lunes week-+2 class landed at %', v_ts;
  end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.sg_l3', true)::uuid;
  if v_ts is distinct from (((v_monday + 21) + '21:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(16): the Lunes week-+3 class landed at %', v_ts;
  end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.sg_m2', true)::uuid;
  if v_ts is distinct from ((((v_monday + 14) + 2) + '21:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(16): the Miércoles week-+2 class landed at % (expected its own Miércoles, not the anchor''s Lunes)', v_ts;
  end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.sg_m3', true)::uuid;
  if v_ts is distinct from ((((v_monday + 21) + 2) + '21:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(16): the Miércoles week-+3 class landed at %', v_ts;
  end if;
  for r in select id, class_type_id, duration_min, capacity, template_id from public.class_session
            where id in (current_setting('t.sg_l2', true)::uuid, current_setting('t.sg_l3', true)::uuid,
                         current_setting('t.sg_m2', true)::uuid, current_setting('t.sg_m3', true)::uuid) loop
    if r.class_type_id is distinct from ct_g2 or r.duration_min is distinct from 60 or r.capacity is distinct from 30 then
      raise exception 'SERIES FAIL(16): moved class % reads (ct % dur % cap %)', r.id, r.class_type_id, r.duration_min, r.capacity;
    end if;
    if r.template_id is null then raise exception 'SERIES FAIL(16): a moved class left its rule (id %)', r.id; end if;
  end loop;

  -- THE PAST CLASS of the Miércoles member: written by no statement in this call.
  select starts_at, class_type_id, duration_min, capacity, template_id, cancelled_at into r
    from public.class_session where id = current_setting('t.sg_m0', true)::uuid;
  if r.starts_at is distinct from ((((v_monday - 7) + 2) + '19:00'::time) at time zone v_tz)
     or r.class_type_id is distinct from current_setting('t.sg_ct_g1', true)::uuid
     or r.duration_min is distinct from 45 or r.capacity is distinct from 24
     or r.template_id is distinct from tg_mie or r.cancelled_at is not null then
    raise exception 'SERIES FAIL(16): the PAST class was rewritten by an all-days move (% ct % dur % cap %)',
      r.starts_at, r.class_type_id, r.duration_min, r.capacity;
  end if;

  -- THE COACH REPLACE reaches EVERY member's rule…
  select count(*) into v_n from public.schedule_template_coach where template_id in (tg_lun, tg_mie);
  if v_n is distinct from 2 then raise exception 'SERIES FAIL(16): the two rules hold % coach row(s) (expected 1 each)', v_n; end if;
  select count(*) into v_n from public.schedule_template_coach
   where template_id in (tg_lun, tg_mie) and coach_id = coach_g2;
  if v_n is distinct from 2 then raise exception 'SERIES FAIL(16): the coach replace reached % of the 2 rules', v_n; end if;

  -- …and EXACTLY the union of the classes that moved, on the dated join the agenda reads.
  foreach s in array array[current_setting('t.sg_l2', true)::uuid, current_setting('t.sg_l3', true)::uuid,
                           current_setting('t.sg_m2', true)::uuid, current_setting('t.sg_m3', true)::uuid] loop
    select count(*) into v_n from public.class_session_coach where session_id = s;
    if v_n is distinct from 1 then raise exception 'SERIES FAIL(16): moved class % has % coach row(s)', s, v_n; end if;
    select coach_id into v_coach from public.class_session_coach where session_id = s;
    if v_coach is distinct from coach_g2 then
      raise exception 'SERIES FAIL(16): moved class % still carries coach % — the change never reached the agenda', s, v_coach;
    end if;
  end loop;
  select coach_id into v_coach from public.class_session_coach where session_id = current_setting('t.sg_m0', true)::uuid;
  if v_coach is distinct from current_setting('t.sg_coach_g1', true)::uuid then
    raise exception 'SERIES FAIL(16): the PAST class''s coach was rewritten to % — the dated fan-out is not scoped to the movers', v_coach;
  end if;

  -- THE SETTLEMENT ASSERTION, at schedule scale: the classes still happen, so the bookings moved with
  -- them. Zero rows to `reservation`, zero to `clientes`.
  select status into v_status from public.reservation
   where member_id = current_setting('t.sg_c_ga', true)::uuid and class_session_id = current_setting('t.sg_l2', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(16): an all-days move settled a booking (%)', v_status; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.sg_c_gb', true)::uuid and class_session_id = current_setting('t.sg_m2', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SERIES FAIL(16): an all-days move settled the sibling weekday''s booking (%)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_ga', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SERIES FAIL(16): a balance moved to % across an all-days move (expected 4)', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_gb', true)::uuid;
  if v_n is distinct from 7 then raise exception 'SERIES FAIL(16): a balance moved to % across an all-days move (expected 7)', v_n; end if;
  select count(*) into v_n from public.reservation where gym_id = current_setting('t.sg_gym_g', true)::uuid;
  if v_n is distinct from 2 then raise exception 'SERIES FAIL(16): % reservation row(s) in the gym (expected the 2 seeded bookings)', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (18) THE SINGLE-DAY VERB IS STILL SINGLE-DAY. The same schedule, the same group, p_all_days omitted:
-- only the clicked weekday may move. If the fan-out ever defaulted to the group, an operator editing
-- one day would silently rewrite the rest of the week.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op_g', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_moved int; v_kept int;
begin
  select moved, kept into v_moved, v_kept
    from public.update_recurring_schedule(
      current_setting('t.sg_lun', true)::uuid, current_setting('t.sg_ct_g1', true)::uuid,
      '18:00'::time, 45, 24);
  if v_moved is distinct from 2 then
    raise exception 'SERIES FAIL(18): a single-day move reports % moved (expected the clicked weekday''s 2 classes)', v_moved;
  end if;
  if v_kept is distinct from 0 then raise exception 'SERIES FAIL(18): a single-day move reports % kept (expected 0)', v_kept; end if;
end $$;
reset role;

do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone 'America/Mexico_City'))::date;
  tg_mie uuid := current_setting('t.sg_mie', true)::uuid;
  coach_g2 uuid := current_setting('t.sg_coach_g2', true)::uuid;
  r record; v_ts timestamptz; v_coach uuid;
begin
  -- The clicked weekday moved…
  select class_type_id, weekday, start_time, duration_min, capacity into r
    from public.schedule_template where id = current_setting('t.sg_lun', true)::uuid;
  if r.class_type_id is distinct from current_setting('t.sg_ct_g1', true)::uuid or r.weekday is distinct from 0
     or r.start_time is distinct from '18:00'::time or r.duration_min is distinct from 45 or r.capacity is distinct from 24 then
    raise exception 'SERIES FAIL(18): the clicked rule reads (ct % wd % t % dur % cap %)',
      r.class_type_id, r.weekday, r.start_time, r.duration_min, r.capacity;
  end if;
  select starts_at into v_ts from public.class_session where id = current_setting('t.sg_l2', true)::uuid;
  if v_ts is distinct from (((v_monday + 14) + '18:00'::time) at time zone v_tz) then
    raise exception 'SERIES FAIL(18): the clicked weekday''s class landed at %', v_ts;
  end if;

  -- …and THE SIBLING MEMBER is byte-identical, rule and classes and coaches alike: still at the values
  -- (16) left on it.
  select class_type_id, weekday, start_time, duration_min, capacity, is_active into r
    from public.schedule_template where id = tg_mie;
  if r.class_type_id is distinct from current_setting('t.sg_ct_g2', true)::uuid or r.weekday is distinct from 2
     or r.start_time is distinct from '21:00'::time or r.duration_min is distinct from 60
     or r.capacity is distinct from 30 or r.is_active is distinct from true then
    raise exception 'SERIES FAIL(18): a single-day call rewrote the SIBLING rule to (ct % wd % t % dur % cap % active %)',
      r.class_type_id, r.weekday, r.start_time, r.duration_min, r.capacity, r.is_active;
  end if;
  for r in select id, starts_at, class_type_id, duration_min, capacity from public.class_session
            where id in (current_setting('t.sg_m2', true)::uuid, current_setting('t.sg_m3', true)::uuid) loop
    if (r.starts_at at time zone v_tz)::time is distinct from '21:00'::time
       or r.class_type_id is distinct from current_setting('t.sg_ct_g2', true)::uuid
       or r.duration_min is distinct from 60 or r.capacity is distinct from 30 then
      raise exception 'SERIES FAIL(18): a single-day call rewrote the sibling''s class % (% ct % dur % cap %)',
        r.id, r.starts_at, r.class_type_id, r.duration_min, r.capacity;
    end if;
  end loop;
  select coach_id into v_coach from public.class_session_coach where session_id = current_setting('t.sg_m2', true)::uuid;
  if v_coach is distinct from coach_g2 then
    raise exception 'SERIES FAIL(18): a single-day call (no p_coach_ids) rewrote the sibling''s dated coach to %', v_coach;
  end if;
  select coach_id into v_coach from public.schedule_template_coach where template_id = tg_mie;
  if v_coach is distinct from coach_g2 then
    raise exception 'SERIES FAIL(18): a single-day call rewrote the sibling rule''s coach to %', v_coach;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (19) THE ALL-DAYS RETIRE — the owner's walk, in one vector. "Terminar el horario" pressed on the
-- MIÉRCOLES card (deliberately not the first member: the anchor is whichever card was clicked) must
-- end the whole schedule, cancel every future class of every weekday, and give every held credit back
-- exactly once. Under the shipped single-weekday verb, Lunes went on taking bookings for a schedule
-- the confirm dialog said had been cancelled.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op_g', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_n int;
begin
  v_n := public.retire_recurring_schedule(current_setting('t.sg_mie', true)::uuid, p_all_days => true);
  if v_n is distinct from 4 then
    raise exception 'SERIES FAIL(19): the all-days retire cancelled % class(es) (expected 4 — both weekdays, two weeks each)', v_n;
  end if;
end $$;
reset role;

do $$
declare
  tg_lun uuid := current_setting('t.sg_lun', true)::uuid;
  tg_mie uuid := current_setting('t.sg_mie', true)::uuid;
  v_n int; v_active boolean; v_status text; v_cancelled timestamptz;
begin
  -- EVERY member retired…
  select count(*) into v_n from public.schedule_template where id in (tg_lun, tg_mie) and is_active;
  if v_n is distinct from 0 then
    raise exception 'SERIES FAIL(19): % weekday(s) of the schedule are still active — the other days keep materializing', v_n;
  end if;
  -- …and NOTHING outside the group.
  select is_active into v_active from public.schedule_template where id = current_setting('t.sg_block', true)::uuid;
  if v_active is distinct from true then
    raise exception 'SERIES FAIL(19): the all-days retire reached a template outside the schedule — it is retiring by GYM, not by group';
  end if;

  -- Every FUTURE class of every member is cancelled…
  select count(*) into v_n from public.class_session
   where template_id in (tg_lun, tg_mie) and starts_at > now() and cancelled_at is null;
  if v_n is distinct from 0 then
    raise exception 'SERIES FAIL(19): % future class(es) survived — still bookable, for a schedule that no longer exists', v_n;
  end if;
  select count(*) into v_n from public.class_session
   where template_id in (tg_lun, tg_mie) and cancelled_at is not null;
  if v_n is distinct from 4 then raise exception 'SERIES FAIL(19): % class(es) carry cancelled_at (expected exactly the 4 future ones)', v_n; end if;
  -- …and the PAST one is not.
  select cancelled_at into v_cancelled from public.class_session where id = current_setting('t.sg_m0', true)::uuid;
  if v_cancelled is not null then raise exception 'SERIES FAIL(19): the retire cancelled a class that already happened'; end if;

  -- THE MONEY, on BOTH weekdays: exactly +1 each, once. A loop that reached only the anchor's weekday
  -- leaves c_ga at 4 and destroys a class the member had paid for.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_ga', true)::uuid;
  if v_n is distinct from 5 then
    raise exception 'SERIES FAIL(19): the Lunes member has % (expected 4 + 1 = 5) — the hold on the OTHER weekday was never released', v_n;
  end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_gb', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SERIES FAIL(19): the Miércoles member has % (expected 7 + 1 = 8, exactly once)', v_n; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.sg_c_ga', true)::uuid and class_session_id = current_setting('t.sg_l2', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'SERIES FAIL(19): the Lunes booking is % (expected cancelada)', v_status; end if;
  select status into v_status from public.reservation
   where member_id = current_setting('t.sg_c_gb', true)::uuid and class_session_id = current_setting('t.sg_m2', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'SERIES FAIL(19): the Miércoles booking is % (expected cancelada)', v_status; end if;
end $$;

-- THE SECOND TAP, all-days shape: the anchor's own gate raises ABOVE the loop, so a double-tapped
-- confirm cannot pay anybody twice. Asserted on the BALANCES, not on the raise.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op_g', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare raised boolean := false; msg text;
begin
  begin
    perform public.retire_recurring_schedule(current_setting('t.sg_mie', true)::uuid, p_all_days => true);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(19): a second all-days retire was accepted'; end if;
  if msg is distinct from 'Horario no encontrado o ya retirado' then
    raise exception 'SERIES FAIL(19): wrong raise on a re-retire: %', msg;
  end if;
end $$;
reset role;

do $$
declare v_n int;
begin
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_ga', true)::uuid;
  if v_n is distinct from 5 then raise exception 'SERIES FAIL(19): a balance moved to % after a refused re-retire — DOUBLE REFUND', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_gb', true)::uuid;
  if v_n is distinct from 8 then raise exception 'SERIES FAIL(19): a balance moved to % after a refused re-retire — DOUBLE REFUND', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (20) edit_class_session — THE TWO HOLES THE OWNER'S WALK FOUND.
--   (a) A CANCELLED target used to be edited successfully: a stale tab wrote to a dead row and the
--       operator was told the class had moved. The refusal has its OWN sentence, because
--       'Sesión no encontrada' would send them looking for a class that is right there.
--   (b) A FUTURE class could be moved to a PAST instant — probed on live at 09:45. Past the start both
--       release paths are shut ('La clase ya comenzó'), so every hold on it becomes unrefundable by
--       the gym and uncancellable by the member.
--   (c) …but retro-editing a class that ALREADY passed (past→past) stays legal: the desk fixes
--       records, and no release path opens either way.
--   (d) THE REVERSE CROSSING, which the first build of this file missed. A FORFEIT IS A ZERO-WRITE
--       OUTCOME: a class passes with a `reservada` hold and NOTHING is written — the row stays
--       `reservada` and the no-show DERIVES from starts_at (20260804150000:471). Both release gates
--       read the CURRENT starts_at, so dragging that class into the future re-arms them over a hold
--       the gym has already kept, and the member cancels a class they did not attend for a credit
--       back. Refused, and the row is byte-identical after.
--   (e) …but only when a hold is actually there: a passed class with NO live booking still moves
--       forward. Rescheduling an empty class is the ordinary desk act this must not cost.
-- Every target is a one-off (template_id null), so no series verb above could have touched them.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- (d)/(e) fixtures. sg_forfeit is booked through reservar_clase WHILE STILL FUTURE — the only honest
-- way to stamp `consumio` — and then pushed into the past by a direct UPDATE. That update IS what a
-- class passing looks like: forfeit writes no row anywhere, so the wall clock moving past a booked
-- class and this statement leave the database in the same state.
do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone 'America/Mexico_City'))::date;
  v_today  date := (now() at time zone 'America/Mexico_City')::date;
  gym_g uuid := current_setting('t.sg_gym_g', true)::uuid;
  u_gc uuid := gen_random_uuid();
  c_gc uuid; sg_forfeit uuid; sg_nohold uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', u_gc, 'authenticated', 'authenticated', 'sg-gc@test.local');
  insert into public.gym_membership (user_id, gym_id, role) values (u_gc, gym_g, 'member');
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('SG Perdida', '5552300003', 6, v_today + 60, '8 clases', gym_g, u_gc) returning id into c_gc;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_g, current_setting('t.sg_ct_g1', true)::uuid,
            (((v_monday + 14) + 1) + '14:00'::time) at time zone v_tz, 45, 24) returning id into sg_forfeit;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_g, current_setting('t.sg_ct_g1', true)::uuid,
            (((v_monday - 7) + 1) + '15:00'::time) at time zone v_tz, 45, 24) returning id into sg_nohold;

  perform set_config('t.sg_u_gc', u_gc::text, true);
  perform set_config('t.sg_c_gc', c_gc::text, true);
  perform set_config('t.sg_forfeit', sg_forfeit::text, true);
  perform set_config('t.sg_nohold', sg_nohold::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_u_gc', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.sg_forfeit', true)::uuid); end $$;
reset role;

do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone 'America/Mexico_City'))::date;
  v_n int; v_consumio boolean;
begin
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_gc', true)::uuid;
  if v_n is distinct from 5 then raise exception 'SEED FAIL: c_gc expected 5 after booking, got %', v_n; end if;
  select consumio into v_consumio from public.reservation
   where member_id = current_setting('t.sg_c_gc', true)::uuid
     and class_session_id = current_setting('t.sg_forfeit', true)::uuid;
  if v_consumio is distinct from true then
    raise exception 'SEED FAIL: the forfeit fixture stamped consumio % (expected true — an unconsumed hold has nothing to re-arm)', v_consumio;
  end if;

  -- THE CLASS PASSES. No settlement row is written, by design: the hold stays `reservada`.
  update public.class_session set starts_at = (((v_monday - 7) + 1) + '14:00'::time) at time zone v_tz
   where id = current_setting('t.sg_forfeit', true)::uuid;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.sg_c_gc', true)::uuid;
  if v_n is distinct from 5 then raise exception 'SEED FAIL: the forfeit moved a balance to %', v_n; end if;
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op_g', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone 'America/Mexico_City'))::date;
  ct_g2 uuid := current_setting('t.sg_ct_g2', true)::uuid;
  raised boolean; msg text;
begin
  -- (a) THE CANCELLED TARGET.
  raised := false;
  begin
    perform public.edit_class_session(
      current_setting('t.sg_canc', true)::uuid, ct_g2,
      (((v_monday + 14) + 1) + '16:00'::time) at time zone v_tz, 60, 30);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(20a): editing a CANCELLED class was accepted — the stale tab wrote to a dead row and got a receipt'; end if;
  if msg is distinct from 'La clase ya fue cancelada' then
    raise exception 'SERIES FAIL(20a): wrong refusal for a cancelled class: %', msg;
  end if;

  -- (b) FUTURE → PAST.
  raised := false;
  begin
    perform public.edit_class_session(
      current_setting('t.sg_fut', true)::uuid, ct_g2,
      (((v_monday - 7) + 1) + '12:00'::time) at time zone v_tz, 60, 30);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(20b): moving a FUTURE class to a PAST instant was accepted — every hold on it is now stranded'; end if;
  if msg is distinct from 'No se puede mover la clase a una hora que ya pasó' then
    raise exception 'SERIES FAIL(20b): wrong refusal for a past-instant move: %', msg;
  end if;

  -- (c) THE RETRO EDIT — a class that already passed, moved within the past. Must SUCCEED.
  perform public.edit_class_session(
    current_setting('t.sg_past', true)::uuid, ct_g2,
    (((v_monday - 7) + 1) + '07:00'::time) at time zone v_tz, 60, 30);

  -- (d) PAST → FUTURE with a FORFEITED hold on it. Refused: both release gates read the current
  -- starts_at, so this move alone hands the credit back.
  raised := false;
  begin
    perform public.edit_class_session(
      current_setting('t.sg_forfeit', true)::uuid, ct_g2,
      (((v_monday + 14) + 1) + '14:00'::time) at time zone v_tz, 60, 30);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SERIES FAIL(20d): a PASSED class with a live hold was moved to the future — the forfeit is re-armed and the credit can be taken back'; end if;
  if msg is distinct from 'No se puede mover al futuro una clase que ya pasó con reservas' then
    raise exception 'SERIES FAIL(20d): wrong refusal for a forfeited class moved forward: %', msg;
  end if;

  -- (e) …and the same crossing with NO hold on it SUCCEEDS. The guard is about the hold, not the
  -- direction: rescheduling an empty class that nobody came to is ordinary desk work.
  perform public.edit_class_session(
    current_setting('t.sg_nohold', true)::uuid, ct_g2,
    (((v_monday + 21) + 1) + '15:00'::time) at time zone v_tz, 60, 30);
end $$;
reset role;

do $$
declare
  v_tz     text := 'America/Mexico_City';
  v_monday date := (date_trunc('week', now() at time zone 'America/Mexico_City'))::date;
  ct_g1 uuid := current_setting('t.sg_ct_g1', true)::uuid;
  r record;
begin
  -- (a) THE CANCELLED ROW IS BYTE-IDENTICAL — the refusal is not "raised after writing".
  select starts_at, class_type_id, duration_min, capacity, cancelled_at into r
    from public.class_session where id = current_setting('t.sg_canc', true)::uuid;
  if r.starts_at is distinct from ((((v_monday + 14) + 1) + '12:00'::time) at time zone v_tz)
     or r.class_type_id is distinct from ct_g1 or r.duration_min is distinct from 45
     or r.capacity is distinct from 24 then
    raise exception 'SERIES FAIL(20a): the cancelled class was rewritten anyway (% ct % dur % cap %)',
      r.starts_at, r.class_type_id, r.duration_min, r.capacity;
  end if;
  if r.cancelled_at is null then raise exception 'SERIES FAIL(20a): a refused edit un-cancelled the class'; end if;

  -- (b) …and so is the future one the guard refused to strand.
  select starts_at, class_type_id, duration_min, capacity, cancelled_at into r
    from public.class_session where id = current_setting('t.sg_fut', true)::uuid;
  if r.starts_at is distinct from ((((v_monday + 14) + 1) + '13:00'::time) at time zone v_tz)
     or r.class_type_id is distinct from ct_g1 or r.duration_min is distinct from 45
     or r.capacity is distinct from 24 or r.cancelled_at is not null then
    raise exception 'SERIES FAIL(20b): the refused move wrote the row anyway (% ct % dur % cap %)',
      r.starts_at, r.class_type_id, r.duration_min, r.capacity;
  end if;

  -- (c) THE RETRO EDIT LANDED. If the guard were `p_starts_at <= now()` alone, the desk could no
  -- longer fix yesterday's record at all.
  select starts_at, class_type_id, duration_min, capacity into r
    from public.class_session where id = current_setting('t.sg_past', true)::uuid;
  if r.starts_at is distinct from ((((v_monday - 7) + 1) + '07:00'::time) at time zone v_tz)
     or r.class_type_id is distinct from current_setting('t.sg_ct_g2', true)::uuid
     or r.duration_min is distinct from 60 or r.capacity is distinct from 30 then
    raise exception 'SERIES FAIL(20c): the retro edit of an already-past class did not land (% ct % dur % cap %)',
      r.starts_at, r.class_type_id, r.duration_min, r.capacity;
  end if;

  -- (d) THE FORFEITED CLASS IS BYTE-IDENTICAL — still in the past, still carrying the kept hold, and
  -- the balance is still the one the member paid. Asserted on the MONEY as well as the row: "the
  -- credit was not handed back" is the property, the refusal is only the mechanism.
  select starts_at, class_type_id, duration_min, capacity, cancelled_at into r
    from public.class_session where id = current_setting('t.sg_forfeit', true)::uuid;
  if r.starts_at is distinct from ((((v_monday - 7) + 1) + '14:00'::time) at time zone v_tz)
     or r.class_type_id is distinct from ct_g1 or r.duration_min is distinct from 45
     or r.capacity is distinct from 24 or r.cancelled_at is not null then
    raise exception 'SERIES FAIL(20d): the refused forward move wrote the row anyway (% ct % dur % cap %)',
      r.starts_at, r.class_type_id, r.duration_min, r.capacity;
  end if;
  select status, consumio into r from public.reservation
   where member_id = current_setting('t.sg_c_gc', true)::uuid
     and class_session_id = current_setting('t.sg_forfeit', true)::uuid;
  if r.status is distinct from 'reservada' or r.consumio is distinct from true then
    raise exception 'SERIES FAIL(20d): the forfeited hold reads (% consumio %) after a refused move', r.status, r.consumio;
  end if;
  select clases_restantes into r from public.clientes where id = current_setting('t.sg_c_gc', true)::uuid;
  if r.clases_restantes is distinct from 5 then
    raise exception 'SERIES FAIL(20d): the forfeited member''s balance is % (expected an untouched 5)', r.clases_restantes;
  end if;

  -- (e) THE EMPTY PASSED CLASS MOVED. A guard keyed on the direction alone would have refused this
  -- too, and the desk could never reschedule a class nobody booked.
  select starts_at, class_type_id, duration_min, capacity into r
    from public.class_session where id = current_setting('t.sg_nohold', true)::uuid;
  if r.starts_at is distinct from ((((v_monday + 21) + 1) + '15:00'::time) at time zone v_tz)
     or r.class_type_id is distinct from current_setting('t.sg_ct_g2', true)::uuid
     or r.duration_min is distinct from 60 or r.capacity is distinct from 30 then
    raise exception 'SERIES FAIL(20e): the un-booked passed class did not move forward (% ct % dur % cap %)',
      r.starts_at, r.class_type_id, r.duration_min, r.capacity;
  end if;
end $$;

select 'recurring series edit: OK' as result;
rollback;
