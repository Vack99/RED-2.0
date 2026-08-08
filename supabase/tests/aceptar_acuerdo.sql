-- Click-wrap acceptance evidence suite (issue #253; Gate 0.1 DB spine). Proves `aceptar_acuerdo`
-- and its evidence table obey the locked contract:
--   • V1 — an owner's first acceptance WRITES full evidence: gym stamp, documento, version, the
--     SHA-256 hash of the exact content passed (recomputed independently here and compared byte for
--     byte), accepting user, ip, user_agent, accepted_at.
--   • V2 — re-accepting the SAME (gym, documento, version) is a no-op: no second row, and the
--     ORIGINAL row's hash/ip stay untouched even when the re-accept call passes different content —
--     append-only, not last-write-wins.
--   • V3/V4 — an operator and a plain member are both refused; neither writes a row.
--   • V5 — a DIFFERENT gym's owner cannot accept on gym A's behalf (cross-tenant write denial).
--   • V6/V7 — cross-tenant + role READ denial: gym B's owner and gym A's own MEMBER both read zero
--     rows of gym A's evidence; gym A's OPERATOR (staff, not owner) reads it fine — the read gate is
--     "staff", the write gate is "owner", and they are deliberately different roles.
--   • V8 — gym_legal (the 1:1 legal-identity satellite) carries the same staff-scoped RLS: gym A's
--     owner can insert/read its own row; gym B's staff can neither read nor modify it.
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): two synthetic gyms, four auth.users, transaction-local
-- (BEGIN/ROLLBACK) so a preview branch is reusable and accumulates no state. Self-asserting: every
-- check RAISEs on failure; a clean run returns one 'OK' row.
--
-- HOW TO RUN: `node supabase/tests/run-denial-suite.mjs` (== `pnpm test:denial`), or ad hoc via the
-- Supabase MCP execute_sql (pure SQL, no psql meta).

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
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'aceptar-acuerdo-suite-gym-a', 'Acuerdo Suite A', 'America/Chihuahua', 'forge'),
    (gym_b, 'aceptar-acuerdo-suite-gym-b', 'Acuerdo Suite B', 'America/Chihuahua', 'forge');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', owner_a,    'authenticated', 'authenticated', 'owner-a@acuerdo-suite.local',    now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'operator-a@acuerdo-suite.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', member_a,   'authenticated', 'authenticated', 'member-a@acuerdo-suite.local',   now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', owner_b,    'authenticated', 'authenticated', 'owner-b@acuerdo-suite.local',    now(), '{}');

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

-- ══ V1 — owner's first acceptance: full evidence WRITTEN (gym, documento, version, hash, actor, ip, ua) ══
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g        uuid := current_setting('t.gym_a', true)::uuid;
  v_id     uuid;
  v_exist  boolean;
begin
  select id, ya_existia into v_id, v_exist from public.aceptar_acuerdo(
    g, 'anexo_tratamiento_datos', '1.0',
    'Contenido íntegro del Anexo de Tratamiento de Datos, versión 1.0.',
    '203.0.113.9', 'suite-agent/1.0');
  if v_exist then raise exception 'V1 FAIL: a first-ever acceptance reported ya_existia=true'; end if;
  if v_id is null then raise exception 'V1 FAIL: no id returned'; end if;
  perform set_config('t.acuerdo_id', v_id::text, true);
end $$;
reset role;

do $$
declare
  rec record;
  g               uuid := current_setting('t.gym_a', true)::uuid;
  u               uuid := current_setting('t.owner_a', true)::uuid;
  v_expected_hash text := encode(extensions.digest(
    'Contenido íntegro del Anexo de Tratamiento de Datos, versión 1.0.', 'sha256'), 'hex');
begin
  select * into rec from public.acuerdo_aceptacion where id = current_setting('t.acuerdo_id', true)::uuid;
  if rec.gym_id is distinct from g then raise exception 'V1 FAIL: gym_id not stamped (got %)', rec.gym_id; end if;
  if rec.documento is distinct from 'anexo_tratamiento_datos' then raise exception 'V1 FAIL: documento = %', rec.documento; end if;
  if rec.version is distinct from '1.0' then raise exception 'V1 FAIL: version = %', rec.version; end if;
  if rec.contenido_hash is distinct from v_expected_hash then
    raise exception 'V1 FAIL: contenido_hash = % expected % (RPC must hash the passed content)', rec.contenido_hash, v_expected_hash;
  end if;
  if rec.accepted_by is distinct from u then raise exception 'V1 FAIL: accepted_by = % expected %', rec.accepted_by, u; end if;
  if rec.ip is distinct from '203.0.113.9' then raise exception 'V1 FAIL: ip not persisted (%)', rec.ip; end if;
  if rec.user_agent is distinct from 'suite-agent/1.0' then raise exception 'V1 FAIL: user_agent not persisted (%)', rec.user_agent; end if;
  if rec.accepted_at is null then raise exception 'V1 FAIL: accepted_at not stamped'; end if;
end $$;

-- ══ V2 — re-accepting the SAME version is a no-op: no duplicate row, ORIGINAL evidence untouched ════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g       uuid := current_setting('t.gym_a', true)::uuid;
  v_id    uuid;
  v_exist boolean;
begin
  -- Deliberately DIFFERENT content + ip/ua than V1: proves a re-accept cannot overwrite the evidence.
  select id, ya_existia into v_id, v_exist from public.aceptar_acuerdo(
    g, 'anexo_tratamiento_datos', '1.0', 'Contenido DISTINTO — no debe sobrescribir nada.',
    '198.51.100.1', 'other-agent/9.9');
  if not v_exist then raise exception 'V2 FAIL: re-accepting the same version did not report ya_existia=true'; end if;
  if v_id is distinct from current_setting('t.acuerdo_id', true)::uuid then
    raise exception 'V2 FAIL: re-accept returned id % (expected the original %)', v_id, current_setting('t.acuerdo_id', true);
  end if;
end $$;
reset role;

do $$
declare
  n   int;
  rec record;
  g   uuid := current_setting('t.gym_a', true)::uuid;
  v_original_hash text := encode(extensions.digest(
    'Contenido íntegro del Anexo de Tratamiento de Datos, versión 1.0.', 'sha256'), 'hex');
begin
  select count(*) into n from public.acuerdo_aceptacion
    where gym_id = g and documento = 'anexo_tratamiento_datos' and version = '1.0';
  if n <> 1 then raise exception 'V2 FAIL: re-accepting the same version produced % row(s) (expected 1, append-only + unique per version)', n; end if;

  select * into rec from public.acuerdo_aceptacion where id = current_setting('t.acuerdo_id', true)::uuid;
  if rec.contenido_hash is distinct from v_original_hash then
    raise exception 'V2 FAIL: the original hash was overwritten (append-only violated): got %, expected %', rec.contenido_hash, v_original_hash;
  end if;
  if rec.ip is distinct from '203.0.113.9' then raise exception 'V2 FAIL: the original ip was overwritten (got %)', rec.ip; end if;
end $$;

-- ══ V3 — DENIAL: an operator (staff, not owner) is refused; writes nothing ══════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare got_error boolean := false;
begin
  begin
    perform public.aceptar_acuerdo(current_setting('t.gym_a', true)::uuid, 'anexo_tratamiento_datos', '2.0', 'Contenido v2', null, null);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V3 FAIL: an OPERATOR caller was allowed to accept'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion
    where gym_id = current_setting('t.gym_a', true)::uuid and version = '2.0';
  if n <> 0 then raise exception 'V3 FAIL: an operator''s rejected call still wrote % row(s)', n; end if;
end $$;

-- ══ V4 — DENIAL: a plain member is refused; writes nothing ══════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare got_error boolean := false;
begin
  begin
    perform public.aceptar_acuerdo(current_setting('t.gym_a', true)::uuid, 'anexo_tratamiento_datos', '3.0', 'Contenido v3', null, null);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V4 FAIL: a MEMBER caller was allowed to accept'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion
    where gym_id = current_setting('t.gym_a', true)::uuid and version = '3.0';
  if n <> 0 then raise exception 'V4 FAIL: a member''s rejected call still wrote % row(s)', n; end if;
end $$;

-- ══ V5 — DENIAL: gym B's owner cannot accept on gym A's behalf (cross-tenant write) ═════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare got_error boolean := false;
begin
  begin
    perform public.aceptar_acuerdo(current_setting('t.gym_a', true)::uuid, 'anexo_tratamiento_datos', '4.0', 'Contenido cross-tenant', null, null);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V5 FAIL: gym_b''s owner accepted on behalf of gym_a'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion
    where gym_id = current_setting('t.gym_a', true)::uuid and version = '4.0';
  if n <> 0 then raise exception 'V5 FAIL: the cross-tenant call still wrote % row(s)', n; end if;
end $$;

-- ══ V6/V7 — READ: staff of gym A see gym A's evidence; gym B staff and gym A's MEMBER see none ══════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'V6 FAIL: gym_a''s own OPERATOR (staff, not owner) could not read the evidence row (count=%)', n; end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'V6 FAIL: gym_b staff read % of gym_a''s evidence rows (cross-tenant)', n; end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'V7 FAIL: a plain MEMBER read % of the gym''s evidence rows (staff-only surface)', n; end if;
end $$;
reset role;

-- ══ V8 — gym_legal: staff insert/read their own row; a DIFFERENT gym's staff can neither read nor write it ══
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into public.gym_legal (gym_id, domicilio, email_arco, area_datos_personales)
    values (current_setting('t.gym_a', true)::uuid, 'Calle Falsa 123, Chihuahua, Chih.', 'datos@acuerdo-suite.local', 'Departamento de Datos Personales');
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.gym_legal where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'V8 FAIL: gym_b staff read % of gym_a''s gym_legal row', n; end if;
  -- RLS silently filters an UPDATE's target rows via USING — 0 rows matched, no exception expected.
  update public.gym_legal set domicilio = 'hijacked' where gym_id = current_setting('t.gym_a', true)::uuid;
end $$;
reset role;

do $$
declare rec record;
begin
  select * into rec from public.gym_legal where gym_id = current_setting('t.gym_a', true)::uuid;
  if rec.domicilio is distinct from 'Calle Falsa 123, Chihuahua, Chih.' then
    raise exception 'V8 FAIL: gym_legal row was modified by a cross-tenant caller (domicilio=%)', rec.domicilio;
  end if;
  if rec.email_arco is distinct from 'datos@acuerdo-suite.local' then
    raise exception 'V8 FAIL: email_arco not persisted (%)', rec.email_arco;
  end if;
end $$;

select 'aceptar_acuerdo suite: OK' as result;
rollback;
