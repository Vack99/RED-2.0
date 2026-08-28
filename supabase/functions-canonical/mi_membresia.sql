declare
  v_uid          uuid := (select auth.uid());
  v_cli          uuid;
  v_tz           text;
  v_anchor_fecha timestamptz;
  v_anchor_creado timestamptz;
  v_conteo_dia   date;
  v_usadas       int;
  v_apartadas    int;
  v_no_shows     int;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  
  
  
  select c.id, c.paquete_nombre, c.clases_restantes, c.vence
    into v_cli, paquete_nombre, clases_restantes, vence
    from public.clientes c
    where c.auth_user_id = v_uid and c.gym_id = p_gym_id;
  if v_cli is null then
    return;  
  end if;

  
  
  
  select g.timezone into v_tz from public.gym g where g.id = p_gym_id;

  
  
  
  
  
  select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias, v.clases
    into v_anchor_fecha, v_anchor_creado, anchor_monto, anchor_vigencia_tipo, anchor_vigencia_dias,
         grant_clases
    from public.ventas v
    where v.cliente_id = v_cli
    order by v.created_at desc, v.id desc
    limit 1;

  anchor_dia := (v_anchor_fecha at time zone v_tz)::date;  

  
  
  
  
  
  
  
  
  
  
  v_conteo_dia := (v_anchor_creado at time zone v_tz)::date;  
  if v_conteo_dia is not null then
    select count(*)::int into attended_since_purchase
      from public.asistencias a
      where a.cliente_id = v_cli
        and a.deleted_at is null
        and not a.perdonada
        and a.fecha >= v_conteo_dia;
  else
    attended_since_purchase := 0;
  end if;

  
  
  
  
  
  
  
  
  if v_anchor_creado is not null then
    select cc.usadas, cc.apartadas, cc.no_shows
      into v_usadas, v_apartadas, v_no_shows
      from public.conteo_cargable(v_cli, v_anchor_creado) cc;
    cargadas  := coalesce(v_usadas, 0);
    apartadas := coalesce(v_apartadas, 0);
  else
    cargadas  := 0;
    apartadas := 0;
  end if;

  return next;
end;
