-- #243 series-edit — SLICE 1: safety pre-work. No feature lands here; two existing functions gain one
-- line each so that slices 2 and 3 (update_recurring_schedule / retire_recurring_schedule) cannot be
-- built on sand. docs/Context/2026-08-06-243-series-edit-design.md §5.1.
--
-- ── 1. materialize_week_for_gym: a SHARED per-gym advisory lock before the template loop ──────────
-- 20260805100000:69-72 reads the gym's active templates with a plain, unlocked SELECT and then writes
-- a ledger claim + a session per template. `retire_recurring_schedule` (slice 3) flips is_active off
-- and cancels the future sessions in one transaction. Interleave the two and the outcome is a LIVE,
-- BOOKABLE ORPHAN: the materialization pass reads the template while it is still active, the retire
-- commits (cancelling the sessions that existed at that moment), and the pass then commits a session
-- for a week the retire never saw — in a week whose ledger row is now CLAIMED, so no future
-- materialization pass will ever revisit it and no cancel will ever reach it. Members can book a class
-- belonging to a schedule that no longer exists, and the only cleanup is one-at-a-time by hand.
--
-- The fix is a lock, not a re-read: re-reading `is_active` after the write would still race, and
-- `FOR SHARE` on schedule_template would mint a real row lock (an XID, WAL, multixacts) on the
-- highest-frequency call in the spine — 240k/day at 4000 gyms. `pg_advisory_xact_lock_shared` costs
-- ~1 µs, takes no XID, writes no WAL, and is released at commit. SHARED so concurrent materialization
-- passes (the cron, and every view-time `ensure_week_materialized`) never block each other; slice 3
-- takes the EXCLUSIVE half of the same key, so a retire waits for in-flight passes and vice versa.
-- Keyed on `hashtextextended(gym::text, 0)` — the whole key space is per-gym, so two gyms never
-- serialize against each other, and the cron's 24,000 acquisitions per fleet pass add ~0.02 s to 41 s.
--
-- p_gym_id stays deliberately unguarded (the original header's rule): `hashtextextended` is strict, so
-- a NULL gym yields a NULL key and `pg_advisory_xact_lock_shared(NULL)` is a no-op returning NULL —
-- the function stays naturally inert for a null/foreign gym rather than defensively so.
--
-- EVERYTHING ELSE IS BYTE-FOR-BYTE 20260805100000:51-100. Diff the two: one `perform` line.
create or replace function public.materialize_week_for_gym(p_gym_id uuid, p_week_start date)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_tz      text;
  v_monday  date;
  v_count   int := 0;
  v_session uuid;
  t         record;
  v_starts  timestamptz;
begin
  select timezone into v_tz from public.gym where id = p_gym_id;
  -- isodow: Mon=1..Sun=7 → back up to Monday.
  v_monday := p_week_start - ((extract(isodow from p_week_start)::int - 1));

  -- #243 slice 1: hold the gym's materialization lock SHARED for the rest of this transaction, so a
  -- concurrent retire (which takes it EXCLUSIVE) cannot strand an orphan session in a claimed week.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_gym_id::text, 0));

  for t in
    select id, class_type_id, weekday, start_time, duration_min, capacity
    from public.schedule_template
    where gym_id = p_gym_id and is_active
  loop
    insert into public.schedule_template_week (gym_id, template_id, week_start)
    values (p_gym_id, t.id, v_monday)
    on conflict (template_id, week_start) do nothing;

    if found then  -- first materialization of this template for this week
      -- A garbage gym.timezone raises HERE, after the ledger claim. Under the cron that raise is
      -- caught by the per-gym subtransaction below, which rolls the claim back with it — the gym
      -- retries cleanly next week instead of carrying a poisoned "already materialized" row (#3).
      v_starts := ((v_monday + t.weekday) + t.start_time) at time zone v_tz;

      v_session := null;
      insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
      values (p_gym_id, t.class_type_id, v_starts, t.duration_min, t.capacity, t.id)
      on conflict (template_id, starts_at) do nothing
      returning id into v_session;

      if v_session is not null then
        insert into public.class_session_coach (gym_id, session_id, coach_id)
        select p_gym_id, v_session, stc.coach_id
        from public.schedule_template_coach stc where stc.template_id = t.id;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- Same signature as 20260805100000 — CREATE OR REPLACE carries the EXECUTE grants (revoked from
-- public/anon, granted to authenticated), so no re-issue is needed.

-- ── 2. edit_class_session: a hand-moved session LEAVES the rule (template_id = null) ──────────────
-- 20260706120100:208-209 deliberately preserves `template_id` on an edit, with the comment "the
-- provenance link stays but the edit reaches no other session in the series". That was correct while
-- nothing could ever write the series — a dangling provenance pointer that nothing dereferenced. Slice
-- 2 makes it dereferenceable, and at that moment preserving it becomes THE STOMP: an operator moves
-- Tuesday's 19:00 class to Wednesday 11:00 for a holiday; three weeks later they change the series to
-- 20:00 through the new "esta y las siguientes" verb; the fan-out recomputes that hand-moved session's
-- instant from its own week and drags it back onto the grid it was deliberately taken off. The
-- operator's exception is silently deleted by a write they aimed at everything else.
--
-- So a hand-edited session DETACHES: it becomes a one-off at whatever instant the operator chose, and
-- the series can never reach it again. This is the same rule slice 2 applies to a session that cannot
-- legally move (the past-instant guard) — one meaning for `template_id is null`: "this dated class no
-- longer belongs to the rule".
--
-- What it costs, stated because it is a real behaviour change and not a refactor:
--   * PROVENANCE IS LOST on an edit. Nothing reads it today (`packages/data/src/server/agenda.ts:105`
--     does not even select the column), and the spine's own header — 20260706120000:23-26 — already
--     declares sessions INDEPENDENT rows once written.
--   * RESURRECTION IS NOT ENABLED. The non-resurrection guarantee (scheduling_materialization.sql
--     vector 5) is held by the IMMUTABLE per-week ledger `schedule_template_week`, never by
--     `class_session.template_id` — vacating the (template_id, starts_at) slot has always been what
--     the vector does, and the ledger claim is what stops the next pass from refilling it. Nulling
--     template_id vacates the same slot a second way and changes nothing about that argument. The
--     suite pins it: after the edit, `ensure_week_materialized` for that week still adds 0 rows.
--
-- Same signature → CREATE OR REPLACE carries the grant. The ONLY change to 20260706120100's body is
-- the `template_id = null` line in the SET list.
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

  -- One row only (RLS update scopes to is_staff_of(gym_id)); the edit still reaches no other session
  -- in the series — and since #243 slice 1 it also LEAVES the series: template_id is nulled, so the
  -- series-level verbs can never move this hand-placed class again.
  update public.class_session
     set class_type_id = p_class_type_id,
         starts_at     = p_starts_at,
         duration_min  = p_duration_min,
         capacity      = p_capacity,
         is_special    = p_is_special,
         special_name  = p_special_name,
         room_id       = p_room_id,
         template_id   = null
   where id = p_session_id;
  if not found then raise exception 'Sesión no encontrada'; end if;

  -- Replace this session's coach set (delete-then-insert; staff delete policy on the join table).
  delete from public.class_session_coach where session_id = p_session_id;
  insert into public.class_session_coach (gym_id, session_id, coach_id)
  select v_gym, p_session_id, cid from unnest(p_coach_ids) as cid;
end;
$function$;
