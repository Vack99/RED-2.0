-- Two-gym folio-independence suite (slice #24; ADR-0005/0008/0013). WRITTEN FIRST (TDD).
--
-- Proves the per-gym folio counter: receipt folios sequence INDEPENDENTLY per gym, each seeded from
-- that gym's OWN max(folio), and existing folios are never renumbered. Under the old global
-- `venta_folio_seq` two gyms could NEVER share a folio and a fresh gym could never start below the
-- global high-water mark — so the assertions below are impossible under the pre-#24 mechanism and are
-- exactly what the counter must satisfy.
--
-- Drives the REAL deployed registrar_venta (existing-cliente path → the venta inherits the cliente's
-- gym, so folio draws from that gym's counter). Zero prod UUIDs; fixtures are transaction-local
-- (BEGIN/ROLLBACK) so the preview branch is reusable and the live counters are never mutated.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs`, or ad hoc against any
-- branch that carries the #24 migration via the Supabase MCP execute_sql.

begin;

-- ── Fixtures (connecting role, RLS bypassed) ─────────────────────────────────
-- gym_x carries ONE pre-existing venta at folio 1050 (proves "seed from own max" + "existing unchanged").
-- gym_y is fresh (no ventas → seeds from 1000 → first folio 1001). Each gym has one operator who owns
-- one cliente there, so registrar_venta's existing-cliente UPDATE is visible under RLS.
do $$
declare
  gym_x   uuid := gen_random_uuid();
  gym_y   uuid := gen_random_uuid();
  op_x    uuid := gen_random_uuid();
  op_y    uuid := gen_random_uuid();
  cli_x   uuid;
  cli_y   uuid;
  paq_x   uuid;
  paq_y   uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_x, 'folio-gym-x', 'Folio Gym X', 'America/Chihuahua',  'forge'),
    (gym_y, 'folio-gym-y', 'Folio Gym Y', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_x, 'authenticated', 'authenticated', 'folio-op-x@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_y, 'authenticated', 'authenticated', 'folio-op-y@test.local');

  -- Each operator is staff of their own gym via gym_membership — the gym-scoped policies
  -- (is_staff_of) are what grant registrar_venta's existing-cliente UPDATE post-cutover; the
  -- pre-cutover fixture rode the legacy per-`auth.uid()` policies instead (stale, fixed 2026-07-05).
  insert into public.gym_membership (user_id, gym_id, role) values
    (op_x, gym_x, 'operator'),
    (op_y, gym_y, 'operator');

  insert into public.clientes (gym_id, nombre, tel, clases_restantes)
    values (gym_x, 'Cliente X', '6140000001', 5) returning id into cli_x;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes)
    values (gym_y, 'Cliente Y', '6140000002', 5) returning id into cli_y;

  -- One paquete per gym: the sole package input to each sale now (C13). The folio assertions are
  -- independent of price/saldo, so any valid finite pack serves.
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_x, '8 clases', 8, 'dias', 20, 750) returning id into paq_x;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_y, '8 clases', 8, 'dias', 20, 750) returning id into paq_y;

  -- gym_x's pre-existing folio 1050 (the high-water mark the counter must continue from, untouched).
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
    values (gym_x, cli_x, 1050, '8 clases', 8, 'dias', 20, 750, 'efectivo');

  perform set_config('t.op_x',  op_x::text,  true);
  perform set_config('t.op_y',  op_y::text,  true);
  perform set_config('t.cli_x', cli_x::text, true);
  perform set_config('t.cli_y', cli_y::text, true);
  perform set_config('t.gym_x', gym_x::text, true);
  perform set_config('t.gym_y', gym_y::text, true);
  perform set_config('t.paq_x', paq_x::text, true);
  perform set_config('t.paq_y', paq_y::text, true);
end $$;

-- ── gym_x: two sales continue from its own max (1050) → 1051, 1052 ────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_x', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  cli_x  uuid := current_setting('t.cli_x', true)::uuid;
  paq_x  uuid := current_setting('t.paq_x', true)::uuid;
  f1 bigint; f2 bigint;
begin
  select folio into f1 from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := paq_x, p_idempotency_key := gen_random_uuid(), p_cliente_id := cli_x);
  if f1 <> 1051 then raise exception 'FOLIO FAIL: gym_x first sale folio % expected 1051 (seed from own max 1050)', f1; end if;

  select folio into f2 from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := paq_x, p_idempotency_key := gen_random_uuid(), p_cliente_id := cli_x);
  if f2 <> 1052 then raise exception 'FOLIO FAIL: gym_x second sale folio % expected 1052', f2; end if;
end $$;
reset role;

-- ── gym_y: fresh gym sequences from 1001 — independent of gym_x's 105x ────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_y', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  cli_y  uuid := current_setting('t.cli_y', true)::uuid;
  paq_y  uuid := current_setting('t.paq_y', true)::uuid;
  g1 bigint; g2 bigint;
begin
  select folio into g1 from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := paq_y, p_idempotency_key := gen_random_uuid(), p_cliente_id := cli_y);
  if g1 <> 1001 then raise exception 'FOLIO FAIL: gym_y first sale folio % expected 1001 (fresh gym, independent sequence)', g1; end if;

  select folio into g2 from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := paq_y, p_idempotency_key := gen_random_uuid(), p_cliente_id := cli_y);
  if g2 <> 1002 then raise exception 'FOLIO FAIL: gym_y second sale folio % expected 1002', g2; end if;
end $$;
reset role;

-- ── Cross-gym invariants (connecting role): independence + existing folio unchanged ──
do $$
declare
  gym_x uuid := current_setting('t.gym_x', true)::uuid;
  gym_y uuid := current_setting('t.gym_y', true)::uuid;
  x_folios bigint[];
  y_folios bigint[];
  v_monto int;
begin
  select array_agg(folio order by folio) into x_folios from public.ventas where gym_id = gym_x;
  select array_agg(folio order by folio) into y_folios from public.ventas where gym_id = gym_y;
  if x_folios <> array[1050,1051,1052]::bigint[] then raise exception 'FOLIO FAIL: gym_x folios % expected {1050,1051,1052}', x_folios; end if;
  if y_folios <> array[1001,1002]::bigint[] then raise exception 'FOLIO FAIL: gym_y folios % expected {1001,1002}', y_folios; end if;

  -- Independence: gym_y reused 1001/1002 while gym_x sits at 105x — impossible under one global sequence.
  -- The existing folio 1050 row is untouched (its monto is still the seeded 750).
  select monto into v_monto from public.ventas where gym_id = gym_x and folio = 1050;
  if v_monto <> 750 then raise exception 'FOLIO FAIL: pre-existing folio 1050 row mutated (monto %)', v_monto; end if;

  raise notice 'per-gym folio: gym_x %, gym_y % — independent sequences, existing folio 1050 unchanged', x_folios, y_folios;
end $$;

select 'per-gym folio independence: OK' as result;
rollback;
