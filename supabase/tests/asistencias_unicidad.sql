-- asistencias visit-ledger invariants (migration 20260728120000; issue #89 slice 1).
--
-- The three guards #89 deletes from toggle_pase / pasar_lista_sesion were the ONLY thing keeping a
-- duplicate attendance row out of the ledger. They are replaced by database invariants, so this
-- suite proves the invariants BITE against real writes rather than that the DDL parsed:
--   (a) one active visit per (member, CLASS)   — a second row for the same (cliente, class_session)
--                                                raises 23505 (asistencias_sesion_cliente_activa_uq).
--   (b) two DIFFERENT classes the same day are LEGAL — the #89 headline at the schema layer: the
--                                                unit is the class instance, never the day (R1).
--   (c) one active ACCESO LIBRE visit per (member, DAY) — a second class-less row on the same
--                                                (cliente, fecha) raises 23505
--                                                (asistencias_cliente_fecha_libre_uq), while it
--                                                coexists happily with (a)/(b)'s class rows.
--   (d) a soft-deleted row NEVER blocks a re-insert — both indexes are partial on
--                                                `deleted_at is null`, so undo-then-re-mark works
--                                                on both shapes (tap-again undo is the whole UI).
--   (e) origen states a KIND that cannot contradict its context — 'clase' with a NULL session and
--                                                'libre' with a session are both rejected
--                                                (asistencias_origen_kind_ck), an unknown origen is
--                                                rejected (asistencias_origen_ck), and NULL origen
--                                                still inserts (pre-#89 rows keep provenance
--                                                UNKNOWN — no backfill, see the migration header).
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): the gym and every row are minted with gen_random_uuid().
-- Transaction-local (BEGIN/ROLLBACK) so a scratch project is REUSABLE and accumulates no state. No
-- role switches: CHECK/UNIQUE/FK bind regardless of RLS, so fixtures + assertions run as the
-- connecting role — this suite tests the SCHEMA, not the RPCs (those are pasar_lista_sesion_rules
-- and toggle_pase_rules). Self-asserting: each expected rejection is caught by SQLSTATE class (any
-- other error propagates and fails the run); a missed rejection RAISEs. A clean run returns one 'OK'.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into
-- SUITE — or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

do $$
declare
  v_gym   uuid := gen_random_uuid();
  v_ct    uuid := gen_random_uuid();
  v_sess  uuid := gen_random_uuid();
  v_sess2 uuid := gen_random_uuid();
  v_cli   uuid;   -- the member every uniqueness vector writes for
  v_cli2  uuid;   -- a clean member for the CHECK vectors (no rows ⇒ no index can fire first)
  v_hoy   date := (now() at time zone 'America/Mexico_City')::date;
  v_asis  uuid;
  v_n     int;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (v_gym, 'asistencias-unicidad-suite', 'Asistencias Unicidad Suite', 'America/Mexico_City', 'base');

  insert into public.clientes (gym_id, nombre, tel, clases_restantes)
    values (v_gym, 'Uni Fixture', '6141110001', 5) returning id into v_cli;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes)
    values (v_gym, 'Uni Checks', '6141110002', 5) returning id into v_cli2;

  insert into public.class_type (id, gym_id, name) values (v_ct, v_gym, 'Uni WOD');
  insert into public.class_session (id, gym_id, class_type_id, starts_at, duration_min, capacity) values
    (v_sess,  v_gym, v_ct, now(),                       60, 20),
    (v_sess2, v_gym, v_ct, now() + interval '2 hours',  60, 20);

  -- ── (a) one active visit per (member, class) ──────────────────────────────────────
  insert into public.asistencias (gym_id, cliente_id, fecha, class_session_id, origen, consumio)
    values (v_gym, v_cli, v_hoy, v_sess, 'clase', true) returning id into v_asis;
  begin
    insert into public.asistencias (gym_id, cliente_id, fecha, class_session_id, origen, consumio)
      values (v_gym, v_cli, v_hoy, v_sess, 'clase', true);
    raise exception '(a) FAIL: a SECOND active asistencia for the same (cliente, class_session) was accepted';
  exception when unique_violation then null;   -- expected 23505
  end;

  -- ── (b) two DIFFERENT classes the same day are legal (R1: the unit is the class) ──
  insert into public.asistencias (gym_id, cliente_id, fecha, class_session_id, origen, consumio)
    values (v_gym, v_cli, v_hoy, v_sess2, 'clase', true);

  -- ── (c) one active ACCESO LIBRE visit per (member, day) ───────────────────────────
  -- It coexists with (a)+(b)'s class rows — different partial index, different context.
  insert into public.asistencias (gym_id, cliente_id, fecha, class_session_id, origen, consumio)
    values (v_gym, v_cli, v_hoy, null, 'libre', false);
  begin
    insert into public.asistencias (gym_id, cliente_id, fecha, origen, consumio)
      values (v_gym, v_cli, v_hoy, 'libre', false);
    raise exception '(c) FAIL: a SECOND active class-less asistencia on the same (cliente, fecha) was accepted';
  exception when unique_violation then null;   -- expected 23505
  end;

  select count(*) into v_n from public.asistencias
   where cliente_id = v_cli and fecha = v_hoy and deleted_at is null;
  if v_n <> 3 then
    raise exception '(c) FAIL: expected 3 active rows for one member on one day (2 clases + 1 libre), got %', v_n;
  end if;

  -- ── (d) a soft-deleted row never blocks a re-insert (undo, then re-mark) ──────────
  update public.asistencias set deleted_at = now()
   where cliente_id = v_cli and class_session_id is null and deleted_at is null;
  insert into public.asistencias (gym_id, cliente_id, fecha, origen, consumio)
    values (v_gym, v_cli, v_hoy, 'libre', false);   -- re-mark ACCESO LIBRE after an undo

  update public.asistencias set deleted_at = now() where id = v_asis;
  insert into public.asistencias (gym_id, cliente_id, fecha, class_session_id, origen, consumio)
    values (v_gym, v_cli, v_hoy, v_sess, 'clase', true);   -- re-mark the SAME class after an undo

  select count(*) into v_n from public.asistencias
   where cliente_id = v_cli and fecha = v_hoy and deleted_at is null;
  if v_n <> 3 then
    raise exception '(d) FAIL: after undo+re-mark expected 3 active rows, got %', v_n;
  end if;

  -- ── (e) origen ⇔ class_session_id coherence, and the origen domain ────────────────
  begin
    insert into public.asistencias (gym_id, cliente_id, fecha, class_session_id, origen)
      values (v_gym, v_cli2, v_hoy, null, 'clase');
    raise exception '(e1) FAIL: origen=clase with a NULL class_session_id was accepted';
  exception when check_violation then null;   -- expected: asistencias_origen_kind_ck
  end;

  begin
    insert into public.asistencias (gym_id, cliente_id, fecha, class_session_id, origen)
      values (v_gym, v_cli2, v_hoy, v_sess, 'libre');
    raise exception '(e2) FAIL: origen=libre with a class_session_id was accepted';
  exception when check_violation then null;   -- expected: asistencias_origen_kind_ck
  end;

  begin
    insert into public.asistencias (gym_id, cliente_id, fecha, origen)
      values (v_gym, v_cli2, v_hoy, 'puerta');
    raise exception '(e3) FAIL: an origen outside (libre, clase) was accepted';
  exception when check_violation then null;   -- expected: asistencias_origen_ck
  end;

  -- NULL origen must still insert: pre-#89 rows carry unknown provenance and were NOT backfilled.
  insert into public.asistencias (gym_id, cliente_id, fecha, origen)
    values (v_gym, v_cli2, v_hoy, null);
  select count(*) into v_n from public.asistencias
   where cliente_id = v_cli2 and deleted_at is null and origen is null;
  if v_n <> 1 then
    raise exception '(e) FAIL: a NULL-origen row was rejected (expected 1 active row, got %)', v_n;
  end if;
end $$;

select 'asistencias unicidad suite: OK' as result;
rollback;
