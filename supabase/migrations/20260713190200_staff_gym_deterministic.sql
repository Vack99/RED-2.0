-- Issue #93 (spec 2026-07-13 §1.3) — make `staff_gym()` deterministic under
-- multi-membership. Same bug as getOperatorGym's read (fixed app-side in #92): `limit 1`
-- with no ORDER BY lets the planner pick ANY staff row, and `registrar_venta` uses this
-- helper to stamp `gym_id` on money rows. Same body + posture, plus `order by gym_id` —
-- the same total order getOperatorGym now uses, so SQL and app resolve the SAME gym.

create or replace function public.staff_gym()
  returns uuid language sql stable security definer set search_path = ''
  as $$
    select gym_id from public.gym_membership
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
    order by gym_id
    limit 1;
  $$;
