-- RECOVERED 2026-08-27 from prod supabase_migrations.schema_migrations after the registrar_venta overload outage — the file was never committed to this repo.
-- Applied to prod 2026-08-25 from the mobile lane as version 20260825151534 (fijar_asistencia_idempotente); body verified byte-identical to the applied statements (whitespace-normalized md5).

-- mobile-05 (#293, spec #291, map #280) — `fijar_asistencia`: the IDEMPOTENT, SET-STATE check-in.
--
-- WHY THIS EXISTS. supabase-js ≥2.102 auto-retries a POST on a transient/network error, by default,
-- with no opt-out on the RPC call itself. Both existing check-in seams are TOGGLES: given an active
-- attendance row they SOFT-DELETE it and REFUND the class (toggle_pase's ON/OFF branch, mirrored in
-- pasar_lista_sesion). So a request that COMMITS and then loses its response is replayed by the
-- library, and the replay does not repeat the check-in — it UNDOES it, hands the member a class back,
-- and leaves the roster reading them absent. That is live on the shipped web admin today
-- (docs/mobile/CROSS-EXAM-RULINGS.md, ranked finding 1). A phone on Mexican LTE will meet it far more
-- often than a desk on wifi, which is why the mobile lane cannot ship onto the toggles.
--
-- The fix is not a retry-suppression flag; it is a contract that has no wrong answer to repeat. This
-- RPC takes the DESIRED OUTCOME and converges on it:
--
--     "member M should be PRESENT (or ABSENT) in context C, and this arrival is/is not forgiven"
--
-- Calling it twice with identical arguments yields identical rows, an identical balance and an
-- identical return value, because the second call finds the stated outcome already true and WRITES
-- NOTHING AT ALL. There is no flip to replay, no second decrement, no refund.
--
-- THE THREE THINGS THAT MAKE IT IDEMPOTENT, none of which is "check a request id":
--
--   1. STATE, NOT VERB. Every branch is chosen by comparing the CURRENT row state against the STATED
--      one. `p_presente = true` + an active row already there = a no-op that reports the stored row's
--      own facts. `p_presente = false` + no active row = a no-op too. Only a genuine gap writes.
--
--   2. THE FORGIVENESS DECISION IS AN ARGUMENT, NOT A DERIVATION. `visita_reciente` — the 15-minute
--      cooldown the toggles call inline — is deliberately NOT called here. It is a function of now(),
--      so re-deriving it at replay time is exactly the bug this RPC exists to end: a first attempt
--      that rolls back inside the window and a retry that lands outside it would settle the SAME
--      arrival two different ways (free, then charged). The caller decides once, states it in
--      `p_perdonada`, and every replay of that call carries the same decision. Reading the cooldown is
--      the caller's job (`visita_reciente` is already granted to `authenticated`); honouring whatever
--      it decided, verbatim and forever, is this function's.
--
--   3. THE CONTEXT IS STATED, NOT GUESSED. `p_session_id` names the class (NULL = ACCESO LIBRE), and
--      that is the whole of it. toggle_pase's desk auto-attribution — "find the member's booking whose
--      arrival window contains now(), and delegate onto it" — is NOT ported, on purpose: it is a
--      second now()-dependent decision, so a replay minutes later can attribute the same tap to a
--      different context (or to none), which would defeat (1) and (2) however carefully they are
--      written. The caller already renders the class pills; it says which one it meant.
--
-- WHAT IS BYTE-FOR-BYTE THE SIBLINGS, because the money rules are not being re-litigated here: the
-- per-member advisory lock and its position above the balance read; the gym-scoped cliente pin; the C9
-- vigencia gate judged on the CONTEXT's own date; the #237 zero-balance refusal; the finite-only
-- guarded decrement; the ilimitado NULL that is never touched; the booked-branch capture
-- (reservada→asistida, consumio=false); the walk-in reservation create/reuse; the symmetric un-mark
-- (walk-in→cancelada, real booking→reservada) and its refund; `origen`/`perdonada`/`resultado`; and
-- #166's session-instant attribution — `fecha` AND `hora` come from `starts_at` in the gym's timezone
-- whenever a session is named, so marking a past day's roster still records the class's own instant
-- and settles against the package that was valid THEN. Backfill stays correct.
--
-- ONE DELIBERATE DIVERGENCE from pasar_lista_sesion, named so it is not read as a slip: the BOOKED
-- branch here also requires `is_walk_in = false`. pasar_lista_sesion enters its booked (free) branch on
-- any reservation whose status is reservada/asistida, including a walk-in row — which is not a hold
-- that paid, it is the artifact of an earlier door mark. toggle_pase's own attribution query already
-- filters exactly this way, for exactly this reason ("a walk-in row is not a booking; delegating onto
-- one would let the desk un-charge … a door visit through a path that reads free", 20260804150000).
-- Without the filter the no-op branch below could not re-derive `resultado` from the stored rows
-- either, since 'reserva' and 'gratis' would stop being distinguishable.
--
-- THE TOGGLES ARE UNTOUCHED. `toggle_pase` and `pasar_lista_sesion` keep their exact current bodies,
-- grants and signatures; the web admin's behaviour does not change by one row in this migration. This
-- is a NEW seam beside them (#293 AC "existing toggle RPCs untouched"), and the web lane's own
-- migration onto it is a separate decision.
--
-- SECURITY INVOKER + `set search_path to ''` + `revoke … from public, anon` / `grant … to
-- authenticated` — the identical posture of both siblings and of ADR-0005's money path, chosen and not
-- inherited. INVOKER is what makes RLS the tenant boundary for this write: the cliente read, the
-- class_session read and the asistencias/reservation writes are all scoped by the caller's own
-- policies, so an operator of gym A physically cannot reach gym B's rows through it. A DEFINER here
-- would bypass those policies and make `p_cliente_id` a cross-tenant handle guarded by nothing but the
-- gym pin — the #212 defect class, re-introduced on a write path. Nothing in the body needs elevated
-- privilege: every table it touches is one the calling operator may already write.
--
-- Idempotent + forward-only + re-runnable (drop-if-exists before create), so it is safe on a fresh
-- scratch, on the local docker stack, and out of order on live.

drop function if exists public.fijar_asistencia(uuid, boolean, uuid, date, boolean);

create function public.fijar_asistencia(
  p_cliente_id uuid,
  p_presente   boolean,
  p_session_id uuid    default null,
  p_fecha      date    default null,
  p_perdonada  boolean default false
)
 returns table(present boolean, hora text, session_id uuid, clases_restantes int, resultado text)
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_gym    uuid;
  v_tz     text;
  v_starts timestamptz;
  v_fecha  date;                  -- the CONTEXT's gym-local date: the session's own, or p_fecha
  v_hora   time;                  -- the visit stamp: the session's own start, or now() if today
  v_clases int;                   -- the cliente's balance BEFORE the write (NULL = ilimitado)
  v_vence  date;                  -- C9: the stacked expiry (NULL = no expiry)
  v_res_id      uuid;
  v_res_status  text;
  v_res_walk    boolean;
  v_asis_id        uuid;          -- the ACTIVE attendance row in this context, if any
  v_asis_consumio  boolean;
  v_asis_perdonada boolean;
  v_asis_hora      time;
  v_consumio  boolean;
  v_perdonada boolean := false;   -- what THIS row is stamped: p_perdonada, but never on the booked branch
  v_saldo     int;                -- the balance AFTER the write — the returned one
  v_resultado text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The stated outcome is the whole contract, so a NULL for it is a caller bug, not a default. Same
  -- for the forgiveness decision: `p_perdonada` defaults to false (the ordinary charge), but an
  -- explicit NULL means "I did not decide", and silently reading that as "do not forgive" is how a
  -- pardoned arrival becomes a double charge without anyone noticing.
  if p_presente is null then
    raise exception 'Falta el estado deseado';
  end if;
  if p_perdonada is null then
    raise exception 'Falta la decision de perdon';
  end if;
  -- ACCESO LIBRE has no session to derive a date from, so it must be given one.
  if p_session_id is null and p_fecha is null then
    raise exception 'Falta la fecha';
  end if;

  -- Serialize EVERY attendance write for this member, on the identical key both toggles take — a mark
  -- through this seam and a mark through theirs must serialize against each other or two concurrent
  -- calls at balance 1 both read 1, both write consumio = true, and the loser's guarded decrement
  -- matches zero rows (a later un-mark then refunds a class that was never spent). Taken FIRST, above
  -- every read the write decision depends on; that position is load-bearing, not tidiness.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  -- ── Resolve the context: the gym, the clock, the date and the visit stamp ──────────────────────
  if p_session_id is not null then
    -- CLASS context. The session (RLS-scoped: another gym's session simply is not found) owns the gym
    -- AND the instant. #166: fecha and hora are BOTH `starts_at` in the gym's timezone, never now() —
    -- so a roster marked the next morning records 07:00 yesterday, not the data-entry hour, and the
    -- C9 gate below is judged on the day the member actually trained. p_fecha is deliberately IGNORED
    -- here, exactly as toggle_pase ignores it when a session is named: the session's own date governs.
    select gym_id, starts_at into v_gym, v_starts
      from public.class_session where id = p_session_id;
    if not found then
      raise exception 'Clase no encontrada';
    end if;

    select timezone into v_tz from public.gym where id = v_gym;
    v_fecha := (v_starts at time zone v_tz)::date;
    v_hora  := (v_starts at time zone v_tz)::time;

    -- The target cliente, PINNED to the session's gym (defense-in-depth beside RLS: a cross-gym
    -- cliente id can never be marked against another gym's session).
    select c.clases_restantes, c.vence into v_clases, v_vence
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  else
    -- ACCESO LIBRE context. No class, so the gym comes from the cliente (RLS-scoped) and the stated
    -- p_fecha is the date. The stamp keeps toggle_pase's rule verbatim — the wall clock if this is
    -- today, NULL for a backdated entry, because there is no session instant to borrow.
    select c.clases_restantes, c.gym_id, c.vence into v_clases, v_gym, v_vence
      from public.clientes c where c.id = p_cliente_id;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;

    select timezone into v_tz from public.gym where id = v_gym;
    v_fecha := p_fecha;
    v_hora  := case
      when v_fecha = (now() at time zone v_tz)::date then (now() at time zone v_tz)::time
      else null
    end;
  end if;

  -- ── Read the CURRENT state of exactly this context ────────────────────────────────────────────
  -- The two contexts are disjoint by construction and each is bounded by its own unique index
  -- (asistencias_sesion_cliente_activa_uq / asistencias_cliente_fecha_libre_uq, 20260728120000), so
  -- "the active row" is at most one. The order/limit is kept for parity with the toggles' reads over
  -- pre-#89 rows.
  if p_session_id is not null then
    select a.id, a.consumio, a.perdonada, a.hora
      into v_asis_id, v_asis_consumio, v_asis_perdonada, v_asis_hora
      from public.asistencias a
     where a.cliente_id = p_cliente_id and a.class_session_id = p_session_id and a.deleted_at is null
     order by a.created_at desc limit 1;

    select r.id, r.status, r.is_walk_in into v_res_id, v_res_status, v_res_walk
      from public.reservation r
     where r.member_id = p_cliente_id and r.class_session_id = p_session_id;
  else
    select a.id, a.consumio, a.perdonada, a.hora
      into v_asis_id, v_asis_consumio, v_asis_perdonada, v_asis_hora
      from public.asistencias a
     where a.cliente_id = p_cliente_id and a.fecha = v_fecha and a.deleted_at is null
       and a.class_session_id is null
     order by a.created_at desc limit 1;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  -- DESIRED STATE: ABSENT.
  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  if not p_presente then
    -- Already absent — the stated outcome holds. WRITE NOTHING. This is the arm that makes an
    -- un-check-in safe to replay: the toggles would re-fire here (re-marking the member present and
    -- charging again); this returns the same answer it gave the first time.
    if v_asis_id is null then
      select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
      return query select false, null::text, p_session_id, v_saldo, null::text;
      return;
    end if;

    -- Converge: soft-delete the visit and refund iff THIS row consumed and the plan is finite. A
    -- booked member's row wrote consumio=false, so the hold taken at reservar_clase is never refunded
    -- here (that is cancelar_reserva's job) — and because the row is gone, a replay lands in the
    -- no-op above and cannot refund a second time.
    update public.asistencias set deleted_at = now() where id = v_asis_id;
    if v_asis_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clientes.clases_restantes + 1 where id = p_cliente_id;
    end if;
    -- Reverse the reservation transition symmetrically: a walk-in row existed only for this visit, so
    -- it goes terminal; a real booking reverts to its held state with its hold intact.
    if v_res_id is not null then
      if v_res_walk then
        update public.reservation set status = 'cancelada', cancelled_at = now(), checked_at = null where id = v_res_id;
      else
        update public.reservation set status = 'reservada', checked_at = null where id = v_res_id;
      end if;
    end if;

    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    -- resultado is NULL on every un-mark: nothing was settled, so nothing is disclosed.
    return query select false, null::text, p_session_id, v_saldo, null::text;
    return;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  -- DESIRED STATE: PRESENT.
  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  -- THE REPLAY ARM. The member is already present in this context, so the stated outcome holds and
  -- there is nothing to do. WRITE NOTHING — no soft-delete, no refund, no second decrement — and
  -- report the STORED row's own facts so the return value is idempotent too.
  --
  -- `resultado` is re-derived from the written rows, never re-decided, and the derivation is exact
  -- because the three outcomes leave three distinguishable row shapes:
  --     perdonada = true                                   → 'gratis'    (a forgiven arrival)
  --     consumio  = true                                   → 'descontada'(the finite decrement ran)
  --     free, and the reservation is a real booking        → 'reserva'   (a hold was captured)
  --     free otherwise (ilimitado, or a libre row)         → 'gratis'
  -- This is why the booked branch below insists on `is_walk_in = false`: it is what keeps the third
  -- and fourth lines apart.
  if v_asis_id is not null then
    select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
    v_resultado := case
      when v_asis_perdonada then 'gratis'
      when v_asis_consumio  then 'descontada'
      when p_session_id is not null and v_res_id is not null and not v_res_walk then 'reserva'
      else 'gratis'
    end;
    return query select true, to_char(v_asis_hora, 'HH24:MI'), p_session_id, v_saldo, v_resultado;
    return;
  end if;

  -- No active row: this is a real check-in, and the only arm of the whole function that writes one.
  if p_session_id is not null and v_res_id is not null and not v_res_walk
     and v_res_status in ('reservada', 'asistida') then
    -- BOOKED: the hold taken at reservar_clase is CAPTURED. Flip to asistida, charge nothing.
    -- `p_perdonada` is deliberately not applied — there is nothing to forgive, the booking already
    -- paid, and stamping perdonada here would tell a visit count that this was the second record of
    -- one arrival when it is the arrival itself.
    update public.reservation set status = 'asistida', checked_at = now() where id = v_res_id;
    v_consumio  := false;
    v_resultado := 'reserva';
  else
    -- WALK-IN (a class with no booking) or ACCESO LIBRE. Nothing has paid for this visit yet.
    --
    -- C9 vigencia (inclusive): an expired package has no entitlement. Judged against the CONTEXT's own
    -- date — the session's gym-local day, or p_fecha — so recording a past visit the member made while
    -- still valid keeps working; vence < the visit's day blocks, the vence day itself passes.
    if v_vence is not null and v_vence < v_fecha then
      raise exception 'Paquete vencido';
    end if;

    if p_perdonada then
      -- THE STATED PARDON. The caller decided this arrival was already paid for by a sibling row
      -- (the 15-minute cooldown), so it is recorded and not charged, and stamped `perdonada` — which
      -- is what lets a visit COUNT skip the second record of one arrival, and what stops this row
      -- from pardoning anything in turn (`visita_reciente`'s `and not perdonada`). A pardon can only
      -- ever make a visit free, never dearer, and the operator can already give a free visit by other
      -- means, so an over-generous caller costs a class and nothing more.
      v_consumio  := false;
      v_perdonada := true;
      v_resultado := 'gratis';
    else
      -- #237 zero-balance gate: a finite member at 0 is hard-refused, the same message and posture as
      -- reservar_clase's. Reached only when no pardon was stated — a pardoned visit's sibling already
      -- paid, and a paid visit must never be blocked a second time. Ilimitado (NULL) never reaches it.
      if v_clases is not null and v_clases <= 0 then
        raise exception 'Sin clases disponibles';
      end if;
      v_consumio  := (v_clases is not null);
      v_resultado := case when v_consumio then 'descontada' else 'gratis' end;
    end if;

    -- A class walk-in needs the reservation the attendance row hangs off; ACCESO LIBRE has none.
    if p_session_id is not null then
      if v_res_id is not null then
        update public.reservation
           set status = 'asistida', is_walk_in = true, checked_at = now(), cancelled_at = null
         where id = v_res_id;
      else
        insert into public.reservation (gym_id, class_session_id, member_id, status, is_walk_in, checked_at)
        values (v_gym, p_session_id, p_cliente_id, 'asistida', true, now())
        returning id into v_res_id;
      end if;
    end if;

    if v_consumio then
      update public.clientes set clases_restantes = clientes.clases_restantes - 1
       where id = p_cliente_id and clientes.clases_restantes > 0;   -- guarded decrement
    end if;
  end if;

  -- The ledger row. `origen` states the kind and must agree with the context
  -- (asistencias_origen_kind_ck); `reservation_id` is the walk-in/booking it settles, NULL for libre.
  -- The unique indexes are the second lock: if two callers somehow raced past the advisory lock, one
  -- of these inserts fails rather than writing a duplicate visit.
  insert into public.asistencias
    (cliente_id, fecha, hora, consumio, gym_id, class_session_id, reservation_id, origen, perdonada)
  values (
    p_cliente_id, v_fecha, v_hora, v_consumio, v_gym, p_session_id,
    case when p_session_id is not null then v_res_id else null end,
    case when p_session_id is not null then 'clase' else 'libre' end,
    v_perdonada
  );

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), p_session_id, v_saldo, v_resultado;
end;
$function$;

-- ADR-0005 lockdown, identical to both siblings: CREATE FUNCTION grants EXECUTE to public by default,
-- so it is revoked and re-granted to `authenticated` alone. A check-in is a staff act behind RLS;
-- `anon` has no business holding it, and PostgREST would otherwise expose it unauthenticated.
revoke execute on function public.fijar_asistencia(uuid, boolean, uuid, date, boolean) from public, anon;
grant execute on function public.fijar_asistencia(uuid, boolean, uuid, date, boolean) to authenticated;
