-- Member self-register + verified-email claim suite — slice #26 (PRD #17 S8; ADR-0009 amendment).
--
-- Proves the atomic SECURITY DEFINER RPC `public.reclamar_o_crear_cliente(p_gym_id)` obeys the locked
-- claim mechanics: a claim executes ONLY on a UNIQUE verified-email match in the host-resolved gym
-- (balance + history carry over); the `gym_membership(role='member')` insert commits in the SAME
-- transaction (no half-registered state); an unverified email is rejected; and a matching verified
-- email in ANOTHER gym is never claimed (gym is server-authoritative — the RPC scopes the match to
-- p_gym_id). A further vector proves the claimed member reads EXACTLY their own cliente row under
-- the #23 gym-scoped RLS.
--
-- LINK-ONLY (owner ruling R1, migration 20260903120000) — the vectors that used to assert a CREATE
-- now assert a REFUSAL THAT WRITES NOTHING. The RPC may bind an existing unclaimed row of the gym in
-- effect and nothing else: no cliente is ever minted, and no `gym_membership` is written for a gym
-- where nothing matched. That is the guard that makes claim-on-every-session-mint safe — without it,
-- any confirmed user opening `…/?gym=<slug>` (or any preview host, which resolves no tenant) would be
-- granted the authz row of a gym they never joined (red team 2026-09-03 §4). V2/V3/V7 are the three
-- shapes of "nothing matched": no row at all, a PHONE-only match (phone never claims), and a match
-- that lives in ANOTHER gym.
--
-- NO PHONE REQUIREMENT (red team §2 A5). `'Teléfono requerido'` guarded the deleted INSERT branch and
-- nothing else; `phone_e164` metadata is only ever set by `/registro`'s signUp (29 of 63 live auth
-- users have none), so leaving the raise in would have made the claim a SILENT no-op for nearly half
-- the user base — the app swallows the refusal as a value. V11 pins that a verified user with no
-- phone metadata claims normally.
--
-- AMBIGUITY IS NOW STRUCTURALLY IMPOSSIBLE (D2, 20260710120000): `clientes_email_gym_uq
-- (gym_id, lower(email)) where email is not null` means two rows can never share an email in a gym.
-- The old create-on-ambiguous vector (two dup@x.mx rows → the RPC refuses to guess) modeled a state
-- the DB no longer admits; V4 now proves (a) the index rejects the second same-email insert (23505 —
-- the index, not the RPC's v_n=1 count, is the guard) and (b) the formerly-ambiguous email, now
-- necessarily unique, deterministically CLAIMS its single row.
--
-- TENANT BINDING (D2, 20260713190000): the RPC now takes `p_firma` — HMAC-SHA256 over
-- `uid:gym_id` with the Vault key `tenant_assertion_key` — verified BEFORE any read or write, so a
-- direct PostgREST caller cannot mint a membership in a gym the server did not resolve for them.
-- Fixtures seed a transaction-local key (update-or-create, rolled back); every vector signs its
-- call via pg_temp.firma(); V9 proves a forged and a cross-gym firma are rejected and write nothing.
--
-- AVISO VERSION (#257): the RPC also takes `p_aviso_version default null`, stamped onto
-- `clientes.privacy_aviso_version` on the claim (UPDATE) — the only write branch left — never on
-- `terms_accepted_at`, which has no version machinery (Gate 0.1 scope cut) and keeps its bare
-- timestamp. V1 passes an explicit version and asserts it lands; V10 OMITS it and asserts the
-- column stays null, not fabricated (AC3).
--
-- Twelve named vectors: claim-on-verified-match, refuse-on-no-match, refuse-on-phone-only,
-- email-unique-index-guard + claim-on-now-unique-match, unverified-rejected, membership-atomicity,
-- cross-gym-claim-refused, member-scoped-read, forged-firma-rejected, no-aviso-version-writes-null,
-- claim-without-phone-metadata, idempotent-re-entry.
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): gym A is looked up by slug from the spine seeds; a synthetic
-- gym B, all auth.users, and all pre-seeded clientes are minted with gen_random_uuid(). Fixtures are
-- transaction-local (BEGIN/ROLLBACK) so the preview branch is REUSABLE with no reset and accumulates no
-- state; on a preview branch production auth rows do not carry over, so seeding auth.users is safe.
-- Self-asserting: every check RAISEs on failure; a clean run returns one 'OK' row.
--
-- HOW TO RUN: as one command via `node supabase/tests/run-denial-suite.mjs` (provisions/reuses a seeded
-- preview branch). Or ad hoc against any branch via the Supabase MCP execute_sql (pure SQL — no psql
-- meta-commands). The pre-seeded clientes mirror the operator CRM (auth_user_id NULL), seeded as the
-- connecting role (RLS bypassed) exactly as the import path does — never a direct client write.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
do $$
declare
  gym_a     uuid;
  gym_b     uuid := gen_random_uuid();
  owner_a   uuid := gen_random_uuid();   -- operator who authored the pre-seeded clientes (user_id FK)
  -- registrants (one per vector). All verified except u_unverif.
  u_match   uuid := gen_random_uuid();
  u_nomatch uuid := gen_random_uuid();
  u_phone   uuid := gen_random_uuid();
  u_ambig   uuid := gen_random_uuid();
  u_unverif uuid := gen_random_uuid();
  u_atomic  uuid := gen_random_uuid();
  u_cross   uuid := gen_random_uuid();
  u_forge   uuid := gen_random_uuid();   -- V9: attacker probing the tenant binding
  u_noversion uuid := gen_random_uuid(); -- V10 (#257): claim path, OMITS p_aviso_version
  u_sinphone uuid := gen_random_uuid();  -- V11: verified, NO phone_e164 in metadata
  u_repite  uuid := gen_random_uuid();   -- V12: idempotent re-entry
  -- pre-seeded UNCLAIMED clientes
  c_match   uuid;
  c_phone   uuid;
  c_dup     uuid;
  c_cross   uuid;
  c_atomic  uuid;
  c_noversion uuid;
  c_sinphone uuid;
  c_repite  uuid;
  got_23505 boolean := false;
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

  -- D2 tenant binding: transaction-local HMAC key (update-or-create; rolls back with the suite).
  if exists (select 1 from vault.secrets where name = 'tenant_assertion_key') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'tenant_assertion_key'), 'denial-suite-secret');
  else
    perform vault.create_secret('denial-suite-secret', 'tenant_assertion_key');
  end if;
  perform set_config('t.hmac_key', 'denial-suite-secret', true);

  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'registro-suite-gym-2', 'Registro Suite Gym 2', 'America/Mexico_City', 'red');

  -- auth.users: full_name + phone_e164 in raw_user_meta_data exactly as signUp(options.data) stores them.
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', owner_a,   'authenticated','authenticated','owner-a@test.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', u_match,   'authenticated','authenticated','ana@x.mx',           now(), '{"full_name":"Ana Match","phone_e164":"+526141112233"}'),
    ('00000000-0000-0000-0000-000000000000', u_nomatch, 'authenticated','authenticated','nuevo@x.mx',         now(), '{"full_name":"Nora Nueva","phone_e164":"+526142223344"}'),
    ('00000000-0000-0000-0000-000000000000', u_phone,   'authenticated','authenticated','distinta@x.mx',      now(), '{"full_name":"Pia Phone","phone_e164":"+526143334455"}'),
    ('00000000-0000-0000-0000-000000000000', u_ambig,   'authenticated','authenticated','dup@x.mx',           now(), '{"full_name":"Ada Ambig","phone_e164":"+526144445566"}'),
    ('00000000-0000-0000-0000-000000000000', u_unverif, 'authenticated','authenticated','sin@x.mx',           null,  '{"full_name":"Uma Unverif","phone_e164":"+526145556677"}'),
    ('00000000-0000-0000-0000-000000000000', u_atomic,  'authenticated','authenticated','atom@x.mx',          now(), '{"full_name":"Ato Mic","phone_e164":"+526146667788"}'),
    ('00000000-0000-0000-0000-000000000000', u_cross,   'authenticated','authenticated','cross@x.mx',         now(), '{"full_name":"Cris Cross","phone_e164":"+526147778899"}'),
    ('00000000-0000-0000-0000-000000000000', u_forge,   'authenticated','authenticated','forja@x.mx',         now(), '{"full_name":"Fabián Forja","phone_e164":"+526148889900"}'),
    ('00000000-0000-0000-0000-000000000000', u_noversion, 'authenticated','authenticated','noversion@x.mx',   now(), '{"full_name":"Noa Version","phone_e164":"+526149990000"}'),
    -- V11: NO phone_e164 at all — the shape 46% of live auth users have (anyone provisioned
    -- outside /registro's signUp). The deleted raise made this cohort's claim a silent no-op.
    ('00000000-0000-0000-0000-000000000000', u_sinphone, 'authenticated','authenticated','sintel@x.mx',       now(), '{"full_name":"Sonia SinTel"}'),
    ('00000000-0000-0000-0000-000000000000', u_repite,  'authenticated','authenticated','repite@x.mx',        now(), '{"full_name":"Rita Repite","phone_e164":"+526140001111"}');

  -- Pre-seeded operator CRM rows (auth_user_id NULL). c_match's email matches u_match (→ claim);
  -- c_phone shares u_phone's PHONE but has a DIFFERENT email (→ phone must NOT claim); c_dup carries
  -- the once-ambiguous dup@x.mx — a SECOND row with that email is now impossible (V4 proves the index
  -- rejects it); c_cross matches u_cross's email but lives in gym A while u_cross registers into gym B
  -- (→ cross-gym must NOT claim).
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Ana Preexistente', '6141112233', 5, 'ana@x.mx', null)
    returning id into c_match;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, phone_e164, auth_user_id)
    values (gym_a, 'Titular Real', '6143334455', 7, 'titular-real@x.mx', '+526143334455', null)
    returning id into c_phone;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Dup Uno', '6144440001', 3, 'dup@x.mx', null)
    returning id into c_dup;
  -- V4a — email-unique-index-guard: the duplicate-email state the old ambiguity vector seeded can no
  -- longer be created. The second same-email insert (even with a case twist) must raise 23505 off
  -- clientes_email_gym_uq; the guard is the INDEX, not the RPC's v_n = 1 count.
  begin
    insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
      values (gym_a, 'Dup Dos', '6144440002', 4, 'DUP@x.mx', null);
  exception when unique_violation then got_23505 := true;
  end;
  if not got_23505 then
    raise exception 'V4a FAIL: a second dup@x.mx row was inserted — clientes_email_gym_uq did not fire';
  end if;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Cross Preexistente', '6147778899', 9, 'cross@x.mx', null)
    returning id into c_cross;
  -- Link-only: every vector that must WRITE needs a matching unclaimed row to write onto.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Ato Preexistente', '6146667788', 2, 'atom@x.mx', null)
    returning id into c_atomic;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Noa Preexistente', '6149990000', 4, 'noversion@x.mx', null)
    returning id into c_noversion;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Sonia Preexistente', '6140009999', 6, 'sintel@x.mx', null)
    returning id into c_sinphone;
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Rita Preexistente', '6140001111', 8, 'repite@x.mx', null)
    returning id into c_repite;

  perform set_config('t.gym_a',     gym_a::text,     true);
  perform set_config('t.gym_b',     gym_b::text,     true);
  perform set_config('t.u_match',   u_match::text,   true);
  perform set_config('t.u_nomatch', u_nomatch::text, true);
  perform set_config('t.u_phone',   u_phone::text,   true);
  perform set_config('t.u_ambig',   u_ambig::text,   true);
  perform set_config('t.u_unverif', u_unverif::text, true);
  perform set_config('t.u_atomic',  u_atomic::text,  true);
  perform set_config('t.u_cross',   u_cross::text,   true);
  perform set_config('t.u_forge',   u_forge::text,   true);
  perform set_config('t.u_noversion', u_noversion::text, true);
  perform set_config('t.u_sinphone', u_sinphone::text, true);
  perform set_config('t.u_repite',  u_repite::text,  true);
  perform set_config('t.c_match',   c_match::text,   true);
  perform set_config('t.c_phone',   c_phone::text,   true);
  perform set_config('t.c_dup',     c_dup::text,     true);
  perform set_config('t.c_cross',   c_cross::text,   true);
  perform set_config('t.c_atomic',  c_atomic::text,  true);
  perform set_config('t.c_noversion', c_noversion::text, true);
  perform set_config('t.c_sinphone', c_sinphone::text, true);
  perform set_config('t.c_repite',  c_repite::text,  true);
end $$;

-- The signing helper every vector uses (temp schema — vanishes with the session; callable by the
-- role-switched blocks because EXECUTE on functions defaults to PUBLIC).
create function pg_temp.firma(u uuid, g uuid) returns text language sql as $$
  select encode(
    extensions.hmac(u::text || ':' || g::text, current_setting('t.hmac_key', true), 'sha256'),
    'hex');
$$;

-- ══ V1 — claim-on-verified-email-match: balance carried + membership written atomically ═════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_match', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g   uuid := current_setting('t.gym_a', true)::uuid;
  cm  uuid := current_setting('t.c_match', true)::uuid;
  um  uuid := current_setting('t.u_match', true)::uuid;
  r   record;
  n   int;
  v_ver text;
begin
  -- #257: p_aviso_version rides the SAME call, on the CLAIM (UPDATE) branch.
  select * into r from public.reclamar_o_crear_cliente(g, pg_temp.firma(um, g), '0.1-borrador');
  if not r.reclamado then raise exception 'V1 FAIL: expected reclamado=true (a verified-email match)'; end if;
  if r.cliente_id <> cm then raise exception 'V1 FAIL: claimed % but expected the matched cliente %', r.cliente_id, cm; end if;
  -- Balance carried over untouched (ADR-0009): the operator-tracked 5 clases survive the claim.
  select clases_restantes into n from public.clientes where id = cm;
  if n is distinct from 5 then raise exception 'V1 FAIL: balance not carried (clases_restantes=%)', n; end if;
  -- Membership committed in the SAME transaction as the claim.
  select count(*) into n from public.gym_membership where user_id = um and gym_id = g and role = 'member';
  if n <> 1 then raise exception 'V1 FAIL: gym_membership(member) row missing (count=%)', n; end if;
  -- #257: the exact version string passed is the one written on the claim (UPDATE) branch.
  select privacy_aviso_version into v_ver from public.clientes where id = cm;
  if v_ver is distinct from '0.1-borrador' then
    raise exception 'V1 FAIL: privacy_aviso_version = % (expected the passed version)', v_ver;
  end if;
end $$;
reset role;

-- ══ V2 — refuse-on-no-match: the RPC RAISES and writes NOTHING (R1, red team §4) ════════════════
-- This is the vector that used to assert a fresh cliente. Under claim-on-every-session-mint the old
-- behaviour meant any confirmed user who named a gym in a query string was handed a cliente row AND
-- the `gym_membership` authz row of a gym they never joined. Nothing matched is now an OUTCOME.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_nomatch', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  un uuid := current_setting('t.u_nomatch', true)::uuid;
  r  record;
  got_error boolean := false;
begin
  begin
    select * into r from public.reclamar_o_crear_cliente(g, pg_temp.firma(un, g), '0.1-borrador');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V2 FAIL: an unmatched email must be REFUSED, never minted a row'; end if;
end $$;
reset role;
do $$
declare un uuid := current_setting('t.u_nomatch', true)::uuid; n int;
begin
  -- Assert the WRITTEN rows (the #78 lesson) — here, that there are NONE. A return value of
  -- `reclamado:false` used to be indistinguishable from "already mine"; a row count cannot lie.
  select count(*) into n from public.clientes where auth_user_id = un;
  if n <> 0 then raise exception 'V2 FAIL: a refused claim minted % cliente row(s)', n; end if;
  select count(*) into n from public.gym_membership where user_id = un;
  if n <> 0 then raise exception 'V2 FAIL: a refused claim minted % membership row(s) — the authz row', n; end if;
end $$;

-- ══ V3 — refuse-on-phone-only-match: phone NEVER claims, and no twin is minted for it ═══════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_phone', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  up uuid := current_setting('t.u_phone', true)::uuid;
  r  record;
  got_error boolean := false;
begin
  begin
    select * into r from public.reclamar_o_crear_cliente(g, pg_temp.firma(up, g));
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V3 FAIL: a phone-only match must be REFUSED'; end if;
end $$;
reset role;
do $$
declare
  cp uuid := current_setting('t.c_phone', true)::uuid;
  up uuid := current_setting('t.u_phone', true)::uuid;
  v_auth uuid;
  n int;
begin
  -- Read as the connecting role (RLS bypassed): the phone-matched CRM row must stay UNCLAIMED.
  select auth_user_id into v_auth from public.clientes where id = cp;
  if v_auth is not null then raise exception 'V3 FAIL: phone-matched cliente was wrongly claimed'; end if;
  -- And NO twin was minted for the registrant — the old create branch produced exactly that.
  select count(*) into n from public.clientes where auth_user_id = up;
  if n <> 0 then raise exception 'V3 FAIL: a phone-only match minted % zero-balance twin(s)', n; end if;
end $$;

-- ══ V4b — claim-on-now-unique-match: the formerly-ambiguous email is structurally unique (V4a proved
--          the index guard), so registering with it deterministically CLAIMS its single row ═════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_ambig', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  cd uuid := current_setting('t.c_dup', true)::uuid;
  ua uuid := current_setting('t.u_ambig', true)::uuid;
  r  record;
begin
  select * into r from public.reclamar_o_crear_cliente(g, pg_temp.firma(ua, g));
  if not r.reclamado then raise exception 'V4b FAIL: a now-unique email match must CLAIM (got create)'; end if;
  if r.cliente_id <> cd then raise exception 'V4b FAIL: claimed % but expected the single dup row %', r.cliente_id, cd; end if;
end $$;
reset role;
do $$
declare
  cd uuid := current_setting('t.c_dup', true)::uuid;
  ua uuid := current_setting('t.u_ambig', true)::uuid;
  n int;
  rec record;
begin
  -- The WRITTEN row (the #78 lesson): bound to the registrant, balance carried, consent stamped.
  select auth_user_id, clases_restantes, terms_accepted_at into rec from public.clientes where id = cd;
  if rec.auth_user_id <> ua then raise exception 'V4b FAIL: dup row not bound to the registrant'; end if;
  if rec.clases_restantes is distinct from 3 then raise exception 'V4b FAIL: balance not carried (clases_restantes=%)', rec.clases_restantes; end if;
  if rec.terms_accepted_at is null then raise exception 'V4b FAIL: terms_accepted_at not stamped on claim'; end if;
  -- No fresh row was minted for the registrant (the claim, not a create, served them).
  select count(*) into n from public.clientes where auth_user_id = ua;
  if n <> 1 then raise exception 'V4b FAIL: expected exactly the claimed row for the registrant, got %', n; end if;
end $$;

-- ══ V5 — unverified-email rejected: RPC raises; no cliente + no membership persist ══════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_unverif', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  uu uuid := current_setting('t.u_unverif', true)::uuid;
  r  record;
  got_error boolean := false;
begin
  begin
    select * into r from public.reclamar_o_crear_cliente(g, pg_temp.firma(uu, g));
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V5 FAIL: an unverified email must be rejected'; end if;
end $$;
reset role;
do $$
declare uu uuid := current_setting('t.u_unverif', true)::uuid; n int;
begin
  select count(*) into n from public.clientes where auth_user_id = uu;
  if n <> 0 then raise exception 'V5 FAIL: an unverified attempt created % cliente rows', n; end if;
  select count(*) into n from public.gym_membership where user_id = uu;
  if n <> 0 then raise exception 'V5 FAIL: an unverified attempt created % membership rows', n; end if;
end $$;

-- ══ V6 — membership atomicity: inject a failure on the membership insert → the LINK also rolls
--         back (claim + membership are ONE transaction; no half-registered state). ════════════════
-- A NOT VALID check skips existing member rows but rejects the RPC's new membership insert, forcing
-- the RPC to raise AFTER it has bound the matched cliente — proving both writes commit-or-rollback
-- together. u_atomic now has a MATCHING unclaimed row (link-only: there is no create path left to
-- fail on), so what must survive the rollback is `auth_user_id is null` on that row.
alter table public.gym_membership add constraint tmp_no_member check (role <> 'member') not valid;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_atomic', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  ua uuid := current_setting('t.u_atomic', true)::uuid;
  r  record;
  got_error boolean := false;
begin
  begin
    select * into r from public.reclamar_o_crear_cliente(g, pg_temp.firma(ua, g));
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V6 FAIL: injected membership failure did not surface'; end if;
end $$;
reset role;
do $$
declare
  ua uuid := current_setting('t.u_atomic', true)::uuid;
  ca uuid := current_setting('t.c_atomic', true)::uuid;
  v_auth uuid;
  n int;
begin
  -- The LINK must NOT have persisted — it rolled back with the failed membership insert.
  select auth_user_id into v_auth from public.clientes where id = ca;
  if v_auth is not null then raise exception 'V6 FAIL: half-registered state — the row stayed linked after a failed membership insert'; end if;
  select count(*) into n from public.clientes where auth_user_id = ua;
  if n <> 0 then raise exception 'V6 FAIL: % cliente row(s) bound to the registrant survived', n; end if;
end $$;
alter table public.gym_membership drop constraint tmp_no_member;

-- ══ V7 — cross-gym-claim-refused: a verified-email match in gym A is NOT claimed when the caller
--         names gym B, and gym B gets NO cliente and NO membership out of the attempt. ═══════════
-- The `?gym=` / preview-host surface in one vector: gym is server-authoritative (the match is scoped
-- to p_gym_id), and the refusal writes nothing rather than provisioning a phantom member in gym B.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_cross', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gb uuid := current_setting('t.gym_b', true)::uuid;
  uc uuid := current_setting('t.u_cross', true)::uuid;
  r  record;
  got_error boolean := false;
begin
  begin
    select * into r from public.reclamar_o_crear_cliente(gb, pg_temp.firma(uc, gb));
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V7 FAIL: a match in ANOTHER gym must be REFUSED, not provisioned'; end if;
end $$;
reset role;
do $$
declare
  cc uuid := current_setting('t.c_cross', true)::uuid;
  uc uuid := current_setting('t.u_cross', true)::uuid;
  gb uuid := current_setting('t.gym_b', true)::uuid;
  v_auth uuid; n int;
begin
  -- gym A's matching cliente stays unclaimed.
  select auth_user_id into v_auth from public.clientes where id = cc;
  if v_auth is not null then raise exception 'V7 FAIL: gym A cliente wrongly claimed cross-gym'; end if;
  -- Nothing at all landed in gym B — neither a roster row nor the authz row.
  select count(*) into n from public.clientes where auth_user_id = uc and gym_id = gb;
  if n <> 0 then raise exception 'V7 FAIL: % phantom cliente row(s) minted in gym B', n; end if;
  select count(*) into n from public.gym_membership where user_id = uc and gym_id = gb;
  if n <> 0 then raise exception 'V7 FAIL: % membership row(s) granted for a gym that matched nothing', n; end if;
end $$;

-- ══ V8 — member-scoped-read: the claimed member reads EXACTLY their own cliente + their gym (RLS) ═══
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_match', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  cm uuid := current_setting('t.c_match', true)::uuid;
  g  uuid := current_setting('t.gym_a', true)::uuid;
  n int; only_id uuid;
begin
  -- Despite many clientes now existing in gym A, the member sees ONLY their own claimed row.
  select count(*) into n from public.clientes;
  if n <> 1 then raise exception 'V8 FAIL: member sees % clientes (expected exactly their own 1)', n; end if;
  select id into only_id from public.clientes;
  if only_id <> cm then raise exception 'V8 FAIL: member sees the wrong cliente row'; end if;
  -- And reads their own gym via their self-visible membership.
  select count(*) into n from public.gym_membership where gym_id = g and role = 'member';
  if n <> 1 then raise exception 'V8 FAIL: member self-read of their gym membership failed (count=%)', n; end if;
end $$;
reset role;

-- ══ V9 — forged-firma-rejected: the D2 tenant binding. A garbage firma raises; a VALID firma for
--         gym A replayed against gym B raises (the gym id is inside the signed message); and neither
--         attempt writes a cliente or membership row. ═══════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_forge', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  ga uuid := current_setting('t.gym_a', true)::uuid;
  gb uuid := current_setting('t.gym_b', true)::uuid;
  uf uuid := current_setting('t.u_forge', true)::uuid;
  r  record;
  got_error boolean := false;
begin
  -- (a) garbage firma
  begin
    select * into r from public.reclamar_o_crear_cliente(ga, 'deadbeef');
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V9 FAIL: a garbage firma was accepted'; end if;
  -- (b) valid firma for gym A, replayed against gym B — the binding must be to the SIGNED gym
  got_error := false;
  begin
    select * into r from public.reclamar_o_crear_cliente(gb, pg_temp.firma(uf, ga));
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V9 FAIL: gym A''s firma minted a membership in gym B'; end if;
end $$;
reset role;
do $$
declare uf uuid := current_setting('t.u_forge', true)::uuid; n int;
begin
  select count(*) into n from public.clientes where auth_user_id = uf;
  if n <> 0 then raise exception 'V9 FAIL: a rejected firma still created % cliente row(s)', n; end if;
  select count(*) into n from public.gym_membership where user_id = uf;
  if n <> 0 then raise exception 'V9 FAIL: a rejected firma still created % membership row(s)', n; end if;
end $$;

-- ══ V10 — a claim that OMITS p_aviso_version writes NULL, never a fabricated value (#257 AC3) ════
-- The RPC signature's `p_aviso_version default null` exists for exactly this: a caller with no
-- version to report must stamp an honest null, not invent one. Every OTHER write the claim makes
-- (the bind, the consent timestamps, the membership) still happens normally.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_noversion', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  un uuid := current_setting('t.u_noversion', true)::uuid;
  cn uuid := current_setting('t.c_noversion', true)::uuid;
  r  record;
  rec record;
begin
  select * into r from public.reclamar_o_crear_cliente(g, pg_temp.firma(un, g));
  if not r.reclamado then raise exception 'V10 FAIL: a matching email must CLAIM'; end if;
  if r.cliente_id <> cn then raise exception 'V10 FAIL: claimed the wrong row'; end if;
  select auth_user_id, terms_accepted_at, privacy_accepted_at, privacy_aviso_version
    into rec from public.clientes where id = cn;
  if rec.auth_user_id <> un then raise exception 'V10 FAIL: row not bound to the registrant'; end if;
  if rec.terms_accepted_at is null then raise exception 'V10 FAIL: terms_accepted_at not stamped'; end if;
  if rec.privacy_accepted_at is null then raise exception 'V10 FAIL: privacy_accepted_at not stamped'; end if;
  if rec.privacy_aviso_version is not null then
    raise exception 'V10 FAIL: an omitted version was fabricated as % instead of staying null', rec.privacy_aviso_version;
  end if;
end $$;
reset role;

-- ══ V11 — claim-without-phone-metadata: no 'Teléfono requerido' anywhere (red team §2 A5) ════════
-- 29 of 63 live auth users carry no `phone_e164` (only /registro's signUp ever writes it). The raise
-- guarded the deleted INSERT branch; had it survived, "every session mint claims" would have been a
-- SILENT no-op for 46% of the user base — the app swallows the refusal as a value, so those members
-- would sit on the sin-membresía screen with a paid row one query away and no error anywhere.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_sinphone', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  us uuid := current_setting('t.u_sinphone', true)::uuid;
  cs uuid := current_setting('t.c_sinphone', true)::uuid;
  r  record;
  rec record;
  n  int;
begin
  select * into r from public.reclamar_o_crear_cliente(g, pg_temp.firma(us, g));
  if not r.reclamado then raise exception 'V11 FAIL: a phone-less verified user must still CLAIM'; end if;
  if r.cliente_id <> cs then raise exception 'V11 FAIL: claimed % but expected %', r.cliente_id, cs; end if;
  -- The WRITTEN row: bound, balance carried, and the desk-typed phone left intact (nothing to overwrite).
  select auth_user_id, clases_restantes, phone_e164 into rec from public.clientes where id = cs;
  if rec.auth_user_id <> us then raise exception 'V11 FAIL: row not bound to the registrant'; end if;
  if rec.clases_restantes is distinct from 6 then raise exception 'V11 FAIL: balance not carried (%)', rec.clases_restantes; end if;
  if rec.phone_e164 is not null then raise exception 'V11 FAIL: absent metadata overwrote phone_e164 with %', rec.phone_e164; end if;
  select count(*) into n from public.gym_membership where user_id = us and gym_id = g and role = 'member';
  if n <> 1 then raise exception 'V11 FAIL: membership not written (count=%)', n; end if;
end $$;
reset role;

-- ══ V12 — idempotent re-entry: the claim now runs at EVERY session mint, so calling it twice must
--         be a success path, not a double write. ═══════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_repite', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  ur uuid := current_setting('t.u_repite', true)::uuid;
  cr uuid := current_setting('t.c_repite', true)::uuid;
  r1 record;
  r2 record;
begin
  select * into r1 from public.reclamar_o_crear_cliente(g, pg_temp.firma(ur, g), '0.1-borrador');
  if not r1.reclamado then raise exception 'V12 FAIL: the first call must CLAIM'; end if;
  -- Second mint, same session: already mine → reclamado=false, same row, no raise.
  select * into r2 from public.reclamar_o_crear_cliente(g, pg_temp.firma(ur, g));
  if r2.reclamado then raise exception 'V12 FAIL: re-entry must report reclamado=false, not a second claim'; end if;
  if r2.cliente_id <> cr then raise exception 'V12 FAIL: re-entry resolved a different row'; end if;
end $$;
reset role;
do $$
declare
  ur uuid := current_setting('t.u_repite', true)::uuid;
  cr uuid := current_setting('t.c_repite', true)::uuid;
  v_ver text; n int;
begin
  -- Exactly one cliente + one membership after two calls, and the re-entry did NOT null the aviso
  -- version the first call stamped (it must not re-write the row at all).
  select count(*) into n from public.clientes where auth_user_id = ur;
  if n <> 1 then raise exception 'V12 FAIL: re-entry left % cliente row(s)', n; end if;
  select count(*) into n from public.gym_membership where user_id = ur;
  if n <> 1 then raise exception 'V12 FAIL: re-entry left % membership row(s)', n; end if;
  select privacy_aviso_version into v_ver from public.clientes where id = cr;
  if v_ver is distinct from '0.1-borrador' then
    raise exception 'V12 FAIL: re-entry overwrote the stamped consent evidence (now %)', v_ver;
  end if;
end $$;

select 'registro claim suite: OK' as result;
rollback;
