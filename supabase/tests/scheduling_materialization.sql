-- Materialization idempotency + independence behavior suite for the S1 scheduling RPCs — slice #42
-- (PRD #36 S1 decision c; ADR-0010 §1). Runs as gym-A staff (operator_a) through the SECURITY INVOKER
-- RPCs, so it also proves the happy path works under RLS. Transaction-local (begin/rollback), zero
-- hardcoded prod UUIDs, self-asserting (RAISEs on failure; a clean run returns one 'OK' row).
--
-- Proves the acceptance vectors:
--   1) create_recurring_schedule is ONE atomic transaction: N weekdays × horizon weeks sessions + their
--      coach joins + one template per weekday all appear (or none would, on failure).
--   2) Idempotent: re-running ensure_week_materialized for an already-materialized week creates 0 new rows.
--   3) A deactivated template materializes nothing new.
--   4) Existing sessions are untouched by a template edit (starts_at unchanged after the template changes).
--   5) A MOVED session is not resurrected: after edit_class_session changes a materialized session's
--      starts_at (the ADR-0010 holiday move), re-running ensure_week_materialized for that week creates
--      0 new sessions — the materialization guard is immutable (schedule_template_week), so vacating
--      the old (template_id, starts_at) instant must not regenerate the original slot.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or the MCP execute_sql.

begin;

do $$
declare
  gym_a      uuid;
  operator_a uuid := gen_random_uuid();
  ct_a       uuid;
  coach_a    uuid;
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

  insert into auth.users (instance_id, id, aud, role, email)
    values ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'sched-mat-operator-a@test.local');
  insert into public.gym_membership (user_id, gym_id, role) values (operator_a, gym_a, 'operator');

  insert into public.coach (gym_id, name, initials, role) values (gym_a, 'Coach Mat', 'CM', 'coach') returning id into coach_a;
  insert into public.class_type (gym_id, name) values (gym_a, 'Funcional Mat') returning id into ct_a;

  perform set_config('t.gym_a',      gym_a::text,      true);
  perform set_config('t.operator_a', operator_a::text, true);
  perform set_config('t.ct_a',       ct_a::text,       true);
  perform set_config('t.coach_a',    coach_a::text,    true);
end $$;

-- Act + assert as gym-A staff, through the RPCs.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  gym_a   uuid := current_setting('t.gym_a', true)::uuid;
  ct_a    uuid := current_setting('t.ct_a', true)::uuid;
  coach_a uuid := current_setting('t.coach_a', true)::uuid;
  tz      text;
  today   date;
  n int;
  added int;
  a_session uuid;
  starts_before timestamptz;
  starts_after  timestamptz;
  tmpl uuid;
begin
  select timezone into tz from public.gym where id = gym_a;
  today := (now() at time zone tz)::date;

  -- (1) Recurring create: 2 weekdays (Lun, Mié) × 2-week horizon = 4 sessions, each with 1 coach join,
  --     from 2 templates — all in one atomic RPC call.
  perform public.create_recurring_schedule(ct_a, array[0, 2], '18:00'::time, 45, 24, array[coach_a], 2);

  select count(*) into n from public.schedule_template where gym_id = gym_a;
  if n <> 2 then raise exception 'MAT FAIL: expected 2 templates, got %', n; end if;
  select count(*) into n from public.class_session where gym_id = gym_a and template_id is not null;
  if n <> 4 then raise exception 'MAT FAIL: expected 4 materialized sessions (2 weekdays x 2 weeks), got %', n; end if;
  select count(*) into n from public.class_session_coach csc
    join public.class_session cs on cs.id = csc.session_id where cs.gym_id = gym_a;
  if n <> 4 then raise exception 'MAT FAIL: expected 4 coach joins (one per session), got %', n; end if;

  -- (2) Idempotency: re-materialize this week and next → 0 new, total still 4.
  added := public.ensure_week_materialized(today);
  if added <> 0 then raise exception 'MAT FAIL: re-materializing this week created % new sessions (expected 0)', added; end if;
  added := public.ensure_week_materialized(today + 7);
  if added <> 0 then raise exception 'MAT FAIL: re-materializing next week created % new sessions (expected 0)', added; end if;
  select count(*) into n from public.class_session where gym_id = gym_a and template_id is not null;
  if n <> 4 then raise exception 'MAT FAIL: total sessions drifted to % after idempotent re-runs (expected 4)', n; end if;

  -- (3) Deactivate the templates → a fresh, un-materialized week yields nothing new.
  update public.schedule_template set is_active = false where gym_id = gym_a;
  added := public.ensure_week_materialized(today + 21);
  if added <> 0 then raise exception 'MAT FAIL: deactivated templates materialized % new sessions (expected 0)', added; end if;

  -- (4) A template edit does NOT reach an existing session (independent rows once written).
  select id, starts_at into a_session, starts_before
    from public.class_session where gym_id = gym_a and template_id is not null order by starts_at limit 1;
  select template_id into tmpl from public.class_session where id = a_session;
  update public.schedule_template set start_time = '20:00', is_active = true where id = tmpl;
  select starts_at into starts_after from public.class_session where id = a_session;
  if starts_after <> starts_before then
    raise exception 'MAT FAIL: template edit changed an existing session starts_at (% -> %)', starts_before, starts_after;
  end if;

  -- (5) A MOVED session is not resurrected (the ADR-0010 holiday move): edit the earliest session
  --     one day later (vacating its original (template_id, starts_at) instant), then re-materialize
  --     its week — 0 new sessions, total unchanged. a_session is in THIS week (earliest starts_at),
  --     and its template was re-activated in (4), so a starts_at-keyed guard WOULD regenerate the
  --     vacated slot here; the immutable per-week guard must not.
  perform public.edit_class_session(a_session, ct_a, starts_before + interval '1 day', 45, 24, array[coach_a]);
  added := public.ensure_week_materialized(today);
  if added <> 0 then raise exception 'MAT FAIL: re-materializing after a session move resurrected % session(s) at the vacated slot', added; end if;
  select count(*) into n from public.class_session where gym_id = gym_a and template_id is not null;
  if n <> 4 then raise exception 'MAT FAIL: total sessions drifted to % after the move + re-materialize (expected 4)', n; end if;
end $$;
reset role;

select 'scheduling materialization: OK' as result;
rollback;
