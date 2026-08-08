-- Click-wrap acceptance evidence suite (issue #253; Gate 0.1 DB spine). Proves `aceptar_acuerdo`
-- and its evidence table obey the locked contract:
--   • V1 — an owner's first acceptance WRITES full evidence: gym stamp, documento, version, the
--     SHA-256 hash of the exact content passed (recomputed independently here and compared byte for
--     byte), accepting user + its EMAIL SNAPSHOT, ip, user_agent, accepted_at — and the RPC's
--     returned `contenido_hash` matches the stored one.
--   • V2 — re-accepting the SAME (gym, documento, version) is a no-op: no second row, and the
--     ORIGINAL row's hash/ip stay untouched even when the re-accept call passes different content —
--     append-only, not last-write-wins — AND the returned `contenido_hash` is the STORED (original)
--     one, not a hash of the new content, so a caller can detect drift (document edited without a
--     version bump) by comparing it against a fresh hash of what it just tried to submit.
--   • V3 — NO DIRECT CLIENT WRITES: the table's entire security model is "zero write policies";
--     gym A's OWNER (who holds staff SELECT — the most plausible leak) cannot INSERT/UPDATE/DELETE
--     it directly, and the V1 row is provably unchanged afterward.
--   • V4/V5 — an operator and a plain member are both refused via the RPC; neither writes a row.
--   • V6 — a DIFFERENT gym's owner cannot accept on gym A's behalf (cross-tenant write denial).
--   • V7 — cross-tenant + role READ denial: gym B's owner and gym A's own MEMBER both read zero
--     rows of gym A's evidence; gym A's OPERATOR (staff, not owner) reads it fine — the read gate is
--     "staff", the write gate is "owner", and they are deliberately different roles.
--   • V8 — gym_legal (the 1:1 legal-identity satellite) carries the same staff-scoped RLS: gym A's
--     owner can insert/read its own row; gym B's staff can neither INSERT, SELECT, UPDATE, nor
--     DELETE it.
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

-- ══ V1 — owner's first acceptance: full evidence WRITTEN (gym, documento, version, hash, actor, email, ip, ua) ══
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g        uuid := current_setting('t.gym_a', true)::uuid;
  v_id     uuid;
  v_exist  boolean;
  v_ret_hash text;
  v_expected_hash text := encode(extensions.digest(
    'Contenido íntegro del Anexo de Tratamiento de Datos, versión 1.0.', 'sha256'), 'hex');
begin
  select id, ya_existia, contenido_hash into v_id, v_exist, v_ret_hash from public.aceptar_acuerdo(
    g, 'anexo_tratamiento_datos', '1.0',
    'Contenido íntegro del Anexo de Tratamiento de Datos, versión 1.0.',
    '203.0.113.9', 'suite-agent/1.0');
  if v_exist then raise exception 'V1 FAIL: a first-ever acceptance reported ya_existia=true'; end if;
  if v_id is null then raise exception 'V1 FAIL: no id returned'; end if;
  if v_ret_hash is distinct from v_expected_hash then
    raise exception 'V1 FAIL: returned contenido_hash = % expected %', v_ret_hash, v_expected_hash;
  end if;
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
  if rec.accepted_by_email is distinct from 'owner-a@acuerdo-suite.local' then
    raise exception 'V1 FAIL: accepted_by_email snapshot = % expected owner-a@acuerdo-suite.local', rec.accepted_by_email;
  end if;
  if rec.ip is distinct from '203.0.113.9' then raise exception 'V1 FAIL: ip not persisted (%)', rec.ip; end if;
  if rec.user_agent is distinct from 'suite-agent/1.0' then raise exception 'V1 FAIL: user_agent not persisted (%)', rec.user_agent; end if;
  if rec.accepted_at is null then raise exception 'V1 FAIL: accepted_at not stamped'; end if;
end $$;

-- ══ V2 — re-accepting the SAME version is a no-op: no duplicate row, ORIGINAL evidence untouched, ══
-- ══ and the returned hash lets a caller detect drift ════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g       uuid := current_setting('t.gym_a', true)::uuid;
  v_id    uuid;
  v_exist boolean;
  v_ret_hash text;
  v_original_hash text := encode(extensions.digest(
    'Contenido íntegro del Anexo de Tratamiento de Datos, versión 1.0.', 'sha256'), 'hex');
  v_new_content_hash text := encode(extensions.digest(
    'Contenido DISTINTO — no debe sobrescribir nada.', 'sha256'), 'hex');
begin
  -- Deliberately DIFFERENT content + ip/ua than V1: proves a re-accept cannot overwrite the evidence.
  select id, ya_existia, contenido_hash into v_id, v_exist, v_ret_hash from public.aceptar_acuerdo(
    g, 'anexo_tratamiento_datos', '1.0', 'Contenido DISTINTO — no debe sobrescribir nada.',
    '198.51.100.1', 'other-agent/9.9');
  if not v_exist then raise exception 'V2 FAIL: re-accepting the same version did not report ya_existia=true'; end if;
  if v_id is distinct from current_setting('t.acuerdo_id', true)::uuid then
    raise exception 'V2 FAIL: re-accept returned id % (expected the original %)', v_id, current_setting('t.acuerdo_id', true);
  end if;
  -- Drift detection: the RPC must return the STORED (original) hash, not a hash of the new content.
  if v_ret_hash is distinct from v_original_hash then
    raise exception 'V2 FAIL: re-accept returned hash % expected the STORED original %', v_ret_hash, v_original_hash;
  end if;
  if v_ret_hash = v_new_content_hash then
    raise exception 'V2 FAIL: re-accept returned a hash of the NEW content — drift would be undetectable';
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

-- ══ V3 — NO DIRECT CLIENT WRITES: the table's whole security model is zero write policies ═══════════
-- Owner_a holds staff SELECT on this table (the most plausible leak vector) — prove that access does
-- NOT extend to INSERT/UPDATE/DELETE. House idiom (gym_membership_rls.sql:126,136,144): INSERT
-- raises under default-deny; UPDATE/DELETE affect 0 rows (RLS filters the target set to nothing
-- rather than raising) — either shape counts as denied.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  -- INSERT: no write policy → default-deny raises. Valid values throughout (incl. a well-formed hex
  -- hash) so a denial can only be the RLS default-deny, never a check-constraint failure.
  n := 1;
  begin
    insert into public.acuerdo_aceptacion (gym_id, documento, version, contenido_hash, accepted_by_email)
      values (current_setting('t.gym_a', true)::uuid, 'direct-insert-probe', '1.0', repeat('a', 64), 'attacker@acuerdo-suite.local');
    n := 0;  -- reached only if NOT denied
  exception when others then n := -1;
  end;
  if n <> -1 then raise exception 'V3 FAIL: authenticated direct INSERT on acuerdo_aceptacion was not denied'; end if;

  -- UPDATE: no write policy → 0 rows affected (or a raised error).
  begin
    update public.acuerdo_aceptacion set contenido_hash = repeat('b', 64);
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'V3 FAIL: authenticated direct UPDATE on acuerdo_aceptacion changed % rows', n; end if;

  -- DELETE: no write policy → 0 rows affected (or a raised error).
  begin
    delete from public.acuerdo_aceptacion;
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'V3 FAIL: authenticated direct DELETE on acuerdo_aceptacion removed % rows', n; end if;
end $$;
reset role;

do $$
declare rec record;
begin
  -- The V1/V2 row survives, untouched: proves the UPDATE/DELETE above were true no-ops.
  select * into rec from public.acuerdo_aceptacion where id = current_setting('t.acuerdo_id', true)::uuid;
  if rec.id is null then raise exception 'V3 FAIL: the evidence row is gone after the direct-write probes'; end if;
  if rec.contenido_hash = repeat('b', 64) then raise exception 'V3 FAIL: the direct UPDATE silently changed the row'; end if;
  if exists (select 1 from public.acuerdo_aceptacion where documento = 'direct-insert-probe') then
    raise exception 'V3 FAIL: the direct INSERT silently created a row';
  end if;
end $$;

-- ══ V4 — DENIAL: an operator (staff, not owner) is refused via the RPC; writes nothing ══════════════
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
  if not got_error then raise exception 'V4 FAIL: an OPERATOR caller was allowed to accept'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion
    where gym_id = current_setting('t.gym_a', true)::uuid and version = '2.0';
  if n <> 0 then raise exception 'V4 FAIL: an operator''s rejected call still wrote % row(s)', n; end if;
end $$;

-- ══ V5 — DENIAL: a plain member is refused via the RPC; writes nothing ══════════════════════════════
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
  if not got_error then raise exception 'V5 FAIL: a MEMBER caller was allowed to accept'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion
    where gym_id = current_setting('t.gym_a', true)::uuid and version = '3.0';
  if n <> 0 then raise exception 'V5 FAIL: a member''s rejected call still wrote % row(s)', n; end if;
end $$;

-- ══ V6 — DENIAL: gym B's owner cannot accept on gym A's behalf (cross-tenant write) ═════════════════
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
  if not got_error then raise exception 'V6 FAIL: gym_b''s owner accepted on behalf of gym_a'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion
    where gym_id = current_setting('t.gym_a', true)::uuid and version = '4.0';
  if n <> 0 then raise exception 'V6 FAIL: the cross-tenant call still wrote % row(s)', n; end if;
end $$;

-- ══ V7 — READ: staff of gym A see gym A's evidence; gym B staff and gym A's MEMBER see none ═════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 1 then raise exception 'V7 FAIL: gym_a''s own OPERATOR (staff, not owner) could not read the evidence row (count=%)', n; end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.acuerdo_aceptacion where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'V7 FAIL: gym_b staff read % of gym_a''s evidence rows (cross-tenant)', n; end if;
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

-- ══ V8 — gym_legal: staff insert/read their own row; a DIFFERENT gym's staff can neither read nor ═══
-- ══ write it (SELECT, INSERT, UPDATE, DELETE all denied) ═════════════════════════════════════════════
-- Cross-tenant INSERT is probed FIRST, before gym_a has a row, so a denial can only be RLS default-
-- deny — never confounded with the gym_id primary key already being taken.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare got_error boolean := false;
begin
  begin
    insert into public.gym_legal (gym_id, domicilio) values (current_setting('t.gym_a', true)::uuid, 'hijack-insert');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V8 FAIL: gym_b staff inserted a gym_legal row for gym_a'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.gym_legal where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'V8 FAIL: the cross-tenant INSERT silently created % row(s)', n; end if;
end $$;

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
  -- SELECT
  select count(*) into n from public.gym_legal where gym_id = current_setting('t.gym_a', true)::uuid;
  if n <> 0 then raise exception 'V8 FAIL: gym_b staff read % of gym_a''s gym_legal row', n; end if;
  -- UPDATE: RLS USING filters the target to 0 rows — no exception expected, just 0 rows affected.
  update public.gym_legal set domicilio = 'hijacked' where gym_id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'V8 FAIL: gym_b staff UPDATE affected % row(s) of gym_a''s gym_legal row', n; end if;
  -- DELETE: same shape as UPDATE — RLS USING filters to 0 rows.
  delete from public.gym_legal where gym_id = current_setting('t.gym_a', true)::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'V8 FAIL: gym_b staff DELETE removed % row(s) of gym_a''s gym_legal row', n; end if;
end $$;
reset role;

do $$
declare rec record;
begin
  select * into rec from public.gym_legal where gym_id = current_setting('t.gym_a', true)::uuid;
  if rec.gym_id is null then raise exception 'V8 FAIL: gym_a''s gym_legal row is gone after the cross-tenant probes'; end if;
  if rec.domicilio is distinct from 'Calle Falsa 123, Chihuahua, Chih.' then
    raise exception 'V8 FAIL: gym_legal row was modified by a cross-tenant caller (domicilio=%)', rec.domicilio;
  end if;
  if rec.email_arco is distinct from 'datos@acuerdo-suite.local' then
    raise exception 'V8 FAIL: email_arco not persisted (%)', rec.email_arco;
  end if;
end $$;

select 'aceptar_acuerdo suite: OK' as result;
rollback;
