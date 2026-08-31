-- Wedge-detector suite — shield plan §3(d) (docs/superpowers/plans/2026-08-30-auth-door-shield-plan.md).
--
-- Proves `public.registros_atorados()` reports the two wedge shapes FC-04 made invisible, and — the
-- part that actually rots — proves the SUPPRESSIONS still suppress. A detector that quietly widens
-- until every hourly run pages on demo accounts is FC-05 rebuilt inside its own fix; a detector that
-- quietly narrows says all-clear over a member who cannot get in. Both directions are asserted here.
--
-- The function writes nothing, so AGENTS.md's written-row rule and `rpc-coverage.json` do not apply
-- (the coverage guard DERIVES that from the body — there is no flag to set). It is covered anyway
-- because its whole contract is WHICH ROWS it returns, and that contract has no other test.
--
-- GRANT POSTURE is a vector, not a comment (V7): the function reads `auth.users` as its owner, so the
-- one thing that must never drift is who can call it. Supabase's default privileges hand EXECUTE to
-- PUBLIC + anon + authenticated on every new `public` function; the migration revokes all three and
-- re-grants nobody. The only caller left is the owner — which is exactly the role the Management API
-- `database/query` endpoint connects as, i.e. the cron, and this suite.
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): the gym is looked up by slug from the spine seeds, every
-- auth user is `gen_random_uuid()`. Fixtures are transaction-local (BEGIN/ROLLBACK) so the target
-- project is REUSABLE with no reset. Every assertion is keyed on THIS suite's own addresses, never on
-- a total count, so pre-existing rows on the target cannot make it pass or fail.
--
-- HOW TO RUN: `node supabase/tests/run-denial-suite.mjs` (wired into SUITE), or ad hoc via the
-- Supabase MCP execute_sql against a SCRATCH project — never live.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs) ────────────────────────────
-- `now()` is the transaction's start time, so every age below is exact and stable for the whole run.
do $$
declare
  gym_a         uuid;
  u_atorado     uuid := gen_random_uuid();  -- V1: unconfirmed 3h — the Sarahí shape
  u_reciente    uuid := gen_random_uuid();  -- V2: unconfirmed 30min — inside the 2h grace
  u_abandonado  uuid := gen_random_uuid();  -- V2: unconfirmed 40d — past the ceiling
  u_demo        uuid := gen_random_uuid();  -- V3: red-demo twin, unconfirmed 3d
  u_demo_mayus  uuid := gen_random_uuid();  -- V3: same, mixed case
  u_demo_forge  uuid := gen_random_uuid();  -- V3: forge-demo twin
  u_borrado     uuid := gen_random_uuid();  -- V4: soft-deleted, unconfirmed 3d
  u_sinvincular uuid := gen_random_uuid();  -- V5: confirmed 48h, no cliente points at it
  u_vinculado   uuid := gen_random_uuid();  -- V6: confirmed 48h, linked
  u_antiguo     uuid := gen_random_uuid();  -- V6: confirmed 40d, unlinked — past the ceiling
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

  insert into auth.users
    (instance_id, id, aud, role, email, email_confirmed_at, created_at, deleted_at, raw_user_meta_data)
  values
    ('00000000-0000-0000-0000-000000000000', u_atorado,     'authenticated','authenticated',
     'atorada@wedge-suite.mx',        null,                        now() - interval '3 hours',  null, '{}'),
    ('00000000-0000-0000-0000-000000000000', u_reciente,    'authenticated','authenticated',
     'reciente@wedge-suite.mx',       null,                        now() - interval '30 minutes', null, '{}'),
    ('00000000-0000-0000-0000-000000000000', u_abandonado,  'authenticated','authenticated',
     'abandonada@wedge-suite.mx',     null,                        now() - interval '40 days',  null, '{}'),
    ('00000000-0000-0000-0000-000000000000', u_demo,        'authenticated','authenticated',
     'atorada@red-demo.test',         null,                        now() - interval '3 days',   null, '{}'),
    ('00000000-0000-0000-0000-000000000000', u_demo_mayus,  'authenticated','authenticated',
     'Atorada.Mayus@RED-DEMO.TEST',   null,                        now() - interval '3 days',   null, '{}'),
    ('00000000-0000-0000-0000-000000000000', u_demo_forge,  'authenticated','authenticated',
     'atorada@forge-demo.test',       null,                        now() - interval '3 days',   null, '{}'),
    ('00000000-0000-0000-0000-000000000000', u_borrado,     'authenticated','authenticated',
     'borrada@wedge-suite.mx',        null,                        now() - interval '3 days',   now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', u_sinvincular, 'authenticated','authenticated',
     'sinvincular@wedge-suite.mx',    now() - interval '48 hours', now() - interval '3 days',   null, '{}'),
    ('00000000-0000-0000-0000-000000000000', u_vinculado,   'authenticated','authenticated',
     'vinculada@wedge-suite.mx',      now() - interval '48 hours', now() - interval '3 days',   null, '{}'),
    ('00000000-0000-0000-0000-000000000000', u_antiguo,     'authenticated','authenticated',
     'antigua@wedge-suite.mx',        now() - interval '40 days',  now() - interval '41 days',  null, '{}');

  -- The desk's parallel identity for the wedged member (FC-06): an UNCLAIMED roster row carrying the
  -- same address. `filas_roster` must count it — that number is what tells the alert reader whether
  -- the gym already has this person on the books under a second identity.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Atorada Mostrador', '6141110001', 0, 'atorada@wedge-suite.mx', null);
  -- V6's control: a properly linked member. Confirmed and claimed = not a wedge.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym_a, 'Vinculada Sana', '6141110002', 0, 'vinculada@wedge-suite.mx', u_vinculado);
end $$;

-- ══ V1 — arm 1 catches the unconfirmed account past the 2h grace, with its age and roster count ═════
do $$
declare r record; n int;
begin
  select * into r from public.registros_atorados() where correo = 'atorada@wedge-suite.mx';
  if r.correo is null then
    raise exception 'V1 FAIL: an account unconfirmed for 3h is not reported — the wedge is invisible again (FC-04)';
  end if;
  if r.motivo <> 'sin-confirmar' then
    raise exception 'V1 FAIL: motivo = % (expected sin-confirmar)', r.motivo;
  end if;
  -- The age is what makes the alert triageable: 34h vs 3h is the difference between a repair and a
  -- retry. Reported in whole hours since `created_at`.
  if r.horas is distinct from 3 then
    raise exception 'V1 FAIL: horas = % (expected 3 since created_at)', r.horas;
  end if;
  if r.desde is null then raise exception 'V1 FAIL: desde is null — the alert cannot say since when'; end if;
  -- FC-06: the desk's unclaimed row for the same address must be counted, not reported as 0.
  if r.filas_roster is distinct from 1 then
    raise exception 'V1 FAIL: filas_roster = % (expected the 1 unclaimed desk row for this address)', r.filas_roster;
  end if;
  -- One row per user, not one per arm.
  select count(*) into n from public.registros_atorados() where correo = 'atorada@wedge-suite.mx';
  if n <> 1 then raise exception 'V1 FAIL: the wedged account is reported % times (expected 1)', n; end if;
end $$;

-- ══ V2 — arm 1's two silences: the 2h grace below, and the 30-day ceiling above ═════════════════════
do $$
declare n int;
begin
  -- A signup still inside its own confirmation window is not a wedge.
  select count(*) into n from public.registros_atorados() where correo = 'reciente@wedge-suite.mx';
  if n <> 0 then
    raise exception 'V2 FAIL: a 30-minute-old signup was reported as wedged — every normal registration would page';
  end if;
  -- Self-registration is public, so abandoned signups accrete forever. Without the ceiling the
  -- hourly alert becomes a permanent, growing list of strangers' addresses that nobody reads.
  select count(*) into n from public.registros_atorados() where correo = 'abandonada@wedge-suite.mx';
  if n <> 0 then
    raise exception 'V2 FAIL: a 40-day-old unconfirmed signup was reported — arm 1 lost its actionability ceiling';
  end if;
end $$;

-- ══ V3 — SUPPRESSIONS: sandbox twins never page, in any case ════════════════════════════════════════
-- The red-demo twin logs in on purpose and its accounts sit unconfirmed and unlinked forever
-- (docs/superpowers/plans/2026-07-05-slice-45-red-demo-twin.md). At an hourly cadence one
-- unsuppressed sandbox row is ~720 alert mails a month, on the same Resend account the detector
-- needs in order to reach anyone (FC-08) — the alert-fatigue failure this signal exists to correct.
do $$
declare n int;
begin
  select count(*) into n from public.registros_atorados()
   where lower(correo) in ('atorada@red-demo.test', 'atorada.mayus@red-demo.test', 'atorada@forge-demo.test');
  if n <> 0 then
    raise exception 'V3 FAIL: % sandbox account(s) reported — the suppression list stopped suppressing', n;
  end if;
end $$;

-- ══ V4 — a soft-deleted account is not a person waiting to get in ══════════════════════════════════
do $$
declare n int;
begin
  select count(*) into n from public.registros_atorados() where correo = 'borrada@wedge-suite.mx';
  if n <> 0 then raise exception 'V4 FAIL: a deleted auth user (deleted_at set) was reported as wedged'; end if;
end $$;

-- ══ V5 — arm 2: confirmed but never linked. The shape a manual confirm LEAVES BEHIND ════════════════
-- Confirming the email does not perform the claim, so this member logs in and finds no gym. It is
-- invisible to the invite badge (FC-20), which keys on `clientes` columns only.
do $$
declare r record;
begin
  select * into r from public.registros_atorados() where correo = 'sinvincular@wedge-suite.mx';
  if r.correo is null then
    raise exception 'V5 FAIL: confirmed-but-unlinked for 48h is not reported — the post-repair wedge stays invisible';
  end if;
  if r.motivo <> 'sin-vincular' then
    raise exception 'V5 FAIL: motivo = % (expected sin-vincular)', r.motivo;
  end if;
  if r.horas is distinct from 48 then
    raise exception 'V5 FAIL: horas = % (expected 48 since email_confirmed_at)', r.horas;
  end if;
end $$;

-- ══ V6 — arm 2's two silences: a linked member, and a wedge past the actionability ceiling ══════════
do $$
declare n int;
begin
  select count(*) into n from public.registros_atorados() where correo = 'vinculada@wedge-suite.mx';
  if n <> 0 then
    raise exception 'V6 FAIL: a confirmed member WITH a cliente row was reported — every healthy member would page';
  end if;
  -- 40 days broken is not news; the alert already said so ~700 times (arm 1's twin is in V2).
  select count(*) into n from public.registros_atorados() where correo = 'antigua@wedge-suite.mx';
  if n <> 0 then
    raise exception 'V6 FAIL: a 40-day-old unlinked account was reported — arm 2 has no actionability ceiling';
  end if;
end $$;

-- ══ V7 — GRANT POSTURE: the two member-facing roles cannot call it at all ═══════════════════════════
-- This function reads every account on the platform, cross-tenant, by design — it is an ops signal,
-- not a product surface. If EXECUTE ever reaches `anon` or `authenticated`, PostgREST publishes a
-- platform-wide email enumeration oracle at /rest/v1/rpc/registros_atorados.
set local role authenticated;
do $$
begin
  perform * from public.registros_atorados();
  raise exception 'V7 FAIL: `authenticated` executed registros_atorados() — every member can enumerate every account';
exception when insufficient_privilege then null;   -- 42501, the expected denial
end $$;
reset role;

set local role anon;
do $$
begin
  perform * from public.registros_atorados();
  raise exception 'V7 FAIL: `anon` executed registros_atorados() — the oracle is open to the internet';
exception when insufficient_privilege then null;
end $$;
reset role;

-- `service_role` is in the same default-ACL grant set (`{postgres,anon,authenticated,service_role}=X`);
-- no server-side caller uses it for this signal (the cron connects as `postgres` via the Management
-- API), so a leaked service key must not gain the enumeration oracle either.
set local role service_role;
do $$
begin
  perform * from public.registros_atorados();
  raise exception 'V7 FAIL: `service_role` executed registros_atorados() — a leaked service key gains the enumeration oracle';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'registros atorados suite: OK' as result;
rollback;
