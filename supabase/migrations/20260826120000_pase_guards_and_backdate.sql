-- Three attendance-write defects from the 2026-08-26 "clases restantes" drift audit
-- (docs/audits — the ledgerless 8-writer counter). All three live in the two pase RPCs, so they
-- ship in one migration; both functions are replayed forward from 20260804150000 with the changes
-- marked (a) (b) (c) inline and NOTHING else touched.
--
--   (a) THE GUARDED DECREMENT NEVER CHECKED ITS OWN RESULT. Both bodies end their walk-in charge
--       with `update … set clases_restantes = clases_restantes - 1 where id = … and
--       clases_restantes > 0`. The `> 0` guard stops the balance going negative, but when it
--       matches ZERO rows the function carried on and wrote `consumio = true` on the asistencia
--       anyway — an attendance row that claims to have paid for a class nobody paid for. A later
--       untoggle then REFUNDS it (`if v_asis_consumio … + 1`), minting a credit out of a race.
--       The advisory lock above makes that race narrow, not impossible: the balance can also be
--       moved between the read and the write by any of the other seven writers of this column
--       (eliminar_venta's clawback, editar_venta's re-derive, reservar_clase's hold), none of
--       which take the `pase:` key. `reservar_clase` has checked its own decrement since
--       20260710123000; these two now do the same, with the same message.
--
--   (b) toggle_pase ACCEPTED ANY p_fecha. The front desk's date-keyed Pasar lista took whatever
--       date the client sent — a fat-fingered year, a future day — and wrote (and charged) a visit
--       on it. registrar_venta has clamped its own back-dating to [today-30, today] since
--       20260714110000; the attendance seam is clamped the same way and in the same style. It sits
--       BELOW the untoggle branch on purpose: an out-of-range row written before this migration
--       must stay UNDO-able, and an undo settles nothing, so the clamp binds only the write.
--
--   (c) A BACK-ENTERED VISIT CHARGED ON TOP OF THE BOOKING THAT ALREADY PAID FOR IT. toggle_pase's
--       attribution lookup requires `ventana_arribo(...) @> now()` — an ARRIVAL WINDOW around the
--       class's own start. For any p_fecha before today that predicate is unsatisfiable by
--       construction, so a visit typed in the next morning could never attribute to the booking the
--       member actually held: it fell through to the walk-in path and spent a SECOND class on top
--       of the hold reservar_clase had already taken. (The forfeit ruling — #233/#245, a missed
--       booking's hold is forfeited and the door visit pays for itself — is about a member who
--       ARRIVED at the door instead of the class. This is the same arrival recorded late, which is
--       a data-entry delay, not a second visit.)
--
--       The fix keys on p_fecha, not on the clock: for TODAY the window check stands exactly as it
--       was (that is what makes "in-window" mean anything while the desk is live); for a PAST date
--       the member's booking on that date is matched WITHOUT the window, and only when there is
--       EXACTLY ONE such booking. Zero or several → v_booked stays null and the body falls through
--       unchanged, because an operator's back-entry carries no evidence of WHICH of two classes the
--       member attended, and guessing would be worse than the walk-in charge. Every other filter
--       (reservada, non-walk-in, non-cancelled) is kept verbatim: those are about what a booking IS,
--       and they do not weaken with age. (b) guarantees p_fecha is never in the future here, so the
--       two arms are exhaustive.
--
--       BOTH attribution lookups split, not just the first. The 'Ya marcada' no-op below is the same
--       rule seen from the other side — it asks whether the member's booking that day is ALREADY
--       captured — so it drops the window on a past date too. Leaving it window-keyed would have
--       reopened this exact double charge one tap later: the reservada arm stops matching the moment
--       the hold is captured, so a second past-date tap (or one after a coach marked the roster)
--       would match neither arm and land on the walk-in path that charges.
--
-- Both are CREATE OR REPLACE at their EXISTING signatures — no DROP, so the ADR-0005 EXECUTE
-- grants carry untouched.

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. pasar_lista_sesion — (a) only. This seam has no p_fecha: its date is the SESSION's own.
-- ══════════════════════════════════════════════════════════════════════════════════
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
-- 2. toggle_pase — (a) the read guard, (b) the p_fecha clamp, (c) back-dated re-attribution.
-- ══════════════════════════════════════════════════════════════════════════════════
create or replace function public.toggle_pase(p_cliente_id uuid, p_fecha date, p_session_id uuid default null)
 returns table(present boolean, hora text, session_id uuid, clases_restantes int, resultado text)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_gym uuid;
  v_tz text;
  v_hoy date;                       -- (b)/(c) the gym's own today — the clamp's and the arm split's axis
  v_vence date;                     -- C9: the cliente's stacked expiry (NULL = no expiry)
  v_active_id uuid;
  v_active_consumio boolean;
  v_consumio boolean;
  v_perdonada boolean := false;     -- true ONLY on the cooldown pardon
  v_hora time;
  v_booked uuid;                    -- the reservada booking this tap attributes to
  v_marcada text;                   -- HH:MM of an in-window booking ALREADY asistida
  v_saldo int;                      -- the balance AFTER the write — the returned one
  v_resultado text;                 -- the settlement outcome disclosed to the operator (#233)
begin
  -- DELEGATION. The desk in a class context IS the Agenda roster: one write path, one semantics.
  -- p_fecha is deliberately IGNORED on this path (and therefore NOT clamped): the session's own
  -- gym-local date governs, identically to an Agenda mark. Everything below is the ACCESO LIBRE path.
  if p_session_id is not null then
    return query select * from public.pasar_lista_sesion(p_session_id, p_cliente_id);
    return;
  end if;

  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- Serialize EVERY attendance write for this member. Keyed on the member ALONE, and taken before
  -- any read the write decision depends on. pasar_lista_sesion takes this identical key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  select c.clases_restantes, c.gym_id, c.vence into v_clases, v_gym, v_vence
    from public.clientes c where c.id = p_cliente_id;   -- RLS-scoped; asistencia inherits the cliente's gym
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Server-authoritative: the gym's own timezone row, never a client-supplied param.
  select timezone into v_tz from public.gym where id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;

  -- ACCESO LIBRE ROWS ONLY (slice #60): session-linked attendance belongs to pasar_lista_sesion,
  -- whose untoggle also reverts the reservation — this seam must never consume it.
  select id, consumio into v_active_id, v_active_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and fecha = p_fecha and deleted_at is null
     and class_session_id is null
   order by created_at desc
   limit 1;

  if v_active_id is not null then
    -- toggle OFF (this branch stays FIRST — a marked row means undo, and it is deliberately ABOVE
    -- the (b) clamp so a row written before this migration on an out-of-range date stays undoable).
    update public.asistencias set deleted_at = now() where id = v_active_id;
    if v_active_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clientes.clases_restantes + 1 where id = p_cliente_id;
    end if;
    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    -- resultado is NULL on every un-mark: an undo settles nothing, so it discloses nothing.
    return query select false, null::text, null::uuid, v_saldo, null::text;
    return;
  end if;

  -- toggle ON

  -- (b) THE p_fecha CLAMP, in registrar_venta's shape (20260714110000): a visit cannot be recorded
  -- on a day that has not happened, and back-entry stops at 30 days — the same window the money path
  -- allows for a late-entered sale. Nothing has been written at this point, so both raises leave the
  -- ledger and the balance untouched. Everything below may now assume p_fecha <= v_hoy.
  if p_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura';
  end if;
  if p_fecha < v_hoy - 30 then
    raise exception 'La fecha no puede tener más de 30 días de antigüedad';
  end if;

  -- ATTRIBUTION, ARM-ONLY. The operator taps a member at the desk; the member holds a booking for a
  -- class on p_fecha. That tap and an Agenda roster tap are the same act — so it becomes the same
  -- write, by delegation, and the class gets its attendance instead of a class-less row that leaves
  -- the roster reading them absent AND charges a second time for one arrival.
  --
  -- Every filter earns its place, and all but the window are shared by both arms:
  --   status = 'reservada'  — ARM-ONLY. An already-asistida booking is the NO-OP below; delegating
  --                           to a TOGGLE would make this tap an ERASER of a coach's mark.
  --   is_walk_in = false    — a walk-in row is not a booking; delegating onto one would let the desk
  --                           un-charge (or re-toggle) a door visit through a path that reads "free".
  --   cancelled_at is null  — a cancelled class attributes nothing; since #233 it also has nothing
  --                           left to compensate (cancel_class_session releases every hold on the spot).
  --   date = p_fecha        — the visit being recorded and the class must be the same DAY.
  if p_fecha = v_hoy then
    -- TODAY: unchanged. now() is a meaningful instant on this date, so the ARRIVAL WINDOW decides.
    -- PRE-window (>90 min early) matches nothing and falls through to the walk-in path, which
    -- CHARGES: that is a separate visit. CLOSED-window also falls through — the missed booking's
    -- hold is forfeited (#233/#245). The tie-break is the desk pill's own metric (abs distance to
    -- starts_at, marcadas.ts sesionCercana), so screen and server RANK candidates identically.
    select cs.id into v_booked
      from public.reservation r
      join public.class_session cs on cs.id = r.class_session_id
     where r.member_id = p_cliente_id
       and r.status = 'reservada'
       and r.is_walk_in = false
       and cs.cancelled_at is null
       and (cs.starts_at at time zone v_tz)::date = p_fecha
       and public.ventana_arribo(cs.starts_at, cs.duration_min) @> now()
     order by abs(extract(epoch from (cs.starts_at - now()))) asc
     limit 1;
  else
    -- (c) A PAST DAY: no window, because there is no live arrival to be near — now() sits outside
    -- EVERY window on that date by construction, which is exactly why a back-entered visit used to
    -- charge a second class on top of the hold its own booking had already taken. The window is
    -- replaced by UNAMBIGUITY: exactly one booking on that date, or nothing. `count(*) over ()`
    -- makes that one read — two candidates select no row at all, so v_booked stays null and the
    -- body falls through to the walk-in path unchanged (an operator's back-entry carries no
    -- evidence of which class the member attended, and guessing would be worse than charging).
    select b.id into v_booked
      from (
        select cs.id, count(*) over () as n
          from public.reservation r
          join public.class_session cs on cs.id = r.class_session_id
         where r.member_id = p_cliente_id
           and r.status = 'reservada'
           and r.is_walk_in = false
           and cs.cancelled_at is null
           and (cs.starts_at at time zone v_tz)::date = p_fecha
      ) b
     where b.n = 1;
  end if;

  if v_booked is not null then
    -- reservada ⇒ no active class row for it ⇒ this lands in pasar_lista_sesion's BOOKED branch:
    -- asistida, consumio = false, nothing charged, resultado 'reserva' (the hold is CAPTURED).
    return query select * from public.pasar_lista_sesion(v_booked, p_cliente_id);
    return;
  end if;

  -- ALREADY MARKED — the NO-OP, attribution's second half. The booking is already asistida (a coach
  -- marked it on the roster, or this desk did a minute ago). Do NOT undo it, do NOT charge a
  -- class-less row alongside it: raise, write nothing. Undo lives only in the context that owns the
  -- mark.
  --
  -- (c) IT SPLITS ON p_fecha THE SAME WAY THE ATTRIBUTION ABOVE DOES, and it has to. Leaving the
  -- window on the past arm reopened the very double charge (c) exists to close, one tap later: the
  -- attribution arm only matches a booking that is still `reservada`, so once it has been captured —
  -- a second desk tap, or a coach who marked the roster first — a past-date tap matched NEITHER arm
  -- and fell through to the walk-in path, charging a second class on top of the hold it had already
  -- captured. The two arms are the two halves of one rule and must agree about which bookings are
  -- visible on a past date.
  --
  -- No `count(*) over () = 1` here, unlike the reservada arm: this arm WRITES NOTHING, so ambiguity
  -- is not a risk it has to resolve — ANY asistida booking that day already accounts for the
  -- member's arrival, and raising is the outcome that touches no rows. Ordered by starts_at rather
  -- than by distance to now(), which means nothing on a day that is over; the message names an hora,
  -- and the earliest is the stable pick.
  if p_fecha = v_hoy then
    select to_char(cs.starts_at at time zone v_tz, 'HH24:MI') into v_marcada
      from public.reservation r
      join public.class_session cs on cs.id = r.class_session_id
     where r.member_id = p_cliente_id
       and r.status = 'asistida'
       and r.is_walk_in = false
       and cs.cancelled_at is null
       and (cs.starts_at at time zone v_tz)::date = p_fecha
       and public.ventana_arribo(cs.starts_at, cs.duration_min) @> now()
     order by abs(extract(epoch from (cs.starts_at - now()))) asc
     limit 1;
  else
    select to_char(cs.starts_at at time zone v_tz, 'HH24:MI') into v_marcada
      from public.reservation r
      join public.class_session cs on cs.id = r.class_session_id
     where r.member_id = p_cliente_id
       and r.status = 'asistida'
       and r.is_walk_in = false
       and cs.cancelled_at is null
       and (cs.starts_at at time zone v_tz)::date = p_fecha
     order by cs.starts_at asc
     limit 1;
  end if;
  if v_marcada is not null then
    raise exception 'Ya marcada en la clase de %', v_marcada;
  end if;

  -- WALK-IN path: no booking paid for this visit. This is also where a PRE-window booked member
  -- lands (>90 minutes early), and where a member who missed today's booking lands (#233's forfeit).
  -- C9 vigencia (inclusive): vence < p_fecha blocks; the vence day itself still passes.
  if v_vence is not null and v_vence < p_fecha then
    raise exception 'Paquete vencido';
  end if;
  -- COOLDOWN. p_clase => true: only a recent CLASS row on this same fecha pardons this class-less
  -- mark — one arrival, already charged. Beyond 15 minutes this is a genuinely separate visit.
  if public.visita_reciente(p_cliente_id, p_fecha, true) then
    v_consumio := false;
    v_perdonada := true;
    v_resultado := 'gratis';   -- admitted, nothing charged: the second record of one arrival.
  else
    -- #237 ZERO-BALANCE GATE: a finite member at 0 classes is hard-refused, same message and posture
    -- as reservar_clase's own gate. Ilimitado (NULL) never reaches the raise.
    if v_clases is not null and v_clases <= 0 then
      raise exception 'Sin clases disponibles';
    end if;
    v_consumio := (v_clases is not null);
    v_resultado := case when v_consumio then 'descontada' else 'gratis' end;
  end if;

  v_hora := case
    when p_fecha = v_hoy
      then (now() at time zone v_tz)::time
    else null
  end;

  -- origen = 'libre': a STATED ACCESO LIBRE visit, not a row whose class is unknown.
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, origen, perdonada)
  values (p_cliente_id, p_fecha, v_hora, v_consumio, v_gym, 'libre', v_perdonada);

  if v_consumio then
    update public.clientes set clases_restantes = clientes.clases_restantes - 1
     where id = p_cliente_id and clientes.clases_restantes > 0;   -- guarded decrement
    -- (a) …AND THE GUARD IS NOW READ — see pasar_lista_sesion above for the full reasoning. The
    -- asistencia inserted three lines up is rolled back with the raise: an RPC call is one statement.
    if not found then
      raise exception 'Sin clases disponibles';
    end if;
  end if;

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), null::uuid, v_saldo, v_resultado;
end;
$function$;
