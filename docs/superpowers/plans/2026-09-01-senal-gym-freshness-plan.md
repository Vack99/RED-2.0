# Señal gym — freshness rail implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff and members stop having to refresh. A Postgres AFTER-STATEMENT trigger emits at most one Realtime broadcast per gym per transaction to the private topic `gym:<gym_id>`; every open tab answers it with a debounced `router.refresh()`, held while a sheet or an in-flight write is open. Underneath it, the free floor: refresh on `visibilitychange`, and stop the door poll from firing at hidden tabs.

**Architecture:** One migration (`public.senal_gym()` trigger function + 15 statement triggers + one SELECT policy on `realtime.messages` + a safe topic→uuid cast), one SQL contract suite, one browser module in `@gym/data/client-senal` (a pure debounce/busy regulator plus a React hook over the singleton browser Supabase client), and four mount/wiring points: the admin `(app)` layout, the door screen's interval, the agenda sheets, and the member `reservar`/`clase` layouts. The signal carries no data — `{"t":"<tabla>"}` — so RLS stays the only boundary and the refresh re-reads through the existing `server-only` DAL.

**Tech Stack:** pnpm 11 + Turborepo · Next.js App Router (`apps/admin`, `apps/client`) · TypeScript 5 · Vitest (node env, no jsdom) · Supabase Postgres 17.6 + Realtime Broadcast-from-database · `@supabase/supabase-js` 2.106.2.

**Spec:** `docs/superpowers/plans/2026-09-01-senal-gym-freshness-spec.md`
**Source audit:** `docs/FIndings/2026-09-01-freshness-audit-realtime-verdict.md`

## Global constraints

- **Branch first.** `git checkout -b senal-gym` before Task 1. Never commit this work directly onto `main`.
- **NEVER `git push`.** Every push deploys both Vercel apps and is owner-gated (CLAUDE.md). This plan ends with local commits only.
- **NEVER run `next dev`** — it fork-bombs on Node 24 on this machine. Use `next build && next start` (which is what the Playwright `webServer` already does).
- Pre-commit runs `pnpm lint && pnpm typecheck && pnpm test`. Never `--no-verify`.
- Commit messages end with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Package manager is **pnpm**. Never `npm install`.
- The Supabase MCP is bound to **LIVE**. `apply_migration` hits production. It runs only in Task 5, after the denial suite and the e2e gate are green.

---

## Task 1 — Migration `senal_gym` + its contract suite

**Files:**
- Create: `supabase/migrations/20260901120000_senal_gym.sql`
- Create: `supabase/tests/senal_gym.sql`
- Modify: `supabase/tests/run-denial-suite.mjs` (the `SUITE` array, after `'registros_atorados.sql'`)
- Create (generated): `supabase/functions-canonical/senal_gym.sql`, `supabase/functions-canonical/senal_topic_gym.sql`
- Test: `supabase/tests/senal_gym.sql` (self-asserting SQL), plus the existing `tools/guards/*.test.ts` shields

**Interfaces:**
- Produces: `public.senal_gym() returns trigger` — `language plpgsql security definer set search_path = ''`, owned by `postgres`.
- Produces: `public.senal_topic_gym(p_topic text) returns uuid` — `immutable strict`, `null` on a non-`gym:<uuid>` topic.
- Produces: 15 triggers, `senal_<tabla>_{ins,upd,del}` on `reservation`, `class_session`, `clientes`, `ventas`, `asistencias`. The UPDATE trigger takes BOTH transition tables (`referencing old table as o new table as n`), so a row whose `gym_id` moves signals the gym it left as well as the one it joined.
- Produces: policy `senal_gym_select` on `realtime.messages`, `for select to authenticated`.
- Produces: broadcast message `{"t":"<tabla>"}`, event `cambio`, topic `gym:<gym_id>`, `private = true`.
- Consumes: `public.is_member_of(uuid)` (`supabase/migrations/20260702161010_create_gym_membership.sql:34`), `realtime.send(jsonb, text, text, boolean)`, `realtime.topic()`.

**Steps:**

- [ ] Write the suite FIRST (it fails until the migration exists). Create `supabase/tests/senal_gym.sql`:

```sql
-- senal_gym: the freshness signal rail's contract (audit 2026-09-01, verdict §2).
--
-- What is invisible to vitest here: `packages/data` mocks the RPC boundary, so nothing in
-- `pnpm test` can see whether a write actually reaches `realtime.messages`, nor whether the
-- SELECT policy on that table lets the right tenant subscribe and denies the other. Both are
-- proved here, against the REAL deployed trigger + policy, in a rolled-back transaction.
--
--   * emits once      — ONE `reservar_clase` call writes `reservation` AND `clientes` (both
--                       asserted on the WRITTEN ROWS, never on the return value) and lands
--                       EXACTLY ONE row on topic 'gym:<A>'. Measured before/after that call,
--                       not on the seed: the seed's own writes are cleared first.
--   * dedupe          — a SECOND booking in the same transaction adds ZERO rows.
--   * policy grants   — a member of gym A, with `realtime.topic` set to 'gym:<A>', reads it.
--   * policy denies   — a member of gym B, same topic, reads NOTHING.
--   * bad topic       — 'gym:no-soy-uuid' denies and does NOT raise 22P02 (the safe cast).
--
-- WHY THIS FILE NEEDS A SUPERUSER DB: `realtime.messages` is RANGE-partitioned on `inserted_at`
-- and Supabase's Realtime service — not SQL — creates the daily partitions. On a scratch/local DB
-- no partition exists, `realtime.send` swallows the failure (its body is one `WHEN OTHERS ->
-- RAISE WARNING`) and every assertion below would read 0 rows for the wrong reason. The role
-- `postgres` may NOT create one (verified live: 42501 permission denied for schema realtime), so
-- this suite runs on the LOCAL DOCKER stack, where `postgres` is superuser. It raises a named
-- exception rather than passing quietly anywhere else.
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row.
-- BEGIN/ROLLBACK, so it touches no row permanently. Zero hardcoded prod UUIDs.
--
-- HOW TO RUN: the local docker path in the plan's Task 5 — or `node supabase/tests/run-denial-suite.mjs`
-- against a superuser target. Wired into the runner's SUITE.

begin;

-- ── Partition precondition ──────────────────────────────────────────────────────
do $$
begin
  execute format(
    'create table if not exists realtime.%I partition of realtime.messages for values from (%L) to (%L)',
    'messages_' || to_char(current_date, 'YYYY_MM_DD'),
    current_date::timestamp,
    (current_date + 1)::timestamp);
exception when insufficient_privilege then
  raise exception 'SETUP FAIL: cannot create today''s realtime.messages partition. This suite needs a SUPERUSER database (the local docker stack); the cloud `postgres` role has no CREATE on schema realtime.';
end $$;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  gym_a  uuid := gen_random_uuid();
  gym_b  uuid := gen_random_uuid();
  m_a    uuid := gen_random_uuid();
  m_b    uuid := gen_random_uuid();
  c_a    uuid;
  ct_a   uuid;
  s_uno  uuid;
  s_dos  uuid;
  v_today date;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id, booking_enabled)
    values (gym_a, 'senal-gym-a', 'Senal Gym A', 'America/Chihuahua', 'forge', true),
           (gym_b, 'senal-gym-b', 'Senal Gym B', 'America/Chihuahua', 'red',   true);

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', m_a, 'authenticated', 'authenticated', 'senal-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_b, 'authenticated', 'authenticated', 'senal-b@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (m_a, gym_a, 'member'), (m_b, gym_b, 'member');

  v_today := (now() at time zone 'America/Chihuahua')::date;

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Senal A', '0000009001', 5, v_today + 20, '8 clases', gym_a, m_a) returning id into c_a;

  insert into public.class_type (gym_id, name) values (gym_a, 'Senal Metcon') returning id into ct_a;

  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct_a, now() + interval '2 days', 60, 20) returning id into s_uno;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct_a, now() + interval '2 days 1 hour', 60, 20) returning id into s_dos;

  perform set_config('t.gym_a', gym_a::text, true);
  perform set_config('t.gym_b', gym_b::text, true);
  perform set_config('t.m_a',   m_a::text,   true);
  perform set_config('t.m_b',   m_b::text,   true);
  perform set_config('t.c_a',   c_a::text,   true);
  perform set_config('t.s_uno', s_uno::text, true);
  perform set_config('t.s_dos', s_dos::text, true);
end $$;

-- The seed's own writes (clientes, class_session) already fired the rail once and armed gym A's
-- dedupe GUC. Clear BOTH — the rows and the marker — so the vector below measures ONE call in
-- isolation, which is exactly the production shape: one HTTP request is one transaction. That
-- the seed emitted at all is itself the first proof the triggers are installed.
do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  v_n int;
begin
  select count(*) into v_n from realtime.messages where topic like 'gym:%';
  if v_n < 1 then raise exception 'SETUP FAIL: the seed''s own writes emitted nothing — the senal_gym triggers are not installed'; end if;

  delete from realtime.messages where topic like 'gym:%';
  perform set_config('senal.g_' || replace(gym_a::text, '-', ''), '', true);

  select count(*) into v_n from realtime.messages where topic like 'gym:%';
  if v_n <> 0 then raise exception 'SETUP FAIL: % message(s) survived the reset', v_n; end if;
end $$;

-- ── Emits once: ONE call writes reservation AND clientes, and lands ONE message ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.reservar_clase(current_setting('t.s_uno', true)::uuid);
end $$;
reset role;

do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  c_a   uuid := current_setting('t.c_a', true)::uuid;
  v_n int; v_res int; v_saldo int; v_event text; v_priv boolean; v_t text;
begin
  -- The two written tables, proved on the WRITTEN ROWS rather than on the RPC's return value
  -- (#78/#80) — otherwise "one message" could be true because only one table was written.
  select count(*) into v_res from public.reservation
    where member_id = c_a and class_session_id = current_setting('t.s_uno', true)::uuid and status = 'reservada';
  if v_res <> 1 then raise exception 'SETUP FAIL(emits once): % booking row(s) (expected 1) — reservation was not written', v_res; end if;
  select clases_restantes into v_saldo from public.clientes where id = c_a;
  if v_saldo <> 4 then raise exception 'SETUP FAIL(emits once): balance % (expected the single consume to 4) — clientes was not written', v_saldo; end if;

  select count(*) into v_n from realtime.messages where topic = 'gym:' || gym_a::text;
  if v_n <> 1 then raise exception 'RULE FAIL(emits once): % message(s) for ONE call that wrote reservation AND clientes (expected exactly 1)', v_n; end if;

  select event, private, payload ->> 't' into v_event, v_priv, v_t
    from realtime.messages where topic = 'gym:' || gym_a::text;
  if v_event is distinct from 'cambio' then raise exception 'RULE FAIL(emits once): event % (expected cambio)', v_event; end if;
  if v_priv is distinct from true then raise exception 'RULE FAIL(emits once): message is not private'; end if;
  if v_t is null then raise exception 'RULE FAIL(emits once): payload carries no table name'; end if;

  -- Nothing was ever written for gym B, so its topic must be silent — the trigger keys on the
  -- ROW's gym_id, never on the caller.
  select count(*) into v_n from realtime.messages
    where topic like 'gym:%' and topic <> 'gym:' || gym_a::text;
  if v_n <> 0 then raise exception 'RULE FAIL(emits once): % message(s) on some other gym''s topic', v_n; end if;
end $$;

-- ── Dedupe: a SECOND booking in the SAME transaction adds nothing ────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.reservar_clase(current_setting('t.s_dos', true)::uuid);
end $$;
reset role;

do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  v_n int; v_res int;
begin
  select count(*) into v_res from public.reservation
    where member_id = current_setting('t.c_a', true)::uuid and status = 'reservada';
  if v_res <> 2 then raise exception 'SETUP FAIL(dedupe): % booking(s) (expected 2) — the second write did not happen', v_res; end if;

  select count(*) into v_n from realtime.messages where topic = 'gym:' || gym_a::text;
  if v_n <> 1 then raise exception 'RULE FAIL(dedupe): % message(s) after a second call wrote two more tables (expected the original 1)', v_n; end if;
end $$;

-- ── The SELECT policy: gym A's member, subscribed to gym A's topic, reads it ─────
select set_config('realtime.topic', 'gym:' || current_setting('t.gym_a', true), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_n int;
begin
  select count(*) into v_n from realtime.messages
    where topic = 'gym:' || current_setting('t.gym_a', true);
  if v_n <> 1 then raise exception 'RULE FAIL(policy grants): gym A''s own member reads % row(s) on gym A''s topic (expected 1)', v_n; end if;
end $$;
reset role;

-- ── …and gym B's member, on the SAME topic, reads nothing ────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_n int;
begin
  select count(*) into v_n from realtime.messages
    where topic = 'gym:' || current_setting('t.gym_a', true);
  if v_n <> 0 then raise exception 'RULE FAIL(policy denies): a member of ANOTHER gym read % row(s) on gym A''s topic', v_n; end if;
end $$;
reset role;

-- ── A malformed topic DENIES; it must not raise 22P02 inside the policy ──────────
select set_config('realtime.topic', 'gym:no-soy-uuid', true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_n int;
begin
  select count(*) into v_n from realtime.messages;
  if v_n <> 0 then raise exception 'RULE FAIL(bad topic): a non-uuid topic read % row(s)', v_n; end if;
exception when invalid_text_representation then
  raise exception 'RULE FAIL(bad topic): the policy RAISED 22P02 instead of denying — senal_topic_gym is not guarding the cast';
end $$;
reset role;

select 'senal_gym: OK' as result;
rollback;
```

- [ ] Wire the suite into the runner. In `supabase/tests/run-denial-suite.mjs`, add the line `  'senal_gym.sql',` immediately after `  'registros_atorados.sql',` inside the `SUITE` array, and extend the run-order prose right above `export const SUITE` by appending this sentence to the comment block's final paragraph:

```js
// A new suite closes the list after registros_atorados: senal_gym (audit 2026-09-01) — the ONLY
// file here whose subject is `realtime.messages` rather than a public table. It proves the
// freshness rail's two invisible halves: one broadcast per gym per transaction, and a SELECT
// policy that lets that gym's members subscribe and refuses everybody else's. It needs a
// SUPERUSER database (it creates today's realtime.messages partition), so it runs on the local
// docker stack, not on a cloud scratch project.
```

- [ ] Run it and watch it fail for the right reason:

```bash
cd /c/Users/Aaron/Documents/Repos/RED-2.0
docker cp supabase/tests/senal_gym.sql supabase_db_red-2-0:/tmp/senal_gym.sql
docker exec supabase_db_red-2-0 psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/senal_gym.sql
```

Expected failure: `ERROR: SETUP FAIL: the seed's own writes emitted nothing — the senal_gym triggers are not installed`. That is the assertion firing for the right reason: the migration does not exist yet, so nothing was broadcast.

(`docker cp` takes a path relative to the current directory here; the Bash tool resets `cwd` between calls, so the `cd` is part of every docker step below. A `/c/...`-style absolute path is NOT interchangeable — Docker Desktop does not resolve the Git-Bash drive form.)

- [ ] Create `supabase/migrations/20260901120000_senal_gym.sql`:

```sql
-- senal_gym — the "signal, not data" freshness rail (audit 2026-09-01,
-- docs/FIndings/2026-09-01-freshness-audit-realtime-verdict.md, verdict §2).
--
-- THE PROBLEM: staff and members must reload to see anybody else's change. A staff agenda card
-- reads 8/12 while members book seats 9-12 from their phones; the member's saldo and week view
-- never move while open; the ONE poll that exists (the door screen, 5 min) fires at hidden tabs.
--
-- THE SHAPE: a statement-level trigger emits ONE Realtime broadcast per gym per TRANSACTION to
-- the private topic `gym:<gym_id>`, carrying no data — just `{"t":"<tabla>"}`. The browser answers
-- it with a debounced `router.refresh()`, which re-reads through the existing `server-only` DAL.
-- So RLS stays the only boundary and no payload can cross a tenant line. Rejected alternatives
-- (Postgres Changes, Vercel SSE, a bare interval) are argued in the audit.
--
-- WHY SECURITY DEFINER OWNED BY postgres, and why it is not decoration: `realtime.messages` has
-- RLS enabled with ZERO policies for INSERT, and `realtime.send` is SECURITY INVOKER. An invoker
-- trigger would therefore have its insert RLS-DENIED — and `realtime.send`'s body is one
-- `WHEN OTHERS -> RAISE WARNING`, so the denial would be SWALLOWED and the whole rail would be
-- silently dead. `postgres` is the definer because it is `rolbypassrls` (verified live; it is not
-- a superuser, and that is enough).
--
-- WHY THREE TRIGGERS PER TABLE INSTEAD OF ONE: Postgres refuses transition tables on a
-- multi-event trigger — "transition tables cannot be specified for triggers with more than one
-- event" (verified by probe). NEW TABLE is only legal for INSERT/UPDATE and OLD TABLE only for
-- UPDATE/DELETE, so one event per trigger is the only correct form. The single function branches
-- on TG_OP; plpgsql plans a statement only when it executes it, so the untaken branch never
-- resolves the transition table it does not have.
--
-- WHY THE UPDATE TRIGGER TAKES BOTH TRANSITION TABLES: a re-keyed row (a cliente moved between
-- gyms) leaves one gym and joins another, and the gym it LEFT needs the signal just as much —
-- its roster shrank. Reading `n` alone would tell the new gym and leave the old one stale
-- forever, since no further write to that row ever mentions it again. The UPDATE arm therefore
-- unions the gym_ids of both tables. Verified by probe: moving gym_id from A to B signals both.
--
-- WHY STATEMENT-LEVEL AND WHY THE GUC: retiring a recurring series touches up to 986 rows in one
-- commit (measured, live worst case). Per-row that is 986 messages against a 100 msg/s Free-plan
-- ceiling; statement-level it is ~89; deduped by a transaction-local GUC it is ONE. The GUC name
-- is `senal.g_<uuid without dashes>` — a custom parameter needs a dotted prefix, and a uuid's
-- dashes are not legal in one.
--
-- TABLES: the cross-user writes a second person needs to see. `class_session_coach` is skipped
-- deliberately: it carries no `gym_id`, and every write to it is accompanied by one to
-- `class_session` in the same transaction, which is the message that would have been sent anyway.
-- `gym_id` is NOT NULL on all five (20260702161613 §5), so the `where gym_id is not null` filter
-- below is belt-and-braces, not a real branch: it exists so that if a future expand-only
-- migration adds a sixth table before its backfill lands, the trigger skips the unscoped rows
-- instead of broadcasting to the literal topic `gym:` and, worse, poisoning the dedupe GUC.
--
-- WHY THIS MIGRATION MUST NOT CREATE PARTITIONS: `realtime.messages` is RANGE-partitioned on
-- `inserted_at`, and the Realtime SERVICE owns those partitions — it creates yesterday..today+3
-- when it provisions a tenant's connection, i.e. on the first client subscribe
-- (`supabase/realtime`: lib/realtime/tenants/connect.ex + tenants.ex; the Janitor only DELETES
-- partitions older than 72h). `postgres` cannot create one anyway — 42501, no CREATE on schema
-- realtime (verified live). So until one tab subscribes, `realtime.send` writes 0 rows and
-- swallows it. That is the correct order of operations, not a defect: subscribe first, then the
-- rail carries. Post-deploy verification is a named step in the plan rather than an assumption.

create or replace function public.senal_gym()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_gyms uuid[];
  v_gym  uuid;
  v_guc  text;
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct gym_id) into v_gyms from n where gym_id is not null;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct z.gym_id) into v_gyms
      from (select gym_id from n union all select gym_id from o) z
     where z.gym_id is not null;
  else
    select array_agg(distinct gym_id) into v_gyms from o where gym_id is not null;
  end if;

  foreach v_gym in array coalesce(v_gyms, '{}'::uuid[]) loop
    v_guc := 'senal.g_' || replace(v_gym::text, '-', '');
    if coalesce(current_setting(v_guc, true), '') = '' then
      perform set_config(v_guc, '1', true);
      perform realtime.send(jsonb_build_object('t', tg_table_name), 'cambio', 'gym:' || v_gym::text, true);
    end if;
  end loop;

  return null;
end;
$$;

-- The ownership IS the mechanism (see the header). A no-op on the apply path, which already runs
-- as `postgres` — and an assertion on any path that does not.
alter function public.senal_gym() owner to postgres;

-- EXECUTE lockdown, house style (mirrors 20260702161010). A trigger function's EXECUTE privilege
-- is checked at CREATE TRIGGER time, never at fire time, so revoking it here does not stop the
-- triggers below — and supabase/tests/senal_gym.sql proves that by firing them from an
-- `authenticated` session.
revoke execute on function public.senal_gym() from public, anon;

-- The topic -> gym cast, made safe. The policy below runs `substring(topic from 5)::uuid`, and a
-- 22P02 raised INSIDE a policy breaks the subscribe rather than denying it — any client can pick
-- its own topic string, so that is a client-triggerable error, not a theoretical one. Returning
-- null instead makes `is_member_of(null)` false, i.e. a denial.
create or replace function public.senal_topic_gym(p_topic text)
  returns uuid
  language plpgsql
  immutable
  strict
  set search_path = ''
as $$
begin
  return substring(p_topic from 5)::uuid;
exception when others then
  return null;
end;
$$;

revoke execute on function public.senal_topic_gym(text) from public, anon;
grant execute on function public.senal_topic_gym(text) to authenticated;

-- 15 triggers: 5 tables x {insert, update, delete}. Emitted from a loop rather than written out
-- so the set cannot drift table-by-table. `drop … if exists` first keeps the migration re-runnable.
do $do$
declare
  t text;
begin
  foreach t in array array['reservation', 'class_session', 'clientes', 'ventas', 'asistencias'] loop
    execute format('drop trigger if exists %I on public.%I', 'senal_' || t || '_ins', t);
    execute format('drop trigger if exists %I on public.%I', 'senal_' || t || '_upd', t);
    execute format('drop trigger if exists %I on public.%I', 'senal_' || t || '_del', t);
    execute format(
      'create trigger %I after insert on public.%I referencing new table as n for each statement execute function public.senal_gym()',
      'senal_' || t || '_ins', t);
    execute format(
      'create trigger %I after update on public.%I referencing old table as o new table as n for each statement execute function public.senal_gym()',
      'senal_' || t || '_upd', t);
    execute format(
      'create trigger %I after delete on public.%I referencing old table as o for each statement execute function public.senal_gym()',
      'senal_' || t || '_del', t);
  end loop;
end
$do$;

-- The subscribe gate. `realtime.messages` had RLS on and ZERO policies, so a private channel could
-- not be joined by anybody; this is the first and only policy on it. Realtime evaluates it ONCE
-- per topic subscription with `realtime.topic` set to the requested topic — it authorizes a TOPIC,
-- not individual rows, which is why the expression reads the GUC and not the `topic` column.
--
-- No `grant select on realtime.messages to authenticated` and no `grant usage on schema realtime`:
-- both already exist by default on a Supabase project (verified live — relacl `authenticated=arw`,
-- nspacl `authenticated=U`). Their absence here is a decision, not an omission.
drop policy if exists senal_gym_select on realtime.messages;
create policy senal_gym_select on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'gym:%'
    and public.is_member_of(public.senal_topic_gym(realtime.topic()))
  );
```

- [ ] Apply it to the local docker stack and re-run the suite:

```bash
cd /c/Users/Aaron/Documents/Repos/RED-2.0
docker cp supabase/migrations/20260901120000_senal_gym.sql supabase_db_red-2-0:/tmp/senal_gym_mig.sql
docker exec supabase_db_red-2-0 psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/senal_gym_mig.sql
docker cp supabase/tests/senal_gym.sql supabase_db_red-2-0:/tmp/senal_gym.sql
docker exec supabase_db_red-2-0 psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/senal_gym.sql
```

Expected pass: the migration prints `CREATE FUNCTION` / `ALTER FUNCTION` / `DO` / `CREATE POLICY`, and the suite's last row is `senal_gym: OK` followed by `ROLLBACK`.

- [ ] Regenerate the canonical function view — `tools/guards/rpc-canon-drift.test.ts` fails without it:

```bash
pnpm gen:rpc-canon
git status --short supabase/functions-canonical
```

Expected: two new untracked files, `supabase/functions-canonical/senal_gym.sql` and `supabase/functions-canonical/senal_topic_gym.sql`.

- [ ] Run the repo gate. `denial-suite-drift` must see the new `.sql` wired, `rpc-canon-drift` must see the two new canonical files, and `rpc-write-coverage` must NOT demand a `rpc-coverage.json` entry (both new functions derive as pure readers — their only write goes through `realtime.send`, which is not in the `public` census, and `propagateWrites` only closes over `public` functions):

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected pass: all green, including `denial-suite wiring drift`, `RPC canonical-body drift`, and `RPC write-coverage`.

- [ ] Commit:

```bash
git add supabase/migrations/20260901120000_senal_gym.sql supabase/tests/senal_gym.sql supabase/tests/run-denial-suite.mjs supabase/functions-canonical/senal_gym.sql supabase/functions-canonical/senal_topic_gym.sql
git commit -m "$(cat <<'EOF'
feat(senal): one broadcast per gym per transaction, and the policy that lets that gym read it

public.senal_gym() is SECURITY DEFINER owned by postgres because realtime.messages has RLS on
with zero INSERT policies and realtime.send is SECURITY INVOKER — an invoker trigger's insert is
denied, and send swallows the denial, so the rail would be silently dead. Three triggers per
table (Postgres refuses transition tables on a multi-event trigger), five tables, deduped to one
message per gym per transaction by a transaction-local GUC: a 986-row series retire becomes one
message instead of 986.

senal_topic_gym() keeps a client-chosen topic from raising 22P02 inside the policy; a bad topic
denies instead. supabase/tests/senal_gym.sql proves emits-once, dedupe, and that a member of
another gym reads nothing on this gym's topic.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — The browser hook and its regulator

**Files:**
- Create: `packages/data/src/client-senal.ts`
- Create: `packages/data/src/client-senal.test.ts`
- Modify: `packages/data/package.json` (the `exports` map, one line after `"./client"`)

**Interfaces:**
- Consumes: `createClient()` from `packages/data/src/client.ts` (the `@supabase/ssr` browser singleton).
- Consumes: `REALTIME_SUBSCRIBE_STATES`, `type RealtimeChannel` from `@supabase/supabase-js` (re-exported from `@supabase/realtime-js`).
- Produces: `export type MotivoSenal = "senal" | "visible" | "rejoin"`
- Produces: `export const senalBusy: Set<string>`
- Produces: `export function ocuparSenal(key: string): void`
- Produces: `export function liberarSenal(key: string): void`
- Produces: `export interface Regulador { pedir(motivo: MotivoSenal): void; vaciar(): void; destruir(): void }`
- Produces: `export function crearRegulador(onSenal: (m: MotivoSenal) => void, debounceMs: number): Regulador`
- Produces: `export function useSenalGym(opts: { gymId: string | null | undefined; onSenal: (m: MotivoSenal) => void; debounceMs?: number }): void`

**Steps:**

- [ ] Write the test first. Create `packages/data/src/client-senal.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crearRegulador, liberarSenal, ocuparSenal, senalBusy } from "./client-senal";

// The browser client is never constructed by anything under test here — `crearRegulador` is
// deliberately free of React and of the DOM, because this repo has no jsdom and every vitest
// project runs `environment: "node"` (vitest.config.ts). Mocked anyway so importing the module
// cannot reach @supabase/ssr's browser globals.
vi.mock("./client", () => ({ createClient: () => ({}) }));

describe("crearRegulador", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    senalBusy.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    senalBusy.clear();
  });

  it("collapses a burst into ONE trailing call carrying the last motive", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    reg.pedir("senal");
    vi.advanceTimersByTime(300);
    reg.pedir("visible");
    vi.advanceTimersByTime(599);
    expect(onSenal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSenal).toHaveBeenCalledTimes(1);
    expect(onSenal).toHaveBeenCalledWith("visible");
    reg.destruir();
  });

  it("holds the refresh while something is busy, and fires it on release", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    ocuparSenal("hoja");
    reg.pedir("senal");
    vi.advanceTimersByTime(5_000);
    expect(onSenal).not.toHaveBeenCalled();

    liberarSenal("hoja");
    expect(onSenal).toHaveBeenCalledTimes(1);
    expect(onSenal).toHaveBeenCalledWith("senal");
    reg.destruir();
  });

  it("stays held while ANY other key is still busy", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    ocuparSenal("hoja");
    ocuparSenal("escritura");
    reg.pedir("senal");
    vi.advanceTimersByTime(5_000);

    liberarSenal("hoja");
    expect(onSenal).not.toHaveBeenCalled();

    liberarSenal("escritura");
    expect(onSenal).toHaveBeenCalledTimes(1);
    reg.destruir();
  });

  it("a release with nothing pending fires nothing", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    ocuparSenal("hoja");
    liberarSenal("hoja");
    vi.advanceTimersByTime(5_000);

    expect(onSenal).not.toHaveBeenCalled();
    reg.destruir();
  });

  it("destruir cancels the pending fire AND unregisters from the busy flush", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    ocuparSenal("hoja");
    reg.pedir("senal");
    reg.destruir();

    liberarSenal("hoja");
    vi.advanceTimersByTime(5_000);
    expect(onSenal).not.toHaveBeenCalled();
  });
});
```

- [ ] Run it and watch it fail:

```bash
pnpm vitest run --project data packages/data/src/client-senal.test.ts
```

Expected failure: `Failed to resolve import "./client-senal"` — the module does not exist yet.

- [ ] Create `packages/data/src/client-senal.ts`:

```ts
import { useEffect, useRef } from "react";
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "./client";

/**
 * The freshness rail's browser half (audit 2026-09-01). The DB emits one broadcast per gym per
 * transaction to the private topic `gym:<gym_id>` carrying no data; this answers it with a
 * debounced callback — in practice `router.refresh()`, which re-reads through the `server-only`
 * DAL. The signal is a hint that something changed; the SERVER is still the only thing that says
 * what.
 *
 * This module lives beside `client.ts` (never under `./server/`) and carries no `server-only`
 * poison-pill: it is browser code, and `@gym/ui` is forbidden from importing `@gym/data` at all,
 * so the apps are its only consumers.
 */
export type MotivoSenal = "senal" | "visible" | "rejoin";

/**
 * What must NOT be interrupted right now, by key. An open sheet holds a snapshot of a session
 * (`sheet.sesion` in reservar-semana.tsx) and an open editor holds an unsaved draft — refreshing
 * the route under either one destroys work the user can see. An in-flight write is held for a
 * different reason: it is about to produce its own authoritative result, so a refresh mid-flight
 * would repaint from a read that raced it.
 *
 * A plain module-level Set, not React state: the holders (a sheet in one component, a toggle in
 * another) and the regulators (one per mounted hook) never share a tree.
 */
export const senalBusy = new Set<string>();

const reguladores = new Set<Regulador>();

export function ocuparSenal(key: string): void {
  senalBusy.add(key);
}

/**
 * Release a hold and, when it was the LAST one, flush every regulator's pending motive at once.
 * That flush is the whole point: the refresh a user "missed" while their sheet was open lands the
 * instant they close it, rather than waiting for the next write anybody happens to make.
 */
export function liberarSenal(key: string): void {
  senalBusy.delete(key);
  if (senalBusy.size > 0) return;
  for (const reg of [...reguladores]) reg.vaciar();
}

export interface Regulador {
  /** Record a motive and (re)arm the trailing debounce. */
  pedir(motivo: MotivoSenal): void;
  /** Fire the pending motive now, if any. Called by `liberarSenal` when the busy set empties. */
  vaciar(): void;
  /** Cancel everything pending and unregister. */
  destruir(): void;
}

/**
 * The whole decision, deliberately free of React and of the DOM so it is unit-testable: this repo
 * has no jsdom and no testing-library, and every vitest project runs `environment: "node"`.
 *
 * TRAILING debounce, not leading: a pasar-lista of twenty members is twenty transactions and
 * therefore twenty signals, and the useful refresh is the one AFTER the last of them.
 */
export function crearRegulador(onSenal: (motivo: MotivoSenal) => void, debounceMs: number): Regulador {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendiente: MotivoSenal | null = null;

  const disparar = (): void => {
    timer = null;
    // Busy: keep the motive pending and say nothing. `liberarSenal` fires it on close.
    if (senalBusy.size > 0) return;
    const motivo = pendiente;
    pendiente = null;
    if (motivo) onSenal(motivo);
  };

  const reg: Regulador = {
    pedir(motivo) {
      pendiente = motivo;
      if (timer) clearTimeout(timer);
      timer = setTimeout(disparar, debounceMs);
    },
    vaciar() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const motivo = pendiente;
      pendiente = null;
      if (motivo) onSenal(motivo);
    },
    destruir() {
      if (timer) clearTimeout(timer);
      timer = null;
      pendiente = null;
      reguladores.delete(reg);
    },
  };

  reguladores.add(reg);
  return reg;
}

/**
 * Subscribe this tab to its gym's signal topic, and answer with `onSenal`.
 *
 * Three motives reach the caller, and they are named because they are not the same event:
 *  - `senal`   — somebody wrote. The rail working as designed.
 *  - `visible` — the tab came back to the foreground. The free floor: this alone closes the
 *                "staff phone off the lock screen shows five-minute-old reservas" complaint, and
 *                it works whether or not the socket survived the background.
 *  - `rejoin`  — the channel re-SUBSCRIBED after a close (iOS Safari backgrounds sockets). Every
 *                message sent while the socket was down is gone, so a rejoin is a reconciliation,
 *                not a notification.
 *
 * No session, no socket AND no visibility listener: an anonymous visitor on a member route (the
 * layout renders before the page's own `redirect("/entrar")`) must not open one, nor fire a
 * refresh. `getClaims` is the repo's authz reader (ADR-0001); this is not an authz decision, only
 * "is there a token to authorize a channel with", which is exactly what `getSession` answers.
 *
 * `createClient()` returns the per-tab singleton (`@supabase/ssr` memoizes it in the browser), so
 * this is one socket per tab no matter how many mounts. supabase-js re-pushes the refreshed JWT
 * to open channels on TOKEN_REFRESHED, so the subscription survives rotation without help here.
 */
export function useSenalGym({
  gymId,
  onSenal,
  debounceMs = 600,
}: {
  gymId: string | null | undefined;
  onSenal: (motivo: MotivoSenal) => void;
  debounceMs?: number;
}): void {
  // Held in a ref so a caller passing an inline arrow does not tear down the socket every render.
  const cb = useRef(onSenal);
  useEffect(() => {
    cb.current = onSenal;
  }, [onSenal]);

  useEffect(() => {
    if (!gymId || typeof window === "undefined") return;

    let vivo = true;
    let canal: RealtimeChannel | null = null;
    const supabase = createClient();
    const reg = crearRegulador((motivo) => cb.current(motivo), debounceMs);

    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === "visible") reg.pedir("visible");
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || !vivo) return;

      // The listener is attached INSIDE the session guard, not before it: a signed-out tab must
      // not fire `onSenal` either, and its `router.refresh()` on a public route is a round trip
      // for a screen with nothing member-specific on it.
      document.addEventListener("visibilitychange", alCambiarVisibilidad);

      // A private channel is authorized by the token Realtime holds, not by the socket's cookies.
      await supabase.realtime.setAuth();
      if (!vivo) return;

      let suscritoAntes = false;
      canal = supabase
        .channel(`gym:${gymId}`, { config: { private: true } })
        .on("broadcast", { event: "cambio" }, () => reg.pedir("senal"))
        .subscribe((estado) => {
          if (
            estado === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
            estado === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
          ) {
            // The rail is otherwise SILENT when it breaks — a denied policy, a missing partition
            // or a dropped socket all look identical to "nobody wrote anything". One line, at the
            // transition only (subscribe fires this state once per failure, not per retry).
            console.warn("[senal] canal", estado);
            return;
          }
          if (estado !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) return;
          if (suscritoAntes) reg.pedir("rejoin");
          suscritoAntes = true;
        });
    })();

    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      reg.destruir();
      if (canal) void supabase.removeChannel(canal);
    };
  }, [gymId, debounceMs]);
}
```

- [ ] Add the subpath export. In `packages/data/package.json`, insert `    "./client-senal": "./src/client-senal.ts",` immediately after the `"./client": "./src/client.ts",` line, so the map reads:

```json
    ".": "./src/database.types.ts",
    "./client": "./src/client.ts",
    "./client-senal": "./src/client-senal.ts",
    "./cookie-options": "./src/cookie-options.ts",
```

- [ ] Run the test and the full gate:

```bash
pnpm vitest run --project data packages/data/src/client-senal.test.ts
pnpm lint && pnpm typecheck && pnpm test
```

Expected pass: 5 passing tests in `client-senal.test.ts`, then the whole gate green — including `workspace package manifests` (the new export is explicit, not a wildcard) and the dependency-cruiser boundary (`@gym/data` imports only `react` + `@supabase/*`, both already declared).

- [ ] Commit:

```bash
git add packages/data/src/client-senal.ts packages/data/src/client-senal.test.ts packages/data/package.json
git commit -m "$(cat <<'EOF'
feat(senal): browser hook + a busy-aware trailing debounce for the signal rail

useSenalGym holds one private channel per tab on gym:<id> and answers with three named motives:
senal (somebody wrote), visible (the tab came back — the free floor, which works whether or not
the socket survived the background), and rejoin (the socket re-SUBSCRIBED, so anything sent while
it was down is gone and this is a reconciliation).

crearRegulador is plain TypeScript with no React and no DOM on purpose: the repo has no jsdom, so
that is the only way this logic is testable at all. It refuses to fire while senalBusy is
non-empty and flushes on release — an open sheet holds a snapshot and an open editor holds an
unsaved draft, and refreshing the route under either destroys work the user can see.

No session, no socket: an anonymous visitor on a member route never opens one.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Admin: mount the rail, gate the door poll, hold the sheets

**Files:**
- Create: `apps/admin/src/app/(app)/_components/senal-gym.tsx`
- Modify: `apps/admin/src/app/(app)/layout.tsx` (imports; the return block's `<div>`)
- Modify: `apps/admin/src/app/(app)/asistencia/_components/asistencia.tsx` (imports; the interval at ~:135-140; `onTap` at ~:336-337 and its `finally` at ~:411)
- Modify: `apps/admin/src/app/(app)/agenda/_components/agenda.tsx` (imports; one new effect after the `editorInFlight` ref at ~:204)

**Interfaces:**
- Consumes: `useSenalGym`, `ocuparSenal`, `liberarSenal` from `@gym/data/client-senal`.
- Consumes: `gymEnEfecto` — the `OperatorGym | undefined` the `(app)` layout already computes from `decision.kind === "render"`.
- Produces: `export function SenalGym({ gymId }: { gymId: string }): null`

**Steps:**

- [ ] Create `apps/admin/src/app/(app)/_components/senal-gym.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

import { useSenalGym } from "@gym/data/client-senal";

/**
 * The signal rail's admin mount (audit 2026-09-01). Renders nothing: it holds ONE private
 * Realtime channel on `gym:<id>` for the whole `(app)` group and answers a signal with
 * `router.refresh()` — a Server Component re-render through the existing `server-only` DAL, so
 * every screen in the group (agenda cupo, door roster, ficha saldo) repaints from the truth
 * rather than from a payload.
 *
 * It lives under `_components/` because `tools/guards/client-seam.test.ts` fails any app
 * `"use client"` file outside `_components/` and its two-entry allow-list.
 *
 * The visibility check is not redundant with the hook's own `visible` motive: a `senal` motive can
 * land while the tab is hidden, and refreshing a hidden tab is a paid RSC round trip nobody is
 * looking at. Coming back to the foreground fires `visible` and freshens it then.
 */
export function SenalGym({ gymId }: { gymId: string }) {
  const router = useRouter();

  useSenalGym({
    gymId,
    onSenal: () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    },
  });

  return null;
}
```

- [ ] Mount it in `apps/admin/src/app/(app)/layout.tsx`. Add the import beside the two existing `_components` imports:

```tsx
import { SinGimnasio } from "./_components/sin-gimnasio";
import { SenalGym } from "./_components/senal-gym";
import { VariosGimnasios } from "./_components/varios-gimnasios";
```

and add one line to the returned tree, after the `TabBar`:

```tsx
  return (
    <div className="flex min-h-dvh w-full justify-center bg-backdrop">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas sm:max-w-[440px] sm:shadow-2xl">
        <main className="forge-scroll relative flex-1 overflow-y-auto">{contenido}</main>
        {mostrarTabBar && <TabBar items={tabsPara(modoActivo)} />}
        {/* The freshness rail (audit 2026-09-01), keyed on the TENANT IN EFFECT — the gym this
            host renders under — never on the membership set: a two-gym operator on RED's host
            must not be refreshed by Forge's writes. Only the "render" arm has one, so the
            chooser/redirect/none arms mount no socket at all. */}
        {gymEnEfecto && <SenalGym gymId={gymEnEfecto.id} />}
      </div>
    </div>
  );
```

`gymEnEfecto` already exists at `apps/admin/src/app/(app)/layout.tsx:45` (landed with #326 at `43801e6`) — declare nothing, add only the import and the one line above.

- [ ] Gate the door poll on visibility and hold it during a write. In `apps/admin/src/app/(app)/asistencia/_components/asistencia.tsx`, add the import beside the existing `@gym/data` type import:

```tsx
import { liberarSenal, ocuparSenal } from "@gym/data/client-senal";
```

Replace the interval effect (currently at `:135-140`):

```tsx
  React.useEffect(() => {
    const id = setInterval(() => {
      // A hidden tab is nobody looking at a screen: the tick used to fire anyway, so a kiosk left
      // on a dark phone paid a full RSC round trip every 5 minutes for nothing, and STILL showed
      // up to 5 minutes of stale reservas the moment it woke (audit 2026-09-01, weakness 3). The
      // wake-up is now handled by the signal rail's `visible` motive instead, which is immediate.
      if (document.visibilityState !== "visible") return;
      if (inFlight.current.size === 0) router.refresh();
    }, REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);
```

Then, in `onTap`, mark the write busy — add one line after `inFlight.current.add(key);`:

```tsx
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      // The signal rail must not refresh the route out from under an optimistic flip that has not
      // been reconciled yet: same guard as `inFlight`, one key space, published across components.
      ocuparSenal(key);
```

and release it in the same `finally` that clears `inFlight`:

```tsx
      } finally {
        inFlight.current.delete(key);
        liberarSenal(key);
      }
```

- [ ] Hold the agenda's sheets. In `apps/admin/src/app/(app)/agenda/_components/agenda.tsx`, add the import beside the other `@gym/*` imports:

```tsx
import { liberarSenal, ocuparSenal } from "@gym/data/client-senal";
```

and add this effect immediately after the `const editorInFlight = React.useRef(false);` line:

```tsx
  // The signal rail is held while either sheet is open (audit 2026-09-01, weakness 5). The glance
  // sheet holds a lazily-loaded roster and the editor holds an unsaved draft; a `router.refresh()`
  // under either one throws away work the operator can see. Closing BOTH releases the hold, and
  // `liberarSenal` flushes whatever was pending — so the refresh they "missed" lands on close
  // instead of waiting for the next write anybody happens to make.
  //
  // The dep is the COLLAPSED boolean, never `[glance.open, editor.open]`: EDITAR hands off from
  // the glance sheet to the editor, and a two-value dep re-runs the effect on that handoff —
  // release, then re-acquire — which flushes a pending refresh straight into the editor that is
  // opening. One boolean stays true across the handoff, so nothing is released mid-flight.
  const reteniendoHoja = glance.open || editor.open;
  React.useEffect(() => {
    if (!reteniendoHoja) return;
    ocuparSenal("agenda-hoja");
    return () => liberarSenal("agenda-hoja");
  }, [reteniendoHoja]);
```

- [ ] Run the gate:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected pass: all green, including `client→server seam scope stays exhaustive` (the new `"use client"` file is under `_components/`) and the dependency-cruiser boundary (`apps/*` may import `@gym/data`).

- [ ] Commit:

```bash
git add "apps/admin/src/app/(app)/_components/senal-gym.tsx" "apps/admin/src/app/(app)/layout.tsx" "apps/admin/src/app/(app)/asistencia/_components/asistencia.tsx" "apps/admin/src/app/(app)/agenda/_components/agenda.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): mount the freshness rail on the (app) group, and stop polling hidden tabs

One channel for the whole group, keyed on the TENANT IN EFFECT rather than the membership set —
a two-gym operator on RED's host must not be refreshed by Forge's writes.

The 5-minute door poll now returns early unless the tab is visible: it used to pay a full RSC
round trip at a dark phone and still show up to 5 minutes of stale reservas on wake. The wake-up
is the rail's `visible` motive now, and it is immediate.

Both agenda sheets and every in-flight desk toggle hold the rail while they are open, and release
it on close — which flushes the refresh that was missed rather than dropping it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Member: two route layouts, the mount, and the sheet hold

**Files:**
- Create: `apps/client/src/app/_components/senal-gym.tsx`
- Create: `apps/client/src/app/reservar/layout.tsx`
- Create: `apps/client/src/app/clase/layout.tsx`
- Modify: `apps/client/src/app/reservar/_components/reservar-semana.tsx` (imports at :1-26; one new effect after the existing `sheet` effect at ~:486-491)

**Interfaces:**
- Consumes: `resolveTenant` from `@gym/data/server/resolve-tenant` — `(host: string | null, override: string | null) => Promise<Tenant | null>`, `Tenant.id` is the gym uuid.
- Consumes: `headers` from `next/headers`.
- Consumes: `useSenalGym`, `ocuparSenal`, `liberarSenal` from `@gym/data/client-senal`.
- Produces: `export function SenalGym({ gymId }: { gymId: string }): null`

**Steps:**

- [ ] Create `apps/client/src/app/_components/senal-gym.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

import { useSenalGym } from "@gym/data/client-senal";

/**
 * The signal rail's member mount (audit 2026-09-01, weakness 2). Renders nothing: it holds ONE
 * private Realtime channel on `gym:<id>` and answers with `router.refresh()`, so the week's cupos
 * and the saldo repaint when a sale, a venta edit, a class cancellation or a pasar-lista changes
 * what this member is looking at. Before this, `router.refresh()` fired only after the member's
 * OWN book or cancel — 19 cross-user write RPCs and zero delivery paths.
 *
 * Refreshing a hidden tab is a paid round trip nobody is looking at; coming back to the
 * foreground fires the hook's `visible` motive and freshens it then.
 */
export function SenalGym({ gymId }: { gymId: string }) {
  const router = useRouter();

  useSenalGym({
    gymId,
    onSenal: () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    },
  });

  return null;
}
```

- [ ] Create `apps/client/src/app/reservar/layout.tsx`:

```tsx
import { headers } from "next/headers";

import { resolveTenant } from "@gym/data/server/resolve-tenant";

import { SenalGym } from "../_components/senal-gym";

/**
 * The member's booking screens get the freshness rail (audit 2026-09-01, weakness 2). A layout
 * rather than the page, so the channel survives the `router.refresh()` it triggers instead of
 * being torn down and rejoined by its own signal.
 *
 * TWO layouts, one here and one at `clase/`, rather than a shared route group: `reservar/` and
 * `clase/` are siblings at the app root, and folding them under `(socio)/` would move
 * `reservar/loading.tsx` and `clase/[sessionId]/loading.tsx`, both pinned BY PATH in
 * `tools/guards/loading-coverage.test.ts`.
 *
 * The gym comes from the same host resolution `page.tsx` already runs (`resolveTenant`), which
 * sits behind a 60s in-process TTL cache — this is not a per-render round trip. An unmapped host
 * (previews, local) resolves null and simply mounts nothing.
 *
 * Safe for a signed-out visitor twice over: this renders around a page that redirects to
 * `/entrar`, and the hook itself checks for a session before opening any socket.
 */
export default async function ReservarLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveTenant((await headers()).get("host"), null);

  return (
    <>
      {children}
      {tenant && <SenalGym gymId={tenant.id} />}
    </>
  );
}
```

- [ ] Create `apps/client/src/app/clase/layout.tsx`:

```tsx
import { headers } from "next/headers";

import { resolveTenant } from "@gym/data/server/resolve-tenant";

import { SenalGym } from "../_components/senal-gym";

/**
 * `clase/[sessionId]`'s half of the freshness rail — the sibling of `reservar/layout.tsx` (see
 * that file for why these are two layouts and not one route group). The class detail page renders
 * a cupo roster of real attendees, which is exactly the number that moves under a member while
 * they read it.
 */
export default async function ClaseLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveTenant((await headers()).get("host"), null);

  return (
    <>
      {children}
      {tenant && <SenalGym gymId={tenant.id} />}
    </>
  );
}
```

- [ ] Hold the rail while the confirmation sheet is open. In `apps/client/src/app/reservar/_components/reservar-semana.tsx`, add the import beside the existing `@gym/domain` import:

```tsx
import { liberarSenal, ocuparSenal } from "@gym/data/client-senal";
```

and add this effect immediately after the existing `useEffect` that drives `setShown`:

```tsx
  // The sheet holds a SNAPSHOT: `sheet.sesion` is captured state, so a refresh underneath it
  // would leave "3 lugares" on the sheet while the list behind it reads LLENO (audit 2026-09-01,
  // weakness 5). Hold the signal rail while it is open; closing releases the hold and flushes
  // whatever was pending, so the week repaints the moment the sheet is gone.
  //
  // The dep is OPEN-OR-NOT, never the `sheet` object: `book()` replaces it with
  // `{ sesion, mode: "confirmed" }` (:511) while the sheet is still on screen, and depending on
  // the object identity would tear the hold down and re-acquire it right there — releasing a
  // pending refresh into the confirmation the member is reading. The boolean does not change.
  const sheetAbierto = sheet !== null;
  useEffect(() => {
    if (!sheetAbierto) return;
    ocuparSenal("reservar-hoja");
    return () => liberarSenal("reservar-hoja");
  }, [sheetAbierto]);
```

- [ ] Run the gate:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected pass: all green, including `route loading-state coverage` (no `loading.tsx` moved or added) and `client→server seam scope stays exhaustive` (the new `"use client"` file is under `_components/`).

- [ ] Commit:

```bash
git add apps/client/src/app/_components/senal-gym.tsx apps/client/src/app/reservar/layout.tsx apps/client/src/app/clase/layout.tsx apps/client/src/app/reservar/_components/reservar-semana.tsx
git commit -m "$(cat <<'EOF'
feat(client): give the member screens the freshness rail

Until now router.refresh() fired only after the member's OWN book or cancel — 19 cross-user write
RPCs and zero delivery paths, so a sale, a venta edit, a class cancellation or a pasar-lista never
reached an open /reservar.

Two layouts rather than one route group: reservar/ and clase/ are siblings, and folding them under
a group would move two loading.tsx files that loading-coverage.test.ts pins by path. A layout
rather than the page, so the channel is not torn down and rejoined by the refresh it triggers.

The confirmation sheet holds the rail while it is open: sheet.sesion is a snapshot, and a refresh
underneath it leaves "3 lugares" on the sheet while the list behind reads LLENO.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Gates: local denial suite, e2e, live apply

**Files:**
- Modify: none (this task runs and verifies)

**Interfaces:**
- Consumes: `SUITE` from `supabase/tests/run-denial-suite.mjs` (importing that module has no side effects by design).
- Consumes: the local docker stack, container `supabase_db_red-2-0`.
- Consumes: the red-demo sandbox credentials from `AGENTS.md`.
- Produces: a `senal_gym` migration applied to LIVE.

**Steps:**

- [ ] Confirm the local stack is up. Do NOT `db reset` — a reset drops the ambient-grant bootstrap the repo's migrations treat as ambient truth, and nearly every suite then fails `permission denied` for reasons unrelated to RLS:

```bash
docker ps --filter name=supabase_db_red-2-0 --format "{{.Names}}  {{.Status}}"
```

Expected: one line naming `supabase_db_red-2-0` as `Up`. If there is no line, start it with `npx -y supabase@latest start`; if you are forced to reset, first re-apply the broad bootstrap

```sql
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
```

then replay, in filename order, every migration that narrows it back (`grep -l "^revoke\|^grant" supabase/migrations/*.sql`).

- [ ] Make sure the local DB carries the new migration (Task 1 already applied it; this is idempotent by construction):

```bash
cd /c/Users/Aaron/Documents/Repos/RED-2.0
docker cp supabase/migrations/20260901120000_senal_gym.sql supabase_db_red-2-0:/tmp/senal_gym_mig.sql
docker exec supabase_db_red-2-0 psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/senal_gym_mig.sql
```

Expected: `CREATE FUNCTION`, `ALTER FUNCTION`, `REVOKE`, `CREATE FUNCTION`, `REVOKE`, `GRANT`, `DO`, `DROP POLICY`, `CREATE POLICY`.

- [ ] Run the WHOLE denial suite in `SUITE` order, via `docker cp` + in-container `psql -f`. Never pipe a suite file through PowerShell into psql: the UTF-8 Spanish literals mojibake in transit and the expected-error-string assertions fail for a reason that is not real.

```bash
cd /c/Users/Aaron/Documents/Repos/RED-2.0
node -e "import('./supabase/tests/run-denial-suite.mjs').then(m => console.log(m.SUITE.join('\n')))" > /tmp/suite.txt
fallos=0
while read -r f; do
  docker cp "supabase/tests/$f" "supabase_db_red-2-0:/tmp/$f" >/dev/null
  # `</dev/null` is load-bearing: without it a docker child can swallow the loop's stdin and the
  # while-read runs exactly once, reporting one PASS and no failures.
  if docker exec supabase_db_red-2-0 psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f "/tmp/$f" </dev/null >/dev/null 2>/tmp/senal_err.txt; then
    echo "  PASS  $f"
  else
    fallos=$((fallos+1)); echo "  FAIL  $f"; cat /tmp/senal_err.txt
  fi
done < /tmp/suite.txt
echo "FAILED: $fallos of $(wc -l < /tmp/suite.txt)"
```

Expected pass: `FAILED: 0 of 55` — the 54 pre-existing files plus `senal_gym.sql`.

- [ ] Run the browser session gate. This change touches the auth/session surface (`realtime.setAuth` on the shared browser client), which is exactly what `test:e2e` exists for:

```bash
pnpm exec playwright install chromium
E2E_EMAIL=demo@red-demo.test E2E_PASSWORD='RedDemo!2026' pnpm test:e2e
```

Expected pass: 3 Chromium checks green (lands on `/reservar`, survives a fresh browser context, is redirected past `/entrar`). If the run reports the suite as SKIPPED, the credentials did not reach the process — fix that before continuing; a skip is not a pass.

- [ ] **STOP — OWNER CONSENT GATE.** Report the denial-suite result (`FAILED: 0 of 55`) and the e2e result to the owner, and ask for consent to apply `senal_gym` to the LIVE database. **Do not proceed without it.** The Supabase MCP is bound to production: `apply_migration` is an irreversible-by-default write to the database four real gyms run on, and it is not covered by any earlier "go ahead" in the conversation. If consent is withheld or unclear, stop here — everything up to this point is local commits and costs nothing to leave parked.

- [ ] Apply the migration to LIVE with the Supabase MCP, now that consent is on record. Call `mcp__supabase__apply_migration` with `name: "senal_gym"` and `query` set to the full contents of `supabase/migrations/20260901120000_senal_gym.sql`.

Expected: success with no rows returned.

- [ ] Verify what actually landed on live, read-only, with `mcp__supabase__execute_sql`:

```sql
select
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and t.tgname like 'senal\_%') as triggers,
  (select count(*) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'senal_gym_select') as policy,
  (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'senal_gym') as duenio,
  (select count(*) from pg_inherits where inhparent = 'realtime.messages'::regclass) as particiones;
```

Expected: `triggers = 15`, `policy = 1`, `duenio = postgres`. **`particiones` is expected to read 0 at this point, and that is correct, not a failure** — see the next step.

- [ ] **Subscribe FIRST, then look for partitions.** `realtime.messages` is RANGE-partitioned on `inserted_at`, and the Realtime SERVICE owns those partitions: it creates yesterday..today+3 when it provisions the tenant's connection, i.e. on the **first client subscribe** (`supabase/realtime`: `lib/realtime/tenants/connect.ex` + `tenants.ex`; the Janitor only DELETES partitions older than 72h). SQL cannot create them — `postgres` has no CREATE on schema `realtime` (42501, verified). So open the deployed admin app in a browser and sign in, which mounts `SenalGym` and subscribes to `gym:<id>`. Then:

```sql
select count(*) as particiones from pg_inherits where inhparent = 'realtime.messages'::regclass;
```

Expected: **≥ 1** (in practice 5 — yesterday through today+3). If it is still 0, the subscribe did not happen: check the browser console for `[senal] canal CHANNEL_ERROR` (the warn added in Task 2), which points at the policy or the token rather than at the trigger.

- [ ] Only now prove the rail end-to-end: with the admin app open on `/agenda` in one browser and the member app open on `/reservar` in another (signed in as the red-demo member), book a class from the member side. Expected: the admin agenda card's cupo increments within ~1 second, with no navigation and no reload. Then confirm the message existed:

```sql
select topic, event, private, payload ->> 't' as tabla, inserted_at
from realtime.messages
where topic like 'gym:%'
order by inserted_at desc
limit 5;
```

Expected: at least one `cambio` row on the right `gym:<uuid>` topic, `private = true`.

- [ ] Run `mcp__supabase__get_advisors` with `type: "security"` and confirm the new policy and the two new functions raise no new warning (`search_path` is set on both; the definer is deliberate and documented in the migration header).

- [ ] **Rollback, only if the live walk fails.** The rail is fully reversible and nothing else depends on it: dropping the triggers restores the exact pre-migration write path, and dropping the policy restores `realtime.messages` to RLS-on-with-zero-policies (its state for the whole life of the project until today). The browser side degrades to the free floor on its own — no signal simply means no `senal` motive, while `visible` and the door poll keep working — so the apps do **not** need to be reverted or redeployed to make this safe. Run via `mcp__supabase__apply_migration` with `name: "senal_gym_down"`:

```sql
do $do$
declare
  t text;
begin
  foreach t in array array['reservation', 'class_session', 'clientes', 'ventas', 'asistencias'] loop
    execute format('drop trigger if exists %I on public.%I', 'senal_' || t || '_ins', t);
    execute format('drop trigger if exists %I on public.%I', 'senal_' || t || '_upd', t);
    execute format('drop trigger if exists %I on public.%I', 'senal_' || t || '_del', t);
  end loop;
end
$do$;

drop policy if exists senal_gym_select on realtime.messages;
drop function if exists public.senal_gym();
drop function if exists public.senal_topic_gym(text);
```

Then confirm the reversal, and note that if you run this you must also `git revert` the Task 1 commit locally so the migrations directory and `supabase/functions-canonical/` stop claiming functions that no longer exist — otherwise `rpc-canon-drift.test.ts` still passes (it replays migrations, not the live DB) while live and repo disagree:

```sql
select
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and t.tgname like 'senal\_%') as triggers,
  (select count(*) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'senal_gym_select') as policy;
```

Expected after rollback: `triggers = 0`, `policy = 0`.

- [ ] No commit in this task — nothing changed on disk. **Do not push.** Every push deploys both Vercel apps and is owner-gated.

---

## Task 6 — Close the audit and file the follow-up

**Files:**
- Modify: `docs/FIndings/2026-09-01-freshness-audit-realtime-verdict.md` (append two sections at the end)

**Interfaces:**
- Consumes: nothing.
- Produces: the audit's shipped record and the named follow-up for `edit_class_session`.

**Steps:**

- [ ] Append this to the end of `docs/FIndings/2026-09-01-freshness-audit-realtime-verdict.md`:

```markdown
## Shipped (2026-09-01)

Steps 1–3 of "Recommended build, in order" shipped as the `senal-gym` branch — free floor and
signal rail together, admin and member. Spec:
`docs/superpowers/plans/2026-09-01-senal-gym-freshness-spec.md`. Plan:
`docs/superpowers/plans/2026-09-01-senal-gym-freshness-plan.md`. Migration
`20260901120000_senal_gym.sql` applied to live; denial suite green on the local docker stack;
`pnpm test:e2e` green. Not pushed — owner-gated.

Three things the audit did not know, found while building:

1. **`realtime.messages` had zero partitions on live**, so every `realtime.send` wrote 0 rows and
   swallowed the failure. It is RANGE-partitioned on `inserted_at`, and the Realtime SERVICE owns
   the partitions: it creates yesterday..today+3 when it provisions a tenant's connection — on
   the first client subscribe — while the Janitor only deletes partitions older than 72h
   (`supabase/realtime`: `lib/realtime/tenants/connect.ex`, `lib/realtime/tenants.ex`). SQL
   cannot: `postgres` has no CREATE on schema `realtime` (`42501`). So the order is subscribe,
   then verify — a step in the plan, not an assumption — and it is why
   `supabase/tests/senal_gym.sql` needs a superuser DB (the local docker stack) and refuses to
   run anywhere else.
2. **Postgres refuses transition tables on a multi-event trigger** ("transition tables cannot be
   specified for triggers with more than one event"), so the shape is three single-event triggers
   per table over one `TG_OP`-branching function, not one trigger — 15 triggers, 5 tables. The
   UPDATE trigger takes both transition tables, so a `gym_id` move signals the gym the row left
   as well as the one it joined.
3. **`postgres` is not the owner of `realtime.messages`** and is not a member of
   `supabase_realtime_admin`, yet `create policy` on it succeeds from the migration apply path.
   Creating a *partition* does not. The asymmetry is real and was verified by probe.

### Known gap, accepted (no code)

A tab connected continuously for more than **three days** outlives its partitions: the service
creates a yesterday..today+3 window at connection time and nothing extends it for a session that
never reconnects, so that tab's writes land in no partition and are swallowed. Three existing
backstops cover it — the `visibilitychange` refetch, the `rejoin` motive (a reconnect
re-provisions the tenant and its partitions), and the door's 5-minute poll. A device left awake,
foregrounded and unslept for 72 hours is not a shape this product has.

## Follow-up: `edit_class_session` has no version check (weakness 4)

Still open, deliberately out of scope of the rail. `supabase/functions-canonical/edit_class_session.sql:63-73`
writes every column blind — no lock, no `updated_at`/`xmin` comparison — so two staff devices
editing one session overwrite each other silently.

**The rail makes this worse, not better, and that is the reason to file it now.** Before, the
window was "two operators happened to open the same session"; now a `router.refresh()` can land
under an open editor at any moment, so the window is continuous. The agenda's `ocuparSenal`
("agenda-hoja") hold is the mitigation that ships with the rail: while the editor is open the
route is not refreshed, so an operator's own draft is never repainted out from under them. It does
nothing about the OTHER device.

The fix is its own migration: pass the card's `updated_at` into `edit_class_session` and refuse a
stale draft with a named message, in the same idiom as the existing `agenda_slot_guards` refusals —
plus a vector in `supabase/tests/recurring_series_edit.sql` asserting the refusal and that the
row did not move.
```

- [ ] Commit:

```bash
git add docs/FIndings/2026-09-01-freshness-audit-realtime-verdict.md
git commit -m "$(cat <<'EOF'
docs(senal): close the freshness audit and file the edit_class_session follow-up

Three facts the audit did not have: realtime.messages had zero partitions on live (so send was
writing nothing and swallowing it), Postgres refuses transition tables on a multi-event trigger,
and postgres can create a policy on realtime.messages but not a partition.

The edit_class_session lost update is filed rather than fixed, with the reason stated: a push rail
turns an occasional window into a continuous one, and the agenda's busy hold only protects the
operator's own draft, never the other device's.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```
