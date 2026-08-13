declare
  v_gym   uuid := public.staff_gym();
  v_group uuid;
  v_n     int := 0;
  r       record;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;

  
  
  
  update public.schedule_template set is_active = false
   where id = p_template_id and gym_id = v_gym and is_active
  returning group_id into v_group;
  if not found then raise exception 'Horario no encontrado o ya retirado'; end if;

  if p_all_days then
    update public.schedule_template set is_active = false
     where group_id = v_group and gym_id = v_gym and is_active;
  end if;

  
  
  
  for r in
    select cs.id
      from public.class_session cs
      join public.schedule_template t on t.id = cs.template_id
     where t.gym_id = v_gym
       and (case when p_all_days then t.group_id = v_group else t.id = p_template_id end)
       and cs.starts_at > now()
       and cs.cancelled_at is null
     order by cs.starts_at, cs.id
  loop
    perform public.cancel_class_session(r.id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
