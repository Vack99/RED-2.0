-- #243 follow-up — SLICE 4: THE SCHEDULE GROUP. Pre-work only; no verb changes behaviour here.
-- One new column, one backfill that runs exactly once, and one line added to
-- `create_recurring_schedule`. The verbs that READ the column land beside this in 20260806120100.
--
-- THE RULE, once: "repetir en N días" is ONE schedule to an operator and N rows to the database —
-- `schedule_template` is a PER-WEEKDAY recurrence rule, so a 3-day create mints 3 independent rows and
-- until now nothing recorded that they came from one act. The owner's walk found the consequence:
-- "Terminar el horario" pressed on the Lunes card ends Lunes and leaves Miércoles and Viernes running,
-- for a schedule the confirm dialog said had been cancelled. `group_id` is the missing fact — same
-- create, same group — and it is the only thing slice 5's `p_all_days` fans out over.
--
-- ── NOT NULL, AND NO DEFAULT ─────────────────────────────────────────────────────────────────────
-- Every writer must SAY which schedule a rule belongs to. There is exactly one RPC writer
-- (`create_recurring_schedule`, §4 below); the rest are the transaction-local fixtures in
-- supabase/tests and the two dev seeders, all of which now name it. A column default would let the
-- next writer silently mint a group of one and rediscover this exact bug — and it is also what
-- `packages/data/src/database.types.ts` already declares (group_id is REQUIRED in Insert, which is
-- what generation emits for not-null-without-default).
--
-- ── WHAT THIS FILE WRITES ────────────────────────────────────────────────────────────────────────
--   1. schedule_template.group_id + its index (the slice-5 fan-out reads `where group_id = ?`).
--   2. ONE backfill UPDATE over every pre-existing row. Idempotent by construction — see below.
--   3. create_recurring_schedule: one declared variable, one column in the INSERT. Same signature, so
--      CREATE OR REPLACE carries the EXECUTE grant and no re-issue is needed.
--
-- ── THE BACKFILL KEY: (gym_id, class_type_id, start_time, duration_min, capacity, created_at) ─────
-- A batch create inserts all of its weekday rows inside ONE transaction, and `created_at` defaults to
-- `now()` — the TRANSACTION timestamp — so every row of one batch shares it to the microsecond.
-- Verified on live: a 6-day create carries a single identical created_at across all six rows.
--
-- created_at ALONE would be wrong: seed scripts insert many unrelated templates in one transaction and
-- would collapse into a single group. The other four columns are exactly what a "repetir en N días"
-- create holds CONSTANT across its weekdays, and what tells two different classes seeded in the same
-- statement apart. `weekday` is deliberately absent from the key — it is the one axis a batch varies.
--
-- THE GROUP ID IS CHOSEN, NOT GENERATED: `min(id::text)::uuid` over the partition. Deterministic, so
-- live and a scratch project holding the same rows land on the same groups, and a re-apply is a
-- no-op. `gen_random_uuid()` in a backfill would be neither, and would re-shuffle groups on re-apply.
--
-- The residual error, stated rather than papered over: two genuinely different schedules created in
-- the same transaction with the same class_type, time, duration and capacity but different weekdays
-- would merge into one group — which is one schedule by every definition an operator has. The
-- opposite error (one batch split across two groups) would need two different created_at values
-- inside one statement, which Postgres cannot produce.
--
-- The no-advisory-lock owner ruling and the materializer race stand exactly as 20260806090000 and
-- 20260806100000 state them. Nothing here revisits either: `materialize_week_for_gym` is not touched.

-- ── 1. The column ────────────────────────────────────────────────────────────────────────────────
alter table public.schedule_template add column if not exists group_id uuid;

-- ── 2. The backfill, once ────────────────────────────────────────────────────────────────────────
-- `where group_id is null` scopes BOTH the partitioning and the write, so re-applying this file to a
-- database that already carries it touches zero rows instead of re-deriving groups over a table that
-- has since gained rows from create_recurring_schedule.
with grp as (
  select id,
         min(id::text) over (
           partition by gym_id, class_type_id, start_time, duration_min, capacity, created_at
         )::uuid as group_id
    from public.schedule_template
   where group_id is null
)
update public.schedule_template t
   set group_id = grp.group_id
  from grp
 where grp.id = t.id;

create index if not exists schedule_template_group_id_idx on public.schedule_template (group_id);

-- ── 3. The constraint ────────────────────────────────────────────────────────────────────────────
alter table public.schedule_template alter column group_id set not null;

comment on column public.schedule_template.group_id is
  'The "repetir en N días" batch this per-weekday rule came from (#243). Every row one create_recurring_schedule call mints shares one group_id; a template inserted on its own is a group of one. It is what the series verbs'' p_all_days fans out over, so that "Terminar el horario" on the Lunes card can end the whole schedule the operator created.';

-- ── 4. create_recurring_schedule: stamp the group ────────────────────────────────────────────────
-- Byte-identical to 20260805110000's body except for `v_group` and the `group_id` column in the
-- template INSERT. Same signature → the EXECUTE grant is carried by CREATE OR REPLACE. The uuid is
-- minted ONCE per call, above the weekday loop: that is the whole mechanism by which N rows become
-- one schedule.
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
  v_group  uuid := gen_random_uuid();
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
    -- #244 guard 4: the unique index on ACTIVE templates (gym_id, class_type_id, weekday, start_time)
    -- turns a re-created duplicate schedule into a raised, friendly refusal instead of a silent
    -- second copy that double-materializes every future week.
    begin
      insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
      values (v_gym, p_class_type_id, wd, p_start_time, p_duration_min, p_capacity, v_group)
      returning id into v_template;
    exception when unique_violation then
      raise exception 'Ya existe un horario activo para esta clase el % a las %',
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end;

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
