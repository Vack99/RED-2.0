-- One-door new-member flow (owner rulings R1/R2, 2026-09-03) — the claim becomes LINK-ONLY.
--
-- R1: the identity key is the VERIFIED email, and a claim may only LINK an existing UNCLAIMED
-- `clientes` row OF THE GYM IN EFFECT. It may never INSERT a cliente, and never a
-- `gym_membership` for a gym where nothing matched.
--
-- WHY THIS IS THE SHIP-GATE (red team 2026-09-03 §4, and §2's A2). The design runs the claim at
-- every session mint instead of at one moment. The old body fell through to an INSERT whenever no
-- row matched (`.sql:70-89`), and `gym_membership` is the authz row — so "claim everywhere" would
-- have meant: any confirmed user who opens `…/?gym=<slug>` (the override branch of resolve-tenant
-- validates the slug only against the DB, and every preview / bare `.vercel.app` host resolves no
-- tenant at all) gets a fresh 0-class cliente row AND a membership in a gym they never joined.
-- Live already shows the drift this produces: 6 (user, gym) pairs hold a membership with no
-- cliente row in that gym, and 3 of 53 claimed accounts are zero-balance twins. Refusing the
-- INSERT turns "every mint claims" from a liability into a mechanism that can only ever bind a row
-- the gym itself created.
--
-- 'Teléfono requerido' IS GONE (red team §2 A5). `v_phone` is
-- `raw_user_meta_data->>'phone_e164'`, which only `/registro`'s signUp ever sets — 29 of 63 live
-- auth users (46%) have none. It guarded the INSERT branch only; with that branch deleted the
-- raise had nothing left to protect and would instead have made the headline promise ("every
-- session mint claims") silently false for nearly half the user base: the `intentar*` ceremony
-- swallows the refusal as a value, so those members would just keep seeing the sin-membresía
-- screen with no error anywhere. The phone is still carried onto the linked row when present.
--
-- NOTHING MATCHED IS AN OUTCOME, NOT A SHRUG (M6). The body raises `Sin registro en este
-- gimnasio` instead of minting a twin, so `reclamado:false` no longer has to mean both "already
-- mine" and "nothing here for you". The refusal is a VALUE at every door
-- (`intentarReclamoPorEmail`), and the member lands on the sin-membresía screen — which now names
-- their address and this gym, because the desk is the only place that can fix it.
--
-- UNCHANGED, deliberately: the D2 tenant firma (verified before any read or write), the
-- `email_confirmed_at` gate, the `lower(email)` match scoped to `p_gym_id`, the
-- `auth_user_id is null` re-check inside the UPDATE, the idempotent already-mine short-circuit,
-- the `p_aviso_version` stamp (#257), and the membership upsert — which still runs, but ONLY
-- after a row was actually linked (or already owned).
--
-- The `_o_crear` in the name is now a misnomer; renaming it is a separate, mechanical change
-- (generated types, canon, coverage json, three call sites) and is deliberately not bundled here.
--
-- Idempotent and re-runnable: drop-function-if-exists before create, revoke/grant re-issued
-- unconditionally. Body-only change — no DDL on any table.

drop function if exists public.reclamar_o_crear_cliente(uuid, text, text);

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
  v_phone  text;
  v_cli    uuid;
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

  -- The identity key, read from auth (never a caller-supplied field): the VERIFIED email.
  select u.email, u.email_confirmed_at, nullif(u.raw_user_meta_data ->> 'phone_e164', '')
    into v_email, v_conf, v_phone
    from auth.users u where u.id = v_uid;
  if v_conf is null then
    raise exception 'Correo no verificado';
  end if;

  -- Already mine in this gym: re-entry is a success path, not a double write. The membership
  -- upsert repeats so a row linked before `gym_membership` existed still converges.
  select id into v_cli from public.clientes
    where gym_id = p_gym_id and auth_user_id = v_uid
    limit 1;
  if v_cli is not null then
    insert into public.gym_membership (user_id, gym_id, role)
      values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;
    cliente_id := v_cli; reclamado := false; return next; return;
  end if;

  -- THE ONE WRITE THIS FUNCTION MAY MAKE: bind an unclaimed row of THIS gym whose email matches
  -- the verified one. At most one such row can exist — `clientes_email_gym_uq (gym_id,
  -- lower(email)) where email is not null` is the engine-enforced guard (a NULL email matches
  -- nothing, since `lower(null) = lower(v_email)` is null).
  select id into v_cli from public.clientes
    where gym_id = p_gym_id and auth_user_id is null and lower(email) = lower(v_email)
    for update;
  if v_cli is not null then
    update public.clientes
       set auth_user_id = v_uid,
           phone_e164 = coalesce(v_phone, phone_e164),
           terms_accepted_at = now(),
           privacy_accepted_at = now(),
           privacy_aviso_version = p_aviso_version
     where id = v_cli and auth_user_id is null;   -- re-check under the lock: last writer loses
    if not found then v_cli := null; end if;
  end if;

  if v_cli is null then
    raise exception 'Sin registro en este gimnasio';
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := true; return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): a definer primitive is never client-callable beyond its intended caller.
revoke execute on function public.reclamar_o_crear_cliente(uuid, text, text) from public, anon;
grant execute on function public.reclamar_o_crear_cliente(uuid, text, text) to authenticated;
