select exists (
      select 1 from public.gym_membership
      where user_id = (select auth.uid()) and gym_id = p_gym
        and role = p_role
    );
