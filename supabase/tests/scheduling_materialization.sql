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
--   5) A MOVED session LEAVES THE SERIES and is not resurrected: after edit_class_session changes a
--      materialized session's starts_at (the ADR-0010 holiday move) that session's template_id is
--      NULL (#243 slice 1 — a hand-placed class must stop belonging to the rule, or the new
--      "esta y las siguientes" verb would drag it back onto the grid it was deliberately taken off),
--      and re-running ensure_week_materialized for that week creates 0 new sessions — the
--      materialization guard is immutable (schedule_template_week), so vacating the old
--      (template_id, starts_at) instant must not regenerate the original slot. The two halves are
--      independent: the ledger claim is what holds non-resurrection, NOT template_id.
--   6) #244 guard 4 — duplicate-template guard: re-creating an ACTIVE (gym, class_type, weekday,
--      start_time) through create_recurring_schedule is refused (the FULL friendly message, naming
--      the weekday and time; zero new rows, atomically); a different start_time still succeeds; a
--      direct INSERT of the exact duplicate hits the unique index itself (unique_violation); an
--      INACTIVE duplicate of the same slot is allowed (the index is partial, active rows only); and a
--      call whose collision lands on a NON-FIRST weekday still names the colliding day and still
--      rolls back the weekday that had already inserted (the partial-write shape).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or the MCP execute_sql.

begin;

do $$
declare
  -- gym A is minted fresh since #86: the real-forge seed migration gives forge 21 active templates,
  -- so a suite reusing forge as gym A would materialize + count the seeded program, not its own 2
  -- fixture templates (the RPCs scope to staff_gym(), so a fresh gym isolates them completely).
  gym_a      uuid := gen_random_uuid();
  operator_a uuid := gen_random_uuid();
  ct_a       uuid;
  coach_a    uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_a, 'scheduling-mat-gym-a', 'Scheduling Mat Gym A', 'America/Chihuahua', 'forge');

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
  edited_dur int;
  edited_cap int;
  edited_tmpl uuid;            -- #243 slice 1: NULL after an edit
  tmpl uuid;
  raised boolean;              -- #244 guard 4
  msg text;
  tmpl_count_before int;
  session_count_before int;
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
  -- Distinct duration/capacity (60/30, not the created 45/24) so the edit's SET list is actually
  -- proven below — reusing 45/24 would let a dropped `duration_min =`/`capacity =` pass green (#80 AC6).
  perform public.edit_class_session(a_session, ct_a, starts_before + interval '1 day', 60, 30, array[coach_a]);
  -- edit_class_session's WRITTEN ROW, not just the materialization invariant: the count checks below are
  -- blind to the SET list, so assert the moved instant, the new duration/capacity, and the coach-join
  -- delete-then-reinsert. This is also the (5) vector's own premise — the slot must really be vacated.
  select starts_at, duration_min, capacity, template_id into starts_after, edited_dur, edited_cap, edited_tmpl
    from public.class_session where id = a_session;
  if starts_after is distinct from starts_before + interval '1 day' then raise exception 'MAT FAIL: edit_class_session did not move starts_at (% -> %)', starts_before, starts_after; end if;
  if edited_dur is distinct from 60 then raise exception 'MAT FAIL: edit_class_session did not write duration_min (got %)', edited_dur; end if;
  if edited_cap is distinct from 30 then raise exception 'MAT FAIL: edit_class_session did not write capacity (got %)', edited_cap; end if;
  -- #243 slice 1: THE HAND-MOVED SESSION LEAVES THE RULE. Until the series-edit verbs existed this
  -- was a dangling provenance pointer nothing dereferenced; the moment `update_recurring_schedule`
  -- can fan out over template_id, keeping it means a later series edit silently recomputes this
  -- class's instant and undoes the operator's holiday move.
  if edited_tmpl is not null then
    raise exception 'MAT FAIL: edit_class_session left template_id = % — a hand-moved session still belongs to the series and would be moved again by it', edited_tmpl;
  end if;
  select count(*) into n from public.class_session_coach where session_id = a_session;
  if n <> 1 then raise exception 'MAT FAIL: edit_class_session coach-join replace left % rows (expected 1)', n; end if;

  added := public.ensure_week_materialized(today);
  if added <> 0 then raise exception 'MAT FAIL: re-materializing after a session move resurrected % session(s) at the vacated slot', added; end if;
  -- Counted over the GYM, not over `template_id is not null`: since #243 slice 1 the moved session is
  -- a one-off, so a provenance filter here would report as drift the very thing the slice ships.
  -- Nothing but create_recurring_schedule has inserted into this gym, so 4 is still the whole population.
  select count(*) into n from public.class_session where gym_id = gym_a;
  if n <> 4 then raise exception 'MAT FAIL: total sessions drifted to % after the move + re-materialize (expected 4)', n; end if;

  -- (6) #244 guard 4 — duplicate-template guard. After (4)/(5) above, gym_a's earliest template
  -- (weekday 0, from the original array[0, 2]) is ACTIVE at (ct_a, Lunes, 20:00) — re-creating that
  -- EXACT slot through create_recurring_schedule must be refused, atomically, with zero new rows.
  select count(*) into tmpl_count_before from public.schedule_template where gym_id = gym_a;
  select count(*) into session_count_before from public.class_session where gym_id = gym_a;

  raised := false;
  begin
    perform public.create_recurring_schedule(ct_a, array[0], '20:00'::time, 45, 24, array[coach_a]);
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;
  if not raised then raise exception 'MAT FAIL(dup guard): re-creating the active (ct_a, Lunes, 20:00) schedule did not raise'; end if;
  -- The FULL sentence, not a prefix. The refusal's whole job is telling the operator WHICH schedule
  -- already exists, and `like 'Ya existe un horario activo%'` passes just as happily on a message whose
  -- weekday and time interpolations are empty, swapped, or off by one — the exact half that is
  -- computed (`weekday + 1` into a Spanish array, `to_char(start_time,'HH24:MI')`) rather than typed.
  -- This fixture is known exactly: weekday 0 at 20:00, which is Lunes.
  if msg is distinct from 'Ya existe un horario activo para esta clase el Lunes a las 20:00' then
    raise exception 'MAT FAIL(dup guard): wrong message for a duplicate schedule: %', msg;
  end if;
  -- Zero new rows: an uncaught exception aborts the WHOLE RPC call (one transaction), not just the
  -- colliding weekday — so a single-weekday collision here still leaves the template/session counts
  -- exactly where they were.
  select count(*) into n from public.schedule_template where gym_id = gym_a;
  if n <> tmpl_count_before then raise exception 'MAT FAIL(dup guard): template count drifted to % (expected % unchanged)', n, tmpl_count_before; end if;
  select count(*) into n from public.class_session where gym_id = gym_a;
  if n <> session_count_before then raise exception 'MAT FAIL(dup guard): session count drifted to % (expected % unchanged)', n, session_count_before; end if;

  -- A DIFFERENT time is not a duplicate (the dedup key includes start_time) — succeeds normally.
  perform public.create_recurring_schedule(ct_a, array[0], '06:00'::time, 45, 24, array[coach_a], 1);
  select count(*) into n from public.schedule_template where gym_id = gym_a;
  if n <> tmpl_count_before + 1 then raise exception 'MAT FAIL(dup guard): a different-time schedule did not create a new template (count %, expected %)', n, tmpl_count_before + 1; end if;

  -- Direct INSERT of the exact same duplicate slot hits the unique index itself (not the RPC's catch).
  raised := false;
  begin
    insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
      values (gym_a, ct_a, 0, '20:00', 45, 24);
  exception when unique_violation then raised := true;
  end;
  if not raised then raise exception 'MAT FAIL(dup guard): a direct duplicate INSERT did not raise unique_violation'; end if;

  -- An INACTIVE duplicate of the exact same slot is allowed — the partial index only covers is_active
  -- rows, so a retired schedule never blocks its own replacement.
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, is_active)
    values (gym_a, ct_a, 0, '20:00', 45, 24, false);
  select count(*) into n from public.schedule_template
    where gym_id = gym_a and class_type_id = ct_a and weekday = 0 and start_time = '20:00' and is_active = false;
  if n <> 1 then raise exception 'MAT FAIL(dup guard): the inactive duplicate template was not inserted'; end if;

  -- ── The collision on a NON-FIRST weekday: the partial-write shape ──────────────────────────────
  -- Every vector above collides on array[0] — the first element — so the loop raises before it has
  -- inserted anything, and "zero new rows" is true for free. The interesting case is a multi-weekday
  -- call whose collision comes SECOND: Jueves (weekday 3, 20:00) is free and inserts, then Lunes
  -- collides. Two claims are under test at once and neither is provable from the first-element case:
  --   * the message names the ACTUALLY colliding weekday (Lunes), not the first one it tried (Jueves)
  --     — the raise interpolates the loop variable, which a refactor to the array's head would break;
  --   * the Jueves template that DID insert is rolled back with the raise. `create_recurring_schedule`
  --     is one transaction, and a half-created recurring schedule is the worst outcome available:
  --     future weeks would materialize a weekday the operator was told had failed.
  select count(*) into tmpl_count_before from public.schedule_template where gym_id = gym_a;
  raised := false;
  begin
    perform public.create_recurring_schedule(ct_a, array[3, 0], '20:00'::time, 45, 24, array[coach_a], 1);
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;
  if not raised then raise exception 'MAT FAIL(dup guard, partial): a call colliding on its SECOND weekday did not raise'; end if;
  if msg is distinct from 'Ya existe un horario activo para esta clase el Lunes a las 20:00' then
    raise exception 'MAT FAIL(dup guard, partial): the message names the wrong weekday — expected the colliding Lunes, got: %', msg;
  end if;
  select count(*) into n from public.schedule_template where gym_id = gym_a;
  if n is distinct from tmpl_count_before then
    raise exception 'MAT FAIL(dup guard, partial): template count % (expected % unchanged) — the non-colliding weekday survived a refused call', n, tmpl_count_before;
  end if;
  select count(*) into n from public.schedule_template
    where gym_id = gym_a and class_type_id = ct_a and weekday = 3;
  if n is distinct from 0 then
    raise exception 'MAT FAIL(dup guard, partial): % Jueves template(s) survived (expected 0 — the whole call rolls back)', n;
  end if;
end $$;
reset role;

select 'scheduling materialization: OK' as result;
rollback;
