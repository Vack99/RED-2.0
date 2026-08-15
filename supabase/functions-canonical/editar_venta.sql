declare
  v_gym            uuid;
  v_tz             text;
  v_hoy            date;
  v_fecha_ts       timestamptz;
  v_fecha_dia      date;
  v_custom         boolean;
  v_paq            record;
  v_venta          record;
  v_cli            record;
  v_nombre         text;
  v_clases         integer;      
  v_vig_tipo       text;
  v_vig_dias       integer;
  v_person         boolean;
  v_cambio_grant   boolean;
  v_cambio_paquete boolean;
  v_cambio_fecha   boolean;
  v_dias_old       integer;
  v_dias_new       integer;
  v_anchor         date;         
  v_fecha_old_dia  date;         
  v_base_clases    integer;      
  v_base_vence     date;
  v_base_dias      integer;
  v_new_clases     integer;      
  v_new_vence      date;
begin
  
  
  
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  
  
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  
  
  
  
  
  if p_monto is null or p_monto < 1 then
    raise exception 'Monto inválido';
  end if;

  
  
  
  v_custom := (p_custom_nombre is not null
               or p_custom_clases is not null
               or p_custom_dias is not null
               or coalesce(p_custom_ilimitado, false));
  if v_custom and p_paquete_id is not null then
    raise exception 'Venta inválida: elige un paquete o define uno personalizado';
  end if;

  
  
  
  
  
  
  
  select v.cliente_id, v.paquete_nombre, v.clases, v.vigencia_tipo, v.vigencia_dias,
         v.personalizado, v.fecha, v.created_at
    into v_venta
    from public.ventas v
    where v.id = p_venta_id and v.gym_id = v_gym
    for update;
  if not found then raise exception 'Venta no encontrada'; end if;

  
  
  select g.timezone into v_tz from public.gym g where g.id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;

  
  
  if p_paquete_id is not null then
    
    
    select p.nombre, p.clases, p.vigencia_tipo, p.vigencia_dias into v_paq
      from public.paquetes p where p.id = p_paquete_id and p.gym_id = v_gym;
    if not found then raise exception 'Paquete no encontrado'; end if;
    v_nombre   := v_paq.nombre;
    v_clases   := v_paq.clases;
    v_vig_tipo := v_paq.vigencia_tipo;
    v_vig_dias := v_paq.vigencia_dias;
    v_person   := false;
  elsif v_custom then
    
    
    v_nombre := trim(coalesce(p_custom_nombre, ''));
    if length(v_nombre) < 3 or length(v_nombre) > 40 then
      raise exception 'Nombre del paquete personalizado inválido';
    end if;
    if p_custom_dias is null or p_custom_dias < 1 or p_custom_dias > 365 then
      raise exception 'Vigencia personalizada inválida';
    end if;
    
    
    if coalesce(p_custom_ilimitado, false) then
      if p_custom_clases is not null then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_clases := null;
    else
      if p_custom_clases is null or p_custom_clases < 1 or p_custom_clases > 365 then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_clases := p_custom_clases;
    end if;
    v_vig_tipo := 'dias';
    v_vig_dias := p_custom_dias;
    v_person   := true;
  else
    
    
    
    v_nombre   := v_venta.paquete_nombre;
    v_clases   := v_venta.clases;
    v_vig_tipo := v_venta.vigencia_tipo;
    v_vig_dias := v_venta.vigencia_dias;
    v_person   := v_venta.personalizado;
  end if;

  
  
  
  
  if p_fecha is not null then
    if p_fecha > v_hoy then
      raise exception 'La fecha de inicio no puede ser futura';
    end if;
    if p_fecha < v_hoy - 30 then
      raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad';
    end if;
    v_fecha_ts := (p_fecha::timestamp + interval '12 hours') at time zone v_tz;
  end if;
  
  
  v_fecha_old_dia := (v_venta.fecha at time zone v_tz)::date;
  v_fecha_dia     := coalesce(p_fecha, v_fecha_old_dia);

  
  v_cambio_grant   := (v_clases   is distinct from v_venta.clases)
                   or (v_vig_tipo is distinct from v_venta.vigencia_tipo)
                   or (v_vig_dias is distinct from v_venta.vigencia_dias);
  v_cambio_paquete := v_cambio_grant
                   or (v_nombre is distinct from v_venta.paquete_nombre)
                   or (v_person is distinct from v_venta.personalizado);
  v_cambio_fecha   := p_fecha is not null
                  and p_fecha is distinct from v_fecha_old_dia;

  
  
  
  if (v_cambio_grant or v_cambio_fecha) and v_venta.created_at < now() - interval '30 days' then
    raise exception 'Ya pasaron 30 días: esta venta ya no se puede recalcular';
  end if;

  
  
  
  
  if (v_cambio_grant or v_cambio_fecha)
     and exists (select 1 from public.ventas v
                  where v.cliente_id = v_venta.cliente_id
                    and v.gym_id = v_gym
                    and (v.created_at, v.id) > (v_venta.created_at, p_venta_id)) then
    raise exception 'Solo la venta más reciente puede cambiar de paquete o fecha';
  end if;

  
  
  
  
  update public.ventas
     set monto = p_monto, metodo = p_metodo, fecha = coalesce(v_fecha_ts, fecha),
         paquete_nombre = v_nombre, clases = v_clases,
         vigencia_tipo = v_vig_tipo, vigencia_dias = v_vig_dias, personalizado = v_person
   where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;

  
  if not (v_cambio_grant or v_cambio_fecha) then
    
    
    if v_cambio_paquete then
      update public.clientes c
         set paquete_nombre = (select v.paquete_nombre from public.ventas v
                                where v.cliente_id = c.id and v.gym_id = v_gym
                                order by v.created_at desc, v.id desc
                                limit 1)
       where c.id = v_venta.cliente_id and c.gym_id = v_gym;   
    end if;
    
    return;
  end if;

  
  
  select c.clases_restantes, c.vence into v_cli
    from public.clientes c where c.id = v_venta.cliente_id
    for update;

  
  
  v_dias_old    := case when v_venta.vigencia_tipo = 'mes' then 30
                        else coalesce(v_venta.vigencia_dias, 0) end;
  v_base_clases := case when v_cli.clases_restantes is null then null
                        else v_cli.clases_restantes - coalesce(v_venta.clases, 0) end;

  
  
  
  
  
  
  
  v_anchor     := case when v_cli.vence is null then null else v_cli.vence - v_dias_old end;
  v_base_vence := case when v_anchor is null              then null
                       when v_anchor > v_fecha_old_dia    then v_anchor
                       else null end;

  
  v_dias_new := case when v_vig_tipo = 'mes' then 30 else coalesce(v_vig_dias, 0) end;

  
  
  
  
  
  if v_base_vence is not null and (v_base_vence - v_fecha_dia) >= 0 then
    v_base_dias := v_base_vence - v_fecha_dia;
  else
    v_base_dias   := 0;
    v_base_clases := 0;
  end if;

  
  
  if v_clases is null then
    v_new_clases := null;                                   
  elsif v_base_clases is null then
    v_new_clases := v_clases;                               
  else
    v_new_clases := greatest(0, v_base_clases + v_clases);
  end if;
  v_new_vence := v_fecha_dia + v_base_dias + v_dias_new;

  
  
  
  
  
  
  
  update public.clientes c
     set clases_restantes = v_new_clases,
         vence            = v_new_vence,
         paquete_nombre   = (select v.paquete_nombre from public.ventas v
                              where v.cliente_id = c.id and v.gym_id = v_gym
                              order by v.created_at desc, v.id desc
                              limit 1)
   where c.id = v_venta.cliente_id and c.gym_id = v_gym;
end;
