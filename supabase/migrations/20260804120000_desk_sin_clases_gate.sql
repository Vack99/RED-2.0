-- Desk sin-clases gate (#237 fast-follow; owner ruling 2026-08-04, mirrors the #235 ruling in
-- worktree-reserva-manual-agenda's 2026-08-03-235-HANDOFF.md:49): "Zero balance / expired plan →
-- block, same errors as member path. No staff override, no warn-and-proceed" + "easy access for
-- the sale". The member-facing reservar_clase gate has refused a finite member at 0 classes since
-- 20260729120000 ('Sin clases disponibles', :672-674); the two desk/roster attendance seams did
-- not — a zero-balance walk-in tap quietly recorded the visit free instead. This migration closes
-- that hole on the front desk and the Agenda roster.
--
-- SCOPE: byte-faithful re-emit of toggle_pase (3-arg) and pasar_lista_sesion, replayed forward
-- from their last full bodies (20260729120000_reservation_truthfulness.sql) — nothing between
-- there and 20260804110000 re-emits either function — with exactly ONE semantic change in each,
-- both replacing the same plain charge attempt:
--
--     v_consumio := (v_clases is not null and v_clases > 0);
--
--   becomes
--
--     if v_clases is not null and v_clases <= 0 then
--       raise exception 'Sin clases disponibles';
--     end if;
--     v_consumio := (v_clases is not null);
--
-- 'Sin clases disponibles' is reservar_clase's own wording, verbatim — the desk and the member
-- app now share one string, so the UI's exact string-match (the sale-bridge banner) works
-- identically on both surfaces.
--
-- WHERE, and why the position differs between the two (never the WRITE, only which arm of an
-- existing if/else the substitution lands in):
--   * toggle_pase (the front-desk 2-arg libre path, ~line 563 of 20260729120000): the charge
--     attempt already sat inside the ELSE arm of the cooldown if/else — the cooldown pardon
--     decides first, and only the non-pardoned branch ever attempted a charge. The substitution
--     drops in at that exact spot unchanged: no reordering needed.
--   * pasar_lista_sesion (the Agenda/roster walk-in arm, ~line 272 of 20260729120000): the charge
--     attempt ran BEFORE the cooldown if-check (a plain assignment, later overwritten to false by
--     the pardon). Substituting in place there would raise BEFORE the cooldown ever got a chance
--     to pardon a member whose balance is already 0 from the sibling visit that cooldown forgives
--     — hard-refusing a visit that is already paid for. So here the cooldown if/else is
--     restructured to decide FIRST, and the gate moves into its ELSE arm — the identical shape
--     toggle_pase already had. Same rule, same outcome; only the arm the one-line substitution
--     lands in moved.
--
-- UNTOUCHED, BY DESIGN — every one of these visits is already paid, so gating them would strand a
-- paying member, not refuse a delinquent one:
--   * Ilimitado (v_clases IS NULL) — the `is not null` guard never fires; the #237 gate does not
--     apply to it.
--   * The cooldown-pardon arms in both functions (visita_reciente → consumio=false,
--     perdonada=true) — this row is the second record of ONE arrival already charged by its
--     sibling row.
--   * toggle_pase's BOOKED branch (the in-window attribution delegate, which lands in
--     pasar_lista_sesion's booked branch below) and its CLOSED-WINDOW pardon — the booking
--     already paid at reservar_clase time, or the Terms cap the no-show at the one class the
--     booking already took.
--   * pasar_lista_sesion's BOOKED branch — same reason as toggle_pase's: paid at booking.
--
-- Everything else — the advisory lock and its position, the C9 vigencia gate, the chain-breaker
-- guard, the hora rule, the guarded decrement, the RETURN shape, every comment not called out
-- above — is byte-for-byte 20260729120000. The RETURN TYPE is unchanged from that migration, so
-- DROP + CREATE is not needed; both are re-emitted as CREATE OR REPLACE (same signature, ACL
-- preserved). The EXECUTE lockdown is re-issued anyway for posture parity with 20260729120000 —
-- an idempotent no-op if the grants already hold.

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. pasar_lista_sesion — the Agenda roster's walk-in arm gains the gate; the cooldown decides
--    the pardon FIRST (restructured if/else), so a 0-balance member already inside a pardon is
--    never blocked. Everything else is byte-for-byte 20260729120000.
-- ══════════════════════════════════════════════════════════════════════════════════
create or replace function public.pasar_lista_sesion(p_session_id uuid, p_cliente_id uuid)
 returns table(present boolean, hora text, session_id uuid, clases_restantes int)
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
  v_perdonada boolean := false;   -- (ii) true ONLY on the cooldown pardon
  v_hora     time;
  v_saldo    int;                 -- (i) the balance AFTER the write — the returned one
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
  -- toggle_pase takes. The former per-(cliente, session) key made the two surfaces invisible to each
  -- other's in-flight writes, which the cooldown below cannot tolerate: both would read "no recent
  -- row of the other kind" and both would charge.
  --
  -- It is taken HERE, above the clientes read, because every read the write decision depends on must
  -- sit INSIDE the lock: clases_restantes is what decides v_consumio, so reading it first would decide
  -- on a stale balance — of two concurrent marks at balance 1 both would read 1, the loser would write
  -- consumio = true while its guarded `clases_restantes > 0` decrement matched ZERO rows, and a later
  -- untoggle would then refund a class that was never spent. The class_session and gym reads either
  -- side are of immutable rows and are not part of the decision.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  -- The target cliente, pinned to THIS gym (staff RLS already scopes it; the gym pin is defense-in-depth
  -- so a cross-gym cliente id can never be marked against another gym's session).
  -- (iii) Alias-qualified: the RETURNS TABLE OUT param `clases_restantes` shares the column's name.
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
    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    return query select false, null::text, p_session_id, v_saldo;
    return;
  end if;

  -- ── TOGGLE ON ──────────────────────────────────────────────────────────────────
  v_hora := case when v_fecha = (now() at time zone v_tz)::date then (now() at time zone v_tz)::time else null end;

  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    -- BOOKED member: already consumed at booking. Flip to asistida; DO NOT consume. This is also where
    -- toggle_pase's in-window attribution lands (a reservada booking has no active class row, so the
    -- delegated tap can only arrive HERE — it can never take the untoggle branch above).
    update public.reservation set status = 'asistida', checked_at = now() where id = v_res_id;
    v_consumio := false;
  else
    -- WALK-IN: no active booking. Create (or reuse a terminal) reservation as a walk-in, and consume
    -- exactly like toggle_pase's ON path (finite-only, guarded).
    -- C9 vigencia (inclusive), the WALK-IN branch ONLY — an expired package has no entitlement, so
    -- there is nothing to mark against and nothing to charge. The BOOKED branch above stays exempt, the
    -- same asymmetry toggle_pase has (the booking already paid, and expiring afterwards must not strand
    -- a member at the door of a class they own). Compared against v_fecha — the SESSION's own gym-local
    -- date, not today — so recording a past session the member attended while still valid keeps working;
    -- vence < v_fecha blocks, the vence day itself passes. Nothing has been written at this point, so the
    -- raise leaves the ledger, the reservation and the balance untouched.
    if v_vence is not null and v_vence < v_fecha then
      raise exception 'Paquete vencido';
    end if;
    -- COOLDOWN. p_clase => false: only a recent ACCESO LIBRE row on this session's own fecha
    -- pardons this class mark — the member came through the door and into a class within minutes,
    -- which is ONE arrival, already charged at the desk. A recent row for a DIFFERENT CLASS must
    -- NOT pardon it: two classes attended is two classes spent (R1), which is the unanimous rule of
    -- the market and the reason the deleted mirror was wrong.
    -- (ii) …and THAT is what `perdonada` records: this row is the second record of one arrival, so a
    -- visit count must skip it. Only here — never on the booked branch, never on a closed-window pardon.
    --
    -- (iv) THE CHAIN-BREAKER, and the reason this is not a bare visita_reciente call: A ROW THAT PAID
    -- NOTHING PARDONS NOTHING. toggle_pase's closed-window arm writes a FREE libre row for a member who
    -- missed today's booking — and that row is an active libre row on this fecha, so a bare cooldown
    -- would then hand them a free CLASS as well if the operator marked them within 15 minutes: one
    -- missed booking, two free visits, which is exactly the double-dip the Terms cap at one class.
    -- The guard is the same predicate that granted the pardon (a reservada, non-walk-in booking on this
    -- fecha whose window has CLOSED): if the member is standing in that state, the recent libre row was
    -- necessarily free, so it cannot pardon this class.
    --
    -- "Necessarily" is exact, not approximate, inside the 15-minute horizon: a libre row on a fecha where
    -- such a booking exists could only have been CHARGED if it was written before that window closed —
    -- i.e. pre-window, which is at least 90 + duration + 15 minutes earlier — and the cooldown cannot see
    -- that far back. Within 15 minutes, "such a booking exists" and "the recent libre row was free" are
    -- the same fact.
    if public.visita_reciente(p_cliente_id, v_fecha, false)
       and not exists (
         select 1 from public.reservation r
           join public.class_session cs on cs.id = r.class_session_id
          where r.member_id = p_cliente_id
            and r.status = 'reservada'
            and r.is_walk_in = false
            and (cs.starts_at at time zone v_tz)::date = v_fecha
            and upper(public.ventana_arribo(cs.starts_at, cs.duration_min)) <= now()
       ) then
      v_consumio := false;
      v_perdonada := true;
    else
      -- #237 ZERO-BALANCE GATE (owner ruling 2026-08-04, mirrors #235's member-facing ruling): a
      -- finite member at 0 classes is hard-refused here, same message and posture as
      -- reservar_clase's own gate (20260729120000:672-674) — no staff override, no
      -- warn-and-proceed. Reached ONLY in this ELSE, restructured (vs 20260729120000) so the
      -- cooldown decides FIRST: the pardon above already means this visit's sibling row already
      -- paid, and a paid visit must never be blocked a second time. Ilimitado (NULL) never
      -- reaches the raise — the `is not null` guard short-circuits.
      if v_clases is not null and v_clases <= 0 then
        raise exception 'Sin clases disponibles';
      end if;
      v_consumio := (v_clases is not null);
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
  -- origen = 'clase', the stated kind that pairs with class_session_id (asistencias_origen_kind_ck).
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, class_session_id, reservation_id, origen, perdonada)
  values (p_cliente_id, v_fecha, v_hora, v_consumio, v_gym, p_session_id, v_res_id, 'clase', v_perdonada);

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), p_session_id, v_saldo;
end;
$function$;

revoke execute on function public.pasar_lista_sesion(uuid, uuid) from public, anon;
grant execute on function public.pasar_lista_sesion(uuid, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 2. toggle_pase — the front desk's libre path gains the same gate, in the ELSE arm the
--    cooldown if/else already had (no reordering needed here). Everything else is
--    byte-for-byte 20260729120000.
-- ══════════════════════════════════════════════════════════════════════════════════
create or replace function public.toggle_pase(p_cliente_id uuid, p_fecha date, p_session_id uuid default null)
 returns table(present boolean, hora text, session_id uuid, clases_restantes int)
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
  v_perdonada boolean := false;     -- (v) true ONLY on the cooldown pardon
  v_hora time;
  v_booked uuid;                    -- (ii) the in-window reservada booking this tap attributes to
  v_marcada text;                   -- (iii) HH:MM of an in-window booking ALREADY asistida
  v_saldo int;                      -- (i) the balance AFTER the write — the returned one
begin
  -- DELEGATION. The desk in a class context IS the Agenda roster: one write path, one semantics,
  -- including the reservation flip the front desk never owned (a desk tap on a CON RESERVA member marks
  -- their booking asistida; desk undo reverts it). Duplicating pasar_lista_sesion's body here is exactly
  -- how the two surfaces drifted apart in the first place, so this branch delegates instead of
  -- re-deriving. p_fecha is deliberately IGNORED on this path: the session's own gym-local date governs,
  -- identically to an Agenda mark. Everything below this branch is the ACCESO LIBRE (class-less) path.
  if p_session_id is not null then
    return query select * from public.pasar_lista_sesion(p_session_id, p_cliente_id);
    return;
  end if;

  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- Serialize EVERY attendance write for this member. Keyed on the member ALONE — not (member, day)
  -- and not (member, session): the cooldown decision reads the member's rows of the OTHER kind, so a
  -- desk tap and an Agenda tap must serialize against each other or both read "no recent row" and both
  -- charge. pasar_lista_sesion takes this identical key. The attribution reads below join reservation
  -- and class_session, whose rows this seam never writes — but the DELEGATION it can trigger writes
  -- through the same key, so it must be held before that decision too.
  --
  -- The POSITION is load-bearing, not tidiness: EVERY read the write decision depends on must sit
  -- INSIDE the lock. clases_restantes below is what decides v_consumio, so reading it first would
  -- decide on a stale balance — of two concurrent marks at balance 1 both would read 1, the loser would
  -- write consumio = true while its guarded `clases_restantes > 0` decrement matched ZERO rows, and a
  -- later untoggle would then refund a class that was never spent. pasar_lista_sesion takes the same
  -- key in the same position relative to its own clientes read.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  -- (vi) Alias-qualified: the RETURNS TABLE OUT param `clases_restantes` shares the column's name.
  select c.clases_restantes, c.gym_id, c.vence into v_clases, v_gym, v_vence
    from public.clientes c where c.id = p_cliente_id;   -- RLS-scoped; asistencia inherits the cliente's gym
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Server-authoritative: the gym's own timezone row, never a client-supplied param.
  select timezone into v_tz from public.gym where id = v_gym;

  -- ACCESO LIBRE ROWS ONLY (slice #60): session-linked attendance (class_session_id set) belongs to
  -- pasar_lista_sesion, whose untoggle also reverts the reservation — this seam must never consume it.
  -- asistencias_cliente_fecha_libre_uq (20260728120000) now makes "at most one active row" a database
  -- guarantee; the order/limit is kept so the read behaves identically over pre-#89 rows.
  select id, consumio into v_active_id, v_active_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and fecha = p_fecha and deleted_at is null
     and class_session_id is null
   order by created_at desc
   limit 1;

  if v_active_id is not null then
    -- toggle OFF (see the ORDER NOTE above: this branch stays first — a marked row means undo)
    update public.asistencias set deleted_at = now() where id = v_active_id;
    if v_active_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clientes.clases_restantes + 1 where id = p_cliente_id;
    end if;
    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    return query select false, null::text, null::uuid, v_saldo;
    return;
  end if;

  -- toggle ON

  -- (ii) ATTRIBUTION, ARM-ONLY. The operator taps a member at the desk; the member is booked into a
  -- class whose ARRIVAL WINDOW contains this instant. That tap and an Agenda roster tap are the same
  -- act — so it becomes the same write, by delegation, and the class gets its attendance instead of a
  -- class-less row that leaves the roster reading them absent.
  --
  -- Every filter earns its place:
  --   status = 'reservada'  — ARM-ONLY. An already-asistida booking is handled by (iii) as a NO-OP;
  --                           delegating to a TOGGLE would make this tap an ERASER of a coach's mark.
  --   is_walk_in = false    — a walk-in row is not a booking; delegating onto one would let the desk
  --                           un-charge (or re-toggle) a door visit through a path that reads "free".
  --   cancelled_at is null  — a cancelled class attributes nothing; that member's pardon arm is (iv).
  --   date = p_fecha        — the cooldown's own equality, for the same reason: a BACKDATED desk entry
  --                           (last Tuesday's door check, typed now) must never attribute to today's
  --                           class merely because now() sits in its window.
  --   window @> now()       — the whole point. PRE-window (>90 min early) matches nothing here and
  --                           falls through to the walk-in path, which CHARGES: that is a separate
  --                           visit. CLOSED-window falls through to the pardon in (iv).
  -- The tie-break is the desk pill's own metric (abs distance to starts_at, marcadas.ts sesionCercana),
  -- so on a double-booked member the screen and the server RANK the candidates identically. The two
  -- intervals are not identical, though — see the header: they share the open edge and diverge at the
  -- close, always in the direction of "no attribution" rather than "the wrong one".
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

  if v_booked is not null then
    -- reservada ⇒ no active class row for it ⇒ this lands in pasar_lista_sesion's BOOKED branch:
    -- asistida, consumio = false, nothing charged. Arm-only holds by construction, not by a flag.
    return query select * from public.pasar_lista_sesion(v_booked, p_cliente_id);
    return;
  end if;

  -- (iii) ALREADY MARKED — the NO-OP, attribution's second half. The nearest in-window booking is
  -- already asistida (a coach marked it on the roster, or this desk did a minute ago). Do NOT undo it,
  -- do NOT charge a class-less row alongside it: raise, write nothing, and let the desk show the
  -- message in its warning toast and roll the optimistic flip back. Undo lives only in the context that
  -- owns the mark (the class pill, the roster, the Agenda) — one act, one owner.
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
  if v_marcada is not null then
    raise exception 'Ya marcada en la clase de %', v_marcada;
  end if;

  -- (iv) CLOSED-WINDOW PARDON, where the C15 day-keyed branch stood and for the half of it that was
  -- right: the member had a booking today whose window has CLOSED — they missed the class (or the gym
  -- cancelled it) and are now at the door. The published Terms cap that at ONE class ("la clase se
  -- descuenta", singular), and the booking already took it, so this visit is recorded free.
  -- consumio=false ⇒ toggle-OFF refunds nothing; the reservation is untouched (that flip is
  -- pasar_lista_sesion's seam, not the front desk's). `perdonada` is normally FALSE here — a missed-class
  -- door visit is a real second visit that happens to be free, and it must still COUNT — but free and
  -- duplicate are independent facts and one row can carry both; see the stamp inside the branch.
  --
  -- Cancelled sessions are deliberately NOT excluded here (unlike the attribution above): a
  -- gym-cancelled booking strands its consumed credit with no refund path today, and this pardon is the
  -- accidental compensation we keep until that is decided (#172).
  --
  -- It sits ABOVE the C9 vence gate, exactly where C15 sat: a member whose package lapsed while holding
  -- today's booking is admitted today. 24 of 52 live clientes are expired-with-balance; moving the gate
  -- above this branch would turn an admission into a door refusal for all of them.
  if exists (
    select 1 from public.reservation r
      join public.class_session cs on cs.id = r.class_session_id
     where r.member_id = p_cliente_id
       and r.status = 'reservada'
       and r.is_walk_in = false
       and (cs.starts_at at time zone v_tz)::date = p_fecha
       and upper(public.ventana_arribo(cs.starts_at, cs.duration_min)) <= now()
  ) then
    v_consumio := false;
    -- FREE and DUPLICATE are two different facts, and this row can carry both. The pardon above decides
    -- the money; the cooldown still decides whether this row is the SECOND RECORD of one arrival — which
    -- it is, at a dual-surface gym, whenever the member was already marked into a class minutes ago
    -- (door check-in AND class rosters is the normal LatAm shape, the whole reason perdonada ships).
    -- Without this line both rows read perdonada=false and one arrival counts as two visits. The row
    -- stays free either way: this only stamps the fact, it never changes v_consumio.
    v_perdonada := public.visita_reciente(p_cliente_id, p_fecha, true);
  else
    -- WALK-IN path: no booking paid for this visit. This is also where a PRE-window booked member lands
    -- (>90 minutes early) — by design: they came for something other than the class they booked, and
    -- the second visit charges.
    -- C9 vigencia (inclusive): an expired package has no entitlement — block the walk-in mark. vence
    -- < p_fecha blocks; the vence day itself (vence = p_fecha) still passes.
    if v_vence is not null and v_vence < p_fecha then
      raise exception 'Paquete vencido';
    end if;
    -- COOLDOWN. p_clase => true: only a recent CLASS row on this same fecha pardons this
    -- class-less mark — the member walked through the door minutes either side of a class that was
    -- already charged, which is ONE arrival. Beyond 15 minutes this is a genuinely separate visit
    -- and R1 charges for it.
    -- (v) `perdonada` records precisely that: second record, one arrival — the row a visit count skips.
    if public.visita_reciente(p_cliente_id, p_fecha, true) then
      v_consumio := false;
      v_perdonada := true;
    else
      -- #237 ZERO-BALANCE GATE (owner ruling 2026-08-04, mirrors #235's member-facing ruling): a
      -- finite member at 0 classes is hard-refused here, same message and posture as
      -- reservar_clase's own gate (20260729120000:672-674) — no staff override, no
      -- warn-and-proceed. Reached ONLY in this ELSE, exactly where the plain charge attempt already
      -- sat: the cooldown pardon above already means this visit's sibling row already paid, and a
      -- paid visit must never be blocked a second time. Ilimitado (NULL) never reaches the raise —
      -- the `is not null` guard short-circuits.
      if v_clases is not null and v_clases <= 0 then
        raise exception 'Sin clases disponibles';
      end if;
      v_consumio := (v_clases is not null);
    end if;
  end if;

  v_hora := case
    when p_fecha = (now() at time zone v_tz)::date
      then (now() at time zone v_tz)::time
    else null
  end;

  -- origen = 'libre': a STATED ACCESO LIBRE visit, not a row whose class is unknown.
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, origen, perdonada)
  values (p_cliente_id, p_fecha, v_hora, v_consumio, v_gym, 'libre', v_perdonada);

  if v_consumio then
    update public.clientes set clases_restantes = clientes.clases_restantes - 1
     where id = p_cliente_id and clientes.clases_restantes > 0;   -- guarded decrement
  end if;

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), null::uuid, v_saldo;
end;
$function$;

revoke execute on function public.toggle_pase(uuid, date, uuid) from public, anon;
grant execute on function public.toggle_pase(uuid, date, uuid) to authenticated;
