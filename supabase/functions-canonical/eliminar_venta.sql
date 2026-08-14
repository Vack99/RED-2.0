declare
  v_gym   uuid;
  v_venta record;
  v_dias  integer;
begin
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  
  
  
  
  select v.cliente_id, v.clases, v.vigencia_tipo, v.vigencia_dias, v.created_at into v_venta
    from public.ventas v
    where v.id = p_venta_id and v.gym_id = v_gym
    for update;
  if not found then raise exception 'Venta no encontrada'; end if;

  
  if v_venta.created_at < now() - interval '30 days' then
    raise exception 'La venta ya no se puede eliminar';
  end if;

  
  perform 1 from public.clientes c where c.id = v_venta.cliente_id for update;

  
  
  delete from public.ventas where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;

  
  v_dias := case when v_venta.vigencia_tipo = 'mes' then 30
                 else coalesce(v_venta.vigencia_dias, 0) end;

  
  
  
  
  update public.clientes c
     set clases_restantes = case when c.clases_restantes is null then null
                                 else greatest(0, c.clases_restantes - coalesce(v_venta.clases, 0)) end,
         vence = case when c.vence is null then null else c.vence - v_dias end,
         paquete_nombre = (select v.paquete_nombre from public.ventas v
                            where v.cliente_id = c.id and v.gym_id = v_gym
                            order by v.created_at desc, v.id desc
                            limit 1)
   where c.id = v_venta.cliente_id;
end;
