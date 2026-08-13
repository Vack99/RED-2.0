select upper(
    left(split_part(c.nombre, ' ', 1), 1)
    || coalesce(left(nullif(split_part(c.nombre, ' ', 2), ''), 1), '')
  )
  from public.reservation r
  join public.clientes c on c.id = r.member_id
  where r.class_session_id = p_session_id
    and r.status in ('reservada', 'asistida')
    and public.is_member_of(r.gym_id)
  order by r.created_at
