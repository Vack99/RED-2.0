-- editar_venta becomes AS-IF-ORIGINAL — owner ruling 2026-08-27 (slice 2, spec
-- docs/superpowers/plans/2026-08-27-slice2-saldo-detalle.md §D0/§D5).
--
-- THE RULING. Correcting a registered sale must leave the member exactly where they would be if the
-- sale had carried the corrected terms FROM THE START: the new grant minus what they have consumed
-- since that sale was registered. It never stacks, and it never forgives.
--
-- WHAT WAS THERE. Since 20260815120000 the edit path clawed the STORED grant back out of the STORED
-- counter and re-stacked the leftovers (`clases_restantes − clases_old + clases_new`, with a
-- recovered `vence − dias_old` carried forward as a base). Two consequences the owner rejected:
--   * it STACKS. Correcting a 12-pack that was really an 8-pack wrote `stored − 12 + 8`; on a member
--     who had not trained yet that is 8 clases handed out on top of the 12 already there minus 12 —
--     arithmetic that only lands on the truth when the stored counter is itself already true.
--   * it INHERITS the counter's drift. The stored counter is the very number slice 1/slice 2 exist
--     because it drifts (holds, forfeits, the ilimitado sweep hole, the pre-reset era). Reading it as
--     the base propagated every one of those lies through the correction.
-- The linear inverse also made the carried vigencia depend on an "anchor" reconstructed from
-- `vence − dias` (20260815130000), a disambiguation that is simply unnecessary once the corrected
-- sale is re-derived from its own terms.
--
-- WHAT LANDS INSTEAD. Two objects:
--
--   1. public.conteo_cargable(cliente, desde) — NEW, read-only. The §D0 counting rule, in SQL,
--      shared so `editar_venta` and (next migration) `mi_membresia` cannot drift apart. It writes
--      nothing, so it carries no denial-suite obligation (AGENTS.md keys coverage on WRITES) and it
--      is deliberately absent from supabase/tests/rpc-coverage.json — the no-pure-reader arm of
--      `rpc-write-coverage.test.ts` would eject it. Its contract is exercised THROUGH editar_venta's
--      written rows, which is where the value it computes actually lands.
--
--   2. public.editar_venta — CREATE OR REPLACE at the EXACT 10-argument signature 20260825145937
--      left in prod (uuid, integer, text, date, uuid, text, integer, integer, boolean, uuid). A
--      stale argument list here would not replace anything: it would ADD a second overload and
--      PostgREST would answer 300/PGRST203 to every edit — the 2026-08-27 sales outage, exactly
--      (docs/audits/2026-08-27-registrar-venta-overload-outage.md). Everything outside the
--      re-derive block is re-emitted byte-faithful: the authorization order, every refusal string,
--      the FOR UPDATE on the venta, the change detection, the 30-day window, the top-of-stack
--      precondition, the ventas UPDATE and the metadata-only short circuit.
--
-- NOT IN SCOPE. `eliminar_venta` is untouched (its inverse clawback and its already-used refusal
-- stand), and the stored counter remains the operational source — this changes what a CORRECTION
-- writes into it, never how a check-in charges against it.
--
-- Expand-only (one new function + one create-or-replace), idempotent, safe on a fresh scratch AND
-- out-of-order on live. Grants are re-emitted for posture parity (ADR-0005/ADR-0013 §1).

-- ── conteo_cargable — the §D0 charge count, one rule, one place ─────────────────────────────────
--
-- "How many classes has this cliente been CHARGED for since instant `desde`", counted on two legs
-- that between them see every charge exactly once:
--
--   * the ASISTENCIA leg — active, unpardoned marks whose reservation (if any) did NOT itself carry
--     the charge. The `not exists (… r.consumio)` clause is what defers a booking-charged check-in
--     to the reservation leg, so a member who booked and then showed up is one charge, not two. It
--     also dedupes the historic stale-flag rows for free.
--     It counts `consumio = false` rows TOO, on purpose: as-if-original asks "what would these
--     corrected terms have charged", and a class attended while the member was ilimitado is a class
--     the corrected finite pack would have charged. That is the single most load-bearing line here
--     — a `consumio = true`-only reading returns the pack's full count on an ilimitado→finite
--     correction and hands the member back every class they already trained.
--
--   * the RESERVATION leg — bookings that actually debited the pack (`consumio`) and are not
--     cancelled. `status <> 'cancelada'` is what makes a gym-cancelled session cost nothing:
--     `cancel_class_session` refunds and flips the status but leaves `consumio` standing, so the
--     status is the only truthful filter. A member-cancelled booking is refunded the same way.
--
-- CHARGE MOMENT. A reservation's is its `created_at` — the booking instant IS when the pack was
-- debited. A mark's is its gym-local `fecha + hora`. Backdated desk marks still land with
-- `hora = null` (fijar_asistencia), so those fall back to DATE granularity and a tie goes to the
-- NEWER venta (`fecha >= the anchor's gym-local day`), which is the reading `mi_membresia` and
-- packages/data already use.
--
-- GYM-LOCAL, NEVER SESSION-LOCAL. Every day and every wall-clock comparison is resolved in the
-- gym's own timezone. A naive `::date` would hide a UTC−6 off-by-one for every event after 18:00
-- local — the hours that matter most in a gym. Both sides of every instant comparison are
-- `date_trunc`'d to the SECOND: `asistencias.hora` is a wall clock the TS side reads as "HH:MM:SS"
-- with fractions dropped, so an untruncated `p_desde` carrying microseconds would put a mark made
-- in the sale's own second on the wrong side of the boundary here but not there.
--
-- THE ENDED BOUNDARY IS THE VENTANA DE ARRIBO'S CLOSE, not the class's last minute:
-- `upper(public.ventana_arribo(starts_at, duration_min))` = `starts_at + duración + 15 min`. That
-- 15-minute grace is the SAME boundary the desk marks by and the same one the ficha displays —
-- CONTEXT.md ("ventana de arribo") pins the rule to `esNoAsistio` in packages/domain/src/rules.ts
-- and says display and write share one boundary, so a member who can still be checked in must not
-- already be counted a no-show here. Before the close the booking is a HOLD (`apartadas`); at or
-- after it, it is spent — and spent-with-no-mark is a `no_shows`. Both are already debited from the
-- stored counter, which is why editar_venta subtracts usadas + apartadas and not usadas alone.
-- `no_shows` is DERIVED here and nowhere written: the reservation-truthfulness ruling forbids a
-- sweep, so this is a projection for display, not a status.
create or replace function public.conteo_cargable(
    p_cliente_id uuid,
    p_desde      timestamptz
  )
  returns table (usadas integer, apartadas integer, no_shows integer)
  language sql
  stable
  security invoker
  set search_path to ''
as $function$
  with zona as (
    -- `clientes` is gym-scoped (a multi-gym member holds one row per gym), so the cliente id alone
    -- pins the tenant and the calendar — no gym parameter to get wrong, and no multi-gym roulette.
    -- Written as an UNCORRELATED scalar sub-select (ADR-0001): it reads no column of the rows it is
    -- compared against, so the planner runs it once as an InitPlan rather than per row. Not the
    -- retracted ADR-0013 §2 claim — that one said wrapping a CORRELATED predicate in `(select …)`
    -- bought per-statement evaluation, and ADR-0013 itself now records that it does not. The other
    -- half of the reason is shape, not speed: a join here would silently drop every row when the
    -- cliente is missing.
    select (select g.timezone
              from public.clientes c
              join public.gym g on g.id = c.gym_id
             where c.id = p_cliente_id) as tz
  ),
  marcas as (
    select 1 as uno
      from public.asistencias a
     where a.cliente_id = p_cliente_id
       and a.deleted_at is null
       and not a.perdonada
       -- the charge lives on the reservation for this one; the reservation leg counts it.
       and not exists (select 1 from public.reservation r
                        where r.id = a.reservation_id and r.consumio)
       and case
             when a.hora is not null
               then date_trunc('second', (a.fecha + a.hora) at time zone (select tz from zona))
                      >= date_trunc('second', p_desde)
             else a.fecha >= (p_desde at time zone (select tz from zona))::date
           end
  ),
  reservas as (
    -- `upper(ventana_arribo(...))` — the 15-minute arrival grace included, so this agrees with the
    -- desk's own markable window and with `esNoAsistio` (rules.ts) to the second.
    select upper(public.ventana_arribo(s.starts_at, s.duration_min)) <= now() as terminada,
           not exists (select 1 from public.asistencias a
                        where a.reservation_id = r.id and a.deleted_at is null) as sin_marca
      from public.reservation r
      join public.class_session s on s.id = r.class_session_id
     where r.member_id = p_cliente_id
       and r.consumio
       and r.status <> 'cancelada'
       and date_trunc('second', r.created_at) >= date_trunc('second', p_desde)
  )
  select ((select count(*) from marcas) + (select count(*) from reservas where terminada))::integer,
         (select count(*) from reservas where not terminada)::integer,
         (select count(*) from reservas where terminada and sin_marca)::integer;
$function$;

-- ── EXECUTE: the grant to `authenticated` is LOAD-BEARING, and that is a departure from ADR-0013 §1 ──
-- §1's helpers are SECURITY DEFINER membership predicates whose EXECUTE exists only so the POLICIES
-- that wrap them can run — "a definer function must never be client-callable beyond its intended
-- caller". This one is a helper by shape and not by that rule: it is a direct RPC of the admin app.
-- `packages/data/src/server/clientes.ts` calls `supabase.rpc("conteo_cargable", …)` on the OLD-ANCHOR
-- ficha path — when the sale predates the 30-day window the ficha fetches, the rows in hand cannot
-- answer §D0 at all, and the whole point of this function is that the ficha must not answer it
-- differently from the edit door. Revoking the grant would silently push that path back onto a
-- hand-rolled TS re-derive, which is the drift this migration exists to close.
--
-- WHY THAT IS SAFE HERE, and why it is not a hole the §1 rule was guarding: this function is SECURITY
-- INVOKER, so a client call runs under the CALLER's RLS. Staff read their own gym's clientes /
-- asistencias / reservation rows and get the true count for their own tenant; a member calling it with
-- another gym's cliente id reads no rows through any of the three policies and gets (0, 0, 0) — zeros,
-- never another tenant's numbers, and never an existence oracle either (a cliente id that does not
-- exist answers identically).
--
-- FROM ITS DEFINER CALLERS the reading differs and must: `editar_venta` and `mi_membresia` are
-- SECURITY DEFINER, so this body runs with RLS BYPASSED inside them. Both readings agree for the gym
-- doing the calling — the invoker path sees exactly the rows RLS would have handed that gym's staff,
-- and the definer path sees the same rows because both callers have already pinned the tenant before
-- they get here (editar_venta through `v_gym` on the venta it locked, mi_membresia through the
-- auth.uid() self-pin on `clientes`). The definer callers need the bypass because the member on whose
-- behalf `mi_membresia` runs holds no read on `ventas`/`asistencias` at all (Contract-A).
revoke execute on function public.conteo_cargable(uuid, timestamptz) from public, anon;
grant  execute on function public.conteo_cargable(uuid, timestamptz) to authenticated;

-- ── editar_venta — the EDIT door, now as-if-original ────────────────────────────────────────────
-- SECURITY DEFINER, and the in-body `staff_gym()` / `is_staff_of()` check IS the boundary — the
-- 20260825145937 posture, re-emitted unchanged.
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
  v_nombre         text;
  v_clases         integer;      -- null = ilimitado
  v_vig_tipo       text;
  v_vig_dias       integer;
  v_person         boolean;
  v_cambio_grant   boolean;
  v_cambio_paquete boolean;
  v_cambio_fecha   boolean;
  v_dias_new       integer;
  v_fecha_old_dia  date;         -- the sale's STORED gym-tz day
  v_usadas         integer;      -- §D0 charges attributed to THIS venta, holds included
  v_new_clases     integer;      -- null = ilimitado
  v_new_vence      date;
begin
  -- Authorization first, input second — the registrar_venta order (functions-canonical/
  -- registrar_venta.sql:30-31 gates before :46-48 validates): a caller with no staff row learns
  -- 'No autorizado' and nothing about which arguments this gym would have accepted.
  -- Tenant in effect, not "the operator's lowest-uuid gym" (20260825145937). SECURITY DEFINER:
  -- this check IS the boundary here, so `is_staff_of` is what stands between a supplied p_gym_id
  -- and another tenant's ventas.
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

  -- FOR UPDATE on the VENTA: two overlapping edits of the same sale would otherwise both read the
  -- same stored facts and each apply a full re-derive. The lock makes the second call wait and then
  -- re-read a row that already carries the new package facts, at which point the change flags make
  -- it a no-op. `created_at` is read HERE and is the anchor the §D0 count runs from — the sale's
  -- REGISTRATION instant, which an edit never moves.
  select v.cliente_id, v.paquete_nombre, v.clases, v.vigencia_tipo, v.vigencia_dias,
         v.personalizado, v.fecha, v.created_at
    into v_venta
    from public.ventas v
    where v.id = p_venta_id and v.gym_id = v_gym
    for update;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- Every day below is a GYM-tz day: the bounds, the stored instant, and the day the corrected
  -- vigencia runs from. A session-tz date would disagree with the gym's for the hours the two
  -- calendars differ.
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
  -- The sale's STORED gym-tz day, and the day the corrected vigencia runs from: the requested one,
  -- else the stored one. The two are the same value on a package-only swap.
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

  -- The top-of-stack precondition. Under as-if-original it is load-bearing for a NEW reason: the
  -- re-derive writes the whole balance from THIS sale's grant, so a later sale's grant would simply
  -- be erased — and the §D0 count below could not tell which of the two sales owns each event
  -- either. Being the most recent sale is what makes `p_desde := this sale's created_at` an exact
  -- attribution rather than an approximation. Monto/metodo-only edits never reach here.
  if (v_cambio_grant or v_cambio_fecha)
     and exists (select 1 from public.ventas v
                  where v.cliente_id = v_venta.cliente_id
                    and v.gym_id = v_gym
                    and (v.created_at, v.id) > (v_venta.created_at, p_venta_id)) then
    raise exception 'Solo la venta más reciente puede cambiar de paquete o fecha';
  end if;

  -- The venta row is rewritten BEFORE the clientes write, so the paquete_nombre subselect below sees
  -- the new name. `folio`, `created_at`, `cliente_id`, `gym_id` and `idempotency_key` are never
  -- touched: folio is the paper ticket, created_at is the window anchor AND the §D0 anchor.
  -- `gym_id = v_gym` makes a cross-tenant id a REFUSAL, not a silent zero-row no-op.
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

  -- Lock the saldo row before the write, the same discipline registrar_venta keeps. The value below
  -- no longer READS the stored counter, but a concurrent toggle_pase/reservar_clase decrement landing
  -- between the count and the update would otherwise be silently overwritten. The venta's FK
  -- guarantees the row exists, so there is no extra refusal string here. `c.gym_id = v_gym` carries the
  -- same tenant pin every other statement in this body does — the lock must name the SAME row the
  -- UPDATE below writes, or a cross-tenant cliente_id would be locked here and refused there.
  perform 1 from public.clientes c where c.id = v_venta.cliente_id and c.gym_id = v_gym for update;

  -- ── AS-IF-ORIGINAL (owner ruling 2026-08-27; spec §D5). ─────────────────────────────────────────
  -- What the CORRECTED sale would have left, had it been registered with these terms from the start.
  -- The stored counter is read nowhere: it is the number that drifts, so inheriting it would carry
  -- every past hold, forfeit and ilimitado-era hole straight through the correction.
  --
  -- The anchor is the venta's ORIGINAL `created_at`, never p_fecha: `fecha` is the paper day the desk
  -- is correcting, `created_at` is when this pack actually started being consumed, and moving the
  -- paper day must not re-attribute a single event. The top-of-stack guard above already proved no
  -- LATER venta owns any of these charges, so counting forward from that instant IS this sale's own
  -- consumption.
  --
  -- Holds count. `apartadas` are bookings whose class has not run yet; they were already debited at
  -- booking time (charge-at-booking, #233), so a correction that ignored them would hand the member
  -- back a class they are still holding a seat with.
  select cc.usadas + cc.apartadas into v_usadas
    from public.conteo_cargable(v_venta.cliente_id, v_venta.created_at) cc;

  if v_clases is null then
    v_new_clases := null;                                   -- ilimitado package: null IS the balance
  else
    -- The ONE clamp. Consumption beyond the corrected grant is not a debt carried anywhere — the
    -- member trained those classes and the gym was paid for what it sold; the corrected pack is
    -- simply spent.
    v_new_clases := greatest(0, v_clases - v_usadas);
  end if;

  -- Ruling C1: 'mes' is a flat 30 days, 'dias' uses its own count. NO base carry: a corrected sale
  -- has whatever vigencia its corrected terms grant, running from its corrected start day — exactly
  -- what registrar_venta would have written from these inputs onto a member with nothing live. There
  -- is no dead-on-arrival refusal: on a correction, "already expired" is often the truth being
  -- recorded.
  v_dias_new  := case when v_vig_tipo = 'mes' then 30 else coalesce(v_vig_dias, 0) end;
  v_new_vence := v_fecha_dia + v_dias_new;

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
