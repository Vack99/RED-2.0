-- Weekly class-horizon auto-roll (#136) — pg_cron, 6-week horizon, per-gym failure isolation.
--
-- OWNER RULING (2026-08-04, docs/Context/2026-08-04-136-recurrence-cross-examination.md): weekly
-- cron, overriding that report's piggyback recommendation. The declaration principle governs — a gym
-- that stated "repeats every Tuesday" gets Tuesdays unconditionally, and coupling that promise to
-- staff app usage is a hidden dependency no measured-demand argument cures at 4000 unknown gyms. The
-- cron ships WITH the report's hardening list, which is what most of this file is:
--   #1 per-gym failure isolation   — a subtransaction per gym; one bad gym never blocks the rest
--   #2 no 4th copy of the rule     — the materialization body MOVES into one shared core
--   #3 timezone guard              — `gym.timezone` is unvalidated text; a typo now costs ONE gym
--   #4 observability               — a per-run summary row in public.cron_run_log + a health view
--   #5 denial coverage             — supabase/tests/class_horizon_autoroll.sql
--   #6 horizon = 6 weeks           — ruled; matches create_recurring_schedule's existing default
--
-- WHAT LANDS
--   1. public.materialize_week_for_gym(uuid, date) -> int  NEW, SECURITY INVOKER. The materialization
--      rule, parameterized by gym. Its body is ensure_week_materialized's body from
--      20260706130000 with `v_gym` replaced by the parameter — a MOVE, not a copy (#2). Diff the
--      two files: nothing else changed.
--   2. public.ensure_week_materialized(date) -> int        CREATE OR REPLACE. Same signature, same
--      SECURITY INVOKER posture, same single `No autorizado` raise, same staff_gym() gating — now a
--      thin wrapper that delegates to the core. Behavior for staff callers is byte-identical, and
--      the EXECUTE grants carry (additive-redefinition precedent of 20260702233000 / 20260706130000).
--   3. public.cron_run_log                                 NEW table, ops-only. Where each run's
--      summary actually lands — pg_cron throws the return value away (measured; see §4).
--   4. public.cron_materialize_horizon() -> text           NEW, SECURITY DEFINER. The fleet pass.
--   5. pg_cron + the idempotent weekly job `roll-class-horizon`.
--   6. public.gym_horizon_depth                            NEW view — the "did the cron die" check.
--
-- Expand-only: one new ops-only table and one view, both additive. No column and no policy of
-- anything that already existed changes; class_session/schedule_template_week keep every rule
-- they had.

-- ── 1. materialize_week_for_gym: the ONE materialization rule, parameterized by gym ────────────
-- SECURITY INVOKER (ADR-0005), search_path='' — so RLS still decides. Called two ways:
--   • as `authenticated`: RLS scopes every read and every write, so no caller can materialize into a
--     gym they are not staff of. Which RLS rule stops them depends on who they are, and BOTH ends
--     matter — the read alone is not the fence:
--       – a caller with no relationship to the target gym reads zero `schedule_template` rows, so the
--         loop never runs and nothing is written;
--       – a MEMBER of the target gym DOES read its templates (the member agenda needs them), so the
--         loop runs — and every `class_session` INSERT is then refused by the staff WITH CHECK
--         (42501). Nothing lands; the transaction aborts on the first row.
--     Either way the write surface is staff-only. The denial suite pins the outcome (zero gym-B rows),
--     which is the property that matters, rather than which of the two rules produced it.
--   • as `postgres`, through cron_materialize_horizon (SECURITY DEFINER): the owner bypasses RLS, so
--     the inserts land for the iterated gym. Safe because that caller takes NO user input — every
--     gym_id it passes comes from its own `select … from public.gym` loop.
-- p_gym_id is deliberately unguarded: a null (or foreign) gym matches no schedule_template row, so
-- the function is naturally inert rather than defensively so.
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

-- ── 2. ensure_week_materialized: unchanged seam, now a wrapper over the core ───────────────────
-- The agenda's view-time call (packages/data/src/server/agenda.ts:199) and create_recurring_schedule's
-- horizon loop both keep calling THIS. Gym is still derived from staff_gym(), never a parameter.
create or replace function public.ensure_week_materialized(p_week_start date)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym uuid := public.staff_gym();
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  return public.materialize_week_for_gym(v_gym, p_week_start);
end;
$function$;

-- ── 3. cron_run_log: where a cron run's summary survives ───────────────────────────────────────
-- MEASURED on scratch (2026-08-05, an every-minute probe job, two runs captured):
-- cron.job_run_details records `status=succeeded, return_message='1 row'` — pg_cron stores the
-- COMMAND TAG, never the SELECT's value. An earlier draft of this file claimed that column carried
-- the run summary. It does not, and on that claim a gym erroring every week would have been
-- invisible again — the exact silence hardening #4 exists to end. So the summary is persisted here.
--
-- Ops-only, by two independent mechanisms: RLS on with ZERO policies (default-deny for every client
-- role), and the client grants revoked outright so anon/authenticated are refused at the privilege
-- layer before RLS is even consulted. Rows are written only from inside the SECURITY DEFINER
-- function below, which runs as the owner.
--
-- Volume ceiling, since there is deliberately no retention machinery: one row per run, 52 rows/year
-- for the weekly job. If this ever carries a per-minute job, add a retention delete — not before.
create table if not exists public.cron_run_log (
  id       uuid primary key default gen_random_uuid(),
  job      text not null,
  ran_at   timestamptz not null default now(),
  summary  text not null
);
alter table public.cron_run_log enable row level security;
revoke all on table public.cron_run_log from anon, authenticated;

comment on table public.cron_run_log is
  'Per-run summary of the scheduled jobs in this database (#136). pg_cron''s cron.job_run_details stores the command tag, not the value a job returns, so a job that wants its own result read back later writes it here. Ops-only: RLS with no policies + no client grants.';

-- ── 4. cron_materialize_horizon: the weekly fleet pass ─────────────────────────────────────────
-- SECURITY DEFINER (owner: postgres) because no logged-in role exists at 08:00 UTC on a Monday — the
-- job has no JWT, so staff_gym() cannot scope it. The definer surface is closed on both ends: EXECUTE
-- is revoked from public/anon/authenticated (cron and ops only), and the function accepts NO
-- arguments, so there is no user input to smuggle a gym_id through.
--
-- Per-gym subtransaction (#1): each gym's 6 weeks run inside their own BEGIN…EXCEPTION, so a bad
-- timezone, a CHECK violation, or any other per-gym fault costs exactly that gym. The rejected
-- single-transaction design lost the whole fleet to one bad row (cross-exam weakness 3).
--
-- Observability (#4): the run produces a one-line summary — `gyms=N created=M errors=K [<gym_id>:
-- <sqlerrm>; …]` — which it WRITES to public.cron_run_log before returning it (the return value is
-- still there for a manual `select public.cron_materialize_horizon();`, but pg_cron discards it —
-- see §3's measurement). Silent death was the other half of weakness 3, and it now needs all three
-- of these to fail at once, none of which is the others' proxy:
--   cron.job_run_details      — the run HAPPENED, and hard failures (an error text, not '1 row')
--   public.cron_run_log       — WHAT each run did: gyms/created/errors + the id of every failing gym
--   public.gym_horizon_depth  — the OUTCOME, measured off the sessions themselves, no cron in the loop
--
-- SCALING CEILING (named because the cross-exam demands it): the subtransactions isolate failures but
-- one invocation still walks every gym serially, at a measured ~20–50ms/gym. Against the documented
-- ~2-minute `postgres` statement cap that models out to ~2,400–6,000 gyms per run. Fine at today's 4.
-- The exit is sharding, NOT re-modelling: split the iteration by `hashtextextended(id::text, 0) % N`
-- into N cron jobs on staggered minutes. Do it before the fleet passes ~2,000 gyms.
create or replace function public.cron_materialize_horizon()
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_gyms    int := 0;
  v_created int := 0;
  v_errors  int := 0;
  v_notes   text[] := '{}';
  v_summary text;
  v_monday  date;
  g         record;
  i         int;
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

      for i in 0 .. 5 loop  -- 6 weeks (#6): this week + 5 ahead
        v_created := v_created + public.materialize_week_for_gym(g.id, v_monday + (i * 7));
      end loop;
    exception when others then
      v_errors := v_errors + 1;
      v_notes := v_notes || (g.id::text || ': ' || sqlerrm);
    end;
  end loop;

  v_summary := format('gyms=%s created=%s errors=%s%s', v_gyms, v_created, v_errors,
    case when v_errors = 0 then '' else ' [' || array_to_string(v_notes, '; ') || ']' end);

  -- Persist it INSIDE the run, deliberately outside every per-gym subtransaction, so the row always
  -- describes the whole pass. Same jobname literal as cron.schedule below, so a row in
  -- cron.job_run_details lines up with its summary here by name.
  insert into public.cron_run_log (job, summary) values ('roll-class-horizon', v_summary);

  return v_summary;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005) ────────────────────────────────────────────────────────────────
-- The core must be callable by `authenticated`: ensure_week_materialized is SECURITY INVOKER, so its
-- nested call runs as the caller's role. That is not a widening — RLS is what fences the core, and
-- the suite proves gym-A staff cannot write gym-B rows through it.
revoke execute on function public.materialize_week_for_gym(uuid, date) from public, anon;
grant  execute on function public.materialize_week_for_gym(uuid, date) to authenticated;
-- The fleet pass is postgres-only: cron runs it, ops can run it by hand, nobody else can reach it.
revoke execute on function public.cron_materialize_horizon() from public, anon, authenticated;

-- ── 5. pg_cron + the weekly job ────────────────────────────────────────────────────────────────
-- First `create extension` in this repo's migration set. Supabase's documented form pins the schema
-- to pg_catalog (pg_cron's control file is non-relocatable); the extension still creates its own
-- `cron` schema for cron.job / cron.job_run_details.
--
-- The pg_extension guard is load-bearing, and `if not exists` is NOT a substitute for it. MEASURED on
-- scratch (2026-08-05, re-applying this very file): on Supabase-hosted Postgres, `create extension if
-- not exists pg_cron` still fires the platform's after-create.sql hook when pg_cron is ALREADY
-- installed, and that hook's `revoke all on table cron.job from postgres` aborts with 2BP01
-- (dependent privileges exist) against the grants the FIRST application left behind. So the first
-- install (= live) succeeds and every re-apply dies — taking the whole atomic batch, the rest of this
-- file included, with it. Skipping the install outright when the extension is already present is what
-- makes this migration re-runnable. Do not "simplify" this back to a bare `create extension`.
do $pgcron$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
  end if;
end
$pgcron$;

-- `0 8 * * 1` = Monday 08:00 UTC. pg_cron schedules in UTC, and 08:00 UTC lands at 00:00 (Tijuana,
-- UTC-8) → 03:00 (Cancún, UTC-5) on Monday — every Mexican timezone has already crossed midnight into
-- Monday, so the "current week" each gym computes is the new one, and no zone is inside business
-- hours. Mexico has run without DST since 2022, so this stays put year-round.
--
-- IDEMPOTENT BY JOBNAME: cron.schedule(jobname, schedule, command) upserts on (jobname, username), so
-- re-running this migration re-points the same job instead of creating a second one. This matters more
-- than usual here — cron.job is DB state, not migration state, so a scratch project that replayed the
-- migrations proves the FUNCTION but never proves the JOB. Verify the job on live with:
--   select jobname, schedule, active from cron.job where jobname = 'roll-class-horizon';
--
-- The DO block is ordering insurance: the extension is created in the same file (and possibly the same
-- transaction), and a plpgsql body resolves `cron.schedule` when the block executes, never before.
do $autoroll$
begin
  perform cron.schedule(
    'roll-class-horizon',
    '0 8 * * 1',
    'select public.cron_materialize_horizon();'
  );
end
$autoroll$;

-- ── 6. gym_horizon_depth: the "did the cron die" check (#4) ────────────────────────────────────
-- One row per gym, including gyms with ZERO future sessions — a gym silently dropping to 0 (or a
-- horizon_ends that stops moving week over week) is exactly the failure the cross-exam said takes
-- weeks to notice, because the only other detector is a member finding an empty week. This is the
-- detector that does NOT trust the cron: it measures the sessions, so it still fires if the job was
-- unscheduled, the extension was dropped, or cron_run_log stopped being written.
--
-- security_invoker so the view carries no privilege of its own, then revoked from the client roles:
-- it is cross-gym by construction and belongs to ops (postgres), not to any tenant.
create or replace view public.gym_horizon_depth
  with (security_invoker = true) as
select g.id          as gym_id,
       g.slug,
       g.brand_name,
       count(cs.id)  as future_sessions,
       max(cs.starts_at) as horizon_ends
  from public.gym g
  left join public.class_session cs
    on  cs.gym_id = g.id
    and cs.cancelled_at is null
    and cs.starts_at > now()
 group by g.id, g.slug, g.brand_name;

revoke all on table public.gym_horizon_depth from anon, authenticated;

comment on view public.gym_horizon_depth is
  'Ops health check for the #136 weekly auto-roll: future non-cancelled sessions and horizon end per gym. A gym at 0, or a horizon_ends that stops advancing, means cron_materialize_horizon stopped running or is erroring for that gym — read public.cron_run_log for that run''s summary and the failing gym ids (cron.job_run_details carries only the command tag, never the summary). Cross-gym: postgres/ops only.';
