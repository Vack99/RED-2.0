-- #243 follow-up — TWO TENSES OF ONE REFUSAL. The rule the two cancel paths enforce does not change
-- by one row; only the sentence they say when they refuse.
--
-- THE FACT, once: 'La clase ya comenzó' is TRUE for about an hour and then goes on being said forever.
-- The Agenda navigates backwards freely, so the cancel affordance is one click from last Tuesday's
-- 06:00 — and the operator who clicks it is told the class "has started", present perfect, about a
-- class that finished six days ago. It reads as a stale-state bug in the app (did it not load? is it
-- looking at the wrong week?) rather than as the deliberate refusal it is. A refusal an operator
-- disbelieves is a support call.
--
-- So: IN PROGRESS (`starts_at <= now() < starts_at + duration_min`) keeps 'La clase ya comenzó'.
-- FULLY PASSED (`now() >= starts_at + duration_min`) says 'La clase ya pasó'.
--
-- ── WHAT IS AND IS NOT CHANGED ───────────────────────────────────────────────────────────────────
-- The GATE CONDITION is untouched in both functions: `if v_starts <= now()` refuses exactly the same
-- set of calls it refused before, in exactly the same position — above every write. Nothing about
-- WHEN a cancel is allowed moves; ADR-0010 §4/§5 (a still-`reservada` past booking is a no-show that
-- must consume, and attendance history is not an operator's to rewrite) stands untouched.
--
-- `cancel_class_session` IS THE SETTLEMENT BODY. Its release CTE — the `reservada`-only flip, the
-- `l.consumio` phantom-credit gate, the `clases_restantes is not null` ilimitado half, and the
-- one-refund-per-member argument that rests on `reservation_member_session_uq` — is reproduced here
-- BYTE-FOR-BYTE from 20260804150000. The same is true of `cancelar_reserva`'s guarded flip and refund
-- from 20260803140000. The only edits in either body: `duration_min` joins the row read that was
-- already happening, and the single raise becomes an if/else over two literals.
--
-- The duration read is not new I/O — both functions already SELECT the row; this adds a column to a
-- statement that was already fetching it. `duration_min` is NOT NULL and CHECKed to (30,45,60,75,90)
-- (20260706120000:42), so the arithmetic has no null branch to handle.
--
-- Same signatures in both cases → CREATE OR REPLACE carries the EXECUTE grants (and, for
-- cancelar_reserva, its SECURITY DEFINER + `set search_path to ''` posture); no revoke/grant re-issue.
-- The literals stay literals rather than a computed `raise '%'` precisely so `grep 'La clase ya'`
-- keeps finding every site — the suites, the UI copy in session-vm.ts and the client mappers all pin
-- these strings by hand.

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. cancel_class_session — the operator's "cancelar clase" (body from 20260804150000 §2).
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.cancel_class_session(p_session_id uuid)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_starts timestamptz;
  v_dur    int;
begin
  if public.staff_gym() is null then raise exception 'No autorizado'; end if;

  -- RLS scopes this read to is_staff_of(gym_id), exactly as it scoped the UPDATE before §4.
  select starts_at, duration_min into v_starts, v_dur
    from public.class_session where id = p_session_id and cancelled_at is null;
  if not found then raise exception 'Sesión no encontrada o ya cancelada'; end if;

  -- §4 BEFORE-START ONLY, the mirror of cancelar_reserva's own gate (20260803140000:289-291) and its
  -- sentence. A class that has already run cannot be "cancelled": its still-`reservada` rows are the
  -- NO-SHOWS the roster derives, and releasing them would refund forfeited holds and erase the
  -- absences in the same statement. Above every write, so the raise leaves the session, the
  -- reservations and every balance untouched.
  --
  -- The CONDITION is unchanged; only the tense is. Present perfect while the class is actually
  -- running, past once it is over — see this file's header.
  if v_starts <= now() then
    if now() < v_starts + (v_dur * interval '1 minute') then
      raise exception 'La clase ya comenzó';
    else
      raise exception 'La clase ya pasó';
    end if;
  end if;

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

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. cancelar_reserva — the member's (and, since #237, the operator's) "cancelar reserva"
--    (body from 20260803140000 §3).
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.cancelar_reserva(p_session_id uuid, p_cliente_id uuid default null)
  returns table (reservation_id uuid, clases_restantes int)
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_gym    uuid;
  v_starts timestamptz;
  v_dur    int;
  v_member uuid;
  v_clases int;
  v_res_id uuid;
  v_status text;
  v_consumio boolean;   -- C12: read from the cancelled row in the guarded flip — the refund gate.
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The session. gym + start are derived from HERE, never a client parameter and never the caller's gym.
  select gym_id, starts_at, duration_min into v_gym, v_starts, v_dur
    from public.class_session where id = p_session_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  -- ── IDENTITY: the ONE branch this migration adds (#237) — reservar_clase's, verbatim ───────────
  -- Kept in the position the self-pin lookup held (above the before-start gate) so the member path's
  -- guard ORDER is byte-for-byte what it was. See reservar_clase above for why each half is here.
  if p_cliente_id is null then
    select c.id, c.clases_restantes into v_member, v_clases
      from public.clientes c where c.auth_user_id = v_uid and c.gym_id = v_gym;
    if not found then
      raise exception 'No eres miembro de este gimnasio';
    end if;
  else
    if not public.is_staff_of(v_gym) then
      raise exception 'No autorizado';
    end if;
    select c.id, c.clases_restantes into v_member, v_clases
      from public.clientes c where c.id = p_cliente_id and c.gym_id = v_gym;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  -- Before start only (ADR-0010 §4): once the class has begun, cancellation is closed — a still-reservada
  -- past booking is a no-show that must consume, not a refundable cancel. Absolute starts_at vs now().
  -- SHARED: an operator is refused here too, so attendance history cannot be rewritten after the fact.
  --
  -- The CONDITION is unchanged; only the tense is. A member looking at yesterday's class must not be
  -- told it "has started" — see this file's header.
  if v_starts <= now() then
    if now() < v_starts + (v_dur * interval '1 minute') then
      raise exception 'La clase ya comenzó';
    else
      raise exception 'La clase ya pasó';
    end if;
  end if;

  -- The resolved member's reservation for this session — the UNIQUE guarantees at most one. Only an
  -- ACTIVE (reservada) booking can be cancelled; a terminal row (cancelada/no_show) or an asistida one is
  -- rejected so no refund is minted twice or against an attended class. The sentence is the member's own
  -- and is deliberately NOT forked per path: one refusal, one vocabulary (#235 — no behavioural fork).
  select id, status into v_res_id, v_status
    from public.reservation where member_id = v_member and class_session_id = p_session_id;
  if v_res_id is null or v_status <> 'reservada' then
    raise exception 'No tienes una reserva activa en esta clase';
  end if;

  -- Guarded flip (the twin of reservar_clase's guarded decrement): `and status = 'reservada'` + the
  -- `not found` raise makes reservada→cancelada happen at most once, so two concurrent cancels cannot both
  -- refund. Atomic with the refund below. C12: RETURNING consumio reads the booking's recorded
  -- consumption in the SAME guarded write that flips the status — no second read, race-free.
  update public.reservation
     set status = 'cancelada', cancelled_at = now()
   where id = v_res_id and status = 'reservada'
   returning consumio into v_consumio;
  if not found then
    raise exception 'No tienes una reserva activa en esta clase';
  end if;

  -- Refund exactly one class — FINITE only, and C12: ONLY if this booking actually consumed one. Ilimitado
  -- (clases_restantes IS NULL) changes state only and NEVER has its NULL touched (ADR-0004 / ADR-0010 §4).
  -- The `and v_consumio` gate kills the phantom credit: a booking made under ilimitado (consumio=false)
  -- refunds nothing even if the member has since flipped to a finite plan (C4 purchase-wins). Only what
  -- was spent comes back — which is also precisely what an operator undoing a mis-tap gives back, to the
  -- member they wrongly charged and never to themselves (the refund targets the RESOLVED v_member).
  -- Table-qualified: the RETURNS TABLE OUT param shares the name.
  if v_clases is not null and v_consumio then
    update public.clientes set clases_restantes = clientes.clases_restantes + 1
     where id = v_member
     returning clientes.clases_restantes into v_clases;
  end if;

  reservation_id := v_res_id;
  clases_restantes := v_clases;   -- NULL for ilimitado
  return next;
end;
$function$;
