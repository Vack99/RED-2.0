-- clase cupo-roster read rules (slice #59; PRD #49 S3 "cupo roster"; ADR-0010 §3 derived occupancy;
-- ADR-0013 member-owned reservation RLS). The clase-detail page shows the seats taken as attendee
-- avatars, but a member holds a SELECT policy on their OWN reservation rows only — so other attendees'
-- rows are invisible under plain RLS. roster_clase is the NARROW privileged read that makes the roster
-- truthful without over-exposing: a SECURITY DEFINER function that returns ONLY display initials (never a
-- full name, email, phone, or balance), scoped by is_member_of(gym) so a caller sees rosters ONLY for
-- sessions of gyms they belong to — the exact posture of contar_reservas_activas. Run against the REAL
-- deployed function on a scratch project in a rolled-back transaction:
--   * real attendees — returns one initials string per ACTIVE (reservada|asistida) reservation; the
--                       cancelled row is excluded (mirrors the occupancy count's "active" set).
--   * initials only  — the returned value is a member's initials (<= 2 chars), never their name/PII.
--   * non-member     — a member of ANOTHER gym reading this session's roster gets zero rows (is_member_of).
--   * anon denied    — anon cannot EXECUTE the function (default grant revoked).
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK.
-- Zero hardcoded prod UUIDs (gyms/users/clientes/sessions/reservations seeded transaction-local).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into SUITE.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  v_gym   uuid;
  v_gym2  uuid;
  v_ct    uuid;
  v_ses   uuid;
  v_ses2  uuid;    -- a session in the OTHER gym
  v_ct2   uuid;
  m_a uuid := gen_random_uuid();   -- forge member (reservada)
  m_b uuid := gen_random_uuid();   -- forge member (asistida)
  m_c uuid := gen_random_uuid();   -- forge member (cancelada — excluded)
  m_out uuid := gen_random_uuid(); -- member of the OTHER gym (non-member of forge)
  c_a uuid; c_b uuid; c_c uuid; c_out uuid;
begin
  select id into v_gym from public.gym where slug = 'forge';
  if v_gym is null then raise exception 'SEED FAIL: expected the forge gym'; end if;
  insert into public.gym (slug, brand_name, timezone, brand_module_id)
    values ('roster-gym2', 'Roster Gym 2', 'America/Mexico_City', 'base') returning id into v_gym2;

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', m_a,   'authenticated', 'authenticated', 'ros-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_b,   'authenticated', 'authenticated', 'ros-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_c,   'authenticated', 'authenticated', 'ros-c@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_out, 'authenticated', 'authenticated', 'ros-out@test.local');
  insert into public.gym_membership (user_id, gym_id, role) values
    (m_a, v_gym, 'member'), (m_b, v_gym, 'member'), (m_c, v_gym, 'member'), (m_out, v_gym2, 'member');

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Juan Perez',   '0000000021', 8, current_date + 20, '8 clases', v_gym, m_a)   returning id into c_a;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Lucia Mora',   '0000000022', 8, current_date + 20, '8 clases', v_gym, m_b)   returning id into c_b;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Kevin Prieto', '0000000023', 8, current_date + 20, '8 clases', v_gym, m_c)   returning id into c_c;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Otro Miembro', '0000000024', 8, current_date + 20, '8 clases', v_gym2, m_out) returning id into c_out;

  insert into public.class_type (gym_id, name) values (v_gym,  'Roster Fuerza') returning id into v_ct;
  insert into public.class_type (gym_id, name) values (v_gym2, 'Roster Otro')   returning id into v_ct2;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym,  v_ct,  now() + interval '2 days', 60, 20) returning id into v_ses;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym2, v_ct2, now() + interval '2 days', 60, 20) returning id into v_ses2;

  -- forge session: 2 active (reservada + asistida) + 1 cancelada (excluded)
  insert into public.reservation (gym_id, class_session_id, member_id, status) values
    (v_gym, v_ses, c_a, 'reservada'),
    (v_gym, v_ses, c_b, 'asistida'),
    (v_gym, v_ses, c_c, 'cancelada');

  perform set_config('t.gym',   v_gym::text,  true);
  perform set_config('t.ses',   v_ses::text,  true);
  perform set_config('t.m_a',   m_a::text,    true);
  perform set_config('t.m_out', m_out::text,  true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- a forge member reads the roster: 2 active attendees, initials only, cancelled excluded
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  ses uuid := current_setting('t.ses', true)::uuid;
  v_cnt int; v_maxlen int; v_set text[];
begin
  select count(*), coalesce(max(length(iniciales)), 0), array_agg(iniciales order by iniciales)
    into v_cnt, v_maxlen, v_set
    from public.roster_clase(ses);
  if v_cnt <> 2 then raise exception 'RULE FAIL(active): roster returned % rows (expected 2 active)', v_cnt; end if;
  if v_maxlen > 2 then raise exception 'RULE FAIL(pii): a roster value is % chars — not initials', v_maxlen; end if;
  -- Juan Perez -> JP, Lucia Mora -> LM (cancelled Kevin Prieto -> KP must be absent)
  if not (v_set @> array['JP','LM']) then raise exception 'RULE FAIL(initials): got % (expected JP, LM)', v_set; end if;
  if v_set @> array['KP'] then raise exception 'RULE FAIL(active): cancelled attendee KP leaked into roster'; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- non-member (member of another gym) reads the forge roster → zero rows (is_member_of gate)
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_out', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare ses uuid := current_setting('t.ses', true)::uuid; v_cnt int;
begin
  select count(*) into v_cnt from public.roster_clase(ses);
  if v_cnt <> 0 then raise exception 'RULE FAIL(nonmember): cross-gym caller saw % roster rows (expected 0)', v_cnt; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- anon cannot EXECUTE the function
-- ════════════════════════════════════════════════════════════════════════════════
set local role anon;
do $$
declare ses uuid := current_setting('t.ses', true)::uuid; raised boolean := false;
begin
  begin perform public.roster_clase(ses); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(anon): anon executed roster_clase'; end if;
end $$;
reset role;

select 'roster_clase rules: OK' as result;
rollback;
