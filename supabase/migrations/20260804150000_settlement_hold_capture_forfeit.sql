-- Settlement: hold / capture / forfeit — #233 slice 1 (#245). Owner ruling 2026-08-04.
--
-- THE BEHAVIOUR CHANGES, one line each (1–3 are the ruling; 4–5 fell out of adversarial review of it):
--   1. cancel_class_session RELEASES: in the SAME transaction as `cancelled_at`, every active
--      `reservada` on the session flips to `cancelada` and each member is refunded exactly what
--      their booking spent (consumio-gated; ilimitado untouched) — a gym cancel never forfeits (#172).
--   2. toggle_pase + pasar_lista_sesion DISCLOSE the outcome: the return gains `resultado`
--      (`descontada` / `gratis` / `reserva`), and the CLOSED-WINDOW PARDON is DELETED — a still
--      -reservada closed class stays HELD and derives to no_show, i.e. FORFEITED, with zero writes.
--   3. pasar_lista_sesion attributes from the SESSION's own instant: the visit stamp is the class's
--      gym-local start time, never `now()` — #166's root, and the whole point of "marking late".
--   4. The COOLDOWN is re-keyed on PAYMENT (`visita_reciente` gains `and not perdonada`; the
--      closed-window chain-breaker is deleted): change 2 broke that guard's premise and made one
--      arrival cost a different number of credits depending on the order it was recorded in (§3).
--   5. cancel_class_session is BEFORE-START ONLY ('La clase ya comenzó'): change 1 without a temporal
--      gate would let a back-navigated PAST class refund its no-shows and erase them (§4).
--
-- The model, stated once. A booking HOLDS a credit (reservar_clase's decrement — unchanged), check-in
-- CAPTURES that hold (the booked branch: reservada→asistida, consumio=false, because the hold already
-- paid), a no-show FORFEITS it (the absence of any write — deleting the pardon IS the feature), and a
-- gym cancel RELEASES it (§1). Member economics are byte-identical to today on every path, so the
-- published Terms ("la clase se descuenta [al reservar]") stay literally true. `no_show` REMAINS
-- DERIVED at read — standing 2026-07-29 ruling. There is no sweep and no new status write anywhere
-- in this file.
--
-- UNTOUCHED, AND THE SPEC PINS IT: `reservar_clase` and `cancelar_reserva`. They already implement
-- hold and release-on-member-cancel; the epic touches exactly the three functions below.
--
-- ── §1 SECURITY POSTURE OF cancel_class_session: it STAYS SECURITY INVOKER ────────────────────────
-- The new refund reaches two more tables, so the question had to be asked rather than assumed. RLS
-- already grants staff exactly the two writes this needs, keyed on the row's own gym:
--   * `reservation_staff_update` (20260706170000:82-83) — for update to authenticated
--     using (is_staff_of(gym_id)) with check (is_staff_of(gym_id))
--   * `clientes_staff_update`    (20260702173309:41-42) — the identical shape
-- and the proof is not theoretical: `pasar_lista_sesion` below is SECURITY INVOKER and already makes
-- BOTH of those writes on every roster mark in production. So invoker suffices, the signature is
-- unchanged, and this one is a CREATE OR REPLACE (the grants carry). The EXECUTE lockdown is
-- re-issued anyway for posture parity — idempotent if the grants already hold.
--
-- NO SILENT PARTIAL REFUND, which is the risk an invoker body carries: RLS filtering rows it cannot
-- see would refund SOME bookings and skip others. It cannot happen here. `reservation.gym_id` is
-- stamped from the SESSION's gym on every write path (reservar_clase, pasar_lista_sesion), and the
-- `cancelled_at` UPDATE above the refund already passed `is_staff_of(class_session.gym_id)` — so the
-- caller is staff of precisely the gym every one of those reservation rows carries. Either all of
-- them are reachable or the cancel itself raised first.
--
-- ── §2 THE DELETED PARDON, and its one live consequence ──────────────────────────────────────────
-- toggle_pase's closed-window arm (20260804120000:403-435) recorded a FREE door visit for a member
-- who missed today's booking, and its own header called it "the accidental compensation we keep until
-- [#172] is decided". #172 is now decided — by §1 — for the case that deserved it (the GYM cancelled).
-- What is left is the member's own no-show, which the ruling forfeits: the hold stays taken, the
-- booking stays reservada, no_show derives, and the door visit that follows is an ORDINARY walk-in.
-- CONSEQUENCE, stated because it is a real behaviour change and not a refactor: that walk-in now runs
-- the whole walk-in arm, including the C9 vence gate the pardon used to sit above. A member whose
-- package expired while holding a booking they then missed is refused at the door with 'Paquete
-- vencido' — the same answer every other expired member gets. Nothing about a missed booking buys an
-- exemption any more.
--
-- ── §3 THE COOLDOWN IS RE-KEYED ON PAYMENT, because deleting the pardon broke its old key ────────
-- pasar_lista_sesion's cooldown carried a CHAIN-BREAKER: "do not let a recent libre row pardon this
-- class if the member holds a closed-window `reservada` booking today". That predicate was a PROXY for
-- the real question — it was exact only because the closed-window arm was the one thing that could
-- write a FREE libre row, so "member holds a missed booking" and "that recent row was free" were the
-- same fact inside the 15-minute horizon. §2 deletes that arm, and the proxy inverts: within the
-- horizon such a row is now necessarily CHARGED, so the guard suppresses a pardon it should grant.
--
-- Left alone, that is an ORDER-DEPENDENT DOUBLE CHARGE. A finite member who missed today's booking
-- (hold forfeited) and then arrives once:
--     door tap → class mark   = 1 (door, charged) + 1 (class, chain-breaker vetoes the pardon) = 2
--     class mark → door tap   = 1 (class, charged) + 0 (door, pardoned by the cooldown)        = 1
-- Same arrival, same day, 3 credits spent one way and 2 the other, decided by which screen the
-- operator touched first. One arrival must cost one walk-in charge, whichever order it is recorded in.
--
-- THE PREDICATE, and why it is this one. Ask the row, not the booking: a recent visit pardons the one
-- in front of it IFF THAT ROW WAS NOT ITSELF PARDONED. `perdonada` already records exactly that and
-- nothing else (#169: "this row is the second record of ONE arrival"), and after §2 the invariant is
-- exact — enumerate every row these two functions can write:
--     consumio = true                            → paid directly                    perdonada = false
--     booked capture (reservada → asistida)      → paid at booking, via the hold     perdonada = false
--     ilimitado walk-in / ilimitado capture      → owes nothing by design            perdonada = false
--     cooldown pardon                            → paid NOTHING, someone else did    perdonada = TRUE
-- So `not perdonada` admits precisely {paid directly, paid by a hold, owes nothing} and excludes
-- precisely {free rider}. It needs no join to reservation and no window arithmetic, and it is
-- symmetric by construction: whichever row is written first is the paying one, and the second is
-- pardoned by it.
--
-- WHERE IT LIVES: in `visita_reciente` itself (§1 below), which is the single home 20260728121000
-- created for this rule and is called by both surfaces. The chain-breaker's `and not exists (…)` is
-- therefore DELETED from pasar_lista_sesion — its job is now done, correctly, one level down — and
-- toggle_pase's bare cooldown call gains the same protection it never had. That second half is not
-- incidental: toggle_pase had NO guard at all, so a pardoned CLASS row could already pardon a door tap
-- in turn. Both surfaces are now keyed on payment, and only on payment.
--
-- HISTORICAL ROWS: the deleted closed-window arm wrote genuinely-free rows that could carry
-- perdonada = false, so within 15 minutes of this migration applying such a row could still pardon.
-- Live has ZERO non-walk-in bookings at either paying gym (#233's measurement), so no such row exists;
-- the branch is gone, so no new one can be written.
--
-- ── §4 cancel_class_session IS BEFORE-START ONLY ─────────────────────────────────────────────────
-- The release must not be reachable for a class that has already happened. The Agenda navigates
-- backwards freely (agenda.tsx), so a past session is one click from the cancel affordance — and
-- cancelling one would mass-refund every still-`reservada` row on it. Those rows are precisely the
-- NO-SHOWS: `no_show` is DERIVED from (reservada, class over), so refunding them both hands back
-- forfeited credits AND erases the absences from the roster (`getSesionRoster` reads status in
-- reservada/asistida). That is the standing 2026-07-29 derived-only ruling being violated through the
-- back door — by a write that deletes derived history rather than by a sweep that creates it.
--
-- So the gate is `starts_at > now()`, refusing with 'La clase ya comenzó' — cancelar_reserva's own
-- sentence, for the same invariant it enforces at 20260803140000:289-291 ("once the class has begun,
-- cancellation is closed — a still-reservada past booking is a no-show that must consume"). One
-- vocabulary for one rule, on the member's cancel and the gym's alike.
--
-- KEPT BYTE-IDENTICAL, deliberately, in both attendance functions: the advisory lock and its position,
-- the C9 vigencia gate, the #237 zero-balance gate and the ELSE arm it sits in, `perdonada` and where
-- it is stamped, the attribution window + its filters, the already-marked NO-OP, every refusal
-- sentence, the capacity/tenant gating, and the guarded decrement.
--
-- DROP + CREATE for the two attendance RPCs, and it has to be: a RETURNS TABLE cannot widen in place
-- (42P13). THE DROP TAKES THE GRANTS WITH IT, so the EXECUTE lockdown is re-issued under each CREATE
-- (20260729120000's own pattern). Both historical toggle_pase signatures are dropped so the file is
-- RE-RUNNABLE. Idempotent, forward-only, safe on a fresh scratch AND on live.

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. visita_reciente — the cooldown's single home, re-keyed on PAYMENT (§3).
-- ══════════════════════════════════════════════════════════════════════════════════
-- One clause added to 20260728121000's body: `and not perdonada`. Everything else — the fecha
-- equality, the kind flip, the deleted_at filter, the 15-minute constant, STABLE + SECURITY INVOKER +
-- search_path='' — is byte-for-byte that migration. Same signature, so CREATE OR REPLACE and the
-- grants carry; the lockdown is re-issued below for posture parity.
--
-- The question it answers narrows from "is there a recent visit of the other kind?" to "is there a
-- recent visit of the other kind THAT PAID FOR ITSELF?" — which is the question both callers always
-- meant, and the one the deleted chain-breaker was approximating with a booking lookup. A ROW THAT
-- PAID NOTHING PARDONS NOTHING; `perdonada` is `not null default false` (20260729120000:81) and marks
-- exactly the rows that paid nothing because a sibling already had, so `not perdonada` is total and
-- needs no coalesce. See §3 for the enumeration that makes this exact.
--
-- It still writes nothing, so it carries no rpc-coverage obligation — its behaviour is asserted
-- through the two RPCs that call it (the order-symmetry vectors in both rules suites).
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
       and not perdonada
       and created_at >= now() - interval '15 minutes'
  );
$$;

revoke execute on function public.visita_reciente(uuid, date, boolean) from public, anon;
grant execute on function public.visita_reciente(uuid, date, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 2. cancel_class_session — before-start only (§4); the gym cancels, every hold is RELEASED (#172).
-- ══════════════════════════════════════════════════════════════════════════════════
-- Signature, return type and security posture are unchanged (see §1), so CREATE OR REPLACE keeps the
-- ACL. The `not found` refusal stays 'Sesión no encontrada o ya cancelada' — re-cancelling still
-- refuses, which is also what makes the release idempotent: a second call cannot reach the refund at
-- all, so no member is ever paid twice.
--
-- The single UPDATE became a read-then-write for one reason: a PAST session and a MISSING one need
-- different answers, and a `starts_at > now()` clause folded into the UPDATE's WHERE would collapse
-- both into 'Sesión no encontrada o ya cancelada'. The read is RLS-scoped exactly as the UPDATE was
-- (`is_staff_of(gym_id)`), so another gym's session is still simply not found; and the UPDATE keeps
-- its own `cancelled_at is null` guard, so a concurrent double-cancel is still refused by the write,
-- not merely by the read.
create or replace function public.cancel_class_session(p_session_id uuid)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_starts timestamptz;
begin
  if public.staff_gym() is null then raise exception 'No autorizado'; end if;

  -- RLS scopes this read to is_staff_of(gym_id), exactly as it scoped the UPDATE before §4.
  select starts_at into v_starts
    from public.class_session where id = p_session_id and cancelled_at is null;
  if not found then raise exception 'Sesión no encontrada o ya cancelada'; end if;

  -- §4 BEFORE-START ONLY, the mirror of cancelar_reserva's own gate (20260803140000:289-291) and its
  -- sentence. A class that has already run cannot be "cancelled": its still-`reservada` rows are the
  -- NO-SHOWS the roster derives, and releasing them would refund forfeited holds and erase the
  -- absences in the same statement. Above every write, so the raise leaves the session, the
  -- reservations and every balance untouched.
  if v_starts <= now() then raise exception 'La clase ya comenzó'; end if;

  update public.class_session set cancelled_at = now()
   where id = p_session_id and cancelled_at is null;   -- RLS scopes to is_staff_of(gym_id)
  if not found then raise exception 'Sesión no encontrada o ya cancelada'; end if;

  -- RELEASE THE HOLDS, in this same transaction. One statement, so the flip and the refund cannot
  -- come apart: the data-modifying CTE cancels every still-held booking and RETURNS what each one
  -- spent, and the outer UPDATE pays exactly those members back.
  --
  --   status = 'reservada'   — ONLY a live hold is released. An `asistida` row is a CAPTURED hold:
  --                            the member came, the class happened for them, and re-crediting it
  --                            would mint a class out of an attendance record. Terminal rows
  --                            (cancelada/no_show) already settled.
  --   l.consumio             — C12, verbatim from cancelar_reserva (20260803140000:322-326): refund
  --                            exactly what the booking took. A booking made under ilimitado stamped
  --                            consumio=false and gets nothing, even if the member has since moved to
  --                            a finite plan (the phantom-credit fix; C4 purchase-wins).
  --   clases_restantes is not null — the ilimitado half of that same guard. Unlimited means unlimited:
  --                            the NULL is never touched, ever (ADR-0004 / ADR-0010 §4).
  --
  -- One member cannot be paid twice in one call: `reservation_member_session_uq` (member_id,
  -- class_session_id) means `liberadas` holds at most one row per member, so the outer UPDATE can
  -- never match the same cliente row twice (which Postgres would silently collapse to a single +1).
  with liberadas as (
    update public.reservation
       set status = 'cancelada', cancelled_at = now()
     where class_session_id = p_session_id and status = 'reservada'
    returning member_id, consumio
  )
  update public.clientes c
     set clases_restantes = c.clases_restantes + 1
    from liberadas l
   where c.id = l.member_id and l.consumio and c.clases_restantes is not null;
end;
$function$;

-- Posture parity (idempotent — the CREATE OR REPLACE above preserved the existing ACL).
revoke execute on function public.cancel_class_session(uuid) from public, anon;
grant execute on function public.cancel_class_session(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 3. pasar_lista_sesion — the CAPTURE seam. Widened return + session-instant attribution.
-- ══════════════════════════════════════════════════════════════════════════════════
-- Replayed forward from 20260804120000 (its current body) with exactly two semantic changes:
--
--   (A) `resultado`, the outcome discriminator the desk shows the operator (#233 story 6):
--         'reserva'    — the BOOKED branch: an existing hold was CAPTURED (reservada→asistida,
--                        consumio=false, nothing charged, because the booking already paid).
--         'descontada' — the finite decrement actually ran (a walk-in charged against the package).
--         'gratis'     — admitted with no charge: ilimitado, or a cooldown-pardoned second record of
--                        one arrival. Free is not the same fact as captured, which is why it is not
--                        'reserva'.
--         NULL         — every toggle-OFF/un-mark path. Nothing was settled, so nothing is disclosed;
--                        the UI keeps its existing un-mark copy.
--
--   (B) THE VISIT STAMP COMES FROM THE SESSION (#166). `hora` was `now()`-if-the-session-is-today,
--       else NULL — so a roster marked the next morning stamped either the data-entry hour or
--       nothing at all, and the charge landed against whatever package was valid at typing time.
--       This seam is ALWAYS session-scoped (p_session_id is required), so the truthful instant is the
--       class's own: `v_hora` is now `starts_at` in the gym's timezone, the exact pair of `v_fecha`,
--       which has ALWAYS been the session's own gym-local date. One consequence worth naming: hora is
--       no longer nullable here — a class has a start time whenever it is marked. The class-less
--       ACCESO LIBRE path in toggle_pase below has no session and correctly keeps `now()`/p_fecha.
--       `checked_at` stays `now()`: it records when the OPERATOR acted, which is audit, not attribution.
--
--   (D) THE CHAIN-BREAKER `and not exists (…)` IS DELETED from the cooldown gate (§3). Its job — "a
--       row that paid nothing pardons nothing" — moved into visita_reciente, where it is keyed on the
--       recent row's own `perdonada` rather than on a closed-window booking's existence. That proxy
--       only held while the arm §2 deletes existed to make such rows free; keeping it would have cost
--       a member an extra credit for recording one arrival door-first instead of class-first.
--
-- Everything else is byte-for-byte 20260804120000.
drop function if exists public.pasar_lista_sesion(uuid, uuid);

create function public.pasar_lista_sesion(p_session_id uuid, p_cliente_id uuid)
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
  v_perdonada boolean := false;   -- (ii) true ONLY on the cooldown pardon
  v_hora     time;
  v_saldo    int;                 -- (i) the balance AFTER the write — the returned one
  v_resultado text;               -- (A) the settlement outcome disclosed to the operator (#233)
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
    -- (A) resultado is NULL on every un-mark: an undo settles nothing, so it discloses nothing.
    return query select false, null::text, p_session_id, v_saldo, null::text;
    return;
  end if;

  -- ── TOGGLE ON ──────────────────────────────────────────────────────────────────
  -- (B) #166: the visit is stamped from the CLASS's own instant in the gym's timezone — the exact pair
  -- of v_fecha above — never from now(). Marking a roster late no longer records the data-entry hour
  -- (or, past midnight, no hour at all) and no longer settles against whatever package happens to be
  -- valid at typing time. See the header for why checked_at stays now().
  v_hora := (v_starts at time zone v_tz)::time;

  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    -- BOOKED member: already consumed at booking. Flip to asistida; DO NOT consume. This is also where
    -- toggle_pase's in-window attribution lands (a reservada booking has no active class row, so the
    -- delegated tap can only arrive HERE — it can never take the untoggle branch above).
    -- (A) THE CAPTURE: the hold taken at reservar_clase is settled here, which is what 'reserva' names.
    update public.reservation set status = 'asistida', checked_at = now() where id = v_res_id;
    v_consumio := false;
    v_resultado := 'reserva';
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
    -- visit count must skip it. Only here — never on the booked branch.
    --
    -- (iv) A ROW THAT PAID NOTHING PARDONS NOTHING — and since §3 that rule lives INSIDE
    -- visita_reciente (`and not perdonada`), which is why this is now a bare call. It used to be a
    -- call plus a `not exists` chain-breaker that looked for a closed-window `reservada` booking; that
    -- predicate was a proxy for "the recent row was free", exact only while toggle_pase's
    -- closed-window arm existed to make it free. §2 deleted that arm, which inverted the proxy into an
    -- ORDER-DEPENDENT DOUBLE CHARGE (door→class cost one credit more than class→door for the same
    -- arrival), so it is DELETED and replaced by the row's own payment fact. Read §3 for the
    -- enumeration; the two rules suites pin both orders.
    if public.visita_reciente(p_cliente_id, v_fecha, false) then
      v_consumio := false;
      v_perdonada := true;
      v_resultado := 'gratis';   -- (A) admitted, nothing charged: the second record of one arrival.
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
      -- (A) the discriminator IS the charge decision, read off the same expression: a finite plan is
      -- about to be decremented ('descontada'); ilimitado never is ('gratis').
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
    end if;
  end if;

  -- The attendance row IS the asistida state of the reservation (ADR-0010 §5): linked to both.
  -- origen = 'clase', the stated kind that pairs with class_session_id (asistencias_origen_kind_ck).
  insert into public.asistencias (cliente_id, fecha, hora, consumio, gym_id, class_session_id, reservation_id, origen, perdonada)
  values (p_cliente_id, v_fecha, v_hora, v_consumio, v_gym, p_session_id, v_res_id, 'clase', v_perdonada);

  select c.clases_restantes into v_saldo from public.clientes c where c.id = p_cliente_id;
  return query select true, to_char(v_hora, 'HH24:MI'), p_session_id, v_saldo, v_resultado;
end;
$function$;

-- The DROP took the grants with it — re-issue the ADR-0005 lockdown.
revoke execute on function public.pasar_lista_sesion(uuid, uuid) from public, anon;
grant execute on function public.pasar_lista_sesion(uuid, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 4. toggle_pase — same widened return; the CLOSED-WINDOW PARDON is DELETED (the forfeit).
-- ══════════════════════════════════════════════════════════════════════════════════
-- Replayed forward from 20260804120000 with exactly two semantic changes:
--
--   (A) `resultado`, identical semantics to pasar_lista_sesion above. Both delegation branches
--       (`p_session_id is not null`, and the in-window attribution) are `return query select * from
--       public.pasar_lista_sesion(...)`, so they pass the widened row — including its resultado —
--       straight through. A desk tap that attributes to a class therefore reports 'reserva' when it
--       captured a hold, which is precisely what the operator needs to say at the counter.
--
--   (C) THE CLOSED-WINDOW PARDON IS DELETED (was 20260804120000:403-435). The `if exists(closed
--       window booking) … else` wrapper is gone and its ELSE arm — the ordinary walk-in path — is now
--       unconditional. A member who missed their booking and arrives afterwards is an ordinary door
--       visit: the C9 vence gate applies, the cooldown applies, the #237 gate applies, and a finite
--       plan is charged. Their booking is not touched at all — it stays `reservada`, its hold stays
--       taken, and `no_show` DERIVES from it at read. That absence of writes IS the forfeit; there is
--       no status write and no sweep. See the header for the one live consequence (expired + missed
--       booking is now refused at the door, because the pardon used to sit above the vence gate).
--
-- The ACCESO LIBRE path has no session, so its `v_hora`/p_fecha rule is deliberately UNCHANGED: #166's
-- session-instant attribution belongs to pasar_lista_sesion, which is the only seam that has a class.
-- Everything else is byte-for-byte 20260804120000.
drop function if exists public.toggle_pase(uuid, date);
drop function if exists public.toggle_pase(uuid, date, uuid);

create function public.toggle_pase(p_cliente_id uuid, p_fecha date, p_session_id uuid default null)
 returns table(present boolean, hora text, session_id uuid, clases_restantes int, resultado text)
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
  v_resultado text;                 -- (A) the settlement outcome disclosed to the operator (#233)
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
    -- (A) resultado is NULL on every un-mark: an undo settles nothing, so it discloses nothing.
    return query select false, null::text, null::uuid, v_saldo, null::text;
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
  --   cancelled_at is null  — a cancelled class attributes nothing. Since #233 it also has nothing left
  --                           to compensate: cancel_class_session releases every hold on the spot.
  --   date = p_fecha        — the cooldown's own equality, for the same reason: a BACKDATED desk entry
  --                           (last Tuesday's door check, typed now) must never attribute to today's
  --                           class merely because now() sits in its window.
  --   window @> now()       — the whole point. PRE-window (>90 min early) matches nothing here and
  --                           falls through to the walk-in path, which CHARGES: that is a separate
  --                           visit. CLOSED-window ALSO falls through to it now (the pardon is gone,
  --                           (C) below) — the missed booking's hold is forfeited, and the door visit
  --                           the member is making is its own visit and pays for itself.
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
    -- asistida, consumio = false, nothing charged, resultado 'reserva' (the hold is CAPTURED).
    -- Arm-only holds by construction, not by a flag.
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

  -- (C) #233: THE CLOSED-WINDOW PARDON STOOD HERE AND IS DELETED. It recorded a FREE door visit for a
  -- member whose booking's window had closed — the compensation a gym-cancelled booking had until #172,
  -- and an apology for a charge the member's own no-show had already earned. §1 above gives the
  -- gym-cancel case a real refund, and the ruling forfeits the no-show case: the booking is left
  -- strictly alone (still reservada, hold still taken, no_show DERIVES at read — zero writes), and the
  -- member standing at the door is making an ordinary ACCESO LIBRE visit. So the walk-in path below is
  -- now unconditional; nothing about holding a missed booking changes what a door tap costs or which
  -- gates it passes.
  --
  -- WALK-IN path: no booking paid for this visit. This is also where a PRE-window booked member lands
  -- (>90 minutes early) — by design: they came for something other than the class they booked, and
  -- the second visit charges.
  -- C9 vigencia (inclusive): an expired package has no entitlement — block the walk-in mark. vence
  -- < p_fecha blocks; the vence day itself (vence = p_fecha) still passes. Since (C) this gate is no
  -- longer bypassed by holding a missed booking — that member is refused here like any other.
  if v_vence is not null and v_vence < p_fecha then
    raise exception 'Paquete vencido';
  end if;
  -- COOLDOWN. p_clase => true: only a recent CLASS row on this same fecha pardons this
  -- class-less mark — the member walked through the door minutes either side of a class that was
  -- already charged, which is ONE arrival. Beyond 15 minutes this is a genuinely separate visit
  -- and R1 charges for it.
  -- (v) `perdonada` records precisely that: second record, one arrival — the row a visit count skips.
  --
  -- The CALL is byte-identical to 20260804120000; what changed is underneath it. Since §3
  -- visita_reciente ignores rows that were themselves pardoned, so this seam — which never had a
  -- chain-breaker of its own, and could therefore be pardoned in turn by a free class row — is now
  -- protected on the same terms as pasar_lista_sesion's. Both surfaces, one rule, keyed on payment.
  if public.visita_reciente(p_cliente_id, p_fecha, true) then
    v_consumio := false;
    v_perdonada := true;
    v_resultado := 'gratis';   -- (A) admitted, nothing charged: the second record of one arrival.
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
    -- (A) the discriminator IS the charge decision, read off the same expression.
    v_resultado := case when v_consumio then 'descontada' else 'gratis' end;
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
  return query select true, to_char(v_hora, 'HH24:MI'), null::uuid, v_saldo, v_resultado;
end;
$function$;

-- The DROP took the grants with it — re-issue the ADR-0005 lockdown.
revoke execute on function public.toggle_pase(uuid, date, uuid) from public, anon;
grant execute on function public.toggle_pase(uuid, date, uuid) to authenticated;
