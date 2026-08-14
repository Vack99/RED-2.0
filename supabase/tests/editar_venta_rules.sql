-- editar_venta written-row suite — issue #269 (payment correction from the ficha; map #265, rulings
-- #266/#267).
--
-- editar_venta(p_venta_id, p_monto, p_metodo) is the ONLY door for correcting a registered sale's
-- amount or payment method. Its contract is a WRITE contract, so every vector below re-SELECTs the
-- ventas row after the call and asserts the PERSISTED columns — never the return value (AGENTS.md,
-- "an RPC's return value is not its contract; the rows it writes are" — #78/#80).
--
-- Vectors:
--   V1 — staff of the venta's own gym edits monto + metodo: BOTH persist, and NOTHING else on the row
--        moves. folio, clases, vigencia_tipo/vigencia_dias, fecha, created_at, gym_id, paquete_nombre,
--        cliente_id and personalizado are each asserted by name, and then a whole-row jsonb diff
--        (every column MINUS monto/metodo) proves it a second way — so a column added to `ventas`
--        after this suite was written cannot start moving unnoticed. The cliente's stored running
--        balance (clases_restantes/vence/paquete_nombre — ADR-0004) is untouched: an edit is a
--        correction of the record, not a re-sale, so it must never touch the saldo. The fixture sale
--        is deliberately ~90 days old: edits carry NO window (ruling #266.3 — only destruction is
--        windowed), so age must not refuse the write.
--   V2 — an invalid metodo raises 'Método inválido' (the in-body domain re-assertion registrar_venta
--        already carries, so the desk sees a human message instead of a raw 23514) and the row is left
--        exactly as V1 wrote it. 'pendiente' is the probe on purpose: it was legal until
--        20260710120000 dropped it from ventas_metodo_check (ruling C2), so it is precisely the value
--        a stale client would send.
--   V3 — CROSS-TENANT: staff of gym B calling on gym A's venta raises 'Venta no encontrada' — a
--        REFUSAL, not a silent no-op (the #219/retire_recurring_schedule shape) — and gym A's row is
--        unchanged. The message is the same one a non-existent id gets, so the refusal leaks nothing.
--   V3b — THE MONTO FLOOR: monto 0 raises 'Monto inválido' and writes nothing. `ventas.monto` has NO
--        table CHECK, so unlike metodo there is no constraint underneath to catch a bad value — the
--        `>= 1` floor exists ONLY inside this RPC. The Zod schema sits on the far side of the trust
--        boundary and binds no direct caller, which is exactly why the floor is asserted here against
--        the DB rather than only in vitest. The bound is one-sided by design: there is no ceiling,
--        because a sale's monto can come from an unbounded `paquetes.precio` and a cap would make an
--        already-registered high-value sale permanently uncorrectable.
--
-- Fixtures are 100% transaction-local (fresh gen_random_uuid gym/auth.users/gym_membership/cliente/
-- venta rows, zero prod UUIDs — a live-gym lookup 22P02s in staff_gym() on a fresh scratch project),
-- and EVERY fixture write happens as postgres BEFORE the first `set local role authenticated`, which
-- silently no-ops writes that need postgres. Assertions likewise run after `reset role`, so they read
-- ground truth rather than an RLS-filtered view (V3 asserts on a row its caller cannot even select).
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
  gym_a     uuid := gen_random_uuid();
  gym_b     uuid := gen_random_uuid();
  op_a      uuid := gen_random_uuid();
  op_b      uuid := gen_random_uuid();
  cli_a     uuid;
  v_venta   uuid;
  v_fecha   timestamptz := now() - interval '92 days';  -- backdated sold date
  v_created timestamptz := now() - interval '90 days';  -- registered later, and far outside the 30d delete window
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'editar-venta-suite-gym-a', 'Editar Venta Suite A', 'America/Chihuahua', 'forge'),
    (gym_b, 'editar-venta-suite-gym-b', 'Editar Venta Suite B', 'America/Chihuahua', 'forge');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_a, 'authenticated', 'authenticated', 'op-a@editar-venta-suite.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', op_b, 'authenticated', 'authenticated', 'op-b@editar-venta-suite.local', now(), '{}');

  -- staff_gym() resolves the caller's gym from this (user_id, role in ('owner','operator')) row.
  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_b, gym_b, 'operator');

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EV Cliente', '0000000010', 10, current_date + 40, '8 clases', gym_a)
    returning id into cli_a;

  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, cli_a, 7001, '8 clases', 8, 'dias', 20, 750, 'efectivo', v_fecha, v_created)
    returning id into v_venta;

  perform set_config('t.gym_a',   gym_a::text,     true);
  perform set_config('t.gym_b',   gym_b::text,     true);
  perform set_config('t.op_a',    op_a::text,      true);
  perform set_config('t.op_b',    op_b::text,      true);
  perform set_config('t.cli_a',   cli_a::text,     true);
  perform set_config('t.venta',   v_venta::text,   true);
  perform set_config('t.fecha',   v_fecha::text,   true);
  perform set_config('t.created', v_created::text, true);
  -- Whole-row snapshot MINUS the two editable columns. V1 re-computes it after the call and demands
  -- jsonb equality: a column this suite never names by hand still cannot move unnoticed.
  perform set_config('t.venta_rest',
    (select (to_jsonb(v.*) - 'monto' - 'metodo')::text from public.ventas v where v.id = v_venta), true);
end $$;

-- ══ V1 — staff edits monto + metodo: both persist, nothing else on the row (or on the cliente) moves ══
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.venta', true)::uuid, 900, 'transferencia');
end $$;
reset role;
do $$
declare
  rec       record;
  cli       record;
  v_rest    jsonb := current_setting('t.venta_rest', true)::jsonb;
  v_after   jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.venta', true)::uuid;
  if rec.id is null then raise exception 'V1 FAIL: the venta row vanished — an edit must not delete it'; end if;

  -- the two editable columns
  if rec.monto is distinct from 900 then
    raise exception 'V1 FAIL: monto = % (expected 900 — the corrected amount must persist)', rec.monto;
  end if;
  if rec.metodo is distinct from 'transferencia' then
    raise exception 'V1 FAIL: metodo = % (expected transferencia — the corrected method must persist)', rec.metodo;
  end if;

  -- every other column, by name
  if rec.folio is distinct from 7001 then
    raise exception 'V1 FAIL: folio = % (expected 7001 — an edit never re-folios the sale)', rec.folio;
  end if;
  if rec.clases is distinct from 8 then
    raise exception 'V1 FAIL: clases = % (expected 8 — an edit never re-grants classes)', rec.clases;
  end if;
  if rec.vigencia_tipo is distinct from 'dias' then
    raise exception 'V1 FAIL: vigencia_tipo = % (expected dias)', rec.vigencia_tipo;
  end if;
  if rec.vigencia_dias is distinct from 20 then
    raise exception 'V1 FAIL: vigencia_dias = % (expected 20)', rec.vigencia_dias;
  end if;
  if rec.fecha is distinct from current_setting('t.fecha', true)::timestamptz then
    raise exception 'V1 FAIL: fecha = % (expected the backdated sold date, unchanged — fecha edit is deferred, #266)', rec.fecha;
  end if;
  if rec.created_at is distinct from current_setting('t.created', true)::timestamptz then
    raise exception 'V1 FAIL: created_at = % (expected unchanged — created_at is the delete window anchor and must never be touched by an edit)', rec.created_at;
  end if;
  if rec.gym_id is distinct from current_setting('t.gym_a', true)::uuid then
    raise exception 'V1 FAIL: gym_id = % (expected gym A — the tenant stamp must survive an edit)', rec.gym_id;
  end if;
  if rec.paquete_nombre is distinct from '8 clases' then
    raise exception 'V1 FAIL: paquete_nombre = % (expected 8 clases — wrong paquete is fixed by delete + re-sell, not by edit)', rec.paquete_nombre;
  end if;
  if rec.cliente_id is distinct from current_setting('t.cli_a', true)::uuid then
    raise exception 'V1 FAIL: cliente_id = % (expected the fixture cliente — an edit never re-assigns the sale)', rec.cliente_id;
  end if;
  if rec.personalizado is distinct from false then
    raise exception 'V1 FAIL: personalizado = % (expected false)', rec.personalizado;
  end if;

  -- and the catch-all: every column except monto/metodo, byte-for-byte
  select to_jsonb(v.*) - 'monto' - 'metodo' into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'V1 FAIL: a column other than monto/metodo changed. before = % / after = %', v_rest, v_after;
  end if;

  -- the stored running balance is NOT the edit's business (ADR-0004)
  select * into cli from public.clientes where id = current_setting('t.cli_a', true)::uuid;
  if cli.clases_restantes is distinct from 10 then
    raise exception 'V1 FAIL: cliente clases_restantes = % (expected 10 — an edit is not a re-sale and must not touch the saldo)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 40 then
    raise exception 'V1 FAIL: cliente vence = % (expected current_date + 40 — untouched)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from '8 clases' then
    raise exception 'V1 FAIL: cliente paquete_nombre = % (expected 8 clases — untouched)', cli.paquete_nombre;
  end if;
end $$;

-- ══ V2 — an invalid metodo is REFUSED with a human message, and the row is left exactly as V1 wrote it ══
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.venta', true)::uuid, 1234, 'pendiente');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Método inválido' then
    raise exception 'V2 FAIL: got % (expected Método inválido — the in-body domain re-assertion, not a raw CHECK violation and not a success)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  rec    record;
  v_rest jsonb := current_setting('t.venta_rest', true)::jsonb;
  v_after jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.venta', true)::uuid;
  if rec.monto is distinct from 900 then
    raise exception 'V2 FAIL: monto = % (expected 900 — the refused call must not have written the new amount)', rec.monto;
  end if;
  if rec.metodo is distinct from 'transferencia' then
    raise exception 'V2 FAIL: metodo = % (expected transferencia — unchanged by the refused call)', rec.metodo;
  end if;
  select to_jsonb(v.*) - 'monto' - 'metodo' into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'V2 FAIL: the refused call still moved another column. before = % / after = %', v_rest, v_after;
  end if;
end $$;

-- ══ V3 — CROSS-TENANT: gym B staff editing gym A's venta is REFUSED, and the row is untouched ═══════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.venta', true)::uuid, 1, 'efectivo');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Venta no encontrada' then
    raise exception 'V3 FAIL: gym B staff got % (expected Venta no encontrada — a refusal, not a silent no-op, and the same message a non-existent id gets)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  rec     record;
  v_rest  jsonb := current_setting('t.venta_rest', true)::jsonb;
  v_after jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.venta', true)::uuid;
  if rec.monto is distinct from 900 then
    raise exception 'V3 FAIL: monto = % (expected 900 — a cross-tenant caller wrote gym A''s sale)', rec.monto;
  end if;
  if rec.metodo is distinct from 'transferencia' then
    raise exception 'V3 FAIL: metodo = % (expected transferencia — a cross-tenant caller wrote gym A''s sale)', rec.metodo;
  end if;
  select to_jsonb(v.*) - 'monto' - 'metodo' into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'V3 FAIL: the cross-tenant call moved another column. before = % / after = %', v_rest, v_after;
  end if;
end $$;

-- ══ V3b — THE MONTO BOUND: an out-of-range monto is REFUSED in-body, and the row is untouched ═══════
-- Back to gym A's own staff on purpose: the caller is fully entitled, so the ONLY thing that can
-- refuse this call is the bound itself.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.venta', true)::uuid, 0, 'efectivo');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Monto inválido' then
    raise exception 'V3b FAIL: got % (expected Monto inválido — the in-body bound, the only one there is: ventas.monto has no CHECK)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  rec     record;
  v_rest  jsonb := current_setting('t.venta_rest', true)::jsonb;
  v_after jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.venta', true)::uuid;
  if rec.monto is distinct from 900 then
    raise exception 'V3b FAIL: monto = % (expected 900 — a refused call must not have written the out-of-bounds amount)', rec.monto;
  end if;
  if rec.metodo is distinct from 'transferencia' then
    raise exception 'V3b FAIL: metodo = % (expected transferencia — unchanged by the refused call)', rec.metodo;
  end if;
  select to_jsonb(v.*) - 'monto' - 'metodo' into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'V3b FAIL: the refused call still moved another column. before = % / after = %', v_rest, v_after;
  end if;
end $$;

select 'editar_venta rules: OK' as result;
rollback;
