-- preparar_invitacion / marcar_invitacion_enviada suite — slice S2 (issue #68; ADR-0015 · design §4).
--
-- Proves the staff-side invite RPCs obey the locked contract: preparar_invitacion is STAFF-ONLY (owner/
-- operator of the ROW's gym), lazily GENERATES a single-use claim_code when NULL and is IDEMPOTENT once a
-- code exists (same code returned, never regenerated), and returns the send payload {codigo, email, nombre,
-- gym_slug, gym_nombre, gym_id}. A member of the gym and an operator of ANOTHER gym are both denied.
-- marcar_invitacion_enviada stamps invitacion_enviada_at for staff and is likewise denied to non-staff.
--
-- Six named vectors: staff-prepares-lazy-gen, idempotent-second-call, member-denied, cross-gym-operator-
-- denied, staff-marks-enviada, member-mark-denied.
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): gym A is the forge spine seed; a synthetic gym B, all auth.users,
-- and the pre-seeded cliente are minted with gen_random_uuid(). Transaction-local (BEGIN/ROLLBACK) so the
-- branch is reusable with no reset. Self-asserting: every check RAISEs on failure; a clean run returns 'OK'.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs`, or ad hoc against any branch via
-- the Supabase MCP execute_sql (pure SQL — no psql meta-commands). NEVER against live: it mutates within a
-- rolled-back transaction only.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_a    uuid;
  gym_b    uuid := gen_random_uuid();
  op_a     uuid := gen_random_uuid();   -- owner/operator of gym A (staff)
  mem_a    uuid := gen_random_uuid();   -- member of gym A (NOT staff)
  op_b     uuid := gen_random_uuid();   -- operator of gym B (staff of the WRONG gym)
  c_a      uuid;                        -- an unclaimed gym-A cliente WITH an email, NULL claim_code
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'preparar-suite-gym-2', 'Preparar Suite Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_a,  'authenticated','authenticated','op-a@test.local',  now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', mem_a, 'authenticated','authenticated','mem-a@test.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', op_b,  'authenticated','authenticated','op-b@test.local',  now(), '{}');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a,  gym_a, 'operator'),
    (mem_a, gym_a, 'member'),
    (op_b,  gym_b, 'operator');

  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Socio Invitable', '6141230000', 5, 'socio@correo.mx', null)
    returning id into c_a;

  perform set_config('t.gym_a', gym_a::text, true);
  perform set_config('t.op_a',  op_a::text,  true);
  perform set_config('t.mem_a', mem_a::text, true);
  perform set_config('t.op_b',  op_b::text,  true);
  perform set_config('t.c_a',   c_a::text,   true);
end $$;

-- ══ V1 — staff prepares: lazy code-gen + full payload ═══════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  ca uuid := current_setting('t.c_a', true)::uuid;
  r  record;
  v_stored text;
begin
  select * into r from public.preparar_invitacion(ca);
  if r.codigo !~ '^[A-Z2-9]{8}$' then raise exception 'V1 FAIL: codigo % is not an 8-char A-Z/2-9 code', r.codigo; end if;
  if r.email is distinct from 'socio@correo.mx' then raise exception 'V1 FAIL: email payload wrong (%)', r.email; end if;
  if r.nombre is distinct from 'Socio Invitable' then raise exception 'V1 FAIL: nombre payload wrong (%)', r.nombre; end if;
  if r.gym_slug is distinct from 'forge' then raise exception 'V1 FAIL: gym_slug wrong (%)', r.gym_slug; end if;
  if r.gym_nombre is distinct from 'Forge' then raise exception 'V1 FAIL: gym_nombre (brand_name) wrong (%)', r.gym_nombre; end if;
  -- The code was persisted onto the row (lazy generation).
  select claim_code into v_stored from public.clientes where id = ca;
  if v_stored is distinct from r.codigo then raise exception 'V1 FAIL: code not persisted (stored=% returned=%)', v_stored, r.codigo; end if;
  perform set_config('t.code1', r.codigo, true);
end $$;
reset role;

-- ══ V2 — idempotent: a second call returns the SAME code (never regenerated once set) ═══════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  ca uuid := current_setting('t.c_a', true)::uuid;
  r  record;
begin
  select * into r from public.preparar_invitacion(ca);
  if r.codigo is distinct from current_setting('t.code1', true) then
    raise exception 'V2 FAIL: code regenerated (% -> %)', current_setting('t.code1', true), r.codigo;
  end if;
end $$;
reset role;

-- ══ V3 — member-denied: a member of the gym cannot prepare an invite ═══════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.mem_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare ca uuid := current_setting('t.c_a', true)::uuid; r record; got_error boolean := false;
begin
  begin
    select * into r from public.preparar_invitacion(ca);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V3 FAIL: a member must NOT be able to prepare an invite'; end if;
end $$;
reset role;

-- ══ V4 — cross-gym-operator-denied: staff of ANOTHER gym cannot prepare this gym's invite ══════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare ca uuid := current_setting('t.c_a', true)::uuid; r record; got_error boolean := false;
begin
  begin
    select * into r from public.preparar_invitacion(ca);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V4 FAIL: an operator of another gym must NOT prepare this invite'; end if;
end $$;
reset role;

-- ══ V5 — staff marks enviada: invitacion_enviada_at stamped for staff ══════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare ca uuid := current_setting('t.c_a', true)::uuid; v_at timestamptz;
begin
  perform public.marcar_invitacion_enviada(ca);
  select invitacion_enviada_at into v_at from public.clientes where id = ca;
  if v_at is null then raise exception 'V5 FAIL: invitacion_enviada_at not stamped'; end if;
end $$;
reset role;

-- ══ V6 — member-mark-denied: a member cannot stamp the send ════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.mem_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare ca uuid := current_setting('t.c_a', true)::uuid; got_error boolean := false;
begin
  begin
    perform public.marcar_invitacion_enviada(ca);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V6 FAIL: a member must NOT be able to mark an invite sent'; end if;
end $$;
reset role;

select 'preparar_invitacion suite: OK' as result;
rollback;
