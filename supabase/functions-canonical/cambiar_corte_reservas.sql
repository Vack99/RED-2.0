declare
  v_gym uuid;
begin
  
  
  
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  
  
  
  
  update public.gym set corte_reservas = p_activar where id = v_gym;
  if not found then raise exception 'Gimnasio no encontrado'; end if;
end;
