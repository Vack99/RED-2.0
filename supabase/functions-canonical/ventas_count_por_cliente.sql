select cliente_id, count(*)::int as n
  from public.ventas
  where gym_id = p_gym_id and cliente_id is not null
  group by cliente_id;
