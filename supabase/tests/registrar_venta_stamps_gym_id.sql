-- registrar_venta gym_id-stamping test (slice #20; ADR-0005/0008).
--
-- The money-path RPC has no affirmative rule-test home (rls_cross_tenant_denial only proves it DENIES
-- cross-tenant). Slice #20 makes it stamp gym_id so every new cliente + venta is born scoped. Proven
-- here against the REAL deployed function, in a rolled-back transaction:
--   (1) new-cliente path — the minted cliente AND its venta both carry the operator's gym (Forge);
--   (2) existing-cliente path — a second venta INHERITS the cliente's gym_id (venta.gym_id = cliente.gym_id).
--
-- Post-C13 (2026-07-10): registrar_venta re-derives from the paquete row, so the sale sends ONLY
-- identity + p_paquete_id + p_metodo + p_idempotency_key. A transaction-local forge paquete is seeded
-- (connecting role, rolled back) and its id is the sole package input. gym-stamping is unchanged.
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN (no local Docker): via the Supabase MCP execute_sql, or
--   psql "$DATABASE_URL" -f supabase/tests/registrar_venta_stamps_gym_id.sql

begin;

-- Resolve the operator at runtime (the only env-dependent value): the forge gym's owner/operator
-- gym_membership row carries a real auth.users id (perfil.user_id was dropped by Contract-B,
-- 20260705082018). staff_gym() resolves the caller's gym from this same (user_id, role in
-- ('owner','operator')) predicate, so the session is staff of forge and RLS scopes clientes/ventas to it.
select set_config(
  'app.op',
  (select user_id::text from public.gym_membership
     where gym_id = (select id from public.gym where slug = 'forge')
       and role in ('owner', 'operator')
     order by created_at
     limit 1),
  true
);

-- Seed a transaction-local paquete in forge (connecting role → RLS bypassed). Its id is the sale's only
-- package input now (C13); rolled back with everything else.
do $$
declare v_paq uuid;
begin
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values ((select id from public.gym where slug = 'forge'), 'STAMP SUITE 8 clases', 8, 'dias', 20, 750)
    returning id into v_paq;
  perform set_config('t.paq', v_paq::text, true);
end $$;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_gym    uuid := (select id from public.gym where slug = 'forge');  -- the operator's gym
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

select 'registrar_venta gym_id stamping: OK' as result;
rollback;
