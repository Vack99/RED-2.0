-- actualizar_cliente email arm + claimed-row guards — slice S3 (issue #71; ADR-0015 · design 2026-07-08
-- §3/§4). Proves the REAL deployed functions in a rolled-back transaction:
--
--   actualizar_cliente(uuid, text, text, text default null):
--     V1 — first email set on an UNCLAIMED row -> stored, email_changed=true, unclaimed=true
--     V2 — SAME email re-saved -> email_changed=false (no re-invite trigger)
--     V3 — p_email OMITTED -> email left untouched, email_changed=false
--     V4 — email CHANGE attempted on a CLAIMED row -> rejected ('No se puede editar el correo de una
--          cuenta activa'); the row's stored email is untouched
--     V5 — a CLAIMED row's nombre/tel stay editable when p_email is omitted (no guard trip)
--     V6 — a non-existent/non-owned id raises 'Cliente no encontrado' (4-arg call)
--
--   preparar_invitacion(uuid):
--     V7 — denied on a CLAIMED row ('La cuenta ya está activa') — the account-hijack guard: without this,
--          REENVIAR against a claimed row would mint a fresh claim_code that could re-stamp auth_user_id
--          and overwrite the row's verified email out from under its owner.
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Transaction-local
-- fixtures, zero prod UUIDs (ADR-0013 §5). Wrapped in BEGIN/ROLLBACK -- touches no row permanently.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs`, or ad hoc against any branch
-- via the Supabase MCP execute_sql (pure SQL — no psql meta-commands). NEVER against live.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_a     uuid;
  op_a      uuid := gen_random_uuid();  -- owner/operator of gym A (staff)
  member_u  uuid := gen_random_uuid();  -- the auth.users row a claimed cliente points at
  c_unclaimed uuid;                     -- unclaimed cliente, email NULL
  c_claimed   uuid;                     -- claimed cliente (auth_user_id set), email set
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_a,     'authenticated','authenticated','op-a-s3@test.local',     now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', member_u, 'authenticated','authenticated','member-s3@test.local',   now(), '{}');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator');

  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Sin Email S3', '6141110000', 5, null, null)
    returning id into c_unclaimed;

  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Cuenta Activa S3', '6142220000', 5, 'ya-verificado@test.local', member_u)
    returning id into c_claimed;

  perform set_config('t.op_a',        op_a::text,         true);
  perform set_config('t.c_unclaimed', c_unclaimed::text,  true);
  perform set_config('t.c_claimed',   c_claimed::text,    true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  cu uuid := current_setting('t.c_unclaimed', true)::uuid;
  cc uuid := current_setting('t.c_claimed', true)::uuid;
  r  record;
  v_email text;
begin
  -- ══ V1 — first email set on an UNCLAIMED row ═══════════════════════════════════════════════════════
  select * into r from public.actualizar_cliente(cu, 'Sin Email S3', '6141110000', 'nueva@test.local');
  if r.email_changed is distinct from true then raise exception 'V1 FAIL: email_changed should be true, got %', r.email_changed; end if;
  if r.unclaimed is distinct from true then raise exception 'V1 FAIL: unclaimed should be true, got %', r.unclaimed; end if;
  select email into v_email from public.clientes where id = cu;
  if v_email is distinct from 'nueva@test.local' then raise exception 'V1 FAIL: email not stored, got %', v_email; end if;

  -- ══ V2 — SAME email re-saved -> email_changed=false ════════════════════════════════════════════════
  select * into r from public.actualizar_cliente(cu, 'Sin Email S3', '6141110000', 'nueva@test.local');
  if r.email_changed is distinct from false then raise exception 'V2 FAIL: email_changed should be false on an unchanged re-save, got %', r.email_changed; end if;
  if r.unclaimed is distinct from true then raise exception 'V2 FAIL: unclaimed should still be true, got %', r.unclaimed; end if;

  -- ══ V3 — p_email OMITTED -> email left untouched, email_changed=false ═════════════════════════════
  select * into r from public.actualizar_cliente(cu, 'Sin Email S3 Editado', '6141110001');
  if r.email_changed is distinct from false then raise exception 'V3 FAIL: email_changed should be false when p_email is omitted, got %', r.email_changed; end if;
  select email into v_email from public.clientes where id = cu;
  if v_email is distinct from 'nueva@test.local' then raise exception 'V3 FAIL: email changed when p_email was omitted, got %', v_email; end if;

  -- ══ V4 — email CHANGE on a CLAIMED row is rejected ═════════════════════════════════════════════════
  begin
    perform public.actualizar_cliente(cc, 'Cuenta Activa S3', '6142220000', 'hijack@test.local');
    raise exception 'V4 FAIL: expected the claimed-row email guard to raise, none raised';
  exception
    when others then
      if sqlerrm <> 'No se puede editar el correo de una cuenta activa' then
        raise exception 'V4 FAIL: wrong error, got %', sqlerrm;
      end if;
  end;
  select email into v_email from public.clientes where id = cc;
  if v_email is distinct from 'ya-verificado@test.local' then raise exception 'V4 FAIL: claimed row email was mutated despite the rejected call, got %', v_email; end if;

  -- ══ V5 — a CLAIMED row's nombre/tel stay editable when p_email is OMITTED ═════════════════════════
  -- Both written columns are read back: `tel` is in the RPC's SET list but went unasserted here, so a
  -- drop of `tel` from the UPDATE would have shipped green while this vector still claimed to cover it.
  perform public.actualizar_cliente(cc, 'Cuenta Activa S3 Editada', '6142220001');
  select nombre, tel into r from public.clientes where id = cc;
  if r.nombre is distinct from 'Cuenta Activa S3 Editada' then raise exception 'V5 FAIL: nombre not updated on a claimed row, got %', r.nombre; end if;
  if r.tel is distinct from '6142220001' then raise exception 'V5 FAIL: tel not updated on a claimed row, got %', r.tel; end if;

  -- ══ V6 — a non-existent id raises 'Cliente no encontrado' (4-arg call) ════════════════════════════
  begin
    perform public.actualizar_cliente(gen_random_uuid(), 'X', '0000000002', 'x@test.local');
    raise exception 'V6 FAIL: expected Cliente no encontrado, none raised';
  exception
    when others then
      if sqlerrm <> 'Cliente no encontrado' then
        raise exception 'V6 FAIL: expected Cliente no encontrado, got %', sqlerrm;
      end if;
  end;

  -- ══ V7 — preparar_invitacion is denied on a CLAIMED row (account-hijack guard) ═════════════════════
  begin
    perform public.preparar_invitacion(cc);
    raise exception 'V7 FAIL: expected the claimed-row invite guard to raise, none raised';
  exception
    when others then
      if sqlerrm <> 'La cuenta ya está activa' then
        raise exception 'V7 FAIL: wrong error, got %', sqlerrm;
      end if;
  end;

  raise notice 'actualizar_cliente email arm + claimed-row guards: V1-V7 all hold';
end $$;
reset role;

select 'actualizar_cliente_email_rules: OK' as result;
rollback;
