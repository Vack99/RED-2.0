-- reservar_clase's capacity guard learns the walk-in-excluded count (owner ruling 2026-08-03,
-- #237 fast-follow) — closing the occupancy seam split 20260804110000 opened.
--
-- THE GAP. 20260804110000 gave the MEMBER-facing readers (agenda-miembro.ts, clase-miembro.ts) a
-- walk-in-excluded occupancy count (`contar_reservas_activas_miembro`), so a staff walk-in mark
-- can no longer drive a member's VIEW of a session to LLENO. `reservar_clase`'s own capacity guard
-- was left untouched — still counting through `contar_reservas_activas` (walk-ins included) — so a
-- session at nominal cupo with a few walk-ins marked over it now reads "quedan N > 0" to the member
-- (the fixed reader) but raises 'Clase llena' at the booking RPC (the un-fixed guard): the read and
-- the WRITE of the SAME availability question disagreed. That is exactly what ADR-0010 §3's
-- one-projection rule forbids — occupancy is DERIVED, and a session may have only ONE derivation a
-- member-facing surface is allowed to see, never two that can drift apart mid-flow. A walk-in never
-- consumed a bookable spot (20260804110000's own ruling); it must not be able to close one to a
-- booking attempt either.
--
-- THE FIX: repoint the ONE capacity-check call inside `reservar_clase` from `contar_reservas_activas`
-- to `contar_reservas_activas_miembro`. That call sits BELOW where the member self-path and the
-- #237 operator (staff-target) path converge — the whole design of the staff-target migration is
-- that everything below identity resolution is one shared body — so this one swap closes the gap
-- for both a member booking themselves and an operator booking a phoned-in member. `agenda.ts`'s
-- roster/headcount reader is the deliberate exception and stays on `contar_reservas_activas`:
-- "17/15" is truth for the operator, never for the capacity gate a member's own booking hits.
--
-- SCOPE + WHY THIS IS A DROP+CREATE FROM `main`, NOT A LOCAL REPLAY: `reservar_clase`'s CURRENT body
-- is 20260803140000_reserva_manual_staff_target.sql (#235/#237's nullable-target variant), which
-- gave the function its `(uuid, uuid default null)` signature. That migration is not yet on this
-- branch (this branch forked before it), so this file's body is copied byte-faithful from `main`
-- rather than replayed forward from a local predecessor — ONE edit, the capacity guard's count call.
-- `cancelar_reserva` is untouched: it has no capacity check, so this finding does not reach it.
--
-- RE-RUNNABLE EITHER SIDE OF THE MERGE: both prior signatures are dropped before the create —
-- `(uuid)` is what this branch still has locally (20260729120000, the pre-#237 single-arg shape),
-- `(uuid, uuid)` is what `main` already has. Whichever runs first, this migration lands on the same
-- end state, so it is correct whether it applies before or after 20260803140000 merges in.
--
-- ORDERING: depends on 20260803140000 (the two-arg function shape, once merged — `is_staff_of` and
-- `contar_reservas_activas` it also calls already exist on this branch since 20260702161010 and
-- 20260706170000) and 20260804110000 (`contar_reservas_activas_miembro`, already on this branch) —
-- both sort earlier by filename either way, so no reordering is needed on either side of the merge.
--
-- Idempotent (drop-if-exists on both prior signatures, create fresh, revoke/grant re-issued),
-- forward-only, safe on a fresh scratch AND on live.
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

  -- Capacity vs the DERIVED active count (the one seam) — MEMBER-facing, walk-in-excluded: a walk-in
  -- mark never consumed a bookable spot (owner ruling 2026-08-03, 20260804110000), so it must not close
  -- one here either. A terminal row we may reuse is not active, so it is not double-counted.
  select coalesce((select activos from public.contar_reservas_activas_miembro(array[p_session_id])), 0)
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
