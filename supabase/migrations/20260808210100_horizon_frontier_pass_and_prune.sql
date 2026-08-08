-- Frontier catch-up pass + template-week ledger prune (#261, half 2 of the #259 batch for #247+#248 —
-- docs/Context/2026-08-08-horizon-cron-spec.md). Depends on 20260808210000's backward clamp: that is
-- what makes the DELETE below safe (a pruned week can never be re-materialized through the clamped
-- RPCs, so deleting it cannot resurrect anything).
--
-- WHAT CHANGES: cron_materialize_horizon() ONLY — same signature, SECURITY DEFINER, search_path='',
-- same per-gym BEGIN…EXCEPTION isolation, same cron_run_log summary write, same jobname
-- ('roll-class-horizon'), EXECUTE still revoked from public/anon/authenticated (re-stated below —
-- CREATE OR REPLACE preserves ACLs, but the original migration was explicit about the revoke and this
-- one stays explicit too). materialize_week_for_gym and ensure_week_materialized are NOT touched here.
--
-- 1. FRONTIER CATCH-UP: the inner loop stops iterating a fixed 0..5. Per gym it computes the ledger
--    frontier — min() over that gym's ACTIVE templates of each template's own max(week_start) — then
--    claims weeks from greatest(frontier + 7d, this-gym's-local-Monday) through Monday+35d, one
--    materialize_week_for_gym call per week. min(), not max(): the #136 per-gym subtransaction keeps
--    every template in lockstep (a gym's pass is all-or-nothing), so the LEAST-advanced template is the
--    one still owed weeks, and the aggregate is correct even when it is the only one behind. A gym with
--    NO ledger rows at all (never materialized) makes every per-template max() NULL, which makes the
--    overall min() NULL, which makes frontier+7 NULL — and greatest() ignores NULL arguments, so
--    v_claim_start falls through to this week's Monday and the gym gets the full 6-week horizon, same
--    as the fixed 0..5 loop gave every gym before this migration. Floored at the gym-local Monday (not
--    behind it) rather than relying on the #260 clamp to no-op a stale ask — the clamp is defense in
--    depth for OTHER callers, not something this pass should lean on for its own correctness.
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
  v_gyms          int := 0;
  v_claims        int := 0;
  v_created       int := 0;
  v_errors        int := 0;
  v_pruned        int := 0;
  v_notes         text[] := '{}';
  v_summary       text;
  v_monday        date;
  v_frontier      date;
  v_claim_start   date;
  v_week          date;
  v_prune_cutoff  date;
  g               record;
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
    begin
      -- The gym's OWN local Monday: "this week" in Chihuahua is not "this week" in Cancún, and the
      -- job fires at one absolute instant for all of them.
      v_monday := (now() at time zone g.timezone)::date;
      v_monday := v_monday - ((extract(isodow from v_monday)::int - 1));

      -- Frontier: one indexed aggregate per gym. Per active template, its own max(week_start) in the
      -- ledger (NULL if that template has never been materialized); then the MIN across templates —
      -- the least-advanced one is what bounds the whole gym's catch-up.
      select min(w) into v_frontier
      from (
        select max(stw.week_start) as w
        from public.schedule_template st
        left join public.schedule_template_week stw
          on stw.gym_id = st.gym_id and stw.template_id = st.id
        where st.gym_id = g.id and st.is_active
        group by st.id
      ) per_template;

      v_claim_start := greatest(v_frontier + 7, v_monday);

      v_week := v_claim_start;
      while v_week <= v_monday + 35 loop
        v_claims := v_claims + 1;
        v_created := v_created + public.materialize_week_for_gym(g.id, v_week);
        v_week := v_week + 7;
      end loop;
    exception when others then
      v_errors := v_errors + 1;
      v_notes := v_notes || (g.id::text || ': ' || sqlerrm);
    end;
  end loop;

  -- Ledger prune: set-based, outside every per-gym subtransaction, cutoff computed once for the run.
  v_prune_cutoff := (now() at time zone 'UTC')::date;
  v_prune_cutoff := v_prune_cutoff - ((extract(isodow from v_prune_cutoff)::int - 1)) - 14;
  delete from public.schedule_template_week where week_start < v_prune_cutoff;
  get diagnostics v_pruned = row_count;

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

-- The fleet pass stays postgres-only: cron runs it, ops can run it by hand, nobody else can reach it.
-- Re-stated explicitly (CREATE OR REPLACE preserves the ACL from 20260805100000; this line just keeps
-- that fact visible in the file that actually changed the body).
revoke execute on function public.cron_materialize_horizon() from public, anon, authenticated;
