-- RENEWAL IS A FULL RESET, BOTH AXES — owner ruling 2026-08-26.
--
-- Until now a renewal STACKED against an unexpired base (ruling C4, "purchase wins, days carry"):
-- `clases_restantes = leftover + pack.clases` and `vence = inicio + (old vence - inicio) + pack.dias`.
-- The owner has ruled that out on both axes. A sale now grants exactly what was bought:
--
--     clases_restantes = the pack's clases   (or NULL when the pack is ilimitado)
--     vence            = v_inicio + the pack's days
--
-- …for the existing-cliente path too. The prod data was already corrected to reset math by hand; this
-- is what stops the NEXT renewal from re-creating the carry it was corrected out of.
--
-- ONE SEMANTIC CHANGE. The `if v_cli.vence is not null and (v_cli.vence - v_inicio) >= 0` carry branch
-- becomes an unconditional `v_base_clases := 0; v_base_dias := 0;`, which is what the new-client arm
-- has always done — the two arms now agree, and the derivation below them is untouched. Everything
-- else in this body is byte-identical to 20260814130000.
--
-- WHAT THAT LEAVES ALONE, deliberately:
--
--   * The `elsif p_cliente_id is not null and v_base_clases is null` branch (ilimitado -> finite) is now
--     UNREACHABLE — v_base_clases is 0, never null, on every path. It is KEPT rather than deleted so the
--     diff against 20260814130000 is exactly the carry branch and nothing else, and because its answer
--     is unchanged either way: an ilimitado cliente buying a finite pack falls into the final `else`,
--     where `coalesce(0, 0) + v_pk_clases` is the same `v_pk_clases` the dead branch used to assign.
--     Deleting it is a tidy-up for whoever next opens this function, not part of this ruling.
--
--   * The locked base read (`for update`) STAYS. It no longer feeds the derivation, but it is what
--     serializes two concurrent sales against one cliente (C13/C6/C5) and what raises 'Cliente no
--     encontrado' for a cross-tenant id. Dropping it because its OUTPUT is now unused would delete the
--     lock and the tenant check with it.
--
--   * `editar_venta` / `editar_venta_paquete` (20260815120000/20260815130000) carry their own copies of
--     the stacking arithmetic — the paquete swap claws the old grant back and re-runs it forward. They
--     are NOT touched here: this migration is scoped to what a NEW sale grants. The correction doors
--     re-derive an EDIT of an existing sale, which is a separate ruling if the owner wants one.
--
--   * `stackPaquete` / `baseParaStack` in packages/domain/src/rules.ts still describe the carry. A
--     repo-wide grep finds no production caller — only rules.test.ts — so nothing user-facing previews
--     the old arithmetic today. Flagged, not changed: they are pure helpers with their own tests, and
--     rewriting them is not this migration.
--
-- KNOWN EDGE, accepted (do NOT "fix" this): bound 4 can now refuse a sale it used to accept. The
-- dead-on-arrival guard `if v_new_vence < v_hoy` compares the new vigencia against TODAY, and without
-- carried days a backdated sale near the 30-day floor with a short package can land entirely in the
-- past — e.g. p_fecha_inicio = today-25 with a 20-day pack now expires today-5 and is refused with 'La
-- venta ya estaría vencida en la fecha de inicio', where the old carry could have pushed it past today.
-- That refusal is CORRECT under the new rule (the sale really would be sold already-expired), and the
-- desk's answer is to pick a nearer start date. It is named here so the next reader does not "restore"
-- carry to make the guard quieter.
--
-- CREATE OR REPLACE at the byte-identical 14-arg signature — no new overload for PostgREST to
-- disambiguate, no PGRST202 window, and the ADR-0005 EXECUTE grants carry untouched.
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
  -- The effective start: the backdated sold date, else today. Every vence line below reads
  -- v_inicio; v_hoy stays only as the yardstick for the future/cap bounds.
  v_inicio := coalesce(p_fecha_inicio, v_hoy);

  -- Bounds 1 & 2 (A2/A3) — expressed against v_inicio, so both are structural no-ops when
  -- p_fecha_inicio is null (v_inicio = v_hoy). These two are the ONLY bounds on the date itself.
  -- Bound 4 (dead-on-arrival) still fires later, once the new vence is known — see the header for
  -- the one case the reset ruling makes it stricter in.
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
    -- Locked base read (C13/C6/C5): nothing can move the saldo mid-derivation, a concurrent second
    -- sale against this cliente serializes here, and a cross-tenant id is refused. Its COLUMNS no
    -- longer feed the derivation (see below) — the lock and the tenant check are why it stays.
    select c.clases_restantes, c.vence, c.created_at into v_cli
      from public.clientes c
      where c.id = p_cliente_id and c.gym_id = v_gym
      for update;
    if not found then raise exception 'Cliente no encontrado'; end if;

    -- FULL RESET (owner 2026-08-26). This is where `baseParaStack` used to carry the unexpired
    -- leftovers — `v_base_clases := v_cli.clases_restantes; v_base_dias := v_cli.vence - v_inicio`
    -- whenever the vence day had not passed as of v_inicio (rulings C9/B6/B4). It does not any more:
    -- a renewal grants the pack and only the pack, so an existing cliente starts from the same empty
    -- base a brand-new one does. The new vence may therefore land EARLIER than the old one; that is
    -- the ruling, not a bug.
    v_base_clases := 0;
    v_base_dias := 0;
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

  -- The grant. With both bases pinned to 0 this now reads: ilimitado pack => NULL, finite pack =>
  -- exactly the pack's count, vence => v_inicio + the pack's days. The `v_base_clases is null` arm
  -- below is the ilimitado->finite branch and is UNREACHABLE since the reset (v_base_clases is never
  -- null); it is kept, and it agrees with the `else` that now answers that case — see the header.
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
  -- date-boundary flip); not backdated ⇒ the now() default.
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
