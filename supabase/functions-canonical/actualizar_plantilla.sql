declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.plantillas set nombre = p_nombre, body = p_body where id = p_id; 
  if not found then raise exception 'Plantilla no encontrada'; end if;
end;
