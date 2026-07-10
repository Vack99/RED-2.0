-- registrar_venta re-derivation + stacking suite (ruling C13; findings 2026-07-08). The WRITTEN-ROWS
-- contract for the rewritten money RPC: the client now sends ONLY identity + p_paquete_id + p_metodo +
-- p_idempotency_key, and the DB re-derives price / balance / vence from the paquete row inside one locked
-- transaction. This suite is the SQL mirror of packages/domain/src/rules.test.ts — one vector per rules.ts
-- case — and asserts the ROWS the RPC writes (clientes.clases_restantes / vence / paquete_nombre / email
-- and the ventas row's monto / metodo / gym_id / idempotency_key), never just the return value (#78/#80).
--
-- Vectors: (1) fresh finite, (2) fresh mes = +30 [C1], (3) early mes renewal = old vence +30 [C1],
-- (4) renewal ON the vence day carries [C9], (5) lapsed base forfeits, (6) active ilimitado + finite =
-- pack's count, days add [C4], (7) finite + ilimitado pack = ilimitado, days add [C4], (8) idempotent
-- replay = one venta, same folio [C6], (9) duplicate guard + p_forzar_nuevo override [D2], (10) email
-- backfill / keep [C7], (11) 'pendiente' rejected [C2], (12) cross-gym paquete = not found.
--
-- Zero prod UUIDs (ADR-0013 §5): a synthetic gym + operator + catalog, all gen_random_uuid(). One
-- BEGIN/ROLLBACK so a scratch project is REUSABLE and accumulates no state. Self-asserting: every check
-- RAISEs on failure; a clean run returns one 'OK' row.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs`, or ad hoc against a scratch
-- ref via the Supabase MCP execute_sql (pure SQL, no psql meta).

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_stk   uuid := gen_random_uuid();
  gym_other uuid := gen_random_uuid();   -- a second gym, for the cross-gym-paquete scope vector
  op_user   uuid := gen_random_uuid();   -- owner of gym_stk — authors every sale (staff_gym())
  v_today   date;
  p_fin8_20 uuid; p_mes uuid; p_fin8_30 uuid; p_ilim uuid; p_other uuid;
  cli_v3 uuid; cli_v4 uuid; cli_v5 uuid; cli_v6 uuid; cli_v7 uuid; cli_v10 uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_stk,   'registrar-stacking-suite-gym', 'Registrar Stacking Suite', 'America/Mexico_City', 'red'),
    (gym_other, 'registrar-stacking-other-gym', 'Registrar Stacking Other', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_user, 'authenticated', 'authenticated', 'op@stacking.local', now(), '{}');
  insert into public.gym_membership (user_id, gym_id, role) values (op_user, gym_stk, 'owner');

  v_today := (now() at time zone 'America/Mexico_City')::date;

  -- Catalog (gym_stk). Prices are the ONLY source of monto now (client-sent amounts are gone).
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_stk, '8 clases 20d', 8, 'dias', 20, 800) returning id into p_fin8_20;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_stk, 'Mensualidad', 12, 'mes', null, 1000) returning id into p_mes;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_stk, '8 clases 30d', 8, 'dias', 30, 850) returning id into p_fin8_30;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_stk, 'Ilimitado 30d', null, 'dias', 30, 1500) returning id into p_ilim;
  -- A paquete that belongs to the OTHER gym (vector 12: must be invisible to a gym_stk sale).
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_other, 'Otro 8 clases', 8, 'dias', 20, 999) returning id into p_other;

  -- Base clientes for the renewal vectors (distinct tel range 620… so no NEW-client tel collides).
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (gym_stk, 'Base V3 MesRenew', '6200000003', 6, v_today + 10, 'Mensualidad') returning id into cli_v3;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (gym_stk, 'Base V4 OnVence',  '6200000004', 4, v_today,      '8 clases 30d') returning id into cli_v4;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (gym_stk, 'Base V5 Lapsed',   '6200000005', 4, v_today - 1,  '8 clases 30d') returning id into cli_v5;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (gym_stk, 'Base V6 IlimAct',  '6200000006', null, v_today + 15, 'Ilimitado 30d') returning id into cli_v6;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (gym_stk, 'Base V7 Finite',   '6200000007', 5, v_today + 3,  '8 clases 20d') returning id into cli_v7;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (gym_stk, 'Base V10 Email',   '6200000010', 5, v_today + 10, '8 clases 20d') returning id into cli_v10;

  perform set_config('t.gym_stk',   gym_stk::text,   true);
  perform set_config('t.op_user',   op_user::text,   true);
  perform set_config('t.p_fin8_20', p_fin8_20::text, true);
  perform set_config('t.p_mes',     p_mes::text,     true);
  perform set_config('t.p_fin8_30', p_fin8_30::text, true);
  perform set_config('t.p_ilim',    p_ilim::text,    true);
  perform set_config('t.p_other',   p_other::text,   true);
  perform set_config('t.cli_v3',  cli_v3::text,  true);
  perform set_config('t.cli_v4',  cli_v4::text,  true);
  perform set_config('t.cli_v5',  cli_v5::text,  true);
  perform set_config('t.cli_v6',  cli_v6::text,  true);
  perform set_config('t.cli_v7',  cli_v7::text,  true);
  perform set_config('t.cli_v10', cli_v10::text, true);
end $$;

-- All sales run as gym_stk's operator (SECURITY INVOKER → the RPC + these assertions run under RLS).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_user', true), 'role', 'authenticated')::text, true);
set local role authenticated;

-- ══ V1 — fresh finite sale, new client: clases = pack, vence = hoy + vigencia_dias, monto = precio ════
do $$
declare
  g uuid := current_setting('t.gym_stk', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  r record; c record; v record;
begin
  select * into r from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_nombre := 'Nuevo Finito', p_tel := '6140000101');
  select clases_restantes, vence, paquete_nombre, email, gym_id into c from public.clientes where id = r.cliente_id;
  if c.clases_restantes is distinct from 8 then raise exception 'V1 FAIL: clases_restantes % (expected 8)', c.clases_restantes; end if;
  if c.vence is distinct from today + 20 then raise exception 'V1 FAIL: vence % (expected hoy+20)', c.vence; end if;
  if c.paquete_nombre is distinct from '8 clases 20d' then raise exception 'V1 FAIL: paquete_nombre %', c.paquete_nombre; end if;
  if c.email is not null then raise exception 'V1 FAIL: email % (expected null — none was sent)', c.email; end if;
  if c.gym_id is distinct from g then raise exception 'V1 FAIL: cliente gym_id %', c.gym_id; end if;
  select monto, metodo, gym_id, idempotency_key into v from public.ventas where idempotency_key = k;
  if v.monto is distinct from 800 then raise exception 'V1 FAIL: venta.monto % (expected the paquete precio 800)', v.monto; end if;
  if v.metodo is distinct from 'efectivo' then raise exception 'V1 FAIL: venta.metodo %', v.metodo; end if;
  if v.gym_id is distinct from g then raise exception 'V1 FAIL: venta.gym_id %', v.gym_id; end if;
  if r.monto is distinct from 800 then raise exception 'V1 FAIL: returned monto % (expected 800)', r.monto; end if;
end $$;

-- ══ V2 — fresh 'mes' sale: vence = hoy + 30 (C1 flat month) ═══════════════════════════════════════════
do $$
declare
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  r record; c record; v record;
begin
  select * into r from public.registrar_venta(
    p_metodo := 'tarjeta', p_paquete_id := current_setting('t.p_mes', true)::uuid,
    p_idempotency_key := k, p_nombre := 'Nuevo Mes', p_tel := '6140000102');
  select clases_restantes, vence, paquete_nombre into c from public.clientes where id = r.cliente_id;
  if c.vence is distinct from today + 30 then raise exception 'V2 FAIL: mes vence % (expected hoy+30)', c.vence; end if;
  if c.clases_restantes is distinct from 12 then raise exception 'V2 FAIL: mes clases % (expected pack 12)', c.clases_restantes; end if;
  select monto into v from public.ventas where idempotency_key = k;
  if v.monto is distinct from 1000 then raise exception 'V2 FAIL: monto % (expected 1000)', v.monto; end if;
end $$;

-- ══ V3 — early 'mes' renewal (vence in 10d): new vence = old vence + 30 = hoy + 40 (C1 flat extend) ════
do $$
declare
  ci uuid := current_setting('t.cli_v3', true)::uuid;
  g uuid := current_setting('t.gym_stk', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_mes', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci);
  select clases_restantes, vence into c from public.clientes where id = ci;
  if c.vence is distinct from today + 40 then raise exception 'V3 FAIL: vence % (expected old hoy+10 +30 = hoy+40)', c.vence; end if;
  if c.clases_restantes is distinct from 18 then raise exception 'V3 FAIL: clases % (expected 6 + 12 = 18)', c.clases_restantes; end if;
  select monto, metodo, gym_id into v from public.ventas where idempotency_key = k;
  if v is null then raise exception 'V3 FAIL: no ventas row carries the idempotency key'; end if;
  if v.monto is distinct from 1000 then raise exception 'V3 FAIL: venta.monto % (expected 1000)', v.monto; end if;
  if v.metodo is distinct from 'efectivo' then raise exception 'V3 FAIL: venta.metodo %', v.metodo; end if;
  if v.gym_id is distinct from g then raise exception 'V3 FAIL: venta.gym_id %', v.gym_id; end if;
end $$;

-- ══ V4 — renewal ON the vence day, base {4, dias 0} + 8/30 pack → 12 clases, vence = hoy + 30 (C9) ═════
do $$
declare
  ci uuid := current_setting('t.cli_v4', true)::uuid;
  g uuid := current_setting('t.gym_stk', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record;
begin
  perform public.registrar_venta(
    p_metodo := 'transferencia', p_paquete_id := current_setting('t.p_fin8_30', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci);
  select clases_restantes, vence into c from public.clientes where id = ci;
  if c.clases_restantes is distinct from 12 then raise exception 'V4 FAIL: clases % (expected 4 + 8 = 12, vence-day carry)', c.clases_restantes; end if;
  if c.vence is distinct from today + 30 then raise exception 'V4 FAIL: vence % (expected hoy+30)', c.vence; end if;
  select monto, metodo, gym_id into v from public.ventas where idempotency_key = k;
  if v is null then raise exception 'V4 FAIL: no ventas row carries the idempotency key'; end if;
  if v.monto is distinct from 850 then raise exception 'V4 FAIL: venta.monto % (expected 850)', v.monto; end if;
  if v.metodo is distinct from 'transferencia' then raise exception 'V4 FAIL: venta.metodo %', v.metodo; end if;
  if v.gym_id is distinct from g then raise exception 'V4 FAIL: venta.gym_id %', v.gym_id; end if;
end $$;

-- ══ V5 — lapsed base (vence yesterday, 4 clases) + 8/30 pack → 8 clases (forfeit), vence = hoy + 30 ════
do $$
declare
  ci uuid := current_setting('t.cli_v5', true)::uuid;
  g uuid := current_setting('t.gym_stk', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_30', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci);
  select clases_restantes, vence into c from public.clientes where id = ci;
  if c.clases_restantes is distinct from 8 then raise exception 'V5 FAIL: clases % (expected forfeit → 0 + 8 = 8)', c.clases_restantes; end if;
  if c.vence is distinct from today + 30 then raise exception 'V5 FAIL: vence % (expected hoy+30)', c.vence; end if;
  select monto, metodo, gym_id into v from public.ventas where idempotency_key = k;
  if v is null then raise exception 'V5 FAIL: no ventas row carries the idempotency key'; end if;
  if v.monto is distinct from 850 then raise exception 'V5 FAIL: venta.monto % (expected 850)', v.monto; end if;
  if v.metodo is distinct from 'efectivo' then raise exception 'V5 FAIL: venta.metodo %', v.metodo; end if;
  if v.gym_id is distinct from g then raise exception 'V5 FAIL: venta.gym_id %', v.gym_id; end if;
end $$;

-- ══ V6 — active ilimitado + finite pack → clases = pack's count (8), days add (C4 purchase wins) ══════
do $$
declare
  ci uuid := current_setting('t.cli_v6', true)::uuid;
  g uuid := current_setting('t.gym_stk', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci);
  select clases_restantes, vence, paquete_nombre into c from public.clientes where id = ci;
  if c.clases_restantes is distinct from 8 then raise exception 'V6 FAIL: clases % (expected pack count 8, not ilimitado)', c.clases_restantes; end if;
  if c.vence is distinct from today + 35 then raise exception 'V6 FAIL: vence % (expected base 15 + 20 = hoy+35)', c.vence; end if;
  if c.paquete_nombre is distinct from '8 clases 20d' then raise exception 'V6 FAIL: paquete_nombre % (expected the purchased pack''s name after the ilimitado→finite switch)', c.paquete_nombre; end if;
  select monto, metodo, gym_id into v from public.ventas where idempotency_key = k;
  if v is null then raise exception 'V6 FAIL: no ventas row carries the idempotency key'; end if;
  if v.monto is distinct from 800 then raise exception 'V6 FAIL: venta.monto % (expected 800)', v.monto; end if;
  if v.metodo is distinct from 'efectivo' then raise exception 'V6 FAIL: venta.metodo %', v.metodo; end if;
  if v.gym_id is distinct from g then raise exception 'V6 FAIL: venta.gym_id %', v.gym_id; end if;
end $$;

-- ══ V7 — finite base + ilimitado pack → clases_restantes NULL, days add (C4) ══════════════════════════
do $$
declare
  ci uuid := current_setting('t.cli_v7', true)::uuid;
  g uuid := current_setting('t.gym_stk', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_ilim', true)::uuid,
    p_idempotency_key := k, p_cliente_id := ci);
  select clases_restantes, vence, paquete_nombre into c from public.clientes where id = ci;
  if c.clases_restantes is not null then raise exception 'V7 FAIL: clases_restantes % (expected NULL ilimitado)', c.clases_restantes; end if;
  if c.vence is distinct from today + 33 then raise exception 'V7 FAIL: vence % (expected base 3 + 30 = hoy+33)', c.vence; end if;
  if c.paquete_nombre is distinct from 'Ilimitado 30d' then raise exception 'V7 FAIL: paquete_nombre %', c.paquete_nombre; end if;
  select monto, metodo, gym_id into v from public.ventas where idempotency_key = k;
  if v is null then raise exception 'V7 FAIL: no ventas row carries the idempotency key'; end if;
  if v.monto is distinct from 1500 then raise exception 'V7 FAIL: venta.monto % (expected 1500)', v.monto; end if;
  if v.metodo is distinct from 'efectivo' then raise exception 'V7 FAIL: venta.metodo %', v.metodo; end if;
  if v.gym_id is distinct from g then raise exception 'V7 FAIL: venta.gym_id %', v.gym_id; end if;
end $$;

-- ══ V8 — idempotent replay: call twice with the same key → ONE venta, same folio, saldo written once (C6) ══
do $$
declare
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  r1 record; r2 record; n int; c record;
begin
  select * into r1 from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_nombre := 'Replay Once', p_tel := '6140000108');
  select * into r2 from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k, p_nombre := 'Replay Once', p_tel := '6140000108');
  if r1.folio is distinct from r2.folio then raise exception 'V8 FAIL: replay folio % <> %', r1.folio, r2.folio; end if;
  if r1.cliente_id is distinct from r2.cliente_id then raise exception 'V8 FAIL: replay cliente_id diverged'; end if;
  select count(*) into n from public.ventas where idempotency_key = k;
  if n <> 1 then raise exception 'V8 FAIL: % ventas rows for one key (expected exactly 1)', n; end if;
  -- Saldo written once, not doubled (a fresh finite buy = 8, never 16).
  select clases_restantes into c from public.clientes where id = r1.cliente_id;
  if c.clases_restantes is distinct from 8 then raise exception 'V8 FAIL: saldo % (expected 8 — written once)', c.clases_restantes; end if;
  if r2.monto is distinct from 800 then raise exception 'V8 FAIL: replay returned monto % (expected the venta''s own 800)', r2.monto; end if;
end $$;

-- ══ V9 — duplicate guard: 2nd new-client with the same tel raises; p_forzar_nuevo => true inserts (D2) ══
do $$
declare
  k1 uuid := gen_random_uuid();
  k2 uuid := gen_random_uuid();
  k3 uuid := gen_random_uuid();
  got_dup boolean := false;
  r1 record; r3 record; n int; msg text;
begin
  select * into r1 from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k1, p_nombre := 'Dup Guard', p_tel := '6140000109');
  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
      p_idempotency_key := k2, p_nombre := 'Dup Guard Again', p_tel := '6140000109');
  exception when others then
    got_dup := true; msg := sqlerrm;
  end;
  if not got_dup then raise exception 'V9 FAIL: a 2nd new client with the same tel was NOT blocked'; end if;
  if msg not like 'CLIENTE_DUPLICADO:%' then raise exception 'V9 FAIL: dup raised the wrong error (%)', msg; end if;
  -- The override forces a distinct NEW row through.
  select * into r3 from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k3, p_nombre := 'Dup Guard Forced', p_tel := '6140000109', p_forzar_nuevo := true);
  if r3.cliente_id is not distinct from r1.cliente_id then
    raise exception 'V9 FAIL: p_forzar_nuevo reused the existing row instead of inserting a new one';
  end if;
  select count(*) into n from public.clientes where gym_id = current_setting('t.gym_stk', true)::uuid and tel = '6140000109';
  if n <> 2 then raise exception 'V9 FAIL: expected 2 rows on tel 6140000109 (original + forced), got %', n; end if;
  -- Written ventas rows: one per successful sale (k1, k3); the BLOCKED attempt (k2) wrote none.
  select count(*) into n from public.ventas
    where idempotency_key in (k1, k3) and monto = 800 and metodo = 'efectivo'
      and gym_id = current_setting('t.gym_stk', true)::uuid;
  if n <> 2 then raise exception 'V9 FAIL: expected 2 ventas rows (k1 + forced k3) with monto 800/efectivo/gym-scoped, got %', n; end if;
  select count(*) into n from public.ventas where idempotency_key = k2;
  if n <> 0 then raise exception 'V9 FAIL: the dup-blocked attempt wrote % ventas rows (expected 0)', n; end if;
end $$;

-- ══ V10 — C7 email backfill: existing sale with p_email writes it; a later null p_email keeps it ══════
do $$
declare
  ci uuid := current_setting('t.cli_v10', true)::uuid;
  g uuid := current_setting('t.gym_stk', true)::uuid;
  k1 uuid := gen_random_uuid();
  k2 uuid := gen_random_uuid();
  c record; n int;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k1, p_cliente_id := ci, p_email := 'v10new@stk.mx');
  select email into c from public.clientes where id = ci;
  if c.email is distinct from 'v10new@stk.mx' then raise exception 'V10 FAIL: email not backfilled (% )', c.email; end if;
  -- A subsequent sale WITHOUT an email must not blank it (coalesce keeps the prior value).
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
    p_idempotency_key := k2, p_cliente_id := ci);
  select email into c from public.clientes where id = ci;
  if c.email is distinct from 'v10new@stk.mx' then raise exception 'V10 FAIL: prior email lost on a null-email sale (%)', c.email; end if;
  -- Written ventas rows: both sales landed, each fully stamped.
  select count(*) into n from public.ventas
    where idempotency_key in (k1, k2) and cliente_id = ci and monto = 800 and metodo = 'efectivo' and gym_id = g;
  if n <> 2 then raise exception 'V10 FAIL: expected 2 fully-stamped ventas rows (k1 + k2), got %', n; end if;
end $$;

-- ══ V11 — 'pendiente' is not a method (C2): the RPC rejects it ════════════════════════════════════════
do $$
declare got_error boolean := false; msg text;
begin
  begin
    perform public.registrar_venta(
      p_metodo := 'pendiente', p_paquete_id := current_setting('t.p_fin8_20', true)::uuid,
      p_idempotency_key := gen_random_uuid(), p_nombre := 'Pendiente Nope', p_tel := '6140000111');
  exception when others then got_error := true; msg := sqlerrm;
  end;
  if not got_error then raise exception 'V11 FAIL: p_metodo = pendiente was accepted (C2 not enforced)'; end if;
  if msg is distinct from 'Método inválido' then raise exception 'V11 FAIL: wrong error for pendiente (%)', msg; end if;
end $$;

-- ══ V12 — a paquete from ANOTHER gym is out of scope → 'Paquete no encontrado' ═══════════════════════
do $$
declare got_error boolean := false; msg text;
begin
  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_paquete_id := current_setting('t.p_other', true)::uuid,
      p_idempotency_key := gen_random_uuid(), p_nombre := 'Cross Gym', p_tel := '6140000112');
  exception when others then got_error := true; msg := sqlerrm;
  end;
  if not got_error then raise exception 'V12 FAIL: a cross-gym paquete was accepted (scope leak)'; end if;
  if msg is distinct from 'Paquete no encontrado' then raise exception 'V12 FAIL: wrong error for cross-gym paquete (%)', msg; end if;
end $$;

reset role;

select 'registrar_venta stacking suite: OK' as result;
rollback;
