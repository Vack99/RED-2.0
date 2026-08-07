-- Anon catalog-read matrix — slice #50 (PRD #49 S1; PRD #36 decision (b) discharged in Phase 6).
--
-- The conscious "the catalog is public" record: anon may SELECT every showcased-catalog table the
-- client marketing pages consume, and NOTHING else. Written FIRST (TDD, denial-test-before-policy):
-- against a scratch project that predates the 20260706160000_phase6_anon_catalog_read migration this
-- FAILS (anon still reads 0 on the decision-(b) tables, so the positive assertions raise); after the
-- migration it returns one 'OK' row.
--
-- Proves three things the acceptance criteria name:
--   (a) anon SELECT SUCCEEDS on every decision-(b) table that has an anon reader (9 since #250) —
--       non-vacuous: one seeded row each.
--   (b) anon SELECT is DENIED on member-owned / non-public tables — non-vacuous: a seeded row in
--       clientes (member-owned), in schedule_template_coach (the one scheduling child deliberately
--       LEFT OUT of the anon set) and in each of the five #250 tables stays invisible to anon.
--       #250: room, schedule_template, class_session_coach, class_type_workblock and
--       class_type_bring_item were anon-readable with no anon reader anywhere — the 2026-07-06
--       grant copied a PRD table list, not the pages that shipped. 20260807120000 dropped those
--       five anon policies, so the SAME seeds that used to prove the read now prove the denial.
--   (c) NO OTHER anon widening exists — the authoritative machine check: the exact set of tables
--       carrying an anon-role SELECT policy equals the allowlist (11 since #250: `gym` + 9
--       decision-(b) + gym_contact, the #53 public Contacto surface), and no anon WRITE policy
--       exists.
--   (d)-(f) #215: one anonymous call cannot span gyms. The decision-(b) policies stopped being
--       `using (true)` and now key on the gym the REQUEST names (x-gym-id → `request.headers` →
--       public.gym_en_peticion()). A second gym is seeded so "gym B is invisible while naming gym
--       A" is non-vacuous, the reverse direction proves the scope FOLLOWS the request rather than
--       pinning one gym, and the no-header / malformed-header cases must be EMPTY, never an error
--       (an unmapped host degrades to DEFAULT_BRAND with no content; it must not 500).
--
-- Self-asserting (every check RAISEs on failure; a clean run returns one 'OK' row). Wrapped in
-- BEGIN/ROLLBACK — touches no row. gym A is minted fresh with gen_random_uuid (decoupled from the
-- #86-seeded forge); no hardcoded prod UUIDs (ADR-0013 §5). Transaction-local, so the scratch project
-- stays reusable.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or ad hoc via
-- the Supabase MCP execute_sql (pure SQL, no psql meta-commands).

begin;

-- ── Fixtures: one row in every decision-(b) table + the two denial probes (gym A minted fresh) ─────
-- Inserted as the connecting/migration role (RLS bypassed) — exactly how the app's authoring RPCs and
-- the operator seed write these rows. gym A is minted fresh since #86: the real-forge seed migration
-- gives forge a gym_contact row (its PK is gym_id), so reusing forge as gym A would collide on insert.
do $$
declare
  gym_a uuid := gen_random_uuid();
  gym_b uuid := gen_random_uuid();
  ct    uuid;
  co    uuid;
  cs    uuid;
  tmpl  uuid;
  pkg   uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_a, 'anon-catalog-gym-a', 'Anon Catalog Gym A', 'America/Chihuahua', 'forge');

  insert into public.coach (gym_id, name, initials, role) values (gym_a, 'Anon Probe', 'AP', 'coach')
    returning id into co;
  insert into public.room (gym_id, name) values (gym_a, 'Anon Probe Room');
  insert into public.class_type (gym_id, name) values (gym_a, 'AnonProbe-' || substr(gen_random_uuid()::text, 1, 8))
    returning id into ct;
  insert into public.class_type_workblock  (gym_id, class_type_id, label) values (gym_a, ct, 'Calentamiento');
  insert into public.class_type_bring_item (gym_id, class_type_id, label) values (gym_a, ct, 'Toalla');
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, group_id)
    values (gym_a, ct, 0, '07:00', 60, 10, gen_random_uuid()) returning id into tmpl;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct, now() + interval '1 day', 60, 10) returning id into cs;
  insert into public.class_session_coach (gym_id, session_id, coach_id) values (gym_a, cs, co);
  insert into public.paquetes (gym_id, nombre, clases, precio, vigencia_tipo, vigencia_dias, popular, orden)
    values (gym_a, 'AnonProbe-' || substr(gen_random_uuid()::text, 1, 8), 5, 100, 'dias', 20, false, 999)
    returning id into pkg;
  insert into public.plan_feature (gym_id, plan_id, label, orden) values (gym_a, pkg, 'Acceso a la clase', 0);
  insert into public.about_value (gym_id, title, description) values (gym_a, 'Comunidad', 'Entrenamos juntos.');
  insert into public.gym_contact (gym_id, address_line) values (gym_a, 'Av. Probe 1');
  insert into public.facility (gym_id, name, description) values (gym_a, 'Área de pesas', 'Equipo completo.');
  insert into public.stat (gym_id, label, value) values (gym_a, 'Miembros activos', '500+');
  insert into public.faq (gym_id, question, answer) values (gym_a, '¿Necesito membresía anual?', 'No.');

  -- Denial probes (must stay invisible to anon):
  --   schedule_template_coach — the ONE scheduling child excluded from the anon set (proves the
  --     "class sessions +coach join" grant did not leak to the template's coach join).
  --   clientes — the canonical member-owned table (anon must never read a member).
  insert into public.schedule_template_coach (gym_id, template_id, coach_id) values (gym_a, tmpl, co);
  insert into public.clientes (gym_id, nombre, tel) values (gym_a, 'Socio Probe', '5555555555');

  -- Gym B (#215): the cross-gym probe. Before #215 every anon policy was `using (true)`,
  -- so ONE anonymous call returned both gyms — measured live at 614 class_session rows
  -- across 4 gyms. Seeded on the four tables that live probe actually counted, so the
  -- "cannot return more than one gym" assertion below is non-vacuous.
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'anon-catalog-gym-b', 'Anon Catalog Gym B', 'America/Chihuahua', 'forge');
  insert into public.coach (gym_id, name, initials, role) values (gym_b, 'Probe B', 'PB', 'coach')
    returning id into co;
  insert into public.class_type (gym_id, name) values (gym_b, 'AnonProbeB-' || substr(gen_random_uuid()::text, 1, 8))
    returning id into ct;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_b, ct, now() + interval '1 day', 60, 10);
  insert into public.paquetes (gym_id, nombre, clases, precio, vigencia_tipo, vigencia_dias, popular, orden)
    values (gym_b, 'AnonProbeB-' || substr(gen_random_uuid()::text, 1, 8), 5, 100, 'dias', 20, false, 999);
  insert into public.gym_contact (gym_id, address_line) values (gym_b, 'Av. Probe B 2');

  -- Carried out of this block so the anon section can stamp them as the request's gym.
  perform set_config('test.gym_a', gym_a::text, true);
  perform set_config('test.gym_b', gym_b::text, true);
end $$;

-- ── (c) Authoritative: the anon-SELECT table set == the 11-table allowlist, and NO anon write ─────
do $$
declare
  expected text[] := array[
    -- gym_domain LEFT OUT since #216: anon holds neither policy nor grant on it and reaches
    -- one hostname only through public.gym_id_por_host (SECURITY DEFINER). If it reappears
    -- here the customer census is public again, and this array is what says so.
    -- room, schedule_template, class_session_coach, class_type_workblock and class_type_bring_item
    -- LEFT OUT since #250 for the same kind of reason: no anon reader ever existed. Either name
    -- reappearing here means a public policy landed ahead of the page that needs it.
    'about_value','class_session','class_type','coach','faq','facility','gym','gym_contact',
    'paquetes','plan_feature','stat'
  ];
  got     text[];
  extra   text[];
  missing text[];
begin
  select coalesce(array_agg(distinct tablename order by tablename), '{}')
    into got
    from pg_policies
    where schemaname = 'public' and 'anon' = any(roles) and cmd in ('SELECT', 'ALL');

  select array_agg(t order by t) into extra   from unnest(got) t      where t <> all(expected);
  if extra is not null then
    raise exception 'ANON WIDENING: unexpected anon-SELECT policy on table(s) %', extra;
  end if;

  select array_agg(t order by t) into missing from unnest(expected) t where t <> all(got);
  if missing is not null then
    raise exception 'MISSING anon-SELECT policy on decision-(b) table(s) %', missing;
  end if;

  perform 1 from pg_policies
    where schemaname = 'public' and 'anon' = any(roles) and cmd in ('INSERT', 'UPDATE', 'DELETE');
  if found then
    raise exception 'ANON WRITE policy exists — no anon write widening is allowed in this slice';
  end if;
end $$;

-- ── (a)+(b) Row-level, as anon: reads every decision-(b) table, denied the two probes ─────────────
set local role anon;

-- Since #215 the anon policies key on the gym the REQUEST names, read out of PostgREST's
-- `request.headers` GUC by public.gym_en_peticion(). This is exactly what PostgREST sets
-- per request; `createAnonClient(gymId)` is what puts x-gym-id in it.
select set_config('request.headers', json_build_object('x-gym-id', current_setting('test.gym_a'))::text, true);

do $$
declare n int;
begin
  -- (a) succeeds on every decision-(b) table that has a reader (each seeded with >= 1 row)
  select count(*) into n from public.coach;                  if n < 1 then raise exception 'ANON READ FAIL: coach % rows', n; end if;
  select count(*) into n from public.class_type;             if n < 1 then raise exception 'ANON READ FAIL: class_type % rows', n; end if;
  select count(*) into n from public.class_session;          if n < 1 then raise exception 'ANON READ FAIL: class_session % rows', n; end if;
  select count(*) into n from public.paquetes;               if n < 1 then raise exception 'ANON READ FAIL: paquetes % rows', n; end if;
  select count(*) into n from public.plan_feature;           if n < 1 then raise exception 'ANON READ FAIL: plan_feature % rows', n; end if;
  select count(*) into n from public.about_value;            if n < 1 then raise exception 'ANON READ FAIL: about_value % rows', n; end if;
  select count(*) into n from public.facility;               if n < 1 then raise exception 'ANON READ FAIL: facility % rows', n; end if;
  select count(*) into n from public.stat;                   if n < 1 then raise exception 'ANON READ FAIL: stat % rows', n; end if;
  select count(*) into n from public.faq;                    if n < 1 then raise exception 'ANON READ FAIL: faq % rows', n; end if;
  select count(*) into n from public.gym_contact;            if n < 1 then raise exception 'ANON READ FAIL: gym_contact % rows', n; end if;

  -- (b) denied on the excluded sibling + the member-owned table (both seeded — non-vacuous)
  select count(*) into n from public.schedule_template_coach;
  if n <> 0 then raise exception 'ANON DENIAL FAIL: anon reads % schedule_template_coach rows (must be 0)', n; end if;
  select count(*) into n from public.clientes;
  if n <> 0 then raise exception 'ANON DENIAL FAIL: anon reads % clientes rows (member-owned, must be 0)', n; end if;

  -- (b) #250: the five tables whose anon policy 20260807120000 dropped. Same seeds as before —
  -- they were the (a) assertions until the drop, and asserting the opposite over the SAME rows is
  -- what makes this suite prove the drop rather than just stop mentioning it. Naming the gym in
  -- the header cannot help: with no anon policy left, RLS default-deny answers zero.
  select count(*) into n from public.room;
  if n <> 0 then raise exception 'ANON DENIAL FAIL(#250): anon reads % room rows (must be 0)', n; end if;
  select count(*) into n from public.schedule_template;
  if n <> 0 then raise exception 'ANON DENIAL FAIL(#250): anon reads % schedule_template rows (must be 0)', n; end if;
  select count(*) into n from public.class_session_coach;
  if n <> 0 then raise exception 'ANON DENIAL FAIL(#250): anon reads % class_session_coach rows (must be 0)', n; end if;
  select count(*) into n from public.class_type_workblock;
  if n <> 0 then raise exception 'ANON DENIAL FAIL(#250): anon reads % class_type_workblock rows (must be 0)', n; end if;
  select count(*) into n from public.class_type_bring_item;
  if n <> 0 then raise exception 'ANON DENIAL FAIL(#250): anon reads % class_type_bring_item rows (must be 0)', n; end if;

  -- (d) #215's acceptance: ONE anonymous call cannot return rows for more than one gym.
  -- The request names gym A, so gym B's seeded rows must be invisible on the four tables
  -- the live probe actually enumerated.
  select count(*) into n from public.coach        where gym_id = current_setting('test.gym_b')::uuid;
  if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s coach rows', n; end if;
  select count(*) into n from public.class_session where gym_id = current_setting('test.gym_b')::uuid;
  if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s class_session rows', n; end if;
  select count(*) into n from public.paquetes     where gym_id = current_setting('test.gym_b')::uuid;
  if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s paquetes rows', n; end if;
  select count(*) into n from public.gym_contact  where gym_id = current_setting('test.gym_b')::uuid;
  if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s gym_contact rows', n; end if;
end $$;

-- (e) The other direction — proves the scoping FOLLOWS the request rather than pinning one
-- gym: naming gym B shows B's rows and hides A's. Per-gym publication is the product.
select set_config('request.headers', json_build_object('x-gym-id', current_setting('test.gym_b'))::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.coach where gym_id = current_setting('test.gym_b')::uuid;
  if n < 1 then raise exception 'ANON READ FAIL: naming gym B returned % of its own coach rows', n; end if;
  select count(*) into n from public.coach where gym_id = current_setting('test.gym_a')::uuid;
  if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym B and read % of gym A''s coach rows', n; end if;
end $$;

-- (f) No header at all — the unmapped-host / plain-`pnpm dev` case. Must be EMPTY, never an
-- error: a public page on an unmapped host degrades to DEFAULT_BRAND with no content, and a
-- malformed header must not 500 a public page either.
select set_config('request.headers', json_build_object('x-gym-id', 'not-a-uuid')::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.coach;
  if n <> 0 then raise exception 'SCOPE FAIL: a malformed x-gym-id returned % coach rows', n; end if;
end $$;

select set_config('request.headers', '{}', true);
do $$
declare n int;
begin
  select count(*) into n from public.coach;
  if n <> 0 then raise exception 'SCOPE FAIL: no x-gym-id returned % coach rows (expected 0)', n; end if;
  select count(*) into n from public.class_session;
  if n <> 0 then raise exception 'SCOPE FAIL: no x-gym-id returned % class_session rows (expected 0)', n; end if;
end $$;

reset role;

select 'anon catalog read matrix: OK' as result;
rollback;
