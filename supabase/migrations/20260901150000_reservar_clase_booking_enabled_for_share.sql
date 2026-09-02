-- #331 review fix — `reservar_clase` reads `gym.booking_enabled` with no row lock, so a booking can
-- race `cambiar_modo_reservas`'s OFF flip and land AFTER the switch is off: both transactions read
-- `booking_enabled = true` concurrently (MVCC's default snapshot isolation lets a plain SELECT see a
-- committed-before-the-read value regardless of a concurrent writer), the flip's cancel loop finds
-- nothing yet to cancel (it already ran, or runs before this INSERT commits), and the booking commits
-- clean — a hold survives a switch that was supposed to close the door on every future reservation.
--
-- ONE line changes from the live body (20260828100000): the gym read gains `for share`. That takes a
-- shared row lock on `gym`'s row for `v_gym`, which blocks (not fails) behind `cambiar_modo_reservas`'s
-- plain `update public.gym set booking_enabled = ...` for the SAME row until that transaction commits
-- or rolls back — the standard SELECT-locks-against-UPDATE serialization Postgres already gives an
-- explicit row lock. Two reservar_clase calls for the same gym still run concurrently (`for share`
-- does not conflict with itself), so this adds no new contention between members booking normally —
-- only between a booking and the switch flip for the SAME gym row.
--
-- Everything else is byte-identical to the live body (comment-stripped, whitespace-stripped
-- comparison verified before writing this file) — same signature, SECURITY DEFINER, `set search_path
-- to ''`, so CREATE OR REPLACE carries the ADR-0005 EXECUTE grant untouched, no re-issue needed.
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
  -- `for share`: a shared row lock that blocks behind `cambiar_modo_reservas`'s OFF flip (which
  -- updates this same row) rather than reading past it — closes the race described in this file's
  -- header. Ordinary bookings of the SAME gym never contend with each other (`for share` does not
  -- conflict with `for share`), only with the flip.
  select timezone, booking_enabled into v_tz, v_reservas from public.gym where id = v_gym for share;

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
