-- Four mechanical scheduling guards from the #136 recurrence cross-examination (#244).
-- docs/Context/2026-08-04-136-recurrence-cross-examination.md — weaknesses 4, 6, 9, 10.
--
-- Composition with the two sibling migrations already in this tree (neither yet on live):
--   * 20260804150000_settlement_hold_capture_forfeit.sql owns the LATEST toggle_pase/
--     pasar_lista_sesion — untouched here (#244 does not touch attendance).
--   * 20260805100000_class_horizon_autoroll.sql moved the materialization RULE into
--     materialize_week_for_gym + wraps it as ensure_week_materialized/cron_materialize_horizon.
--     Guard 2 (the timezone trigger) is that migration's own weakness-6 note turned into code — the
--     cron's per-gym subtransaction (its #1 hardening item) isolates the BLAST RADIUS of a bad
--     gym.timezone to one gym per run; this migration stops the bad value from ever being written,
--     which is strictly earlier in the chain and does not change the cron's own catch/report shape.
--
-- Guard 3 (clamping `?d=` materialization to [this week's Monday, +1 year]) is a TypeScript-only
-- change at the DAL seam (packages/data/src/server/agenda.ts) — no SQL lands for it here.
--
-- House idiom: `set search_path to ''`, schema-qualified names, revoke/grant re-issued only where a
-- signature changes. Both `reservar_clase` and `create_recurring_schedule` below are CREATE OR
-- REPLACE at their EXISTING signatures — no DROP, so their EXECUTE grants carry untouched.

-- ══════════════════════════════════════════════════════════════════════════════════
-- GUARD 1 (weakness 4): book-beyond-entitlement — vence vs the SESSION's date, not today's.
-- ══════════════════════════════════════════════════════════════════════════════════
-- `reservar_clase`'s existing expiry gate (20260804130000:130-132) checks `vence` against TODAY —
-- a member whose package expires tomorrow can still book a class dated next month, spending a
-- credit on a class they will never be entitled to attend. Same signature, same DEFINER/INVOKER
-- posture, same body otherwise byte-identical: ONE new gate inserted directly below the existing
-- today-gate, comparing `vence` against the session's OWN gym-local date (derived from `v_starts`,
-- already read at the top of the function — never a client parameter).
--
-- SAME MESSAGE, deliberately ('Paquete vencido'): the member's package genuinely will not cover
-- that class, which is exactly what the existing sentence already says truthfully; a second, more
-- specific string would just be two spellings of the same fact for the member to learn.
--
-- ILIMITADO DECISION: the gate applies uniformly, no clases_restantes condition — mirroring the
-- EXISTING today-gate exactly (20260804130000:130-132 has no ilimitado exemption either). `vence` is
-- membership validity (ADR-0004), orthogonal to the credit balance: an expired ilimitado membership
-- has no entitlement to book ANY future class, today's date or the session's, same as a finite one.
--
-- The new gate is STRICTER than the existing one for any class that has not started yet (the started-
-- class gate above it, #165, already guarantees the session's gym-local date is never before today's),
-- so it never contradicts the old gate — it only catches the gap the old one missed. Both are kept
-- (not merged into one) so the diff against 20260804130000 stays a pure addition.
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

  -- ── IDENTITY: the ONE branch this migration adds (#237) ────────────────────────
  -- Everything above and everything below is shared. Only WHO is being booked is decided here, and the
  -- two arms leave the same three variables set (v_member, v_clases, v_vence) so the rest cannot fork.
  if p_cliente_id is null then
    -- MEMBER SELF PATH, unchanged: the caller's OWN cliente in THIS gym — the auth.uid() self-pin that
    -- scoped the whole definer body before this parameter existed (the identity is never a parameter on
    -- this arm). This is also the tenant gate: a caller with no cliente in the session's gym is refused
    -- here. Columns are alias-qualified (c.) — the RETURNS TABLE OUT param `clases_restantes` shares the
    -- column's name.
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
    --       No self-exception: a plain member naming their own id lands here and is refused. Their door
    --       is the one-argument call.
    if not public.is_staff_of(v_gym) then
      raise exception 'No autorizado';
    end if;
    --   (b) THE TARGET BELONGS TO THAT SAME GYM. The gym pin is the whole cross-tenant guarantee: a
    --       cliente id from another gym finds no row and is refused, so a booking can never straddle a
    --       tenant boundary even though the caller is legitimately staff somewhere.
    select c.id, c.clases_restantes, c.vence into v_member, v_clases, v_vence
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  -- Expiry: the gym's own clock (server-authoritative, never a p_tz param). vence is the stacked expiry
  -- (ADR-0004); a lapsed vigencia blocks booking for finite AND ilimitado alike — an expired membership
  -- has no entitlement (matches derivarEstado's sin_clases on dias<=0). NO staff override (#235): an
  -- operator hits this gate too, and the answer is to sell first.
  select timezone into v_tz from public.gym where id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_hoy then
    raise exception 'Paquete vencido';
  end if;

  -- #244 guard 1 (weakness 4): a package that is still valid TODAY can still lapse before the class
  -- itself happens — the gap the gate above cannot see. Same vigencia rule (ADR-0004), same message
  -- (the package will not cover that class either way), no ilimitado exemption (mirrors the gate
  -- above exactly): a membership that will have expired by the session's own gym-local date has no
  -- entitlement to it, credits or no credits.
  v_sesion_fecha := (v_starts at time zone v_tz)::date;
  if v_vence is not null and v_vence < v_sesion_fecha then
    raise exception 'Paquete vencido';
  end if;

  -- Zero balance blocks — FINITE only. Ilimitado (clases_restantes IS NULL) is EXEMPT here and from the
  -- decrement below (ADR-0004 / ADR-0010 §4: unlimited means unlimited). No staff override (#235).
  if v_clases is not null and v_clases <= 0 then
    raise exception 'Sin clases disponibles';
  end if;

  -- Serialize concurrent bookings of the SAME session so the capacity check + insert are race-free (member
  -- booking is genuinely concurrent, unlike the single-operator paths). Transaction-scoped; auto-released.
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
  -- mark never consumed a bookable spot (owner ruling 2026-08-03, 20260804110000), so it must not close
  -- one here either. A terminal row we may reuse is not active, so it is not double-counted.
  select coalesce((select activos from public.contar_reservas_activas_miembro(array[p_session_id])), 0)
    into v_active;
  if v_active >= v_cap then
    raise exception 'Clase llena';
  end if;

  -- Write the reservation: reuse the terminal row or insert fresh (UNIQUE keeps one row per member+session).
  -- gym_id is stamped from the SESSION's gym on both paths. is_walk_in stays FALSE for an operator-made
  -- booking too (#235): a phone booking IS a reserva, and nothing records which operator made it.
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
  -- moves it, and only by exactly one, only on the RESOLVED v_member (the caller's own cliente on the
  -- self path, the named target on the operator path — never the operator's own balance). The `not
  -- found` raise covers the concurrent-same-member race (balance spent between the read and this lock)
  -- and rolls the whole booking back. Table-qualified: the RETURNS TABLE OUT param shares the name.
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
-- Same signature as 20260804130000 — CREATE OR REPLACE carries the EXECUTE grant, no re-issue needed.

-- ══════════════════════════════════════════════════════════════════════════════════
-- GUARD 2 (weakness 6): gym.timezone must be a real IANA zone.
-- ══════════════════════════════════════════════════════════════════════════════════
-- `gym.timezone` (20260702150000:20) is `text not null` with zero validation — a typo now silently
-- breaks that gym's OWN materialization the next time anything computes `at time zone gym.timezone`
-- (the #136 cron's per-gym subtransaction already isolates the blast radius to one gym per run; this
-- stops the bad value from ever being WRITTEN, which is strictly earlier in the chain).
--
-- A CHECK constraint cannot reliably call into pg_timezone_names as a plain expression, so this is a
-- BEFORE trigger instead: attempting `now() at time zone new.timezone` IS Postgres's own IANA
-- validation (raises invalid_parameter_value, SQLSTATE 22023, on anything pg_timezone_names does not
-- recognize) — this is chosen over an explicit `select 1 from pg_timezone_names where name = ...`
-- lookup because it reuses Postgres's own tzdata-driven acceptance rule (including abbreviations and
-- POSIX-style zones Postgres accepts) instead of maintaining a second, narrower copy of "what counts
-- as valid" that could drift from what `at time zone` itself actually accepts.
--
-- Fires on INSERT and on UPDATE OF timezone only — editing any OTHER gym column never re-validates
-- (and never needs to: the stored value already passed once, and re-running the check on every
-- unrelated write would cost every gym write a needless zone lookup). Existing live rows are untouched
-- (all valid IANA already, per the ticket) — this is a write-path gate, not a backfill.
create or replace function public.gym_validate_timezone()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  perform now() at time zone new.timezone;
  return new;
end;
$function$;

-- Same posture as revocar_sesiones_al_quitar_membresia (20260802160000): Postgres checks EXECUTE on a
-- trigger function at CREATE TRIGGER time, not on each fire, so this hardens the PostgREST surface
-- (nobody can invoke it directly as an RPC — and doing so would raise anyway, since a trigger function
-- can only run inside a trigger context) without disarming the trigger itself.
revoke execute on function public.gym_validate_timezone() from anon, authenticated, public;

drop trigger if exists gym_timezone_valid on public.gym;
create trigger gym_timezone_valid
  before insert or update of timezone on public.gym
  for each row execute function public.gym_validate_timezone();

-- ══════════════════════════════════════════════════════════════════════════════════
-- GUARD 4 (weakness 10): no duplicate-template guard.
-- ══════════════════════════════════════════════════════════════════════════════════
-- Re-creating a schedule to "fix" it currently double-books every future week with no signal until
-- the operator notices duplicated classes on the Agenda — and the only cleanup tool is cancelling one
-- instance at a time (weakness 1, the missing series-edit path — a separate, larger finding, not this
-- migration's scope). The dedup key is (gym_id, class_type_id, weekday, start_time): two DIFFERENT
-- class types at the same day/time are not a duplicate (a gym can genuinely run Yoga and Box in
-- different rooms at 18:00 Lunes) — only re-adding the IDENTICAL recurring class is.
--
-- ACTIVE TEMPLATES ONLY (`where is_active`): a deactivated template is not a live duplicate — it
-- materializes nothing (ensure_week_materialized/materialize_week_for_gym both filter `is_active`), so
-- reusing its slot for a fresh, active template is the legitimate "replace a retired schedule" path
-- and must not be blocked by its own retired predecessor.
--
-- NOTE FOR THE ORCHESTRATOR: if live already carries duplicate ACTIVE templates at the same
-- (gym_id, class_type_id, weekday, start_time), this index's build fails on apply — checked against
-- live before this migration runs, per the build brief.
create unique index if not exists schedule_template_active_uq
  on public.schedule_template (gym_id, class_type_id, weekday, start_time)
  where is_active;

-- create_recurring_schedule, same signature as 20260706120100 — CREATE OR REPLACE carries the EXECUTE
-- grant, no re-issue needed. The only change: the per-weekday template insert is wrapped so a
-- unique_violation against the index above raises a friendly, Spanish, day/time-naming refusal instead
-- of PostgREST's raw constraint-violation text. Caught PER WEEKDAY (not around the whole loop) so the
-- raised message names the SPECIFIC weekday that collided, not just "something in this batch failed" —
-- and because the loop has no partial-success path anyway: an uncaught exception anywhere in this
-- function aborts the whole call (PostgREST wraps each RPC invocation in its own transaction), so a
-- collision on ANY weekday still leaves zero new template/session rows, exactly like every other
-- refusal this RPC already raises (`class_type % no pertenece...`, `algún coach no pertenece...`).
create or replace function public.create_recurring_schedule(
  p_class_type_id uuid,
  p_weekdays int[],
  p_start_time time,
  p_duration_min int,
  p_capacity int,
  p_coach_ids uuid[] default '{}',
  p_horizon_weeks int default 6
)
 returns setof uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym    uuid := public.staff_gym();
  v_tz     text;
  v_today  date;
  v_monday date;
  v_template uuid;
  wd int;
  i  int;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.class_type where id = p_class_type_id and gym_id = v_gym) then
    raise exception 'class_type % no pertenece al gimnasio del operador', p_class_type_id;
  end if;
  if exists (select 1 from unnest(p_coach_ids) as cid
             where not exists (select 1 from public.coach where id = cid and gym_id = v_gym)) then
    raise exception 'algún coach no pertenece al gimnasio del operador';
  end if;

  foreach wd in array p_weekdays loop
    -- #244 guard 4: the unique index on ACTIVE templates (gym_id, class_type_id, weekday, start_time)
    -- turns a re-created duplicate schedule into a raised, friendly refusal instead of a silent
    -- second copy that double-materializes every future week.
    begin
      insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
      values (v_gym, p_class_type_id, wd, p_start_time, p_duration_min, p_capacity)
      returning id into v_template;
    exception when unique_violation then
      raise exception 'Ya existe un horario activo para esta clase el % a las %',
        (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])[wd + 1],
        to_char(p_start_time, 'HH24:MI');
    end;

    insert into public.schedule_template_coach (gym_id, template_id, coach_id)
    select v_gym, v_template, cid from unnest(p_coach_ids) as cid;

    return next v_template;
  end loop;

  -- Materialize the visible horizon (this week's Monday + the next p_horizon_weeks-1 weeks).
  select timezone into v_tz from public.gym where id = v_gym;
  v_today := (now() at time zone v_tz)::date;
  v_monday := v_today - ((extract(isodow from v_today)::int - 1));
  for i in 0 .. greatest(p_horizon_weeks, 1) - 1 loop
    perform public.ensure_week_materialized(v_monday + (i * 7));
  end loop;
end;
$function$;
