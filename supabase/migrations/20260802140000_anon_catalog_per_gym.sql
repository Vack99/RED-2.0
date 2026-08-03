-- #215 (epic #203) — one anonymous call could read every gym's catalog.
--
-- 20260706160000 created 14 `*_anon_select ... using (true)` policies and 20260706165900
-- added a 15th. Measured live as `anon` with no JWT: class_session 614 rows across all 4
-- gyms, paquetes 15, coach 11, gym_contact 3. RLS enforced NO tenant scoping on any of
-- them; isolation was the DAL's `.eq("gym_id", …)` — a convention, per that migration's own
-- header and ADR-0013:98-102. The publishable key is build-inlined into every browser
-- bundle by design (ADR-0008 §47), so the credential to run the scan is public.
--
-- What must keep working: per-gym publication IS the product. The public marketing pages
-- ((home), precios, nosotros, contacto) read these tables and must still render on a mapped
-- host, and still degrade to empty under DEFAULT_BRAND on an unmapped one. What must stop
-- is BULK CROSS-GYM ENUMERATION IN A SINGLE CALL.
--
-- Mechanism: the anon policies stop being `true` and start keying on the gym the request
-- names. PostgREST publishes every request header in the `request.headers` GUC, so a policy
-- can read one — and `packages/data`'s `createAnonClient(gymId)` sets `x-gym-id` for exactly
-- these reads. That header is CALLER-SUPPLIED and this is deliberate: it is not an authz
-- input (every row behind it is already public for that gym), it is the scope selector that
-- turns "give me everything" into "give me one gym". An attacker can still ask gym by gym;
-- they can no longer take the whole platform in one request, and since #216 they can no
-- longer get the gym list either.
--
-- What is genuinely fine and stays that way: the same live probe returned clientes 0,
-- ventas 0, cobro 0, gym_membership 0. Member PII does NOT cross even though anon holds
-- broad table-level SELECT grants there — RLS default-deny holds. The catalog was the
-- exposure; PII was not. Nothing below touches those tables.
--
-- The `authenticated` policies on all 15 tables are untouched: they already scope by
-- `is_member_of(gym_id)` / `is_staff_of(gym_id)`.

-- ── The scope selector ────────────────────────────────────────────────────────
-- SECURITY INVOKER (nothing is bypassed — it only reads the request), STABLE so the
-- planner hoists it. The uuid shape is checked before the cast so a malformed header
-- yields NULL (→ zero rows) instead of a 22P02 error on a public page.
-- `current_setting(..., true)` returns NULL rather than raising when the GUC is unset,
-- which is the plain `pnpm dev`/unmapped-host case.
create or replace function public.gym_en_peticion()
returns uuid
language sql
stable
set search_path = public
as $$
  select case
           when h ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then h::uuid
         end
  from (
    select lower(nullif(current_setting('request.headers', true)::json ->> 'x-gym-id', '')) as h
  ) s
$$;

revoke execute on function public.gym_en_peticion() from public;
grant execute on function public.gym_en_peticion() to anon, authenticated;

-- ── The 15 policies, narrowed ─────────────────────────────────────────────────
-- `(select public.gym_en_peticion())` is the repo's initplan idiom (ADR-0013 §2): the
-- subselect is UNCORRELATED, so it evaluates once per statement, not once per row.
-- `gym_id = NULL` is NULL, i.e. the row is filtered — an absent header degrades to empty,
-- which is exactly the unmapped-host behaviour the acceptance asks for.
--
-- Written out one statement per table, deliberately, rather than as a `foreach … execute
-- format(…)` loop: #214's guard DERIVES the anon-read surface by parsing these migrations,
-- and dynamic SQL is invisible to it. A loop here would take all 15 tables off the guard's
-- radar while leaving them anon-readable in production — the precise failure the guard
-- exists to prevent. Repetition is the price of being machine-checkable.

drop policy if exists "coach_anon_select" on public.coach;
create policy "coach_anon_select" on public.coach for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "class_type_anon_select" on public.class_type;
create policy "class_type_anon_select" on public.class_type for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "class_type_workblock_anon_select" on public.class_type_workblock;
create policy "class_type_workblock_anon_select" on public.class_type_workblock for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "class_type_bring_item_anon_select" on public.class_type_bring_item;
create policy "class_type_bring_item_anon_select" on public.class_type_bring_item for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "class_session_anon_select" on public.class_session;
create policy "class_session_anon_select" on public.class_session for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "class_session_coach_anon_select" on public.class_session_coach;
create policy "class_session_coach_anon_select" on public.class_session_coach for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "schedule_template_anon_select" on public.schedule_template;
create policy "schedule_template_anon_select" on public.schedule_template for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "paquetes_anon_select" on public.paquetes;
create policy "paquetes_anon_select" on public.paquetes for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "plan_feature_anon_select" on public.plan_feature;
create policy "plan_feature_anon_select" on public.plan_feature for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "about_value_anon_select" on public.about_value;
create policy "about_value_anon_select" on public.about_value for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "facility_anon_select" on public.facility;
create policy "facility_anon_select" on public.facility for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "stat_anon_select" on public.stat;
create policy "stat_anon_select" on public.stat for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "faq_anon_select" on public.faq;
create policy "faq_anon_select" on public.faq for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "room_anon_select" on public.room;
create policy "room_anon_select" on public.room for select to anon
  using (gym_id = (select public.gym_en_peticion()));

drop policy if exists "gym_contact_anon_select" on public.gym_contact;
create policy "gym_contact_anon_select" on public.gym_contact for select to anon
  using (gym_id = (select public.gym_en_peticion()));
