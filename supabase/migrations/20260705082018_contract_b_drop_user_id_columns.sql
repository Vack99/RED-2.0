-- Issue #28 — CUTOVER STAGE B: the irreversible column contract (ADR-0013 §5 expand/contract).
--
-- WHAT — the second, IRREVERSIBLE half of the RLS cutover: rewrite the write RPCs to stop
-- touching `user_id`, then DROP the 7 legacy `user_id` columns. Stage A (reversible policy
-- contract) must already be live; this file removes the columns those policies keyed on.
--
-- IRREVERSIBLE — PITR-ONLY ROLLBACK. Once committed there is no forward-migration undo: the
-- dropped columns and their data are gone, recoverable only by point-in-time restore. There is
-- no `rollback_b.sql`; the safety net is the rehearsal on a throwaway preview branch + the
-- human gate before live apply.
--
-- WHY ATOMIC — the RPC rewrites and the column drops MUST land in ONE transaction:
--   • The `user_id` columns are NOT NULL. The instant a column is dropped, any still-live RPC
--     whose INSERT names `user_id` would fail (or, worse in a split apply, the window between
--     "old RPC + column present" and "new RPC + column gone" is a live-write outage). Rewriting
--     the functions and dropping the columns together closes that window to zero.
--   • plpgsql bodies are LATE-BOUND: a function that references `public.clientes.user_id` only
--     fails at call time, not at CREATE time. So an out-of-order apply would compile clean and
--     break on the first real sale. Same-transaction ordering (functions first, drops second)
--     is the only guarantee that no call ever sees a mismatched pair.
--
-- Supabase `apply_migration` wraps this file in a single transaction (mid-apply failure
-- auto-rolls-back), matching the S5 house style — no explicit BEGIN/COMMIT here.
--
-- Function bodies below are the CURRENT LIVE definitions (live version 20260703015125), edited
-- ONLY to: drop `user_id` from every INSERT, switch the two plantillas predicates from
-- per-operator (`user_id = v_uid`) to per-gym, and add the next_folio staff guard. Every
-- SECURITY / volatility / search_path attribute is preserved verbatim (CREATE OR REPLACE keeps
-- the existing EXECUTE grants — no GRANT/REVOKE here). Auth guards (`if v_uid is null`) STAY.
-- A 6th rewrite (reclamar_o_crear_cliente) is included: slice #26's claim RPC lands live pre-B and its fresh-create path INSERTs user_id into clientes, so it must drop that column too or break at first call post-drop (F1, 2026-07-05 review).

-- ── 1. registrar_venta — drop user_id from the clientes + ventas INSERTs ──────
-- v_uid + its null-auth guard are KEPT (still the authentication check); only the persisted
-- ownership columns go. gym derivation (staff_gym) is byte-for-byte the live body.
CREATE OR REPLACE FUNCTION public.registrar_venta(p_nombre text, p_tel text, p_paquete_nombre text, p_vigencia_tipo text, p_monto integer, p_metodo text, p_cliente_id uuid DEFAULT NULL::uuid, p_clases_restantes integer DEFAULT NULL::integer, p_vence date DEFAULT NULL::date, p_clases integer DEFAULT NULL::integer, p_vigencia_dias integer DEFAULT NULL::integer)
 RETURNS TABLE(folio bigint, cliente_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_cliente uuid;
  v_gym uuid;
  v_folio bigint;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_cliente_id is null then
    v_gym := public.staff_gym();
    insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values (p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre, v_gym)
    returning id into v_cliente;
  else
    update public.clientes
       set clases_restantes = p_clases_restantes,
           vence = p_vence,
           paquete_nombre = p_paquete_nombre
     where id = p_cliente_id;          -- RLS scopes this to the owner
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
    v_cliente := p_cliente_id;
    select gym_id into v_gym from public.clientes where id = p_cliente_id;  -- venta inherits the cliente's gym
  end if;

  -- Per-gym folio, drawn + incremented atomically inside this transaction (row-locked; see next_folio).
  v_folio := public.next_folio(v_gym);
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id)
  values (v_cliente, v_folio, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias, p_monto, p_metodo, v_gym);

  return query select v_folio, v_cliente;
end;
$function$;

-- ── 2. toggle_pase — drop user_id from the asistencias INSERT ─────────────────
-- v_uid + its null-auth guard KEPT; only the persisted ownership column goes.
CREATE OR REPLACE FUNCTION public.toggle_pase(p_cliente_id uuid, p_fecha date)
 RETURNS TABLE(present boolean, hora text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_gym uuid;
  v_tz text;
  v_active_id uuid;
  v_active_consumio boolean;
  v_consumio boolean;
  v_hora time;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select clases_restantes, gym_id into v_clases, v_gym
    from public.clientes where id = p_cliente_id;   -- RLS-scoped; asistencia inherits the cliente's gym
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Server-authoritative: the gym's own timezone row, never a client-supplied param.
  select timezone into v_tz from public.gym where id = v_gym;

  select id, consumio into v_active_id, v_active_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and fecha = p_fecha and deleted_at is null
   order by created_at desc
   limit 1;

  if v_active_id is not null then
    -- toggle OFF
    update public.asistencias set deleted_at = now() where id = v_active_id;
    if v_active_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clases_restantes + 1 where id = p_cliente_id;
    end if;
    return query select false, null::text;
    return;
  end if;

  -- toggle ON
  v_consumio := (v_clases is not null and v_clases > 0);
  v_hora := case
    when p_fecha = (now() at time zone v_tz)::date
      then (now() at time zone v_tz)::time
    else null
  end;

  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id)
  values (p_cliente_id, p_fecha, v_hora, v_consumio, v_gym);

  if v_consumio then
    update public.clientes set clases_restantes = clases_restantes - 1
     where id = p_cliente_id and clases_restantes > 0;   -- guarded decrement
  end if;

  return query select true, to_char(v_hora, 'HH24:MI');
end;
$function$;

-- ── 3. crear_plantilla — per-gym cap + drop user_id from the INSERT ───────────
-- The 4-template cap moves from per-operator (user_id = v_uid) to per-gym: per-gym cap is a
-- deliberate semantics shift, inert today (one operator per gym), diverges with a 2nd operator.
-- The live body has no gym variable, so both the cap check and the INSERT read staff_gym()
-- directly (matching the live INSERT's own staff_gym() call). v_uid + its guard KEPT.
CREATE OR REPLACE FUNCTION public.crear_plantilla(p_nombre text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if (select count(*) from public.plantillas where gym_id = public.staff_gym()) >= 4 then
    raise exception 'Máximo 4 plantillas';
  end if;
  insert into public.plantillas (nombre, body, gym_id)
  values (p_nombre, p_body, public.staff_gym())
  returning id into v_id;
  return v_id;
end;
$function$;

-- ── 4. sembrar_plantillas_default — per-gym idempotence + drop user_id ────────
-- The idempotence exists-check moves to per-gym (was per-operator). v_gym is derived up-front so
-- the exists-check can key on it; the 4 seed INSERTs drop user_id. v_uid + its guard KEPT.
CREATE OR REPLACE FUNCTION public.sembrar_plantillas_default()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_gym := public.staff_gym();
  if exists (select 1 from public.plantillas where gym_id = v_gym) then return; end if; -- idempotent
  insert into public.plantillas (nombre, body, gym_id) values
    ('Recordatorio', $body$Hola {nombre} 👋

Aún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.

¡Te esperamos en el bootcamp! 💪🔥
— {negocio}$body$, v_gym),
    ('Recibo', $body$Hola {nombre} 👋

¡Gracias por tu compra en {negocio}! Tu paquete *{paquete}* queda activo hasta el {vence}.

Nos vemos en el bootcamp. 💪🔥$body$, v_gym),
    ('Renovación', $body$Hola {nombre}, soy del coach de {negocio}.

Tu paquete vence en {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$, v_gym),
    ('Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te queda *1 clase* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$, v_gym);
end;
$function$;

-- ── 5. next_folio — staff-of-gym guard (D3 / review I2) ───────────────────────
-- SECURITY DEFINER helper: without this guard any authenticated caller could bump an arbitrary
-- gym's folio counter by passing its id. Schema-qualified (public.is_staff_of) because the body
-- runs with search_path=''. First statement of the body; everything else is the live body.
CREATE OR REPLACE FUNCTION public.next_folio(p_gym uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_folio bigint;
begin
  if not public.is_staff_of(p_gym) then
    raise exception 'next_folio: caller is not staff of gym %', p_gym;
  end if;
  insert into public.gym_folio_counter (gym_id, last_folio)
    values (p_gym, coalesce((select max(folio) from public.ventas where gym_id = p_gym), 1000))
    on conflict (gym_id) do nothing;
  update public.gym_folio_counter
     set last_folio = last_folio + 1
   where gym_id = p_gym
   returning last_folio into v_folio;
  return v_folio;
end;
$function$;

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
      (gym_id, auth_user_id, nombre, tel, phone_e164, terms_accepted_at, privacy_accepted_at)
      values (p_gym_id, v_uid, v_nombre, v_tel, v_phone, now(), now())
      returning id into v_cli;
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := v_reclamado; return next;
end;
$function$;

-- ── 6. Drop the 7 legacy user_id columns (the irreversible step) ──────────────
-- FKs (user_id → auth.users) and asistencias_user_fecha_idx auto-drop WITH their columns — no
-- separate DROP CONSTRAINT / DROP INDEX needed. No replacement index (D1: no query filters on
-- user_id post-cutover). After this point rollback is PITR-only.
alter table public.clientes    drop column user_id;
alter table public.ventas      drop column user_id;
alter table public.asistencias drop column user_id;
alter table public.perfil      drop column user_id;
alter table public.plantillas  drop column user_id;
alter table public.cobro       drop column user_id;
alter table public.paquetes    drop column user_id;
