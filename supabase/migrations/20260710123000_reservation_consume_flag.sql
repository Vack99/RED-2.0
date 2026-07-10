-- C12 — reservations record consumption; cancel refunds ONLY what booking consumed.
--
-- The bug (finding C12): reservar_clase consumes a class only for FINITE plans (ilimitado books with no
-- decrement), but cancelar_reserva refunded +1 UNCONDITIONALLY on any reservada→cancelada flip, keyed on
-- the member's CURRENT plan. If the plan flipped ilimitado→finite between booking and cancel — a normal
-- event now that C4 purchase-wins shipped on this branch — the cancel credited a class that was never
-- spent: a phantom paid class.
--
-- The fix threads the historical fact through the reservation row:
--   * reservar_clase now STAMPS reservation.consumio = whether its guarded finite decrement actually
--     updated a row (true for a consumed finite booking, false for ilimitado). Task 3 added the column
--     (`consumio boolean not null default false`).
--   * cancelar_reserva now refunds +1 IFF the just-cancelled row had consumio = true (read in the same
--     guarded UPDATE … RETURNING that flips the status — no second read). consumio stays the historical
--     fact; only the refund is gated on it. A cancel of an ilimitado-era booking (consumio=false) never
--     refunds, even if the member is finite now — the phantom credit is pinned dead.
--
-- Expand-only (create-or-replace on both functions), idempotent, safe on a fresh scratch AND live. Both
-- bodies are re-emitted byte-faithful to their originals (20260706170000 / 20260706180000) except the
-- consume-flag edits called out inline. create-or-replace preserves grants; the EXECUTE lockdown is
-- re-emitted for posture parity (ADR-0005/0013 §1).

-- ── reservar_clase — re-emit; STAMP consumio from the actual decrement (C12) ──────
create or replace function public.reservar_clase(p_session_id uuid)
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
  v_member    uuid;
  v_clases    int;
  v_vence     date;
  v_tz        text;
  v_hoy       date;
  v_active    int;
  v_res_id    uuid;
  v_status    text;
  v_consumio  boolean := false;   -- C12: did the finite decrement actually run? (ilimitado leaves false)
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The session. gym is derived from HERE — never a client parameter. (Definer bypasses RLS on this
  -- read; the tenant gate is the cliente lookup below: no cliente of the caller in THIS gym → refused,
  -- so a cross-gym session id gets a member of another gym nothing.)
  select gym_id, capacity, cancelled_at into v_gym, v_cap, v_cancelled
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_cancelled is not null then
    raise exception 'Clase cancelada';
  end if;

  -- The caller's OWN cliente in THIS gym — the auth.uid() self-pin that scopes the whole definer body
  -- (the identity is never a parameter). This is also the tenant gate: a caller with no cliente in the
  -- session's gym is refused here. Columns are alias-qualified (c.) — the RETURNS TABLE OUT param
  -- `clases_restantes` shares the column's name.
  select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
    from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
  if not found then
    raise exception 'No eres miembro de este gimnasio';
  end if;

  -- Expiry: the gym's own clock (server-authoritative, never a p_tz param). vence is the stacked expiry
  -- (ADR-0004); a lapsed vigencia blocks booking for finite AND ilimitado alike — an expired membership
  -- has no entitlement (matches derivarEstado's sin_clases on dias<=0).
  select timezone into v_tz from public.gym where id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_hoy then
    raise exception 'Paquete vencido';
  end if;

  -- Zero balance blocks — FINITE only. Ilimitado (clases_restantes IS NULL) is EXEMPT here and from the
  -- decrement below (ADR-0004 / ADR-0010 §4: unlimited means unlimited).
  if v_clases is not null and v_clases <= 0 then
    raise exception 'Sin clases disponibles';
  end if;

  -- Serialize concurrent bookings of the SAME session so the capacity check + insert are race-free (member
  -- booking is genuinely concurrent, unlike the single-operator paths). Transaction-scoped; auto-released.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_session_id::text));

  -- Existing reservation for this (member, session) — the UNIQUE guarantees at most one. An ACTIVE one is
  -- a duplicate; a terminal one (cancelada/no_show) is REUSED (ADR-0010 §5: re-book reuses the row).
  select id, status into v_res_id, v_status
    from public.reservation where member_id = v_member and class_session_id = p_session_id;
  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    raise exception 'Ya reservaste esta clase';
  end if;

  -- Capacity vs the DERIVED active count (the one seam). A terminal row we may reuse is not active, so it
  -- is not double-counted.
  select coalesce((select activos from public.contar_reservas_activas(array[p_session_id])), 0)
    into v_active;
  if v_active >= v_cap then
    raise exception 'Clase llena';
  end if;

  -- Write the reservation: reuse the terminal row or insert fresh (UNIQUE keeps one row per member+session).
  if v_res_id is not null then
    update public.reservation
       set status = 'reservada', is_walk_in = false, cancelled_at = null, checked_at = null
     where id = v_res_id;
  else
    insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (v_gym, p_session_id, v_member, 'reservada')
    returning id into v_res_id;
  end if;

  -- Consume exactly one class — FINITE only (ilimitado NULL skips entirely, ADR-0004/0010 §4). The
  -- live twin of consumirClase / the toggle_pase guarded decrement: row-locked by the UPDATE, guarded
  -- (`> 0`, never below zero), atomic with the reservation write above. `clases_restantes` is a
  -- staff-write column members hold no policy on — this definer body is the only member path that
  -- moves it, and only by exactly one, only on the caller's own v_member. The `not found` raise covers
  -- the concurrent-same-member race (balance spent between the read and this lock) and rolls the whole
  -- booking back. Table-qualified: the RETURNS TABLE OUT param shares the column's name.
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
  -- spent. Stamps both a fresh insert (default false) and a reused terminal row (whose stale consumio from
  -- a prior booking is overwritten). v_consumio is true iff the finite decrement above ran; ilimitado
  -- leaves it false.
  update public.reservation set consumio = v_consumio where id = v_res_id;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   -- NULL for ilimitado
  return next;
end;
$function$;

-- ── cancelar_reserva — re-emit; refund IFF the cancelled row consumed (C12) ───────
create or replace function public.cancelar_reserva(p_session_id uuid)
  returns table (reservation_id uuid, clases_restantes int)
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_gym    uuid;
  v_starts timestamptz;
  v_member uuid;
  v_clases int;
  v_res_id uuid;
  v_status text;
  v_consumio boolean;   -- C12: read from the cancelled row in the guarded flip — the refund gate.
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The session. gym + start are derived from HERE, never a client parameter. (Definer bypasses RLS on
  -- this read; the tenant gate is the cliente lookup below.)
  select gym_id, starts_at into v_gym, v_starts
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  -- The caller's OWN cliente in THIS gym — the auth.uid() self-pin that scopes the whole definer body.
  -- Also the tenant gate: a caller with no cliente in the session's gym is refused here. Alias-qualified
  -- (c.) because the RETURNS TABLE OUT param `clases_restantes` shares the column's name.
  select c.id, c.clases_restantes into v_member, v_clases
    from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
  if not found then
    raise exception 'No eres miembro de este gimnasio';
  end if;

  -- Before start only (ADR-0010 §4): once the class has begun, cancellation is closed — a still-reservada
  -- past booking is a no-show that must consume, not a refundable cancel. Absolute starts_at vs now().
  if v_starts <= now() then
    raise exception 'La clase ya comenzó';
  end if;

  -- The member's reservation for this session — the UNIQUE guarantees at most one. Only an ACTIVE
  -- (reservada) booking can be cancelled; a terminal row (cancelada/no_show) or an asistida one is
  -- rejected so no refund is minted twice or against an attended class.
  select id, status into v_res_id, v_status
    from public.reservation where member_id = v_member and class_session_id = p_session_id;
  if v_res_id is null or v_status <> 'reservada' then
    raise exception 'No tienes una reserva activa en esta clase';
  end if;

  -- Guarded flip (the twin of reservar_clase's guarded decrement): `and status = 'reservada'` + the
  -- `not found` raise makes reservada→cancelada happen at most once, so two concurrent cancels cannot both
  -- refund. Atomic with the refund below. C12: RETURNING consumio reads the booking's recorded
  -- consumption in the SAME guarded write that flips the status — no second read, race-free.
  update public.reservation
     set status = 'cancelada', cancelled_at = now()
   where id = v_res_id and status = 'reservada'
   returning consumio into v_consumio;
  if not found then
    raise exception 'No tienes una reserva activa en esta clase';
  end if;

  -- Refund exactly one class — FINITE only, and C12: ONLY if this booking actually consumed one. Ilimitado
  -- (clases_restantes IS NULL) changes state only and NEVER has its NULL touched (ADR-0004 / ADR-0010 §4).
  -- The `and v_consumio` gate kills the phantom credit: a booking made under ilimitado (consumio=false)
  -- refunds nothing even if the member has since flipped to a finite plan (C4 purchase-wins). Only what
  -- was spent comes back. `clases_restantes` is a staff-write column members hold no policy on — this
  -- definer body is the only member path that moves it, and only by one, only on the caller's own
  -- v_member. Table-qualified: the RETURNS TABLE OUT param shares the name.
  if v_clases is not null and v_consumio then
    update public.clientes set clases_restantes = clientes.clases_restantes + 1
     where id = v_member
     returning clientes.clases_restantes into v_clases;
  end if;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   -- NULL for ilimitado
  return next;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005/0013 §1): revoke public+anon default, grant authenticated only ──
revoke execute on function public.reservar_clase(uuid) from public, anon;
revoke execute on function public.cancelar_reserva(uuid) from public, anon;
grant execute on function public.reservar_clase(uuid) to authenticated;
grant execute on function public.cancelar_reserva(uuid) to authenticated;
