declare
  v_gym      uuid;
  v_tz       text;
  v_hoy      date;
  v_alta     timestamptz;
  v_fecha_ts timestamptz;
begin
  
  
  
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  
  
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  
  
  
  
  
  
  
  
  if p_monto is null or p_monto < 1 then
    raise exception 'Monto inválido';
  end if;

  
  if p_fecha is not null then
    select g.timezone into v_tz from public.gym g where g.id = v_gym;
    v_hoy := (now() at time zone v_tz)::date;

    if p_fecha > v_hoy then
      raise exception 'La fecha de inicio no puede ser futura';
    end if;
    if p_fecha < v_hoy - 30 then
      raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad';
    end if;

    
    
    
    select c.created_at into v_alta
      from public.ventas v
      join public.clientes c on c.id = v.cliente_id
     where v.id = p_venta_id and v.gym_id = v_gym;
    if not found then raise exception 'Venta no encontrada'; end if;
    if p_fecha < (v_alta at time zone v_tz)::date then
      raise exception 'La fecha de inicio es anterior al alta del cliente';
    end if;

    v_fecha_ts := (p_fecha::timestamp + interval '12 hours') at time zone v_tz;
  end if;

  
  update public.ventas set monto = p_monto, metodo = p_metodo, fecha = coalesce(v_fecha_ts, fecha)
   where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;
end;
