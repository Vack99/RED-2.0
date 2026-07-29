-- #89 slice 1, part (b) — ONE cooldown replaces the whole 2026-07-10 cross-surface apparatus.
--
-- FORWARD-ONLY: no row is read or rewritten here, only three function definitions. The three guards
-- this retires never once fired in production (Forge marks attendance almost only at the front desk,
-- red-demo almost only on the Agenda; no member in any gym has ever held two same-day attendance
-- rows), so there is no historical behaviour to preserve and nothing to backfill.
--
-- WHAT WAS WRONG. 20260710124000 + 20260710132000 tried to stop a double-charge by asking "does this
-- member already have a row TODAY?". That question is day-keyed, and the day is not the unit of
-- entitlement — the CLASS is (owner ruling R1, and the unanimous practice of ~20 competing products:
-- two classes in a day is two credits, everywhere, always). Keying on the day forced two bad
-- answers: toggle_pase RAISED at the front desk rather than record a second visit, and
-- pasar_lista_sesion silently gave a second class away free. Both also made the ledger
-- ORDER-DEPENDENT (desk→class charged once, class→desk charged twice). The project's own canonical
-- spec had said so all along: packages/domain/src/rules.ts:165-167, "Same-day duplicate attendance
-- is allowed and each still consumes a class."
--
-- WHAT REPLACES THEM. A 15-minute COOLDOWN, the industry's actual fix for this exact failure
-- (Mindbody enforces a fixed 15-minute arrival cooldown; Trainingym documents our precise bug — a
-- booking consumes, then the door deducts again — and solves it with a no-re-deduct window):
--
--   a mark whose member already has an active row OF THE OTHER KIND on the SAME fecha, created
--   within the last 15 minutes, records the visit with consumio = false instead of charging.
--
-- It is order-independent (either surface pardons the other), it guesses nothing, and it deletes
-- the refusal entirely: the front desk can now record a second visit, it just does not charge for
-- one arrival twice. Beyond the window R1 applies again — one class attended, one class spent.
-- The pairing is strictly libre↔clase: a recent row for a DIFFERENT class never pardons a class
-- mark (that would be discounting the second class, which nobody does), and libre↔libre cannot
-- arise (asistencias_cliente_fecha_libre_uq + the toggle).
--
-- Fixed 15 minutes, not per-gym configurable (owner ruling, 2026-07-28) — configurability is a
-- later sale. The constant therefore has exactly one home: public.visita_reciente below.
--
-- TWO ACCEPTED EDGES. The cooldown is deliberately ONE-DIRECTIONAL (a pardon is decided at write time
-- from what already exists, and never revisited) and deliberately fecha-keyed. Pairing HEURISTICS —
-- inferring which two rows are "the same arrival" and keeping them linked — were explicitly withdrawn
-- by the owner, so neither edge below is closed by guessing; both are named and accepted:
--   * ORPHANED PARDON. Agenda mark consumes (5→4); a desk tap inside the window is pardoned
--     (consumio=false); the operator then UNTOGGLES THE AGENDA ROW. The refund fires (4→5), the class
--     row is soft-deleted and the reservation reverts — and the pardoned libre row legitimately stays
--     active at consumio=false: the visit really did happen, and recording it is the whole point of
--     replacing the old RAISE. It is unpaid, and the operator recovers the charge with the same two
--     taps they already know: untoggle the libre row and re-toggle it — with the pardoning sibling
--     gone, the re-mark charges. Pinned by vector (8) of pasar_lista_sesion_rules.sql.
--   * MIDNIGHT STRADDLE. A 23:55 ACCESO LIBRE check-in and a 00:05 class mark are one arrival but two
--     `fecha`s, so neither pardons the other and both charge. The only fix would be relaxing
--     visita_reciente's `fecha = p_fecha` equality — and that equality is exactly what stops a
--     BACKDATED mark (last Tuesday's door check, entered now) from pairing with a today-mark merely
--     because both rows were CREATED minutes apart. That failure is commoner and worse. Accepted.
--
-- THREE definitions, in dependency order:
--   1. visita_reciente  — the cooldown predicate + the constant.
--   2. toggle_pase      — DROP + CREATE (the signature gains p_session_id): delegation, the
--                         per-member advisory lock, the C15 RAISE deleted, the cooldown, origen.
--   3. pasar_lista_sesion — CREATE OR REPLACE: the lock key, the FD-existence mirror deleted, the
--                         cooldown in its place, origen.

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. visita_reciente — the cooldown, and the single home of the 15-minute constant.
-- ══════════════════════════════════════════════════════════════════════════════════
-- "Does this member have an active visit of kind p_clase on p_fecha, made in the last 15 minutes?"
--
-- p_clase selects the OTHER kind at each call site: toggle_pase asks p_clase => true (only a recent
-- CLASS row pardons a class-less mark), pasar_lista_sesion asks p_clase => false (only a recent
-- LIBRE row pardons a class mark). Neither can ever pardon its own kind, which is what keeps two
-- classes = two credits.
--
-- The `fecha = p_fecha` equality is load-bearing, not decoration: it stops a BACKDATED mark (the
-- operator entering last Tuesday's door check) from pairing with something marked today merely
-- because both rows were created minutes apart.
--
-- Read-only: SECURITY INVOKER (RLS on asistencias scopes the read to the caller's gym, exactly as
-- it does for the callers, which are themselves INVOKER), STABLE, search_path = '' with every name
-- schema-qualified. It writes nothing, so it carries no rpc-coverage obligation — its behaviour is
-- asserted through the two RPCs that call it (pasar_lista_sesion_rules.sql vectors 4-8).
create or replace function public.visita_reciente(p_cliente_id uuid, p_fecha date, p_clase boolean)
returns boolean
language sql
stable
security invoker
set search_path to ''
as $$
  select exists (
    select 1 from public.asistencias
     where cliente_id = p_cliente_id
       and fecha = p_fecha
       and deleted_at is null
       and (class_session_id is not null) = p_clase
       and created_at >= now() - interval '15 minutes'
  );
$$;

revoke execute on function public.visita_reciente(uuid, date, boolean) from public, anon;
grant execute on function public.visita_reciente(uuid, date, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 2. toggle_pase — the front desk, now class-aware.
-- ══════════════════════════════════════════════════════════════════════════════════
-- DROP + CREATE, not CREATE OR REPLACE: the signature gains a third argument. A CREATE OR REPLACE
-- with a new parameter creates a SECOND function rather than replacing the first, and the 2-arg
-- overload would then make every existing two-argument call ambiguous (and PostgREST refuse the RPC
-- with PGRST203). Dropping also drops the grants, so the EXECUTE lockdown is re-issued below.
-- Existing 2-arg call sites (the ficha, the past-day desk list, three suites) keep working
-- unchanged: p_session_id defaults to NULL, which is the ACCESO LIBRE path.
--
-- Changes vs 20260710124000 — everything else is byte-for-byte that body:
--   (i)   NEW first branch, DELEGATION. A desk tap made in a class context and an Agenda roster tap
--         are the same act, so they must be the same write. See the branch comment.
--   (ii)  NEW per-member advisory lock (design handoff §7 item 1, shipped here because #89 is what
--         makes it dangerous).
--   (iii) DELETED: the C15 mistap RAISE (old lines 91-97). The front desk no longer refuses a
--         member who already attended a class today — it records the second visit and, inside the
--         cooldown, does not charge for it.
--   (iv)  NEW cooldown on the walk-in consume decision, replacing "is there any row today" thinking.
--   (v)   The INSERT stamps origen = 'libre' (20260728120000): this row is a STATED class-less
--         visit, no longer merely a row whose class is unknown.
--   KEPT VERBATIM: the active-reservada-booking no-consume (the booking genuinely paid for that
--   class), the C9 vigencia gate on the walk-in path, the toggle-OFF refund, the gym-derived hora
--   stamp, and the return contract.
--
-- BOTH signatures are dropped, so this file is RE-RUNNABLE: the 2-arg one is what existed before this
-- migration, the 3-arg one is what a previous run of this migration left behind. Without the second
-- drop a re-apply would fail at `create function` with 42723 (already exists) — everything else in this
-- file is CREATE OR REPLACE and re-applies cleanly.
drop function if exists public.toggle_pase(uuid, date);
drop function if exists public.toggle_pase(uuid, date, uuid);

create function public.toggle_pase(p_cliente_id uuid, p_fecha date, p_session_id uuid default null)
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
  -- (i) DELEGATION. The desk in a class context IS the Agenda roster: one write path, one
  -- semantics, including the reservation flip the front desk never owned (a desk tap on a CON
  -- RESERVA member marks their booking asistida; desk undo reverts it). Duplicating
  -- pasar_lista_sesion's body here is exactly how the two surfaces drifted apart in the first
  -- place, so this branch delegates instead of re-deriving. p_fecha is deliberately IGNORED on this
  -- path: the session's own gym-local date governs, identically to an Agenda mark. Everything below
  -- this branch is the ACCESO LIBRE (class-less) path.
  if p_session_id is not null then
    return query select * from public.pasar_lista_sesion(p_session_id, p_cliente_id);
    return;
  end if;

  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- (ii) Serialize EVERY attendance write for this member. Keyed on the member ALONE — not
  -- (member, day) and not (member, session), which is what pasar_lista_sesion used to key on:
  -- the cooldown decision reads the member's rows of the OTHER kind, so a desk tap and an Agenda
  -- tap must serialize against each other or both read "no recent row" and both charge.
  -- pasar_lista_sesion takes this identical key. Before #89 a double-tap here was merely hidden by
  -- the caller's DISTINCT; once a second row per day is legal it is a silent double-charge.
  --
  -- The POSITION is load-bearing, not tidiness: EVERY read the write decision depends on must sit
  -- INSIDE the lock. clases_restantes below is what decides v_consumio, so reading it first would
  -- decide on a stale balance — of two concurrent marks at balance 1 both would read 1, the loser
  -- would write consumio = true while its guarded `clases_restantes > 0` decrement matched ZERO rows,
  -- and a later untoggle would then refund a class that was never spent. pasar_lista_sesion takes the
  -- same key in the same position relative to its own clientes read.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' || p_cliente_id::text));

  select clases_restantes, gym_id, vence into v_clases, v_gym, v_vence
    from public.clientes where id = p_cliente_id;   -- RLS-scoped; asistencia inherits the cliente's gym
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
    -- toggle OFF
    update public.asistencias set deleted_at = now() where id = v_active_id;
    if v_active_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clases_restantes + 1 where id = p_cliente_id;
    end if;
    return query select false, null::text;
    return;
  end if;

  -- toggle ON

  -- C15 active-reservation: a class booked ahead already consumed at booking (reservar_clase). If this
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
    -- C9 vigencia (inclusive): an expired package has no entitlement — block the walk-in mark. vence
    -- < p_fecha blocks; the vence day itself (vence = p_fecha) still passes. A booked member is exempt above.
    if v_vence is not null and v_vence < p_fecha then
      raise exception 'Paquete vencido';
    end if;
    -- (iv) COOLDOWN. p_clase => true: only a recent CLASS row on this same fecha pardons this
    -- class-less mark — the member walked through the door minutes either side of a class that was
    -- already charged, which is ONE arrival. Beyond 15 minutes this is a genuinely separate visit
    -- and R1 charges for it.
    if public.visita_reciente(p_cliente_id, p_fecha, true) then
      v_consumio := false;
    else
      v_consumio := (v_clases is not null and v_clases > 0);
    end if;
  end if;

  v_hora := case
    when p_fecha = (now() at time zone v_tz)::date
      then (now() at time zone v_tz)::time
    else null
  end;

  -- (v) origen = 'libre': a STATED ACCESO LIBRE visit, not a row whose class is unknown.
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, origen)
  values (p_cliente_id, p_fecha, v_hora, v_consumio, v_gym, 'libre');

  if v_consumio then
    update public.clientes set clases_restantes = clases_restantes - 1
     where id = p_cliente_id and clases_restantes > 0;   -- guarded decrement
  end if;

  return query select true, to_char(v_hora, 'HH24:MI');
end;
$function$;

-- Re-issue the EXECUTE lockdown the DROP took with it (CREATE FUNCTION grants EXECUTE to public by
-- default), now matching pasar_lista_sesion's posture exactly.
revoke execute on function public.toggle_pase(uuid, date, uuid) from public, anon;
grant execute on function public.toggle_pase(uuid, date, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 3. pasar_lista_sesion — the Agenda roster, on the same cooldown and the same lock.
-- ══════════════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE, same signature (so grants and the toggle_pase delegation above are untouched).
-- Changes vs 20260710132000 — everything else is byte-for-byte that body, including the booked
-- branch, the refund symmetry, and the walk-in reservation create/reuse with its reverse transitions:
--   (i)   The ADVISORY LOCK KEY changes from hashtext(cliente || ':' || session) to
--         hashtext('pase:' || cliente) — the key toggle_pase now takes. The old per-(member,session)
--         key serialized a surface against itself but let a desk tap and an Agenda tap interleave,
--         and the cooldown makes that interleaving a double-charge rather than a curiosity. The lock
--         also MOVES UP, above the clientes read it must cover — see the comment at the call.
--   (ii)  DELETED: the front-desk-existence mirror (old lines 118-124), which suppressed the consume
--         whenever ANY class-less row existed that day, however old. Replaced in the same position
--         by the cooldown.
--   (iii) The INSERT stamps origen = 'clase'.
--   (iv)  NEW: the C9 vigencia gate on the WALK-IN branch — the rule toggle_pase has always had, and
--         the one thing here that is NOT a straight port of 20260710132000. It closes #163 (the vence
--         asymmetry between the two surfaces) rather than leaving it out of scope, because (i) above
--         makes leaving it out a REGRESSION, not a status quo: the delegation branch in toggle_pase
--         means the front desk's DEFAULT state — a class pill selected — now lands in this body, so
--         an expired member the 2-arg desk path has always refused would be admitted and charged off
--         a dead package. One rule, at the root, for both surfaces.
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
  v_vence  date;         -- C9: the cliente's stacked expiry (NULL = no expiry)
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

  -- (i) Serialize every attendance write for this MEMBER, across both surfaces — the identical key
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
  select clases_restantes, vence into v_clases, v_vence
    from public.clientes where id = p_cliente_id and gym_id = v_gym;
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
    -- (iv) C9 vigencia (inclusive), the WALK-IN branch ONLY — an expired package has no entitlement, so
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
    -- (ii) COOLDOWN. p_clase => false: only a recent ACCESO LIBRE row on this session's own fecha
    -- pardons this class mark — the member came through the door and into a class within minutes,
    -- which is ONE arrival, already charged at the desk. A recent row for a DIFFERENT CLASS must
    -- NOT pardon it: two classes attended is two classes spent (R1), which is the unanimous rule of
    -- the market and the reason the deleted mirror was wrong.
    if public.visita_reciente(p_cliente_id, v_fecha, false) then
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
  -- (iii) origen = 'clase', the stated kind that pairs with class_session_id (asistencias_origen_kind_ck).
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, class_session_id, reservation_id, origen)
  values (p_cliente_id, v_fecha, v_hora, v_consumio, v_gym, p_session_id, v_res_id, 'clase');

  return query select true, to_char(v_hora, 'HH24:MI');
end;
$function$;
