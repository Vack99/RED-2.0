declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_gym uuid;
  v_tz text;
  v_vence date;                     
  v_active_id uuid;
  v_active_consumio boolean;
  v_consumio boolean;
  v_perdonada boolean := false;     
  v_hora time;
  v_booked uuid;                    
  v_marcada text;                   
  v_saldo int;                      
  v_resultado text;                 
begin
  
  
  
  
  
  
  if p_session_id is not null then
    return query select * from public.pasar_lista_sesion(p_session_id, p_cliente_id);
    return;
  end if;

  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  
  
  
  
  
  
  
  
  
  
  
  
  
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  
  select c.clases_restantes, c.gym_id, c.vence into v_clases, v_gym, v_vence
    from public.clientes c where c.id = p_cliente_id;   
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  
  select timezone into v_tz from public.gym where id = v_gym;

  
  
  
  
  select id, consumio into v_active_id, v_active_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and fecha = p_fecha and deleted_at is null
     and class_session_id is null
   order by created_at desc
   limit 1;

  if v_active_id is not null then
    
    update public.asistencias set deleted_at = now() where id = v_active_id;
    if v_active_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clientes.clases_restantes + 1 where id = p_cliente_id;
    end if;
    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    
    return query select false, null::text, null::uuid, v_saldo, null::text;
    return;
  end if;

  

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  select cs.id into v_booked
    from public.reservation r
    join public.class_session cs on cs.id = r.class_session_id
   where r.member_id = p_cliente_id
     and r.status = 'reservada'
     and r.is_walk_in = false
     and cs.cancelled_at is null
     and (cs.starts_at at time zone v_tz)::date = p_fecha
     and public.ventana_arribo(cs.starts_at, cs.duration_min) @> now()
   order by abs(extract(epoch from (cs.starts_at - now()))) asc
   limit 1;

  if v_booked is not null then
    
    
    
    return query select * from public.pasar_lista_sesion(v_booked, p_cliente_id);
    return;
  end if;

  
  
  
  
  
  select to_char(cs.starts_at at time zone v_tz, 'HH24:MI') into v_marcada
    from public.reservation r
    join public.class_session cs on cs.id = r.class_session_id
   where r.member_id = p_cliente_id
     and r.status = 'asistida'
     and r.is_walk_in = false
     and cs.cancelled_at is null
     and (cs.starts_at at time zone v_tz)::date = p_fecha
     and public.ventana_arribo(cs.starts_at, cs.duration_min) @> now()
   order by abs(extract(epoch from (cs.starts_at - now()))) asc
   limit 1;
  if v_marcada is not null then
    raise exception 'Ya marcada en la clase de %', v_marcada;
  end if;

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  if v_vence is not null and v_vence < p_fecha then
    raise exception 'Paquete vencido';
  end if;
  
  
  
  
  
  
  
  
  
  
  if public.visita_reciente(p_cliente_id, p_fecha, true) then
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

  v_hora := case
    when p_fecha = (now() at time zone v_tz)::date
      then (now() at time zone v_tz)::time
    else null
  end;

  
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, origen, perdonada)
  values (p_cliente_id, p_fecha, v_hora, v_consumio, v_gym, 'libre', v_perdonada);

  if v_consumio then
    update public.clientes set clases_restantes = clientes.clases_restantes - 1
     where id = p_cliente_id and clientes.clases_restantes > 0;   
  end if;

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), null::uuid, v_saldo, v_resultado;
end;
