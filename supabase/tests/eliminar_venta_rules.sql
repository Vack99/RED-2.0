-- eliminar_venta written-row suite — issue #269 (payment correction from the ficha; map #265, rulings
-- #266/#267).
--
-- Deleting a sale is the one correction that has to UNDO a write nobody kept a record of: the sale is
-- gone from the ledger (every earnings surface recomputes from raw `ventas` rows, so subtraction is
-- automatic) but `clientes.clases_restantes` / `vence` / `paquete_nombre` are a STORED running balance
-- (ADR-0004) that only this transaction can put back. So the contract is the WRITTEN ROWS on both
-- tables, and every vector below re-SELECTs them after the call — never a return value (AGENTS.md,
-- "an RPC's return value is not its contract; the rows it writes are" — #78/#80).
--
-- Vectors:
--   V4 — NORMAL CLAWBACK: a cliente on 10 clases with a live `vence` and two sales on file loses the
--        newer one (8 clases, vigencia_tipo 'mes'). The venta row is gone, the OLDER sale survives
--        untouched, clases_restantes falls to exactly 2, `vence` moves back exactly 30 days (ruling
--        C1: 'mes' contributes a flat 30, never a calendar month), and paquete_nombre reverts to the
--        most recent REMAINING sale's name (#267.5) rather than being left pointing at a sale that no
--        longer exists.
--   V5 — THE RED DUPLICATE (the scenario the whole feature exists for, #267): the same package sold
--        twice by accident, with REAL attendances taken in between — 16 clases granted, 2 consumed,
--        balance 14. Deleting the duplicate leaves BOTH asistencias rows intact (not hard-deleted, not
--        soft-deleted: `asistencias` has no FK to `ventas` and the RPC must never reach for it) and
--        lands the balance on exactly 6 — the as-if-never-sold state.
--   V6 — THE FLOOR-CLIP GATE: a cliente already down to 3 clases tries to lose a sale that granted 8.
--        The clawback would land at −5, so the delete is REFUSED with 'No se puede eliminar: ya se
--        usaron clases de esta venta' and BOTH rows survive untouched. This vector INVERTED on
--        2026-08-15: #267.4 originally ruled "the used-classes edge proceeds, floored at 0", and this
--        vector asserted the 0. The owner narrowed it (migration 20260815120000, ruling 3) — floored
--        classes were really trained, so erasing the sale would erase a debt the member incurred. The
--        swap stays available in exactly this state, which is why the refusal points at it.
--   V6b — THE BOUNDARY, and what V6 used to also prove: a cliente on exactly 8 losing a sale that
--        granted 8 lands on exactly 0, and `= 0` is NOT below zero, so the delete is ALLOWED. With no
--        sales left at all paquete_nombre is CLEARED rather than left stale (#267.5).
--   V7 — THE WINDOW: a sale registered 31 days ago is refused with 'La venta ya no se puede eliminar'
--        (#266.2 — 30 days from created_at, the registration stamp, NOT the backdatable `fecha`). The
--        venta row still exists and the balance is untouched: the refusal is total, not partial.
--   V8 — CROSS-TENANT: gym B staff deleting gym A's sale is refused with 'Venta no encontrada' — a
--        REFUSAL, not a silent no-op (the #219/retire_recurring_schedule shape). The target sale is
--        deliberately INSIDE the 30-day window, so what refuses it is provably the tenant gate and not
--        the window.
--   V9 — ILIMITADO SALE on a finite balance: the deleted sale granted no classes (`clases` null), so
--        the clawback subtracts DAYS ONLY and clases_restantes must come back byte-identical. The
--        obvious bug this pins is a `coalesce(clases, 0)` slip into something that zeroes or floors a
--        balance the sale never touched.
--   V10 — ILIMITADO BALANCE (clases_restantes null) losing a FINITE sale: the null is the ilimitado
--        marker (ADR-0004), not a missing number — subtracting from it must leave it NULL, never 0 and
--        never a negative. `vence` still moves back by the sale's own vigencia_dias.
--   V11 — THE GATE NEVER FIRES ON AN ILIMITADO. Two arms, each shaped so a careless gate WOULD refuse:
--        (a) an ilimitado SALE (`clases` null) deleted off a balance of ZERO — the lowest finite
--        balance there is, so any reading of the null as a positive grant clips below zero; (b) an
--        ilimitado BALANCE (null) losing a 12-clase sale — a `coalesce(saldo, 0)` inside the gate reads
--        0 − 12 and refuses outright. Neither can floor (a null is not a number to run out of), so both
--        deletes must proceed, and the ilimitado balance must come back NULL.
--   GRANT LAYER — the door itself, proven from the client role rather than from the migration text.
--        `eliminar_venta` is SECURITY DEFINER with NO delete policy precisely because DELETE has no
--        column granularity, so a direct `delete from public.ventas` must be refused at the GRANT
--        layer (42501) before RLS is ever consulted — otherwise a raw PostgREST call would skip the
--        window AND the clawback. UPDATE is the mirror image: revoked table-wide then re-granted on
--        (monto, metodo) only, so a direct `update ... set folio` is refused the same way — and so is
--        `update ... set fecha`, whose column grant 20260814120000 added and 20260815120000 REVOKED:
--        once a fecha edit re-derives the saldo (ruling 1), a raw PATCH of the sold date would leave
--        the stored balance describing a vigencia that started on a different day. A direct
--        `update ... set monto` on the caller's OWN gym row still SUCCEEDS — that is the accepted
--        residual, and asserting it keeps the column grant from being silently widened or dropped.
--
-- Fixtures are 100% transaction-local (fresh gen_random_uuid gym/auth.users/gym_membership/clientes/
-- ventas/asistencias rows, zero prod UUIDs — a live-gym lookup 22P02s in staff_gym() on a fresh
-- scratch project), and EVERY fixture write happens as postgres BEFORE the first `set local role
-- authenticated`, which silently no-ops writes that need postgres. Assertions likewise run after
-- `reset role`, so they read ground truth rather than an RLS-filtered view (V8 asserts on a row its
-- caller cannot even select). Each vector owns its own cliente, so a failure names one vector.
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN: `node supabase/tests/run-denial-suite.mjs` (== `pnpm test:denial`) — wired into SUITE —
-- or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs; written as postgres, before any role switch) ────
do $$
declare
  gym_a    uuid := gen_random_uuid();
  gym_b    uuid := gen_random_uuid();
  op_a     uuid := gen_random_uuid();
  op_b     uuid := gen_random_uuid();
  c1       uuid;  -- V4 normal clawback
  c2       uuid;  -- V5 the RED duplicate
  c3       uuid;  -- V6 the floor
  c4       uuid;  -- V7 the window
  c5       uuid;  -- V8 cross-tenant
  c6       uuid;  -- V9 ilimitado sale, finite balance
  c7       uuid;  -- V10 finite sale, ilimitado balance
  c8       uuid;  -- GRANT LAYER probe
  c9       uuid;  -- V6b the boundary (lands on exactly 0)
  c10      uuid;  -- V11a ilimitado sale off a zero balance
  c11      uuid;  -- V11b ilimitado balance losing a big finite sale
  v_old    uuid;  -- c1's surviving older sale
  v_new    uuid;  -- c1's delete target
  v_dup1   uuid;  -- c2's kept sale
  v_dup2   uuid;  -- c2's accidental duplicate (delete target)
  v_floor  uuid;  -- c3's only sale (delete target)
  v_stale  uuid;  -- c4's 31-day-old sale (refused)
  v_cross  uuid;  -- c5's in-window sale (refused for tenancy, not age)
  v_ilim   uuid;  -- c6's ilimitado sale (delete target)
  v_fin    uuid;  -- c7's finite sale (delete target)
  v_grant  uuid;  -- c8's in-window sale, never deleted — the raw-DML probe target
  v_cero   uuid;  -- c9's only sale (delete target — lands on exactly 0)
  v_ilim0  uuid;  -- c10's ilimitado sale (delete target)
  v_gordo  uuid;  -- c11's 12-clase sale (delete target)
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'eliminar-venta-suite-gym-a', 'Eliminar Venta Suite A', 'America/Chihuahua', 'forge'),
    (gym_b, 'eliminar-venta-suite-gym-b', 'Eliminar Venta Suite B', 'America/Chihuahua', 'forge');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_a, 'authenticated', 'authenticated', 'op-a@eliminar-venta-suite.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', op_b, 'authenticated', 'authenticated', 'op-b@eliminar-venta-suite.local', now(), '{}');

  -- staff_gym() resolves the caller's gym from this (user_id, role in ('owner','operator')) row.
  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_b, gym_b, 'operator');

  -- ── V4: two sales on file, balance 10, vence 40 days out ────────────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Clawback', '0000000011', 10, current_date + 40, 'PAQUETE NUEVO', gym_a) returning id into c1;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c1, 7101, 'PAQUETE VIEJO', 4, 'dias', 20, 500, 'efectivo', now() - interval '20 days', now() - interval '20 days')
    returning id into v_old;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c1, 7102, 'PAQUETE NUEVO', 8, 'mes', null, 850, 'efectivo', now() - interval '5 days', now() - interval '5 days')
    returning id into v_new;

  -- ── V5: the same 8-clase 'mes' package registered twice (16 granted), 2 attendances consumed → 14 ─
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Duplicado', '0000000012', 14, current_date + 60, '8 CLASES', gym_a) returning id into c2;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c2, 7103, '8 CLASES', 8, 'mes', null, 800, 'efectivo', now() - interval '3 days', now() - interval '3 days')
    returning id into v_dup1;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c2, 7104, '8 CLASES', 8, 'mes', null, 800, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v_dup2;
  -- Two REAL visits taken between the duplicate registration and the correction. origen 'libre' with a
  -- null class_session_id satisfies asistencias_origen_kind_ck; distinct fechas satisfy
  -- asistencias_cliente_fecha_libre_uq. These rows are the ones the clawback must not touch.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada) values
    (gym_a, c2, current_date - 2, true, 'libre', null, null, false),
    (gym_a, c2, current_date - 1, true, 'libre', null, null, false);

  -- ── V6: balance already spent down to 3, one sale on file that granted 8 → the clawback would clip ─
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Piso', '0000000013', 3, current_date + 25, '8 CLASES', gym_a) returning id into c3;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c3, 7105, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '1 day', now() - interval '1 day')
    returning id into v_floor;

  -- ── V7: registered 31 days ago — one day past the window ────────────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Ventana', '0000000014', 5, current_date + 30, 'FUERA DE VENTANA', gym_a) returning id into c4;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c4, 7106, 'FUERA DE VENTANA', 8, 'mes', null, 900, 'efectivo', now() - interval '31 days', now() - interval '31 days')
    returning id into v_stale;

  -- ── V8: well inside the window, so only tenancy can refuse it ───────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Ajeno', '0000000015', 7, current_date + 35, 'AJENO', gym_a) returning id into c5;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c5, 7107, 'AJENO', 8, 'mes', null, 950, 'efectivo', now() - interval '4 days', now() - interval '4 days')
    returning id into v_cross;

  -- ── V9: an ILIMITADO sale (clases null, 'mes') on a client who has a finite balance ─────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Ilimitado', '0000000016', 10, current_date + 45, 'ILIMITADO', gym_a) returning id into c6;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c6, 7108, 'ILIMITADO', null, 'mes', null, 1200, 'efectivo', now() - interval '6 days', now() - interval '6 days')
    returning id into v_ilim;

  -- ── V10: an ILIMITADO balance (clases_restantes null) losing a finite 10-clase / 15-día sale ────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Saldo Ilimitado', '0000000017', null, current_date + 50, '10 CLASES', gym_a) returning id into c7;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c7, 7109, '10 CLASES', 10, 'dias', 15, 600, 'efectivo', now() - interval '7 days', now() - interval '7 days')
    returning id into v_fin;

  -- ── GRANT LAYER: an in-window own-gym sale, never passed to the RPC — only probed with raw DML ──
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Grants', '0000000018', 9, current_date + 20, 'GRANTS', gym_a) returning id into c8;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c8, 7110, 'GRANTS', 8, 'dias', 20, 500, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v_grant;

  -- ── V6b: exactly 8 left against a sale that granted 8 — the boundary the gate must NOT refuse ────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Cero Exacto', '0000000019', 8, current_date + 25, '8 CLASES', gym_a) returning id into c9;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c9, 7111, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '1 day', now() - interval '1 day')
    returning id into v_cero;

  -- ── V11a: an ILIMITADO sale off a ZERO balance — a null grant can never clip a balance ──────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Ilimitado Cero', '0000000020', 0, current_date + 45, 'ILIMITADO', gym_a) returning id into c10;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c10, 7112, 'ILIMITADO', null, 'mes', null, 1200, 'efectivo', now() - interval '6 days', now() - interval '6 days')
    returning id into v_ilim0;

  -- ── V11b: an ILIMITADO balance losing a 12-clase sale — a coalesce(saldo,0) gate would refuse it ─
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('DV Saldo Nulo Gordo', '0000000021', null, current_date + 50, '12 CLASES', gym_a) returning id into c11;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c11, 7113, '12 CLASES', 12, 'dias', 15, 900, 'efectivo', now() - interval '7 days', now() - interval '7 days')
    returning id into v_gordo;

  perform set_config('t.gym_a',   gym_a::text,   true);
  perform set_config('t.gym_b',   gym_b::text,   true);
  perform set_config('t.op_a',    op_a::text,    true);
  perform set_config('t.op_b',    op_b::text,    true);
  perform set_config('t.c1',      c1::text,      true);
  perform set_config('t.c2',      c2::text,      true);
  perform set_config('t.c3',      c3::text,      true);
  perform set_config('t.c4',      c4::text,      true);
  perform set_config('t.c5',      c5::text,      true);
  perform set_config('t.c6',      c6::text,      true);
  perform set_config('t.c7',      c7::text,      true);
  perform set_config('t.c8',      c8::text,      true);
  perform set_config('t.c9',      c9::text,      true);
  perform set_config('t.c10',     c10::text,     true);
  perform set_config('t.c11',     c11::text,     true);
  perform set_config('t.v_old',   v_old::text,   true);
  perform set_config('t.v_new',   v_new::text,   true);
  perform set_config('t.v_dup1',  v_dup1::text,  true);
  perform set_config('t.v_dup2',  v_dup2::text,  true);
  perform set_config('t.v_floor', v_floor::text, true);
  perform set_config('t.v_stale', v_stale::text, true);
  perform set_config('t.v_cross', v_cross::text, true);
  perform set_config('t.v_ilim',  v_ilim::text,  true);
  perform set_config('t.v_fin',   v_fin::text,   true);
  perform set_config('t.v_grant', v_grant::text, true);
  perform set_config('t.v_cero',  v_cero::text,  true);
  perform set_config('t.v_ilim0', v_ilim0::text, true);
  perform set_config('t.v_gordo', v_gordo::text, true);
  -- The GRANT LAYER probe row's pre-DML `fecha`, so the refused fecha UPDATE can be proven inert.
  perform set_config('t.v_grant_fecha', (select v.fecha::text from public.ventas v where v.id = v_grant), true);
  -- V6's "nothing was written" baselines: the refusal must be total, on both tables.
  perform set_config('t.v_floor_all', (select to_jsonb(v.*)::text from public.ventas   v where v.id = v_floor), true);
  perform set_config('t.c3_all',      (select to_jsonb(c.*)::text from public.clientes c where c.id = c3),      true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);

-- ══ V4 — NORMAL CLAWBACK: row deleted, 10 − 8 = 2 clases, vence − 30d, paquete_nombre reverted ══════
set local role authenticated;
do $$
begin
  perform public.eliminar_venta(current_setting('t.v_new', true)::uuid);
end $$;
reset role;
do $$
declare
  cli record;
begin
  if exists (select 1 from public.ventas where id = current_setting('t.v_new', true)::uuid) then
    raise exception 'V4 FAIL: the venta row survived — eliminar_venta is a HARD delete (ventas has no deleted_at)';
  end if;
  if not exists (select 1 from public.ventas where id = current_setting('t.v_old', true)::uuid) then
    raise exception 'V4 FAIL: the OLDER sale was deleted too — the clawback must touch exactly one row';
  end if;

  select * into cli from public.clientes where id = current_setting('t.c1', true)::uuid;
  if cli.clases_restantes is distinct from 2 then
    raise exception 'V4 FAIL: clases_restantes = % (expected 2 — 10 minus the 8 the deleted sale granted)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 10 then
    raise exception 'V4 FAIL: vence = % (expected current_date + 10 — 40 minus the flat 30 days a vigencia_tipo mes sale contributes, ruling C1)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from 'PAQUETE VIEJO' then
    raise exception 'V4 FAIL: paquete_nombre = % (expected PAQUETE VIEJO — the most recent REMAINING sale, not the deleted one)', cli.paquete_nombre;
  end if;
end $$;

-- ══ V5 — THE RED DUPLICATE: attendances untouched, balance lands on exactly 6, vence − 30d ══════════
set local role authenticated;
do $$
begin
  perform public.eliminar_venta(current_setting('t.v_dup2', true)::uuid);
end $$;
reset role;
do $$
declare
  cli record;
  n   int;
begin
  if exists (select 1 from public.ventas where id = current_setting('t.v_dup2', true)::uuid) then
    raise exception 'V5 FAIL: the duplicate sale survived the delete';
  end if;
  if not exists (select 1 from public.ventas where id = current_setting('t.v_dup1', true)::uuid) then
    raise exception 'V5 FAIL: the KEPT sale was deleted — only the named duplicate may go';
  end if;

  -- The whole point of #267.2: attendances are never touched, neither hard- nor soft-deleted.
  select count(*) into n from public.asistencias where cliente_id = current_setting('t.c2', true)::uuid;
  if n <> 2 then
    raise exception 'V5 FAIL: % asistencias row(s) remain for the cliente (expected 2 — deleting a sale must never reach asistencias)', n;
  end if;
  select count(*) into n from public.asistencias
    where cliente_id = current_setting('t.c2', true)::uuid and deleted_at is null;
  if n <> 2 then
    raise exception 'V5 FAIL: % ACTIVE asistencias row(s) remain (expected 2 — the visits must not be soft-deleted either)', n;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c2', true)::uuid;
  if cli.clases_restantes is distinct from 6 then
    raise exception 'V5 FAIL: clases_restantes = % (expected 6 — 16 granted minus 8 clawed back minus the 2 real visits already consumed)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 30 then
    raise exception 'V5 FAIL: vence = % (expected current_date + 30 — 60 minus the duplicate sale''s flat 30 days)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from '8 CLASES' then
    raise exception 'V5 FAIL: paquete_nombre = % (expected 8 CLASES — the surviving twin still supplies it)', cli.paquete_nombre;
  end if;
end $$;

-- ══ V6 — THE FLOOR-CLIP GATE: 3 − 8 would go negative, so the delete is REFUSED and nothing moves ═══
-- Owner ruling 3 (2026-08-15, migration 20260815120000) narrowed #267.4: the classes below the floor
-- were really trained, so deleting the sale that granted them would erase a debt the member incurred.
-- The refusal names the member's action rather than the arithmetic, deliberately — and the paquete swap
-- stays available in exactly this state, which is what the message points the operator at.
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.eliminar_venta(current_setting('t.v_floor', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'No se puede eliminar: ya se usaron clases de esta venta' then
    raise exception 'V6 FAIL: got % (expected No se puede eliminar: ya se usaron clases de esta venta — the floor-clip gate, ruling 3)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v_floor_all', true)::jsonb;
  c_all jsonb := current_setting('t.c3_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v_floor', true)::uuid;
  if v_now is null then
    raise exception 'V6 FAIL: the venta was deleted anyway — the gate must refuse BEFORE the delete, not after it';
  end if;
  if v_now is distinct from v_all then
    raise exception 'V6 FAIL: the refused delete still wrote the venta. before = % / after = %', v_all, v_now;
  end if;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c3', true)::uuid;
  if c_now is distinct from c_all then
    raise exception 'V6 FAIL: the refused delete still moved the saldo (it must stay on 3, vence +25, label intact). before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ V6b — THE BOUNDARY: 8 − 8 lands on exactly 0, which is NOT below zero, so the delete PROCEEDS ═══
-- `= 0` allowed / `< 0` refused is the whole gate. This vector also keeps what V6 used to prove on its
-- way past: with no sale left at all, paquete_nombre is CLEARED rather than left pointing at a sale
-- that no longer exists (#267.5).
set local role authenticated;
do $$
begin
  perform public.eliminar_venta(current_setting('t.v_cero', true)::uuid);
end $$;
reset role;
do $$
declare
  cli record;
begin
  if exists (select 1 from public.ventas where id = current_setting('t.v_cero', true)::uuid) then
    raise exception 'V6b FAIL: the venta row survived — landing on exactly 0 is allowed, the gate refuses only strictly-below';
  end if;

  select * into cli from public.clientes where id = current_setting('t.c9', true)::uuid;
  if cli.clases_restantes is distinct from 0 then
    raise exception 'V6b FAIL: clases_restantes = % (expected 0 — 8 minus the 8 the deleted sale granted)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 5 then
    raise exception 'V6b FAIL: vence = % (expected current_date + 5 — 25 minus the sale''s 20 vigencia_dias)', cli.vence;
  end if;
  if cli.paquete_nombre is not null then
    raise exception 'V6b FAIL: paquete_nombre = % (expected NULL — no sale remains to supply a package label, #267.5)', cli.paquete_nombre;
  end if;
end $$;

-- ══ V7 — THE WINDOW: a 31-day-old sale is refused; row and balance both survive intact ══════════════
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.eliminar_venta(current_setting('t.v_stale', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'La venta ya no se puede eliminar' then
    raise exception 'V7 FAIL: got % (expected La venta ya no se puede eliminar — 30 days from created_at, #266.2)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  cli record;
begin
  if not exists (select 1 from public.ventas where id = current_setting('t.v_stale', true)::uuid) then
    raise exception 'V7 FAIL: the past-window venta was deleted anyway';
  end if;
  select * into cli from public.clientes where id = current_setting('t.c4', true)::uuid;
  if cli.clases_restantes is distinct from 5 then
    raise exception 'V7 FAIL: clases_restantes = % (expected 5 — a refused delete must claw nothing back)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 30 then
    raise exception 'V7 FAIL: vence = % (expected current_date + 30 — untouched by the refused delete)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from 'FUERA DE VENTANA' then
    raise exception 'V7 FAIL: paquete_nombre = % (expected FUERA DE VENTANA — untouched by the refused delete)', cli.paquete_nombre;
  end if;
end $$;

-- ══ V8 — CROSS-TENANT: gym B staff is refused on gym A's in-window sale; row and balance intact ═════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.eliminar_venta(current_setting('t.v_cross', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Venta no encontrada' then
    raise exception 'V8 FAIL: gym B staff got % (expected Venta no encontrada — a refusal, not a silent no-op, and the same message a non-existent id gets)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  cli record;
begin
  if not exists (select 1 from public.ventas where id = current_setting('t.v_cross', true)::uuid) then
    raise exception 'V8 FAIL: gym B staff deleted gym A''s sale';
  end if;
  select * into cli from public.clientes where id = current_setting('t.c5', true)::uuid;
  if cli.clases_restantes is distinct from 7 then
    raise exception 'V8 FAIL: clases_restantes = % (expected 7 — a cross-tenant call must claw nothing back)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 35 then
    raise exception 'V8 FAIL: vence = % (expected current_date + 35 — untouched by the refused delete)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from 'AJENO' then
    raise exception 'V8 FAIL: paquete_nombre = % (expected AJENO — untouched by the refused delete)', cli.paquete_nombre;
  end if;
end $$;

-- ══ V9 — ILIMITADO SALE: days only. clases_restantes must be UNCHANGED, not floored, not zeroed ═════
-- Back to gym A's own staff (V8 left the claims on gym B).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.eliminar_venta(current_setting('t.v_ilim', true)::uuid);
end $$;
reset role;
do $$
declare
  cli record;
begin
  if exists (select 1 from public.ventas where id = current_setting('t.v_ilim', true)::uuid) then
    raise exception 'V9 FAIL: the venta row survived the delete';
  end if;
  select * into cli from public.clientes where id = current_setting('t.c6', true)::uuid;
  if cli.clases_restantes is distinct from 10 then
    raise exception 'V9 FAIL: clases_restantes = % (expected 10, UNCHANGED — an ilimitado sale granted no clases, so the clawback subtracts none)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 15 then
    raise exception 'V9 FAIL: vence = % (expected current_date + 15 — 45 minus the flat 30 days a vigencia_tipo mes sale contributes, ruling C1)', cli.vence;
  end if;
end $$;

-- ══ V10 — ILIMITADO BALANCE: null is the ilimitado marker, so it stays NULL — never 0, never negative ══
set local role authenticated;
do $$
begin
  perform public.eliminar_venta(current_setting('t.v_fin', true)::uuid);
end $$;
reset role;
do $$
declare
  cli record;
begin
  if exists (select 1 from public.ventas where id = current_setting('t.v_fin', true)::uuid) then
    raise exception 'V10 FAIL: the venta row survived the delete';
  end if;
  select * into cli from public.clientes where id = current_setting('t.c7', true)::uuid;
  if cli.clases_restantes is not null then
    raise exception 'V10 FAIL: clases_restantes = % (expected NULL — null is ILIMITADO, ADR-0004, not a missing number to subtract from)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 35 then
    raise exception 'V10 FAIL: vence = % (expected current_date + 35 — 50 minus the sale''s 15 vigencia_dias)', cli.vence;
  end if;
end $$;

-- ══ V11 — THE GATE NEVER FIRES ON AN ILIMITADO: neither a null grant nor a null balance can floor ═══
-- (a) an ilimitado SALE off a balance of ZERO. Zero is the lowest finite balance there is, so a gate
-- that read the null `clases` as anything positive would clip below it and refuse. A null grant took
-- nothing, so there is nothing to owe: the delete proceeds and the balance stays exactly 0.
set local role authenticated;
do $$
begin
  perform public.eliminar_venta(current_setting('t.v_ilim0', true)::uuid);
end $$;
reset role;
do $$
declare
  cli record;
begin
  if exists (select 1 from public.ventas where id = current_setting('t.v_ilim0', true)::uuid) then
    raise exception 'V11a FAIL: the delete was refused (or did not run) — an ilimitado sale grants no clases, so the floor-clip gate can never fire on it';
  end if;
  select * into cli from public.clientes where id = current_setting('t.c10', true)::uuid;
  if cli.clases_restantes is distinct from 0 then
    raise exception 'V11a FAIL: clases_restantes = % (expected 0, UNCHANGED — the clawback subtracts days only)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 15 then
    raise exception 'V11a FAIL: vence = % (expected current_date + 15 — 45 minus the flat 30 days a mes sale contributes, ruling C1)', cli.vence;
  end if;
end $$;

-- (b) an ilimitado BALANCE losing a 12-clase sale. A `coalesce(saldo, 0)` inside the gate would read
-- 0 − 12 and refuse this outright — the null is the ilimitado marker (ADR-0004), not a missing number,
-- so it can never run out and must survive the delete as NULL.
set local role authenticated;
do $$
begin
  perform public.eliminar_venta(current_setting('t.v_gordo', true)::uuid);
end $$;
reset role;
do $$
declare
  cli record;
begin
  if exists (select 1 from public.ventas where id = current_setting('t.v_gordo', true)::uuid) then
    raise exception 'V11b FAIL: the delete was refused (or did not run) — an ilimitado BALANCE cannot floor, so the gate must not consult it as a number';
  end if;
  select * into cli from public.clientes where id = current_setting('t.c11', true)::uuid;
  if cli.clases_restantes is not null then
    raise exception 'V11b FAIL: clases_restantes = % (expected NULL — the ilimitado marker survives the clawback)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 35 then
    raise exception 'V11b FAIL: vence = % (expected current_date + 35 — 50 minus the sale''s 15 vigencia_dias)', cli.vence;
  end if;
end $$;

-- ══ GRANT LAYER — raw DML from the client role: DELETE refused, folio/fecha refused, monto allowed ══
set local role authenticated;
do $$
declare
  n_del int;
begin
  -- (a) DELETE is revoked outright, so the RPC is the only door to a delete — refused at the GRANT
  -- layer, before RLS is consulted. A raw PostgREST delete would otherwise skip window + clawback.
  n_del := -1;
  begin
    delete from public.ventas where id = current_setting('t.v_grant', true)::uuid;
    get diagnostics n_del = row_count;
    raise exception 'GRANT FAIL: authenticated DELETE on public.ventas was permitted (% row(s)) — eliminar_venta is no longer the only door', n_del;
  exception when insufficient_privilege then null;
  end;

  -- (b) UPDATE is column-scoped to (monto, metodo): folio is outside the grant, so this is refused
  -- the same way — a raw PATCH cannot re-folio a sale or move it between gyms.
  begin
    update public.ventas set folio = 999999 where id = current_setting('t.v_grant', true)::uuid;
    raise exception 'GRANT FAIL: authenticated UPDATE of ventas.folio was permitted — the column grant has been widened past (monto, metodo)';
  exception when insufficient_privilege then null;
  end;

  -- (c) `fecha` is outside the grant AGAIN. 20260814120000 added `grant update (fecha)` because the
  -- then-INVOKER editar_venta needed it; 20260815120000 revoked it, because under ruling 1 the sold
  -- date re-derives the saldo — so a raw PATCH of `fecha` would leave the stored balance describing a
  -- vigencia that started on a different day. The RPC is DEFINER now and does not need the grant.
  begin
    update public.ventas set fecha = now() - interval '1 day' where id = current_setting('t.v_grant', true)::uuid;
    raise exception 'GRANT FAIL: authenticated UPDATE of ventas.fecha was permitted — the fecha column grant is back, and a raw PATCH can desync the sold date from the saldo it re-derives';
  exception when insufficient_privilege then null;
  end;

  -- (d) …and monto IS granted, on the caller's own gym row: this must SUCCEED. That is the accepted
  -- residual (a raw PATCH can still restate an amount, gym-scoped, under the gym's-data ruling), and
  -- asserting it is what stops the column grant or ventas_staff_update from silently disappearing.
  update public.ventas set monto = 4321 where id = current_setting('t.v_grant', true)::uuid;
end $$;
reset role;
do $$
declare
  rec record;
begin
  select * into rec from public.ventas where id = current_setting('t.v_grant', true)::uuid;
  if rec.id is null then
    raise exception 'GRANT FAIL: the probe venta is gone — the refused DELETE took effect after all';
  end if;
  if rec.monto is distinct from 4321 then
    raise exception 'GRANT FAIL: monto = % (expected 4321 — the granted column UPDATE must actually land, proving grant + ventas_staff_update both hold)', rec.monto;
  end if;
  if rec.folio is distinct from 7110 then
    raise exception 'GRANT FAIL: folio = % (expected 7110 — the refused UPDATE must not have written it)', rec.folio;
  end if;
  if rec.fecha is distinct from current_setting('t.v_grant_fecha', true)::timestamptz then
    raise exception 'GRANT FAIL: fecha = % (expected the seeded instant — the refused UPDATE must not have written it)', rec.fecha;
  end if;
end $$;

select 'eliminar_venta rules: OK' as result;
rollback;
