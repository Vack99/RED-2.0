select exists (
    select 1 from public.asistencias
     where cliente_id = p_cliente_id
       and fecha = p_fecha
       and deleted_at is null
       and (class_session_id is not null) = p_clase
       and not perdonada
       and created_at >= now() - interval '15 minutes'
  );
