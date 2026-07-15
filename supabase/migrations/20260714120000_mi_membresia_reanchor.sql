-- mi_membresia() re-anchor on insertion order (spec 2026-07-14 §D3).
--
-- Backdating (20260714110000) breaks the "newest sale = order by fecha desc" assumption:
-- a truthful backdate writes a ventas.fecha in the PAST, so a real later sale must still
-- win the anchor. The saldo anchor is now the LAST-WRITTEN sale — `order by created_at
-- desc, id desc` (ventas.created_at is the real insertion instant; id breaks a same-instant
-- tie deterministically) — never the one with the latest effective date (C1).
--
-- attendedSincePurchase likewise counts asistencias since the anchor sale's created_at
-- (its real write day, gym-tz), NOT since fecha (C2): a gap visit between a backdated
-- fecha and the real write already decremented the balance live at mark-time; counting it
-- again here would double-consume. `anchor_dia` (the returned "happened" day) stays the
-- fecha gym-tz day — it mirrors the admin ficha's compradoDisplay, which reads fecha.
--
-- Expand-only (one create-or-replace), read-only, idempotent. POSTURE unchanged from
-- 20260706210000: SECURITY DEFINER, `set search_path = ''`, EXECUTE revoked from public +
-- anon and granted to authenticated only. Contract-A preserved — only scalars leave.

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
  v_anchor_creado timestamptz;
  v_conteo_dia   date;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select c.id, c.gym_id, c.paquete_nombre, c.clases_restantes, c.vence
    into v_cli, v_gym, paquete_nombre, clases_restantes, vence
    from public.clientes c
    where c.auth_user_id = v_uid
    limit 1;
  if v_cli is null then
    return;  -- caller has no cliente row → empty result (the card renders its no-plan state)
  end if;

  select g.timezone into v_tz from public.gym g where g.id = v_gym;

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

  -- attendedSincePurchase — SAME filters as getClienteFicha Part B (consumio, not soft-deleted),
  -- but anchored on the anchor sale's created_at gym-tz day (C2), NOT fecha: gap visits between a
  -- backdated fecha and the real write already spent the prior balance. 0 when there is no anchor.
  v_conteo_dia := (v_anchor_creado at time zone v_tz)::date;  -- NULL when there is no anchor sale
  if v_conteo_dia is not null then
    select count(*)::int into attended_since_purchase
      from public.asistencias a
      where a.cliente_id = v_cli
        and a.consumio = true
        and a.deleted_at is null
        and a.fecha >= v_conteo_dia;
  else
    attended_since_purchase := 0;
  end if;

  return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): revoke the CREATE-FUNCTION public default + anon; grant authenticated.
revoke execute on function public.mi_membresia() from public, anon;
grant execute on function public.mi_membresia() to authenticated;
