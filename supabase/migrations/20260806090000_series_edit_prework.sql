-- #243 series-edit — SLICE 1: safety pre-work. No feature lands here. One shipped function gains one
-- line in its SET list, and one backfill runs exactly once, so that slices 2 and 3
-- (update_recurring_schedule / retire_recurring_schedule) cannot be built on sand.
-- docs/Context/2026-08-06-243-series-edit-design.md §5.1.
--
-- ── NO ADVISORY LOCK LANDS ANYWHERE IN THIS FEATURE (owner ruling) ───────────────────────────────
-- An earlier revision of this file also CREATE OR REPLACE'd `materialize_week_for_gym` to take a
-- SHARED per-gym advisory lock, with slice 3 taking the EXCLUSIVE half, to close the
-- retire-vs-materialize race. The pair was CUT. The shared half would be held once per gym for the
-- ENTIRE Monday fleet pass — `cron_materialize_horizon` (20260805100000:184-206) walks every gym in
-- ONE transaction, so nothing releases until the last gym is done — and Postgres offers
-- `max_locks_per_transaction=64 × max_connections=60 ≈ 3,840` total lock slots. It binds at ~3,800
-- gyms: it would lower the 4000-gym ceiling to protect a button an operator presses a few times a
-- year. `materialize_week_for_gym` therefore stays BYTE-FOR-BYTE at its shipped 20260805100000 body —
-- this migration does not touch it at all. The race that leaves open, and the one trigger to revisit
-- it, are stated in 20260806100000's and 20260806100100's own headers.

-- ── 1. edit_class_session: a hand-moved session LEAVES the rule (template_id = null) ──────────────
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
-- the series can never reach it again. After this change `template_id = null` carries exactly ONE
-- writer-meaning — A HAND-EDITED ONE-OFF — and nothing else in the feature ever writes it. In
-- particular slice 2's past-instant guard does NOT detach: a class it cannot legally move is left
-- attached and byte-identical (20260806100000), precisely so "terminar el horario" still reaches it.
-- One writer, one meaning, one thing a reader has to know.
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

-- ── 2. BACKFILL: detach every already-attached session that is OFF its template's grid ────────────
-- One statement, run once, and it can never need to run again. These rows exist because until §1
-- above, `edit_class_session` deliberately PRESERVED template_id on a hand move (20260706120100:208,
-- "template_id is NOT touched") — so every holiday move an operator has ever made left a session
-- sitting at an instant its template does not describe while still pointing at that template. Harmless
-- for as long as nothing dereferenced the pointer. Not harmless the moment slice 2 lands, for two
-- independent reasons:
--
--   (a) THE STOMP, RETROACTIVELY. The first `update_recurring_schedule` on that template recomputes
--       every attached session's instant from its own ISO week and drags the hand-moved class back
--       onto the grid it was deliberately taken off — the exact outcome §1 exists to prevent, applied
--       to every move made BEFORE §1 shipped. §1 fixes the future; only this fixes the past.
--   (b) THE RAW 23505. Two attached rows in the SAME ISO week both recompute to the SAME instant and
--       collide on `class_session_template_starts_uq` (20260706120000:71). That surfaces as
--       PostgREST's raw constraint-violation text, not the friendly Spanish refusal — and it is not
--       self-healing: EVERY future series edit on that template fails identically until someone
--       hand-detaches a row in SQL. A gym that once moved a Tuesday class into another Tuesday's week
--       has already minted that state.
--
-- HOW "OFF THE GRID" IS DECIDED: by the materializer's OWN instant computation (20260805100000:81 —
-- `((v_monday + t.weekday) + t.start_time) at time zone tz`), re-anchored on each SESSION's own local
-- week instead of the pass's Monday. A row is therefore left alone exactly when the arithmetic that
-- put on-grid rows there still reproduces its instant — the same rule, not a second opinion about it.
--
-- That comparison is against HISTORY, not against a moved goalpost, because `schedule_template` was
-- IMMUTABLE before #243: no RPC and no UI ever updated it (`create_recurring_schedule` only inserts,
-- 20260805110000:324-326; #243's update RPC lands in the later-timestamped 20260806100000). The
-- template's CURRENT weekday/start_time IS the pattern every attached row was materialized from.
--
-- AND WHY IT IS COMPLETE: this runs before any series move can ever have executed, so at backfill time
-- "off the grid" ⇔ "hand-moved", with no third cause. After it, plus §1 going forward, TWO ATTACHED
-- ROWS IN ONE ISO WEEK IS UNREACHABLE — which is why slice 2's fan-out carries no unique_violation
-- handler: the collision it would catch cannot occur.
--
-- What it costs: provenance on those rows, which nothing reads (`agenda.ts:105` does not select the
-- column) — the same price §1 charges going forward, paid once for the past. Past and cancelled rows
-- are swept too: neither verb touches them, so detaching them is free, and leaving them attached would
-- be one more state a reader has to reason about.
update public.class_session cs
   set template_id = null
  from public.schedule_template t
  join public.gym g on g.id = t.gym_id
 where t.id = cs.template_id
   and cs.starts_at is distinct from
       (((date_trunc('week', (cs.starts_at at time zone g.timezone))::date + t.weekday) + t.start_time) at time zone g.timezone);
