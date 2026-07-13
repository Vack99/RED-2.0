-- registrar_venta v3 — venta personalizada (spec 2026-07-11 §5.1).
--
-- Supersedes 20260710121000. Two changes, nothing else:
--   (a) p_paquete_id becomes OPTIONAL, and a custom package (nombre/precio/clases/
--       dias typed at the desk) may be sent instead. Exactly one of the two — XOR.
--   (b) the ventas row stamps `personalizado`.
--
-- The derivation is UNTOUCHED. Both branches fill the same v_pk_* locals — the
-- package facts — and then one shared block runs: C1 (flat-30 'mes'), C9 (the vence
-- day is a full training day), C4 (purchase wins, days carry), C6 (idempotent replay),
-- C7 (email backfill), D2 (duplicate guard). A custom sale INHERITS all of them.
-- Re-implementing any of that math inside the custom branch would be a bug.
--
-- No paquetes row is ever created: that is the whole point. The public catalog
-- (/precios, the pricing teaser) reads public.paquetes, so a custom package cannot
-- reach it — structurally, not by a filter someone can forget.
--
-- Signature CHANGE — the 8-arg overload is dropped first so PostgREST dispatch stays
-- unambiguous (PGRST203). Same honest deploy window as 20260710121000: between
-- applying this and deploying the matching app build, the old app's COBRAR fails
-- loudly (PGRST202). Accepted for a solo-operated deploy.
--
-- p_paquete_id moves to position 3: Postgres requires defaulted args last, and it is
-- now defaulted. PostgREST dispatches by NAME, so no caller is affected.
--
-- SECURITY INVOKER preserved (ADR-0005): the sale runs under the operator's RLS; only
-- staff_gym()/next_folio() are definer helpers. `set search_path to ''` preserved.

drop function if exists public.registrar_venta(
  text, uuid, uuid, uuid, text, text, text, boolean);

create or replace function public.registrar_venta(
  p_metodo text,
  p_idempotency_key uuid,
  p_paquete_id uuid default null,
  p_cliente_id uuid default null,
  p_nombre text default null,
  p_tel text default null,
  p_email text default null,
  p_forzar_nuevo boolean default false,
  p_custom_nombre text default null,
  p_custom_precio integer default null,
  p_custom_clases integer default null,
  p_custom_ilimitado boolean default false,
  p_custom_dias integer default null
) returns table(folio bigint, cliente_id uuid, clases_restantes integer, vence date, paquete_nombre text, monto integer)
language plpgsql
set search_path to ''
as $$
declare
  v_gym uuid;
  v_tz text;
  v_hoy date;
  v_custom boolean;
  -- The converged package facts. BOTH branches fill these; the derivation reads only
  -- these. This is what lets the custom path inherit C1/C4/C9 instead of copying them.
  v_pk_nombre text;
  v_pk_clases integer;        -- null = ilimitado
  v_pk_vig_tipo text;
  v_pk_vig_dias integer;
  v_pk_precio integer;
  v_paq record;
  v_cli record;
  v_compra_dias integer;
  v_base_clases integer;      -- null = ilimitado
  v_base_dias integer;
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
  v_gym := public.staff_gym();
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

  -- XOR: exactly one package source. `v_custom` is true if ANY custom field was sent,
  -- so a half-filled custom payload alongside a paquete_id trips the guard rather than
  -- being silently ignored.
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

    -- p_custom_ilimitado exists because SQL cannot tell "argument absent" from
    -- "argument is null", and null IS the ilimitado value. Sending both is incoherent.
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

  -- Ruling C1: 'mes' is a flat 30 days. (Custom is always 'dias', so this is a no-op
  -- for it — but the code path is SHARED, which is the point.)
  v_compra_dias := case when v_pk_vig_tipo = 'mes' then 30
                        else coalesce(v_pk_vig_dias, 0) end;

  if p_cliente_id is not null then
    -- Locked base read (C13/C6/C5): nothing can move the saldo mid-derivation.
    select c.clases_restantes, c.vence into v_cli
      from public.clientes c
      where c.id = p_cliente_id and c.gym_id = v_gym
      for update;
    if not found then raise exception 'Cliente no encontrado'; end if;

    -- baseParaStack, ruling C9: the vence day is a FULL training day — leftovers
    -- carry when renewing on it; forfeit starts the day after. Null vence = no
    -- vigencia ever sold = empty base.
    if v_cli.vence is not null and (v_cli.vence - v_hoy) >= 0 then
      v_base_clases := v_cli.clases_restantes;      -- null = ilimitado carries
      v_base_dias := v_cli.vence - v_hoy;
    else
      v_base_clases := 0;
      v_base_dias := 0;
    end if;
  else
    if coalesce(length(trim(p_nombre)), 0) < 3 or p_tel is null then
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

  -- stackPaquete, ruling C4: purchase wins, days carry. The ilimitado->finite branch
  -- keys on `v_base_clases is null` (true iff the locked base was an active ilimitado);
  -- it never re-reads v_cli, so the NEW-client path (v_cli unassigned) is safe.
  if v_pk_clases is null then
    v_new_clases := null;                                   -- becomes ilimitado
  elsif p_cliente_id is not null and v_base_clases is null then
    v_new_clases := v_pk_clases;                            -- ilimitado -> finite: pack's count
  else
    v_new_clases := coalesce(v_base_clases, 0) + v_pk_clases;
  end if;
  v_new_dias := v_base_dias + v_compra_dias;
  v_new_vence := v_hoy + v_new_dias;

  if p_cliente_id is not null then
    -- The C7 email backfill can collide with clientes_email_gym_uq (another row in the gym
    -- already holds p_email): surface a human message, not a raw 23505 — the TS write path
    -- matches this exact string (EMAIL_EN_USO_MSG). The whole sale rolls back (no venta row written).
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
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id, idempotency_key, personalizado)
    values (v_cliente_id, v_folio, v_pk_nombre, v_pk_clases, v_pk_vig_tipo, v_pk_vig_dias, v_pk_precio, p_metodo, v_gym, p_idempotency_key, v_custom);

  return query
    select v_folio, c.id, c.clases_restantes, c.vence, c.paquete_nombre, v_pk_precio
      from public.clientes c where c.id = v_cliente_id;
end;
$$;

revoke all on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer) from public, anon;
grant execute on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer) to authenticated;
