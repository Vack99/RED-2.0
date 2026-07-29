-- Reservation truthfulness (#162 + #164 + #165 + #169) — ONE window concept, and the front desk
-- stops guessing about bookings.
--
-- FORWARD-ONLY: not one historical row is read or rewritten. `perdonada` lands false on every
-- existing row and that is ACCURATE, not a shrug: the 15-minute cooldown that is its only writer
-- shipped one day earlier (20260728121000), and live prod was queried 2026-07-29 — ZERO member-days
-- hold two active attendance rows in 690 rows, so no historical row could ever have been pardoned.
--
-- WHAT WAS WRONG. Four defects, one root: a booking happens at an INSTANT and every surface asked
-- about it in DAYS.
--   (1) The desk's C15 branch (20260728121000:212-226) pardoned a class-less mark whenever the member
--       held ANY reservada booking on p_fecha. A member who books 18:00 and walks in at 09:00 for open
--       gym got that second, unrelated visit free — the day, not the class, was doing the deciding.
--   (2) A member who walked in AT class time got a class-less row that never touched their booking:
--       the roster still read them absent, and the class they actually attended was attributed to
--       nothing. The desk was consulting reservation data and telling the operator none of it.
--   (3) `reservar_clase` had no start-time gate (#165). The client hid past classes; the RPC accepted
--       them, so a stale tab (or a direct call) could book a class that had already run — the exact
--       asymmetry `cancelar_reserva` closed on its own side at 20260710123000:186-188.
--   (4) `asistencias_mes_por_cliente` counted DISTINCT fecha (20260728120000:109) — member-DAYS while
--       the ledger charges per CLASS. Two real classes in one day read as 1.
--
-- WHAT REPLACES THEM. The ARRIVAL WINDOW, `[starts_at − 90 min, starts_at + duration + 15 min)`,
-- is the single boundary concept — one pure helper (`ventana_arribo`), used by three decisions:
--
--   * ATTRIBUTION, ARM-ONLY. A 2-arg desk tap on a member holding a reservada booking whose window
--     contains now() DELEGATES to pasar_lista_sesion: the class gets the mark, the reservation flips
--     asistida, nothing is charged. It attributes only when it would MARK — never when it would undo.
--     A booking already asistida inside its window raises 'Ya marcada en la clase de HH:MM' and writes
--     NOTHING (the desk shows the message and rolls its optimistic flip back — that IS the no-op).
--     The tie-break is `abs(starts_at − now())`, the desk pill's own metric (marcadas.ts `sesionCercana`),
--     so on a double-booked member the screen and the server rank the candidates the same way. They do
--     NOT span the same interval: the pill is ±90 minutes ABSOLUTE around starts_at, this window is
--     [−90, +duration+15). The OPEN edge is shared by construction; at the CLOSE they diverge — for a
--     30-minute class the server stops attributing 45 minutes before the pill stops preselecting, and
--     for a 90-minute one it keeps attributing 15 minutes after. Inside that gap the desk can show a
--     class the server will not attribute to (the tap charges as a walk-in), or attribute to one the
--     pill has already dropped. Both are the SAFE direction — a wrong class is never marked — but the
--     two edges are not one number, and a future change to either must be made deliberately.
--   * THE PARDON SPLITS AT THE WINDOW instead of dying. PRE-window (>90 min early) → the ordinary
--     walk-in path, which CHARGES: that is a second, separate visit and the booking sheet already
--     carries its consent copy. CLOSED-window (the member missed the class, or the gym cancelled it)
--     → a libre mark with consumio = false: the published Terms cap a no-show at the ONE booked class
--     ("la clase se descuenta", singular), and taking a second at the door would break them.
--   * DISPLAY. `no_show` stays UNWRITTEN (as 20260706170000:51-53 designed it): "a still-reservada past
--     booking reads as no asistió" is DERIVED at read from this same window, TS-side. No sweep, no
--     stamp, no state to repair. Nothing in this file writes that state.
--
-- Plus two riders the rewrite makes nearly free:
--   * `perdonada` (#169, owner ruling 2026-07-29): the cooldown's pardon becomes a STAMP, so a visit
--     count can exclude the second record of ONE arrival without excluding a real second visit. The
--     count then moves to `count(*)` — visits, the unit the ledger already charges in.
--   * The RETURN of both RPCs gains `session_id` + `clases_restantes`, so the desk can say WHERE the
--     mark landed and show a balance that is not frozen at page load.
--
-- Idempotent/re-runnable end to end (add-column-if-not-exists, drop-function-if-exists on every
-- signature this file may find, create-or-replace elsewhere) and safe on a fresh scratch AND on live.
-- Expand-only at the schema layer; the two RPC RETURN TYPES are the one non-expand change — 42P13
-- forbids CREATE OR REPLACE on a return-type change, so BOTH are dropped and recreated, and the
-- EXECUTE lockdown a DROP takes with it is re-issued under each one. PostgREST/supabase-js tolerate
-- EXTRA result columns, so the deployed apps keep working across the apply; the SEMANTIC changes go
-- live at apply time, which is why apply and push happen in one sitting.
--
-- SIX steps, in dependency order:
--   1. asistencias.perdonada     — the column both RPCs stamp.
--   2. ventana_arribo            — the window, one home, pure.
--   3. pasar_lista_sesion        — DROP + CREATE: new return shape, perdonada on the cooldown pardon.
--   4. toggle_pase               — DROP + CREATE: new return shape, attribution, the split pardon.
--   5. reservar_clase            — CREATE OR REPLACE: the #165 started-class gate.
--   6. asistencias_mes_por_cliente — CREATE OR REPLACE: visits, minus the pardoned duplicates.

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. asistencias.perdonada — "this row is the SECOND record of ONE arrival".
-- ══════════════════════════════════════════════════════════════════════════════════
-- Written true by exactly one decision in each RPC: the 15-minute cooldown (visita_reciente) finding
-- an active row of the OTHER kind on the same fecha. It is NOT set by the closed-window booking pardon
-- below — that row is a real, separate visit that happens to be free, and it COUNTS.
--
-- No backfill and none needed (see the header): `false` is the true value for every historical row.
alter table public.asistencias
  add column if not exists perdonada boolean not null default false;

comment on column public.asistencias.perdonada is
  'True when the 15-minute cooldown recorded this visit free because an active row of the OTHER kind already existed on the same fecha — i.e. this row is the second record of ONE arrival, and aggregates that count VISITS must skip it. False for the closed-window booking pardon (a real separate visit) and for every pre-cooldown row.';

-- ══════════════════════════════════════════════════════════════════════════════════
-- 2. ventana_arribo — the arrival window, and the single home of its two constants.
-- ══════════════════════════════════════════════════════════════════════════════════
-- "Around class time" as ONE range: [starts_at − 90 min, starts_at + duration + 15 min).
--
-- 90 MIRRORS the desk pill's VENTANA_CERCANA_MIN (apps/admin .../asistencia/_components/marcadas.ts:72,
-- the Zen-Planner kiosk rule): the screen preselects the class nearest now() within 90 minutes, so this
-- lower bound is the one the desk already uses — the OPEN edge of the two is the same number by
-- construction, and changing one without the other would let the screen preselect a class the server
-- refuses to attribute to. Change one, change both.
--
-- The CLOSE is deliberately NOT the pill's: the pill is ±90 ABSOLUTE around starts_at, while this window
-- runs to starts_at + duration + 15, because a mark belongs to a class for as long as the class is
-- happening. So the two edges diverge after the start — earlier than the pill for a 30-minute class,
-- later for a 90-minute one. The divergence is bounded and its failure mode is a walk-in charge, never a
-- wrong attribution; it is not a bug to "fix" by equalising the numbers, which would make a 90-minute
-- class un-attributable in its last quarter.
--
-- 15 is the ARRIVAL GRACE at the far edge — the late-arrival tail during which a mark still belongs to
-- the class that just ended. It is a SIBLING of, never shared with, the cooldown's 15 minutes
-- (visita_reciente, 20260728121000): that one measures the gap between two ROWS; this one measures the
-- distance from a CLASS. They are equal today by coincidence of human timescales, and either may move
-- alone.
--
-- Upper bound EXCLUSIVE (tstzrange's default '[)'): "closed" is `upper(window) <= now()`, so the
-- instant of the close belongs to the closed side and no tap can be both in-window and pardoned.
--
-- Pure reader — writes nothing, so it carries NO rpc-coverage obligation and must NOT appear in
-- rpc-coverage.json (the no-pure-reader test fails if it does). IMMUTABLE (it reads no row and no
-- clock; now() lives at the CALL site), SECURITY INVOKER, search_path = ''. Its behaviour is asserted
-- through the two RPCs that call it (toggle_pase_rules.sql vectors v1-v4).
create or replace function public.ventana_arribo(p_starts_at timestamptz, p_duration_min int)
returns tstzrange
language sql
immutable
security invoker
set search_path to ''
as $$
  select tstzrange(
    p_starts_at - interval '90 minutes',
    p_starts_at + make_interval(mins => p_duration_min) + interval '15 minutes'
  );
$$;

revoke execute on function public.ventana_arribo(timestamptz, int) from public, anon;
grant execute on function public.ventana_arribo(timestamptz, int) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 3. pasar_lista_sesion — the Agenda roster, with the truthful return and the pardon stamp.
-- ══════════════════════════════════════════════════════════════════════════════════
-- DROP + CREATE, not CREATE OR REPLACE: the RETURN TYPE gains two columns and PostgreSQL refuses that
-- in place (42P13, "cannot change return type of existing function"). The DROP takes the grants with
-- it, so the EXECUTE lockdown is re-issued below. Dropping it also forces the ORDER in this file —
-- this function first, then toggle_pase, whose delegation `return query select * from
-- public.pasar_lista_sesion(...)` requires IDENTICAL arity on both sides or every class-pill tap (the
-- desk's default state) fails at runtime with a structure mismatch.
--
-- Changes vs 20260728121000 — everything else is byte-for-byte that body, including the booked branch,
-- the lock key and its position, the refund symmetry, the C9 walk-in gate and the walk-in reservation
-- create/reuse with its reverse transitions:
--   (i)   RETURN gains `session_id` (always p_session_id — this seam always knows its class) and
--         `clases_restantes` (the balance AFTER the write, re-read from the row: what the desk paints
--         on the tapped member instead of a balance frozen at page load).
--   (ii)  The cooldown pardon now also stamps `perdonada = true`. The BOOKED branch does not: that row
--         is free because the booking already paid, which is a different fact and still one visit.
--   (iii) The clientes read is alias-qualified (c.) — the new `clases_restantes` OUT parameter shares
--         the column's name, and an unqualified reference would now be ambiguous at runtime (42702).
--   (iv)  NEW: the cooldown is GUARDED against pardon chaining — a libre row that was itself free from
--         toggle_pase's closed-window arm cannot pardon a class. See the branch comment; without it one
--         missed booking buys a free door visit AND a free class.
--   NOT widened: the booked branch still keys on `v_status in ('reservada','asistida')`. `no_show` is
--   never written by anything (it is derived at read), so there is no third state to admit here.
drop function if exists public.pasar_lista_sesion(uuid, uuid);

create function public.pasar_lista_sesion(p_session_id uuid, p_cliente_id uuid)
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
    v_consumio := (v_clases is not null and v_clases > 0);
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

-- Re-issue the EXECUTE lockdown the DROP took with it (CREATE FUNCTION grants EXECUTE to public by
-- default) — the posture 20260706180100 set and 20260728121000 preserved through CREATE OR REPLACE.
revoke execute on function public.pasar_lista_sesion(uuid, uuid) from public, anon;
grant execute on function public.pasar_lista_sesion(uuid, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 4. toggle_pase — the front desk, now BOOKING-aware instead of merely class-aware.
-- ══════════════════════════════════════════════════════════════════════════════════
-- DROP + CREATE for the same 42P13 reason as above, and BOTH signatures are dropped so the file is
-- RE-RUNNABLE: (uuid, date) is what existed before 20260728121000, (uuid, date, uuid) is what that
-- migration and this one leave behind. The EXECUTE lockdown is re-issued after the CREATE.
--
-- Changes vs 20260728121000 — everything else is byte-for-byte that body:
--   (i)   RETURN gains `session_id` — NULL on this class-less path, the ATTRIBUTED session when the tap
--         delegated — and `clases_restantes`, the balance after the write. Together they are the whole
--         disclosure bundle: the desk can say WHERE the mark landed and repaint the member's balance.
--   (ii)  NEW, top of the ON path: ATTRIBUTION. See the branch comment.
--   (iii) NEW: the already-marked NO-OP raise (attribution's second half — it never undoes).
--   (iv)  REPLACED: the C15 day-keyed pardon becomes the CLOSED-WINDOW pardon, in the same position
--         (still above the C9 vence gate, deliberately — see the branch comment). It decides the MONEY;
--         it still asks the cooldown whether the row is also a duplicate ARRIVAL, and stamps that.
--   (v)   The cooldown pardon also stamps `perdonada = true`; the INSERT carries it.
--   (vi)  Every clientes reference is alias/table-qualified — the new `clases_restantes` OUT parameter
--         shares the column's name and an unqualified read or update expression would now raise 42702.
--   KEPT VERBATIM: the delegation branch, the auth guard, the advisory lock and ITS POSITION (before
--   every read the write decision depends on), the active-libre-row lookup and the whole toggle-OFF
--   branch, the C9 vigencia gate, the hora rule, the guarded decrement, origen = 'libre'.
--
-- ORDER NOTE, load-bearing: the toggle-OFF branch stays ABOVE all of the new logic. A member with an
-- active libre row taps to UNDO — that is what the desk row's marked state means — and attribution
-- must not turn an intended undo into a class mark, nor leave that libre row un-undoable for the whole
-- 105-minute window. Arm-only cuts both ways: attribution acts only when the tap would MARK.
drop function if exists public.toggle_pase(uuid, date);
drop function if exists public.toggle_pase(uuid, date, uuid);

create function public.toggle_pase(p_cliente_id uuid, p_fecha date, p_session_id uuid default null)
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
      v_consumio := (v_clases is not null and v_clases > 0);
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

-- Re-issue the EXECUTE lockdown the DROP took with it (CREATE FUNCTION grants EXECUTE to public by
-- default), matching pasar_lista_sesion's posture exactly.
revoke execute on function public.toggle_pase(uuid, date, uuid) from public, anon;
grant execute on function public.toggle_pase(uuid, date, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 5. reservar_clase — the #165 gate: a class that has started cannot be booked.
-- ══════════════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE, same signature, so the ACL and the whole grant history stand (re-emitted below
-- for posture parity, exactly as 20260710123000 did). The body is byte-faithful to 20260710123000
-- except the gate and the one extra column its guard needs:
--   * the session read now also takes `starts_at`;
--   * after the cancelled check: `if v_starts <= now() then raise exception 'La clase ya comenzó'`.
--
-- The client already hides past classes, but the client is not the rule — cancelar_reserva has
-- enforced the same boundary server-side since 20260710123000:186-188, with the SAME message (one
-- vocabulary: a member who tries either side of a started class reads the same sentence). Without it a
-- stale tab, a slow submit or a direct call books a class that has already run: a consumed credit for a
-- seat nobody can attend, and a booking the desk's own attribution would then have to reason about.
-- Absolute starts_at vs now(), never a gym-local date — the same comparison the cancel gate makes.
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
  v_starts    timestamptz;          -- #165: the gate's only input
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
  if v_starts <= now() then
    raise exception 'La clase ya comenzó';
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

revoke execute on function public.reservar_clase(uuid) from public, anon;
grant execute on function public.reservar_clase(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 6. asistencias_mes_por_cliente — the unit is a VISIT (#169, owner ruling 2026-07-29).
-- ══════════════════════════════════════════════════════════════════════════════════
-- THE HISTORY, so the next reader does not re-litigate it: this aggregate counted `count(*)` until
-- 20260728120000 made two same-day rows legal, at which point a cooldown pair (ONE arrival, two rows)
-- would have read as 2 — so it was re-emitted as `count(distinct fecha)`, member-DAYS. That fixed the
-- pair and broke the honest case in the same stroke: two real classes in one day read as 1 while the
-- ledger charged 2, and shipping to dual-surface gyms (door check-in AND class rosters) makes two rows
-- a day the NORMAL shape, not an exotic one.
--
-- `perdonada` (step 1) ends the trade-off: the pair is now identifiable at the row level, so the count
-- returns to the unit the ledger actually charges in — the VISIT — and simply skips the second record
-- of one arrival. Two classes in a day: 2. Door + class within 15 minutes: 1. A closed-window pardon or
-- a booked-branch free mark: 1 each — free is not the same as duplicated.
--
-- Accepted, documented edge (the orphaned pardon, 20260728121000:39-45): if the mark that PARDONED a
-- row is later undone, the surviving pardoned row still reads perdonada = true and does not count,
-- undercounting a real visit by one. The month-close trigger query in the #169 handoff is the
-- verification for it.
--
-- The day strip and the calendar are NOT touched and must not be: marcadas_presencia counts
-- `distinct cliente_id` — PEOPLE present — which is a different question with a different right answer.
--
-- CREATE OR REPLACE preserves the function's ACL, so the whole grant history stands and nothing is
-- re-issued: authenticated-only EXECUTE (20260714070000:40-42) plus the anon revoke (20260715080000:14).
create or replace function public.asistencias_mes_por_cliente(p_gym_id uuid, p_desde date)
returns table (cliente_id uuid, n int)
language sql
stable
security invoker
set search_path to ''
as $$
  select cliente_id, count(*)::int as n
  from public.asistencias
  where gym_id = p_gym_id and deleted_at is null and fecha >= p_desde and not perdonada
  group by cliente_id;
$$;
