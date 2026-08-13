declare
  v_gym    uuid;
  v_email  text;
  v_nombre text;
  v_code   text;
  v_auth   uuid;
  v_bytes  bytea;
  i        int;
  v_alpha  constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';  
begin
  if (select auth.uid()) is null then
    raise exception 'No autenticado';
  end if;

  select c.gym_id, c.email, c.nombre, c.claim_code, c.auth_user_id
    into v_gym, v_email, v_nombre, v_code, v_auth
    from public.clientes c where c.id = p_cliente_id;
  if v_gym is null then
    raise exception 'Cliente no encontrado';
  end if;

  if not public.is_staff_of(v_gym) then
    raise exception 'No autorizado';
  end if;

  if v_auth is not null then
    raise exception 'La cuenta ya está activa';
  end if;

  if v_code is null then
    loop
      v_code := '';
      v_bytes := extensions.gen_random_bytes(8);
      for i in 0..7 loop
        v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 34) + 1, 1);
      end loop;
      begin
        update public.clientes set claim_code = v_code where id = p_cliente_id;
        exit;
      exception when unique_violation then
        
      end;
    end loop;
  end if;

  return query
    select v_code, v_email, v_nombre, g.slug, g.brand_name, v_gym
      from public.gym g where g.id = v_gym;
end;
