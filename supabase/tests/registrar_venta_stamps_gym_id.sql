-- registrar_venta gym_id-stamping test (slice #20; ADR-0005/0008).
--
-- The money-path RPC has no affirmative rule-test home (rls_cross_tenant_denial only proves it DENIES
-- cross-tenant). Slice #20 makes it stamp gym_id so every new cliente + venta is born scoped. Proven
-- here against the REAL deployed function, in a rolled-back transaction:
--   (1) new-cliente path — the minted cliente AND its venta both carry the operator's gym (Forge);
--   (2) existing-cliente path — a second venta INHERITS the cliente's gym_id (venta.gym_id = cliente.gym_id).
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN (no local Docker): via the Supabase MCP execute_sql, or
--   psql "$DATABASE_URL" -f supabase/tests/registrar_venta_stamps_gym_id.sql

begin;

-- Resolve the operator at runtime (the only env-dependent value): perfil.user_id is a real auth.users
-- id; registrar_venta keys writes to auth.uid() and RLS scopes clientes/ventas to it.
select set_config(
  'app.op',
  (select user_id::text from public.perfil order by created_at limit 1),
  true
);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_gym    uuid := (select id from public.gym where slug = 'forge');  -- the operator's gym
  v_today  date := (now() at time zone 'America/Chihuahua')::date;
  v_cli    uuid;
  v_folio  bigint;
  v_cli_gym  uuid;
  v_venta_gym uuid;
begin
  -- ── (1) New-cliente path: cliente + venta both born scoped ──
  select cliente_id, folio into v_cli, v_folio
    from public.registrar_venta(
      p_nombre := 'TEST venta gym', p_tel := '0000000007', p_paquete_nombre := '8 clases',
      p_vigencia_tipo := 'dias', p_monto := 750, p_metodo := 'efectivo',
      p_clases_restantes := 8, p_vence := v_today + 20, p_clases := 8, p_vigencia_dias := 20);

  select gym_id into v_cli_gym   from public.clientes where id = v_cli;
  if v_cli_gym is distinct from v_gym then raise exception 'STAMP FAIL(1): new cliente.gym_id % expected %', v_cli_gym, v_gym; end if;
  select gym_id into v_venta_gym from public.ventas where folio = v_folio;
  if v_venta_gym is distinct from v_gym then raise exception 'STAMP FAIL(1): venta.gym_id % expected %', v_venta_gym, v_gym; end if;

  -- ── (2) Existing-cliente path: the second venta inherits the cliente's gym_id ──
  select folio into v_folio
    from public.registrar_venta(
      p_nombre := 'ignored', p_tel := 'ignored', p_paquete_nombre := '8 clases',
      p_vigencia_tipo := 'dias', p_monto := 750, p_metodo := 'efectivo',
      p_cliente_id := v_cli, p_clases_restantes := 16, p_vence := v_today + 40);
  select gym_id into v_venta_gym from public.ventas where folio = v_folio;
  if v_venta_gym is distinct from v_cli_gym then raise exception 'STAMP FAIL(2): venta.gym_id % expected cliente gym %', v_venta_gym, v_cli_gym; end if;

  raise notice 'registrar_venta stamps gym_id: (1) new cliente+venta scoped, (2) venta inherits cliente gym';
end $$;

select 'registrar_venta gym_id stamping: OK' as result;
rollback;
