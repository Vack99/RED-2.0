-- `editar_venta` re-derive — the clawback recovered the ANCHOR, not the BASE, and the fecha cancelled.
-- Correction of 20260815120000 (thread #266, ruling 1 "vence follows fecha"). That migration is ALREADY
-- APPLIED on live, so this is a create-or-replace of `editar_venta` alone: no grant change, no signature
-- change, nothing else in the file. `eliminar_venta` and the ventas column grants stay exactly as
-- 20260815120000 left them.
--
-- ── THE DEFECT: `vence − dias_old` is the ANCHOR, and it is NOT the base ────────────────────────────
-- registrar_venta does not write `base_end + dias`. It writes
--
--     vence = max(base_end, fecha) + dias                       (its baseParaStack + stackPaquete block)
--
-- so the linear inverse 20260815120000 used,
--
--     v_base_vence := v_cli.vence − v_dias_old
--
-- recovers `max(prior_base_end, old_fecha_day)` — the sale's ANCHOR — and not `prior_base_end`. The two
-- coincide only when the sale genuinely STACKED on a live base (base_end > fecha). When the sale was a
-- fresh start or a restart (no live base, or one that had already lapsed), the anchor IS the old fecha,
-- and feeding it back into the forward pass as if it were a base makes the new fecha cancel out:
--
--     base_dias   = anchor − fecha_new
--     new_vence   = fecha_new + base_dias + dias_new = anchor + dias_new         ← fecha_new is GONE
--
-- For a fresh sale anchor == old fecha, so `new_vence = old_fecha + dias` — the value it already had.
-- A fecha-only correction was therefore a mathematical NO-OP on `vence` for exactly the case ruling 1
-- was written for. Live repro (2026-08-15): a single fresh venta, 30 días, cliente vence 13 sep; the
-- operator moved the sold date 14 ago → 10 ago → 8 ago → 5 ago and `vence` sat on 13 sep every time,
-- because each edit carried a phantom "14 ago − fecha_new" base forward. Moving the fecha FORWARD
-- always worked (the phantom base falls behind the new day and the discard arm fires), which is why the
-- defect survived review and the suites: every fecha vector on the books either moved forward or rode a
-- genuinely stacked fixture, where anchor == base and both bodies agree.
--
-- ── THE FIX: disambiguate with the sale's OWN old fecha ─────────────────────────────────────────────
-- The venta row already carries the fact that separates the two readings — the day the sale started.
-- `anchor > old_fecha_day` is true if and only if `max(base_end, fecha) > fecha`, i.e. iff a live base
-- outlasted the purchase day. In that case the anchor IS `base_end`, recovered EXACTLY. Otherwise there
-- was no live base to carry and the correct base is nothing at all — which lands on the block's existing
-- discard arm (`base_dias := 0`, `base_clases := 0`), registrar's own expired-restart semantics.
-- Nothing downstream moves: same clamp, same one-clamp-at-the-end rule, same ilimitado arms.
--
-- The CLASES inverse (`clases_restantes − clases_old`) is untouched. It stays correct in both branches:
-- on a stack it recovers the pre-sale count (negative when the member over-consumed, which the single
-- final `greatest(0, …)` absorbs — the load-bearing decision 20260815120000's header defends and
-- editar_venta_paquete.sql S3/S4 pin), and on a restart it is discarded, which is the pre-existing
-- pinned meaning of a restart (S5b: a re-derived restart re-grants the package's own count and does not
-- preserve consumption, because that is what registrar_venta itself writes at that day).
--
-- ── THE TRUTH TABLE this yields ─────────────────────────────────────────────────────────────────────
--   1. FRESH / restarted sale (anchor == old fecha — the common case, and ruling 1's own scenario):
--      restart branch ⇒ `vence = fecha_new + dias_new`. Vence follows fecha, as ruled.
--   2. GENUINELY STACKED sale (bought while vigente; the prior base ended B > old fecha): B is recovered
--      exactly ⇒ `vence = max(B, fecha_new) + dias_new`. Moving the fecha while B ≥ fecha_new does NOT
--      move vence — correct, and registrar-identical: the carry ends at B no matter which day the member
--      paid. Moving the fecha PAST B restarts at fecha_new. So a vence that legitimately stays put is
--      still possible — but only for a real stack, never for a fresh sale.
--   3. THE AMBIGUOUS SLIVER, stated rather than solved: a base that ended exactly ON the old fecha day
--      (a 0-day carry, whose clases legitimately carried under the vence-day-is-valid rule C9) is
--      indistinguishable from a fresh sale — `anchor > fecha_old` is false for both. The restart reading
--      wins, which drops that exact-day clases carry on a later re-derive. Rare (it needs the previous
--      package to have ended on the very day the next was sold), harmless to vigencia (both readings
--      give `fecha + dias` when the carry is 0 days and the fecha did not move), and accepted.
--   4. SELF-HEALING on the rows the pre-ruling era polluted: an attribution-only fecha edit
--      (20260814120000, before ruling 1) moved `fecha` without touching the saldo, so those rows can
--      have anchor ≠ fecha in EITHER direction, anchor < fecha included. All of them read as "no live
--      base" and re-anchor the vigencia onto the corrected fecha on the next re-derive, which is the
--      outcome the operator was asking for in the first place.
--
-- Idempotent (create-or-replace + the same EXECUTE lockdown re-applied), safe out of order: it depends
-- on nothing 20260815120000 did not already create.

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- editar_venta — 20260815120000's body verbatim, with the clawback's base recovery corrected.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.editar_venta(
    p_venta_id         uuid,
    p_monto            integer,
    p_metodo           text,
    p_fecha            date    default null,
    p_paquete_id       uuid    default null,
    p_custom_nombre    text    default null,
    p_custom_clases    integer default null,
    p_custom_dias      integer default null,
    p_custom_ilimitado boolean default null
  )
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_gym            uuid;
  v_tz             text;
  v_hoy            date;
  v_fecha_ts       timestamptz;
  v_fecha_dia      date;
  v_custom         boolean;
  v_paq            record;
  v_venta          record;
  v_cli            record;
  v_nombre         text;
  v_clases         integer;      -- null = ilimitado
  v_vig_tipo       text;
  v_vig_dias       integer;
  v_person         boolean;
  v_cambio_grant   boolean;
  v_cambio_paquete boolean;
  v_cambio_fecha   boolean;
  v_dias_old       integer;
  v_dias_new       integer;
  v_anchor         date;         -- max(prior_base_end, old_fecha_day) — what the inverse recovers
  v_fecha_old_dia  date;         -- the sale's STORED gym-tz day, the disambiguator
  v_base_clases    integer;      -- may be NEGATIVE inside the transaction, by design
  v_base_vence     date;
  v_base_dias      integer;
  v_new_clases     integer;      -- null = ilimitado
  v_new_vence      date;
begin
  -- Authorization first, input second — the registrar_venta order (functions-canonical/
  -- registrar_venta.sql:30-31 gates before :46-48 validates): a caller with no staff row learns
  -- 'No autorizado' and nothing about which arguments this gym would have accepted.
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- Re-assert the domain in-body so a bad método surfaces a human message instead of a raw 23514,
  -- exactly as registrar_venta does ('pendiente' was removed by ruling C2).
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  -- `monto` has NO table CHECK, so this is the only place any bound exists at all — the Zod schema
  -- sits on the far side of the trust boundary and binds nobody calling the RPC directly. The bound is
  -- deliberately ONE-SIDED: an upper cap would make an already-registered high-value sale permanently
  -- UNCORRECTABLE (the sheet seeds its field from the stored monto), and `paquetes.precio` carries no
  -- ceiling of its own anyway.
  if p_monto is null or p_monto < 1 then
    raise exception 'Monto inválido';
  end if;

  -- `v_custom` is true if ANY custom field was sent, so a half-filled custom payload alongside a
  -- paquete_id trips the guard rather than being silently ignored. NOTE the difference from
  -- registrar_venta's XOR: here NEITHER source is legal too, and means "keep the current package".
  v_custom := (p_custom_nombre is not null
               or p_custom_clases is not null
               or p_custom_dias is not null
               or coalesce(p_custom_ilimitado, false));
  if v_custom and p_paquete_id is not null then
    raise exception 'Venta inválida: elige un paquete o define uno personalizado';
  end if;

  -- FOR UPDATE on the VENTA: two overlapping edits of the same sale would otherwise both read the same
  -- stored grant, serialize on the clientes lock below, and each apply a full clawback + re-grant —
  -- corrupting the balance permanently. The lock makes the second call wait and then re-read a row that
  -- already carries the new package facts, at which point the change flags make it a no-op. Same
  -- double-apply guard eliminar_venta documents at functions-canonical/eliminar_venta.sql:13-16.
  -- `v_venta.fecha` is read HERE, before the row is rewritten below, which is what lets the clawback
  -- ask "did this sale stack, or did it start?" — see the header.
  select v.cliente_id, v.paquete_nombre, v.clases, v.vigencia_tipo, v.vigencia_dias,
         v.personalizado, v.fecha, v.created_at
    into v_venta
    from public.ventas v
    where v.id = p_venta_id and v.gym_id = v_gym
    for update;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- Every day below is a GYM-tz day: the bounds, the stored instant, and the day the re-grant stacks
  -- from. A session-tz date would disagree with the gym's for the hours the two calendars differ.
  select g.timezone into v_tz from public.gym g where g.id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;

  -- ── The target package facts. Three branches converge on the same five variables, which is what lets
  -- the re-derive below stay single-path (registrar_venta's converged-facts shape). ────────────────
  if p_paquete_id is not null then
    -- Package facts come from the DB, never the client (C13). Tenant-scoped, so a cross-gym paquete id
    -- is this refusal rather than a leak of another gym's catalog.
    select p.nombre, p.clases, p.vigencia_tipo, p.vigencia_dias into v_paq
      from public.paquetes p where p.id = p_paquete_id and p.gym_id = v_gym;
    if not found then raise exception 'Paquete no encontrado'; end if;
    v_nombre   := v_paq.nombre;
    v_clases   := v_paq.clases;
    v_vig_tipo := v_paq.vigencia_tipo;
    v_vig_dias := v_paq.vigencia_dias;
    v_person   := false;
  elsif v_custom then
    -- registrar_venta's custom validations verbatim (functions-canonical/registrar_venta.sql:60-88),
    -- MINUS precio: the RPC is the trust boundary, the form is not.
    v_nombre := trim(coalesce(p_custom_nombre, ''));
    if length(v_nombre) < 3 or length(v_nombre) > 40 then
      raise exception 'Nombre del paquete personalizado inválido';
    end if;
    if p_custom_dias is null or p_custom_dias < 1 or p_custom_dias > 365 then
      raise exception 'Vigencia personalizada inválida';
    end if;
    -- p_custom_ilimitado exists because SQL cannot tell "argument absent" from "argument is null", and
    -- null IS the ilimitado value. Sending both is incoherent.
    if coalesce(p_custom_ilimitado, false) then
      if p_custom_clases is not null then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_clases := null;
    else
      if p_custom_clases is null or p_custom_clases < 1 or p_custom_clases > 365 then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_clases := p_custom_clases;
    end if;
    v_vig_tipo := 'dias';
    v_vig_dias := p_custom_dias;
    v_person   := true;
  else
    -- Neither source sent = "keep the current package". Copying the stored facts (rather than skipping
    -- the block) is what makes a fecha-only edit run the SAME core with old == new, so a fecha-only
    -- correction is the swap's own math with an unchanged package instead of a second code path.
    v_nombre   := v_venta.paquete_nombre;
    v_clases   := v_venta.clases;
    v_vig_tipo := v_venta.vigencia_tipo;
    v_vig_dias := v_venta.vigencia_dias;
    v_person   := v_venta.personalizado;
  end if;

  -- null p_fecha = "don't touch the date". Both bounds MIRROR registrar_venta verbatim, messages
  -- included, so the edit door cannot write a fecha the create door would refuse; the third bound both
  -- doors used to carry (before the cliente's alta) was dropped from both on 2026-08-14
  -- (20260814130000). The written instant is registrar's convention: midday in the gym's timezone.
  if p_fecha is not null then
    if p_fecha > v_hoy then
      raise exception 'La fecha de inicio no puede ser futura';
    end if;
    if p_fecha < v_hoy - 30 then
      raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad';
    end if;
    v_fecha_ts := (p_fecha::timestamp + interval '12 hours') at time zone v_tz;
  end if;
  -- The sale's STORED gym-tz day, and the day the re-grant stacks from: the requested one, else the
  -- stored one. The two are the same value on a package-only swap.
  v_fecha_old_dia := (v_venta.fecha at time zone v_tz)::date;
  v_fecha_dia     := coalesce(p_fecha, v_fecha_old_dia);

  -- ── Change detection (see 20260815120000's header): triggered by a CHANGE, never by the call. ────
  v_cambio_grant   := (v_clases   is distinct from v_venta.clases)
                   or (v_vig_tipo is distinct from v_venta.vigencia_tipo)
                   or (v_vig_dias is distinct from v_venta.vigencia_dias);
  v_cambio_paquete := v_cambio_grant
                   or (v_nombre is distinct from v_venta.paquete_nombre)
                   or (v_person is distinct from v_venta.personalizado);
  v_cambio_fecha   := p_fecha is not null
                  and p_fecha is distinct from v_fecha_old_dia;

  -- Ruling 4's window, written over the RE-DERIVE and not over the package change alone: a fecha-only
  -- edit re-grants exactly as much as a swap does. monto/metodo — and a pure rename, which moves no
  -- saldo — stay any-age (#266.3).
  if (v_cambio_grant or v_cambio_fecha) and v_venta.created_at < now() - interval '30 days' then
    raise exception 'Ya pasaron 30 días: esta venta ya no se puede recalcular';
  end if;

  -- The top-of-stack precondition: the clawback is a LINEAR inverse, so it only recovers this sale's
  -- own anchor while nothing has stacked on top of it. A later sale of the same cliente makes the
  -- subtraction meaningless and would silently destroy that later sale's grant, so the re-derive is
  -- refused outright rather than approximated. Monto/metodo-only edits never reach here.
  if (v_cambio_grant or v_cambio_fecha)
     and exists (select 1 from public.ventas v
                  where v.cliente_id = v_venta.cliente_id
                    and v.gym_id = v_gym
                    and (v.created_at, v.id) > (v_venta.created_at, p_venta_id)) then
    raise exception 'Solo la venta más reciente puede cambiar de paquete o fecha';
  end if;

  -- The venta row is rewritten BEFORE the clientes write, so the paquete_nombre subselect below sees
  -- the new name. `folio`, `created_at`, `cliente_id`, `gym_id` and `idempotency_key` are never
  -- touched: folio is the paper ticket, created_at is the delete/swap window anchor. `gym_id = v_gym`
  -- makes a cross-tenant id a REFUSAL, not a silent zero-row no-op.
  update public.ventas
     set monto = p_monto, metodo = p_metodo, fecha = coalesce(v_fecha_ts, fecha),
         paquete_nombre = v_nombre, clases = v_clases,
         vigencia_tipo = v_vig_tipo, vigencia_dias = v_vig_dias, personalizado = v_person
   where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- ── The cheap path: nothing that moves a saldo changed. ─────────────────────────────────────────
  if not (v_cambio_grant or v_cambio_fecha) then
    -- A rename or a personalizado-flag flip still re-stamps the display label, from the latest
    -- REMAINING sale rather than from v_nombre, so renaming a NON-latest sale leaves the label alone.
    if v_cambio_paquete then
      update public.clientes c
         set paquete_nombre = (select v.paquete_nombre from public.ventas v
                                where v.cliente_id = c.id and v.gym_id = v_gym
                                order by v.created_at desc, v.id desc
                                limit 1)
       where c.id = v_venta.cliente_id and c.gym_id = v_gym;   -- defense in depth (see below)
    end if;
    -- A monto/metodo-only edit reaches `clientes` not at all.
    return;
  end if;

  -- Lock the saldo row before the read-modify-write, same discipline as registrar_venta. The venta's FK
  -- guarantees the row exists, so there is no extra refusal string here.
  select c.clases_restantes, c.vence into v_cli
    from public.clientes c where c.id = v_venta.cliente_id
    for update;

  -- ── Clawback of what THIS sale granted — UNCLAMPED (20260815120000's header). ────────────────────
  -- Ruling C1: 'mes' is a flat 30 days; 'dias' uses its own count; null contributes nothing.
  v_dias_old    := case when v_venta.vigencia_tipo = 'mes' then 30
                        else coalesce(v_venta.vigencia_dias, 0) end;
  v_base_clases := case when v_cli.clases_restantes is null then null
                        else v_cli.clases_restantes - coalesce(v_venta.clases, 0) end;

  -- THE ANCHOR, NOT THE BASE (this migration's whole subject — see the header). registrar wrote
  -- `vence = max(base_end, fecha) + dias`, so subtracting the días recovers `max(base_end, fecha)`.
  -- It is the pre-sale base only when a live base outlasted the purchase day; otherwise it IS the
  -- purchase day, and treating it as a base cancels the new fecha out of the forward pass below.
  -- `> v_fecha_old_dia` is the exact test for "a live base outlasted the purchase day", and it makes
  -- the recovery EXACT in that branch (the max resolved to base_end). Everything else reads as a
  -- restart and carries nothing, which is registrar's own behaviour at a day with no live vigencia.
  v_anchor     := case when v_cli.vence is null then null else v_cli.vence - v_dias_old end;
  v_base_vence := case when v_anchor is null              then null
                       when v_anchor > v_fecha_old_dia    then v_anchor
                       else null end;

  -- ── Re-grant at v_fecha_dia — registrar_venta's stacking block, verbatim. ───────────────────────
  v_dias_new := case when v_vig_tipo = 'mes' then 30 else coalesce(v_vig_dias, 0) end;

  -- baseParaStack (C9) evaluated AS OF the sale's day: the vence day is a FULL training day, so
  -- leftovers carry when the day is on/before it and are forfeited the day after. The else arm is
  -- registrar's expired-restart discard: the sale restarts the member from nothing. A null
  -- `v_base_vence` — no live base at all, per the anchor test above — lands here too, which is what
  -- makes "vence follows fecha" bite on a fresh sale.
  if v_base_vence is not null and (v_base_vence - v_fecha_dia) >= 0 then
    v_base_dias := v_base_vence - v_fecha_dia;
  else
    v_base_dias   := 0;
    v_base_clases := 0;
  end if;

  -- stackPaquete (C4): purchase wins, days carry. THE ONE CLAMP lives on the last line of this block
  -- and nowhere else — clamping the clawback instead would gift classes on an over-consumed balance.
  if v_clases is null then
    v_new_clases := null;                                   -- ilimitado package
  elsif v_base_clases is null then
    v_new_clases := v_clases;                               -- ilimitado balance -> finite: pack's count
  else
    v_new_clases := greatest(0, v_base_clases + v_clases);
  end if;
  v_new_vence := v_fecha_dia + v_base_dias + v_dias_new;

  -- No dead-on-arrival refusal here (20260815120000's header): on a correction, "already expired" is
  -- often the truth being recorded.
  --
  -- `c.gym_id = v_gym` is DEFENSE IN DEPTH, not a live gate: the cliente is reached through a venta this
  -- body already pinned to `v_gym`, and the subselect inside carries the same predicate. It exists so
  -- the tenant filter is on the MUTATING statement as well as inside it — the house form — and so a
  -- future path that reaches this update with a cliente_id from somewhere else cannot write cross-gym.
  update public.clientes c
     set clases_restantes = v_new_clases,
         vence            = v_new_vence,
         paquete_nombre   = (select v.paquete_nombre from public.ventas v
                              where v.cliente_id = c.id and v.gym_id = v_gym
                              order by v.created_at desc, v.id desc
                              limit 1)
   where c.id = v_venta.cliente_id and c.gym_id = v_gym;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005): revoke from BOTH public AND anon (a bare revoke from PUBLIC does not
-- remove anon's separate platform default-privilege grant — 20260808130000:104-109) ───────────────
revoke execute on function public.editar_venta(uuid, integer, text, date, uuid, text, integer, integer, boolean) from public, anon;
grant  execute on function public.editar_venta(uuid, integer, text, date, uuid, text, integer, integer, boolean) to authenticated;
