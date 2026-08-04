-- asistencias_ultima_visita_por_cliente() denial + definition suite — #226 (E · VENTANA epic #222).
--
-- Self-asserting (RAISE on failure), transaction-local fixtures (gen_random_uuid, zero prod UUIDs),
-- BEGIN/ROLLBACK — mirrors mi_membresia_rules.sql / toggle_pase_gym2_timezone.sql. The RPC is a PURE
-- READER (no INSERT/UPDATE/DELETE) so it carries no supabase/tests/rpc-coverage.json obligation
-- (tools/guards/rpc-write-coverage.test.ts's "no pure reader" rule) — only the drift guard applies,
-- via this file's SUITE registration in run-denial-suite.mjs.
--
-- Vectors proved:
--   TENANT SCOPING (#203's "no auth-derived gym roulette")
--     1) op_a (staff of gym_a ONLY) calling with p_gym_id = gym_b.id gets ZERO rows — never gym_b's
--        clientes, and never an exception that would leak "gym_b exists". Symmetric: op_b calling with
--        p_gym_id = gym_a.id also gets zero rows.
--     2) op_a's own gym (p_gym_id = gym_a.id) returns exactly gym_a's clientes; op_b's own gym returns
--        exactly gym_b's — proving the empty result above is SCOPING, not "the RPC returns nothing".
--     3) anon cannot EXECUTE the function at all (no grant) — a stricter denial than RLS-empty.
--   THE CONSUMING-VISIT DEFINITION (comment obligation 2 of #226 — TWO facts, not one)
--     4) a consumio=false visit moves `ultima_visita` (the AUSENTE clock) but NOT
--        `ultima_visita_consumida` (the CLASES clock) — a walk-in / booked-branch mark must never
--        reset the clases clock.
--     5) a deleted_at IS NOT NULL row (an undone toggle) moves NEITHER fact, even when it is
--        chronologically the latest and would-be-consuming.
--     6) a perdonada=true row (the cooldown's "second record of one arrival" stamp, 20260729120000) is
--        INCLUDED in `ultima_visita` — the RPC does NOT filter `not perdonada` on that arm, on purpose:
--        it is not a load-bearing no-op the way #173's mi_membresia_visit_count's `not perdonada` is for
--        a VISIT COUNT. See vector 8 (the orphaned pardon) for why excluding it would be a live bug.
--     7) an ILIMITADO cliente (forge-shaped: dual-surface door + class visits, the fixture debt #222
--        names) can show a real `ultima_visita` with `ultima_visita_consumida` NULL — ilimitado never
--        sets consumio=true (rules.ts/the RPC bodies decrement only a finite balance), so this is the
--        aggregate honestly reporting the underlying data, not a bug.
--     8) THE ORPHANED PARDON (20260728121000:39-45, reprised 20260729120000:753-756): a class mark that
--        pardoned a door check-in is later undone (soft-deleted) by the operator, leaving the pardoned
--        row — perdonada=true, still active — as the ONLY surviving row on its fecha. `ultima_visita`
--        MUST still return that fecha (the member genuinely trained that day); a `not perdonada` filter
--        would silently drop the date and understate absence. `ultima_visita_consumida` is unaffected
--        (the orphaned row is consumio=false and was never counted there).
--     9) a cliente with ZERO asistencias rows is ABSENT from the result set entirely (no row, not a row
--        of nulls) — the RPC groups over matching rows only, it never LEFT JOINs against clientes.
--    10) a cliente whose ONLY rows are soft-deleted is likewise ABSENT, not present with null facts —
--        same mechanism as vector 9, proving deleted_at exclusion can empty a cliente out of the result
--        entirely, not just null out one fact.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into
-- SUITE — or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ──────────────────────────────────────
do $$
declare
  gym_a  uuid := gen_random_uuid();
  gym_b  uuid := gen_random_uuid();
  op_a   uuid := gen_random_uuid();
  op_b   uuid := gen_random_uuid();
  c1     uuid;  -- gym_a, finite class pack — vectors 4/5/6
  c2     uuid;  -- gym_a, ilimitado, forge-shaped dual-surface mix — vector 7
  c3     uuid;  -- gym_a, ZERO asistencias rows — vector 9
  c4     uuid;  -- gym_a, only soft-deleted rows — vector 10
  c5     uuid;  -- gym_a, the orphaned pardon — vector 8 (F1's fix)
  c_b    uuid;  -- gym_b — tenant-scoping positive control
  v_ct   uuid;
  s1     uuid; s2 uuid; s3 uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'uv-gym-a', 'UV Gym A', 'America/Chihuahua', 'base'),
    (gym_b, 'uv-gym-b', 'UV Gym B', 'America/Chihuahua', 'base');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op_a, 'authenticated', 'authenticated', 'uv-op-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', op_b, 'authenticated', 'authenticated', 'uv-op-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_b, gym_b, 'operator');

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('UV finito', '0000000001', 5, current_date + 20, '8 clases', gym_a) returning id into c1;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('UV ilimitado', '0000000002', null, current_date + 20, 'Ilimitado', gym_a) returning id into c2;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('UV cero visitas', '0000000004', 5, current_date + 20, '8 clases', gym_a) returning id into c3;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('UV solo borradas', '0000000005', 5, current_date + 20, '8 clases', gym_a) returning id into c4;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('UV perdon huerfano', '0000000006', 5, current_date + 20, '8 clases', gym_a) returning id into c5;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('UV gym B', '0000000003', 5, current_date + 20, '8 clases', gym_b) returning id into c_b;

  -- One class_type + three sessions (gym_a), so a 'clase'-origin row is a real FK, not a null shortcut —
  -- proving the aggregate is genuinely ALL-ORIGINS, not accidentally libre-only.
  insert into public.class_type (gym_id, name) values (gym_a, 'UV Metcon') returning id into v_ct;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct, now() + interval '2 days', 60, 20) returning id into s1;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct, now() + interval '2 days' + interval '1 hour', 60, 20) returning id into s2;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, v_ct, now() + interval '2 days' + interval '2 hours', 60, 20) returning id into s3;

  -- ── c1 (finite): the consuming-visit definition, in one member ──────────────────────────────────
  -- r1: earliest, LIBRE, consumio=true — the ONLY row that should feed ultima_visita_consumida.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c1, '2026-06-01', true, 'libre', null, null, false);
  -- r2: later, CLASE (booked branch), consumio=false — moves ultima_visita, must NOT move consumida.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c1, '2026-06-15', false, 'clase', s1, null, false);
  -- r3: SAME fecha as r2 — the cooldown's pair row (a door check-in minutes either side of the class),
  -- perdonada=true, consumio=false. INCLUDED in ultima_visita (vector 6 — the RPC does not filter
  -- perdonada on that arm); harmless here regardless because r2 already supplies 2026-06-15 to both
  -- facts — vector 8 (c5, below) is the fixture that actually DISTINGUISHES filtered from unfiltered.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c1, '2026-06-15', false, 'libre', null, null, true);
  -- r4: LATEST by fecha AND consumio=true, but SOFT-DELETED (an undone toggle) — must move NEITHER
  -- fact (vector 5). Without the deleted_at filter this would wrongly become both facts' answer.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c1, '2026-06-25', true, 'libre', null, now(), false);

  -- ── c2 (ilimitado, forge-shaped dual-surface mix): vector 7 ─────────────────────────────────────
  -- r1: CLASE (booked branch, ilimitado never consumes → consumio=false by construction).
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c2, '2026-07-01', false, 'clase', s2, null, false);
  -- r2: LIBRE (walk-in door check-in, ilimitado never consumes → consumio=false).
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c2, '2026-07-05', false, 'libre', null, null, false);

  -- ── c3 (gym_a, ZERO asistencias rows): vector 9 — no rows inserted at all.

  -- ── c4 (gym_a, only soft-deleted rows): vector 10 — a real visit that was fully undone. ─────────
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c4, '2026-06-10', true, 'libre', null, now(), false);

  -- ── c5 (the orphaned pardon, F1's fix): vector 8 ────────────────────────────────────────────────
  -- r1: an earlier, unrelated REAL consuming visit — the baseline ultima_visita_consumida (2026-05-01),
  -- so the orphaned-pardon row below can be proven NOT to disturb it.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c5, '2026-05-01', true, 'libre', null, null, false);
  -- r2: the PARDONING sibling — a class mark on 2026-05-10 that originally pardoned a door check-in
  -- minutes apart (r3). The operator later UNTOGGLES it (soft-deletes it): the refund fires elsewhere,
  -- the class row is gone, but r3's perdonada=true stamp is never revisited (20260728121000:39-45).
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c5, '2026-05-10', true, 'clase', s3, now(), false);
  -- r3: SAME fecha as r2 (2026-05-10) — the surviving PARDONED row: perdonada=true, consumio=false,
  -- ACTIVE (deleted_at null). With r2 gone, this is now the ONLY active row on 2026-05-10 — the exact
  -- orphaned-pardon shape. ultima_visita MUST read 2026-05-10 (not 2026-05-01): the member genuinely
  -- trained that day, and a `not perdonada` filter would silently drop it.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_a, c5, '2026-05-10', false, 'libre', null, null, true);

  -- ── c_b (gym_b): the tenant-scoping positive control on the OTHER gym ───────────────────────────
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, origen, class_session_id, deleted_at, perdonada)
    values (gym_b, c_b, '2026-08-01', true, 'libre', null, null, false);

  perform set_config('t.gym_a', gym_a::text, true);
  perform set_config('t.gym_b', gym_b::text, true);
  perform set_config('t.op_a',  op_a::text,  true);
  perform set_config('t.op_b',  op_b::text,  true);
  perform set_config('t.c1',    c1::text,    true);
  perform set_config('t.c2',    c2::text,    true);
  perform set_config('t.c3',    c3::text,    true);
  perform set_config('t.c4',    c4::text,    true);
  perform set_config('t.c5',    c5::text,    true);
  perform set_config('t.c_b',   c_b::text,   true);
end $$;

-- ── anon: cannot execute the function at all (no EXECUTE grant) ──
set local role anon;
do $$
declare raised boolean := false;
begin
  begin perform public.asistencias_ultima_visita_por_cliente(current_setting('t.gym_a', true)::uuid);
  exception when others then raised := true; end;
  if not raised then raise exception 'ANON DENIAL FAIL: anon executed asistencias_ultima_visita_por_cliente'; end if;
end $$;
reset role;

-- ── op_a: own gym returns both clientes with the exact facts (the definition vectors) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  c1    uuid := current_setting('t.c1', true)::uuid;
  c2    uuid := current_setting('t.c2', true)::uuid;
  c3    uuid := current_setting('t.c3', true)::uuid;
  c4    uuid := current_setting('t.c4', true)::uuid;
  c5    uuid := current_setting('t.c5', true)::uuid;
  n     int;
  r1    record;
  r2    record;
  r5    record;
begin
  -- 3 clientes have at least one matching row (c1, c2, c5); c3 (zero rows) and c4 (only soft-deleted)
  -- are ABSENT entirely — vectors 9/10.
  select count(*) into n from public.asistencias_ultima_visita_por_cliente(gym_a);
  if n <> 3 then raise exception 'OWN-GYM FAIL: expected 3 clientes for gym_a (c1/c2/c5 — c3/c4 absent), got %', n; end if;

  select * into r1 from public.asistencias_ultima_visita_por_cliente(gym_a) where cliente_id = c1;
  if r1.ultima_visita is distinct from date '2026-06-15' then
    raise exception 'VECTOR 4/6 FAIL: c1 ultima_visita % (expected 2026-06-15 — the consumio=false row; its perdonada pair is included but harmless here)', r1.ultima_visita;
  end if;
  if r1.ultima_visita_consumida is distinct from date '2026-06-01' then
    raise exception 'VECTOR 4/5 FAIL: c1 ultima_visita_consumida % (expected 2026-06-01 — a consumio=false mark and a soft-deleted row must not move it)', r1.ultima_visita_consumida;
  end if;

  select * into r2 from public.asistencias_ultima_visita_por_cliente(gym_a) where cliente_id = c2;
  if r2.ultima_visita is distinct from date '2026-07-05' then
    raise exception 'VECTOR 7 FAIL: c2 (ilimitado) ultima_visita % (expected 2026-07-05)', r2.ultima_visita;
  end if;
  if r2.ultima_visita_consumida is not null then
    raise exception 'VECTOR 7 FAIL: c2 (ilimitado) ultima_visita_consumida % (expected NULL — ilimitado never sets consumio=true)', r2.ultima_visita_consumida;
  end if;

  -- vector 9: a cliente with ZERO asistencias rows is entirely ABSENT — no row, not a row of nulls.
  if exists (select 1 from public.asistencias_ultima_visita_por_cliente(gym_a) where cliente_id = c3) then
    raise exception 'VECTOR 9 FAIL: c3 (zero asistencias rows) appeared in the result set — expected absent';
  end if;

  -- vector 10: a cliente whose ONLY rows are soft-deleted is likewise ABSENT, not present with nulls.
  if exists (select 1 from public.asistencias_ultima_visita_por_cliente(gym_a) where cliente_id = c4) then
    raise exception 'VECTOR 10 FAIL: c4 (only soft-deleted rows) appeared in the result set — expected absent';
  end if;

  -- vector 8: the orphaned pardon (F1's fix). c5's pardoning sibling (2026-05-10, 'clase') was
  -- soft-deleted; the surviving perdonada=true row is the ONLY active row on that date, and
  -- ultima_visita MUST still report it — the exact regression `not perdonada` would reintroduce.
  select * into r5 from public.asistencias_ultima_visita_por_cliente(gym_a) where cliente_id = c5;
  if r5.ultima_visita is distinct from date '2026-05-10' then
    raise exception 'VECTOR 8 FAIL (F1): c5 ultima_visita % (expected 2026-05-10 — the orphaned pardon must still count as a visit, not be filtered out)', r5.ultima_visita;
  end if;
  if r5.ultima_visita_consumida is distinct from date '2026-05-01' then
    raise exception 'VECTOR 8 FAIL (F1): c5 ultima_visita_consumida % (expected 2026-05-01 — the orphaned pardon is consumio=false and its soft-deleted sibling must not resurrect 2026-05-10 here)', r5.ultima_visita_consumida;
  end if;

  -- ── tenant scoping (vector 1): op_a passing gym_b's id gets NOTHING, not gym_b's row ──
  select count(*) into n from public.asistencias_ultima_visita_por_cliente(current_setting('t.gym_b', true)::uuid);
  if n <> 0 then raise exception 'TENANT SCOPING FAIL: op_a (staff of gym_a only) read % row(s) for gym_b', n; end if;
end $$;
reset role;

-- ── op_b: own gym (gym_b) returns exactly c_b — the scoping is symmetric, not "always empty" ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
  c_b   uuid := current_setting('t.c_b', true)::uuid;
  n     int;
  r     record;
begin
  select count(*) into n from public.asistencias_ultima_visita_por_cliente(gym_b);
  if n <> 1 then raise exception 'OWN-GYM FAIL: expected 1 cliente for gym_b, got %', n; end if;

  select * into r from public.asistencias_ultima_visita_por_cliente(gym_b) where cliente_id = c_b;
  if r.ultima_visita is distinct from date '2026-08-01' then
    raise exception 'OWN-GYM FAIL: c_b ultima_visita % (expected 2026-08-01)', r.ultima_visita;
  end if;
  if r.ultima_visita_consumida is distinct from date '2026-08-01' then
    raise exception 'OWN-GYM FAIL: c_b ultima_visita_consumida % (expected 2026-08-01 — a real consuming visit)', r.ultima_visita_consumida;
  end if;

  -- ── tenant scoping (vector 1, symmetric): op_b passing gym_a's id gets NOTHING ──
  select count(*) into n from public.asistencias_ultima_visita_por_cliente(current_setting('t.gym_a', true)::uuid);
  if n <> 0 then raise exception 'TENANT SCOPING FAIL: op_b (staff of gym_b only) read % row(s) for gym_a', n; end if;
end $$;
reset role;

select 'asistencias_ultima_visita_por_cliente rules: OK' as result;
rollback;
