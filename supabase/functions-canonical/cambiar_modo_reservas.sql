declare
  v_gym    uuid;
  v_actual boolean;
  v_n      int := 0;
  r        record;
begin
  
  
  
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  select booking_enabled into v_actual from public.gym where id = v_gym;
  if not found then raise exception 'Gimnasio no encontrado'; end if;

  
  
  if v_actual = p_habilitar then
    return 0;
  end if;

  update public.gym set booking_enabled = p_habilitar where id = v_gym;

  
  
  if p_habilitar then
    return 0;
  end if;

  
  
  for r in
    select res.class_session_id, res.member_id
      from public.reservation res
      join public.class_session cs on cs.id = res.class_session_id
     where res.gym_id = v_gym
       and res.status = 'reservada'
       and cs.starts_at > now()
     order by cs.starts_at, res.member_id
  loop
    perform public.cancelar_reserva(r.class_session_id, r.member_id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
