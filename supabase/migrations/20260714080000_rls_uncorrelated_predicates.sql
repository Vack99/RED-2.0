-- Perf: rewrite the gym-scoped RLS *SELECT* predicates from the correlated
-- helper-call shape to an uncorrelated set-membership shape, so the planner hoists
-- them to a hashed InitPlan evaluated ONCE per statement instead of a per-row SubPlan.
--
-- ADR-0013 §2 (corrected 2026-07-13) records that `(select public.is_staff_of(gym_id))`
-- references the row's own `gym_id` column and is therefore a CORRELATED SubPlan —
-- evaluated once per scanned row of the whole cross-tenant table, not once per statement.
-- Live proof on this bench: `asistencias_staff_select` over 5000 rows shows
-- `SubPlan 1 ... loops=5000`, 42ms vs ~3ms with RLS off. ADR-0013 §2's "Deferred with a
-- named trigger" bullet names the fix: `gym_id in (select …)`, hoistable to an InitPlan.
-- This migration adopts exactly that rewrite for the SELECT surface.
--
-- SEMANTICS ARE PRESERVED EXACTLY. The helper bodies (20260702161010) are:
--   is_member_of(g)      = EXISTS membership(user_id=auth.uid(), gym_id=g)              -- any role
--   is_staff_of(g)       = EXISTS membership(user_id=auth.uid(), gym_id=g, role in (owner,operator))
--   has_role(g,'owner')  = EXISTS membership(user_id=auth.uid(), gym_id=g, role='owner')
-- gym_membership has NO soft-delete/revocation column — membership existence + role set is
-- the whole rule — so each helper's EXISTS(...=g) becomes the set test `g in (select gym_id …)`
-- with the identical role filter. `auth.uid()` stays wrapped in `(select …)` (the ADR-0001
-- InitPlan idiom); the outer set subquery references no column of the protected table, so it
-- too is uncorrelated and hoisted once.
--
-- The inline subquery reads public.gym_membership as INVOKER (the helper read it as DEFINER).
-- This is safe and equivalent: gym_membership's own `gym_membership_self_select` policy
-- (`user_id = (select auth.uid())`) permits exactly the rows this subquery filters to, so RLS
-- removes none of them; and gym_membership's staff policy invokes the DEFINER helper, so no
-- recursion. The membership rule still has one home for WRITES/definer paths — the helpers are
-- left untouched (other code and SECURITY DEFINER paths call them).
--
-- SCOPE: SELECT policies only (the row-volume perf surface). INSERT/UPDATE/DELETE policies keep
-- the correlated helper form — writes touch few rows, so there is no perf case, and leaving them
-- avoids re-deriving WITH CHECK equivalence for a non-benefit (ADR-0013 §2 targets reader scale).
--
-- ONE policy is deliberately NOT rewritten: `gym_membership_staff_select` (on gym_membership
-- itself). An inline `gym_id in (select … from gym_membership …)` inside a policy ON
-- gym_membership triggers Postgres "infinite recursion detected in policy" — the exact reason
-- ADR-0013 §1 makes the helper SECURITY DEFINER. gym_membership is a ~single-digit-row table, so
-- its per-row SubPlan is a non-issue; it keeps the correlated `(select is_staff_of(gym_id))`.
--
-- Idempotent (drop-if-exists + create). No table/helper/constraint DDL; commutes with siblings.

-- ── STAFF read (role in owner|operator): was (select public.is_staff_of(gym_id)) ──────────────
drop policy if exists "asistencias_staff_select" on public.asistencias;
create policy "asistencias_staff_select" on public.asistencias for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m
                    where m.user_id = (select auth.uid()) and m.role in ('owner', 'operator')));

drop policy if exists "clientes_staff_select" on public.clientes;
create policy "clientes_staff_select" on public.clientes for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m
                    where m.user_id = (select auth.uid()) and m.role in ('owner', 'operator')));

drop policy if exists "ventas_staff_select" on public.ventas;
create policy "ventas_staff_select" on public.ventas for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m
                    where m.user_id = (select auth.uid()) and m.role in ('owner', 'operator')));

drop policy if exists "reservation_staff_select" on public.reservation;
create policy "reservation_staff_select" on public.reservation for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m
                    where m.user_id = (select auth.uid()) and m.role in ('owner', 'operator')));

drop policy if exists "contact_message_staff_select" on public.contact_message;
create policy "contact_message_staff_select" on public.contact_message for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m
                    where m.user_id = (select auth.uid()) and m.role in ('owner', 'operator')));

-- ── OWNER-only read (role = owner): was (select public.has_role(gym_id,'owner')) ──────────────
drop policy if exists "cobro_owner_select" on public.cobro;
create policy "cobro_owner_select" on public.cobro for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m
                    where m.user_id = (select auth.uid()) and m.role = 'owner'));

-- ── MEMBER read (any role): was (select public.is_member_of(gym_id)) ──────────────────────────
drop policy if exists "about_value_member_select" on public.about_value;
create policy "about_value_member_select" on public.about_value for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "class_session_member_select" on public.class_session;
create policy "class_session_member_select" on public.class_session for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "class_session_coach_member_select" on public.class_session_coach;
create policy "class_session_coach_member_select" on public.class_session_coach for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "class_type_member_select" on public.class_type;
create policy "class_type_member_select" on public.class_type for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "class_type_bring_item_member_select" on public.class_type_bring_item;
create policy "class_type_bring_item_member_select" on public.class_type_bring_item for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "class_type_workblock_member_select" on public.class_type_workblock;
create policy "class_type_workblock_member_select" on public.class_type_workblock for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "coach_member_select" on public.coach;
create policy "coach_member_select" on public.coach for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "facility_member_select" on public.facility;
create policy "facility_member_select" on public.facility for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "faq_member_select" on public.faq;
create policy "faq_member_select" on public.faq for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "gym_contact_member_select" on public.gym_contact;
create policy "gym_contact_member_select" on public.gym_contact for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "paquetes_member_select" on public.paquetes;
create policy "paquetes_member_select" on public.paquetes for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "perfil_member_select" on public.perfil;
create policy "perfil_member_select" on public.perfil for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "plan_feature_member_select" on public.plan_feature;
create policy "plan_feature_member_select" on public.plan_feature for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "plantillas_member_select" on public.plantillas;
create policy "plantillas_member_select" on public.plantillas for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "room_member_select" on public.room;
create policy "room_member_select" on public.room for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "schedule_template_member_select" on public.schedule_template;
create policy "schedule_template_member_select" on public.schedule_template for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "schedule_template_coach_member_select" on public.schedule_template_coach;
create policy "schedule_template_coach_member_select" on public.schedule_template_coach for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "schedule_template_week_member_select" on public.schedule_template_week;
create policy "schedule_template_week_member_select" on public.schedule_template_week for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));

drop policy if exists "stat_member_select" on public.stat;
create policy "stat_member_select" on public.stat for select to authenticated
  using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())));
