begin
  if not public.is_staff_of(p_gym_id) then
    raise exception 'No autorizado';
  end if;

  return query
    select g.legal_name, gl.domicilio, gl.email_arco, gl.area_datos_personales
    from public.gym g
    left join public.gym_legal gl on gl.gym_id = g.id
    where g.id = p_gym_id;
end;
