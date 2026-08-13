declare
  v_gym uuid := public.staff_gym();
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  return public.materialize_week_for_gym(v_gym, p_week_start);
end;
