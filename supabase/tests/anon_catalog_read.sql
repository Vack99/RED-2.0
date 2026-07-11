-- Anon catalog-read matrix — slice #50 (PRD #49 S1; PRD #36 decision (b) discharged in Phase 6).
--
-- The conscious "the catalog is public" record: anon may SELECT every showcased-catalog table the
-- client marketing pages consume, and NOTHING else. Written FIRST (TDD, denial-test-before-policy):
-- against a scratch project that predates the 20260706160000_phase6_anon_catalog_read migration this
-- FAILS (anon still reads 0 on the decision-(b) tables, so the positive assertions raise); after the
-- migration it returns one 'OK' row.
--
-- Proves three things the acceptance criteria name:
--   (a) anon SELECT SUCCEEDS on every decision-(b) table (14) — non-vacuous: one seeded row each.
--   (b) anon SELECT is DENIED on member-owned / non-public tables — non-vacuous: a seeded row in
--       clientes (member-owned) and schedule_template_coach (the one scheduling child deliberately
--       LEFT OUT of the anon set) stays invisible to anon.
--   (c) NO OTHER anon widening exists — the authoritative machine check: the exact set of tables
--       carrying an anon-role SELECT policy equals the 17-table allowlist (2 Phase-3 spine + 14
--       decision-(b) + gym_contact, the #53 public Contacto surface), and no anon WRITE policy exists.
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
  insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    values (gym_a, ct, 0, '07:00', 60, 10) returning id into tmpl;
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
end $$;

-- ── (c) Authoritative: the anon-SELECT table set == the 16-table allowlist, and NO anon write ─────
do $$
declare
  expected text[] := array[
    'about_value','class_session','class_session_coach','class_type','class_type_bring_item',
    'class_type_workblock','coach','faq','facility','gym','gym_contact','gym_domain','paquetes',
    'plan_feature','room','schedule_template','stat'
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
do $$
declare n int;
begin
  -- (a) succeeds on every decision-(b) table (each seeded with >= 1 row)
  select count(*) into n from public.coach;                  if n < 1 then raise exception 'ANON READ FAIL: coach % rows', n; end if;
  select count(*) into n from public.class_type;             if n < 1 then raise exception 'ANON READ FAIL: class_type % rows', n; end if;
  select count(*) into n from public.class_type_workblock;   if n < 1 then raise exception 'ANON READ FAIL: class_type_workblock % rows', n; end if;
  select count(*) into n from public.class_type_bring_item;  if n < 1 then raise exception 'ANON READ FAIL: class_type_bring_item % rows', n; end if;
  select count(*) into n from public.class_session;          if n < 1 then raise exception 'ANON READ FAIL: class_session % rows', n; end if;
  select count(*) into n from public.class_session_coach;    if n < 1 then raise exception 'ANON READ FAIL: class_session_coach % rows', n; end if;
  select count(*) into n from public.schedule_template;      if n < 1 then raise exception 'ANON READ FAIL: schedule_template % rows', n; end if;
  select count(*) into n from public.paquetes;               if n < 1 then raise exception 'ANON READ FAIL: paquetes % rows', n; end if;
  select count(*) into n from public.plan_feature;           if n < 1 then raise exception 'ANON READ FAIL: plan_feature % rows', n; end if;
  select count(*) into n from public.about_value;            if n < 1 then raise exception 'ANON READ FAIL: about_value % rows', n; end if;
  select count(*) into n from public.facility;               if n < 1 then raise exception 'ANON READ FAIL: facility % rows', n; end if;
  select count(*) into n from public.stat;                   if n < 1 then raise exception 'ANON READ FAIL: stat % rows', n; end if;
  select count(*) into n from public.faq;                    if n < 1 then raise exception 'ANON READ FAIL: faq % rows', n; end if;
  select count(*) into n from public.room;                   if n < 1 then raise exception 'ANON READ FAIL: room % rows', n; end if;
  select count(*) into n from public.gym_contact;            if n < 1 then raise exception 'ANON READ FAIL: gym_contact % rows', n; end if;

  -- (b) denied on the excluded sibling + the member-owned table (both seeded — non-vacuous)
  select count(*) into n from public.schedule_template_coach;
  if n <> 0 then raise exception 'ANON DENIAL FAIL: anon reads % schedule_template_coach rows (must be 0)', n; end if;
  select count(*) into n from public.clientes;
  if n <> 0 then raise exception 'ANON DENIAL FAIL: anon reads % clientes rows (member-owned, must be 0)', n; end if;
end $$;
reset role;

select 'anon catalog read matrix: OK' as result;
rollback;
