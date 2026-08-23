-- Agenda slot exclusivity — the RPC half (docs/audits/2026-08-23-agenda-class-duplication-audit.md,
-- defects D1/D11 and the DB side of D2/D3/§1.1/§1.5).
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- THE RULING THIS ENCODES, AND THE ONE IT REVERSES
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 20260805110000:263-265 wrote the opposite rule into the dedup key on purpose: "two DIFFERENT class
-- types at the same day/time are not a duplicate (a gym can genuinely run Yoga and Box in different
-- rooms at 18:00 Lunes)". That is REVERSED here by owner ruling (2026-08-23): the product currently
-- serves SINGLE-ROOM class studios, so ONE class per gym per instant is the invariant — and the
-- multi-room escape hatch that sentence imagined was never built (room_id exists and is nullable;
-- nothing reads it, nothing schedules against it, and no capacity/occupancy rule is keyed on it).
--
-- What the old key cost, live: gym `red` carries TWO active templates at Mon 07:15 (Upper Body +
-- Cardio HIIT) and TWO at Wed 07:15 (Abs + Cardio HIIT). class_type_id sits inside
-- schedule_template_active_uq, so both are legal; materialize_week_for_gym's
-- `on conflict (template_id, starts_at) do nothing` is keyed on the TEMPLATE, so each mints its own
-- class_session — a duplicate pair on the calendar every single week, for every colliding weekday.
-- Staff read that as "editing a class duplicates it" and re-create the slot, which mints more.
--
-- THE RELAXATION PATH, if a genuinely multi-room gym ever signs: add room_id to the keys — here (both
-- guards below become "…same (gym_id, room_id, weekday, start_time)") and in the two unique indexes of
-- the sibling migration 20260823120100. That is a widening, so it can ship as a plain expand-only
-- migration whenever the product actually grows a room dimension. Nothing here forecloses it.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS FILE IS SAFE TO APPLY TO LIVE **BEFORE** THE DUPLICATE PAIRS ARE CLEANED
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Counted read-only on live 2026-08-23: 2 colliding template slots (both gym `red`) and 16 colliding
-- class_session instants — 14 in `red` (8 of them still future), 1 each in `forge-demo` and `red-demo`,
-- both past. The full census, and the cleanup order, are in the sibling migration's header.
--
-- Its sibling (20260823120100) cannot land yet — a unique index build fails outright against those
-- rows. This file is the half that CAN land first, and every guard below is deliberately shaped so
-- that a pre-existing colliding pair is TOLERATED rather than bricked:
--   * `update_recurring_schedule` and `edit_class_session` only check when the edit actually MOVES the
--     slot/instant. An operator fixing the capacity or the coach of one row of an existing pair is not
--     refused — the pair predates the guard and the edit does not make it worse.
--   * `materialize_week_for_gym` SKIPS a contested instant rather than raising, so one bad slot never
--     aborts a gym's whole week (and, under the cron, never burns that gym's per-gym subtransaction).
--   * `create_recurring_schedule` / `create_class_session` refuse only NEW collisions, which is the
--     entire point.
-- The net effect on live before cleanup: no new pairs can be minted, and the existing pairs stop
-- re-minting themselves every week (the materializer's new occupancy skip collapses each contested
-- slot to ONE session per week, oldest template wins).
--
-- House idiom: `set search_path to ''`, schema-qualified, CREATE OR REPLACE at UNCHANGED signatures
-- (so every EXECUTE grant carries — no re-issue anywhere in this file), expand-only, idempotent.
-- No schema change, no policy change, no new function surface.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- TWO SENTENCES, AND WHY THE OLD ONE IS LEFT BYTE-IDENTICAL
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- The shipped same-class refusal — 'Ya existe un horario activo para esta clase el <día> a las <HH:MM>'
-- (20260805110000:328) — is UNCHANGED, still raised from the same `exception when unique_violation`
-- handler over the same index. Every new check below therefore filters to a DIFFERENT class_type and
-- raises its own sentence, which names the class already holding the slot:
--     'Ya existe un horario activo de Cardio HIIT el Lunes a las 07:15'
-- Two sentences rather than one because they are two different facts for the operator: "you already
-- repeat THIS class then" is fixed by editing that schedule; "something ELSE is already there" is
-- fixed by moving one of them. Naming the incumbent is the whole difference — an operator who cannot
-- see which class is in the way cannot act on the refusal.
--
-- The same-class path is left flowing through the unique_violation handler on purpose: it is what the
-- shipped suites assert on, and once 20260823120100's wider index lands a same-class collision may
-- violate EITHER index — the handler catches by SQLSTATE, not by index name, so the sentence is
-- identical whichever fires first.

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. create_recurring_schedule — a new schedule may not land on an occupied slot, whatever class
--    already holds it.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Same signature as 20260806120000 (which added group_id) → the EXECUTE grant carries. The body is
-- that one with ONE pre-check added inside the weekday loop, above the INSERT. Everything else —
-- the group uuid minted once above the loop, the unique_violation handler, the horizon loop, the
-- all-or-nothing rollback semantics — is byte-identical.
--
-- The check is PER WEEKDAY, inside the loop, for the same reason the handler it sits beside is: the
-- raised sentence must name the weekday that ACTUALLY collided, not the first one the call tried.
-- An uncaught exception aborts the whole RPC (PostgREST wraps each call in one transaction), so a
-- collision on the third weekday still leaves zero template rows and zero session rows — the
-- partial-write shape scheduling_materialization.sql already pins.
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
  v_ocupa  text;   -- the class already holding the slot, for the refusal sentence
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
    -- 2026-08-23 ruling: ONE class per gym per instant. `class_type_id is distinct from` scopes this
    -- to the CROSS-class case only — a same-class duplicate keeps falling through to the
    -- unique_violation handler below and keeps its shipped sentence verbatim. `order by created_at,
    -- id` makes the named incumbent deterministic when a slot is already contested (the live
    -- pre-guard state), so the same call always refuses with the same words.
    select ct.name into v_ocupa
      from public.schedule_template st
      join public.class_type ct on ct.id = st.class_type_id
     where st.gym_id = v_gym
       and st.weekday = wd
       and st.start_time = p_start_time
       and st.is_active
       and st.class_type_id is distinct from p_class_type_id
     order by st.created_at, st.id
     limit 1;
    if v_ocupa is not null then
      raise exception 'Ya existe un horario activo de % el % a las %',
        v_ocupa,
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end if;

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

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. create_class_session — the blind INSERT gets a collision check (audit D1).
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Same signature as 20260706120100 → the EXECUTE grant carries. This is the mechanism ranked ★★★ in
-- the audit: `+ Nueva clase` is offered on an already-occupied slot, the create sheet looks identical
-- to the editor, and a one-off carries template_id NULL — which Postgres treats as DISTINCT, so
-- class_session_template_starts_uq never saw these rows at all. Two fast taps (D2) or a silent failed
-- save retried (D3) mint the same twins through the same hole.
--
-- The check is over the GYM's uncancelled population at that instant, not over `template_id is null`:
-- a hand-created one-off landing on a MATERIALIZED slot is exactly the reported fingerprint
-- (one ÚNICA + one attached), so restricting the check to one-offs would miss the case that produced
-- the ticket. A CANCELLED session at the instant does NOT block — that slot is genuinely free, and
-- re-creating over a cancelled class is a supported desk correction.
--
-- NO PAST-DATE GUARD, deliberately (owner ruling — admin agency, [[gym-data-belongs-to-the-gym]]):
-- backdating a one-off class is a supported workflow, and the audit's D16 is NOT actioned here.
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
  v_ocupa text;   -- the class already at that instant, for the refusal sentence
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

  -- 2026-08-23 ruling: ONE class per gym per instant. The name shown is the special_name when the
  -- incumbent is a clase especial (that is what the card reads on the agenda), else the class type.
  select coalesce(nullif(cs.special_name, ''), ct.name) into v_ocupa
    from public.class_session cs
    join public.class_type ct on ct.id = cs.class_type_id
   where cs.gym_id = v_gym
     and cs.starts_at = p_starts_at
     and cs.cancelled_at is null
   order by cs.created_at, cs.id
   limit 1;
  if v_ocupa is not null then
    raise exception 'Ya existe una clase a esa hora: %', v_ocupa;
  end if;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, is_special, special_name, room_id)
  values (v_gym, p_class_type_id, p_starts_at, p_duration_min, p_capacity, p_is_special, p_special_name, p_room_id)
  returning id into v_session;

  insert into public.class_session_coach (gym_id, session_id, coach_id)
  select v_gym, v_session, cid from unnest(p_coach_ids) as cid;

  return v_session;
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. materialize_week_for_gym — the weekly minting loop stops producing pairs and phantoms.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Same signature as 20260808210000 → the EXECUTE grant carries, and the #260 backward clamp is kept
-- verbatim at the top. Three changes, all inside the loop:
--
-- (a) OCCUPANCY SKIP. The insert is skipped when an UNCANCELLED class_session already holds that
--     (gym_id, starts_at). `on conflict (template_id, starts_at) do nothing` only ever saw the SAME
--     template's own row, which is why two templates at one slot mint two sessions every week. SKIP,
--     never raise: this function runs per-gym under the #136 cron, and one contested slot must not
--     cost a gym its whole week — and on live it must tolerate the 16 pre-existing pairs.
--     Cancel-durability is untouched: the check requires `cancelled_at is null`, so a CANCELLED
--     session does not block, and the insert underneath still hits the template-keyed ON CONFLICT,
--     which is what keeps a cancelled instance from being resurrected.
--     The LEDGER CLAIM IS STILL TAKEN for a skipped instant (the claim is above this, unchanged) —
--     that is what stops the cron from re-attempting the same contested slot forever.
--
-- (b) DETERMINISTIC ORDER — `order by created_at asc, id asc`. The loop had no ORDER BY at all, so
--     which of two colliding templates won a contested slot was whatever the heap handed back. With
--     (a) turning "both win" into "first one wins", the winner has to be a RULE: the OLDEST template
--     is the incumbent, so a slot's occupant does not silently change identity from week to week.
--     `id` breaks the tie for two templates minted in one transaction (created_at is the transaction
--     timestamp, identical across a whole "repetir en N días" batch — 20260806120000's header).
--
-- (c) ELAPSED SKIP — `v_starts > now()` (audit D11). A mid-week recurring create materialized the
--     current week's ALREADY-PASSED weekdays: permanent phantom classes that cancel refuses ('La
--     clase ya pasó') and retire never touches (`starts_at > now()`), counted in every summary. The
--     ledger claim is still taken, so the phantom is not re-minted next pass either. The weekly cron
--     is unaffected in normal operation: it fires Mondays 08:00Z = 02:00 America/Chihuahua, ahead of
--     every instant in the week it is claiming.
create or replace function public.materialize_week_for_gym(p_gym_id uuid, p_week_start date)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_tz      text;
  v_monday  date;
  v_today   date;
  v_count   int := 0;
  v_session uuid;
  t         record;
  v_starts  timestamptz;
begin
  select timezone into v_tz from public.gym where id = p_gym_id;
  -- isodow: Mon=1..Sun=7 → back up to Monday.
  v_monday := p_week_start - ((extract(isodow from p_week_start)::int - 1));

  -- Backward clamp (#260): a target week older than the gym-local CURRENT Monday is history — refuse
  -- silently, before touching anything. Reuses the SAME gym.timezone lookup already made above, so a
  -- null/foreign p_gym_id (v_tz null) makes v_today null too; the comparison below is then UNKNOWN and
  -- plpgsql treats an unknown IF condition as false, so the clamp simply does not fire — matching this
  -- function's existing "p_gym_id is deliberately unguarded, naturally inert" posture (no
  -- schedule_template row matches an invalid gym anyway, so the loop below still yields 0).
  v_today := (now() at time zone v_tz)::date;
  v_today := v_today - ((extract(isodow from v_today)::int - 1));
  if v_monday < v_today then
    return 0;
  end if;

  for t in
    select id, class_type_id, weekday, start_time, duration_min, capacity
    from public.schedule_template
    where gym_id = p_gym_id and is_active
    order by created_at asc, id asc   -- (b): the OLDEST template is the incumbent of a contested slot
  loop
    insert into public.schedule_template_week (gym_id, template_id, week_start)
    values (p_gym_id, t.id, v_monday)
    on conflict (template_id, week_start) do nothing;

    if found then  -- first materialization of this template for this week
      -- A garbage gym.timezone now raises EARLIER, at the v_today cast above (before this loop even
      -- starts, let alone before any ledger claim) — the #260 backward clamp put that cast ahead of
      -- everything else in this function. Under the cron, that raise is still caught by the per-gym
      -- subtransaction, which rolls back cleanly either way — the gym retries next week instead of
      -- carrying a poisoned "already materialized" row (#3).
      v_starts := ((v_monday + t.weekday) + t.start_time) at time zone v_tz;

      -- (c) elapsed, then (a) occupied. Both SKIP with the ledger claim above already taken, so
      -- neither instant is re-attempted on a later pass.
      if v_starts > now()
         and not exists (
           select 1 from public.class_session cs
            where cs.gym_id = p_gym_id
              and cs.starts_at = v_starts
              and cs.cancelled_at is null
         )
      then
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
    end if;
  end loop;

  return v_count;
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. update_recurring_schedule — a MOVE may not land on a slot another schedule already holds.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Same 8-argument signature as 20260806120100 → the EXECUTE grant carries. The body is that one with
-- TWO pre-checks added inside the member loop — one for the RULE's target slot (above the template
-- UPDATE) and one for the dated ROWS' target instants (above the class_session fan-out; its own
-- rationale sits with it) — plus `start_time` added to the driving SELECT, which both need to know
-- whether the edit moves anything at all.
--
-- ── IT ONLY FIRES WHEN THE SLOT ACTUALLY MOVES ───────────────────────────────────────────────────
-- `v_wd is distinct from m.weekday or p_start_time is distinct from m.start_time`. Two reasons, and
-- the second is the load-bearing one:
--   * a capacity/duration/coach-only edit has no target slot to contest — its "target" is where it
--     already is, and the only template there is itself;
--   * on LIVE, before the pairs are cleaned, a template that is ALREADY in a contested slot must stay
--     editable. An unconditional check would refuse every edit to both rows of the live pairs and leave
--     the operator with no way to fix them from the app.
--
-- ── WHAT IS EXCLUDED FROM THE CHECK ──────────────────────────────────────────────────────────────
-- The templates being edited, exactly: on the all-days path the WHOLE group (its members are moving
-- together, and each keeps its own weekday so they cannot contest each other's target); on the
-- single-day path just the clicked rule. A SIBLING of the same group IS checked on the single-day
-- path — moving Lunes onto its own schedule's occupied Miércoles is a real collision.
--
-- Same two-sentence split as §1: `class_type_id is distinct from p_class_type_id` leaves the
-- same-class collision to the shipped unique_violation handler, whose message is unchanged.
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
  v_ocupa   text;        -- the class already holding the target SLOT, for the refusal sentence
  v_choque  timestamptz; -- the first target INSTANT another class already holds
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
  -- is where a retired or foreign template is refused (see 20260806120100's header).
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
  -- reason retire's loop is ordered. `start_time` is read for the moved-slot test below.
  for m in
    select id, weekday, start_time from public.schedule_template
     where gym_id = v_gym and is_active
       and (case when p_all_days then group_id = v_group else id = p_template_id end)
     order by weekday, id
  loop
    v_members := v_members + 1;
    -- EACH MEMBER KEEPS ITS OWN WEEKDAY on the all-days path; on the single-day path v_weekday is the
    -- move the caller asked for (or the anchor's own, coalesced).
    v_wd := case when p_all_days then m.weekday else v_weekday end;
    v_tids := v_tids || m.id;

    -- 2026-08-23 ruling: ONE class per gym per instant. Only when this member's slot actually changes
    -- (see the header) and only against a DIFFERENT class type (same-class stays with the handler
    -- below). The edited scope is excluded so a group moving together never contests itself.
    if v_wd is distinct from m.weekday or p_start_time is distinct from m.start_time then
      select ct.name into v_ocupa
        from public.schedule_template st
        join public.class_type ct on ct.id = st.class_type_id
       where st.gym_id = v_gym
         and st.weekday = v_wd
         and st.start_time = p_start_time
         and st.is_active
         and st.class_type_id is distinct from p_class_type_id
         and (case when p_all_days then st.group_id is distinct from v_group else st.id <> p_template_id end)
       order by st.created_at, st.id
       limit 1;
      if v_ocupa is not null then
        raise exception 'Ya existe un horario activo de % el % a las %',
          v_ocupa,
          (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[v_wd + 1],
          to_char(p_start_time, 'HH24:MI');
      end if;
    end if;

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

    -- ── THE DATED HALF OF THE SAME RULE: no target INSTANT may already be taken ────────────────────
    -- Guard 4 above is about the RULE (schedule_template); this is about the ROWS the fan-out below is
    -- one statement away from writing. They are not the same question: a class that belongs to NO
    -- active rule — a hand-placed one-off, or a class detached by edit_class_session (#243 slice 1) —
    -- is invisible to a template-keyed check and still occupies its instant. Without this, a series
    -- move onto such a week either silently double-books it (before 20260823120100) or fails the whole
    -- call on a raw 23505 whose text is a constraint name (after it).
    --
    -- REFUSE THE WHOLE MOVE, never skip the colliding week (owner ruling 2026-08-23). It matches what
    -- this RPC already does everywhere else — one collision anywhere aborts the call and leaves zero
    -- rows written, the same all-or-nothing shape `create_recurring_schedule` has for weekdays — and it
    -- is the only outcome an operator can act on: a silently-skipped week would leave the series split
    -- across two horas with a receipt that said it moved.
    --
    -- SCOPE, exactly the fan-out's own: the same rows (`template_id = m.id`, future, uncancelled), the
    -- same recomputed instant, the same `> now()` filter — so a week the fan-out would SKIP cannot
    -- block the move either. `cs2.id <> cs.id` plus the `not exists` exclude the movers themselves and
    -- every sibling of the edited scope; on the all-days path each member keeps its own weekday, so
    -- members can never contest each other's targets. A CANCELLED class does not block (that instant is
    -- free), and — like guard 4 — the whole check is gated on the slot ACTUALLY moving, so an operator
    -- editing capacity on a template that already sits in a contested slot is never locked out.
    if v_wd is distinct from m.weekday or p_start_time is distinct from m.start_time then
      select cs2.starts_at into v_choque
        from public.class_session cs
        join public.class_session cs2
          on cs2.gym_id = v_gym
         and cs2.cancelled_at is null
         and cs2.id <> cs.id
         and cs2.starts_at = (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz)
       where cs.template_id = m.id
         and cs.starts_at > now()
         and cs.cancelled_at is null
         and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz) > now()
         and not exists (
           select 1 from public.schedule_template st
            where st.id = cs2.template_id
              and st.gym_id = v_gym and st.is_active
              and (case when p_all_days then st.group_id = v_group else st.id = p_template_id end)
         )
       order by cs2.starts_at
       limit 1;
      if v_choque is not null then
        -- The FIRST blocking instant, in the gym's own clock — an operator cannot clear a collision
        -- they cannot find on the calendar.
        raise exception 'No se puede mover el horario: ya hay una clase el % a las %',
          to_char(v_choque at time zone v_tz, 'DD/MM/YYYY'),
          to_char(v_choque at time zone v_tz, 'HH24:MI');
      end if;
    end if;

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

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. edit_class_session — a hand move may not land on an occupied instant.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Same signature as 20260806120100 → the EXECUTE grant carries. The body is that one with ONE guard
-- added, below the two temporal guards (HOLE 2 / HOLE 3) and above the UPDATE, so the refusal order
-- stays "cancelled → past → future-with-holds → occupied".
--
-- `id <> p_session_id` and `p_starts_at is distinct from v_starts` between them make a no-op save and
-- a same-instant field edit free: this function's most common call is "change the coach", which does
-- not move anything. On live, that is also what keeps both rows of an existing pair editable before
-- the pairs are cleaned.
--
-- This closes the other half of the reported ticket: the audit's mechanism #3 (a narrow edit detaches
-- the class, the operator dislikes the result and re-creates the slot) needs a landing site, and both
-- doors — create (§2) and move (here) — are now shut.
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
  v_ocupa     text;   -- the class already at the target instant, for the refusal sentence
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
  -- 2026-08-23 ruling: ONE class per gym per instant. Only when the instant actually changes, and
  -- never against itself. A cancelled occupant does not block — that instant is free.
  if p_starts_at is distinct from v_starts then
    select coalesce(nullif(cs.special_name, ''), ct.name) into v_ocupa
      from public.class_session cs
      join public.class_type ct on ct.id = cs.class_type_id
     where cs.gym_id = v_gym
       and cs.starts_at = p_starts_at
       and cs.cancelled_at is null
       and cs.id <> p_session_id
     order by cs.created_at, cs.id
     limit 1;
    if v_ocupa is not null then
      raise exception 'Ya existe una clase a esa hora: %', v_ocupa;
    end if;
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
