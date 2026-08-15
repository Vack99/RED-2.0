-- Paquete-swap correction — `editar_venta` grows the package arguments and RE-DERIVES the saldo.
-- Owner rulings 2026-08-15 (thread #266, on top of #269's correction pair):
--
--   1. VENCE FOLLOWS FECHA. Editing a sale's `fecha` re-derives the cliente's vigencia and balance.
--   2. PACKAGE SWAP. The operator picks a different paquete (or a personalizado one) for an EXISTING
--      venta; clases/vigencia/monto follow it. Clawback-of-the-old-grant + re-grant-of-the-new, in ONE
--      transaction — never a delta adjustment of the sale row alone.
--   3. DELETE GATE. ELIMINAR is unavailable exactly when the clawback would push the balance below
--      zero; the swap stays available in that state. (Partially reverses #267.4 — see §3.)
--   4. The swap is windowed to 30 days from `created_at`, like the delete.
--
-- ── AMENDMENT: 20260814120000's saldo paragraph is REVERSED ─────────────────────────────────────────
-- That migration's header states "`clientes.vence`, `clases_restantes` and `paquete_nombre` are
-- deliberately NOT recomputed … re-deriving a saldo from a moved fecha would be a guess dressed as a
-- correction. When the vigencia itself must move, delete + re-sell through the normal flow remains the
-- tool." Ruling 1 overturns that scope: a fecha edit now DOES re-derive, through the same clawback +
-- re-grant core the swap uses. What made the re-derive a guess in that header was the missing inverse;
-- what makes it sound now is that the inverse and the forward pass run in the SAME transaction, from
-- the same locked rows, so nothing is reconstructed from history — the sale's own stored grant is
-- subtracted and registrar_venta's stacking block is replayed at the new day. That subtraction is a
-- LINEAR inverse (`vence − dias_old`, `clases_restantes − clases_old`), and it recovers the pre-sale
-- base ONLY while this sale is still the last one that touched the saldo — the top-of-stack
-- precondition enforced below is what makes the sentence above true rather than merely plausible.
-- When nothing clamps the round trip is an exact IDENTITY (editar_venta_rules.sql VF1/VF5 keep passing
-- untouched, unchanged).
--
-- ── ONE core, one RPC ──────────────────────────────────────────────────────────────────────────────
-- `editar_venta` grows the package arguments; there is no second function. A fecha-only re-derive is
-- literally "swap with the same package facts", so the clawback + re-grant math exists once. A separate
-- `cambiar_paquete_venta` would need the identical body (it must also honour a fecha change in the same
-- transaction) and would fight `editar_venta` for the same row and the same lock.
--
-- ── SECURITY DEFINER, and why the `fecha` column grant DIES ─────────────────────────────────────────
-- editar_venta now writes `ventas.{paquete_nombre,clases,vigencia_tipo,vigencia_dias,personalizado}`
-- and `clientes.{clases_restantes,vence,paquete_nombre}`. As INVOKER those would ALL need table grants,
-- which is exactly the raw-PATCH surface 20260813120000 closed. So it becomes DEFINER, on the
-- eliminar_venta pattern verbatim: `staff_gym()` + `gym_id = v_gym` + `set search_path to ''`.
--
-- And the `update (fecha)` grant 20260814120000 added is REVOKED. It existed only because the INVOKER
-- body needed it. Under ruling 1 `fecha` stops being an attribution-only column: a raw
-- `PATCH ventas?fecha=` would now leave the stored balance describing a vigencia that started on a
-- different day — a silent divergence between the sale and the saldo it is supposed to explain. Back to
-- the 20260813120000 column set, `grant update (monto, metodo)`. Both survivors are still pure
-- attribution, so the residual that migration accepted (gym-staff-scoped self-harm on the gym's own
-- amounts, RLS still pinning the tenant) is unchanged. Definer means the RPC does not care.
--
-- ── THE CLAMP FIRES ONCE, AT THE END — load-bearing, not a detail ───────────────────────────────────
-- The clawback's intermediate balance is allowed to go NEGATIVE inside the transaction; `greatest(0, …)`
-- is applied only to the final re-granted number. Clamping per step would silently gift classes:
--
--   case                                  | balance | old grant | new grant | per-step  | at-end
--   fecha-only move (nothing else clamps) |    3    |     8     |     8     | 0 -> 8 !! | 3  (identity)
--   swap up, over-consumed                |    3    |     8     |    12     | 0 -> 12!! | 7
--   swap down                             |    3    |     8     |     4     | 0 ->  4!! | 0
--
-- #267.4's floor is not weakened by this: it governs DELETE, where nothing is re-granted and a stored
-- negative would be nonsense. Here the intermediate is never a stored state.
--
-- ── THE RE-DERIVE IS TRIGGERED BY CHANGE, NEVER BY THE CALL ─────────────────────────────────────────
-- `v_cambio_grant` (clases / vigencia_tipo / vigencia_dias differ from the stored row) OR
-- `v_cambio_fecha` (the resolved gym-tz day differs). A monto/metodo-only edit, or a re-post of an
-- already-applied swap, touches `clientes` not at all. Without that guard a no-op call would run the
-- whole clawback + re-grant and the floor / expired-restart branches would move a balance nobody asked
-- to move. It is also why no idempotency key is needed: the write is an UPDATE of a row named by id, so
-- a replay creates no second row and no folio; `for update` on the venta serialises concurrent calls
-- and the second identical payload degenerates to a monto/metodo write with the same values.
-- (`registrar_venta` needs a key because it INSERTs; this does not. Pinned by S6.)
--
-- ── ONLY THE TOP OF THE STACK CAN RE-DERIVE ────────────────────────────────────────────────────────
-- The clawback is a LINEAR inverse of what this sale granted, so it reconstructs the pre-sale base only
-- while no LATER sale has stacked on top of it. registrar_venta's stacking is NOT linear — its
-- expired-restart discard throws the carried base away — so a later sale's grant cannot be recovered by
-- subtracting an earlier sale's numbers. Concretely: V1 (8 clases / 20 días, sold 25 days ago, lapsed)
-- then V2 (the same package, sold 2 days ago) leaves the member on V2's restart, 8 clases / vence +18.
-- Swapping V1 onto a 12-clase mes package would take 8 − 8 = 0 for "the base", re-grant at V1's day and
-- write 12 clases / vence +28 — V2's whole grant silently destroyed and V1's counted twice.
-- So whenever the call would re-derive (`v_cambio_grant or v_cambio_fecha`), another venta of the same
-- cliente with a later (created_at, id) refuses it: 'Solo la venta más reciente puede cambiar de
-- paquete o fecha'. That is the same tuple order the paquete_nombre re-stamp subselect uses, so "the
-- latest sale" means one thing in this function. Monto/metodo-only edits move no saldo and stay legal
-- on ANY sale (S12), which is what keeps an older sale's ATTRIBUTION correctable.
--
-- ── The window covers the whole RE-DERIVE, not just the package change ─────────────────────────────
-- Ruling 4 windows "the swap" at 30 days from `created_at`; the guard is written over the predicate
-- that TRIGGERS the re-derive (`v_cambio_grant or v_cambio_fecha`). A fecha-only edit re-grants exactly
-- as much as a swap does, and on a sale of unbounded age the discard arm makes it a re-grant of the
-- whole package: a 100-clase / 365-día sale dated 400 days ago, member long since down to 5, "corrected"
-- to 10 days ago walks away with 100 clases and vence +355. Windowing the re-grant but not the fecha
-- that drives it leaves that door open under a different argument name, so the refusal is stated over
-- the recalculation itself: 'Ya pasaron 30 días: esta venta ya no se puede recalcular'. monto/metodo
-- stay any-age (#266.3), and so does a pure RENAME (a package with the same grant, no fecha change): it
-- moves no saldo, so it is attribution like they are.
--
-- ── registrar's dead-on-arrival refusal is NOT replicated ───────────────────────────────────────────
-- `registrar_venta` raises 'La venta ya estaría vencida en la fecha de inicio' to stop the desk
-- CREATING a useless sale. On a CORRECTION the already-expired outcome is often the truth being
-- recorded (a 5-day pass sold 20 days ago); refusing would make that truth unrecordable. Everything
-- else in the stacking block is verbatim, the expired-restart discard included: if the post-clawback
-- `vence` falls before the sale's day, `base_dias := 0` and `base_clases := 0`, exactly as registrar
-- does — so "vence follows fecha" bites precisely where registrar's own rule bites, and a stacked
-- purchase's vence legitimately does not move when the member was still vigente at the sale date.
--
-- ── The ilimitado arm is deliberately LOSSY ─────────────────────────────────────────────────────────
-- Swapping onto an ilimitado package nulls the balance, which erases the carried count, and swapping
-- back re-grants only the new package's own clases (`v_base_clases is null` ⇒ `v_new_clases := v_clases`)
-- — the round trip does NOT restore what was carried. That is inherent to null-means-ilimitado
-- (ADR-0004): a null balance holds no number to carry. It is not repaired here; the sheet's inline
-- preview shows the resulting saldo before the write, and that is the operator's warning.
--
-- Expand-only (grant re-scope, two function replacements), idempotent (drop-if-exists + create-or-
-- replace, grants re-apply cleanly), safe out of order on the live project.

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Grants — back to the 20260813120000 column set (see header): the `fecha` grant goes.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Revoking the TABLE-level privilege also removes every column-level UPDATE privilege on it, which is
-- what actually drops 20260814120000's `grant update (fecha)`. `anon` is named explicitly: the Supabase
-- scaffold grants it separately from PUBLIC. `ventas_staff_update` stays — it still composes with the
-- surviving monto/metodo residual, and eliminar_venta_rules.sql's GRANT LAYER block pins all three arms.
revoke update on public.ventas from anon, authenticated;
grant  update (monto, metodo) on public.ventas to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. editar_venta — monto + método + fecha + THE PACKAGE, with the clawback/re-grant core.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Drop the older signatures FIRST. PostgREST resolves an RPC by the NAME SET of the posted arguments,
-- so leaving a 4-arg overload beside a 9-arg-with-defaults makes every 3-/4-arg call — the one the app
-- ships today — ambiguous (PGRST203, "could not choose the best candidate function").
drop function if exists public.editar_venta(uuid, integer, text);
drop function if exists public.editar_venta(uuid, integer, text, date);

-- No `p_custom_precio`: the sheet already has a MONTO field and it IS the sale's price, so two price
-- arguments on one door would be a "which one wins" trap. The consequence is deliberate — registrar's
-- 100 000 personalizado cap does not apply here; `monto`'s bound stays the one-sided `>= 1` below.
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
    -- the block) is what makes a fecha-only edit run the SAME core with old == new, so the round trip
    -- is a provable identity instead of a second code path.
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
  -- The day the re-grant stacks from: the requested one, else the sale's own stored gym-tz day.
  v_fecha_dia := coalesce(p_fecha, (v_venta.fecha at time zone v_tz)::date);

  -- ── Change detection (see header): the re-derive is triggered by a CHANGE, never by the call. ────
  v_cambio_grant   := (v_clases   is distinct from v_venta.clases)
                   or (v_vig_tipo is distinct from v_venta.vigencia_tipo)
                   or (v_vig_dias is distinct from v_venta.vigencia_dias);
  v_cambio_paquete := v_cambio_grant
                   or (v_nombre is distinct from v_venta.paquete_nombre)
                   or (v_person is distinct from v_venta.personalizado);
  v_cambio_fecha   := p_fecha is not null
                  and p_fecha is distinct from (v_venta.fecha at time zone v_tz)::date;

  -- Ruling 4's window, written over the RE-DERIVE and not over the package change alone (see header):
  -- a fecha-only edit re-grants exactly as much as a swap does. monto/metodo — and a pure rename, which
  -- moves no saldo — stay any-age (#266.3).
  if (v_cambio_grant or v_cambio_fecha) and v_venta.created_at < now() - interval '30 days' then
    raise exception 'Ya pasaron 30 días: esta venta ya no se puede recalcular';
  end if;

  -- The top-of-stack precondition (see header): the clawback is a LINEAR inverse, so it only recovers
  -- the pre-sale base while nothing has stacked on top of this sale. A later sale of the same cliente
  -- makes the subtraction meaningless and would silently destroy that later sale's grant, so the
  -- re-derive is refused outright rather than approximated. Monto/metodo-only edits never reach here.
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

  -- ── Clawback of what THIS sale granted — UNCLAMPED (see header). ────────────────────────────────
  -- Ruling C1: 'mes' is a flat 30 days; 'dias' uses its own count; null contributes nothing.
  v_dias_old    := case when v_venta.vigencia_tipo = 'mes' then 30
                        else coalesce(v_venta.vigencia_dias, 0) end;
  v_base_clases := case when v_cli.clases_restantes is null then null
                        else v_cli.clases_restantes - coalesce(v_venta.clases, 0) end;
  v_base_vence  := case when v_cli.vence is null then null else v_cli.vence - v_dias_old end;

  -- ── Re-grant at v_fecha_dia — registrar_venta's stacking block, verbatim. ───────────────────────
  v_dias_new := case when v_vig_tipo = 'mes' then 30 else coalesce(v_vig_dias, 0) end;

  -- baseParaStack (C9) evaluated AS OF the sale's day: the vence day is a FULL training day, so
  -- leftovers carry when the day is on/before it and are forfeited the day after. The else arm is
  -- registrar's expired-restart discard: the sale restarts the member from nothing.
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

  -- No dead-on-arrival refusal here (see header): on a correction, "already expired" is often the
  -- truth being recorded.
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

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. eliminar_venta — the floor-clip gate (ruling 3).
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- #267.4 shipped "the used-classes edge proceeds, floored at 0". The owner narrowed that on 2026-08-15:
-- if the clawback would push the balance BELOW zero, the classes were really taken and deleting the
-- sale would erase a debt the member actually incurred — so ELIMINAR is refused and the operator is
-- pointed at the swap, which stays available in exactly that state (it re-grants, so it never has to
-- store a negative). Landing on EXACTLY 0 is still allowed: only strictly-below is refused. An
-- ilimitado sale (`clases` null) and an ilimitado balance (`clases_restantes` null) can never floor, so
-- neither trips the gate. The `vence` half is deliberately ungated — the ruling names the balance.
--
-- Same signature, create-or-replace: no new overload, no PGRST203 window. The only change is that the
-- bare `perform 1 … for update` becomes a READING lock plus the gate.
create or replace function public.eliminar_venta(p_venta_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_gym   uuid;
  v_venta record;
  v_dias  integer;
  v_saldo integer;
begin
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- FOR UPDATE on the VENTA, not just on the cliente below: two overlapping deletes of the same sale
  -- would otherwise both pass the window check, serialize on the clientes lock, and each apply the full
  -- clawback — the loser deleting zero rows but still subtracting the clases/días a second time, which
  -- corrupts the stored balance permanently. The lock makes the second call wait and then find nothing.
  select v.cliente_id, v.clases, v.vigencia_tipo, v.vigencia_dias, v.created_at into v_venta
    from public.ventas v
    where v.id = p_venta_id and v.gym_id = v_gym
    for update;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- #266.2: the window runs from registration, NOT from the backdatable sold date `fecha`.
  if v_venta.created_at < now() - interval '30 days' then
    raise exception 'La venta ya no se puede eliminar';
  end if;

  -- Lock the saldo row before the read-modify-write, same discipline as registrar_venta — and READ it,
  -- because the floor-clip gate below is a predicate on it.
  select c.clases_restantes into v_saldo
    from public.clientes c where c.id = v_venta.cliente_id
    for update;

  -- Ruling 3, the floor-clip gate. Strictly-below-zero only; `= 0` is allowed.
  if v_saldo is not null and v_venta.clases is not null and v_saldo - v_venta.clases < 0 then
    raise exception 'No se puede eliminar: ya se usaron clases de esta venta';
  end if;

  -- The tenant predicate rides the MUTATING statement (house form), and the rowcount check makes a
  -- zero-row delete a refusal instead of a clawback with nothing to claw back.
  delete from public.ventas where id = p_venta_id and gym_id = v_gym;
  if not found then raise exception 'Venta no encontrada'; end if;

  -- Ruling C1: 'mes' is a flat 30 days; 'dias' uses its own count; null contributes nothing.
  v_dias := case when v_venta.vigencia_tipo = 'mes' then 30
                 else coalesce(v_venta.vigencia_dias, 0) end;

  -- The lossy inversion (20260813120000's header): subtract what this sale granted. The greatest(0, …)
  -- survives as a belt — the gate above already proved the subtraction cannot go below zero — because
  -- an ilimitado-balance row still reaches this line and the null arm must keep its meaning.
  -- paquete_nombre reverts to the most recent REMAINING sale; null when none remain (#267.5).
  -- `c.gym_id = v_gym` is defense in depth, matching editar_venta above: the cliente is reached through
  -- a venta already pinned to v_gym and the subselect carries the same predicate, but the tenant filter
  -- belongs on the mutating statement too (the house form).
  update public.clientes c
     set clases_restantes = case when c.clases_restantes is null then null
                                 else greatest(0, c.clases_restantes - coalesce(v_venta.clases, 0)) end,
         vence = case when c.vence is null then null else c.vence - v_dias end,
         paquete_nombre = (select v.paquete_nombre from public.ventas v
                            where v.cliente_id = c.id and v.gym_id = v_gym
                            order by v.created_at desc, v.id desc
                            limit 1)
   where c.id = v_venta.cliente_id and c.gym_id = v_gym;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005) ────────────────────────────────────────────────────────────────────
revoke execute on function public.eliminar_venta(uuid) from public, anon;
grant  execute on function public.eliminar_venta(uuid) to authenticated;
