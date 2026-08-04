-- Issue #173 — the plan card undercounts attended classes.
--
-- The defect: `mi_membresia`'s attended_since_purchase counted `consumio = true` rows only. A booked
-- class visit is written with `consumio = false` (reservar_clase already charged the balance at booking
-- time — pasar_lista_sesion / toggle_pase just attribute the mark), so a booked visit NEVER incremented
-- the counter: the member's plan card showed "0 de 4" under a full progress bar the moment their classes
-- were all booked rather than walked-in.
--
-- The fix: count VISITS, the same unit `asistencias_mes_por_cliente` already counts (20260729120000:764,
-- the #169 owner ruling) — `deleted_at is null and not perdonada` — dropping the `consumio` filter
-- entirely. `perdonada` (added by 20260729120000) is the one row `asistencias_mes_por_cliente` already
-- excludes: the SECOND record of one cooldown-paired arrival, never a real second visit. Everything else
-- in the body (the §D3 created_at anchor, the gym-tz boundary count, the `p_gym_id` tenant pin from
-- #219) is untouched.
--
-- Owner ruling (2026-08-03): fix BOTH surfaces in one slice — this RPC and the admin ficha's own count
-- in packages/data/src/server/clientes.ts carried the identical `consumio = true` bug, and this
-- function's own header comment claimed parity with that count. Shipping only one would make the
-- operator and the member see DIFFERENT "clases usadas" for the same client the day it lands.
--
-- Signature unchanged ((uuid) → (uuid)) and the RETURNS TABLE shape unchanged, so CREATE OR REPLACE
-- applies directly — no DROP needed. create-or-replace preserves grants; the EXECUTE lockdown is
-- re-emitted for posture parity (ADR-0005/0013 §1), matching 20260710123000's pattern. Expand-only,
-- idempotent, safe on a fresh scratch AND on live. Pure reader — writes nothing, so it carries no
-- rpc-coverage.json obligation (tools/guards/rpc-write-coverage.test.ts) and must not be added there.

-- Body byte-faithful to 20260802150000 except the attended_since_purchase filter (and its comment).
create or replace function public.mi_membresia(p_gym_id uuid)
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
  v_tz           text;
  v_anchor_fecha timestamptz;
  v_anchor_creado timestamptz;
  v_conteo_dia   date;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The caller's OWN cliente IN THE NAMED GYM (#219). Identity stays the auth.uid() self-pin — the
  -- gym only disambiguates among the caller's own rows, and UNIQUE (gym_id, auth_user_id) makes the
  -- pair single-valued, so no `limit`/`order by` can decide anything here.
  select c.id, c.paquete_nombre, c.clases_restantes, c.vence
    into v_cli, paquete_nombre, clases_restantes, vence
    from public.clientes c
    where c.auth_user_id = v_uid and c.gym_id = p_gym_id;
  if v_cli is null then
    return;  -- no cliente row in this gym → empty result (the card renders its no-plan state)
  end if;

  -- The gym's clock is now the NAMED gym's clock, so anchor_dia and the count boundary below can no
  -- longer be computed in another tenant's timezone (the half of this defect that costs a member a
  -- real class: class times rendered in the wrong zone).
  select g.timezone into v_tz from public.gym g where g.id = p_gym_id;

  -- The saldo anchor = the LAST-WRITTEN sale (created_at desc, id desc — never fecha, which a
  -- backdate can push into the past). Only its scalars leave this function; the raw row does
  -- not (Contract-A). No sale → every anchor_* stays NULL (SELECT INTO with no row).
  select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias
    into v_anchor_fecha, v_anchor_creado, anchor_monto, anchor_vigencia_tipo, anchor_vigencia_dias
    from public.ventas v
    where v.cliente_id = v_cli
    order by v.created_at desc, v.id desc
    limit 1;

  anchor_dia := (v_anchor_fecha at time zone v_tz)::date;  -- the "happened" day (fecha); NULL if no anchor

  -- attendedSincePurchase (#173) — a VISIT count, the same unit asistencias_mes_por_cliente uses
  -- (20260729120000:764): `deleted_at is null and not perdonada`. NOT `consumio = true` — a booked
  -- class visit is written consumio=false (reservar_clase already charged the class at booking time),
  -- so gating on consumio dropped every booked visit from this counter. Anchored on the anchor sale's
  -- created_at gym-tz day (C2), NOT fecha: gap visits between a backdated fecha and the real write
  -- already spent the prior balance. 0 when there is no anchor.
  v_conteo_dia := (v_anchor_creado at time zone v_tz)::date;  -- NULL when there is no anchor sale
  if v_conteo_dia is not null then
    select count(*)::int into attended_since_purchase
      from public.asistencias a
      where a.cliente_id = v_cli
        and a.deleted_at is null
        and not a.perdonada
        and a.fecha >= v_conteo_dia;
  else
    attended_since_purchase := 0;
  end if;

  return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): revoke the CREATE-FUNCTION public default + anon; grant authenticated.
revoke execute on function public.mi_membresia(uuid) from public, anon;
grant execute on function public.mi_membresia(uuid) to authenticated;
