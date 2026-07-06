-- Contact intake matrix — slice #53 (PRD #49 S1; contact_message public-intake class + gym_contact
-- curated/showcased class). WRITTEN FIRST (TDD, test-before-policy): against a scratch that predates
-- the #53 migrations this FAILS outright (contact_message / gym_contact / enviar_mensaje_contacto don't
-- exist); after the migrations it returns one 'OK' row.
--
-- Proves the exact acceptance criteria:
--   contact_message —
--     • anon submits through enviar_mensaje_contacto() and the row LANDS (the guarded DEFINER RPC is the
--       only write path; there is NO raw anon INSERT policy — a direct insert would bypass captcha +
--       the per-IP limit the abuse posture mandates, so it must be denied);
--     • the per-IP hourly limit RAISEs once the window is full;
--     • server-side validation RAISEs on a bad email;
--     • anon SELECT and member SELECT are DENIED (non-vacuous: rows exist);
--     • staff of the gym READ their rows and mark-read (UPDATE read_at); a DIFFERENT gym's staff is
--       denied every read/update path (cross-tenant isolation).
--   gym_contact (curated/showcased class, replayed from gym_content) —
--     • member of the gym reads, member write denied; cross-tenant staff read/write denied; anon reads.
--
-- Self-asserting: every check RAISEs on failure; a clean run returns one 'OK' row. Zero hardcoded prod
-- UUIDs (ADR-0013 §5): gym A/B looked up by slug (forge/red); every auth user minted with
-- gen_random_uuid(). Transaction-local (BEGIN/ROLLBACK) so the scratch stays reusable across runs.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or ad hoc via the
-- Supabase MCP execute_sql (pure SQL, no psql meta-commands).

begin;

-- ── Fixtures: gym A (forge) + gym B (red), one owner_a / member_a / staff_b, one gym_contact row in A ──
do $$
declare
  gym_a    uuid;
  gym_b    uuid;
  owner_a  uuid := gen_random_uuid();
  member_a uuid := gen_random_uuid();
  staff_b  uuid := gen_random_uuid();
begin
  select id into gym_a from public.gym where slug = 'forge';
  select id into gym_b from public.gym where slug = 'red';
  if gym_a is null or gym_b is null then
    raise exception 'SEED FAIL: expected forge + red gyms from the spine seeds';
  end if;

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', owner_a,  'authenticated', 'authenticated', 'cm-owner-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_a, 'authenticated', 'authenticated', 'cm-member-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b,  'authenticated', 'authenticated', 'cm-staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (owner_a,  gym_a, 'owner'),
    (member_a, gym_a, 'member'),
    (staff_b,  gym_b, 'operator');

  insert into public.gym_contact (gym_id, address_line, latitude, longitude, whatsapp, email, instagram, hours)
    values (gym_a, 'Av. Probe 1', 25.6866, -100.3161, '528100000000', 'probe@a.mx', 'probe.a',
            '[{"day":"Lunes","opens":"05:30","closes":"22:00"},{"day":"Domingo","closed":true}]'::jsonb);

  perform set_config('t.gym_a',    gym_a::text,    true);
  perform set_config('t.gym_b',    gym_b::text,    true);
  perform set_config('t.owner_a',  owner_a::text,  true);
  perform set_config('t.member_a', member_a::text, true);
  perform set_config('t.staff_b',  staff_b::text,  true);
end $$;

-- ── contact_message (a): anon submits via the guarded RPC → the row LANDS ──────────────────────────
set local role anon;
select public.enviar_mensaje_contacto('forge', 'Ana Prospecto', 'ana@example.com',
  'Hola, quiero información de planes.', '1.1.1.1');
reset role;

do $$
declare n int; msg_id uuid;
begin
  select count(*) into n from public.contact_message where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'INTAKE FAIL: anon RPC landed % rows (expected 1)', n; end if;
  select id into msg_id from public.contact_message where gym_id = current_setting('t.gym_a', true)::uuid
    order by created_at desc limit 1;
  perform set_config('t.msg_id', msg_id::text, true);
end $$;

-- ── contact_message (b): per-IP hourly limit RAISEs once the window is full ────────────────────────
-- Seed the limit (5) directly as the connecting role (RLS bypassed), then the 6th via the RPC as anon.
insert into public.contact_message (gym_id, nombre, correo, mensaje, ip)
select current_setting('t.gym_a', true)::uuid, 'Bot ' || g, 'bot@x.mx', 'spam', '9.9.9.9'
from generate_series(1, 5) g;

set local role anon;
do $$
begin
  perform public.enviar_mensaje_contacto('forge', 'Bot', 'bot@x.mx', 'spam de nuevo', '9.9.9.9');
exception when others then null;  -- expected: the limit RAISEs; the count re-probe below is the assertion
end $$;
reset role;
-- The blocked attempt must NOT have inserted a 6th '9.9.9.9' row (the RPC raised before insert).
do $$
declare n int;
begin
  select count(*) into n from public.contact_message
    where gym_id = current_setting('t.gym_a', true)::uuid and ip = '9.9.9.9';
  if n <> 5 then raise exception 'RATE LIMIT FAIL: over-limit RPC inserted a row (ip 9.9.9.9 has % rows, expected 5)', n; end if;
end $$;

-- ── contact_message (c): server-side validation RAISEs on a bad email ──────────────────────────────
set local role anon;
do $$
begin
  perform public.enviar_mensaje_contacto('forge', 'Ana', 'no-es-correo', 'Hola', '2.2.2.2');
exception when others then null;  -- expected: validation RAISEs; the count re-probe below is the assertion
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.contact_message
    where gym_id = current_setting('t.gym_a', true)::uuid and ip = '2.2.2.2';
  if n <> 0 then raise exception 'VALIDATION FAIL: RPC inserted % rows for an invalid email', n; end if;
end $$;

-- ── contact_message (d): a DIRECT anon INSERT is denied (no anon INSERT policy) ─────────────────────
set local role anon;
do $$
declare ok int := 0;
begin
  begin
    insert into public.contact_message (gym_id, nombre, correo, mensaje)
      values (current_setting('t.gym_a', true)::uuid, 'Sneak', 's@x.mx', 'bypass');
    ok := 1;
  exception when others then ok := 0;
  end;
  if ok <> 0 then raise exception 'DENIAL FAIL: a raw anon INSERT into contact_message succeeded (must go through the RPC)'; end if;
end $$;
reset role;

-- ── contact_message (e): anon SELECT is denied (non-vacuous — rows exist) ──────────────────────────
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.contact_message;
  if n <> 0 then raise exception 'DENIAL FAIL: anon reads % contact_message rows (must be 0)', n; end if;
end $$;
reset role;

-- ── contact_message (f): member_a (gym A, non-staff) SELECT is denied ──────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.contact_message where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'DENIAL FAIL: member_a reads % contact_message rows (member read must be denied)', n; end if;
end $$;
reset role;

-- ── contact_message (g): staff owner_a reads its gym's rows and marks one read ──────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.contact_message where gym_id = current_setting('t.gym_a', true)::uuid;
  if n < 1 then raise exception 'GRANT FAIL: owner_a sees % contact_message rows (staff read expected >= 1)', n; end if;
  update public.contact_message set read_at = now() where id = current_setting('t.msg_id', true)::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'GRANT FAIL: owner_a mark-read hit % rows (expected 1)', n; end if;
end $$;
reset role;

-- ── contact_message (h): staff_b (gym B) is denied every read/update path into gym A's messages ────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.contact_message where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b sees % of gym A''s contact_message rows', n; end if;
  update public.contact_message set read_at = now() where id = current_setting('t.msg_id', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b marked-read % of gym A''s messages', n; end if;
end $$;
reset role;

-- ── gym_contact (curated/showcased class): member reads, member write denied, cross-tenant denied, anon reads ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.gym_contact where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'GRANT FAIL: member_a sees % gym_contact rows (expected 1, is_member_of read)', n; end if;
  update public.gym_contact set email = 'hacked@x.mx' where gym_id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: member_a updated % gym_contact rows (member write must be denied)', n; end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.gym_contact where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b (gym B) sees % of gym A''s gym_contact rows', n; end if;
  update public.gym_contact set email = 'hacked@x.mx' where gym_id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: staff_b updated % of gym A''s gym_contact rows', n; end if;
end $$;
reset role;

set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.gym_contact where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'ANON READ FAIL: anon reads % gym_contact rows (public contact surface, expected 1)', n; end if;
end $$;
reset role;

select 'contact intake matrix: OK' as result;
rollback;
