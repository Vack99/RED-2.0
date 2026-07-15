-- registrar_venta v3 — venta personalizada suite (spec 2026-07-11 §5.1; migration
-- 20260711100100_registrar_venta_personalizado.sql). The WRITTEN-ROWS contract for the custom-package
-- sale path: p_paquete_id becomes optional and a custom package (nombre/precio/clases/dias typed at the
-- desk) may be sent instead — exactly one of the two (XOR). This suite proves the ROWS the RPC writes
-- (clientes.clases_restantes / vence / paquete_nombre and the ventas row's paquete_nombre / clases /
-- vigencia_* / monto / personalizado / gym_id), never the return value (#78/#80).
--
-- The whole point of the migration is that the custom branch CONVERGES into the shared derivation: both
-- branches fill the same v_pk_* locals and one block runs C1 (flat-30) / C9 (vence-day carry) / C4
-- (purchase wins, days carry) / C6 (idempotent replay). A re-implemented (divergent) stacking path inside
-- the custom branch is the bug this suite catches — so V3 asserts against the SAME expectations the
-- stacking suite proves for registered plans. And no paquetes row is ever created (marketing isolation is
-- structural): V1 asserts the catalog stays untouched.
--
-- Vectors (task-3 brief V1–V8): (1) custom new client — full written-row check + zero paquetes rows,
-- (2) custom ilimitado = null clases both places, (3) custom renewal stacking inherited [C4/C9],
-- (4) XOR both-sources / neither-source, (5) every D6 bound raises its message AND writes nothing,
-- (6) idempotent custom replay = one venta / same folio / credited once [C6], (7) registered-plan
-- regression = personalizado false, (8) non-staff member = 'No autorizado', nothing written.
--
-- Zero prod UUIDs (ADR-0013 §5): a synthetic gym + operator + member + one catalog row, all
-- gen_random_uuid(). One BEGIN/ROLLBACK so a scratch project is REUSABLE and accumulates no state.
-- Self-asserting: every check RAISEs on failure; a clean run returns one 'OK' row.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs` (pnpm test:denial) against a
-- scratch ref — NOT live. The suite is transaction-local and rolls back.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_stk uuid := gen_random_uuid();
  op_user uuid := gen_random_uuid();   -- owner of gym_stk — authors every sale (staff_gym())
  mem_user uuid := gen_random_uuid();  -- a plain MEMBER of gym_stk (V8: staff_gym() = NULL → No autorizado)
  v_today date;
  p_reg uuid;
  cli_v3 uuid; cli_v5 uuid; cli_v9 uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_stk, 'registrar-personalizado-suite-gym', 'Registrar Personalizado Suite', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_user, 'authenticated', 'authenticated', 'op@personalizado.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', mem_user, 'authenticated', 'authenticated', 'mem@personalizado.local', now(), '{}');
  insert into public.gym_membership (user_id, gym_id, role) values
    (op_user, gym_stk, 'owner'),
    (mem_user, gym_stk, 'member');

  v_today := (now() at time zone 'America/Mexico_City')::date;

  -- One registered catalog row (V7 regression + V4 both-sources). Custom sales must NEVER add to this.
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_stk, '8 clases 20d', 8, 'dias', 20, 800) returning id into p_reg;

  -- V3 base: an active finite plan (5 clases, vence hoy+10) that a custom renewal stacks onto.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (gym_stk, 'Base V3 Stack', '6200000103', 5, v_today + 10, 'Base V3') returning id into cli_v3;
  -- V5 target: bounds raise before the client is even read, so any existing row does; assert it stays put.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (gym_stk, 'Base V5 Bounds', '6200000105', 7, v_today + 20, 'Base V5') returning id into cli_v5;
  -- V9 base: active client created 60d ago (a within-30 backdate clears bound 3) — the CUSTOM-branch
  -- backdate vector (spec §D1/§D2: p_fecha_inicio threads the personalizado path too).
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at)
    values (gym_stk, 'Base V9 Backdate', '6200000109', 5, v_today + 10, 'Base V9', now() - interval '60 days') returning id into cli_v9;

  perform set_config('t.gym_stk',  gym_stk::text,  true);
  perform set_config('t.op_user',  op_user::text,  true);
  perform set_config('t.mem_user', mem_user::text, true);
  perform set_config('t.p_reg',    p_reg::text,    true);
  perform set_config('t.cli_v3',   cli_v3::text,   true);
  perform set_config('t.cli_v5',   cli_v5::text,   true);
  perform set_config('t.cli_v9',   cli_v9::text,   true);
end $$;

-- All sales run as gym_stk's operator (SECURITY INVOKER → the RPC + these assertions run under RLS).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_user', true), 'role', 'authenticated')::text, true);
set local role authenticated;

-- ══ V1 — custom sale, NEW client: full written-row check; ZERO new paquetes rows ══════════════════════
do $$
declare
  g uuid := current_setting('t.gym_stk', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  r record; c record; v record;
begin
  -- p_nombre arrives padded so the INSERT's trim(p_nombre) is exercised, not just passed through.
  select * into r from public.registrar_venta(
    p_metodo := 'efectivo', p_idempotency_key := k,
    p_nombre := '  Nueva Custom ', p_tel := '6140000201',
    p_custom_nombre := 'Promo Verano', p_custom_precio := 750, p_custom_clases := 12, p_custom_dias := 45);
  select clases_restantes, vence, paquete_nombre, gym_id into c from public.clientes where id = r.cliente_id;
  if c.clases_restantes is distinct from 12 then raise exception 'V1 FAIL: clases_restantes % (expected 12)', c.clases_restantes; end if;
  if c.vence is distinct from today + 45 then raise exception 'V1 FAIL: vence % (expected hoy+45)', c.vence; end if;
  if c.paquete_nombre is distinct from 'Promo Verano' then raise exception 'V1 FAIL: cliente paquete_nombre %', c.paquete_nombre; end if;
  if c.gym_id is distinct from g then raise exception 'V1 FAIL: cliente gym_id %', c.gym_id; end if;
  select paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, personalizado, gym_id
    into v from public.ventas where idempotency_key = k;
  if v.paquete_nombre is distinct from 'Promo Verano' then raise exception 'V1 FAIL: venta.paquete_nombre %', v.paquete_nombre; end if;
  if v.clases is distinct from 12 then raise exception 'V1 FAIL: venta.clases % (expected 12)', v.clases; end if;
  if v.vigencia_tipo is distinct from 'dias' then raise exception 'V1 FAIL: venta.vigencia_tipo % (custom is always dias)', v.vigencia_tipo; end if;
  if v.vigencia_dias is distinct from 45 then raise exception 'V1 FAIL: venta.vigencia_dias % (expected 45)', v.vigencia_dias; end if;
  if v.monto is distinct from 750 then raise exception 'V1 FAIL: venta.monto % (expected the custom precio 750)', v.monto; end if;
  if v.personalizado is distinct from true then raise exception 'V1 FAIL: venta.personalizado % (expected true)', v.personalizado; end if;
  if v.gym_id is distinct from g then raise exception 'V1 FAIL: venta.gym_id %', v.gym_id; end if;
  -- Structural marketing isolation: no paquetes row is ever created for a custom package.
  if exists (select 1 from public.paquetes where gym_id = g and nombre = 'Promo Verano') then
    raise exception 'V1 FAIL: a paquetes row leaked from a custom sale (catalog must stay untouched)';
  end if;
end $$;

-- ══ V2 — custom ilimitado: ventas.clases NULL and clientes.clases_restantes NULL ══════════════════════
do $$
declare
  k uuid := gen_random_uuid();
  r record; c record; v record;
begin
  select * into r from public.registrar_venta(
    p_metodo := 'tarjeta', p_idempotency_key := k,
    p_nombre := 'Custom Ilim', p_tel := '6140000202',
    p_custom_nombre := 'Promo Ilimitada', p_custom_precio := 900, p_custom_ilimitado := true, p_custom_dias := 30);
  select clases_restantes into c from public.clientes where id = r.cliente_id;
  if c.clases_restantes is not null then raise exception 'V2 FAIL: clientes.clases_restantes % (expected NULL ilimitado)', c.clases_restantes; end if;
  select clases, personalizado into v from public.ventas where idempotency_key = k;
  if v.clases is not null then raise exception 'V2 FAIL: ventas.clases % (expected NULL ilimitado)', v.clases; end if;
  if v.personalizado is distinct from true then raise exception 'V2 FAIL: venta.personalizado % (expected true)', v.personalizado; end if;
end $$;

-- ══ V3 — custom renewal onto an active base (5 clases, vence hoy+10) + 12 clases / 45 dias:
--          stacking INHERITED → clases 17, vence hoy+55 (C4 purchase adds, days carry). Catches a
--          re-implemented derivation inside the custom branch. ════════════════════════════════════════
do $$
declare
  ci uuid := current_setting('t.cli_v3', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'Promo Stack', p_custom_precio := 750, p_custom_clases := 12, p_custom_dias := 45);
  select clases_restantes, vence into c from public.clientes where id = ci;
  if c.clases_restantes is distinct from 17 then raise exception 'V3 FAIL: clases % (expected 5 + 12 = 17)', c.clases_restantes; end if;
  if c.vence is distinct from today + 55 then raise exception 'V3 FAIL: vence % (expected base 10 + 45 = hoy+55)', c.vence; end if;
  select personalizado into v from public.ventas where idempotency_key = k;
  if v.personalizado is distinct from true then raise exception 'V3 FAIL: venta.personalizado % (expected true)', v.personalizado; end if;
end $$;

-- ══ V4 — XOR: (a) both a paquete AND a custom package, (b) neither → both raise the same message ═══════
do $$
declare
  msg_a text; msg_b text;
  ka uuid := gen_random_uuid();
  kb uuid := gen_random_uuid();
  n int;
begin
  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_idempotency_key := ka,
      p_paquete_id := current_setting('t.p_reg', true)::uuid,
      p_nombre := 'Both Sources', p_tel := '6140000241',
      p_custom_nombre := 'Promo Both', p_custom_precio := 500, p_custom_clases := 10, p_custom_dias := 30);
    raise exception 'V4 FAIL: both a paquete_id and a custom package were accepted (XOR not enforced)';
  exception when others then
    msg_a := sqlerrm;
  end;
  if msg_a is distinct from 'Venta inválida: elige un paquete o define uno personalizado' then
    raise exception 'V4 FAIL: wrong error for both-sources (%)', msg_a;
  end if;

  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_idempotency_key := kb,
      p_nombre := 'No Source', p_tel := '6140000242');
    raise exception 'V4 FAIL: a sale with neither a paquete nor a custom package was accepted';
  exception when others then
    msg_b := sqlerrm;
  end;
  if msg_b is distinct from 'Venta inválida: elige un paquete o define uno personalizado' then
    raise exception 'V4 FAIL: wrong error for neither-source (%)', msg_b;
  end if;

  select count(*) into n from public.ventas where idempotency_key in (ka, kb);
  if n <> 0 then raise exception 'V4 FAIL: a rejected XOR sale wrote % ventas rows (expected 0)', n; end if;
end $$;

-- ══ V5 — every D6 bound raises its exact message AND writes nothing (each failure rolls back) ══════════
do $$
declare
  ci uuid := current_setting('t.cli_v5', true)::uuid;
  keys uuid[] := '{}';
  k uuid;
  msg text;
  n int; c record;
begin
  -- precio 0
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'Bounds OK', p_custom_precio := 0, p_custom_clases := 10, p_custom_dias := 30);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Precio personalizado inválido' then raise exception 'V5 FAIL: precio 0 → % (expected Precio personalizado inválido)', msg; end if;

  -- precio 100001
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'Bounds OK', p_custom_precio := 100001, p_custom_clases := 10, p_custom_dias := 30);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Precio personalizado inválido' then raise exception 'V5 FAIL: precio 100001 → % (expected Precio personalizado inválido)', msg; end if;

  -- clases 0
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'Bounds OK', p_custom_precio := 500, p_custom_clases := 0, p_custom_dias := 30);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Clases personalizadas inválidas' then raise exception 'V5 FAIL: clases 0 → % (expected Clases personalizadas inválidas)', msg; end if;

  -- clases 366
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'Bounds OK', p_custom_precio := 500, p_custom_clases := 366, p_custom_dias := 30);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Clases personalizadas inválidas' then raise exception 'V5 FAIL: clases 366 → % (expected Clases personalizadas inválidas)', msg; end if;

  -- dias 0
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'Bounds OK', p_custom_precio := 500, p_custom_clases := 10, p_custom_dias := 0);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Vigencia personalizada inválida' then raise exception 'V5 FAIL: dias 0 → % (expected Vigencia personalizada inválida)', msg; end if;

  -- dias 366
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'Bounds OK', p_custom_precio := 500, p_custom_clases := 10, p_custom_dias := 366);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Vigencia personalizada inválida' then raise exception 'V5 FAIL: dias 366 → % (expected Vigencia personalizada inválida)', msg; end if;

  -- nombre 'ab' (2 chars — trimmed length < 3)
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'ab', p_custom_precio := 500, p_custom_clases := 10, p_custom_dias := 30);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Nombre del paquete personalizado inválido' then raise exception 'V5 FAIL: nombre ab → % (expected Nombre del paquete personalizado inválido)', msg; end if;

  -- nombre 41 chars (> 40)
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := repeat('a', 41), p_custom_precio := 500, p_custom_clases := 10, p_custom_dias := 30);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Nombre del paquete personalizado inválido' then raise exception 'V5 FAIL: nombre 41ch → % (expected Nombre del paquete personalizado inválido)', msg; end if;

  -- ilimitado true WITH clases 5 (incoherent — both a class count and ilimitado)
  k := gen_random_uuid(); keys := keys || k; msg := null;
  begin perform public.registrar_venta(p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci,
    p_custom_nombre := 'Bounds OK', p_custom_precio := 500, p_custom_ilimitado := true, p_custom_clases := 5, p_custom_dias := 30);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Clases personalizadas inválidas' then raise exception 'V5 FAIL: ilimitado+clases → % (expected Clases personalizadas inválidas)', msg; end if;

  -- After every bound violation: not one ventas row landed, and the base client is untouched.
  select count(*) into n from public.ventas where idempotency_key = any(keys);
  if n <> 0 then raise exception 'V5 FAIL: bound violations wrote % ventas rows (expected 0)', n; end if;
  select clases_restantes, vence into c from public.clientes where id = ci;
  if c.clases_restantes is distinct from 7 then raise exception 'V5 FAIL: base clases % mutated by a rejected bound call', c.clases_restantes; end if;
end $$;

-- ══ V6 — idempotent custom replay: same key twice → ONE venta, same folio, saldo credited once (C6) ═══
do $$
declare
  k uuid := gen_random_uuid();
  r1 record; r2 record; n int; c record;
begin
  select * into r1 from public.registrar_venta(
    p_metodo := 'efectivo', p_idempotency_key := k,
    p_nombre := 'Custom Replay', p_tel := '6140000206',
    p_custom_nombre := 'Promo Replay', p_custom_precio := 500, p_custom_clases := 10, p_custom_dias := 30);
  select * into r2 from public.registrar_venta(
    p_metodo := 'efectivo', p_idempotency_key := k,
    p_nombre := 'Custom Replay', p_tel := '6140000206',
    p_custom_nombre := 'Promo Replay', p_custom_precio := 500, p_custom_clases := 10, p_custom_dias := 30);
  if r1.folio is distinct from r2.folio then raise exception 'V6 FAIL: replay folio % <> %', r1.folio, r2.folio; end if;
  if r1.cliente_id is distinct from r2.cliente_id then raise exception 'V6 FAIL: replay cliente_id diverged'; end if;
  select count(*) into n from public.ventas where idempotency_key = k;
  if n <> 1 then raise exception 'V6 FAIL: % ventas rows for one key (expected exactly 1)', n; end if;
  select clases_restantes into c from public.clientes where id = r1.cliente_id;
  if c.clases_restantes is distinct from 10 then raise exception 'V6 FAIL: saldo % (expected 10 — credited once)', c.clases_restantes; end if;
end $$;

-- ══ V7 — regression: a normal registered-plan sale stamps personalizado = false ══════════════════════
do $$
declare
  k uuid := gen_random_uuid();
  r record; v record;
begin
  select * into r from public.registrar_venta(
    p_metodo := 'efectivo', p_idempotency_key := k,
    p_paquete_id := current_setting('t.p_reg', true)::uuid,
    p_nombre := 'Registered Plan', p_tel := '6140000207');
  select personalizado, monto into v from public.ventas where idempotency_key = k;
  if v.personalizado is distinct from false then raise exception 'V7 FAIL: venta.personalizado % (expected false for a registered plan)', v.personalizado; end if;
  if v.monto is distinct from 800 then raise exception 'V7 FAIL: venta.monto % (expected the paquete precio 800)', v.monto; end if;
end $$;

-- ══ V9 — CUSTOM package BACKDATED 5d onto an active base: as-of stacking inherited + fecha moved ═══════
do $$
declare
  ci uuid := current_setting('t.cli_v9', true)::uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  k uuid := gen_random_uuid();
  c record; v record; v_dia date;
begin
  perform public.registrar_venta(
    p_metodo := 'efectivo', p_idempotency_key := k, p_cliente_id := ci, p_fecha_inicio := today - 5,
    p_custom_nombre := 'Promo Backdate', p_custom_precio := 750, p_custom_clases := 12, p_custom_dias := 45);
  select clases_restantes, vence into c from public.clientes where id = ci;
  -- base_dias = (today+10) - (today-5) = 15; +45 ⇒ vence = (today-5)+60 = today+55; clases 5 + 12 = 17.
  if c.clases_restantes is distinct from 17 then raise exception 'V9 FAIL: clases % (expected 5 + 12 = 17)', c.clases_restantes; end if;
  if c.vence is distinct from today + 55 then raise exception 'V9 FAIL: vence % (expected today+55)', c.vence; end if;
  select fecha, personalizado into v from public.ventas where idempotency_key = k;
  v_dia := (v.fecha at time zone 'America/Mexico_City')::date;
  if v_dia is distinct from today - 5 then raise exception 'V9 FAIL: ventas.fecha gym-tz day % (expected today-5)', v_dia; end if;
  if v.personalizado is distinct from true then raise exception 'V9 FAIL: personalizado % (expected true)', v.personalizado; end if;
end $$;

reset role;

-- ══ V8 — a non-staff MEMBER of the gym → 'No autorizado', nothing written (staff_gym() = NULL) ════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.mem_user', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  k uuid := gen_random_uuid();
  msg text; n int;
begin
  begin
    perform public.registrar_venta(
      p_metodo := 'efectivo', p_idempotency_key := k,
      p_nombre := 'Member Attempt', p_tel := '6140000208',
      p_custom_nombre := 'Promo Member', p_custom_precio := 500, p_custom_clases := 10, p_custom_dias := 30);
    raise exception 'V8 FAIL: a non-staff member registered a sale (staff_gym() gate bypassed)';
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'No autorizado' then raise exception 'V8 FAIL: wrong error for a non-staff member (%)', msg; end if;
  select count(*) into n from public.ventas where idempotency_key = k;
  if n <> 0 then raise exception 'V8 FAIL: the refused member sale wrote % ventas rows (expected 0)', n; end if;
end $$;
reset role;

select 'registrar_venta personalizado suite: OK' as result;
rollback;
