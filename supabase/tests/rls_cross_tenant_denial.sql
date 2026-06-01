-- Cross-tenant RLS denial test (audit MEDIUM item).
--
-- Proves Row-Level Security denies a DIFFERENT authenticated user (B) every path to operator A's
-- data: read, direct write, and both money-path RPCs. RLS is the primary security boundary
-- (ADR-0001); the SECURITY INVOKER RPCs (ADR-0005) inherit it, so a cross-tenant call must surface
-- as "no rows" / a raised exception, never a leak or a write.
--
-- Self-asserting: every check RAISEs on failure, so a clean run returns one 'OK' row and any failure
-- aborts with a 'DENIAL FAIL' message. Wrapped in BEGIN/ROLLBACK — touches no row.
--
-- HOW TO RUN (no local Docker here, so not wired into `supabase test db` / pgTAP):
--   - via the Supabase MCP execute_sql (pure SQL — no psql meta-commands), or
--   - psql "$DATABASE_URL" -f supabase/tests/rls_cross_tenant_denial.sql
--
-- PORTING TO ANOTHER ENV: replace the two literals in the `_cfg` block below — a real operator (A)
-- and one of A's clientes. B is any other uuid; RLS keys on the JWT `sub`, so B need not be a real
-- auth user to prove denial. (Forge is single-operator, so "cross-tenant" is a forward guard for a
-- second operator and a proof the RPCs don't leak across auth.uid().)

begin;

-- ── Fixtures (the only env-specific values) ──────────────────────────────────
-- Defaults match the seeded operator on project hjppxawglmukfvsgmcog as of 2026-06-01.
select
  set_config('app.a_client', 'fb9c585b-3cbe-4d5c-85b6-27dff2273324', true),  -- one of operator A's clientes
  set_config('app.b_user',   '11111111-1111-1111-1111-111111111111', true);  -- B: any non-owner uuid

-- ── Act as user B ────────────────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.b_user', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  a_client uuid := current_setting('app.a_client', true)::uuid;
  v_today  date := (now() at time zone 'America/Chihuahua')::date;
  n int;
  got_error boolean;
begin
  -- 1) SELECT: B sees none of A's clientes / ventas / asistencias
  select count(*) into n from public.clientes;
  if n <> 0 then raise exception 'DENIAL FAIL: B sees % clientes (expected 0)', n; end if;
  select count(*) into n from public.ventas;
  if n <> 0 then raise exception 'DENIAL FAIL: B sees % ventas', n; end if;
  select count(*) into n from public.asistencias;
  if n <> 0 then raise exception 'DENIAL FAIL: B sees % asistencias', n; end if;

  -- 2) UPDATE: B's update of A's client affects 0 rows (RLS USING hides it)
  update public.clientes set clases_restantes = 9999 where id = a_client;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: B updated % of A''s client rows', n; end if;

  -- 3) RPC registrar_venta on A's client -> RLS hides the UPDATE -> raises 'Cliente no encontrado'
  got_error := false;
  begin
    perform * from public.registrar_venta(
      p_nombre := 'x', p_tel := 'x', p_paquete_nombre := '8 clases', p_vigencia_tipo := 'dias',
      p_monto := 750, p_metodo := 'efectivo', p_cliente_id := a_client, p_clases_restantes := 5,
      p_vence := v_today + 20, p_clases := 8, p_vigencia_dias := 20);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'DENIAL FAIL: registrar_venta did not deny B on A''s client'; end if;

  -- 4) RPC toggle_pase on A's client -> RLS hides the SELECT -> raises 'Cliente no encontrado'
  got_error := false;
  begin
    perform * from public.toggle_pase(a_client, v_today);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'DENIAL FAIL: toggle_pase did not deny B on A''s client'; end if;

  raise notice 'RLS cross-tenant denial: all vectors denied for user B';
end $$;

select 'rls cross-tenant denial: OK' as result;
rollback;
