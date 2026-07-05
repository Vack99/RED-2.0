-- Member self-register + verified-email claim RPC, slice #26 (PRD #17 S8; ADR-0009 as amended 2026-07-02).
--
-- ONE atomic SECURITY DEFINER RPC that, for the caller's VERIFIED email in the host-resolved gym, claims a
-- single unclaimed cliente (verified-email match ONLY — balance + history carry over) else mints a fresh
-- cliente, and writes the `gym_membership(role='member')` row in the SAME transaction (no half-registered
-- state RLS can't classify). Invoked from the post-verification server action / confirm route.
--
-- WHY SECURITY DEFINER (the ADR-0009-amendment exception to ADR-0005's INVOKER default): the registrant is
-- not yet a member of anything, so under RLS they cannot see the unclaimed cliente row nor insert into
-- gym_membership (whose writes are definer-only, ADR-0013 §4). Definer executes the claim with RLS
-- bypassed. House posture (ADR-0013 §1): `set search_path=''` (every ref schema-qualified, injection-safe,
-- clears function_search_path_mutable) + EXECUTE revoked from public/anon, granted to authenticated.
--
-- SERVER-AUTHORITATIVE GYM (ADR-0008/0009): the ONLY parameter is p_gym_id — the caller's host-resolved
-- tenant, passed by the server action which re-resolves it from the host (never a client field / x-gym).
-- Name/phone ride the caller's OWN signup metadata (raw_user_meta_data), and the security-critical match
-- key — the email — is read VERIFIED from auth.users, so no client-supplied value can redirect the write.
--
-- CLAIM MECHANICS (ADR-0009 amendment): match is on VERIFIED EMAIL ONLY (phone is a reconciliation hint,
-- NEVER a claim key); ambiguous (>1 unclaimed match) → create (never guess); the candidate is locked FOR
-- UPDATE so two concurrent registrations cannot both claim it (double-claim race). email_confirmed_at is
-- re-checked here as defense-in-depth even though confirm-email-required means no session pre-verification.
--
-- Idempotent & additive: create-or-replace, safe to re-apply and out-of-order on live (Forge stays green).

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

  -- Verified email is read from auth.users — the verified source, NEVER a parameter (defense-in-depth
  -- re-check of email_confirmed_at; ADR-0009 amendment). Name/phone come from the caller's own signup
  -- metadata.
  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_email, v_conf, v_meta
    from auth.users u where u.id = v_uid;
  if v_conf is null then
    raise exception 'Correo no verificado';
  end if;

  v_nombre := coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), split_part(v_email, '@', 1));
  v_phone  := nullif(v_meta ->> 'phone_e164', '');

  -- Idempotency: the caller already claimed/created a cliente in this gym → ensure membership and return
  -- it. A double-submitted confirmation must not mint a second row nor error on the one-claim-per-gym index.
  select id into v_cli from public.clientes
    where gym_id = p_gym_id and auth_user_id = v_uid
    limit 1;
  if v_cli is not null then
    insert into public.gym_membership (user_id, gym_id, role)
      values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;
    cliente_id := v_cli; reclamado := false; return next; return;
  end if;

  -- Claim-by-VERIFIED-EMAIL-match: exactly ONE unclaimed cliente in THIS gym whose email matches
  -- (case-insensitive). None / ambiguous (>1) / phone-only → fall through to create.
  select count(*) into v_n from public.clientes
    where gym_id = p_gym_id and auth_user_id is null and lower(email) = lower(v_email);

  if v_n = 1 then
    -- Lock the candidate so concurrent registrations cannot both claim it (double-claim race).
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
        v_cli := null;   -- lost the race between the count and the lock → create a fresh row
      end if;
    end if;
  end if;

  if v_cli is null then
    -- No unique verified-email match → mint a fresh cliente owned by the registrant. tel is the 10-digit
    -- national number derived from the E.164 phone (clientes.tel's canonical shape); phone is required on
    -- the create path (the registro form validates it, so this raises only on a direct malformed call).
    if v_phone is null then
      raise exception 'Teléfono requerido';
    end if;
    v_tel := right(regexp_replace(v_phone, '\D', '', 'g'), 10);
    insert into public.clientes
      (user_id, gym_id, auth_user_id, nombre, tel, phone_e164, terms_accepted_at, privacy_accepted_at)
      values (v_uid, p_gym_id, v_uid, v_nombre, v_tel, v_phone, now(), now())
      returning id into v_cli;
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := v_reclamado; return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): a definer primitive must never be client-callable beyond its intended
-- caller. Revoke the CREATE-FUNCTION public default + anon; grant only authenticated (a verified session).
revoke execute on function public.reclamar_o_crear_cliente(uuid) from public, anon;
grant execute on function public.reclamar_o_crear_cliente(uuid) to authenticated;
