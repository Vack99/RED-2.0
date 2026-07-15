-- mi_membresia() denial + parity suite — slice #61 (PRD #49 membresía; ADR-0013 member-owned class;
-- ADR-0005 atomic seam; ADR-0009-amendment definer exception).
--
-- Denial-test-FIRST (TDD): RED before 20260706210000 adds the function ("function does not exist"), GREEN
-- after. Mirrors notificaciones_toggle.sql — zero prod UUIDs, transaction-local, self-asserting (every
-- check RAISEs; a clean run returns one 'OK' row).
--
-- Vectors proved:
--   DENIAL / CONTRACT-A
--     1) anon: cannot EXECUTE mi_membresia.
--     2) member_a: direct SELECT on ventas AND asistencias still reads 0 rows (Contract-A intact — the
--        RPC did NOT re-expose raw sales/attendance history to members).
--     3) cross-member isolation (SAME gym): member_b's mi_membresia returns member_b's OWN numbers, and
--        member_a's call is unaffected — self-pin by auth.uid(), never a parameter / gym scope.
--   PARITY (== admin ficha getClienteFicha Part B, same filters)
--     4) member_a (finite plan): the RPC returns the pass-throughs + the anchor scalars of the NEWEST sale
--        (not an older one) + attendedSincePurchase computed exactly as the admin ficha does — consumio
--        rows, not soft-deleted, fecha >= the anchor gym-tz day; a before-anchor row, a consumio=false
--        row, and a soft-deleted row are all excluded.
--     5) BOUNDARY-DAY (design-gate constraint 1): the anchor sale is timestamped across gym-midnight
--        ('2026-06-15 05:30+00' = '2026-06-14 23:30' in America/Mexico_City), so anchor_dia is the gym-tz
--        day 2026-06-14 (NOT the UTC day 2026-06-15). An asistencia dated exactly on that gym-tz day is
--        COUNTED — if the RPC wrongly used the UTC date, attendedSincePurchase would be 1, not 2.
--     6) ILIMITADO NULL case: member_b has clases_restantes NULL + a vigencia='mes' sale → the RPC returns
--        clases_restantes NULL and anchor_vigencia_tipo='mes' / anchor_vigencia_dias NULL (the TS layer
--        renders ∞ and hides the gauge).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or MCP execute_sql.

begin;

do $$
declare
  gym_t     uuid := gen_random_uuid();
  member_a  uuid := gen_random_uuid();
  member_b  uuid := gen_random_uuid();
  member_c  uuid := gen_random_uuid();   -- backdate anchoring (spec §D3): created_at ≠ fecha
  c_a uuid; c_b uuid; c_c uuid;
begin
  -- One test gym, fixed America/Mexico_City (UTC-6, no DST since 2022) so the boundary-day conversion is
  -- deterministic. Both members live in THIS gym, so vector 3 proves the self-pin, not mere gym scoping.
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_t, 'mi-membresia-gym', 'Mi Membresia Gym', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', member_a, 'authenticated', 'authenticated', 'mm-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_b, 'authenticated', 'authenticated', 'mm-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_c, 'authenticated', 'authenticated', 'mm-c@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (member_a, gym_t, 'member'),
    (member_b, gym_t, 'member'),
    (member_c, gym_t, 'member');

  -- member_a: a finite 8-clases plan, 3 left, vence +20d.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Membresia A', '0000000001', 3, current_date + 20, '8 clases', gym_t, member_a)
    returning id into c_a;
  -- member_b: an ilimitado plan (clases_restantes NULL), vence +25d.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Membresia B', '0000000002', null, current_date + 25, 'Ilimitado', gym_t, member_b)
    returning id into c_b;
  -- member_c: a finite plan for the backdate-anchoring vector (a later-WRITTEN backdated sale must
  -- win the anchor over an earlier-written sale with a LATER fecha — spec §D3/C1/C2).
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Membresia C', '0000000003', 4, current_date + 20, '4 clases', gym_t, member_c)
    returning id into c_c;

  -- member_a sales: an OLDER sale (monto 700) then the ANCHOR (newest, monto 800) timestamped across
  -- gym-midnight — anchor gym-tz day = 2026-06-14. created_at is set EXPLICITLY (= fecha here, a
  -- non-backdated pair) because the anchor is now `order by created_at desc, id desc` (§D3): without
  -- an explicit created_at both rows share now() and the id tiebreaker would pick nondeterministically.
  -- folio is per-gym now (no sequence default) — explicit distinct values for the fresh test gym.
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at) values
    (gym_t, c_a, 9001, '8 clases', 8, 'dias', 30, 700, 'efectivo', '2026-05-01 12:00:00+00', '2026-05-01 12:00:00+00'),
    (gym_t, c_a, 9002, '8 clases', 8, 'dias', 30, 800, 'efectivo', '2026-06-15 05:30:00+00', '2026-06-15 05:30:00+00');

  -- member_c sales: sale A written 06-15 (fecha 06-15), then a BACKDATED sale B written LATER (06-20)
  -- for a forgotten payment, with an EARLIER fecha (06-01). Under created_at-desc anchoring, B wins
  -- (monto 900) even though A's fecha is later — the OLD fecha-desc logic would wrongly anchor on A (800).
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at) values
    (gym_t, c_c, 9101, '4 clases', 4, 'dias', 30, 800, 'efectivo', '2026-06-15 12:00:00+00', '2026-06-15 12:00:00+00'),
    (gym_t, c_c, 9102, '4 clases', 4, 'dias', 30, 900, 'efectivo', '2026-06-01 12:00:00+00', '2026-06-20 12:00:00+00');
  -- member_c attendances: 06-05 (between B.fecha and B.created_at) already spent the prior balance live,
  -- so it must be EXCLUDED (< the created_at count day 2026-06-20); 06-25 (after the write) is COUNTED.
  -- Expected attendedSincePurchase = 1. The OLD fecha-anchored logic (>= 2026-06-01) would yield 2.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, deleted_at) values
    (gym_t, c_c, '2026-06-05', true, null),
    (gym_t, c_c, '2026-06-25', true, null);

  -- member_a attendances: boundary-day (gym-tz anchor day) + after = COUNTED; before / consumio=false /
  -- soft-deleted = EXCLUDED. Expected attendedSincePurchase = 2.
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, deleted_at) values
    (gym_t, c_a, '2026-06-14', true,  null),      -- boundary day (gym tz) → COUNTED
    (gym_t, c_a, '2026-06-20', true,  null),      -- after anchor → COUNTED
    (gym_t, c_a, '2026-06-13', true,  null),      -- before anchor day → excluded
    (gym_t, c_a, '2026-06-18', false, null),      -- did not consume → excluded
    (gym_t, c_a, '2026-06-19', true,  now());     -- soft-deleted → excluded

  -- member_b sale: ilimitado / vigencia 'mes', monto 1400. created_at set = fecha (non-backdated) so
  -- the count boundary (now created_at-based, §D3/C2) lands on 2026-06-10, not the test-txn now().
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at) values
    (gym_t, c_b, 9003, 'Ilimitado', null, 'mes', null, 1400, 'transferencia', '2026-06-10 12:00:00+00', '2026-06-10 12:00:00+00');
  insert into public.asistencias (gym_id, cliente_id, fecha, consumio, deleted_at) values
    (gym_t, c_b, '2026-06-12', true, null);

  perform set_config('t.member_a', member_a::text, true);
  perform set_config('t.member_b', member_b::text, true);
  perform set_config('t.member_c', member_c::text, true);
  perform set_config('t.c_a',      c_a::text,      true);
  perform set_config('t.c_b',      c_b::text,      true);
  perform set_config('t.c_c',      c_c::text,      true);
end $$;

-- ── anon: cannot execute the RPC ──
set local role anon;
do $$
declare raised boolean := false;
begin
  begin perform public.mi_membresia(); exception when others then raised := true; end;
  if not raised then raise exception 'ANON DENIAL FAIL: anon executed mi_membresia'; end if;
end $$;
reset role;

-- ── member_a: Contract-A intact (0 raw rows) + the RPC's parity numbers ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  c_a uuid := current_setting('t.c_a', true)::uuid;
  n_ventas int; n_asist int; r record;
begin
  -- Contract-A: a member reads NO raw ventas / asistencias rows (staff-only policies; RLS default-deny).
  select count(*) into n_ventas from public.ventas      where cliente_id = c_a;
  if n_ventas <> 0 then raise exception 'CONTRACT-A FAIL: member_a read % ventas rows directly', n_ventas; end if;
  select count(*) into n_asist  from public.asistencias where cliente_id = c_a;
  if n_asist  <> 0 then raise exception 'CONTRACT-A FAIL: member_a read % asistencias rows directly', n_asist; end if;

  -- The RPC returns the caller's own scalars.
  select * into r from public.mi_membresia();
  if r.paquete_nombre is distinct from '8 clases' then raise exception 'PARITY FAIL: paquete_nombre % (expected 8 clases)', r.paquete_nombre; end if;
  if r.clases_restantes is distinct from 3        then raise exception 'PARITY FAIL: clases_restantes % (expected 3)', r.clases_restantes; end if;
  if r.vence is distinct from (current_date + 20) then raise exception 'PARITY FAIL: vence % (expected +20d)', r.vence; end if;
  -- Anchor = the NEWEST sale (800), not the older 700.
  if r.anchor_monto is distinct from 800          then raise exception 'PARITY FAIL: anchor_monto % (expected 800 — newest sale)', r.anchor_monto; end if;
  if r.anchor_vigencia_tipo is distinct from 'dias' then raise exception 'PARITY FAIL: anchor_vigencia_tipo % (expected dias)', r.anchor_vigencia_tipo; end if;
  if r.anchor_vigencia_dias is distinct from 30   then raise exception 'PARITY FAIL: anchor_vigencia_dias % (expected 30)', r.anchor_vigencia_dias; end if;
  -- BOUNDARY: anchor_dia is the gym-tz day 2026-06-14, NOT the UTC day 2026-06-15.
  if r.anchor_dia is distinct from date '2026-06-14' then raise exception 'BOUNDARY FAIL: anchor_dia % (expected 2026-06-14 gym-tz, not 2026-06-15 UTC)', r.anchor_dia; end if;
  -- attendedSincePurchase = 2 (boundary-day + after; before / not-consumed / soft-deleted excluded). A
  -- UTC-date bug would drop the boundary-day row and yield 1.
  if r.attended_since_purchase is distinct from 2 then raise exception 'PARITY FAIL: attended_since_purchase % (expected 2)', r.attended_since_purchase; end if;
end $$;
reset role;

-- ── member_b: ilimitado NULL case + cross-member self-pin ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.mi_membresia();
  -- member_b reads member_b's OWN numbers (NOT member_a's), proving the auth.uid() self-pin.
  if r.paquete_nombre is distinct from 'Ilimitado' then raise exception 'CROSS-MEMBER FAIL: member_b got paquete_nombre % (expected Ilimitado)', r.paquete_nombre; end if;
  if r.clases_restantes is not null                then raise exception 'ILIMITADO FAIL: clases_restantes % (expected NULL)', r.clases_restantes; end if;
  if r.anchor_monto is distinct from 1400          then raise exception 'CROSS-MEMBER FAIL: anchor_monto % (expected 1400)', r.anchor_monto; end if;
  if r.anchor_vigencia_tipo is distinct from 'mes' then raise exception 'ILIMITADO FAIL: anchor_vigencia_tipo % (expected mes)', r.anchor_vigencia_tipo; end if;
  if r.anchor_vigencia_dias is not null            then raise exception 'ILIMITADO FAIL: anchor_vigencia_dias % (expected NULL)', r.anchor_vigencia_dias; end if;
  if r.attended_since_purchase is distinct from 1  then raise exception 'PARITY FAIL(b): attended_since_purchase % (expected 1)', r.attended_since_purchase; end if;
end $$;
reset role;

-- ── member_c: backdate anchoring (§D3) — created_at wins the anchor + bounds the count ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_c', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.mi_membresia();
  -- Anchor = the LAST-WRITTEN sale (created_at 06-20, monto 900), NOT the one with the latest fecha
  -- (06-15, monto 800). A fecha-desc anchor would return 800 — this is the §D3/C1 regression guard.
  if r.anchor_monto is distinct from 900 then
    raise exception 'BACKDATE ANCHOR FAIL: anchor_monto % (expected 900 — the later-WRITTEN backdated sale, not the later-fecha 800)', r.anchor_monto;
  end if;
  -- anchor_dia is the "happened"/effective day = the anchor sale's FECHA (06-01), not its write day.
  if r.anchor_dia is distinct from date '2026-06-01' then
    raise exception 'BACKDATE ANCHOR FAIL: anchor_dia % (expected 2026-06-01, the backdated fecha)', r.anchor_dia;
  end if;
  -- Count bounded by created_at (06-20), NOT fecha (06-01): the 06-05 gap visit already spent the prior
  -- balance live and is EXCLUDED; only 06-25 counts. A fecha-anchored count (>= 06-01) would yield 2.
  if r.attended_since_purchase is distinct from 1 then
    raise exception 'BACKDATE COUNT FAIL: attended_since_purchase % (expected 1 — counted since created_at 06-20, not fecha 06-01)', r.attended_since_purchase;
  end if;
end $$;
reset role;

-- ── member_a again: unaffected by member_b's call (self-pin, re-read stable) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.mi_membresia();
  if r.clases_restantes is distinct from 3 or r.anchor_monto is distinct from 800 then
    raise exception 'CROSS-MEMBER FAIL: member_a numbers drifted after member_b call (clases %, monto %)', r.clases_restantes, r.anchor_monto;
  end if;
end $$;
reset role;

select 'mi_membresia rules: OK' as result;
rollback;
