-- editar_venta written-row suite — issue #269 (payment correction from the ficha; map #265, rulings
-- #266/#267).
--
-- editar_venta(p_venta_id, p_monto, p_metodo, p_fecha default null) is the ONLY door for correcting a
-- registered sale's amount, payment method or sold date. Its contract is a WRITE contract, so every
-- vector below re-SELECTs the ventas row after the call and asserts the PERSISTED columns — never the
-- return value (AGENTS.md, "an RPC's return value is not its contract; the rows it writes are" —
-- #78/#80). The V-vectors call the 3 positional args and so double as proof that omitting p_fecha
-- leaves `fecha` exactly where it was; the VF-vectors exercise the 4th (20260814120000, the #269
-- fast-follow that reversed ruling #266.3).
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
--   VF1 — THE FECHA EDIT: a 4-arg call writes `fecha` = midday GYM-tz on the requested day — the exact
--        instant registrar_venta writes for a backdated sale, so the sold DAY reads the same from any
--        timezone — monto/metodo still persist, every other ventas column is byte-unchanged, and the
--        cliente's saldo (clases_restantes/vence/paquete_nombre) does not move. That last assertion is
--        the semantic, not a detail: the reversal of #266.3 is re-ATTRIBUTION only — the day, and the
--        earnings month it counts in. Re-deriving vence from a moved fecha would be a guess (registrar's
--        stacking is path-dependent and not invertible from `ventas`), which is why delete + re-sell
--        stays the tool when the vigencia itself is wrong.
--   VF2 — a FUTURE fecha raises 'La fecha de inicio no puede ser futura' and writes nothing.
--   VF3 — a fecha 31 days back raises 'La fecha de inicio no puede tener más de 30 días de antigüedad'
--        and writes nothing.
--   VF4 — A PRE-ALTA FECHA IS ACCEPTED, on its own fixture sale: a cliente registered 10 days ago,
--        edited to a fecha 15 days back — inside the 30-day window, but before that client's ROW
--        existed — WRITES. The alta floor that used to refuse this was dropped from both doors by the
--        owner on 2026-08-14 (migration 20260814130000): gyms register walk-ins late, so
--        `clientes.created_at` is a data-entry stamp rather than the day the member arrived, and the
--        floor therefore refused precisely the forgotten sale this door exists to correct. The written
--        instant is VF1's — midday gym-tz — and the cliente's saldo plus every other ventas column
--        stay put, so "accepted" cannot quietly mean "re-derived".
--        VF2/VF3 are registrar_venta's two SURVIVING backdate bounds, word for word: the edit door must
--        not be able to write a fecha the CREATE door would have refused. Each asserts the exact
--        Spanish message the desk shows, so a reworded raise is a failure, not a silent divergence.
--   VF5 — THE INCLUSIVE EDGES: both bounds are strict (`> v_hoy`, `< v_hoy - 30`), so the boundary
--        values themselves — `p_fecha := hoy` and `p_fecha := hoy - 30` — are ACCEPTED, not refused.
--        Each writes its expected midday-gym-tz instant. Pins the edges so a future `>=`/`<=` off-by-one
--        tightening on either bound turns this suite red instead of silently stranding the picker's
--        leftmost enabled day.
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
  cli_n     uuid;
  v_venta   uuid;
  v_venta_n uuid;
  v_fecha   timestamptz := now() - interval '92 days';  -- backdated sold date
  v_created timestamptz := now() - interval '90 days';  -- registered later, and far outside the 30d delete window
  -- A REAL IANA zone, not UTC: every fecha bound and the written instant are computed in the GYM's
  -- timezone, so a UTC fixture would let a gym-tz bug pass unseen. Chihuahua is UTC-6 year-round.
  v_tz      constant text := 'America/Chihuahua';
  v_alta_n  timestamptz := now() - interval '10 days';  -- VF4's cliente: young enough that an in-window fecha predates its alta
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'editar-venta-suite-gym-a', 'Editar Venta Suite A', v_tz, 'forge'),
    (gym_b, 'editar-venta-suite-gym-b', 'Editar Venta Suite B', v_tz, 'forge');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_a, 'authenticated', 'authenticated', 'op-a@editar-venta-suite.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', op_b, 'authenticated', 'authenticated', 'op-b@editar-venta-suite.local', now(), '{}');

  -- staff_gym() resolves the caller's gym from this (user_id, role in ('owner','operator')) row.
  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_b, gym_b, 'operator');

  -- An ordinary long-standing member (alta 120 days back) — the V-vectors and VF1/VF2/VF3/VF5 all
  -- ride this one. VF4 gets its own recent-alta cliente below.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, created_at)
    values ('EV Cliente', '0000000010', 10, current_date + 40, '8 clases', gym_a, now() - interval '120 days')
    returning id into cli_a;

  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, cli_a, 7001, '8 clases', 8, 'dias', 20, 750, 'efectivo', v_fecha, v_created)
    returning id into v_venta;

  -- VF4's own cliente + sale, so the pre-alta acceptance is asserted on a row no other vector touches.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, created_at)
    values ('EV Cliente Nuevo', '0000000011', 4, current_date + 20, '4 clases', gym_a, v_alta_n)
    returning id into cli_n;

  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
    values (gym_a, cli_n, 7002, '4 clases', 4, 'dias', 10, 400, 'efectivo')
    returning id into v_venta_n;

  perform set_config('t.gym_a',   gym_a::text,     true);
  perform set_config('t.gym_b',   gym_b::text,     true);
  perform set_config('t.op_a',    op_a::text,      true);
  perform set_config('t.op_b',    op_b::text,      true);
  perform set_config('t.cli_a',   cli_a::text,     true);
  perform set_config('t.cli_n',   cli_n::text,     true);
  perform set_config('t.venta',   v_venta::text,   true);
  perform set_config('t.venta_n', v_venta_n::text, true);
  perform set_config('t.tz',      v_tz,            true);
  perform set_config('t.fecha',   v_fecha::text,   true);
  perform set_config('t.created', v_created::text, true);
  perform set_config('t.alta_n',  v_alta_n::text,  true);
  -- Whole-row snapshot MINUS the two editable columns. V1 re-computes it after the call and demands
  -- jsonb equality: a column this suite never names by hand still cannot move unnoticed.
  perform set_config('t.venta_rest',
    (select (to_jsonb(v.*) - 'monto' - 'metodo')::text from public.ventas v where v.id = v_venta), true);
  -- VF4's row before its (accepted) edit. The assertion subtracts the three columns the call is
  -- allowed to touch and demands byte-equality on the rest, the same catch-all shape as V1/VF1.
  perform set_config('t.venta_n_all',
    (select to_jsonb(v.*)::text from public.ventas v where v.id = v_venta_n), true);
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
    raise exception 'V1 FAIL: fecha = % (expected the backdated sold date, unchanged — a 3-arg call omits p_fecha, and omitting it must leave the sold date alone; VF1 is the edit)', rec.fecha;
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

-- ══ VF1 — THE FECHA EDIT: the sold date moves (and the earnings month with it), nothing else does ════
-- The caller is still gym A's own staff (V3b restored the claims). `now()` is fixed for the whole
-- transaction, so the day computed here and the one computed in the assertion below are the same day.
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.venta', true)::uuid, 1100, 'efectivo',
                              p_fecha := v_hoy - 5);
end $$;
reset role;
do $$
declare
  rec        record;
  cli        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  -- registrar_venta's written instant, verbatim (functions-canonical/registrar_venta.sql:232-236):
  -- midday in the GYM's timezone on the chosen day. Asserting the instant rather than
  -- `(fecha at time zone tz)::date` is deliberate — the date-cast would also pass for a midnight
  -- write, which is the value that flips day (and month) for a reader an hour to either side.
  v_esperado timestamptz := ((v_hoy - 5)::timestamp + interval '12 hours')
                            at time zone current_setting('t.tz', true);
  v_rest     jsonb := (current_setting('t.venta_rest', true)::jsonb) - 'fecha';
  v_after    jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.venta', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'VF1 FAIL: fecha = % (expected % — midday gym-tz on the requested day, registrar_venta''s write convention)', rec.fecha, v_esperado;
  end if;
  if rec.monto is distinct from 1100 then
    raise exception 'VF1 FAIL: monto = % (expected 1100 — the other two columns still persist on a 4-arg call)', rec.monto;
  end if;
  if rec.metodo is distinct from 'efectivo' then
    raise exception 'VF1 FAIL: metodo = % (expected efectivo — the other two columns still persist on a 4-arg call)', rec.metodo;
  end if;
  if rec.created_at is distinct from current_setting('t.created', true)::timestamptz then
    raise exception 'VF1 FAIL: created_at = % (expected unchanged — moving the SOLD date must not move the REGISTRATION stamp, which is what the 30-day delete window is anchored on)', rec.created_at;
  end if;

  -- the catch-all: every column except the three the call is allowed to touch, byte-for-byte
  select to_jsonb(v.*) - 'monto' - 'metodo' - 'fecha' into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'VF1 FAIL: a column other than monto/metodo/fecha changed. before = % / after = %', v_rest, v_after;
  end if;

  -- THE SEMANTIC: a fecha edit re-attributes the month, it never re-sells. The stored saldo is
  -- untouched by design (a moved fecha is not invertible into a new vence — see the header).
  select * into cli from public.clientes where id = current_setting('t.cli_a', true)::uuid;
  if cli.clases_restantes is distinct from 10 then
    raise exception 'VF1 FAIL: cliente clases_restantes = % (expected 10 — a fecha edit must not re-grant classes)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 40 then
    raise exception 'VF1 FAIL: cliente vence = % (expected current_date + 40 — a fecha edit must not re-stack the vigencia; delete + re-sell is the tool for that)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from '8 clases' then
    raise exception 'VF1 FAIL: cliente paquete_nombre = % (expected 8 clases — untouched)', cli.paquete_nombre;
  end if;

  -- The refusal vectors below demand this exact row back, monto and metodo included.
  select to_jsonb(v.*) into v_after from public.ventas v where v.id = rec.id;
  perform set_config('t.venta_all', v_after::text, true);
end $$;

-- ══ VF2 — a FUTURE fecha is REFUSED with registrar_venta's exact words, and nothing is written ═══════
-- monto/metodo are deliberately VALID in VF2/VF3/VF4, so the fecha bound is the only thing that can
-- refuse the call — and the whole-row compare then also proves the refusal took monto/metodo with it.
set local role authenticated;
do $$
declare
  v_msg text;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.venta', true)::uuid, 1, 'transferencia',
                                p_fecha := v_hoy + 1);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'La fecha de inicio no puede ser futura' then
    raise exception 'VF2 FAIL: got % (expected La fecha de inicio no puede ser futura — registrar_venta''s message, verbatim: the edit door may not write a fecha the create door refuses)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all   jsonb := current_setting('t.venta_all', true)::jsonb;
  v_after jsonb;
begin
  select to_jsonb(v.*) into v_after from public.ventas v where v.id = current_setting('t.venta', true)::uuid;
  if v_after is distinct from v_all then
    raise exception 'VF2 FAIL: the refused call still wrote. before = % / after = %', v_all, v_after;
  end if;
end $$;

-- ══ VF3 — 31 days back is REFUSED: the 30-day floor is registrar's, to the day ═══════════════════════
-- The day is computed in the GYM's timezone, not the session's: v_hoy inside the RPC is a gym-tz date,
-- so a session-tz `current_date - 31` would sit exactly ON the boundary during the hours the two dates
-- disagree — a vector that passes for 18 hours a day is worse than no vector.
set local role authenticated;
do $$
declare
  v_msg text;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.venta', true)::uuid, 1, 'transferencia',
                                p_fecha := v_hoy - 31);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'La fecha de inicio no puede tener más de 30 días de antigüedad' then
    raise exception 'VF3 FAIL: got % (expected La fecha de inicio no puede tener más de 30 días de antigüedad — registrar_venta''s message, verbatim)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all   jsonb := current_setting('t.venta_all', true)::jsonb;
  v_after jsonb;
begin
  select to_jsonb(v.*) into v_after from public.ventas v where v.id = current_setting('t.venta', true)::uuid;
  if v_after is distinct from v_all then
    raise exception 'VF3 FAIL: the refused call still wrote. before = % / after = %', v_all, v_after;
  end if;
end $$;

-- ══ VF4 — A PRE-ALTA FECHA IS ACCEPTED: in-window, but before the client's row existed → WRITES ══════
-- Its cliente was registered 10 days ago and the fecha is 15 days back: comfortably inside the 30-day
-- window, and before that cliente's `created_at`. Until 2026-08-14 the alta floor refused exactly this;
-- the owner dropped it at both doors (20260814130000) because a walk-in is routinely typed into the
-- system days after they first paid, which made the floor strictest on the forgotten sale it was
-- supposed to let the operator fix. `clientes.created_at` is unchanged by the ruling — it is simply no
-- longer read as a floor. monto/metodo are deliberately DIFFERENT from the seeded values (400/efectivo)
-- so a no-op call cannot pass this vector by leaving the row as it found it.
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.venta_n', true)::uuid, 450, 'transferencia',
                              p_fecha := v_hoy - 15);
end $$;
reset role;
do $$
declare
  rec        record;
  cli        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  v_esperado timestamptz := ((v_hoy - 15)::timestamp + interval '12 hours')
                            at time zone current_setting('t.tz', true);
  v_rest     jsonb := (current_setting('t.venta_n_all', true)::jsonb) - 'monto' - 'metodo' - 'fecha';
  v_after    jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.venta_n', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'VF4 FAIL: fecha = % (expected % — a fecha before the cliente''s alta is ACCEPTED since 2026-08-14, written at midday gym-tz like any other)', rec.fecha, v_esperado;
  end if;
  if rec.monto is distinct from 450 then
    raise exception 'VF4 FAIL: monto = % (expected 450 — the accepted pre-alta call must still write monto)', rec.monto;
  end if;
  if rec.metodo is distinct from 'transferencia' then
    raise exception 'VF4 FAIL: metodo = % (expected transferencia — the accepted pre-alta call must still write metodo)', rec.metodo;
  end if;

  -- the catch-all: every column except the three the call may touch, byte-for-byte
  select to_jsonb(v.*) - 'monto' - 'metodo' - 'fecha' into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'VF4 FAIL: a column other than monto/metodo/fecha changed. before = % / after = %', v_rest, v_after;
  end if;

  -- Dropping the floor widened WHICH dates are legal, nothing else: the cliente row — created_at
  -- included — is still none of this call's business.
  select * into cli from public.clientes where id = current_setting('t.cli_n', true)::uuid;
  if cli.created_at is distinct from (current_setting('t.alta_n', true)::timestamptz) then
    raise exception 'VF4 FAIL: cliente created_at = % (expected unchanged — the ruling drops a READ of the alta, it never rewrites it)', cli.created_at;
  end if;
  if cli.clases_restantes is distinct from 4 then
    raise exception 'VF4 FAIL: cliente clases_restantes = % (expected 4 — a fecha edit must not re-grant classes)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from current_date + 20 then
    raise exception 'VF4 FAIL: cliente vence = % (expected current_date + 20 — a fecha edit must not re-stack the vigencia)', cli.vence;
  end if;
  if cli.paquete_nombre is distinct from '4 clases' then
    raise exception 'VF4 FAIL: cliente paquete_nombre = % (expected 4 clases — untouched)', cli.paquete_nombre;
  end if;
end $$;

-- ══ VF5 — THE INCLUSIVE EDGES: p_fecha = hoy and p_fecha = hoy-30 are ACCEPTED, not refused ═══════════
-- registrar_venta's bounds are `> v_hoy` and `< v_hoy - 30` (both strict), so the boundary values
-- themselves are legal — this is the ruling the mirror exists for. Two separate calls, each on the same
-- fixture venta, each asserted to have actually written (a distinct monto/metodo per call rules out a
-- false pass from a stale row).
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.venta', true)::uuid, 1200, 'tarjeta', p_fecha := v_hoy);
end $$;
reset role;
do $$
declare
  rec        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  v_esperado timestamptz := (v_hoy::timestamp + interval '12 hours') at time zone current_setting('t.tz', true);
  v_rest     jsonb := (current_setting('t.venta_rest', true)::jsonb) - 'fecha';
  v_after    jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.venta', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'VF5 FAIL: fecha (hoy) = % (expected % — midday gym-tz TODAY, the upper edge, must be ACCEPTED not refused)', rec.fecha, v_esperado;
  end if;
  if rec.monto is distinct from 1200 then
    raise exception 'VF5 FAIL: monto = % (expected 1200 — the accepted edge call must still write)', rec.monto;
  end if;
  if rec.metodo is distinct from 'tarjeta' then
    raise exception 'VF5 FAIL: metodo = % (expected tarjeta)', rec.metodo;
  end if;
  select to_jsonb(v.*) - 'monto' - 'metodo' - 'fecha' into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'VF5 FAIL: a column other than monto/metodo/fecha changed on the hoy edge. before = % / after = %', v_rest, v_after;
  end if;
end $$;

set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.venta', true)::uuid, 1300, 'transferencia', p_fecha := v_hoy - 30);
end $$;
reset role;
do $$
declare
  rec        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  v_esperado timestamptz := ((v_hoy - 30)::timestamp + interval '12 hours') at time zone current_setting('t.tz', true);
  v_rest     jsonb := (current_setting('t.venta_rest', true)::jsonb) - 'fecha';
  v_after    jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.venta', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'VF5 FAIL: fecha (hoy-30) = % (expected % — midday gym-tz on hoy-30, the lower edge, must be ACCEPTED not refused)', rec.fecha, v_esperado;
  end if;
  if rec.monto is distinct from 1300 then
    raise exception 'VF5 FAIL: monto = % (expected 1300 — the accepted edge call must still write)', rec.monto;
  end if;
  if rec.metodo is distinct from 'transferencia' then
    raise exception 'VF5 FAIL: metodo = % (expected transferencia)', rec.metodo;
  end if;
  select to_jsonb(v.*) - 'monto' - 'metodo' - 'fecha' into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'VF5 FAIL: a column other than monto/metodo/fecha changed on the hoy-30 edge. before = % / after = %', v_rest, v_after;
  end if;
end $$;

select 'editar_venta rules: OK' as result;
rollback;
