declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  delete from public.plantillas where id = p_id; 
  if not found then raise exception 'Plantilla no encontrada'; end if;
end;
