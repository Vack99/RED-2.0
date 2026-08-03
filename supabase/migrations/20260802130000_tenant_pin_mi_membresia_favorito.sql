-- Issue #219 (epic #203) — mi_membresia + toggle_favorito_tipo stop picking a tenant with a bare
-- `limit 1`.
--
-- The defect: both bodies opened with
--   select … from public.clientes c where c.auth_user_id = v_uid limit 1;
-- no gym filter and NO `order by`. For a member holding a `clientes` row in two gyms
-- (`clientes_auth_user_id_per_gym` is UNIQUE (gym_id, auth_user_id) — it PERMITS one row per gym)
-- the row is the planner's choice and can flip across a plan change, an index build or a vacuum.
-- Everything downstream of `mi_membresia`'s `v_gym` — the gym timezone, therefore `anchor_dia`,
-- therefore `attended_since_purchase` — is computed from that arbitrary tenant, so the member's
-- plan card can render the OTHER gym's balance, expiry and plan beside this gym's agenda.
-- `toggle_favorito_tipo` then pinned its class-type check against that same arbitrary gym, so a
-- two-gym member browsing gym A could get `Tipo de clase no encontrado` on their OWN gym's class.
--
-- The fix: the gym becomes a parameter and the `clientes` pick is pinned on it —
-- `where c.auth_user_id = v_uid and c.gym_id = p_gym_id` — the shape `reservar_clase`
-- (20260729120000:655) has used since #57, raising the same `No eres miembro de este gimnasio`.
-- With the UNIQUE (gym_id, auth_user_id) index that predicate selects AT MOST ONE row, so the
-- pick is deterministic by construction, not by an `order by` tiebreaker.
--
-- NO HMAC firma (the 20260713190000:51-64 template is deliberately NOT applied). The firma exists
-- because `reclamar_o_crear_cliente` INSERTs a `gym_membership` row into the gym it is handed — a
-- caller-named gym there WIDENS authorization (it mints a membership the caller did not hold).
-- `p_gym_id` here can only NARROW (ADR-0008 amendment 2026-08-02): every read and the one write
-- are still bounded by `c.auth_user_id = (select auth.uid())`, so naming a gym the caller holds no
-- `clientes` row in yields an empty result (mi_membresia) or the membership raise
-- (toggle_favorito_tipo) — never another member's row, never a row in a gym the caller does not
-- already hold. It selects AMONG the caller's own rows; it cannot add one. A firma would also make
-- the member's plan card depend on the `tenant_assertion_key` vault secret + TENANT_ASSERTION_KEY
-- being present in every environment, which is a live outage risk bought for no authorization gain.
--
-- Signature changes () → (uuid) and (uuid) → (uuid, uuid): DROP first. CREATE OR REPLACE cannot
-- change a signature — it would leave the OLD unpinned overload callable over PostgREST, which is
-- the whole defect still reachable (the same reason 20260713190000 dropped before creating).

-- ── mi_membresia(p_gym_id) ──────────────────────────────────────────────────────
-- Body byte-faithful to 20260714120000 (the §D3 created_at anchor + the gym-tz boundary count are
-- untouched) except the `clientes` pick, which now takes the gym. Read-only, SECURITY DEFINER,
-- `set search_path = ''`, Contract-A preserved — only scalars leave.
drop function if exists public.mi_membresia();

create function public.mi_membresia(p_gym_id uuid)
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
revoke execute on function public.mi_membresia(uuid) from public, anon;
grant execute on function public.mi_membresia(uuid) to authenticated;

-- ── toggle_favorito_tipo(p_class_type_id, p_gym_id) ─────────────────────────────
-- Body unchanged from 20260706190000 (the on/off flip and the single-favorite invariant are
-- untouched) except the two tenant checks, which now key on the named gym instead of on whichever
-- gym the `limit 1` returned. The class type must belong to THAT gym, so the heart writes the
-- favorite onto the `clientes` row of the gym the member is actually looking at — the same row
-- `fetchFavoritoId` reads back (it has been gym-scoped since #74), so the write and the read can no
-- longer disagree.
drop function if exists public.toggle_favorito_tipo(uuid);

create function public.toggle_favorito_tipo(p_class_type_id uuid, p_gym_id uuid)
  returns table (favorito uuid)
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_member  uuid;
  v_current uuid;
  v_ct_gym  uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The caller's OWN cliente in the NAMED gym + its current favorite (#219). Identity is never a
  -- parameter; the gym narrows among the caller's own rows and can never add one.
  select c.id, c.favorite_class_type_id into v_member, v_current
    from public.clientes c
    where c.auth_user_id = v_uid and c.gym_id = p_gym_id;
  if not found then
    raise exception 'No eres miembro de este gimnasio';
  end if;

  -- Tenant pin: the class type must belong to the SAME gym the caller was resolved in.
  select ct.gym_id into v_ct_gym from public.class_type ct where ct.id = p_class_type_id;
  if not found or v_ct_gym <> p_gym_id then
    raise exception 'Tipo de clase no encontrado';
  end if;

  -- On/off toggle: same id clears; a different (or unset) id sets. Table-qualified WHERE — the RETURNS
  -- TABLE OUT param is named `favorito` so the column write is unambiguous.
  if v_current is not distinct from p_class_type_id then
    update public.clientes set favorite_class_type_id = null where clientes.id = v_member;
    favorito := null;
  else
    update public.clientes set favorite_class_type_id = p_class_type_id where clientes.id = v_member;
    favorito := p_class_type_id;
  end if;
  return next;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005/0013 §1): revoke public+anon default, grant authenticated only ──
revoke execute on function public.toggle_favorito_tipo(uuid, uuid) from public, anon;
grant execute on function public.toggle_favorito_tipo(uuid, uuid) to authenticated;
