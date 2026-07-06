-- Scheduling atomic write RPCs, slice #42 (PRD #36 S1 decision c; ADR-0005 seam; ADR-0010).
--
-- The write half of the scheduling spine. Every function is the ADR-0005 seam: SECURITY INVOKER (the
-- default — so RLS on class_session/schedule_template/the two join tables still scopes every row to the
-- caller), SET search_path TO '' (injection-safe; every object schema-qualified), EXECUTE revoked from
-- public+anon and granted to authenticated only. Each does ONLY its transaction; there is no scheduling
-- "engine" — occupancy/estado math lives in the tested TS domain (S4).
--
-- Gym is ALWAYS derived from public.staff_gym() (ADR-0013 §1; the same membership-keyed definer helper the
-- sales RPCs use), NEVER trusted from a parameter — so a non-staff caller gets staff_gym() = NULL and is
-- refused, and a caller can only ever write into their OWN gym. On top of that, every FK target
-- (class_type, room, coach) is validated to belong to the caller's gym, so passing another gym's id raises
-- (the "RPC refuses acting on another gym's rows" acceptance vector).
--
-- FUNCTIONS:
--   create_class_session      — one-off: insert session + coach joins, one transaction (§1 clase especial
--                              rides this with is_special/special_name; template_id stays NULL).
--   create_recurring_schedule — "Se repite": insert one schedule_template per selected weekday (+ default
--                              coaches), then materialize the visible horizon — all one transaction.
--   ensure_week_materialized  — idempotent per-week materialization for the caller's gym; the SAME RPC the
--                              agenda calls when a future week scrolls into view (decision c). Guarded by
--                              unique(template_id, starts_at): re-running adds nothing; a deactivated
--                              template materializes nothing; a cancelled instance is not resurrected.
--   edit_class_session        — one row + its coach joins, NEVER fans out to the series (sessions are
--                              independent once written, §5.3 / ADR-0010).
--   cancel_class_session      — durable soft cancel (sets cancelled_at); survives re-materialization.

-- ── create_class_session (one-off; session + coach joins in one transaction) ────
create or replace function public.create_class_session(
  p_class_type_id uuid,
  p_starts_at timestamptz,
  p_duration_min int,
  p_capacity int,
  p_coach_ids uuid[] default '{}',
  p_is_special boolean default false,
  p_special_name text default null,
  p_room_id uuid default null
)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym uuid := public.staff_gym();
  v_session uuid;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if p_room_id is not null and not exists (select 1 from public.room where id = p_room_id and gym_id = v_gym) then
    raise exception 'room % no pertenece al gimnasio del operador', p_room_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, is_special, special_name, room_id)
  values (v_gym, p_class_type_id, p_starts_at, p_duration_min, p_capacity, p_is_special, p_special_name, p_room_id)
  returning id into v_session;

  insert into public.class_session_coach (gym_id, session_id, coach_id)
  select v_gym, v_session, cid from unnest(p_coach_ids) as cid;

  return v_session;
end;
$function$;

-- ── ensure_week_materialized (idempotent per-week; the view-time + create-time seam) ──
-- p_week_start is normalized to that ISO week's Monday, so any day-in-week is safe. For each ACTIVE
-- template of the caller's gym, the session's absolute instant is (Monday + weekday days + start_time)
-- interpreted in the gym's IANA timezone (ADR-0010 §k: wall-clock times are uninterpretable without it).
-- ON CONFLICT DO NOTHING on (template_id, starts_at) makes it idempotent AND cancel-durable; coach joins
-- seed only for genuinely-new sessions. Returns the count of sessions created this call.
create or replace function public.ensure_week_materialized(p_week_start date)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym    uuid := public.staff_gym();
  v_tz     text;
  v_monday date;
  v_count  int := 0;
  v_session uuid;
  t        record;
  v_starts timestamptz;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  select timezone into v_tz from public.gym where id = v_gym;
  -- isodow: Mon=1..Sun=7 → back up to Monday.
  v_monday := p_week_start - ((extract(isodow from p_week_start)::int - 1));

  for t in
    select id, class_type_id, weekday, start_time, duration_min, capacity
    from public.schedule_template
    where gym_id = v_gym and is_active
  loop
    v_starts := ((v_monday + t.weekday) + t.start_time) at time zone v_tz;

    insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
    values (v_gym, t.class_type_id, v_starts, t.duration_min, t.capacity, t.id)
    on conflict (template_id, starts_at) do nothing
    returning id into v_session;

    if found then
      insert into public.class_session_coach (gym_id, session_id, coach_id)
      select v_gym, v_session, stc.coach_id
      from public.schedule_template_coach stc where stc.template_id = t.id;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- ── create_recurring_schedule ("Se repite": templates + coaches + materialize horizon, one txn) ──
-- One schedule_template per selected weekday (the table holds a single weekday; the mock's multi-weekday
-- toggle maps to N template rows), each seeded with the default coaches. Then the visible horizon is
-- materialized by delegating to ensure_week_materialized for each of the next p_horizon_weeks weeks
-- (starting this week in the gym's timezone) — the same idempotent seam the agenda uses, so no
-- materialization logic is duplicated. Returns the created template ids.
create or replace function public.create_recurring_schedule(
  p_class_type_id uuid,
  p_weekdays int[],
  p_start_time time,
  p_duration_min int,
  p_capacity int,
  p_coach_ids uuid[] default '{}',
  p_horizon_weeks int default 6
)
 returns setof uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym    uuid := public.staff_gym();
  v_tz     text;
  v_today  date;
  v_monday date;
  v_template uuid;
  wd int;
  i  int;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  foreach wd in array p_weekdays loop
    insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (v_gym, p_class_type_id, wd, p_start_time, p_duration_min, p_capacity)
    returning id into v_template;

    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, v_template, cid from unnest(p_coach_ids) as cid;

    return next v_template;
  end loop;

  -- Materialize the visible horizon (this week's Monday + the next p_horizon_weeks-1 weeks).
  select timezone into v_tz from public.gym where id = v_gym;
  v_today := (now() at time zone v_tz)::date;
  v_monday := v_today - ((extract(isodow from v_today)::int - 1));
  for i in 0 .. greatest(p_horizon_weeks, 1) - 1 loop
    perform public.ensure_week_materialized(v_monday + (i * 7));
  end loop;
end;
$function$;

-- ── edit_class_session (single row + its coach joins; NEVER fans out to the series) ──
create or replace function public.edit_class_session(
  p_session_id uuid,
  p_class_type_id uuid,
  p_starts_at timestamptz,
  p_duration_min int,
  p_capacity int,
  p_coach_ids uuid[] default '{}',
  p_is_special boolean default false,
  p_special_name text default null,
  p_room_id uuid default null
)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym uuid := public.staff_gym();
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if p_room_id is not null and not exists (select 1 from public.room where id = p_room_id and gym_id = v_gym) then
    raise exception 'room % no pertenece al gimnasio del operador', p_room_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  -- One row only (RLS update scopes to is_staff_of(gym_id)); template_id is NOT touched, so the
  -- provenance link stays but the edit reaches no other session in the series.
  update public.class_session
     set class_type_id = p_class_type_id,
         starts_at     = p_starts_at,
         duration_min  = p_duration_min,
         capacity      = p_capacity,
         is_special    = p_is_special,
         special_name  = p_special_name,
         room_id       = p_room_id
   where id = p_session_id;
  if not found then raise exception 'Sesión no encontrada'; end if;

  -- Replace this session's coach set (delete-then-insert; staff delete policy on the join table).
  delete from public.class_session_coach where session_id = p_session_id;
  insert into public.class_session_coach (gym_id, session_id, coach_id)
  select v_gym, p_session_id, cid from unnest(p_coach_ids) as cid;
end;
$function$;

-- ── cancel_class_session (durable soft cancel; survives re-materialization) ──────
create or replace function public.cancel_class_session(p_session_id uuid)
 returns void
 language plpgsql
 set search_path to ''
as $function$
begin
  if public.staff_gym() is null then raise exception 'No autorizado'; end if;
  update public.class_session set cancelled_at = now()
   where id = p_session_id and cancelled_at is null;   -- RLS scopes to is_staff_of(gym_id)
  if not found then raise exception 'Sesión no encontrada o ya cancelada'; end if;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005): revoke public default, grant authenticated only ──
revoke execute on function public.create_class_session(uuid, timestamptz, int, int, uuid[], boolean, text, uuid) from public;
revoke execute on function public.ensure_week_materialized(date) from public;
revoke execute on function public.create_recurring_schedule(uuid, int[], time, int, int, uuid[], int) from public;
revoke execute on function public.edit_class_session(uuid, uuid, timestamptz, int, int, uuid[], boolean, text, uuid) from public;
revoke execute on function public.cancel_class_session(uuid) from public;
grant execute on function public.create_class_session(uuid, timestamptz, int, int, uuid[], boolean, text, uuid) to authenticated;
grant execute on function public.ensure_week_materialized(date) to authenticated;
grant execute on function public.create_recurring_schedule(uuid, int[], time, int, int, uuid[], int) to authenticated;
grant execute on function public.edit_class_session(uuid, uuid, timestamptz, int, int, uuid[], boolean, text, uuid) to authenticated;
grant execute on function public.cancel_class_session(uuid) to authenticated;
