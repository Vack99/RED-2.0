declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
  v_id  uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;

  if (select count(*) from public.plantillas where gym_id = v_gym) >= 4 then
    raise exception 'Máximo 4 plantillas';
  end if;
  insert into public.plantillas (nombre, body, gym_id)
  values (p_nombre, p_body, v_gym)
  returning id into v_id;
  return v_id;
end;
