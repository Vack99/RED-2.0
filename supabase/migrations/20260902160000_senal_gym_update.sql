-- senal_gym, extended to the gym row itself (follow-up to 20260901120000_senal_gym.sql).
--
-- THE GAP: the rail covers the five tables a second PERSON writes — reservation, class_session,
-- clientes, ventas, asistencias — but not the SWITCHES an operator flips on the gym row. So
-- `cambiar_corte_reservas` and the booking switch (`gym.booking_enabled`) change what every open
-- phone is allowed to do and nothing tells those phones. The member keeps seeing a bookable week
-- until they reload; staff flip the switch and cannot see it take. That is exactly the staleness
-- the rail exists to end, on the one row whose state gates the others.
--
-- WHY THE SAME FUNCTION AND NOT A SIBLING: the only thing `gym` needs differently is which column
-- carries the tenant key — the gym row IS the tenant, so the key is `id`, not `gym_id`. One branch
-- on `tg_table_name` buys that, and everything downstream (the transaction-local dedupe GUC, the
-- `cambio` event, the private `gym:<id>` topic, the data-free `{"t": ...}` payload, the postgres
-- ownership that is the whole reason the insert is not RLS-denied) stays literally the same code.
-- A sibling function would fork all of it to change one column name.
--
-- WHY ONLY THE UPDATE ARM, AND WHY A COLUMN LIST: a gym is INSERTed once, at onboarding, when no
-- member of it is holding a phone, and it is never DELETEd. The remaining arm is narrowed with
-- `update of corte_reservas, booking_enabled` so that renaming a brand, editing a legal name or
-- moving a domain — none of which change what a member may do — does not wake every phone in the
-- gym. Postgres fires an `update of` trigger when a listed column appears in the statement's SET
-- list, whether or not the value actually changed; that over-fires only on a write that already
-- meant to touch a switch, which is precisely the write worth signalling.
--
-- WHY FOR EACH ROW HERE, WHEN THE OTHER FIVE ARE FOR EACH STATEMENT: Postgres refuses the two
-- together — "transition tables cannot be specified for triggers with column lists" (verified by
-- probe on this migration). The column list is the more valuable half. Statement-level exists on
-- the other five because retiring a recurring series touches up to 986 rows in one commit; a gym
-- switch is `update public.gym set … where id = <one gym>`, i.e. one row, and even a hypothetical
-- all-gyms UPDATE would emit one message per gym, which is one per TOPIC and therefore correct
-- rather than a flood. The transaction-local dedupe GUC still collapses repeats to one either way.
--
-- WHY `new` ALONE IS SAFE HERE: the union of OLD and NEW exists on the five tables because a row
-- can be RE-KEYED between gyms (a cliente moves) and the gym it LEFT needs telling. A gym row
-- cannot move between gyms — `id` is its primary key — so NEW and OLD name the same tenant.

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
  if tg_table_name = 'gym' then
    -- The tenant row itself: its key column is `id`, and this is the one FOR EACH ROW arm (see
    -- the header). plpgsql plans a statement only when it executes it, so `new` is never resolved
    -- on the statement-level paths below, which do not have one.
    v_gyms := array[new.id];
  elsif tg_op = 'INSERT' then
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

-- The ownership IS the mechanism (20260901120000 header): `realtime.messages` has RLS on with no
-- INSERT policy, and `realtime.send` is SECURITY INVOKER, so a non-bypassrls definer would have its
-- insert denied — and swallowed. `create or replace` above preserves the existing owner; this
-- restates it so the guarantee survives any path that did not already run as postgres.
alter function public.senal_gym() owner to postgres;
revoke execute on function public.senal_gym() from public, anon;

drop trigger if exists senal_gym_upd on public.gym;
create trigger senal_gym_upd
  after update of corte_reservas, booking_enabled on public.gym
  for each row
  execute function public.senal_gym();
