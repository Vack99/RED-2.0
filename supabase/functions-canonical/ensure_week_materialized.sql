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
  return public.materialize_week_for_gym(v_gym, p_week_start);
end;
