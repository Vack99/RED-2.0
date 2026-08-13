declare
  v_starts timestamptz;
  v_dur    int;
begin
  if public.staff_gym() is null then raise exception 'No autorizado'; end if;

  
  select starts_at, duration_min into v_starts, v_dur
    from public.class_session where id = p_session_id and cancelled_at is null;
  if not found then raise exception 'Sesión no encontrada o ya cancelada'; end if;

  
  
  
  
  
  
  
  
  if v_starts <= now() then
    if now() < v_starts + (v_dur * interval '1 minute') then
      raise exception 'La clase ya comenzó';
    else
      raise exception 'La clase ya pasó';
    end if;
  end if;

  update public.class_session set cancelled_at = now()
   where id = p_session_id and cancelled_at is null;   
  if not found then raise exception 'Sesión no encontrada o ya cancelada'; end if;

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  with liberadas as (
    update public.reservation
       set status = 'cancelada', cancelled_at = now()
     where class_session_id = p_session_id and status = 'reservada'
    returning member_id, consumio
  )
  update public.clientes c
     set clases_restantes = c.clases_restantes + 1
    from liberadas l
   where c.id = l.member_id and l.consumio and c.clases_restantes is not null;
end;
