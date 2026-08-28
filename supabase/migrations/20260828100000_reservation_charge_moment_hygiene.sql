-- RESERVATION CHARGE-MOMENT HYGIENE — §D6 of the slice-2 spec
-- (docs/superpowers/plans/2026-08-27-slice2-saldo-detalle.md), the 2026-08-27 "clases restantes"
-- drift audit's write-site half.
--
-- Slice 2 stops asking the stored counter to explain itself: every surface derives the balance from
-- the charge EVENTS (asistencias + reservations). That derivation is only as honest as the two
-- columns it reads — `reservation.created_at`, the charge MOMENT of a booking, and
-- `reservation.consumio`, did this booking spend a class — and the row-reuse rule (ADR-0010 §5,
-- one UNIQUE row per member+session) leaves both stale today:
--
--   (1) A REBOOK KEEPS THE OLD MOMENT. `reservar_clase` reactivates the row a member cancelled, so
--       `created_at` still names the FIRST booking. Attribution (spec D0: an event belongs to the
--       latest venta whose `created_at` <= the event's charge moment) then charges a re-booking made
--       AFTER a renewal to the new pack and attributes it to the OLD one — whose `usadas` keeps
--       growing after it was replaced. The reused row is logically a new booking; it now says so.
--
--   (2) A WALK-IN REUSE KEEPS THE OLD FLAG. `pasar_lista_sesion` and `fijar_asistencia` take that
--       same terminal row over as a WALK-IN, and `cancelar_reserva` leaves `consumio = true` on the
--       row it cancels (it refunds by READING that flag and never clears it). The walk-in then
--       inserts an asistencia that charges, and the dead flag stays. Precisely what that costs, since
--       D0's asistencia leg defers to a reservation that claims the charge and so keeps the TOTAL
--       honest by itself:
--         · THE MOMENT MOVES LEGS. The visit is counted on the reservation leg, dated `created_at` —
--           a booking the member CANCELLED, possibly under a pack since replaced — instead of on the
--           asistencia leg, dated the class's own `fecha + hora`, which is when the door actually
--           charged. Same count, wrong venta.
--         · A PARDONED reuse is a straight OVERCOUNT. Its asistencia is `consumio = false`, so there
--           is nothing for the deferral to defer to: the flag counts a charge that was refunded at
--           the cancel and never re-taken.
--         · IT IS A DOUBLE-REFUND SHAPE. Un-marking a non-walk-in row of this kind refunds from the
--           asistencia AND returns the row to 'reservada' still flagged, and `cancelar_reserva` then
--           refunds a second time off the same flag.
--       Both write sites now clear it when they take the row over; the charge lives on the asistencia
--       they insert, which is already where the untoggle refund reads it.
--
-- Forward-only where history cannot be recovered: nothing recorded the instant of a past rebook, so
-- (1) is NOT backfilled (accepted, spec D6). (2) IS backfilled — the stale double state is exactly
-- identifiable from the rows themselves (section 4).
--
-- THIS MIGRATION MOVES NO MONEY. `clientes.clases_restantes` is not read or written by a single
-- statement in this file, and the three RPC edits change only which columns the reuse UPDATE stamps.
-- What changes is what the ledger SAYS about charges that already happened.
--
-- SIGNATURES. All three are CREATE OR REPLACE at the EXACT live signatures, read back from pg_proc
-- before this file was written: `reservar_clase(uuid, uuid)` SECURITY DEFINER, `pasar_lista_sesion(uuid,
-- uuid)` and `fijar_asistencia(uuid, boolean, uuid, date, boolean)` SECURITY INVOKER, all three
-- `set search_path to ''`. No drop — the ADR-0005 EXECUTE grants carry untouched — and no new
-- argument list, which is the shape that left prod holding two `registrar_venta`s and answering
-- 300/PGRST203 to every sale on 2026-08-27 (docs/audits/2026-08-27-registrar-venta-overload-outage.md).
--
-- THE BODIES ARE REPLAYS of the current definitions (20260826120100 for reservar_clase,
-- 20260826120000 for pasar_lista_sesion, 20260825151534 for fijar_asistencia) with the one edit each
-- named below. Live carries the SAME CODE for all three — the first two with abbreviated prose,
-- verified comment-only by comparing the comment-stripped, whitespace-stripped md5 of `prosrc`
-- against these files statement for statement — so applying this restores the full commentary and
-- changes no behaviour beyond the edits.

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. reservar_clase — a reused row is a NEW booking, so it gets a NEW charge moment.
-- ══════════════════════════════════════════════════════════════════════════════════
-- ONE line changes: the reactivate-cancelada UPDATE also stamps `created_at = now()`.
--
-- Why only the reuse arm: the INSERT arm already stamps `created_at` from the column default, which
-- is the booking instant. The reuse arm is the only path that carries forward a moment from a
-- decision the member has since undone. The table has no triggers, so re-stamping has exactly TWO
-- consumers, and the second one is a real (accepted) behaviour change:
--   * attribution — the §D0 derivation this slice adds, which is the point.
--   * ROSTER ORDER — `supabase/functions-canonical/roster_clase.sql` ends `order by r.created_at`, so
--     the initials strip it returns for a class now shows a member who cancelled and re-booked at the
--     END instead of in their original place. ACCEPTED, and the more honest reading of that list: it
--     is ordered by when the seat was taken, and a re-book IS a new booking. The position carries no
--     priority — that function returns initials only, there is no waitlist, and capacity is counted
--     elsewhere (`contar_reservas_activas_miembro`) — so the whole cost is display order.
--
-- Historic rebooks stay wrong and knowingly so — the second booking's instant was never recorded
-- anywhere, and inventing one would be worse than a stale one.
create or replace function public.reservar_clase(p_session_id uuid, p_cliente_id uuid default null)
  returns table (reservation_id uuid, clases_restantes int)
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid       uuid := (select auth.uid());
  v_gym       uuid;
  v_cap       int;
  v_cancelled timestamptz;
  v_starts    timestamptz;          -- #165: the started-class gate's only input
  v_member    uuid;
  v_clases    int;
  v_vence     date;
  v_tz        text;
  v_reservas  boolean;              -- the gym's booking switch
  v_hoy       date;
  v_sesion_fecha date;              -- #244 guard 1: the SESSION's own gym-local date
  v_active    int;
  v_res_id    uuid;
  v_status    text;
  v_consumio  boolean := false;   -- C12: did the finite decrement actually run? (ilimitado leaves false)
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The session. gym is derived from HERE — never a client parameter, and never the CALLER's gym either
  -- (#237): a multi-gym operator aims at a session, and the session names the tenant.
  select gym_id, capacity, cancelled_at, starts_at into v_gym, v_cap, v_cancelled, v_starts
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_cancelled is not null then
    raise exception 'Clase cancelada';
  end if;

  -- #165: a started class is closed to booking — the mirror of cancelar_reserva's before-start gate,
  -- same message. Above every write, so the raise leaves the reservation and the balance untouched.
  -- SHARED by both identity paths, deliberately: an operator cannot create a booking in the past either.
  if v_starts <= now() then
    raise exception 'La clase ya comenzó';
  end if;

  -- ── IDENTITY: the ONE branch 20260804130000 added (#237) ───────────────────────
  -- Everything above and everything below is shared. Only WHO is being booked is decided here, and the
  -- two arms leave the same three variables set (v_member, v_clases, v_vence) so the rest cannot fork.
  if p_cliente_id is null then
    -- MEMBER SELF PATH: the caller's OWN cliente in THIS gym — the auth.uid() self-pin that scopes the
    -- whole definer body (the identity is never a parameter on this arm). This is also the tenant gate.
    select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
      from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
    if not found then
      raise exception 'No eres miembro de este gimnasio';
    end if;
  else
    -- OPERATOR PATH. SECURITY DEFINER means RLS will not run for this body, so the boundary the staff
    -- policies would have drawn is drawn here instead, in two halves and in this order:
    --   (a) STAFF OF THE SESSION'S GYM. Checked FIRST — before the target is looked up — so a caller
    --       who is not staff cannot use the refusal message to probe which cliente ids exist in a gym.
    if not public.is_staff_of(v_gym) then
      raise exception 'No autorizado';
    end if;
    --   (b) THE TARGET BELONGS TO THAT SAME GYM. The gym pin is the whole cross-tenant guarantee.
    select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  -- The gym's own row: its clock (server-authoritative, never a p_tz param) and its booking switch.
  select timezone, booking_enabled into v_tz, v_reservas from public.gym where id = v_gym;

  -- THE GYM SWITCH (2026-08-26). A gym with booking_enabled = false does not take reservations at
  -- all: no hold, no row, no decrement. Above every write, like every other refusal here.
  if not v_reservas then
    raise exception 'Reservas deshabilitadas';
  end if;

  -- Expiry: vence is the stacked expiry (ADR-0004); a lapsed vigencia blocks booking for finite AND
  -- ilimitado alike — an expired membership has no entitlement. NO staff override (#235): an operator
  -- hits this gate too, and the answer is to sell first.
  v_hoy := (now() at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_hoy then
    raise exception 'Paquete vencido';
  end if;

  -- #244 guard 1 (weakness 4): a package that is still valid TODAY can still lapse before the class
  -- itself happens — the gap the gate above cannot see. Same vigencia rule, same message, no
  -- ilimitado exemption (mirrors the gate above exactly).
  v_sesion_fecha := (v_starts at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_sesion_fecha then
    raise exception 'Paquete vencido';
  end if;

  -- Zero balance blocks — FINITE only. Ilimitado (clases_restantes IS NULL) is EXEMPT here and from the
  -- decrement below (ADR-0004 / ADR-0010 §4: unlimited means unlimited). No staff override (#235).
  if v_clases is not null and v_clases <= 0 then
    raise exception 'Sin clases disponibles';
  end if;

  -- Serialize concurrent bookings of the SAME session so the capacity check + insert are race-free.
  -- Keyed on the SESSION, so a member booking themselves and an operator booking them serialize together.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_session_id::text));

  -- Existing reservation for this (member, session) — the UNIQUE guarantees at most one. An ACTIVE one is
  -- a duplicate; a terminal one (cancelada/no_show) is REUSED (ADR-0010 §5: re-book reuses the row).
  select id, status into v_res_id, v_status
    from public.reservation where member_id = v_member and class_session_id = p_session_id;
  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    raise exception 'Ya reservaste esta clase';
  end if;

  -- Capacity vs the DERIVED active count (the one seam) — MEMBER-facing, walk-in-excluded: a walk-in
  -- mark never consumed a bookable spot (owner ruling 2026-08-03), so it must not close one here either.
  select coalesce((select activos from public.contar_reservas_activas_miembro(array[p_session_id])), 0)
    into v_active;
  if v_active >= v_cap then
    raise exception 'Clase llena';
  end if;

  -- Write the reservation: reuse the terminal row or insert fresh (UNIQUE keeps one row per member+session).
  -- gym_id is stamped from the SESSION's gym on both paths. is_walk_in stays FALSE for an operator-made
  -- booking too (#235): a phone booking IS a reserva.
  if v_res_id is not null then
    update public.reservation
       set status = 'reservada', is_walk_in = false, cancelled_at = null, checked_at = null,
           -- D6: the reused row is a NEW booking, and now() is when it was made. The stale moment
           -- would attribute this charge to the pack that was live at the FIRST booking.
           created_at = now()
     where id = v_res_id;
  else
    insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (v_gym, p_session_id, v_member, 'reservada')
    returning id into v_res_id;
  end if;

  -- Consume exactly one class — FINITE only (ilimitado NULL skips entirely). Row-locked by the UPDATE,
  -- guarded (`> 0`, never below zero), atomic with the reservation write above. The `not found` raise
  -- covers the concurrent-same-member race and rolls the whole booking back.
  if v_clases is not null then
    update public.clientes set clases_restantes = clientes.clases_restantes - 1
     where id = v_member and clientes.clases_restantes > 0
     returning clientes.clases_restantes into v_clases;
    if not found then
      raise exception 'Sin clases disponibles';
    end if;
    v_consumio := true;   -- C12: the guarded decrement updated a row — this booking spent a class.
  end if;

  -- C12: record whether this booking consumed a class, so cancelar_reserva refunds ONLY what was actually
  -- spent. Stamps both a fresh insert (default false) and a reused terminal row.
  update public.reservation set consumio = v_consumio where id = v_res_id;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   -- NULL for ilimitado
  return next;
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 2. pasar_lista_sesion — a walk-in taking over a booking's row clears that booking's flag.
-- ══════════════════════════════════════════════════════════════════════════════════
-- ONE line changes: the walk-in arm's reuse UPDATE also sets `consumio = false`.
--
-- That arm is reached ONLY when the row is terminal — an active ('reservada'/'asistida') row took
-- the booked branch above, where the flag is the live hold and must survive — so the flag cleared
-- here is the one `cancelar_reserva` left behind when it already refunded that booking. This visit's
-- charge is the asistencia inserted at the tail with `consumio = v_consumio`, which is also the flag
-- the untoggle refund reads: the money is untouched. What stops is the double count.
create or replace function public.pasar_lista_sesion(p_session_id uuid, p_cliente_id uuid)
 returns table(present boolean, hora text, session_id uuid, clases_restantes int, resultado text)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_gym    uuid;
  v_starts timestamptz;
  v_tz     text;
  v_fecha  date;
  v_clases int;          -- the cliente's current clases_restantes (NULL = ilimitado)
  v_vence  date;         -- C9: the cliente's stacked expiry (NULL = no expiry)
  v_res_id uuid;
  v_status text;
  v_walk   boolean;
  v_asis_id       uuid;
  v_asis_consumio boolean;
  v_consumio boolean;
  v_perdonada boolean := false;   -- true ONLY on the cooldown pardon
  v_hora     time;
  v_saldo    int;                 -- the balance AFTER the write — the returned one
  v_resultado text;               -- the settlement outcome disclosed to the operator (#233)
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The session (RLS scopes the read to the operator's gym); gym + start instant derive from HERE.
  select gym_id, starts_at into v_gym, v_starts
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  -- Serialize every attendance write for this MEMBER, across both surfaces — the identical key
  -- toggle_pase takes. It is taken HERE, above the clientes read, because every read the write
  -- decision depends on must sit INSIDE the lock: clases_restantes is what decides v_consumio, so
  -- reading it first would decide on a stale balance.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  -- The target cliente, pinned to THIS gym (staff RLS already scopes it; the gym pin is
  -- defense-in-depth so a cross-gym cliente id can never be marked against another gym's session).
  select c.clases_restantes, c.vence into v_clases, v_vence
    from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Server-authoritative gym clock (never a client param); the session's own date drives the hora stamp.
  select timezone into v_tz from public.gym where id = v_gym;
  v_fecha := (v_starts at time zone v_tz)::date;

  -- Current state: the (member, session) reservation (UNIQUE — at most one) and the active attendance row.
  select id, status, is_walk_in into v_res_id, v_status, v_walk
    from public.reservation where member_id = p_cliente_id and class_session_id = p_session_id;
  select id, consumio into v_asis_id, v_asis_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and class_session_id = p_session_id and deleted_at is null
   order by created_at desc limit 1;

  -- ── TOGGLE OFF: an active attendance row exists ────────────────────────────────
  if v_asis_id is not null then
    update public.asistencias set deleted_at = now() where id = v_asis_id;
    -- Refund iff THIS pase consumed (walk-in path) AND the plan is finite. A booked member's pase
    -- wrote consumio=false, so this never refunds their booking consume (that is #58's cancel).
    -- (a) makes this refund trustworthy: consumio = true now PROVES a decrement actually landed.
    if v_asis_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clientes.clases_restantes + 1 where id = p_cliente_id;
    end if;
    -- Reverse the reservation transition symmetrically.
    if v_res_id is not null then
      if v_walk then
        update public.reservation set status = 'cancelada', cancelled_at = now(), checked_at = null where id = v_res_id;
      else
        update public.reservation set status = 'reservada', checked_at = null where id = v_res_id;
      end if;
    end if;
    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    -- resultado is NULL on every un-mark: an undo settles nothing, so it discloses nothing.
    return query select false, null::text, p_session_id, v_saldo, null::text;
    return;
  end if;

  -- ── TOGGLE ON ──────────────────────────────────────────────────────────────────
  -- #166: the visit is stamped from the CLASS's own instant in the gym's timezone, never from now().
  v_hora := (v_starts at time zone v_tz)::time;

  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    -- BOOKED member: already consumed at booking. Flip to asistida; DO NOT consume. THE CAPTURE:
    -- the hold taken at reservar_clase is settled here, which is what 'reserva' names.
    update public.reservation set status = 'asistida', checked_at = now() where id = v_res_id;
    v_consumio := false;
    v_resultado := 'reserva';
  else
    -- WALK-IN: no active booking. Create (or reuse a terminal) reservation as a walk-in, and consume
    -- exactly like toggle_pase's ON path (finite-only, guarded).
    -- C9 vigencia (inclusive), the WALK-IN branch ONLY. Compared against v_fecha — the SESSION's own
    -- gym-local date, not today — so recording a past session the member attended while still valid
    -- keeps working; vence < v_fecha blocks, the vence day itself passes.
    if v_vence is not null and v_vence < v_fecha then
      raise exception 'Paquete vencido';
    end if;
    -- COOLDOWN. p_clase => false: only a recent ACCESO LIBRE row on this session's own fecha pardons
    -- this class mark — one arrival, already charged at the desk. Since #245 the payment key lives
    -- INSIDE visita_reciente (`and not perdonada`): a row that paid nothing pardons nothing.
    if public.visita_reciente(p_cliente_id, v_fecha, false) then
      v_consumio := false;
      v_perdonada := true;
      v_resultado := 'gratis';   -- admitted, nothing charged: the second record of one arrival.
    else
      -- #237 ZERO-BALANCE GATE: a finite member at 0 classes is hard-refused here, same message and
      -- posture as reservar_clase's own gate. Ilimitado (NULL) never reaches the raise.
      if v_clases is not null and v_clases <= 0 then
        raise exception 'Sin clases disponibles';
      end if;
      v_consumio := (v_clases is not null);
      v_resultado := case when v_consumio then 'descontada' else 'gratis' end;
    end if;
    if v_res_id is not null then
      update public.reservation
         set status = 'asistida', is_walk_in = true, checked_at = now(), cancelled_at = null,
             -- D6: a terminal row's consumio is the CANCELLED booking's flag (cancelar_reserva
             -- refunds by reading it and never clears it). This visit's charge is the asistencia
             -- inserted below, so the flag must not claim it a second time.
             consumio = false
       where id = v_res_id;
    else
      insert into public.reservation (gym_id, class_session_id, member_id, status, is_walk_in, checked_at)
      values (v_gym, p_session_id, p_cliente_id, 'asistida', true, now())
      returning id into v_res_id;
    end if;
    if v_consumio then
      update public.clientes set clases_restantes = clientes.clases_restantes - 1
       where id = p_cliente_id and clientes.clases_restantes > 0;   -- guarded decrement
      -- (a) …AND THE GUARD IS NOW READ. Zero rows matched means the balance moved under us between
      -- the read above and this write (another writer of this column; none takes the `pase:` key).
      -- Writing consumio = true anyway would record a payment that never happened and let a later
      -- untoggle refund it. Same message the gate above raises — the member is, in fact, out of
      -- classes — and the raise leaves the ledger, the reservation and the balance untouched.
      if not found then
        raise exception 'Sin clases disponibles';
      end if;
    end if;
  end if;

  -- The attendance row IS the asistida state of the reservation (ADR-0010 §5): linked to both.
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, class_session_id, reservation_id, origen, perdonada)
  values (p_cliente_id, v_fecha, v_hora, v_consumio, v_gym, p_session_id, v_res_id, 'clase', v_perdonada);

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), p_session_id, v_saldo, v_resultado;
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 3. fijar_asistencia — the same edit, at the idempotent seam's own walk-in reuse.
-- ══════════════════════════════════════════════════════════════════════════════════
-- ONE line changes, for the same reason and in the same place: the class walk-in's reuse UPDATE also
-- sets `consumio = false`. The BOOKED branch above it (`not v_res_walk` and status in
-- ('reservada','asistida')) is untouched, so a captured hold keeps saying it was a hold — which is
-- what the replay arm re-derives 'reserva' from.
--
-- The two seams have to move together: they are the two doors onto the same walk-in state, and #293
-- exists because they can be reached in either order by a retrying client.
create or replace function public.fijar_asistencia(
  p_cliente_id uuid,
  p_presente   boolean,
  p_session_id uuid    default null,
  p_fecha      date    default null,
  p_perdonada  boolean default false
)
 returns table(present boolean, hora text, session_id uuid, clases_restantes int, resultado text)
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_gym    uuid;
  v_tz     text;
  v_starts timestamptz;
  v_fecha  date;                  -- the CONTEXT's gym-local date: the session's own, or p_fecha
  v_hora   time;                  -- the visit stamp: the session's own start, or now() if today
  v_clases int;                   -- the cliente's balance BEFORE the write (NULL = ilimitado)
  v_vence  date;                  -- C9: the stacked expiry (NULL = no expiry)
  v_res_id      uuid;
  v_res_status  text;
  v_res_walk    boolean;
  v_asis_id        uuid;          -- the ACTIVE attendance row in this context, if any
  v_asis_consumio  boolean;
  v_asis_perdonada boolean;
  v_asis_hora      time;
  v_consumio  boolean;
  v_perdonada boolean := false;   -- what THIS row is stamped: p_perdonada, but never on the booked branch
  v_saldo     int;                -- the balance AFTER the write — the returned one
  v_resultado text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The stated outcome is the whole contract, so a NULL for it is a caller bug, not a default. Same
  -- for the forgiveness decision: `p_perdonada` defaults to false (the ordinary charge), but an
  -- explicit NULL means "I did not decide", and silently reading that as "do not forgive" is how a
  -- pardoned arrival becomes a double charge without anyone noticing.
  if p_presente is null then
    raise exception 'Falta el estado deseado';
  end if;
  if p_perdonada is null then
    raise exception 'Falta la decision de perdon';
  end if;
  -- ACCESO LIBRE has no session to derive a date from, so it must be given one.
  if p_session_id is null and p_fecha is null then
    raise exception 'Falta la fecha';
  end if;

  -- Serialize EVERY attendance write for this member, on the identical key both toggles take — a mark
  -- through this seam and a mark through theirs must serialize against each other or two concurrent
  -- calls at balance 1 both read 1, both write consumio = true, and the loser's guarded decrement
  -- matches zero rows (a later un-mark then refunds a class that was never spent). Taken FIRST, above
  -- every read the write decision depends on; that position is load-bearing, not tidiness.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  -- ── Resolve the context: the gym, the clock, the date and the visit stamp ──────────────────────
  if p_session_id is not null then
    -- CLASS context. The session (RLS-scoped: another gym's session simply is not found) owns the gym
    -- AND the instant. #166: fecha and hora are BOTH `starts_at` in the gym's timezone, never now() —
    -- so a roster marked the next morning records 07:00 yesterday, not the data-entry hour, and the
    -- C9 gate below is judged on the day the member actually trained. p_fecha is deliberately IGNORED
    -- here, exactly as toggle_pase ignores it when a session is named: the session's own date governs.
    select gym_id, starts_at into v_gym, v_starts
      from public.class_session where id = p_session_id;
    if not found then
      raise exception 'Clase no encontrada';
    end if;

    select timezone into v_tz from public.gym where id = v_gym;
    v_fecha := (v_starts at time zone v_tz)::date;
    v_hora  := (v_starts at time zone v_tz)::time;

    -- The target cliente, PINNED to the session's gym (defense-in-depth beside RLS: a cross-gym
    -- cliente id can never be marked against another gym's session).
    select c.clases_restantes, c.vence into v_clases, v_vence
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  else
    -- ACCESO LIBRE context. No class, so the gym comes from the cliente (RLS-scoped) and the stated
    -- p_fecha is the date. The stamp keeps toggle_pase's rule verbatim — the wall clock if this is
    -- today, NULL for a backdated entry, because there is no session instant to borrow.
    select c.clases_restantes, c.gym_id, c.vence into v_clases, v_gym, v_vence
      from public.clientes c where c.id = p_cliente_id;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;

    select timezone into v_tz from public.gym where id = v_gym;
    v_fecha := p_fecha;
    v_hora  := case
      when v_fecha = (now() at time zone v_tz)::date then (now() at time zone v_tz)::time
      else null
    end;
  end if;

  -- ── Read the CURRENT state of exactly this context ────────────────────────────────────────────
  -- The two contexts are disjoint by construction and each is bounded by its own unique index
  -- (asistencias_sesion_cliente_activa_uq / asistencias_cliente_fecha_libre_uq, 20260728120000), so
  -- "the active row" is at most one. The order/limit is kept for parity with the toggles' reads over
  -- pre-#89 rows.
  if p_session_id is not null then
    select a.id, a.consumio, a.perdonada, a.hora
      into v_asis_id, v_asis_consumio, v_asis_perdonada, v_asis_hora
      from public.asistencias a
     where a.cliente_id = p_cliente_id and a.class_session_id = p_session_id and a.deleted_at is null
     order by a.created_at desc limit 1;

    select r.id, r.status, r.is_walk_in into v_res_id, v_res_status, v_res_walk
      from public.reservation r
     where r.member_id = p_cliente_id and r.class_session_id = p_session_id;
  else
    select a.id, a.consumio, a.perdonada, a.hora
      into v_asis_id, v_asis_consumio, v_asis_perdonada, v_asis_hora
      from public.asistencias a
     where a.cliente_id = p_cliente_id and a.fecha = v_fecha and a.deleted_at is null
       and a.class_session_id is null
     order by a.created_at desc limit 1;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  -- DESIRED STATE: ABSENT.
  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  if not p_presente then
    -- Already absent — the stated outcome holds. WRITE NOTHING. This is the arm that makes an
    -- un-check-in safe to replay: the toggles would re-fire here (re-marking the member present and
    -- charging again); this returns the same answer it gave the first time.
    if v_asis_id is null then
      select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
      return query select false, null::text, p_session_id, v_saldo, null::text;
      return;
    end if;

    -- Converge: soft-delete the visit and refund iff THIS row consumed and the plan is finite. A
    -- booked member's row wrote consumio=false, so the hold taken at reservar_clase is never refunded
    -- here (that is cancelar_reserva's job) — and because the row is gone, a replay lands in the
    -- no-op above and cannot refund a second time.
    update public.asistencias set deleted_at = now() where id = v_asis_id;
    if v_asis_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clientes.clases_restantes + 1 where id = p_cliente_id;
    end if;
    -- Reverse the reservation transition symmetrically: a walk-in row existed only for this visit, so
    -- it goes terminal; a real booking reverts to its held state with its hold intact.
    if v_res_id is not null then
      if v_res_walk then
        update public.reservation set status = 'cancelada', cancelled_at = now(), checked_at = null where id = v_res_id;
      else
        update public.reservation set status = 'reservada', checked_at = null where id = v_res_id;
      end if;
    end if;

    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    -- resultado is NULL on every un-mark: nothing was settled, so nothing is disclosed.
    return query select false, null::text, p_session_id, v_saldo, null::text;
    return;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  -- DESIRED STATE: PRESENT.
  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  -- THE REPLAY ARM. The member is already present in this context, so the stated outcome holds and
  -- there is nothing to do. WRITE NOTHING — no soft-delete, no refund, no second decrement — and
  -- report the STORED row's own facts so the return value is idempotent too.
  --
  -- `resultado` is re-derived from the written rows, never re-decided, and the derivation is exact
  -- because the three outcomes leave three distinguishable row shapes:
  --     perdonada = true                                   → 'gratis'    (a forgiven arrival)
  --     consumio  = true                                   → 'descontada'(the finite decrement ran)
  --     free, and the reservation is a real booking        → 'reserva'   (a hold was captured)
  --     free otherwise (ilimitado, or a libre row)         → 'gratis'
  -- This is why the booked branch below insists on `is_walk_in = false`: it is what keeps the third
  -- and fourth lines apart.
  if v_asis_id is not null then
    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    v_resultado := case
      when v_asis_perdonada then 'gratis'
      when v_asis_consumio  then 'descontada'
      when p_session_id is not null and v_res_id is not null and not v_res_walk then 'reserva'
      else 'gratis'
    end;
    return query select true, to_char(v_asis_hora, 'HH24:MI'), p_session_id, v_saldo, v_resultado;
    return;
  end if;

  -- No active row: this is a real check-in, and the only arm of the whole function that writes one.
  if p_session_id is not null and v_res_id is not null and not v_res_walk
     and v_res_status in ('reservada', 'asistida') then
    -- BOOKED: the hold taken at reservar_clase is CAPTURED. Flip to asistida, charge nothing.
    -- `p_perdonada` is deliberately not applied — there is nothing to forgive, the booking already
    -- paid, and stamping perdonada here would tell a visit count that this was the second record of
    -- one arrival when it is the arrival itself.
    update public.reservation set status = 'asistida', checked_at = now() where id = v_res_id;
    v_consumio  := false;
    v_resultado := 'reserva';
  else
    -- WALK-IN (a class with no booking) or ACCESO LIBRE. Nothing has paid for this visit yet.
    --
    -- C9 vigencia (inclusive): an expired package has no entitlement. Judged against the CONTEXT's own
    -- date — the session's gym-local day, or p_fecha — so recording a past visit the member made while
    -- still valid keeps working; vence < the visit's day blocks, the vence day itself passes.
    if v_vence is not null and v_vence < v_fecha then
      raise exception 'Paquete vencido';
    end if;

    if p_perdonada then
      -- THE STATED PARDON. The caller decided this arrival was already paid for by a sibling row
      -- (the 15-minute cooldown), so it is recorded and not charged, and stamped `perdonada` — which
      -- is what lets a visit COUNT skip the second record of one arrival, and what stops this row
      -- from pardoning anything in turn (`visita_reciente`'s `and not perdonada`). A pardon can only
      -- ever make a visit free, never dearer, and the operator can already give a free visit by other
      -- means, so an over-generous caller costs a class and nothing more.
      v_consumio  := false;
      v_perdonada := true;
      v_resultado := 'gratis';
    else
      -- #237 zero-balance gate: a finite member at 0 is hard-refused, the same message and posture as
      -- reservar_clase's. Reached only when no pardon was stated — a pardoned visit's sibling already
      -- paid, and a paid visit must never be blocked a second time. Ilimitado (NULL) never reaches it.
      if v_clases is not null and v_clases <= 0 then
        raise exception 'Sin clases disponibles';
      end if;
      v_consumio  := (v_clases is not null);
      v_resultado := case when v_consumio then 'descontada' else 'gratis' end;
    end if;

    -- A class walk-in needs the reservation the attendance row hangs off; ACCESO LIBRE has none.
    if p_session_id is not null then
      if v_res_id is not null then
        update public.reservation
           set status = 'asistida', is_walk_in = true, checked_at = now(), cancelled_at = null,
               -- D6, same as pasar_lista_sesion: the flag on a terminal row belongs to the booking
               -- that was cancelled and already refunded. This visit's charge is the asistencia
               -- inserted below.
               consumio = false
         where id = v_res_id;
      else
        insert into public.reservation (gym_id, class_session_id, member_id, status, is_walk_in, checked_at)
        values (v_gym, p_session_id, p_cliente_id, 'asistida', true, now())
        returning id into v_res_id;
      end if;
    end if;

    if v_consumio then
      update public.clientes set clases_restantes = clientes.clases_restantes - 1
       where id = p_cliente_id and clientes.clases_restantes > 0;   -- guarded decrement
    end if;
  end if;

  -- The ledger row. `origen` states the kind and must agree with the context
  -- (asistencias_origen_kind_ck); `reservation_id` is the walk-in/booking it settles, NULL for libre.
  -- The unique indexes are the second lock: if two callers somehow raced past the advisory lock, one
  -- of these inserts fails rather than writing a duplicate visit.
  insert into public.asistencias
    (cliente_id, fecha, hora, consumio, gym_id, class_session_id, reservation_id, origen, perdonada)
  values (
    p_cliente_id, v_fecha, v_hora, v_consumio, v_gym, p_session_id,
    case when p_session_id is not null then v_res_id else null end,
    case when p_session_id is not null then 'clase' else 'libre' end,
    v_perdonada
  );

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), p_session_id, v_saldo, v_resultado;
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 4. BACKFILL — the stale double state, and only it.
-- ══════════════════════════════════════════════════════════════════════════════════
-- The state is a PAIR: a reservation that says it spent a class, while an ACTIVE attendance row
-- linked to it says the same thing about the same member and the same session. One visit cannot have
-- been charged by both, so one of the two flags is dead — and it is always the reservation's, because
-- the attendance row is the one that also moved the balance last. The pair comes from the walk-in
-- reuse above, or (on the demo twin) from a seed generator that stamped both for one visit.
--
-- The NORMAL booked-then-checked-in row is not this shape and is untouched: its capture writes the
-- asistencia with `consumio = false` because the booking already paid, so it never matches the
-- EXISTS. Neither do pardoned rows (`consumio = false`), soft-deleted rows, ilimitado rows (nothing
-- charges), or a booking whose class has not happened yet (no asistencia at all) — which is what
-- keeps every live HOLD intact. One column is written; no balance is touched.
--
-- Stated so it is not a surprise later: on the NON-walk-in rows of this shape (the demo seed's, and
-- any booking whose attendance row charged), clearing the flag also closes a double refund — an
-- un-mark refunds from the asistencia and returns the row to 'reservada' still flagged, and
-- `cancelar_reserva` would then refund a second time off the same flag.
--
-- SCOPE: PLATFORM-WIDE, ACROSS EVERY TENANT, BY DESIGN. There is no `gym_id` predicate and there must
-- not be one — the stale pair is a shape, not a tenant's problem, and a per-gym backfill would leave
-- the next gym's ledger reading a charge twice. Set-based over whatever the target holds, never a
-- hardcoded id list, so it is correct on a scratch project, on the local docker stack and on live alike.
--
-- MEASURED ON LIVE 2026-08-27, before this shipped: 327 rows match, ALL of them the `red-demo` sandbox
-- twin's generated history (status 'asistida', is_walk_in false, origen null — the seed writes both
-- flags), ZERO in forge and zero in red. So the write this migration performs against production
-- touches no real gym's data.
--
-- THE ONE SHAPE THAT WOULD COST SOMETHING, and why it is accepted: a row genuinely double-charged
-- before 20260710132000 (`pasar_lista_front_desk_no_reconsume`) — a booking that debited a class AND
-- an attendance row that debited a second one for the same visit — is indistinguishable from the
-- stale pair by these predicates. Clearing its flag drops the reservation's claim to its (real)
-- charge, and `cancelar_reserva` refunds by READING that flag, so that charge would become
-- unrefundable through the cancel door. The count of such rows in prod is ZERO — the 327 are all the
-- demo twin's, none of them predates that migration — so the case is theoretical here and accepted
-- rather than special-cased; a predicate carved for a population of zero is a predicate nobody can
-- test.
update public.reservation r
   set consumio = false
 where r.consumio
   and exists (
     select 1
       from public.asistencias a
      where a.reservation_id = r.id
        and a.cliente_id = r.member_id
        and a.class_session_id = r.class_session_id
        and a.deleted_at is null
        and a.consumio
   );
