-- C15 (other half) — one visit = one consume across BOTH admin attendance surfaces, Agenda side.
--
-- Ruling C15 (owner, 2026-07-10): a member who attends one class consumes exactly one class, no matter
-- WHICH admin surface marks them. 20260710124000 closed the front-desk-after-Agenda leak (toggle_pase's
-- ON path now refuses / no-consumes a class already accounted for by a session row). The REVERSE was still
-- open: a member with a same-day FRONT-DESK check-in (a toggle_pase row: class_session_id IS NULL) who is
-- then marked present in an Agenda class hits pasar_lista_sesion's WALK-IN branch, which consumed a SECOND
-- class with no cross-surface check. Front-desk-then-Agenda = one visit, two consumes.
--
-- Owner ruling for this seam: mark the member present, consumio=false — do NOT consume a second class.
-- (Front desk is currently unused in practice; a deliberate mark-present-in-two-classes feature is a future
-- item, out of scope.) This is the mirror image of 20260710124000's addition (2) "active-reservation
-- no-consume", applied from the Agenda side: the attendance row is still written and the walk-in reservation
-- is still created/updated (asistida/is_walk_in), only the decrement is suppressed. consumio=false ⇒ the
-- TOGGLE-OFF refund is byte-identical to the booked branch — untoggling this mark refunds nothing.
--
-- ONE addition to the WALK-IN branch (everything else is byte-for-byte the live body, 20260706180100:
-- SECURITY INVOKER, search_path='', the advisory-lock serialization, the booked no-consume branch, the
-- walk-in reservation create/reuse, the guarded decrement, the session-date hora stamp — CREATE OR REPLACE
-- keeps the EXECUTE lockdown from 20260706180100:132-134, so anon stays revoked):
--   * C15 mirror — after the walk-in consume is computed, if a non-deleted same-day front-desk asistencia
--     already exists for this member (cliente_id = p_cliente_id and fecha = v_fecha and deleted_at is null
--     and class_session_id is null), the visit was already consumed at the front desk. Override
--     v_consumio := false: present, no second decrement. The BOOKED branch already no-consumes, so the guard
--     lives on the walk-in path only, matching where the reverse (toggle_pase add. 2) sits.

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
    -- C15 mirror (owner ruling): a same-day front-desk check-in (toggle_pase row, class_session_id NULL)
    -- already accounted for this visit's consume. Mark present but do NOT consume a second class — the
    -- reverse of 20260710124000's active-reservation no-consume, applied from the Agenda side. The walk-in
    -- reservation + attendance row below are still written; only the decrement is suppressed. consumio=false
    -- ⇒ the TOGGLE-OFF branch refunds nothing (byte-identical to the booked branch).
    if exists (
      select 1 from public.asistencias
       where cliente_id = p_cliente_id and fecha = v_fecha
         and deleted_at is null and class_session_id is null
    ) then
      v_consumio := false;
    end if;
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
