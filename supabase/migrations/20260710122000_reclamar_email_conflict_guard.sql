-- Ruling D2 backstop, claim-time arm (findings 2026-07-08). Task 3 added the partial unique index
-- `clientes_email_gym_uq (gym_id, lower(email)) where email is not null`. That index is now reachable
-- at CLAIM time: reclamar_por_codigo OVERWRITES clientes.email with the verified login email, and the
-- create path of reclamar_o_crear_cliente INSERTS a row carrying the verified email. If that email
-- already belongs to another row in the gym, Postgres raises a raw 23505 (unique_violation) — an opaque
-- "duplicate key" the member can neither read nor act on. This migration re-emits both functions whole
-- (create or replace — SECURITY DEFINER posture, grants, and every other line preserved byte-for-byte)
-- with ONE change each: the email-writing statement is wrapped so a collision surfaces as a human,
-- actionable message instead of the raw constraint error. No behavior changes on the happy path.
-- Idempotent (create or replace). The one-time email backfill from 20260710030000 is NOT re-emitted
-- here (it is not part of either function body).

-- ── reclamar_por_codigo: guard the verified-email overwrite (20260708200002, body otherwise identical) ─
create or replace function public.reclamar_por_codigo(p_codigo text)
  returns table (gym_slug text)
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_conf  timestamptz;
  v_meta  jsonb;
  v_phone text;
  v_cli   uuid;
  v_gym   uuid;
  v_owns  int;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- Verified email is read from auth.users (the verified source), never a parameter.
  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_email, v_conf, v_meta
    from auth.users u where u.id = v_uid;
  if v_conf is null then
    raise exception 'Correo no verificado';
  end if;

  v_phone := nullif(v_meta ->> 'phone_e164', '');

  -- Resolve + lock the unclaimed row by its single-use code. A cleared/absent code resolves to nothing.
  select id, gym_id into v_cli, v_gym
    from public.clientes
    where claim_code = p_codigo
      and auth_user_id is null
    for update;
  if v_cli is null then
    raise exception 'Código de invitación inválido o ya utilizado';
  end if;

  -- Never mint a second row for a caller who already belongs to this gym (one-claim-per-gym index).
  select count(*) into v_owns from public.clientes
    where gym_id = v_gym and auth_user_id = v_uid;
  if v_owns > 0 then
    raise exception 'Ya tienes cuenta en este gimnasio';
  end if;

  -- The verified email overwrites the staff-typed one. It can now collide with the gym's email
  -- uniqueness index (D2); surface that as a human message, not a raw 23505.
  begin
    update public.clientes
       set auth_user_id = v_uid,
           email = v_email,                                  -- verified login email overwrites staff-typed
           phone_e164 = coalesce(v_phone, phone_e164),
           terms_accepted_at = now(),
           privacy_accepted_at = now(),
           claim_code = null                                 -- single-use: the token dies on claim
     where id = v_cli;
  exception when unique_violation then
    raise exception 'Este correo ya pertenece a otro registro de este gym';
  end;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, v_gym, 'member') on conflict (user_id, gym_id) do nothing;

  select slug into gym_slug from public.gym where id = v_gym;
  return next;
end;
$function$;

revoke execute on function public.reclamar_por_codigo(text) from public, anon;
grant execute on function public.reclamar_por_codigo(text) to authenticated;

-- ── reclamar_o_crear_cliente: guard the create-path email insert (20260710030000, body otherwise identical) ─
create or replace function public.reclamar_o_crear_cliente(p_gym_id uuid)
  returns table(cliente_id uuid, reclamado boolean)
  language plpgsql
  security definer
  set search_path to ''
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

  -- Verified email is read from auth.users (the verified source), never a parameter.
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
      -- Claim path: the row was matched ON email, so it already carries one. Untouched.
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
    -- Create path (Door 2, the online self-registrant): persist the VERIFIED email as the member's
    -- contact address. The insert can collide with the gym's email uniqueness index (D2) — e.g. a
    -- claimed row already holds this email; surface that as a human message, not a raw 23505.
    begin
      insert into public.clientes
        (gym_id, auth_user_id, nombre, tel, email, phone_e164, clases_restantes, terms_accepted_at, privacy_accepted_at)
        values (p_gym_id, v_uid, v_nombre, v_tel, v_email, v_phone, 0, now(), now())
        returning id into v_cli;
    exception when unique_violation then
      raise exception 'Este correo ya pertenece a otro registro de este gym';
    end;
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := v_reclamado; return next;
end;
$function$;
