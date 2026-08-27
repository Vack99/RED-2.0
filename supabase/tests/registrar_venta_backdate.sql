-- registrar_venta v4 — backdated sold date suite (spec 2026-07-14 §D1/§D2; migration
-- 20260714110000_registrar_venta_backdate.sql). The WRITTEN-ROWS contract for the new LAST,
-- defaulted p_fecha_inicio: the sale computes AS OF the backdated date and moves BOTH the
-- vence math and the written ledger date (ventas.fecha), uniformly across the registered and
-- personalizado branches. This suite asserts the ROWS the RPC writes (clientes.clases_restantes
-- / vence and ventas.fecha resolved to the gym-tz day), never the return value (#78/#80).
--
-- RENEWAL IS A FULL RESET (owner ruling 2026-08-26, migration 20260826120200): a sale grants the
-- pack's clases and `v_inicio + the pack's days`, carrying nothing. That does not weaken this suite —
-- it SHARPENS it, because v_inicio used to cancel out of the vence math on an active base (the carried
-- days exactly replaced the backdated ones) and now it does not. Every vector below is therefore a
-- real statement about the sold date rather than one about stacking; the numbers that moved on
-- 2026-08-26 are called out inline.
--
-- Vectors (§D7): (1) active-member backdate — the vigencia runs from the SOLD DAY, and fecha moves
-- [B1]; (2) lapsed member backdated BEFORE the lapse — the still-live base buys nothing [B2];
-- (3) lapsed member backdated AFTER the lapse — forfeits [B3]; (4) backdate ON the old vence day —
-- the C9 off-by-one gate is gone, both sides answer the pack [B6/C9]; (5) future date rejected [A2];
-- (6) over the flat-30 cap rejected [A3]; (7) before the client's alta ACCEPTED — the [A4] floor
-- was dropped by the owner on 2026-08-14 (20260814130000); (8) dead-on-arrival (computed vence <
-- today) rejected [E2], via a short custom package — also proving the bound threads the
-- personalizado branch; (9) NEW client backdated, base = 0; (10) a NON-backdated sale writes
-- today's fecha (the now() default is preserved byte-for-byte, D1).
--
-- The [A4] alta floor is GONE from both doors: gyms register walk-ins late, so `clientes.created_at`
-- is a data-entry stamp rather than the day the member arrived, and the floor refused exactly the
-- forgotten sale backdating exists for. The two surviving date bounds are the not-future guard [A2]
-- and the flat-30 window [A3]. cli_recent (created 5d ago) is now V7's ACCEPTANCE fixture; the
-- backdate-target clients keep their 90d-old created_at because their vence math, not a floor,
-- is what the vectors read.
--
-- Zero prod UUIDs (ADR-0013 §5): a synthetic gym + operator + catalog, all gen_random_uuid().
-- One BEGIN/ROLLBACK so a scratch project is REUSABLE. Self-asserting: every check RAISEs on
-- failure; a clean run returns one 'OK' row.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (pnpm test:denial) against a scratch ref
-- — NOT live. Transaction-local, rolls back.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_bd  uuid := gen_random_uuid();
  op_user uuid := gen_random_uuid();
  v_today date;
  p_fin8_20 uuid; p_fin8_30 uuid;
  cli_active uuid; cli_lbefore uuid; cli_lafter uuid; cli_onvence uuid;
  cli_future uuid; cli_cap uuid; cli_recent uuid; cli_doa uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_bd, 'registrar-backdate-suite-gym', 'Registrar Backdate Suite', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_user, 'authenticated', 'authenticated', 'op@backdate.local', now(), '{}');
  insert into public.gym_membership (user_id, gym_id, role) values (op_user, gym_bd, 'owner');

  v_today := (now() at time zone 'America/Mexico_City')::date;

  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_bd, '8 clases 20d', 8, 'dias', 20, 800) returning id into p_fin8_20;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_bd, '8 clases 30d', 8, 'dias', 30, 850) returning id into p_fin8_30;

  -- Backdate-target clients — created 90 days ago, the ordinary long-standing-member shape.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at) values
    (gym_bd, 'BD Active',   '6300000001', 5, v_today + 10, '8 clases 20d', now() - interval '90 days') returning id into cli_active;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at) values
    (gym_bd, 'BD LapsedBf', '6300000002', 4, v_today - 3,  '8 clases 30d', now() - interval '90 days') returning id into cli_lbefore;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at) values
    (gym_bd, 'BD LapsedAf', '6300000003', 2, v_today - 10, '8 clases 30d', now() - interval '90 days') returning id into cli_lafter;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at) values
    (gym_bd, 'BD OnVence',  '6300000004', 3, v_today - 2,  '8 clases 20d', now() - interval '90 days') returning id into cli_onvence;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at) values
    (gym_bd, 'BD Future',   '6300000005', 5, v_today + 10, '8 clases 20d', now() - interval '90 days') returning id into cli_future;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at) values
    (gym_bd, 'BD Cap',      '6300000006', 5, v_today + 10, '8 clases 20d', now() - interval '90 days') returning id into cli_cap;
  -- cli_recent: created 5 days ago — V7's fixture (a backdate before its alta must now be ACCEPTED).
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at) values
    (gym_bd, 'BD Recent',   '6300000007', 5, v_today + 10, '8 clases 20d', now() - interval '5 days') returning id into cli_recent;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at) values
    (gym_bd, 'BD DeadOnArr','6300000008', 2, v_today - 20, '8 clases 30d', now() - interval '90 days') returning id into cli_doa;

  perform set_config('t.gym_bd',      gym_bd::text,      true);
  perform set_config('t.op_user',     op_user::text,     true);
  perform set_config('t.p_fin8_20',   p_fin8_20::text,   true);
  perform set_config('t.p_fin8_30',   p_fin8_30::text,   true);
  perform set_config('t.cli_active',  cli_active::text,  true);
  perform set_config('t.cli_lbefore', cli_lbefore::text, true);
  perform set_config('t.cli_lafter',  cli_lafter::text,  true);
  perform set_config('t.cli_onvence', cli_onvence::text, true);
  perform set_config('t.cli_future',  cli_future::text,  true);
  perform set_config('t.cli_cap',     cli_cap::text,     true);
  perform set_config('t.cli_recent',  cli_recent::text,  true);
  perform set_config('t.cli_doa',     cli_doa::text,     true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_user', true), 'role', 'authenticated')::text, true);
set local role authenticated;

-- ══ V1 — active member backdated 5d: the vigencia runs from the SOLD DAY, and the fecha moves ═════════
-- Pre-2026-08-26 the carried days made v_inicio cancel out, so a backdated sale expired on the same day
-- a today-sale would (13 clases, today+30). Under FULL RESET nothing cancels: the pack runs its own 20
-- days from the day it was sold, so backdating now genuinely costs the member those 5 days.
do $$
declare
  ci uuid := current_setting('t.cli_active', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record; v_dia date;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 5);
  select clases_restantes, vence into c from public.clientes where id = ci;
  -- base 0/0 as of the sold day ⇒ vence = (today-5) + 20 = today+15; clases = the pack's 8.
  if c.clases_restantes is distinct from 8 then raise exception 'V1 FAIL: clases % (expected the pack''s 8; at 13 the 5 leftovers carried)', c.clases_restantes; end if;
  if c.vence is distinct from today + 15 then raise exception 'V1 FAIL: vence % (expected (today-5)+20 = today+15; at today+30 the base''s 15 days carried)', c.vence; end if;
  select fecha into v from public.ventas where idempotency_key = k;
  v_dia := (v.fecha at time zone 'America/Mexico_City')::date;
  if v_dia is distinct from today - 5 then raise exception 'V1 FAIL: ventas.fecha gym-tz day % (expected today-5, the backdated sold day)', v_dia; end if;
end $$;

-- ══ V2 — lapsed member (vence today-3) backdated BEFORE the lapse (today-10): base carries [B2] ═══════════
do $$
declare
  ci uuid := current_setting('t.cli_lbefore', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record; v_dia date;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_30', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 10);
  select clases_restantes, vence into c from public.clientes where id = ci;
  -- FULL RESET (2026-08-26): the base was still live as of the sold day (vence today-3 >= today-10), and
  -- that no longer buys it anything — base 0/0 ⇒ vence = (today-10)+30 = today+20, clases = the pack's 8.
  if c.clases_restantes is distinct from 8 then raise exception 'V2 FAIL: clases % (expected the pack''s 8; at 12 the 4 leftovers carried)', c.clases_restantes; end if;
  if c.vence is distinct from today + 20 then raise exception 'V2 FAIL: vence % (expected (today-10)+30 = today+20; at today+27 the base''s 7 days carried)', c.vence; end if;
  select fecha into v from public.ventas where idempotency_key = k;
  v_dia := (v.fecha at time zone 'America/Mexico_City')::date;
  if v_dia is distinct from today - 10 then raise exception 'V2 FAIL: ventas.fecha gym-tz day % (expected today-10)', v_dia; end if;
end $$;

-- ══ V3 — lapsed member (vence today-10) backdated AFTER the lapse (today-5): base forfeits [B3] ═══════════
do $$
declare
  ci uuid := current_setting('t.cli_lafter', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record; v_dia date;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_30', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 5);
  select clases_restantes, vence into c from public.clientes where id = ci;
  -- base = 0 (vence today-10 < v_inicio today-5 ⇒ forfeit); +30 ⇒ vence = (today-5)+30 = today+25.
  if c.clases_restantes is distinct from 8 then raise exception 'V3 FAIL: clases % (expected forfeit → 0 + 8 = 8)', c.clases_restantes; end if;
  if c.vence is distinct from today + 25 then raise exception 'V3 FAIL: vence % (expected today+25)', c.vence; end if;
  select fecha into v from public.ventas where idempotency_key = k;
  v_dia := (v.fecha at time zone 'America/Mexico_City')::date;
  if v_dia is distinct from today - 5 then raise exception 'V3 FAIL: ventas.fecha gym-tz day % (expected today-5)', v_dia; end if;
end $$;

-- ══ V4 — backdate ON the old vence day (today-2): inclusive, leftovers carry [B6/C9] ════════════════════
do $$
declare
  ci uuid := current_setting('t.cli_onvence', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record; v_dia date;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 2);
  select clases_restantes, vence into c from public.clientes where id = ci;
  -- This used to be the vence-day off-by-one guard (>= vs >): a base whose vence fell exactly ON the
  -- sold day carried its classes, 3 + 8 = 11. FULL RESET (2026-08-26) removes the gate the off-by-one
  -- lived in, so both sides of it now answer 8 — the vector survives as the pin that the sold day is
  -- still what the vigencia runs from. vence = (today-2)+20 is unchanged (base_dias was already 0).
  if c.clases_restantes is distinct from 8 then raise exception 'V4 FAIL: clases % (expected the pack''s 8; at 11 the vence-day carry survived)', c.clases_restantes; end if;
  if c.vence is distinct from today + 18 then raise exception 'V4 FAIL: vence % (expected today+18)', c.vence; end if;
  select fecha into v from public.ventas where idempotency_key = k;
  v_dia := (v.fecha at time zone 'America/Mexico_City')::date;
  if v_dia is distinct from today - 2 then raise exception 'V4 FAIL: ventas.fecha gym-tz day % (expected today-2)', v_dia; end if;
end $$;

-- ══ V5 — future date rejected [A2]; nothing written, client untouched ══════════════════════════════════
do $$
declare
  ci uuid := current_setting('t.cli_future', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  got boolean := false; msg text; n int; c record;
begin
  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
      p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today + 1);
  exception when others then got := true; msg := sqlerrm; end;
  if not got then raise exception 'V5 FAIL: a future fecha_inicio was accepted'; end if;
  if msg is distinct from 'La fecha de inicio no puede ser futura' then raise exception 'V5 FAIL: wrong error (%)', msg; end if;
  select count(*) into n from public.ventas where idempotency_key = k;
  if n <> 0 then raise exception 'V5 FAIL: % ventas rows written (expected 0)', n; end if;
  select clases_restantes, vence into c from public.clientes where id = ci;
  if c.clases_restantes is distinct from 5 or c.vence is distinct from today + 10 then
    raise exception 'V5 FAIL: client mutated by the rejected sale (clases %, vence %)', c.clases_restantes, c.vence;
  end if;
end $$;

-- ══ V6 — over the flat-30 look-back cap (today-31) rejected [A3] ═══════════════════════════════════════
do $$
declare
  ci uuid := current_setting('t.cli_cap', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  got boolean := false; msg text; n int;
begin
  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
      p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 31);
  exception when others then got := true; msg := sqlerrm; end;
  if not got then raise exception 'V6 FAIL: a fecha_inicio 31 days back was accepted (cap not enforced)'; end if;
  if msg is distinct from 'La fecha de inicio no puede tener más de 30 días de antigüedad' then raise exception 'V6 FAIL: wrong error (%)', msg; end if;
  select count(*) into n from public.ventas where idempotency_key = k;
  if n <> 0 then raise exception 'V6 FAIL: % ventas rows written (expected 0)', n; end if;
end $$;

-- ══ V7 — before the client's alta (created 5d ago, backdate 10d) is ACCEPTED — the [A4] floor is gone ══
-- Owner ruling 2026-08-14 (migration 20260814130000): a walk-in trains and pays before anyone types
-- them into the system, so `clientes.created_at` dates the DATA ENTRY, not the membership — and the
-- floor refused precisely the late-registered sale backdating exists to record. This vector is the
-- former refusal, inverted: the sale must land, with the ordinary stacking math and written fecha, and
-- the two surviving bounds (V5 future, V6 flat-30) still refuse on their own.
do $$
declare
  ci uuid := current_setting('t.cli_recent', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record; v_dia date; v_alta date;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 10);
  select clases_restantes, vence into c from public.clientes where id = ci;
  -- FULL RESET (2026-08-26): base 0/0 ⇒ vence = (today-10)+20 = today+10, clases = the pack's 8. The
  -- new vence is 10 days EARLIER than the base's own today+10 — a full-price sale that shortens the
  -- member's vigencia is exactly what backdating a reset means, and bound 4 still passes (today+10 ≥ today).
  if c.clases_restantes is distinct from 8 then raise exception 'V7 FAIL: clases % (expected the pack''s 8; at 13 the 5 leftovers carried)', c.clases_restantes; end if;
  if c.vence is distinct from today + 10 then raise exception 'V7 FAIL: vence % (expected (today-10)+20 = today+10; at today+30 the base''s 20 days carried)', c.vence; end if;
  select fecha, monto into v from public.ventas where idempotency_key = k;
  if v.monto is distinct from 800 then raise exception 'V7 FAIL: monto % (expected 800 — the sale row must be written)', v.monto; end if;
  v_dia := (v.fecha at time zone 'America/Mexico_City')::date;
  if v_dia is distinct from today - 10 then raise exception 'V7 FAIL: ventas.fecha gym-tz day % (expected today-10, before the alta and legal)', v_dia; end if;
  -- The ruling drops a READ of the alta; it never rewrites one.
  select (created_at at time zone 'America/Mexico_City')::date into v_alta from public.clientes where id = ci;
  if v_alta is distinct from today - 5 then raise exception 'V7 FAIL: cliente created_at day % (expected today-5, untouched by the sale)', v_alta; end if;
end $$;

-- ══ V8 — dead-on-arrival (computed vence < today) rejected [E2], via a short CUSTOM package ═════════════
do $$
declare
  ci uuid := current_setting('t.cli_doa', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  got boolean := false; msg text; n int; c record;
begin
  -- Lapsed base (vence today-20) forfeits at v_inicio (today-5); a 3-day custom package ⇒ vence =
  -- (today-5)+3 = today-2 < today → dead on arrival. Also proves the bound threads the custom branch.
  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 5,
      p_custom_nombre := 'Promo Corta', p_custom_precio := 300, p_custom_clases := 5, p_custom_dias := 3);
  exception when others then got := true; msg := sqlerrm; end;
  if not got then raise exception 'V8 FAIL: a dead-on-arrival backdate was accepted'; end if;
  if msg is distinct from 'La venta ya estaría vencida en la fecha de inicio' then raise exception 'V8 FAIL: wrong error (%)', msg; end if;
  select count(*) into n from public.ventas where idempotency_key = k;
  if n <> 0 then raise exception 'V8 FAIL: % ventas rows written (expected 0)', n; end if;
  select clases_restantes, vence into c from public.clientes where id = ci;
  if c.clases_restantes is distinct from 2 or c.vence is distinct from today - 20 then
    raise exception 'V8 FAIL: client mutated by the rejected sale (clases %, vence %)', c.clases_restantes, c.vence;
  end if;
end $$;

-- ══ V9 — NEW client backdated 7d: base = 0, and the sale still lands on the backdated day ════════════
do $$
declare
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  r record; c record; v record; v_dia date;
begin
  select * into r from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_nombre := 'BD Nuevo', p_tel := '6300000101', p_fecha_inicio := today - 7);
  select clases_restantes, vence into c from public.clientes where id = r.cliente_id;
  -- base 0 (new client); +20 ⇒ vence = (today-7)+20 = today+13.
  if c.clases_restantes is distinct from 8 then raise exception 'V9 FAIL: clases % (expected 8)', c.clases_restantes; end if;
  if c.vence is distinct from today + 13 then raise exception 'V9 FAIL: vence % (expected today+13)', c.vence; end if;
  select fecha, personalizado into v from public.ventas where idempotency_key = k;
  v_dia := (v.fecha at time zone 'America/Mexico_City')::date;
  if v_dia is distinct from today - 7 then raise exception 'V9 FAIL: ventas.fecha gym-tz day % (expected today-7)', v_dia; end if;
  if v.personalizado is distinct from false then raise exception 'V9 FAIL: personalizado % (expected false)', v.personalizado; end if;
end $$;

-- ══ V10 — a NON-backdated sale (no p_fecha_inicio) writes TODAY's fecha (now() default preserved, D1) ══
do $$
declare
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  r record; v record; v_dia date;
begin
  select * into r from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_nombre := 'BD Hoy', p_tel := '6300000102');
  select fecha into v from public.ventas where idempotency_key = k;
  v_dia := (v.fecha at time zone 'America/Mexico_City')::date;
  if v_dia is distinct from today then raise exception 'V10 FAIL: ventas.fecha gym-tz day % (expected today — now() default)', v_dia; end if;
end $$;

reset role;

select 'registrar_venta backdate suite: OK' as result;
rollback;
