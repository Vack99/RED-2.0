declare
  v_uid    uuid := (select auth.uid());
  v_gym    uuid;
  v_starts timestamptz;
  v_tz     text;
  v_fecha  date;
  v_clases int;          
  v_vence  date;         
  v_res_id uuid;
  v_status text;
  v_walk   boolean;
  v_asis_id       uuid;
  v_asis_consumio boolean;
  v_consumio boolean;
  v_perdonada boolean := false;   
  v_hora     time;
  v_saldo    int;                 
  v_resultado text;               
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  
  select gym_id, starts_at into v_gym, v_starts
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  
  
  
  
  
  
  
  
  
  
  
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  
  
  
  select c.clases_restantes, c.vence into v_clases, v_vence
    from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  
  select timezone into v_tz from public.gym where id = v_gym;
  v_fecha := (v_starts at time zone v_tz)::date;

  
  select id, status, is_walk_in into v_res_id, v_status, v_walk
    from public.reservation where member_id = p_cliente_id and class_session_id = p_session_id;
  select id, consumio into v_asis_id, v_asis_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and class_session_id = p_session_id and deleted_at is null
   order by created_at desc limit 1;

  
  if v_asis_id is not null then
    update public.asistencias set deleted_at = now() where id = v_asis_id;
    
    
    if v_asis_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clientes.clases_restantes + 1 where id = p_cliente_id;
    end if;
    
    
    if v_res_id is not null then
      if v_walk then
        update public.reservation set status = 'cancelada', cancelled_at = now(), checked_at = null where id = v_res_id;
      else
        update public.reservation set status = 'reservada', checked_at = null where id = v_res_id;
      end if;
    end if;
    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    
    return query select false, null::text, p_session_id, v_saldo, null::text;
    return;
  end if;

  
  
  
  
  
  v_hora := (v_starts at time zone v_tz)::time;

  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    
    
    
    
    update public.reservation set status = 'asistida', checked_at = now() where id = v_res_id;
    v_consumio := false;
    v_resultado := 'reserva';
  else
    
    
    
    
    
    
    
    
    
    if v_vence is not null and v_vence < v_fecha then
      raise exception 'Paquete vencido';
    end if;
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    if public.visita_reciente(p_cliente_id, v_fecha, false) then
      v_consumio := false;
      v_perdonada := true;
      v_resultado := 'gratis';   
    else
      
      
      
      
      
      
      
      if v_clases is not null and v_clases <= 0 then
        raise exception 'Sin clases disponibles';
      end if;
      v_consumio := (v_clases is not null);
      
      
      v_resultado := case when v_consumio then 'descontada' else 'gratis' end;
    end if;
    if v_res_id is not null then
      update public.reservation
         set status = 'asistida', is_walk_in = true, checked_at = now(), cancelled_at = null
       where id = v_res_id;
    else
      insert into public.reservation (gym_id, class_session_id, member_id, status, is_walk_in, checked_at)
      values (v_gym, p_session_id, p_cliente_id, 'asistida', true, now())
      returning id into v_res_id;
    end if;
    if v_consumio then
      update public.clientes set clases_restantes = clientes.clases_restantes - 1
       where id = p_cliente_id and clientes.clases_restantes > 0;   
    end if;
  end if;

  
  
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, class_session_id, reservation_id, origen, perdonada)
  values (p_cliente_id, v_fecha, v_hora, v_consumio, v_gym, p_session_id, v_res_id, 'clase', v_perdonada);

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), p_session_id, v_saldo, v_resultado;
end;
