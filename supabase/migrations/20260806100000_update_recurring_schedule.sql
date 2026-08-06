-- #243 series-edit — SLICE 2: "esta y las siguientes". The everyday operator verb.
-- docs/Context/2026-08-06-243-series-edit-design.md §4/§5.2.
--
-- THE RULE, once: the class still happens, just at a different time — so THE BOOKING MOVES WITH IT.
-- `reservation.class_session_id` points at the ROW, not at the instant, so rewriting
-- `class_session.starts_at` carries every booking along for free: nobody is un-booked, nobody is
-- charged again, nobody is refunded. This RPC writes ZERO rows to `reservation` and ZERO to
-- `clientes`, and the suite asserts exactly that (status still `reservada`, `clases_restantes`
-- numerically unchanged) rather than trusting the absence of a statement.
--
-- SECURITY INVOKER + search_path='' (ADR-0005), gym derived from `staff_gym()` and never a parameter.
-- The guards below are copied verbatim from `create_recurring_schedule` (20260805110000:310-317) so
-- the two halves of one feature refuse in one vocabulary. `unnest(NULL::uuid[])` yields zero rows, so
-- the coach guard is naturally inert when no coach set is passed — no `is not null` wrapper needed.
--
-- ── THE SIGNATURE, and the one deviation from the design doc ──────────────────────────────────────
-- The doc writes `(p_template_id, p_class_type_id, p_weekday int default null, p_start_time,
-- p_duration_min, p_capacity, p_coach_ids uuid[] default null)`. Postgres refuses that outright: every
-- input parameter following one with a default must also have a default. So the two OPTIONAL
-- parameters are both at the tail and the required ones keep their relative order. PostgREST invokes
-- RPCs by NAMED argument (the JSON body's keys), so positional order is invisible to every caller.
--
-- ── WHAT IT WRITES ────────────────────────────────────────────────────────────────────────────────
--   1. schedule_template — the rule itself. Wrapped in `exception when unique_violation` raising the
--      IDENTICAL Spanish sentence create_recurring_schedule already raises (20260805110000:327-331),
--      because `schedule_template_active_uq` is the same index and "you already run that class then"
--      is the same fact whether the operator got there by creating or by editing. Two spellings of one
--      refusal is how an operator learns two rules that do not exist.
--   2. schedule_template_coach — ONLY when p_coach_ids is not null. The sheet's `editDraftFrom` seeds
--      coachIds from the CLICKED SESSION, so an unconditional replace would quietly write last week's
--      substitute coach onto the whole series. NULL means "leave the coaches alone"; an explicit empty
--      array still means "no coaches". This is the only write in the change that needs new DDL — an
--      RLS DELETE policy on the join table (below).
--   3. class_session, twice, and the pair is exhaustive by construction:
--      * THE MOVE — every future, non-cancelled session of this template whose RECOMPUTED instant is
--        also in the future. Past sessions and cancelled ones are never touched by either statement.
--      * THE DETACH — `template_id = null` on exactly the rows the move's guard excluded.
--
-- ── WHY THE PAST-INSTANT GUARD EXISTS (the kill shot the design doc's §4 names) ───────────────────
-- A series move recomputes each class's instant from its own ISO week. Moving 19:00 → 07:00 drags
-- TODAY's class into this morning — into the past, where BOTH release paths are permanently shut:
-- `cancel_class_session` (20260804150000:195) and `cancelar_reserva` (20260803140000:290) each raise
-- 'La clase ya comenzó'. Every hold on that class would be silently destroyed: unrefundable by the
-- gym, uncancellable by the member, and derived as a no-show on a class that never happened at that
-- hour. So a class that cannot legally move is DETACHED instead — it stays at the instant it already
-- had, stops belonging to the rule, and becomes an ordinary one-off. Same meaning `template_id = null`
-- carries after a hand edit (slice 1): "this dated class no longer belongs to the rule."
--
-- The two WHERE clauses are exact complements over the same row set (future + non-cancelled + still
-- attached), split on `recomputed > now()` vs `recomputed <= now()`, so no such row can be missed by
-- both or claimed by both. The DETACH is written second, per the design, and is order-independent by
-- construction: a row the move already relocated now sits AT its recomputed instant, which is > now(),
-- so it can never match the detach predicate afterwards.
--
-- ── WHY A WEEKDAY MOVE NEVER CROSSES A WEEK ──────────────────────────────────────────────────────
-- `date_trunc('week', …)` anchors on the session's OWN ISO Monday and `schedule_template.weekday` is
-- CHECKed to 0..5 (Lun..Sáb, 20260706120000:40) — Sunday is structurally unrepresentable. Every
-- weekday therefore lands inside the week it started in, so a move can neither collide with the
-- neighbouring week's instance nor step over a `schedule_template_week` ledger claim. That is also
-- what makes the recomputation IDEMPOTENT, which the detach predicate above relies on.

-- ── DDL: the one new object in the whole change ───────────────────────────────────────────────────
-- Staff DELETE on schedule_template_coach. The named present need is the coach-set replace above,
-- exactly mirroring the class_session_coach staff-delete policy 20260706120000:132-137 added for
-- edit_class_session's own delete-then-insert, and with the identical `is_staff_of(gym_id)` predicate
-- in the same `(select …)` initplan idiom (ADR-0001/ADR-0013 §2). No PARENT table gains a delete
-- policy: a template is retired via is_active, never deleted.
drop policy if exists "schedule_template_coach_staff_delete" on public.schedule_template_coach;
create policy "schedule_template_coach_staff_delete" on public.schedule_template_coach for delete to authenticated
  using ((select public.is_staff_of(gym_id)));

create or replace function public.update_recurring_schedule(
  p_template_id uuid,
  p_class_type_id uuid,
  p_start_time time,
  p_duration_min int,
  p_capacity int,
  p_weekday int default null,
  p_coach_ids uuid[] default null
)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym     uuid := public.staff_gym();
  v_weekday int;
  v_tz      text;
  v_moved   int := 0;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  -- The template, read BEFORE the write for two reasons that both matter: `coalesce(p_weekday, …)`
  -- needs the current weekday to resolve an omitted move, and the unique_violation handler below
  -- needs that resolved value to NAME the colliding day — a RETURNING clause cannot supply it,
  -- because on the collision path the UPDATE returned nothing.
  --
  -- `gym_id = v_gym` is defense-in-depth, not redundancy. RLS's schedule_template SELECT policy is
  -- `is_member_of(gym_id)`, which is WIDER than staff: a multi-gym actor who is staff of gym B and a
  -- plain MEMBER of gym A can read gym A's template row. Without this pin they would fall through to
  -- an UPDATE that RLS silently filters to zero rows and a fan-out that touches nothing — a refusal
  -- disguised as "0 clases movidas". The pin turns it into the 'Horario no encontrado' it is.
  select weekday into v_weekday from public.schedule_template
   where id = p_template_id and gym_id = v_gym;
  if not found then raise exception 'Horario no encontrado'; end if;
  v_weekday := coalesce(p_weekday, v_weekday);

  begin
    update public.schedule_template
       set class_type_id = p_class_type_id,
           weekday       = v_weekday,
           start_time    = p_start_time,
           duration_min  = p_duration_min,
           capacity      = p_capacity
     where id = p_template_id and gym_id = v_gym;
  exception when unique_violation then
    raise exception 'Ya existe un horario activo para esta clase el % a las %',
      (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[v_weekday + 1],
      to_char(p_start_time, 'HH24:MI');
  end;

  -- The default coach set is REPLACED only when the caller actually names one (see the header).
  if p_coach_ids is not null then
    delete from public.schedule_template_coach where template_id = p_template_id;
    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, p_template_id, cid from unnest(p_coach_ids) as cid;
  end if;

  -- Server-authoritative gym clock, never a client parameter (ADR-0010 §k: a wall-clock time is
  -- uninterpretable without the gym's zone).
  select timezone into v_tz from public.gym where id = v_gym;

  -- THE MOVE. One statement over the series' own index (`class_session_template_starts_uq` answers
  -- `template_id = ? and starts_at > now()` with BOTH columns in Index Cond — measured 1.39 ms at
  -- rows=5). `cs.starts_at` on the right-hand side reads the OLD value, so each row is re-anchored on
  -- its own ISO week. The trailing `> now()` is the past-instant guard.
  update public.class_session cs
     set class_type_id = p_class_type_id,
         starts_at     = ((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_weekday) + p_start_time) at time zone v_tz,
         duration_min  = p_duration_min,
         capacity      = p_capacity
   where cs.template_id = p_template_id
     and cs.starts_at > now()
     and cs.cancelled_at is null
     and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_weekday) + p_start_time) at time zone v_tz) > now();
  get diagnostics v_moved = row_count;

  -- THE DETACH — the exact complement of the guard above. These are the future, still-held classes
  -- whose new instant would have landed in the past; they keep the time they already had and stop
  -- belonging to the rule.
  update public.class_session cs
     set template_id = null
   where cs.template_id = p_template_id
     and cs.starts_at > now()
     and cs.cancelled_at is null
     and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_weekday) + p_start_time) at time zone v_tz) <= now();

  return v_moved;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005): revoke the public default + anon, grant authenticated only ───────
revoke execute on function public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[]) from public, anon;
grant  execute on function public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[]) to authenticated;
