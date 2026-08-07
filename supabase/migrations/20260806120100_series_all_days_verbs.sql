-- #243 follow-up — SLICE 5: "todos los días", plus the two holes the owner's walk found in
-- `edit_class_session`. Three functions, one fact each.
--
-- THE RULE, once: an operator who presses "Terminar el horario" (or "esta y las siguientes") on the
-- Lunes card of a schedule they created as "repetir Lun/Mié/Vie" means the SCHEDULE, not the Monday.
-- `p_all_days` is that intent, and 20260806120000's `group_id` is what it fans out over. Default
-- FALSE, so every shipped caller and every existing suite keeps the single-weekday behaviour verbatim.
--
-- ── WHY EACH FUNCTION IS DROPPED BEFORE IT IS CREATED ────────────────────────────────────────────
-- Adding a defaulted IN parameter does NOT replace a function — it creates a second overload beside
-- it. Two overloads that differ only by a defaulted trailing argument make PostgREST's named-argument
-- dispatch ambiguous (`function public.x(uuid, ...) is not unique`), and the failure lands at CALL
-- time on live, not at apply time. So the OLD signature is dropped explicitly and the EXECUTE grants
-- are re-issued against the NEW one (a drop takes the grant with it). `edit_class_session` keeps its
-- signature, so CREATE OR REPLACE carries its grant and it needs neither.
--
-- ── NO LOCK, AND THE RACE IT ACCEPTS (owner ruling) ──────────────────────────────────────────────
-- Unchanged and not re-litigated here: 20260806100000's and 20260806100100's headers state the ruling
-- (the shared/exclusive pair was CUT — it binds the fleet at ~3,800 gyms) and the single-stray-class
-- race it accepts. `materialize_week_for_gym` is not touched by this file either.

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. update_recurring_schedule — the same move, now optionally across every weekday of the schedule.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT IT WRITES, per group member (and with p_all_days = false the "group" is the one clicked rule,
-- so the shipped behaviour is reproduced statement for statement):
--   1. schedule_template — the rule, with the SAME unique_violation handler. The sentence names the
--      COLLIDING MEMBER's weekday, which is why v_wd is read per member and not once: on a Lun/Mié/Vie
--      move that only Miércoles blocks, "el Lunes" would be a lie the operator cannot act on.
--   2. class_session — the same one-statement fan-out, per member, with the same past-instant guard.
--   3. schedule_template_coach for EVERY member + class_session_coach for the UNION of the ids the
--      moves returned, and only when p_coach_ids is not null. Same ordering, same reason: the dated
--      join is what the agenda reads (packages/data/src/server/agenda.ts:131), and v_all is only known
--      after the fan-out.
--
-- ── p_weekday IS REFUSED WITH p_all_days ─────────────────────────────────────────────────────────
-- A weekday move across a multi-day schedule has no meaning: each member IS its own weekday, so
-- "move the schedule to Jueves" would collapse Lun/Mié/Vie onto one day (and self-collide on
-- schedule_template_active_uq). The refusal is explicit rather than "we ignore that field", because a
-- silently-dropped parameter is how a UI ships a control that does nothing.
--
-- ── AN ALL-DAYS EDIT RE-UNIFIES A DIVERGED MEMBER, AND THAT IS THE FEATURE ───────────────────────
-- Group membership is PERMANENT: a per-day edit (p_all_days = false) changes one member's values but
-- never its group, so the next all-days edit pulls that member back onto the schedule's shared values
-- — overwriting a divergence the operator may have made deliberately. Chosen, not missed: "todos los
-- días" means the schedule is ONE thing, and a checkbox that silently skipped the days that had been
-- customised would be a verb whose blast radius nobody can predict from the confirm dialog. The escape
-- hatch is the one that already exists — edit that day on its own afterwards.
--
-- ── kept IS NO LONGER 0-OR-1 ─────────────────────────────────────────────────────────────────────
-- The shipped receipt could say "1 clase se quedó en su horario" because only the CURRENT ISO week's
-- class can recompute into the past, and there is one of those per template. Across N members there
-- are up to N — 0..N, one per weekday. moved and kept are SUMS; the past-instant guard, and the
-- reason it SKIPS rather than detaches (a detached class survives "Terminar el horario"), are
-- unchanged from 20260806100000's header.
--
-- ── WHY THE LOOP RE-READS THE MEMBERS, AND WHY ZERO MEMBERS RAISES ───────────────────────────────
-- The anchor is pinned and gated first, exactly as shipped ('Horario no encontrado o ya retirado'
-- covers both "wrong gym" — the schedule_template SELECT policy is is_member_of, WIDER than staff —
-- and "already retired"). The driving query is then a second, independent read, so under READ
-- COMMITTED a retire that commits in between can leave it with zero rows. That must raise, not report
-- "0 clases movidas" for a schedule that no longer exists: v_members is what makes the shipped
-- `if not found` guarantee survive being moved inside a loop.
drop function if exists public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[]);

create or replace function public.update_recurring_schedule(
  p_template_id uuid,
  p_class_type_id uuid,
  p_start_time time,
  p_duration_min int,
  p_capacity int,
  p_weekday int default null,
  p_coach_ids uuid[] default null,
  p_all_days boolean default false,
  out moved int,
  out kept int
)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym     uuid := public.staff_gym();
  v_weekday int;
  v_group   uuid;
  v_tz      text;
  v_wd      int;
  v_ids     uuid[];
  v_tids    uuid[] := '{}';
  v_all     uuid[] := '{}';
  v_future  int;
  v_members int := 0;
  m         record;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;
  if p_all_days and p_weekday is not null then
    raise exception 'No se puede cambiar el día al editar todo el horario';
  end if;

  -- The anchor, read before any write: it resolves an omitted weekday, it supplies the group, and it
  -- is where a retired or foreign template is refused (see the header).
  select weekday, group_id into v_weekday, v_group from public.schedule_template
   where id = p_template_id and gym_id = v_gym and is_active;
  if not found then raise exception 'Horario no encontrado o ya retirado'; end if;
  v_weekday := coalesce(p_weekday, v_weekday);

  -- Server-authoritative gym clock, never a client parameter (ADR-0010 §k).
  select timezone into v_tz from public.gym where id = v_gym;

  moved := 0;
  kept  := 0;

  -- `order by weekday, id`: a partial failure aborts the whole call anyway (PostgREST wraps each RPC
  -- in its own transaction), so the only thing determinism buys is a reproducible report — the same
  -- reason retire's loop is ordered.
  for m in
    select id, weekday from public.schedule_template
     where gym_id = v_gym and is_active
       and (case when p_all_days then group_id = v_group else id = p_template_id end)
     order by weekday, id
  loop
    v_members := v_members + 1;
    -- EACH MEMBER KEEPS ITS OWN WEEKDAY on the all-days path; on the single-day path v_weekday is the
    -- move the caller asked for (or the anchor's own, coalesced).
    v_wd := case when p_all_days then m.weekday else v_weekday end;
    v_tids := v_tids || m.id;

    begin
      -- `and is_active` AGAIN: READ COMMITTED re-evaluates the predicate under the row lock, so a
      -- retire that commits after the read above turns this into zero rows and the raise below.
      update public.schedule_template
         set class_type_id = p_class_type_id,
             weekday       = v_wd,
             start_time    = p_start_time,
             duration_min  = p_duration_min,
             capacity      = p_capacity
       where id = m.id and gym_id = v_gym and is_active;
      if not found then raise exception 'Horario no encontrado o ya retirado'; end if;
    exception when unique_violation then
      raise exception 'Ya existe un horario activo para esta clase el % a las %',
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[v_wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end;

    -- THE MOVE, over the series' own index. `cs.starts_at` on the right-hand side reads the OLD value,
    -- so each row is re-anchored on its own ISO week; the trailing `> now()` is the past-instant
    -- guard, and a row it excludes is written by no statement in this function.
    with mv as (
      update public.class_session cs
         set class_type_id = p_class_type_id,
             starts_at     = ((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz,
             duration_min  = p_duration_min,
             capacity      = p_capacity
       where cs.template_id = m.id
         and cs.starts_at > now()
         and cs.cancelled_at is null
         and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz) > now()
      returning cs.id
    )
    select coalesce(array_agg(id), '{}') into v_ids from mv;

    -- `kept` is counted after the fact rather than tracked: a moved row is still attached and still
    -- future, so this member's whole future population minus its movers IS its skipped set.
    select count(*)::int into v_future
      from public.class_session
     where template_id = m.id and starts_at > now() and cancelled_at is null;

    moved := moved + coalesce(array_length(v_ids, 1), 0);
    kept  := kept  + (v_future - coalesce(array_length(v_ids, 1), 0));
    v_all := v_all || v_ids;
  end loop;

  if v_members = 0 then raise exception 'Horario no encontrado o ya retirado'; end if;
  -- …and the ANCHOR specifically. Zero members covers "the whole group went"; this covers the narrower
  -- race — a retire of the CLICKED rule committing between the pin above and the driving query's
  -- snapshot leaves N-1 siblings, which would edit them and hand back a success receipt for the card
  -- the operator actually clicked. The clicked rule is the one the receipt is about.
  if p_all_days and not (p_template_id = any(v_tids)) then
    raise exception 'Horario no encontrado o ya retirado';
  end if;

  -- The coach set is REPLACED only when the caller actually names one — `p_coach_ids IS NULL` means
  -- "leave the coaches alone", because the sheet seeds coachIds from the CLICKED SESSION and an
  -- unconditional replace would stamp last week's substitute onto the whole schedule. Then in BOTH
  -- tables: every member's rule, and exactly the dated rows that moved (a kept row keeps its coaches,
  -- because "byte-identical" is the whole rule for a kept row).
  if p_coach_ids is not null then
    delete from public.schedule_template_coach where template_id = any(v_tids);
    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, tid, cid from unnest(v_tids) tid, unnest(p_coach_ids) cid;

    delete from public.class_session_coach where session_id = any(v_all);
    insert into public.class_session_coach (gym_id, session_id, coach_id)
    select v_gym, sid, cid from unnest(v_all) sid, unnest(p_coach_ids) cid;
  end if;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005), against the NEW 8-argument signature ─────────────────────────────
revoke execute on function public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[], boolean) from public, anon;
grant  execute on function public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[], boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. retire_recurring_schedule — "Terminar el horario", now optionally the whole schedule.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- The anchor is retired first, under the SAME gate and the SAME sentence, so the idempotency argument
-- is untouched: a double-tapped confirm updates zero rows and raises ABOVE the loop, and no member can
-- be refunded twice. Only then does p_all_days retire the REST of the group, and the cancel loop widens
-- to every future class of every member — through the shipped `cancel_class_session`, which stays the
-- one and only implementation of hold-release (20260806100100's header says why a set-based refund
-- inside this loop must never be written).
--
-- Returns the TOTAL cancelled, across members, so the sheet's receipt still says `N clases canceladas`.
-- The loop joins schedule_template instead of filtering `template_id = ?` — same rows on the
-- single-day path (template_id is a FK, so a NULL never matched that filter either: a hand-edited
-- one-off has left the rule and is nobody's to cancel) and the only way to reach a group.
drop function if exists public.retire_recurring_schedule(uuid);

create or replace function public.retire_recurring_schedule(
  p_template_id uuid,
  p_all_days boolean default false
)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym   uuid := public.staff_gym();
  v_group uuid;
  v_n     int := 0;
  r       record;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- `gym_id = v_gym` is defense-in-depth, not redundancy: schedule_template's SELECT policy is
  -- is_member_of, WIDER than staff, so a multi-gym actor must get a refusal here and not a silent
  -- zero-row no-op.
  update public.schedule_template set is_active = false
   where id = p_template_id and gym_id = v_gym and is_active
  returning group_id into v_group;
  if not found then raise exception 'Horario no encontrado o ya retirado'; end if;

  if p_all_days then
    update public.schedule_template set is_active = false
     where group_id = v_group and gym_id = v_gym and is_active;
  end if;

  -- One call per future class, through the shipped release. Ordered so a partial failure (which aborts
  -- the whole call anyway) is deterministic to reproduce; `, cs.id` only breaks ties between MEMBERS,
  -- since one template can hold at most one class per instant (class_session_template_starts_uq).
  for r in
    select cs.id
      from public.class_session cs
      join public.schedule_template t on t.id = cs.template_id
     where t.gym_id = v_gym
       and (case when p_all_days then t.group_id = v_group else t.id = p_template_id end)
       and cs.starts_at > now()
       and cs.cancelled_at is null
     order by cs.starts_at, cs.id
  loop
    perform public.cancel_class_session(r.id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005), against the NEW 2-argument signature ─────────────────────────────
revoke execute on function public.retire_recurring_schedule(uuid, boolean) from public, anon;
grant  execute on function public.retire_recurring_schedule(uuid, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. edit_class_session — the holes the owner's walk found. Same signature, so CREATE OR REPLACE
--    carries the grant; the body is 20260806090000's with a pre-read and three guards added.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- HOLE 1 — IT SUCCEEDED ON A CANCELLED CLASS. A stale tab (or a second operator) edits a class that
-- has since been cancelled: the UPDATE matched the dead row, rewrote it, and reported success. The
-- operator was told a class had been moved, the members had already been refunded, and nothing on the
-- calendar changed. `cancelled_at is null` cannot just be bolted onto the UPDATE's WHERE — that would
-- collapse into 'Sesión no encontrada', which is a different fact and sends the operator looking for a
-- class that is right there in front of them. Hence the pre-read and its own sentence.
--
-- HOLE 2 — IT COULD MOVE A FUTURE CLASS INTO THE PAST. Probed on live: a booked class moved to 09:45
-- when 09:45 had already passed. Both release paths are permanently shut for a started class —
-- `cancel_class_session` (20260804150000:195) and `cancelar_reserva` (20260803140000:290) each raise
-- 'La clase ya comenzó' — so every hold on it becomes unrefundable by the gym, uncancellable by the
-- member, and derived as a no-show on a class that never happened at that hour. This is the SAME rule
-- the series move's past-instant guard already enforces (20260806100000); it just refuses instead of
-- skipping, because a single-class edit has exactly one row to act on and silently doing nothing to it
-- would be a lie in the receipt.
--
-- HOLE 3 — THE CROSSING RUNS BOTH WAYS, AND THE REVERSE MINTS CREDIT. An earlier revision of this file
-- guarded only future→past, on the reasoning that a past class's holds are "already unreleasable, so
-- the edit changes nothing". That reasoning is FALSE, and this is the direction it is false in.
-- FORFEIT IS A ZERO-WRITE OUTCOME: when a class passes with a `reservada` hold on it, no row is
-- written anywhere — the booking STAYS `reservada` and the no-show is DERIVED from `starts_at`
-- (20260804150000:471). And both release gates compare against the row's CURRENT starts_at
-- (`cancel_class_session` 20260804150000:195, `cancelar_reserva` 20260803140000:290). So dragging a
-- PASSED class forward re-opens both paths over holds the gym has already kept: the member cancels a
-- class they did not attend and the credit comes back, minted out of an attendance record. The
-- forfeit is not a fact in a column that the move leaves alone; it is a function of the column the
-- move rewrites.
--
-- So the guard is symmetric, and the sentence names the reason: a past class with live `reservada`
-- holds does not move to the future. Past→future with NO such holds is untouched — nothing to re-arm —
-- and RETRO-EDITING (past→past) STAYS LEGAL, which is the desk fixing a record and the only reason
-- this function tolerates a past instant at all.
--
-- The pre-read is pinned with `gym_id = v_gym` for the same reason the series verbs pin theirs: the
-- class_session SELECT policy is member-wide (and anon-wide per request gym), so without the pin a
-- cross-gym actor would learn from the SENTENCE whether a foreign class exists and is cancelled,
-- instead of getting the 'Sesión no encontrada' the UPDATE's RLS already gives them.
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
  v_gym       uuid := public.staff_gym();
  v_starts    timestamptz;
  v_cancelled timestamptz;
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

  select starts_at, cancelled_at into v_starts, v_cancelled
    from public.class_session where id = p_session_id and gym_id = v_gym;
  if not found then raise exception 'Sesión no encontrada'; end if;
  if v_cancelled is not null then raise exception 'La clase ya fue cancelada'; end if;
  if v_starts > now() and p_starts_at <= now() then
    raise exception 'No se puede mover la clase a una hora que ya pasó';
  end if;
  -- The reverse crossing (HOLE 3): only when a hold is actually there to re-arm. `reservada` is the
  -- exact set — an `asistida` row is a captured hold that cancel_class_session already refuses to
  -- re-credit, and a `cancelada` one is settled — so this refuses precisely the forfeits a move
  -- forward would hand back.
  if v_starts <= now() and p_starts_at > now()
     and exists (select 1 from public.reservation
                  where class_session_id = p_session_id and status = 'reservada') then
    raise exception 'No se puede mover al futuro una clase que ya pasó con reservas';
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
