-- gym_membership behavior + denial suite, slice #19 (ADR-0013 §1/§3/§4).
--
-- Proves the RLS MECHANISM this slice introduces, written BEFORE the migration it guards (TDD,
-- denial-test-first): the three membership helpers behave per §1/§3, and gym_membership's own
-- policies (§4) grant self-read + staff-read-own-gym while denying cross-gym reads and every direct
-- client write. Against a branch where neither the table nor the helpers exist it FAILS (they are
-- absent); after the migration it returns one 'OK' row.
--
-- Self-asserting: every check RAISEs on failure; a clean run returns 'gym_membership rls: OK'.
-- Wrapped in BEGIN/ROLLBACK — touches no committed row. Zero hardcoded prod UUIDs (ADR-0013 §5): the
-- three fixture auth users are minted with gen_random_uuid(); the two gyms are looked up by slug from
-- the spine seeds. Runs on a SEEDED Supabase preview branch (MCP create_branch), where production auth
-- rows do not carry over so seeding auth.users is safe.
--
-- HOW TO RUN (no local Docker here, so not wired into `supabase test db` / pgTAP):
--   - via the Supabase MCP execute_sql on a preview branch (pure SQL — no psql meta-commands), or
--   - psql "$BRANCH_DATABASE_URL" -f supabase/tests/gym_membership_rls.sql

begin;

-- ── Fixtures: two gyms from the spine seeds + three minted auth users ─────────
-- gym A = forge, gym B = red (both seeded by the tenant-spine migration). Three users: an owner and a
-- member of gym A, and an operator of gym B. Memberships seeded as the migration role (RLS bypassed),
-- exactly as the registration/claim RPCs will (ADR-0013 §4) — never a direct client write.
do $$
declare
  gym_a uuid;
  gym_b uuid;
  owner_a  uuid := gen_random_uuid();
  member_a uuid := gen_random_uuid();
  staff_b  uuid := gen_random_uuid();
  n int;
begin
  select id into gym_a from public.gym where slug = 'forge';
  select id into gym_b from public.gym where slug = 'red';
  if gym_a is null or gym_b is null then
    raise exception 'SEED FAIL: expected forge + red gyms from the spine seeds';
  end if;

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', owner_a,  'authenticated', 'authenticated', 'owner-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_a, 'authenticated', 'authenticated', 'member-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b,  'authenticated', 'authenticated', 'staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (owner_a,  gym_a, 'owner'),
    (member_a, gym_a, 'member'),
    (staff_b,  gym_b, 'operator');

  -- Stash the fixture uuids for the role-switched blocks below.
  perform set_config('t.gym_a', gym_a::text, true);
  perform set_config('t.gym_b', gym_b::text, true);
  perform set_config('t.owner_a', owner_a::text, true);
  perform set_config('t.member_a', member_a::text, true);
  perform set_config('t.staff_b', staff_b::text, true);

  -- ── 1) Helper behavior (ADR-0013 §1/§3), evaluated per fixture caller ───────
  -- Helpers read (select auth.uid()); drive that by setting request.jwt.claims per caller.

  -- owner_a: member + staff + owner of A; NOT a member of B (cross-gym).
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  if not public.is_member_of(gym_a)       then raise exception 'HELPER FAIL: owner_a is_member_of(A) false'; end if;
  if not public.is_staff_of(gym_a)        then raise exception 'HELPER FAIL: owner_a is_staff_of(A) false'; end if;
  if not public.has_role(gym_a, 'owner')  then raise exception 'HELPER FAIL: owner_a has_role(A,owner) false'; end if;
  if     public.has_role(gym_a, 'member') then raise exception 'HELPER FAIL: owner_a has_role(A,member) true'; end if;
  if     public.is_member_of(gym_b)       then raise exception 'HELPER FAIL: owner_a is_member_of(B) true (cross-gym leak)'; end if;

  -- member_a: member of A but NOT staff.
  perform set_config('request.jwt.claims', json_build_object('sub', member_a, 'role', 'authenticated')::text, true);
  if not public.is_member_of(gym_a)       then raise exception 'HELPER FAIL: member_a is_member_of(A) false'; end if;
  if     public.is_staff_of(gym_a)        then raise exception 'HELPER FAIL: member_a is_staff_of(A) true'; end if;
  if not public.has_role(gym_a, 'member') then raise exception 'HELPER FAIL: member_a has_role(A,member) false'; end if;

  -- staff_b: operator of B counts as staff of B, NOT of A (cross-gym staff denial).
  perform set_config('request.jwt.claims', json_build_object('sub', staff_b, 'role', 'authenticated')::text, true);
  if not public.is_staff_of(gym_b)        then raise exception 'HELPER FAIL: staff_b is_staff_of(B) false'; end if;
  if     public.is_staff_of(gym_a)        then raise exception 'HELPER FAIL: staff_b is_staff_of(A) true (cross-gym leak)'; end if;

  raise notice 'gym_membership helpers: member/staff/role + cross-gym vectors all correct';
end $$;

-- ── 2) Policy behavior (ADR-0013 §4): self-read, staff-read-own-gym, cross-gym denial ─────────
-- Act as each caller under the authenticated role and assert row visibility through the table surface.

-- owner_a is staff of gym A → sees BOTH gym-A rows (own + member_a's), never gym B's row.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.gym_membership where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 2 then raise exception 'POLICY FAIL: staff owner_a sees % of gym A''s 2 rows', n; end if;
  select count(*) into n from public.gym_membership where gym_id = current_setting('t.gym_b', true)::uuid;
  if n <> 0 then raise exception 'POLICY FAIL: staff owner_a sees % gym B rows (cross-gym leak)', n; end if;
end $$;
reset role;

-- member_a is NOT staff → self-read only: sees exactly their own row, none of gym A's other rows.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.gym_membership;
  if n <> 1 then raise exception 'POLICY FAIL: non-staff member_a sees % rows (expected own 1)', n; end if;
  select count(*) into n from public.gym_membership where user_id = current_setting('t.member_a', true)::uuid;
  if n <> 1 then raise exception 'POLICY FAIL: member_a cannot self-read own row'; end if;
end $$;
reset role;

-- ── 3) No direct client writes (ADR-0013 §4): INSERT/UPDATE/DELETE all denied under RLS ───────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  -- INSERT: no write policy → default-deny raises.
  n := 1;
  begin
    insert into public.gym_membership (user_id, gym_id, role)
      values (current_setting('t.owner_a', true)::uuid, current_setting('t.gym_b', true)::uuid, 'owner');
    n := 0;  -- reached only if NOT denied
  exception when others then n := -1;
  end;
  if n <> -1 then raise exception 'DENIAL FAIL: authenticated INSERT gym_membership was not denied'; end if;

  -- UPDATE: no write policy → 0 rows affected (or a raised error).
  begin
    update public.gym_membership set role = 'owner';
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: authenticated UPDATE gym_membership changed % rows', n; end if;

  -- DELETE: no write policy → 0 rows affected (or a raised error).
  begin
    delete from public.gym_membership;
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: authenticated DELETE gym_membership removed % rows', n; end if;

  raise notice 'gym_membership writes: all direct client INSERT/UPDATE/DELETE denied';
end $$;
reset role;

select 'gym_membership rls: OK' as result;
rollback;
