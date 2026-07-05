-- Stage-B contract denial vectors (issue #28 live cutover, review item I4 / D3) — slice #28.
--
-- STAGE-B VECTORS: wired into the SUITE AFTER the fixture rewrite (user_id removed everywhere) and after
-- Migration B has run on the branch. Migration B adds the `is_staff_of` guard as the first statement of
-- `next_folio(p_gym)` (D3, review item I2): the definer folio-counter helper is EXECUTE-granted to
-- `authenticated`, so before the guard ANY authenticated caller could bump ANY gym's folio counter. These
-- vectors prove the guard denies the two non-staff callers; they are RED against the pre-Migration-B body
-- (no guard → both callers draw a folio) and GREEN once the guard lands.
--
-- Two denial vectors on next_folio(gym_B):
--   (i)  a MEMBER of gym B (role='member') — is_staff_of(gym_b)=false → the guard raises.
--   (ii) a STAFF of gym A (wrong gym)      — is_staff_of(gym_b)=false → the guard raises.
-- Plus a positive control (staff of gym B draws a folio) so a body that raised for everyone can't pass
-- vacuously.
--
-- STAGE-B SCHEMA NOTE: the tenant tables' `user_id` columns are GONE at this stage, so NO fixture supplies
-- user_id. (gym_membership.user_id is the membership→auth.users FK, a different column that survives; and
-- this file never writes a tenant table anyway — the guard raises before next_folio touches any row.)
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): gym A is looked up by slug from the spine seeds; the synthetic
-- gym B and all auth users are minted with gen_random_uuid(). Fixtures are transaction-local
-- (BEGIN/ROLLBACK) so the branch is REUSABLE with no reset; on a preview branch production auth rows do
-- not carry over, so seeding auth.users is safe. Self-asserting: every check RAISEs on failure; a clean
-- run returns one 'OK' row.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs` (once wired into its SUITE
-- array at the Stage-B step). Or ad hoc against any branch via the Supabase MCP execute_sql (pure SQL).

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs; no tenant-table user_id) ────
do $$
declare
  gym_a    uuid;
  gym_b    uuid := gen_random_uuid();
  member_b uuid := gen_random_uuid();   -- member of gym B (not staff)
  staff_a  uuid := gen_random_uuid();   -- operator of gym A (wrong gym for gym B's counter)
  staff_b  uuid := gen_random_uuid();   -- operator of gym B (the positive-control caller)
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'contract-b-gym-2', 'Contract B Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', member_b, 'authenticated', 'authenticated', 'member-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_a,  'authenticated', 'authenticated', 'staff-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b,  'authenticated', 'authenticated', 'staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (member_b, gym_b, 'member'),
    (staff_a,  gym_a, 'operator'),
    (staff_b,  gym_b, 'operator');

  perform set_config('t.gym_b',    gym_b::text,    true);
  perform set_config('t.member_b', member_b::text, true);
  perform set_config('t.staff_a',  staff_a::text,  true);
  perform set_config('t.staff_b',  staff_b::text,  true);
end $$;

-- ── (i) a member of gym B is denied next_folio(gym_B) ─────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
  f     bigint;
  denied boolean := false;
begin
  begin f := public.next_folio(gym_b);
  exception when others then denied := true; end;
  if not denied then raise exception 'B FAIL: next_folio(gymB) not denied for a MEMBER of gym B (got %)', f; end if;
end $$;
reset role;

-- ── (ii) a staff of gym A is denied next_folio(gym_B) (wrong gym) ──────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
  f     bigint;
  denied boolean := false;
begin
  begin f := public.next_folio(gym_b);
  exception when others then denied := true; end;
  if not denied then raise exception 'B FAIL: next_folio(gymB) not denied for STAFF OF GYM A (wrong gym; got %)', f; end if;
end $$;
reset role;

-- ── Positive control: staff of gym B DOES draw a folio (guards a vacuous all-deny pass) ───────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
  f     bigint;
begin
  f := public.next_folio(gym_b);
  -- gym B is fresh (zero ventas) → next_folio seeds its counter to 1000 and returns its first folio 1001.
  if f <> 1001 then raise exception 'B FAIL: staff-of-B first next_folio(gymB) = % (expected 1001)', f; end if;
end $$;
reset role;

select 'contract_b denials: OK' as result;
rollback;
