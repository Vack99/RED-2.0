-- Ruling C13 (findings 2026-07-08): registrar_venta re-derives everything from the
-- paquete row inside one locked transaction. The client sends identity + paquete +
-- metodo + an idempotency key — never balances, prices, or dates. Kills C13 (trust),
-- C6 (idempotency/concurrency), C5 (stale-read race) in one move; implements C1
-- (flat-30 mes), C4 (purchase wins, days carry), C9 (vence day valid), C7 (email
-- backfill via coalesce), D2 (duplicate guard). rules.ts is the executable spec;
-- the registrar_venta_stacking suite pins this SQL to it.
--
-- Signature CHANGE (breaks the old 12-arg overload — dropped first so PostgREST rpc
-- dispatch stays unambiguous). SECURITY INVOKER preserved (ADR-0005): the sale still
-- runs under the operator's RLS; only staff_gym()/next_folio() are definer helpers.
-- `set search_path to ''` preserved — every ref schema-qualified.
--
-- Delta from the task-4 brief (spec-preserving, not money-math): (1) the claim-code
-- mint from 20260708200001:52-66 is inlined, so v_bytes/i/v_alpha are declared here
-- (the brief's placeholder line assumed them). (2) The ilimitado->finite stack branch
-- keys on `v_base_clases is null` alone (dropping the brief's redundant trailing
-- `v_cli.vence ...` clause): that clause is logically implied by `v_base_clases is
-- null`, and referencing the `v_cli` record on the NEW-client path — where it is
-- never assigned — raises "record is not assigned yet" (plpgsql binds every
-- referenced variable before it evaluates the AND). Same rows written, no crash.

drop function if exists public.registrar_venta(
  text, text, text, text, integer, text, uuid, integer, date, integer, integer, text);

create or replace function public.registrar_venta(
  p_metodo text,
  p_paquete_id uuid,
  p_idempotency_key uuid,
  p_cliente_id uuid default null,
  p_nombre text default null,
  p_tel text default null,
  p_email text default null,
  p_forzar_nuevo boolean default false
) returns table(folio bigint, cliente_id uuid, clases_restantes integer, vence date, paquete_nombre text, monto integer)
language plpgsql
set search_path to ''
as $$
declare
  v_gym uuid;
  v_tz text;
  v_hoy date;
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

  -- Package facts come from the DB, never the client (C13).
  select p.nombre, p.clases, p.vigencia_tipo, p.vigencia_dias, p.precio into v_paq
    from public.paquetes p where p.id = p_paquete_id and p.gym_id = v_gym;
  if not found then raise exception 'Paquete no encontrado'; end if;

  select g.timezone into v_tz from public.gym g where g.id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;

  -- Ruling C1: 'mes' is a flat 30 days.
  v_compra_dias := case when v_paq.vigencia_tipo = 'mes' then 30
                        else coalesce(v_paq.vigencia_dias, 0) end;

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
  if v_paq.clases is null then
    v_new_clases := null;                                   -- becomes ilimitado
  elsif p_cliente_id is not null and v_base_clases is null then
    v_new_clases := v_paq.clases;                           -- ilimitado -> finite: pack's count
  else
    v_new_clases := coalesce(v_base_clases, 0) + v_paq.clases;
  end if;
  v_new_dias := v_base_dias + v_compra_dias;
  v_new_vence := v_hoy + v_new_dias;

  if p_cliente_id is not null then
    update public.clientes c
      set clases_restantes = v_new_clases,
          vence = v_new_vence,
          paquete_nombre = v_paq.nombre,
          email = coalesce(p_email, c.email)               -- C7 backfill
      where c.id = p_cliente_id;
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
          values (trim(p_nombre), p_tel, v_new_clases, v_new_vence, v_paq.nombre, v_gym, p_email, v_code)
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
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id, idempotency_key)
    values (v_cliente_id, v_folio, v_paq.nombre, v_paq.clases, v_paq.vigencia_tipo, v_paq.vigencia_dias, v_paq.precio, p_metodo, v_gym, p_idempotency_key);

  return query
    select v_folio, c.id, c.clases_restantes, c.vence, c.paquete_nombre, v_paq.precio
      from public.clientes c where c.id = v_cliente_id;
end;
$$;

revoke all on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean) to authenticated;
