-- Activation security audit 2026-07-22 §3 (H1 + H2) — bind `reclamar_por_codigo` to a
-- server-minted firma so the invite-token claim is no longer freely callable with just a
-- code. Mirrors `reclamar_o_crear_cliente`'s tenant firma (20260713190000): the server
-- signs the code with the Vault key `tenant_assertion_key` (HMAC-SHA256) and the RPC
-- verifies BEFORE any read or write. A direct PostgREST call with only `p_codigo` (H1),
-- or an attacker-appended `&codigo=` on a recovery link that carries no matching firma
-- (H2), now fails CLOSED and writes nothing.
--
-- The email-agnostic bind is UNCHANGED (ADR-0015 staff-typo tolerance): the firma gates
-- the trust boundary (only the app server, after its gates, can invoke the claim), it is
-- NOT an identity match — caller.email is still never compared to the row's.
--
-- Domain-separated message: `activar:v1:` || codigo (audit Info finding — firma domain
-- separation was previously only accidental). Distinct from the tenant firma's
-- `uid:gym_id` and the activation edge fn's `codigo:email`, so the one shared key can
-- never cross-verify between the three schemes.
--
-- Signature change (text) → (text, text): DROP the old function first — CREATE OR REPLACE
-- with a new signature would leave the unbound one-arg overload callable (H1 unclosed).

drop function if exists public.reclamar_por_codigo(text);

create function public.reclamar_por_codigo(p_codigo text, p_firma text)
  returns table (gym_slug text)
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_uid   uuid := (select auth.uid());
  v_key   text;
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

  -- Firma gate (§3 H1/H2): verify the server's HMAC over the code BEFORE any read or
  -- write. Definer runs as the function owner, which may read Vault; a direct caller
  -- cannot. Plain (non-constant-time) compare is fine — extracting a 256-bit digest
  -- through PostgREST/planner/network jitter is not a realistic oracle and the key is
  -- high-entropy (same posture as reclamar_o_crear_cliente).
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'tenant_assertion_key';
  if v_key is null then
    raise exception 'Configuración incompleta: tenant_assertion_key ausente';
  end if;
  if p_firma is distinct from
     encode(extensions.hmac('activar:v1:' || p_codigo, v_key, 'sha256'), 'hex') then
    raise exception 'Firma de activación inválida';
  end if;

  -- Verified email is read from auth.users (the verified source), never a parameter.
  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_email, v_conf, v_meta
    from auth.users u where u.id = v_uid;
  if v_conf is null then
    raise exception 'Correo no verificado';
  end if;

  v_phone := nullif(v_meta ->> 'phone_e164', '');

  -- Resolve + lock the unclaimed row by its single-use code. A cleared/absent code
  -- resolves to nothing. `auth_user_id is null` is defense-in-depth against a re-minted
  -- code re-stamping auth_user_id (account takeover) if a mint-site invariant ever slips.
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
revoke execute on function public.reclamar_por_codigo(text, text) from public, anon;
grant execute on function public.reclamar_por_codigo(text, text) to authenticated;
