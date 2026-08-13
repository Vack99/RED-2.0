declare
  v_uid   uuid := (select auth.uid());
  v_key   text;
  v_email text;
  v_conf  timestamptz;
  v_meta  jsonb;
  v_phone text;
  v_cli   uuid;
  v_gym   uuid;
  v_owns  int;
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
     encode(extensions.hmac('activar:v1:' || p_codigo, v_key, 'sha256'), 'hex') then
    raise exception 'Firma de activación inválida';
  end if;

  
  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_email, v_conf, v_meta
    from auth.users u where u.id = v_uid;
  if v_conf is null then
    raise exception 'Correo no verificado';
  end if;

  v_phone := nullif(v_meta ->> 'phone_e164', '');

  
  
  
  select id, gym_id into v_cli, v_gym
    from public.clientes
    where claim_code = p_codigo
      and auth_user_id is null
    for update;
  if v_cli is null then
    raise exception 'Código de invitación inválido o ya utilizado';
  end if;

  
  select count(*) into v_owns from public.clientes
    where gym_id = v_gym and auth_user_id = v_uid;
  if v_owns > 0 then
    raise exception 'Ya tienes cuenta en este gimnasio';
  end if;

  update public.clientes
     set auth_user_id = v_uid,
         email = v_email,                                  
         phone_e164 = coalesce(v_phone, phone_e164),
         terms_accepted_at = now(),
         privacy_accepted_at = now(),
         privacy_aviso_version = p_aviso_version,
         claim_code = null                                 
   where id = v_cli;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, v_gym, 'member') on conflict (user_id, gym_id) do nothing;

  select slug into gym_slug from public.gym where id = v_gym;
  return next;
end;
