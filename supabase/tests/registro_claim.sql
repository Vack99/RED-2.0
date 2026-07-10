-- Member self-register + verified-email claim suite — slice #26 (PRD #17 S8; ADR-0009 amendment).
--
-- Proves the atomic SECURITY DEFINER RPC `public.reclamar_o_crear_cliente(p_gym_id)` obeys the locked
-- claim mechanics: a claim executes ONLY on a UNIQUE verified-email match in the host-resolved gym
-- (balance + history carry over); no-match / phone-only mint a FRESH cliente (phone NEVER claims);
-- the `gym_membership(role='member')` insert commits in the SAME transaction (no half-registered
-- state); an unverified email is rejected; and a matching verified email in ANOTHER gym is never
-- claimed (gym is server-authoritative — the RPC scopes the match to p_gym_id). A final vector proves
-- the claimed member reads EXACTLY their own cliente row under the #23 gym-scoped RLS.
--
-- AMBIGUITY IS NOW STRUCTURALLY IMPOSSIBLE (D2, 20260710120000): `clientes_email_gym_uq
-- (gym_id, lower(email)) where email is not null` means two rows can never share an email in a gym.
-- The old create-on-ambiguous vector (two dup@x.mx rows → the RPC refuses to guess) modeled a state
-- the DB no longer admits; V4 now proves (a) the index rejects the second same-email insert (23505 —
-- the index, not the RPC's v_n=1 count, is the guard) and (b) the formerly-ambiguous email, now
-- necessarily unique, deterministically CLAIMS its single row.
--
-- Eight named vectors: claim-on-verified-match, create-on-no-match, create-on-phone-only,
-- email-unique-index-guard + claim-on-now-unique-match, unverified-rejected, membership-atomicity,
-- cross-gym-claim-denied, member-scoped-read.
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
  -- pre-seeded UNCLAIMED clientes
  c_match   uuid;
  c_phone   uuid;
  c_dup     uuid;
  c_cross   uuid;
  got_23505 boolean := false;
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

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
    ('00000000-0000-0000-0000-000000000000', u_cross,   'authenticated','authenticated','cross@x.mx',         now(), '{"full_name":"Cris Cross","phone_e164":"+526147778899"}');

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

  perform set_config('t.gym_a',     gym_a::text,     true);
  perform set_config('t.gym_b',     gym_b::text,     true);
  perform set_config('t.u_match',   u_match::text,   true);
  perform set_config('t.u_nomatch', u_nomatch::text, true);
  perform set_config('t.u_phone',   u_phone::text,   true);
  perform set_config('t.u_ambig',   u_ambig::text,   true);
  perform set_config('t.u_unverif', u_unverif::text, true);
  perform set_config('t.u_atomic',  u_atomic::text,  true);
  perform set_config('t.u_cross',   u_cross::text,   true);
  perform set_config('t.c_match',   c_match::text,   true);
  perform set_config('t.c_phone',   c_phone::text,   true);
  perform set_config('t.c_dup',     c_dup::text,     true);
  perform set_config('t.c_cross',   c_cross::text,   true);
end $$;

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
begin
  select * into r from public.reclamar_o_crear_cliente(g);
  if not r.reclamado then raise exception 'V1 FAIL: expected reclamado=true (a verified-email match)'; end if;
  if r.cliente_id <> cm then raise exception 'V1 FAIL: claimed % but expected the matched cliente %', r.cliente_id, cm; end if;
  -- Balance carried over untouched (ADR-0009): the operator-tracked 5 clases survive the claim.
  select clases_restantes into n from public.clientes where id = cm;
  if n is distinct from 5 then raise exception 'V1 FAIL: balance not carried (clases_restantes=%)', n; end if;
  -- Membership committed in the SAME transaction as the claim.
  select count(*) into n from public.gym_membership where user_id = um and gym_id = g and role = 'member';
  if n <> 1 then raise exception 'V1 FAIL: gym_membership(member) row missing (count=%)', n; end if;
end $$;
reset role;

-- ══ V2 — create-on-no-match: fresh cliente + membership ════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_nomatch', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g  uuid := current_setting('t.gym_a', true)::uuid;
  un uuid := current_setting('t.u_nomatch', true)::uuid;
  r  record;
  rec record;
  v_auth_email text;
  n  int;
begin
  select * into r from public.reclamar_o_crear_cliente(g);
  if r.reclamado then raise exception 'V2 FAIL: no matching email should NOT claim'; end if;
  -- Assert the WRITTEN row, not just which row (the #78 lesson): an RPC's return value is not its
  -- contract — the row it writes is. #78 dropped `email` from exactly this create-path INSERT and
  -- every self-registrant landed with clientes.email = NULL, invisible to a which-row-only test.
  select nombre, tel, gym_id, auth_user_id, clases_restantes, email, terms_accepted_at, privacy_accepted_at
    into rec from public.clientes where id = r.cliente_id;
  if rec.auth_user_id <> un then raise exception 'V2 FAIL: fresh cliente not owned by the registrant'; end if;
  if rec.gym_id <> g then raise exception 'V2 FAIL: fresh cliente not scoped to the resolved gym'; end if;
  if rec.nombre <> 'Nora Nueva' then raise exception 'V2 FAIL: nombre not carried from signup metadata (%)', rec.nombre; end if;
  if rec.tel <> '6142223344' then raise exception 'V2 FAIL: tel not derived from phone_e164 (%)', rec.tel; end if;
  if rec.clases_restantes is distinct from 0 then raise exception 'V2 FAIL: fresh self-registrant must start at 0 clases (finite), got % — NULL means Ilimitado = free booking', rec.clases_restantes; end if;
  -- #78 regression: the create path MUST persist the VERIFIED auth email as the contact address.
  -- Compared against the fixture literal (u_nomatch was seeded 'nuevo@x.mx'): this block runs AS
  -- `authenticated`, which has no SELECT grant on auth.users — reading it here 42501s on scratch.
  v_auth_email := 'nuevo@x.mx';
  if rec.email is distinct from v_auth_email then
    raise exception 'V2 FAIL (#78): create path dropped the verified email — clientes.email=% but the verified signup email=%', rec.email, v_auth_email;
  end if;
  -- Consent stamps written at create time (the RPC sets both to now()).
  if rec.terms_accepted_at is null then raise exception 'V2 FAIL: terms_accepted_at not stamped on the fresh row'; end if;
  if rec.privacy_accepted_at is null then raise exception 'V2 FAIL: privacy_accepted_at not stamped on the fresh row'; end if;
  -- Membership upserted in the SAME transaction (no half-registered state on the create path).
  select count(*) into n from public.gym_membership where user_id = un and gym_id = g and role = 'member';
  if n <> 1 then raise exception 'V2 FAIL: gym_membership(member) not written on create (count=%)', n; end if;
end $$;
reset role;

-- ══ V3 — create-on-phone-only-match: phone NEVER claims; the phone-matched row stays unclaimed ══════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_phone', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare g uuid := current_setting('t.gym_a', true)::uuid; r record;
begin
  select * into r from public.reclamar_o_crear_cliente(g);
  if r.reclamado then raise exception 'V3 FAIL: a phone-only match must NOT claim'; end if;
  perform set_config('t.c_created_phone', r.cliente_id::text, true);
end $$;
reset role;
do $$
declare
  cp uuid := current_setting('t.c_phone', true)::uuid;
  up uuid := current_setting('t.u_phone', true)::uuid;
  created uuid := current_setting('t.c_created_phone', true)::uuid;
  v_auth uuid;
begin
  -- Read as the connecting role (RLS bypassed): the phone-matched CRM row must stay UNCLAIMED.
  select auth_user_id into v_auth from public.clientes where id = cp;
  if v_auth is not null then raise exception 'V3 FAIL: phone-matched cliente was wrongly claimed'; end if;
  -- A distinct fresh row was minted for the registrant instead.
  select auth_user_id into v_auth from public.clientes where id = created;
  if v_auth <> up or created = cp then raise exception 'V3 FAIL: expected a fresh cliente for the registrant'; end if;
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
  r  record;
begin
  select * into r from public.reclamar_o_crear_cliente(g);
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
declare g uuid := current_setting('t.gym_a', true)::uuid; r record; got_error boolean := false;
begin
  begin
    select * into r from public.reclamar_o_crear_cliente(g);
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

-- ══ V6 — membership atomicity: inject a failure on the membership insert → the cliente insert also
--         rolls back (claim + membership are ONE transaction; no half-registered state). ════════════
-- A NOT VALID check skips existing member rows but rejects the RPC's new membership insert, forcing the
-- RPC to raise AFTER it has inserted the fresh cliente — proving both rows commit-or-rollback together.
alter table public.gym_membership add constraint tmp_no_member check (role <> 'member') not valid;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_atomic', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare g uuid := current_setting('t.gym_a', true)::uuid; r record; got_error boolean := false;
begin
  begin
    select * into r from public.reclamar_o_crear_cliente(g);
  exception when others then got_error := true;
  end;
  if not got_error then raise exception 'V6 FAIL: injected membership failure did not surface'; end if;
end $$;
reset role;
do $$
declare ua uuid := current_setting('t.u_atomic', true)::uuid; n int;
begin
  -- The cliente insert must NOT have persisted — it rolled back with the failed membership insert.
  select count(*) into n from public.clientes where auth_user_id = ua;
  if n <> 0 then raise exception 'V6 FAIL: half-registered state — % cliente row(s) survived a failed membership insert', n; end if;
end $$;
alter table public.gym_membership drop constraint tmp_no_member;

-- ══ V7 — cross-gym-claim-denied: a verified-email match in gym A is NOT claimed when registering into
--         gym B; gym is server-authoritative (the match is scoped to p_gym_id). ════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u_cross', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare gb uuid := current_setting('t.gym_b', true)::uuid; r record;
begin
  select * into r from public.reclamar_o_crear_cliente(gb);
  if r.reclamado then raise exception 'V7 FAIL: a match in ANOTHER gym must NOT be claimed'; end if;
  perform set_config('t.c_created_cross', r.cliente_id::text, true);
end $$;
reset role;
do $$
declare
  cc uuid := current_setting('t.c_cross', true)::uuid;
  uc uuid := current_setting('t.u_cross', true)::uuid;
  gb uuid := current_setting('t.gym_b', true)::uuid;
  created uuid := current_setting('t.c_created_cross', true)::uuid;
  v_auth uuid; v_gym uuid; n int;
begin
  -- gym A's matching cliente stays unclaimed.
  select auth_user_id into v_auth from public.clientes where id = cc;
  if v_auth is not null then raise exception 'V7 FAIL: gym A cliente wrongly claimed cross-gym'; end if;
  -- A fresh cliente was created in gym B, and the membership is for gym B.
  select auth_user_id, gym_id into v_auth, v_gym from public.clientes where id = created;
  if v_auth <> uc or v_gym <> gb then raise exception 'V7 FAIL: fresh cliente not scoped to gym B'; end if;
  select count(*) into n from public.gym_membership where user_id = uc and gym_id = gb and role = 'member';
  if n <> 1 then raise exception 'V7 FAIL: membership not written for gym B (count=%)', n; end if;
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

select 'registro claim suite: OK' as result;
rollback;
