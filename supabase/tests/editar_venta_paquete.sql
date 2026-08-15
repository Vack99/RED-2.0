-- editar_venta PAQUETE-SWAP written-row suite — owner rulings 2026-08-15 (thread #266, migration
-- 20260815120000), on top of #269's correction pair.
--
-- The 9-arg `editar_venta` is the ONLY door for changing WHAT a registered sale sold. It no longer
-- touches only the sale row: under ruling 1 ("vence follows fecha") and ruling 2 ("package swap") it
-- claws back what the stored sale granted and re-grants the new package at the sale's day, in ONE
-- transaction. So its contract spans BOTH tables, and every vector below re-SELECTs `ventas` AND
-- `clientes` after the call and asserts the PERSISTED columns — never a return value (AGENTS.md, "an
-- RPC's return value is not its contract; the rows it writes are" — #78/#80). `editar_venta_rules.sql`
-- keeps the monto/metodo/fecha-bound vectors; this file owns the package and the saldo.
--
-- Vectors:
--   S1 — SWAP TO A REGISTRADO PAQUETE. A cliente on 10 clases / vence +40 whose sale granted 8 clases
--        over 20 días is swapped onto a 12-clase 'mes' package. The sale row takes the package's facts
--        from the DB (never from the caller), and the saldo lands on 10 − 8 + 12 = 14 with vence
--        +40 − 20 + 30 = +50. folio / created_at / cliente_id / gym_id are proven unmoved by name AND
--        by a whole-row jsonb diff, so a column added to `ventas` later cannot start moving unnoticed.
--   S2 — SWAP TO PERSONALIZADO, twice on the same sale: first to a finite custom package, then to an
--        ILIMITADO one. Proves the custom branch writes `personalizado = true` / `vigencia_tipo =
--        'dias'`, that consecutive swaps COMPOSE (the second claws back what the first granted, not
--        what the original sale did), and that an ilimitado package writes a NULL balance rather than 0.
--   S3 — THE CLAMP IS FINAL, NOT INTERMEDIATE. A cliente already down to 3 whose sale granted 8 is
--        swapped up to 12. The clawback's intermediate is −5 and is allowed to be negative INSIDE the
--        transaction; the single `greatest(0, …)` fires once on the re-granted total, so the balance is
--        7. A per-step clamp would floor the base at 0 and hand the member 12 — five free clases. This
--        is the load-bearing math decision of migration 20260815120000; the vector exists to pin it.
--   S4 — SWAP DOWN UNDER WATER. Same 3-on-8 cliente swapped down to a 4-clase package: −5 + 4 = −1,
--        clamped to exactly 0. Never negative, and never "the new package's count".
--   S5 — FECHA-ONLY RE-DERIVE, both arms. (a) the member was still vigente at the new day ⇒ the round
--        trip is an exact IDENTITY (balance and vence byte-identical), which is why
--        editar_venta_rules.sql VF1/VF5 keep passing under ruling 1. (b) the new day falls AFTER the
--        post-clawback vence ⇒ registrar_venta's expired-restart discard applies (base_dias = 0,
--        base_clases = 0), so the sale restarts the member: balance = the sale's own clases, vence =
--        the new day + the sale's own días. Both arms also assert the written instant is midday gym-tz.
--   S6 — IDEMPOTENCE. The identical swap payload posted twice. There is no idempotency key and none is
--        needed: the write is an UPDATE of a row named by id, so a replay creates no second row and no
--        folio. Between the two fires the cliente's balance is DECREMENTED by hand (an asistencia the
--        member trained in the meantime), and the second fire must leave that decrement standing. NOTE
--        what carries that: the re-derive is a FIXED POINT on its own output (after fire 1, base_vence
--        lands exactly at the sale's fecha, so the discard can never re-fire and the clamp is
--        idempotent) — a body that re-ran the whole clawback + re-grant would ALSO leave 13. The
--        change-detection cheap path is real but is pinned by S10, not here; this vector pins the
--        fixed-point identity plus the one-row/no-refolio facts.
--   S7 — THE WINDOW COVERS THE RE-DERIVE, NOT JUST THE PACKAGE. A sale registered 31 days ago refuses a
--        swap with 'Ya pasaron 30 días: esta venta ya no se puede recalcular', and refuses a FECHA-only
--        edit with the same message — a fecha edit re-grants exactly as much as a swap does, and on a
--        sale of unbounded age the expired-restart discard makes it a re-grant of the whole package.
--        Both refusals write NOTHING (both rows byte-identical). The SAME sale then ACCEPTS a
--        monto/metodo-only edit, with the cliente row byte-identical: the window covers the
--        RECALCULATION, and attribution stays any-age (#266.3).
--   S8 — CROSS-TENANT, both directions: gym B staff on gym A's venta gets 'Venta no encontrada'; gym A
--        staff passing a gym-B `p_paquete_id` gets 'Paquete no encontrado' — the paquete lookup is
--        tenant-scoped, so another gym's catalog is a refusal and not a leak. Nothing written either time.
--   S9 — ARGUMENT REFUSALS, each with both rows asserted unchanged: both sources at once, a 2-char
--        custom nombre, días 0 and días 366, and `ilimitado` sent together with `clases`. The messages
--        are lifted verbatim from registrar_venta, so a reworded raise is a failure here.
--   S10 — THE CHEAP PATH. monto/metodo only — no p_fecha, no package arguments — and the WHOLE clientes
--        row is byte-identical afterwards. This is the "must NOT clawback" contract: without the
--        change-detection guard a no-op call would run the full clawback + re-grant and the floor /
--        expired-restart branches would move a balance nobody asked to move.
--   S11 — RENAME-ONLY. A swap onto a package with identical clases/vigencia but a different nombre:
--        both `ventas.paquete_nombre` and the cliente's display label follow, while clases_restantes
--        and vence stay byte-identical — a rename is not a re-grant.
--   S12 — ONLY THE TOP OF THE STACK CAN RE-DERIVE. The clawback is a LINEAR inverse of what the sale
--        granted, and registrar_venta's stacking is not linear (its expired-restart discard throws the
--        carried base away), so subtracting an EARLIER sale's numbers cannot recover a LATER sale's
--        grant. The fixture is the lapsed chain that proves it: V1 (8 clases / 20 días) sold 25 days
--        ago and long expired, then V2 (the same package) sold 2 days ago, which restarted the member
--        on 8 clases / vence +18. Swapping V1 onto the 12-clase mes package would read 8 − 8 = 0 as
--        "the base", re-grant at V1's own day and write 12 clases / vence +28 — V2's whole grant
--        destroyed and V1's counted twice. So the swap is REFUSED with 'Solo la venta más reciente
--        puede cambiar de paquete o fecha' and both rows stay byte-identical; the same non-latest sale
--        then ACCEPTS a monto/metodo edit, because attribution moves no saldo and stays correctable
--        forever.
--
-- Fixtures are 100% transaction-local (fresh gen_random_uuid gym/auth.users/gym_membership/clientes/
-- paquetes/ventas rows, zero prod UUIDs — a live-gym lookup 22P02s in staff_gym() on a fresh scratch
-- project), and EVERY fixture write happens as postgres BEFORE the first `set local role
-- authenticated`, which silently no-ops writes that need postgres. Assertions likewise run after
-- `reset role`, so they read ground truth rather than an RLS-filtered view (S8 asserts on a row its
-- caller cannot even select). Each vector owns its own cliente, so a failure names one vector.
--
-- The gym timezone is a REAL IANA zone (America/Chihuahua, UTC-6 year-round), never UTC: every bound,
-- the written instant and the day the re-grant stacks from are computed in the GYM's calendar, so a UTC
-- fixture would let a gym-tz bug pass unseen. Where a vence assertion would depend on which calendar
-- the session is in, it is written against `current_date` on purpose — the re-grant algebra cancels the
-- start day out (`fecha_dia + (base_vence − fecha_dia) + dias_new` = `base_vence + dias_new`), so those
-- expectations hold in either calendar; S5b, whose whole point is the discarded base, computes the gym
-- day explicitly instead.
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN: `node supabase/tests/run-denial-suite.mjs` (== `pnpm test:denial`) — wired into SUITE —
-- or ad hoc via psql against the local docker stack.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs; written as postgres, before any role switch) ────
do $$
declare
  gym_a     uuid := gen_random_uuid();
  gym_b     uuid := gen_random_uuid();
  op_a      uuid := gen_random_uuid();
  op_b      uuid := gen_random_uuid();
  v_tz      constant text := 'America/Chihuahua';
  pk_mes    uuid;  -- gym A: 12 clases, vigencia_tipo 'mes'
  pk_4      uuid;  -- gym A: 4 clases / 10 días
  pk_igual  uuid;  -- gym A: same grant as the fixture sale, different nombre (S11)
  pk_b      uuid;  -- gym B: the cross-tenant paquete id (S8)
  c1  uuid; c2  uuid; c3  uuid; c4  uuid; c5  uuid; c6  uuid;
  c7  uuid; c8  uuid; c9  uuid; c10 uuid; c11 uuid; c12 uuid; c13 uuid;
  v1  uuid; v2  uuid; v3  uuid; v4  uuid; v5  uuid; v6  uuid;
  v7  uuid; v8  uuid; v9  uuid; v10 uuid; v11 uuid; v12 uuid;
  v13 uuid; v14 uuid;   -- S12: the lapsed chain — v13 sold 25 days ago, v14 stacked on top 2 days ago
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'editar-venta-paquete-gym-a', 'Editar Venta Paquete A', v_tz, 'forge'),
    (gym_b, 'editar-venta-paquete-gym-b', 'Editar Venta Paquete B', v_tz, 'forge');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_a, 'authenticated', 'authenticated', 'op-a@editar-venta-paquete.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', op_b, 'authenticated', 'authenticated', 'op-b@editar-venta-paquete.local', now(), '{}');

  -- staff_gym() resolves the caller's gym from this (user_id, role in ('owner','operator')) row.
  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_b, gym_b, 'operator');

  -- ── The catalog. Package facts come from these rows, never from the caller (C13). ───────────────
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_a, 'MENSUAL 12',   12,   'mes',  null, 1200) returning id into pk_mes;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_a, 'PAQUETE 4',     4,   'dias',   10,  400) returning id into pk_4;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_a, 'NUEVO NOMBRE',  8,   'dias',   20,  800) returning id into pk_igual;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_b, 'AJENO 5',       5,   'dias',   10,  500) returning id into pk_b;

  -- ── S1: 10 clases / vence +40; the sale granted 8 clases over 20 días, three days ago ───────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Swap', '0000000021', 10, current_date + 40, '8 CLASES', gym_a) returning id into c1;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c1, 7201, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '3 days', now() - interval '3 days')
    returning id into v1;

  -- ── S2: same shape; swapped twice, to a finite custom package and then to an ilimitado one ──────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Personalizado', '0000000022', 10, current_date + 40, '8 CLASES', gym_a) returning id into c2;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c2, 7202, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v2;

  -- ── S3: OVER-CONSUMED — down to 3 with a sale that granted 8, so the clawback goes to −5 ───────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Clamp', '0000000023', 3, current_date + 25, '8 CLASES', gym_a) returning id into c3;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c3, 7203, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '1 day', now() - interval '1 day')
    returning id into v3;

  -- ── S4: the same under-water shape, swapped DOWN ───────────────────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Piso', '0000000024', 3, current_date + 25, '8 CLASES', gym_a) returning id into c4;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c4, 7204, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '1 day', now() - interval '1 day')
    returning id into v4;

  -- ── S5a: still vigente at the new day (vence +40 against a 20-día sale) ⇒ identity ──────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Fecha Identidad', '0000000025', 10, current_date + 40, '8 CLASES', gym_a) returning id into c5;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c5, 7205, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '10 days', now() - interval '10 days')
    returning id into v5;

  -- ── S5b: vence +2 against a 20-día sale ⇒ the post-clawback base expired long before the new day ─
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Fecha Reinicio', '0000000026', 6, current_date + 2, '8 CLASES', gym_a) returning id into c6;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c6, 7206, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '1 day', now() - interval '1 day')
    returning id into v6;

  -- ── S6: the replay target ──────────────────────────────────────────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Replay', '0000000027', 10, current_date + 40, '8 CLASES', gym_a) returning id into c7;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c7, 7207, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '3 days', now() - interval '3 days')
    returning id into v7;

  -- ── S7: registered 31 days ago — one day past the swap window ('mes', so dias_old = 30) ────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Ventana', '0000000028', 5, current_date + 30, 'FUERA DE VENTANA', gym_a) returning id into c8;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c8, 7208, 'FUERA DE VENTANA', 8, 'mes', null, 900, 'efectivo', now() - interval '31 days', now() - interval '31 days')
    returning id into v8;

  -- ── S8: well inside the window, so only tenancy can refuse it ──────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Ajeno', '0000000029', 7, current_date + 35, 'AJENO', gym_a) returning id into c9;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c9, 7209, 'AJENO', 8, 'mes', null, 950, 'efectivo', now() - interval '4 days', now() - interval '4 days')
    returning id into v9;

  -- ── S9: the argument-refusal target; fully entitled caller, so only the bound can refuse ───────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Argumentos', '0000000030', 9, current_date + 20, '8 CLASES', gym_a) returning id into c10;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c10, 7210, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v10;

  -- ── S10: the cheap path ────────────────────────────────────────────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Barato', '0000000031', 9, current_date + 20, '8 CLASES', gym_a) returning id into c11;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c11, 7211, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v11;

  -- ── S11: rename-only. The sale's grant is byte-identical to pk_igual's; only the label differs. ─
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Renombre', '0000000032', 10, current_date + 40, 'VIEJO NOMBRE', gym_a) returning id into c12;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c12, 7212, 'VIEJO NOMBRE', 8, 'dias', 20, 800, 'efectivo', now() - interval '3 days', now() - interval '3 days')
    returning id into v12;

  -- ── S12: the LAPSED CHAIN. v13 (8 clases / 20 días) was sold 25 days ago and expired on day −5;
  -- v14, the same package sold 2 days ago, hit registrar_venta's expired-restart discard and left the
  -- member on exactly its own grant: 8 clases, vence (hoy − 2) + 20 = +18. The stored saldo therefore
  -- describes v14 alone — subtracting v13's numbers from it recovers nothing, which is the whole point.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Pila', '0000000033', 8, current_date + 18, '8 CLASES', gym_a) returning id into c13;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c13, 7213, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '25 days', now() - interval '25 days')
    returning id into v13;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c13, 7214, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v14;

  perform set_config('t.gym_a',    gym_a::text,    true);
  perform set_config('t.gym_b',    gym_b::text,    true);
  perform set_config('t.op_a',     op_a::text,     true);
  perform set_config('t.op_b',     op_b::text,     true);
  perform set_config('t.tz',       v_tz,           true);
  perform set_config('t.pk_mes',   pk_mes::text,   true);
  perform set_config('t.pk_4',     pk_4::text,     true);
  perform set_config('t.pk_igual', pk_igual::text, true);
  perform set_config('t.pk_b',     pk_b::text,     true);
  perform set_config('t.c1',  c1::text,  true); perform set_config('t.v1',  v1::text,  true);
  perform set_config('t.c2',  c2::text,  true); perform set_config('t.v2',  v2::text,  true);
  perform set_config('t.c3',  c3::text,  true); perform set_config('t.v3',  v3::text,  true);
  perform set_config('t.c4',  c4::text,  true); perform set_config('t.v4',  v4::text,  true);
  perform set_config('t.c5',  c5::text,  true); perform set_config('t.v5',  v5::text,  true);
  perform set_config('t.c6',  c6::text,  true); perform set_config('t.v6',  v6::text,  true);
  perform set_config('t.c7',  c7::text,  true); perform set_config('t.v7',  v7::text,  true);
  perform set_config('t.c8',  c8::text,  true); perform set_config('t.v8',  v8::text,  true);
  perform set_config('t.c9',  c9::text,  true); perform set_config('t.v9',  v9::text,  true);
  perform set_config('t.c10', c10::text, true); perform set_config('t.v10', v10::text, true);
  perform set_config('t.c11', c11::text, true); perform set_config('t.v11', v11::text, true);
  perform set_config('t.c12', c12::text, true); perform set_config('t.v12', v12::text, true);
  perform set_config('t.c13', c13::text, true); perform set_config('t.v13', v13::text, true);
                                                perform set_config('t.v14', v14::text, true);

  -- S1's whole-row snapshot MINUS the eight columns the swap may write. The assertion re-computes it
  -- and demands jsonb equality: a column this suite never names by hand still cannot move unnoticed.
  perform set_config('t.v1_rest',
    (select (to_jsonb(v.*) - 'monto' - 'metodo' - 'fecha' - 'paquete_nombre' - 'clases'
                          - 'vigencia_tipo' - 'vigencia_dias' - 'personalizado')::text
       from public.ventas v where v.id = v1), true);
  -- S7/S8/S9's "nothing was written" baselines: the FULL row on both tables.
  perform set_config('t.v8_all',  (select to_jsonb(v.*)::text from public.ventas   v where v.id = v8),  true);
  perform set_config('t.c8_all',  (select to_jsonb(c.*)::text from public.clientes c where c.id = c8),  true);
  perform set_config('t.v9_all',  (select to_jsonb(v.*)::text from public.ventas   v where v.id = v9),  true);
  perform set_config('t.c9_all',  (select to_jsonb(c.*)::text from public.clientes c where c.id = c9),  true);
  perform set_config('t.v10_all', (select to_jsonb(v.*)::text from public.ventas   v where v.id = v10), true);
  perform set_config('t.c10_all', (select to_jsonb(c.*)::text from public.clientes c where c.id = c10), true);
  perform set_config('t.c11_all', (select to_jsonb(c.*)::text from public.clientes c where c.id = c11), true);
  perform set_config('t.v13_all', (select to_jsonb(v.*)::text from public.ventas   v where v.id = v13), true);
  perform set_config('t.c13_all', (select to_jsonb(c.*)::text from public.clientes c where c.id = c13), true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);

-- ══ S1 — SWAP TO A REGISTRADO PAQUETE: the sale takes the catalog's facts, the saldo re-derives ═════
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v1', true)::uuid, 1200, 'transferencia',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare
  rec     record;
  cli     record;
  v_rest  jsonb := current_setting('t.v1_rest', true)::jsonb;
  v_after jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.v1', true)::uuid;
  if rec.id is null then raise exception 'S1 FAIL: the venta row vanished — a swap rewrites it, never deletes it'; end if;

  if rec.paquete_nombre is distinct from 'MENSUAL 12' then
    raise exception 'S1 FAIL: paquete_nombre = % (expected MENSUAL 12 — the swapped-in catalog name)', rec.paquete_nombre;
  end if;
  if rec.clases is distinct from 12 then
    raise exception 'S1 FAIL: clases = % (expected 12 — the sale now records what the NEW package grants)', rec.clases;
  end if;
  if rec.vigencia_tipo is distinct from 'mes' then
    raise exception 'S1 FAIL: vigencia_tipo = % (expected mes — taken from the paquete row, not from the caller)', rec.vigencia_tipo;
  end if;
  if rec.vigencia_dias is not null then
    raise exception 'S1 FAIL: vigencia_dias = % (expected NULL — a mes package carries no día count, paquetes_vigencia_ck)', rec.vigencia_dias;
  end if;
  if rec.personalizado is distinct from false then
    raise exception 'S1 FAIL: personalizado = % (expected false — this arm swapped onto a REGISTERED paquete)', rec.personalizado;
  end if;
  if rec.monto is distinct from 1200 then
    raise exception 'S1 FAIL: monto = % (expected 1200 — the amount is the caller''s, reseeded from the package in the sheet)', rec.monto;
  end if;
  if rec.metodo is distinct from 'transferencia' then
    raise exception 'S1 FAIL: metodo = % (expected transferencia)', rec.metodo;
  end if;
  if rec.folio is distinct from 7201 then
    raise exception 'S1 FAIL: folio = % (expected 7201 — a swap never re-folios the sale; the folio is the paper ticket)', rec.folio;
  end if;
  if rec.cliente_id is distinct from current_setting('t.c1', true)::uuid then
    raise exception 'S1 FAIL: cliente_id = % (expected the fixture cliente — a swap never re-assigns the sale)', rec.cliente_id;
  end if;
  if rec.gym_id is distinct from current_setting('t.gym_a', true)::uuid then
    raise exception 'S1 FAIL: gym_id = % (expected gym A — the tenant stamp must survive a swap)', rec.gym_id;
  end if;

  -- the catch-all: every column except the eight the swap may write, byte-for-byte (created_at, the
  -- delete/swap window anchor, is inside it)
  select to_jsonb(v.*) - 'monto' - 'metodo' - 'fecha' - 'paquete_nombre' - 'clases'
                       - 'vigencia_tipo' - 'vigencia_dias' - 'personalizado'
    into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'S1 FAIL: a column outside the swap''s write set changed. before = % / after = %', v_rest, v_after;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c1', true)::uuid;
  if cli.clases_restantes is distinct from 14 then
    raise exception 'S1 FAIL: clases_restantes = % (expected 14 — 10 minus the 8 the old sale granted, plus the new package''s 12)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 50 then
    raise exception 'S1 FAIL: vence = % (expected current_date + 50 — +40 minus the old sale''s 20 días, plus the flat 30 a mes package contributes)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from 'MENSUAL 12' then
    raise exception 'S1 FAIL: cliente paquete_nombre = % (expected MENSUAL 12 — the swapped sale is the latest, so the display label follows it)', cli.paquete_nombre;
  end if;
end $$;

-- ══ S2 — SWAP TO PERSONALIZADO, then again to an ILIMITADO one: the swaps COMPOSE ═══════════════════
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v2', true)::uuid, 999, 'efectivo',
                              p_custom_nombre := 'PASE ESPECIAL',
                              p_custom_clases := 5,
                              p_custom_dias   := 10);
end $$;
reset role;
do $$
declare
  rec record;
  cli record;
begin
  select * into rec from public.ventas where id = current_setting('t.v2', true)::uuid;
  if rec.personalizado is distinct from true then
    raise exception 'S2a FAIL: personalizado = % (expected true — the custom branch must flag the sale)', rec.personalizado;
  end if;
  if rec.vigencia_tipo is distinct from 'dias' then
    raise exception 'S2a FAIL: vigencia_tipo = % (expected dias — a personalizado package is always dias)', rec.vigencia_tipo;
  end if;
  if rec.vigencia_dias is distinct from 10 then
    raise exception 'S2a FAIL: vigencia_dias = % (expected 10 — the typed vigencia)', rec.vigencia_dias;
  end if;
  if rec.clases is distinct from 5 then
    raise exception 'S2a FAIL: clases = % (expected 5 — the typed class count)', rec.clases;
  end if;
  if rec.paquete_nombre is distinct from 'PASE ESPECIAL' then
    raise exception 'S2a FAIL: paquete_nombre = % (expected PASE ESPECIAL — trimmed, from the caller)', rec.paquete_nombre;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c2', true)::uuid;
  if cli.clases_restantes is distinct from 7 then
    raise exception 'S2a FAIL: clases_restantes = % (expected 7 — 10 minus the old sale''s 8, plus the custom 5)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 30 then
    raise exception 'S2a FAIL: vence = % (expected current_date + 30 — +40 minus 20, plus the custom 10)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from 'PASE ESPECIAL' then
    raise exception 'S2a FAIL: cliente paquete_nombre = % (expected PASE ESPECIAL)', cli.paquete_nombre;
  end if;
end $$;

set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v2', true)::uuid, 1500, 'efectivo',
                              p_custom_nombre    := 'ILIMITADO MES',
                              p_custom_dias      := 15,
                              p_custom_ilimitado := true);
end $$;
reset role;
do $$
declare
  rec record;
  cli record;
begin
  select * into rec from public.ventas where id = current_setting('t.v2', true)::uuid;
  if rec.clases is not null then
    raise exception 'S2b FAIL: clases = % (expected NULL — null IS the ilimitado marker, ADR-0004, and p_custom_ilimitado is how the caller says so)', rec.clases;
  end if;
  if rec.vigencia_dias is distinct from 15 then
    raise exception 'S2b FAIL: vigencia_dias = % (expected 15)', rec.vigencia_dias;
  end if;
  if rec.personalizado is distinct from true then
    raise exception 'S2b FAIL: personalizado = % (expected true)', rec.personalizado;
  end if;
  if rec.paquete_nombre is distinct from 'ILIMITADO MES' then
    raise exception 'S2b FAIL: paquete_nombre = % (expected ILIMITADO MES)', rec.paquete_nombre;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c2', true)::uuid;
  if cli.clases_restantes is not null then
    raise exception 'S2b FAIL: clases_restantes = % (expected NULL — an ilimitado package makes the balance ilimitado, never 0)', cli.clases_restantes;
  end if;
  -- The composition proof: the second swap claws back the FIRST swap''s 5 clases / 10 días (the values
  -- now on the row), not the original sale''s 8 / 20. 30 − 10 + 15 = 35.
  if cli.vence is distinct from current_date + 35 then
    raise exception 'S2b FAIL: vence = % (expected current_date + 35 — the second swap claws back the FIRST swap''s 10 días, proving consecutive swaps compose)', cli.vence;
  end if;
end $$;

-- ══ S3 — THE CLAMP IS FINAL, NOT INTERMEDIATE: 3 − 8 + 12 = 7, never 12 ═════════════════════════════
-- The clawback's intermediate is −5. Clamping THERE (greatest(0, 3 − 8) = 0) would re-grant on top of a
-- zeroed base and hand the member the full 12 — five clases they already trained. The single clamp on
-- the re-granted TOTAL is what makes an over-consumed swap arithmetic instead of a gift. This vector is
-- the load-bearing decision of migration 20260815120000.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v3', true)::uuid, 1200, 'efectivo',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare cli record;
begin
  select * into cli from public.clientes where id = current_setting('t.c3', true)::uuid;
  if cli.clases_restantes is distinct from 7 then
    raise exception 'S3 FAIL: clases_restantes = % (expected 7 — (3 − 8) + 12 with ONE clamp at the end. 12 means the clawback was clamped per step and gifted 5 clases; 0 means the clamp fired twice)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 35 then
    raise exception 'S3 FAIL: vence = % (expected current_date + 35 — +25 minus the old 20 días, plus the flat 30)', cli.vence;
  end if;
end $$;

-- ══ S4 — SWAP DOWN UNDER WATER: (3 − 8) + 4 = −1 lands on exactly 0, never negative ═════════════════
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v4', true)::uuid, 400, 'efectivo',
                              p_paquete_id := current_setting('t.pk_4', true)::uuid);
end $$;
reset role;
do $$
declare cli record;
begin
  select * into cli from public.clientes where id = current_setting('t.c4', true)::uuid;
  if cli.clases_restantes is distinct from 0 then
    raise exception 'S4 FAIL: clases_restantes = % (expected 0 — (3 − 8) + 4 clamps at zero; 4 would mean the base was zeroed first, a negative means no clamp at all)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 15 then
    raise exception 'S4 FAIL: vence = % (expected current_date + 15 — +25 minus the old 20 días, plus the new package''s 10)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from 'PAQUETE 4' then
    raise exception 'S4 FAIL: cliente paquete_nombre = % (expected PAQUETE 4)', cli.paquete_nombre;
  end if;
end $$;

-- ══ S5a — FECHA-ONLY RE-DERIVE, still vigente at the new day: an exact IDENTITY ══════════════════════
-- The algebra: new_vence = fecha_dia + (base_vence − fecha_dia) + dias_old = base_vence + dias_old =
-- the vence it started with, and the balance comes back as base + the same grant. This is WHY
-- editar_venta_rules.sql's VF1/VF5 keep passing under ruling 1 — "vence follows fecha" only MOVES the
-- vigencia when the clawed-back base would have expired before the new day (S5b).
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.v5', true)::uuid, 800, 'efectivo', p_fecha := v_hoy - 5);
end $$;
reset role;
do $$
declare
  rec        record;
  cli        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  v_esperado timestamptz := ((v_hoy - 5)::timestamp + interval '12 hours')
                            at time zone current_setting('t.tz', true);
begin
  select * into rec from public.ventas where id = current_setting('t.v5', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'S5a FAIL: fecha = % (expected % — midday gym-tz on the requested day, registrar_venta''s write convention)', rec.fecha, v_esperado;
  end if;
  if rec.clases is distinct from 8 or rec.vigencia_dias is distinct from 20 or rec.paquete_nombre is distinct from '8 CLASES' then
    raise exception 'S5a FAIL: the package facts moved on a fecha-only call (clases=%, dias=%, nombre=%)', rec.clases, rec.vigencia_dias, rec.paquete_nombre;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c5', true)::uuid;
  if cli.clases_restantes is distinct from 10 then
    raise exception 'S5a FAIL: clases_restantes = % (expected 10 — the clawback + re-grant round trip is an IDENTITY when nothing clamps)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 40 then
    raise exception 'S5a FAIL: vence = % (expected current_date + 40, unchanged — the start day cancels out of the stacking algebra while the base has not expired)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from '8 CLASES' then
    raise exception 'S5a FAIL: cliente paquete_nombre = % (expected 8 CLASES — the re-stamp resolves to the same sale''s own name)', cli.paquete_nombre;
  end if;
end $$;

-- ══ S5b — FECHA-ONLY RE-DERIVE past the clawed-back vence: registrar's expired-restart discard ═══════
-- The cliente's vence is +2 and the sale granted 20 días, so the post-clawback base expired 18 days
-- ago — before the requested day. registrar_venta discards an expired base entirely (base_dias := 0,
-- base_clases := 0), so the sale RESTARTS the member: exactly its own clases, and its own días from the
-- new start. This is the non-identity half of "vence follows fecha", and it bites exactly where
-- registrar's own C9 rule bites.
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.v6', true)::uuid, 700, 'efectivo', p_fecha := v_hoy - 3);
end $$;
reset role;
do $$
declare
  rec        record;
  cli        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  v_esperado timestamptz := ((v_hoy - 3)::timestamp + interval '12 hours')
                            at time zone current_setting('t.tz', true);
begin
  select * into rec from public.ventas where id = current_setting('t.v6', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'S5b FAIL: fecha = % (expected % — midday gym-tz on the requested day)', rec.fecha, v_esperado;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c6', true)::uuid;
  if cli.clases_restantes is distinct from 8 then
    raise exception 'S5b FAIL: clases_restantes = % (expected 8 — the discarded base contributes 0, so the balance is the sale''s own grant; 6 would mean no re-derive ran)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 17 then
    raise exception 'S5b FAIL: vence = % (expected % — the new start day plus the sale''s own 20 días, with nothing carried over)', cli.vence, v_hoy + 17;
  end if;
end $$;

-- ══ S6 — IDEMPOTENCE: the identical swap payload twice writes the same rows, and only one of them ════
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v7', true)::uuid, 1200, 'transferencia',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare c jsonb;
begin
  select to_jsonb(x.*) into c from public.clientes x where x.id = current_setting('t.c7', true)::uuid;
  if (c ->> 'clases_restantes')::int is distinct from 14 then
    raise exception 'S6 FAIL: the first call did not land (clases_restantes = %, expected 14)', c ->> 'clases_restantes';
  end if;

  -- The member TRAINS between the two fires. A replay is not a fresh transaction in a frozen world: the
  -- realistic double-submit is a second tab posted after a visit was consumed, and the balance the
  -- replay must not touch is the DECREMENTED one. Re-running the clawback + re-grant would recompute
  -- 14 from the sale's facts and silently hand the class back.
  update public.clientes set clases_restantes = clases_restantes - 1
    where id = current_setting('t.c7', true)::uuid;

  -- The baseline is taken AFTER the decrement, so the jsonb catch-all below pins the consumed balance.
  select to_jsonb(x.*) into c from public.clientes x where x.id = current_setting('t.c7', true)::uuid;
  perform set_config('t.c7_after1', c::text, true);
end $$;

set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v7', true)::uuid, 1200, 'transferencia',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare
  v_after1 jsonb := current_setting('t.c7_after1', true)::jsonb;
  v_after2 jsonb;
  rec      record;
  n        int;
begin
  select to_jsonb(x.*) into v_after2 from public.clientes x where x.id = current_setting('t.c7', true)::uuid;
  if v_after2 is distinct from v_after1 then
    raise exception 'S6 FAIL: the replay moved the saldo again. after 1 = % / after 2 = %', v_after1, v_after2;
  end if;
  if (v_after2 ->> 'clases_restantes')::int is distinct from 13 then
    raise exception 'S6 FAIL: clases_restantes = % (expected 13 — the class consumed between the two fires must survive the replay; the re-derive is a fixed point on its own output, so ANY correct body leaves 13)', v_after2 ->> 'clases_restantes';
  end if;

  select count(*) into n from public.ventas where cliente_id = current_setting('t.c7', true)::uuid;
  if n <> 1 then
    raise exception 'S6 FAIL: % ventas row(s) for the cliente (expected 1 — editar_venta UPDATEs a row named by id, it never INSERTs, which is why it needs no idempotency key)', n;
  end if;
  select * into rec from public.ventas where id = current_setting('t.v7', true)::uuid;
  if rec.folio is distinct from 7207 then
    raise exception 'S6 FAIL: folio = % (expected 7207 — a replay must not re-folio)', rec.folio;
  end if;
end $$;

-- ══ S7 — THE WINDOW COVERS THE RE-DERIVE: swap AND fecha refused past 30 days; attribution accepted ══
-- The sale is 31 days old and is the cliente's only one, so the top-of-stack precondition (S12) cannot
-- be what refuses these calls — the window is. Ruling 4 windows "the swap", and the guard is written
-- over the predicate that TRIGGERS the re-derive: a fecha-only edit re-grants exactly as much as a swap
-- does, and on a sale of unbounded age the expired-restart discard turns it into a re-grant of the whole
-- package. What stays any-age is what moves no saldo — monto and metodo (#266.3).
set local role authenticated;
do $$
declare
  v_msg text;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v8', true)::uuid, 1200, 'efectivo',
                                p_paquete_id := current_setting('t.pk_mes', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Ya pasaron 30 días: esta venta ya no se puede recalcular' then
    raise exception 'S7 FAIL (swap): got % (expected Ya pasaron 30 días: esta venta ya no se puede recalcular — ruling 4''s window, anchored on created_at like the delete''s)', coalesce(v_msg, '<no error raised>');
  end if;

  -- The same window, reached through the OTHER argument: a fecha-only correction of a 31-day-old sale.
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v8', true)::uuid, 900, 'efectivo', p_fecha := v_hoy - 2);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Ya pasaron 30 días: esta venta ya no se puede recalcular' then
    raise exception 'S7 FAIL (fecha): got % (expected Ya pasaron 30 días: esta venta ya no se puede recalcular — windowing the swap but not the fecha that drives the same re-grant would leave the door open under a different argument name)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v8_all', true)::jsonb;
  c_all jsonb := current_setting('t.c8_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v8', true)::uuid;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c8', true)::uuid;
  if v_now is distinct from v_all then
    raise exception 'S7 FAIL: a refused call still wrote the venta. before = % / after = %', v_all, v_now;
  end if;
  if c_now is distinct from c_all then
    raise exception 'S7 FAIL: a refused call still moved the saldo. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- …and the SAME 31-day-old sale still accepts a monto/metodo edit: attribution is any-age (#266.3).
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v8', true)::uuid, 999, 'tarjeta');
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v8_all', true)::jsonb;
  c_all jsonb := current_setting('t.c8_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas v where v.id = current_setting('t.v8', true)::uuid;
  if (v_now ->> 'monto')::int is distinct from 999 or v_now ->> 'metodo' is distinct from 'tarjeta' then
    raise exception 'S7 FAIL: the any-age monto/metodo edit was refused too (monto=%, metodo=% — the window must cover the RECALCULATION only, #266.3)', v_now ->> 'monto', v_now ->> 'metodo';
  end if;
  -- Everything except the two attribution columns is byte-identical: the fecha the refused call asked
  -- for did not sneak in, and no package fact moved on a package-less call.
  if (v_now - 'monto' - 'metodo') is distinct from (v_all - 'monto' - 'metodo') then
    raise exception 'S7 FAIL: the monto/metodo edit moved something else on the venta. before = % / after = %', v_all, v_now;
  end if;

  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c8', true)::uuid;
  if c_now is distinct from c_all then
    raise exception 'S7 FAIL: a monto/metodo-only edit touched the cliente. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S8 — CROSS-TENANT, both directions: another gym's venta, and another gym's paquete ══════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v9', true)::uuid, 1200, 'efectivo',
                                p_paquete_id := current_setting('t.pk_b', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Venta no encontrada' then
    raise exception 'S8 FAIL: gym B staff got % (expected Venta no encontrada — a refusal, not a silent no-op, and the same message a non-existent id gets)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;

-- Gym A's own staff, gym B's paquete id: the paquete lookup is tenant-scoped, so this is a refusal too.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v9', true)::uuid, 1200, 'efectivo',
                                p_paquete_id := current_setting('t.pk_b', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Paquete no encontrado' then
    raise exception 'S8 FAIL: got % on a cross-gym paquete id (expected Paquete no encontrado — the catalog read carries the tenant gate, so another gym''s package is a refusal, never a silently applied grant)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v9_all', true)::jsonb;
  c_all jsonb := current_setting('t.c9_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v9', true)::uuid;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c9', true)::uuid;
  if v_now is distinct from v_all then
    raise exception 'S8 FAIL: a cross-tenant call wrote gym A''s venta. before = % / after = %', v_all, v_now;
  end if;
  if c_now is distinct from c_all then
    raise exception 'S8 FAIL: a cross-tenant call moved gym A''s saldo. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S9 — ARGUMENT REFUSALS: registrar_venta's messages, verbatim, and nothing written ═══════════════
-- The caller is gym A's own staff and the sale is 2 days old, so the ONLY thing that can refuse any of
-- these calls is the bound itself.
set local role authenticated;
do $$
declare v_msg text;
begin
  -- both sources at once. NOTE the difference from registrar_venta's XOR: here NEITHER is also legal,
  -- and means "keep the current package" (S5/S7/S10 exercise that arm).
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_paquete_id    := current_setting('t.pk_mes', true)::uuid,
                                p_custom_nombre := 'PASE ESPECIAL',
                                p_custom_clases := 5,
                                p_custom_dias   := 10);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Venta inválida: elige un paquete o define uno personalizado' then
    raise exception 'S9 FAIL (ambos): got % (expected Venta inválida: elige un paquete o define uno personalizado)', coalesce(v_msg, '<no error raised>');
  end if;

  -- a 2-char nombre: below registrar's 3..40 bound
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_custom_nombre := 'AB', p_custom_clases := 5, p_custom_dias := 10);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Nombre del paquete personalizado inválido' then
    raise exception 'S9 FAIL (nombre): got % (expected Nombre del paquete personalizado inválido)', coalesce(v_msg, '<no error raised>');
  end if;

  -- días 0 and días 366: the 1..365 bound, both edges
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_custom_nombre := 'PASE PRUEBA', p_custom_clases := 5, p_custom_dias := 0);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Vigencia personalizada inválida' then
    raise exception 'S9 FAIL (dias 0): got % (expected Vigencia personalizada inválida)', coalesce(v_msg, '<no error raised>');
  end if;

  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_custom_nombre := 'PASE PRUEBA', p_custom_clases := 5, p_custom_dias := 366);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Vigencia personalizada inválida' then
    raise exception 'S9 FAIL (dias 366): got % (expected Vigencia personalizada inválida)', coalesce(v_msg, '<no error raised>');
  end if;

  -- ilimitado AND a class count: incoherent, because null IS the ilimitado value
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_custom_nombre    := 'PASE PRUEBA', p_custom_dias := 10,
                                p_custom_clases    := 5,
                                p_custom_ilimitado := true);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Clases personalizadas inválidas' then
    raise exception 'S9 FAIL (ilimitado + clases): got % (expected Clases personalizadas inválidas)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v10_all', true)::jsonb;
  c_all jsonb := current_setting('t.c10_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v10', true)::uuid;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c10', true)::uuid;
  if v_now is distinct from v_all then
    raise exception 'S9 FAIL: a refused call still wrote the venta. before = % / after = %', v_all, v_now;
  end if;
  if c_now is distinct from c_all then
    raise exception 'S9 FAIL: a refused call still moved the saldo. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S10 — THE CHEAP PATH: monto/metodo only ⇒ the clientes row is byte-identical ════════════════════
-- This is the "must NOT clawback" contract. The re-derive is triggered by a CHANGE (grant or day),
-- never by the call: without that guard this very payload would run the full clawback + re-grant, and
-- the floor / expired-restart branches would move a balance nobody asked to move.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v11', true)::uuid, 1111, 'tarjeta');
end $$;
reset role;
do $$
declare
  rec   record;
  c_all jsonb := current_setting('t.c11_all', true)::jsonb;
  c_now jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.v11', true)::uuid;
  if rec.monto is distinct from 1111 or rec.metodo is distinct from 'tarjeta' then
    raise exception 'S10 FAIL: the edit itself did not land (monto=%, metodo=%)', rec.monto, rec.metodo;
  end if;
  if rec.paquete_nombre is distinct from '8 CLASES' or rec.clases is distinct from 8
     or rec.vigencia_tipo is distinct from 'dias' or rec.vigencia_dias is distinct from 20
     or rec.personalizado is distinct from false then
    raise exception 'S10 FAIL: a package-less call rewrote the package facts (nombre=%, clases=%, tipo=%, dias=%, person=%)',
      rec.paquete_nombre, rec.clases, rec.vigencia_tipo, rec.vigencia_dias, rec.personalizado;
  end if;

  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c11', true)::uuid;
  if c_now is distinct from c_all then
    raise exception 'S10 FAIL: a monto/metodo-only edit touched the cliente. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S11 — RENAME-ONLY: the label follows, the saldo does not move ═══════════════════════════════════
-- pk_igual grants exactly what the sale already granted (8 clases / 20 días), so v_cambio_grant is
-- false and the cheap path runs — but the display label still has to follow, and it is re-stamped from
-- the latest REMAINING sale rather than from the swapped-in name, which is what makes renaming a
-- NON-latest sale leave the label alone.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v12', true)::uuid, 800, 'efectivo',
                              p_paquete_id := current_setting('t.pk_igual', true)::uuid);
end $$;
reset role;
do $$
declare
  rec record;
  cli record;
begin
  select * into rec from public.ventas where id = current_setting('t.v12', true)::uuid;
  if rec.paquete_nombre is distinct from 'NUEVO NOMBRE' then
    raise exception 'S11 FAIL: ventas paquete_nombre = % (expected NUEVO NOMBRE — a same-grant swap still rewrites the label)', rec.paquete_nombre;
  end if;
  if rec.clases is distinct from 8 or rec.vigencia_dias is distinct from 20 then
    raise exception 'S11 FAIL: the grant moved (clases=%, dias=% — expected 8 / 20, byte-identical)', rec.clases, rec.vigencia_dias;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c12', true)::uuid;
  if cli.paquete_nombre is distinct from 'NUEVO NOMBRE' then
    raise exception 'S11 FAIL: cliente paquete_nombre = % (expected NUEVO NOMBRE — the swapped sale is the latest, so the label follows it)', cli.paquete_nombre;
  end if;
  if cli.clases_restantes is distinct from 10 then
    raise exception 'S11 FAIL: clases_restantes = % (expected 10, byte-identical — a rename is not a re-grant)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 40 then
    raise exception 'S11 FAIL: vence = % (expected current_date + 40, byte-identical — a rename is not a re-grant)', cli.vence;
  end if;
end $$;

-- ══ S12 — ONLY THE TOP OF THE STACK CAN RE-DERIVE: the lapsed chain ═════════════════════════════════
-- v13 (8 clases / 20 días) was sold 25 days ago and expired on day −5; v14, the same package sold 2 days
-- ago, hit registrar_venta's expired-restart discard and left the member on ITS grant alone — 8 clases,
-- vence +18. The stored saldo therefore describes v14, and the clawback's linear inverse
-- (`clases_restantes − clases_old`, `vence − dias_old`) cannot undo v13 out of it: it would read
-- 8 − 8 = 0 as "the base", carry (+18 − 20) = −2 forward from v13's own day 25 days back, and write
-- 12 clases / vence +28 — v14's whole grant destroyed and v13's counted twice. v13 is INSIDE the 30-day
-- window, so nothing else can refuse this; only the top-of-stack precondition can.
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v13', true)::uuid, 1200, 'efectivo',
                                p_paquete_id := current_setting('t.pk_mes', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Solo la venta más reciente puede cambiar de paquete o fecha' then
    raise exception 'S12 FAIL (swap): got % (expected Solo la venta más reciente puede cambiar de paquete o fecha — a later sale of the same cliente makes the clawback''s linear inverse meaningless)', coalesce(v_msg, '<no error raised>');
  end if;

  -- The same refusal through the fecha door: it runs the identical clawback + re-grant.
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v13', true)::uuid, 750, 'efectivo',
                                p_fecha := (now() at time zone current_setting('t.tz', true))::date - 20);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Solo la venta más reciente puede cambiar de paquete o fecha' then
    raise exception 'S12 FAIL (fecha): got % (expected Solo la venta más reciente puede cambiar de paquete o fecha)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v13_all', true)::jsonb;
  c_all jsonb := current_setting('t.c13_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v13', true)::uuid;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c13', true)::uuid;
  if v_now is distinct from v_all then
    raise exception 'S12 FAIL: the refused re-derive still wrote the venta. before = % / after = %', v_all, v_now;
  end if;
  if c_now is distinct from c_all then
    raise exception 'S12 FAIL: the refused re-derive still moved the saldo — v14''s grant would have been the casualty. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- …and the SAME non-latest sale accepts a monto/metodo edit: attribution moves no saldo, so an older
-- sale's amount and payment method stay correctable forever.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v13', true)::uuid, 640, 'tarjeta');
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v13_all', true)::jsonb;
  c_all jsonb := current_setting('t.c13_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas v where v.id = current_setting('t.v13', true)::uuid;
  if (v_now ->> 'monto')::int is distinct from 640 or v_now ->> 'metodo' is distinct from 'tarjeta' then
    raise exception 'S12 FAIL: a monto/metodo edit of a NON-latest sale was refused (monto=%, metodo=% — the precondition governs the re-derive, not attribution)', v_now ->> 'monto', v_now ->> 'metodo';
  end if;
  if (v_now - 'monto' - 'metodo') is distinct from (v_all - 'monto' - 'metodo') then
    raise exception 'S12 FAIL: the monto/metodo edit moved something else on the venta. before = % / after = %', v_all, v_now;
  end if;

  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c13', true)::uuid;
  if c_now is distinct from c_all then
    raise exception 'S12 FAIL: a monto/metodo-only edit of a non-latest sale touched the cliente. before = % / after = %', c_all, c_now;
  end if;
end $$;

select 'editar_venta paquete rules: OK' as result;
rollback;
