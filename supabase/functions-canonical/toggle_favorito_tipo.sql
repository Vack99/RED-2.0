declare
  v_uid     uuid := (select auth.uid());
  v_member  uuid;
  v_current uuid;
  v_ct_gym  uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  
  
  select c.id, c.favorite_class_type_id into v_member, v_current
    from public.clientes c
    where c.auth_user_id = v_uid and c.gym_id = p_gym_id;
  if not found then
    raise exception 'No eres miembro de este gimnasio';
  end if;

  
  select ct.gym_id into v_ct_gym from public.class_type ct where ct.id = p_class_type_id;
  if not found or v_ct_gym <> p_gym_id then
    raise exception 'Tipo de clase no encontrado';
  end if;

  
  
  if v_current is not distinct from p_class_type_id then
    update public.clientes set favorite_class_type_id = null where clientes.id = v_member;
    favorito := null;
  else
    update public.clientes set favorite_class_type_id = p_class_type_id where clientes.id = v_member;
    favorito := p_class_type_id;
  end if;
  return next;
end;
