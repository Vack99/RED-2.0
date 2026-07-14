-- Issue #93 (spec 2026-07-13 §1.5, owner ruling D2) — bind `reclamar_o_crear_cliente`'s
-- `p_gym_id` to the RESOLVED TENANT.
--
-- The hole: SECURITY DEFINER, EXECUTE to `authenticated`, gym id caller-supplied → any
-- authenticated user could mint themselves a `gym_membership(member)` row (and a fresh
-- roster row) in ANY gym they name, via a direct PostgREST call.
--
-- The binding: the tenant is resolved from the HOST on the server (ADR-0008) and Postgres
-- cannot observe the host; headers and user metadata are caller-controlled. The only
-- un-spoofable channel is a server-held secret: the server signs `uid:gym_id` with
-- HMAC-SHA256 (key in Supabase Vault, mirrored to the server as TENANT_ASSERTION_KEY) and
-- the RPC verifies before any write. A direct caller cannot forge a signature for a gym
-- the server did not resolve for them. Owner-approved 2026-07-13 over the service_role
-- alternative (narrower blast radius if the secret leaks; keeps the repo's
-- no-service_role-import property).
--
-- SECRET SEEDING (per environment, NOT in this migration — secrets never ride git):
--   select vault.create_secret('<value>', 'tenant_assertion_key');
-- and set TENANT_ASSERTION_KEY=<value> in the server env (Vercel / .env.local). The
-- denial suite seeds a transaction-local value for itself; a scratch project needs no
-- manual seeding to run the suite.
--
-- Signature change (uuid) → (uuid, text): DROP the old function first — CREATE OR REPLACE
-- with a new signature would leave the unbound overload callable.

drop function if exists public.reclamar_o_crear_cliente(uuid);

create function public.reclamar_o_crear_cliente(p_gym_id uuid, p_firma text)
  returns table(cliente_id uuid, reclamado boolean)
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_key    text;
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

  -- D2 tenant binding: verify the server's firma over uid:gym BEFORE any read or write.
  -- Definer runs as the function owner, which may read Vault; callers cannot.
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'tenant_assertion_key';
  if v_key is null then
    raise exception 'Configuración incompleta: tenant_assertion_key ausente';
  end if;
  if p_firma is distinct from
     encode(extensions.hmac(v_uid::text || ':' || p_gym_id::text, v_key, 'sha256'), 'hex') then
    raise exception 'Firma de tenant inválida';
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
    -- Create path (Door 2, the online self-registrant): persist the VERIFIED email as the
    -- member's contact address (#78).
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

-- EXECUTE lockdown: same posture as the dropped one-arg version (ADR-0013 §1).
revoke execute on function public.reclamar_o_crear_cliente(uuid, text) from public, anon;
grant execute on function public.reclamar_o_crear_cliente(uuid, text) to authenticated;
