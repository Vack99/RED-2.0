-- Synthetic gym-#2 end-to-end probe (issue #28 cutover rehearsal, Task 6 final step).
--
-- Runs ONCE against the POST-Migration-B state (user_id columns gone; gym-scoped policies +
-- membership-derived RPCs are the whole tenant surface) and walks a brand-new second gym through
-- the full member + staff lifecycle:
--   (a) register→claim: a verified-email auth user claims the gym's pre-seeded unclaimed cliente
--       via reclamar_o_crear_cliente (reclamado = true, balance carried);
--   (b) member catalog reads: the claimed member reads gym #2's paquetes/perfil/plantillas and
--       NONE of gym #1's rows (seeded real rows in both gyms — no vacuous pass);
--   (c) staff sale: registrar_venta as gym-#2 staff draws folio 1001 off gym #2's OWN counter
--       (gym #1 seeded at high-water folio 1200 → independence), cliente + venta land in gym #2;
--   (d) timezone: toggle_pase as gym-#2 staff stamps the asistencia on
--       (now() at time zone 'America/Mexico_City')::date with a non-null hora (gym-derived tz).
--
-- Suite conventions (rls_cross_tenant_denial.sql / registro_claim.sql / folio_per_gym.sql /
-- toggle_pase_gym2_timezone.sql): single BEGIN…ROLLBACK, transaction-local fixtures seeded as the
-- connecting role (RLS bypassed, exactly as the import path), zero prod UUIDs (gym #1 = forge by
-- slug; everything else gen_random_uuid()), impersonation via set_config('request.jwt.claims',…)
-- + set local role, every check RAISEs on failure, one final 'OK' row.
--
-- HOW TO RUN: node supabase/cutover/apply-sql.mjs <rehearsal-ref> supabase/tests/gym2_probe.sql

begin;

-- ── Fixtures (connecting role; transaction-local; zero prod UUIDs) ────────────
do $$
declare
  gym1     uuid;
  gym2     uuid := gen_random_uuid();
  staff2   uuid := gen_random_uuid();  -- operator of gym #2
  member2  uuid := gen_random_uuid();  -- registrant who will claim the seeded cliente
  cli_g1   uuid;
  cli_seed uuid;                       -- gym #2's pre-seeded UNCLAIMED cliente (known email)
  paq2     uuid;                       -- gym #2's paquete: the sole package input to the (c) sale (C13)
begin
  select id into gym1 from public.gym where slug = 'forge';
  if gym1 is null then raise exception 'SEED FAIL: expected the forge gym from the spine seeds'; end if;

  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym2, 'gym2-probe', 'Gym 2 Probe', 'America/Mexico_City', 'red');

  -- staff2: verified staff auth user + operator membership of gym #2 ONLY (staff_gym() → gym2).
  -- member2: verified-email registrant; full_name/phone_e164 exactly as signUp(options.data) stores them.
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', staff2,  'authenticated', 'authenticated', 'gym2-staff@test.local',  now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', member2, 'authenticated', 'authenticated', 'gym2-member@test.local', now(), '{"full_name":"Mia Member","phone_e164":"+525511122233"}');
  insert into public.gym_membership (user_id, gym_id, role) values (staff2, gym2, 'operator');

  -- gym #2's pre-seeded unclaimed CRM row: member2's email, known balance 5 (must carry over on claim).
  insert into public.clientes (gym_id, nombre, tel, clases_restantes, email, auth_user_id)
    values (gym2, 'Mia Preexistente', '5511122233', 5, 'gym2-member@test.local', null)
    returning id into cli_seed;

  -- Real rows in BOTH gyms' catalogs so (b)'s "gym-1 invisible" asserts against data, not emptiness.
  -- gym #2's row is captured: the (c) sale re-derives from it (C13), so it carries a real `clases`.
  insert into public.paquetes  (gym_id, nombre, clases, vigencia_dias, precio) values
    (gym1, 'G1 8 clases', 8, 20, 750);
  insert into public.paquetes  (gym_id, nombre, clases, vigencia_dias, precio) values
    (gym2, 'G2 8 clases', 8, 20, 800) returning id into paq2;
  insert into public.perfil    (gym_id, negocio) values (gym1, 'FORGE'), (gym2, 'GYM2');
  insert into public.plantillas (gym_id, nombre, body) values
    (gym1, 'G1 Recordatorio', 'Hola {nombre}'), (gym2, 'G2 Recordatorio', 'Hola {nombre}');

  -- gym #1's folio high-water mark (1200): gym #2 drawing 1001 proves counter independence.
  insert into public.clientes (gym_id, nombre, tel, clases_restantes)
    values (gym1, 'Cliente G1', '6140000009', 3) returning id into cli_g1;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
    values (gym1, cli_g1, 1200, '8 clases', 8, 'dias', 20, 750, 'efectivo');

  perform set_config('t.gym1',     gym1::text,     true);
  perform set_config('t.gym2',     gym2::text,     true);
  perform set_config('t.staff2',   staff2::text,   true);
  perform set_config('t.member2',  member2::text,  true);
  perform set_config('t.cli_seed', cli_seed::text, true);
  perform set_config('t.paq2',     paq2::text,     true);
end $$;

-- ── (a) register→claim: member2 claims the seeded row (reclamado = true, balance carried) ─────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member2', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g2 uuid := current_setting('t.gym2', true)::uuid;
  cs uuid := current_setting('t.cli_seed', true)::uuid;
  m2 uuid := current_setting('t.member2', true)::uuid;
  r  record;
  n  int;
begin
  select * into r from public.reclamar_o_crear_cliente(g2);
  if not r.reclamado then raise exception 'PROBE (a) FAIL: expected reclamado=true (verified-email match)'; end if;
  if r.cliente_id <> cs then raise exception 'PROBE (a) FAIL: claimed % but expected the seeded cliente %', r.cliente_id, cs; end if;
  -- Balance carried over untouched + membership written in the same transaction.
  select clases_restantes into n from public.clientes where id = cs;
  if n is distinct from 5 then raise exception 'PROBE (a) FAIL: balance not carried (clases_restantes=%)', n; end if;
  select count(*) into n from public.gym_membership where user_id = m2 and gym_id = g2 and role = 'member';
  if n <> 1 then raise exception 'PROBE (a) FAIL: gym_membership(member) row missing (count=%)', n; end if;
end $$;
reset role;

-- ── (b) member catalog reads: gym #2 rows visible, gym #1 rows invisible ──────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member2', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  cs uuid := current_setting('t.cli_seed', true)::uuid;
  n  int;
  v_nombre text;
begin
  -- Both gyms carry one row per catalog table; the member must see EXACTLY gym #2's one.
  select count(*) into n from public.paquetes;   if n <> 1 then raise exception 'PROBE (b) FAIL: member sees % paquetes (expected gym-2''s 1 only)', n; end if;
  select nombre into v_nombre from public.paquetes;
  if v_nombre <> 'G2 8 clases' then raise exception 'PROBE (b) FAIL: member sees paquete % (a gym-1 row leaked)', v_nombre; end if;
  select count(*) into n from public.perfil;      if n <> 1 then raise exception 'PROBE (b) FAIL: member sees % perfil rows', n; end if;
  select count(*) into n from public.plantillas; if n <> 1 then raise exception 'PROBE (b) FAIL: member sees % plantillas', n; end if;
  -- And exactly their own claimed cliente — gym #1's cliente + peers invisible.
  select count(*) into n from public.clientes;
  if n <> 1 then raise exception 'PROBE (b) FAIL: member sees % clientes (expected own 1)', n; end if;
  select id into cs from public.clientes;
  if cs <> current_setting('t.cli_seed', true)::uuid then raise exception 'PROBE (b) FAIL: member sees a foreign cliente row'; end if;
end $$;
reset role;

-- ── (c) staff sale: folio 1001 off gym #2's OWN counter; rows land in gym #2 ──────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff2', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g2       uuid := current_setting('t.gym2', true)::uuid;
  v_folio  bigint;
  v_cli    uuid;
  v_gym    uuid;
begin
  -- NEW-cliente path: gym derives from staff2's membership (staff_gym()), never a parameter. The sale
  -- re-derives price/saldo/vence from gym #2's paquete row (C13) — only its id is sent.
  select r.folio, r.cliente_id into v_folio, v_cli from public.registrar_venta(
    p_metodo := 'efectivo', p_paquete_id := current_setting('t.paq2', true)::uuid,
    p_idempotency_key := gen_random_uuid(), p_nombre := 'Venta G2', p_tel := '5599988877') r;

  -- gym #2 has zero ventas → its counter seeds at 1000 → first folio 1001, while gym #1 sits at 1200:
  -- 1001 proves the draw came off gym #2's own counter row.
  if v_folio <> 1001 then raise exception 'PROBE (c) FAIL: folio % (expected gym-2''s first folio 1001, independent of gym-1''s 1200)', v_folio; end if;

  select gym_id into v_gym from public.clientes where id = v_cli;
  if v_gym is distinct from g2 then raise exception 'PROBE (c) FAIL: new cliente stamped gym % (expected gym #2 %)', v_gym, g2; end if;
  select gym_id into v_gym from public.ventas where cliente_id = v_cli;
  if v_gym is distinct from g2 then raise exception 'PROBE (c) FAIL: venta stamped gym % (expected gym #2 %)', v_gym, g2; end if;

  perform set_config('t.cli_new', v_cli::text, true);
end $$;
reset role;

-- ── (d) toggle_pase as gym-#2 staff: fecha = Mexico-City today, hora gym-tz-stamped ───────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.staff2', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_cli      uuid := current_setting('t.cli_new', true)::uuid;
  v_today_mx date := (now() at time zone 'America/Mexico_City')::date;
  v_present  boolean;
  v_hora     text;
  v_fecha    date;
begin
  select present, hora into v_present, v_hora from public.toggle_pase(v_cli, v_today_mx);
  if v_present is not true then raise exception 'PROBE (d) FAIL: toggle ON did not register present'; end if;
  if v_hora is null then raise exception 'PROBE (d) FAIL: hora-stamp did not fire for Mexico-City-today (tz not gym-derived?)'; end if;

  select fecha into v_fecha from public.asistencias where cliente_id = v_cli and deleted_at is null;
  if v_fecha is distinct from v_today_mx then
    raise exception 'PROBE (d) FAIL: asistencia fecha % (expected (now() at ''America/Mexico_City'')::date = %)', v_fecha, v_today_mx;
  end if;
end $$;
reset role;

select 'gym2 probe: OK' as result;
rollback;
