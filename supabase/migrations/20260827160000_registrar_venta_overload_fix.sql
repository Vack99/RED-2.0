-- registrar_venta overload fix — restores ALL admin sales (outage since 2026-08-27 06:16:58Z)
--
-- What happened: prod's registrar_venta was widened to 15 args (+ p_gym_id, tenant-in-effect,
-- prod version 20260825145937_staff_gym_tenant_in_effect — applied from the mobile lane, not yet
-- in this repo's supabase/migrations/). The 2026-08-26 reset migration then CREATE OR REPLACEd at
-- the old 14-arg signature, which against a 15-arg function is a CREATE: prod ended with TWO
-- overloads. Every POST /rest/v1/rpc/registrar_venta payload matches both candidates, so
-- PostgREST answers 300/PGRST203 before any SQL runs — 100% of desk sales rejected, and the
-- FULL RESET ruling (ADR-0003 Amendment 2) never actually served traffic.
--
-- The fix, one transaction:
--   1. DROP the accidental 14-arg overload (it also carried a default PUBLIC/anon EXECUTE grant,
--      an ADR-0005 regression — dropping it removes that too).
--   2. TRUE replace of the 15-arg function: tenant-in-effect prologue kept byte-for-byte,
--      body = the FULL RESET derivation. Grants on the 15-arg are already correct
--      (postgres/authenticated/service_role only) and CREATE OR REPLACE preserves them;
--      the revoke below is a belt-and-suspenders no-op.
--   3. Assert exactly one overload survives — this migration fails loudly rather than half-fixing.

drop function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer, date);

create or replace function public.registrar_venta(p_metodo text, p_idempotency_key uuid, p_paquete_id uuid DEFAULT NULL::uuid, p_cliente_id uuid DEFAULT NULL::uuid, p_nombre text DEFAULT NULL::text, p_tel text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_forzar_nuevo boolean DEFAULT false, p_custom_nombre text DEFAULT NULL::text, p_custom_precio integer DEFAULT NULL::integer, p_custom_clases integer DEFAULT NULL::integer, p_custom_ilimitado boolean DEFAULT false, p_custom_dias integer DEFAULT NULL::integer, p_fecha_inicio date DEFAULT NULL::date, p_gym_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(folio bigint, cliente_id uuid, clases_restantes integer, vence date, paquete_nombre text, monto integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_gym uuid;
  v_tz text;
  v_hoy date;
  v_inicio date;      -- the effective start (backdated sold date, else today)
  v_custom boolean;
  v_pk_nombre text;
  v_pk_clases integer;        -- null = ilimitado
  v_pk_vig_tipo text;
  v_pk_vig_dias integer;
  v_pk_precio integer;
  v_paq record;
  v_cli record;
  v_compra_dias integer;
  v_base_clases integer;      -- since 2026-08-26 always 0 — the reset ruling
  v_base_dias integer;        -- since 2026-08-26 always 0 — the reset ruling
  v_new_clases integer;       -- null = ilimitado
  v_new_dias integer;
  v_new_vence date;
  v_cliente_id uuid;
  v_folio bigint;
  v_code text;
  v_dup uuid;
  v_bytes bytea;
  i int;
  v_alpha constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';  -- 34 symbols (A-Z, 2-9)
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (20260825145937).
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- Idempotent replay: same (gym, key) returns the already-written sale untouched (C6).
  select v.folio, v.cliente_id into v_folio, v_cliente_id
    from public.ventas v
    where v.gym_id = v_gym and v.idempotency_key = p_idempotency_key;
  if found then
    return query
      select v_folio, c.id, c.clases_restantes, c.vence, c.paquete_nombre,
             (select va.monto from public.ventas va
               where va.gym_id = v_gym and va.idempotency_key = p_idempotency_key)
        from public.clientes c where c.id = v_cliente_id;
    return;
  end if;

  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  -- XOR: exactly one package source.
  v_custom := (p_custom_nombre is not null
               or p_custom_precio is not null
               or p_custom_clases is not null
               or p_custom_dias is not null
               or coalesce(p_custom_ilimitado, false));
  if v_custom = (p_paquete_id is not null) then
    raise exception 'Venta inválida: elige un paquete o define uno personalizado';
  end if;

  if v_custom then
    -- Bounds (D6) live HERE, not only in the form: the RPC is the trust boundary.
    v_pk_nombre := trim(coalesce(p_custom_nombre, ''));
    if length(v_pk_nombre) < 3 or length(v_pk_nombre) > 40 then
      raise exception 'Nombre del paquete personalizado inválido';
    end if;

    if p_custom_precio is null or p_custom_precio < 1 or p_custom_precio > 100000 then
      raise exception 'Precio personalizado inválido';
    end if;

    if p_custom_dias is null or p_custom_dias < 1 or p_custom_dias > 365 then
      raise exception 'Vigencia personalizada inválida';
    end if;

    if coalesce(p_custom_ilimitado, false) then
      if p_custom_clases is not null then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_pk_clases := null;                                   -- ilimitado
    else
      if p_custom_clases is null or p_custom_clases < 1 or p_custom_clases > 365 then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_pk_clases := p_custom_clases;
    end if;

    v_pk_precio := p_custom_precio;
    v_pk_vig_tipo := 'dias';                                 -- custom is always 'dias'
    v_pk_vig_dias := p_custom_dias;
  else
    -- Package facts come from the DB, never the client (C13).
    select p.nombre, p.clases, p.vigencia_tipo, p.vigencia_dias, p.precio into v_paq
      from public.paquetes p where p.id = p_paquete_id and p.gym_id = v_gym;
    if not found then raise exception 'Paquete no encontrado'; end if;
    v_pk_nombre := v_paq.nombre;
    v_pk_clases := v_paq.clases;
    v_pk_vig_tipo := v_paq.vigencia_tipo;
    v_pk_vig_dias := v_paq.vigencia_dias;
    v_pk_precio := v_paq.precio;
  end if;

  select g.timezone into v_tz from public.gym g where g.id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;
  v_inicio := coalesce(p_fecha_inicio, v_hoy);

  -- Bounds 1 & 2 (A2/A3).
  if v_inicio > v_hoy then
    raise exception 'La fecha de inicio no puede ser futura';
  end if;
  if v_inicio < v_hoy - 30 then
    raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad';
  end if;

  -- Ruling C1: 'mes' is a flat 30 days.
  v_compra_dias := case when v_pk_vig_tipo = 'mes' then 30
                        else coalesce(v_pk_vig_dias, 0) end;

  if p_cliente_id is not null then
    -- Locked base read (C13/C6/C5): serializes concurrent sales and refuses a cross-tenant id.
    -- Its COLUMNS no longer feed the derivation — the lock and the tenant check are why it stays.
    select c.clases_restantes, c.vence, c.created_at into v_cli
      from public.clientes c
      where c.id = p_cliente_id and c.gym_id = v_gym
      for update;
    if not found then raise exception 'Cliente no encontrado'; end if;

    -- FULL RESET (owner 2026-08-26): a renewal grants the pack and only the pack. The new vence may
    -- land EARLIER than the old one; that is the ruling, not a bug.
    v_base_clases := 0;
    v_base_dias := 0;
  else
    -- #190: tel is optional; a name is still required.
    if coalesce(length(trim(p_nombre)), 0) < 3 then
      raise exception 'Datos del cliente incompletos';
    end if;
    -- D2: block the accidental duplicate; the operator can override explicitly.
    if not p_forzar_nuevo then
      select c.id into v_dup from public.clientes c
        where c.gym_id = v_gym
          and (c.tel = p_tel or (p_email is not null and lower(c.email) = lower(p_email)))
        limit 1;
      if v_dup is not null then
        raise exception 'CLIENTE_DUPLICADO:%', v_dup;
      end if;
    end if;
    v_base_clases := 0;
    v_base_dias := 0;
  end if;

  -- The grant. With both bases pinned to 0: ilimitado pack => NULL, finite pack => exactly the
  -- pack's count, vence => v_inicio + the pack's days. The `v_base_clases is null` arm is the
  -- ilimitado->finite branch, UNREACHABLE since the reset; kept, and it agrees with the else.
  if v_pk_clases is null then
    v_new_clases := null;                                   -- becomes ilimitado
  elsif p_cliente_id is not null and v_base_clases is null then
    v_new_clases := v_pk_clases;                            -- ilimitado -> finite: pack's count
  else
    v_new_clases := coalesce(v_base_clases, 0) + v_pk_clases;
  end if;
  v_new_dias := v_base_dias + v_compra_dias;
  v_new_vence := v_inicio + v_new_dias;

  -- Bound 4 (E2): reject an already-expired backdate at the write boundary.
  if v_new_vence < v_hoy then
    raise exception 'La venta ya estaría vencida en la fecha de inicio';
  end if;

  if p_cliente_id is not null then
    begin
      update public.clientes c
        set clases_restantes = v_new_clases,
            vence = v_new_vence,
            paquete_nombre = v_pk_nombre,
            email = coalesce(p_email, c.email)             -- C7 backfill
        where c.id = p_cliente_id;
    exception when unique_violation then
      raise exception 'Este correo ya pertenece a otro registro de este gym';
    end;
    v_cliente_id := p_cliente_id;
  else
    loop
      v_code := '';
      v_bytes := extensions.gen_random_bytes(8);
      for i in 0..7 loop
        v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 34) + 1, 1);
      end loop;
      begin
        insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, email, claim_code)
          values (trim(p_nombre), p_tel, v_new_clases, v_new_vence, v_pk_nombre, v_gym, p_email, v_code)
          returning id into v_cliente_id;
        exit;
      exception when unique_violation then
        -- claim_code collision retries; an email collision must surface (D2 backstop index).
        if exists (select 1 from public.clientes c where c.gym_id = v_gym and lower(c.email) = lower(p_email)) then
          raise exception 'CLIENTE_DUPLICADO:%',
            (select c.id from public.clientes c where c.gym_id = v_gym and lower(c.email) = lower(p_email) limit 1);
        end if;
      end;
    end loop;
  end if;

  v_folio := public.next_folio(v_gym);
  -- Written ledger date (A1): backdated ⇒ midday gym-tz on v_inicio; else now().
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id, idempotency_key, personalizado, fecha)
    values (v_cliente_id, v_folio, v_pk_nombre, v_pk_clases, v_pk_vig_tipo, v_pk_vig_dias, v_pk_precio, p_metodo, v_gym, p_idempotency_key, v_custom,
            case when p_fecha_inicio is not null
                 then (v_inicio::timestamp + interval '12 hours') at time zone v_tz
                 else now() end);

  return query
    select v_folio, c.id, c.clases_restantes, c.vence, c.paquete_nombre, v_pk_precio
      from public.clientes c where c.id = v_cliente_id;
end;
$function$;

-- ADR-0005 posture, re-asserted explicitly (no-op when grants are already correct).
revoke all on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer, date, uuid) from public, anon;
grant execute on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer, date, uuid) to authenticated, service_role;

-- Fail loudly rather than half-fix: exactly ONE overload may survive.
do $$
begin
  if (select count(*) from pg_proc
        where proname = 'registrar_venta'
          and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'registrar_venta overload count != 1 — aborting migration';
  end if;
end $$;
