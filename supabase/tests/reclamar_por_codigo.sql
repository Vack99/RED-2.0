-- Invite-token claim rail S1 suite (issue #65; ADR-0015). Proves the three new/changed RPCs obey the
-- locked contract:
--   • reclamar_por_codigo — claim happy path (balance intact, email overwritten with the verified login
--     email, code cleared, gym_membership(member) written, gym slug returned); dead/unknown code rejected;
--     caller-already-owns-a-row-in-gym rejected (never a second row); unverified caller rejected; and
--     (V8, audit 2026-07-22 §3) a bare/wrong FIRMA rejected — the RPC now takes `p_firma` (HMAC-SHA256
--     over `activar:v1:${codigo}` with the Vault `tenant_assertion_key`), verified BEFORE any read/write,
--     so a direct PostgREST caller (H1) or an attacker-appended `&codigo=` with no matching firma (H2)
--     fails CLOSED and writes nothing. Every claim vector below signs its call via pg_temp.firma_codigo().
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
  u_firma  uuid := gen_random_uuid();    -- verified, probes the firma gate (V8)
  c_invite uuid;                          -- unclaimed paid row carrying the claim code
  c_owned  uuid;                          -- row already owned by u_owns
  c_other  uuid;                          -- a second unclaimed coded row (u_owns tries to claim it)
  c_denial uuid;                          -- an unclaimed coded row used by the denial vectors
  c_firma  uuid;                          -- an unclaimed coded row the firma-denial vector must leave untouched
  paq_inv  uuid;                          -- gym_inv paquete: the sole package input to the V5 sale (C13)
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_inv, 'reclamar-codigo-suite-gym', 'Reclamar Código Suite', 'America/Mexico_City', 'red');

  -- Firma gate (audit §3): transaction-local HMAC key (update-or-create; rolls back with the suite),
  -- exactly like registro_claim.sql seeds it for the tenant firma. Every claim vector signs with it.
  if exists (select 1 from vault.secrets where name = 'tenant_assertion_key') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'tenant_assertion_key'), 'denial-suite-secret');
  else
    perform vault.create_secret('denial-suite-secret', 'tenant_assertion_key');
  end if;
  perform set_config('t.hmac_key', 'denial-suite-secret', true);

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_user, 'authenticated','authenticated','op@suite.local',   now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', u_claim, 'authenticated','authenticated','real@new.mx',       now(), '{"full_name":"Clara Claim","phone_e164":"+526141112233"}'),
    ('00000000-0000-0000-0000-000000000000', u_dead,  'authenticated','authenticated','dead@x.mx',         now(), '{"full_name":"Dan Dead","phone_e164":"+526142223344"}'),
    ('00000000-0000-0000-0000-000000000000', u_owns,  'authenticated','authenticated','owns@x.mx',         now(), '{"full_name":" Owns","phone_e164":"+526143334455"}'),
    ('00000000-0000-0000-0000-000000000000', u_unver, 'authenticated','authenticated','unver@x.mx',        null,  '{"full_name":"Ulla Unver","phone_e164":"+526144445566"}'),
    ('00000000-0000-0000-0000-000000000000', u_firma, 'authenticated','authenticated','firma@x.mx',        now(), '{"full_name":"Fina Firma","phone_e164":"+526145556677"}');

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
  -- An unclaimed coded row the firma-denial vector (V8) attacks with a bad/absent firma; it must
  -- stay wholly untouched (auth_user_id null, email intact, code intact).
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, claim_code, auth_user_id)
    values (gym_inv, 'Firma Guard', '6145550000', 4, 'firma-typed@old.mx', 'FIRM2345', null)
    returning id into c_firma;
  -- gym_inv paquete for the V5 staff sale (C13: the sale re-derives from this row).
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio)
    values (gym_inv, '8 clases', 8, 'dias', 30, 800) returning id into paq_inv;

  perform set_config('t.gym_inv',  gym_inv::text,  true);
  perform set_config('t.paq_inv',  paq_inv::text,  true);
  perform set_config('t.op_user',  op_user::text,  true);
  perform set_config('t.u_claim',  u_claim::text,  true);
  perform set_config('t.u_dead',   u_dead::text,   true);
  perform set_config('t.u_owns',   u_owns::text,   true);
  perform set_config('t.u_unver',  u_unver::text,  true);
  perform set_config('t.u_firma',  u_firma::text,  true);
  perform set_config('t.c_invite', c_invite::text, true);
  perform set_config('t.c_other',  c_other::text,  true);
  perform set_config('t.c_denial', c_denial::text, true);
  perform set_config('t.c_firma',  c_firma::text,  true);
end $$;

-- The signing helper every claim vector uses (temp schema — vanishes with the session; callable by the
-- role-switched blocks because EXECUTE on functions defaults to PUBLIC). Mirrors registro_claim.sql's
-- pg_temp.firma(), over the reclamar_por_codigo message scheme: `activar:v1:${codigo}`.
create function pg_temp.firma_codigo(codigo text) returns text language sql as $$
  select encode(
    extensions.hmac('activar:v1:' || codigo, current_setting('t.hmac_key', true), 'sha256'),
    'hex');
$$;

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
  select gym_slug into v_slug from public.reclamar_por_codigo('ABCD2345', pg_temp.firma_codigo('ABCD2345'));
  if v_slug is distinct from 'reclamar-codigo-suite-gym' then
    raise exception 'V1 FAIL: expected the gym slug returned, got %', v_slug;
  end if;
  -- The claim UPDATE writes SIX columns; assert every one of them (#80 AC4 — an RPC's return value is
  -- not its contract, the rows it writes are). phone_e164 + both consent stamps were previously written
  -- and never read back: exactly the identity-vs-payload seam #78 shipped through.
  select auth_user_id, email, clases_restantes, claim_code, phone_e164, terms_accepted_at, privacy_accepted_at
    into rec from public.clientes where id = ci;
  if rec.auth_user_id is distinct from uc then raise exception 'V1 FAIL: invited row not bound to the claimant (got %)', rec.auth_user_id; end if;
  if rec.email is distinct from 'real@new.mx' then raise exception 'V1 FAIL: email not overwritten with the verified login email (%)', rec.email; end if;
  if rec.clases_restantes is distinct from 7 then raise exception 'V1 FAIL: paid balance not intact (%)', rec.clases_restantes; end if;
  if rec.claim_code is not null then raise exception 'V1 FAIL: claim_code not cleared (%)', rec.claim_code; end if;
  -- c_invite is seeded with no phone; u_claim's verified metadata carries one → coalesce writes it.
  if rec.phone_e164 is distinct from '+526141112233' then raise exception 'V1 FAIL: phone_e164 = % (expected the claimant''s verified metadata phone)', rec.phone_e164; end if;
  if rec.terms_accepted_at is null then raise exception 'V1 FAIL: terms_accepted_at not stamped on claim'; end if;
  if rec.privacy_accepted_at is null then raise exception 'V1 FAIL: privacy_accepted_at not stamped on claim'; end if;
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
    -- A VALID firma for this code isolates the rejection to the dead-code path (not the firma gate).
    select gym_slug into v from public.reclamar_por_codigo('ZZZZZZZZ', pg_temp.firma_codigo('ZZZZZZZZ'));
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
    select gym_slug into v from public.reclamar_por_codigo('WXYZ6789', pg_temp.firma_codigo('WXYZ6789'));
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
    select gym_slug into v from public.reclamar_por_codigo('DENY2345', pg_temp.firma_codigo('DENY2345'));
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
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.paq_inv', true)::uuid,
    p_idempotency_key := gen_random_uuid(),
    p_nombre := 'Nuevo Socio', p_tel := '6140001111', p_email := 'nuevo@socio.mx');
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

-- ══ V8 — DENIAL: a bare/wrong firma is rejected and writes NOTHING (audit 2026-07-22 §3, H1/H2) ══════
-- The firma gate runs BEFORE any read or write. A garbage firma and an empty firma both raise; the
-- targeted coded row stays wholly untouched (auth_user_id null, email intact, code intact) and the
-- attacker gains no membership — proving the code alone is no longer a redeemable bearer token.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_firma', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare got_error boolean := false; v text;
begin
  -- (a) garbage firma
  begin
    select gym_slug into v from public.reclamar_por_codigo('FIRM2345', 'deadbeef');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V8 FAIL: a garbage firma was accepted'; end if;
  -- (b) empty firma (the confirm route forwards "" when no firma rides the URL — H2)
  got_error := false;
  begin
    select gym_slug into v from public.reclamar_por_codigo('FIRM2345', '');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V8 FAIL: an empty firma was accepted'; end if;
  -- (c) a VALID firma for a DIFFERENT code replayed against FIRM2345 (the code is inside the signed
  --     message, so the digest cannot cross-verify)
  got_error := false;
  begin
    select gym_slug into v from public.reclamar_por_codigo('FIRM2345', pg_temp.firma_codigo('ABCD2345'));
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V8 FAIL: another code''s firma claimed FIRM2345'; end if;
end $$;
reset role;
do $$
declare
  cf uuid := current_setting('t.c_firma', true)::uuid;
  uf uuid := current_setting('t.u_firma', true)::uuid;
  rec record; n int;
begin
  -- The row is wholly untouched (read as the connecting role, RLS bypassed).
  select auth_user_id, email, claim_code into rec from public.clientes where id = cf;
  if rec.auth_user_id is not null then raise exception 'V8 FAIL: a rejected firma still bound the row (auth_user_id=%)', rec.auth_user_id; end if;
  if rec.email is distinct from 'firma-typed@old.mx' then raise exception 'V8 FAIL: a rejected firma overwrote the email (%)', rec.email; end if;
  if rec.claim_code is distinct from 'FIRM2345' then raise exception 'V8 FAIL: a rejected firma cleared/changed the code (%)', rec.claim_code; end if;
  select count(*) into n from public.gym_membership where user_id = uf;
  if n <> 0 then raise exception 'V8 FAIL: a rejected firma wrote % membership rows', n; end if;
end $$;

select 'reclamar_por_codigo suite: OK' as result;
rollback;
