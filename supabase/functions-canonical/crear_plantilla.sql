declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if (select count(*) from public.plantillas where gym_id = public.staff_gym()) >= 4 then
    raise exception 'Máximo 4 plantillas';
  end if;
  insert into public.plantillas (nombre, body, gym_id)
  values (p_nombre, p_body, public.staff_gym())
  returning id into v_id;
  return v_id;
end;
