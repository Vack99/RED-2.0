select
    cliente_id,
    max(fecha) as ultima_visita,
    max(fecha) filter (where consumio) as ultima_visita_consumida
  from public.asistencias
  where gym_id = p_gym_id and deleted_at is null
  group by cliente_id;
