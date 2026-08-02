-- clientes.tel becomes OPTIONAL (#190) — a phone stops being a condition of existing.
--
-- A member can walk up to the desk, pay, and leave without ever giving a number. The phone was
-- never what made the row real, but the schema insisted, so the desk invented one. TWO layers
-- actually enforced it, and both change here:
--
--   (1) `clientes.tel text NOT NULL` — the row could not be written at all without a value, which
--       is what produced the placeholder. Prod holds exactly ONE: gym `red`, Fernanda Chávez
--       Quezada, tel '0000000000'. Owner ruling 2026-08-01 — it becomes NULL, not a prettier
--       fiction. The backfill at the bottom does that.
--   (2) `registrar_venta`'s new-client guard (20260714110000:224) raised 'Datos del cliente
--       incompletos' on `p_tel is null`. Only that disjunct goes. The `p_nombre` half STAYS: a
--       sale still needs someone to be sold to, and an unnamed client row is not a lesser record,
--       it is an unusable one.
--
-- THE CHECK REWRITE IS DOCUMENTATION, NOT BEHAVIOR. `clientes_tel_10_digits_ck` already tolerated
-- NULL and always has: `char_length(regexp_replace(NULL, ...))` evaluates to NULL, and Postgres
-- counts a NULL CHECK result as satisfied. Confirmed against live before writing this. Re-adding
-- it as `tel is null or ...` states that in the constraint instead of leaving it to the reader's
-- three-valued-logic recall — the constraint is where someone goes to learn the rule. The EMPTY
-- STRING stays rejected ('' strips to 0 digits): absent is a phone we never asked for, '' is a
-- phone field someone cleared badly, and they are not the same fact about a member.
--
-- OUT OF SCOPE, deliberately (owner, 2026-08-01), so a later reader does not "finish the job":
--   * `reclamar_o_crear_cliente` keeps its 'Teléfono requerido' raise. That phone is verified auth
--     metadata on the self-signup door, not something a person types at a desk.
--   * `actualizar_cliente`'s `tel = p_tel` stays UNCONDITIONAL. That unconditional write is how a
--     placeholder gets cleared; a `coalesce(p_tel, tel)` would make clearing impossible.
--   * registrar_venta's D2 duplicate predicate below (`c.tel = p_tel or ...`) is already NULL-safe
--     — with a null p_tel it simply never matches on phone. A rewrite would be behavior-identical.
--
-- CREATE OR REPLACE, never drop+create. The 14-arg signature is byte-identical to 20260714110000,
-- so there is no new overload for PostgREST to disambiguate, and a DROP would open the same
-- PGRST202 deploy window that file's header records at :10-14 — for nothing. REPLACE preserves the
-- EXECUTE lockdown, so the revoke/grant pair is deliberately NOT re-issued here. SECURITY INVOKER
-- (ADR-0005) and `set search_path to ''` are preserved by copying the body verbatim; the ONE line
-- that differs from 20260714110000 is the guard named in (2).
--
-- Idempotent and re-runnable: drop-not-null is a no-op once dropped, drop-constraint-if-exists
-- precedes the add, the function is create-or-replace, and the backfill matches 0 rows on a fresh
-- scratch project and on every run after the first.

-- ── (1) the NOT NULL ───────────────────────────────────────────────────────────
alter table public.clientes alter column tel drop not null;

-- ── (2) the CHECK, restated ────────────────────────────────────────────────────
-- Behavior-identical to 20260601022323 (see header); the null arm is now written down.
alter table public.clientes drop constraint if exists clientes_tel_10_digits_ck;
alter table public.clientes
  add constraint clientes_tel_10_digits_ck
  check (tel is null or char_length(regexp_replace(tel, '\D', '', 'g')) = 10);

-- ── (3) registrar_venta — the new-client guard drops its phone half ────────────
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
  -- p_fecha_inicio is null (v_inicio = v_hoy). Bounds 3 (created_at) and 4 (dead-on-arrival)
  -- fire later, once the client row / the new vence are known.
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

    -- Bound 3 (A4): a backdate cannot predate the client's own alta (gym tz). A NEW client
    -- created this txn has a created_at day of today, so v_inicio (≤ today) never trips it.
    if v_inicio < (v_cli.created_at at time zone v_tz)::date then
      raise exception 'La fecha de inicio es anterior al alta del cliente';
    end if;

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

-- ── (4) the placeholder ────────────────────────────────────────────────────────
-- Deliberately keyed on the SHAPE, not on one id: an all-zeros tel is never a real number, so any
-- that crept in anywhere go with it. Scanned across all four gyms 2026-08-01 — exactly one matches,
-- the row this was written for: gym `red`, Fernanda Chávez Quezada, folio 1022.
update public.clientes set tel = null where regexp_replace(tel, '\D', '', 'g') = '0000000000';
