-- Cross-tenant + anon RLS suite for the S0 catalog spine (coach, class_type
-- +children, room) — slice #37 (PRD #36 S0; ADR-0013 curated/showcased class). The anon
-- vector was flipped to "reads" by slice #50 (decision b discharged — the catalog is public).
--
-- Denial-test-FIRST (TDD): recorded RED before the 20260705230121_create_catalog_spine
-- migration creates these tables/policies (fails with "relation does not exist"), GREEN
-- after. Mirrors the rls_cross_tenant_denial.sql fixture idiom — zero hardcoded prod UUIDs,
-- transaction-local, self-asserting (every check RAISEs on failure; a clean run returns one
-- 'OK' row).
--
-- Vectors proved:
--   1) staff of gym A (is_staff_of) may insert+update all 5 tables in gym A.
--   2) a cross-tenant operator (staff of gym B only) reads 0 rows of gym A's catalog and
--      every write attempt against gym A's rows affects 0 rows (update AND insert denied).
--   3) a gym-A MEMBER (is_member_of, no staff role) reads gym A's catalog but every write
--      attempt affects 0 rows (curated class: members never write).
--   4) anon reads coach + class_type FOR THE GYM THE REQUEST NAMES and no other (decision b
--      discharged in #50 — the catalog is public; scoped per gym by #215), and reads ZERO rows of
--      class_type_workblock / class_type_bring_item / room at any header (#250 dropped their anon
--      policies: they were public with no anon reader anywhere).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or
-- ad hoc via the Supabase MCP execute_sql.

begin;

do $$
declare
  -- gym A is minted fresh (like gym B) since #86: the real-forge seed migration populates forge's
  -- catalog, so a suite reusing forge as gym A would count seeded rows, not its own fixtures.
  gym_a       uuid := gen_random_uuid();
  gym_b       uuid := gen_random_uuid();
  operator_a  uuid := gen_random_uuid();
  operator_b  uuid := gen_random_uuid();
  member_a    uuid := gen_random_uuid();
  ct_a        uuid;
  ct_b        uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'catalog-denial-gym-a', 'Catalog Denial Gym A', 'America/Chihuahua',   'forge'),
    (gym_b, 'catalog-denial-gym-2', 'Catalog Denial Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'catalog-operator-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', operator_b, 'authenticated', 'authenticated', 'catalog-operator-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_a,   'authenticated', 'authenticated', 'catalog-member-a@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (operator_a, gym_a, 'operator'),
    (operator_b, gym_b, 'operator'),
    (member_a,   gym_a, 'member');

  -- One row per gym-A catalog table (owned by staff via the migration role, RLS bypassed —
  -- exactly how the app's future authoring RPCs will seed rows).
  insert into public.coach (gym_id, name, initials, role) values (gym_a, 'Coach Denial', 'CD', 'coach');
  insert into public.room  (gym_id, name) values (gym_a, 'Sala Principal');
  insert into public.class_type (gym_id, name) values (gym_a, 'Funcional')
    returning id into ct_a;
  insert into public.class_type_workblock (gym_id, class_type_id, label) values (gym_a, ct_a, 'Calentamiento');
  insert into public.class_type_bring_item (gym_id, class_type_id, label) values (gym_a, ct_a, 'Toalla');

  -- Gym B's own catalog — the cross-gym probe the anon section needs since #215 (naming gym A must
  -- return none of it). Invisible to every authenticated actor below (their policies scope to gym A,
  -- and operator_b's assertions are all `where gym_id = gym_a`), so the exact counts there stand.
  insert into public.coach (gym_id, name, initials, role) values (gym_b, 'Coach B', 'CB', 'coach');
  insert into public.room  (gym_id, name) values (gym_b, 'Sala B');
  insert into public.class_type (gym_id, name) values (gym_b, 'Funcional B')
    returning id into ct_b;
  insert into public.class_type_workblock  (gym_id, class_type_id, label) values (gym_b, ct_b, 'Calentamiento');
  insert into public.class_type_bring_item (gym_id, class_type_id, label) values (gym_b, ct_b, 'Toalla');

  perform set_config('t.gym_a',        gym_a::text,      true);
  perform set_config('t.gym_b',        gym_b::text,      true);
  perform set_config('t.operator_a',   operator_a::text, true);
  perform set_config('t.operator_b',   operator_b::text, true);
  perform set_config('t.member_a',     member_a::text,   true);
  perform set_config('t.class_type_a', ct_a::text,       true);
end $$;

-- ── anon: reads 2 of the 5 tables, FOR THE NAMED GYM ONLY (#50 public, #215 scoped, #250 pruned) ──
-- Post-#50 (20260706160000_phase6_anon_catalog_read) the showcased catalog is anon-readable; since
-- #215 those policies key on the gym the REQUEST names (x-gym-id → PostgREST's `request.headers` GUC
-- → public.gym_en_peticion()), which is what createAnonClient(gymId) stamps — so the suite must name
-- a gym exactly as PostgREST would, and gym B's rows (seeded above) must stay invisible while gym A
-- is named. #250 (20260807120000) then dropped the anon policies on class_type_workblock,
-- class_type_bring_item and room: the marketing pages read coach and class_type, never those three,
-- so their reads below became DENIALS over the same seeds. A total denial subsumes the cross-gym
-- probe for those three (zero rows is zero rows for either gym), which is why they lose their
-- `where gym_id = gym_b` line. The exhaustive anon allowlist and the no-header / malformed-header
-- cases live in anon_catalog_read.sql.
set local role anon;
select set_config('request.headers', json_build_object('x-gym-id', current_setting('t.gym_a'))::text, true);
do $$
declare
  n int;
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
begin
  select count(*) into n from public.coach;                   if n < 1 then raise exception 'ANON READ FAIL: coach % rows (public since #50)', n; end if;
  select count(*) into n from public.class_type;              if n < 1 then raise exception 'ANON READ FAIL: class_type % rows (public since #50)', n; end if;

  -- #250: no anon policy left on these three — both gyms' seeded rows must be invisible, header or not.
  select count(*) into n from public.class_type_workblock;    if n <> 0 then raise exception 'ANON DENIAL FAIL(#250): anon reads % class_type_workblock rows (must be 0)', n; end if;
  select count(*) into n from public.class_type_bring_item;   if n <> 0 then raise exception 'ANON DENIAL FAIL(#250): anon reads % class_type_bring_item rows (must be 0)', n; end if;
  select count(*) into n from public.room;                    if n <> 0 then raise exception 'ANON DENIAL FAIL(#250): anon reads % room rows (must be 0)', n; end if;

  -- #215: the request named gym A, so gym B's catalog (seeded, non-vacuous) must not come back.
  select count(*) into n from public.coach                  where gym_id = gym_b; if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s coach rows', n; end if;
  select count(*) into n from public.class_type             where gym_id = gym_b; if n <> 0 then raise exception 'CROSS-GYM FAIL: anon named gym A and read % of gym B''s class_type rows', n; end if;
end $$;
reset role;

-- ── staff of gym A: reads + writes all 5 tables (positive control) ───────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  ct uuid := current_setting('t.class_type_a', true)::uuid;
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
begin
  select count(*) into n from public.coach;                  if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % coach rows (expected 1)', n; end if;
  select count(*) into n from public.class_type;             if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % class_type rows', n; end if;
  select count(*) into n from public.class_type_workblock;   if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % workblock rows', n; end if;
  select count(*) into n from public.class_type_bring_item;  if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % bring_item rows', n; end if;
  select count(*) into n from public.room;                   if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % room rows', n; end if;

  update public.coach set bio = 'updated' where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'STAFF FAIL: operator_a coach update hit % rows (expected 1)', n; end if;

  update public.class_type set description = 'updated' where id = ct;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'STAFF FAIL: operator_a class_type update hit % rows (expected 1)', n; end if;
end $$;
reset role;

-- ── cross-tenant: operator_b (staff of gym B only) reads 0 / writes 0 on gym A's rows ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  ct uuid := current_setting('t.class_type_a', true)::uuid;
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  got_error boolean := false;
begin
  select count(*) into n from public.coach where gym_id = gym_a;                 if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s coach rows', n; end if;
  select count(*) into n from public.class_type where gym_id = gym_a;           if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s class_type rows', n; end if;
  select count(*) into n from public.class_type_workblock where gym_id = gym_a; if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s workblock rows', n; end if;
  select count(*) into n from public.class_type_bring_item where gym_id = gym_a;if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s bring_item rows', n; end if;
  select count(*) into n from public.room where gym_id = gym_a;                 if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s room rows', n; end if;

  update public.coach set bio = 'hacked' where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: operator_b updated % of gym A''s coach rows', n; end if;

  update public.class_type set description = 'hacked' where id = ct;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: operator_b updated % of gym A''s class_type rows', n; end if;

  begin
    insert into public.coach (gym_id, name, initials, role) values (gym_a, 'Injected', 'IJ', 'coach');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'DENIAL FAIL: operator_b inserted a coach row into gym A (with-check did not deny)'; end if;
end $$;
reset role;

-- ── member of gym A: reads the catalog, but every write affects 0 rows ────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  ct uuid := current_setting('t.class_type_a', true)::uuid;
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
begin
  select count(*) into n from public.coach;      if n <> 1 then raise exception 'MEMBER FAIL: member_a sees % coach rows (expected 1)', n; end if;
  select count(*) into n from public.class_type; if n <> 1 then raise exception 'MEMBER FAIL: member_a sees % class_type rows (expected 1)', n; end if;
  select count(*) into n from public.room;       if n <> 1 then raise exception 'MEMBER FAIL: member_a sees % room rows (expected 1)', n; end if;

  update public.coach set bio = 'member-write' where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'MEMBER FAIL: member_a wrote % coach rows (curated class is staff-write-only)', n; end if;

  update public.class_type set description = 'member-write' where id = ct;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'MEMBER FAIL: member_a wrote % class_type rows', n; end if;
end $$;
reset role;

select 'catalog rls denial: OK' as result;
rollback;
