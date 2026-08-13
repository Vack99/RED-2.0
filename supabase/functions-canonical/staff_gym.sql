select gym_id from public.gym_membership
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
    order by gym_id
    limit 1;
