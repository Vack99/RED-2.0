select coalesce(jsonb_object_agg(fecha_txt, cids), '{}'::jsonb)
  from (
    select fecha::text as fecha_txt, array_agg(distinct cliente_id) as cids
    from public.asistencias
    where gym_id = p_gym_id
      and deleted_at is null
      and fecha >= p_desde
      and fecha < p_hasta
    group by fecha
  ) t;
