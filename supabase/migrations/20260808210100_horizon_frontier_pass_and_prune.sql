-- Frontier catch-up pass + template-week ledger prune (#261, half 2 of the #259 batch for #247+#248 —
-- docs/Context/2026-08-08-horizon-cron-spec.md). Depends on 20260808210000's backward clamp: that is
-- what makes the DELETE below safe (a pruned week can never be re-materialized through the clamped
-- RPCs, so deleting it cannot resurrect anything).
--
-- WHAT CHANGES: cron_materialize_horizon() ONLY — same signature, SECURITY DEFINER, search_path='',
-- same per-gym BEGIN…EXCEPTION isolation, same cron_run_log summary write, same jobname
-- ('roll-class-horizon'), EXECUTE stays revoked from public/anon/authenticated (CREATE OR REPLACE
-- preserves the ACL from 20260805100000 — not re-stated here; see 20260806130000 for the convention).
-- materialize_week_for_gym and ensure_week_materialized are NOT touched here.
--
-- 1. FRONTIER CATCH-UP: the inner loop no longer derives a per-gym frontier from a min()/max() ledger
--    aggregate — it walks the FIXED window (this-gym's-local-Monday through Monday+35d, one week at a
--    time) and claims exactly the weeks that are missing a ledger row for SOME active template. A
--    frontier aggregate looked sufficient but is not: the view-time entry point
--    (packages/data/src/server/agenda.ts's ensureSemanaMaterializada, weeks strictly past index 5 and
--    up to +26) can ask materialize_week_for_gym for ONE far week on an ordinary page browse — and
--    materialize_week_for_gym claims a ledger row for EVERY active template of that gym at that single
--    far week, not just the week the browse cared about. That one far claim drags every template's own
--    max(week_start) forward, which drags a min()-across-templates frontier forward with it — so the
--    cron would believe weeks it had never actually materialized were already covered and skip them,
--    turning holes in the window into PERMANENT holes once the #260 backward clamp locks them out of
--    ever being claimed again. Checking each week's own ledger state directly (not an aggregate derived
--    from it) closes that gap, and as a side effect also fixes the old min()-skips-NULL case: a
--    template that was NEVER materialized, hiding behind an already-materialized sibling in the same
--    gym, no longer escapes the min().
-- 2. LEDGER PRUNE: after the whole gym loop, OUTSIDE every per-gym subtransaction (the ledger is one
--    global table; the cutoff is one instant for the whole run, not per gym), one set-based DELETE of
--    schedule_template_week rows with week_start < (UTC-based current Monday − 14 days), computed once.
--    UTC, not each gym's own local Monday: the #260 clamp boundary IS each gym's own local Monday, and
--    the 14-day margin between that boundary and this cutoff is exactly what absorbs the few hours of
--    skew a UTC-anchored cutoff introduces against gym-local time — exact per-gym tz precision here is
--    deliberately not required (spec, "Implementation Decisions").
-- 3. SUMMARY: gains claims= (weeks actually claimed this run — the number that used to be a fixed
--    6×gyms and is now the redundancy-free count) and pruned= (ledger rows deleted). Placed BEFORE
--    errors=%s so the existing `like '%errors=N [...]%'` / `like '%created=0%'` substring checks in the
--    suite below keep matching unchanged.
--
-- Expand-only, idempotent: CREATE OR REPLACE at the existing signature. No RLS/policy change, no
-- TypeScript change, no new function surface, no new cron job.

create or replace function public.cron_materialize_horizon()
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_gyms            int := 0;
  v_claims          int := 0;
  v_created         int := 0;
  v_errors          int := 0;
  v_pruned          int := 0;
  v_notes           text[] := '{}';
  v_summary         text;
  v_monday          date;
  v_claims_before   int;
  v_created_before  int;
  v_week            date;
  v_prune_cutoff    date;
  g                 record;
begin
  for g in
    select gy.id, gy.timezone
    from public.gym gy
    where exists (
      select 1 from public.schedule_template st where st.gym_id = gy.id and st.is_active
    )
    order by gy.id
  loop
    v_gyms := v_gyms + 1;
    -- Snapshot the run-wide counters before this gym's work: if the EXCEPTION below fires, plpgsql
    -- locals survive the subtransaction rollback, so without this the claims=/created= totals in the
    -- summary would still count a claim this gym's own rollback undid (#7).
    v_claims_before := v_claims;
    v_created_before := v_created;
    begin
      -- The gym's OWN local Monday: "this week" in Chihuahua is not "this week" in Cancún, and the
      -- job fires at one absolute instant for all of them.
      v_monday := (now() at time zone g.timezone)::date;
      v_monday := v_monday - ((extract(isodow from v_monday)::int - 1));

      -- Claim-what's-missing: walk the fixed 0..5 week window and claim only the weeks that are
      -- actually missing a ledger row for SOME active template of this gym (see header §1 — a min()/
      -- max() frontier aggregate can be fooled by a view-time far-week claim into skipping real gaps).
      -- Plain integer generate_series + date arithmetic (the same idiom the suite's own fixture already
      -- uses for gym D's seed) rather than generate_series(date, date, step): Postgres has no
      -- generate_series(date, date, integer) overload, and generate_series(date, date, interval) would
      -- resolve to the timestamptz overload (date's preferred datetime cast), making the walk depend on
      -- the session's TimeZone GUC for no reason — this stays plain integer offsets, no timezone
      -- involved at all.
      for o in 0..5 loop
        v_week := v_monday + (o * 7);
        if exists (
          select 1 from public.schedule_template st
          where st.gym_id = g.id and st.is_active
            and not exists (
              select 1 from public.schedule_template_week stw
              where stw.template_id = st.id and stw.week_start = v_week
            )
        ) then
          v_claims := v_claims + 1;
          v_created := v_created + public.materialize_week_for_gym(g.id, v_week);
        end if;
      end loop;
    exception when others then
      v_errors := v_errors + 1;
      v_notes := v_notes || (g.id::text || ': ' || sqlerrm);
      v_claims := v_claims_before;
      v_created := v_created_before;
    end;
  end loop;

  -- Ledger prune: set-based, outside every per-gym subtransaction, cutoff computed once for the run.
  -- Its own BEGIN…EXCEPTION so a prune failure can't roll back every gym's materialization above, or
  -- the cron_run_log row below — it is recorded as a note and an error count instead (#3).
  v_prune_cutoff := (now() at time zone 'UTC')::date;
  v_prune_cutoff := v_prune_cutoff - ((extract(isodow from v_prune_cutoff)::int - 1)) - 14;
  begin
    delete from public.schedule_template_week where week_start < v_prune_cutoff;
    get diagnostics v_pruned = row_count;
  exception when others then
    v_errors := v_errors + 1;
    v_notes := v_notes || ('prune: ' || sqlerrm);
  end;

  v_summary := format('gyms=%s claims=%s created=%s pruned=%s errors=%s%s',
    v_gyms, v_claims, v_created, v_pruned, v_errors,
    case when v_errors = 0 then '' else ' [' || array_to_string(v_notes, '; ') || ']' end);

  -- Persist it INSIDE the run, deliberately outside every per-gym subtransaction, so the row always
  -- describes the whole pass (unchanged from 20260805100000 — see that file's §3 for why the return
  -- value alone is not enough: pg_cron records only the command tag, never the value).
  insert into public.cron_run_log (job, summary) values ('roll-class-horizon', v_summary);

  return v_summary;
end;
$function$;
