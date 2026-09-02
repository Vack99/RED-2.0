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
