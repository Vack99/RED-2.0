-- CORTE DE RESERVAS — a per-gym booking cutoff (owner ruling 2026-09-02).
--
-- THE RULE, stated once: a member may not book a class once the class is within THREE HOURS of
-- starting; and for a class that starts before 09:00 gym-local, the door closes even earlier — at
-- 22:00 the previous gym-local evening. The cutoff is the LEAST of the two, so the early-morning
-- class is governed by the night before rather than by a 3-hour window nobody is awake for.
--
-- WHY A GYM-LEVEL BOOLEAN, DEFAULT OFF. This is a house policy, not a platform rule: a gym that
-- wants same-hour walk-up bookings must keep them. Every existing gym therefore keeps today's
-- behaviour (no cutoff) and only RED — which asked for it — is flipped on below, by SLUG, the same
-- key every seed/flip migration here uses (20260826120100's `forge` flip is the direct precedent).
-- The statement is a no-op wherever that gym does not exist, so it is inert on a scratch project.
--
-- STAFF ARE NOT SUBJECT TO IT. `reservar_clase`'s operator arm (`p_cliente_id` given) bypasses the
-- gate entirely: the cutoff exists to stop a member self-serving a seat the coach can no longer
-- plan around, and the operator at the desk IS the person doing that planning. This is the OPPOSITE
-- posture from `booking_enabled` (which refuses both arms, 20260826120100) and deliberately so —
-- that switch says "this gym takes no bookings at all", this one says "the member's door has
-- closed", and a closed member door still has a desk behind it. It is also the opposite of the
-- money gates (#235: no staff override of cupo/balance/expiry), because those protect an
-- entitlement the operator cannot conjure, and a seat that is still empty is not one of them.

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE COLUMN
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- COLUMN GRANTS, not just a policy: 20260802120000 revoked the table-wide grant on `gym`, so a new
-- column is invisible to both apps until it is granted here. The grant pair MIRRORS
-- `booking_enabled` exactly — `authenticated` (20260826120100) plus `anon` (20260901130000's Lista
-- widening) — because the two columns are read through the same seams and by the same readers:
-- `resolverMiembroGym`/`getGymDeMiembro` for the signed-in member, and the computed column in §3
-- below, which is SECURITY INVOKER and therefore needs the CALLER's own column privilege on
-- `corte_reservas` to answer at all. Keeping the pair symmetric is what stops the anon half of the
-- member surface (the pre-login agenda preview) reading one mode column and 42501-ing on the other.
alter table public.gym
  add column corte_reservas boolean not null default false;

comment on column public.gym.corte_reservas is
  'Per-gym booking cutoff. true = reservar_clase refuses a MEMBER booking once now() has passed the class''s corte_reserva() instant (3h before start, or 22:00 the previous gym-local evening for a class starting before 09:00 — whichever is earlier). Staff-on-behalf bookings are exempt. Default false: no cutoff, today''s behaviour.';

grant select (corte_reservas) on public.gym to authenticated, anon;

update public.gym set corte_reservas = true where slug = 'red';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. THE RULE AS ONE FUNCTION
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ONE definition of "when does this class close", called by both the write gate (§4) and the read
-- surface (§3). The alternative — the RPC raising on one arithmetic and the agenda greying out on
-- another, written twice — is exactly how a member ends up looking at a live CTA that dead-ends in
-- a refusal (the #118 E4 shape).
--
-- DST-SAFE by construction. The previous evening's 22:00 is built as a LOCAL WALL CLOCK
-- (`(date + time '22:00')`, a `timestamp without time zone`) and only then converted with
-- `at time zone p_tz`, which is the direction that respects that day's real UTC offset. Composing
-- it the other way — `p_starts - interval '22 hours'` or any absolute-offset arithmetic — silently
-- drifts by an hour across a transition. The 3-hour arm is deliberately absolute (`timestamptz -
-- interval '3 hours'`): "three hours before the class" is a duration, not a wall clock, and must
-- not stretch to four across a fall-back.
--
-- STABLE, not IMMUTABLE. `timestamptz - interval` is STABLE in Postgres (`timestamptz_mi_interval`
-- consults the TimeZone GUC for the day/month fields of the interval — irrelevant for a pure
-- 3-hour one, but the declared volatility is what the planner reads). Declaring this IMMUTABLE
-- would be a promise the body cannot keep and would license const-folding a cached plan across
-- sessions with different TimeZone settings. Nothing here needs immutability: there is no index and
-- no generated column over it, only per-row evaluation.
create or replace function public.corte_reserva(p_starts timestamptz, p_tz text)
  returns timestamptz
  language sql
  stable
  set search_path to ''
as $function$
  select case
           when extract(hour from (p_starts at time zone p_tz)) < 9
             -- Before 09:00 local: the LEAST of the two doors. `least` (not an unconditional
             -- previous-22:00) is what keeps a 00:30 class honest — 22:00 the night before is
             -- LATER than 3h before a half-past-midnight start, so the 3-hour rule still wins.
             then least(
                    p_starts - interval '3 hours',
                    ((((p_starts at time zone p_tz)::date - 1) + time '22:00') at time zone p_tz)
                  )
           else p_starts - interval '3 hours'
         end;
$function$;

revoke execute on function public.corte_reserva(timestamptz, text) from public;
grant  execute on function public.corte_reserva(timestamptz, text) to authenticated, anon;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. THE READ SURFACE — `class_session.cierre_reservas`
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- A PostgREST COMPUTED COLUMN: a function named for the column, taking the table's row type, which
-- PostgREST serves inside an ordinary `.select("…, cierre_reservas")` on `class_session` — including
-- inside an embed (`reservation → class_session(…)`). It is the answer to "where does the member
-- agenda get this fact" that does NOT require a view: the member reader
-- (packages/data/src/server/agenda-miembro.ts) is a plain table select, and wrapping it in a view
-- would mean re-deriving that table's RLS, grants and every other column for one derived field.
--
-- NULL when the gym runs no cutoff, which is the whole point of the shape: the client renders a
-- closing time when there IS one and nothing when there is not, without holding the rule, the
-- gym's timezone, or a boolean it would have to combine correctly. The TS side does no tz math.
--
-- SECURITY INVOKER (the default), deliberately: it must be exactly as readable as the gym row it
-- reads. `gym` is SELECT-readable to member and anon alike (ADR-0013 §3), and the two columns it
-- touches — `timezone` and `corte_reservas` — are both column-granted to both roles (§1 above, and
-- 20260713190100 for `timezone`). A definer here would have leaked a gym's policy to a caller who
-- cannot see that gym at all.
create or replace function public.cierre_reservas(public.class_session)
  returns timestamptz
  language sql
  stable
  set search_path to ''
as $function$
  select case when g.corte_reservas then public.corte_reserva($1.starts_at, g.timezone) end
    from public.gym g
   where g.id = $1.gym_id;
$function$;

revoke execute on function public.cierre_reservas(public.class_session) from public;
grant  execute on function public.cierre_reservas(public.class_session) to authenticated, anon;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. `reservar_clase` — ONE new gate
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Replayed forward from 20260901150000 with exactly two changes: the gym read that already fetches
-- `timezone, booking_enabled` (under the same `for share` row lock) now also fetches
-- `corte_reservas`, and one gate lands immediately after the 'Reservas deshabilitadas' refusal and
-- before the two 'Paquete vencido' arms. Everything else is byte-identical — same signature, same
-- SECURITY DEFINER, same `set search_path to ''`, so CREATE OR REPLACE carries the ADR-0005 EXECUTE
-- grant untouched and adds NO overload (the one live signature is `(uuid, uuid)`; the 1-arg form was
-- dropped by 20260804130000 — the 2026-08-27 registrar_venta PGRST203 outage is the reason that is
-- worth stating).
--
-- WHY THERE. Above every write, like every other refusal in this body, so a refusal leaves the
-- reservation and the balance untouched. Below the gym switch because "this gym takes no bookings"
-- is the broader fact and should be the sentence a member gets when both are true. Above the vence
-- gates because the cutoff is about the CLASS, not the member's entitlement — telling someone their
-- package expired when the real reason is that the door shut sends them to the desk to buy
-- something that would not have helped.
create or replace function public.reservar_clase(p_session_id uuid, p_cliente_id uuid default null)
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
  v_starts    timestamptz;          -- #165: the started-class gate's only input
  v_member    uuid;
  v_clases    int;
  v_vence     date;
  v_tz        text;
  v_reservas  boolean;              -- the gym's booking switch
  v_corte     boolean;              -- the gym's booking CUTOFF switch (2026-09-02)
  v_hoy       date;
  v_sesion_fecha date;              -- #244 guard 1: the SESSION's own gym-local date
  v_active    int;
  v_res_id    uuid;
  v_status    text;
  v_consumio  boolean := false;   -- C12: did the finite decrement actually run? (ilimitado leaves false)
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The session. gym is derived from HERE — never a client parameter, and never the CALLER's gym either
  -- (#237): a multi-gym operator aims at a session, and the session names the tenant.
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
  -- SHARED by both identity paths, deliberately: an operator cannot create a booking in the past either.
  if v_starts <= now() then
    raise exception 'La clase ya comenzó';
  end if;

  -- ── IDENTITY: the ONE branch 20260804130000 added (#237) ───────────────────────
  -- Everything above and everything below is shared. Only WHO is being booked is decided here, and the
  -- two arms leave the same three variables set (v_member, v_clases, v_vence) so the rest cannot fork.
  if p_cliente_id is null then
    -- MEMBER SELF PATH: the caller's OWN cliente in THIS gym — the auth.uid() self-pin that scopes the
    -- whole definer body (the identity is never a parameter on this arm). This is also the tenant gate.
    select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
      from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
    if not found then
      raise exception 'No eres miembro de este gimnasio';
    end if;
  else
    -- OPERATOR PATH. SECURITY DEFINER means RLS will not run for this body, so the boundary the staff
    -- policies would have drawn is drawn here instead, in two halves and in this order:
    --   (a) STAFF OF THE SESSION'S GYM. Checked FIRST — before the target is looked up — so a caller
    --       who is not staff cannot use the refusal message to probe which cliente ids exist in a gym.
    if not public.is_staff_of(v_gym) then
      raise exception 'No autorizado';
    end if;
    --   (b) THE TARGET BELONGS TO THAT SAME GYM. The gym pin is the whole cross-tenant guarantee.
    select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  -- The gym's own row: its clock (server-authoritative, never a p_tz param) and its two switches.
  -- `for share` (#331 review fix, 20260901150000) blocks behind a concurrent cambiar_modo_reservas /
  -- cambiar_corte_reservas UPDATE of the SAME row, so a booking cannot commit against a switch state
  -- that was flipped out from under it. Two bookings for the same gym still run concurrently.
  select timezone, booking_enabled, corte_reservas into v_tz, v_reservas, v_corte
    from public.gym where id = v_gym for share;

  -- THE GYM SWITCH (2026-08-26). A gym with booking_enabled = false does not take reservations at
  -- all: no hold, no row, no decrement. Above every write, like every other refusal here.
  if not v_reservas then
    raise exception 'Reservas deshabilitadas';
  end if;

  -- THE CUTOFF (2026-09-02). MEMBER ARM ONLY (`p_cliente_id is null`) — the desk is not subject to
  -- the member's closing time; see this file's header for why that differs from booking_enabled.
  -- `now() >= corte_reserva(...)` makes the cutoff instant itself CLOSED, matching the #165 gate's
  -- own `<=` boundary posture: the moment named as the close is past the door, not inside it.
  if p_cliente_id is null and v_corte and now() >= public.corte_reserva(v_starts, v_tz) then
    raise exception 'Reservas cerradas para esta clase';
  end if;

  -- Expiry: vence is the stacked expiry (ADR-0004); a lapsed vigencia blocks booking for finite AND
  -- ilimitado alike — an expired membership has no entitlement. NO staff override (#235): an operator
  -- hits this gate too, and the answer is to sell first.
  v_hoy := (now() at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_hoy then
    raise exception 'Paquete vencido';
  end if;

  -- #244 guard 1 (weakness 4): a package that is still valid TODAY can still lapse before the class
  -- itself happens — the gap the gate above cannot see. Same vigencia rule, same message, no
  -- ilimitado exemption (mirrors the gate above exactly).
  v_sesion_fecha := (v_starts at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_sesion_fecha then
    raise exception 'Paquete vencido';
  end if;

  -- Zero balance blocks — FINITE only. Ilimitado (clases_restantes IS NULL) is EXEMPT here and from the
  -- decrement below (ADR-0004 / ADR-0010 §4: unlimited means unlimited). No staff override (#235).
  if v_clases is not null and v_clases <= 0 then
    raise exception 'Sin clases disponibles';
  end if;

  -- Serialize concurrent bookings of the SAME session so the capacity check + insert are race-free.
  -- Keyed on the SESSION, so a member booking themselves and an operator booking them serialize together.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_session_id::text));

  -- Existing reservation for this (member, session) — the UNIQUE guarantees at most one. An ACTIVE one is
  -- a duplicate; a terminal one (cancelada/no_show) is REUSED (ADR-0010 §5: re-book reuses the row).
  select id, status into v_res_id, v_status
    from public.reservation where member_id = v_member and class_session_id = p_session_id;
  if v_res_id is not null and v_status in ('reservada', 'asistida') then
    raise exception 'Ya reservaste esta clase';
  end if;

  -- Capacity vs the DERIVED active count (the one seam) — MEMBER-facing, walk-in-excluded: a walk-in
  -- mark never consumed a bookable spot (owner ruling 2026-08-03), so it must not close one here either.
  select coalesce((select activos from public.contar_reservas_activas_miembro(array[p_session_id])), 0)
    into v_active;
  if v_active >= v_cap then
    raise exception 'Clase llena';
  end if;

  -- Write the reservation: reuse the terminal row or insert fresh (UNIQUE keeps one row per member+session).
  -- gym_id is stamped from the SESSION's gym on both paths. is_walk_in stays FALSE for an operator-made
  -- booking too (#235): a phone booking IS a reserva.
  if v_res_id is not null then
    update public.reservation
       set status = 'reservada', is_walk_in = false, cancelled_at = null, checked_at = null,
           -- D6: the reused row is a NEW booking, and now() is when it was made. The stale moment
           -- would attribute this charge to the pack that was live at the FIRST booking.
           created_at = now()
     where id = v_res_id;
  else
    insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (v_gym, p_session_id, v_member, 'reservada')
    returning id into v_res_id;
  end if;

  -- Consume exactly one class — FINITE only (ilimitado NULL skips entirely). Row-locked by the UPDATE,
  -- guarded (`> 0`, never below zero), atomic with the reservation write above. The `not found` raise
  -- covers the concurrent-same-member race and rolls the whole booking back.
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
  -- spent. Stamps both a fresh insert (default false) and a reused terminal row.
  update public.reservation set consumio = v_consumio where id = v_res_id;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   -- NULL for ilimitado
  return next;
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. `cambiar_corte_reservas` — the operator's switch
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- The sibling of `cambiar_modo_reservas` (20260901140000) with its cascade REMOVED, because there
-- is nothing to cascade: turning the cutoff ON closes a door for FUTURE booking attempts and says
-- nothing about bookings already made. A member who booked a 07:00 class yesterday still holds that
-- seat when the gym switches the cutoff on at midnight — retro-cancelling those would be the switch
-- taking money and seats it was never asked to take. (`cambiar_modo_reservas` cancels precisely
-- because ITS off-state means "this gym takes no bookings at all", which a live hold contradicts.)
--
-- SECURITY INVOKER (the ADR-0005 default) — nothing here needs a definer bypass. `staff_gym`/
-- `is_staff_of` are readable to any authenticated caller, and the one write RLS could not previously
-- express, `gym.corte_reservas`, is opened by the same grant-then-policy idiom `gym_staff_update`
-- (20260808130000's `legal_name`, then `booking_enabled`) already established: the policy is
-- command-scoped, not column-scoped, so a column grant is all the new column needs.
grant update (corte_reservas) on public.gym to authenticated;

create or replace function public.cambiar_corte_reservas(p_activar boolean, p_gym_id uuid default null)
  returns void
  language plpgsql
  set search_path to ''
as $function$
declare
  v_gym uuid;
begin
  -- The same multi-gym resolution every other staff RPC uses (cambiar_modo_reservas, registrar_venta,
  -- editar_venta, cancel_class_session): a caller-supplied gym is honored only if the caller staffs
  -- it; omitted, it falls back to the caller's first staffed gym. Same two refusal messages.
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- Naturally idempotent: without a cascade there is no work that a second call at the same target
  -- state could repeat, so this needs no `v_actual = p_activar` early return — the UPDATE is the
  -- whole body. `not found` cannot fire for a gym that staff_gym()/is_staff_of just vouched for;
  -- it is kept for parity with cambiar_modo_reservas' message set.
  update public.gym set corte_reservas = p_activar where id = v_gym;
  if not found then raise exception 'Gimnasio no encontrado'; end if;
end;
$function$;

revoke execute on function public.cambiar_corte_reservas(boolean, uuid) from public, anon;
grant  execute on function public.cambiar_corte_reservas(boolean, uuid) to authenticated;
