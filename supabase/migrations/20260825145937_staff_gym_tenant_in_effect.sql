-- RECOVERED 2026-08-27 from prod supabase_migrations.schema_migrations after the registrar_venta overload outage — the file was never committed to this repo.
-- Applied to prod 2026-08-25 from the mobile lane as version 20260825145937 (staff_gym_tenant_in_effect); body verified byte-identical to the applied statements (whitespace-normalized md5).

-- The SQL tier learns the gym IN EFFECT — 11 RPCs grow an optional `p_gym_id`, one grows a predicate.
-- Findings C4, C5, I11, I12 and M6 of docs/audits/2026-08-24-session-lifecycle-audit.md, plus one
-- same-class finding this session's sweep added: cancel_class_session.
--
-- ── The defect class ────────────────────────────────────────────────────────────────────────────────
-- Every function below derived its tenant from `public.staff_gym()`, whose whole body is
--
--     select gym_id from public.gym_membership
--      where user_id = (select auth.uid()) and role in ('owner','operator')
--      order by gym_id limit 1
--
-- — the LOWEST-uuid gym the caller staffs, not the gym they are working in. That was correct while
-- one-membership-per-login was the platform invariant (20260702233000 says so in as many words). It is
-- not any more: #219 shipped the two-membership actor, #212 made the ADMIN app host-aware
-- (`getOperatorGym` resolves the gym the HOST names), and apps/mobile resolves it from a PICKER
-- (`useGymActivo`). Both apps know which tenant is in effect; the SQL tier threw that away and picked
-- by uuid ordering. For a two-gym operator working their SECOND gym, every write below silently landed
-- in the FIRST — including `registrar_venta`, the money path. Nothing raises; the rows are simply in
-- the wrong tenant, and RLS then hides them from the gym that was supposed to receive them.
--
-- This is the same class of bug as [[multigym-rpc-roulette]] and as `crear_plantilla`
-- (20260820120000), whose fix shape this migration follows verbatim.
--
-- `cancel_class_session` is a sharper member of the family: it called `staff_gym()` ONLY to prove the
-- caller was staff SOMEWHERE and then discarded the answer, leaving its session read and its cancel
-- UPDATE with no gym predicate at all. Its effective scope was therefore whatever RLS allowed, and
-- RLS is deliberately wider than "the gym in effect" on both statements. Stated precisely, because
-- this comment is the permanent record: a staff member of a gym could cancel a class in ANY OTHER
-- gym they staff, regardless of the gym in effect (`class_session_staff_update` is
-- `is_staff_of(gym_id)` — 20260706120000:119-121, never widened, so it was never a write into a gym
-- the caller does not staff), and could probe session state — `La clase ya comenzó` vs
-- `Sesión no encontrada o ya cancelada` — in any gym they are merely a MEMBER of, because the SELECT
-- policy is the wider `is_member_of`. The first is the multi-gym operator's wrong-tenant cancel; the
-- second is an error-message oracle. Both close below.
--
-- `actualizar_paquete` never called `staff_gym()`, but has the same shape from the other end: its
-- sibling-demotion UPDATE carried no gym filter and leaned entirely on RLS, which grants a multi-gym
-- operator BOTH gyms — so promoting one gym's paquete cleared the other gym's popular flag.
--
-- ── Why `p_gym_id` is OPTIONAL, and must stay optional ──────────────────────────────────────────────
-- This migration goes LIVE (MCP) the moment it is applied, while the app code that passes the new
-- argument ships only on the owner-gated Vercel push. Between those two events every deployed caller —
-- web, mobile, and any open browser tab — is still sending the OLD argument list. So the parameter
-- defaults to null, and the null arm has to be the CURRENT behavior, not a new one: nothing in this
-- file may make a call that works today start failing during that window. The argument is a SCOPE
-- SELECTOR, never a boundary — supplied, it must pass `public.is_staff_of`, the same owner|operator
-- predicate `staff_gym()` itself filters on, so an unauthorized target RAISEs before any read or write
-- happens and the call writes NOTHING.
--
-- TEN of the eleven get that for free: their null arm is `public.staff_gym()`, byte-for-byte the
-- assignment being replaced. `cancel_class_session` is the exception and is written differently ON
-- PURPOSE. Its legacy body had NO gym predicate, so its live scope is RLS's — every gym the caller
-- staffs — and a `staff_gym()` fallback would have NARROWED it to the caller's lowest-uuid gym. A
-- two-gym operator working their other gym would then have started getting 'Sesión no encontrada o ya
-- cancelada' on a class plainly on their screen, from the instant this migration applied until the
-- app learned to send `p_gym_id` — a self-inflicted outage in exactly the deploy window this section
-- exists to protect. So its null arm derives the gym FROM THE TARGET ROW
-- (`select gym_id … where id = p_session_id`) and then requires `is_staff_of` on it. That is
-- effect-equivalent to today for every staffed caller, and it closes the oracle above as a bonus:
-- a caller who is only a MEMBER of the session's gym now gets 'No autorizado' instead of the
-- before-start tense. No app calls this verb as a member.
--
-- ── Why DROP + CREATE rather than CREATE OR REPLACE ─────────────────────────────────────────────────
-- `create or replace` cannot change a signature: it would leave the OLD overload live beside the new
-- one, and a defaulted extra argument makes every existing PostgREST payload ambiguous (PGRST203).
-- One signature, one function — the `editar_venta` (20260815120000) and `crear_plantilla`
-- (20260820120000) precedent. Each DROP names the EXACT current argument list; each CREATE is followed
-- by the least-privilege revoke/grant pair restated for the NEW signature, because `create function`
-- grants EXECUTE to public by default and the old signature's grants die with the old function.
-- `actualizar_paquete` keeps its signature, so it is a plain `create or replace` with no drop and no
-- re-grant.
--
-- Bodies below are the CURRENT live bodies (supabase/functions-canonical/, regenerated by
-- `pnpm gen:rpc-canon`) with only the deltas named here applied: the appended parameter, the
-- resolution block replacing the `staff_gym()` assignment, the two internal calls that now thread the
-- resolved gym, cancel_class_session's derive-from-target arm and two gym predicates,
-- sembrar_plantillas_default's net-new null guard, and actualizar_paquete's demotion predicate.
-- Language, SECURITY invoker/definer and `set search_path to ''` are unchanged on every one.
--
-- The file ends with a pg_proc self-check: `drop function if exists` SWALLOWS a signature mismatch,
-- so if the live catalog ever disagreed with this repo's migration record by one argument type, the
-- DROP would no-op and the CREATE would add a SECOND overload — making every deployed PostgREST
-- payload ambiguous (PGRST203), `registrar_venta` included, i.e. every sale in every gym. The
-- assertion turns that into a failed apply instead. See [[prod-migration-version-drift]].
--
-- Written-row coverage: supabase/tests/dos_gimnasios_staff_pin.sql (ventas + catálogo) and
-- supabase/tests/dos_gimnasios_staff_pin_agenda.sql (agenda), the repo's first fixture with ONE
-- operator staffing TWO gyms.

-- ── registrar_venta — the money path ────────────────────────────────────────────────────────────────
drop function if exists public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer, date);

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
  p_fecha_inicio date default null,
  p_gym_id uuid default null
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
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header).
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

revoke all     on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer, date, uuid) from public, anon;
grant  execute on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer, date, uuid) to authenticated;

-- ── editar_venta — the EDIT door (SECURITY DEFINER: the in-body check IS the boundary) ──────────────
drop function if exists public.editar_venta(uuid, integer, text, date, uuid, text, integer, integer, boolean);

create or replace function public.editar_venta(
    p_venta_id         uuid,
    p_monto            integer,
    p_metodo           text,
    p_fecha            date    default null,
    p_paquete_id       uuid    default null,
    p_custom_nombre    text    default null,
    p_custom_clases    integer default null,
    p_custom_dias      integer default null,
    p_custom_ilimitado boolean default null,
    p_gym_id           uuid    default null
  )
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_gym            uuid;
  v_tz             text;
  v_hoy            date;
  v_fecha_ts       timestamptz;
  v_fecha_dia      date;
  v_custom         boolean;
  v_paq            record;
  v_venta          record;
  v_cli            record;
  v_nombre         text;
  v_clases         integer;      -- null = ilimitado
  v_vig_tipo       text;
  v_vig_dias       integer;
  v_person         boolean;
  v_cambio_grant   boolean;
  v_cambio_paquete boolean;
  v_cambio_fecha   boolean;
  v_dias_old       integer;
  v_dias_new       integer;
  v_anchor         date;         -- max(prior_base_end, old_fecha_day) — what the inverse recovers
  v_fecha_old_dia  date;         -- the sale's STORED gym-tz day, the disambiguator
  v_base_clases    integer;      -- may be NEGATIVE inside the transaction, by design
  v_base_vence     date;
  v_base_dias      integer;
  v_new_clases     integer;      -- null = ilimitado
  v_new_vence      date;
begin
  -- Authorization first, input second — the registrar_venta order (functions-canonical/
  -- registrar_venta.sql:30-31 gates before :46-48 validates): a caller with no staff row learns
  -- 'No autorizado' and nothing about which arguments this gym would have accepted.
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header). SECURITY
  -- DEFINER: this check IS the boundary here, so `is_staff_of` is what stands between a supplied
  -- p_gym_id and another tenant's ventas.
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- Re-assert the domain in-body so a bad método surfaces a human message instead of a raw 23514,
  -- exactly as registrar_venta does ('pendiente' was removed by ruling C2).
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  -- `monto` has NO table CHECK, so this is the only place any bound exists at all — the Zod schema
  -- sits on the far side of the trust boundary and binds nobody calling the RPC directly. The bound is
  -- deliberately ONE-SIDED: an upper cap would make an already-registered high-value sale permanently
  -- UNCORRECTABLE (the sheet seeds its field from the stored monto), and `paquetes.precio` carries no
  -- ceiling of its own anyway.
  if p_monto is null or p_monto < 1 then
    raise exception 'Monto inválido';
  end if;

  -- `v_custom` is true if ANY custom field was sent, so a half-filled custom payload alongside a
  -- paquete_id trips the guard rather than being silently ignored. NOTE the difference from
  -- registrar_venta's XOR: here NEITHER source is legal too, and means "keep the current package".
  v_custom := (p_custom_nombre is not null
               or p_custom_clases is not null
               or p_custom_dias is not null
               or coalesce(p_custom_ilimitado, false));
  if v_custom and p_paquete_id is not null then
    raise exception 'Venta inválida: elige un paquete o define uno personalizado';
  end if;

  -- FOR UPDATE on the VENTA: two overlapping edits of the same sale would otherwise both read the same
  -- stored grant, serialize on the clientes lock below, and each apply a full clawback + re-grant —
  -- corrupting the balance permanently. The lock makes the second call wait and then re-read a row that
  -- already carries the new package facts, at which point the change flags make it a no-op. Same
  -- double-apply guard eliminar_venta documents at functions-canonical/eliminar_venta.sql:13-16.
  -- `v_venta.fecha` is read HERE, before the row is rewritten below, which is what lets the clawback
  -- ask "did this sale stack, or did it start?" — see the header.
  select v.cliente_id, v.paquete_nombre, v.clases, v.vigencia_tipo, v.vigencia_dias,
         v.personalizado, v.fecha, v.created_at
    into v_venta
    from public.ventas v
    where v.id = p_venta_id and v.gym_id = v_gym
    for update;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- Every day below is a GYM-tz day: the bounds, the stored instant, and the day the re-grant stacks
  -- from. A session-tz date would disagree with the gym's for the hours the two calendars differ.
  select g.timezone into v_tz from public.gym g where g.id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;

  -- ── The target package facts. Three branches converge on the same five variables, which is what lets
  -- the re-derive below stay single-path (registrar_venta's converged-facts shape). ────────────────
  if p_paquete_id is not null then
    -- Package facts come from the DB, never the client (C13). Tenant-scoped, so a cross-gym paquete id
    -- is this refusal rather than a leak of another gym's catalog.
    select p.nombre, p.clases, p.vigencia_tipo, p.vigencia_dias into v_paq
      from public.paquetes p where p.id = p_paquete_id and p.gym_id = v_gym;
    if not found then raise exception 'Paquete no encontrado'; end if;
    v_nombre   := v_paq.nombre;
    v_clases   := v_paq.clases;
    v_vig_tipo := v_paq.vigencia_tipo;
    v_vig_dias := v_paq.vigencia_dias;
    v_person   := false;
  elsif v_custom then
    -- registrar_venta's custom validations verbatim (functions-canonical/registrar_venta.sql:60-88),
    -- MINUS precio: the RPC is the trust boundary, the form is not.
    v_nombre := trim(coalesce(p_custom_nombre, ''));
    if length(v_nombre) < 3 or length(v_nombre) > 40 then
      raise exception 'Nombre del paquete personalizado inválido';
    end if;
    if p_custom_dias is null or p_custom_dias < 1 or p_custom_dias > 365 then
      raise exception 'Vigencia personalizada inválida';
    end if;
    -- p_custom_ilimitado exists because SQL cannot tell "argument absent" from "argument is null", and
    -- null IS the ilimitado value. Sending both is incoherent.
    if coalesce(p_custom_ilimitado, false) then
      if p_custom_clases is not null then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_clases := null;
    else
      if p_custom_clases is null or p_custom_clases < 1 or p_custom_clases > 365 then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_clases := p_custom_clases;
    end if;
    v_vig_tipo := 'dias';
    v_vig_dias := p_custom_dias;
    v_person   := true;
  else
    -- Neither source sent = "keep the current package". Copying the stored facts (rather than skipping
    -- the block) is what makes a fecha-only edit run the SAME core with old == new, so a fecha-only
    -- correction is the swap's own math with an unchanged package instead of a second code path.
    v_nombre   := v_venta.paquete_nombre;
    v_clases   := v_venta.clases;
    v_vig_tipo := v_venta.vigencia_tipo;
    v_vig_dias := v_venta.vigencia_dias;
    v_person   := v_venta.personalizado;
  end if;

  -- null p_fecha = "don't touch the date". Both bounds MIRROR registrar_venta verbatim, messages
  -- included, so the edit door cannot write a fecha the create door would refuse; the third bound both
  -- doors used to carry (before the cliente's alta) was dropped from both on 2026-08-14
  -- (20260814130000). The written instant is registrar's convention: midday in the gym's timezone.
  if p_fecha is not null then
    if p_fecha > v_hoy then
      raise exception 'La fecha de inicio no puede ser futura';
    end if;
    if p_fecha < v_hoy - 30 then
      raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad';
    end if;
    v_fecha_ts := (p_fecha::timestamp + interval '12 hours') at time zone v_tz;
  end if;
  -- The sale's STORED gym-tz day, and the day the re-grant stacks from: the requested one, else the
  -- stored one. The two are the same value on a package-only swap.
  v_fecha_old_dia := (v_venta.fecha at time zone v_tz)::date;
  v_fecha_dia     := coalesce(p_fecha, v_fecha_old_dia);

  -- ── Change detection (see 20260815120000's header): triggered by a CHANGE, never by the call. ────
  v_cambio_grant   := (v_clases   is distinct from v_venta.clases)
                   or (v_vig_tipo is distinct from v_venta.vigencia_tipo)
                   or (v_vig_dias is distinct from v_venta.vigencia_dias);
  v_cambio_paquete := v_cambio_grant
                   or (v_nombre is distinct from v_venta.paquete_nombre)
                   or (v_person is distinct from v_venta.personalizado);
  v_cambio_fecha   := p_fecha is not null
                  and p_fecha is distinct from v_fecha_old_dia;

  -- Ruling 4's window, written over the RE-DERIVE and not over the package change alone: a fecha-only
  -- edit re-grants exactly as much as a swap does. monto/metodo — and a pure rename, which moves no
  -- saldo — stay any-age (#266.3).
  if (v_cambio_grant or v_cambio_fecha) and v_venta.created_at < now() - interval '30 days' then
    raise exception 'Ya pasaron 30 días: esta venta ya no se puede recalcular';
  end if;

  -- The top-of-stack precondition: the clawback is a LINEAR inverse, so it only recovers this sale's
  -- own anchor while nothing has stacked on top of it. A later sale of the same cliente makes the
  -- subtraction meaningless and would silently destroy that later sale's grant, so the re-derive is
  -- refused outright rather than approximated. Monto/metodo-only edits never reach here.
  if (v_cambio_grant or v_cambio_fecha)
     and exists (select 1 from public.ventas v
                  where v.cliente_id = v_venta.cliente_id
                    and v.gym_id = v_gym
                    and (v.created_at, v.id) > (v_venta.created_at, p_venta_id)) then
    raise exception 'Solo la venta más reciente puede cambiar de paquete o fecha';
  end if;

  -- The venta row is rewritten BEFORE the clientes write, so the paquete_nombre subselect below sees
  -- the new name. `folio`, `created_at`, `cliente_id`, `gym_id` and `idempotency_key` are never
  -- touched: folio is the paper ticket, created_at is the delete/swap window anchor. `gym_id = v_gym`
  -- makes a cross-tenant id a REFUSAL, not a silent zero-row no-op.
  update public.ventas
     set monto = p_monto, metodo = p_metodo, fecha = coalesce(v_fecha_ts, fecha),
         paquete_nombre = v_nombre, clases = v_clases,
         vigencia_tipo = v_vig_tipo, vigencia_dias = v_vig_dias, personalizado = v_person
   where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- ── The cheap path: nothing that moves a saldo changed. ─────────────────────────────────────────
  if not (v_cambio_grant or v_cambio_fecha) then
    -- A rename or a personalizado-flag flip still re-stamps the display label, from the latest
    -- REMAINING sale rather than from v_nombre, so renaming a NON-latest sale leaves the label alone.
    if v_cambio_paquete then
      update public.clientes c
         set paquete_nombre = (select v.paquete_nombre from public.ventas v
                                where v.cliente_id = c.id and v.gym_id = v_gym
                                order by v.created_at desc, v.id desc
                                limit 1)
       where c.id = v_venta.cliente_id and c.gym_id = v_gym;   -- defense in depth (see below)
    end if;
    -- A monto/metodo-only edit reaches `clientes` not at all.
    return;
  end if;

  -- Lock the saldo row before the read-modify-write, same discipline as registrar_venta. The venta's FK
  -- guarantees the row exists, so there is no extra refusal string here.
  select c.clases_restantes, c.vence into v_cli
    from public.clientes c where c.id = v_venta.cliente_id
    for update;

  -- ── Clawback of what THIS sale granted — UNCLAMPED (20260815120000's header). ────────────────────
  -- Ruling C1: 'mes' is a flat 30 days; 'dias' uses its own count; null contributes nothing.
  v_dias_old    := case when v_venta.vigencia_tipo = 'mes' then 30
                        else coalesce(v_venta.vigencia_dias, 0) end;
  v_base_clases := case when v_cli.clases_restantes is null then null
                        else v_cli.clases_restantes - coalesce(v_venta.clases, 0) end;

  -- THE ANCHOR, NOT THE BASE (this migration's whole subject — see the header). registrar wrote
  -- `vence = max(base_end, fecha) + dias`, so subtracting the días recovers `max(base_end, fecha)`.
  -- It is the pre-sale base only when a live base outlasted the purchase day; otherwise it IS the
  -- purchase day, and treating it as a base cancels the new fecha out of the forward pass below.
  -- `> v_fecha_old_dia` is the exact test for "a live base outlasted the purchase day", and it makes
  -- the recovery EXACT in that branch (the max resolved to base_end). Everything else reads as a
  -- restart and carries nothing, which is registrar's own behaviour at a day with no live vigencia.
  v_anchor     := case when v_cli.vence is null then null else v_cli.vence - v_dias_old end;
  v_base_vence := case when v_anchor is null              then null
                       when v_anchor > v_fecha_old_dia    then v_anchor
                       else null end;

  -- ── Re-grant at v_fecha_dia — registrar_venta's stacking block, verbatim. ───────────────────────
  v_dias_new := case when v_vig_tipo = 'mes' then 30 else coalesce(v_vig_dias, 0) end;

  -- baseParaStack (C9) evaluated AS OF the sale's day: the vence day is a FULL training day, so
  -- leftovers carry when the day is on/before it and are forfeited the day after. The else arm is
  -- registrar's expired-restart discard: the sale restarts the member from nothing. A null
  -- `v_base_vence` — no live base at all, per the anchor test above — lands here too, which is what
  -- makes "vence follows fecha" bite on a fresh sale.
  if v_base_vence is not null and (v_base_vence - v_fecha_dia) >= 0 then
    v_base_dias := v_base_vence - v_fecha_dia;
  else
    v_base_dias   := 0;
    v_base_clases := 0;
  end if;

  -- stackPaquete (C4): purchase wins, days carry. THE ONE CLAMP lives on the last line of this block
  -- and nowhere else — clamping the clawback instead would gift classes on an over-consumed balance.
  if v_clases is null then
    v_new_clases := null;                                   -- ilimitado package
  elsif v_base_clases is null then
    v_new_clases := v_clases;                               -- ilimitado balance -> finite: pack's count
  else
    v_new_clases := greatest(0, v_base_clases + v_clases);
  end if;
  v_new_vence := v_fecha_dia + v_base_dias + v_dias_new;

  -- No dead-on-arrival refusal here (20260815120000's header): on a correction, "already expired" is
  -- often the truth being recorded.
  --
  -- `c.gym_id = v_gym` is DEFENSE IN DEPTH, not a live gate: the cliente is reached through a venta this
  -- body already pinned to `v_gym`, and the subselect inside carries the same predicate. It exists so
  -- the tenant filter is on the MUTATING statement as well as inside it — the house form — and so a
  -- future path that reaches this update with a cliente_id from somewhere else cannot write cross-gym.
  update public.clientes c
     set clases_restantes = v_new_clases,
         vence            = v_new_vence,
         paquete_nombre   = (select v.paquete_nombre from public.ventas v
                              where v.cliente_id = c.id and v.gym_id = v_gym
                              order by v.created_at desc, v.id desc
                              limit 1)
   where c.id = v_venta.cliente_id and c.gym_id = v_gym;
end;
$function$;

revoke execute on function public.editar_venta(uuid, integer, text, date, uuid, text, integer, integer, boolean, uuid) from public, anon;
grant  execute on function public.editar_venta(uuid, integer, text, date, uuid, text, integer, integer, boolean, uuid) to authenticated;

-- ── eliminar_venta — the DELETE door (SECURITY DEFINER: the in-body check IS the boundary) ──────────
drop function if exists public.eliminar_venta(uuid);

create or replace function public.eliminar_venta(p_venta_id uuid, p_gym_id uuid default null)
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_gym   uuid;
  v_venta record;
  v_dias  integer;
  v_saldo integer;
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header). SECURITY
  -- DEFINER: this check IS the boundary here.
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- FOR UPDATE on the VENTA, not just on the cliente below: two overlapping deletes of the same sale
  -- would otherwise both pass the window check, serialize on the clientes lock, and each apply the full
  -- clawback — the loser deleting zero rows but still subtracting the clases/días a second time, which
  -- corrupts the stored balance permanently. The lock makes the second call wait and then find nothing.
  select v.cliente_id, v.clases, v.vigencia_tipo, v.vigencia_dias, v.created_at into v_venta
    from public.ventas v
    where v.id = p_venta_id and v.gym_id = v_gym
    for update;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- #266.2: the window runs from registration, NOT from the backdatable sold date `fecha`.
  if v_venta.created_at < now() - interval '30 days' then
    raise exception 'La venta ya no se puede eliminar';
  end if;

  -- Lock the saldo row before the read-modify-write, same discipline as registrar_venta — and READ it,
  -- because the floor-clip gate below is a predicate on it.
  select c.clases_restantes into v_saldo
    from public.clientes c where c.id = v_venta.cliente_id
    for update;

  -- Ruling 3, the floor-clip gate. Strictly-below-zero only; `= 0` is allowed.
  if v_saldo is not null and v_venta.clases is not null and v_saldo - v_venta.clases < 0 then
    raise exception 'No se puede eliminar: ya se usaron clases de esta venta';
  end if;

  -- The tenant predicate rides the MUTATING statement (house form), and the rowcount check makes a
  -- zero-row delete a refusal instead of a clawback with nothing to claw back.
  delete from public.ventas where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- Ruling C1: 'mes' is a flat 30 days; 'dias' uses its own count; null contributes nothing.
  v_dias := case when v_venta.vigencia_tipo = 'mes' then 30
                 else coalesce(v_venta.vigencia_dias, 0) end;

  -- The lossy inversion (20260813120000's header): subtract what this sale granted. The greatest(0, …)
  -- survives as a belt — the gate above already proved the subtraction cannot go below zero — because
  -- an ilimitado-balance row still reaches this line and the null arm must keep its meaning.
  -- paquete_nombre reverts to the most recent REMAINING sale; null when none remain (#267.5).
  -- `c.gym_id = v_gym` is defense in depth, matching editar_venta above: the cliente is reached through
  -- a venta already pinned to v_gym and the subselect carries the same predicate, but the tenant filter
  -- belongs on the mutating statement too (the house form).
  update public.clientes c
     set clases_restantes = case when c.clases_restantes is null then null
                                 else greatest(0, c.clases_restantes - coalesce(v_venta.clases, 0)) end,
         vence = case when c.vence is null then null else c.vence - v_dias end,
         paquete_nombre = (select v.paquete_nombre from public.ventas v
                            where v.cliente_id = c.id and v.gym_id = v_gym
                            order by v.created_at desc, v.id desc
                            limit 1)
   where c.id = v_venta.cliente_id and c.gym_id = v_gym;
end;
$function$;

revoke execute on function public.eliminar_venta(uuid, uuid) from public, anon;
grant  execute on function public.eliminar_venta(uuid, uuid) to authenticated;

-- ── ensure_week_materialized — the horizon wrapper create_recurring_schedule calls ──────────────────
drop function if exists public.ensure_week_materialized(date);

create or replace function public.ensure_week_materialized(p_week_start date, p_gym_id uuid default null)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym uuid;
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header).
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;
  return public.materialize_week_for_gym(v_gym, p_week_start);
end;
$function$;

revoke execute on function public.ensure_week_materialized(date, uuid) from public, anon;
grant  execute on function public.ensure_week_materialized(date, uuid) to authenticated;

-- ── create_class_session — the one-off class ───────────────────────────────────────────────────────
drop function if exists public.create_class_session(uuid, timestamptz, int, int, uuid[], boolean, text, uuid);

create or replace function public.create_class_session(
  p_class_type_id uuid,
  p_starts_at timestamptz,
  p_duration_min int,
  p_capacity int,
  p_coach_ids uuid[] default '{}',
  p_is_special boolean default false,
  p_special_name text default null,
  p_room_id uuid default null,
  p_gym_id uuid default null
)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym uuid;
  v_session uuid;
  v_ocupa text;   -- the class already at that instant, for the refusal sentence
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header).
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if p_room_id is not null and not exists (select 1 from public.room where id = p_room_id and gym_id = v_gym) then
    raise exception 'room % no pertenece al gimnasio del operador', p_room_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  -- 2026-08-23 ruling: ONE class per gym per instant. The name shown is the special_name when the
  -- incumbent is a clase especial (that is what the card reads on the agenda), else the class type.
  select coalesce(nullif(cs.special_name, ''), ct.name) into v_ocupa
    from public.class_session cs
    join public.class_type ct on ct.id = cs.class_type_id
   where cs.gym_id = v_gym
     and cs.starts_at = p_starts_at
     and cs.cancelled_at is null
   order by cs.created_at, cs.id
   limit 1;
  if v_ocupa is not null then
    raise exception 'Ya existe una clase a esa hora: %', v_ocupa;
  end if;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, is_special, special_name, room_id)
  values (v_gym, p_class_type_id, p_starts_at, p_duration_min, p_capacity, p_is_special, p_special_name, p_room_id)
  returning id into v_session;

  insert into public.class_session_coach (gym_id, session_id, coach_id)
  select v_gym, v_session, cid from unnest(p_coach_ids) as cid;

  return v_session;
end;
$function$;

revoke execute on function public.create_class_session(uuid, timestamptz, int, int, uuid[], boolean, text, uuid, uuid) from public, anon;
grant  execute on function public.create_class_session(uuid, timestamptz, int, int, uuid[], boolean, text, uuid, uuid) to authenticated;

-- ── edit_class_session — the one-off class, edited ─────────────────────────────────────────────────
drop function if exists public.edit_class_session(uuid, uuid, timestamptz, int, int, uuid[], boolean, text, uuid);

create or replace function public.edit_class_session(
  p_session_id uuid,
  p_class_type_id uuid,
  p_starts_at timestamptz,
  p_duration_min int,
  p_capacity int,
  p_coach_ids uuid[] default '{}',
  p_is_special boolean default false,
  p_special_name text default null,
  p_room_id uuid default null,
  p_gym_id uuid default null
)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym       uuid;
  v_starts    timestamptz;
  v_cancelled timestamptz;
  v_ocupa     text;   -- the class already at the target instant, for the refusal sentence
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header).
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if p_room_id is not null and not exists (select 1 from public.room where id = p_room_id and gym_id = v_gym) then
    raise exception 'room % no pertenece al gimnasio del operador', p_room_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  select starts_at, cancelled_at into v_starts, v_cancelled
    from public.class_session where id = p_session_id and gym_id = v_gym;
  if not found then raise exception 'Sesión no encontrada'; end if;
  if v_cancelled is not null then raise exception 'La clase ya fue cancelada'; end if;
  if v_starts > now() and p_starts_at <= now() then
    raise exception 'No se puede mover la clase a una hora que ya pasó';
  end if;
  -- The reverse crossing (HOLE 3): only when a hold is actually there to re-arm. `reservada` is the
  -- exact set — an `asistida` row is a captured hold that cancel_class_session already refuses to
  -- re-credit, and a `cancelada` one is settled — so this refuses precisely the forfeits a move
  -- forward would hand back.
  if v_starts <= now() and p_starts_at > now()
     and exists (select 1 from public.reservation
                  where class_session_id = p_session_id and status = 'reservada') then
    raise exception 'No se puede mover al futuro una clase que ya pasó con reservas';
  end if;
  -- 2026-08-23 ruling: ONE class per gym per instant. Only when the instant actually changes, and
  -- never against itself. A cancelled occupant does not block — that instant is free.
  if p_starts_at is distinct from v_starts then
    select coalesce(nullif(cs.special_name, ''), ct.name) into v_ocupa
      from public.class_session cs
      join public.class_type ct on ct.id = cs.class_type_id
     where cs.gym_id = v_gym
       and cs.starts_at = p_starts_at
       and cs.cancelled_at is null
       and cs.id <> p_session_id
     order by cs.created_at, cs.id
     limit 1;
    if v_ocupa is not null then
      raise exception 'Ya existe una clase a esa hora: %', v_ocupa;
    end if;
  end if;

  -- One row only (RLS update scopes to is_staff_of(gym_id)); the edit still reaches no other session
  -- in the series — and since #243 slice 1 it also LEAVES the series: template_id is nulled, so the
  -- series-level verbs can never move this hand-placed class again.
  update public.class_session
     set class_type_id = p_class_type_id,
         starts_at     = p_starts_at,
         duration_min  = p_duration_min,
         capacity      = p_capacity,
         is_special    = p_is_special,
         special_name  = p_special_name,
         room_id       = p_room_id,
         template_id   = null
   where id = p_session_id;
  if not found then raise exception 'Sesión no encontrada'; end if;

  -- Replace this session's coach set (delete-then-insert; staff delete policy on the join table).
  delete from public.class_session_coach where session_id = p_session_id;
  insert into public.class_session_coach (gym_id, session_id, coach_id)
  select v_gym, p_session_id, cid from unnest(p_coach_ids) as cid;
end;
$function$;

revoke execute on function public.edit_class_session(uuid, uuid, timestamptz, int, int, uuid[], boolean, text, uuid, uuid) from public, anon;
grant  execute on function public.edit_class_session(uuid, uuid, timestamptz, int, int, uuid[], boolean, text, uuid, uuid) to authenticated;

-- ── cancel_class_session — NET-NEW tenant scoping, not just a stamp fix (see the header) ────────────
drop function if exists public.cancel_class_session(uuid);

create or replace function public.cancel_class_session(p_session_id uuid, p_gym_id uuid default null)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym    uuid;
  v_starts timestamptz;
  v_dur    int;
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header). The old body
  -- called staff_gym() only to prove SOMEBODY was staff SOMEWHERE and then threw the gym away,
  -- leaving both statements below with no gym predicate; the resolved gym is now KEPT and carried
  -- into both.
  --
  -- THE NULL ARM HERE IS NOT staff_gym(), unlike its ten siblings in this file, and that is
  -- deliberate. This verb takes a session id, so the TARGET names the tenant: derive `gym_id` from
  -- the row and require the caller to STAFF it. That reproduces the live scope (RLS's
  -- `class_session_staff_update` = is_staff_of(gym_id) — every gym the caller staffs), whereas a
  -- staff_gym() fallback would have narrowed it to the caller's lowest-uuid gym and broken the
  -- two-gym operator during the migrate-before-deploy window. See the header.
  --
  -- `cancelled_at` is deliberately NOT filtered in the derive read: an already-cancelled session must
  -- still reach the main read below and raise 'Sesión no encontrada o ya cancelada', as it always did.
  if p_gym_id is null then
    select cs.gym_id into v_gym from public.class_session cs where cs.id = p_session_id;
    if not found then
      -- The id names nothing this caller can even see (RLS `is_member_of`). Legacy split preserved
      -- exactly: a caller who staffs NO gym got 'No autorizado' from the old first line; every
      -- staffed caller got the not-found sentence from the read that followed it.
      if public.staff_gym() is null then raise exception 'No autorizado'; end if;
      raise exception 'Sesión no encontrada o ya cancelada';
    end if;
    -- Visible but not staffed: this is the only INTENTIONAL behavior change on the null arm. It was
    -- the error-message oracle (a mere member of the gym could read the before-start tense off a
    -- class they cannot cancel); it is now a flat refusal. No app calls this verb as a member.
    if not public.is_staff_of(v_gym) then raise exception 'No autorizado'; end if;
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- `gym_id = v_gym` makes a cross-tenant session id a not-found REFUSAL rather than a cancellation.
  -- RLS still scopes this read to is_staff_of(gym_id) underneath; the predicate narrows it from
  -- "every gym I staff" to "the gym in effect".
  select starts_at, duration_min into v_starts, v_dur
    from public.class_session where id = p_session_id and gym_id = v_gym and cancelled_at is null;
  if not found then raise exception 'Sesión no encontrada o ya cancelada'; end if;

  -- §4 BEFORE-START ONLY, the mirror of cancelar_reserva's own gate (20260803140000:289-291) and its
  -- sentence. A class that has already run cannot be "cancelled": its still-`reservada` rows are the
  -- NO-SHOWS the roster derives, and releasing them would refund forfeited holds and erase the
  -- absences in the same statement. Above every write, so the raise leaves the session, the
  -- reservations and every balance untouched.
  --
  -- The CONDITION is unchanged; only the tense is. Present perfect while the class is actually
  -- running, past once it is over — see this file's header.
  if v_starts <= now() then
    if now() < v_starts + (v_dur * interval '1 minute') then
      raise exception 'La clase ya comenzó';
    else
      raise exception 'La clase ya pasó';
    end if;
  end if;

  update public.class_session set cancelled_at = now()
   where id = p_session_id and gym_id = v_gym and cancelled_at is null;   -- RLS scopes to is_staff_of(gym_id)
  if not found then raise exception 'Sesión no encontrada o ya cancelada'; end if;

  -- RELEASE THE HOLDS, in this same transaction. One statement, so the flip and the refund cannot
  -- come apart: the data-modifying CTE cancels every still-held booking and RETURNS what each one
  -- spent, and the outer UPDATE pays exactly those members back.
  --
  --   status = 'reservada'   — ONLY a live hold is released. An `asistida` row is a CAPTURED hold:
  --                            the member came, the class happened for them, and re-crediting it
  --                            would mint a class out of an attendance record. Terminal rows
  --                            (cancelada/no_show) already settled.
  --   l.consumio             — C12, verbatim from cancelar_reserva (20260803140000:322-326): refund
  --                            exactly what the booking took. A booking made under ilimitado stamped
  --                            consumio=false and gets nothing, even if the member has since moved to
  --                            a finite plan (the phantom-credit fix; C4 purchase-wins).
  --   clases_restantes is not null — the ilimitado half of that same guard. Unlimited means unlimited:
  --                            the NULL is never touched, ever (ADR-0004 / ADR-0010 §4).
  --
  -- One member cannot be paid twice in one call: `reservation_member_session_uq` (member_id,
  -- class_session_id) means `liberadas` holds at most one row per member, so the outer UPDATE can
  -- never match the same cliente row twice (which Postgres would silently collapse to a single +1).
  with liberadas as (
    update public.reservation
       set status = 'cancelada', cancelled_at = now()
     where class_session_id = p_session_id and status = 'reservada'
    returning member_id, consumio
  )
  update public.clientes c
     set clases_restantes = c.clases_restantes + 1
    from liberadas l
   where c.id = l.member_id and l.consumio and c.clases_restantes is not null;
end;
$function$;

revoke execute on function public.cancel_class_session(uuid, uuid) from public, anon;
grant  execute on function public.cancel_class_session(uuid, uuid) to authenticated;

-- ── create_recurring_schedule — the series (also threads v_gym into ensure_week_materialized) ───────
drop function if exists public.create_recurring_schedule(uuid, int[], time, int, int, uuid[], int);

create or replace function public.create_recurring_schedule(
  p_class_type_id uuid,
  p_weekdays int[],
  p_start_time time,
  p_duration_min int,
  p_capacity int,
  p_coach_ids uuid[] default '{}',
  p_horizon_weeks int default 6,
  p_gym_id uuid default null
)
 returns setof uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym    uuid;
  v_group  uuid := gen_random_uuid();
  v_tz     text;
  v_today  date;
  v_monday date;
  v_template uuid;
  v_ocupa  text;   -- the class already holding the slot, for the refusal sentence
  wd int;
  i  int;
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header).
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  foreach wd in array p_weekdays loop
    -- 2026-08-23 ruling: ONE class per gym per instant. `class_type_id is distinct from` scopes this
    -- to the CROSS-class case only — a same-class duplicate keeps falling through to the
    -- unique_violation handler below and keeps its shipped sentence verbatim. `order by created_at,
    -- id` makes the named incumbent deterministic when a slot is already contested (the live
    -- pre-guard state), so the same call always refuses with the same words.
    select ct.name into v_ocupa
      from public.schedule_template st
      join public.class_type ct on ct.id = st.class_type_id
     where st.gym_id = v_gym
       and st.weekday = wd
       and st.start_time = p_start_time
       and st.is_active
       and st.class_type_id is distinct from p_class_type_id
     order by st.created_at, st.id
     limit 1;
    if v_ocupa is not null then
      raise exception 'Ya existe un horario activo de % el % a las %',
        v_ocupa,
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end if;

    -- #244 guard 4: the unique index on ACTIVE templates (gym_id, class_type_id, weekday, start_time)
    -- turns a re-created duplicate schedule into a raised, friendly refusal instead of a silent
    -- second copy that double-materializes every future week.
    begin
      insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
      values (v_gym, p_class_type_id, wd, p_start_time, p_duration_min, p_capacity, v_group)
      returning id into v_template;
    exception when unique_violation then
      raise exception 'Ya existe un horario activo para esta clase el % a las %',
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end;

    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, v_template, cid from unnest(p_coach_ids) as cid;

    return next v_template;
  end loop;

  -- Materialize the visible horizon (this week's Monday + the next p_horizon_weeks-1 weeks).
  select timezone into v_tz from public.gym where id = v_gym;
  v_today := (now() at time zone v_tz)::date;
  v_monday := v_today - ((extract(isodow from v_today)::int - 1));
  for i in 0 .. greatest(p_horizon_weeks, 1) - 1 loop
    -- Thread the RESOLVED gym: the callee would otherwise re-derive it from staff_gym() and
    -- materialize a different tenant's week than the one this call just wrote templates into.
    perform public.ensure_week_materialized(v_monday + (i * 7), v_gym);
  end loop;
end;
$function$;

revoke execute on function public.create_recurring_schedule(uuid, int[], time, int, int, uuid[], int, uuid) from public, anon;
grant  execute on function public.create_recurring_schedule(uuid, int[], time, int, int, uuid[], int, uuid) to authenticated;

-- ── update_recurring_schedule — the series, edited. The DROP identity is the IN args only (OUT
--    parameters are not part of a function's identity), and the new IN parameter goes after
--    `p_all_days`, BEFORE `out moved` / `out kept`, so the OUT names keep their positions. ───────────
drop function if exists public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[], boolean);

create or replace function public.update_recurring_schedule(
  p_template_id uuid,
  p_class_type_id uuid,
  p_start_time time,
  p_duration_min int,
  p_capacity int,
  p_weekday int default null,
  p_coach_ids uuid[] default null,
  p_all_days boolean default false,
  p_gym_id uuid default null,
  out moved int,
  out kept int
)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym     uuid;
  v_weekday int;
  v_group   uuid;
  v_tz      text;
  v_wd      int;
  v_ids     uuid[];
  v_tids    uuid[] := '{}';
  v_all     uuid[] := '{}';
  v_future  int;
  v_members int := 0;
  v_ocupa   text;        -- the class already holding the target SLOT, for the refusal sentence
  v_choque  timestamptz; -- the first target INSTANT another class already holds
  m         record;
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header).
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;
  if p_all_days and p_weekday is not null then
    raise exception 'No se puede cambiar el día al editar todo el horario';
  end if;

  -- The anchor, read before any write: it resolves an omitted weekday, it supplies the group, and it
  -- is where a retired or foreign template is refused (see 20260806120100's header).
  select weekday, group_id into v_weekday, v_group from public.schedule_template
   where id = p_template_id and gym_id = v_gym and is_active;
  if not found then raise exception 'Horario no encontrado o ya retirado'; end if;
  v_weekday := coalesce(p_weekday, v_weekday);

  -- Server-authoritative gym clock, never a client parameter (ADR-0010 §k).
  select timezone into v_tz from public.gym where id = v_gym;

  moved := 0;
  kept  := 0;

  -- `order by weekday, id`: a partial failure aborts the whole call anyway (PostgREST wraps each RPC
  -- in its own transaction), so the only thing determinism buys is a reproducible report — the same
  -- reason retire's loop is ordered. `start_time` is read for the moved-slot test below.
  for m in
    select id, weekday, start_time from public.schedule_template
     where gym_id = v_gym and is_active
       and (case when p_all_days then group_id = v_group else id = p_template_id end)
     order by weekday, id
  loop
    v_members := v_members + 1;
    -- EACH MEMBER KEEPS ITS OWN WEEKDAY on the all-days path; on the single-day path v_weekday is the
    -- move the caller asked for (or the anchor's own, coalesced).
    v_wd := case when p_all_days then m.weekday else v_weekday end;
    v_tids := v_tids || m.id;

    -- 2026-08-23 ruling: ONE class per gym per instant. Only when this member's slot actually changes
    -- (see the header) and only against a DIFFERENT class type (same-class stays with the handler
    -- below). The edited scope is excluded so a group moving together never contests itself.
    if v_wd is distinct from m.weekday or p_start_time is distinct from m.start_time then
      select ct.name into v_ocupa
        from public.schedule_template st
        join public.class_type ct on ct.id = st.class_type_id
       where st.gym_id = v_gym
         and st.weekday = v_wd
         and st.start_time = p_start_time
         and st.is_active
         and st.class_type_id is distinct from p_class_type_id
         and (case when p_all_days then st.group_id is distinct from v_group else st.id <> p_template_id end)
       order by st.created_at, st.id
       limit 1;
      if v_ocupa is not null then
        raise exception 'Ya existe un horario activo de % el % a las %',
          v_ocupa,
          (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[v_wd + 1],
          to_char(p_start_time, 'HH24:MI');
      end if;
    end if;

    begin
      -- `and is_active` AGAIN: READ COMMITTED re-evaluates the predicate under the row lock, so a
      -- retire that commits after the read above turns this into zero rows and the raise below.
      update public.schedule_template
         set class_type_id = p_class_type_id,
             weekday       = v_wd,
             start_time    = p_start_time,
             duration_min  = p_duration_min,
             capacity      = p_capacity
       where id = m.id and gym_id = v_gym and is_active;
      if not found then raise exception 'Horario no encontrado o ya retirado'; end if;
    exception when unique_violation then
      raise exception 'Ya existe un horario activo para esta clase el % a las %',
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[v_wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end;

    -- ── THE DATED HALF OF THE SAME RULE: no target INSTANT may already be taken ────────────────────
    -- Guard 4 above is about the RULE (schedule_template); this is about the ROWS the fan-out below is
    -- one statement away from writing. They are not the same question: a class that belongs to NO
    -- active rule — a hand-placed one-off, or a class detached by edit_class_session (#243 slice 1) —
    -- is invisible to a template-keyed check and still occupies its instant. Without this, a series
    -- move onto such a week either silently double-books it (before 20260823120100) or fails the whole
    -- call on a raw 23505 whose text is a constraint name (after it).
    --
    -- REFUSE THE WHOLE MOVE, never skip the colliding week (owner ruling 2026-08-23). It matches what
    -- this RPC already does everywhere else — one collision anywhere aborts the call and leaves zero
    -- rows written, the same all-or-nothing shape `create_recurring_schedule` has for weekdays — and it
    -- is the only outcome an operator can act on: a silently-skipped week would leave the series split
    -- across two horas with a receipt that said it moved.
    --
    -- SCOPE, exactly the fan-out's own: the same rows (`template_id = m.id`, future, uncancelled), the
    -- same recomputed instant, the same `> now()` filter — so a week the fan-out would SKIP cannot
    -- block the move either. `cs2.id <> cs.id` plus the `not exists` exclude the movers themselves and
    -- every sibling of the edited scope; on the all-days path each member keeps its own weekday, so
    -- members can never contest each other's targets. A CANCELLED class does not block (that instant is
    -- free), and — like guard 4 — the whole check is gated on the slot ACTUALLY moving, so an operator
    -- editing capacity on a template that already sits in a contested slot is never locked out.
    if v_wd is distinct from m.weekday or p_start_time is distinct from m.start_time then
      select cs2.starts_at into v_choque
        from public.class_session cs
        join public.class_session cs2
          on cs2.gym_id = v_gym
         and cs2.cancelled_at is null
         and cs2.id <> cs.id
         and cs2.starts_at = (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz)
       where cs.template_id = m.id
         and cs.starts_at > now()
         and cs.cancelled_at is null
         and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz) > now()
         and not exists (
           select 1 from public.schedule_template st
            where st.id = cs2.template_id
              and st.gym_id = v_gym and st.is_active
              and (case when p_all_days then st.group_id = v_group else st.id = p_template_id end)
         )
       order by cs2.starts_at
       limit 1;
      if v_choque is not null then
        -- The FIRST blocking instant, in the gym's own clock — an operator cannot clear a collision
        -- they cannot find on the calendar.
        raise exception 'No se puede mover el horario: ya hay una clase el % a las %',
          to_char(v_choque at time zone v_tz, 'DD/MM/YYYY'),
          to_char(v_choque at time zone v_tz, 'HH24:MI');
      end if;
    end if;

    -- THE MOVE, over the series' own index. `cs.starts_at` on the right-hand side reads the OLD value,
    -- so each row is re-anchored on its own ISO week; the trailing `> now()` is the past-instant
    -- guard, and a row it excludes is written by no statement in this function.
    with mv as (
      update public.class_session cs
         set class_type_id = p_class_type_id,
             starts_at     = ((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz,
             duration_min  = p_duration_min,
             capacity      = p_capacity
       where cs.template_id = m.id
         and cs.starts_at > now()
         and cs.cancelled_at is null
         and (((date_trunc('week', (cs.starts_at at time zone v_tz))::date + v_wd) + p_start_time) at time zone v_tz) > now()
      returning cs.id
    )
    select coalesce(array_agg(id), '{}') into v_ids from mv;

    -- `kept` is counted after the fact rather than tracked: a moved row is still attached and still
    -- future, so this member's whole future population minus its movers IS its skipped set.
    select count(*)::int into v_future
      from public.class_session
     where template_id = m.id and starts_at > now() and cancelled_at is null;

    moved := moved + coalesce(array_length(v_ids, 1), 0);
    kept  := kept  + (v_future - coalesce(array_length(v_ids, 1), 0));
    v_all := v_all || v_ids;
  end loop;

  if v_members = 0 then raise exception 'Horario no encontrado o ya retirado'; end if;
  -- …and the ANCHOR specifically. Zero members covers "the whole group went"; this covers the narrower
  -- race — a retire of the CLICKED rule committing between the pin above and the driving query's
  -- snapshot leaves N-1 siblings, which would edit them and hand back a success receipt for the card
  -- the operator actually clicked. The clicked rule is the one the receipt is about.
  if p_all_days and not (p_template_id = any(v_tids)) then
    raise exception 'Horario no encontrado o ya retirado';
  end if;

  -- The coach set is REPLACED only when the caller actually names one — `p_coach_ids IS NULL` means
  -- "leave the coaches alone", because the sheet seeds coachIds from the CLICKED SESSION and an
  -- unconditional replace would stamp last week's substitute onto the whole schedule. Then in BOTH
  -- tables: every member's rule, and exactly the dated rows that moved (a kept row keeps its coaches,
  -- because "byte-identical" is the whole rule for a kept row).
  if p_coach_ids is not null then
    delete from public.schedule_template_coach where template_id = any(v_tids);
    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, tid, cid from unnest(v_tids) tid, unnest(p_coach_ids) cid;

    delete from public.class_session_coach where session_id = any(v_all);
    insert into public.class_session_coach (gym_id, session_id, coach_id)
    select v_gym, sid, cid from unnest(v_all) sid, unnest(p_coach_ids) cid;
  end if;
end;
$function$;

revoke execute on function public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[], boolean, uuid) from public, anon;
grant  execute on function public.update_recurring_schedule(uuid, uuid, time, int, int, int, uuid[], boolean, uuid) to authenticated;

-- ── retire_recurring_schedule — "terminar el horario" (also threads v_gym into cancel_class_session) ─
drop function if exists public.retire_recurring_schedule(uuid, boolean);

create or replace function public.retire_recurring_schedule(
  p_template_id uuid,
  p_all_days boolean default false,
  p_gym_id uuid default null
)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym   uuid;
  v_group uuid;
  v_n     int := 0;
  r       record;
begin
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header).
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- `gym_id = v_gym` is defense-in-depth, not redundancy: schedule_template's SELECT policy is
  -- is_member_of, WIDER than staff, so a multi-gym actor must get a refusal here and not a silent
  -- zero-row no-op.
  update public.schedule_template set is_active = false
   where id = p_template_id and gym_id = v_gym and is_active
  returning group_id into v_group;
  if not found then raise exception 'Horario no encontrado o ya retirado'; end if;

  if p_all_days then
    update public.schedule_template set is_active = false
     where group_id = v_group and gym_id = v_gym and is_active;
  end if;

  -- One call per future class, through the shipped release. Ordered so a partial failure (which aborts
  -- the whole call anyway) is deterministic to reproduce; `, cs.id` only breaks ties between MEMBERS,
  -- since one template can hold at most one class per instant (class_session_template_starts_uq).
  for r in
    select cs.id
      from public.class_session cs
      join public.schedule_template t on t.id = cs.template_id
     where t.gym_id = v_gym
       and (case when p_all_days then t.group_id = v_group else t.id = p_template_id end)
       and cs.starts_at > now()
       and cs.cancelled_at is null
     order by cs.starts_at, cs.id
  loop
    -- Thread the RESOLVED gym: cancel_class_session now scopes its own read+update to it, so the
    -- callee must be told which tenant this retirement belongs to rather than re-deriving one.
    perform public.cancel_class_session(r.id, v_gym);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

revoke execute on function public.retire_recurring_schedule(uuid, boolean, uuid) from public, anon;
grant  execute on function public.retire_recurring_schedule(uuid, boolean, uuid) to authenticated;

-- ── sembrar_plantillas_default — the per-gym message templates seed ─────────────────────────────────
drop function if exists public.sembrar_plantillas_default();

create or replace function public.sembrar_plantillas_default(p_gym_id uuid default null)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  -- Tenant in effect, not "the operator's lowest-uuid gym" (see this file's header). The trailing
  -- `v_gym is null` guard is NET-NEW here — every sibling RPC already had one, this body did not. A
  -- caller who staffs no gym resolved v_gym = NULL, the idempotence probe (`gym_id = NULL`, never
  -- true) fell through, and the INSERT died on plantillas.gym_id's NOT NULL with a raw 23502. The
  -- guard turns that into the same 'No autorizado' every other write door already gives.
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;
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

Tu paquete {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$, v_gym),
    ('Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te quedan *{clases}* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$, v_gym);
end;
$function$;

revoke execute on function public.sembrar_plantillas_default(uuid) from public, anon;
grant  execute on function public.sembrar_plantillas_default(uuid) to authenticated;

-- ── actualizar_paquete — NO signature change, so no DROP and no re-grant: the existing
--    revoke/grant pair (20260605130000:39-41) survives a CREATE OR REPLACE. Only the demotion
--    UPDATE gains a gym predicate. ────────────────────────────────────────────────────────────────
create or replace function public.actualizar_paquete(p_id uuid, p_precio int, p_popular boolean, p_clases int default null)
  returns void language plpgsql security invoker set search_path to '' as $function$
declare v_uid uuid; v_nombre text;
begin
  v_uid := (select auth.uid()); if v_uid is null then raise exception 'No autenticado'; end if;
  -- mirrors src/domain/rules.ts nombrePaquete (tested-TS spec, ADR-0005)
  v_nombre := case when p_clases is null then 'Ilimitado' when p_clases = 1 then '1 clase' else p_clases::text || ' clases' end;
  if p_popular then
    -- Demote siblings OF THIS PACKAGE'S GYM. RLS alone was the only scope here, and RLS grants a
    -- multi-gym operator every gym they staff — so promoting one gym's paquete silently cleared the
    -- OTHER gym's popular flag too. paquetes_one_popular is a per-gym partial unique index, so the
    -- correct scope is the target row's own gym_id, read from the row itself.
    update public.paquetes set popular = false
     where popular and id <> p_id
       and gym_id = (select p2.gym_id from public.paquetes p2 where p2.id = p_id);
  end if;
  update public.paquetes set nombre = v_nombre, clases = p_clases, precio = p_precio, popular = p_popular,
         vigencia_tipo = 'dias', vigencia_dias = 30 where id = p_id;
  if not found then raise exception 'Paquete no encontrado'; end if;
end; $function$;

-- ── Overload self-check — the apply fails instead of stranding a second definition ──────────────────
-- `drop function if exists` is silent about a MISS. If the live pg_proc arg list for any function
-- above differed from this repo's migration record by a single type, its DROP would no-op and the
-- CREATE would land a SECOND overload beside it — after which every deployed PostgREST payload for
-- that function is ambiguous (PGRST203) with no rollback but a manual DROP, and `registrar_venta`
-- means every sale in every gym. Cheap to assert, expensive to discover. [[prod-migration-version-drift]]
do $$
declare r record;
begin
  for r in
    select p.proname, count(*) as n
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname in ('registrar_venta', 'editar_venta', 'eliminar_venta',
                         'ensure_week_materialized', 'create_class_session', 'edit_class_session',
                         'cancel_class_session', 'create_recurring_schedule',
                         'update_recurring_schedule', 'retire_recurring_schedule',
                         'sembrar_plantillas_default', 'actualizar_paquete')
     group by p.proname
    having count(*) <> 1
  loop
    raise exception 'overload drift: public.% has % definitions (expected exactly 1)', r.proname, r.n;
  end loop;
end $$;
