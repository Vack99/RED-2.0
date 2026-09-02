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
-- WHY THIS FILE CARES ABOUT PARTITIONS: `realtime.messages` is RANGE-partitioned on `inserted_at`
-- and Supabase's Realtime service — not SQL — creates the daily partitions, yesterday..today+3, on
-- the first client subscribe. Where today's partition is missing, `realtime.send` swallows the
-- failure (its body is one `WHEN OTHERS -> RAISE WARNING`) and every assertion below would read 0
-- rows for the wrong reason. `postgres` may NOT create one — 42501, no CREATE on schema realtime,
-- verified on BOTH live and the local docker stack, where `postgres` is `rolbypassrls` but is NOT
-- the superuser (`supabase_admin` is). So the precondition below CHECKS FIRST and only attempts a
-- CREATE where the partition is genuinely absent: `create table if not exists` takes the schema
-- ACL check BEFORE its existence short-circuit, so an unguarded attempt raises 42501 against a
-- partition that is already sitting there. Once any tab has subscribed — the normal case — this
-- suite needs no privilege at all. Where the partition is absent AND uncreatable, it raises a
-- named exception rather than passing quietly.
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row.
-- BEGIN/ROLLBACK, so it touches no row permanently. Zero hardcoded prod UUIDs.
--
-- HOW TO RUN: the local docker path in the plan's Task 5 — or `node supabase/tests/run-denial-suite.mjs`
-- against any target where today's partition exists. Wired into the runner's SUITE.

begin;

-- ── Partition precondition ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'realtime'
       and c.relname = 'messages_' || to_char(current_date, 'YYYY_MM_DD')) then
    execute format(
      'create table if not exists realtime.%I partition of realtime.messages for values from (%L) to (%L)',
      'messages_' || to_char(current_date, 'YYYY_MM_DD'),
      current_date::timestamp,
      (current_date + 1)::timestamp);
  end if;
exception when insufficient_privilege then
  raise exception 'SETUP FAIL: today''s realtime.messages partition is missing and this role cannot create it (42501, no CREATE on schema realtime). Subscribe one Realtime client — the service provisions yesterday..today+3 on connect — or run as a role that may create it.';
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
  v_resto jsonb; v_id_propio boolean;
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

  select event, private, payload ->> 't', payload - 't' - 'id', (payload ->> 'id') = id::text
    into v_event, v_priv, v_t, v_resto, v_id_propio
    from realtime.messages where topic = 'gym:' || gym_a::text;
  if v_event is distinct from 'cambio' then raise exception 'RULE FAIL(emits once): event % (expected cambio)', v_event; end if;
  if v_priv is distinct from true then raise exception 'RULE FAIL(emits once): message is not private'; end if;

  -- The payload is a SIGNAL, not data, and this is where that claim is actually held to account.
  -- `t` must name one of the two tables THIS call wrote — which of them wins the dedupe is an
  -- ordering detail inside reservar_clase, so both are legal and anything else is not.
  if v_t is null or v_t not in ('reservation', 'clientes') then
    raise exception 'RULE FAIL(emits once): payload names table % — expected one of the two tables this call wrote (reservation, clientes)', coalesce(v_t, '<null>');
  end if;
  -- `realtime.send` stamps an `id` of its own before inserting (its body jsonb_set()s the message's
  -- primary key in whenever the caller omits one), so that key is subtracted below. Pin it to the
  -- row's actual id FIRST, so the subtraction can only ever remove send's own bookkeeping and never
  -- launder a real `id` the trigger leaked into the payload.
  if v_id_propio is distinct from true then
    raise exception 'RULE FAIL(emits once): the payload id is not realtime.send''s own message id — something is putting an id in the payload';
  end if;
  -- Everything else must be gone. A payload that grew a member name, a gym_id or a row id would
  -- cross a tenant line the moment two gyms share a channel; the whole design rests on it carrying
  -- nothing but which table moved.
  if v_resto is distinct from '{}'::jsonb then
    raise exception 'RULE FAIL(emits once): payload carries % beyond the table name — the signal must carry NO data', v_resto::text;
  end if;

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

-- ── The DELETE arm: a row LEAVING the gym signals it too ─────────────────────────
-- A freed seat is exactly as visible to the next member as a taken one, so the DELETE trigger is
-- not symmetry for its own sake. It is also the only arm that must read the OLD transition table:
-- there is no `n` to fall back on, so an arm wired to `n` would emit NOTHING here and the gap would
-- never show up in the INSERT/UPDATE vectors above. Fresh GUC state, so this measures ONE statement.
do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  v_res uuid; v_n int; v_t text;
begin
  delete from realtime.messages where topic like 'gym:%';
  perform set_config('senal.g_' || replace(gym_a::text, '-', ''), '', true);

  select id into v_res from public.reservation
    where member_id = current_setting('t.c_a', true)::uuid
      and class_session_id = current_setting('t.s_uno', true)::uuid;
  if v_res is null then raise exception 'SETUP FAIL(delete arm): the seeded booking is gone before the delete'; end if;

  delete from public.reservation where id = v_res;
  if exists (select 1 from public.reservation where id = v_res) then
    raise exception 'SETUP FAIL(delete arm): the booking row survived the delete'; end if;

  select count(*) into v_n from realtime.messages where topic = 'gym:' || gym_a::text;
  if v_n <> 1 then raise exception 'RULE FAIL(delete arm): % message(s) for one DELETE (expected exactly 1)', v_n; end if;

  select payload ->> 't' into v_t from realtime.messages where topic = 'gym:' || gym_a::text;
  if v_t is distinct from 'reservation' then
    raise exception 'RULE FAIL(delete arm): payload names table % (expected reservation)', coalesce(v_t, '<null>');
  end if;

  select count(*) into v_n from realtime.messages
    where topic like 'gym:%' and topic <> 'gym:' || gym_a::text;
  if v_n <> 0 then raise exception 'RULE FAIL(delete arm): % message(s) on some other gym''s topic', v_n; end if;
end $$;

-- ── A re-keyed row signals BOTH gyms: the one it left and the one it joined ──────
-- This is the whole reason the UPDATE trigger takes both transition tables. Reading `n` alone would
-- tell gym B its roster grew and leave gym A stale FOREVER — not merely slow: no later write to
-- that row ever mentions gym A again, so nothing would ever come along to correct it.
do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
  c_a   uuid := current_setting('t.c_a', true)::uuid;
  v_n int; v_t text;
begin
  delete from realtime.messages where topic like 'gym:%';
  perform set_config('senal.g_' || replace(gym_a::text, '-', ''), '', true);
  perform set_config('senal.g_' || replace(gym_b::text, '-', ''), '', true);

  update public.clientes set gym_id = gym_b where id = c_a;
  if (select gym_id from public.clientes where id = c_a) is distinct from gym_b then
    raise exception 'SETUP FAIL(gym move): the cliente did not actually move';
  end if;

  select count(*) into v_n from realtime.messages where topic = 'gym:' || gym_a::text;
  if v_n <> 1 then
    raise exception 'RULE FAIL(gym move): % message(s) for the gym the row LEFT (expected exactly 1) — the UPDATE arm is not reading the OLD transition table', v_n;
  end if;
  select payload ->> 't' into v_t from realtime.messages where topic = 'gym:' || gym_a::text;
  if v_t is distinct from 'clientes' then
    raise exception 'RULE FAIL(gym move): the gym it LEFT was told about table % (expected clientes)', coalesce(v_t, '<null>');
  end if;

  select count(*) into v_n from realtime.messages where topic = 'gym:' || gym_b::text;
  if v_n <> 1 then
    raise exception 'RULE FAIL(gym move): % message(s) for the gym the row JOINED (expected exactly 1)', v_n;
  end if;
  select payload ->> 't' into v_t from realtime.messages where topic = 'gym:' || gym_b::text;
  if v_t is distinct from 'clientes' then
    raise exception 'RULE FAIL(gym move): the gym it JOINED was told about table % (expected clientes)', coalesce(v_t, '<null>');
  end if;

  select count(*) into v_n from realtime.messages where topic like 'gym:%';
  if v_n <> 2 then
    raise exception 'RULE FAIL(gym move): % message(s) in total (expected exactly 2 — one per gym, each deduped to one)', v_n;
  end if;
  -- Leaves gym A holding exactly ONE message, which is the state the policy vectors below measure,
  -- and a SECOND tenant's message sitting beside it in the same table while they measure it.
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
