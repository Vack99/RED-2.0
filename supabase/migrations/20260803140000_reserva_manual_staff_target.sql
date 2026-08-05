-- Reserva manual desde la Agenda (#237, slice 2 of #235) — the two booking RPCs learn a TARGET.
--
-- THE GAP. A share of RED's members phone the gym instead of using the booking site. The operator has
-- the class sheet open and nowhere to put that booking: the only affordance there records the member as
-- ALREADY PRESENT (attendance stamped, visit written), which for tomorrow's 06:00 is a false record.
-- The member picker, the search and the candidate list already exist and already work — what is missing
-- is a write path behind them, and the reason it is missing is exactly one thing: `reservar_clase` and
-- `cancelar_reserva` take the identity from `auth.uid()` and have no parameter through which to name
-- anyone else.
--
-- WHAT CHANGES. Each function gains a nullable second argument.
--   * NULL  → today's member self path, byte-for-byte. The client app calls `rpc(fn, { p_session_id })`
--             and the default covers it: NO call-site edit anywhere (packages/data reservas.ts:30,60).
--   * NOT NULL → the OPERATOR path: book (or cancel) on behalf of the named cliente.
--
-- THE GATE LIVES IN THE BODY, and that is not a style choice. Both functions are SECURITY DEFINER, so
-- RLS does not run for them — the staff policies on `reservation` would permit this write, but they are
-- never consulted on this path. So the body itself establishes both halves:
--   (a) the caller is STAFF of the gym that owns the session — `public.is_staff_of(v_gym)`, the same
--       helper every staff RLS predicate uses and the same one `next_folio` guards a definer body with
--       (20260705082018:224). Refusal is 'No autorizado', the house sentence for a staff-authorization
--       refusal (scheduling_write_rpcs, preparar_invitacion, registrar_venta).
--   (b) the TARGET cliente belongs to that same gym — the gym-pinned lookup `c.id = p_cliente_id and
--       c.gym_id = v_gym`, byte-identical in shape to `pasar_lista_sesion`'s own target read
--       (20260729120000:210-214) down to its refusal, 'Cliente no encontrado'.
-- v_gym is DERIVED FROM THE SESSION in both, never taken from the caller (no staff_gym() anywhere here):
-- a multi-gym operator cannot aim this at a gym the session does not belong to.
--
-- NON-NULL ALWAYS REQUIRES STAFF — there is no self-exception. A plain member naming their OWN cliente id
-- is refused with 'No autorizado' and must use the one-argument call. Two doors with two guards would be
-- one door too many; the member door is `p_cliente_id is null`, and it is the only one auth.uid() opens.
--
-- NO RLS POLICY IS TOUCHED. The staff write policies on `reservation` already pin the gym and never the
-- member — that is what makes the check-in desk work — so nothing about tenant isolation is loosened.
--
-- NOTHING BELOW IDENTITY FORKS. Both paths converge immediately onto the same expiry gate, zero-balance
-- block, per-session advisory lock, duplicate guard, capacity guard, insert-or-reactivate, guarded
-- decrement and consumio stamp — and on the cancel side the same before-start gate, guarded flip and
-- consumio-gated refund. That is the whole design claim, and it is what keeps the two paths honest: a
-- phone booking costs the member exactly what a self-booking costs them, and a blocked member is blocked.
-- CHARGE-AT-BOOKING ON BOTH PATHS and NO STAFF OVERRIDE of cupo/balance/expiry are owner rulings (#235
-- Implementation Decisions) — do not re-litigate them here. #233 would rewrite both if it ever runs.
--
-- DROP + CREATE, not CREATE OR REPLACE, and it has to be: PostgreSQL cannot add a DEFAULTED parameter in
-- place — the existing one-argument function would survive alongside the new two-argument one and every
-- `reservar_clase(uuid)` call would become ambiguous (42725). Same pattern 20260729120000 used on
-- pasar_lista_sesion/toggle_pase for their return-type change, including its consequence: THE DROP TAKES
-- THE GRANTS WITH IT, so the EXECUTE lockdown is re-issued under each CREATE. Both signatures are dropped
-- so the file is RE-RUNNABLE — (uuid) is what exists before this migration, (uuid, uuid) after it.
--
-- Bodies are byte-faithful to 20260729120000 (reservar_clase) and 20260710123000 (cancelar_reserva) apart
-- from the identity branch called out inline. Idempotent and safe on a fresh scratch AND on live.

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. reservar_clase — book for yourself (NULL) or for a member of your gym (staff).
-- ══════════════════════════════════════════════════════════════════════════════════
drop function if exists public.reservar_clase(uuid);
drop function if exists public.reservar_clase(uuid, uuid);

create function public.reservar_clase(p_session_id uuid, p_cliente_id uuid default null)
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
  v_hoy       date;
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

  -- ── IDENTITY: the ONE branch this migration adds (#237) ────────────────────────
  -- Everything above and everything below is shared. Only WHO is being booked is decided here, and the
  -- two arms leave the same three variables set (v_member, v_clases, v_vence) so the rest cannot fork.
  if p_cliente_id is null then
    -- MEMBER SELF PATH, unchanged: the caller's OWN cliente in THIS gym — the auth.uid() self-pin that
    -- scoped the whole definer body before this parameter existed (the identity is never a parameter on
    -- this arm). This is also the tenant gate: a caller with no cliente in the session's gym is refused
    -- here. Columns are alias-qualified (c.) — the RETURNS TABLE OUT param `clases_restantes` shares the
    -- column's name.
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
    --       No self-exception: a plain member naming their own id lands here and is refused. Their door
    --       is the one-argument call.
    if not public.is_staff_of(v_gym) then
      raise exception 'No autorizado';
    end if;
    --   (b) THE TARGET BELONGS TO THAT SAME GYM. The gym pin is the whole cross-tenant guarantee: a
    --       cliente id from another gym finds no row and is refused, so a booking can never straddle a
    --       tenant boundary even though the caller is legitimately staff somewhere.
    select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  -- Expiry: the gym's own clock (server-authoritative, never a p_tz param). vence is the stacked expiry
  -- (ADR-0004); a lapsed vigencia blocks booking for finite AND ilimitado alike — an expired membership
  -- has no entitlement (matches derivarEstado's sin_clases on dias<=0). NO staff override (#235): an
  -- operator hits this gate too, and the answer is to sell first.
  select timezone into v_tz from public.gym where id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_hoy then
    raise exception 'Paquete vencido';
  end if;

  -- Zero balance blocks — FINITE only. Ilimitado (clases_restantes IS NULL) is EXEMPT here and from the
  -- decrement below (ADR-0004 / ADR-0010 §4: unlimited means unlimited). No staff override (#235).
  if v_clases is not null and v_clases <= 0 then
    raise exception 'Sin clases disponibles';
  end if;

  -- Serialize concurrent bookings of the SAME session so the capacity check + insert are race-free (member
  -- booking is genuinely concurrent, unlike the single-operator paths). Transaction-scoped; auto-released.
  -- Keyed on the SESSION, so a member booking themselves and an operator booking them serialize together.
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
  -- gym_id is stamped from the SESSION's gym on both paths. is_walk_in stays FALSE for an operator-made
  -- booking too (#235): a phone booking IS a reserva, and nothing records which operator made it.
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
  -- moves it, and only by exactly one, only on the RESOLVED v_member (the caller's own cliente on the
  -- self path, the named target on the operator path — never the operator's own balance). The `not
  -- found` raise covers the concurrent-same-member race (balance spent between the read and this lock)
  -- and rolls the whole booking back. Table-qualified: the RETURNS TABLE OUT param shares the name.
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

-- Re-issue the EXECUTE lockdown the DROP took with it (CREATE FUNCTION grants EXECUTE to public by
-- default) — the posture ADR-0005/0013 §1 set and every re-emission since has preserved.
revoke execute on function public.reservar_clase(uuid, uuid) from public, anon;
grant execute on function public.reservar_clase(uuid, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 2. cancelar_reserva — the undo, and it is NOT optional (#235).
-- ══════════════════════════════════════════════════════════════════════════════════
-- Read the charging decision and this one together: a phone booking costs the member a class the instant
-- it is made. Ship the booking without the undo and the first mis-tap is a support call the operator
-- cannot resolve from the app — the roster's present-toggle would mark that member ATTENDED, not cancel
-- them. So the same nullable-target, staff-gated, drop-and-recreate shape applies here, identically.
--
-- The refund is unchanged and stays consumio-gated: an operator cancel returns EXACTLY what the booking
-- spent — one class for a finite booking that consumed, nothing for an ilimitado one (C12's phantom-credit
-- fix, which is a historical fact on the row and has nothing to do with who is cancelling). And the
-- before-start gate is shared: once the class has begun, an operator cannot rewrite attendance history
-- either — a still-reservada past booking is a no-show that must consume (ADR-0010 §5).
drop function if exists public.cancelar_reserva(uuid);
drop function if exists public.cancelar_reserva(uuid, uuid);

create function public.cancelar_reserva(p_session_id uuid, p_cliente_id uuid default null)
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

  -- The session. gym + start are derived from HERE, never a client parameter and never the caller's gym.
  select gym_id, starts_at into v_gym, v_starts
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  -- ── IDENTITY: the ONE branch this migration adds (#237) — reservar_clase's, verbatim ───────────
  -- Kept in the position the self-pin lookup held (above the before-start gate) so the member path's
  -- guard ORDER is byte-for-byte what it was. See reservar_clase above for why each half is here.
  if p_cliente_id is null then
    select c.id, c.clases_restantes into v_member, v_clases
      from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
    if not found then
      raise exception 'No eres miembro de este gimnasio';
    end if;
  else
    if not public.is_staff_of(v_gym) then
      raise exception 'No autorizado';
    end if;
    select c.id, c.clases_restantes into v_member, v_clases
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  -- Before start only (ADR-0010 §4): once the class has begun, cancellation is closed — a still-reservada
  -- past booking is a no-show that must consume, not a refundable cancel. Absolute starts_at vs now().
  -- SHARED: an operator is refused here too, so attendance history cannot be rewritten after the fact.
  if v_starts <= now() then
    raise exception 'La clase ya comenzó';
  end if;

  -- The resolved member's reservation for this session — the UNIQUE guarantees at most one. Only an
  -- ACTIVE (reservada) booking can be cancelled; a terminal row (cancelada/no_show) or an asistida one is
  -- rejected so no refund is minted twice or against an attended class. The sentence is the member's own
  -- and is deliberately NOT forked per path: one refusal, one vocabulary (#235 — no behavioural fork).
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
  -- was spent comes back — which is also precisely what an operator undoing a mis-tap gives back, to the
  -- member they wrongly charged and never to themselves (the refund targets the RESOLVED v_member).
  -- Table-qualified: the RETURNS TABLE OUT param shares the name.
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

-- Re-issue the EXECUTE lockdown the DROP took with it, matching reservar_clase's posture exactly.
revoke execute on function public.cancelar_reserva(uuid, uuid) from public, anon;
grant execute on function public.cancelar_reserva(uuid, uuid) to authenticated;
