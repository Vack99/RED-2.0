-- Written-rows suite for actualizar_paquete — the money/grant package editor (ADR-0005).
--
-- actualizar_paquete is the ONE write-bearing `public` function invoked by NO running suite: it could
-- derive the wrong nombre, skip the sibling demote, or drop the vigencia normalization and every one of
-- `pnpm test`'s vitest specs would still pass (packages/data mocks the RPC boundary — the #78 lesson).
-- It is SECURITY INVOKER, so RLS is the tenant guard and the cross-gym vector below proves it holds.
--
-- CURRENT body (supabase/migrations/20260605130000_paquete_clases_and_single_favorite.sql:21-34):
--   actualizar_paquete(p_id, p_precio int, p_popular boolean, p_clases int default null) returns void
--     • derives nombre in-DB: p_clases null -> 'Ilimitado', 1 -> '1 clase', n -> 'n clases'
--       (mirrors src/domain/rules.ts nombrePaquete);
--     • single-popular invariant: when p_popular, first `update … set popular=false where popular and
--       id <> p_id` — the demote carries NO gym filter and relies ENTIRELY on RLS (is_staff_of(gym_id))
--       to scope it to the caller's gym (paquetes_one_popular is now a per-gym partial unique index,
--       re-keyed off the dropped user_id in 20260702231021);
--     • writes nombre, clases, precio, popular AND hard-normalizes vigencia_tipo='dias', vigencia_dias=30;
--     • `if not found` -> raise 'Paquete no encontrado' (this is what fires cross-gym: RLS hides the row).
--
-- Assertions are on the ROWS WRITTEN — the edited row, the DEMOTED ex-popular sibling, and the untouched
-- cross-gym rows — never on the return value (the RPC returns void). Self-asserting: every check RAISEs on
-- mismatch; a clean run returns one 'OK' row. Wrapped in one BEGIN/ROLLBACK; touches no row permanently.
-- Zero hardcoded prod UUIDs — synthetic gyms + operators, per the paquete_marketing_rules.sql idiom.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or ad hoc via the
-- Supabase MCP execute_sql.

begin;

do $$
declare
  gym_a    uuid := gen_random_uuid();
  gym_b    uuid := gen_random_uuid();
  staff_a  uuid := gen_random_uuid();
  staff_b  uuid := gen_random_uuid();
  paq_a1   uuid;   -- gym A, starts POPULAR (the sibling to be demoted)
  paq_a2   uuid;   -- gym A, not popular (promoted in V1)
  paq_a3   uuid;   -- gym A, not popular (derived-nombre edge cases in V2)
  paq_b    uuid;   -- gym B, POPULAR (must survive gym A's demote — per-gym isolation)
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'actualizar-paquete-suite-a', 'Actualizar Paquete A', 'America/Chihuahua', 'forge'),
    (gym_b, 'actualizar-paquete-suite-b', 'Actualizar Paquete B', 'America/Chihuahua', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', staff_a, 'authenticated', 'authenticated', 'ap-staff-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b, 'authenticated', 'authenticated', 'ap-staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (staff_a, gym_a, 'operator'),
    (staff_b, gym_b, 'operator');

  -- Seeded through the migration role (RLS bypassed), exactly as the catalog suites do. Distinct clases
  -- per row so the RPC's DERIVED nombre never collides under paquetes_nombre_gym_uq (gym_id, nombre).
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden)
    values (gym_a, '10 clases', 10, 'dias', 30, 1000, true,  0) returning id into paq_a1;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden)
    values (gym_a, '5 clases',   5, 'dias', 30,  600, false, 1) returning id into paq_a2;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden)
    values (gym_a, '3 clases',   3, 'dias', 30,  400, false, 2) returning id into paq_a3;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden)
    values (gym_b, '7 clases',   7, 'dias', 30,  800, true,  0) returning id into paq_b;

  perform set_config('t.gym_a',   gym_a::text,   true);
  perform set_config('t.gym_b',   gym_b::text,   true);
  perform set_config('t.staff_a', staff_a::text, true);
  perform set_config('t.staff_b', staff_b::text, true);
  perform set_config('t.paq_a1',  paq_a1::text,  true);
  perform set_config('t.paq_a2',  paq_a2::text,  true);
  perform set_config('t.paq_a3',  paq_a3::text,  true);
  perform set_config('t.paq_b',   paq_b::text,   true);
end $$;

-- ══ V1 — promote paq_a2: writes the full edited row, DEMOTES the ex-popular sibling paq_a1, and leaves ═
--         exactly one popular per gym (body: demote arm lines 28-30 + main update line 31).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a1   uuid := current_setting('t.paq_a1', true)::uuid;
  a2   uuid := current_setting('t.paq_a2', true)::uuid;
  g    uuid := current_setting('t.gym_a', true)::uuid;
  rec  record;
  n    int;
begin
  perform public.actualizar_paquete(a2, 950, true, 8);

  -- the edited row: derived nombre, clases/precio/popular persisted, vigencia hard-normalized
  select nombre, clases, precio, popular, vigencia_tipo, vigencia_dias into rec from public.paquetes where id = a2;
  if rec.nombre        is distinct from '8 clases' then raise exception 'V1 FAIL: derived nombre = % (expected ''8 clases'')', rec.nombre; end if;
  if rec.clases        is distinct from 8          then raise exception 'V1 FAIL: clases = % (expected 8)', rec.clases; end if;
  if rec.precio        is distinct from 950        then raise exception 'V1 FAIL: precio = % (expected 950)', rec.precio; end if;
  if rec.popular       is not true                 then raise exception 'V1 FAIL: promoted paq_a2 is not popular'; end if;
  if rec.vigencia_tipo is distinct from 'dias'     then raise exception 'V1 FAIL: vigencia_tipo = % (expected ''dias'')', rec.vigencia_tipo; end if;
  if rec.vigencia_dias is distinct from 30         then raise exception 'V1 FAIL: vigencia_dias = % (expected 30)', rec.vigencia_dias; end if;

  -- the DEMOTED sibling (the OTHER row the write mutates): paq_a1 was popular, now must be false
  select popular into rec from public.paquetes where id = a1;
  if rec.popular is not false then raise exception 'V1 FAIL: ex-popular sibling paq_a1 was not demoted (still popular)'; end if;

  -- single-popular invariant holds across the gym's seeds (scoped to gym_a — the suite's own rows)
  select count(*) into n from public.paquetes where gym_id = g and popular;
  if n <> 1 then raise exception 'V1 FAIL: expected exactly 1 popular in gym_a, got %', n; end if;
end $$;
reset role;

-- ══ V1b — per-gym isolation: gym A's demote must NOT reach gym B (the demote has no gym filter — RLS ═══
--          is the only scope). Read paq_b as its OWNING staff; it must still be popular.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  b   uuid := current_setting('t.paq_b', true)::uuid;
  rec record;
begin
  select popular into rec from public.paquetes where id = b;
  if rec.popular is not true then raise exception 'V1b FAIL: gym A''s demote leaked across RLS and unmarked gym B''s popular paquete'; end if;
end $$;
reset role;

-- ══ V2 — derived-nombre edge cases on paq_a3: singular '1 clase', then omitted clases -> 'Ilimitado' ══
--         (body line 27: case when p_clases is null 'Ilimitado' / =1 '1 clase' / else 'n clases').
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a3   uuid := current_setting('t.paq_a3', true)::uuid;
  rec  record;
begin
  perform public.actualizar_paquete(a3, 300, false, 1);
  select nombre, clases into rec from public.paquetes where id = a3;
  if rec.nombre is distinct from '1 clase' then raise exception 'V2 FAIL: clases=1 expected singular ''1 clase'', got %', rec.nombre; end if;
  if rec.clases is distinct from 1         then raise exception 'V2 FAIL: clases=1 not persisted, got %', rec.clases; end if;

  perform public.actualizar_paquete(a3, 300, false);   -- p_clases omitted -> DEFAULT NULL -> ilimitado
  select nombre, clases into rec from public.paquetes where id = a3;
  if rec.nombre is distinct from 'Ilimitado' then raise exception 'V2 FAIL: omitted clases expected ''Ilimitado'', got %', rec.nombre; end if;
  if rec.clases is not null                   then raise exception 'V2 FAIL: omitted clases expected NULL, got %', rec.clases; end if;
end $$;
reset role;

-- ══ V3 — cross-gym: staff of B cannot edit A's paquete, AND A's row is unchanged ═════════════════════
-- The denial half asserts the RAISE; the payload half re-reads the row. A denial vector that only catches
-- the exception proves the call failed, not that it wrote nothing (#80 AC4). RLS hides the row from staff
-- B, so the update touches 0 rows -> `if not found` -> raise 'Paquete no encontrado' (body line 33).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a2      uuid := current_setting('t.paq_a2', true)::uuid;
  raised  boolean := false;
begin
  begin
    perform public.actualizar_paquete(a2, 1, true, 1);
  exception when others then
    raised := true;
  end;
  if not raised then raise exception 'V3 FAIL: cross-gym staff edited another gym''s paquete'; end if;
end $$;
reset role;

-- Re-read as the OWNING gym's staff: paq_a2 must be byte-identical to its V1 state (no partial write leaked).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a2   uuid := current_setting('t.paq_a2', true)::uuid;
  rec  record;
begin
  select nombre, clases, precio, popular into rec from public.paquetes where id = a2;
  if rec.nombre  is distinct from '8 clases' then raise exception 'V3 FAIL: cross-gym write leaked nombre = %', rec.nombre; end if;
  if rec.clases  is distinct from 8          then raise exception 'V3 FAIL: cross-gym write leaked clases = %', rec.clases; end if;
  if rec.precio  is distinct from 950        then raise exception 'V3 FAIL: cross-gym write leaked precio = %', rec.precio; end if;
  if rec.popular is not true                 then raise exception 'V3 FAIL: cross-gym write demoted/altered popular = %', rec.popular; end if;
end $$;
reset role;

select 'actualizar_paquete written-row rules: OK' as result;
rollback;
