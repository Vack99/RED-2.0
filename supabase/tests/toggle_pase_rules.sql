-- toggle_pase attendance-rule test (ADR-0005 contract-honesty item).
--
-- ADR-0005 keeps the STACKING / FORFEIT / VIGENCIA math in the tested TS domain, but two attendance
-- write-rules live ONLY in the toggle_pase RPC because they are inseparable from the atomic on/off
-- transaction (no orphan TS twin). This artifact is their committed test home, run against the REAL
-- deployed function:
--   (b) refund-iff-consumed-and-not-ilimitado — toggling OFF refunds a class IFF the attendance
--       actually consumed one AND the client is finite (clases_restantes is not null). The
--       `v_active_consumio and v_clases is not null` guard in toggle_pase.
--   (c) hora-stamp-today-only — stamp `hora` only when p_fecha is Chihuahua-today, else null. The
--       `case when p_fecha = (now() at time zone 'America/Chihuahua')::date ...` in toggle_pase.
--
-- Self-asserting: every check RAISEs 'RULE FAIL: ...' on a mismatch, so a clean run returns one 'OK'
-- row and any failure aborts. Wrapped in BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN (no local Docker here, so not wired into `supabase test db` / pgTAP):
--   - via the Supabase MCP execute_sql (pure SQL — no psql meta-commands), or
--   - psql "$DATABASE_URL" -f supabase/tests/toggle_pase_rules.sql
--
-- PORTING TO ANOTHER ENV: nothing is hardcoded. The operator uid is read at runtime from the first
-- perfil row (perfil.user_id is an auth.users id). To point at a specific operator, replace the
-- `set_config('app.op', ...)` source below with that operator's auth uid literal.

begin;

-- ── Resolve the operator at runtime (the only env-dependent value) ───────────
-- perfil.user_id is a real auth.users id; toggle_pase keys every write to auth.uid(), and RLS scopes
-- clientes/asistencias to it — so the seed, the RPC, and the assertions must all run as this operator.
select set_config(
  'app.op',
  (select user_id::text from public.perfil order by created_at limit 1),
  true
);

-- ── Act as that authenticated operator ───────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_op       uuid := current_setting('app.op', true)::uuid;
  -- "today" / "back-entry" computed in Chihuahua local time INSIDE the SQL, never current_date
  -- (which is UTC and can be a day ahead of Chihuahua — that exact off-by-one bit us before).
  v_today    date := (now() at time zone 'America/Chihuahua')::date;
  v_back     date := v_today - 3;          -- a back-entry day, never Chihuahua-today
  v_finite   uuid;                          -- finite client: clases_restantes = 5
  v_ilim     uuid;                          -- ilimitado client: clases_restantes = null
  v_gym      uuid := (select id from public.gym where slug = 'forge');  -- the operator's gym (slice #20)
  v_agym     uuid;                          -- gym_id stamped on the new asistencia
  v_clases   int;
  v_present  boolean;
  v_hora     text;
  v_stored   time;                          -- the hora actually persisted on the row
begin
  -- ── Seed: one FINITE and one ILIMITADO client, both owned by the operator ──
  insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
  values (v_op, 'TEST finite',    '0000000001', 5,    v_today + 20, '8 clases', v_gym)
  returning id into v_finite;

  insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
  values (v_op, 'TEST ilimitado', '0000000002', null, v_today + 20, 'mes', v_gym)
  returning id into v_ilim;

  -- ════════════════════════════════════════════════════════════════════════
  -- (b) refund-iff-consumed-and-not-ilimitado
  -- ════════════════════════════════════════════════════════════════════════

  -- FINITE, toggle ON today: consumes one class (5 -> 4)
  select present into v_present from public.toggle_pase(v_finite, v_today);
  if v_present is not true then raise exception 'RULE FAIL(b): finite toggle ON did not register present'; end if;
  select clases_restantes into v_clases from public.clientes where id = v_finite;
  if v_clases <> 4 then raise exception 'RULE FAIL(b): finite ON expected clases 4, got %', v_clases; end if;

  -- (slice #20) the new asistencia is born scoped: gym_id stamped from the cliente's gym, never null.
  select gym_id into v_agym from public.asistencias
   where cliente_id = v_finite and fecha = v_today and deleted_at is null order by created_at desc limit 1;
  if v_agym is distinct from v_gym then raise exception 'RULE FAIL(gym): asistencia.gym_id % expected cliente gym %', v_agym, v_gym; end if;

  -- FINITE, toggle OFF same day: refunds exactly one (4 -> 5)
  select present into v_present from public.toggle_pase(v_finite, v_today);
  if v_present is not false then raise exception 'RULE FAIL(b): finite toggle OFF did not register absent'; end if;
  select clases_restantes into v_clases from public.clientes where id = v_finite;
  if v_clases <> 5 then raise exception 'RULE FAIL(b): finite OFF expected refund to 5, got %', v_clases; end if;

  -- ILIMITADO, toggle ON: clases stays null (nothing to consume)
  select present into v_present from public.toggle_pase(v_ilim, v_today);
  if v_present is not true then raise exception 'RULE FAIL(b): ilimitado toggle ON did not register present'; end if;
  select clases_restantes into v_clases from public.clientes where id = v_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(b): ilimitado ON should stay null, got %', v_clases; end if;

  -- ILIMITADO, toggle OFF: stays null — no phantom refund (the `v_clases is not null` guard)
  select present into v_present from public.toggle_pase(v_ilim, v_today);
  if v_present is not false then raise exception 'RULE FAIL(b): ilimitado toggle OFF did not register absent'; end if;
  select clases_restantes into v_clases from public.clientes where id = v_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(b): ilimitado OFF should stay null (no phantom refund), got %', v_clases; end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- (c) hora-stamp-today-only
  -- ════════════════════════════════════════════════════════════════════════

  -- toggle ON with p_fecha = Chihuahua-today -> hora is NOT null (returned AND stored)
  select present, hora into v_present, v_hora from public.toggle_pase(v_finite, v_today);
  if v_hora is null then raise exception 'RULE FAIL(c): toggle ON today returned null hora (expected a time)'; end if;
  select hora into v_stored
    from public.asistencias
   where cliente_id = v_finite and fecha = v_today and deleted_at is null
   order by created_at desc limit 1;
  if v_stored is null then raise exception 'RULE FAIL(c): toggle ON today stored null hora (expected a time)'; end if;
  -- clean up so the back-entry assertion below targets a fresh row, not this one
  select present into v_present from public.toggle_pase(v_finite, v_today);  -- toggle OFF today

  -- toggle ON with p_fecha = Chihuahua-today minus 3 days (back-entry) -> hora IS null
  select present, hora into v_present, v_hora from public.toggle_pase(v_finite, v_back);
  if v_present is not true then raise exception 'RULE FAIL(c): back-entry toggle ON did not register present'; end if;
  if v_hora is not null then raise exception 'RULE FAIL(c): back-entry toggle ON returned hora % (expected null)', v_hora; end if;
  select hora into v_stored
    from public.asistencias
   where cliente_id = v_finite and fecha = v_back and deleted_at is null
   order by created_at desc limit 1;
  if v_stored is not null then raise exception 'RULE FAIL(c): back-entry toggle ON stored hora % (expected null)', v_stored; end if;

  raise notice 'toggle_pase rules: (b) refund-guard and (c) hora-today-only both hold';
end $$;

select 'toggle_pase rules: OK' as result;
rollback;
