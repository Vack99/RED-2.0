-- Schema-prep constraint suite (migration 20260710120000; rulings C6/C2/C12/D2). Proves the four
-- guards BITE against real writes, not just that the DDL parsed:
--   (a) ventas.metodo CHECK rejects 'pendiente' (C2 — the removed method).
--   (b) (gym_id, idempotency_key) is unique for non-null keys, yet two NULL-key sales coexist (C6).
--   (c) member email is unique per gym case-insensitively, yet NULL emails coexist AND the same
--       email in a DIFFERENT gym coexists — the index is per-gym, not global (D2).
--   (d) a fresh reservation defaults consumio = false (C12).
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): the two gyms + all rows are minted with gen_random_uuid().
-- Transaction-local (BEGIN/ROLLBACK) so a scratch project is REUSABLE and accumulates no state. No role
-- switches: CHECK/UNIQUE/FK bind regardless of RLS, so fixtures + assertions run as the connecting role.
-- Self-asserting: each expected rejection is caught by SQLSTATE (any other error propagates and fails
-- the run); a missed rejection or wrong default RAISEs. A clean run returns one 'OK' row.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs` (against a scratch ref via
-- SUPABASE_TARGET_REF), or ad hoc against any branch via the Supabase MCP execute_sql (pure SQL).

begin;

do $$
declare
  gym_a  uuid := gen_random_uuid();
  gym_b  uuid := gen_random_uuid();
  cli_a  uuid;
  ct_a   uuid := gen_random_uuid();
  sess_a uuid := gen_random_uuid();
  k      uuid := gen_random_uuid();
  v_consumio boolean;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'schema-prep-suite-a', 'Schema Prep A', 'America/Mexico_City', 'red'),
    (gym_b, 'schema-prep-suite-b', 'Schema Prep B', 'America/Mexico_City', 'red');

  insert into public.clientes (gym_id, nombre, tel, clases_restantes)
    values (gym_a, 'Ana Fixture', '6140000001', 5) returning id into cli_a;

  -- ── (a) metodo CHECK rejects 'pendiente' (C2) ─────────────────────────────────────
  begin
    insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, vigencia_tipo, monto, metodo)
      values (gym_a, cli_a, 5001, '8 clases', 'dias', 800, 'pendiente');
    raise exception '(a) FAIL: metodo=pendiente was accepted';
  exception when check_violation then null;   -- expected
  end;

  -- ── (b) idempotency_key unique per gym for non-null keys; NULL keys coexist (C6) ──
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, vigencia_tipo, monto, metodo, idempotency_key)
    values (gym_a, cli_a, 5002, '8 clases', 'dias', 800, 'efectivo', k);
  begin
    insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, vigencia_tipo, monto, metodo, idempotency_key)
      values (gym_a, cli_a, 5003, '8 clases', 'dias', 800, 'efectivo', k);
    raise exception '(b) FAIL: a duplicate (gym_id, idempotency_key) was accepted';
  exception when unique_violation then null;  -- expected
  end;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, vigencia_tipo, monto, metodo, idempotency_key)
    values (gym_a, cli_a, 5004, '8 clases', 'dias', 800, 'efectivo', null);
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, vigencia_tipo, monto, metodo, idempotency_key)
    values (gym_a, cli_a, 5005, '8 clases', 'dias', 800, 'efectivo', null);  -- two NULL keys coexist

  -- ── (c) member email unique per gym, case-insensitive; NULL + cross-gym coexist (D2) ──
  insert into public.clientes (gym_id, nombre, tel, email)
    values (gym_a, 'Beto', '6140000002', 'dup@x.mx');
  begin
    insert into public.clientes (gym_id, nombre, tel, email)
      values (gym_a, 'Beto Bis', '6140000003', 'DUP@X.MX');   -- same gym, case-insensitive dup
    raise exception '(c) FAIL: a case-insensitive duplicate email was accepted in the same gym';
  exception when unique_violation then null;  -- expected
  end;
  insert into public.clientes (gym_id, nombre, tel, email)
    values (gym_b, 'Beto Otro Gym', '6140000004', 'dup@x.mx');  -- same email, DIFFERENT gym → legal
  insert into public.clientes (gym_id, nombre, tel, email) values (gym_a, 'Nil Uno', '6140000005', null);
  insert into public.clientes (gym_id, nombre, tel, email) values (gym_a, 'Nil Dos', '6140000006', null);  -- two NULL emails coexist

  -- ── (d) reservation.consumio defaults false (C12) ─────────────────────────────────
  insert into public.class_type (id, gym_id, name) values (ct_a, gym_a, 'WOD Fixture');
  insert into public.class_session (id, gym_id, class_type_id, starts_at, duration_min, capacity)
    values (sess_a, gym_a, ct_a, now(), 60, 20);
  insert into public.reservation (gym_id, class_session_id, member_id)
    values (gym_a, sess_a, cli_a);
  select consumio into v_consumio from public.reservation
    where class_session_id = sess_a and member_id = cli_a;
  if v_consumio is distinct from false then
    raise exception '(d) FAIL: reservation.consumio default is % (expected false)', v_consumio;
  end if;
end $$;

select 'renewal_schema_prep suite: OK' as result;
rollback;
