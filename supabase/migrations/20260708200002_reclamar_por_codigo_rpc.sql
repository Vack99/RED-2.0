-- Invite-token claim rail S1 (issue #65; ADR-0015 · design 2026-07-08 §4). The primary door-1→login rail:
-- a member holding an invite code binds their verified login to the EXACT paid `clientes` row the code
-- names — balance + history intact — regardless of which email the staff typed at the sale. Sibling of
-- `reclamar_o_crear_cliente` (the fallback email-claim rail, unchanged): same SECURITY DEFINER posture and
-- verified-email gate, but the join key is the bearer token on the row, not an email guess.
--
-- WHY SECURITY DEFINER (ADR-0009-amendment / ADR-0013 §1 posture): the claimant is not yet a member of the
-- gym, so under RLS they can see neither the unclaimed row nor gym_membership (definer-only writes). Definer
-- executes the claim with RLS bypassed; the code — delivered to the member's own inbox — is the authority.
-- House lockdown: `set search_path=''` (every ref schema-qualified) + EXECUTE revoked from public/anon,
-- granted only to authenticated (a verified session). email_confirmed_at is re-checked as defense-in-depth.
--
-- MECHANICS (ADR-0015 D5): resolve + lock the row by claim_code (a cleared/absent code — already claimed or
-- never minted — resolves to nothing → clear error). Guard against a caller who already owns a row in that
-- gym (the one-claim-per-gym partial index would otherwise raise a raw error, or worse a second row could
-- strand the balance) → explicit "ya tienes cuenta" for staff to resolve. On success: stamp auth_user_id,
-- OVERWRITE clientes.email with the VERIFIED login email (verified beats staff-typed — one contact truth),
-- fill phone_e164 (from signup metadata) + terms/privacy timestamps exactly like the email claim, CLEAR the
-- code (single-use — a forwarded email dies on use), upsert gym_membership(member), and RETURN the gym slug
-- for the (cross-device) post-claim redirect. Host is NEVER an authz input (ADR-0008): the code resolves
-- the row, the row resolves the gym, and membership is written for THAT gym. Idempotent create-or-replace.
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
  -- `auth_user_id is null` is defense-in-depth: every mint site already refuses claimed rows
  -- (registrar_venta mints only on NEW inserts; preparar_invitacion guards 'La cuenta ya está
  -- activa'), so a claimed row can never carry a code — but if that invariant ever slipped,
  -- this predicate keeps a re-minted code from re-stamping auth_user_id (account takeover).
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

  update public.clientes
     set auth_user_id = v_uid,
         email = v_email,                                  -- verified login email overwrites staff-typed
         phone_e164 = coalesce(v_phone, phone_e164),
         terms_accepted_at = now(),
         privacy_accepted_at = now(),
         claim_code = null                                 -- single-use: the token dies on claim
   where id = v_cli;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, v_gym, 'member') on conflict (user_id, gym_id) do nothing;

  select slug into gym_slug from public.gym where id = v_gym;
  return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): a definer primitive is never client-callable beyond its intended caller.
revoke execute on function public.reclamar_por_codigo(text) from public, anon;
grant execute on function public.reclamar_por_codigo(text) to authenticated;
