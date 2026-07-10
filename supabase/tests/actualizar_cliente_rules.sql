-- actualizar_cliente written-row rules — per-gym idiom (#81 quarantine rewrite).
--
-- Rewritten from scratch: the old body resolved its operator via perfil.user_id and seeded dead
-- user_id columns, both removed by Contract-B (20260705082018) — it errored at the first write.
-- The CURRENT function is the 4-arg (uuid, text, text, text default null) form, last amended by
-- 20260710131000 (adds the unique_violation → 'Este correo ya pertenece a otro registro de este
-- gym' handler; 20260710130000 revoked anon EXECUTE). Its UPDATE writes ONLY nombre, tel and
-- email = coalesce(p_email, email) — never the entitlement columns.
--
-- Assertions are on the ROWS WRITTEN, never the return value (#78/#80): each vector re-reads the
-- clientes row and checks the columns the write did / did not set.
--
--   V1 — identity-only edit: an operator editing nombre/tel (p_email omitted) changes exactly those
--        two columns; clases_restantes / vence / paquete_nombre / email stay byte-identical.
--        (Guards the SET list at 20260710131000:48-50 — a leak of any entitlement column would fail.)
--   V2 — cross-gym denial: an operator of gym B updating a gym-A cliente hits the RLS-scoped UPDATE
--        (0 rows) → 'Cliente no encontrado' (:56-57), and A's row is unchanged after the attempt.
--   V3 — email-in-use: editing a row's email to one another row in the same gym already holds trips
--        clientes_email_gym_uq → the friendly 'Este correo ya pertenece a otro registro de este gym'
--        (:52-53), and the WHOLE edit rolls back (nombre/tel/email unchanged) — the begin/exception
--        wraps the single UPDATE, so no partial write leaks.
--
-- Deliberately NOT re-asserted here (owned by running siblings, do not duplicate):
--   · email-arm semantics (first-set / re-save / omitted / claimed-row reject / not-found / nombre-tel
--     editable) — supabase/tests/actualizar_cliente_email_rules.sql (V1-V7).
--   · anon/grant-posture denial — supabase/tests/contract_a_denials.sql (group a).
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Transaction-local
-- fixtures, zero prod UUIDs. Wrapped in BEGIN/ROLLBACK — touches no row permanently. NEVER against live.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or ad hoc via
-- the Supabase MCP execute_sql (pure SQL — no psql meta-commands).

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs; seeded as the migration role, RLS bypassed) ─────
do $$
declare
  gym_a    uuid := gen_random_uuid();
  gym_b    uuid := gen_random_uuid();
  staff_a  uuid := gen_random_uuid();   -- operator of gym A
  staff_b  uuid := gen_random_uuid();   -- operator of gym B
  c_a1     uuid;                          -- gym-A cliente edited in V1/V2, holds 'ocupado@…'
  c_a2     uuid;                          -- gym-A cliente edited in V3, holds 'libre@…'
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'actualizar-cliente-suite-a', 'Actualizar Cliente A', 'America/Chihuahua', 'forge'),
    (gym_b, 'actualizar-cliente-suite-b', 'Actualizar Cliente B', 'America/Chihuahua', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', staff_a, 'authenticated', 'authenticated', 'ac-staff-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', staff_b, 'authenticated', 'authenticated', 'ac-staff-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (staff_a, gym_a, 'operator'),
    (staff_b, gym_b, 'operator');

  -- Both rows UNCLAIMED (auth_user_id null) so the email arm is reachable. Known entitlement snapshot
  -- with a fixed literal vence — the identity edit must not touch any of these.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, email, auth_user_id)
    values (gym_a, 'Cliente A1', '6140000001', 5, date '2099-12-31', '8 clases', 'ocupado@test.local', null)
    returning id into c_a1;

  insert into public.clientes (gym_id, nombre, tel, clases_restantes, vence, paquete_nombre, email, auth_user_id)
    values (gym_a, 'Cliente A2', '6140000002', 3, date '2098-06-30', '4 clases', 'libre@test.local', null)
    returning id into c_a2;

  perform set_config('t.staff_a', staff_a::text, true);
  perform set_config('t.staff_b', staff_b::text, true);
  perform set_config('t.c_a1',    c_a1::text,    true);
  perform set_config('t.c_a2',    c_a2::text,    true);
end $$;

-- ══ V1 — identity-only edit: nombre/tel change; entitlement + email byte-identical ═══════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  c   uuid := current_setting('t.c_a1', true)::uuid;
  rec record;
begin
  perform public.actualizar_cliente(c, 'Cliente A1 Editado', '6149990001');   -- 3-arg: p_email defaults null

  select nombre, tel, clases_restantes, vence, paquete_nombre, email into rec
    from public.clientes where id = c;
  if rec.nombre           is distinct from 'Cliente A1 Editado' then raise exception 'V1 FAIL: nombre not updated, got %', rec.nombre; end if;
  if rec.tel              is distinct from '6149990001'         then raise exception 'V1 FAIL: tel not updated, got %', rec.tel; end if;
  if rec.clases_restantes is distinct from 5                    then raise exception 'V1 FAIL: clases_restantes touched, got %', rec.clases_restantes; end if;
  if rec.vence            is distinct from date '2099-12-31'    then raise exception 'V1 FAIL: vence touched, got %', rec.vence; end if;
  if rec.paquete_nombre   is distinct from '8 clases'           then raise exception 'V1 FAIL: paquete_nombre touched, got %', rec.paquete_nombre; end if;
  if rec.email            is distinct from 'ocupado@test.local' then raise exception 'V1 FAIL: email touched by omitted-email edit, got %', rec.email; end if;
end $$;
reset role;

-- ══ V2 — cross-gym denial: operator of B cannot update A's cliente; A's row unchanged ════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  c    uuid := current_setting('t.c_a1', true)::uuid;
  msg  text;
begin
  begin
    perform public.actualizar_cliente(c, 'HACKED', '0009990000', 'hijack@test.local');
    raise exception 'V2 FAIL: cross-gym operator updated another gym''s cliente (no error raised)';
  exception when others then
    get stacked diagnostics msg = message_text;
    -- RLS scopes the SELECT + UPDATE to gym B → 0 rows → the not-found guard, not a leak.
    if msg is distinct from 'Cliente no encontrado' then raise exception 'V2 FAIL: wrong error, got %', msg; end if;
  end;
end $$;
reset role;

-- Re-read as the OWNING gym's operator: every column must survive the cross-gym attempt (V1 values).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  c   uuid := current_setting('t.c_a1', true)::uuid;
  rec record;
begin
  select nombre, tel, clases_restantes, vence, paquete_nombre, email into rec
    from public.clientes where id = c;
  if rec.nombre           is distinct from 'Cliente A1 Editado' then raise exception 'V2 FAIL: cross-gym write leaked nombre = %', rec.nombre; end if;
  if rec.tel              is distinct from '6149990001'         then raise exception 'V2 FAIL: cross-gym write leaked tel = %', rec.tel; end if;
  if rec.clases_restantes is distinct from 5                    then raise exception 'V2 FAIL: cross-gym write leaked clases_restantes = %', rec.clases_restantes; end if;
  if rec.vence            is distinct from date '2099-12-31'    then raise exception 'V2 FAIL: cross-gym write leaked vence = %', rec.vence; end if;
  if rec.paquete_nombre   is distinct from '8 clases'           then raise exception 'V2 FAIL: cross-gym write leaked paquete_nombre = %', rec.paquete_nombre; end if;
  if rec.email            is distinct from 'ocupado@test.local' then raise exception 'V2 FAIL: cross-gym write leaked email = %', rec.email; end if;
end $$;
reset role;

-- ══ V3 — email-in-use: collide c_a2's email with c_a1's → friendly message, whole edit rolls back ═
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  c    uuid := current_setting('t.c_a2', true)::uuid;
  msg  text;
  rec  record;
begin
  begin
    -- New nombre/tel too — proves the begin/exception unwinds the SET list wholesale, not just email.
    perform public.actualizar_cliente(c, 'Cliente A2 Intento', '6149990002', 'ocupado@test.local');
    raise exception 'V3 FAIL: email collision was not rejected (no error raised)';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg is distinct from 'Este correo ya pertenece a otro registro de este gym' then
      raise exception 'V3 FAIL: wrong error, got %', msg;
    end if;
  end;

  -- The whole UPDATE rolled back: nombre, tel and email are all the pre-call values.
  select nombre, tel, email into rec from public.clientes where id = c;
  if rec.nombre is distinct from 'Cliente A2'         then raise exception 'V3 FAIL: nombre changed despite rejected edit, got %', rec.nombre; end if;
  if rec.tel    is distinct from '6140000002'         then raise exception 'V3 FAIL: tel changed despite rejected edit, got %', rec.tel; end if;
  if rec.email  is distinct from 'libre@test.local'   then raise exception 'V3 FAIL: email changed despite collision, got %', rec.email; end if;
end $$;
reset role;

select 'actualizar_cliente written-row rules: OK' as result;
rollback;
