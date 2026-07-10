-- registrar_venta email-capture test: the NEW-cliente path stores clientes.email = p_email so Door 2's
-- verified-email claim (reclamar_o_crear_cliente) can later match and converge the two doors. Proven
-- against the REAL deployed function, rolled back. Self-asserting; BEGIN/ROLLBACK; mutates nothing.
--
-- Post-C13 (2026-07-10): registrar_venta re-derives everything from the paquete row, so the sale sends
-- ONLY identity + p_paquete_id + p_metodo + p_idempotency_key. Fixtures are fully transaction-local
-- (synthetic gym + operator + paquete, zero prod UUIDs — the registrar_venta_stacking pattern): the old
-- preamble resolved the operator from a live forge gym_membership row, which does not exist on a fresh
-- scratch project (empty sub → 22P02 in staff_gym()).
-- HOW TO RUN: via `node supabase/tests/run-denial-suite.mjs`, or ad hoc via the Supabase MCP execute_sql.
begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_e   uuid := gen_random_uuid();
  op_user uuid := gen_random_uuid();
  v_paq   uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_e, 'venta-email-suite-gym', 'Venta Email Suite', 'America/Mexico_City', 'red');
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', op_user, 'authenticated', 'authenticated', 'op@venta-email.local', now(), '{}');
  insert into public.gym_membership (user_id, gym_id, role) values (op_user, gym_e, 'owner');
  -- The sale's only package input (C13): the RPC re-derives price/saldo/vence from this row.
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_e, 'EMAIL SUITE 8 clases', 8, 'dias', 30, 800)
    returning id into v_paq;
  perform set_config('t.op',  op_user::text, true);
  perform set_config('t.paq', v_paq::text,   true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_cli   uuid;
  v_email text;
begin
  select cliente_id into v_cli
    from public.registrar_venta(
      p_metodo := 'efectivo', p_paquete_id := current_setting('t.paq', true)::uuid,
      p_idempotency_key := gen_random_uuid(),
      p_nombre := 'TEST email capture', p_tel := '0000000008',
      p_email := 'Nuevo.Socio@Example.MX');

  -- Stored as entered (trimmed by the form; the claim compares lower() on both sides — no SQL lowercasing).
  select email into v_email from public.clientes where id = v_cli;
  if v_email is distinct from 'Nuevo.Socio@Example.MX' then
    raise exception 'EMAIL FAIL: clientes.email = % (expected the p_email passed to the sale)', v_email;
  end if;
end $$;

reset role;

select 'registrar_venta email capture: OK' as result;
rollback;
