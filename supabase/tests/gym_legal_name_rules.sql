-- `gym.legal_name` staff-write suite (issue #255; Gate 0.1). Proves the grant+policy composition
-- 20260808130000 adds: staff of the row's own gym CAN update legal_name and the WRITTEN VALUE
-- persists; a plain member cannot; a DIFFERENT gym's staff cannot (0 rows, cross-tenant); and no
-- OTHER column on `gym` became writable through the new policy — a staff caller with a passing
-- is_staff_of(id) still cannot write a column that carries no UPDATE grant. Also proves the READ
-- side, `obtener_identidad_legal` (a SECURITY DEFINER function, not a column grant — see the
-- migration's "LIVE-MEASURED TRAP #2" comment for why a plain grant would have re-opened the
-- exact leak #213 closed): staff read their own gym's bundle (legal_name + the gym_legal
-- satellite's three columns in one call); a plain member and a cross-tenant staff caller are both
-- refused. `gym_legal`'s own direct-RLS read/write vectors already have a full suite
-- (aceptar_acuerdo.sql V8, #253) — not duplicated here. V9 (review round 2) proves `anon` cannot
-- write `legal_name` either — the ambient-grant landmine the same round's migration fix revoked.
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): two synthetic gyms, four auth.users, transaction-local
-- (BEGIN/ROLLBACK) so the scratch project stays reusable across runs. Self-asserting: every check
-- RAISEs on failure; a clean run returns one 'OK' row.
--
-- HOW TO RUN: `node supabase/tests/run-denial-suite.mjs` (== `pnpm test:denial`), or ad hoc via the
-- Supabase MCP execute_sql / apply-sql.mjs against a scratch project (pure SQL, no psql meta).

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_a      uuid := gen_random_uuid();
  gym_b      uuid := gen_random_uuid();
  owner_a    uuid := gen_random_uuid();
  operator_a uuid := gen_random_uuid();
  member_a   uuid := gen_random_uuid();
  owner_b    uuid := gen_random_uuid();  -- staff of gym_b only — every cross-tenant probe uses this actor
begin
  insert into public.gym (id, slug, brand_name, legal_name, timezone, brand_module_id) values
    (gym_a, 'gym-legal-name-suite-gym-a', 'Legal Name Suite A', 'Legal Name Suite A, S.A. de C.V.', 'America/Chihuahua', 'forge'),
    (gym_b, 'gym-legal-name-suite-gym-b', 'Legal Name Suite B', 'Legal Name Suite B, S.A. de C.V.', 'America/Chihuahua', 'forge');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', owner_a,    'authenticated', 'authenticated', 'owner-a@gym-legal-name-suite.local',    now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'operator-a@gym-legal-name-suite.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', member_a,   'authenticated', 'authenticated', 'member-a@gym-legal-name-suite.local',   now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', owner_b,    'authenticated', 'authenticated', 'owner-b@gym-legal-name-suite.local',    now(), '{}');

  insert into public.gym_membership (user_id, gym_id, role) values
    (owner_a,    gym_a, 'owner'),
    (operator_a, gym_a, 'operator'),
    (member_a,   gym_a, 'member'),
    (owner_b,    gym_b, 'owner');

  perform set_config('t.gym_a',      gym_a::text,      true);
  perform set_config('t.gym_b',      gym_b::text,      true);
  perform set_config('t.owner_a',    owner_a::text,    true);
  perform set_config('t.operator_a', operator_a::text, true);
  perform set_config('t.member_a',   member_a::text,   true);
  perform set_config('t.owner_b',    owner_b::text,    true);
end $$;

-- ══ V1 — staff OWNER can update their own gym's legal_name: the WRITTEN VALUE persists ══════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  update public.gym set legal_name = 'Gimnasio Legal Name Suite A, S.A. de C.V.'
    where id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'V1 FAIL: owner_a legal_name update affected % row(s) (expected 1)', n; end if;
end $$;
reset role;
do $$
declare rec record;
begin
  select * into rec from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if rec.legal_name is distinct from 'Gimnasio Legal Name Suite A, S.A. de C.V.' then
    raise exception 'V1 FAIL: legal_name = % (expected the value the owner wrote)', rec.legal_name;
  end if;
end $$;

-- ══ V2 — staff OPERATOR (not just owner) can also update it: the WRITTEN VALUE persists ═════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  update public.gym set legal_name = 'Legal Name Suite A Renombrada, S.A. de C.V.'
    where id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'V2 FAIL: operator_a legal_name update affected % row(s) (expected 1)', n; end if;
end $$;
reset role;
do $$
declare rec record;
begin
  select * into rec from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if rec.legal_name is distinct from 'Legal Name Suite A Renombrada, S.A. de C.V.' then
    raise exception 'V2 FAIL: legal_name = % (expected the value the operator wrote)', rec.legal_name;
  end if;
end $$;

-- ══ V3 — DENIAL: a plain member (non-staff) cannot update legal_name — 0 rows, value untouched ══════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  update public.gym set legal_name = 'Hacked by member' where id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'V3 FAIL: member_a legal_name update affected % row(s) (expected 0)', n; end if;
end $$;
reset role;
do $$
declare rec record;
begin
  select * into rec from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if rec.legal_name is distinct from 'Legal Name Suite A Renombrada, S.A. de C.V.' then
    raise exception 'V3 FAIL: legal_name was changed by a non-staff member (got %)', rec.legal_name;
  end if;
end $$;

-- ══ V4 — DENIAL: a DIFFERENT gym's staff cannot update gym A's legal_name — 0 rows, value untouched ═
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  update public.gym set legal_name = 'Hijacked by gym B' where id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'V4 FAIL: owner_b (cross-tenant) legal_name update affected % row(s) (expected 0)', n; end if;
end $$;
reset role;
do $$
declare rec record;
begin
  select * into rec from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if rec.legal_name is distinct from 'Legal Name Suite A Renombrada, S.A. de C.V.' then
    raise exception 'V4 FAIL: legal_name was changed by a cross-tenant staff caller (got %)', rec.legal_name;
  end if;
end $$;

-- ══ V5 — DENIAL: the new policy does NOT open any other column — a staff caller on their OWN gym ════
-- ══ still cannot write a column that carries no UPDATE grant (privilege, not row-match, blocks it) ══
-- Asserts the SQLSTATE (42501 = insufficient_privilege), not a bare `when others` — review finding
-- 9: a bare catch-all would read an unrelated error as a pass too. (This one was already saved by
-- its own paired value assertion below; asserting the code is belt-and-suspenders.)
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    update public.gym set owner_user_id = current_setting('t.owner_a', true)::uuid
      where id = current_setting('t.gym_a', true)::uuid;
    raise exception 'V5 FAIL: owner_a updated owner_user_id — a column with no UPDATE grant, on their own gym''s row';
  exception
    when insufficient_privilege then null; -- expected: 42501, no UPDATE grant on this column
  end;
end $$;
reset role;
do $$
declare rec record;
begin
  select * into rec from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if rec.owner_user_id is not null then
    raise exception 'V5 FAIL: owner_user_id is % (expected still null — the probed write must not have landed)', rec.owner_user_id;
  end if;
end $$;

-- ══ V6 — READ: obtener_identidad_legal returns the bundle (legal_name + gym_legal) for staff of ════
-- ══ their own gym, and denies both a plain member and a cross-tenant staff caller ══════════════════
-- Seed a gym_legal row for gym_a first, so the bundle has non-null values to assert on the SAME
-- write vectors gym_legal's own suite proves (aceptar_acuerdo.sql V8) — this suite's job is the
-- RPC's staff gate and its bundling, not gym_legal's RLS again.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into public.gym_legal (gym_id, domicilio, email_arco, area_datos_personales)
    values (current_setting('t.gym_a', true)::uuid, 'Calle Falsa 123, Chihuahua, Chih.', 'datos@gym-legal-name-suite.local', 'Departamento de Datos Personales');
end $$;
do $$
declare rec record;
begin
  select * into rec from public.obtener_identidad_legal(current_setting('t.gym_a', true)::uuid);
  if rec.razon_social is distinct from 'Legal Name Suite A Renombrada, S.A. de C.V.' then
    raise exception 'V6 FAIL: owner_a''s razon_social = % (expected the current legal_name)', rec.razon_social;
  end if;
  if rec.domicilio is distinct from 'Calle Falsa 123, Chihuahua, Chih.' then
    raise exception 'V6 FAIL: owner_a''s domicilio = % (expected the seeded gym_legal value)', rec.domicilio;
  end if;
  if rec.email_arco is distinct from 'datos@gym-legal-name-suite.local' then
    raise exception 'V6 FAIL: owner_a''s email_arco = % (expected the seeded gym_legal value)', rec.email_arco;
  end if;
end $$;
reset role;

-- ══ V7 — DENIAL: a plain member (non-staff) is refused by the RPC — no row, no leak ═════════════════
-- Asserts SQLSTATE P0001 (raise_exception) — the code the RPC's own `raise exception 'No
-- autorizado'` actually raises (plpgsql's default when no ERRCODE is given) — not a bare `when
-- others` (review finding 9: unlike V5, V7/V8 had no paired value assertion to catch a false pass).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.obtener_identidad_legal(current_setting('t.gym_a', true)::uuid);
    raise exception 'V7 FAIL: member_a (non-staff) was not refused by obtener_identidad_legal';
  exception
    when raise_exception then null; -- expected: P0001, the RPC's own 'No autorizado' raise
  end;
end $$;
reset role;

-- ══ V8 — DENIAL: a DIFFERENT gym's staff is refused when naming gym A — no row, no leak ═════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.obtener_identidad_legal(current_setting('t.gym_a', true)::uuid);
    raise exception 'V8 FAIL: owner_b (cross-tenant) was not refused reading gym_a''s identidad legal';
  exception
    when raise_exception then null; -- expected: P0001, the RPC's own 'No autorizado' raise
  end;
end $$;
reset role;

-- ══ V9 — DENIAL: anon cannot update legal_name either — closes the SAME ambient-grant landmine ══════
-- ══ the migration's review-round-2 fix revoked (finding 4), before #256 adds anon-facing policies ═══
-- No jwt claims to set — matches gym_tenant_anon_read.sql's own anon block (a true anon actor
-- carries none); the privilege check (no UPDATE grant at all for anon) fails before any RLS
-- predicate would even look at them.
set local role anon;
do $$
begin
  begin
    update public.gym set legal_name = 'Hacked by anon' where id = current_setting('t.gym_a', true)::uuid;
    raise exception 'V9 FAIL: anon updated legal_name — the anon revoke did not hold';
  exception
    when insufficient_privilege then null; -- expected: 42501, no UPDATE grant of any kind for anon
  end;
end $$;
reset role;
do $$
declare rec record;
begin
  select * into rec from public.gym where id = current_setting('t.gym_a', true)::uuid;
  if rec.legal_name is distinct from 'Legal Name Suite A Renombrada, S.A. de C.V.' then
    raise exception 'V9 FAIL: legal_name was changed by anon (got %)', rec.legal_name;
  end if;
end $$;

select 'gym legal_name staff-write suite: OK' as result;
rollback;
