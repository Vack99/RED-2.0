-- Member-facing membership read RPC — slice #61 (PRD #49 S? membresía plan card; ADR-0013 member-owned
-- RLS class; ADR-0005 atomic seam; ADR-0009-amendment SECURITY DEFINER exception to ADR-0005's INVOKER
-- default). The design-gated resolution to the [SCOPE CREEP] on #61.
--
-- THE PROBLEM: the plan card's "N de N clases" depletion gauge needs `attendedSincePurchase` (classes
-- consumed since the anchor sale), which the admin ficha derives from BOTH `ventas` (the sale anchor) and
-- `asistencias` (the consume replay). Member RLS reads NEITHER (Contract-A, 20260705081431, deliberately
-- dropped ventas_select_own / asistencias_select_own — sales & attendance history stay staff-only). So a
-- member session cannot reproduce the gauge without a schema addition.
--
-- THE RESOLUTION (owner-approved, design-gated YES twice): ONE SECURITY DEFINER RPC that computes ONLY
-- the RLS-privileged SCALARS for the caller's OWN cliente and returns them — the anchor sale's gym-tz
-- calendar day, its monto/vigencia display fields, the attendedSincePurchase count, plus the pass-through
-- entitlement fields the plan card renders. Raw `ventas` / `asistencias` ROWS never cross the boundary
-- (Contract-A posture preserved BY CONSTRUCTION), and the TS layer funnels these scalars through the
-- existing pure derive.ts sub-helpers (forfeit / clasesDenom / gaugeFill) — ONE derivation home, the same
-- math the admin ficha's shapeFicha uses. No raw arrays, no second gauge derivation, no gauge math in SQL.
--
-- SELF-SCOPED, NO PARAMETER: the ONLY key is `auth.uid()` (never an identity/gym parameter that a client
-- could redirect). One login = one gym = one cliente (unique (gym_id, auth_user_id)), so the self-pin
-- selects exactly one row.
--
-- BOUNDARY-DAY PARITY (design-gate constraint 1): the anchor day is `(v.fecha AT TIME ZONE gym.timezone)
-- ::date` — resolved in the GYM's zone, never a constant — so it agrees with the admin ficha's
-- `toIsoDay(fechaEnZona(ventas[0].fecha, tz))` even for a sale timestamped across gym-midnight. The
-- parity suite seeds that boundary case.
--
-- SKEW NOTE (design-gate constraint 3): the gauge inherits the separately-tracked consume-at-booking
-- skew (#57/#60). PARITY WITH THE ADMIN FICHA is the criterion here — this path deliberately does NOT
-- "fix" the skew; it replicates getClienteFicha Part B's exact filters (consumio = true, not soft-deleted,
-- fecha >= the anchor gym-tz day) so the two surfaces show the SAME number.
--
-- POSTURE (verbatim from reclamar_o_crear_cliente / set_notificaciones, ADR-0013 §1): SECURITY DEFINER,
-- `set search_path = ''` (every ref schema-qualified, injection-safe, clears function_search_path_mutable),
-- EXECUTE revoked from public + anon and granted to authenticated only. READ-ONLY — no write, no entitlement
-- column ever touched. Expand-only (one create-or-replace), idempotent, safe on a fresh scratch AND on
-- live. NEVER destructive.

create or replace function public.mi_membresia()
  returns table (
    paquete_nombre        text,
    clases_restantes      int,
    vence                 date,
    anchor_dia            date,
    anchor_monto          int,
    anchor_vigencia_tipo  text,
    anchor_vigencia_dias  int,
    attended_since_purchase int
  )
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_uid          uuid := (select auth.uid());
  v_cli          uuid;
  v_gym          uuid;
  v_tz           text;
  v_anchor_fecha timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The caller's OWN cliente row — the auth.uid() self-pin (no parameter redirects it). The pass-through
  -- entitlement fields (paquete_nombre / clases_restantes / vence) ride out so the whole plan card comes
  -- from this one call; a member CAN already read these on their own row, but returning them here keeps
  -- the card a single round trip.
  select c.id, c.gym_id, c.paquete_nombre, c.clases_restantes, c.vence
    into v_cli, v_gym, paquete_nombre, clases_restantes, vence
    from public.clientes c
    where c.auth_user_id = v_uid
    limit 1;
  if v_cli is null then
    return;  -- caller has no cliente row → empty result (the card renders its no-plan state)
  end if;

  -- The gym's IANA zone — the anchor-day conversion resolves in THIS zone, never a hardcoded one.
  select g.timezone into v_tz from public.gym g where g.id = v_gym;

  -- The saldo anchor = the NEWEST sale (ventas[0], newest-first). Only its scalars leave this function;
  -- the raw row does not (Contract-A). No sale → every anchor_* stays NULL (SELECT INTO with no row).
  select v.fecha, v.monto, v.vigencia_tipo, v.vigencia_dias
    into v_anchor_fecha, anchor_monto, anchor_vigencia_tipo, anchor_vigencia_dias
    from public.ventas v
    where v.cliente_id = v_cli
    order by v.fecha desc
    limit 1;

  anchor_dia := (v_anchor_fecha at time zone v_tz)::date;  -- NULL when there is no anchor sale

  -- attendedSincePurchase — the clases-gauge denominator input. SAME filters as getClienteFicha Part B:
  -- consumio attendances, not soft-deleted, on/after the anchor gym-tz day. Inherits the #57/#60 skew by
  -- design (parity, not a fix). 0 when there is no anchor.
  if anchor_dia is not null then
    select count(*)::int into attended_since_purchase
      from public.asistencias a
      where a.cliente_id = v_cli
        and a.consumio = true
        and a.deleted_at is null
        and a.fecha >= anchor_dia;
  else
    attended_since_purchase := 0;
  end if;

  return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): revoke the CREATE-FUNCTION public default + anon; grant authenticated.
revoke execute on function public.mi_membresia() from public, anon;
grant execute on function public.mi_membresia() to authenticated;
