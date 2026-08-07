-- Weekly class-horizon auto-roll contract suite (#136), hardening item #5 of
-- docs/Context/2026-08-04-136-recurrence-cross-examination.md. Covers the two new write-bearing
-- functions from 20260805100000_class_horizon_autoroll.sql — public.cron_materialize_horizon() (the
-- SECURITY DEFINER fleet pass) and public.materialize_week_for_gym(uuid, date) (the shared INVOKER
-- core) — plus the refactored public.ensure_week_materialized(date) wrapper.
--
-- Transaction-local (begin/rollback), zero hardcoded prod UUIDs, self-asserting (RAISEs on failure;
-- a clean run returns one 'OK' row). The fixture DO block runs as the connection role (postgres, RLS
-- bypassed) — same idiom as scheduling_materialization.sql, which this suite sits beside.
--
-- Vectors:
--   1) WRITTEN ROWS — two gyms in DIFFERENT timezones, each with an active template, both get their
--      full 6-week horizon from ONE cron_materialize_horizon() call: 6 sessions per template, each
--      stamped with its own template's gym_id, each coach join seeded and gym-stamped, each ledger
--      week claimed, the span exactly 5 weeks from the gym's OWN local Monday, and each instant at
--      the template's wall-clock time in THAT gym's timezone (America/Mexico_City is UTC-6 and
--      America/Cancún UTC-5 year-round, so using the wrong gym's zone shifts the wall clock and fails).
--      The run's summary is also a WRITTEN ROW: exactly one public.cron_run_log row per call, whose
--      text is the value the function returned. It has to be — pg_cron records only the command tag
--      ('1 row'), so a summary that lived solely in the return value would be discarded and a gym
--      erroring every week would be invisible.
--   2) IDEMPOTENT — an immediate second run reports created=0 and the row totals do not move (but it
--      does log its own second cron_run_log row: every run is accounted for, including the quiet ones).
--   3) PER-GYM ISOLATION — a third gym with a garbage timezone ('Not/AZone') fails, and in the SAME
--      run gyms A and B still materialize; the summary reports errors=1 and NAMES the failing gym —
--      asserted on the PERSISTED row, not just the returned string, since the persisted one is what
--      ops will actually read; the failed gym leaves neither sessions nor a poisoned
--      schedule_template_week claim behind.
--   4) PRIVILEGE + CROSS-TENANT DENIAL — with a gym-A staff JWT: cron_materialize_horizon() is not
--      executable, neither gym_horizon_depth nor cron_run_log is readable, and
--      materialize_week_for_gym(gym_B, …) writes
--      no gym-B rows (SECURITY INVOKER + RLS). ensure_week_materialized still behaves exactly as
--      before for the caller's own gym (0 for an already-materialized week, 1 for a fresh one).
--      (4e) a logged-in user who is staff of NO gym hits ensure_week_materialized's own
--      'No autorizado' — the wrapper's entire remaining substance after the #136 refactor, and
--      unreachable from every staff-JWT vector above. (4f) the same two ops-only objects are probed
--      as ANON, the role that actually faces the internet: EXECUTE/GRANT must refuse all three before
--      any body runs. Neither refusal moves a row, compared against a snapshot rather than arithmetic.
--   5) HEALTH VIEW — gym_horizon_depth excludes cancelled sessions and keeps a gym with ZERO future
--      sessions visible (that row IS the "the cron died" alarm).
--
-- NOT covered here, deliberately: that the pg_cron JOB exists and fires. cron.job is DB state, not
-- migration state, so no suite replayed against a scratch project can prove it — verify on live with
-- `select jobname, schedule, active from cron.job where jobname = 'roll-class-horizon';`. This suite
-- tests the function the job calls, which is the part a migration can actually guarantee.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or the MCP execute_sql.

begin;

do $$
declare
  gym_a      uuid := gen_random_uuid();   -- America/Mexico_City (UTC-6, no DST)
  gym_b      uuid := gen_random_uuid();   -- America/Cancun      (UTC-5, no DST)
  gym_c      uuid := gen_random_uuid();   -- garbage timezone — the isolation vector
  gym_tz     uuid := gen_random_uuid();   -- #244 guard 2's OWN throwaway gym — never touched by the
                                           -- cron/horizon assertions below, so mutating its timezone
                                           -- (the whole point of that vector) cannot corrupt them.
  operator_a uuid := gen_random_uuid();
  outsider   uuid := gen_random_uuid();   -- authenticated, STAFF OF NOTHING — the 'No autorizado' arm
  ct_a uuid; ct_b uuid; ct_c uuid;
  coach_a uuid;
  tmpl_a uuid; tmpl_b uuid; tmpl_c uuid;
begin
  -- Fresh gyms, not the seeded ones: cron_materialize_horizon walks the WHOLE fleet, so the suite
  -- must own gyms whose expected counts it fully controls.
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'horizon-autoroll-a', 'Horizon Autoroll A', 'America/Mexico_City', 'forge'),
    (gym_b, 'horizon-autoroll-b', 'Horizon Autoroll B', 'America/Cancun',      'forge');

  -- #244 guard 2 landed a BEFORE INSERT/UPDATE OF timezone trigger on public.gym that validates
  -- against a real IANA zone — this migration's own weakness-6 note, turned into code. 'Not/AZone'
  -- can no longer arrive through the normal write path this fixture used to use directly. The
  -- per-gym ISOLATION vector below is still a real property to prove (a per-gym fault the cron's
  -- subtransaction must contain, whatever put it there — a legacy row that predates the guard, or a
  -- future fault of a different shape entirely), so the trigger is disabled for exactly this one
  -- deliberately-bad row and re-enabled immediately after, so every other write in this suite still
  -- goes through the real gate.
  alter table public.gym disable trigger gym_timezone_valid;
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_c, 'horizon-autoroll-c', 'Horizon Autoroll C', 'Not/AZone', 'forge');
  alter table public.gym enable trigger gym_timezone_valid;

  -- gym_tz: guard 2's own fixture, no schedule_template (so cron_materialize_horizon's fleet loop
  -- never touches it) — its timezone gets mutated below, which must not reach any other assertion.
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_tz, 'horizon-autoroll-tz', 'Horizon Autoroll TZ', 'America/Chihuahua', 'forge');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'horizon-operator-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', outsider,   'authenticated', 'authenticated', 'horizon-outsider@test.local');
  -- operator_a is staff of gym A. `outsider` deliberately gets NO gym_membership row at all: it is a
  -- logged-in user of the platform who is staff of nothing, which is the only state in which
  -- staff_gym() returns NULL — and therefore the only state that reaches ensure_week_materialized's
  -- own 'No autorizado' raise (vector 4e). Every other actor in this suite is staff somewhere.
  insert into public.gym_membership (user_id, gym_id, role) values (operator_a, gym_a, 'operator');

  insert into public.class_type (gym_id, name) values (gym_a, 'Funcional Horizonte') returning id into ct_a;
  insert into public.class_type (gym_id, name) values (gym_b, 'Funcional Horizonte') returning id into ct_b;
  insert into public.class_type (gym_id, name) values (gym_c, 'Funcional Horizonte') returning id into ct_c;
  insert into public.coach (gym_id, name, initials, role) values (gym_a, 'Coach Horizonte', 'CH', 'coach') returning id into coach_a;

  -- Templates are inserted directly rather than through create_recurring_schedule: that RPC needs a
  -- staff JWT per gym and would itself trip on gym C's timezone, which is the thing under test.
  -- group_id is NOT NULL with no default since #243 slice 4 (20260806120000). Each of these is its own
  -- schedule (different gyms), so each is a group of one.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_a, ct_a, 0, '18:00', 45, 24, gen_random_uuid()) returning id into tmpl_a;   -- Lunes 18:00 local to CDMX
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_b, ct_b, 2, '07:00', 60, 20, gen_random_uuid()) returning id into tmpl_b;   -- Miércoles 07:00 local to Cancún
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_c, ct_c, 1, '09:00', 60, 20, gen_random_uuid()) returning id into tmpl_c;
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values (gym_a, tmpl_a, coach_a);

  perform set_config('t.h_gym_a',   gym_a::text,      true);
  perform set_config('t.h_gym_b',   gym_b::text,      true);
  perform set_config('t.h_gym_c',   gym_c::text,      true);
  perform set_config('t.h_gym_tz',  gym_tz::text,     true);
  perform set_config('t.h_oper_a',  operator_a::text, true);
  perform set_config('t.h_outsider', outsider::text,  true);
  perform set_config('t.h_tmpl_a',  tmpl_a::text,     true);
  perform set_config('t.h_tmpl_b',  tmpl_b::text,     true);
end $$;

-- ── (1)(2)(3) The fleet pass, run as the ops role (postgres) — the way pg_cron runs it ──────────
do $$
declare
  gym_a  uuid := current_setting('t.h_gym_a', true)::uuid;
  gym_b  uuid := current_setting('t.h_gym_b', true)::uuid;
  gym_c  uuid := current_setting('t.h_gym_c', true)::uuid;
  tmpl_a uuid := current_setting('t.h_tmpl_a', true)::uuid;
  tmpl_b uuid := current_setting('t.h_tmpl_b', true)::uuid;
  summary1 text;
  summary2 text;
  logged   text;
  log_before int;
  n int;
  d date;
  monday_a date;
  monday_b date;
begin
  -- Deltas, not absolute counts: on a project where the real job has already fired, cron_run_log is
  -- not empty when this suite starts.
  select count(*) into log_before from public.cron_run_log where job = 'roll-class-horizon';

  summary1 := public.cron_materialize_horizon();

  -- (1) WRITTEN ROWS — 6 weeks per gym, from one call.
  select count(*) into n from public.class_session where gym_id = gym_a and template_id = tmpl_a;
  if n <> 6 then raise exception 'AUTOROLL FAIL: gym A got % sessions (expected 6). summary=%', n, summary1; end if;
  select count(*) into n from public.class_session where gym_id = gym_b and template_id = tmpl_b;
  if n <> 6 then raise exception 'AUTOROLL FAIL: gym B got % sessions (expected 6). summary=%', n, summary1; end if;

  -- Every written session carries ITS OWN template's gym_id (the #78 axis: assert the stamp, not the
  -- return value). A cron that leaked gym A's id onto gym B's rows counts 6/6 above and fails here.
  select count(*) into n
    from public.class_session cs
    join public.schedule_template st on st.id = cs.template_id
   where st.gym_id in (gym_a, gym_b, gym_c) and cs.gym_id is distinct from st.gym_id;
  if n <> 0 then raise exception 'AUTOROLL FAIL: % session(s) stamped with a gym_id that is not their template''s', n; end if;

  -- Coach joins seeded for every new session, gym-stamped.
  select count(*) into n
    from public.class_session_coach csc
    join public.class_session cs on cs.id = csc.session_id
   where cs.template_id = tmpl_a and csc.gym_id = gym_a;
  if n <> 6 then raise exception 'AUTOROLL FAIL: gym A got % coach joins (expected 6)', n; end if;

  -- The immutable ledger claimed all 6 weeks (this is what makes the re-run in (2) a no-op).
  select count(*) into n from public.schedule_template_week where gym_id = gym_a and template_id = tmpl_a;
  if n <> 6 then raise exception 'AUTOROLL FAIL: gym A ledger has % week claims (expected 6)', n; end if;

  -- The run's own written row: exactly one cron_run_log row, carrying the text the call returned.
  -- Asserting equality (not merely "a row exists") is what makes this a contract on the SUMMARY: a
  -- function that logged a constant, or logged before counting, passes a row-count check and fails here.
  select count(*) into n from public.cron_run_log where job = 'roll-class-horizon';
  if n <> log_before + 1 then
    raise exception 'AUTOROLL FAIL: one run logged % cron_run_log row(s) (expected exactly 1)', n - log_before;
  end if;
  select count(*) into n from public.cron_run_log where job = 'roll-class-horizon' and summary = summary1;
  if n <> 1 then
    raise exception 'AUTOROLL FAIL: the logged summary is not the one the run returned (%)', summary1;
  end if;

  -- Horizon shape: starts at the gym's OWN local Monday and spans exactly 5 more weeks (6 weeks, #6).
  monday_a := (now() at time zone 'America/Mexico_City')::date;
  monday_a := monday_a - ((extract(isodow from monday_a)::int - 1));
  select min((starts_at at time zone 'America/Mexico_City')::date),
         max((starts_at at time zone 'America/Mexico_City')::date) - min((starts_at at time zone 'America/Mexico_City')::date)
    into d, n
    from public.class_session where template_id = tmpl_a;
  if d <> monday_a then raise exception 'AUTOROLL FAIL: gym A horizon starts % (expected its local Monday %)', d, monday_a; end if;
  if n <> 35 then raise exception 'AUTOROLL FAIL: gym A horizon spans % days (expected 35 = 6 weeks)', n; end if;

  -- Each gym's instants respect ITS OWN timezone: the wall clock in the gym's zone must be the
  -- template's start_time on the template's weekday. CDMX and Cancún are one fixed hour apart, so a
  -- core that reused one gym's timezone for the other lands 07:00 Cancún at 08:00 and fails here.
  select count(*) into n from public.class_session
   where template_id = tmpl_a
     and ((starts_at at time zone 'America/Mexico_City')::time <> '18:00'::time
       or extract(isodow from (starts_at at time zone 'America/Mexico_City'))::int <> 1);
  if n <> 0 then raise exception 'AUTOROLL FAIL: % gym-A session(s) are not Monday 18:00 local to America/Mexico_City', n; end if;
  select count(*) into n from public.class_session
   where template_id = tmpl_b
     and ((starts_at at time zone 'America/Cancun')::time <> '07:00'::time
       or extract(isodow from (starts_at at time zone 'America/Cancun'))::int <> 3);
  if n <> 0 then raise exception 'AUTOROLL FAIL: % gym-B session(s) are not Wednesday 07:00 local to America/Cancun', n; end if;

  monday_b := (now() at time zone 'America/Cancun')::date;
  monday_b := monday_b - ((extract(isodow from monday_b)::int - 1));
  select min((starts_at at time zone 'America/Cancun')::date) into d from public.class_session where template_id = tmpl_b;
  if d <> monday_b + 2 then raise exception 'AUTOROLL FAIL: gym B horizon starts % (expected its own local week, %)', d, monday_b + 2; end if;

  -- (3) PER-GYM ISOLATION — gym C's garbage timezone cost gym C and nothing else. A and B above
  -- materialized in THIS SAME run, which is the whole point of the per-gym subtransaction.
  -- `errors=1 [` and not `errors=1`: the trailing bracket is what makes errors=10 fail this line too.
  if summary1 not like '%errors=1 [%' then
    raise exception 'AUTOROLL FAIL: expected errors=1 (the bad-timezone gym) — summary=%', summary1;
  end if;
  if position(gym_c::text in summary1) = 0 then
    raise exception 'AUTOROLL FAIL: the summary does not name the failing gym % — summary=%', gym_c, summary1;
  end if;
  -- …and the row ops will actually read says so too. Asserted directly on cron_run_log rather than
  -- inferred from the equality check above: the returned string is discarded by pg_cron, so the
  -- PERSISTED text naming the failing gym is the whole observability claim.
  select summary into logged from public.cron_run_log
   where job = 'roll-class-horizon' and summary like '%errors=1 [%' and position(gym_c::text in summary) > 0;
  if logged is null then
    raise exception 'AUTOROLL FAIL: no persisted cron_run_log row names the failing gym %', gym_c;
  end if;
  if summary1 like '%created=0%' then
    raise exception 'AUTOROLL FAIL: first run reported created=0 — summary=%', summary1;
  end if;
  select count(*) into n from public.class_session where gym_id = gym_c;
  if n <> 0 then raise exception 'AUTOROLL FAIL: the bad-timezone gym wrote % session(s)', n; end if;
  -- and it left no poisoned ledger claim. The per-gym subtransaction takes ALL of that gym's partial
  -- work with it — a bad timezone happens to fail before the first claim, but a template that failed
  -- after claiming would be rolled back the same way — so next week's run retries the gym cleanly
  -- instead of skipping a week it never actually materialized.
  select count(*) into n from public.schedule_template_week where gym_id = gym_c;
  if n <> 0 then raise exception 'AUTOROLL FAIL: the bad-timezone gym left % ledger claim(s) behind', n; end if;

  -- (2) IDEMPOTENT — an immediate second pass creates nothing and moves no totals.
  summary2 := public.cron_materialize_horizon();
  if summary2 not like '%created=0%' then
    raise exception 'AUTOROLL FAIL: the second run created rows — summary=%', summary2;
  end if;
  select count(*) into n from public.class_session where gym_id in (gym_a, gym_b);
  if n <> 12 then raise exception 'AUTOROLL FAIL: totals drifted to % after the idempotent re-run (expected 12)', n; end if;
  select count(*) into n from public.schedule_template_week where gym_id in (gym_a, gym_b);
  if n <> 12 then raise exception 'AUTOROLL FAIL: ledger drifted to % claims after the idempotent re-run (expected 12)', n; end if;
  -- A run that changed nothing is still a run that HAPPENED — it logs too, and that is the point:
  -- "the last summary is from last Monday" is only readable if quiet weeks leave a row.
  select count(*) into n from public.cron_run_log where job = 'roll-class-horizon';
  if n <> log_before + 2 then
    raise exception 'AUTOROLL FAIL: two runs logged % cron_run_log row(s) (expected 2)', n - log_before;
  end if;
  select count(*) into n from public.cron_run_log where job = 'roll-class-horizon' and summary = summary2;
  if n <> 1 then
    raise exception 'AUTOROLL FAIL: the second run did not log its own summary (%)', summary2;
  end if;
end $$;

-- ── (6) #244 guard 2 — gym.timezone itself is validated, not just tolerated by the cron's catch ──
-- The trigger this suite's own fixture works around above (disable/re-enable around gym C's seed) is
-- proven directly here: a write-path attempt to set a garbage zone is refused outright, and a real
-- IANA zone still writes normally. Runs against gym_tz — its OWN throwaway fixture, never referenced
-- by the cron/horizon assertions above or below, so mutating its timezone (the entire point of this
-- vector) cannot corrupt any of them the way reusing gym_a here would have.
do $$
declare
  gym_tz uuid := current_setting('t.h_gym_tz', true)::uuid;
  raised boolean;
begin
  raised := false;
  begin
    update public.gym set timezone = 'Not/AZone' where id = gym_tz;
  exception when others then raised := true;
  end;
  if not raised then raise exception 'GUARD FAIL(tz): updating gym.timezone to a garbage zone did not raise'; end if;
  perform 1 from public.gym where id = gym_tz and timezone = 'America/Chihuahua';
  if not found then raise exception 'GUARD FAIL(tz): gym.timezone changed despite the rejected update'; end if;

  update public.gym set timezone = 'America/Tijuana' where id = gym_tz;
  perform 1 from public.gym where id = gym_tz and timezone = 'America/Tijuana';
  if not found then raise exception 'GUARD FAIL(tz): a valid IANA zone update did not persist'; end if;
end $$;

-- ── (4) Privilege + cross-tenant denial, as gym-A staff ─────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.h_oper_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  gym_b    uuid := current_setting('t.h_gym_b', true)::uuid;
  monday_a date;
  monday_b date;
  added    int;
begin
  -- (4a) The fleet pass is not reachable from a staff JWT (EXECUTE revoked from authenticated).
  begin
    perform public.cron_materialize_horizon();
    raise exception 'AUTOROLL FAIL: authenticated executed cron_materialize_horizon()';
  exception when insufficient_privilege then null;   -- 42501, the expected denial
  end;

  -- (4b) The shared core IS granted to authenticated (ensure_week_materialized delegates to it under
  -- SECURITY INVOKER), so RLS — not EXECUTE — is what fences it. Week 6 is deliberately chosen: the
  -- cron covered weeks 0..5, so a leak here would actually write rows. Either outcome is a pass at
  -- this line (0 created, or an RLS refusal); the WRITTEN-ROW check after `reset role` is the real one.
  monday_b := (now() at time zone 'America/Cancun')::date;
  monday_b := monday_b - ((extract(isodow from monday_b)::int - 1));
  begin
    added := public.materialize_week_for_gym(gym_b, monday_b + 42);
    if added <> 0 then
      raise exception 'AUTOROLL FAIL: gym-A staff materialized % gym-B session(s)', added;
    end if;
  exception when insufficient_privilege then null;   -- an RLS refusal denies just as well
  end;

  -- (4c) The staff seam is unchanged: 0 for a week the cron already materialized, 1 for a fresh one.
  monday_a := (now() at time zone 'America/Mexico_City')::date;
  monday_a := monday_a - ((extract(isodow from monday_a)::int - 1));
  added := public.ensure_week_materialized(monday_a);
  if added <> 0 then raise exception 'AUTOROLL FAIL: staff re-materialized the current week (% new)', added; end if;
  added := public.ensure_week_materialized(monday_a + 42);
  if added <> 1 then raise exception 'AUTOROLL FAIL: staff ensure_week_materialized created % for a fresh week (expected 1)', added; end if;

  -- (4d) The two ops surfaces are cross-gym by construction and revoked from the client roles. The
  -- log is the sharper of the pair: its summaries carry other tenants' gym ids and their error text.
  begin
    perform 1 from public.gym_horizon_depth;
    raise exception 'AUTOROLL FAIL: authenticated read public.gym_horizon_depth';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.cron_run_log;
    raise exception 'AUTOROLL FAIL: authenticated read public.cron_run_log';
  exception when insufficient_privilege then null;   -- refused at the GRANT layer, before RLS
  end;
end $$;
reset role;

-- ── Written rows for (4), read back as ops: member RLS hid them inside the block above ──────────
do $$
declare
  gym_a  uuid := current_setting('t.h_gym_a', true)::uuid;
  gym_b  uuid := current_setting('t.h_gym_b', true)::uuid;
  gym_c  uuid := current_setting('t.h_gym_c', true)::uuid;
  tmpl_a uuid := current_setting('t.h_tmpl_a', true)::uuid;
  n int;
  fs_before int;
  fs_after  int;
  v_sess uuid;
  monday_a date;
begin
  -- (4b) gym B gained nothing from the cross-tenant attempt — neither a session nor a ledger claim.
  select count(*) into n from public.class_session where gym_id = gym_b;
  if n <> 6 then raise exception 'AUTOROLL FAIL: gym B has % sessions after the cross-tenant attempt (expected 6)', n; end if;
  select count(*) into n from public.schedule_template_week where gym_id = gym_b;
  if n <> 6 then raise exception 'AUTOROLL FAIL: gym B has % ledger claims after the cross-tenant attempt (expected 6)', n; end if;

  -- (4c) the staff-created week-6 session is a real row, in gym A, at 18:00 Monday local — the
  -- wrapper still writes through the same core with the same timezone rule.
  monday_a := (now() at time zone 'America/Mexico_City')::date;
  monday_a := monday_a - ((extract(isodow from monday_a)::int - 1));
  select count(*) into n from public.class_session
   where gym_id = gym_a and template_id = tmpl_a
     and (starts_at at time zone 'America/Mexico_City')::date = monday_a + 42
     and (starts_at at time zone 'America/Mexico_City')::time = '18:00'::time;
  if n <> 1 then raise exception 'AUTOROLL FAIL: staff week-6 session missing or misplaced (% rows)', n; end if;
  select count(*) into n from public.class_session where gym_id = gym_a;
  if n <> 7 then raise exception 'AUTOROLL FAIL: gym A has % sessions after the staff top-up (expected 7)', n; end if;

  -- (5) The health view: a gym with ZERO future sessions still has a row (that row is the alarm),
  -- and cancelling a future session drops the count by exactly one.
  select future_sessions into n from public.gym_horizon_depth where gym_id = gym_c;
  if n is distinct from 0 then raise exception 'AUTOROLL FAIL: the dead gym reads % in gym_horizon_depth (expected a 0 row)', n; end if;

  select future_sessions into fs_before from public.gym_horizon_depth where gym_id = gym_a;
  select id into v_sess from public.class_session
   where gym_id = gym_a and cancelled_at is null and starts_at > now() order by starts_at desc limit 1;
  update public.class_session set cancelled_at = now() where id = v_sess;
  select future_sessions into fs_after from public.gym_horizon_depth where gym_id = gym_a;
  if fs_after is distinct from fs_before - 1 then
    raise exception 'AUTOROLL FAIL: gym_horizon_depth counts cancelled sessions (% -> %)', fs_before, fs_after;
  end if;
end $$;

-- Snapshot the fleet's row counts before the two refusal vectors below, so "nothing was written" is
-- compared against what is actually there rather than against arithmetic re-derived in a comment.
do $$
declare
  gym_a uuid := current_setting('t.h_gym_a', true)::uuid;
  gym_b uuid := current_setting('t.h_gym_b', true)::uuid;
  n int;
begin
  select count(*) into n from public.class_session where gym_id in (gym_a, gym_b);
  perform set_config('t.h_sess_before', n::text, true);
  select count(*) into n from public.schedule_template_week where gym_id in (gym_a, gym_b);
  perform set_config('t.h_ledger_before', n::text, true);
end $$;

-- ── (4e) NON-STAFF authenticated: ensure_week_materialized's own 'No autorizado' ────────────────
-- The wrapper's ONE guard, and until now it had zero coverage: (4a)/(4b)/(4c) all run as gym-A STAFF,
-- for whom staff_gym() returns a gym and the raise is unreachable. The #136 refactor moved the
-- materialization body out into materialize_week_for_gym and left this raise as the wrapper's entire
-- remaining substance — so if it were dropped, every vector in this suite would still pass while a
-- logged-in user who is staff of nothing could materialize into… whatever staff_gym() returned, which
-- is exactly the NULL this refuses. Assert the sentence, not merely that something raised.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.h_outsider', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  monday_a date;
  raised boolean := false;
begin
  monday_a := (now() at time zone 'America/Mexico_City')::date;
  monday_a := monday_a - ((extract(isodow from monday_a)::int - 1));
  begin
    perform public.ensure_week_materialized(monday_a + 49);
  exception when others then
    raised := true;
    if sqlerrm not like 'No autorizado%' then
      raise exception 'AUTOROLL FAIL(4e): wrong raise for a non-staff caller: %', sqlerrm;
    end if;
  end;
  if not raised then raise exception 'AUTOROLL FAIL(4e): a user who is staff of NO gym called ensure_week_materialized'; end if;
end $$;
reset role;

-- ── (4f) ANON: neither the fleet pass, nor the health view, nor the run log is reachable ─────────
-- (4a)/(4d) probe `authenticated` only, which leaves the role that actually faces the internet
-- untested. All three objects are ops-only, so anon must be refused at the EXECUTE/GRANT layer —
-- before any body runs and before RLS is consulted. cron_materialize_horizon is the sharpest: it is
-- SECURITY DEFINER, so a stray grant would hand an unauthenticated caller a fleet-wide writer.
set local role anon;
do $$
begin
  begin
    perform public.cron_materialize_horizon();
    raise exception 'AUTOROLL FAIL(4f): ANON executed cron_materialize_horizon() — a SECURITY DEFINER fleet-wide writer';
  exception when insufficient_privilege then null;   -- 42501, the expected denial
  end;

  begin
    perform 1 from public.gym_horizon_depth;
    raise exception 'AUTOROLL FAIL(4f): ANON read public.gym_horizon_depth (cross-gym ops data)';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.cron_run_log;
    raise exception 'AUTOROLL FAIL(4f): ANON read public.cron_run_log (every tenant''s gym ids + error text)';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Nothing above wrote: the refused calls must leave the fleet's row counts on the snapshot. Read as
-- ops, because both refusing roles see far less than everything and a leak read from inside either
-- block could come back as a comfortable zero.
do $$
declare
  gym_a uuid := current_setting('t.h_gym_a', true)::uuid;
  gym_b uuid := current_setting('t.h_gym_b', true)::uuid;
  sess_before   int := current_setting('t.h_sess_before', true)::int;
  ledger_before int := current_setting('t.h_ledger_before', true)::int;
  n int;
begin
  select count(*) into n from public.class_session where gym_id in (gym_a, gym_b);
  if n is distinct from sess_before then raise exception 'AUTOROLL FAIL(4e/4f): session total moved % -> % across the refused calls', sess_before, n; end if;
  select count(*) into n from public.schedule_template_week where gym_id in (gym_a, gym_b);
  if n is distinct from ledger_before then raise exception 'AUTOROLL FAIL(4e/4f): ledger moved % -> % claims across the refused calls', ledger_before, n; end if;
end $$;

select 'class horizon autoroll: OK' as result;
rollback;
