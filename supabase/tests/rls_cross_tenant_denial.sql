-- Cross-tenant RLS denial suite (audit finding 6), seeded + repeatable — slice #21.
--
-- Proves Row-Level Security denies a DIFFERENT authenticated user (operator B, of a second gym) every
-- path to gym A's data: read, direct write, and both money-path RPCs. RLS is the primary security
-- boundary (ADR-0001); the SECURITY INVOKER RPCs (ADR-0005) inherit it, so a cross-tenant call must
-- surface as "no rows" / a raised exception, never a leak or a write. Recorded GREEN on the CURRENT
-- per-`auth.uid()` policy set — the "before" baseline the S10 cutover gate re-runs (ADR-0013 §5).
--
-- Zero hardcoded prod UUIDs (audit finding 6, ADR-0013 §5): gym A is looked up by slug from the spine
-- seeds; the synthetic gym #2 (a non-Chihuahua zone, America/Mexico_City) and all three auth users are
-- minted with gen_random_uuid(). Fixtures are transaction-local — seeded inside BEGIN/ROLLBACK and rolled
-- back — so the preview branch is REUSABLE across runs with no reset and accumulates no state. On a
-- preview branch production auth rows do not carry over, so seeding auth.users is safe.
--
-- Diamond-DAG schema tolerance: sibling slice #20 ships clientes/ventas/asistencias.gym_id (NOT NULL)
-- and clientes.auth_user_id in one migration. #20 is applied to the live project — so every preview
-- branch carries it — but it is NOT in this branch's git base (downstream slices merge #20 on top).
-- The fixture block probes for #20's columns ONCE and seeds whichever shape the branch has; the denial
-- vectors themselves are shape-independent (the CURRENT policy set keys only on user_id).
--
-- Self-asserting: every check RAISEs on failure; a clean run returns one 'OK' row. A positive control
-- (gym A's owner DOES see the seeded rows) guards against a vacuous pass where seeding silently failed.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs` (provisions/reuses a seeded
-- preview branch and runs the whole suite; see that file's header). Or ad hoc against any branch via the
-- Supabase MCP execute_sql (pure SQL — no psql meta-commands).

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
-- gym A = forge (spine-seeded, America/Chihuahua). gym B = a synthetic second gym in a non-Chihuahua
-- IANA zone. owner_a owns gym A's data rows (the current policy keys rows on user_id); operator_b is the
-- cross-tenant attacker; member_m is the member who claims one cliente (auth_user_id, where #20's column
-- exists) while a second cliente stays UNCLAIMED. Seeded as the connecting role (RLS bypassed),
-- exactly as the registration/claim + import paths will (ADR-0013 §4) — never a direct client write.
do $$
declare
  gym_a        uuid;
  gym_b        uuid := gen_random_uuid();
  owner_a      uuid := gen_random_uuid();
  operator_b   uuid := gen_random_uuid();
  member_m     uuid := gen_random_uuid();
  claimed_cli  uuid;
  has_gym_id   boolean;
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then
    raise exception 'SEED FAIL: expected the forge gym from the spine seeds';
  end if;

  -- One probe covers #20's whole evolution (gym_id on the money-path tables + clientes.auth_user_id
  -- ship in the same migration).
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clientes' and column_name = 'gym_id'
  ) into has_gym_id;

  -- Synthetic gym #2: non-Chihuahua zone; brand_module_id is opaque here (Phase 4 owns the shape).
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'denial-suite-gym-2', 'Denial Suite Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', owner_a,    'authenticated', 'authenticated', 'owner-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', operator_b, 'authenticated', 'authenticated', 'operator-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_m,   'authenticated', 'authenticated', 'member-m@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (owner_a,    gym_a, 'owner'),
    (operator_b, gym_b, 'operator');

  -- Two clientes in gym A owned by owner_a (one claimed by member_m, one unclaimed), plus one venta +
  -- one asistencia for the claimed cliente — so "B sees 0" denies against REAL rows, not an empty
  -- table. folio is supplied explicitly (never nextval) so the run touches no sequence. plpgsql plans
  -- a branch only when it executes, so the untaken shape's statements never bind on this schema.
  if has_gym_id then
    -- #20 schema (every preview branch): gym_id is NOT NULL, so the fixtures supply it.
    insert into public.clientes (user_id, gym_id, nombre, tel, clases_restantes, auth_user_id)
      values (owner_a, gym_a, 'Cliente Claimed', '6141112233', 5, member_m)
      returning id into claimed_cli;
    insert into public.clientes (user_id, gym_id, nombre, tel, clases_restantes, auth_user_id)
      values (owner_a, gym_a, 'Cliente Unclaimed', '6144445566', 8, null);
    insert into public.ventas (user_id, gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
      values (owner_a, gym_a, claimed_cli,
              (select coalesce(max(folio), 0) + 1 from public.ventas),
              '8 clases', 8, 'dias', 20, 750, 'efectivo');
    insert into public.asistencias (user_id, gym_id, cliente_id, fecha, consumio)
      values (owner_a, gym_a, claimed_cli, (now() at time zone 'America/Chihuahua')::date, true);
  else
    -- Pre-#20 schema (this branch's git base): no gym_id yet, and the claim distinction arrives with
    -- #20's auth_user_id — both clientes seed unclaimed-shaped here.
    insert into public.clientes (user_id, nombre, tel, clases_restantes)
      values (owner_a, 'Cliente Claimed', '6141112233', 5)
      returning id into claimed_cli;
    insert into public.clientes (user_id, nombre, tel, clases_restantes)
      values (owner_a, 'Cliente Unclaimed', '6144445566', 8);
    insert into public.ventas (user_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
      values (owner_a, claimed_cli,
              (select coalesce(max(folio), 0) + 1 from public.ventas),
              '8 clases', 8, 'dias', 20, 750, 'efectivo');
    insert into public.asistencias (user_id, cliente_id, fecha, consumio)
      values (owner_a, claimed_cli, (now() at time zone 'America/Chihuahua')::date, true);
  end if;

  perform set_config('t.owner_a',     owner_a::text,     true);
  perform set_config('t.operator_b',  operator_b::text,  true);
  perform set_config('t.claimed_cli', claimed_cli::text, true);
end $$;

-- ── Positive control: gym A's owner DOES see the seeded rows (guards a vacuous pass) ──────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.clientes;
  if n <> 2 then raise exception 'CONTROL FAIL: owner_a sees % of its 2 clientes (seeding broken?)', n; end if;
  select count(*) into n from public.ventas;
  if n <> 1 then raise exception 'CONTROL FAIL: owner_a sees % of its 1 venta', n; end if;
  select count(*) into n from public.asistencias;
  if n <> 1 then raise exception 'CONTROL FAIL: owner_a sees % of its 1 asistencia', n; end if;
end $$;
reset role;

-- ── Denial: operator B (of gym #2) is denied every path to gym A's data ───────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a_client uuid := current_setting('t.claimed_cli', true)::uuid;
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

  raise notice 'RLS cross-tenant denial: all vectors denied for operator B';
end $$;
reset role;

select 'rls cross-tenant denial: OK' as result;
rollback;
