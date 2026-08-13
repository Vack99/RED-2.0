declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_hash   text;  
  v_id     uuid;
  v_stored text;  
  v_existed boolean := false;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if not public.has_role(p_gym_id, 'owner') then
    raise exception 'No autorizado';
  end if;

  if p_documento is null or char_length(p_documento) = 0 then
    raise exception 'Documento requerido';
  end if;
  if p_version is null or char_length(p_version) = 0 then
    raise exception 'Versión requerida';
  end if;
  if p_contenido is null or char_length(p_contenido) = 0 then
    raise exception 'Contenido requerido';
  end if;

  
  
  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null then
    raise exception 'Cuenta sin correo asociado';
  end if;

  
  
  v_hash := encode(extensions.digest(p_contenido, 'sha256'), 'hex');

  select aa.id, aa.contenido_hash into v_id, v_stored from public.acuerdo_aceptacion aa
    where aa.gym_id = p_gym_id and aa.documento = p_documento and aa.version = p_version;

  if v_id is not null then
    v_existed := true;
  else
    insert into public.acuerdo_aceptacion
      (gym_id, documento, version, contenido_hash, accepted_by, accepted_by_email, ip, user_agent)
      values (p_gym_id, p_documento, p_version, v_hash, v_uid, v_email, p_ip, p_user_agent)
      on conflict (gym_id, documento, version) do nothing
      returning acuerdo_aceptacion.id, acuerdo_aceptacion.contenido_hash into v_id, v_stored;

    if v_id is null then
      
      v_existed := true;
      select aa.id, aa.contenido_hash into v_id, v_stored from public.acuerdo_aceptacion aa
        where aa.gym_id = p_gym_id and aa.documento = p_documento and aa.version = p_version;
    end if;
  end if;

  id := v_id;
  ya_existia := v_existed;
  contenido_hash := v_stored;
  return next;
end;
