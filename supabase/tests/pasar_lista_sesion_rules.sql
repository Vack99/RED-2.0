-- pasar_lista_sesion money-path rules (slice #60; ADR-0010 §4/§5 consume rules; ADR-0005 atomic seam).
--
-- The reservation-aware admin Pasar lista. The no-double-consume loop closes here: a class consumed at
-- booking (reservar_clase, #57) must NOT be consumed again when the operator marks the member present.
-- A walk-in (no prior reservation) consumes at the door exactly as toggle_pase does today. Untoggle
-- reverses each path symmetrically. These rules are transaction-inseparable (ADR-0005) so they live ONLY
-- in the RPC — this is their committed test home, run against the REAL deployed function on a scratch
-- project in a rolled-back transaction:
--   * book -> pasar lista = ONE consume (finite)  — after reservar_clase (5->4) the pase leaves balance 4
--                                                   (no second decrement), reservation reservada->asistida,
--                                                   asistencia row consumio=false + reservation_id/session set.
--   * ilimitado booked                            — pase writes attendance, balance stays NULL.
--   * booked untoggle is symmetric                — reverts asistida->reservada and refunds NOTHING (the
--                                                   pase consumed nothing; the booking consume is #58's cancel).
--   * walk-in parity                              — a finite member with NO reservation: pase creates an
--                                                   is_walk_in/asistida reservation AND consumes exactly one
--                                                   (5->4), asistencia consumio=true, hora = the session's own
--                                                   start time (18:00 gym-local, not the tap's hour).
--   * walk-in untoggle is symmetric               — reverts reservation to cancelada and refunds exactly one (finite).
--   * hora comes from the SESSION (#166/#245)     — 20260804150000: the visit stamp is the class's OWN start
--                                                   time in the gym's timezone, the exact pair of `fecha`,
--                                                   which has always been the session's own gym-local date.
--                                                   It replaces the old "now() if the session is today, else
--                                                   NULL" rule, which recorded the data-entry hour (or, past
--                                                   midnight, no hour at all) whenever a roster was marked
--                                                   late. Vector (11) is the late-marking proof.
--   * #237 zero-balance gate (owner ruling         — the walk-in arm HARD-REFUSES a finite member at 0 classes:
--     2026-08-04, 20260804120000)                    'Sin clases disponibles', the SAME message reservar_clase
--                                                   raises on the member path. No staff override, no
--                                                   warn-and-proceed; nothing is written. The gate sits in the
--                                                   ELSE of the cooldown if/else (restructured vs
--                                                   20260729120000 so the pardon decides FIRST): a 0-balance
--                                                   member INSIDE a cooldown pardon is still admitted — that
--                                                   visit's sibling row already paid — proved by the vector
--                                                   right after it.
--   * cooldown, clase → libre (#89)               — a member marked in an Agenda class (consume 5->4) is then tapped
--                                                   at the FRONT DESK minutes later. No refusal any more: a SECOND
--                                                   row is written — a real ACCESO LIBRE visit, origen='libre' —
--                                                   with consumio=false, balance still 4, and the session row +
--                                                   reservation untouched. Desk undo refunds nothing.
--   * cooldown, libre → clase (#89)               — the reverse: a member checked in at the front desk (5->4) is then
--                                                   marked present in an Agenda class. The walk-in branch writes the
--                                                   attendance row (origen='clase') + walk-in reservation with
--                                                   consumio=false — present, NO second consume; untoggle refunds nothing.
--   * BEYOND the cooldown, libre → clase (#89)    — the same pair, but the front-desk row is backdated 20 minutes:
--                                                   the class mark CONSUMES (4->3, consumio=true). The cooldown is a
--                                                   15-minute window, not a per-day pardon.
--   * two DIFFERENT classes, same minute (#89)    — ruling R1, the market's unanimous rule: a recent CLASS row never
--                                                   pardons another class. Both marks consume (5->3), both rows
--                                                   origen='clase' consumio=true.
--   * the ORPHANED PARDON (#89, accepted edge)    — pinning behaviour we chose, not behaviour we want back: when the
--                                                   PARDONING class mark is undone, the pardoned libre row stays
--                                                   active and unpaid (consumio=false, perdonada=true). The cooldown
--                                                   is deliberately one-directional — pairing heuristics were withdrawn
--                                                   by the owner — so this vector exists to make a future "fix" a
--                                                   conscious change rather than an accident, and to prove the
--                                                   operator's recovery path (untoggle + retoggle re-charges it, and
--                                                   the re-charged row is NOT stamped perdonada).
--   * perdonada is the COOLDOWN's stamp (#169)    — 2026-07-29: every pardoned row — and ONLY a pardoned row — carries
--                                                   perdonada=true, so a count of VISITS can skip the second record of
--                                                   one arrival without skipping a real second visit. Asserted on both
--                                                   directions of the cooldown (vectors 4 and 5), on its absence for
--                                                   the paying rows (3, 6, 7), for the booked branch (1) — free
--                                                   because the booking paid, which is a different fact — and on the
--                                                   re-charged recovery row (8).
--   * resultado, the settlement outcome (#245)    — 2026-08-04: the return also carries the discriminator the
--                                                   desk shows the operator — 'reserva' when an existing
--                                                   booking's HOLD was CAPTURED (the booked branch),
--                                                   'descontada' when the finite decrement actually ran,
--                                                   'gratis' for ilimitado or a pardoned free admission, and
--                                                   NULL on every un-mark. Asserted per branch ALONGSIDE the
--                                                   written rows — a discriminator that disagrees with the
--                                                   ledger is worse than no discriminator.
--   * ilimitado order symmetry (12, #245 §3)      — 2026-08-04: the cooldown's key became "was the recent row
--                                                   itself pardoned?", never "did it charge". An ilimitado
--                                                   member's rows are always consumio=false, so a
--                                                   consumio-keyed predicate would silently stop pardoning
--                                                   them — no money lost, but `perdonada` unstamped and every
--                                                   dual-surface unlimited member counted twice a day. Both
--                                                   recording orders, balances NULL throughout, exactly one
--                                                   stamped row each.
--   * late marking is SESSION-scoped (11, #166)   — the operator marks yesterday's 07:00 roster today: the
--                                                   visit stamps 07:00 on yesterday's date (not now()), and
--                                                   the vigencia gate is judged on the CLASS's day, so a
--                                                   package that was valid then and has lapsed since still
--                                                   admits the member for the class they actually attended.
--   * walk-in ON A CANCELLED BOOKING (14, slice 2 §D6)  — a member books (the hold sets
--                                                   reservation.consumio=true), cancels (cancelar_reserva
--                                                   refunds by READING that flag and leaves it set), and is
--                                                   then marked present at the door. The walk-in arm reuses
--                                                   that terminal row and must CLEAR the flag, because the
--                                                   charge for this visit is the asistencia it inserts.
--                                                   Asserted on the WRITTEN row and on which LEG of the
--                                                   derived count (spec D0) carries the charge: the
--                                                   asistencia leg, dated the CLASS, not the reservation
--                                                   leg, dated a booking the member cancelled. The same
--                                                   block replays the migration's backfill over a
--                                                   hand-restored stale row — it flips, and the HONEST
--                                                   booked→captured pair beside it does not.
--   * the return carries session_id + saldo (#162) — 2026-07-29: the RPC's shape grew from (present, hora) to
--                                                   (present, hora, session_id, clases_restantes) so the front desk can
--                                                   say WHERE a mark landed and repaint the member's balance instead of
--                                                   showing one frozen at page load. session_id is always this seam's
--                                                   own p_session_id; clases_restantes is read back from the cliente
--                                                   AFTER the write, and is asserted against the stored row — the
--                                                   return value is never the contract, it just has to agree with it.
--
-- FROZEN CLOCK, and why the sessions are BOOKED BEFORE THEY ARE MOVED: the suite runs in ONE transaction, so
-- now() and every created_at default are the same instant — that is what puts the cooldown pairs inside the
-- 15-minute window by construction, and backdating (vector 6) is the only way to observe the far side. The
-- sessions are therefore created TWO DAYS OUT, booked, and only then moved onto today's 18:00/19:00: since
-- #165 reservar_clase refuses a class that has already started, seeding them at today 18:00 would have made
-- every run after 18:00 gym-local fail at the seed.
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK, so
-- it touches no row permanently. Zero hardcoded prod UUIDs (gym members/operator/clientes seeded tx-local).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into the
-- SUITE — or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  v_gym    uuid;
  v_tz     text;
  v_today  date;
  v_ct      uuid;
  v_starts  timestamptz;
  v_starts2 timestamptz;
  op       uuid := gen_random_uuid();   -- the operator (staff)
  m_bkfin  uuid := gen_random_uuid();   -- booked finite member
  m_bkilim uuid := gen_random_uuid();   -- booked ilimitado member
  m_walk   uuid := gen_random_uuid();   -- walk-in finite member (never books)
  m_fd     uuid := gen_random_uuid();   -- front-desk-then-Agenda member (cooldown, libre → clase)
  c_bkfin  uuid; c_bkilim uuid; c_walk uuid; c_fd uuid;
  c_beyond uuid;                        -- front-desk row backdated past the window (vector 6)
  c_dos    uuid;                        -- two different classes in one day (vector 7)
  c_orph   uuid;                        -- the pardoning class mark is undone (vector 8)
  c_zero   uuid;                        -- #237: 0-balance walk-in, no pardon in play (vector 9)
  c_zeropard uuid;                      -- #237: 0-balance walk-in INSIDE a cooldown pardon (vector 10)
  c_last   uuid;                        -- the LAST class: the guarded decrement's boundary (vector 13)
  c_late   uuid;                        -- #166: marked late — the stamp must be the session's (vector 11a)
  c_latevig uuid;                       -- #166: valid on the CLASS's day, lapsed since (vector 11b)
  c_ilimA  uuid;                        -- #245 §3: ilimitado, CLASS then DOOR (vector 12a)
  c_ilimB  uuid;                        -- #245 §3: ilimitado, DOOR then CLASS (vector 12b)
  m_recy   uuid := gen_random_uuid();   -- §D6: books, cancels, then is marked present as a WALK-IN
  m_honest uuid := gen_random_uuid();   -- §D6 control: books and is CAPTURED — the honest pair
  c_recy   uuid; c_honest uuid;
  s_id     uuid; s2_id uuid;
  s3_id    uuid;                        -- §D6: its own instant, so the two §D6 members share one class
  v_starts3 timestamptz;
  s_late   uuid;                        -- #166: YESTERDAY 07:00 gym-local, marked today
  v_late   timestamptz;
begin
  select id, timezone into v_gym, v_tz from public.gym where slug = 'forge';
  if v_gym is null then raise exception 'SEED FAIL: expected the forge gym'; end if;
  -- A SUITE OWNS ITS FIXTURE STATE. 20260826120100 set forge's `booking_enabled` to false (the
  -- class-only containment switch), and the BOOKED half of this suite has to create real bookings
  -- through reservar_clase before a roster mark can capture them — so the setup would die on a
  -- product decision unrelated to the attendance rules under test. Re-enabled explicitly,
  -- transaction-local: one BEGIN/ROLLBACK, so the live flag is untouched.
  update public.gym set booking_enabled = true where id = v_gym;
  v_today := (now() at time zone v_tz)::date;
  -- Where the two sessions END UP: today at 18:00 and 19:00 gym-local, so hora stamps and vector (7)'s
  -- R1 proof has two distinct class instances on one day. They are INSERTED two days out and moved
  -- there by the privileged block below, after the bookings — reservar_clase now refuses a class that
  -- has already started (#165), and today 18:00 is in the past for every run after 18:00.
  v_starts := (v_today::timestamp + interval '18 hours') at time zone v_tz;
  v_starts2 := (v_today::timestamp + interval '19 hours') at time zone v_tz;
  -- §D6's own class, today 20:00 gym-local — its own instant (one uncancelled class per instant per gym
  -- since 20260823120100), and moved onto today by the same privileged block for the same #165 reason.
  v_starts3 := (v_today::timestamp + interval '20 hours') at time zone v_tz;

  -- auth users: one operator + the members that book or are looked up as members
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op,       'authenticated', 'authenticated', 'pl-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_bkfin,  'authenticated', 'authenticated', 'pl-bkfin@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_bkilim, 'authenticated', 'authenticated', 'pl-bkilim@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_walk,   'authenticated', 'authenticated', 'pl-walk@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_fd,     'authenticated', 'authenticated', 'pl-fd@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_recy,   'authenticated', 'authenticated', 'pl-recy@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_honest, 'authenticated', 'authenticated', 'pl-honest@test.local');

  -- the operator is STAFF of forge; the rest are members
  insert into public.gym_membership (user_id, gym_id, role) values
    (op, v_gym, 'operator'),
    (m_bkfin, v_gym, 'member'), (m_bkilim, v_gym, 'member'), (m_walk, v_gym, 'member'), (m_fd, v_gym, 'member'),
    (m_recy, v_gym, 'member'), (m_honest, v_gym, 'member');

  -- one cliente per acting member (auth_user_id links them so reservar_clase resolves them)
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL booked finite', '0000000001', 5, v_today + 20, '8 clases', v_gym, m_bkfin) returning id into c_bkfin;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL booked ilim', '0000000002', null, v_today + 20, 'Ilimitado', v_gym, m_bkilim) returning id into c_bkilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL walk-in', '0000000003', 5, v_today + 20, '8 clases', v_gym, m_walk) returning id into c_walk;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL front-desk', '0000000004', 5, v_today + 20, '8 clases', v_gym, m_fd) returning id into c_fd;
  -- The two #89 members never book, so they need no auth user — the operator marks them.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL beyond window', '0000000005', 5, v_today + 20, '8 clases', v_gym) returning id into c_beyond;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL dos clases', '0000000006', 5, v_today + 20, '8 clases', v_gym) returning id into c_dos;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL pardon huerfano', '0000000007', 5, v_today + 20, '8 clases', v_gym) returning id into c_orph;
  -- #237 (owner ruling 2026-08-04): c_zero never has any prior row, so its walk-in class mark meets no
  -- cooldown pardon and must be refused outright. c_zeropard starts at 1 — the desk charges it to 0
  -- first, and its class mark minutes later must still be admitted (pardoned), because that visit's
  -- sibling row already paid.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL cero balance', '0000000008', 0, v_today + 20, '8 clases', v_gym) returning id into c_zero;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL cero perdon', '0000000009', 1, v_today + 20, '8 clases', v_gym) returning id into c_zeropard;
  -- (v13, 2026-08-26) THE LAST CLASS. 20260826120000 made the guarded decrement read its own result
  -- (`if not found then raise 'Sin clases disponibles'`), and 1 -> 0 is the boundary that guard must
  -- NOT misfire on: the update matches exactly one row and the member is admitted, charged, and left
  -- at 0. The refusal side of the same gate is vector 9 above, which already proves a 0-balance
  -- walk-in raises and writes nothing.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL ultima clase', '0000000014', 1, v_today + 20, '8 clases', v_gym) returning id into c_last;
  -- #166 (vector 11). c_late's package is comfortably valid; c_latevig's `vence` is YESTERDAY — the
  -- session's own day — so it was valid when the class ran and has lapsed by the time it is marked.
  -- That pair is the whole point: one proves the STAMP is the session's instant, the other proves the
  -- VIGENCIA question is asked about the session's day.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL marcada tarde', '0000000010', 5, v_today + 20, '8 clases', v_gym) returning id into c_late;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL vigente ese dia', '0000000011', 5, v_today - 1, '8 clases', v_gym) returning id into c_latevig;
  -- #245 §3 (vector 12): two ILIMITADO members, one per recording order. They owe nothing on any path,
  -- so the money is trivially symmetric — the thing that must stay symmetric is the `perdonada` STAMP,
  -- which is what stops one arrival counting as two visits for a member who never pays a credit.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL ilimitado clase-puerta', '0000000012', null, v_today + 20, 'Ilimitado', v_gym) returning id into c_ilimA;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('PL ilimitado puerta-clase', '0000000013', null, v_today + 20, 'Ilimitado', v_gym) returning id into c_ilimB;
  -- §D6 (vector 14). Both book for themselves, so both need their auth user linked. c_recy cancels and
  -- is then walked in; c_honest books and is captured, and exists so the backfill's precision is proved
  -- against a REAL booked-then-captured pair rather than asserted about one.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL reciclada', '0000000015', 5, v_today + 20, '8 clases', v_gym, m_recy) returning id into c_recy;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('PL par honesto', '0000000016', 5, v_today + 20, '8 clases', v_gym, m_honest) returning id into c_honest;

  insert into public.class_type (gym_id, name) values (v_gym, 'PL Metcon') returning id into v_ct;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, now() + interval '2 days', 60, 20) returning id into s_id;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, now() + interval '2 days' + interval '1 hour', 60, 20) returning id into s2_id;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, now() + interval '2 days' + interval '2 hours', 60, 20) returning id into s3_id;
  -- The late-marked session: YESTERDAY at 07:00 gym-local. Nobody books it (a started class refuses
  -- booking since #165 anyway), so unlike s_id/s2_id it is seeded straight onto its final instant.
  -- 07:00 is deliberately far from any plausible run time, so "the stamp is the session's hour" cannot
  -- pass by coincidence with now().
  v_late := ((v_today - 1)::timestamp + interval '7 hours') at time zone v_tz;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_late, 60, 20) returning id into s_late;

  perform set_config('t.starts',   v_starts::text,  true);
  perform set_config('t.starts2',  v_starts2::text, true);
  perform set_config('t.gym',      v_gym::text,     true);
  perform set_config('t.today',    v_today::text,   true);
  perform set_config('t.op',       op::text,        true);
  perform set_config('t.m_bkfin',  m_bkfin::text,   true);
  perform set_config('t.m_bkilim', m_bkilim::text,  true);
  perform set_config('t.c_bkfin',  c_bkfin::text,   true);
  perform set_config('t.c_bkilim', c_bkilim::text,  true);
  perform set_config('t.c_walk',   c_walk::text,    true);
  perform set_config('t.c_fd',     c_fd::text,      true);
  perform set_config('t.c_beyond', c_beyond::text,  true);
  perform set_config('t.c_dos',    c_dos::text,     true);
  perform set_config('t.c_orph',   c_orph::text,    true);
  perform set_config('t.c_zero',     c_zero::text,     true);
  perform set_config('t.c_zeropard', c_zeropard::text, true);
  perform set_config('t.c_last',     c_last::text,     true);
  perform set_config('t.c_late',     c_late::text,     true);
  perform set_config('t.c_latevig',  c_latevig::text,  true);
  perform set_config('t.c_ilimA',    c_ilimA::text,    true);
  perform set_config('t.c_ilimB',    c_ilimB::text,    true);
  perform set_config('t.m_recy',   m_recy::text,    true);
  perform set_config('t.m_honest', m_honest::text,  true);
  perform set_config('t.c_recy',   c_recy::text,    true);
  perform set_config('t.c_honest', c_honest::text,  true);
  perform set_config('t.s_id',     s_id::text,      true);
  perform set_config('t.s2_id',    s2_id::text,     true);
  perform set_config('t.s3_id',    s3_id::text,     true);
  perform set_config('t.starts3',  v_starts3::text, true);
  perform set_config('t.s_late',   s_late::text,    true);
  perform set_config('t.f_late',   ((v_late at time zone v_tz)::date)::text, true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- The two booked members book ahead (as themselves) — reservar_clase consumes ONCE.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_bkfin', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare s_id uuid := current_setting('t.s_id', true)::uuid; v_clases int;
begin
  perform public.reservar_clase(s_id);
  select clases_restantes into v_clases from public.clientes where id = current_setting('t.c_bkfin', true)::uuid;
  if v_clases <> 4 then raise exception 'SEED FAIL(bkfin book): expected 4 after booking, got %', v_clases; end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_bkilim', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare s_id uuid := current_setting('t.s_id', true)::uuid;
begin
  perform public.reservar_clase(s_id);
end $$;
reset role;

-- ── §D6 arrange: the RECYCLED row — book, then CANCEL through the real RPC ──────────────────────
-- cancelar_reserva is used deliberately instead of a privileged flip: the premise of vector 14 is that
-- the refund path READS `consumio` and leaves it set, so the fixture has to be the actual function that
-- does it. Both steps run while s3 is still two days out (#165/#58 both refuse a started class).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_recy', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s3_id  uuid := current_setting('t.s3_id', true)::uuid;
  c_recy uuid := current_setting('t.c_recy', true)::uuid;
  v_clases int; v_consumio boolean; v_status text;
begin
  perform public.reservar_clase(s3_id);
  select clases_restantes into v_clases from public.clientes where id = c_recy;
  if v_clases <> 4 then raise exception 'SEED FAIL(recy book): expected 4 after the hold, got %', v_clases; end if;

  perform public.cancelar_reserva(s3_id);
  select clases_restantes into v_clases from public.clientes where id = c_recy;
  if v_clases <> 5 then raise exception 'SEED FAIL(recy cancel): expected the hold refunded to 5, got %', v_clases; end if;
  select status, consumio into v_status, v_consumio
    from public.reservation where member_id = c_recy and class_session_id = s3_id;
  if v_status is distinct from 'cancelada' then raise exception 'SEED FAIL(recy cancel): status % (expected cancelada)', v_status; end if;
  -- THE PREMISE of vector 14, asserted rather than assumed: the refund read this flag and left it set,
  -- so the row now claims a charge that was given back.
  if v_consumio is distinct from true then
    raise exception 'SEED FAIL(recy cancel): consumio % — cancelar_reserva now clears the flag, so vector 14 no longer tests anything', v_consumio;
  end if;
end $$;
reset role;

-- ── §D6 arrange: the HONEST pair — book and leave it held (captured by the operator in vector 14) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_honest', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s3_id    uuid := current_setting('t.s3_id', true)::uuid;
  c_honest uuid := current_setting('t.c_honest', true)::uuid;
  v_clases int;
begin
  perform public.reservar_clase(s3_id);
  select clases_restantes into v_clases from public.clientes where id = c_honest;
  if v_clases <> 4 then raise exception 'SEED FAIL(honest book): expected 4 after the hold, got %', v_clases; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- MOVE THE SESSIONS ONTO TODAY (privileged — no RPC can change a class's start, and a member holds no
-- class_session write). Every booking above is already in, which is the mandatory order since #165: a class
-- that has started cannot be booked, and today's 18:00 has already started on any afternoon run. The
-- instants are exactly the ones this suite has always used, so every vector below reads as it always did.
-- ════════════════════════════════════════════════════════════════════════════════
update public.class_session set starts_at = current_setting('t.starts', true)::timestamptz
 where id = current_setting('t.s_id', true)::uuid;
update public.class_session set starts_at = current_setting('t.starts2', true)::timestamptz
 where id = current_setting('t.s2_id', true)::uuid;
update public.class_session set starts_at = current_setting('t.starts3', true)::timestamptz
 where id = current_setting('t.s3_id', true)::uuid;

-- ════════════════════════════════════════════════════════════════════════════════
-- Everything below runs AS THE OPERATOR (staff) — the Pasar lista caller.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

-- ── (1) book -> pasar lista = ONE consume (finite) + booked untoggle symmetry ────
do $$
declare
  s_id    uuid := current_setting('t.s_id', true)::uuid;
  c_bkfin uuid := current_setting('t.c_bkfin', true)::uuid;
  v_present boolean; v_hora text; v_clases int; v_status text; v_walk boolean;
  v_consumio boolean; v_res_id uuid; v_sess uuid; v_perdonada boolean; v_ret_sess uuid; v_saldo int;
  v_checked timestamptz; v_gym_id uuid; v_fecha date; v_stored_hora time; v_resultado text;
begin
  -- pasar lista ON: booked member marked present, NO second consume (balance stays 4)
  select present, hora, session_id, clases_restantes, resultado into v_present, v_hora, v_ret_sess, v_saldo, v_resultado
    from public.pasar_lista_sesion(s_id, c_bkfin);
  if v_present is not true then raise exception 'RULE FAIL(bkfin ON): not present'; end if;
  -- #245: this mark CAPTURED the hold reservar_clase took. 'reserva' is the only value that lets the
  -- operator answer "¿me van a cobrar?" correctly — 'gratis' would be true about the money and false
  -- about the fact, and 'descontada' would be a lie.
  if v_resultado is distinct from 'reserva' then raise exception 'RULE FAIL(bkfin ON): resultado % (expected reserva — a hold was captured)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_bkfin;
  if v_clases <> 4 then raise exception 'RULE FAIL(bkfin ON): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;
  -- #162: the return names the class it wrote into and carries the balance AFTER the write — asserted
  -- against the STORED cliente row, because a return value that disagrees with the ledger is the bug.
  if v_ret_sess is distinct from s_id then raise exception 'RULE FAIL(bkfin ON): returned session_id % (expected %)', v_ret_sess, s_id; end if;
  if v_saldo is distinct from v_clases then raise exception 'RULE FAIL(bkfin ON): returned clases_restantes % but the row holds %', v_saldo, v_clases; end if;
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_bkfin and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(bkfin ON): reservation status % (expected asistida)', v_status; end if;
  -- checked_at is stamped on every asistida flip and cleared on every revert — a genuine state-transition
  -- column the suite proved only via `status` before #80 AC4.
  if v_checked is null then raise exception 'RULE FAIL(bkfin ON): reservation.checked_at not stamped'; end if;
  -- the attendance row: consumio=false (already consumed at booking) + linked to session + reservation
  select consumio, reservation_id, class_session_id, gym_id, fecha, hora, perdonada
    into v_consumio, v_res_id, v_sess, v_gym_id, v_fecha, v_stored_hora, v_perdonada
    from public.asistencias where cliente_id = c_bkfin and class_session_id = s_id and deleted_at is null
    order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(bkfin ON): asistencia.consumio % (expected false)', v_consumio; end if;
  -- FREE is not the same as DUPLICATED (#169): the booked branch charges nothing because the booking
  -- already paid, which is one visit and must count. Only the cooldown stamps perdonada.
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(bkfin ON): asistencia.perdonada % (expected false — a booked mark is one visit, not a pardoned duplicate)', v_perdonada; end if;
  if v_res_id is null then raise exception 'RULE FAIL(bkfin ON): asistencia.reservation_id null (expected linked)'; end if;
  if v_sess is distinct from s_id then raise exception 'RULE FAIL(bkfin ON): asistencia.class_session_id mismatch'; end if;
  -- #166/#245: the stamp is the SESSION's own start time in the gym's timezone — this suite seeds it at
  -- 18:00 gym-local — never now(). Asserted as the exact value, because "not null" would still pass if
  -- the RPC reverted to stamping the data-entry hour.
  if v_hora is distinct from '18:00' then raise exception 'RULE FAIL(bkfin ON): returned hora % (expected the session''s own 18:00)', v_hora; end if;
  -- …and the STORED row, not just the RPC's return: hora/gym_id/fecha were written and never read back.
  if v_stored_hora is distinct from '18:00:00'::time then raise exception 'RULE FAIL(bkfin ON): stored asistencia.hora % (expected the session''s own 18:00)', v_stored_hora; end if;
  if v_gym_id is distinct from current_setting('t.gym', true)::uuid then raise exception 'RULE FAIL(bkfin ON): asistencia.gym_id % not the session gym', v_gym_id; end if;
  if v_fecha is distinct from current_setting('t.today', true)::date then raise exception 'RULE FAIL(bkfin ON): asistencia.fecha % (expected today in the gym tz)', v_fecha; end if;

  -- pasar lista OFF (untoggle): reservation reverts to reservada, balance UNCHANGED (no refund — the
  -- pase consumed nothing; the booking consume stays until a #58 cancel).
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_id, c_bkfin);
  if v_present is not false then raise exception 'RULE FAIL(bkfin OFF): still present'; end if;
  -- #245: an un-mark settles nothing, so it discloses nothing.
  if v_resultado is not null then raise exception 'RULE FAIL(bkfin OFF): resultado % (expected NULL on an un-mark)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_bkfin;
  if v_clases <> 4 then raise exception 'RULE FAIL(bkfin OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_bkfin and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(bkfin OFF): reservation status % (expected reservada)', v_status; end if;
  if v_checked is not null then raise exception 'RULE FAIL(bkfin OFF): checked_at not cleared on revert (%)', v_checked; end if;
  select count(*) into v_clases from public.asistencias where cliente_id = c_bkfin and class_session_id = s_id and deleted_at is null;
  if v_clases <> 0 then raise exception 'RULE FAIL(bkfin OFF): active asistencia rows % (expected 0)', v_clases; end if;
end $$;

-- ── (2) ilimitado booked: pase writes attendance, balance stays NULL ─────────────
do $$
declare
  s_id     uuid := current_setting('t.s_id', true)::uuid;
  c_bkilim uuid := current_setting('t.c_bkilim', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_resultado text;
begin
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_id, c_bkilim);
  if v_present is not true then raise exception 'RULE FAIL(ilim ON): not present'; end if;
  -- #245: an ilimitado member who BOOKED still lands in the booked branch, so the outcome is 'reserva'
  -- (their booking is settled), not 'gratis'. Nothing was ever held for them — reservar_clase stamped
  -- consumio=false — and 'reserva' says exactly that: this tap answered a reservation.
  if v_resultado is distinct from 'reserva' then raise exception 'RULE FAIL(ilim ON): resultado % (expected reserva — the booked branch)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_bkilim;
  if v_clases is not null then raise exception 'RULE FAIL(ilim ON): balance % (expected NULL, never decremented)', v_clases; end if;
  select consumio into v_consumio from public.asistencias
    where cliente_id = c_bkilim and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(ilim ON): asistencia.consumio % (expected false)', v_consumio; end if;
end $$;

-- ── (3) walk-in parity: no reservation -> is_walk_in/asistida + consume one (5->4) ─
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  c_walk uuid := current_setting('t.c_walk', true)::uuid;
  v_present boolean; v_hora text; v_clases int; v_status text; v_walk boolean; v_consumio boolean;
  v_perdonada boolean; v_saldo int; v_resultado text;
begin
  -- precondition: this member has NO reservation
  select count(*) into v_clases from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_clases <> 0 then raise exception 'SEED FAIL(walk): pre-existing reservation'; end if;

  -- ON: creates the walk-in reservation AND consumes exactly one (byte-for-byte toggle_pase)
  select present, hora, clases_restantes, resultado into v_present, v_hora, v_saldo, v_resultado
    from public.pasar_lista_sesion(s_id, c_walk);
  if v_present is not true then raise exception 'RULE FAIL(walk ON): not present'; end if;
  -- #245: no hold existed, so this is a charge against the package — 'descontada', never 'reserva'.
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(walk ON): resultado % (expected descontada)', v_resultado; end if;
  -- #166/#245: the session's own 18:00, not the hour the operator happened to tap.
  if v_hora is distinct from '18:00' then raise exception 'RULE FAIL(walk ON): returned hora % (expected the session''s own 18:00)', v_hora; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'RULE FAIL(walk ON): expected consume to 4, got %', v_clases; end if;
  -- the returned balance is the one the decrement left behind, not the one read before it (#162).
  if v_saldo is distinct from v_clases then raise exception 'RULE FAIL(walk ON): returned clases_restantes % but the row holds %', v_saldo, v_clases; end if;
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(walk ON): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(walk ON): is_walk_in not true'; end if;
  select consumio, perdonada into v_consumio, v_perdonada from public.asistencias
    where cliente_id = c_walk and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(walk ON): asistencia.consumio % (expected true)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(walk ON): a PAYING walk-in row was stamped perdonada %', v_perdonada; end if;

  -- OFF (untoggle): reservation -> cancelada, refund exactly one (finite) — symmetric to the door consume
  select present, clases_restantes, resultado into v_present, v_saldo, v_resultado from public.pasar_lista_sesion(s_id, c_walk);
  if v_present is not false then raise exception 'RULE FAIL(walk OFF): still present'; end if;
  if v_resultado is not null then raise exception 'RULE FAIL(walk OFF): resultado % (expected NULL on an un-mark)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 5 then raise exception 'RULE FAIL(walk OFF): expected refund to 5, got %', v_clases; end if;
  -- the untoggle returns the REFUNDED balance, not the pre-refund one (#162).
  if v_saldo is distinct from v_clases then raise exception 'RULE FAIL(walk OFF): returned clases_restantes % but the row holds %', v_saldo, v_clases; end if;
  select status into v_status from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(walk OFF): reservation status % (expected cancelada)', v_status; end if;
  select count(*) into v_clases from public.asistencias where cliente_id = c_walk and class_session_id = s_id and deleted_at is null;
  if v_clases <> 0 then raise exception 'RULE FAIL(walk OFF): active asistencia rows % (expected 0)', v_clases; end if;
end $$;

-- ── (4) COOLDOWN, clase → libre: the desk RECORDS the second visit and does not charge it ──
-- #89 replaces the C15 mistap RAISE this vector used to assert. A member marked present via the Agenda
-- (pasar_lista_sesion, 5 -> 4) is tapped at the FRONT DESK minutes later. The desk no longer refuses —
-- refusing was the defect: ACCESO LIBRE is a real visit kind and the operator is entitled to record it.
-- What must NOT happen is a second CHARGE, and that is the cooldown's job: an active row of the OTHER
-- kind on this fecha, created inside the 15-minute window, forces consumio=false.
--
-- The pair is inside the window BY CONSTRUCTION: the whole suite runs in one transaction, so now() and
-- every created_at default are the same frozen instant. Vector (6) below is the only way out of it.
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  c_walk uuid := current_setting('t.c_walk', true)::uuid;
  v_fecha date := current_setting('t.today', true)::date;   -- the session's date (seeded today 18:00)
  v_present boolean; v_clases int; v_status text; v_n int; v_perdonada boolean;
  v_consumio boolean; v_origen text; v_sess uuid; v_gym_id uuid;
begin
  -- Arrange: mark the walk-in via the SESSION seam (5 -> 4; asistida/is_walk_in, session-linked row).
  select present into v_present from public.pasar_lista_sesion(s_id, c_walk);
  if v_present is not true then raise exception 'SEED FAIL(cool clase→libre): session pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'SEED FAIL(cool clase→libre): expected 4 after session pase, got %', v_clases; end if;

  -- Act: the FRONT-DESK toggle on the session's date. Present — no raise, no refusal.
  select present into v_present from public.toggle_pase(c_walk, v_fecha);
  if v_present is not true then raise exception 'RULE FAIL(cool clase→libre): front-desk toggle did not mark present'; end if;

  -- Written rows: a SECOND row exists and it is a stated ACCESO LIBRE visit, consumio=false, gym-stamped.
  select consumio, origen, class_session_id, gym_id, perdonada into v_consumio, v_origen, v_sess, v_gym_id, v_perdonada
    from public.asistencias
   where cliente_id = c_walk and fecha = v_fecha and deleted_at is null and class_session_id is null
   order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(cool clase→libre): libre row consumio % (expected false — inside the cooldown)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(cool clase→libre): libre row origen % (expected libre)', v_origen; end if;
  -- #169: this row is the SECOND record of ONE arrival, so it carries the stamp a visit count skips.
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(cool clase→libre): the pardoned libre row was NOT stamped perdonada (%) — the arrival would count twice', v_perdonada; end if;
  if v_sess is not null then raise exception 'RULE FAIL(cool clase→libre): the desk row carries a class_session_id (%)', v_sess; end if;
  if v_gym_id is distinct from current_setting('t.gym', true)::uuid then raise exception 'RULE FAIL(cool clase→libre): libre row gym_id % not the session gym', v_gym_id; end if;
  -- …the balance did NOT move, and the session row + reservation are untouched (the desk owns only its own row).
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'RULE FAIL(cool clase→libre): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
   where cliente_id = c_walk and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(cool clase→libre): session row consumio % (expected true, it paid)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(cool clase→libre): session row origen % (expected clase)', v_origen; end if;
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(cool clase→libre): the PAYING row was stamped perdonada % — the stamp belongs on the pardoned row alone', v_perdonada; end if;
  select status into v_status from public.reservation where member_id = c_walk and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(cool clase→libre): reservation drifted to % (expected asistida)', v_status; end if;

  -- Desk untoggle: the libre row consumed nothing, so it refunds nothing; the class mark stays whole.
  select present into v_present from public.toggle_pase(c_walk, v_fecha);
  if v_present is not false then raise exception 'RULE FAIL(cool clase→libre OFF): still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_walk;
  if v_clases <> 4 then raise exception 'RULE FAIL(cool clase→libre OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_walk and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_n <> 0 then raise exception 'RULE FAIL(cool clase→libre OFF): active libre rows % (expected 0)', v_n; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_walk and class_session_id = s_id and deleted_at is null;
  if v_n <> 1 then raise exception 'RULE FAIL(cool clase→libre OFF): session asistencia disturbed (% active, expected 1)', v_n; end if;
end $$;

-- ── (5) COOLDOWN, libre → clase: the Agenda mark records the class and does not re-charge it ──
-- The reverse of (4), and the reason the cooldown is the right shape: it is ORDER-INDEPENDENT. A member
-- checked in at the FRONT DESK (toggle_pase, 5 -> 4) is then marked present in an Agenda class minutes
-- later. The walk-in branch writes the attendance row (origen='clase') + walk-in reservation with
-- consumio=false — present, no SECOND consume. Same outcomes the deleted 20260710132000 mirror produced,
-- now reached by a window instead of a per-day existence test. Balance seeded so a wrongful decrement is
-- visible: the desk takes 5 -> 4; the Agenda mark must LEAVE it at 4 (a bug would drop it to 3).
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  c_fd   uuid := current_setting('t.c_fd', true)::uuid;
  v_fecha date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int; v_status text; v_walk boolean; v_consumio boolean; v_origen text; v_n int;
  v_perdonada boolean; v_resultado text;
begin
  -- Arrange: a real consuming FRONT-DESK check-in today (5 -> 4; class-less row, origen='libre').
  -- The member holds no booking at all, so the desk tap takes the plain walk-in path: no attribution to
  -- delegate to, nothing to pardon, and the charge lands.
  select present into v_present from public.toggle_pase(c_fd, v_fecha);
  if v_present is not true then raise exception 'SEED FAIL(cool libre→clase): front-desk toggle ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fd;
  if v_clases <> 4 then raise exception 'SEED FAIL(cool libre→clase): expected 4 after front-desk consume, got %', v_clases; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
   where cliente_id = c_fd and fecha = v_fecha and deleted_at is null and class_session_id is null
   order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(cool libre→clase): desk row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'SEED FAIL(cool libre→clase): desk row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from false then raise exception 'SEED FAIL(cool libre→clase): the PAYING desk row was stamped perdonada %', v_perdonada; end if;

  -- Act: mark present in the Agenda class (walk-in branch — no prior reservation). Present, NO re-consume.
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_id, c_fd);
  if v_present is not true then raise exception 'RULE FAIL(cool libre→clase ON): not present'; end if;
  -- #245: pardoned = admitted, nothing charged = 'gratis'. Not 'reserva' (no booking was captured —
  -- this member never booked) and not 'descontada' (the decrement did not run).
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(cool libre→clase ON): resultado % (expected gratis)', v_resultado; end if;
  -- Written-rows rule: balance UNCHANGED at 4 (no second decrement — the desk arrival already paid).
  select clases_restantes into v_clases from public.clientes where id = c_fd;
  if v_clases <> 4 then raise exception 'RULE FAIL(cool libre→clase ON): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;
  -- …and the session-linked attendance row was still written, origen='clase', with consumio=false —
  -- and stamped perdonada, because THIS is the second record of the arrival in this direction (#169).
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
    where cliente_id = c_fd and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(cool libre→clase ON): asistencia.consumio % (expected false)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(cool libre→clase ON): asistencia.origen % (expected clase)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(cool libre→clase ON): the pardoned class row was NOT stamped perdonada (%) — the cooldown must stamp in BOTH directions', v_perdonada; end if;
  -- …and the walk-in reservation exists as asistida/is_walk_in (the mark is still recorded, just not charged).
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_fd and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(cool libre→clase ON): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(cool libre→clase ON): is_walk_in not true'; end if;

  -- Untoggle: consumio=false ⇒ NO credit-back (the Agenda mark charged nothing; the desk consume stays).
  select present into v_present from public.pasar_lista_sesion(s_id, c_fd);
  if v_present is not false then raise exception 'RULE FAIL(cool libre→clase OFF): still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_fd;
  if v_clases <> 4 then raise exception 'RULE FAIL(cool libre→clase OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_fd and class_session_id = s_id;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(cool libre→clase OFF): reservation status % (expected cancelada)', v_status; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_fd and class_session_id = s_id and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(cool libre→clase OFF): active session asistencia rows % (expected 0)', v_n; end if;
end $$;

-- ── (6) BEYOND the cooldown: the same pair, 20 minutes apart, CONSUMES ──────────────────────
-- The cooldown is a 15-minute WINDOW, not a per-day pardon — which is exactly the distinction the
-- deleted 20260710132000 mirror could not make (it suppressed the consume for any same-day desk row,
-- however old). A member who checks in at the desk in the morning and attends a class in the evening
-- made TWO visits and spends TWO classes (R1).
--
-- Arrange the desk mark first (5 -> 4)…
do $$
declare
  c_beyond uuid := current_setting('t.c_beyond', true)::uuid;
  v_fecha  date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int;
begin
  select present into v_present from public.toggle_pase(c_beyond, v_fecha);
  if v_present is not true then raise exception 'SEED FAIL(beyond): front-desk toggle ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_beyond;
  if v_clases <> 4 then raise exception 'SEED FAIL(beyond): expected 4 after front-desk consume, got %', v_clases; end if;
end $$;

-- …then step OUT of the operator role and age that row past the window. Everything in this suite shares
-- one transaction, so now() is frozen and every created_at default lands on the same instant; backdating
-- is the ONLY way to observe the far side of the window, and no RPC can do it — hence the privileged UPDATE.
reset role;
update public.asistencias set created_at = created_at - interval '20 minutes'
 where cliente_id = current_setting('t.c_beyond', true)::uuid
   and class_session_id is null and deleted_at is null;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  s_id     uuid := current_setting('t.s_id', true)::uuid;
  c_beyond uuid := current_setting('t.c_beyond', true)::uuid;
  v_fecha  date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text; v_walk boolean;
  v_perdonada boolean;
begin
  -- Act: the Agenda mark now sees NO recent libre row → the walk-in branch consumes (4 -> 3).
  select present into v_present from public.pasar_lista_sesion(s_id, c_beyond);
  if v_present is not true then raise exception 'RULE FAIL(beyond ON): not present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_beyond;
  if v_clases <> 3 then raise exception 'RULE FAIL(beyond ON): expected a real consume to 3, got % — the cooldown pardoned a visit 20 minutes old', v_clases; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
    where cliente_id = c_beyond and class_session_id = s_id and deleted_at is null order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(beyond ON): asistencia.consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(beyond ON): asistencia.origen % (expected clase)', v_origen; end if;
  -- No pardon happened, so no stamp: two separate visits count as two (#169).
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(beyond ON): a row 20 minutes past the window was stamped perdonada %', v_perdonada; end if;
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_beyond and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(beyond ON): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(beyond ON): is_walk_in not true'; end if;
  -- The backdated desk row is still there, still charged — the two visits are two rows and two credits.
  select consumio, origen into v_consumio, v_origen from public.asistencias
    where cliente_id = c_beyond and fecha = v_fecha and deleted_at is null and class_session_id is null
    order by created_at desc limit 1;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(beyond ON): the earlier desk row lost its consume (%)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(beyond ON): the earlier desk row origen % (expected libre)', v_origen; end if;
end $$;

-- ── (7) TWO DIFFERENT CLASSES in the same minute: both consume (the #89 headline) ───────────
-- Ruling R1 and the unanimous practice of ~20 competing products: the unit of entitlement is the CLASS
-- INSTANCE, never the day. No backdating here — the second mark lands well INSIDE the 15-minute window,
-- and it must consume anyway, because visita_reciente is asked about the OTHER kind: a recent CLASS row
-- can never pardon another class. A regression that keys the cooldown on the day instead of the kind
-- would leave the balance at 4 here and quietly give the second class away.
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  s2_id  uuid := current_setting('t.s2_id', true)::uuid;
  c_dos  uuid := current_setting('t.c_dos', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text; v_walk boolean; v_n int;
  v_perdonada boolean;
begin
  -- First class: walk-in consume 5 -> 4.
  select present into v_present from public.pasar_lista_sesion(s_id, c_dos);
  if v_present is not true then raise exception 'SEED FAIL(dos clases): first class pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_dos;
  if v_clases <> 4 then raise exception 'SEED FAIL(dos clases): expected 4 after the first class, got %', v_clases; end if;

  -- Second, DIFFERENT class, same transaction ⇒ same instant ⇒ deep inside the cooldown. Must consume.
  select present into v_present from public.pasar_lista_sesion(s2_id, c_dos);
  if v_present is not true then raise exception 'RULE FAIL(dos clases): second class pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_dos;
  if v_clases <> 3 then raise exception 'RULE FAIL(dos clases): FREE SECOND CLASS — balance % (expected 3: one class attended, one class spent)', v_clases; end if;

  -- Written rows: TWO active class rows, both stated 'clase', both charged; two asistida walk-in bookings.
  select count(*) into v_n from public.asistencias
   where cliente_id = c_dos and deleted_at is null and class_session_id is not null;
  if v_n <> 2 then raise exception 'RULE FAIL(dos clases): active class asistencias % (expected 2)', v_n; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_dos and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(dos clases): class-1 row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(dos clases): class-1 row origen % (expected clase)', v_origen; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
   where cliente_id = c_dos and class_session_id = s2_id and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(dos clases): class-2 row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(dos clases): class-2 row origen % (expected clase)', v_origen; end if;
  -- …and it is NOT a pardoned duplicate: a cooldown keyed on the DAY instead of the KIND would both
  -- free this class and stamp it, hiding the second visit from the count as well as from the ledger.
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(dos clases): the second CLASS was stamped perdonada % — two classes are two visits', v_perdonada; end if;
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_dos and class_session_id = s2_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(dos clases): class-2 reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(dos clases): class-2 is_walk_in not true'; end if;
end $$;

-- ── (8) THE ORPHANED PARDON: undoing the PARDONING mark leaves the pardoned row unpaid ──────
-- An ACCEPTED edge (named in 20260728121000's header), pinned here so it stays a decision. The cooldown
-- is ONE-DIRECTIONAL by design: the pardon is decided at write time from what already exists and is never
-- revisited, because revisiting it means pairing heuristics — inferring which two rows are "the same
-- arrival" and keeping them linked — and the owner withdrew those explicitly.
--
-- So: Agenda mark consumes (5->4), the desk tap inside the window is pardoned (consumio=false), and then
-- the operator undoes THE AGENDA MARK. The refund fires, the class row is soft-deleted, the reservation
-- reverts — and the libre row is left active and unpaid. That is correct on its own terms (the member DID
-- walk in; recording it is exactly what #89 restored) and the operator recovers the charge with the two
-- taps they already know: untoggle the libre row and re-toggle it. With the pardoning sibling gone the
-- re-mark charges, which the tail of this vector proves.
do $$
declare
  s_id    uuid := current_setting('t.s_id', true)::uuid;
  c_orph  uuid := current_setting('t.c_orph', true)::uuid;
  v_fecha date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text; v_n int;
  v_perdonada boolean;
begin
  -- Step 1 — the AGENDA mark: walk-in consume 5 -> 4, class row charged.
  select present into v_present from public.pasar_lista_sesion(s_id, c_orph);
  if v_present is not true then raise exception 'SEED FAIL(huerfano 1): session pase ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 4 then raise exception 'SEED FAIL(huerfano 1): expected 4 after the class mark, got %', v_clases; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_orph and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(huerfano 1): class row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'SEED FAIL(huerfano 1): class row origen % (expected clase)', v_origen; end if;

  -- Step 2 — the DESK tap inside the window: recorded, pardoned, stamped, balance still 4.
  select present into v_present from public.toggle_pase(c_orph, v_fecha);
  if v_present is not true then raise exception 'SEED FAIL(huerfano 2): front-desk toggle ON failed'; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
   where cliente_id = c_orph and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'SEED FAIL(huerfano 2): libre row consumio % (expected false — pardoned)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'SEED FAIL(huerfano 2): libre row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'SEED FAIL(huerfano 2): pardoned libre row not stamped perdonada (%)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 4 then raise exception 'SEED FAIL(huerfano 2): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;

  -- Step 3 — undo THE AGENDA MARK (the row that paid). Refund 4 -> 5, class row soft-deleted, walk-in
  -- reservation cancelled… and the pardoned libre row survives untouched, active and unpaid.
  select present into v_present from public.pasar_lista_sesion(s_id, c_orph);
  if v_present is not false then raise exception 'RULE FAIL(huerfano 3): session pase OFF still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 5 then raise exception 'RULE FAIL(huerfano 3): expected the class refund to 5, got %', v_clases; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_orph and class_session_id = s_id and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(huerfano 3): active class asistencias % (expected 0 — soft-deleted)', v_n; end if;
  select status into v_status from public.reservation where member_id = c_orph and class_session_id = s_id;
  if v_status <> 'cancelada' then raise exception 'RULE FAIL(huerfano 3): reservation status % (expected cancelada)', v_status; end if;
  -- THE EDGE, asserted as the accepted outcome it is: the libre row is still there, still consumio=false.
  select count(*) into v_n from public.asistencias
   where cliente_id = c_orph and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_n <> 1 then raise exception 'RULE FAIL(huerfano 3): the recorded libre visit vanished (% active rows, expected 1)', v_n; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
   where cliente_id = c_orph and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(huerfano 3): orphaned libre row consumio % (expected false — the pardon is NOT revisited)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(huerfano 3): orphaned libre row origen % (expected libre)', v_origen; end if;
  -- The stamp is not revisited either, which is the ACCEPTED undercount edge of #169: this real visit
  -- reads perdonada=true with no sibling left to have duplicated, so a VISIT count skips it. Named in
  -- the migration header, verified at month-close by the trigger query, and recovered by step 4 below.
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(huerfano 3): the orphaned row lost its perdonada stamp (%) — the pardon must not be revisited', v_perdonada; end if;

  -- Step 4 — the RECOVERY the accepted edge relies on: untoggle refunds nothing (it never charged)…
  select present into v_present from public.toggle_pase(c_orph, v_fecha);
  if v_present is not false then raise exception 'RULE FAIL(huerfano 4): front-desk toggle OFF still present'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 5 then raise exception 'RULE FAIL(huerfano 4): PHANTOM REFUND — balance % (expected 5)', v_clases; end if;

  -- …and the re-mark CHARGES, because the class row that pardoned it is gone (soft-deleted ⇒ invisible
  -- to visita_reciente, which filters on deleted_at is null). 5 -> 4, consumio=true.
  select present into v_present from public.toggle_pase(c_orph, v_fecha);
  if v_present is not true then raise exception 'RULE FAIL(huerfano 4): front-desk re-toggle ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orph;
  if v_clases <> 4 then raise exception 'RULE FAIL(huerfano 4): the re-mark did not charge — balance % (expected 4)', v_clases; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
   where cliente_id = c_orph and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(huerfano 4): re-marked libre row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(huerfano 4): re-marked libre row origen % (expected libre)', v_origen; end if;
  -- …and the recovery row is a CLEAN visit: it charged, so it is not a pardoned duplicate and the count
  -- gets its visit back — the same two taps recover both the money and the number.
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(huerfano 4): the re-charged row kept a perdonada stamp (%)', v_perdonada; end if;
end $$;

-- ── (9) #237 ZERO-BALANCE GATE: the walk-in arm HARD-REFUSES, no pardon in play ──────────────
-- Owner ruling 2026-08-04, mirrors #235's member-facing ruling: a finite member at 0 classes with no
-- recent row of the OTHER kind gets 'Sin clases disponibles' — the SAME message reservar_clase raises
-- — and NOTHING is written: no asistencia, no walk-in reservation, balance untouched.
do $$
declare
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  c_zero uuid := current_setting('t.c_zero', true)::uuid;
  v_present boolean; v_clases int; v_raised boolean; v_n int;
begin
  select clases_restantes into v_clases from public.clientes where id = c_zero;
  if v_clases <> 0 then raise exception 'SEED FAIL(v9): expected 0, got %', v_clases; end if;

  v_raised := false;
  begin
    perform public.pasar_lista_sesion(s_id, c_zero);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Sin clases disponibles%' then raise exception 'RULE FAIL(v9): wrong raise for a zero-balance class mark: %', sqlerrm; end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(v9): a ZERO-BALANCE member was admitted into a class (the #237 hole)'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_zero;
  if v_clases <> 0 then raise exception 'RULE FAIL(v9): the refused mark moved the balance to % (expected untouched 0)', v_clases; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_zero and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(v9): the refused mark wrote % attendance rows (expected 0)', v_n; end if;
  select count(*) into v_n from public.reservation where member_id = c_zero and class_session_id = s_id;
  if v_n <> 0 then raise exception 'RULE FAIL(v9): the refused mark minted % reservation row(s) (expected 0)', v_n; end if;
end $$;

-- ── (10) #237 GATE vs the COOLDOWN PARDON: a 0-balance member INSIDE a pardon is still admitted ──
-- The reason the gate had to be RESTRUCTURED (not just dropped in) in this function's walk-in arm: the
-- cooldown pardon must decide FIRST. c_zeropard starts at 1; the desk charges it to 0 (1->0, an ordinary
-- walk-in libre tap with no pardon in play yet), and the class mark that follows minutes later is the
-- SECOND record of that one arrival — its sibling row already paid, so it must be pardoned for free, not
-- hard-refused for having a 0 balance. Present, consumio=false, perdonada=true, balance stays 0, and the
-- attendance row IS written (the gate never fires in the pardon's arm).
do $$
declare
  s2_id      uuid := current_setting('t.s2_id', true)::uuid;
  c_zeropard uuid := current_setting('t.c_zeropard', true)::uuid;
  v_fecha    date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_perdonada boolean;
  v_status text; v_walk boolean; v_resultado text;
begin
  -- Arrange: the front-desk libre tap charges 1 -> 0 (no recent row of the OTHER kind exists yet).
  select present into v_present from public.toggle_pase(c_zeropard, v_fecha);
  if v_present is not true then raise exception 'SEED FAIL(v10): front-desk toggle ON failed'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_zeropard;
  if v_clases <> 0 then raise exception 'SEED FAIL(v10): expected the desk charge to drive the balance to 0, got %', v_clases; end if;
  select consumio, origen into v_consumio, v_origen from public.asistencias
   where cliente_id = c_zeropard and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(v10): desk row consumio % (expected true — it paid)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'SEED FAIL(v10): desk row origen % (expected libre)', v_origen; end if;

  -- Act: the class mark, minutes later (the whole suite runs in one frozen instant), on a member now
  -- at balance 0. Must be ADMITTED — the #237 gate must not fire inside the cooldown's pardon arm.
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s2_id, c_zeropard);
  if v_present is not true then raise exception 'RULE FAIL(v10): a 0-balance member INSIDE a cooldown pardon was refused (the gate fired ahead of the pardon)'; end if;
  -- #245: 'gratis' — and it is the discriminator that proves WHICH arm admitted them. A 'descontada'
  -- here would mean the gate/charge path ran on a 0-balance member.
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(v10): resultado % (expected gratis — the pardon arm)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_zeropard;
  if v_clases <> 0 then raise exception 'RULE FAIL(v10): the pardoned class mark moved the balance to % (expected untouched 0)', v_clases; end if;

  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada from public.asistencias
    where cliente_id = c_zeropard and class_session_id = s2_id and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v10): class row consumio % (expected false — pardoned)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(v10): class row origen % (expected clase)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(v10): the pardoned class row was NOT stamped perdonada (%) — the arrival would count twice', v_perdonada; end if;

  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_zeropard and class_session_id = s2_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(v10): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(v10): is_walk_in not true'; end if;
end $$;

-- ── (11) LATE MARKING IS SESSION-SCOPED (#166's root, closed by #233/#245) ──────────────────────
-- The operator marks YESTERDAY's 07:00 roster today. Forge's Agenda runs weeks stale, so this is the
-- ordinary case, not an edge — and it used to record a lie in two different places:
--
--   (a) THE STAMP. `hora` was "now() if the session's date is gym-today, else NULL", so a late mark
--       recorded either the data-entry hour or no hour at all. Since 20260804150000 it is the CLASS's
--       own start time in the gym's timezone — 07:00 — the exact pair of `fecha`, which has always
--       been the session's own gym-local date. The old rule is what this vector is aimed at: it would
--       write NULL here, and nothing before #245 would have noticed.
--
--   (b) WHICH PACKAGE IS ASKED ABOUT. The vigencia gate compares `vence` against the SESSION's date,
--       so c_latevig — whose package expired YESTERDAY, i.e. was valid on the class's own day — is
--       admitted for the class they actually attended, and would be refused ('Paquete vencido') by any
--       gate that asked about today instead. Marking a roster late must not retroactively un-attend a
--       member whose membership was live when they walked in.
--
-- Nothing here is a booking: both members take the WALK-IN arm and CHARGE, which is also what makes
-- 'descontada' the right disclosure — there was no hold to capture.
do $$
declare
  s_late    uuid := current_setting('t.s_late', true)::uuid;
  f_late    date := current_setting('t.f_late', true)::date;
  v_today   date := current_setting('t.today', true)::date;
  c_late    uuid := current_setting('t.c_late', true)::uuid;
  c_latevig uuid := current_setting('t.c_latevig', true)::uuid;
  v_present boolean; v_hora text; v_clases int; v_resultado text; v_consumio boolean;
  v_stored_hora time; v_fecha date; v_origen text; v_status text; v_walk boolean; v_vence date;
begin
  if f_late >= v_today then raise exception 'SEED FAIL(v11): the late session lands on % (expected a day before today %)', f_late, v_today; end if;

  -- ── (a) the STAMP is the session's own instant ────────────────────────────────
  select present, hora, clases_restantes, resultado into v_present, v_hora, v_clases, v_resultado
    from public.pasar_lista_sesion(s_late, c_late);
  if v_present is not true then raise exception 'RULE FAIL(v11a): the late mark was refused'; end if;
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(v11a): resultado % (expected descontada — a walk-in with no hold to capture)', v_resultado; end if;
  if v_hora is distinct from '07:00' then raise exception 'RULE FAIL(v11a): returned hora % (expected the class''s own 07:00 — a NULL here is the pre-#245 now()-keyed rule)', v_hora; end if;

  -- The WRITTEN row, which is the contract: the visit is dated and timed to the class, not to the
  -- moment the operator typed it.
  select fecha, hora, consumio, origen into v_fecha, v_stored_hora, v_consumio, v_origen
    from public.asistencias where cliente_id = c_late and class_session_id = s_late and deleted_at is null;
  if v_fecha is distinct from f_late then raise exception 'RULE FAIL(v11a): asistencia.fecha % (expected the session''s own day %)', v_fecha, f_late; end if;
  if v_stored_hora is distinct from '07:00:00'::time then raise exception 'RULE FAIL(v11a): stored asistencia.hora % (expected the class''s own 07:00)', v_stored_hora; end if;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(v11a): asistencia.consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(v11a): asistencia.origen % (expected clase)', v_origen; end if;
  select clases_restantes into v_clases from public.clientes where id = c_late;
  if v_clases <> 4 then raise exception 'RULE FAIL(v11a): expected a charge to 4, got %', v_clases; end if;
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_late and class_session_id = s_late;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(v11a): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(v11a): is_walk_in not true'; end if;

  -- ── (b) the VIGENCIA question is asked about the CLASS's day, not about today ──
  select vence into v_vence from public.clientes where id = c_latevig;
  if v_vence is distinct from f_late then raise exception 'SEED FAIL(v11b): vence % (expected the session''s own day %)', v_vence, f_late; end if;
  if v_vence >= v_today then raise exception 'SEED FAIL(v11b): vence % is not already lapsed relative to today %', v_vence, v_today; end if;

  select present, hora, resultado into v_present, v_hora, v_resultado
    from public.pasar_lista_sesion(s_late, c_latevig);
  if v_present is not true then raise exception 'RULE FAIL(v11b): a member whose package was VALID on the class''s own day was refused when marked late — the vigencia gate is asking about today'; end if;
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(v11b): resultado % (expected descontada)', v_resultado; end if;
  if v_hora is distinct from '07:00' then raise exception 'RULE FAIL(v11b): returned hora % (expected 07:00)', v_hora; end if;
  select clases_restantes into v_clases from public.clientes where id = c_latevig;
  if v_clases <> 4 then raise exception 'RULE FAIL(v11b): expected a charge to 4, got %', v_clases; end if;
end $$;

-- ── (12) ILIMITADO ORDER SYMMETRY: nothing is charged either way, and the STAMP survives (#245 §3) ──
-- The cooldown's key became "was the recent row itself pardoned?" (20260804150000 §3). An ilimitado
-- member's rows are ALWAYS consumio=false — they owe nothing on any path — so a predicate keyed on
-- `consumio = true` instead would refuse to pardon them, and their door tap and class mark would both
-- come back unstamped. The money would still be right (there is none), which is exactly why this needs
-- its own vector: the damage would be silent, and it would land on the COUNT.
--
-- `perdonada` is what makes a visit count skip the second record of ONE arrival (#169). Lose it here
-- and every dual-surface ilimitado member reads double in asistencias_mes_por_cliente — at a gym that
-- runs a door check-in AND class rosters, that is every unlimited member, every day.
--
-- Both orders, one member each, balances asserted NULL throughout (an ilimitado NULL is never written
-- to, ADR-0004 / ADR-0010 §4) and exactly one of the two rows stamped in each.
do $$
declare
  s_id    uuid := current_setting('t.s_id', true)::uuid;
  s2_id   uuid := current_setting('t.s2_id', true)::uuid;
  c_ilimA uuid := current_setting('t.c_ilimA', true)::uuid;
  c_ilimB uuid := current_setting('t.c_ilimB', true)::uuid;
  v_fecha date := current_setting('t.today', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_perdonada boolean; v_origen text;
  v_resultado text; v_n int;
begin
  -- ── (a) CLASS then DOOR ────────────────────────────────────────────────────────
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_id, c_ilimA);
  if v_present is not true then raise exception 'SEED FAIL(v12a): the class mark was refused'; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'SEED FAIL(v12a): class mark resultado % (expected gratis — ilimitado is never descontada)', v_resultado; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c_ilimA and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'SEED FAIL(v12a): class row consumio % (expected false)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'SEED FAIL(v12a): the FIRST record of the arrival was stamped perdonada %', v_perdonada; end if;

  select present, resultado into v_present, v_resultado from public.toggle_pase(c_ilimA, v_fecha);
  if v_present is not true then raise exception 'RULE FAIL(v12a): the door tap was refused'; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(v12a): door tap resultado % (expected gratis)', v_resultado; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_ilimA and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v12a): libre row consumio % (expected false)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v12a): libre row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(v12a): the ilimitado door row was NOT stamped perdonada (%) — a member who pays nothing still cannot count twice', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_ilimA;
  if v_clases is not null then raise exception 'RULE FAIL(v12a): balance % (expected an untouched NULL)', v_clases; end if;

  -- ── (b) DOOR then CLASS — the mirror ──────────────────────────────────────────
  select present, resultado into v_present, v_resultado from public.toggle_pase(c_ilimB, v_fecha);
  if v_present is not true then raise exception 'SEED FAIL(v12b): the door tap was refused'; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'SEED FAIL(v12b): door tap resultado % (expected gratis)', v_resultado; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c_ilimB and fecha = v_fecha and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'SEED FAIL(v12b): libre row consumio % (expected false)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'SEED FAIL(v12b): the FIRST record of the arrival was stamped perdonada %', v_perdonada; end if;

  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s2_id, c_ilimB);
  if v_present is not true then raise exception 'RULE FAIL(v12b): the class mark was refused'; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(v12b): class mark resultado % (expected gratis)', v_resultado; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_ilimB and class_session_id = s2_id and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v12b): class row consumio % (expected false)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(v12b): class row origen % (expected clase)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(v12b): the ilimitado class row was NOT stamped perdonada (%)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_ilimB;
  if v_clases is not null then raise exception 'RULE FAIL(v12b): balance % (expected an untouched NULL)', v_clases; end if;

  -- Symmetric shape: two active rows each, exactly one stamped — one arrival, one visit, either order.
  select count(*) into v_n from public.asistencias where cliente_id = c_ilimA and deleted_at is null;
  if v_n is distinct from 2 then raise exception 'RULE FAIL(v12a): active rows % (expected 2)', v_n; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_ilimB and deleted_at is null;
  if v_n is distinct from 2 then raise exception 'RULE FAIL(v12b): active rows % (expected 2)', v_n; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_ilimA and deleted_at is null and perdonada;
  if v_n is distinct from 1 then raise exception 'RULE FAIL(v12a): % pardoned row(s) (expected exactly 1)', v_n; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_ilimB and deleted_at is null and perdonada;
  if v_n is distinct from 1 then raise exception 'RULE FAIL(v12b): % pardoned row(s) (expected exactly 1)', v_n; end if;
end $$;

-- ── (v13) THE GUARDED DECREMENT'S BOUNDARY — the last class (20260826120000) ──────────────────────
-- The walk-in charge used to run `update … set clases_restantes = clases_restantes - 1 where … and
-- clases_restantes > 0` and never look at the result: zero rows matched still wrote consumio = true,
-- and a later untoggle refunded a class nobody had paid for. It now raises 'Sin clases disponibles'
-- when the update matches nothing.
--
-- 1 -> 0 is the boundary that guard must not misfire on, and it is the whole risk the guard
-- introduced: the update DOES match a row here (1 > 0), so the mark must be admitted, charged, and
-- leave the member at exactly 0. Vector 9 above is the other side of the same gate — a member already
-- AT 0 is refused before the decrement is ever attempted, writing no asistencia and no reservation —
-- so the two together bracket the change: the last class is sold, the one after it is refused.
do $$
declare
  v_gym    uuid := current_setting('t.gym', true)::uuid;
  c_last   uuid := current_setting('t.c_last', true)::uuid;
  s2_id    uuid := current_setting('t.s2_id', true)::uuid;
  v_starts2 timestamptz := current_setting('t.starts2', true)::timestamptz;
  v_tz     text;
  v_fecha  date;
  v_present boolean; v_saldo int; v_resultado text; v_clases int;
  v_consumio boolean; v_origen text; v_perdonada boolean; v_n int;
begin
  select timezone into v_tz from public.gym where id = v_gym;
  v_fecha := (v_starts2 at time zone v_tz)::date;

  select clases_restantes into v_clases from public.clientes where id = c_last;
  if v_clases is distinct from 1 then raise exception 'SEED FAIL(v13): base is % (expected exactly 1)', v_clases; end if;

  -- A WALK-IN mark (no booking) — the only path that charges, and therefore the only one the guard sits on.
  select present, clases_restantes, resultado into v_present, v_saldo, v_resultado
    from public.pasar_lista_sesion(s2_id, c_last);
  if v_present is not true then raise exception 'RULE FAIL(v13): the LAST class was refused — the not-found guard misfires at the boundary'; end if;
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(v13): resultado % (expected descontada — the decrement ran)', v_resultado; end if;
  if v_saldo is distinct from 0 then raise exception 'RULE FAIL(v13): returned balance % (expected the fresh 0)', v_saldo; end if;

  -- The WRITTEN rows: the attendance says it paid, and the balance says the same.
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_last and class_session_id = s2_id and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(v13): asistencia.consumio % (expected true — this visit really was charged)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(v13): asistencia.origen % (expected clase)', v_origen; end if;
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(v13): a CHARGED row was stamped perdonada %', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_last;
  if v_clases is distinct from 0 then raise exception 'RULE FAIL(v13): stored balance % (expected 0 — charged exactly once)', v_clases; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_last and deleted_at is null;
  if v_n is distinct from 1 then raise exception 'RULE FAIL(v13): % active attendance row(s) (expected exactly 1)', v_n; end if;
end $$;

-- ── (14) §D6: a WALK-IN on a CANCELLED booking's row is ONE charge, not two ───────────────────────
-- The state this vector is about is ordinary at a gym that books: a member books (the hold sets
-- reservation.consumio = true), changes their mind (cancelar_reserva refunds by READING that flag and
-- leaves it set — asserted in the arrange block near the top of this file), and turns up anyway, so the
-- operator marks them present. The walk-in arm reuses that one UNIQUE row, and until 20260828100000 it
-- left the flag alone while inserting an asistencia that charges.
--
-- WHAT THAT COSTS, stated exactly, because it decides what is worth asserting: the D0 asistencia leg
-- defers to any reservation that claims the charge, so the TOTAL stays 1 either way — a total-only
-- assertion would pass against the unfixed body and prove nothing. What moves is the LEG, and with it
-- the CHARGE MOMENT: the reservation leg dates the charge at `created_at`, a booking this member
-- CANCELLED (and, after a renewal, one that belongs to a pack since replaced), while the asistencia leg
-- dates it at the class's own fecha + hora, which is when the door actually charged. So both legs are
-- counted SEPARATELY here, and the vector fails an implementation that leaves the flag set.
--
-- c_honest rides in the same class as the counter-vector: a real booking CAPTURED by the same RPC keeps
-- consumio = true (the hold it took) with an asistencia of consumio = false, so its charge belongs on
-- the reservation leg — the exact mirror, and the shape the backfill below must never touch.
do $$
declare
  s3_id    uuid := current_setting('t.s3_id', true)::uuid;
  c_recy   uuid := current_setting('t.c_recy', true)::uuid;
  c_honest uuid := current_setting('t.c_honest', true)::uuid;
  v_present boolean; v_resultado text; v_clases int; v_res_id uuid;
  v_leg_a int; v_leg_r int;   -- the two legs of the D0 charge count, counted apart on purpose
  v_status text; v_walk boolean; v_consumio boolean; v_cancelled timestamptz; v_checked timestamptz;
  v_a_consumio boolean; v_a_res uuid; v_a_origen text; v_a_perdonada boolean;
begin
  -- ── (a) THE RECYCLED ROW ──────────────────────────────────────────────────────
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s3_id, c_recy);
  if v_present is not true then raise exception 'RULE FAIL(v14 recy): the walk-in mark was refused'; end if;
  -- 'descontada', not 'reserva': a CANCELLED booking is not a hold to capture, and the door charge is real.
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(v14 recy): resultado % (expected descontada)', v_resultado; end if;

  select id, status, is_walk_in, consumio, cancelled_at, checked_at
    into v_res_id, v_status, v_walk, v_consumio, v_cancelled, v_checked
    from public.reservation where member_id = c_recy and class_session_id = s3_id;
  if v_status is distinct from 'asistida' then raise exception 'RULE FAIL(v14 recy): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not true then raise exception 'RULE FAIL(v14 recy): is_walk_in % (expected true — this arrival was not a booking)', v_walk; end if;
  if v_cancelled is not null then raise exception 'RULE FAIL(v14 recy): cancelled_at % not cleared on the reuse', v_cancelled; end if;
  if v_checked is null then raise exception 'RULE FAIL(v14 recy): checked_at not stamped'; end if;
  -- THE EDIT (20260828100000 §2): the cancelled booking's flag is cleared by the reuse.
  if v_consumio is distinct from false then
    raise exception 'RULE FAIL(v14 recy): reservation.consumio % — the CANCELLED booking''s flag survived the walk-in reuse, so this door charge is dated at the booking instant and attributed to whatever pack was live then', v_consumio;
  end if;

  -- …and the charge for this visit lives on the asistencia, which is also where the untoggle refund reads it.
  select consumio, reservation_id, origen, perdonada into v_a_consumio, v_a_res, v_a_origen, v_a_perdonada
    from public.asistencias where cliente_id = c_recy and class_session_id = s3_id and deleted_at is null;
  if v_a_consumio is distinct from true then raise exception 'RULE FAIL(v14 recy): asistencia.consumio % (expected true — this visit is the one that paid)', v_a_consumio; end if;
  if v_a_res is distinct from v_res_id then raise exception 'RULE FAIL(v14 recy): asistencia.reservation_id % (expected the reused row %)', v_a_res, v_res_id; end if;
  if v_a_origen is distinct from 'clase' then raise exception 'RULE FAIL(v14 recy): asistencia.origen % (expected clase)', v_a_origen; end if;
  if v_a_perdonada is distinct from false then raise exception 'RULE FAIL(v14 recy): a PAYING row was stamped perdonada %', v_a_perdonada; end if;
  -- One class was spent in total: 5 (booked) -> 4 (held) -> 5 (cancelled, refunded) -> 4 (walked in).
  select clases_restantes into v_clases from public.clientes where id = c_recy;
  if v_clases <> 4 then raise exception 'RULE FAIL(v14 recy): balance % (expected exactly one net charge, 4)', v_clases; end if;

  -- THE DERIVED COUNT (spec D0), leg by leg, the way every surface will compute it. The charge belongs
  -- to the ASISTENCIA leg — it happened at the door, at the class's own instant — and to nothing else.
  select count(*) into v_leg_a from public.asistencias a
    left join public.reservation r on r.id = a.reservation_id
   where a.cliente_id = c_recy and a.deleted_at is null and not a.perdonada
     and not coalesce(r.consumio, false);
  select count(*) into v_leg_r from public.reservation r
   where r.member_id = c_recy and r.consumio and r.status <> 'cancelada';
  if v_leg_r <> 0 then
    raise exception 'RULE FAIL(v14 recy): the RESERVATION leg claims % charge(s) — a cancelled booking''s flag is dating this door charge at the booking instant, so it lands on whatever pack was live then', v_leg_r;
  end if;
  if v_leg_a <> 1 then
    raise exception 'RULE FAIL(v14 recy): the ASISTENCIA leg counts % charge(s) (expected the 1 the door took)', v_leg_a;
  end if;

  -- ── (b) THE COUNTER-VECTOR: a real booking captured by the same RPC keeps its hold ────────────
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s3_id, c_honest);
  if v_present is not true then raise exception 'RULE FAIL(v14 honest): the capture was refused'; end if;
  if v_resultado is distinct from 'reserva' then raise exception 'RULE FAIL(v14 honest): resultado % (expected reserva — a hold was captured)', v_resultado; end if;
  select status, is_walk_in, consumio into v_status, v_walk, v_consumio
    from public.reservation where member_id = c_honest and class_session_id = s3_id;
  if v_status is distinct from 'asistida' then raise exception 'RULE FAIL(v14 honest): reservation status % (expected asistida)', v_status; end if;
  if v_walk is distinct from false then raise exception 'RULE FAIL(v14 honest): is_walk_in % (expected false — a booking is not a walk-in)', v_walk; end if;
  -- The booked branch must NOT have been touched by the §D6 edit: this flag is a live hold, and the
  -- capture is what settles it. A body that cleared it here would lose the charge entirely.
  if v_consumio is distinct from true then raise exception 'RULE FAIL(v14 honest): reservation.consumio % — the capture cleared a REAL hold, and the charge is now nowhere', v_consumio; end if;
  select consumio into v_a_consumio from public.asistencias
   where cliente_id = c_honest and class_session_id = s3_id and deleted_at is null;
  if v_a_consumio is distinct from false then raise exception 'RULE FAIL(v14 honest): asistencia.consumio % (expected false — the booking already paid)', v_a_consumio; end if;
  select clases_restantes into v_clases from public.clientes where id = c_honest;
  if v_clases <> 4 then raise exception 'RULE FAIL(v14 honest): balance % (expected the single booking charge, 4)', v_clases; end if;

  -- The mirror image of (a): this charge was taken at BOOKING, so it belongs to the reservation leg,
  -- and the asistencia leg defers to it. Same total, opposite legs — which is the point.
  select count(*) into v_leg_a from public.asistencias a
    left join public.reservation r on r.id = a.reservation_id
   where a.cliente_id = c_honest and a.deleted_at is null and not a.perdonada
     and not coalesce(r.consumio, false);
  select count(*) into v_leg_r from public.reservation r
   where r.member_id = c_honest and r.consumio and r.status <> 'cancelada';
  if v_leg_r <> 1 then raise exception 'RULE FAIL(v14 honest): the RESERVATION leg counts % charge(s) (expected the 1 the booking took)', v_leg_r; end if;
  if v_leg_a <> 0 then raise exception 'RULE FAIL(v14 honest): the ASISTENCIA leg counts % charge(s) (expected 0 — the capture defers to the hold)', v_leg_a; end if;
end $$;

reset role;

-- ── (14c) THE BACKFILL, pre- and post- ───────────────────────────────────────────────────────────
-- The write-site fix above stops the state from being created; the backfill in section 4 of
-- 20260828100000 heals the rows that already carry it. Both halves need proving, so this block
-- hand-restores the stale flag (privileged — no RPC can write it back) and then runs the migration's
-- statement VERBATIM: the same WHERE, unscoped, exactly as it runs on a real target. It is inside this
-- file's single BEGIN/ROLLBACK like everything else, so whatever else it touches on the target is
-- discarded with the rest of the fixtures.
--
-- If the statement is ever changed in the migration, change this copy with it — the point of the vector
-- is the PRECISION of that WHERE, and a stale copy would be proving the precision of something else.
do $$
declare
  s3_id    uuid := current_setting('t.s3_id', true)::uuid;
  c_recy   uuid := current_setting('t.c_recy', true)::uuid;
  c_honest uuid := current_setting('t.c_honest', true)::uuid;
  v_leg_a int; v_leg_r int; v_consumio boolean; v_a_consumio boolean; v_clases int;
begin
  -- PRE: the row as history wrote it — asistida walk-in, charged asistencia, and the dead flag still set.
  update public.reservation set consumio = true
   where member_id = c_recy and class_session_id = s3_id;
  select count(*) into v_leg_a from public.asistencias a
    left join public.reservation r on r.id = a.reservation_id
   where a.cliente_id = c_recy and a.deleted_at is null and not a.perdonada
     and not coalesce(r.consumio, false);
  select count(*) into v_leg_r from public.reservation r
   where r.member_id = c_recy and r.consumio and r.status <> 'cancelada';
  if v_leg_r <> 1 or v_leg_a <> 0 then
    raise exception 'SETUP FAIL(v14c): the restored stale row derives legs (asistencia %, reserva %) — the state this backfill exists to heal is (0, 1)', v_leg_a, v_leg_r;
  end if;

  -- THE BACKFILL (verbatim, 20260828100000 §4).
  update public.reservation r
     set consumio = false
   where r.consumio
     and exists (
       select 1
         from public.asistencias a
        where a.reservation_id = r.id
          and a.cliente_id = r.member_id
          and a.class_session_id = r.class_session_id
          and a.deleted_at is null
          and a.consumio
     );

  -- POST: the stale pair is healed…
  select consumio into v_consumio from public.reservation where member_id = c_recy and class_session_id = s3_id;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v14c): the stale flag survived the backfill (%)', v_consumio; end if;
  select count(*) into v_leg_a from public.asistencias a
    left join public.reservation r on r.id = a.reservation_id
   where a.cliente_id = c_recy and a.deleted_at is null and not a.perdonada
     and not coalesce(r.consumio, false);
  select count(*) into v_leg_r from public.reservation r
   where r.member_id = c_recy and r.consumio and r.status <> 'cancelada';
  if v_leg_a <> 1 or v_leg_r <> 0 then
    raise exception 'RULE FAIL(v14c): after the backfill the legs read (asistencia %, reserva %) — expected (1, 0), the door charge dated at the class', v_leg_a, v_leg_r;
  end if;

  -- …and the HONEST booked→captured pair beside it is untouched: its asistencia is consumio = false, so
  -- it never matches the EXISTS. This is the assertion that stops the backfill from erasing real holds.
  select consumio into v_consumio from public.reservation where member_id = c_honest and class_session_id = s3_id;
  if v_consumio is distinct from true then
    raise exception 'RULE FAIL(v14c): the backfill cleared a HONEST booking''s hold (consumio %) — a captured booking would then be counted as free', v_consumio;
  end if;
  select consumio into v_a_consumio from public.asistencias
   where cliente_id = c_honest and class_session_id = s3_id and deleted_at is null;
  if v_a_consumio is distinct from false then raise exception 'RULE FAIL(v14c): the backfill touched an asistencia (consumio %) — it writes ONE column on ONE table', v_a_consumio; end if;
  select count(*) into v_leg_a from public.asistencias a
    left join public.reservation r on r.id = a.reservation_id
   where a.cliente_id = c_honest and a.deleted_at is null and not a.perdonada
     and not coalesce(r.consumio, false);
  select count(*) into v_leg_r from public.reservation r
   where r.member_id = c_honest and r.consumio and r.status <> 'cancelada';
  if v_leg_r <> 1 or v_leg_a <> 0 then
    raise exception 'RULE FAIL(v14c): the honest pair reads (asistencia %, reserva %) after the backfill — expected an untouched (0, 1)', v_leg_a, v_leg_r;
  end if;

  -- NO MONEY MOVED: the backfill writes a flag, never a balance.
  select clases_restantes into v_clases from public.clientes where id = c_recy;
  if v_clases <> 4 then raise exception 'RULE FAIL(v14c): the backfill moved the recycled member''s balance to % (expected 4)', v_clases; end if;
  select clases_restantes into v_clases from public.clientes where id = c_honest;
  if v_clases <> 4 then raise exception 'RULE FAIL(v14c): the backfill moved the booked member''s balance to % (expected 4)', v_clases; end if;
end $$;

select 'pasar_lista_sesion rules: OK' as result;
rollback;
