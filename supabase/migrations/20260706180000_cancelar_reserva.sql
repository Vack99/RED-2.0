-- Cancel a reservation, slice #58 (PRD #49 S3; ADR-0010 §4/§5 the NAMED locked exception; ADR-0004 saldo;
-- ADR-0005 atomic seam; ADR-0013 member-owned/transactional RLS class).
--
-- The mirror of reservar_clase: the SECOND half of the money path. Same posture on everything —
--   * SECURITY DEFINER, self-scoped by auth.uid() (ADR-0009-amendment precedent): the member holds NO
--     direct reservation write policy (reservation_rls_denial.sql proves it — a policy could not express
--     "refund exactly one class" or "only before start"), so the cancelada flip + finite refund are a
--     privilege THIS function exercises only behind its guard ladder.
--   * SET search_path TO '', EXECUTE authenticated-only, every ref schema-qualified, the whole write in
--     ONE transaction. Every value is server-derived from the caller's own identity (v_member from
--     auth_user_id = auth.uid(); v_gym from the session row) — no parameter can redirect the write.
--
-- The three locked cancel rules a future reader must not "simplify":
--   * BEFORE START ONLY (ADR-0010 §4): cancel is allowed only while starts_at is still in the future —
--     an absolute-timestamp comparison against now() (ADR-0010 §3 absolute starts_at; no tz math). A
--     started/past session is rejected, so a no-show can never be laundered into a refund after the fact.
--   * REFUND FINITE ONLY (ADR-0004): the freed class increments clases_restantes by exactly one for a
--     finite plan; Ilimitado (clases_restantes IS NULL) changes STATE only — the NULL is never touched.
--   * THE SPOT FREES ITSELF (ADR-0010 §3): no stored occupancy to decrement — cancelada is excluded from
--     contar_reservas_activas, so availability re-derives the instant the row flips. Re-booking reuses the
--     same UNIQUE(member, session) row (reservar_clase's terminal-row reuse, ADR-0010 §5).
--
-- The cancelada flip is a GUARDED update (`and status = 'reservada'` + `if not found`), the twin of
-- reservar_clase's guarded decrement: it closes the concurrent double-cancel race (only one transaction
-- wins the reservada→cancelada flip; the loser rolls back) so a member can never refund the same booking
-- twice. Expand-only (one function), idempotent (create-or-replace), safe on a fresh scratch AND live.

create or replace function public.cancelar_reserva(p_session_id uuid)
  returns table (reservation_id uuid, clases_restantes int)
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_gym    uuid;
  v_starts timestamptz;
  v_member uuid;
  v_clases int;
  v_res_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The session. gym + start are derived from HERE, never a client parameter. (Definer bypasses RLS on
  -- this read; the tenant gate is the cliente lookup below.)
  select gym_id, starts_at into v_gym, v_starts
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  -- The caller's OWN cliente in THIS gym — the auth.uid() self-pin that scopes the whole definer body.
  -- Also the tenant gate: a caller with no cliente in the session's gym is refused here. Alias-qualified
  -- (c.) because the RETURNS TABLE OUT param `clases_restantes` shares the column's name.
  select c.id, c.clases_restantes into v_member, v_clases
    from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
  if not found then
    raise exception 'No eres miembro de este gimnasio';
  end if;

  -- Before start only (ADR-0010 §4): once the class has begun, cancellation is closed — a still-reservada
  -- past booking is a no-show that must consume, not a refundable cancel. Absolute starts_at vs now().
  if v_starts <= now() then
    raise exception 'La clase ya comenzó';
  end if;

  -- The member's reservation for this session — the UNIQUE guarantees at most one. Only an ACTIVE
  -- (reservada) booking can be cancelled; a terminal row (cancelada/no_show) or an asistida one is
  -- rejected so no refund is minted twice or against an attended class.
  select id, status into v_res_id, v_status
    from public.reservation where member_id = v_member and class_session_id = p_session_id;
  if v_res_id is null or v_status <> 'reservada' then
    raise exception 'No tienes una reserva activa en esta clase';
  end if;

  -- Guarded flip (the twin of reservar_clase's guarded decrement): `and status = 'reservada'` + the
  -- `not found` raise makes reservada→cancelada happen at most once, so two concurrent cancels cannot both
  -- refund. Atomic with the refund below.
  update public.reservation
     set status = 'cancelada', cancelled_at = now()
   where id = v_res_id and status = 'reservada';
  if not found then
    raise exception 'No tienes una reserva activa en esta clase';
  end if;

  -- Refund exactly one class — FINITE only. Ilimitado (clases_restantes IS NULL) changes state only and
  -- NEVER has its NULL touched (ADR-0004 / ADR-0010 §4). `clases_restantes` is a staff-write column
  -- members hold no policy on — this definer body is the only member path that moves it, and only by one,
  -- only on the caller's own v_member. Table-qualified: the RETURNS TABLE OUT param shares the name.
  if v_clases is not null then
    update public.clientes set clases_restantes = clientes.clases_restantes + 1
     where id = v_member
     returning clientes.clases_restantes into v_clases;
  end if;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   -- NULL for ilimitado
  return next;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005/0013 §1): revoke public+anon default, grant authenticated only ──
revoke execute on function public.cancelar_reserva(uuid) from public, anon;
grant execute on function public.cancelar_reserva(uuid) to authenticated;
