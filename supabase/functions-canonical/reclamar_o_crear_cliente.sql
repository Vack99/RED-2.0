declare
  v_uid    uuid := (select auth.uid());
  v_key    text;
  v_email  text;
  v_conf   timestamptz;
  v_phone  text;
  v_cli    uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  
  
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'tenant_assertion_key';
  if v_key is null then
    raise exception 'Configuración incompleta: tenant_assertion_key ausente';
  end if;
  if p_firma is distinct from
     encode(extensions.hmac(v_uid::text || ':' || p_gym_id::text, v_key, 'sha256'), 'hex') then
    raise exception 'Firma de tenant inválida';
  end if;

  
  select u.email, u.email_confirmed_at, nullif(u.raw_user_meta_data ->> 'phone_e164', '')
    into v_email, v_conf, v_phone
    from auth.users u where u.id = v_uid;
  if v_conf is null then
    raise exception 'Correo no verificado';
  end if;

  
  
  select id into v_cli from public.clientes
    where gym_id = p_gym_id and auth_user_id = v_uid
    limit 1;
  if v_cli is not null then
    insert into public.gym_membership (user_id, gym_id, role)
      values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;
    cliente_id := v_cli; reclamado := false; return next; return;
  end if;

  
  
  
  
  select id into v_cli from public.clientes
    where gym_id = p_gym_id and auth_user_id is null and lower(email) = lower(v_email)
    for update;
  if v_cli is not null then
    update public.clientes
       set auth_user_id = v_uid,
           phone_e164 = coalesce(v_phone, phone_e164),
           terms_accepted_at = now(),
           privacy_accepted_at = now(),
           privacy_aviso_version = p_aviso_version
     where id = v_cli and auth_user_id is null;   
    if not found then v_cli := null; end if;
  end if;

  if v_cli is null then
    raise exception 'Sin registro en este gimnasio';
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := true; return next;
end;
