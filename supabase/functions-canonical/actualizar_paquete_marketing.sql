declare v_uid uuid;
begin
  v_uid := (select auth.uid()); if v_uid is null then raise exception 'No autenticado'; end if;
  update public.paquetes
     set code     = nullif(btrim(p_code), ''),
         name     = nullif(btrim(p_name), ''),
         subtitle = nullif(btrim(p_subtitle), ''),
         badge    = nullif(btrim(p_badge), ''),
         cadence  = nullif(btrim(p_cadence), '')
   where id = p_id;                 
  if not found then raise exception 'Paquete no encontrado'; end if;
end;
