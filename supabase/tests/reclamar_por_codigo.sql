-- Invite-token claim rail S1 suite (issue #65; ADR-0015). Proves the three new/changed RPCs obey the
-- locked contract:
--   • reclamar_por_codigo — claim happy path (balance intact, email overwritten with the verified login
--     email, code cleared, gym_membership(member) written, gym slug returned); dead/unknown code rejected;
--     caller-already-owns-a-row-in-gym rejected (never a second row); unverified caller rejected.
--   • registrar_venta — the NEW-cliente path mints an 8-char A-Z/2-9 claim_code inline.
--   • invitacion_info — the pre-signup {gym, nombre} projection; and DENIAL rows proving neither anon nor a
--     member can ever read clientes.claim_code (it is a bearer credential for a paid balance).
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): a synthetic gym, all auth.users, and all pre-seeded clientes are
-- minted with gen_random_uuid(). Transaction-local (BEGIN/ROLLBACK) so a preview branch is REUSABLE and
-- accumulates no state; seeded clientes mirror the operator CRM (inserted as the connecting role, RLS
-- bypassed, exactly as the import path does). Self-asserting: every check RAISEs on failure; a clean run
-- returns one 'OK' row.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs` (provisions/reuses a seeded
-- preview branch), or ad hoc against any branch via the Supabase MCP execute_sql (pure SQL, no psql meta).

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_inv  uuid := gen_random_uuid();
  op_user  uuid := gen_random_uuid();   -- operator (owner membership) — authors sales, drives code-gen
  u_claim  uuid := gen_random_uuid();    -- verified claimant of the invite
  u_dead   uuid := gen_random_uuid();    -- verified, claims a nonexistent code
  u_owns   uuid := gen_random_uuid();    -- verified, ALREADY owns a row in gym_inv
  u_unver  uuid := gen_random_uuid();    -- UNVERIFIED, must be rejected
  c_invite uuid;                          -- unclaimed paid row carrying the claim code
  c_owned  uuid;                          -- row already owned by u_owns
  c_other  uuid;                          -- a second unclaimed coded row (u_owns tries to claim it)
  c_denial uuid;                          -- an unclaimed coded row used by the denial vectors
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_inv, 'reclamar-codigo-suite-gym', 'Reclamar Código Suite', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_user, 'authenticated','authenticated','op@suite.local',   now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', u_claim, 'authenticated','authenticated','real@new.mx',       now(), '{"full_name":"Clara Claim","phone_e164":"+526141112233"}'),
    ('00000000-0000-0000-0000-000000000000', u_dead,  'authenticated','authenticated','dead@x.mx',         now(), '{"full_name":"Dan Dead","phone_e164":"+526142223344"}'),
    ('00000000-0000-0000-0000-000000000000', u_owns,  'authenticated','authenticated','owns@x.mx',         now(), '{"full_name":" Owns","phone_e164":"+526143334455"}'),
    ('00000000-0000-0000-0000-000000000000', u_unver, 'authenticated','authenticated','unver@x.mx',        null,  '{"full_name":"Ulla Unver","phone_e164":"+526144445566"}');

  -- op_user is an OWNER of gym_inv so staff_gym()/is_staff_of() resolve for the code-gen sale.
  insert into public.gym_membership (user_id, gym_id, role) values (op_user, gym_inv, 'owner');

  -- The invited paid row: staff typed a different email at the sale; balance 7 must survive the claim.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, claim_code, auth_user_id)
    values (gym_inv, 'Clara Preexistente', '6141112233', 7, 'staff-typed@old.mx', 'ABCD2345', null)
    returning id into c_invite;
  -- u_owns already has a claimed row in gym_inv.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_inv, 'Ya Registrado', '6143334455', 3, 'owns@x.mx', u_owns)
    returning id into c_owned;
  -- A second unclaimed coded row u_owns will (wrongly) try to claim.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, claim_code, auth_user_id)
    values (gym_inv, 'Otro Invitado', '6149990000', 5, 'otro@old.mx', 'WXYZ6789', null)
    returning id into c_other;
  -- An unclaimed coded row that survives V1 (whose code is cleared) for the denial vectors.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, claim_code, auth_user_id)
    values (gym_inv, 'Denegación', '6148880000', 2, 'deny@old.mx', 'DENY2345', null)
    returning id into c_denial;

  perform set_config('t.gym_inv',  gym_inv::text,  true);
  perform set_config('t.op_user',  op_user::text,  true);
  perform set_config('t.u_claim',  u_claim::text,  true);
  perform set_config('t.u_dead',   u_dead::text,   true);
  perform set_config('t.u_owns',   u_owns::text,   true);
  perform set_config('t.u_unver',  u_unver::text,  true);
  perform set_config('t.c_invite', c_invite::text, true);
  perform set_config('t.c_other',  c_other::text,  true);
  perform set_config('t.c_denial', c_denial::text, true);
end $$;

-- ══ V1 — claim happy path: balance intact, email overwritten, code cleared, membership + slug ════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_claim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g   uuid := current_setting('t.gym_inv', true)::uuid;
  ci  uuid := current_setting('t.c_invite', true)::uuid;
  uc  uuid := current_setting('t.u_claim', true)::uuid;
  v_slug text; rec record; n int;
begin
  select gym_slug into v_slug from public.reclamar_por_codigo('ABCD2345');
  if v_slug is distinct from 'reclamar-codigo-suite-gym' then
    raise exception 'V1 FAIL: expected the gym slug returned, got %', v_slug;
  end if;
  select auth_user_id, email, clases_restantes, claim_code into rec from public.clientes where id = ci;
  if rec.auth_user_id <> uc then raise exception 'V1 FAIL: invited row not bound to the claimant'; end if;
  if rec.email <> 'real@new.mx' then raise exception 'V1 FAIL: email not overwritten with the verified login email (%)', rec.email; end if;
  if rec.clases_restantes is distinct from 7 then raise exception 'V1 FAIL: paid balance not intact (%)', rec.clases_restantes; end if;
  if rec.claim_code is not null then raise exception 'V1 FAIL: claim_code not cleared (%)', rec.claim_code; end if;
  select count(*) into n from public.gym_membership where user_id = uc and gym_id = g and role = 'member';
  if n <> 1 then raise exception 'V1 FAIL: gym_membership(member) row missing (count=%)', n; end if;
end $$;
reset role;

-- ══ V2 — dead/unknown code rejected ════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_dead', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare got_error boolean := false; v text;
begin
  begin
    select gym_slug into v from public.reclamar_por_codigo('ZZZZZZZZ');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V2 FAIL: a dead code must be rejected'; end if;
end $$;
reset role;

-- ══ V3 — caller already owns a row in the gym: rejected, never a second row ══════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_owns', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare got_error boolean := false; v text;
begin
  begin
    select gym_slug into v from public.reclamar_por_codigo('WXYZ6789');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V3 FAIL: a caller already owning a row must be rejected'; end if;
end $$;
reset role;
do $$
declare co uuid := current_setting('t.c_other', true)::uuid; v_auth uuid;
begin
  -- The targeted row stays unclaimed (no second row, no wrong bind).
  select auth_user_id into v_auth from public.clientes where id = co;
  if v_auth is not null then raise exception 'V3 FAIL: the coded row was wrongly claimed'; end if;
end $$;

-- ══ V4 — unverified caller rejected; nothing persists ═══════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_unver', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare got_error boolean := false; v text;
begin
  begin
    select gym_slug into v from public.reclamar_por_codigo('DENY2345');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V4 FAIL: an unverified caller must be rejected'; end if;
end $$;
reset role;
do $$
declare uu uuid := current_setting('t.u_unver', true)::uuid; n int;
begin
  select count(*) into n from public.gym_membership where user_id = uu;
  if n <> 0 then raise exception 'V4 FAIL: an unverified attempt wrote % membership rows', n; end if;
end $$;

-- ══ V5 — registrar_venta NEW path mints an 8-char A-Z/2-9 claim_code inline ══════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_user', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_cli uuid; v_code text;
begin
  select cliente_id into v_cli from public.registrar_venta(
    p_nombre := 'Nuevo Socio', p_tel := '6140001111', p_paquete_nombre := '8 clases',
    p_vigencia_tipo := 'dias', p_monto := 800, p_metodo := 'efectivo',
    p_clases_restantes := 8, p_vence := (now() at time zone 'America/Mexico_City')::date + 30,
    p_clases := 8, p_vigencia_dias := 30, p_email := 'nuevo@socio.mx');
  select claim_code into v_code from public.clientes where id = v_cli;
  if v_code is null or v_code !~ '^[A-Z2-9]{8}$' then
    raise exception 'V5 FAIL: NEW sale did not mint a valid 8-char A-Z/2-9 claim_code (got %)', v_code;
  end if;
end $$;
reset role;

-- ══ V6 — invitacion_info returns ONLY {gym nombre, gym slug, cliente nombre} for a valid code ════════
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
set local role anon;
do $$
declare rec record;
begin
  select * into rec from public.invitacion_info('DENY2345');
  if rec.gym_nombre <> 'Reclamar Código Suite' or rec.gym_slug <> 'reclamar-codigo-suite-gym'
     or rec.cliente_nombre <> 'Denegación' then
    raise exception 'V6 FAIL: invitacion_info projection wrong (%, %, %)', rec.gym_nombre, rec.gym_slug, rec.cliente_nombre;
  end if;
  -- A dead code discloses nothing.
  perform 1 from public.invitacion_info('ZZZZZZZZ');
  if found then raise exception 'V6 FAIL: a dead code must return no rows'; end if;
end $$;
reset role;

-- ══ V7 — DENIAL: neither anon nor a member can read clientes.claim_code (bearer credential) ══════════
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.clientes where claim_code is not null;
  if n <> 0 then raise exception 'V7 FAIL: anon read % rows carrying a claim_code', n; end if;
end $$;
reset role;
-- The member who claimed in V1 must not see any OTHER gym row's claim_code (they read only their own row,
-- whose code is now cleared) — c_denial still carries a code but is invisible to them.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_claim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.clientes where claim_code is not null;
  if n <> 0 then raise exception 'V7 FAIL: a member read % rows carrying a claim_code', n; end if;
end $$;
reset role;

select 'reclamar_por_codigo suite: OK' as result;
rollback;
