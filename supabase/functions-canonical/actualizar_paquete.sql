declare v_uid uuid; v_nombre text;
begin
  v_uid := (select auth.uid()); if v_uid is null then raise exception 'No autenticado'; end if;
  
  v_nombre := case when p_clases is null then 'Ilimitado' when p_clases = 1 then '1 clase' else p_clases::text || ' clases' end;
  if p_popular then
    
    
    
    
    update public.paquetes set popular = false
     where popular and id <> p_id
       and gym_id = (select p2.gym_id from public.paquetes p2 where p2.id = p_id);
  end if;
  update public.paquetes set nombre = v_nombre, clases = p_clases, precio = p_precio, popular = p_popular,
         vigencia_tipo = 'dias', vigencia_dias = 30 where id = p_id;
  if not found then raise exception 'Paquete no encontrado'; end if;
end;
