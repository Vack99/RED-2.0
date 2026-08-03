-- Two-gym member tenant pin — issue #219 (epic #203; ADR-0008 amendment 2026-08-02 "the tenant may
-- only NARROW, never widen"; ADR-0013 member-owned class).
--
-- THE MISSING FIXTURE. Until this file, no suite in supabase/tests/ seeded ONE auth user holding TWO
-- `gym_membership` rows and TWO `clientes` rows — which is exactly why `mi_membresia` and
-- `toggle_favorito_tipo` shipped picking their tenant with a bare `limit 1` and no `order by`, and
-- why nothing failed. `clientes_auth_user_id_per_gym` is UNIQUE (gym_id, auth_user_id): it PERMITS
-- the two-gym member, it does not prevent them. This suite is the actor.
--
-- Vectors proved (all as ONE member, `socio`, who belongs to gym A and gym B but NOT gym C):
--   READ (mi_membresia)
--     1) mi_membresia(gym_a) returns gym A's plan/balance/expiry; mi_membresia(gym_b) returns gym B's.
--        BOTH DIRECTIONS from the same session — the bare-`limit 1` body would answer both calls with
--        whichever row the planner handed it, so one of the two would be wrong.
--     2) anchor_dia is computed in the NAMED gym's timezone. The two anchor sales carry the SAME
--        instant ('2026-06-15 05:30+00'); gym A is America/Mexico_City → 2026-06-14, gym B is UTC →
--        2026-06-15. The same asistencia date ('2026-06-14') is therefore COUNTED in gym A and
--        EXCLUDED in gym B. This is the half of the defect that costs a member a real class: the tz
--        that renders their class times came from the arbitrary gym.
--     3) exactly ONE row comes back per call (never both tenants' rows).
--     4) NARROWING ONLY: mi_membresia(gym_c) — a gym the caller holds no row in — returns ZERO rows.
--        The parameter selects among the caller's own rows; it can never add one.
--   WRITE (toggle_favorito_tipo) — asserted on the WRITTEN ROWS, not on the return value (AGENTS.md)
--     5) toggle(ct_a, gym_a) writes gym A's clientes row and LEAVES GYM B'S NULL; toggle(ct_b, gym_b)
--        then writes gym B's row and leaves gym A's intact. Both directions, no crosstalk.
--     6) a cross pair — toggle(ct_b, gym_a), a class type of the gym the member is NOT looking at —
--        raises `Tipo de clase no encontrado` and moves NEITHER row.
--     7) toggle(ct_c, gym_c) — a gym the caller holds no clientes row in — raises `No eres miembro de
--        este gimnasio`, and the row of gym C's real member (`otro`) is untouched. The named gym
--        cannot widen the write out of the caller's own memberships.
--     8) clear is still per-tenant: re-toggling ct_a in gym A clears gym A's row and leaves gym B's set.
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK,
-- zero prod UUIDs.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into SUITE.

begin;

do $$
declare
  gym_a uuid := gen_random_uuid();   -- America/Mexico_City (UTC-6, DST-free since 2022)
  gym_b uuid := gen_random_uuid();   -- UTC — a DIFFERENT clock, so the tz-of-the-named-gym is provable
  gym_c uuid := gen_random_uuid();   -- the gym `socio` does NOT belong to
  socio uuid := gen_random_uuid();   -- ONE identity, TWO memberships — the fixture this repo lacked
  otro  uuid := gen_random_uuid();   -- gym C's real member; their row must never move
  c_a uuid; c_b uuid; c_c uuid;
  ct_a uuid; ct_b uuid; ct_c uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'pin-gym-a', 'Pin Gym A', 'America/Mexico_City', 'base'),
    (gym_b, 'pin-gym-b', 'Pin Gym B', 'UTC',                 'base'),
    (gym_c, 'pin-gym-c', 'Pin Gym C', 'America/Mexico_City', 'base');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', socio, 'authenticated', 'authenticated', 'pin-socio@test.local'),
    ('00000000-0000-0000-0000-000000000000', otro,  'authenticated', 'authenticated', 'pin-otro@test.local');

  -- socio in BOTH gyms; otro only in gym C.
  insert into public.gym_membership (user_id, gym_id, role) values
    (socio, gym_a, 'member'),
    (socio, gym_b, 'member'),
    (otro,  gym_c, 'member');

  -- Two clientes rows for ONE auth user — permitted by UNIQUE (gym_id, auth_user_id). Deliberately
  -- different in every field the plan card renders, so a wrong-tenant pick cannot look right.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Socio A', '0000000021', 3, current_date + 20, '8 clases', gym_a, socio) returning id into c_a;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Socio B', '0000000022', null, current_date + 40, 'Ilimitado', gym_b, socio) returning id into c_b;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Otro C', '0000000023', 5, current_date + 10, '4 clases', gym_c, otro) returning id into c_c;

  insert into public.class_type (gym_id, name) values (gym_a, 'Pin Fuerza') returning id into ct_a;
  insert into public.class_type (gym_id, name) values (gym_b, 'Pin Metcon') returning id into ct_b;
  insert into public.class_type (gym_id, name) values (gym_c, 'Pin Ajeno')  returning id into ct_c;
  -- gym C's member already has a favorite — the row that must survive every rejected toggle below.
  update public.clientes set favorite_class_type_id = ct_c where id = c_c;

  -- The SAME instant in both gyms: 2026-06-15 05:30+00 is 2026-06-14 23:30 in America/Mexico_City and
  -- 2026-06-15 05:30 in UTC. anchor_dia and the attendance count day therefore differ BY TIMEZONE ALONE.
  -- created_at is set explicitly (= fecha, non-backdated) because the anchor is `created_at desc, id desc`.
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at) values
    (gym_a, c_a, 8801, '8 clases',  8,    'dias', 30, 700,  'efectivo',      '2026-06-15 05:30:00+00', '2026-06-15 05:30:00+00'),
    (gym_b, c_b, 8802, 'Ilimitado', null, 'mes',  null, 1400, 'transferencia', '2026-06-15 05:30:00+00', '2026-06-15 05:30:00+00');

  -- 2026-06-14 is ON gym A's count day (counted) and BEFORE gym B's (excluded) — one date, two answers.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, deleted_at) values
    (gym_a, c_a, '2026-06-14', true, null),   -- gym A count day (Mexico_City) → COUNTED
    (gym_a, c_a, '2026-06-20', true, null),   -- after → COUNTED  (gym A total = 2)
    (gym_b, c_b, '2026-06-14', true, null);   -- before gym B's count day (UTC 06-15) → EXCLUDED (total = 0)

  perform set_config('t.gym_a', gym_a::text, true);
  perform set_config('t.gym_b', gym_b::text, true);
  perform set_config('t.gym_c', gym_c::text, true);
  perform set_config('t.socio', socio::text, true);
  perform set_config('t.c_a',   c_a::text,   true);
  perform set_config('t.c_b',   c_b::text,   true);
  perform set_config('t.c_c',   c_c::text,   true);
  perform set_config('t.ct_a',  ct_a::text,  true);
  perform set_config('t.ct_b',  ct_b::text,  true);
  perform set_config('t.ct_c',  ct_c::text,  true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- The two-gym member, one session, both tenants asked for by name
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.socio', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
  gym_b uuid := current_setting('t.gym_b', true)::uuid;
  gym_c uuid := current_setting('t.gym_c', true)::uuid;
  c_a   uuid := current_setting('t.c_a',   true)::uuid;
  c_b   uuid := current_setting('t.c_b',   true)::uuid;
  ct_a  uuid := current_setting('t.ct_a',  true)::uuid;
  ct_b  uuid := current_setting('t.ct_b',  true)::uuid;
  ct_c  uuid := current_setting('t.ct_c',  true)::uuid;
  r record; n int; v_ret uuid; v_fa uuid; v_fb uuid; raised boolean;
begin
  -- ── 1/2/3: mi_membresia(gym_a) is gym A, in gym A's timezone, one row ──
  select count(*) into n from public.mi_membresia(gym_a);
  if n <> 1 then raise exception 'PIN FAIL(a): mi_membresia returned % row(s) (expected exactly 1)', n; end if;

  select * into r from public.mi_membresia(gym_a);
  if r.paquete_nombre is distinct from '8 clases' then
    raise exception 'PIN FAIL(a): paquete_nombre % (expected 8 clases — gym A, not gym B''s Ilimitado)', r.paquete_nombre;
  end if;
  if r.clases_restantes is distinct from 3 then
    raise exception 'PIN FAIL(a): clases_restantes % (expected 3 — gym A; gym B is NULL/ilimitado)', r.clases_restantes;
  end if;
  if r.vence is distinct from (current_date + 20) then
    raise exception 'PIN FAIL(a): vence % (expected +20d — gym A, not gym B''s +40d)', r.vence;
  end if;
  if r.anchor_monto is distinct from 700 then
    raise exception 'PIN FAIL(a): anchor_monto % (expected 700 — gym A''s sale, not gym B''s 1400)', r.anchor_monto;
  end if;
  -- TIMEZONE: gym A is America/Mexico_City, so the 05:30+00 sale lands on 2026-06-14.
  if r.anchor_dia is distinct from date '2026-06-14' then
    raise exception 'PIN FAIL(a): anchor_dia % (expected 2026-06-14 — gym A tz America/Mexico_City, not gym B''s UTC 2026-06-15)', r.anchor_dia;
  end if;
  if r.attended_since_purchase is distinct from 2 then
    raise exception 'PIN FAIL(a): attended_since_purchase % (expected 2 — counted from gym A''s tz day)', r.attended_since_purchase;
  end if;

  -- ── the OTHER direction, same session: mi_membresia(gym_b) is gym B, in gym B's timezone ──
  select count(*) into n from public.mi_membresia(gym_b);
  if n <> 1 then raise exception 'PIN FAIL(b): mi_membresia returned % row(s) (expected exactly 1)', n; end if;

  select * into r from public.mi_membresia(gym_b);
  if r.paquete_nombre is distinct from 'Ilimitado' then
    raise exception 'PIN FAIL(b): paquete_nombre % (expected Ilimitado — gym B, not gym A''s 8 clases)', r.paquete_nombre;
  end if;
  if r.clases_restantes is not null then
    raise exception 'PIN FAIL(b): clases_restantes % (expected NULL — gym B is ilimitado)', r.clases_restantes;
  end if;
  if r.vence is distinct from (current_date + 40) then
    raise exception 'PIN FAIL(b): vence % (expected +40d — gym B)', r.vence;
  end if;
  if r.anchor_monto is distinct from 1400 then
    raise exception 'PIN FAIL(b): anchor_monto % (expected 1400 — gym B''s sale)', r.anchor_monto;
  end if;
  -- TIMEZONE: gym B is UTC, so the SAME instant lands on 2026-06-15 — one day later than gym A.
  if r.anchor_dia is distinct from date '2026-06-15' then
    raise exception 'PIN FAIL(b): anchor_dia % (expected 2026-06-15 — gym B tz UTC; the same instant is 06-14 in gym A)', r.anchor_dia;
  end if;
  -- The 2026-06-14 asistencia is BEFORE gym B's UTC count day, so it does not count here — the same
  -- row that counts in gym A. A tenant-blind tz would return 1.
  if r.attended_since_purchase is distinct from 0 then
    raise exception 'PIN FAIL(b): attended_since_purchase % (expected 0 — the 06-14 visit is before gym B''s UTC count day)', r.attended_since_purchase;
  end if;

  -- ── 4: NARROW, never widen — a gym the caller holds no clientes row in returns NOTHING ──
  select count(*) into n from public.mi_membresia(gym_c);
  if n <> 0 then
    raise exception 'WIDEN FAIL: mi_membresia(gym_c) returned % row(s) for a non-member (expected 0)', n;
  end if;

  -- ── 5: the heart writes the NAMED gym's row, and only it ──
  select favorito into v_ret from public.toggle_favorito_tipo(ct_a, gym_a);
  if v_ret is distinct from ct_a then raise exception 'PIN FAIL(toggle a): returned % (expected ct_a)', v_ret; end if;
  select favorite_class_type_id into v_fa from public.clientes where id = c_a;
  select favorite_class_type_id into v_fb from public.clientes where id = c_b;
  if v_fa is distinct from ct_a then raise exception 'WRITE FAIL(a): gym A row holds % (expected ct_a)', v_fa; end if;
  if v_fb is not null          then raise exception 'WRITE FAIL(a): gym B row moved to % (expected untouched NULL)', v_fb; end if;

  -- the other direction: gym B's heart moves, gym A's stays put
  select favorito into v_ret from public.toggle_favorito_tipo(ct_b, gym_b);
  if v_ret is distinct from ct_b then raise exception 'PIN FAIL(toggle b): returned % (expected ct_b)', v_ret; end if;
  select favorite_class_type_id into v_fa from public.clientes where id = c_a;
  select favorite_class_type_id into v_fb from public.clientes where id = c_b;
  if v_fb is distinct from ct_b then raise exception 'WRITE FAIL(b): gym B row holds % (expected ct_b)', v_fb; end if;
  if v_fa is distinct from ct_a then raise exception 'WRITE FAIL(b): gym A row drifted to % (expected ct_a)', v_fa; end if;

  -- ── 6: a class type of the gym the member is NOT looking at is refused, and moves nothing ──
  raised := false;
  begin perform public.toggle_favorito_tipo(ct_b, gym_a); exception when others then raised := true; end;
  if not raised then raise exception 'CROSS FAIL: toggling gym B''s class type against gym A did not raise'; end if;
  select favorite_class_type_id into v_fa from public.clientes where id = c_a;
  select favorite_class_type_id into v_fb from public.clientes where id = c_b;
  if v_fa is distinct from ct_a or v_fb is distinct from ct_b then
    raise exception 'CROSS FAIL: rejected toggle still moved rows (gym A %, gym B %)', v_fa, v_fb;
  end if;

  -- ── 7: a gym the caller holds no clientes row in is refused outright ──
  raised := false;
  begin perform public.toggle_favorito_tipo(ct_c, gym_c); exception when others then raised := true; end;
  if not raised then raise exception 'WIDEN FAIL: toggling in a non-member gym did not raise'; end if;

  -- ── 8: clear stays per-tenant — gym A clears, gym B keeps its favorite ──
  select favorito into v_ret from public.toggle_favorito_tipo(ct_a, gym_a);
  if v_ret is not null then raise exception 'PIN FAIL(clear a): returned % (expected NULL)', v_ret; end if;
  select favorite_class_type_id into v_fa from public.clientes where id = c_a;
  select favorite_class_type_id into v_fb from public.clientes where id = c_b;
  if v_fa is not null           then raise exception 'WRITE FAIL(clear a): gym A row holds % (expected NULL)', v_fa; end if;
  if v_fb is distinct from ct_b then raise exception 'WRITE FAIL(clear a): gym B row cleared too (holds %, expected ct_b)', v_fb; end if;

  -- the reads are still pinned after all those writes
  select * into r from public.mi_membresia(gym_a);
  if r.paquete_nombre is distinct from '8 clases' or r.anchor_monto is distinct from 700 then
    raise exception 'PIN FAIL(re-read a): gym A drifted (paquete %, monto %)', r.paquete_nombre, r.anchor_monto;
  end if;
end $$;
reset role;

-- ── the non-member gym's own member, seen RLS-free: nothing the rejected toggles did leaked here ──
do $$
declare
  c_c  uuid := current_setting('t.c_c',  true)::uuid;
  ct_c uuid := current_setting('t.ct_c', true)::uuid;
  v_f uuid;
begin
  select favorite_class_type_id into v_f from public.clientes where id = c_c;
  if v_f is distinct from ct_c then
    raise exception 'WIDEN FAIL: gym C member''s favorite is now % (expected ct_c, untouched)', v_f;
  end if;
end $$;

select 'dos gimnasios tenant pin: OK' as result;
rollback;
