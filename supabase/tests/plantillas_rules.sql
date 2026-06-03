-- plantillas rule test (ADR-0005 contract-honesty item).
--
-- Proves, against the REAL deployed functions in a rolled-back transaction:
--   (1) crear_plantilla allows up to 4 and raises 'Máximo 4 plantillas' on the 5th;
--   (2) actualizar_plantilla edits nombre+body of an owned row; a random id raises 'Plantilla no encontrada';
--   (3) eliminar_plantilla removes an owned row (the new DELETE policy); a random id raises 'Plantilla no encontrada';
--   (4) sembrar_plantillas_default seeds 4 on an empty owner and is idempotent (no-op when rows exist).
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK --
-- it deletes/inserts the operator's own plantillas inside the txn and rolls everything back.
--
-- HOW TO RUN (no local Docker): via the Supabase MCP execute_sql, or
--   psql "$DATABASE_URL" -f supabase/tests/plantillas_rules.sql

begin;

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
  v_op  uuid := current_setting('app.op', true)::uuid;
  v_id  uuid;
  v_n   text;
  v_b   text;
  v_cnt int;
begin
  -- Clean slate for this operator (rolled back).
  delete from public.plantillas where user_id = v_op;

  -- (1) cap of 4.
  perform public.crear_plantilla('Uno', 'b1');
  perform public.crear_plantilla('Dos', 'b2');
  perform public.crear_plantilla('Tres', 'b3');
  v_id := public.crear_plantilla('Cuatro', 'b4');
  begin
    perform public.crear_plantilla('Cinco', 'b5');
    raise exception 'RULE FAIL(1): 5th insert was allowed';
  exception when others then
    if sqlerrm <> 'Máximo 4 plantillas' then raise exception 'RULE FAIL(1): got %', sqlerrm; end if;
  end;

  -- (2) actualizar owned row.
  perform public.actualizar_plantilla(v_id, 'Cuatro-edit', 'b4-edit');
  select nombre, body into v_n, v_b from public.plantillas where id = v_id;
  if v_n <> 'Cuatro-edit' or v_b <> 'b4-edit' then raise exception 'RULE FAIL(2): not updated, got % / %', v_n, v_b; end if;
  begin
    perform public.actualizar_plantilla(gen_random_uuid(), 'X', 'y');
    raise exception 'RULE FAIL(2): expected Plantilla no encontrada';
  exception when others then
    if sqlerrm <> 'Plantilla no encontrada' then raise exception 'RULE FAIL(2): got %', sqlerrm; end if;
  end;

  -- (3) eliminar owned row (DELETE policy).
  perform public.eliminar_plantilla(v_id);
  if exists (select 1 from public.plantillas where id = v_id) then raise exception 'RULE FAIL(3): row not deleted'; end if;
  begin
    perform public.eliminar_plantilla(gen_random_uuid());
    raise exception 'RULE FAIL(3): expected Plantilla no encontrada';
  exception when others then
    if sqlerrm <> 'Plantilla no encontrada' then raise exception 'RULE FAIL(3): got %', sqlerrm; end if;
  end;

  -- (4) idempotent seed.
  delete from public.plantillas where user_id = v_op;
  perform public.sembrar_plantillas_default();
  select count(*) into v_cnt from public.plantillas where user_id = v_op;
  if v_cnt <> 4 then raise exception 'RULE FAIL(4): seed produced % rows', v_cnt; end if;
  perform public.sembrar_plantillas_default(); -- no-op
  select count(*) into v_cnt from public.plantillas where user_id = v_op;
  if v_cnt <> 4 then raise exception 'RULE FAIL(4): seed not idempotent, now % rows', v_cnt; end if;

  raise notice 'plantillas rules: cap, update, delete, idempotent-seed all hold';
end $$;

select 'plantillas rules: OK' as result;
rollback;
