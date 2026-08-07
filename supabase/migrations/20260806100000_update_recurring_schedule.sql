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
-- ── WHAT IT RETURNS: (moved, kept), not a bare count ──────────────────────────────────────────────
-- An earlier revision returned a single int, and it could not tell the sheet the one thing an operator
-- must know after a move: that a class was LEFT WHERE IT WAS. `moved` is what the fan-out rewrote;
-- `kept` is what the past-instant guard refused to rewrite and left attached, untouched. `kept` is
-- structurally 0 or 1 — only the CURRENT ISO week's class can recompute into the past, since every
-- other attached row's week has not started yet and a weekday move never leaves its own week (see
-- below) — so the receipt can say "1 clase se quedó en su horario" without pluralizing a statistic.
--
-- OUT parameters, not a composite type: the IN-parameter list is untouched, so the revoke/grant lines
-- at the bottom still name the same signature, and PostgREST returns one JSON object
-- `{"moved": N, "kept": M}`.
--
-- The DROP below is not decoration. `create or replace function` REFUSES to change a function's return
-- type (42P13), and an earlier revision of THIS FILE shipped `returns int` to the scratch project the
-- pre-merge `test:denial` gate runs against. Without the drop, re-applying the migration set to any
-- database that already carries that revision dies here and takes the rest of the file with it. Live
-- has never seen either revision, so on live the drop is a no-op; the grants are re-issued at the
-- bottom of this file regardless.
drop function if exists public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[]);

-- ── WHAT IT WRITES ────────────────────────────────────────────────────────────────────────────────
--   1. schedule_template — the rule itself. Wrapped in `exception when unique_violation` raising the
--      IDENTICAL Spanish sentence create_recurring_schedule already raises (20260805110000:327-331),
--      because `schedule_template_active_uq` is the same index and "you already run that class then"
--      is the same fact whether the operator got there by creating or by editing. Two spellings of one
--      refusal is how an operator learns two rules that do not exist.
--   2. class_session — ONE statement, THE MOVE: every future, non-cancelled, still-attached session of
--      this template whose RECOMPUTED instant is also in the future. Past sessions, cancelled ones and
--      the classes the guard below refuses are written by NO statement in this function.
--   3. schedule_template_coach AND class_session_coach — ONLY when p_coach_ids is not null, and on the
--      dated side only for the rows the MOVE just returned. See the coach section. This is the only
--      write in the change that needs new DDL: an RLS DELETE policy on the template join table.
--
-- ── THE PAST-INSTANT GUARD, AND WHY IT SKIPS RATHER THAN DETACHES ─────────────────────────────────
-- A series move recomputes each class's instant from its own ISO week. Moving 19:00 → 07:00 drags
-- TODAY's class into this morning — into the past, where BOTH release paths are permanently shut:
-- `cancel_class_session` (20260804150000:195) and `cancelar_reserva` (20260803140000:290) each raise
-- 'La clase ya comenzó'. Every hold on that class would be silently destroyed: unrefundable by the
-- gym, uncancellable by the member, and derived as a no-show on a class that never happened at that
-- hour. So a class that cannot legally move IS NOT MOVED — and that is the whole of it. The row is
-- left BYTE-IDENTICAL: old instant, old class_type, old duration, old capacity, old coaches, STILL
-- ATTACHED. It is reported as `kept`.
--
-- An earlier revision DETACHED it (`template_id = null`) instead. That was the defect, probed on live:
-- a detached class SURVIVES "Terminar el horario" — retire's loop is `where template_id = ?`
-- (20260806100100:72-75), so it never sees the row — and goes on taking bookings for a schedule the
-- operator was told, in the confirm dialog, had been cancelled in full. One live orphan per retire,
-- mintable with the operator's own two clicks.
--
-- Skipping closes it from both ends at once:
--   * "Terminar el horario" becomes EXHAUSTIVE over everything still attached. Nothing this verb
--     touched can hide from that one.
--   * `template_id = null` keeps exactly ONE writer-meaning across the whole feature: a hand-edited
--     one-off (20260806090000 §1). One writer, one meaning.
-- And the NEXT move still reaches a kept row — it is attached, so once its week is behind us the
-- fan-out re-anchors it like any other member of the series. A skip is a deferral, not an exile.
--
-- ── WHY A WEEKDAY MOVE NEVER CROSSES A WEEK ───────────────────────────────────────────────────────
-- `date_trunc('week', …)` anchors on the session's OWN ISO Monday and `schedule_template.weekday` is
-- CHECKed to 0..5 (Lun..Sáb, 20260706120000:40) — Sunday is structurally unrepresentable. Every
-- weekday therefore lands inside the week it started in, so a move can neither collide with the
-- neighbouring week's instance nor step over a `schedule_template_week` ledger claim — and `kept` can
-- only ever count the current week's class.
--
-- NO unique_violation HANDLER ON THE FAN-OUT, deliberately. `class_session_template_starts_uq`
-- (20260706120000:71) would fire if two ATTACHED rows of one template shared an ISO week, because both
-- recompute to the same instant. They cannot: the materializer writes at most one row per template per
-- week (the immutable `schedule_template_week` claim, 20260706130000:22-28), a hand edit detaches
-- (20260806090000 §1), and the rows a pre-#243 hand edit left attached off-grid were swept by that
-- migration's backfill. The state is unreachable; there is nothing to handle.
--
-- ── COACHES: BOTH TABLES, OR THE RECEIPT LIES ─────────────────────────────────────────────────────
-- `p_coach_ids IS NULL` means "leave the coaches alone". The sheet's `editDraftFrom` seeds coachIds
-- from the CLICKED SESSION, so an unconditional replace would quietly write last week's substitute
-- coach onto the whole series. An explicit empty array still means "no coaches".
--
-- When a set IS named it is replaced in TWO tables. An earlier revision wrote only
-- `schedule_template_coach` — the RULE's default, which decides the coaches of weeks not yet
-- materialized. But the agenda reads the DATED join (`packages/data/src/server/agenda.ts:131`), so
-- every card the operator had just been told was moved still showed the OLD coach, for exactly the
-- weeks they can see. The dated rows carry their own coach set (the materializer copies the
-- template's, 20260805100000:90-92) and nothing re-derives it, so writing one table without the other
-- is a coach change that is true in the rule and false on the calendar.
--
-- Replaced on EXACTLY `v_ids`, the ids the MOVE returned: a kept row keeps its coaches too, because
-- the whole rule for a kept row is "byte-identical", and past/cancelled rows are never in v_ids at
-- all. That dependency is why the coach block runs AFTER the fan-out in the body below, where an
-- earlier revision ran it before.
--
-- RLS: the staff DELETE policy on class_session_coach already shipped (20260706120000:135-137, added
-- for edit_class_session's own delete-then-insert), so SECURITY INVOKER needs nothing new there. The
-- TEMPLATE join table had no delete policy — that is the one new object below.
--
-- ── NO LOCK, AND THE RACE IT ACCEPTS (owner ruling) ───────────────────────────────────────────────
-- This function takes no advisory lock, and `materialize_week_for_gym` takes none either. The pair was
-- drafted and CUT: the shared half would have been held once per gym for the whole of the Monday
-- cron's fleet pass, and Postgres offers ~3,840 total lock slots (max_locks_per_transaction=64 ×
-- max_connections=60), so it binds at ~3,800 gyms — it would lower the 4000-gym ceiling to protect a
-- button pressed a few times a year.
--
-- The race, stated honestly rather than papered over: a materialization pass that read this template
-- BEFORE this UPDATE committed can stamp one class at the OLD slot into a week it then claims. The
-- result is a single stray class, visible on the calendar and cancellable with the shipped
-- single-class cancel. The trigger to add locking is an actual report of one.

-- ── DDL: the one new object in the whole change ───────────────────────────────────────────────────
-- Staff DELETE on schedule_template_coach. The named present need is the coach-set replace above,
-- exactly mirroring the class_session_coach staff-delete policy 20260706120000:135-137 added for
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
  p_coach_ids uuid[] default null,
  out moved int,
  out kept int
)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym     uuid := public.staff_gym();
  v_weekday int;
  v_tz      text;
  v_ids     uuid[];
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  -- The template, read BEFORE the write for three reasons that all matter: `coalesce(p_weekday, …)`
  -- needs the current weekday to resolve an omitted move; the unique_violation handler below needs
  -- that resolved value to NAME the colliding day (a RETURNING clause cannot supply it, because on the
  -- collision path the UPDATE returned nothing); and this is where a RETIRED template is refused.
  --
  -- `and is_active` is a gate, not a filter. Without it this RPC cheerfully rewrites a retired
  -- template and REPORTS SUCCESS: the fan-out then finds nothing (retire already cancelled every
  -- future class, 20260806100100:72-79) and the operator is told "0 clases movidas" about a schedule
  -- that no longer exists and will never materialize again. The sentence is retire's own, deliberately
  -- — "that rule is not there any more" is ONE fact and must not have two spellings.
  --
  -- `gym_id = v_gym` is defense-in-depth, not redundancy. RLS's schedule_template SELECT policy is
  -- `is_member_of(gym_id)`, which is WIDER than staff: a multi-gym actor who is staff of gym B and a
  -- plain MEMBER of gym A can read gym A's template row. Without this pin they would fall through to
  -- an UPDATE that RLS silently filters to zero rows and a fan-out that touches nothing — a refusal
  -- disguised as "0 clases movidas". The pin turns it into the refusal it is.
  select weekday into v_weekday from public.schedule_template
   where id = p_template_id and gym_id = v_gym and is_active;
  if not found then raise exception 'Horario no encontrado o ya retirado'; end if;
  v_weekday := coalesce(p_weekday, v_weekday);

  begin
    -- `and is_active` AGAIN, and not out of caution: READ COMMITTED re-evaluates the predicate under
    -- the row lock, so a retire that commits between the pin above and this write turns the UPDATE
    -- into zero rows and the raise below — not a success receipt for a rule that no longer exists.
    update public.schedule_template
       set class_type_id = p_class_type_id,
           weekday       = v_weekday,
           start_time    = p_start_time,
           duration_min  = p_duration_min,
           capacity      = p_capacity
     where id = p_template_id and gym_id = v_gym and is_active;
    if not found then raise exception 'Horario no encontrado o ya retirado'; end if;
  exception when unique_violation then
    raise exception 'Ya existe un horario activo para esta clase el % a las %',
      (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[v_weekday + 1],
      to_char(p_start_time, 'HH24:MI');
  end;

  -- Server-authoritative gym clock, never a client parameter (ADR-0010 §k: a wall-clock time is
  -- uninterpretable without the gym's zone).
  select timezone into v_tz from public.gym where id = v_gym;

  -- THE MOVE. One statement over the series' own index (`class_session_template_starts_uq` answers
  -- `template_id = ? and starts_at > now()` with BOTH columns in Index Cond — measured 1.39 ms at
  -- rows=5). `cs.starts_at` on the right-hand side reads the OLD value, so each row is re-anchored on
  -- its own ISO week. The trailing `> now()` is the past-instant guard; a row it excludes is written
  -- by no statement in this function. RETURNING feeds v_ids, which is what the coach replace below
  -- fans out over — the movers, and only the movers.
  with moved as (
    update public.class_session cs
       set class_type_id = p_class_type_id,
           starts_at     = ((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_weekday) + p_start_time) at time zone v_tz,
           duration_min  = p_duration_min,
           capacity      = p_capacity
     where cs.template_id = p_template_id
       and cs.starts_at > now()
       and cs.cancelled_at is null
       and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_weekday) + p_start_time) at time zone v_tz) > now()
    returning cs.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  moved := coalesce(array_length(v_ids, 1), 0);

  -- `kept` — the future, non-cancelled, STILL-ATTACHED rows this call chose not to rewrite. Counted
  -- after the fact instead of tracked, because a moved row is still attached and still future, so the
  -- whole population minus the movers IS the skipped set. Structurally 0 or 1 (see the weekday
  -- section above), which is what lets the sheet say it in one sentence.
  select count(*)::int - moved into kept
    from public.class_session
   where template_id = p_template_id and starts_at > now() and cancelled_at is null;

  -- The coach set is REPLACED only when the caller actually names one (see the header), and then in
  -- BOTH tables: the rule's default, and the dated rows the agenda actually reads. AFTER the fan-out,
  -- because v_ids is what decides which dated rows are in scope.
  if p_coach_ids is not null then
    delete from public.schedule_template_coach where template_id = p_template_id;
    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, p_template_id, cid from unnest(p_coach_ids) as cid;

    delete from public.class_session_coach where session_id = any(v_ids);
    insert into public.class_session_coach (gym_id, session_id, coach_id)
    select v_gym, sid, cid from unnest(v_ids) sid, unnest(p_coach_ids) cid;
  end if;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005): revoke the public default + anon, grant authenticated only ───────
revoke execute on function public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[]) from public, anon;
grant  execute on function public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[]) to authenticated;
