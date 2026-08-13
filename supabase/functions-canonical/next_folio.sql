declare v_folio bigint;
begin
  if not public.is_staff_of(p_gym) then
    raise exception 'next_folio: caller is not staff of gym %', p_gym;
  end if;
  insert into public.gym_folio_counter (gym_id, last_folio)
    values (p_gym, coalesce((select max(folio) from public.ventas where gym_id = p_gym), 1000))
    on conflict (gym_id) do nothing;
  update public.gym_folio_counter
     set last_folio = last_folio + 1
   where gym_id = p_gym
   returning last_folio into v_folio;
  return v_folio;
end;
