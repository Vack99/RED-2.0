-- Slice 2 §D3 — `mi_membresia` learns the CHARGE count, additively.
--
-- The member's plan card consumes only this RPC's scalars, so the honest gauge (§D2) cannot reach it
-- from TS: the admin ficha derives its numbers from ventas + asistencias + reservations it can read
-- directly, and the client app can read none of those (Contract-A — only scalars leave this
-- function). Parity between the two surfaces therefore requires the D0 count to exist IN SQL. It
-- does, once, in `public.conteo_cargable` (20260828110000) — the same read-only helper
-- `editar_venta` uses for its as-if-original re-derive, so the member card, the operator ficha and
-- the edit door can never drift into three different answers to "how many classes did this pack
-- actually charge".
--
-- ── ADDITIVE ONLY, and that is a compatibility requirement, not a style ──────────────────────────
-- This migration goes LIVE (MCP) the moment it is applied, while the client app that reads the new
-- fields ships only on the owner-gated Vercel push. Between those two events every deployed member
-- browser is still selecting the OLD eight fields. So all eight keep their exact name, type,
-- POSITION and semantics — `attended_since_purchase` in particular stays the day-anchored VISIT
-- count of #173 (`deleted_at is null and not perdonada`, boundary `fecha >= anchor created_at`
-- gym-tz day). It is not "fixed" here and must not be: correcting it in the same breath as adding
-- its replacement would change what a deployed card renders during the window this rule exists to
-- protect. The new UI reads the new fields; the old ones become dead only once it ships (§D3).
--
-- Three columns are APPENDED:
--   cargadas     — the §D0 charge count since the anchor sale: conteo_cargable's `usadas` leg
--                  (attendance-leg charges + charged holds whose session ended with no attendance;
--                  `no_shows` is a display-only SUBSET of it). The gauge's numerator, and unlike
--                  attended_since_purchase it counts CHARGES at fecha+hora precision, not visits at
--                  day granularity.
--   grant_clases — the anchor sale's `ventas.clases`: the gauge's honest DENOMINATOR. NULL means
--                  ilimitado (the card renders no gauge, as today) — and NULL also when the member
--                  has no sale at all, exactly as every other anchor_* scalar already behaves.
--   apartadas    — conteo_cargable's future leg: charged holds whose session has not ended yet.
--                  Shown beside the caption, never folded into cargadas (they are not spent).
--
-- ── Why DROP + CREATE ────────────────────────────────────────────────────────────────────────────
-- `create or replace` cannot add OUT columns — it refuses with "cannot change return type of
-- existing function" — so the old definition has to go first. The ARGUMENT list is untouched
-- (`(uuid)` → `(uuid)`), which is what keeps this out of the 2026-08-27 overload class: the DROP
-- names the exact live signature and the CREATE re-uses it, so there is no argument list for a
-- second definition to occupy. The self-check at the foot asserts that anyway (see there).
-- `drop function` takes the old signature's grants with it, so the revoke/grant pair from
-- 20260802150000 is restated verbatim below for the recreated function.
--
-- Read-only, like every previous revision: no `rpc-coverage.json` obligation
-- (tools/guards/rpc-write-coverage.test.ts keys on WRITES) and no denial-suite write assertion. The
-- existing suites — supabase/tests/mi_membresia_rules.sql and dos_gimnasios_tenant_pin.sql — read
-- the result into a `record`, so appended columns are invisible to them and their parity assertions
-- on the eight old fields keep proving the compatibility rule above.
--
-- Body byte-faithful to 20260803120000 except: `v.clases` joins the anchor read (into the new
-- grant_clases), and one net-new block fills cargadas/apartadas from the helper. Language, SECURITY
-- DEFINER, `set search_path = ''` and Contract-A are unchanged.

drop function if exists public.mi_membresia(uuid);

create function public.mi_membresia(p_gym_id uuid)
  returns table (
    paquete_nombre        text,
    clases_restantes      int,
    vence                 date,
    anchor_dia            date,
    anchor_monto          int,
    anchor_vigencia_tipo  text,
    anchor_vigencia_dias  int,
    attended_since_purchase int,
    cargadas              int,
    grant_clases          int,
    apartadas             int
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
  v_usadas       int;
  v_apartadas    int;
  v_no_shows     int;
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
  -- not (Contract-A). No sale → every anchor_* stays NULL (SELECT INTO with no row) — grant_clases
  -- included, which is why the card cannot tell "ilimitado" from "no sale" on that field alone and
  -- must read anchor_dia the way it already does.
  select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias, v.clases
    into v_anchor_fecha, v_anchor_creado, anchor_monto, anchor_vigencia_tipo, anchor_vigencia_dias,
         grant_clases
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
  --
  -- FROZEN by slice 2 §D3, deliberately: this is a DAY-granular VISIT count and the block below is a
  -- fecha+hora CHARGE count. They disagree on purpose (a visit under ilimitado is not a charge; a
  -- no-show is a charge and not a visit), and a deployed client card is still rendering this one.
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

  -- §D0, in the one place it is written in SQL. The anchor moment is the sale's `created_at`, the
  -- same instant attended_since_purchase anchors its day on — never `fecha`, which a backdate moves.
  -- `cargadas` is the helper's `usadas` leg: ALL past charges (attendance-leg charges plus charged
  -- holds whose session ended unattended — the helper's `no_shows` is a display-only SUBSET of
  -- `usadas`, never an additional leg, so adding it here would double-count every no-show).
  -- `apartadas` (the future leg) stays separate: those classes are held, not spent, and folding
  -- them in would make the gauge read a member as having used a class they can still attend or
  -- cancel.
  if v_anchor_creado is not null then
    select cc.usadas, cc.apartadas, cc.no_shows
      into v_usadas, v_apartadas, v_no_shows
      from public.conteo_cargable(v_cli, v_anchor_creado) cc;
    cargadas  := coalesce(v_usadas, 0);
    apartadas := coalesce(v_apartadas, 0);
  else
    cargadas  := 0;
    apartadas := 0;
  end if;

  return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): revoke the CREATE-FUNCTION public default + anon; grant authenticated.
-- Restated because `drop function` above took the old signature's grants with it.
revoke execute on function public.mi_membresia(uuid) from public, anon;
grant execute on function public.mi_membresia(uuid) to authenticated;

-- ── Overload self-check — the apply fails instead of stranding a second definition ────────────────
-- `drop function if exists` is SILENT about a miss. This file's DROP and CREATE name the same
-- argument list, so a stale-signature CREATE cannot happen here — but a PRE-#219 `mi_membresia()`
-- surviving in the live catalog (the zero-arg revision 20260802150000 dropped) would be untouched by
-- the DROP above and left callable beside the new one, and PostgREST answers 300/PGRST203 to a call
-- it cannot disambiguate. That is the 2026-08-27 sales outage's exact shape; asserting it costs one
-- query. [[prod-migration-version-drift]] / docs/audits/2026-08-27-registrar-venta-overload-outage.md
do $$
declare n int;
begin
  select count(*) into n
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'mi_membresia';
  if n <> 1 then
    raise exception 'overload drift: public.mi_membresia has % definitions (expected exactly 1)', n;
  end if;
end $$;
