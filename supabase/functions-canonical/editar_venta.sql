declare
  v_gym uuid;
begin
  
  
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  
  update public.ventas set monto = p_monto, metodo = p_metodo
   where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;
end;
