-- class_session/reservation delete RESTRICT — attendance retention, epic #203 slice 4 (owner ruling
-- 2026-08-03; migration 20260803130000_asistencias_reservation_restrict_delete.sql).
--
-- Proves the three attendance-retention FKs actually REFUSE a delete now, not just that the DDL
-- parsed — the same posture asistencias_unicidad.sql takes for the origen/uniqueness invariants.
-- Vectors:
--   1) class_session with a dependent asistencia (class_session_id set) — DELETE raises 23503.
--   2) class_session with a dependent reservation only (no attendance yet) — DELETE raises 23503.
--   3) reservation with a dependent asistencia (reservation_id set) — DELETE raises 23503.
--   4) a SOFT-deleted asistencia still blocks — RESTRICT checks row EXISTENCE, not the business
--      `deleted_at` flag; a "removed" visit is still history and still a real child row.
--   5) once every dependent row is truly gone (deleted, not soft-deleted), the class_session and
--      reservation deletes succeed — proves RESTRICT is scoped to real dependents, not a lockout.
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): the gym and every row are minted with gen_random_uuid().
-- Transaction-local (BEGIN/ROLLBACK) so a scratch project is REUSABLE and accumulates no state. No
-- role switches: FK constraints bind regardless of RLS, so fixtures + assertions run as the
-- connecting role — this suite tests the SCHEMA, not an RPC.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into
-- SUITE — or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

do $$
declare
  v_gym    uuid := gen_random_uuid();
  v_ct     uuid := gen_random_uuid();
  v_sess_a uuid := gen_random_uuid();  -- gets a dependent asistencia
  v_sess_b uuid := gen_random_uuid();  -- gets a dependent reservation only
  v_sess_c uuid := gen_random_uuid();  -- clean control, never blocked
  v_cli    uuid;
  v_res    uuid;
  v_asis   uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (v_gym, 'restrict-delete-suite', 'Restrict Delete Suite', 'America/Mexico_City', 'base');

  insert into public.clientes (gym_id, nombre, tel, clases_restantes)
    values (v_gym, 'Restrict Fixture', '6141110099', 10) returning id into v_cli;

  insert into public.class_type (id, gym_id, name) values (v_ct, v_gym, 'Restrict WOD');
  insert into public.class_session (id, gym_id, class_type_id, starts_at, duration_min, capacity) values
    (v_sess_a, v_gym, v_ct, now(),                      60, 20),
    (v_sess_b, v_gym, v_ct, now() + interval '1 hour',  60, 20),
    (v_sess_c, v_gym, v_ct, now() + interval '2 hours', 60, 20);

  -- ── (1) class_session with a dependent asistencia ─────────────────────────────────
  insert into public.asistencias (gym_id, cliente_id, fecha, class_session_id, origen, consumio)
    values (v_gym, v_cli, current_date, v_sess_a, 'clase', true) returning id into v_asis;
  begin
    delete from public.class_session where id = v_sess_a;
    raise exception '(1) FAIL: class_session with a dependent asistencia was deleted';
  exception when foreign_key_violation then null;   -- expected 23503
  end;

  -- ── (2) class_session with a dependent reservation only ───────────────────────────
  insert into public.reservation (gym_id, class_session_id, member_id, status)
    values (v_gym, v_sess_b, v_cli, 'reservada') returning id into v_res;
  begin
    delete from public.class_session where id = v_sess_b;
    raise exception '(2) FAIL: class_session with a dependent reservation was deleted';
  exception when foreign_key_violation then null;   -- expected 23503
  end;

  -- ── (3) reservation with a dependent asistencia (reservation_id set) ──────────────
  update public.asistencias set reservation_id = v_res where id = v_asis;
  begin
    delete from public.reservation where id = v_res;
    raise exception '(3) FAIL: reservation with a dependent asistencia was deleted';
  exception when foreign_key_violation then null;   -- expected 23503
  end;

  -- ── (4) a SOFT-deleted asistencia still blocks — deleted_at is a business flag, ───
  --        not row absence; RESTRICT checks the row, not the flag.
  update public.asistencias set deleted_at = now() where id = v_asis;
  begin
    delete from public.class_session where id = v_sess_a;
    raise exception '(4) FAIL: class_session with a SOFT-DELETED dependent asistencia was deleted';
  exception when foreign_key_violation then null;   -- expected 23503
  end;

  -- ── (5) once every dependent row is truly gone, the deletes succeed ───────────────
  delete from public.asistencias where id = v_asis;       -- clears (1)/(3)/(4)'s blocker
  delete from public.class_session where id = v_sess_a;
  delete from public.reservation where id = v_res;         -- clears (2)'s blocker
  delete from public.class_session where id = v_sess_b;
  delete from public.class_session where id = v_sess_c;    -- the clean control

  perform 1 from public.class_session where gym_id = v_gym;
  if found then
    raise exception '(5) FAIL: a class_session survived the clean deletes';
  end if;
end $$;

select 'class_session delete restrict suite: OK' as result;
rollback;
