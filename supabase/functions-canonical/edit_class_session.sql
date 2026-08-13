declare
  v_gym       uuid := public.staff_gym();
  v_starts    timestamptz;
  v_cancelled timestamptz;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if p_room_id is not null and not exists (select 1 from public.room where id = p_room_id and gym_id = v_gym) then
    raise exception 'room % no pertenece al gimnasio del operador', p_room_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  select starts_at, cancelled_at into v_starts, v_cancelled
    from public.class_session where id = p_session_id and gym_id = v_gym;
  if not found then raise exception 'Sesión no encontrada'; end if;
  if v_cancelled is not null then raise exception 'La clase ya fue cancelada'; end if;
  if v_starts > now() and p_starts_at <= now() then
    raise exception 'No se puede mover la clase a una hora que ya pasó';
  end if;
  
  
  
  
  if v_starts <= now() and p_starts_at > now()
     and exists (select 1 from public.reservation
                  where class_session_id = p_session_id and status = 'reservada') then
    raise exception 'No se puede mover al futuro una clase que ya pasó con reservas';
  end if;

  
  
  
  update public.class_session
     set class_type_id = p_class_type_id,
         starts_at     = p_starts_at,
         duration_min  = p_duration_min,
         capacity      = p_capacity,
         is_special    = p_is_special,
         special_name  = p_special_name,
         room_id       = p_room_id,
         template_id   = null
   where id = p_session_id;
  if not found then raise exception 'Sesión no encontrada'; end if;

  
  delete from public.class_session_coach where session_id = p_session_id;
  insert into public.class_session_coach (gym_id, session_id, coach_id)
  select v_gym, p_session_id, cid from unnest(p_coach_ids) as cid;
end;
