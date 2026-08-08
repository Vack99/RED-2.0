-- Backward clamp on materialization + schedule_template_week retention index (#260, half 1 of the
-- #259 batch for #247+#248 — docs/Context/2026-08-08-horizon-cron-spec.md).
--
-- WHY: #261 (the next migration in this batch) will start pruning schedule_template_week rows older
-- than ~2 weeks. Pruning is only safe if a pruned week can never be re-materialized — otherwise a
-- direct RPC call for a stale week would resurrect a cancelled/moved class exactly the way #243 slice 1
-- already refuses to for a hand-moved session. This migration closes that door FIRST, independent of
-- #261 landing: any authenticated caller (the app, or a hand-rolled RPC call) that asks the
-- materialization path for a week whose Monday is older than the gym-local current Monday gets a
-- silent no-op — 0, nothing written. Not an exception: the agenda's own view-time call
-- (packages/data/src/server/agenda.ts) already stopped asking for that window after #249, but the SQL
-- layer must not depend on the TS caller behaving — a read path that trips the clamp must not break.
--
-- WHERE: worked from the LATEST redefinition in the migration chain, not the first —
-- `materialize_week_for_gym(uuid, date)` was last redefined in 20260805100000_class_horizon_autoroll.sql
-- (20260806090000_series_edit_prework.sql's own header confirms it stayed byte-for-byte since then).
-- `ensure_week_materialized(date)` was ALSO last redefined there, as a thin wrapper that delegates to
-- materialize_week_for_gym under the caller's own staff_gym() — so the clamp lives in the ONE shared
-- core (the #136 "no 4th copy of the rule" precedent) and both entry points inherit it for free. This
-- migration therefore touches only materialize_week_for_gym; ensure_week_materialized is untouched
-- (nothing in its body needs to change) and keeps its own EXECUTE grants as-is.
--
-- Expand-only, idempotent: CREATE OR REPLACE at the EXISTING signature (grants carry over — no
-- re-grant), one CREATE INDEX IF NOT EXISTS. No RLS/policy change, no TypeScript change.

-- ── materialize_week_for_gym: same body, one new early-return ──────────────────────────────────
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

-- ── schedule_template_week (week_start) — the index #261's DELETE and this clamp's read pattern
-- both lean on. Added here (before either the clamp's current-Monday comparisons or the future
-- prune's cutoff scan is asked to do real work at fleet scale) rather than in #261, per the spec's
-- explicit ordering: "before the first prune runs".
create index if not exists schedule_template_week_week_start_idx
  on public.schedule_template_week (week_start);
