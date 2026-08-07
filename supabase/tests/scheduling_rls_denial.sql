-- Cross-tenant + anon RLS denial suite for the S1 scheduling spine (class_session,
-- class_session_coach, schedule_template, schedule_template_coach) and the atomic write RPCs —
-- slice #42 (PRD #36 S1; ADR-0010; ADR-0013 curated/showcased class; decision b: no anon read yet).
--
-- Denial-test-FIRST (TDD): recorded RED before the 20260706120000/20260706120100 migrations create
-- these tables/policies/functions (fails with "relation/function does not exist"), GREEN after.
-- Mirrors the catalog_rls_denial.sql fixture idiom — zero hardcoded prod UUIDs, transaction-local,
-- self-asserting (every check RAISEs on failure; a clean run returns one 'OK' row).
--
-- Vectors proved:
--   1) staff of gym A: reads all 4 tables + create_class_session RPC lands a session in gym A.
--   2) anon reads class_session/class_session_coach/schedule_template FOR THE GYM THE REQUEST NAMES
--      and no other (decision b discharged in #50, scoped per gym by #215),
--      but NOT schedule_template_coach (excluded from the anon set), and — slice #56 — NOT
--      gym_membership: the member AGENDA is membership-scoped, so anon has no anchor to read it from
--      even though the raw catalog is public.
--   3) cross-tenant operator (staff of gym B only): reads 0 of gym A's rows; direct update affects 0;
--      direct insert denied by with-check; create_class_session referencing gym A's class_type RAISES;
--      edit/cancel of gym A's session RAISE (RLS scopes the row out → "not found"); delete on gym A's
--      coach join affects 0; and — #243 — the two SERIES-level verbs
--      (update_recurring_schedule / retire_recurring_schedule) refuse gym A's TEMPLATE, with ZERO
--      rows written across schedule_template / class_session / reservation / clientes. Both are
--      aimed with gym B's OWN class_type on purpose, so the class_type guard passes and the refusal
--      can only come from the template's gym pin — the fence actually under test. That pin matters
--      because schedule_template's SELECT policy is is_member_of, which is WIDER than staff: without
--      it a multi-gym actor would get a silently-zero-row fan-out instead of a refusal.
--   4) gym-A MEMBER (is_member_of, no staff role): reads sessions/templates but every direct write
--      affects 0, and the staff RPCs refuse them (staff_gym() = NULL → "No autorizado").
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or ad hoc via
-- the Supabase MCP execute_sql.

begin;

do $$
declare
  -- gym A is minted fresh (like gym B) since #86: the real-forge seed migration populates forge's
  -- schedule templates, so a suite reusing forge as gym A would count seeded rows, not its own fixtures.
  gym_a       uuid := gen_random_uuid();
  gym_b       uuid := gen_random_uuid();
  operator_a  uuid := gen_random_uuid();
  operator_b  uuid := gen_random_uuid();
  member_a    uuid := gen_random_uuid();
  ct_a        uuid;
  coach_a     uuid;
  tmpl_a      uuid;
  session_a   uuid;
  ct_b        uuid;
  coach_b     uuid;
  session_b   uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'scheduling-denial-gym-a', 'Scheduling Denial Gym A', 'America/Chihuahua',   'forge'),
    (gym_b, 'scheduling-denial-gym-2', 'Scheduling Denial Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'sched-operator-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', operator_b, 'authenticated', 'authenticated', 'sched-operator-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_a,   'authenticated', 'authenticated', 'sched-member-a@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (operator_a, gym_a, 'operator'),
    (operator_b, gym_b, 'operator'),
    (member_a,   gym_a, 'member');

  -- Gym-A catalog + one session/template of each (owned via the migration role, RLS bypassed).
  insert into public.coach (gym_id, name, initials, role) values (gym_a, 'Coach Sched', 'CS', 'coach')
    returning id into coach_a;
  insert into public.class_type (gym_id, name) values (gym_a, 'Metcon Denial')
    returning id into ct_a;

  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (gym_a, ct_a, 0, '18:00', 45, 24) returning id into tmpl_a;
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values (gym_a, tmpl_a, coach_a);

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (gym_a, ct_a, '2026-07-06 18:00:00-06', 45, 24, tmpl_a) returning id into session_a;
  insert into public.class_session_coach (gym_id, session_id, coach_id) values (gym_a, session_a, coach_a);

  -- Gym B's own scheduling rows — the cross-gym probe the anon section needs since #215 (naming gym A
  -- must return none of them). Invisible to every authenticated actor below (member_a/operator_a are
  -- gym-A-scoped and operator_b's assertions are all `where gym_id = gym_a`), so the exact counts stand.
  insert into public.coach (gym_id, name, initials, role) values (gym_b, 'Coach B', 'CB', 'coach')
    returning id into coach_b;
  insert into public.class_type (gym_id, name) values (gym_b, 'Metcon B')
    returning id into ct_b;
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (gym_b, ct_b, 1, '19:00', 45, 24);
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_b, ct_b, '2026-07-06 19:00:00-06', 45, 24) returning id into session_b;
  insert into public.class_session_coach (gym_id, session_id, coach_id) values (gym_b, session_b, coach_b);

  perform set_config('t.gym_a',      gym_a::text,      true);
  perform set_config('t.gym_b',      gym_b::text,      true);
  perform set_config('t.operator_a', operator_a::text, true);
  perform set_config('t.operator_b', operator_b::text, true);
  perform set_config('t.member_a',   member_a::text,   true);
  perform set_config('t.ct_a',       ct_a::text,       true);
  perform set_config('t.ct_b',       ct_b::text,       true);
  perform set_config('t.tmpl_a',     tmpl_a::text,     true);
  perform set_config('t.session_a',  session_a::text,  true);
end $$;

-- ── anon: reads the NAMED gym's public catalog (#50), but NOT the template coach join ─────────────
-- Post-#50 (20260706160000_phase6_anon_catalog_read) anon SELECTs class_session, class_session_coach
-- and schedule_template — the marketing pages' public surface. Since #215 those policies key on the
-- gym the REQUEST names (x-gym-id → PostgREST's `request.headers` GUC → public.gym_en_peticion(), what
-- createAnonClient(gymId) stamps), so the suite names a gym exactly as PostgREST would and gym B's rows
-- (seeded above) must stay invisible. schedule_template_coach is deliberately LEFT OUT of the anon set
-- (PRD #49 names "class sessions +coach join", not the template's coach join), so it stays invisible to
-- anon at any header. The exhaustive anon allowlist is asserted in anon_catalog_read.sql.
set local role anon;
select set_config('request.headers', json_build_object('x-gym-id', current_setting('t.gym_a'))::text, true);
do $$
declare
  n int;
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
begin
  select count(*) into n from public.class_session;           if n < 1 then raise exception 'ANON READ FAIL: class_session % rows (public since #50)', n; end if;
  select count(*) into n from public.class_session_coach;     if n < 1 then raise exception 'ANON READ FAIL: class_session_coach % rows (public since #50)', n; end if;
  select count(*) into n from public.schedule_template;       if n < 1 then raise exception 'ANON READ FAIL: schedule_template % rows (public since #50)', n; end if;
  select count(*) into n from public.schedule_template_coach; if n <> 0 then raise exception 'ANON DENIAL FAIL: schedule_template_coach % rows visible (must stay non-anon)', n; end if;
  -- slice #56 member-agenda anchor: gym_membership's policies are `to authenticated`, so anon reads
  -- ZERO membership rows. getAgendaSemanaMiembro resolves the member's gym from THIS table, so an anon
  -- caller has no gym to scope a member agenda to — the public catalog is readable, the member agenda
  -- is not. (The fixture block above already seeded 3 memberships, so a leak would read 3, not 0.)
  select count(*) into n from public.gym_membership; if n <> 0 then raise exception 'ANON DENIAL FAIL: anon sees % gym_membership rows (member-agenda anchor must be anon-invisible)', n; end if;

  -- #215: the request named gym A, so gym B's scheduling rows (seeded, non-vacuous) must not come back.
  select count(*) into n from public.class_session       where gym_id = gym_b; if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s class_session rows', n; end if;
  select count(*) into n from public.class_session_coach where gym_id = gym_b; if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s class_session_coach rows', n; end if;
  select count(*) into n from public.schedule_template   where gym_id = gym_b; if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s schedule_template rows', n; end if;
end $$;
reset role;

-- ── cross-tenant: operator_b (staff of gym B only) reads 0 / writes 0 / RPCs refused on gym A ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  gym_a     uuid := current_setting('t.gym_a', true)::uuid;
  ct_a      uuid := current_setting('t.ct_a', true)::uuid;
  ct_b      uuid := current_setting('t.ct_b', true)::uuid;
  tmpl_a    uuid := current_setting('t.tmpl_a', true)::uuid;
  session_a uuid := current_setting('t.session_a', true)::uuid;
  raised boolean;
  msg text;
begin
  select count(*) into n from public.class_session where gym_id = gym_a;           if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s class_session rows', n; end if;
  select count(*) into n from public.class_session_coach where gym_id = gym_a;     if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s class_session_coach rows', n; end if;
  select count(*) into n from public.schedule_template where gym_id = gym_a;       if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s schedule_template rows', n; end if;
  select count(*) into n from public.schedule_template_coach where gym_id = gym_a; if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s schedule_template_coach rows', n; end if;

  update public.class_session set duration_min = 30 where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: operator_b updated % of gym A''s class_session rows', n; end if;

  delete from public.class_session_coach where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: operator_b deleted % of gym A''s class_session_coach rows', n; end if;

  begin
    insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct_a, now(), 45, 24);
    raise exception 'DENIAL FAIL: operator_b inserted a class_session into gym A (with-check did not deny)';
  exception when insufficient_privilege or check_violation then null;  -- expected RLS with-check denial
  end;

  -- RPC refuses acting on another gym's rows: create referencing gym A's class_type raises.
  raised := false;
  begin perform public.create_class_session(ct_a, now(), 45, 24);
  exception when others then raised := true; end;
  if not raised then raise exception 'DENIAL FAIL: create_class_session accepted gym A''s class_type for operator_b'; end if;

  -- RPC cancel/edit of gym A's session raise (RLS scopes the row out → "not found").
  raised := false;
  begin perform public.cancel_class_session(session_a);
  exception when others then raised := true; end;
  if not raised then raise exception 'DENIAL FAIL: operator_b cancelled gym A''s session'; end if;

  -- #243 THE SERIES VERBS. Aimed with gym B's OWN class_type so the class_type guard passes and the
  -- template's gym pin is the only thing left to refuse — the fence under test, and the one the
  -- is_member_of SELECT policy would otherwise leave as a silent zero-row no-op.
  -- ONE sentence for both halves of the pin — the template is not there (wrong gym) and the template
  -- is retired are the same fact to an operator, so update_recurring_schedule raises retire's own
  -- string. It still isolates the GYM pin here: the block below reads tmpl_a back as ops and asserts
  -- `is_active` is still true, so "or ya retirado" cannot be what produced this refusal.
  raised := false;
  begin perform public.update_recurring_schedule(tmpl_a, ct_b, '07:00'::time, 60, 20);
  exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'DENIAL FAIL: operator_b edited gym A''s recurring schedule'; end if;
  if msg is distinct from 'Horario no encontrado o ya retirado' then
    raise exception 'DENIAL FAIL: update_recurring_schedule refused for the wrong reason (%) — the gym pin is not what stopped it', msg;
  end if;

  raised := false;
  begin perform public.retire_recurring_schedule(tmpl_a);
  exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'DENIAL FAIL: operator_b retired gym A''s recurring schedule'; end if;
  if msg is distinct from 'Horario no encontrado o ya retirado' then
    raise exception 'DENIAL FAIL: retire_recurring_schedule refused for the wrong reason (%)', msg;
  end if;
end $$;
reset role;

-- ── #243: the two refused series calls wrote NOTHING, read back as ops ────────────────────────────
-- Read after `reset role` on purpose: gym A's rows are invisible to operator_b, so a leak asserted
-- from inside the block above would come back as a comfortable zero. Four tables, because a series
-- verb is the first RPC in this spine that can reach all four in one call.
do $$
declare
  gym_a  uuid := current_setting('t.gym_a', true)::uuid;
  tmpl_a uuid := current_setting('t.tmpl_a', true)::uuid;
  n int;
  r record;
begin
  select class_type_id, weekday, start_time, duration_min, capacity, is_active into r
    from public.schedule_template where id = tmpl_a;
  if r.class_type_id is distinct from current_setting('t.ct_a', true)::uuid
     or r.weekday is distinct from 0
     or r.start_time is distinct from '18:00'::time
     or r.duration_min is distinct from 45
     or r.capacity is distinct from 24
     or r.is_active is distinct from true then
    raise exception 'DENIAL FAIL(#243): the refused calls rewrote gym A''s template (ct % wd % t % dur % cap % active %)',
      r.class_type_id, r.weekday, r.start_time, r.duration_min, r.capacity, r.is_active;
  end if;

  select starts_at, template_id, cancelled_at, duration_min, capacity into r
    from public.class_session where id = current_setting('t.session_a', true)::uuid;
  if r.starts_at is distinct from '2026-07-06 18:00:00-06'::timestamptz
     or r.template_id is distinct from tmpl_a
     or r.cancelled_at is not null
     or r.duration_min is distinct from 45
     or r.capacity is distinct from 24 then
    raise exception 'DENIAL FAIL(#243): the refused calls rewrote gym A''s session (at % tmpl % cancelled % dur % cap %)',
      r.starts_at, r.template_id, r.cancelled_at, r.duration_min, r.capacity;
  end if;
  select count(*) into n from public.class_session where gym_id = gym_a;
  if n <> 1 then raise exception 'DENIAL FAIL(#243): gym A has % class_session rows after the refused calls (expected 1)', n; end if;

  select count(*) into n from public.reservation where gym_id = gym_a;
  if n <> 0 then raise exception 'DENIAL FAIL(#243): the refused calls wrote % reservation row(s) into gym A', n; end if;
  select count(*) into n from public.clientes where gym_id = gym_a;
  if n <> 0 then raise exception 'DENIAL FAIL(#243): the refused calls wrote % clientes row(s) into gym A', n; end if;
end $$;

-- ── member of gym A: reads sessions/templates, but every write affects 0 and staff RPCs refuse ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  gym_a     uuid := current_setting('t.gym_a', true)::uuid;
  ct_a      uuid := current_setting('t.ct_a', true)::uuid;
  session_a uuid := current_setting('t.session_a', true)::uuid;
  raised boolean;
begin
  select count(*) into n from public.class_session;     if n <> 1 then raise exception 'MEMBER FAIL: member_a sees % class_session rows (expected 1)', n; end if;
  select count(*) into n from public.schedule_template; if n <> 1 then raise exception 'MEMBER FAIL: member_a sees % schedule_template rows', n; end if;

  update public.class_session set duration_min = 30 where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'MEMBER FAIL: member_a wrote % class_session rows (curated class is staff-write-only)', n; end if;

  delete from public.class_session_coach where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'MEMBER FAIL: member_a deleted % class_session_coach rows', n; end if;

  raised := false;
  begin perform public.create_class_session(ct_a, now(), 45, 24);
  exception when others then raised := true; end;   -- staff_gym() = NULL → "No autorizado"
  if not raised then raise exception 'MEMBER FAIL: member_a called create_class_session (staff RPC) successfully'; end if;

  raised := false;
  begin perform public.cancel_class_session(session_a);
  exception when others then raised := true; end;
  if not raised then raise exception 'MEMBER FAIL: member_a called cancel_class_session (staff RPC) successfully'; end if;
end $$;
reset role;

-- ── staff of gym A: reads all 4 + create_class_session RPC lands a session (positive control, LAST
--    so its inserted row does not perturb the exact-count reads above) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  ct_a  uuid := current_setting('t.ct_a', true)::uuid;
  new_session uuid;
  v_cancelled timestamptz;
begin
  select count(*) into n from public.class_session;           if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % class_session rows (expected 1)', n; end if;
  select count(*) into n from public.class_session_coach;     if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % class_session_coach rows', n; end if;
  select count(*) into n from public.schedule_template;       if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % schedule_template rows', n; end if;
  select count(*) into n from public.schedule_template_coach; if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % schedule_template_coach rows', n; end if;

  -- FUTURE, not a fixed 2026-07-07 instant: since #245 (20260804150000 §4) cancel_class_session is
  -- BEFORE-START ONLY, so the session this vector cancels below must not have begun. A wall-clock
  -- literal was always going to age into the past; `now() + 2 days` cannot.
  new_session := public.create_class_session(ct_a, now() + interval '2 days', 60, 20);
  if new_session is null then raise exception 'STAFF FAIL: create_class_session returned null'; end if;
  select count(*) into n from public.class_session where gym_id = gym_a;
  if n <> 2 then raise exception 'STAFF FAIL: after RPC operator_a sees % class_session rows (expected 2)', n; end if;

  -- cancel_class_session success path + WRITTEN ROW (#80 AC6): the RPC's only running-suite call sites
  -- were denials (operator_b, member_a), so its `cancelled_at` write had zero coverage. Cancel the row
  -- just minted (an UPDATE, so it does not perturb the exact-count reads above) and assert the stamp.
  -- The release half of that RPC lives in cancel_class_session_release.sql; this stays the schedule-
  -- side stamp vector.
  perform public.cancel_class_session(new_session);
  select cancelled_at into v_cancelled from public.class_session where id = new_session;
  if v_cancelled is null then raise exception 'STAFF FAIL: cancel_class_session did not stamp cancelled_at'; end if;
end $$;
reset role;

select 'scheduling rls denial: OK' as result;
rollback;
