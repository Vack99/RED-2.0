declare
  v_gym uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'No autenticado';
  end if;

  select gym_id into v_gym from public.clientes where id = p_cliente_id;
  if v_gym is null then
    raise exception 'Cliente no encontrado';
  end if;

  if not public.is_staff_of(v_gym) then
    raise exception 'No autorizado';
  end if;

  update public.clientes set invitacion_enviada_at = now() where id = p_cliente_id;
end;
