declare
  v_uid    uuid := (select auth.uid());
  v_gym    uuid;
  v_starts timestamptz;
  v_dur    int;
  v_member uuid;
  v_clases int;
  v_res_id uuid;
  v_status text;
  v_consumio boolean;   
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  
  select gym_id, starts_at, duration_min into v_gym, v_starts, v_dur
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  
  
  
  if p_cliente_id is null then
    select c.id, c.clases_restantes into v_member, v_clases
      from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
    if not found then
      raise exception 'No eres miembro de este gimnasio';
    end if;
  else
    if not public.is_staff_of(v_gym) then
      raise exception 'No autorizado';
    end if;
    select c.id, c.clases_restantes into v_member, v_clases
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  
  
  
  
  
  
  if v_starts <= now() then
    if now() < v_starts + (v_dur * interval '1 minute') then
      raise exception 'La clase ya comenzó';
    else
      raise exception 'La clase ya pasó';
    end if;
  end if;

  
  
  
  
  select id, status into v_res_id, v_status
    from public.reservation where member_id = v_member and class_session_id = p_session_id;
  if v_res_id is null or v_status <> 'reservada' then
    raise exception 'No tienes una reserva activa en esta clase';
  end if;

  
  
  
  
  update public.reservation
     set status = 'cancelada', cancelled_at = now()
   where id = v_res_id and status = 'reservada'
   returning consumio into v_consumio;
  if not found then
    raise exception 'No tienes una reserva activa en esta clase';
  end if;

  
  
  
  
  
  
  
  if v_clases is not null and v_consumio then
    update public.clientes set clases_restantes = clientes.clases_restantes + 1
     where id = v_member
     returning clientes.clases_restantes into v_clases;
  end if;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   
  return next;
end;
