-- Agenda slot-exclusivity suite — the 2026-08-23 class-duplication incident
-- (docs/audits/2026-08-23-agenda-class-duplication-audit.md; migrations 20260823120000 + 20260823120100).
--
-- THE RULE UNDER TEST, once: ONE class per gym per instant, and ONE active schedule per gym per
-- weekday+start_time — whatever the class type. This REVERSES 20260805110000:263-265's multi-room
-- reasoning (owner ruling 2026-08-23): the product serves single-room class studios, and the room
-- dimension that sentence assumed was never built. Live proved the cost — gym `red` carried two active
-- templates at Mon 07:15 and two at Wed 07:15, each minting its own class_session every single week.
--
-- Runs as gym-G staff through the SECURITY INVOKER RPCs (so the happy paths are proven under RLS too),
-- with the last section as ops. Transaction-local (begin/rollback), zero hardcoded prod UUIDs,
-- self-asserting: every vector RAISEs on failure and a clean run returns one 'OK' row.
--
-- WRITTEN ROWS, not return values (#78/#80): every refusal below is followed by a count of the rows the
-- refused call would have written, and every acceptance by the row it did write.
--
-- Vectors:
--   (a) cross-type same-slot recurring create → refused, zero template AND zero session rows, whole
--       call rolled back — including the multi-weekday shape whose collision lands SECOND.
--   (b) the elapsed-instant skip: a current-week instant is never minted, but its ledger week IS
--       claimed, so the phantom is not re-minted on a later pass either (audit D11).
--   (c) one-off create onto an occupied uncancelled instant → refused, zero rows (audit D1).
--   (d) one-off create onto an instant held only by a CANCELLED session → ALLOWED.
--   (e) edit_class_session moving a session onto an occupied instant → refused; a move to a free
--       instant still works and still detaches.
--   (f) update_recurring_schedule moving onto a slot held by another active template of a DIFFERENT
--       class type → refused; a same-slot (non-moving) edit is NOT refused; a SAME-class collision
--       still raises the shipped sentence verbatim.
--  (f2) the same verb's DATED half: a move whose target SLOT is free but whose target INSTANT is held
--       by a detached one-off → refused WHOLE (never a per-week skip), zero rows changed on the rule,
--       its classes and the obstacle; and a clean move still moves every future class.
--   (g) the two unique indexes themselves, RLS-denial style: a direct INSERT of each violation raises
--       unique_violation, and each partial predicate's escape hatch (inactive template / cancelled
--       class) still lands.
--   (h) the incumbent rule: with two active templates pre-seeded at one slot (the LIVE state, which
--       predates the guards), the materializer writes exactly ONE session and the OLDEST template wins.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or the MCP
-- execute_sql, or `docker cp` + `psql -f` against a local stack.

begin;

do $$
declare
  gym_g   uuid := gen_random_uuid();
  op_g    uuid := gen_random_uuid();
  ct_uno  uuid;
  ct_dos  uuid;
  coach_g uuid;
begin
  -- A fresh gym, minted here: the forge seed gives its gym 21 active templates, so reusing it would
  -- put this suite's slot arithmetic in competition with a seeded program.
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_g, 'agenda-slot-guards-gym', 'Agenda Slot Guards', 'America/Chihuahua', 'forge');

  insert into auth.users (instance_id, id, aud, role, email)
    values ('00000000-0000-0000-0000-000000000000', op_g, 'authenticated', 'authenticated', 'slot-guards-op@test.local');
  insert into public.gym_membership (user_id, gym_id, role) values (op_g, gym_g, 'operator');

  insert into public.coach (gym_id, name, initials, role) values (gym_g, 'Coach Slot', 'CS', 'coach') returning id into coach_g;
  -- TWO class types, because the whole ruling is about the CROSS-type case: under the old key
  -- (gym, class_type, weekday, start_time) these two were free to share every slot in the week.
  insert into public.class_type (gym_id, name) values (gym_g, 'Slot Uno') returning id into ct_uno;
  insert into public.class_type (gym_id, name) values (gym_g, 'Slot Dos') returning id into ct_dos;

  perform set_config('t.sg_gym',   gym_g::text,   true);
  perform set_config('t.sg_op',    op_g::text,    true);
  perform set_config('t.sg_uno',   ct_uno::text,  true);
  perform set_config('t.sg_dos',   ct_dos::text,  true);
  perform set_config('t.sg_coach', coach_g::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.sg_op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (a) CROSS-TYPE SAME-SLOT RECURRING CREATE — the door the live incident walked through.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  gym_g   uuid := current_setting('t.sg_gym', true)::uuid;
  ct_uno  uuid := current_setting('t.sg_uno', true)::uuid;
  ct_dos  uuid := current_setting('t.sg_dos', true)::uuid;
  coach_g uuid := current_setting('t.sg_coach', true)::uuid;
  tz      text;
  hoy     date;
  monday  date;
  t_uno   uuid;
  tmpl_before int; sess_before int;
  n int;
  raised boolean;
  msg text;
begin
  select timezone into tz from public.gym where id = gym_g;
  hoy := (now() at time zone tz)::date;
  monday := hoy - ((extract(isodow from hoy)::int - 1));
  perform set_config('t.sg_tz', tz, true);
  perform set_config('t.sg_monday', monday::text, true);

  -- The incumbent: Slot Uno every Martes at 10:00, two weeks of horizon.
  perform public.create_recurring_schedule(ct_uno, array[1], '10:00'::time, 45, 24, array[coach_g], 2);
  select id into t_uno from public.schedule_template
   where gym_id = gym_g and class_type_id = ct_uno and weekday = 1 and start_time = '10:00' and is_active;
  if t_uno is null then raise exception 'SLOT FAIL(a): the incumbent schedule was not created'; end if;

  select count(*) into tmpl_before from public.schedule_template where gym_id = gym_g;
  select count(*) into sess_before from public.class_session where gym_id = gym_g;

  -- A DIFFERENT class at the SAME slot. Legal before the ruling (class_type_id was inside the dedup
  -- key), refused now — and the sentence must NAME the class already there, because an operator who
  -- cannot see what is in the way cannot act on the refusal.
  raised := false;
  begin
    perform public.create_recurring_schedule(ct_dos, array[1], '10:00'::time, 60, 20, array[coach_g], 2);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SLOT FAIL(a): a DIFFERENT class at an occupied (Martes, 10:00) was created'; end if;
  -- The FULL sentence, not a prefix: `like 'Ya existe%'` passes just as happily on a message whose
  -- class name, weekday or time interpolations are empty, swapped, or off by one — and all three are
  -- computed rather than typed.
  if msg is distinct from 'Ya existe un horario activo de Slot Uno el Martes a las 10:00' then
    raise exception 'SLOT FAIL(a): wrong refusal sentence: %', msg;
  end if;

  -- ZERO ROWS, atomically: an uncaught exception aborts the whole RPC call, so neither the template
  -- nor its would-be materialized weeks survive.
  select count(*) into n from public.schedule_template where gym_id = gym_g;
  if n <> tmpl_before then raise exception 'SLOT FAIL(a): template count drifted to % (expected % unchanged)', n, tmpl_before; end if;
  select count(*) into n from public.class_session where gym_id = gym_g;
  if n <> sess_before then raise exception 'SLOT FAIL(a): session count drifted to % (expected % unchanged)', n, sess_before; end if;
  select count(*) into n from public.schedule_template where gym_id = gym_g and class_type_id = ct_dos;
  if n <> 0 then raise exception 'SLOT FAIL(a): % Slot Dos template(s) survived a refused call', n; end if;

  -- THE COLLISION ON A NON-FIRST WEEKDAY. Viernes 10:00 is free and inserts; Martes then collides.
  -- Two claims at once, neither provable from the single-weekday case: the sentence names the weekday
  -- that ACTUALLY collided (not the first one tried), and the Viernes template that DID insert is
  -- rolled back with the raise — a half-created recurring schedule is the worst outcome available.
  raised := false;
  begin
    perform public.create_recurring_schedule(ct_dos, array[4, 1], '10:00'::time, 60, 20, array[coach_g], 1);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SLOT FAIL(a, parcial): a call colliding on its SECOND weekday did not raise'; end if;
  if msg is distinct from 'Ya existe un horario activo de Slot Uno el Martes a las 10:00' then
    raise exception 'SLOT FAIL(a, parcial): the sentence names the wrong day — expected the colliding Martes, got: %', msg;
  end if;
  select count(*) into n from public.schedule_template where gym_id = gym_g and weekday = 4;
  if n <> 0 then raise exception 'SLOT FAIL(a, parcial): % Viernes template(s) survived (expected 0 — the whole call rolls back)', n; end if;
  select count(*) into n from public.schedule_template where gym_id = gym_g;
  if n <> tmpl_before then raise exception 'SLOT FAIL(a, parcial): template count drifted to % (expected % unchanged)', n, tmpl_before; end if;

  -- A FREE slot for the same class still works — the guard refuses collisions, not class types.
  perform public.create_recurring_schedule(ct_dos, array[3], '11:00'::time, 60, 20, array[coach_g], 2);
  select count(*) into n from public.schedule_template where gym_id = gym_g and class_type_id = ct_dos and is_active;
  if n <> 1 then raise exception 'SLOT FAIL(a): the free-slot Jueves 11:00 schedule was not created (% rows)', n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (b) THE ELAPSED-INSTANT SKIP (audit D11) — a mid-week create stops minting phantom past classes.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- weekday 0 at 00:00 is the ONE fixture that is deterministic on every day of the week: the current
-- week's instant is that week's Monday 00:00 gym-local, and `monday` is derived FROM now(), so
-- now() >= that instant always — the guard (`v_starts > now()`) therefore always skips it, whether the
-- suite runs on Monday at 00:00:00 or on Sunday night. Next week's Monday 00:00 is always future.
do $$
declare
  gym_g   uuid := current_setting('t.sg_gym', true)::uuid;
  ct_uno  uuid := current_setting('t.sg_uno', true)::uuid;
  coach_g uuid := current_setting('t.sg_coach', true)::uuid;
  tz      text := current_setting('t.sg_tz', true);
  monday  date := current_setting('t.sg_monday', true)::date;
  t_med   uuid;
  n int;
begin
  perform public.create_recurring_schedule(ct_uno, array[0], '00:00'::time, 45, 24, array[coach_g], 2);
  select id into t_med from public.schedule_template
   where gym_id = gym_g and class_type_id = ct_uno and weekday = 0 and start_time = '00:00' and is_active;
  if t_med is null then raise exception 'SLOT FAIL(b): the Lunes 00:00 schedule was not created'; end if;

  -- Exactly one session, and it is NEXT week's — the current week's already-elapsed Monday 00:00 was
  -- skipped instead of minted as a class the desk can neither cancel ('La clase ya pasó') nor retire
  -- (`starts_at > now()`), and which every summary would have counted forever.
  select count(*) into n from public.class_session where template_id = t_med;
  if n <> 1 then raise exception 'SLOT FAIL(b): the Lunes 00:00 schedule materialized % session(s) (expected 1 — next week only)', n; end if;
  select count(*) into n from public.class_session where template_id = t_med and starts_at <= now();
  if n <> 0 then raise exception 'SLOT FAIL(b): % already-elapsed phantom session(s) were minted', n; end if;
  select count(*) into n from public.class_session
   where template_id = t_med and starts_at = (((monday + 7) + time '00:00') at time zone tz);
  if n <> 1 then raise exception 'SLOT FAIL(b): next week''s Lunes 00:00 instant is missing'; end if;

  -- …and the LEDGER claimed the skipped week anyway. That is what makes the skip permanent instead of
  -- a phantom that the next materialization pass mints after all.
  select count(*) into n from public.schedule_template_week where template_id = t_med and week_start = monday;
  if n <> 1 then raise exception 'SLOT FAIL(b): the skipped current week was not claimed in the ledger (% rows)', n; end if;
  select count(*) into n from public.schedule_template_week where template_id = t_med;
  if n <> 2 then raise exception 'SLOT FAIL(b): the ledger holds % week claim(s) (expected 2)', n; end if;

  -- Re-running the current week is still a no-op, and still writes nothing.
  n := public.ensure_week_materialized(monday);
  if n <> 0 then raise exception 'SLOT FAIL(b): re-materializing the current week created % session(s)', n; end if;
  select count(*) into n from public.class_session where template_id = t_med;
  if n <> 1 then raise exception 'SLOT FAIL(b): the skipped instant came back on a second pass (% rows)', n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (c)(d) ONE-OFF CREATE — the blind INSERT the ticket actually came through (audit D1/D2/D3).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  gym_g   uuid := current_setting('t.sg_gym', true)::uuid;
  ct_uno  uuid := current_setting('t.sg_uno', true)::uuid;
  ct_dos  uuid := current_setting('t.sg_dos', true)::uuid;
  coach_g uuid := current_setting('t.sg_coach', true)::uuid;
  tz      text := current_setting('t.sg_tz', true);
  monday  date := current_setting('t.sg_monday', true)::date;
  i_base  timestamptz;
  i_canc  timestamptz;
  s_uno   uuid;
  s_dead  uuid;
  s_live  uuid;
  sess_before int;
  n int;
  raised boolean;
  msg text;
begin
  i_base := ((monday + 7) + time '16:00') at time zone tz;   -- next Monday 16:00 local, free
  i_canc := ((monday + 7) + time '17:00') at time zone tz;   -- next Monday 17:00 local, free
  perform set_config('t.sg_i_base', i_base::text, true);
  perform set_config('t.sg_i_canc', i_canc::text, true);

  s_uno := public.create_class_session(ct_uno, i_base, 60, 20, array[coach_g]);
  perform set_config('t.sg_s_uno', s_uno::text, true);
  select count(*) into sess_before from public.class_session where gym_id = gym_g;

  -- (c) THE SECOND TAP. A one-off carries template_id NULL, and Postgres treats NULLs as DISTINCT, so
  -- class_session_template_starts_uq never saw these rows at all — which is precisely why the agenda
  -- could show two cards at one instant. The refusal names the class already there.
  raised := false;
  begin
    perform public.create_class_session(ct_dos, i_base, 45, 24, array[coach_g]);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SLOT FAIL(c): a second one-off landed on an occupied instant'; end if;
  if msg is distinct from 'Ya existe una clase a esa hora: Slot Uno' then
    raise exception 'SLOT FAIL(c): wrong refusal sentence: %', msg;
  end if;
  select count(*) into n from public.class_session where gym_id = gym_g;
  if n <> sess_before then raise exception 'SLOT FAIL(c): session count drifted to % (expected % unchanged)', n, sess_before; end if;
  select count(*) into n from public.class_session where gym_id = gym_g and starts_at = i_base and cancelled_at is null;
  if n <> 1 then raise exception 'SLOT FAIL(c): % live class(es) at the contested instant (expected 1)', n; end if;
  -- Nothing half-written: the coach join is the RPC's second statement, so a refusal that raised
  -- between them would leave an orphan here.
  select count(*) into n from public.class_session_coach csc
    join public.class_session cs on cs.id = csc.session_id
   where cs.gym_id = gym_g and cs.starts_at = i_base;
  if n <> 1 then raise exception 'SLOT FAIL(c): % coach join(s) at the contested instant (expected 1)', n; end if;

  -- (d) A CANCELLED CLASS IS NOT AN OCCUPANT. Re-creating over a class the gym cancelled is a supported
  -- desk correction, and the partial predicate (`cancelled_at is null`) is what keeps it supported.
  s_dead := public.create_class_session(ct_uno, i_canc, 60, 20, array[coach_g]);
  perform public.cancel_class_session(s_dead);
  s_live := public.create_class_session(ct_dos, i_canc, 45, 24, array[coach_g]);
  perform set_config('t.sg_s_live', s_live::text, true);

  select count(*) into n from public.class_session where gym_id = gym_g and starts_at = i_canc;
  if n <> 2 then raise exception 'SLOT FAIL(d): expected the tombstone + the replacement at that instant, found %', n; end if;
  select count(*) into n from public.class_session
   where id = s_dead and cancelled_at is not null and class_type_id = ct_uno;
  if n <> 1 then raise exception 'SLOT FAIL(d): the cancelled predecessor was not left tombstoned'; end if;
  select count(*) into n from public.class_session
   where id = s_live and cancelled_at is null and class_type_id = ct_dos and duration_min = 45 and capacity = 24;
  if n <> 1 then raise exception 'SLOT FAIL(d): the replacement class was not written as asked'; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (e) edit_class_session — a hand MOVE may not land on an occupied instant.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  gym_g   uuid := current_setting('t.sg_gym', true)::uuid;
  ct_dos  uuid := current_setting('t.sg_dos', true)::uuid;
  coach_g uuid := current_setting('t.sg_coach', true)::uuid;
  tz      text := current_setting('t.sg_tz', true);
  monday  date := current_setting('t.sg_monday', true)::date;
  i_base  timestamptz := current_setting('t.sg_i_base', true)::timestamptz;
  i_canc  timestamptz := current_setting('t.sg_i_canc', true)::timestamptz;
  i_free  timestamptz;
  s_live  uuid := current_setting('t.sg_s_live', true)::uuid;
  s_tmpl  uuid;
  v_starts timestamptz; v_dur int; v_tmpl uuid;
  n int;
  raised boolean;
  msg text;
begin
  i_free := ((monday + 7) + time '19:00') at time zone tz;

  -- MOVE ONTO AN OCCUPIED INSTANT → refused, and the row does not move.
  raised := false;
  begin
    perform public.edit_class_session(s_live, ct_dos, i_base, 45, 24, array[coach_g]);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SLOT FAIL(e): a class was moved onto an occupied instant'; end if;
  if msg is distinct from 'Ya existe una clase a esa hora: Slot Uno' then
    raise exception 'SLOT FAIL(e): wrong refusal sentence: %', msg;
  end if;
  select starts_at into v_starts from public.class_session where id = s_live;
  if v_starts is distinct from i_canc then raise exception 'SLOT FAIL(e): the refused move still changed starts_at (%)', v_starts; end if;
  select count(*) into n from public.class_session where gym_id = gym_g and starts_at = i_base and cancelled_at is null;
  if n <> 1 then raise exception 'SLOT FAIL(e): % live class(es) at the target instant (expected the incumbent alone)', n; end if;

  -- A SAME-INSTANT edit (duration only) is NOT refused: the guard fires on a MOVE, so an operator
  -- fixing a field on a class that is already sitting in a contested slot — the live state, before the
  -- pairs are cleaned — is never locked out of their own calendar.
  perform public.edit_class_session(s_live, ct_dos, i_canc, 60, 24, array[coach_g]);
  select starts_at, duration_min into v_starts, v_dur from public.class_session where id = s_live;
  if v_starts is distinct from i_canc or v_dur is distinct from 60 then
    raise exception 'SLOT FAIL(e): the same-instant edit did not write (starts=%, dur=%)', v_starts, v_dur;
  end if;

  -- A move to a FREE instant still works, and still DETACHES (#243 slice 1) — the guard did not break
  -- the flow it guards. Proven on a MATERIALIZED session so the detach is a real state change.
  select cs.id into s_tmpl from public.class_session cs
    join public.schedule_template st on st.id = cs.template_id
   where cs.gym_id = gym_g and st.weekday = 1
   order by cs.starts_at limit 1;
  if s_tmpl is null then raise exception 'SLOT FAIL(e): no materialized Martes session to move'; end if;
  perform public.edit_class_session(s_tmpl, ct_dos, i_free, 45, 24, array[coach_g]);
  select starts_at, template_id into v_starts, v_tmpl from public.class_session where id = s_tmpl;
  if v_starts is distinct from i_free then raise exception 'SLOT FAIL(e): the free-instant move did not write starts_at (%)', v_starts; end if;
  if v_tmpl is not null then raise exception 'SLOT FAIL(e): the hand-moved class kept template_id % — it must leave the series', v_tmpl; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (f) update_recurring_schedule — a MOVE may not land on a slot another schedule already holds.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  gym_g   uuid := current_setting('t.sg_gym', true)::uuid;
  ct_uno  uuid := current_setting('t.sg_uno', true)::uuid;
  ct_dos  uuid := current_setting('t.sg_dos', true)::uuid;
  coach_g uuid := current_setting('t.sg_coach', true)::uuid;
  t_jue   uuid;
  t_sab   uuid;
  v_wd int; v_st time; v_cap int;
  n int;
  raised boolean;
  msg text;
begin
  select id into t_jue from public.schedule_template
   where gym_id = gym_g and class_type_id = ct_dos and weekday = 3 and start_time = '11:00' and is_active;
  if t_jue is null then raise exception 'SLOT FAIL(f): the Jueves 11:00 fixture template is missing'; end if;

  -- MOVE ONTO A SLOT HELD BY A DIFFERENT CLASS → refused, naming that class.
  raised := false;
  begin
    perform public.update_recurring_schedule(t_jue, ct_dos, '10:00'::time, 60, 20, 1);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SLOT FAIL(f): a schedule was moved onto a slot another class holds'; end if;
  if msg is distinct from 'Ya existe un horario activo de Slot Uno el Martes a las 10:00' then
    raise exception 'SLOT FAIL(f): wrong refusal sentence: %', msg;
  end if;
  select weekday, start_time into v_wd, v_st from public.schedule_template where id = t_jue;
  if v_wd is distinct from 3 or v_st is distinct from '11:00'::time then
    raise exception 'SLOT FAIL(f): the refused move still rewrote the rule (weekday=%, start=%)', v_wd, v_st;
  end if;

  -- A NON-MOVING EDIT (capacity only, same weekday + same hora) is NOT refused — the guard fires on a
  -- move. This is the property that keeps a template already sitting in a contested slot editable on
  -- live before the duplicate pairs are cleaned.
  perform public.update_recurring_schedule(t_jue, ct_dos, '11:00'::time, 60, 28);
  select capacity into v_cap from public.schedule_template where id = t_jue;
  if v_cap is distinct from 28 then raise exception 'SLOT FAIL(f): the non-moving edit did not write capacity (got %)', v_cap; end if;

  -- SAME-CLASS COLLISION: the shipped sentence, byte-identical. It still comes from the
  -- unique_violation handler over the shipped index, which is why widening the rule did not disturb it.
  perform public.create_recurring_schedule(ct_dos, array[5], '12:00'::time, 60, 20, array[coach_g], 1);
  select id into t_sab from public.schedule_template
   where gym_id = gym_g and class_type_id = ct_dos and weekday = 5 and start_time = '12:00' and is_active;
  raised := false;
  begin
    perform public.update_recurring_schedule(t_sab, ct_dos, '11:00'::time, 60, 20, 3);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SLOT FAIL(f): a same-class move onto an occupied slot was allowed'; end if;
  if msg is distinct from 'Ya existe un horario activo para esta clase el Jueves a las 11:00' then
    raise exception 'SLOT FAIL(f): the SHIPPED same-class sentence changed: %', msg;
  end if;
  select count(*) into n from public.schedule_template
   where gym_id = gym_g and weekday = 5 and start_time = '12:00' and is_active;
  if n <> 1 then raise exception 'SLOT FAIL(f): the refused same-class move moved the rule anyway'; end if;

  -- RETIRE-THEN-RECREATE at the same slot is still the un-retire path: both partial indexes cover only
  -- live rows, so a retired schedule never blocks its own replacement.
  perform public.retire_recurring_schedule(t_sab);
  perform public.create_recurring_schedule(ct_uno, array[5], '12:00'::time, 45, 24, array[coach_g], 1);
  select count(*) into n from public.schedule_template
   where gym_id = gym_g and weekday = 5 and start_time = '12:00' and is_active;
  if n <> 1 then raise exception 'SLOT FAIL(f): re-creating a retired slot left % active rule(s) (expected 1)', n; end if;
  select count(*) into n from public.schedule_template
   where gym_id = gym_g and weekday = 5 and start_time = '12:00' and not is_active;
  if n <> 1 then raise exception 'SLOT FAIL(f): the retired predecessor vanished instead of staying retired'; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (f2) update_recurring_schedule — the DATED half: a move whose CLASSES land on an occupied instant.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- The sharp case, and the one a template-keyed check cannot see: the target SLOT is free (no active
-- rule holds Miércoles 15:00) but one of the target INSTANTS is taken — by a hand-placed one-off that
-- belongs to no rule at all. Before the guard that either double-booked the week or, once
-- 20260823120100 lands, failed the call on a raw constraint-name 23505. It is REFUSED WHOLE (owner
-- ruling 2026-08-23): never a silent per-week skip, which would split the series across two horas and
-- still hand back a success receipt.
do $$
declare
  gym_g   uuid := current_setting('t.sg_gym', true)::uuid;
  ct_uno  uuid := current_setting('t.sg_uno', true)::uuid;
  coach_g uuid := current_setting('t.sg_coach', true)::uuid;
  tz      text := current_setting('t.sg_tz', true);
  monday  date := current_setting('t.sg_monday', true)::date;
  t_mie   uuid;
  i_choque timestamptz;
  s_libre  uuid;
  v_wd int; v_st time;
  n_fut int; v_moved int; v_kept int;
  n int;
  raised boolean;
  msg text;
begin
  -- A three-week series at Miércoles 14:00. Weeks +1 and +2 are always future whatever day this runs.
  perform public.create_recurring_schedule(ct_uno, array[2], '14:00'::time, 45, 24, array[coach_g], 3);
  select id into t_mie from public.schedule_template
   where gym_id = gym_g and class_type_id = ct_uno and weekday = 2 and start_time = '14:00' and is_active;
  if t_mie is null then raise exception 'SLOT FAIL(f2): the Miércoles 14:00 series was not created'; end if;

  -- The obstacle: a ÚNICA class, one hour later, in week +1 only. It belongs to NO rule, which is
  -- exactly why guard 4 cannot see it.
  i_choque := ((monday + 7 + 2) + time '15:00') at time zone tz;
  s_libre := public.create_class_session(ct_uno, i_choque, 60, 20, array[coach_g]);

  select count(*)::int into n_fut from public.class_session
   where template_id = t_mie and starts_at > now() and cancelled_at is null;
  if n_fut < 2 then raise exception 'SLOT FAIL(f2): the series has % future class(es) (expected at least 2)', n_fut; end if;

  -- MOVE THE SERIES ONTO 15:00 → week +1's class would land on the one-off. The SLOT is free, so this
  -- can only be refused by the dated check.
  raised := false;
  begin
    perform public.update_recurring_schedule(t_mie, ct_uno, '15:00'::time, 45, 24);
  exception when others then raised := true; msg := sqlerrm;
  end;
  if not raised then raise exception 'SLOT FAIL(f2): a series move landed a class on an occupied instant'; end if;
  -- The FULL sentence: it names the blocking instant in the gym's own clock, which is the only thing
  -- that tells the operator which week to go clear.
  if msg is distinct from ('No se puede mover el horario: ya hay una clase el '
        || to_char(i_choque at time zone tz, 'DD/MM/YYYY') || ' a las '
        || to_char(i_choque at time zone tz, 'HH24:MI')) then
    raise exception 'SLOT FAIL(f2): wrong refusal sentence: %', msg;
  end if;

  -- ZERO ROWS CHANGED, all-or-nothing — the RULE first…
  select weekday, start_time into v_wd, v_st from public.schedule_template where id = t_mie;
  if v_wd is distinct from 2 or v_st is distinct from '14:00'::time then
    raise exception 'SLOT FAIL(f2): the refused move still rewrote the rule (weekday=%, start=%)', v_wd, v_st;
  end if;
  -- …then its CLASSES: every future one is still at 14:00, none was left behind at 15:00. The refusal
  -- fires on ONE week; a per-week skip (or a fan-out that had already written the other weeks before
  -- raising) would show up right here.
  select count(*) into n from public.class_session
   where template_id = t_mie and starts_at > now() and cancelled_at is null
     and (starts_at at time zone tz)::time = '14:00'::time;
  if n <> n_fut then raise exception 'SLOT FAIL(f2): % of % future classes are still at 14:00', n, n_fut; end if;
  select count(*) into n from public.class_session
   where template_id = t_mie and (starts_at at time zone tz)::time = '15:00'::time;
  if n <> 0 then raise exception 'SLOT FAIL(f2): % series class(es) were moved anyway', n; end if;
  -- …and the obstacle is untouched: still there, still a one-off, still at its own instant.
  select count(*) into n from public.class_session
   where id = s_libre and starts_at = i_choque and template_id is null and cancelled_at is null;
  if n <> 1 then raise exception 'SLOT FAIL(f2): the blocking one-off was disturbed by the refused move'; end if;

  -- REGRESSION: a CLEAN move still works. 16:00 is free in every week of the series, so the whole
  -- fan-out lands — the guard refuses collisions, not moves.
  select moved, kept into v_moved, v_kept
    from public.update_recurring_schedule(t_mie, ct_uno, '16:00'::time, 45, 24);
  if v_moved is distinct from n_fut then
    raise exception 'SLOT FAIL(f2): the clean move reported moved=% (expected % — every future class)', v_moved, n_fut;
  end if;
  select weekday, start_time into v_wd, v_st from public.schedule_template where id = t_mie;
  if v_wd is distinct from 2 or v_st is distinct from '16:00'::time then
    raise exception 'SLOT FAIL(f2): the clean move did not write the rule (weekday=%, start=%)', v_wd, v_st;
  end if;
  select count(*) into n from public.class_session
   where template_id = t_mie and starts_at > now() and cancelled_at is null
     and (starts_at at time zone tz)::time = '16:00'::time;
  if n <> n_fut then raise exception 'SLOT FAIL(f2): the clean move wrote % of % class instants', n, n_fut; end if;
  select count(*) into n from public.class_session
   where template_id = t_mie and starts_at > now() and cancelled_at is null
     and (starts_at at time zone tz)::time <> '16:00'::time;
  if n <> 0 then raise exception 'SLOT FAIL(f2): % future class(es) were left behind by the clean move', n; end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (g) THE INDEXES THEMSELVES — RLS-denial style, direct writes, no RPC in the way.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- The RPC guards are check-then-write, so two concurrent calls can both read a free slot. Only a unique
-- index is atomic, and it is also the backstop for every writer that is not an RPC (seeds, fixtures,
-- future migrations) — which is how the live pairs got there in the first place.
do $$
declare
  gym_g   uuid := current_setting('t.sg_gym', true)::uuid;
  ct_dos  uuid := current_setting('t.sg_dos', true)::uuid;
  i_base  timestamptz := current_setting('t.sg_i_base', true)::timestamptz;
  n int;
  raised boolean;
begin
  -- schedule_template_slot_uq: a second ACTIVE rule at (gym, Martes, 10:00), different class.
  raised := false;
  begin
    insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
      values (gym_g, ct_dos, 1, '10:00', 60, 20, gen_random_uuid());
  exception when unique_violation then raised := true;
  end;
  if not raised then raise exception 'SLOT FAIL(g): a direct cross-class duplicate template INSERT did not raise unique_violation'; end if;

  -- …and its escape hatch: an INACTIVE rule at that same slot IS allowed (the index is partial).
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, is_active, group_id)
    values (gym_g, ct_dos, 1, '10:00', 60, 20, false, gen_random_uuid());
  select count(*) into n from public.schedule_template
   where gym_id = gym_g and weekday = 1 and start_time = '10:00' and not is_active;
  if n <> 1 then raise exception 'SLOT FAIL(g): the inactive same-slot template was not inserted'; end if;

  -- class_session_gym_starts_uq: a second UNCANCELLED class at one instant.
  raised := false;
  begin
    insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
      values (gym_g, ct_dos, i_base, 60, 20);
  exception when unique_violation then raised := true;
  end;
  if not raised then raise exception 'SLOT FAIL(g): a direct duplicate class_session INSERT did not raise unique_violation'; end if;

  -- …and its escape hatch: a CANCELLED row at that instant IS allowed.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, cancelled_at)
    values (gym_g, ct_dos, i_base, 60, 20, now());
  select count(*) into n from public.class_session where gym_id = gym_g and starts_at = i_base;
  if n <> 2 then raise exception 'SLOT FAIL(g): expected the live class + a cancelled row at that instant, found %', n; end if;
  select count(*) into n from public.class_session where gym_id = gym_g and starts_at = i_base and cancelled_at is null;
  if n <> 1 then raise exception 'SLOT FAIL(g): % live class(es) at that instant (expected 1)', n; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- (h) THE INCUMBENT RULE — replaying the LIVE incident, which predates every guard above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Gym `red` carries two ACTIVE templates at one slot. Those rows exist; 20260823120100 is deliberately
-- deferred until they are cleaned, so the materializer has to behave correctly WHILE they are there:
-- exactly one session per contested instant, chosen by a RULE (oldest wins) rather than by heap order,
-- and both templates' ledger weeks claimed so neither retries forever.
--
-- The index has to come off to seed that state at all — which is itself the proof that the index is
-- doing its job. The DROP is transaction-local: this file ends in ROLLBACK, so the index is back the
-- moment the suite finishes, and `if exists` keeps this runnable against a database where
-- 20260823120100 has not been applied yet (the live ordering, before the cleanup).
drop index if exists public.schedule_template_slot_uq;

do $$
declare
  gym_g  uuid := current_setting('t.sg_gym', true)::uuid;
  ct_uno uuid := current_setting('t.sg_uno', true)::uuid;
  ct_dos uuid := current_setting('t.sg_dos', true)::uuid;
  tz     text := current_setting('t.sg_tz', true);
  monday date := current_setting('t.sg_monday', true)::date;
  t_viejo uuid;
  t_nuevo uuid;
  i_slot  timestamptz;
  v_tmpl uuid; v_ct uuid;
  n int;
begin
  -- Sábado 08:00 of week +2 — free, future on every day of the week, and in a week neither template
  -- has claimed. created_at is set EXPLICITLY: a whole transaction shares one default now(), so the
  -- age difference this vector is about could not otherwise exist.
  i_slot := ((monday + 14 + 5) + time '08:00') at time zone tz;

  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id, created_at)
    values (gym_g, ct_uno, 5, '08:00', 45, 24, gen_random_uuid(), now() - interval '30 days') returning id into t_viejo;
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id, created_at)
    values (gym_g, ct_dos, 5, '08:00', 60, 20, gen_random_uuid(), now() - interval '1 day') returning id into t_nuevo;

  perform public.materialize_week_for_gym(gym_g, monday + 14);

  -- ONE session at the contested instant — not two, which is the entire defect.
  select count(*) into n from public.class_session
   where gym_id = gym_g and starts_at = i_slot and cancelled_at is null;
  if n <> 1 then raise exception 'SLOT FAIL(h): the contested Sábado 08:00 slot minted % live session(s) (expected 1)', n; end if;

  -- …and the OLDEST template is the one that got it, with ITS values — a rule, not heap order, so the
  -- occupant of a contested slot cannot change identity from week to week.
  select template_id, class_type_id into v_tmpl, v_ct from public.class_session
   where gym_id = gym_g and starts_at = i_slot and cancelled_at is null;
  if v_tmpl is distinct from t_viejo then
    raise exception 'SLOT FAIL(h): the contested slot went to % (expected the OLDER template %)', v_tmpl, t_viejo;
  end if;
  if v_ct is distinct from ct_uno then
    raise exception 'SLOT FAIL(h): the contested slot carries the wrong class type %', v_ct;
  end if;
  select count(*) into n from public.class_session
   where gym_id = gym_g and starts_at = i_slot and duration_min = 45 and capacity = 24;
  if n <> 1 then raise exception 'SLOT FAIL(h): the written row does not carry the incumbent''s duration/capacity'; end if;

  -- BOTH templates claimed the week. The loser skipped the instant; it did not fail, and it will not
  -- re-attempt this week on every future pass.
  select count(*) into n from public.schedule_template_week
   where week_start = monday + 14 and template_id in (t_viejo, t_nuevo);
  if n <> 2 then raise exception 'SLOT FAIL(h): % of the two contesting templates claimed the week (expected 2)', n; end if;

  -- A second pass changes nothing: the ledger claim is what holds, so the loser never lands late.
  perform public.materialize_week_for_gym(gym_g, monday + 14);
  select count(*) into n from public.class_session
   where gym_id = gym_g and starts_at = i_slot and cancelled_at is null;
  if n <> 1 then raise exception 'SLOT FAIL(h): a second materialization pass added a twin (% live rows)', n; end if;
end $$;

select 'agenda slot guards: OK' as result;
rollback;
