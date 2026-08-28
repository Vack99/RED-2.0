with zona as (
    
    
    
    
    select (select g.timezone
              from public.clientes c
              join public.gym g on g.id = c.gym_id
             where c.id = p_cliente_id) as tz
  ),
  marcas as (
    select 1 as uno
      from public.asistencias a
     where a.cliente_id = p_cliente_id
       and a.deleted_at is null
       and not a.perdonada
       
       and not exists (select 1 from public.reservation r
                        where r.id = a.reservation_id and r.consumio)
       and case
             when a.hora is not null
               then ((a.fecha + a.hora) at time zone (select tz from zona)) >= p_desde
             else a.fecha >= (p_desde at time zone (select tz from zona))::date
           end
  ),
  reservas as (
    select (s.starts_at + (s.duration_min * interval '1 minute')) <= now() as terminada,
           not exists (select 1 from public.asistencias a
                        where a.reservation_id = r.id and a.deleted_at is null) as sin_marca
      from public.reservation r
      join public.class_session s on s.id = r.class_session_id
     where r.member_id = p_cliente_id
       and r.consumio
       and r.status <> 'cancelada'
       and r.created_at >= p_desde
  )
  select ((select count(*) from marcas) + (select count(*) from reservas where terminada))::integer,
         (select count(*) from reservas where not terminada)::integer,
         (select count(*) from reservas where terminada and sin_marca)::integer;
