declare
  v_gym uuid := public.staff_gym();
  v_session uuid;
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

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, is_special, special_name, room_id)
  values (v_gym, p_class_type_id, p_starts_at, p_duration_min, p_capacity, p_is_special, p_special_name, p_room_id)
  returning id into v_session;

  insert into public.class_session_coach (gym_id, session_id, coach_id)
  select v_gym, v_session, cid from unnest(p_coach_ids) as cid;

  return v_session;
end;
