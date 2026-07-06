-- Slice #60 (Phase-6 S3 close): pasar_lista_sesion — the reservation-aware admin Pasar lista.
-- Closes the no-double-consume loop (ADR-0010 §4/§5; ADR-0004 saldo; ADR-0005 atomic seam).
--
-- POSTURE — the exact toggle_pase posture: SECURITY INVOKER (RLS is the hard boundary — the operator is
-- staff of the gym, holding the reservation/asistencias/clientes staff read+write policies, ADR-0013 §3),
-- SET search_path TO '' (every ref schema-qualified), EXECUTE authenticated-only. The on/off decision, the
-- reservation transition, the guarded ±1, and the attendance write are ONE transaction (ADR-0005).
--
-- THE THREE CONSUME RULES a future reader must not "simplify" (ADR-0010 §4):
--   * A BOOKED member (reservation reservada/asistida) already consumed at booking (reservar_clase, #57) —
--     Pasar lista flips reservada->asistida and writes the attendance row with consumio=false. NO second
--     decrement. Untoggling reverts asistida->reservada and refunds NOTHING (the booking consume stays
--     until a #58 cancel; refunding here would be the double-refund twin of a double-consume).
--   * A WALK-IN (no active reservation) creates an is_walk_in/asistida reservation AT THE DOOR and consumes
--     exactly one — byte-for-byte toggle_pase's ON path (finite-only, guarded > 0; ilimitado NULL exempt).
--     Untoggling reverts the walk-in reservation to cancelada and refunds iff it actually consumed and the
--     plan is finite — the symmetric door reversal.
--   * Ilimitado (clases_restantes IS NULL) NEVER decrements and NEVER refunds (ADR-0004).
--
-- hora is stamped only when the session's own date (its starts_at in the gym tz) is gym-today — the same
-- back-entry rule toggle_pase carries; a pase on a past session lands hora NULL.

create or replace function public.pasar_lista_sesion(p_session_id uuid, p_cliente_id uuid)
 returns table(present boolean, hora text)
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
  v_res_id uuid;
  v_status text;
  v_walk   boolean;
  v_asis_id       uuid;
  v_asis_consumio boolean;
  v_consumio boolean;
  v_hora     time;
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

  -- The target cliente, pinned to THIS gym (staff RLS already scopes it; the gym pin is defense-in-depth
  -- so a cross-gym cliente id can never be marked against another gym's session).
  select clases_restantes into v_clases
    from public.clientes where id = p_cliente_id and gym_id = v_gym;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Server-authoritative gym clock (never a client param); the session's own date drives the hora stamp.
  select timezone into v_tz from public.gym where id = v_gym;
  v_fecha := (v_starts at time zone v_tz)::date;

  -- Serialize concurrent pases of the SAME (cliente, session) so the read-then-write toggle is race-free.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_cliente_id::text || ':' || p_session_id::text));

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
    -- Refund iff THIS pase consumed (walk-in path) AND the plan is finite. A booked member's pase wrote
    -- consumio=false, so this never refunds their booking consume (that is #58's cancel).
    if v_asis_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clientes.clases_restantes + 1 where id = p_cliente_id;
    end if;
    -- Reverse the reservation transition symmetrically: a walk-in row existed only for this pase, so it
    -- goes terminal (cancelada); a real booking reverts to its held reservada state.
    if v_res_id is not null then
      if v_walk then
        update public.reservation set status = 'cancelada', cancelled_at = now(), checked_at = null where id = v_res_id;
      else
        update public.reservation set status = 'reservada', checked_at = null where id = v_res_id;
      end if;
    end if;
    return query select false, null::text;
    return;
  end if;

  -- ── TOGGLE ON ──────────────────────────────────────────────────────────────────
  v_hora := case when v_fecha = (now() at time zone v_tz)::date then (now() at time zone v_tz)::time else null end;

  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    -- BOOKED member: already consumed at booking. Flip to asistida; DO NOT consume.
    update public.reservation set status = 'asistida', checked_at = now() where id = v_res_id;
    v_consumio := false;
  else
    -- WALK-IN: no active booking. Create (or reuse a terminal) reservation as a walk-in, and consume
    -- exactly like toggle_pase's ON path (finite-only, guarded).
    v_consumio := (v_clases is not null and v_clases > 0);
    if v_res_id is not null then
      update public.reservation
         set status = 'asistida', is_walk_in = true, checked_at = now(), cancelled_at = null
       where id = v_res_id;
    else
      insert into public.reservation (gym_id, class_session_id, member_id, status, is_walk_in, checked_at)
      values (v_gym, p_session_id, p_cliente_id, 'asistida', true, now())
      returning id into v_res_id;
    end if;
    if v_consumio then
      update public.clientes set clases_restantes = clientes.clases_restantes - 1
       where id = p_cliente_id and clientes.clases_restantes > 0;   -- guarded decrement
    end if;
  end if;

  -- The attendance row IS the asistida state of the reservation (ADR-0010 §5): linked to both.
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, class_session_id, reservation_id)
  values (p_cliente_id, v_fecha, v_hora, v_consumio, v_gym, p_session_id, v_res_id);

  return query select true, to_char(v_hora, 'HH24:MI');
end;
$function$;

-- EXECUTE lockdown (ADR-0005/0013 §1): revoke public+anon default, grant authenticated only.
revoke execute on function public.pasar_lista_sesion(uuid, uuid) from public, anon;
grant execute on function public.pasar_lista_sesion(uuid, uuid) to authenticated;
