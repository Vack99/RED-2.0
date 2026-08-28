declare
  v_uid       uuid := (select auth.uid());
  v_gym       uuid;
  v_cap       int;
  v_cancelled timestamptz;
  v_starts    timestamptz;          
  v_member    uuid;
  v_clases    int;
  v_vence     date;
  v_tz        text;
  v_reservas  boolean;              
  v_hoy       date;
  v_sesion_fecha date;              
  v_active    int;
  v_res_id    uuid;
  v_status    text;
  v_consumio  boolean := false;   
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  
  
  select gym_id, capacity, cancelled_at, starts_at into v_gym, v_cap, v_cancelled, v_starts
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_cancelled is not null then
    raise exception 'Clase cancelada';
  end if;

  
  
  
  if v_starts <= now() then
    raise exception 'La clase ya comenzó';
  end if;

  
  
  
  if p_cliente_id is null then
    
    
    select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
      from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
    if not found then
      raise exception 'No eres miembro de este gimnasio';
    end if;
  else
    
    
    
    
    if not public.is_staff_of(v_gym) then
      raise exception 'No autorizado';
    end if;
    
    select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  
  select timezone, booking_enabled into v_tz, v_reservas from public.gym where id = v_gym;

  
  
  if not v_reservas then
    raise exception 'Reservas deshabilitadas';
  end if;

  
  
  
  v_hoy := (now() at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_hoy then
    raise exception 'Paquete vencido';
  end if;

  
  
  
  v_sesion_fecha := (v_starts at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_sesion_fecha then
    raise exception 'Paquete vencido';
  end if;

  
  
  if v_clases is not null and v_clases <= 0 then
    raise exception 'Sin clases disponibles';
  end if;

  
  
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_session_id::text));

  
  
  select id, status into v_res_id, v_status
    from public.reservation where member_id = v_member and class_session_id = p_session_id;
  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    raise exception 'Ya reservaste esta clase';
  end if;

  
  
  select coalesce((select activos from public.contar_reservas_activas_miembro(array[p_session_id])), 0)
    into v_active;
  if v_active >= v_cap then
    raise exception 'Clase llena';
  end if;

  
  
  
  if v_res_id is not null then
    update public.reservation
       set status = 'reservada', is_walk_in = false, cancelled_at = null, checked_at = null,
           
           
           created_at = now()
     where id = v_res_id;
  else
    insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (v_gym, p_session_id, v_member, 'reservada')
    returning id into v_res_id;
  end if;

  
  
  
  if v_clases is not null then
    update public.clientes set clases_restantes = clientes.clases_restantes - 1
     where id = v_member and clientes.clases_restantes > 0
     returning clientes.clases_restantes into v_clases;
    if not found then
      raise exception 'Sin clases disponibles';
    end if;
    v_consumio := true;   
  end if;

  
  
  update public.reservation set consumio = v_consumio where id = v_res_id;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   
  return next;
end;
