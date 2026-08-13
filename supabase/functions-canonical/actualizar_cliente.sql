declare
  v_uid         uuid := (select auth.uid());
  v_before_email text;
  v_auth_user_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  
  
  
  select c.email, c.auth_user_id into v_before_email, v_auth_user_id
    from public.clientes c where c.id = p_cliente_id;

  if p_email is not null and v_auth_user_id is not null then
    raise exception 'No se puede editar el correo de una cuenta activa';
  end if;

  
  
  
  begin
    update public.clientes
       set nombre = p_nombre,
           tel    = p_tel,
           email  = coalesce(p_email, email)
     where id = p_cliente_id;          
  exception when unique_violation then
    raise exception 'Este correo ya pertenece a otro registro de este gym';
  end;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  email_changed := p_email is not null and p_email is distinct from v_before_email;
  unclaimed     := v_auth_user_id is null;
  return next;
end;
