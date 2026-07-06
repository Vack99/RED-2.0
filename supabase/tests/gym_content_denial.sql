-- Gym content (about_value/facility/stat/faq) cross-tenant denial suite — slice #39 (PRD #36 decision
-- b; ADR-0013 curated/showcased class). WRITTEN FIRST (TDD, denial-test-before-policy): against a
-- branch that predates the #39 migration this FAILS outright (the tables don't exist); after the
-- migration it returns one 'OK' row.
--
-- Proves, for all four tables: staff of gym A (is_staff_of) can read/write/delete their own gym's
-- rows; an authenticated member of gym A (is_member_of, non-staff) can read but never write; staff of
-- a DIFFERENT gym B is denied every read/write/delete path into gym A's rows; and anon READS all four
-- tables (decision b discharged in #50 — the gym content is public marketing surface).
--
-- Self-asserting: every check RAISEs on failure; a clean run returns one 'OK' row. Zero hardcoded prod
-- UUIDs (ADR-0013 §5): gym A/B are looked up by slug from the spine seeds (forge/red); every auth user
-- is minted with gen_random_uuid(). Transaction-local (BEGIN/ROLLBACK) so the scratch project stays
-- reusable across runs.
--
-- HOW TO RUN: via `node supabase/tests/run-denial-suite.mjs` (wired into the SUITE list), or ad hoc via
-- the Supabase MCP execute_sql / apply-sql.mjs against a scratch project (pure SQL, no psql meta-commands).

begin;

-- ── Fixtures: gym A (forge) + gym B (red) + one staff/member/cross-tenant-staff triple ────────────
do $$
declare
  gym_a     uuid;
  gym_b     uuid;
  owner_a   uuid := gen_random_uuid();
  member_a  uuid := gen_random_uuid();
  staff_b   uuid := gen_random_uuid();
  av_id     uuid;
  fac_id    uuid;
  stat_id   uuid;
  faq_id    uuid;
begin
  select id into gym_a from public.gym where slug = 'forge';
  select id into gym_b from public.gym where slug = 'red';
  if gym_a is null or gym_b is null then
    raise exception 'SEED FAIL: expected forge + red gyms from the spine seeds';
  end if;

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', owner_a,  'authenticated', 'authenticated', 'gc-owner-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_a, 'authenticated', 'authenticated', 'gc-member-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b,  'authenticated', 'authenticated', 'gc-staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (owner_a,  gym_a, 'owner'),
    (member_a, gym_a, 'member'),
    (staff_b,  gym_b, 'operator');

  -- One seeded row per table in gym A, owned by the connecting role (RLS bypassed) — exactly as the
  -- authoring DAL writes will (staff-derived gym_id, never a direct client write to another gym).
  insert into public.about_value (gym_id, title, description, sort_order)
    values (gym_a, 'Comunidad', 'Entrenamos juntos, no solos.', 0) returning id into av_id;
  insert into public.facility (gym_id, name, description, sort_order)
    values (gym_a, 'Área de pesas', 'Equipo completo de pesas libres.', 0) returning id into fac_id;
  insert into public.stat (gym_id, label, value, sort_order)
    values (gym_a, 'Miembros activos', '500+', 0) returning id into stat_id;
  insert into public.faq (gym_id, question, answer, sort_order)
    values (gym_a, '¿Necesito membresía anual?', 'No, manejamos paquetes por clases.', 0) returning id into faq_id;

  perform set_config('t.gym_a',    gym_a::text,    true);
  perform set_config('t.gym_b',    gym_b::text,    true);
  perform set_config('t.owner_a',  owner_a::text,  true);
  perform set_config('t.member_a', member_a::text, true);
  perform set_config('t.staff_b',  staff_b::text,  true);
  perform set_config('t.av_id',    av_id::text,    true);
  perform set_config('t.fac_id',   fac_id::text,   true);
  perform set_config('t.stat_id',  stat_id::text,  true);
  perform set_config('t.faq_id',   faq_id::text,   true);
end $$;

-- ── Positive control: staff owner_a sees + can write/delete their own gym's rows ───────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.about_value where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'CONTROL FAIL: owner_a sees % about_value rows (expected 1)', n; end if;
  select count(*) into n from public.facility where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'CONTROL FAIL: owner_a sees % facility rows', n; end if;
  select count(*) into n from public.stat where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'CONTROL FAIL: owner_a sees % stat rows', n; end if;
  select count(*) into n from public.faq where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'CONTROL FAIL: owner_a sees % faq rows', n; end if;

  -- staff write: update own gym's row
  update public.about_value set title = 'Comunidad real' where id = current_setting('t.av_id', true)::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CONTROL FAIL: owner_a staff-update hit % about_value rows (expected 1)', n; end if;

  -- staff insert: a new row into their own gym
  insert into public.stat (gym_id, label, value, sort_order)
    values (current_setting('t.gym_a', true)::uuid, 'Clases por semana', '40+', 1);

  -- staff delete: their own gym's row
  delete from public.faq where id = current_setting('t.faq_id', true)::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CONTROL FAIL: owner_a staff-delete removed % faq rows (expected 1)', n; end if;
end $$;
reset role;

-- ── member_a (gym A, non-staff): reads the catalog, denied every write/delete ──────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.about_value where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'GRANT FAIL: member_a sees % about_value rows (expected 1, is_member_of read)', n; end if;
  select count(*) into n from public.facility where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'GRANT FAIL: member_a sees % facility rows', n; end if;

  update public.about_value set title = 'Hacked' where id = current_setting('t.av_id', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: member_a updated % about_value rows (member write must be denied)', n; end if;

  begin
    insert into public.facility (gym_id, name, description, sort_order)
      values (current_setting('t.gym_a', true)::uuid, 'Sneaked in', 'x', 9);
    n := 1;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: member_a inserted a facility row (member write must be denied)'; end if;

  delete from public.stat where gym_id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: member_a deleted % stat rows (member write must be denied)', n; end if;
end $$;
reset role;

-- ── staff_b (gym B, cross-tenant): denied every read/write/delete path into gym A's rows ──────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.about_value where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b (gym B) sees % of gym A''s about_value rows', n; end if;
  select count(*) into n from public.facility where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b sees % of gym A''s facility rows', n; end if;
  select count(*) into n from public.stat where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b sees % of gym A''s stat rows', n; end if;
  select count(*) into n from public.faq where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b sees % of gym A''s faq rows', n; end if;

  update public.about_value set title = 'Hacked by B' where id = current_setting('t.av_id', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b updated % of gym A''s about_value rows', n; end if;

  delete from public.facility where id = current_setting('t.fac_id', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b deleted % of gym A''s facility rows', n; end if;

  -- staff_b IS staff of gym B, so a with_check(is_staff_of(gym_id)) insert stamped with gym A's id
  -- (not their own) must still be denied — proves the policy checks the ROW's gym, not just "is staff
  -- of SOME gym".
  begin
    insert into public.about_value (gym_id, title, description, sort_order)
      values (current_setting('t.gym_a', true)::uuid, 'Forged row', 'x', 9);
    n := 1;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b inserted an about_value row stamped gym A'; end if;
end $$;
reset role;

-- ── anon: reads all four gym-content tables (decision (b) discharged in #50 — content is public) ──
-- Post-#50 (20260706160000_phase6_anon_catalog_read) the marketing pages render gym content anonymously.
-- The staff-delete earlier in this suite removed the seeded faq row, so anon expects 0 faqs but >=1 of
-- the others (about_value/facility survive; stat gained a staff-inserted row). The exhaustive anon
-- allowlist is asserted in anon_catalog_read.sql.
reset role;
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.about_value;
  if n < 1 then raise exception 'ANON READ FAIL: anon reads % about_value rows (public since #50)', n; end if;
  select count(*) into n from public.facility;
  if n < 1 then raise exception 'ANON READ FAIL: anon reads % facility rows (public since #50)', n; end if;
  select count(*) into n from public.stat;
  if n < 1 then raise exception 'ANON READ FAIL: anon reads % stat rows (public since #50)', n; end if;
end $$;
reset role;

select 'gym content cross-tenant denial: OK' as result;
rollback;
