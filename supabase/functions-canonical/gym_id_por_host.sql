select d.gym_id
  from public.gym_domain d
  where d.hostname = p_hostname
    and (p_app is null or d.app = p_app)
  limit 1
