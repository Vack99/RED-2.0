-- S2 / slice #38 — plan_feature RLS policies (curated/showcased class; ADR-0013 §3, PRD #36 decision (b)).
--
-- The POLICY half of the plan_feature expand. Split from the table create (sibling file) so the denial
-- suite records the deny-all RED baseline (RLS on, no policies → even staff see 0) BEFORE these grants,
-- then GREEN after — the denial-test-FIRST proof this slice's acceptance requires. plan_feature is a new
-- table with no readers until the cuenta editor ships, so table-then-policy across two migrations opens
-- no live-write window.
--
-- One standard predicate per class (ADR-0013 §3), every helper wrapped in the `(select …)` initplan idiom
-- (security-rls-performance — evaluated once per statement, not per row; gym_id is indexed by the sibling
-- migration):
--   • member read  — authenticated gym members read the curated catalog via is_member_of(gym_id).
--   • staff write  — operators/owners author (insert/update/delete) via is_staff_of(gym_id).
-- NO anon read (deferred to Phase 6 with the marketing pages that consume it — decision (b)).
--
-- Idempotent (drop-policy-if-exists + create); strictly CREATE POLICY, no other DDL, so safe to re-apply
-- and safe out-of-order on the live project.

drop policy if exists "plan_feature_member_select" on public.plan_feature;
create policy "plan_feature_member_select" on public.plan_feature for select to authenticated
  using ((select public.is_member_of(gym_id)));

drop policy if exists "plan_feature_staff_insert" on public.plan_feature;
create policy "plan_feature_staff_insert" on public.plan_feature for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));

drop policy if exists "plan_feature_staff_update" on public.plan_feature;
create policy "plan_feature_staff_update" on public.plan_feature for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

drop policy if exists "plan_feature_staff_delete" on public.plan_feature;
create policy "plan_feature_staff_delete" on public.plan_feature for delete to authenticated
  using ((select public.is_staff_of(gym_id)));
