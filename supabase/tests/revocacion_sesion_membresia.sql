-- Session revocation on membership removal — issue #218 (epic #203; ADR-0016, migration
-- 20260802160000_revocar_sesiones_al_quitar_membresia.sql).
--
-- The written rows here are DELETED rows in the `auth` schema (AGENTS.md: assert what the write
-- does, never the return value — a trigger has no return value to be fooled by). The fixture seeds
-- `auth.sessions` in exactly the shape the #218 measurement found on live: `not_after = null`, one
-- `auth.mfa_amr_claims` row per session (GoTrue writes one on every sign-in, MFA or not), and one
-- `auth.refresh_tokens` row per session — the row that made those sessions immortal.
--
-- Vectors proved:
--   1) Baseline: two sessions for the operator about to be removed, one for their colleague.
--   2) Removing ONE membership row deletes ALL of that user's `auth.sessions` rows — global, by
--      design: a session carries no gym, so gym B's session dies with gym A's removal (ADR-0016 §2).
--   3) Their `auth.refresh_tokens` rows are gone. This is the durability half: the access token
--      still validates until `exp`, the refresh token is what renewed it for 21 days.
--   4) Their `auth.mfa_amr_claims` rows are gone — the migration deletes in FK order rather than
--      relying on GoTrue's ON DELETE actions, and this is what proves that order actually works.
--   5) Blast radius stops at the removed identity: the colleague's session, refresh token and
--      membership all survive, and the removed user's OTHER membership row survives too (the
--      trigger revokes sessions, it never removes memberships).
--   6) Stated limits, asserted so they are facts and not assumptions: a role UPDATE (demotion)
--      does NOT revoke, and removing a membership for a user with no sessions is a silent no-op.
--   7) The trigger is wired to the named function (this is also the coverage guard's call site —
--      the credit is real: every delete below is executed BY that function).
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK,
-- zero prod UUIDs.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into SUITE.

begin;

do $$
declare
  gym_a   uuid := gen_random_uuid();
  gym_b   uuid := gen_random_uuid();
  quitado uuid := gen_random_uuid();  -- operator of BOTH gyms; removed from gym A below
  colega  uuid := gen_random_uuid();  -- gym A's other operator; nothing of theirs may move
  s_uno   uuid := gen_random_uuid();  -- quitado, device 1
  s_dos   uuid := gen_random_uuid();  -- quitado, device 2 — the "gym B" session, killed too
  s_col   uuid := gen_random_uuid();  -- colega's session
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'rev-gym-a', 'Rev Gym A', 'America/Mexico_City', 'base'),
    (gym_b, 'rev-gym-b', 'Rev Gym B', 'America/Mexico_City', 'base');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', quitado, 'authenticated', 'authenticated', 'rev-quitado@test.local'),
    ('00000000-0000-0000-0000-000000000000', colega,  'authenticated', 'authenticated', 'rev-colega@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (quitado, gym_a, 'operator'),
    (quitado, gym_b, 'operator'),
    (colega,  gym_a, 'operator');

  -- not_after IS NULL on every row: the live state #218 measured, and the reason nothing expires.
  insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
    (s_uno, quitado, now(), now(), null),
    (s_dos, quitado, now(), now(), null),
    (s_col, colega,  now(), now(), null);

  insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method) values
    (gen_random_uuid(), s_uno, now(), now(), 'password'),
    (gen_random_uuid(), s_dos, now(), now(), 'password'),
    (gen_random_uuid(), s_col, now(), now(), 'password');

  -- auth.refresh_tokens.user_id is VARCHAR (GoTrue stores the uuid as text), not uuid.
  insert into auth.refresh_tokens (instance_id, token, user_id, session_id, revoked, created_at, updated_at) values
    ('00000000-0000-0000-0000-000000000000', 'rev-tok-uno', quitado::text, s_uno, false, now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'rev-tok-dos', quitado::text, s_dos, false, now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'rev-tok-col', colega::text,  s_col, false, now(), now());

  perform set_config('t.gym_a',   gym_a::text,   true);
  perform set_config('t.gym_b',   gym_b::text,   true);
  perform set_config('t.quitado', quitado::text, true);
  perform set_config('t.colega',  colega::text,  true);
  perform set_config('t.s_uno',   s_uno::text,   true);
  perform set_config('t.s_dos',   s_dos::text,   true);
  perform set_config('t.s_col',   s_col::text,   true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- Removing ONE membership row revokes EVERY session that identity holds
-- ════════════════════════════════════════════════════════════════════════════════
do $$
declare
  gym_a   uuid := current_setting('t.gym_a',   true)::uuid;
  gym_b   uuid := current_setting('t.gym_b',   true)::uuid;
  quitado uuid := current_setting('t.quitado', true)::uuid;
  colega  uuid := current_setting('t.colega',  true)::uuid;
  s_uno   uuid := current_setting('t.s_uno',   true)::uuid;
  s_dos   uuid := current_setting('t.s_dos',   true)::uuid;
  s_col   uuid := current_setting('t.s_col',   true)::uuid;
  n int;
begin
  -- ── 7: the trigger is wired to the function this suite is credited with ──
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.gym_membership'::regclass
      and tgfoid  = 'public.revocar_sesiones_al_quitar_membresia()'::regprocedure
      and tgtype & 8 = 8            -- fires on DELETE
      and not tgisinternal
  ) then
    raise exception 'WIRING FAIL: no DELETE trigger on gym_membership runs revocar_sesiones_al_quitar_membresia()';
  end if;

  -- ── 1: baseline — the sessions really are there before the removal ──
  select count(*) into n from auth.sessions where user_id = quitado;
  if n <> 2 then raise exception 'FIXTURE FAIL: quitado has % session(s) before removal (expected 2)', n; end if;
  select count(*) into n from auth.sessions where user_id = colega;
  if n <> 1 then raise exception 'FIXTURE FAIL: colega has % session(s) before removal (expected 1)', n; end if;

  -- THE ACT: remove the operator from gym A. One row, one gym.
  delete from public.gym_membership where user_id = quitado and gym_id = gym_a;

  -- ── 2: every session of that identity is gone — including the gym B one (GLOBAL, by design) ──
  select count(*) into n from auth.sessions where user_id = quitado;
  if n <> 0 then
    raise exception 'REVOKE FAIL: quitado still holds % session(s) after removal (expected 0 — global revocation)', n;
  end if;

  -- ── 3: the refresh tokens are gone. The access token outlives them (bounded by jwt_expiry);
  --       the refresh token is what renewed a session for 21 days on live.
  select count(*) into n from auth.refresh_tokens where session_id in (s_uno, s_dos);
  if n <> 0 then
    raise exception 'REVOKE FAIL: % refresh token(s) survive the revoked sessions (expected 0 — the session would renew)', n;
  end if;

  -- ── 4: the amr claims are gone (proves the FK-ordered delete, not a guessed cascade) ──
  select count(*) into n from auth.mfa_amr_claims where session_id in (s_uno, s_dos);
  if n <> 0 then raise exception 'REVOKE FAIL: % mfa_amr_claim(s) left behind (expected 0)', n; end if;

  -- ── 5: blast radius — the colleague is untouched on all three tables ──
  select count(*) into n from auth.sessions where user_id = colega;
  if n <> 1 then raise exception 'BLAST FAIL: colega has % session(s) (expected 1 — untouched)', n; end if;
  select count(*) into n from auth.refresh_tokens where session_id = s_col;
  if n <> 1 then raise exception 'BLAST FAIL: colega has % refresh token(s) (expected 1 — untouched)', n; end if;
  select count(*) into n from auth.mfa_amr_claims where session_id = s_col;
  if n <> 1 then raise exception 'BLAST FAIL: colega has % amr claim(s) (expected 1 — untouched)', n; end if;
  select count(*) into n from public.gym_membership where user_id = colega;
  if n <> 1 then raise exception 'BLAST FAIL: colega holds % membership row(s) (expected 1 — untouched)', n; end if;

  -- and the removed user keeps gym B: this revokes SESSIONS, it never removes a membership
  select count(*) into n from public.gym_membership where user_id = quitado;
  if n <> 1 then raise exception 'SCOPE FAIL: quitado holds % membership row(s) (expected 1 — only gym A was removed)', n; end if;
  if not exists (select 1 from public.gym_membership where user_id = quitado and gym_id = gym_b) then
    raise exception 'SCOPE FAIL: the trigger removed quitado''s gym B membership — it must only revoke sessions';
  end if;

  -- ── 6a: a role UPDATE does NOT revoke. Stated limit of the DELETE-only trigger, asserted ──
  update public.gym_membership set role = 'member' where user_id = colega and gym_id = gym_a;
  select count(*) into n from auth.sessions where user_id = colega;
  if n <> 1 then
    raise exception 'SCOPE FAIL: after a role UPDATE colega has % session(s), expected 1 — the trigger is DELETE-only (ADR-0016 §1)', n;
  end if;

  -- ── 6b: removing a membership for a user with no sessions left is a silent no-op ──
  delete from public.gym_membership where user_id = quitado and gym_id = gym_b;
  select count(*) into n from public.gym_membership where user_id = quitado;
  if n <> 0 then raise exception 'FAIL: quitado still holds % membership row(s) (expected 0)', n; end if;
end $$;

select 'revocacion sesion membresia: OK' as result;
rollback;
