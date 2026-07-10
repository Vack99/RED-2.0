-- C15 + C9 — one visit = one consume across BOTH admin attendance surfaces, + inclusive vigencia.
--
-- Ruling C15 (owner): a member who attends one class consumes exactly one class, no matter WHICH admin
-- surface marks them. Today the two surfaces are blind to each other: getMarcadas (the front-desk pase
-- map) filtered OUT session-linked rows, so an app-booked or Agenda-marked member rendered UNMARKED on
-- the front desk; the operator taps them present → toggle_pase (scoped class_session_id IS NULL) inserts
-- a SECOND consuming row. One visit, two classes charged. The paired getMarcadas change surfaces the
-- session row (the member now shows checked), and this migration teaches toggle_pase's ON path to refuse
-- / not-re-consume the three ways a class can already be accounted for.
--
-- Ruling C9 additionally gives attendance the inclusive vigencia check the RPC never had: an expired
-- package (vence < the pase date) has no entitlement — a WALK-IN mark is refused. The vence day itself is
-- still valid (inclusive; vence = p_fecha passes), matching reservar_clase's booking gate and
-- derivarEstado's sin_clases.
--
-- THREE additions to the TOGGLE-ON path (everything else is byte-for-byte the live body, 20260706180200:
-- SECURITY INVOKER, search_path='', the front-desk-rows-only active lookup, the guarded decrement, the
-- gym-derived hora stamp — CREATE OR REPLACE keeps grants):
--   (1) C15 mistap guard — a non-deleted asistencia for (cliente, p_fecha) with class_session_id SET means
--       the member was already marked on a session surface (Agenda / pasar_lista_sesion). getMarcadas now
--       shows that row, so a tap reaching this branch is a mistap: refuse instead of writing a second
--       consuming front-desk row. 'Asistencia de clase ya registrada — gestiónala en la clase'.
--   (2) C15 active-reservation no-consume — a still-active (reservada) booking on a session whose gym-local
--       date is p_fecha already consumed at booking (reservar_clase). Mark present with consumio=false and
--       NO decrement — byte-identical outcome to pasar_lista_sesion's booked branch, so both surfaces
--       agree. The front desk owns ONLY its own row (class_session_id NULL) and never flips the reservation
--       (that stays pasar_lista_sesion's seam); consumio=false ⇒ the toggle-OFF refund above returns nothing.
--   (3) C9 vigencia — WALK-IN path only. An expired package blocks a walk-in mark ('Paquete vencido').
--       A BOOKED member (add. 2) is deliberately EXEMPT: they paid a class while their vigencia was valid,
--       and pasar_lista_sesion marks that same booking with no vigencia gate — gating the front desk alone
--       would reintroduce the very cross-surface divergence C15 exists to kill. So vigencia lives on the
--       walk-in branch, where C9 actually matters (someone off the street on a dead package).
--
-- The gym-local reservation-date match — (cs.starts_at at time zone v_tz)::date = p_fecha — is the exact
-- pattern pasar_lista_sesion uses for its own hora stamp (v_fecha := (v_starts at time zone v_tz)::date):
-- starts_at is timestamptz, "at time zone v_tz" renders the gym wall-clock, ::date is that gym calendar day.

create or replace function public.toggle_pase(p_cliente_id uuid, p_fecha date)
 returns table(present boolean, hora text)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_gym uuid;
  v_tz text;
  v_vence date;                     -- C9: the cliente's stacked expiry (NULL = no expiry)
  v_active_id uuid;
  v_active_consumio boolean;
  v_consumio boolean;
  v_hora time;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select clases_restantes, gym_id, vence into v_clases, v_gym, v_vence
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

  -- (1) C15 mistap guard: already marked TODAY on a session surface (class_session_id-linked row, written
  -- by pasar_lista_sesion). getMarcadas now surfaces it, so the member already shows checked here — a tap
  -- that reached this branch is a mistap. Refuse rather than write a SECOND consuming front-desk row.
  if exists (
    select 1 from public.asistencias
     where cliente_id = p_cliente_id and fecha = p_fecha
       and deleted_at is null and class_session_id is not null
  ) then
    raise exception 'Asistencia de clase ya registrada — gestiónala en la clase';
  end if;

  -- (2) C15 active-reservation: a class booked ahead already consumed at booking (reservar_clase). If this
  -- member holds a reservada booking on a session whose gym-local date is p_fecha, marking present must NOT
  -- consume again — same outcome as pasar_lista_sesion's booked branch. consumio=false ⇒ toggle-OFF refunds
  -- nothing; the reservation itself is untouched (that flip is pasar_lista_sesion's seam, not the front desk).
  if exists (
    select 1 from public.reservation r
      join public.class_session cs on cs.id = r.class_session_id
     where r.member_id = p_cliente_id
       and r.status = 'reservada'
       and (cs.starts_at at time zone v_tz)::date = p_fecha
  ) then
    v_consumio := false;
  else
    -- WALK-IN path: no booking paid for this class.
    -- (3) C9 vigencia (inclusive): an expired package has no entitlement — block the walk-in mark. vence
    -- < p_fecha blocks; the vence day itself (vence = p_fecha) still passes. A booked member is exempt above.
    if v_vence is not null and v_vence < p_fecha then
      raise exception 'Paquete vencido';
    end if;
    v_consumio := (v_clases is not null and v_clases > 0);
  end if;

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
