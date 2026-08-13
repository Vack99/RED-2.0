select cliente_id, count(*)::int as n
  from public.asistencias
  where gym_id = p_gym_id and deleted_at is null and fecha >= p_desde and not perdonada
  group by cliente_id;
