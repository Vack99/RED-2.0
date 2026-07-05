-- Cross-tenant RLS denial suite (audit finding 6), seeded + repeatable — slice #21.
--
-- Proves Row-Level Security denies a DIFFERENT authenticated user (operator B, of a second gym) every
-- path to gym A's data: read, direct write, and both money-path RPCs. RLS is the primary security
-- boundary (ADR-0001); the SECURITY INVOKER RPCs (ADR-0005) inherit it, so a cross-tenant call must
-- surface as "no rows" / a raised exception, never a leak or a write. Recorded GREEN on the CURRENT
-- per-`auth.uid()` policy set — the "before" baseline the S10 cutover gate re-runs (ADR-0013 §5).
--
-- Slice #23 extends the suite with the GYM-SCOPED vectors (the `#23 GYM-SCOPED VECTORS` section below):
-- three synthetic gym-A principals that own NO tenant row via user_id (operator_a, owner2_a, and a
-- gym-A `member` membership for member_m), so ONLY the new gym-scoped policies (is_staff_of /
-- is_member_of / has_role / the owning-member auth_user_id path) can grant them anything — never the
-- surviving per-`auth.uid()` policies. These assertions are RED without this slice's policies and GREEN
-- with them, and prove: staff read/write, curated member read, owning-member read (member-vs-member),
-- member-vs-operator-surface (read+write), and cobro owner-only (operator DENIED CLABE, owner granted).
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
  -- #23 gym-scoped fixtures: two synthetic gym-A staff + a gym-A member, none of whom own any tenant
  -- row via user_id — so the gym-scoped predicates (is_staff_of / is_member_of / has_role / the
  -- owning-member auth_user_id path) are the ONLY thing that can grant them access, never the surviving
  -- per-`auth.uid()` policies. operator_a proves is_staff_of (reads gym A's 6 staff tables) AND that
  -- cobro is owner-only (operator DENIED CLABE). owner2_a proves has_role('owner') grants cobro.
  operator_a   uuid := gen_random_uuid();
  owner2_a     uuid := gen_random_uuid();
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
    ('00000000-0000-0000-0000-000000000000', member_m,   'authenticated', 'authenticated', 'member-m@test.local'),
    ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'operator-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', owner2_a,   'authenticated', 'authenticated', 'owner2-a@test.local');

  -- owner_a/operator_b as before. #23 adds gym-A staff (operator_a, owner2_a) plus member_m's own
  -- gym-A `member` membership: a claimed member IS a gym member (ADR-0009), so is_member_of grants the
  -- curated-catalog read while the owning-member `auth_user_id` path grants their own cliente row.
  insert into public.gym_membership (user_id, gym_id, role) values
    (owner_a,    gym_a, 'owner'),
    (operator_b, gym_b, 'operator'),
    (operator_a, gym_a, 'operator'),
    (owner2_a,   gym_a, 'owner'),
    (member_m,   gym_a, 'member');

  -- Two clientes in gym A owned by owner_a (one claimed by member_m, one unclaimed), plus one venta +
  -- one asistencia for the claimed cliente — so "B sees 0" denies against REAL rows, not an empty
  -- table. folio is supplied explicitly (never nextval) so the run touches no sequence. plpgsql plans
  -- a branch only when it executes, so the untaken shape's statements never bind on this schema.
  if has_gym_id then
    -- #20 schema (every preview branch): gym_id is NOT NULL, so the fixtures supply it.
    insert into public.clientes (gym_id, nombre, tel, clases_restantes, auth_user_id)
      values (gym_a, 'Cliente Claimed', '6141112233', 5, member_m)
      returning id into claimed_cli;
    insert into public.clientes (gym_id, nombre, tel, clases_restantes, auth_user_id)
      values (gym_a, 'Cliente Unclaimed', '6144445566', 8, null);
    insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
      values (gym_a, claimed_cli,
              (select coalesce(max(folio), 0) + 1 from public.ventas),
              '8 clases', 8, 'dias', 20, 750, 'efectivo');
    insert into public.asistencias (gym_id, cliente_id, fecha, consumio)
      values (gym_a, claimed_cli, (now() at time zone 'America/Chihuahua')::date, true);
    -- #23: one row per curated + owner-only table in gym A (owned by owner_a via user_id) so the
    -- gym-scoped read vectors ("operator_a sees 1", "member_m sees 1", "operator_b sees 0") assert
    -- against REAL rows, never a vacuously empty table.
    insert into public.paquetes  (gym_id, nombre, precio, vigencia_dias) values (gym_a, '8 clases', 750, 20);
    insert into public.plantillas (gym_id, nombre, body) values (gym_a, 'Recordatorio', 'Hola {nombre}');
    insert into public.perfil    (gym_id, negocio) values (gym_a, 'FORGE');
    insert into public.cobro     (gym_id) values (gym_a);
  else
    -- Pre-#20 schema (this branch's git base): no gym_id yet, and the claim distinction arrives with
    -- #20's auth_user_id — both clientes seed unclaimed-shaped here.
    insert into public.clientes (nombre, tel, clases_restantes)
      values ('Cliente Claimed', '6141112233', 5)
      returning id into claimed_cli;
    insert into public.clientes (nombre, tel, clases_restantes)
      values ('Cliente Unclaimed', '6144445566', 8);
    insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
      values (claimed_cli,
              (select coalesce(max(folio), 0) + 1 from public.ventas),
              '8 clases', 8, 'dias', 20, 750, 'efectivo');
    insert into public.asistencias (cliente_id, fecha, consumio)
      values (claimed_cli, (now() at time zone 'America/Chihuahua')::date, true);
  end if;

  perform set_config('t.owner_a',     owner_a::text,     true);
  perform set_config('t.operator_b',  operator_b::text,  true);
  perform set_config('t.claimed_cli', claimed_cli::text, true);
  perform set_config('t.operator_a',  operator_a::text,  true);
  perform set_config('t.owner2_a',    owner2_a::text,    true);
  perform set_config('t.member_m',    member_m::text,    true);
  perform set_config('t.has_gym_id',  has_gym_id::text,  true);
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

  -- 2b) #23 cross-gym on the curated + owner-only classes: B (gym #2 staff) is is_staff_of(gym_a)=false,
  -- has_role(gym_a,'owner')=false, and owns no gym-A row via user_id → reads 0 and writes 0. Guarded to
  -- the #20 shape (the seeded curated/cobro rows exist only there); pre-#20 these tables are unseeded.
  if current_setting('t.has_gym_id', true)::boolean then
    select count(*) into n from public.paquetes;   if n <> 0 then raise exception 'DENIAL FAIL: B sees % paquetes', n; end if;
    select count(*) into n from public.perfil;      if n <> 0 then raise exception 'DENIAL FAIL: B sees % perfil', n; end if;
    select count(*) into n from public.plantillas;  if n <> 0 then raise exception 'DENIAL FAIL: B sees % plantillas', n; end if;
    select count(*) into n from public.cobro;        if n <> 0 then raise exception 'DENIAL FAIL: B sees % cobro (CLABE)', n; end if;
    update public.paquetes set precio = 1 where nombre = '8 clases';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'DENIAL FAIL: B updated % of A''s paquetes rows', n; end if;
  end if;

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

-- ══ #23 GYM-SCOPED VECTORS (require #20's gym_id + this slice's policies) ══════════════════════════
-- These three blocks are the denial-test-FIRST target for the gym-scoped policy expand. Each fixture
-- user owns NO tenant row via user_id, so the SURVIVING per-`auth.uid()` policies grant them nothing —
-- the gym-scoped predicates are the ONLY thing under test. Without this slice's policies the positive
-- grants below see 0 rows and RAISE (RED); with them they see the seeded rows (GREEN). All three are
-- gated on `t.has_gym_id` so the suite stays green on the pre-#20 base shape (#21's diamond-DAG tolerance).

-- ── operator_a: staff of gym A (is_staff_of) reads its 6 staff tables; DENIED cobro (owner-only) ──────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a_client uuid := current_setting('t.claimed_cli', true)::uuid;
  n int;
begin
  if not current_setting('t.has_gym_id', true)::boolean then return; end if;

  -- GRANT (is_staff_of gym_a): sees BOTH clientes, the venta, the asistencia, and the curated rows.
  select count(*) into n from public.clientes;    if n <> 2 then raise exception 'GYM FAIL: operator_a sees % clientes (expected 2)', n; end if;
  select count(*) into n from public.ventas;       if n <> 1 then raise exception 'GYM FAIL: operator_a sees % ventas', n; end if;
  select count(*) into n from public.asistencias;  if n <> 1 then raise exception 'GYM FAIL: operator_a sees % asistencias', n; end if;
  select count(*) into n from public.paquetes;     if n <> 1 then raise exception 'GYM FAIL: operator_a sees % paquetes', n; end if;
  select count(*) into n from public.perfil;        if n <> 1 then raise exception 'GYM FAIL: operator_a sees % perfil', n; end if;
  select count(*) into n from public.plantillas;   if n <> 1 then raise exception 'GYM FAIL: operator_a sees % plantillas', n; end if;

  -- GRANT (is_staff_of write): staff may update a gym-A cliente.
  update public.clientes set clases_restantes = 7 where id = a_client;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'GYM FAIL: operator_a staff-update hit % rows (expected 1)', n; end if;

  -- DENY (owner-only): an operator of gym A must NEVER read CLABE — the load-bearing owner-only proof.
  select count(*) into n from public.cobro;
  if n <> 0 then raise exception 'GYM FAIL: operator_a read % cobro rows — CLABE leaked to a non-owner', n; end if;
end $$;
reset role;

-- ── owner2_a: owner of gym A (has_role owner) DOES read cobro/CLABE — proves the grant isn't vacuous ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner2_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  if not current_setting('t.has_gym_id', true)::boolean then return; end if;
  select count(*) into n from public.cobro;
  if n <> 1 then raise exception 'GYM FAIL: owner2_a (owner) sees % cobro rows (expected 1)', n; end if;
end $$;
reset role;

-- ── member_m: owning-member reads ONLY their own cliente + the curated catalog; denied everything else ─
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_m', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a_client uuid := current_setting('t.claimed_cli', true)::uuid;
  n int;
begin
  if not current_setting('t.has_gym_id', true)::boolean then return; end if;

  -- GRANT (owning member, auth_user_id): sees EXACTLY their own claimed cliente — not the unclaimed one
  -- (member-vs-member denial: no member reads a peer's row).
  select count(*) into n from public.clientes;
  if n <> 1 then raise exception 'GYM FAIL: member_m sees % clientes (expected exactly their own 1)', n; end if;

  -- GRANT (is_member_of): a gym member reads the curated/showcased catalog.
  select count(*) into n from public.paquetes;    if n <> 1 then raise exception 'GYM FAIL: member_m sees % paquetes', n; end if;
  select count(*) into n from public.perfil;       if n <> 1 then raise exception 'GYM FAIL: member_m sees % perfil', n; end if;
  select count(*) into n from public.plantillas;  if n <> 1 then raise exception 'GYM FAIL: member_m sees % plantillas', n; end if;

  -- DENY (member-vs-operator-surface, reads): ventas/asistencias are staff-only (no owning-member read
  -- path in the expand phase); cobro is owner-only.
  select count(*) into n from public.ventas;       if n <> 0 then raise exception 'GYM FAIL: member_m read % ventas (operator surface)', n; end if;
  select count(*) into n from public.asistencias;  if n <> 0 then raise exception 'GYM FAIL: member_m read % asistencias (operator surface)', n; end if;
  select count(*) into n from public.cobro;         if n <> 0 then raise exception 'GYM FAIL: member_m read % cobro (CLABE)', n; end if;

  -- DENY (member-vs-operator-surface, writes): the owning-member grant is READ-only (member writes are
  -- Phase 6) — a member cannot update their own cliente nor any curated/staff surface.
  update public.clientes set clases_restantes = 0 where id = a_client;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'GYM FAIL: member_m wrote % of their own cliente (should be read-only)', n; end if;
  update public.paquetes set precio = 1 where nombre = '8 clases';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'GYM FAIL: member_m wrote % paquetes rows (operator surface)', n; end if;
end $$;
reset role;

-- ══ C1 VECTORS: a NON-forge operator's NEW-cliente + template writes land in THEIR gym, not forge ═════
-- The vector that would have caught C1 (the membership-derived-gym fix). operator_b is staff of gym B (the
-- synthetic non-forge gym); the staff write RPCs, for a NEW cliente / a new template, must stamp gym B and
-- draw gym B's folio — NEVER forge (gym A). Pre-fix the RPCs derived gym from the `slug='forge'` shortcut, so
-- they stamped gym A while the still-present legacy per-`auth.uid()` with-check let the write through: these
-- assertions are RED against the pre-fix bodies. Post-fix (gym derived from gym_membership) they stamp gym B:
-- GREEN. Gated on #20's gym_id shape (the money-path gym_id + the S5 per-gym folio counter). gym B is looked
-- up by slug (zero prod UUIDs); everything is transaction-local and rolled back.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gym_b     uuid;
  new_cli   uuid;
  new_folio bigint;
  v_gym     uuid;
  v_id      uuid;
begin
  if not current_setting('t.has_gym_id', true)::boolean then return; end if;
  select id into gym_b from public.gym where slug = 'denial-suite-gym-2';

  -- (a) registrar_venta for a NEW cliente: the cliente + venta are stamped gym B and the folio is drawn from
  -- gym B's OWN counter (a brand-new gym → its first folio comes off gym B's row, not forge's).
  select r.folio, r.cliente_id into new_folio, new_cli from public.registrar_venta(
    p_nombre := 'Nuevo B', p_tel := '6149998877', p_paquete_nombre := '8 clases', p_vigencia_tipo := 'dias',
    p_monto := 750, p_metodo := 'efectivo', p_clases_restantes := 8,
    p_vence := (now() at time zone 'America/Mexico_City')::date + 20, p_clases := 8, p_vigencia_dias := 20) r;

  select gym_id into v_gym from public.clientes where id = new_cli;
  if v_gym is distinct from gym_b then
    raise exception 'C1 FAIL: NEW cliente stamped gym % (expected operator B''s gym %, not forge)', v_gym, gym_b;
  end if;

  select gym_id into v_gym from public.ventas where cliente_id = new_cli;
  if v_gym is distinct from gym_b then
    raise exception 'C1 FAIL: venta stamped gym % (expected operator B''s gym %, not forge)', v_gym, gym_b;
  end if;

  -- Folio drawn from gym B's OWN counter, not forge's. gym B is created fresh in the fixtures with zero
  -- ventas, so next_folio seeds its counter to 1000 and its first-ever folio is 1001; forge's counter runs
  -- far higher, so a folio of 1001 proves the draw came off gym B's row. (gym_folio_counter is policy-less
  -- and unreadable to the authenticated caller by design — S5 — so the returned folio is the provenance
  -- signal, not a direct counter read.)
  if new_folio <> 1001 then
    raise exception 'C1 FAIL: folio % is not gym B''s first folio (1001) — not drawn from gym B''s counter', new_folio;
  end if;

  -- (b) crear_plantilla: the new template is stamped gym B, not forge.
  v_id := public.crear_plantilla('Vector B', 'Hola {nombre}');
  select gym_id into v_gym from public.plantillas where id = v_id;
  if v_gym is distinct from gym_b then
    raise exception 'C1 FAIL: crear_plantilla stamped gym % (expected operator B''s gym %, not forge)', v_gym, gym_b;
  end if;

  raise notice 'C1 vectors: NEW-cliente venta + template both stamped the operator''s own gym';
end $$;
reset role;

select 'rls cross-tenant denial: OK' as result;
rollback;
