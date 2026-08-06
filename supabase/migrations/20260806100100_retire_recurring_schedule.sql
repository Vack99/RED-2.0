-- #243 — "terminar el horario": stop a repeating class. The ONE series-level verb.
-- (The "move / esta y las siguientes" half of the original design was cut by the owner; the design
-- doc's move sections are superseded. Moving a class is retire + create, through the create path
-- that already ships — `schedule_template_active_uq` is partial on `is_active`, so a retired slot is
-- immediately re-creatable by design.)
--
-- THE RULE, once: the class STOPS EXISTING, so every held credit is given back. `is_active = false`
-- retires the rule (both materializers already filter on it — 20260805100000:71, and
-- `schedule_template_active_uq` is partial on it, 20260805110000:275-277), and each future class is
-- cancelled through the SHIPPED `cancel_class_session`, which is the one and only implementation of
-- hold-release.
--
-- ── THE REFUND BODY IS NOT COPIED HERE, AND MUST NEVER BE ────────────────────────────────────────
-- `cancel_class_session` (20260804150000 §2) already encodes the entire settlement rule in one
-- data-modifying CTE: only `reservada` rows are released (an `asistida` row is a CAPTURED hold — the
-- member came, and re-crediting it would mint a class out of an attendance record), only
-- `consumio = true` bookings are refunded (the C4 purchase-wins phantom-credit gate), and an
-- ilimitado NULL balance is never written. A set-based refund inside this loop would be a second
-- copy of that rule, drifting from the first the day either changes. The design doc's §7 names the
-- one trigger to revisit it — p95 retire > ~1 s, or a desk lock-wait report — and until then the
-- loop stays. It is also structurally small: a template produces AT MOST ONE dated class per week,
-- so the fan-out is exactly "number of materialized future weeks" (5–6 typical), not a statistic.
--
-- ── WHY THE `if not found` RAISE IS THE IDEMPOTENCY ARGUMENT ─────────────────────────────────────
-- `where id = ? and is_active` means the SECOND call updates zero rows and raises above the loop, so
-- a double-tapped confirm dialog can never reach the refund twice. Same shape, and the same reason,
-- as cancel_class_session's own 'Sesión no encontrada o ya cancelada'. It is asserted on the
-- BALANCES in the suite, not on the raise: the raise is the mechanism, "nobody was paid twice" is
-- the property.
--
-- ── NO LOCK, AND THE RACE IT ACCEPTS (owner ruling) ──────────────────────────────────────────────
-- This function takes no advisory lock, and `materialize_week_for_gym` takes none either. The lock
-- pair was drafted and CUT: the shared half would have been held once per gym for the whole of the
-- Monday cron's fleet pass, and Postgres offers ~3,840 total lock slots, so it binds at ~3,800 gyms —
-- it would lower the 4000-gym ceiling to protect a button pressed a few times a year.
--
-- The race, stated honestly rather than papered over: a materialization pass that read this template
-- before the retire committed can still insert one class into a not-yet-claimed week. The result is a
-- single stray class, visible on the calendar and cancellable with the existing single-class button.
-- The trigger to add locking is an actual report of one.
--
-- ── OWNER RULING Q1 (design doc §6): retire cancels EVERY future class, including tomorrow's ─────
-- No date picker, no live-but-uncancelled tail. A template whose classes keep taking bookings for a
-- schedule the operator deleted is the support call this verb exists to prevent; the confirm sentence
-- in the sheet carries the weight. Nothing in the PAST is touched by this verb — the loop's
-- `starts_at > now()` filter is also what keeps it inside cancel_class_session's own before-start
-- gate (20260804150000:195), so the two can never disagree about which classes are settleable.
--
-- Returns the number of classes cancelled, so the sheet's receipt can say `N clases canceladas`.
create or replace function public.retire_recurring_schedule(p_template_id uuid)
 returns int
 language plpgsql
 set search_path to ''
as $function$
declare
  v_gym uuid := public.staff_gym();
  v_n   int := 0;
  r     record;
begin
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- `gym_id = v_gym` is defense-in-depth, not redundancy: the SELECT policy on schedule_template is
  -- is_member_of, which is WIDER than staff, so a multi-gym actor must not be able to aim this at a
  -- gym they are merely a member of and get a silent zero-row no-op instead of a refusal.
  update public.schedule_template set is_active = false
   where id = p_template_id and gym_id = v_gym and is_active;
  if not found then raise exception 'Horario no encontrado o ya retirado'; end if;

  -- One call per future class, through the shipped release. `order by starts_at` so a partial failure
  -- (which aborts the whole call anyway — PostgREST wraps each RPC in its own transaction) is at
  -- least deterministic to reproduce.
  for r in
    select id from public.class_session
     where template_id = p_template_id and starts_at > now() and cancelled_at is null
     order by starts_at
  loop
    perform public.cancel_class_session(r.id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005): revoke the public default + anon, grant authenticated only ───────
revoke execute on function public.retire_recurring_schedule(uuid) from public, anon;
grant  execute on function public.retire_recurring_schedule(uuid) to authenticated;
