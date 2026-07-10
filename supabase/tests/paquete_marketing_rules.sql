-- Written-rows suite for the two paquete/plan marketing authoring RPCs (#80 AC6).
--
-- These were the only write-bearing `public` functions invoked by NO suite file — they could drop a
-- column, stamp the wrong gym, or mis-order features and every one of `pnpm test`'s vitest specs
-- would still pass (packages/data mocks the RPC boundary). Both are SECURITY INVOKER, so RLS is the
-- tenant guard and the cross-gym vectors below prove it holds.
--
-- Per the runner's rule, this adds vectors in the suite idiom — not a second harness. Assertions are
-- on the ROWS WRITTEN, never on the return value (both RPCs return void): the #78 lesson.
--
--   actualizar_paquete_marketing(id, code, name, subtitle, badge, cadence)
--     → updates paquetes.{code,name,subtitle,badge,cadence}, each `nullif(btrim(v), '')`.
--   set_plan_features(plan_id, labels[])
--     → deletes plan_feature for the plan, re-inserts (gym_id, plan_id, label, orden) from
--       `unnest(labels) with ordinality`, btrim'd, blanks skipped.
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently. Zero hardcoded prod UUIDs.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or
-- ad hoc via the Supabase MCP execute_sql.

begin;

do $$
declare
  gym_a      uuid := gen_random_uuid();
  gym_b      uuid := gen_random_uuid();
  staff_a    uuid := gen_random_uuid();
  staff_b    uuid := gen_random_uuid();
  paq_a      uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'paquete-marketing-suite-a', 'Paquete Marketing A', 'America/Chihuahua', 'forge'),
    (gym_b, 'paquete-marketing-suite-b', 'Paquete Marketing B', 'America/Chihuahua', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', staff_a, 'authenticated', 'authenticated', 'paq-staff-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b, 'authenticated', 'authenticated', 'paq-staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (staff_a, gym_a, 'operator'),
    (staff_b, gym_b, 'operator');

  -- Seeded through the migration role (RLS bypassed), exactly as the catalog suites do.
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, orden)
    values (gym_a, '8 clases', 8, 'dias', 30, 800, 0)
    returning id into paq_a;

  perform set_config('t.gym_a',   gym_a::text,   true);
  perform set_config('t.gym_b',   gym_b::text,   true);
  perform set_config('t.staff_a', staff_a::text, true);
  perform set_config('t.staff_b', staff_b::text, true);
  perform set_config('t.paq_a',   paq_a::text,   true);
end $$;

-- ══ V1 — actualizar_paquete_marketing writes all five columns, btrim'd ═══════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p   uuid := current_setting('t.paq_a', true)::uuid;
  rec record;
begin
  perform public.actualizar_paquete_marketing(p, '  ocho  ', ' Ocho Clases ', 'Para empezar', 'POPULAR', 'mensual');

  select code, name, subtitle, badge, cadence into rec from public.paquetes where id = p;
  if rec.code     is distinct from 'ocho'         then raise exception 'V1 FAIL: code = % (expected trimmed ''ocho'')', rec.code; end if;
  if rec.name     is distinct from 'Ocho Clases'  then raise exception 'V1 FAIL: name = % (expected trimmed ''Ocho Clases'')', rec.name; end if;
  if rec.subtitle is distinct from 'Para empezar' then raise exception 'V1 FAIL: subtitle = %', rec.subtitle; end if;
  if rec.badge    is distinct from 'POPULAR'      then raise exception 'V1 FAIL: badge = %', rec.badge; end if;
  if rec.cadence  is distinct from 'mensual'      then raise exception 'V1 FAIL: cadence = %', rec.cadence; end if;
end $$;
reset role;

-- ══ V2 — blank/whitespace-only values collapse to NULL (nullif(btrim(v), '')) ════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p   uuid := current_setting('t.paq_a', true)::uuid;
  rec record;
begin
  perform public.actualizar_paquete_marketing(p, '', '   ', 'Se queda', '', '  ');

  select code, name, subtitle, badge, cadence into rec from public.paquetes where id = p;
  if rec.code     is not null              then raise exception 'V2 FAIL: empty code should be NULL, got %', rec.code; end if;
  if rec.name     is not null              then raise exception 'V2 FAIL: whitespace name should be NULL, got %', rec.name; end if;
  if rec.subtitle is distinct from 'Se queda' then raise exception 'V2 FAIL: subtitle = %', rec.subtitle; end if;
  if rec.badge    is not null              then raise exception 'V2 FAIL: empty badge should be NULL, got %', rec.badge; end if;
  if rec.cadence  is not null              then raise exception 'V2 FAIL: whitespace cadence should be NULL, got %', rec.cadence; end if;
end $$;
reset role;

-- ══ V3 — cross-gym: staff of B cannot touch A's paquete, AND A's row is unchanged ════════════════
-- The denial half asserts the RAISE; the payload half re-reads the row. A denial vector that only
-- catches the exception proves the call failed, not that it wrote nothing (#80 AC4).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p       uuid := current_setting('t.paq_a', true)::uuid;
  raised  boolean := false;
begin
  begin
    perform public.actualizar_paquete_marketing(p, 'hack', 'Hackeado', 'x', 'x', 'x');
  exception when others then
    raised := true;
  end;
  if not raised then raise exception 'V3 FAIL: cross-gym staff updated another gym''s paquete'; end if;
end $$;
reset role;

-- Re-read as the OWNING gym's staff: the V2 payload must be intact (no partial write leaked through).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p   uuid := current_setting('t.paq_a', true)::uuid;
  rec record;
begin
  select code, name, subtitle into rec from public.paquetes where id = p;
  if rec.code is not null                     then raise exception 'V3 FAIL: cross-gym write leaked code = %', rec.code; end if;
  if rec.name is not null                     then raise exception 'V3 FAIL: cross-gym write leaked name = %', rec.name; end if;
  if rec.subtitle is distinct from 'Se queda' then raise exception 'V3 FAIL: cross-gym write leaked subtitle = %', rec.subtitle; end if;
end $$;
reset role;

-- ══ V4 — set_plan_features: labels btrim'd, blanks skipped, gym stamped, `orden` keeps the ═══════
--         ORIGINAL ordinality (a skipped blank leaves a GAP — it does not renumber).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p     uuid := current_setting('t.paq_a', true)::uuid;
  g     uuid := current_setting('t.gym_a', true)::uuid;
  n     int;
  rec   record;
begin
  -- positions:          1                  2    3       4
  perform public.set_plan_features(p, array['  Acceso total  ', '', '   ', 'Toalla incluida']);

  select count(*) into n from public.plan_feature where plan_id = p;
  if n <> 2 then raise exception 'V4 FAIL: expected 2 features (blanks skipped), got %', n; end if;

  select label, orden, gym_id into rec from public.plan_feature where plan_id = p order by orden limit 1;
  if rec.label  is distinct from 'Acceso total' then raise exception 'V4 FAIL: label not btrim''d: %', rec.label; end if;
  if rec.orden  is distinct from 0              then raise exception 'V4 FAIL: first orden = % (expected 0)', rec.orden; end if;
  if rec.gym_id is distinct from g              then raise exception 'V4 FAIL: gym_id = % (expected %)', rec.gym_id, g; end if;

  select label, orden into rec from public.plan_feature where plan_id = p order by orden desc limit 1;
  if rec.label is distinct from 'Toalla incluida' then raise exception 'V4 FAIL: last label = %', rec.label; end if;
  -- ordinality runs over the FULL array; the two blanks at positions 2-3 are filtered AFTER it.
  if rec.orden is distinct from 3 then raise exception 'V4 FAIL: last orden = % (expected 3 — ordinality gaps survive the blank filter)', rec.orden; end if;
end $$;
reset role;

-- ══ V5 — set_plan_features REPLACES: the prior rows are deleted, not appended to ═════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p   uuid := current_setting('t.paq_a', true)::uuid;
  n   int;
  rec record;
begin
  perform public.set_plan_features(p, array['Solo una']);

  select count(*) into n from public.plan_feature where plan_id = p;
  if n <> 1 then raise exception 'V5 FAIL: replace left % rows (expected 1) — the delete arm did not fire', n; end if;

  select label, orden into rec from public.plan_feature where plan_id = p;
  if rec.label is distinct from 'Solo una' then raise exception 'V5 FAIL: label = %', rec.label; end if;
  if rec.orden is distinct from 0          then raise exception 'V5 FAIL: orden = % (expected 0)', rec.orden; end if;
end $$;
reset role;

-- ══ V6 — cross-gym: staff of B cannot set features on A's plan, AND A's features survive ═════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p      uuid := current_setting('t.paq_a', true)::uuid;
  raised boolean := false;
begin
  begin
    perform public.set_plan_features(p, array['Robado']);
  exception when others then
    raised := true;
  end;
  if not raised then raise exception 'V6 FAIL: cross-gym staff set features on another gym''s plan'; end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p   uuid := current_setting('t.paq_a', true)::uuid;
  n   int;
  rec record;
begin
  select count(*) into n from public.plan_feature where plan_id = p;
  if n <> 1 then raise exception 'V6 FAIL: cross-gym call changed the feature count (% rows)', n; end if;
  select label into rec from public.plan_feature where plan_id = p;
  if rec.label is distinct from 'Solo una' then raise exception 'V6 FAIL: cross-gym call overwrote the label: %', rec.label; end if;
end $$;
reset role;

select 'paquete marketing + plan features written-row rules: OK' as result;
rollback;
