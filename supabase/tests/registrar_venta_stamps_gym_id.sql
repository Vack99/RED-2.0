-- registrar_venta gym_id-stamping test (slice #20; ADR-0005/0008).
--
-- The money-path RPC has no affirmative rule-test home (rls_cross_tenant_denial only proves it DENIES
-- cross-tenant). Slice #20 makes it stamp gym_id so every new cliente + venta is born scoped. Proven
-- here against the REAL deployed function, in a rolled-back transaction:
--   (1) new-cliente path — the minted cliente AND its venta both carry the operator's gym;
--   (2) existing-cliente path — a second venta INHERITS the cliente's gym_id (venta.gym_id = cliente.gym_id).
--
-- Post-C13 (2026-07-10): registrar_venta re-derives from the paquete row, so the sale sends ONLY
-- identity + p_paquete_id + p_metodo + p_idempotency_key. Fixtures are fully transaction-local
-- (synthetic gym + operator + paquete, zero prod UUIDs — the registrar_venta_stacking pattern): the old
-- preamble resolved the operator from a live forge gym_membership row, which does not exist on a fresh
-- scratch project (empty sub → 22P02 in staff_gym()). gym-stamping semantics are unchanged.
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN: via `node supabase/tests/run-denial-suite.mjs`, or ad hoc via the Supabase MCP execute_sql.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_s   uuid := gen_random_uuid();
  op_user uuid := gen_random_uuid();
  v_paq   uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_s, 'venta-stamp-suite-gym', 'Venta Stamp Suite', 'America/Chihuahua', 'forge');
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', op_user, 'authenticated', 'authenticated', 'op@venta-stamp.local', now(), '{}');
  -- staff_gym() resolves the caller's gym from this (user_id, role in ('owner','operator')) row.
  insert into public.gym_membership (user_id, gym_id, role) values (op_user, gym_s, 'operator');
  -- The sale's only package input (C13): the RPC re-derives price/saldo/vence from this row.
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_s, 'STAMP SUITE 8 clases', 8, 'dias', 20, 750)
    returning id into v_paq;
  perform set_config('t.gym', gym_s::text,   true);
  perform set_config('t.op',  op_user::text, true);
  perform set_config('t.paq', v_paq::text,   true);
end $$;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_gym    uuid := current_setting('t.gym', true)::uuid;  -- the operator's gym
  v_paq    uuid := current_setting('t.paq', true)::uuid;
  v_cli    uuid;
  v_folio  bigint;
  v_cli_gym  uuid;
  v_venta_gym uuid;
begin
  -- ── (1) New-cliente path: cliente + venta both born scoped ──
  select cliente_id, folio into v_cli, v_folio
    from public.registrar_venta(
      p_metodo := 'efectivo', p_paquete_id := v_paq, p_idempotency_key := gen_random_uuid(),
      p_nombre := 'TEST venta gym', p_tel := '0000000007');

  select gym_id into v_cli_gym   from public.clientes where id = v_cli;
  if v_cli_gym is distinct from v_gym then raise exception 'STAMP FAIL(1): new cliente.gym_id % expected %', v_cli_gym, v_gym; end if;
  -- folio is unique per-gym since #24 (not globally), so look it up scoped by the venta's gym.
  select gym_id into v_venta_gym from public.ventas where gym_id = v_gym and folio = v_folio;
  if v_venta_gym is distinct from v_gym then raise exception 'STAMP FAIL(1): venta.gym_id % expected %', v_venta_gym, v_gym; end if;

  -- ── (2) Existing-cliente path: the second venta inherits the cliente's gym_id ──
  select folio into v_folio
    from public.registrar_venta(
      p_metodo := 'efectivo', p_paquete_id := v_paq, p_idempotency_key := gen_random_uuid(),
      p_cliente_id := v_cli);
  select gym_id into v_venta_gym from public.ventas where gym_id = v_cli_gym and folio = v_folio;
  if v_venta_gym is distinct from v_cli_gym then raise exception 'STAMP FAIL(2): venta.gym_id % expected cliente gym %', v_venta_gym, v_cli_gym; end if;

  raise notice 'registrar_venta stamps gym_id: (1) new cliente+venta scoped, (2) venta inherits cliente gym';
end $$;

reset role;

select 'registrar_venta gym_id stamping: OK' as result;
rollback;
