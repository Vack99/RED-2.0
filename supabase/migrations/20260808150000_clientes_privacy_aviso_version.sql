-- Issue #257 (Gate 0.1 fast-follow) — the claim RPCs stamp WHICH aviso version a member was
-- shown, not just a bare `now()` timestamp. #256 pinned `AVISO_PRIVACIDAD_VERSION` in
-- `@gym/domain/legal` and renders it inline at both consent forms (registro + activación); this
-- migration gives the two claim RPCs a place to write that version and a param to receive it.
--
-- SCOPE CUT (controller ruling): only the aviso de privacidad is versioned evidence here.
-- `terms_accepted_at` keeps its current bare-timestamp behavior — member ToS has NO version
-- machinery anywhere in this codebase (out of Gate 0.1 scope), and writing a made-up terms
-- version would be exactly the evidence fabrication this epic exists to prevent. So: ONE new
-- column, `clientes.privacy_aviso_version`, nullable with no default — historical rows (every
-- row written before this migration) stay null, and a caller that omits the new param also
-- stamps an honest null rather than a fabricated version string.
--
-- THE VERSION VALUE is never computed in SQL: it rides in from `@gym/domain/legal`'s
-- `AVISO_PRIVACIDAD_VERSION` constant, through the client server actions that call these RPCs,
-- as a new `p_aviso_version` parameter. This migration only gives it somewhere to land.
--
-- Signature change (uuid, text) -> (uuid, text, text) / (text, text) -> (text, text, text): DROP
-- both old functions first — CREATE OR REPLACE with a new signature would leave the old,
-- version-blind overload live and callable (the exact overload trap that contaminated scratch
-- earlier this session — a dead `actualizar_cliente` overload had to be manually dropped). The
-- new `p_aviso_version` param takes `default null` DELIBERATELY: any caller that doesn't yet know
-- about it (a stale client build mid-deploy, a direct PostgREST call) keeps working and stamps an
-- honest null — never a fabricated value — mirroring the column's own "no default, no backfill"
-- posture (AC3).
--
-- Function bodies below are copied verbatim from their current definitions
-- (20260713190000_reclamar_tenant_binding.sql, 20260722120000_reclamar_por_codigo_firma.sql) with
-- exactly one addition per function: the new param threaded into the existing UPDATE/INSERT that
-- already stamps `terms_accepted_at`/`privacy_accepted_at`. No other behavior changes.
--
-- Idempotent and re-runnable: add-column-if-not-exists, drop-constraint-if-exists before add,
-- drop-function-if-exists before create, revoke/grant re-issued unconditionally. Expand-only, safe
-- out-of-order on the live project.

-- ── clientes.privacy_aviso_version ───────────────────────────────────────────────────────────────
alter table public.clientes add column if not exists privacy_aviso_version text;
alter table public.clientes drop constraint if exists clientes_privacy_aviso_version_ck;
alter table public.clientes
  add constraint clientes_privacy_aviso_version_ck
  check (privacy_aviso_version is null or char_length(privacy_aviso_version) between 1 and 50);

-- ── reclamar_o_crear_cliente: registro path (verified-email claim or create) ────────────────────
drop function if exists public.reclamar_o_crear_cliente(uuid, text);

create function public.reclamar_o_crear_cliente(p_gym_id uuid, p_firma text, p_aviso_version text default null)
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
             privacy_accepted_at = now(),
             privacy_aviso_version = p_aviso_version
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
      (gym_id, auth_user_id, nombre, tel, email, phone_e164, clases_restantes, terms_accepted_at,
       privacy_accepted_at, privacy_aviso_version)
      values (p_gym_id, v_uid, v_nombre, v_tel, v_email, v_phone, 0, now(), now(), p_aviso_version)
      returning id into v_cli;
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := v_reclamado; return next;
end;
$function$;

-- EXECUTE lockdown: same posture as the dropped two-arg version (ADR-0013 §1).
revoke execute on function public.reclamar_o_crear_cliente(uuid, text, text) from public, anon;
grant execute on function public.reclamar_o_crear_cliente(uuid, text, text) to authenticated;

-- ── reclamar_por_codigo: invite-token claim (ADR-0015 primary rail) ─────────────────────────────
drop function if exists public.reclamar_por_codigo(text, text);

create function public.reclamar_por_codigo(p_codigo text, p_firma text, p_aviso_version text default null)
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
         privacy_aviso_version = p_aviso_version,
         claim_code = null                                 -- single-use: the token dies on claim
   where id = v_cli;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, v_gym, 'member') on conflict (user_id, gym_id) do nothing;

  select slug into gym_slug from public.gym where id = v_gym;
  return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): a definer primitive is never client-callable beyond its intended caller.
revoke execute on function public.reclamar_por_codigo(text, text, text) from public, anon;
grant execute on function public.reclamar_por_codigo(text, text, text) to authenticated;
