-- Slice #60 follow-up (Gate-2 fix): toggle_pase owns ONLY front-desk attendance rows.
--
-- WHY — the previous migration made asistencias carry session-linked rows (class_session_id /
-- reservation_id set, written by pasar_lista_sesion). Those rows have fecha = the session's date, so
-- the date-keyed active-row lookup here could FIND one: front-desk staff untoggling that cliente's
-- date would soft-delete the SESSION pase and refund the walk-in consume WITHOUT reverting its
-- reservation — leaving an asistida/is_walk_in reservation with no attendance and a refunded balance,
-- whose next Agenda pase takes the booked branch (consumio=false): a free attended class that also
-- inflates derived occupancy. That is exactly the stored-balance/attendance drift ADR-0004 forbids.
--
-- THE FIX — one clause: the active-row lookup adds `and class_session_id is null`. The seam ownership
-- rule this encodes: the front desk (date-keyed toggle_pase) owns front-desk rows (class_session_id
-- NULL — its own INSERT below never sets the column); the Agenda (session-keyed pasar_lista_sesion)
-- owns session-linked rows, whose toggle/untoggle carries the reservation transition the front desk
-- knows nothing about. Each seam reverses only what it wrote (proven by the cross-seam rule in
-- supabase/tests/pasar_lista_sesion_rules.sql). Everything else is byte-for-byte the live body
-- (contract-B version, 20260705082018) — CREATE OR REPLACE keeps grants; SECURITY INVOKER +
-- search_path='' posture unchanged.
--
-- DECIDED (recorded per Gate 2): session pases DO keep appearing in the read-only today feeds
-- (getAsistenciasHoy on inicio) — an attendance is an attendance, whichever seam wrote it. The one
-- read that must NOT see them is the front-desk pase screen's presence map (getMarcadas), because
-- that map drives THIS toggle: it filters class_session_id IS NULL in the DAL, keeping display and
-- toggle on the same row set.

CREATE OR REPLACE FUNCTION public.toggle_pase(p_cliente_id uuid, p_fecha date)
 RETURNS TABLE(present boolean, hora text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_gym uuid;
  v_tz text;
  v_active_id uuid;
  v_active_consumio boolean;
  v_consumio boolean;
  v_hora time;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select clases_restantes, gym_id into v_clases, v_gym
    from public.clientes where id = p_cliente_id;   -- RLS-scoped; asistencia inherits the cliente's gym
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Server-authoritative: the gym's own timezone row, never a client-supplied param.
  select timezone into v_tz from public.gym where id = v_gym;

  -- FRONT-DESK ROWS ONLY (slice #60): session-linked attendance (class_session_id set) belongs to
  -- pasar_lista_sesion, whose untoggle also reverts the reservation — this seam must never consume it.
  select id, consumio into v_active_id, v_active_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and fecha = p_fecha and deleted_at is null
     and class_session_id is null
   order by created_at desc
   limit 1;

  if v_active_id is not null then
    -- toggle OFF
    update public.asistencias set deleted_at = now() where id = v_active_id;
    if v_active_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clases_restantes + 1 where id = p_cliente_id;
    end if;
    return query select false, null::text;
    return;
  end if;

  -- toggle ON
  v_consumio := (v_clases is not null and v_clases > 0);
  v_hora := case
    when p_fecha = (now() at time zone v_tz)::date
      then (now() at time zone v_tz)::time
    else null
  end;

  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id)
  values (p_cliente_id, p_fecha, v_hora, v_consumio, v_gym);

  if v_consumio then
    update public.clientes set clases_restantes = clases_restantes - 1
     where id = p_cliente_id and clases_restantes > 0;   -- guarded decrement
  end if;

  return query select true, to_char(v_hora, 'HH24:MI');
end;
$function$;
