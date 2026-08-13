select r.class_session_id, count(*)::int
  from public.reservation r
  where r.class_session_id = any(p_session_ids)
    and r.status in ('reservada', 'asistida')
    and r.is_walk_in = false
    and public.is_member_of(r.gym_id)
  group by r.class_session_id
