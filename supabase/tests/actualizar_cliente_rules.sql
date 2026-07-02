-- actualizar_cliente rule test (ADR-0005 contract-honesty item).
--
-- actualizar_cliente edits ONLY the identity columns (nombre, tel) of a client the calling
-- operator owns. Proven here, against the REAL deployed function in a rolled-back transaction:
--   (1) nombre + tel are updated;
--   (2) the saldo columns (clases_restantes, vence, paquete_nombre) are left UNTOUCHED;
--   (3) a non-existent / non-owned id raises 'Cliente no encontrado' (RLS-scoped UPDATE -> 0 rows).
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK -- touches no row permanently.
--
-- HOW TO RUN (no local Docker): via the Supabase MCP execute_sql, or
--   psql "$DATABASE_URL" -f supabase/tests/actualizar_cliente_rules.sql

begin;

-- Resolve the operator at runtime (the only env-dependent value): perfil.user_id is a real
-- auth.users id; the RPC keys the write to auth.uid() and RLS scopes clientes to it.
select set_config(
  'app.op',
  (select user_id::text from public.perfil order by created_at limit 1),
  true
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_op     uuid := current_setting('app.op', true)::uuid;
  v_today  date := (now() at time zone 'America/Chihuahua')::date;
  v_cli    uuid;
  v_nombre text;
  v_tel    text;
  v_clases int;
  v_vence  date;
  v_paq    text;
begin
  -- Seed: a finite client owned by the operator, with a known saldo. gym_id NOT NULL since slice #20.
  insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
  values (v_op, 'TEST original', '0000000001', 5, v_today + 20, '8 clases', (select id from public.gym where slug = 'forge'))
  returning id into v_cli;

  -- (1) Update identity -> nombre + tel change.
  perform public.actualizar_cliente(v_cli, 'TEST editado', '6141112233');
  select nombre, tel, clases_restantes, vence, paquete_nombre
    into v_nombre, v_tel, v_clases, v_vence, v_paq
    from public.clientes where id = v_cli;
  if v_nombre <> 'TEST editado' then raise exception 'RULE FAIL(1): nombre not updated, got %', v_nombre; end if;
  if v_tel <> '6141112233' then raise exception 'RULE FAIL(1): tel not updated, got %', v_tel; end if;

  -- (2) Saldo columns untouched.
  if v_clases <> 5 then raise exception 'RULE FAIL(2): clases_restantes changed, got %', v_clases; end if;
  if v_vence <> v_today + 20 then raise exception 'RULE FAIL(2): vence changed, got %', v_vence; end if;
  if v_paq <> '8 clases' then raise exception 'RULE FAIL(2): paquete_nombre changed, got %', v_paq; end if;

  -- (3) A random (non-owned / non-existent) id raises 'Cliente no encontrado'.
  begin
    perform public.actualizar_cliente(gen_random_uuid(), 'X', '0000000002');
    raise exception 'RULE FAIL(3): expected Cliente no encontrado, none raised';
  exception
    when others then
      if sqlerrm <> 'Cliente no encontrado' then
        raise exception 'RULE FAIL(3): expected Cliente no encontrado, got %', sqlerrm;
      end if;
  end;

  raise notice 'actualizar_cliente rules: (1) identity updated, (2) saldo untouched, (3) not-found guard all hold';
end $$;

select 'actualizar_cliente rules: OK' as result;
rollback;
