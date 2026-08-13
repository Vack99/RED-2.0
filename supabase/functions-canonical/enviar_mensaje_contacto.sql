declare
  v_gym    uuid;
  v_recent integer;
  c_limit  constant integer  := 5;               
  c_window constant interval := interval '1 hour';
begin
  
  select id into v_gym from public.gym where slug = p_gym_slug;
  if v_gym is null then
    raise exception 'Gimnasio no encontrado' using errcode = 'no_data_found';
  end if;

  
  if char_length(coalesce(btrim(p_nombre), '')) < 2 or char_length(p_nombre) > 80 then
    raise exception 'Nombre inválido' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(btrim(p_correo), '')) < 3
     or p_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Correo inválido' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(btrim(p_mensaje), '')) < 4 or char_length(p_mensaje) > 2000 then
    raise exception 'Mensaje inválido' using errcode = 'check_violation';
  end if;

  
  if p_ip is not null then
    select count(*) into v_recent
      from public.contact_message
      where gym_id = v_gym and ip = p_ip and created_at > now() - c_window;
    if v_recent >= c_limit then
      raise exception 'Demasiados mensajes, intenta más tarde' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.contact_message (gym_id, nombre, correo, mensaje, ip)
    values (v_gym, btrim(p_nombre), btrim(p_correo), btrim(p_mensaje), p_ip);
end;
