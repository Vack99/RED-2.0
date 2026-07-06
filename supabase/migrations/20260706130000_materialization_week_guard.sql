-- Immutable materialization guard, slice #42 gate-2 fix (PRD #36 S1 decision c; ADR-0010 §1).
--
-- DEFECT CLOSED: the idempotency guard keyed on class_session (template_id, starts_at) — a MUTABLE
-- instant. edit_class_session moves starts_at (the ADR-0010 holiday move) while keeping template_id,
-- so the edited row vacated its guard slot and the next ensure_week_materialized (view-time, or
-- create_recurring_schedule's horizon loop) re-inserted a fresh session at the original instant:
-- moving Lunes 18:00 → Martes 19:00 yielded BOTH classes, coaches seeded. The same resurrection
-- reasoning already applied to cancel (cancelled_at is a tombstone, not a delete) applies to moves.
--
-- FIX: materialization idempotency now keys on an IMMUTABLE ledger — schedule_template_week
-- (template_id, week_start): "this template already materialized this week". Session rows never
-- carry the guard, so editing or cancelling a session can never vacate it; sessions stay fully
-- independent once written (§5.3). The unique (template_id, starts_at) constraint stays in place —
-- it still forbids true duplicate slots — but it is no longer what makes materialization idempotent.
--
-- Expand-only: one new table + a CREATE OR REPLACE redefinition of ensure_week_materialized (the
-- additive-redefinition precedent of 20260702233000; same signature, EXECUTE grants preserved; the
-- two already-applied slice-42 migrations are untouched). RLS: curated/showcased class (member
-- select / staff insert; the ledger is written only inside the invoker RPC by staff). No update or
-- delete policy — a guard row is written once and never changes.

-- ── schedule_template_week: (template_id, week_start) — the immutable materialization ledger ──
create table if not exists public.schedule_template_week (
  gym_id       uuid not null references public.gym (id) on delete cascade,
  template_id  uuid not null references public.schedule_template (id) on delete cascade,
  week_start   date not null,
  created_at   timestamptz not null default now(),
  primary key (template_id, week_start)
);
alter table public.schedule_template_week enable row level security;
create index if not exists schedule_template_week_gym_id_idx on public.schedule_template_week (gym_id);

drop policy if exists "schedule_template_week_member_select" on public.schedule_template_week;
create policy "schedule_template_week_member_select" on public.schedule_template_week for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "schedule_template_week_staff_insert" on public.schedule_template_week;
create policy "schedule_template_week_staff_insert" on public.schedule_template_week for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));

-- ── ensure_week_materialized: idempotency re-keyed onto the ledger ──────────────
-- Same seam, same signature (ADR-0005: SECURITY INVOKER, search_path='', grants carried over by
-- CREATE OR REPLACE). Per active template: claim the (template_id, week) ledger slot; only a
-- genuinely-new claim inserts the session + coach joins. The session insert keeps ON CONFLICT
-- (template_id, starts_at) DO NOTHING as a belt: if a moved session already occupies the exact
-- instant this template would generate, the slot is genuinely taken — skip without erroring.
create or replace function public.ensure_week_materialized(p_week_start date)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym     uuid := public.staff_gym();
  v_tz      text;
  v_monday  date;
  v_count   int := 0;
  v_session uuid;
  t         record;
  v_starts  timestamptz;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  select timezone into v_tz from public.gym where id = v_gym;
  -- isodow: Mon=1..Sun=7 → back up to Monday.
  v_monday := p_week_start - ((extract(isodow from p_week_start)::int - 1));

  for t in
    select id, class_type_id, weekday, start_time, duration_min, capacity
    from public.schedule_template
    where gym_id = v_gym and is_active
  loop
    insert into public.schedule_template_week (gym_id, template_id, week_start)
    values (v_gym, t.id, v_monday)
    on conflict (template_id, week_start) do nothing;

    if found then  -- first materialization of this template for this week
      v_starts := ((v_monday + t.weekday) + t.start_time) at time zone v_tz;

      v_session := null;
      insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
      values (v_gym, t.class_type_id, v_starts, t.duration_min, t.capacity, t.id)
      on conflict (template_id, starts_at) do nothing
      returning id into v_session;

      if v_session is not null then
        insert into public.class_session_coach (gym_id, session_id, coach_id)
        select v_gym, v_session, stc.coach_id
        from public.schedule_template_coach stc where stc.template_id = t.id;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$function$;
