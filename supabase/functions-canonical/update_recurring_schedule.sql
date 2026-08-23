declare
  v_gym     uuid := public.staff_gym();
  v_weekday int;
  v_group   uuid;
  v_tz      text;
  v_wd      int;
  v_ids     uuid[];
  v_tids    uuid[] := '{}';
  v_all     uuid[] := '{}';
  v_future  int;
  v_members int := 0;
  v_ocupa   text;        
  v_choque  timestamptz; 
  m         record;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;
  if p_all_days and p_weekday is not null then
    raise exception 'No se puede cambiar el día al editar todo el horario';
  end if;

  
  
  select weekday, group_id into v_weekday, v_group from public.schedule_template
   where id = p_template_id and gym_id = v_gym and is_active;
  if not found then raise exception 'Horario no encontrado o ya retirado'; end if;
  v_weekday := coalesce(p_weekday, v_weekday);

  
  select timezone into v_tz from public.gym where id = v_gym;

  moved := 0;
  kept  := 0;

  
  
  
  for m in
    select id, weekday, start_time from public.schedule_template
     where gym_id = v_gym and is_active
       and (case when p_all_days then group_id = v_group else id = p_template_id end)
     order by weekday, id
  loop
    v_members := v_members + 1;
    
    
    v_wd := case when p_all_days then m.weekday else v_weekday end;
    v_tids := v_tids || m.id;

    
    
    
    if v_wd is distinct from m.weekday or p_start_time is distinct from m.start_time then
      select ct.name into v_ocupa
        from public.schedule_template st
        join public.class_type ct on ct.id = st.class_type_id
       where st.gym_id = v_gym
         and st.weekday = v_wd
         and st.start_time = p_start_time
         and st.is_active
         and st.class_type_id is distinct from p_class_type_id
         and (case when p_all_days then st.group_id is distinct from v_group else st.id <> p_template_id end)
       order by st.created_at, st.id
       limit 1;
      if v_ocupa is not null then
        raise exception 'Ya existe un horario activo de % el % a las %',
          v_ocupa,
          (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[v_wd + 1],
          to_char(p_start_time, 'HH24:MI');
      end if;
    end if;

    begin
      
      
      update public.schedule_template
         set class_type_id = p_class_type_id,
             weekday       = v_wd,
             start_time    = p_start_time,
             duration_min  = p_duration_min,
             capacity      = p_capacity
       where id = m.id and gym_id = v_gym and is_active;
      if not found then raise exception 'Horario no encontrado o ya retirado'; end if;
    exception when unique_violation then
      raise exception 'Ya existe un horario activo para esta clase el % a las %',
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[v_wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end;

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    if v_wd is distinct from m.weekday or p_start_time is distinct from m.start_time then
      select cs2.starts_at into v_choque
        from public.class_session cs
        join public.class_session cs2
          on cs2.gym_id = v_gym
         and cs2.cancelled_at is null
         and cs2.id <> cs.id
         and cs2.starts_at = (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz)
       where cs.template_id = m.id
         and cs.starts_at > now()
         and cs.cancelled_at is null
         and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz) > now()
         and not exists (
           select 1 from public.schedule_template st
            where st.id = cs2.template_id
              and st.gym_id = v_gym and st.is_active
              and (case when p_all_days then st.group_id = v_group else st.id = p_template_id end)
         )
       order by cs2.starts_at
       limit 1;
      if v_choque is not null then
        
        
        raise exception 'No se puede mover el horario: ya hay una clase el % a las %',
          to_char(v_choque at time zone v_tz, 'DD/MM/YYYY'),
          to_char(v_choque at time zone v_tz, 'HH24:MI');
      end if;
    end if;

    
    
    
    with mv as (
      update public.class_session cs
         set class_type_id = p_class_type_id,
             starts_at     = ((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz,
             duration_min  = p_duration_min,
             capacity      = p_capacity
       where cs.template_id = m.id
         and cs.starts_at > now()
         and cs.cancelled_at is null
         and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz) > now()
      returning cs.id
    )
    select coalesce(array_agg(id), '{}') into v_ids from mv;

    
    
    select count(*)::int into v_future
      from public.class_session
     where template_id = m.id and starts_at > now() and cancelled_at is null;

    moved := moved + coalesce(array_length(v_ids, 1), 0);
    kept  := kept  + (v_future - coalesce(array_length(v_ids, 1), 0));
    v_all := v_all || v_ids;
  end loop;

  if v_members = 0 then raise exception 'Horario no encontrado o ya retirado'; end if;
  
  
  
  
  if p_all_days and not (p_template_id = any(v_tids)) then
    raise exception 'Horario no encontrado o ya retirado';
  end if;

  
  
  
  
  
  if p_coach_ids is not null then
    delete from public.schedule_template_coach where template_id = any(v_tids);
    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, tid, cid from unnest(v_tids) tid, unnest(p_coach_ids) cid;

    delete from public.class_session_coach where session_id = any(v_all);
    insert into public.class_session_coach (gym_id, session_id, coach_id)
    select v_gym, sid, cid from unnest(v_all) sid, unnest(p_coach_ids) cid;
  end if;
end;
