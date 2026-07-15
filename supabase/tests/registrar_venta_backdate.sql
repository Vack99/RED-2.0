-- registrar_venta v4 — backdated sold date suite (spec 2026-07-14 §D1/§D2; migration
-- 20260714110000_registrar_venta_backdate.sql). The WRITTEN-ROWS contract for the new LAST,
-- defaulted p_fecha_inicio: the sale computes AS OF the backdated date and moves BOTH the
-- vence math and the written ledger date (ventas.fecha), uniformly across the registered and
-- personalizado branches. This suite asserts the ROWS the RPC writes (clientes.clases_restantes
-- / vence and ventas.fecha resolved to the gym-tz day), never the return value (#78/#80).
--
-- Vectors (§D7): (1) active-member backdate — vence lands exactly where a today-sale would
-- (v_inicio cancels), only fecha moves [B1]; (2) lapsed member backdated BEFORE the lapse —
-- carries [B2]; (3) lapsed member backdated AFTER the lapse — forfeits [B3]; (4) backdate ON
-- the old vence day — inclusive, leftovers carry [B6/C9]; (5) future date rejected [A2];
-- (6) over the flat-30 cap rejected [A3]; (7) before the client's alta rejected [A4];
-- (8) dead-on-arrival (computed vence < today) rejected [E2], via a short custom package —
-- also proving the bound threads the personalizado branch; (9) NEW client backdated — exempt
-- from the created_at bound, base = 0 [A4]; (10) a NON-backdated sale writes today's fecha
-- (the now() default is preserved byte-for-byte, D1).
--
-- created_at matters here: the backdate-target clients are seeded with a PAST created_at (90d
-- ago), because a backdate before the client's own alta is bound 3 — a client created at the
-- test-txn now() could only be backdated to today. cli_recent (created 5d ago) is the bound-3
-- fixture; the new-client vectors exercise the exempt path.
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

  -- Backdate-target clients — created 90 days ago so a within-30 backdate never trips bound 3.
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
  -- cli_recent: created 5 days ago — the bound-3 fixture (a backdate before its alta must raise).
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

-- ══ V1 — active member backdated 5d: vence lands where a today-sale would (v_inicio cancels), fecha moves ══
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
  -- base_dias = (today+10) - (today-5) = 15; +20 pack ⇒ vence = (today-5)+35 = today+30 (== a today-sale).
  if c.clases_restantes is distinct from 13 then raise exception 'V1 FAIL: clases % (expected 5 + 8 = 13)', c.clases_restantes; end if;
  if c.vence is distinct from today + 30 then raise exception 'V1 FAIL: vence % (expected today+30 — v_inicio cancels)', c.vence; end if;
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
  -- base_dias = (today-3) - (today-10) = 7 (>= 0, carries); +30 ⇒ vence = (today-10)+37 = today+27.
  if c.clases_restantes is distinct from 12 then raise exception 'V2 FAIL: clases % (expected 4 + 8 = 12, carried)', c.clases_restantes; end if;
  if c.vence is distinct from today + 27 then raise exception 'V2 FAIL: vence % (expected today+27)', c.vence; end if;
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
  -- vence-day carry (inclusive): base_dias = 0 (>= 0), clases carry ⇒ 3 + 8 = 11. An EXCLUSIVE gate
  -- (> instead of >=) would forfeit to 8 — this vector is the off-by-one guard. vence = (today-2)+20.
  if c.clases_restantes is distinct from 11 then raise exception 'V4 FAIL: clases % (expected 3 + 8 = 11, vence-day inclusive)', c.clases_restantes; end if;
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

-- ══ V7 — before the client's alta (created 5d ago, backdate 10d) rejected [A4] ════════════════════════
do $$
declare
  ci uuid := current_setting('t.cli_recent', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  got boolean := false; msg text; n int;
begin
  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
      p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 10);
  exception when others then got := true; msg := sqlerrm; end;
  if not got then raise exception 'V7 FAIL: a backdate before the client alta was accepted'; end if;
  if msg is distinct from 'La fecha de inicio es anterior al alta del cliente' then raise exception 'V7 FAIL: wrong error (%)', msg; end if;
  select count(*) into n from public.ventas where idempotency_key = k;
  if n <> 0 then raise exception 'V7 FAIL: % ventas rows written (expected 0)', n; end if;
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

-- ══ V9 — NEW client backdated 7d: exempt from the created_at bound, base = 0 [A4] ═════════════════════
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
