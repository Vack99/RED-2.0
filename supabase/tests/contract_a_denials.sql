-- Stage-A contract denial vectors (issue #28 live cutover, review item I4) — slice #28.
--
-- STAGE-A VECTORS: wired into the SUITE only AFTER the BEFORE run (see run-denial-suite.mjs). These are
-- RED against the current dual-policy state and GREEN only once Migration A has run on the branch — it is
-- Migration A that (1) revokes the lingering anon EXECUTE on the five legacy write RPCs and (2) drops the
-- legacy per-`auth.uid()` policies, leaving the gym-scoped `with check (is_staff_of(gym_id))` as the sole
-- write gate. Running this file before Migration A fails (the anon call reaches the body and raises
-- 'No autenticado', not insufficient_privilege; the direct insert's legacy with-check still lets a
-- same-uid row through) — which is the point: it proves the contract, not the status quo.
--
-- Two vector groups:
--   (a) anon EXECUTE denial on each of the five legacy write RPCs — after Migration A's revokes, a call
--       as the `anon` role raises insufficient_privilege (42501) at the permission check, before any body
--       runs. NOTE the actualizar_cliente overload probed is the LIVE 3-arg (uuid, text, text) — the same
--       signature Migration A revokes and the repo defines (20260602120000_actualizar_cliente_rpc.sql);
--       the 7-arg form named in the plan prose does not exist.
--   (b) with_check denial: staff of gym A directly INSERTs a clientes row stamped gym B → the only
--       surviving policy is `clientes_staff_insert with check (is_staff_of(gym_id))`, and A's staff is not
--       staff of B, so the row violates RLS (42501). A positive control (the same staff inserting into
--       gym A succeeds) proves the deny is gym-specific, not a blanket write lockout.
--
-- STAGE-A SCHEMA NOTE: at this stage the tenant tables' `user_id` columns still EXIST and are NOT NULL, so
-- the fixtures + the denial INSERT supply `user_id`. This file is swept by the Stage-B fixture rewrite
-- (user_id removed everywhere) BEFORE Migration B drops those columns.
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): gym A is looked up by slug from the spine seeds; the synthetic
-- gym B and the staff auth user are minted with gen_random_uuid(). Fixtures are transaction-local
-- (BEGIN/ROLLBACK) so the branch is REUSABLE with no reset; on a preview branch production auth rows do
-- not carry over, so seeding auth.users is safe. Self-asserting: every check RAISEs on failure; a clean
-- run returns one 'OK' row.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs` (once wired into its SUITE
-- array at the Stage-A step). Or ad hoc against any branch via the Supabase MCP execute_sql (pure SQL).

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_a    uuid;
  gym_b    uuid := gen_random_uuid();
  staff_a  uuid := gen_random_uuid();
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

  -- Synthetic gym B: non-Chihuahua zone; brand_module_id opaque here (Phase 4 owns the shape).
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'contract-a-gym-2', 'Contract A Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', staff_a, 'authenticated', 'authenticated', 'staff-a@test.local');

  -- staff_a is an operator of gym A ONLY → is_staff_of(gym_a)=true, is_staff_of(gym_b)=false.
  insert into public.gym_membership (user_id, gym_id, role) values (staff_a, gym_a, 'operator');

  perform set_config('t.gym_a',   gym_a::text,   true);
  perform set_config('t.gym_b',   gym_b::text,   true);
  perform set_config('t.staff_a', staff_a::text, true);
end $$;

-- ── (a) anon EXECUTE denial on the five legacy write RPCs (green only after Migration A's revokes) ────
-- The `anon` DB role carries the EXECUTE grant (or, post-Migration-A, does not). auth.uid() is null here,
-- but the permission check fires FIRST — a revoked grant raises insufficient_privilege before the body.
-- Each probe passes typed literals only to resolve the intended overload; the arg values are irrelevant.
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
do $$
declare denied boolean;
begin
  -- actualizar_cliente: 20260708220000 DROPPED the 3-arg form and CREATEd the 4-arg
  -- (uuid, text, text, text default null) — this 3-arg probe resolves to it. That recreate revoked only
  -- `from public` (not `from public, anon` like the house style), and Supabase's default privileges
  -- grant EXECUTE on new functions to anon directly — so Migration A's revoke no longer applies to the
  -- new overload and the call reaches the body, where the auth guard raises P0001 'No autenticado'
  -- (auth.uid() is null for anon). Both are a denial: the grant-level 42501 (if a future migration
  -- re-revokes anon) or the body-level P0001 auth guard. Anything else — including success — fails.
  denied := false;
  begin perform public.actualizar_cliente(gen_random_uuid(), 'x'::text, 'x'::text);
  exception
    when insufficient_privilege then denied := true;
    when raise_exception then denied := (sqlerrm = 'No autenticado');
  end;
  if not denied then raise exception 'A FAIL: anon not denied on actualizar_cliente'; end if;

  denied := false;
  begin perform public.actualizar_plantilla(gen_random_uuid(), 'x'::text, 'x'::text);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'A FAIL: anon EXECUTE not denied on actualizar_plantilla'; end if;

  denied := false;
  begin perform public.crear_plantilla('x'::text, 'x'::text);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'A FAIL: anon EXECUTE not denied on crear_plantilla'; end if;

  denied := false;
  begin perform public.eliminar_plantilla(gen_random_uuid());
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'A FAIL: anon EXECUTE not denied on eliminar_plantilla'; end if;

  denied := false;
  begin perform public.sembrar_plantillas_default();
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'A FAIL: anon EXECUTE not denied on sembrar_plantillas_default'; end if;

  raise notice 'contract_a (a): anon EXECUTE denied on all five legacy write RPCs';
end $$;
reset role;

-- ── (b) with_check denial: staff of gym A cannot INSERT a clientes row stamped gym B ──────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gym_a   uuid := current_setting('t.gym_a', true)::uuid;
  gym_b   uuid := current_setting('t.gym_b', true)::uuid;
  staff_a uuid := current_setting('t.staff_a', true)::uuid;
  denied  boolean := false;
  n       int;
begin
  -- DENY: gym_id = B → clientes_staff_insert with_check (is_staff_of(gym_b)) is false → 42501.
  begin
    insert into public.clientes (gym_id, nombre, tel, clases_restantes)
      values (gym_b, 'Cross Tenant', '6140000000', 1);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'A FAIL: staff-of-A INSERT into gym B was NOT denied by with_check'; end if;

  -- POSITIVE CONTROL: the same staff writing into their OWN gym A succeeds — proves the deny above is
  -- gym-specific (with_check), not a blanket insert lockout (a vacuous pass).
  insert into public.clientes (gym_id, nombre, tel, clases_restantes)
    values (gym_a, 'Own Gym', '6141110000', 1);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'A FAIL: staff-of-A INSERT into their own gym A hit % rows (expected 1)', n; end if;
end $$;
reset role;

select 'contract_a denials: OK' as result;
rollback;
