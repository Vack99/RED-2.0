declare
  v_tz      text;
  v_monday  date;
  v_today   date;
  v_count   int := 0;
  v_session uuid;
  t         record;
  v_starts  timestamptz;
begin
  select timezone into v_tz from public.gym where id = p_gym_id;
  
  v_monday := p_week_start - ((extract(isodow from p_week_start)::int - 1));

  
  
  
  
  
  
  v_today := (now() at time zone v_tz)::date;
  v_today := v_today - ((extract(isodow from v_today)::int - 1));
  if v_monday < v_today then
    return 0;
  end if;

  for t in
    select id, class_type_id, weekday, start_time, duration_min, capacity
    from public.schedule_template
    where gym_id = p_gym_id and is_active
    order by created_at asc, id asc   
  loop
    insert into public.schedule_template_week (gym_id, template_id, week_start)
    values (p_gym_id, t.id, v_monday)
    on conflict (template_id, week_start) do nothing;

    if found then  
      
      
      
      
      
      v_starts := ((v_monday + t.weekday) + t.start_time) at time zone v_tz;

      
      
      if v_starts > now()
         and not exists (
           select 1 from public.class_session cs
            where cs.gym_id = p_gym_id
              and cs.starts_at = v_starts
              and cs.cancelled_at is null
         )
      then
        v_session := null;
        insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
        values (p_gym_id, t.class_type_id, v_starts, t.duration_min, t.capacity, t.id)
        on conflict (template_id, starts_at) do nothing
        returning id into v_session;

        if v_session is not null then
          insert into public.class_session_coach (gym_id, session_id, coach_id)
          select p_gym_id, v_session, stc.coach_id
          from public.schedule_template_coach stc where stc.template_id = t.id;
          v_count := v_count + 1;
        end if;
      end if;
    end if;
  end loop;

  return v_count;
end;
