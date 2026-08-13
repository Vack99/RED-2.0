declare v_uid uuid; v_gym uuid;
begin
  v_uid := (select auth.uid()); if v_uid is null then raise exception 'No autenticado'; end if;
  select gym_id into v_gym from public.paquetes where id = p_plan_id;  
  if v_gym is null then raise exception 'Paquete no encontrado'; end if;
  delete from public.plan_feature where plan_id = p_plan_id;           
  insert into public.plan_feature (gym_id, plan_id, label, orden)
    select v_gym, p_plan_id, btrim(t.label), (t.ord - 1)::int
      from unnest(p_labels) with ordinality as t(label, ord)
     where btrim(t.label) <> '';                                       
end;
