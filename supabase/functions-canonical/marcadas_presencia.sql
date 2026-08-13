select coalesce(jsonb_object_agg(fecha_txt, n), '{}'::jsonb)
  from (
    select fecha::text as fecha_txt, count(distinct cliente_id) as n
    from public.asistencias
    where gym_id = p_gym_id
      and deleted_at is null
      and fecha >= p_desde
      and fecha < p_hasta
    group by fecha
  ) t;
