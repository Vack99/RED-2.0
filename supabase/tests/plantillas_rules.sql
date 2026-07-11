-- Written-rows suite for the four plantillas authoring RPCs (#80 written-row rule, #81 rewrite).
--
-- These SECURITY INVOKER RPCs are invoked by NO other suite as write vectors — contract_a_denials.sql
-- fires them only as anon-denial probes (which write nothing) and owns the grant-posture asserts. This
-- suite is therefore their ONLY written-row coverage: it could drop a column, stamp the wrong gym, or
-- mis-seed a template and every one of `pnpm test`'s vitest specs would still pass (packages/data mocks
-- the RPC boundary). RLS is the tenant guard (all four are SECURITY INVOKER), so the cross-gym vectors
-- below prove it holds. Assertions are on the ROWS WRITTEN, never the return value — the #78 lesson.
--
--   sembrar_plantillas_default()  → seeds 4 canonical rows stamped gym_id = staff_gym(), idempotent
--                                    (no-op when the gym already has any plantilla).
--   crear_plantilla(nombre, body) → inserts (nombre, body, gym_id=staff_gym()); raises 'Máximo 4
--                                    plantillas' once the GYM already holds 4 (per-gym cap, contract_b).
--   actualizar_plantilla(id, n,b) → updates nombre+body of the RLS-visible row; 'Plantilla no
--                                    encontrada' when no owned row matches (RLS hides cross-gym rows).
--   eliminar_plantilla(id)        → HARD-deletes the RLS-visible row; 'Plantilla no encontrada' when
--                                    no owned row matches.
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently. Zero hardcoded prod UUIDs. Allow-counts are scoped to
-- the suite's own synthetic gyms (a shared scratch DB may hold other gyms' plantillas); deny/unchanged
-- readbacks confirm the exact written state.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or
-- ad hoc via the Supabase MCP execute_sql.

begin;

do $$
declare
  gym_a    uuid := gen_random_uuid();
  gym_b    uuid := gen_random_uuid();
  staff_a  uuid := gen_random_uuid();
  staff_b  uuid := gen_random_uuid();
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'plantillas-suite-a', 'Plantillas A', 'America/Chihuahua', 'forge'),
    (gym_b, 'plantillas-suite-b', 'Plantillas B', 'America/Chihuahua', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', staff_a, 'authenticated', 'authenticated', 'plantillas-staff-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b, 'authenticated', 'authenticated', 'plantillas-staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (staff_a, gym_a, 'operator'),
    (staff_b, gym_b, 'operator');

  perform set_config('t.gym_a',   gym_a::text,   true);
  perform set_config('t.gym_b',   gym_b::text,   true);
  perform set_config('t.staff_a', staff_a::text, true);
  perform set_config('t.staff_b', staff_b::text, true);
end $$;

-- ══ V1 — sembrar_plantillas_default seeds the 4 canonical rows, each stamped gym_id = the seed's gym ═
--         and is idempotent (a second call is a no-op). Written-row asserts: the seeded names, the
--         gym stamping (the #80 point), and one body's content.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g   uuid := current_setting('t.gym_a', true)::uuid;
  n   int;
  rec record;
begin
  perform public.sembrar_plantillas_default();

  -- Scoped to THIS gym: a shared DB may hold other gyms' plantillas.
  select count(*) into n from public.plantillas where gym_id = g;
  if n <> 4 then raise exception 'V1 FAIL(sembrar): expected 4 seeded rows for the gym, got %', n; end if;

  -- Every seeded row carries this gym's id (no unstamped/cross-gym row leaked in).
  select count(*) into n from public.plantillas
    where gym_id = g and nombre in ('Recordatorio', 'Recibo', 'Renovación', 'Última llamada');
  if n <> 4 then raise exception 'V1 FAIL(sembrar): the 4 canonical names/gym-stamp are not all present (got %)', n; end if;

  -- Content of a seeded row was actually written (not just an empty stamped row).
  select nombre, body into rec from public.plantillas where gym_id = g and nombre = 'Recordatorio';
  if rec.body not like 'Hola {nombre}%Aún te quedan {clases}%' then
    raise exception 'V1 FAIL(sembrar): Recordatorio body content not written as seeded: %', rec.body;
  end if;

  -- Idempotent: the gym already has rows, so a second call writes nothing.
  perform public.sembrar_plantillas_default();
  select count(*) into n from public.plantillas where gym_id = g;
  if n <> 4 then raise exception 'V1 FAIL(sembrar): not idempotent, gym now holds % rows', n; end if;
end $$;
reset role;

-- ══ V2 — crear_plantilla writes (nombre, body, gym_id=staff_gym); the per-gym cap raises on the 5th ═
--         Run on gym_b (empty) so the happy-path write and the cap boundary are both exercised cleanly.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g       uuid := current_setting('t.gym_b', true)::uuid;
  p_uno   uuid;
  n       int;
  raised  boolean := false;
  errm    text;
  rec     record;
begin
  -- Happy path: readback proves the written columns, including the gym stamp.
  p_uno := public.crear_plantilla('Uno', 'b1');
  select nombre, body, gym_id into rec from public.plantillas where id = p_uno;
  if rec.nombre is distinct from 'Uno'  then raise exception 'V2 FAIL(crear): nombre = % (expected Uno)', rec.nombre; end if;
  if rec.body   is distinct from 'b1'   then raise exception 'V2 FAIL(crear): body = % (expected b1)', rec.body; end if;
  if rec.gym_id is distinct from g      then raise exception 'V2 FAIL(crear): gym_id = % (expected %)', rec.gym_id, g; end if;
  perform set_config('t.p_uno', p_uno::text, true);

  -- Fill to the per-gym cap of 4.
  perform public.crear_plantilla('Dos', 'b2');
  perform public.crear_plantilla('Tres', 'b3');
  perform public.crear_plantilla('Cuatro', 'b4');

  -- The 5th must raise the cap message (crear_plantilla enforces the cap; contract_b made it per-gym).
  begin
    perform public.crear_plantilla('Cinco', 'b5');
  exception when others then
    raised := true;
    errm := sqlerrm;
  end;
  if not raised then raise exception 'V2 FAIL(cap): 5th crear_plantilla was allowed past the cap of 4'; end if;
  if errm is distinct from 'Máximo 4 plantillas' then raise exception 'V2 FAIL(cap): wrong message: %', errm; end if;

  -- Post-state, scoped to this gym: the cap held the count at exactly 4 (no 5th row written).
  select count(*) into n from public.plantillas where gym_id = g;
  if n <> 4 then raise exception 'V2 FAIL(cap): gym holds % rows after the rejected 5th (expected 4)', n; end if;
end $$;
reset role;

-- ══ V3 — actualizar_plantilla writes nombre+body of an owned row; a missing row raises not-found ════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p_uno   uuid := current_setting('t.p_uno', true)::uuid;
  raised  boolean := false;
  errm    text;
  rec     record;
begin
  perform public.actualizar_plantilla(p_uno, 'Uno-edit', 'b1-edit');
  select nombre, body into rec from public.plantillas where id = p_uno;
  if rec.nombre is distinct from 'Uno-edit' then raise exception 'V3 FAIL(actualizar): nombre = % (expected Uno-edit)', rec.nombre; end if;
  if rec.body   is distinct from 'b1-edit'  then raise exception 'V3 FAIL(actualizar): body = % (expected b1-edit)', rec.body; end if;

  begin
    perform public.actualizar_plantilla(gen_random_uuid(), 'X', 'y');
  exception when others then
    raised := true;
    errm := sqlerrm;
  end;
  if not raised then raise exception 'V3 FAIL(actualizar): update of a random id did not raise'; end if;
  if errm is distinct from 'Plantilla no encontrada' then raise exception 'V3 FAIL(actualizar): wrong message: %', errm; end if;
end $$;
reset role;

-- ══ V4 — cross-gym: staff of A cannot update B's plantilla (RLS hides it → not-found), row unchanged ═
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p_uno   uuid := current_setting('t.p_uno', true)::uuid;
  raised  boolean := false;
begin
  begin
    perform public.actualizar_plantilla(p_uno, 'Hackeado', 'robado');
  exception when others then
    raised := true;
  end;
  if not raised then raise exception 'V4 FAIL(cross-gym update): staff of A updated gym B''s plantilla'; end if;
end $$;
reset role;

-- Re-read as the OWNING gym's staff: the V3 payload must be intact (no cross-gym write leaked through).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p_uno uuid := current_setting('t.p_uno', true)::uuid;
  rec   record;
begin
  select nombre, body into rec from public.plantillas where id = p_uno;
  if rec.nombre is distinct from 'Uno-edit' then raise exception 'V4 FAIL(cross-gym update): leaked nombre = %', rec.nombre; end if;
  if rec.body   is distinct from 'b1-edit'  then raise exception 'V4 FAIL(cross-gym update): leaked body = %', rec.body; end if;
end $$;
reset role;

-- ══ V5 — cross-gym: staff of A cannot delete B's plantilla (RLS hides it), the row survives ═════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p_uno   uuid := current_setting('t.p_uno', true)::uuid;
  raised  boolean := false;
begin
  begin
    perform public.eliminar_plantilla(p_uno);
  exception when others then
    raised := true;
  end;
  if not raised then raise exception 'V5 FAIL(cross-gym delete): staff of A deleted gym B''s plantilla'; end if;
end $$;
reset role;

-- Confirm as the OWNING gym's staff that the row still exists (the cross-gym delete wrote nothing).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p_uno uuid := current_setting('t.p_uno', true)::uuid;
begin
  if not exists (select 1 from public.plantillas where id = p_uno) then
    raise exception 'V5 FAIL(cross-gym delete): the owned row was removed by a cross-gym caller';
  end if;
end $$;
reset role;

-- ══ V6 — eliminar_plantilla HARD-deletes an owned row; a missing row raises not-found ══════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g       uuid := current_setting('t.gym_b', true)::uuid;
  p_uno   uuid := current_setting('t.p_uno', true)::uuid;
  n       int;
  raised  boolean := false;
  errm    text;
begin
  perform public.eliminar_plantilla(p_uno);
  if exists (select 1 from public.plantillas where id = p_uno) then
    raise exception 'V6 FAIL(eliminar): the row was not deleted';
  end if;
  -- Scoped post-state: exactly one row gone (4 → 3), nothing else in the gym disturbed.
  select count(*) into n from public.plantillas where gym_id = g;
  if n <> 3 then raise exception 'V6 FAIL(eliminar): gym holds % rows after the delete (expected 3)', n; end if;

  begin
    perform public.eliminar_plantilla(gen_random_uuid());
  exception when others then
    raised := true;
    errm := sqlerrm;
  end;
  if not raised then raise exception 'V6 FAIL(eliminar): delete of a random id did not raise'; end if;
  if errm is distinct from 'Plantilla no encontrada' then raise exception 'V6 FAIL(eliminar): wrong message: %', errm; end if;
end $$;
reset role;

select 'plantillas written-row rules: OK' as result;
rollback;
