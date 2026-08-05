-- cancel_class_session RELEASE rules — #233 slice 1 (#245), migration 20260804150000 §2/§4.
--
-- A gym cancel now settles, not just stamps. Until 20260804150000 `cancel_class_session` wrote exactly
-- one column (`class_session.cancelled_at`) and touched ZERO reservation rows, so every member booked
-- into the cancelled class kept a spent credit with no path back — the stranded-credit half of #172,
-- for which toggle_pase's closed-window pardon was the accidental compensation (now deleted, same
-- migration). The ruling: a gym cancel ALWAYS RELEASES, never forfeits. Forfeit is the member's own
-- no-show and nothing else.
--
-- The rules this suite pins, all of them on the WRITTEN ROWS (a `void` RPC has no return to lean on):
--   * BEFORE-START ONLY (§4) — a PAST session cannot be cancelled: 'La clase ya comenzó', zero rows
--     moved. Its still-`reservada` rows are the NO-SHOWS the roster derives, so releasing them would
--     refund forfeited holds AND erase the absences — the derived-only ruling breached by a write that
--     deletes history rather than by a sweep that invents it. The Agenda navigates backwards freely,
--     so this is one click away, not a theoretical path;
--   * every active `reservada` on the session flips to `cancelada` + `cancelled_at` stamped;
--   * each of those members is refunded EXACTLY what their booking spent — consumio-gated, proved on
--     BOTH halves of that gate: an ILIMITADO booking (consumio=false, balance NULL) has its NULL left
--     alone, and a FINITE member holding a consumio=false booking (the C4 purchase-wins phantom-credit
--     shape: booked while unlimited, finite by the time the class is cancelled) is refunded NOTHING.
--     Without that second member the `and l.consumio` gate is deletable with a green suite, because
--     the only consumio=false row would also be the only NULL-balance row;
--   * an `asistida` row is a CAPTURED hold and is UNTOUCHED — status, checked_at and balance all
--     stand. Re-crediting an attendance record would mint a class out of a class that happened;
--   * a TERMINAL row (`cancelada`, consumio=true — a member who cancelled themselves and was already
--     refunded) is UNTOUCHED and NOT refunded a second time;
--   * a booking on a DIFFERENT session of the same gym is UNTOUCHED (the p_session_id scoping);
--   * RE-CANCEL REFUSES — 'Sesión no encontrada o ya cancelada', unchanged — and that refusal is what
--     makes the release idempotent: the second call raises above the refund, so nobody is paid twice;
--   * CROSS-TENANT: staff of another gym cannot cancel this session, and their refused call moves no
--     reservation and no balance. `cancel_class_session` is SECURITY INVOKER and the reservation /
--     clientes writes ride the staff RLS policies (`reservation_staff_update`, `clientes_staff_update`,
--     both keyed on `is_staff_of(gym_id)`), so this vector is the tenant proof for the new writes too.
--
-- EVERY WRITTEN-ROW ASSERTION READS AFTER `reset role`, as the ops role. The RPC is called under the
-- operator's JWT — that is the real caller — but a count taken in that same block is filtered by the
-- very policies under test, so a PARTIAL release (rows the operator cannot see left un-flipped) would
-- read as a clean zero and pass. That is the 09e029d failure shape; the act/assert split is the fix.
--
-- The bookings are made through `reservar_clase` AS EACH MEMBER rather than seeded by hand: `consumio`
-- is the whole gate on the refund, and the only honest way to get it is the function that stamps it.
-- Sessions are therefore created in the future (#165 refuses booking a started class); the ONE that
-- must be past for the §4 vector is moved there privileged, after its booking lands.
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK,
-- zero prod UUIDs (both gyms, their operators and every cliente are minted tx-local). Comparisons use
-- `is distinct from`, never `<>`: a NULL from a mistyped id or a vanished row makes `<>` NULL, which
-- is not true, which silently skips the raise.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into
-- SUITE — or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  gym_a   uuid := gen_random_uuid();
  gym_b   uuid := gen_random_uuid();
  v_tz    text := 'America/Mexico_City';
  v_today date := (now() at time zone 'America/Mexico_City')::date;
  op_a    uuid := gen_random_uuid();   -- staff of gym A — the cancelling operator
  op_b    uuid := gen_random_uuid();   -- staff of gym B only — the cross-tenant probe
  m_fin1  uuid := gen_random_uuid();
  m_fin2  uuid := gen_random_uuid();
  m_ilim  uuid := gen_random_uuid();
  m_fant  uuid := gen_random_uuid();   -- the phantom-credit member (C4 purchase-wins)
  m_asis  uuid := gen_random_uuid();
  m_term  uuid := gen_random_uuid();
  m_otra  uuid := gen_random_uuid();
  m_past  uuid := gen_random_uuid();   -- §4: books the session that is then moved into the past
  c_fin1 uuid; c_fin2 uuid; c_ilim uuid; c_fant uuid; c_asis uuid; c_term uuid; c_otra uuid; c_past uuid;
  v_ct uuid; s_a uuid; s_otra uuid; s_past uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'cancel-release-suite-gym-a', 'Cancel Release Gym A', v_tz, 'base'),
    (gym_b, 'cancel-release-suite-gym-b', 'Cancel Release Gym B', v_tz, 'base');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_a,   'authenticated', 'authenticated', 'cr-op-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_b,   'authenticated', 'authenticated', 'cr-op-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_fin1, 'authenticated', 'authenticated', 'cr-fin1@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_fin2, 'authenticated', 'authenticated', 'cr-fin2@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_ilim, 'authenticated', 'authenticated', 'cr-ilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_fant, 'authenticated', 'authenticated', 'cr-fant@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_asis, 'authenticated', 'authenticated', 'cr-asis@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_term, 'authenticated', 'authenticated', 'cr-term@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_otra, 'authenticated', 'authenticated', 'cr-otra@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_past, 'authenticated', 'authenticated', 'cr-past@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_b, gym_b, 'operator'),
    (m_fin1, gym_a, 'member'), (m_fin2, gym_a, 'member'), (m_ilim, gym_a, 'member'),
    (m_fant, gym_a, 'member'), (m_asis, gym_a, 'member'), (m_term, gym_a, 'member'),
    (m_otra, gym_a, 'member'), (m_past, gym_a, 'member');

  -- Two finite members at DIFFERENT balances, so "+1 each" cannot pass by accident on a shared number.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CR finita 1', '5551100001', 5, v_today + 20, '8 clases', gym_a, m_fin1) returning id into c_fin1;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CR finita 2', '5551100002', 3, v_today + 20, '8 clases', gym_a, m_fin2) returning id into c_fin2;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CR ilimitada', '5551100003', null, v_today + 20, 'Ilimitado', gym_a, m_ilim) returning id into c_ilim;
  -- c_fant books while ILIMITADO (so reservar_clase stamps consumio=false) and is flipped to a FINITE
  -- balance before the cancel — the C4 purchase-wins shape 20260804150000's own header names. It is
  -- the ONLY fixture that separates the two halves of `l.consumio and clases_restantes is not null`.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CR fantasma', '5551100004', null, v_today + 20, 'Ilimitado', gym_a, m_fant) returning id into c_fant;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CR asistida', '5551100005', 5, v_today + 20, '8 clases', gym_a, m_asis) returning id into c_asis;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CR terminal', '5551100006', 5, v_today + 20, '8 clases', gym_a, m_term) returning id into c_term;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CR otra clase', '5551100007', 5, v_today + 20, '8 clases', gym_a, m_otra) returning id into c_otra;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('CR clase pasada', '5551100008', 5, v_today + 20, '8 clases', gym_a, m_past) returning id into c_past;

  insert into public.class_type (gym_id, name) values (gym_a, 'CR Metcon') returning id into v_ct;
  -- s_a is the session that gets cancelled; s_otra is the untouched control; s_past is booked in the
  -- future and moved backwards after the booking lands (#165 refuses booking a started class).
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct, now() + interval '2 days', 60, 20) returning id into s_a;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct, now() + interval '3 days', 60, 20) returning id into s_otra;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct, now() + interval '4 days', 60, 20) returning id into s_past;

  perform set_config('t.gym_a',  gym_a::text,  true);
  perform set_config('t.op_a',   op_a::text,   true);
  perform set_config('t.op_b',   op_b::text,   true);
  perform set_config('t.m_fin1', m_fin1::text, true);
  perform set_config('t.m_fin2', m_fin2::text, true);
  perform set_config('t.m_ilim', m_ilim::text, true);
  perform set_config('t.m_fant', m_fant::text, true);
  perform set_config('t.m_asis', m_asis::text, true);
  perform set_config('t.m_term', m_term::text, true);
  perform set_config('t.m_otra', m_otra::text, true);
  perform set_config('t.m_past', m_past::text, true);
  perform set_config('t.c_fin1', c_fin1::text, true);
  perform set_config('t.c_fin2', c_fin2::text, true);
  perform set_config('t.c_ilim', c_ilim::text, true);
  perform set_config('t.c_fant', c_fant::text, true);
  perform set_config('t.c_asis', c_asis::text, true);
  perform set_config('t.c_term', c_term::text, true);
  perform set_config('t.c_otra', c_otra::text, true);
  perform set_config('t.c_past', c_past::text, true);
  perform set_config('t.s_a',    s_a::text,    true);
  perform set_config('t.s_otra', s_otra::text, true);
  perform set_config('t.s_past', s_past::text, true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- Every member books AS THEMSELVES — reservar_clase is what stamps `consumio`, and consumio is the
-- entire gate on the refund below. Seeding the reservations by hand would let the suite assert a
-- refund rule against a flag no production path had produced.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin1', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_a', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fin2', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_a', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_ilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_a', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_fant', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_a', true)::uuid); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_asis', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_a', true)::uuid); end $$;
reset role;

-- c_term books and then CANCELS ITSELF: reservar_clase 5->4, cancelar_reserva refunds back to 5 and
-- leaves a terminal `cancelada` row whose `consumio` is still the historical TRUE. That row is the
-- double-refund trap — a release that filtered on consumio alone, or on "not asistida", would pay
-- this member a second time for a class they were already refunded for.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_term', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.reservar_clase(current_setting('t.s_a', true)::uuid);
  perform public.cancelar_reserva(current_setting('t.s_a', true)::uuid);
end $$;
reset role;

-- c_otra books the OTHER session — the scoping control.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_otra', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_otra', true)::uuid); end $$;
reset role;

-- c_past books the session that §4's vector then moves into the past.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_past', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.reservar_clase(current_setting('t.s_past', true)::uuid); end $$;
reset role;

-- ── The state the whole suite reasons from (privileged writes + preconditions) ────
-- Three privileged moves, none of which an RPC can make:
--   * c_asis' booking → `asistida`, the state a CAPTURE leaves behind (pasar_lista_sesion's booked
--     branch). Done by hand because the class is two days out and this vector is about what CANCEL
--     does to that row, not about how it got there.
--   * c_fant → a FINITE balance of 3, having booked while unlimited. C4 purchase-wins in one UPDATE.
--   * s_past → three hours ago, after its booking landed. #165 refuses booking a started class, so
--     "a past session with a live hold on it" can only be built in this order.
do $$
declare
  v_n int; v_status text; v_consumio boolean;
begin
  update public.reservation set status = 'asistida', checked_at = now()
   where member_id = current_setting('t.c_asis', true)::uuid
     and class_session_id = current_setting('t.s_a', true)::uuid;

  update public.clientes set clases_restantes = 3
   where id = current_setting('t.c_fant', true)::uuid;

  update public.class_session set starts_at = now() - interval '3 hours'
   where id = current_setting('t.s_past', true)::uuid;

  -- Preconditions, stated so a later failure is unambiguous about WHICH half broke.
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_fin1', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SEED FAIL: c_fin1 expected 4 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_fin2', true)::uuid;
  if v_n is distinct from 2 then raise exception 'SEED FAIL: c_fin2 expected 2 after booking, got %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_ilim', true)::uuid;
  if v_n is not null then raise exception 'SEED FAIL: c_ilim balance % (expected an untouched NULL)', v_n; end if;
  select consumio into v_consumio from public.reservation
   where member_id = current_setting('t.c_ilim', true)::uuid and class_session_id = current_setting('t.s_a', true)::uuid;
  if v_consumio is distinct from false then raise exception 'SEED FAIL: the ilimitado booking stamped consumio % (expected false)', v_consumio; end if;

  -- The phantom-credit fixture is only a fixture if BOTH halves hold: consumio=false on the row AND a
  -- non-null balance on the cliente. Either one alone would make it a duplicate of c_ilim.
  select consumio into v_consumio from public.reservation
   where member_id = current_setting('t.c_fant', true)::uuid and class_session_id = current_setting('t.s_a', true)::uuid;
  if v_consumio is distinct from false then raise exception 'SEED FAIL: c_fant booked with consumio % (expected false — it booked while ilimitado)', v_consumio; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_fant', true)::uuid;
  if v_n is distinct from 3 then raise exception 'SEED FAIL: c_fant balance % (expected the finite 3 it switched to)', v_n; end if;

  select status, consumio into v_status, v_consumio from public.reservation
   where member_id = current_setting('t.c_term', true)::uuid and class_session_id = current_setting('t.s_a', true)::uuid;
  if v_status is distinct from 'cancelada' then raise exception 'SEED FAIL: c_term row status % (expected cancelada)', v_status; end if;
  if v_consumio is distinct from true then raise exception 'SEED FAIL: c_term row consumio % (expected the historical true)', v_consumio; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_term', true)::uuid;
  if v_n is distinct from 5 then raise exception 'SEED FAIL: c_term expected 5 after its own cancel, got %', v_n; end if;

  select status into v_status from public.reservation
   where member_id = current_setting('t.c_past', true)::uuid and class_session_id = current_setting('t.s_past', true)::uuid;
  if v_status is distinct from 'reservada' then raise exception 'SEED FAIL: c_past row status % (expected reservada — the no-show the §4 gate protects)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_past', true)::uuid;
  if v_n is distinct from 4 then raise exception 'SEED FAIL: c_past expected 4 after booking, got %', v_n; end if;

  -- Four live holds on s_a (c_fin1, c_fin2, c_ilim, c_fant); c_asis is captured, c_term is terminal.
  select count(*) into v_n from public.reservation
   where class_session_id = current_setting('t.s_a', true)::uuid and status = 'reservada';
  if v_n is distinct from 4 then raise exception 'SEED FAIL: % live holds on the target session (expected 4)', v_n; end if;
end $$;

-- ── (1) CROSS-TENANT: staff of gym B cannot cancel gym A's session, and nothing moves ────────────
-- RLS scopes the `class_session` read out for operator_b, so the RPC's own `not found` raise fires
-- ('Sesión no encontrada o ya cancelada') above both the before-start gate and the release — which is
-- also why no reservation and no balance can move on this path. Asserted, not assumed: the release is
-- new write surface, and this is the vector that proves it stays inside the tenant.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_a uuid := current_setting('t.s_a', true)::uuid;
  v_raised boolean := false;
begin
  begin
    perform public.cancel_class_session(s_a);
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'DENIAL FAIL(1): operator_b cancelled gym A''s session'; end if;
end $$;
reset role;

-- Written rows read as OPS, not as operator_b — gym-A rows are invisible to that JWT, so a leak
-- asserted from inside the block above would read 0 and pass.
do $$
declare
  s_a uuid := current_setting('t.s_a', true)::uuid;
  v_n int; v_cancelled timestamptz;
begin
  select cancelled_at into v_cancelled from public.class_session where id = s_a;
  if v_cancelled is not null then raise exception 'DENIAL FAIL(1): the cross-tenant call stamped cancelled_at'; end if;
  select count(*) into v_n from public.reservation where class_session_id = s_a and status = 'reservada';
  if v_n is distinct from 4 then raise exception 'DENIAL FAIL(1): reservada rows % (expected the 4 still-held bookings)', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_fin1', true)::uuid;
  if v_n is distinct from 4 then raise exception 'DENIAL FAIL(1): the refused call refunded c_fin1 to %', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = current_setting('t.c_fin2', true)::uuid;
  if v_n is distinct from 2 then raise exception 'DENIAL FAIL(1): the refused call refunded c_fin2 to %', v_n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- Everything below is CALLED as operator A (staff of the session's gym) and ASSERTED as ops.
-- ════════════════════════════════════════════════════════════════════════════════

-- ── (2) §4 BEFORE-START: a PAST class cannot be cancelled, and its no-shows survive ─────────────
-- The Agenda navigates backwards freely, so the cancel affordance is one click from last Tuesday's
-- 06:00. Cancelling it would flip every still-`reservada` row to `cancelada` and refund it — which is
-- both a refund of a FORFEITED hold and, because `no_show` is DERIVED from (reservada, class over),
-- the erasure of that absence from the roster. The gate refuses with cancelar_reserva's own sentence.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_past uuid := current_setting('t.s_past', true)::uuid;
  v_raised boolean := false;
begin
  begin
    perform public.cancel_class_session(s_past);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'La clase ya comenzó%' then
      raise exception 'RULE FAIL(2): wrong raise for cancelling a past class: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(2): a PAST class was cancelled — its no-shows were refunded and erased'; end if;
end $$;
reset role;

do $$
declare
  s_past uuid := current_setting('t.s_past', true)::uuid;
  c_past uuid := current_setting('t.c_past', true)::uuid;
  v_n int; v_cancelled timestamptz; v_status text;
begin
  select cancelled_at into v_cancelled from public.class_session where id = s_past;
  if v_cancelled is not null then raise exception 'RULE FAIL(2): the refused cancel stamped cancelled_at on a past session'; end if;
  -- THE NO-SHOW SURVIVES: still reservada on a class that is over, which is exactly what the roster
  -- derives `no_show` from. A flip to cancelada here would delete an absence, not record one.
  select status into v_status from public.reservation where member_id = c_past and class_session_id = s_past;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(2): the refused cancel moved the no-show to % — the derived absence is gone', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = c_past;
  if v_n is distinct from 4 then raise exception 'RULE FAIL(2): the refused cancel refunded the forfeited hold (balance %, expected 4)', v_n; end if;
end $$;

-- ── (3) THE RELEASE: every hold flips + each member is refunded exactly what it spent ────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.cancel_class_session(current_setting('t.s_a', true)::uuid);
end $$;
reset role;

do $$
declare
  s_a    uuid := current_setting('t.s_a', true)::uuid;
  s_otra uuid := current_setting('t.s_otra', true)::uuid;
  c_fin1 uuid := current_setting('t.c_fin1', true)::uuid;
  c_fin2 uuid := current_setting('t.c_fin2', true)::uuid;
  c_ilim uuid := current_setting('t.c_ilim', true)::uuid;
  c_fant uuid := current_setting('t.c_fant', true)::uuid;
  c_asis uuid := current_setting('t.c_asis', true)::uuid;
  c_term uuid := current_setting('t.c_term', true)::uuid;
  c_otra uuid := current_setting('t.c_otra', true)::uuid;
  v_n int; v_status text; v_cancelled timestamptz; v_checked timestamptz;
begin
  -- The session itself, unchanged behaviour.
  select cancelled_at into v_cancelled from public.class_session where id = s_a;
  if v_cancelled is null then raise exception 'RULE FAIL(3): cancel_class_session did not stamp cancelled_at'; end if;

  -- Every FINITE hold released: status flipped, cancelled_at stamped, balance +1 exactly.
  select status, cancelled_at into v_status, v_cancelled from public.reservation
   where member_id = c_fin1 and class_session_id = s_a;
  if v_status is distinct from 'cancelada' then raise exception 'RULE FAIL(3): c_fin1 booking status % (expected cancelada — the hold was not released)', v_status; end if;
  if v_cancelled is null then raise exception 'RULE FAIL(3): c_fin1 booking cancelled_at not stamped'; end if;
  select clases_restantes into v_n from public.clientes where id = c_fin1;
  if v_n is distinct from 5 then raise exception 'RULE FAIL(3): c_fin1 balance % (expected 4 + 1 = 5)', v_n; end if;

  select status into v_status from public.reservation where member_id = c_fin2 and class_session_id = s_a;
  if v_status is distinct from 'cancelada' then raise exception 'RULE FAIL(3): c_fin2 booking status % (expected cancelada)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = c_fin2;
  if v_n is distinct from 3 then raise exception 'RULE FAIL(3): c_fin2 balance % (expected 2 + 1 = 3) — the refund is per member, not a flat one', v_n; end if;

  -- ILIMITADO: the booking is released (state), the NULL is never touched (money). `clases_restantes
  -- is not null` is the half of the gate this member pins; a release that refunded on status alone
  -- would write 1 into that NULL.
  select status into v_status from public.reservation where member_id = c_ilim and class_session_id = s_a;
  if v_status is distinct from 'cancelada' then raise exception 'RULE FAIL(3): c_ilim booking status % (expected cancelada)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = c_ilim;
  if v_n is not null then raise exception 'RULE FAIL(3): c_ilim balance % — an ilimitado NULL was written to (unlimited means unlimited)', v_n; end if;

  -- PHANTOM CREDIT (C4 purchase-wins): booked while unlimited (consumio=false), finite by now. The
  -- booking took NOTHING, so the release must give back nothing — even though the balance is a real
  -- number and would happily accept a +1. This member is the ONLY one that fails if `and l.consumio`
  -- is deleted from the refund gate; c_ilim would not, because its NULL balance fails the other half.
  select status into v_status from public.reservation where member_id = c_fant and class_session_id = s_a;
  if v_status is distinct from 'cancelada' then raise exception 'RULE FAIL(3): c_fant booking status % (expected cancelada — state releases even when money does not)', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = c_fant;
  if v_n is distinct from 3 then raise exception 'RULE FAIL(3): c_fant balance % (expected an untouched 3) — MINTED CREDIT: a booking that consumed nothing was refunded one', v_n; end if;

  -- ASISTIDA: a CAPTURED hold. Untouched on all three axes.
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_asis and class_session_id = s_a;
  if v_status is distinct from 'asistida' then raise exception 'RULE FAIL(3): the cancel moved an ASISTIDA row to % — an attendance record is not a hold', v_status; end if;
  if v_checked is null then raise exception 'RULE FAIL(3): the cancel cleared checked_at on the attended row'; end if;
  select clases_restantes into v_n from public.clientes where id = c_asis;
  if v_n is distinct from 4 then raise exception 'RULE FAIL(3): c_asis balance % (expected an untouched 4) — the class happened, there is nothing to release', v_n; end if;

  -- TERMINAL: already cancelled and already refunded by the member's own cancel. No second payout.
  select clases_restantes into v_n from public.clientes where id = c_term;
  if v_n is distinct from 5 then raise exception 'RULE FAIL(3): c_term balance % (expected 5) — DOUBLE REFUND on an already-terminal row', v_n; end if;

  -- SCOPING: the other session's booking is not this cancel's business.
  select status into v_status from public.reservation where member_id = c_otra and class_session_id = s_otra;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(3): a booking on ANOTHER session was flipped to %', v_status; end if;
  select clases_restantes into v_n from public.clientes where id = c_otra;
  if v_n is distinct from 4 then raise exception 'RULE FAIL(3): c_otra balance % (expected an untouched 4 — its class was not cancelled)', v_n; end if;

  -- …and no `reservada` row survives on the cancelled session: the release is exhaustive, not partial
  -- (the SECURITY INVOKER risk this vector exists to close — and the reason this count is taken as
  -- ops, where nothing can be hidden from it).
  select count(*) into v_n from public.reservation where class_session_id = s_a and status = 'reservada';
  if v_n is distinct from 0 then raise exception 'RULE FAIL(3): % still-held booking(s) survived the cancel (PARTIAL RELEASE)', v_n; end if;
end $$;

-- ── (4) RE-CANCEL REFUSES — and that is what makes the release idempotent ────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s_a uuid := current_setting('t.s_a', true)::uuid;
  v_raised boolean := false;
begin
  begin
    perform public.cancel_class_session(s_a);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Sesión no encontrada o ya cancelada%' then
      raise exception 'RULE FAIL(4): wrong raise on a re-cancel: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(4): a second cancel was accepted'; end if;
end $$;
reset role;

do $$
declare
  c_fin1 uuid := current_setting('t.c_fin1', true)::uuid;
  c_fin2 uuid := current_setting('t.c_fin2', true)::uuid;
  v_n int;
begin
  -- The refusal fires ABOVE the release, so no member is paid twice. This is the whole idempotency
  -- argument, and it is asserted on the balances rather than on the raise.
  select clases_restantes into v_n from public.clientes where id = c_fin1;
  if v_n is distinct from 5 then raise exception 'RULE FAIL(4): c_fin1 balance % after a refused re-cancel (expected 5) — DOUBLE REFUND', v_n; end if;
  select clases_restantes into v_n from public.clientes where id = c_fin2;
  if v_n is distinct from 3 then raise exception 'RULE FAIL(4): c_fin2 balance % after a refused re-cancel (expected 3) — DOUBLE REFUND', v_n; end if;
end $$;

select 'cancel_class_session release: OK' as result;
rollback;
