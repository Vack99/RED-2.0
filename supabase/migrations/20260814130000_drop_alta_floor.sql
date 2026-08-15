-- The ALTA FLOOR dies, at BOTH doors — owner ruling 2026-08-14 (recorded on #266).
--
-- Bound 3 of the backdate spec ("a sale's fecha may not predate the cliente's `created_at`", shipped
-- in 20260714110000 as [A4] and mirrored into the edit door by 20260814120000) rested on an
-- assumption the desk does not honour: that a client's row exists by the time they first pay. It does
-- not. Gyms register walk-ins LATE — the person trains and pays first, and gets typed into the system
-- days later — so `clientes.created_at` is a data-entry stamp, not the date the member arrived.
-- Which means the floor was strictest exactly where the correction is most needed: the forgotten sale,
-- registered days after the fact, against a client who was ALSO registered days after the fact. It
-- refused the very case both doors exist to allow.
--
-- What STAYS, at both doors: the not-future guard and the 30-day look-back window. Those bound the
-- REAL thing being protected — the earnings month a sale is attributed to — and they are unchanged
-- here, messages included. registrar_venta's dead-on-arrival bound (E2) is untouched too.
--
-- `clientes.created_at` is NOT touched by any of this: no backfill, no column change, no new write.
-- It keeps meaning exactly what it has always meant (when the row was typed in); it simply stops
-- being read as a floor on money that predates it.

-- ── registrar_venta — the CREATE door ──────────────────────────────────────────
-- CREATE OR REPLACE, never drop+create: the 14-arg signature is byte-identical to 20260801120000, so
-- there is no new overload for PostgREST to disambiguate and no PGRST202 deploy window. The body is
-- that migration's, verbatim, MINUS the alta-floor block; the locked base read still selects
-- `created_at` into v_cli (now unread) so the diff is the removed guard and nothing else.
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
  p_custom_dias integer default null,
  p_fecha_inicio date default null
) returns table(folio bigint, cliente_id uuid, clases_restantes integer, vence date, paquete_nombre text, monto integer)
language plpgsql
set search_path to ''
as $$
declare
  v_gym uuid;
  v_tz text;
  v_hoy date;
  v_inicio date;      -- the effective start (backdated sold date, else today)
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
  -- The effective start: the backdated sold date, else today. Every vence/stacking line
  -- below reads v_inicio; v_hoy stays only as the yardstick for the future/cap bounds.
  v_inicio := coalesce(p_fecha_inicio, v_hoy);

  -- Bounds 1 & 2 (A2/A3) — expressed against v_inicio, so both are structural no-ops when
  -- p_fecha_inicio is null (v_inicio = v_hoy). These two are now the ONLY bounds on the date
  -- itself; the alta floor that used to sit beside them is gone (owner 2026-08-14, header).
  -- Bound 4 (dead-on-arrival) still fires later, once the new vence is known.
  if v_inicio > v_hoy then
    raise exception 'La fecha de inicio no puede ser futura';
  end if;
  if v_inicio < v_hoy - 30 then
    raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad';
  end if;

  -- Ruling C1: 'mes' is a flat 30 days. (Custom is always 'dias', so this is a no-op
  -- for it — but the code path is SHARED, which is the point.)
  v_compra_dias := case when v_pk_vig_tipo = 'mes' then 30
                        else coalesce(v_pk_vig_dias, 0) end;

  if p_cliente_id is not null then
    -- Locked base read (C13/C6/C5): nothing can move the saldo mid-derivation.
    select c.clases_restantes, c.vence, c.created_at into v_cli
      from public.clientes c
      where c.id = p_cliente_id and c.gym_id = v_gym
      for update;
    if not found then raise exception 'Cliente no encontrado'; end if;

    -- baseParaStack, ruling C9 evaluated AS OF v_inicio (B6): the vence day is a FULL
    -- training day — leftovers carry when the effective start is on/before it, forfeit the
    -- day after. Null vence = no vigencia ever sold = empty base. The ilimitado base rides
    -- this same gate (v_base_clases carries the null, B4).
    if v_cli.vence is not null and (v_cli.vence - v_inicio) >= 0 then
      v_base_clases := v_cli.clases_restantes;      -- null = ilimitado carries
      v_base_dias := v_cli.vence - v_inicio;
    else
      v_base_clases := 0;
      v_base_dias := 0;
    end if;
  else
    -- #190: the phone half of this guard is GONE — tel is optional now. A name is still
    -- required; it is the only thing that makes the new row identifiable at the desk.
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
  v_new_vence := v_inicio + v_new_dias;

  -- Bound 4 (E2): reject an already-expired backdate at the write boundary, so the member
  -- app can never be handed a "Renueva el {pasado}" the feature itself created. A
  -- non-backdated sale can never reach here (v_inicio = today, v_new_dias ≥ 0).
  if v_new_vence < v_hoy then
    raise exception 'La venta ya estaría vencida en la fecha de inicio';
  end if;

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
  -- Written ledger date (A1): backdated ⇒ midday gym-tz on v_inicio (immune to a UTC
  -- date-boundary flip); not backdated ⇒ the now() default, byte-for-byte v3.
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id, idempotency_key, personalizado, fecha)
    values (v_cliente_id, v_folio, v_pk_nombre, v_pk_clases, v_pk_vig_tipo, v_pk_vig_dias, v_pk_precio, p_metodo, v_gym, p_idempotency_key, v_custom,
            case when p_fecha_inicio is not null
                 then (v_inicio::timestamp + interval '12 hours') at time zone v_tz
                 else now() end);

  return query
    select v_folio, c.id, c.clases_restantes, c.vence, c.paquete_nombre, v_pk_precio
      from public.clientes c where c.id = v_cliente_id;
end;
$$;

-- ── EXECUTE lockdown (ADR-0005), re-asserted verbatim from 20260714110000:313-314 ──
revoke all on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer, date) from public, anon;
grant execute on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer, date) to authenticated;

-- ── editar_venta — the EDIT door ───────────────────────────────────────────────
-- Same 4-arg signature as 20260814120000, so no DROP and no PGRST203 ambiguity. The whole alta stanza
-- goes: the `v_alta` declare, the venta→clientes lookup that fed it, that lookup's `if not found`
-- raise, and the comparison itself. Dropping the early lookup does NOT weaken the refusal for a
-- non-existent or cross-tenant venta — the final UPDATE is already gated on `gym_id = v_gym` and
-- raises the SAME 'Venta no encontrada' on zero rows, which is the message that lookup was echoing.
create or replace function public.editar_venta(p_venta_id uuid, p_monto integer, p_metodo text,
                                               p_fecha date default null)
  returns void
  language plpgsql
  security invoker
  set search_path to ''
as $function$
declare
  v_gym      uuid;
  v_tz       text;
  v_hoy      date;
  v_fecha_ts timestamptz;
begin
  -- Authorization first, input second — the registrar_venta order (functions-canonical/
  -- registrar_venta.sql:30-31 gates before :46-48 validates): a caller with no staff row learns
  -- 'No autorizado' and nothing about which arguments this gym would have accepted.
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- Re-assert the domain in-body so a bad método surfaces a human message instead of a raw 23514,
  -- exactly as registrar_venta does ('pendiente' was removed by ruling C2).
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  -- `monto` has NO table CHECK, so this is the only place any bound exists at all — the Zod schema
  -- sits on the far side of the trust boundary and binds nobody calling the RPC directly. Same raise
  -- shape as registrar_venta's custom precio (functions-canonical/registrar_venta.sql:69-71), but the
  -- bound is deliberately ONE-SIDED: that 100 000 cap governs only the CUSTOM branch, while the
  -- PAQUETE branch writes `monto` from `paquetes.precio`, which carries no CHECK and no ceiling. An
  -- upper bound here would make an already-registered high-value sale permanently UNCORRECTABLE —
  -- the sheet seeds its field from the stored monto, so the operator could not even fix the método —
  -- and it would buy nothing, since the residual 20260814120000 accepts is an unbounded PATCH anyway.
  if p_monto is null or p_monto < 1 then
    raise exception 'Monto inválido';
  end if;

  -- null p_fecha = "don't touch the date": the 3-arg call this replaces keeps its exact old behavior.
  if p_fecha is not null then
    select g.timezone into v_tz from public.gym g where g.id = v_gym;
    v_hoy := (now() at time zone v_tz)::date;

    -- Both remaining bounds still MIRROR registrar_venta verbatim, messages included, so the edit
    -- door cannot write a fecha the create door would refuse. The third bound both doors used to
    -- carry — before the cliente's alta — was dropped from both on 2026-08-14 (see header).
    if p_fecha > v_hoy then
      raise exception 'La fecha de inicio no puede ser futura';
    end if;
    if p_fecha < v_hoy - 30 then
      raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad';
    end if;

    v_fecha_ts := (p_fecha::timestamp + interval '12 hours') at time zone v_tz;
  end if;

  -- `gym_id = v_gym` makes a cross-tenant id a REFUSAL, not a silent zero-row no-op.
  update public.ventas set monto = p_monto, metodo = p_metodo, fecha = coalesce(v_fecha_ts, fecha)
   where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005): revoke from BOTH public AND anon (a bare revoke from PUBLIC does not
-- remove anon's separate platform default-privilege grant — 20260808130000:104-109) ───────────────
revoke execute on function public.editar_venta(uuid, integer, text, date) from public, anon;
grant  execute on function public.editar_venta(uuid, integer, text, date) to authenticated;
