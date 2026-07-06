-- Booking core, slice #57 (PRD #49 S3; data-model §4/§5; ADR-0010 §3/§4/§5 — the NAMED locked exception;
-- ADR-0004 saldo; ADR-0005 atomic seam; ADR-0013 member-owned/transactional RLS class).
--
-- Booking becomes real. THREE objects, all gym-scoped, all built exactly to ADR-0010:
--   * reservation                — the booking row: states reservada|cancelada|asistida|no_show,
--                                  UNIQUE(member_id, class_session_id) so a re-book reuses the row and
--                                  double-booking is a DB invariant, not a UI hope. Member-owned /
--                                  transactional RLS (ADR-0013 §3): owning member reads their own rows
--                                  (SELECT ONLY — see the policy note), staff of the gym read+write,
--                                  nothing anon. Member WRITES happen exclusively inside the booking
--                                  RPCs — never via direct table policies, which could not express the
--                                  consume/capacity guards. *** NO stored spots/occupancy anywhere —
--                                  occupancy is DERIVED (§3). ***
--   * contar_reservas_activas    — THE single occupancy seam (§3): capacity − count(reservada|asistida).
--                                  SECURITY DEFINER because a member may see only their OWN reservation
--                                  rows (member-owned RLS), yet must read a TRUTHFUL per-session count to
--                                  know real availability — a plain RLS-scoped read would show them ~0.
--                                  Definer bypasses reservation RLS but returns ONLY (session_id, count)
--                                  — no PII — and is scoped by is_member_of(r.gym_id) so a caller counts
--                                  ONLY sessions of gyms they belong to (cross-gym counts stay invisible).
--                                  This is the ADR-0010 §3 "occupancy VIEW" done safely: a bare view can
--                                  be truthful OR gym-private, not both. Consumed by BOTH agenda readers
--                                  AND reservar_clase's capacity guard — one path, no second projection.
--   * reservar_clase             — the money path. ADR-0005 posture on everything but the definer bit:
--                                  SET search_path TO '', EXECUTE authenticated-only, every ref schema-
--                                  qualified, the whole write in ONE transaction. SECURITY DEFINER —
--                                  self-scoped by auth.uid(), the same ADR-0009-amendment precedent as
--                                  reclamar_o_crear_cliente — because the member must NOT hold a direct
--                                  reservation write policy (see the RLS note above): the row write is
--                                  a privilege the RPC exercises only after its guards pass. Every value
--                                  written is server-derived from the caller's own identity (v_member
--                                  from auth_user_id = auth.uid(); v_gym from the session row) — no
--                                  parameter can redirect the write. The three ADR-0010 §4 consume rules
--                                  a future reader must not "simplify": Ilimitado (clases_restantes IS
--                                  NULL) NEVER decrements; a finite plan is blocked at zero balance /
--                                  expired vigencia; capacity is checked against the DERIVED active
--                                  count. Duplicates rejected. Server-authoritative gym + expiry clock
--                                  (never a client parameter).
--
-- Expand-only (one new table + two functions), idempotent (create-if-not-exists + create-or-replace +
-- drop-policy-if-exists), so safe on a fresh scratch AND out-of-order on live. rls_auto_enable also flips
-- RLS on; the explicit enable here is belt-and-suspenders (house style). Every gym_id + FK column indexed
-- (ADR-0013 §2/§5); a partial index backs the hot active-count read. Helper calls wrapped in (select …).

-- ── reservation (the booking row; member-owned / transactional) ─────────────────
create table if not exists public.reservation (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gym (id) on delete cascade,
  class_session_id  uuid not null references public.class_session (id) on delete cascade,
  member_id         uuid not null references public.clientes (id) on delete cascade,
  -- reservada|asistida OCCUPY a spot (§3 "active"); cancelada|no_show do not. no_show is unwritten in
  -- v1 (§5: the enum carries the target-model state; a still-reservada past booking reads as "no asistió"
  -- and its absent refund is what makes a no-show consume).
  status            text not null default 'reservada'
                      check (status in ('reservada', 'cancelada', 'asistida', 'no_show')),
  is_walk_in        boolean not null default false,   -- operator walk-in created at Pasar lista (#58)
  checked_at        timestamptz,                       -- stamped when a reservation becomes asistida (#58)
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  -- A member holds AT MOST one reservation per session; a re-book reuses the row (ADR-0010 §5), so the
  -- occupancy count(active) can never be inflated by one member's own book/cancel churn.
  constraint reservation_member_session_uq unique (member_id, class_session_id)
);
alter table public.reservation enable row level security;
create index if not exists reservation_gym_id_idx on public.reservation (gym_id);
create index if not exists reservation_class_session_id_idx on public.reservation (class_session_id);
create index if not exists reservation_member_id_idx on public.reservation (member_id);
-- The occupancy read is count(*) per session WHERE status active — a partial index on the active subset
-- keyed by session is the exact match (query-partial-indexes), and it stays small (terminal rows excluded).
create index if not exists reservation_session_active_idx on public.reservation (class_session_id)
  where status in ('reservada', 'asistida');

-- ── RLS: member-owned / transactional (ADR-0013 §3) ─────────────────────────────
-- Staff of the row's gym read+write (roster, walk-ins, Pasar lista transitions #58).
drop policy if exists "reservation_staff_select" on public.reservation;
create policy "reservation_staff_select" on public.reservation for select to authenticated
  using ((select public.is_staff_of(gym_id)));
drop policy if exists "reservation_staff_insert" on public.reservation;
create policy "reservation_staff_insert" on public.reservation for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "reservation_staff_update" on public.reservation;
create policy "reservation_staff_update" on public.reservation for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

-- The owning member reads their OWN reservations only (member-owned read, ADR-0013 §3 — the sibling of
-- clientes' auth_user_id self-read). member_id → clientes.id, so ownership resolves auth.uid() → cliente.
--
-- DELIBERATELY NO member INSERT/UPDATE policy. A direct table write path could not carry the ADR-0010 §4
-- invariants — a policy cannot express "consumed exactly one class", "capacity not exceeded", or "only
-- the operator flips reservada→asistida" — so an open write surface would let a member mint a free
-- active row (no consume, zero balance, full class) or self-stamp asistida/checked_at. Every member
-- write therefore goes through the privileged booking RPCs below (reservar_clase here; cancel is #58),
-- which run the full guard set atomically. Member SELECT stays: mis reservas + the agenda's own-booking
-- flag are plain RLS reads.
drop policy if exists "reservation_member_select" on public.reservation;
create policy "reservation_member_select" on public.reservation for select to authenticated
  using (member_id in (select c.id from public.clientes c where c.auth_user_id = (select auth.uid())));

-- ── contar_reservas_activas — THE derived-occupancy seam (§3) ────────────────────
-- capacity − count(active) is computed by the CALLERS; this returns the active count per session. DEFINER
-- + is_member_of(r.gym_id) = truthful counts, gym-private, no PII. Keyed on the reservation's OWN gym_id
-- (not the session join) so a row can only be counted for the gym it is scoped to — combined with the
-- member-write gym pin, cross-gym inflation is closed.
create or replace function public.contar_reservas_activas(p_session_ids uuid[])
  returns table (session_id uuid, activos int)
  language sql
  stable
  security definer
  set search_path to ''
as $function$
  select r.class_session_id, count(*)::int
  from public.reservation r
  where r.class_session_id = any(p_session_ids)
    and r.status in ('reservada', 'asistida')
    and public.is_member_of(r.gym_id)
  group by r.class_session_id
$function$;

-- ── reservar_clase — the atomic money path (ADR-0005 seam; ADR-0010 §4) ──────────
-- SECURITY DEFINER, self-scoped (see header): the member holds NO direct reservation write policy, so
-- the insert/reactivate below is a privilege this function exercises only behind its full guard ladder.
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
  v_member    uuid;
  v_clases    int;
  v_vence     date;
  v_tz        text;
  v_hoy       date;
  v_active    int;
  v_res_id    uuid;
  v_status    text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The session. gym is derived from HERE — never a client parameter. (Definer bypasses RLS on this
  -- read; the tenant gate is the cliente lookup below: no cliente of the caller in THIS gym → refused,
  -- so a cross-gym session id gets a member of another gym nothing.)
  select gym_id, capacity, cancelled_at into v_gym, v_cap, v_cancelled
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_cancelled is not null then
    raise exception 'Clase cancelada';
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
  end if;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   -- NULL for ilimitado
  return next;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005/0013 §1): revoke public+anon default, grant authenticated only ──
revoke execute on function public.contar_reservas_activas(uuid[]) from public, anon;
revoke execute on function public.reservar_clase(uuid) from public, anon;
grant execute on function public.contar_reservas_activas(uuid[]) to authenticated;
grant execute on function public.reservar_clase(uuid) to authenticated;
