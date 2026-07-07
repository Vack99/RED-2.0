-- Close the self-registration Ilimitado hole (Defect B). A fresh, unmatched self-registrant must start
-- with a FINITE zero balance, not NULL (= Ilimitado), so reservar_clase blocks them until a sale grants
-- classes AND the later sale stacks correctly. Body identical to the live Contract-B definition
-- (20260705082018) except the create-path INSERT now sets clases_restantes = 0. Idempotent create-or-replace;
-- SECURITY DEFINER / search_path='' / EXECUTE grants preserved. Expand-only, Forge-safe, out-of-order-safe.
create or replace function public.reclamar_o_crear_cliente(p_gym_id uuid)
  returns table (cliente_id uuid, reclamado boolean)
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_conf   timestamptz;
  v_meta   jsonb;
  v_nombre text;
  v_phone  text;
  v_tel    text;
  v_cli    uuid;
  v_n      int;
  v_reclamado boolean := false;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_email, v_conf, v_meta
    from auth.users u where u.id = v_uid;
  if v_conf is null then
    raise exception 'Correo no verificado';
  end if;

  v_nombre := coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), split_part(v_email, '@', 1));
  v_phone  := nullif(v_meta ->> 'phone_e164', '');

  select id into v_cli from public.clientes
    where gym_id = p_gym_id and auth_user_id = v_uid
    limit 1;
  if v_cli is not null then
    insert into public.gym_membership (user_id, gym_id, role)
      values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;
    cliente_id := v_cli; reclamado := false; return next; return;
  end if;

  select count(*) into v_n from public.clientes
    where gym_id = p_gym_id and auth_user_id is null and lower(email) = lower(v_email);

  if v_n = 1 then
    select id into v_cli from public.clientes
      where gym_id = p_gym_id and auth_user_id is null and lower(email) = lower(v_email)
      for update;
    if v_cli is not null then
      update public.clientes
         set auth_user_id = v_uid,
             phone_e164 = coalesce(v_phone, phone_e164),
             terms_accepted_at = now(),
             privacy_accepted_at = now()
       where id = v_cli and auth_user_id is null;
      if found then
        v_reclamado := true;
      else
        v_cli := null;
      end if;
    end if;
  end if;

  if v_cli is null then
    if v_phone is null then
      raise exception 'Teléfono requerido';
    end if;
    v_tel := right(regexp_replace(v_phone, '\D', '', 'g'), 10);
    insert into public.clientes
      (gym_id, auth_user_id, nombre, tel, phone_e164, clases_restantes, terms_accepted_at, privacy_accepted_at)
      values (p_gym_id, v_uid, v_nombre, v_tel, v_phone, 0, now(), now())
      returning id into v_cli;
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := v_reclamado; return next;
end;
$function$;
