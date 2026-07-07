-- registrar_venta email-capture test: the NEW-cliente path stores clientes.email = p_email so Door 2's
-- verified-email claim (reclamar_o_crear_cliente) can later match and converge the two doors. Proven
-- against the REAL deployed function, rolled back. Self-asserting; BEGIN/ROLLBACK; mutates nothing.
-- HOW TO RUN: via the Supabase MCP execute_sql, or psql "$DATABASE_URL" -f supabase/tests/registrar_venta_email.sql
begin;

-- Operator session = the forge gym's owner/operator gym_membership row (a real auth.users id), matching
-- registrar_venta_stamps_gym_id.sql; registrar_venta keys writes to auth.uid() + staff_gym(), which reads
-- this same (user_id, role in ('owner','operator')) predicate. perfil.user_id was dropped by Contract-B.
select set_config('app.op',
  (select user_id::text from public.gym_membership
     where gym_id = (select id from public.gym where slug = 'forge')
       and role in ('owner', 'operator')
     order by created_at limit 1), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_today date := (now() at time zone 'America/Chihuahua')::date;
  v_cli   uuid;
  v_email text;
begin
  select cliente_id into v_cli
    from public.registrar_venta(
      p_nombre := 'TEST email capture', p_tel := '0000000008', p_paquete_nombre := '8 clases',
      p_vigencia_tipo := 'dias', p_monto := 800, p_metodo := 'efectivo',
      p_clases_restantes := 8, p_vence := v_today + 30, p_clases := 8, p_vigencia_dias := 30,
      p_email := 'Nuevo.Socio@Example.MX');

  -- Stored as entered (trimmed by the form; the claim compares lower() on both sides — no SQL lowercasing).
  select email into v_email from public.clientes where id = v_cli;
  if v_email is distinct from 'Nuevo.Socio@Example.MX' then
    raise exception 'EMAIL FAIL: clientes.email = % (expected the p_email passed to the sale)', v_email;
  end if;
end $$;

select 'registrar_venta email capture: OK' as result;
rollback;
