-- Issue #78 — `reclamar_o_crear_cliente` dropped the verified email on its CREATE path.
--
-- The function already reads the verified address from auth.users into `v_email` and uses it to
-- SEARCH for a staff-created row to claim. On the create path (no matching row — i.e. every online
-- self-registrant, "Door 2") it inserted without the `email` column at all, so `v_email` was read
-- and discarded. Its sibling `reclamar_por_codigo` writes `email = v_email` correctly
-- (20260708200002), which is why invite-claimers carried an email and self-registrants did not.
--
-- Consequence: every self-registered member landed with `clientes.email IS NULL`, violating user
-- story #19 of spec #64 ("the email I verified at signup becomes my contact email on the gym's
-- record") and blinding staff — a claimed row is rendered "Cuenta activa", never "Sin email" (#79).
--
-- Two changes, both expand-only and Forge-safe:
--   1. `create or replace` adds `email` to the create-path insert. Signature unchanged; grants and
--      the SECURITY DEFINER posture are preserved by `create or replace`.
--   2. A one-time backfill adopts the verified auth email onto already-claimed rows that never got
--      one. Scoped by `email is null` so it is idempotent and can never overwrite a real address.
--
-- The CLAIM path is deliberately untouched: it matched the row *on* email, so the row already has
-- one, and overwriting it there is `reclamar_por_codigo`'s job (verified beats staff-typed).

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
    -- contact address. This is the #78 fix — `email` was absent from this column list.
    insert into public.clientes
      (gym_id, auth_user_id, nombre, tel, email, phone_e164, clases_restantes, terms_accepted_at, privacy_accepted_at)
      values (p_gym_id, v_uid, v_nombre, v_tel, v_email, v_phone, 0, now(), now())
      returning id into v_cli;
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := v_reclamado; return next;
end;
$function$;

-- Backfill: adopt the verified auth email onto claimed rows created before the fix. Idempotent
-- (`email is null` guard). Rollback for the rows this touches is recorded in issue #78.
update public.clientes c
   set email = u.email
  from auth.users u
 where u.id = c.auth_user_id
   and c.email is null;
