declare
  v_gym    uuid := public.staff_gym();
  v_group  uuid := gen_random_uuid();
  v_tz     text;
  v_today  date;
  v_monday date;
  v_template uuid;
  v_ocupa  text;   
  wd int;
  i  int;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  foreach wd in array p_weekdays loop
    
    
    
    
    
    select ct.name into v_ocupa
      from public.schedule_template st
      join public.class_type ct on ct.id = st.class_type_id
     where st.gym_id = v_gym
       and st.weekday = wd
       and st.start_time = p_start_time
       and st.is_active
       and st.class_type_id is distinct from p_class_type_id
     order by st.created_at, st.id
     limit 1;
    if v_ocupa is not null then
      raise exception 'Ya existe un horario activo de % el % a las %',
        v_ocupa,
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end if;

    
    
    
    begin
      insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
      values (v_gym, p_class_type_id, wd, p_start_time, p_duration_min, p_capacity, v_group)
      returning id into v_template;
    exception when unique_violation then
      raise exception 'Ya existe un horario activo para esta clase el % a las %',
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end;

    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, v_template, cid from unnest(p_coach_ids) as cid;

    return next v_template;
  end loop;

  
  select timezone into v_tz from public.gym where id = v_gym;
  v_today := (now() at time zone v_tz)::date;
  v_monday := v_today - ((extract(isodow from v_today)::int - 1));
  for i in 0 .. greatest(p_horizon_weeks, 1) - 1 loop
    perform public.ensure_week_materialized(v_monday + (i * 7));
  end loop;
end;
