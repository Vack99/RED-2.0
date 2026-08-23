-- toggle_pase money-path rules (ADR-0005 atomic seam; ADR-0004 saldo; rulings C15 + C9; the
-- 2026-07-29 reservation-truthfulness rulings D1/D3/D4).
--
-- toggle_pase is the front-desk (date-keyed) Pasar lista. Its write-rules live ONLY in the RPC — they are
-- inseparable from the atomic on/off transaction (no orphan TS twin) — so this self-asserting SQL suite is
-- their committed test home, run against the REAL deployed function on a scratch project in a rolled-back
-- transaction. The vectors:
--   * refund-iff-consumed-and-not-ilimitado — finite ON consumes one (5->4); OFF refunds exactly one
--                                             (4->5). Ilimitado (clases_restantes NULL) ON/OFF never touches
--                                             the NULL. The `v_active_consumio and v_clases is not null` guard.
--   * gym_id stamped from the cliente's gym  — the new asistencia is born tenant-scoped, never null (slice #20).
--   * #237 zero-balance gate (owner ruling    — a finite cliente at 0 is HARD-REFUSED at the desk libre tap:
--     2026-08-04, 20260804120000)               'Sin clases disponibles', the SAME message reservar_clase raises
--                                             on the member path. No staff override, no warn-and-proceed;
--                                             nothing is written and the balance never moves. Replaces the old
--                                             admit-for-free behaviour this vector used to assert — the
--                                             cooldown-pardon arms (v5, v7 below) and ilimitado are UNTOUCHED,
--                                             because those visits are already paid.
--   * hora-stamp-today-only                  — hora stamped only when p_fecha is the gym's today (server tz),
--                                             null for a back-entry.
--   * C9 vigencia (inclusive)                — a WALK-IN mark on an expired package (vence < p_fecha) raises
--                                             'Paquete vencido'; the vence day itself (vence = p_fecha) passes.
--   * origen = 'libre' on every desk row     — #89: ACCESO LIBRE is a STATED visit kind, not the absence of a
--                                             class. Every row this seam writes carries it (and the schema's
--                                             asistencias_origen_kind_ck forbids pairing it with a session).
--   * resultado, the settlement outcome       — #233/#245 (20260804150000): the return carries the
--     (2026-08-04)                              discriminator the desk shows the operator. 'descontada' iff
--                                             the finite decrement ran, 'gratis' for ilimitado or any
--                                             pardoned (free) admission, 'reserva' when an existing
--                                             booking's HOLD was captured — which on this seam always
--                                             arrives via the delegation — and NULL on every un-mark.
--                                             Asserted alongside the written rows, never instead of them.
--
-- THE THREE ARMS OF A BOOKING (2026-07-29, #162): the old C15 branch pardoned a class-less mark whenever the
-- member held ANY reservada booking on p_fecha — a DAY-keyed answer to a question about an INSTANT. It is
-- replaced by the ARRIVAL WINDOW, `[starts_at-90, starts_at+duration+15)`, and a desk tap now lands in one of
-- three arms depending on where now() sits relative to that window. Four of the five vectors below are the
-- arms; the fifth is the stamp that makes visit counting possible:
--   * (v1) IN-window, ARM-ONLY ATTRIBUTION   — the tap DELEGATES to pasar_lista_sesion: the booking flips
--                                             asistida, the attendance row is SESSION-linked (origen='clase',
--                                             consumio=false, perdonada=false), NO class-less row is written,
--                                             the balance never moves, and the return carries the attributed
--                                             session id + the fresh balance (the desk's disclosure bundle).
--   * (v2) already asistida, in-window       — the second half of arm-only: the tap RAISES 'Ya marcada en la
--                                             clase de HH:MM' and writes NOTHING. Delegating to a TOGGLE would
--                                             have made this tap an eraser of a coach's mark; undo lives only
--                                             in the context that owns the mark (proved by the undo that hands
--                                             the fixture to the delegation vector below).
--   * (v3) PRE-window (>90 min early)        — the Ana ruling: no attribution, no pardon. The ordinary walk-in
--                                             path CHARGES (4->3, consumio=true), and the booking is left
--                                             strictly alone — reservada, checked_at null.
--   * (v4) CLOSED-window = FORFEIT           — #233/#245 REPLACES the Luis ruling's pardon. The member missed
--                                             the class and is at the door; the hold their booking took is
--                                             FORFEITED (booking untouched — still reservada, checked_at
--                                             null, no_show DERIVES at read, zero writes) and the door visit
--                                             is an ORDINARY walk-in that CHARGES (4->3, consumio=true,
--                                             perdonada=false, resultado 'descontada'). Two arms, and arm (b)
--                                             is the one live consequence of deleting the pardon: it sat
--                                             ABOVE the C9 vence gate, so an EXPIRED member holding a missed
--                                             booking used to be admitted free and is now refused at the door
--                                             with 'Paquete vencido', exactly like every other expired member.
--   * (v5) cooldown pardon stamps perdonada  — #169: a member marked in a class and tapped at the desk minutes
--                                             later is ONE arrival recorded twice; the second row is stamped
--                                             so a VISIT count can skip it. asistencias_mes_por_cliente then
--                                             returns 1 for that member, not 2, off two active rows.
--   * (v6) ORDER SYMMETRY (#245 §3)          — two identically-seeded members who each missed today's booking
--                                             and arrive once: one recorded door-then-class, the other
--                                             class-then-door. Both spend EXACTLY ONE walk-in charge on top of
--                                             the forfeited hold, and the vector asserts their balances are
--                                             the same number. The deleted chain-breaker made door-first cost
--                                             one credit MORE than class-first for the same arrival, which is
--                                             the defect this replaces the old chain-breaker vector to catch.
--   * (v7) free and duplicate are INDEPENDENT — the dual-surface arrival (class roster + door check-in): the
--                                             door row is free AND stamped, and the month count says 1, not 2.
--                                             Since #245 the COOLDOWN alone decides both facts (the
--                                             closed-window arm that used to decide the money is deleted), and
--                                             the written rows are unchanged — which is the point of asserting
--                                             rows rather than mechanisms.
--   * (v8) the attribution filters, pinned    — two states where deleting exactly one predicate changes the
--                                             written rows: (a) a BACKDATED desk entry must not attribute to
--                                             today's in-window class, (b) a CANCELLED class attributes
--                                             nothing. Its third arm (a WALK-IN row is not a booking) went
--                                             with the closed-window pardon it guarded; (v5) pins the two
--                                             surviving copies of that filter.
--   * (v9) the two edges of the payment key   — #245 §3's predicate is "the recent row was not itself
--                                             pardoned", and it has to get two opposite cases right:
--                                             (a) a CAPTURED booking paid via its hold (consumio=false,
--                                             resultado 'reserva') and therefore DOES pardon the door tap
--                                             minutes later — keying on consumio would double-charge it;
--                                             (b) a genuinely-unpaid row (itself pardoned) pardons NOTHING,
--                                             so a member with no booking at all cannot turn one paid class
--                                             into a free door visit AND a free second class.
--
--   * delegation to pasar_lista_sesion       — #89: the 3-arg call (p_session_id set) is the desk marking a
--                                             member IN A CLASS, which is the same act as the Agenda roster.
--                                             It must produce the Agenda's written rows exactly — the
--                                             reservation flipped to asistida (which the 2-arg path only ever
--                                             reaches through v1's attribution), a SESSION-linked asistencia
--                                             with origen='clase', consumio=false, and NO class-less desk row
--                                             — and the 3-arg undo must revert the reservation to reservada.
--   * C9 THROUGH the delegation (#163)       — #89: because the desk's DEFAULT state is a class pill, the 3-arg
--                                             path is now the desk's ordinary path, so the vence gate had to
--                                             move to the ROOT (pasar_lista_sesion, 20260728121000) or an
--                                             expired member would be admitted and charged off a dead package.
--                                             Two arms, the same split the 2-arg path has always had: an
--                                             expired WALK-IN raises 'Paquete vencido' and writes nothing (no
--                                             asistencia, no reservation, balance untouched); an expired
--                                             member who HOLDS a reservada booking is still marked, consumio
--                                             =false — the booked branch is exempt, because that class was
--                                             already paid for and expiring afterwards must not strand them.
--                                             Asserted here rather than in pasar_lista_sesion_rules because
--                                             the delegation is a straight `return query select * from
--                                             pasar_lista_sesion(...)`: proving it through the desk proves the
--                                             Agenda path too, and it reuses this suite's expired seeds.
--
-- FROZEN CLOCK, and why every session is BOOKED BEFORE IT IS MOVED: the whole suite runs in ONE transaction,
-- so now() is a single frozen instant and no session can drift across a window edge mid-run. The window
-- positions are therefore created by BACKDATING starts_at with a privileged UPDATE — and that update must
-- come AFTER the booking, because reservar_clase now refuses a session that has already started (#165).
-- Every p_fecha below is derived from the session's OWN gym-local date after the move, never assumed to be
-- "today": a window edge three hours either side of now() legitimately lands on the neighbouring day.
--
-- Per-gym & Contract-B clean (was quarantined pre-B for seeding the dropped user_id columns): a synthetic
-- gym, its operator (gym_membership), and all clientes are minted tx-local with gen_random_uuid(); zero
-- prod UUIDs, zero user_id references. Self-asserting: every check RAISEs on a mismatch; a clean run returns
-- one 'OK' row. BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into SUITE —
-- or ad hoc via the Supabase MCP execute_sql against a scratch project.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  v_gym    uuid := gen_random_uuid();
  v_tz     text := 'America/Mexico_City';
  v_today  date := (now() at time zone 'America/Mexico_City')::date;
  -- Every session is born TWO DAYS OUT so reservar_clase's #165 started-class gate cannot refuse the
  -- booking below; the privileged block after the booking moves each one onto its window position.
  v_starts timestamptz := now() + interval '2 days';
  op       uuid := gen_random_uuid();   -- the operator (staff) — the toggle_pase caller
  m_res    uuid := gen_random_uuid();   -- member who books a class (reservar_clase runs as them)
  c_finite uuid; c_ilim uuid; c_zero uuid; c_expired uuid; c_venceday uuid; c_res uuid;
  c_expres uuid;                        -- expired AND holding a reservada booking (#163 booked-exempt arm)
  c_prev   uuid;                        -- (v3) books, then walks in >90 min early — the Ana arm
  c_cerr   uuid;                        -- (v4) misses the class, arrives after the window closed — Luis
  c_expcerr uuid;                       -- (v4) the same, on an EXPIRED package — the pardon-above-C9 arm
  c_pard   uuid;                        -- (v5) class mark + desk tap inside the cooldown — perdonada
  c_chain  uuid;                        -- (v6i)  missed booking, DOOR then CLASS — the order-symmetry pair
  c_orden  uuid;                        -- (v6ii) the same member, CLASS then DOOR — must cost the same
  c_cap    uuid;                        -- (v8c-i) booking CAPTURED on the roster, then a door tap
  c_free   uuid;                        -- (v8c-ii) the free-rider: a pardoned row must pardon nothing
  c_dual   uuid;                        -- (v7) class mark → free door tap: free AND duplicate
  c_back   uuid;                        -- (v8a) in-window booking, tap BACKDATED to another fecha
  c_can    uuid;                        -- (v8b) booking on a CANCELLED in-window class
  v_ct     uuid; s_id uuid; s_pre uuid; s_cls uuid; s_cls2 uuid; s_can uuid;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (v_gym, 'toggle-pase-rules-suite-gym', 'Toggle Pase Rules Suite', v_tz, 'base');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', op,    'authenticated', 'authenticated', 'tp-op@test.local'),
    ('00000000-0000-0000-0000-000000000000', m_res, 'authenticated', 'authenticated', 'tp-res@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (op, v_gym, 'operator'),
    (m_res, v_gym, 'member');

  -- CRM rows (no auth_user_id needed — the operator marks them); one linked member (c_res) who books.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP finite', '5550000001', 5, v_today + 20, '8 clases', v_gym) returning id into c_finite;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP ilimitado', '5550000002', null, v_today + 20, 'mes', v_gym) returning id into c_ilim;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP zero', '5550000003', 0, v_today + 20, '8 clases', v_gym) returning id into c_zero;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP expired', '5550000004', 5, v_today - 1, '8 clases', v_gym) returning id into c_expired;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP vence hoy', '5550000005', 5, v_today, '8 clases', v_gym) returning id into c_venceday;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('TP reservado', '5550000006', 5, v_today + 20, '8 clases', v_gym, m_res) returning id into c_res;
  -- Balance 4 = the class already consumed at booking (the state reservar_clase leaves behind).
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP expirado con reserva', '5550000007', 4, v_today - 1, '8 clases', v_gym) returning id into c_expres;
  -- The window-arm members: all seeded at 4 = post-booking, since their bookings are seeded directly (below).
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP pre ventana', '5550000008', 4, v_today + 20, '8 clases', v_gym) returning id into c_prev;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP ventana cerrada', '5550000009', 4, v_today + 20, '8 clases', v_gym) returning id into c_cerr;
  -- vence is re-stamped in the privileged block below, RELATIVE to the closed session's own gym-local date.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP vencido ventana cerrada', '5550000010', 4, v_today + 20, '8 clases', v_gym) returning id into c_expcerr;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP perdonada', '5550000011', 5, v_today + 20, '8 clases', v_gym) returning id into c_pard;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP cadena perdon', '5550000012', 4, v_today + 20, '8 clases', v_gym) returning id into c_chain;
  -- c_dual starts at 5: its class mark charges one (5->4) before the door tap that must come free.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP doble superficie', '5550000013', 5, v_today + 20, '8 clases', v_gym) returning id into c_dual;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP entrada retro', '5550000014', 4, v_today + 20, '8 clases', v_gym) returning id into c_back;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP clase cancelada', '5550000015', 4, v_today + 20, '8 clases', v_gym) returning id into c_can;
  -- #245 §3, the order-symmetry pair and its two companions. c_orden is c_chain's twin down to the
  -- balance (4 = the hold already taken by the booking it missed): the ONLY difference between them is
  -- which surface the operator touches first, and the suite's claim is that the difference costs
  -- nothing. c_cap holds a booking it will have CAPTURED on the roster before its door tap; c_free
  -- holds none and manufactures a genuinely-unpaid libre row to prove such a row pardons nothing.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP orden inverso', '5550000016', 4, v_today + 20, '8 clases', v_gym) returning id into c_orden;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP reserva capturada', '5550000017', 4, v_today + 20, '8 clases', v_gym) returning id into c_cap;
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('TP gorron', '5550000018', 5, v_today + 20, '8 clases', v_gym) returning id into c_free;

  insert into public.class_type (gym_id, name) values (v_gym, 'TP Metcon') returning id into v_ct;
  -- s_id   → moved INTO the arrival window (v1/v2 + the delegation vectors + v8a)
  -- s_pre  → moved to >90 min ahead of now() (v3, pre-window)
  -- s_cls  → moved to before the window's close (v4, v6, v7, v8c)
  -- s_cls2 → moved onto s_cls' OWN gym-local date (see the positioning block): v6/v7 need a class on
  --          that date the member does NOT hold a booking for (the walk-in branch).
  -- s_can  → moved into the window AND cancelled (v8b)
  -- The five seeds are an hour apart rather than stacked on one instant: since the 2026-08-23
  -- slot-exclusivity ruling (20260823120100) a gym holds at most ONE uncancelled class per instant.
  -- These seed instants are throwaway — every session is repositioned below — so the only property
  -- that has to survive is "two days out", which all five keep.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts, 60, 20) returning id into s_id;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts + interval '1 hour', 60, 20) returning id into s_pre;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts + interval '2 hours', 60, 20) returning id into s_cls;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts + interval '3 hours', 60, 20) returning id into s_cls2;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (v_gym, v_ct, v_starts + interval '4 hours', 60, 20) returning id into s_can;

  -- These four bookings are seeded DIRECTLY rather than through reservar_clase, which refuses an expired
  -- booker outright ('Paquete vencido', 20260706170000:173-175) and, since #165, a started class as well.
  -- c_expres' state (booked AND expired) can only arise in real life from a package that lapses BETWEEN the
  -- booking and the class — exactly the state the booked-branch exemption exists for, and the one the
  -- walk-in gate must not swallow. The three window-arm members are seeded the same way for the same
  -- reason: c_expcerr is expired, and the closed session has by definition already started. Their balances
  -- are seeded at 4, i.e. the class already consumed at booking.
  --
  -- RETIRED BY #245: this list used to carry one SYNTHETIC row — `reservada` AND `is_walk_in` on the
  -- closed session (c_wcls) — whose only job was to pin the `is_walk_in = false` filter on the
  -- closed-window pardon. That pardon is deleted (§2) and its chain-breaker with it (§3), so the two
  -- surviving copies of that filter are toggle_pase's attribution select and its already-marked no-op
  -- — both of which (v5) already pins, with an in-window walk-in row that must be invisible to each.
  -- The fixture is therefore gone rather than kept as decoration, and its slot is spent on the
  -- order-symmetry members instead.
  insert into public.reservation (gym_id, class_session_id, member_id, status, is_walk_in) values
    (v_gym, s_id,  c_expres,  'reservada', false),
    (v_gym, s_pre, c_prev,    'reservada', false),
    (v_gym, s_cls, c_cerr,    'reservada', false),
    (v_gym, s_cls, c_expcerr, 'reservada', false),
    (v_gym, s_id,  c_back,    'reservada', false),
    (v_gym, s_can, c_can,     'reservada', false),
    (v_gym, s_cls, c_chain,   'reservada', false),
    (v_gym, s_cls, c_orden,   'reservada', false),
    (v_gym, s_cls, c_cap,     'reservada', false),
    (v_gym, s_cls, c_dual,    'reservada', false);

  perform set_config('t.gym',       v_gym::text,      true);
  perform set_config('t.today',     v_today::text,    true);
  perform set_config('t.op',        op::text,         true);
  perform set_config('t.m_res',     m_res::text,      true);
  perform set_config('t.c_finite',  c_finite::text,   true);
  perform set_config('t.c_ilim',    c_ilim::text,     true);
  perform set_config('t.c_zero',    c_zero::text,     true);
  perform set_config('t.c_expired', c_expired::text,  true);
  perform set_config('t.c_venceday',c_venceday::text, true);
  perform set_config('t.c_res',     c_res::text,      true);
  perform set_config('t.c_expres',  c_expres::text,   true);
  perform set_config('t.c_prev',    c_prev::text,     true);
  perform set_config('t.c_cerr',    c_cerr::text,     true);
  perform set_config('t.c_expcerr', c_expcerr::text,  true);
  perform set_config('t.c_pard',    c_pard::text,     true);
  perform set_config('t.c_chain',   c_chain::text,    true);
  perform set_config('t.c_dual',    c_dual::text,     true);
  perform set_config('t.c_back',    c_back::text,     true);
  perform set_config('t.c_can',     c_can::text,      true);
  perform set_config('t.c_orden',   c_orden::text,    true);
  perform set_config('t.c_cap',     c_cap::text,      true);
  perform set_config('t.c_free',    c_free::text,     true);
  perform set_config('t.s_id',      s_id::text,       true);
  perform set_config('t.s_pre',     s_pre::text,      true);
  perform set_config('t.s_cls',     s_cls::text,      true);
  perform set_config('t.s_cls2',    s_cls2::text,     true);
  perform set_config('t.s_can',     s_can::text,      true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- The reserved member books ahead (as themselves) — reservar_clase consumes ONCE (5->4).
-- The session is still two days out here: booking FIRST is now mandatory (#165 refuses a started class).
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_res', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare s_id uuid := current_setting('t.s_id', true)::uuid; v_clases int;
begin
  perform public.reservar_clase(s_id);
  select clases_restantes into v_clases from public.clientes where id = current_setting('t.c_res', true)::uuid;
  if v_clases <> 4 then raise exception 'SEED FAIL(res book): expected 4 after booking, got %', v_clases; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- POSITION THE SESSIONS ON THE WINDOW (privileged — no RPC can move a class's start, and the member
-- role holds no class_session write). now() is frozen for the whole transaction, so these three
-- instants are stable window positions, not a race:
--   s_id   = now() + 30 min → the window [start-90, start+75) CONTAINS now()   (v1, v2, delegation, v8a)
--   s_pre  = now() + 3 h    → now() is 90 min BEFORE the window opens          (v3, the Ana arm)
--   s_cls  = now() - 3 h    → the window closed 105 min ago                    (v4, v6, v7, v8c)
--   s_cls2 = 00:30 on s_cls' OWN gym-local date → shares that date whatever the hour, and its window
--            (close = start + 75 min = 01:45 local) is necessarily already closed: now() is at least
--            three hours past that date's 00:00, because now() - 3 h is what fell on the date.
--            NOT the same instant as s_cls any more — since the 2026-08-23 slot-exclusivity ruling
--            (20260823120100) a gym holds at most ONE uncancelled class per instant, and the vector
--            only ever needed the DATE, not the instant.
--   s_can  = now() + 30 min, CANCELLED → in-window but cancelled                (v8b)
-- Each session's own gym-local date is published as t.f_* and used as p_fecha from here on: a window
-- edge three hours either side of now() can legitimately fall on the neighbouring day, and every gate
-- in play (attribution, the pardon, the cooldown) keys on `session date = p_fecha`.
-- ════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_tz   text;
  s_id   uuid := current_setting('t.s_id',   true)::uuid;
  s_pre  uuid := current_setting('t.s_pre',  true)::uuid;
  s_cls  uuid := current_setting('t.s_cls',  true)::uuid;
  s_cls2 uuid := current_setting('t.s_cls2', true)::uuid;
  s_can  uuid := current_setting('t.s_can',  true)::uuid;
  t_win timestamptz := now() + interval '30 minutes';
  t_pre timestamptz := now() + interval '3 hours';
  t_cls timestamptz := now() - interval '3 hours';
begin
  select timezone into v_tz from public.gym where id = current_setting('t.gym', true)::uuid;

  update public.class_session set starts_at = t_win where id = s_id;
  update public.class_session set starts_at = t_pre where id = s_pre;
  update public.class_session set starts_at = t_cls where id = s_cls;
  update public.class_session
     set starts_at = (((t_cls at time zone v_tz)::date + time '00:30') at time zone v_tz)
   where id = s_cls2;
  -- The gym cancels the class the member is booked into, and it is still inside its arrival window —
  -- the ONE fixture where the attribution's `cancelled_at is null` filter and the closed-window pardon
  -- (which deliberately has NO cancelled filter) give different answers, so v8b can tell them apart.
  update public.class_session set starts_at = t_win, cancelled_at = now() where id = s_can;

  perform set_config('t.f_win', ((t_win at time zone v_tz)::date)::text, true);
  perform set_config('t.f_pre', ((t_pre at time zone v_tz)::date)::text, true);
  perform set_config('t.f_cls', ((t_cls at time zone v_tz)::date)::text, true);

  -- c_expcerr's package must be expired ON THE CLOSED SESSION'S OWN DAY for the (v4) expired arm to mean
  -- anything — seeded relative to that date, never to "today", for the midnight reason above.
  update public.clientes set vence = ((t_cls at time zone v_tz)::date) - 1
   where id = current_setting('t.c_expcerr', true)::uuid;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- Everything below runs AS THE OPERATOR (staff) — the front-desk Pasar lista caller.
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_gym      uuid := current_setting('t.gym', true)::uuid;
  v_today    date := current_setting('t.today', true)::date;
  v_back     date := current_setting('t.today', true)::date - 3;   -- a back-entry day, never gym-today
  c_finite   uuid := current_setting('t.c_finite', true)::uuid;
  c_ilim     uuid := current_setting('t.c_ilim', true)::uuid;
  c_zero     uuid := current_setting('t.c_zero', true)::uuid;
  c_expired  uuid := current_setting('t.c_expired', true)::uuid;
  c_venceday uuid := current_setting('t.c_venceday', true)::uuid;
  v_agym uuid; v_clases int; v_present boolean; v_hora text; v_stored time; v_raised boolean; v_origen text;
  v_perdonada boolean; v_saldo int; v_filas int; v_resultado text;
begin
  -- ── refund-iff-consumed-and-not-ilimitado + gym_id stamp + origen + the returned balance ────────
  select present, clases_restantes, resultado into v_present, v_saldo, v_resultado from public.toggle_pase(c_finite, v_today);
  if v_present is not true then raise exception 'RULE FAIL(b): finite ON not present'; end if;
  -- #245: the outcome the desk shows the operator. A finite decrement ran, so it is 'descontada' — and
  -- it must AGREE with the balance move asserted two lines down; a discriminator that disagrees with
  -- the ledger is worse than none.
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(res): finite ON resultado % (expected descontada)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_finite;
  if v_clases <> 4 then raise exception 'RULE FAIL(b): finite ON expected 4, got %', v_clases; end if;
  -- the RETURNED balance is the post-write one (the desk repaints the row from it, #162 disclosure).
  if v_saldo is distinct from 4 then raise exception 'RULE FAIL(b): finite ON returned clases_restantes % (expected the fresh 4)', v_saldo; end if;
  select gym_id, origen, perdonada into v_agym, v_origen, v_perdonada from public.asistencias
   where cliente_id = c_finite and fecha = v_today and deleted_at is null order by created_at desc limit 1;
  if v_agym is distinct from v_gym then raise exception 'RULE FAIL(gym): asistencia.gym_id % expected %', v_agym, v_gym; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(origen): desk row origen % (expected libre — a STATED ACCESO LIBRE visit, #89)', v_origen; end if;
  -- an ordinary charged walk-in is NOT a pardoned duplicate: perdonada must stay false (#169).
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(perdonada): a plain charged desk row was stamped perdonada %', v_perdonada; end if;

  select present, clases_restantes, resultado into v_present, v_saldo, v_resultado from public.toggle_pase(c_finite, v_today);
  if v_present is not false then raise exception 'RULE FAIL(b): finite OFF not absent'; end if;
  -- #245: an un-mark settles nothing, so it discloses nothing — resultado is NULL on every OFF path.
  if v_resultado is not null then raise exception 'RULE FAIL(res): finite OFF resultado % (expected NULL — an undo settles nothing)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_finite;
  if v_clases <> 5 then raise exception 'RULE FAIL(b): finite OFF expected refund to 5, got %', v_clases; end if;
  if v_saldo is distinct from 5 then raise exception 'RULE FAIL(b): finite OFF returned clases_restantes % (expected the refunded 5)', v_saldo; end if;

  select present, resultado into v_present, v_resultado from public.toggle_pase(c_ilim, v_today);
  if v_present is not true then raise exception 'RULE FAIL(b): ilimitado ON not present'; end if;
  -- #245: ilimitado is admitted and never charged, which is 'gratis' — never 'descontada'.
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(res): ilimitado ON resultado % (expected gratis)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(b): ilimitado ON should stay null, got %', v_clases; end if;
  -- (d) ilimitado is EXEMPT from the #237 zero-balance gate (v_clases IS NULL never satisfies the
  -- `<= 0` check below) — admitted, and never charged (consumio=false, as always).
  select consumio into v_present from public.asistencias
   where cliente_id = c_ilim and fecha = v_today and deleted_at is null order by created_at desc limit 1;
  if v_present is distinct from false then raise exception 'RULE FAIL(d): ilimitado row consumio % (expected false)', v_present; end if;
  select present, clases_restantes into v_present, v_saldo from public.toggle_pase(c_ilim, v_today);
  if v_present is not false then raise exception 'RULE FAIL(b): ilimitado OFF not absent'; end if;
  if v_saldo is not null then raise exception 'RULE FAIL(b): ilimitado OFF returned clases_restantes % (expected NULL)', v_saldo; end if;
  select clases_restantes into v_clases from public.clientes where id = c_ilim;
  if v_clases is not null then raise exception 'RULE FAIL(b): ilimitado OFF should stay null (no phantom refund), got %', v_clases; end if;

  -- ── (a) #237 zero-balance gate: a finite cliente at 0 is HARD-REFUSED, not admitted for free ──
  -- Owner ruling 2026-08-04, mirrors #235's member-facing ruling: 'Sin clases disponibles', the SAME
  -- message reservar_clase raises. No staff override, no warn-and-proceed — nothing is written.
  v_raised := false;
  begin
    perform public.toggle_pase(c_zero, v_today);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Sin clases disponibles%' then raise exception 'RULE FAIL(a): wrong raise for a zero-balance desk tap: %', sqlerrm; end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(a): a ZERO-BALANCE member was admitted at the desk (the #237 hole)'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_zero;
  if v_clases <> 0 then raise exception 'RULE FAIL(a): the refused tap moved the balance to % (expected untouched 0)', v_clases; end if;
  select count(*) into v_filas from public.asistencias where cliente_id = c_zero and deleted_at is null;
  if v_filas <> 0 then raise exception 'RULE FAIL(a): the refused tap wrote % attendance rows (expected 0)', v_filas; end if;

  -- ── hora-stamp-today-only ───────────────────────────────────────────────────────
  select present, hora into v_present, v_hora from public.toggle_pase(c_finite, v_today);
  if v_hora is null then raise exception 'RULE FAIL(c): toggle ON today returned null hora'; end if;
  select hora into v_stored from public.asistencias
   where cliente_id = c_finite and fecha = v_today and deleted_at is null order by created_at desc limit 1;
  if v_stored is null then raise exception 'RULE FAIL(c): toggle ON today stored null hora'; end if;
  perform public.toggle_pase(c_finite, v_today);   -- OFF (cleanup so the back-entry row is fresh)

  select present, hora into v_present, v_hora from public.toggle_pase(c_finite, v_back);
  if v_present is not true then raise exception 'RULE FAIL(c): back-entry ON not present'; end if;
  if v_hora is not null then raise exception 'RULE FAIL(c): back-entry ON returned hora % (expected null)', v_hora; end if;
  select hora into v_stored from public.asistencias
   where cliente_id = c_finite and fecha = v_back and deleted_at is null order by created_at desc limit 1;
  if v_stored is not null then raise exception 'RULE FAIL(c): back-entry ON stored hora % (expected null)', v_stored; end if;

  -- ── C9 vigencia (inclusive): vence-day valid ON succeeds; expired raises 'Paquete vencido' ──
  -- vence = today: the vence day itself still passes (vence < p_fecha blocks; equality does not).
  select present into v_present from public.toggle_pase(c_venceday, v_today);
  if v_present is not true then raise exception 'RULE FAIL(vig): vence-day ON refused (expected valid)'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_venceday;
  if v_clases <> 4 then raise exception 'RULE FAIL(vig): vence-day ON expected consume to 4, got %', v_clases; end if;

  -- vence < today: expired — a walk-in mark must be refused, and nothing written.
  v_raised := false;
  begin
    perform public.toggle_pase(c_expired, v_today);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Paquete vencido%' then raise exception 'RULE FAIL(vig): wrong raise for expired: %', sqlerrm; end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(vig): expired package ON was NOT refused'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_expired;
  if v_clases <> 5 then raise exception 'RULE FAIL(vig): expired ON moved balance to % (expected untouched 5)', v_clases; end if;
  select count(*) into v_clases from public.asistencias where cliente_id = c_expired and deleted_at is null;
  if v_clases <> 0 then raise exception 'RULE FAIL(vig): expired ON wrote % attendance rows (expected 0)', v_clases; end if;
end $$;

-- ── (v1) IN-WINDOW ATTRIBUTION + (v2) the already-marked NO-OP (#162, D1) ────────────────────────
-- This block replaces the old C15 vector. The member holds a reservada booking on a session whose
-- ARRIVAL WINDOW contains now(), and the operator taps them on the LIBRE tab — the tap the old code
-- answered with a free class-less row that left the roster reading them absent.
--
-- (v1) It now DELEGATES: the write is pasar_lista_sesion's booked branch, reached from the desk. The
--      proof is entirely in the written rows — reservation asistida + checked_at, a SESSION-linked
--      asistencia (origen='clase', consumio=false, perdonada=false), NO class-less row anywhere, and a
--      balance that never moves. The RETURN's session id + fresh balance are asserted as a bonus: they
--      are what lets the desk say WHERE the mark landed, but the rows are the contract.
-- (v2) Tapping again does NOT undo it. Arm-only: the RPC raises 'Ya marcada en la clase de HH:MM' and
--      writes nothing at all — no libre row, no second class row, no status change, no balance move.
--      Undo lives only in the context that owns the mark, which the 3-arg call at the tail performs.
do $$
declare
  c_res   uuid := current_setting('t.c_res', true)::uuid;
  s_id    uuid := current_setting('t.s_id', true)::uuid;
  f_win   date := current_setting('t.f_win', true)::date;
  v_gym   uuid := current_setting('t.gym', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_status text; v_origen text;
  v_sess uuid; v_ret_sess uuid; v_saldo int; v_checked timestamptz; v_walk boolean;
  v_perdonada boolean; v_gym_id uuid; v_res_id uuid; v_n int; v_raised boolean; v_msg text; v_resultado text;
begin
  -- precondition: reservada booking + balance 4 (consumed at booking), no attendance yet.
  select status into v_status from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'SEED FAIL(v1): expected reservada, got %', v_status; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'SEED FAIL(v1): expected 4 pre-pase, got %', v_clases; end if;

  -- ── (v1) the 2-arg desk tap, inside the window ────────────────────────────────
  select present, session_id, clases_restantes, resultado into v_present, v_ret_sess, v_saldo, v_resultado
    from public.toggle_pase(c_res, f_win);
  if v_present is not true then raise exception 'RULE FAIL(v1): in-window tap did not mark present'; end if;
  -- #245: the tap CAPTURED the hold this booking took at reservar_clase time. Not 'gratis' — free and
  -- captured are different facts, and only 'reserva' lets the desk say "ya estaba pagada, es su reserva".
  if v_resultado is distinct from 'reserva' then raise exception 'RULE FAIL(v1): resultado % (expected reserva — the delegation captured a hold)', v_resultado; end if;

  -- The RESERVATION flipped — the write the class-less path can never make.
  select status, checked_at, is_walk_in into v_status, v_checked, v_walk
    from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(v1): reservation status % (expected asistida — the tap did not attribute)', v_status; end if;
  if v_checked is null then raise exception 'RULE FAIL(v1): reservation.checked_at not stamped'; end if;
  if v_walk is not false then raise exception 'RULE FAIL(v1): a real booking was flagged is_walk_in'; end if;

  -- The attendance row is SESSION-linked, stated 'clase', unpaid, NOT a pardoned duplicate, gym-stamped.
  select consumio, origen, perdonada, class_session_id, gym_id, reservation_id
    into v_consumio, v_origen, v_perdonada, v_sess, v_gym_id, v_res_id
    from public.asistencias where cliente_id = c_res and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v1): asistencia.consumio % (expected false — paid at booking)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(v1): asistencia.origen % (expected clase)', v_origen; end if;
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(v1): asistencia.perdonada % (expected false — an attributed mark is one visit, not a duplicate)', v_perdonada; end if;
  if v_sess is distinct from s_id then raise exception 'RULE FAIL(v1): asistencia.class_session_id mismatch'; end if;
  if v_gym_id is distinct from v_gym then raise exception 'RULE FAIL(v1): asistencia.gym_id % expected %', v_gym_id, v_gym; end if;
  if v_res_id is null then raise exception 'RULE FAIL(v1): asistencia.reservation_id null (expected linked)'; end if;

  -- …and NO class-less desk row exists anywhere for this member: one act, one row.
  select count(*) into v_n from public.asistencias
   where cliente_id = c_res and deleted_at is null and class_session_id is null;
  if v_n <> 0 then raise exception 'RULE FAIL(v1): a class-less desk row was written too (%, expected 0)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(v1): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;

  -- BONUS (the disclosure bundle, not the contract): the return names the session it landed in and
  -- carries the fresh balance, which is what the desk needs to redirect its optimistic flip.
  if v_ret_sess is distinct from s_id then raise exception 'RULE FAIL(v1): returned session_id % (expected the attributed session)', v_ret_sess; end if;
  if v_saldo is distinct from 4 then raise exception 'RULE FAIL(v1): returned clases_restantes % (expected 4)', v_saldo; end if;

  -- ── (v2) tap again: NO-OP + raise, never an undo ──────────────────────────────
  v_raised := false;
  begin
    perform public.toggle_pase(c_res, f_win);
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
    if sqlerrm not like 'Ya marcada%' then raise exception 'RULE FAIL(v2): wrong raise on an already-marked member: %', sqlerrm; end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(v2): a second in-window tap did NOT raise — it silently erased or duplicated a mark'; end if;
  -- the message names the class, because that is the whole no-op UX (the desk shows res.message).
  if v_msg not like '%:%' then raise exception 'RULE FAIL(v2): the raise does not name the class hora (%)', v_msg; end if;
  -- NOTHING moved: the reservation, the class row, the balance and the (absent) libre row are all as (v1) left them.
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(v2): the no-op reverted the reservation to % — the eraser is back', v_status; end if;
  if v_checked is null then raise exception 'RULE FAIL(v2): the no-op cleared checked_at'; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_res and deleted_at is null;
  if v_n <> 1 then raise exception 'RULE FAIL(v2): active asistencia rows % (expected exactly the 1 class row)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(v2): the no-op moved the balance to % (expected 4)', v_clases; end if;

  -- ── the undo lives in the OWNING context — and hands the fixture to the delegation vector ──
  select present into v_present from public.toggle_pase(c_res, f_win, s_id);
  if v_present is not false then raise exception 'RULE FAIL(v2 undo): the owning context did not undo the mark'; end if;
  select status into v_status from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(v2 undo): reservation status % (expected reservada)', v_status; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(v2 undo): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
end $$;

-- ── DELEGATION (#89): the 3-arg call IS pasar_lista_sesion, not a second implementation ─────────
-- The desk marking a member in a class context and the Agenda roster marking them are the same act, so
-- toggle_pase(cliente, fecha, session) delegates wholesale rather than re-deriving the semantics — which
-- is precisely how the two surfaces drifted apart in the first place (the 2026-07-10 guards). The proof
-- is in the WRITTEN ROWS: the outcomes below are byte-for-byte pasar_lista_sesion's booked branch,
-- including the reservation flip. p_fecha is ignored on this path — the session's own date governs.
--
-- Continues from the vector above: c_res still holds its reservada booking at balance 4, its class row
-- was undone, and no class-less row was ever written.
do $$
declare
  c_res   uuid := current_setting('t.c_res', true)::uuid;
  s_id    uuid := current_setting('t.s_id', true)::uuid;
  v_today date := current_setting('t.today', true)::date;
  v_gym   uuid := current_setting('t.gym', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text;
  v_res_id uuid; v_checked timestamptz; v_walk boolean; v_gym_id uuid; v_n int; v_ret_sess uuid; v_resultado text;
begin
  -- precondition: the booking is back to reservada and nothing was refunded.
  select status into v_status from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'SEED FAIL(deleg): expected reservada, got %', v_status; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'SEED FAIL(deleg): expected 4 pre-pase, got %', v_clases; end if;

  -- ON (3-arg): the booked branch of pasar_lista_sesion, reached through the desk.
  select present, session_id, resultado into v_present, v_ret_sess, v_resultado from public.toggle_pase(c_res, v_today, s_id);
  if v_present is not true then raise exception 'RULE FAIL(deleg ON): not present'; end if;
  -- the delegated return passes the session id straight through (the desk's class-pill path).
  if v_ret_sess is distinct from s_id then raise exception 'RULE FAIL(deleg ON): returned session_id % (expected %)', v_ret_sess, s_id; end if;
  -- …and so does resultado (#245): the 3-arg call is `return query select * from pasar_lista_sesion(…)`,
  -- so a widened row that dropped or re-derived a column here would be the drift this delegation exists
  -- to prevent.
  if v_resultado is distinct from 'reserva' then raise exception 'RULE FAIL(deleg ON): resultado % (expected reserva)', v_resultado; end if;

  -- The RESERVATION flipped — the written row the 2-arg desk path only reaches through attribution.
  select status, checked_at, is_walk_in into v_status, v_checked, v_walk
    from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(deleg ON): reservation status % (expected asistida)', v_status; end if;
  if v_checked is null then raise exception 'RULE FAIL(deleg ON): reservation.checked_at not stamped'; end if;
  if v_walk is not false then raise exception 'RULE FAIL(deleg ON): a real booking was flagged is_walk_in'; end if;

  -- The attendance row is SESSION-linked, origen='clase', consumio=false, gym-stamped, reservation-linked.
  select consumio, origen, gym_id, reservation_id into v_consumio, v_origen, v_gym_id, v_res_id
    from public.asistencias where cliente_id = c_res and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(deleg ON): asistencia.consumio % (expected false — paid at booking)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(deleg ON): asistencia.origen % (expected clase)', v_origen; end if;
  if v_gym_id is distinct from v_gym then raise exception 'RULE FAIL(deleg ON): asistencia.gym_id % expected %', v_gym_id, v_gym; end if;
  if v_res_id is null then raise exception 'RULE FAIL(deleg ON): asistencia.reservation_id null (expected linked)'; end if;

  -- …and NO class-less desk row was written alongside it: one act, one row.
  select count(*) into v_n from public.asistencias
   where cliente_id = c_res and deleted_at is null and class_session_id is null;
  if v_n <> 0 then raise exception 'RULE FAIL(deleg ON): a class-less desk row was written too (%, expected 0)', v_n; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(deleg ON): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;

  -- OFF (3-arg): the undo reverts the reservation to its held state and refunds nothing.
  select present, resultado into v_present, v_resultado from public.toggle_pase(c_res, v_today, s_id);
  if v_present is not false then raise exception 'RULE FAIL(deleg OFF): still present'; end if;
  if v_resultado is not null then raise exception 'RULE FAIL(deleg OFF): resultado % (expected NULL on an un-mark)', v_resultado; end if;
  select status, checked_at into v_status, v_checked
    from public.reservation where member_id = c_res and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(deleg OFF): reservation status % (expected reservada)', v_status; end if;
  if v_checked is not null then raise exception 'RULE FAIL(deleg OFF): checked_at not cleared on revert (%)', v_checked; end if;
  select clases_restantes into v_clases from public.clientes where id = c_res;
  if v_clases <> 4 then raise exception 'RULE FAIL(deleg OFF): PHANTOM REFUND — balance % (expected 4)', v_clases; end if;
  select count(*) into v_n from public.asistencias
   where cliente_id = c_res and class_session_id = s_id and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(deleg OFF): active session asistencia rows % (expected 0)', v_n; end if;
end $$;

-- ── C9 THROUGH THE DELEGATION (#89 closes #163): the class pill is vence-gated too ──────────────
-- Before #89 the vence gate lived only in toggle_pase's class-less path, and pasar_lista_sesion had none
-- (#163). The delegation made that asymmetry a live hole rather than a filed one: a class pill is the
-- desk's DEFAULT state, so the 3-arg call is the ordinary desk tap, and an ungated root would admit an
-- expired member and charge the class off a dead package — a REGRESSION on what the 2-arg path has always
-- done. The fix is at the root, so both surfaces share one rule; these two arms prove both halves of it
-- through the desk, which is also proof for the Agenda path (the delegation is a straight
-- `return query select * from public.pasar_lista_sesion(...)`).
do $$
declare
  c_expired uuid := current_setting('t.c_expired', true)::uuid;
  c_expres  uuid := current_setting('t.c_expres',  true)::uuid;
  s_id      uuid := current_setting('t.s_id',      true)::uuid;
  v_today   date := current_setting('t.today',     true)::date;
  v_gym     uuid := current_setting('t.gym',       true)::uuid;
  v_present boolean; v_raised boolean; v_clases int; v_n int;
  v_consumio boolean; v_origen text; v_status text; v_walk boolean; v_sess uuid; v_gym_id uuid;
begin
  -- ── (a) EXPIRED WALK-IN through the class pill: refused, and NOTHING survives ────
  v_raised := false;
  begin
    perform public.toggle_pase(c_expired, v_today, s_id);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Paquete vencido%' then
      raise exception 'RULE FAIL(vig deleg): wrong raise for an expired walk-in on the class path: %', sqlerrm;
    end if;
  end;
  if not v_raised then
    raise exception 'RULE FAIL(vig deleg): an EXPIRED member was admitted through the class pill (the #163 hole)';
  end if;
  -- Written rows: none. Not the asistencia, not the walk-in reservation the walk-in branch would have
  -- minted, and not the balance — the gate sits above every write in that branch.
  select clases_restantes into v_clases from public.clientes where id = c_expired;
  if v_clases <> 5 then raise exception 'RULE FAIL(vig deleg): expired ON moved balance to % (expected untouched 5)', v_clases; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_expired and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(vig deleg): expired ON wrote % attendance rows (expected 0)', v_n; end if;
  select count(*) into v_n from public.reservation where member_id = c_expired and class_session_id = s_id;
  if v_n <> 0 then raise exception 'RULE FAIL(vig deleg): expired ON minted % walk-in reservation(s) (expected 0)', v_n; end if;

  -- ── (b) EXPIRED but BOOKED: still marked, and still not charged ──────────────────
  -- The booked branch is exempt from the gate, exactly as it is in the 2-arg desk path: that class was
  -- paid for at booking, and a package lapsing between the booking and the class must not lock the
  -- member out of a class they already own.
  select status into v_status from public.reservation where member_id = c_expres and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'SEED FAIL(vig booked): expected reservada, got %', v_status; end if;

  select present into v_present from public.toggle_pase(c_expres, v_today, s_id);
  if v_present is not true then raise exception 'RULE FAIL(vig booked): an expired member with a BOOKING was refused'; end if;
  -- the reservation flipped, the attendance row is session-linked + stated 'clase' + unpaid…
  select status, is_walk_in into v_status, v_walk from public.reservation where member_id = c_expres and class_session_id = s_id;
  if v_status <> 'asistida' then raise exception 'RULE FAIL(vig booked): reservation status % (expected asistida)', v_status; end if;
  if v_walk is not false then raise exception 'RULE FAIL(vig booked): a real booking was flagged is_walk_in'; end if;
  select consumio, origen, class_session_id, gym_id into v_consumio, v_origen, v_sess, v_gym_id
    from public.asistencias where cliente_id = c_expres and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(vig booked): asistencia.consumio % (expected false — paid at booking)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(vig booked): asistencia.origen % (expected clase)', v_origen; end if;
  if v_sess is distinct from s_id then raise exception 'RULE FAIL(vig booked): asistencia.class_session_id mismatch'; end if;
  if v_gym_id is distinct from v_gym then raise exception 'RULE FAIL(vig booked): asistencia.gym_id % expected %', v_gym_id, v_gym; end if;
  -- …and the balance never moved (4 = the class consumed at booking, nothing since).
  select clases_restantes into v_clases from public.clientes where id = c_expres;
  if v_clases <> 4 then raise exception 'RULE FAIL(vig booked): balance % (expected an untouched 4)', v_clases; end if;
end $$;

-- ── (v3) PRE-WINDOW: >90 minutes early is a SEPARATE visit, and it CHARGES (the Ana ruling) ──────
-- The one money change of the 2026-07-29 slice, and the defensible one. A member booked into a class
-- three hours from now walks in for open gym: nothing about that arrival belongs to the class, so there
-- is nothing to attribute and nothing to pardon. The old C15 gave this visit away free because the
-- BOOKING and the VISIT shared a date — the day answering a question about an instant.
--
-- The booking itself must come through untouched: still reservada, checked_at still null. A desk tap
-- that quietly consumed someone's seat (or marked it attended three hours early) would be the eraser
-- finding wearing a different hat.
do $$
declare
  c_prev uuid := current_setting('t.c_prev', true)::uuid;
  s_pre  uuid := current_setting('t.s_pre', true)::uuid;
  f_pre  date := current_setting('t.f_pre', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text;
  v_perdonada boolean; v_sess uuid; v_ret_sess uuid; v_saldo int; v_checked timestamptz; v_n int; v_resultado text;
begin
  select status into v_status from public.reservation where member_id = c_prev and class_session_id = s_pre;
  if v_status <> 'reservada' then raise exception 'SEED FAIL(v3): expected reservada, got %', v_status; end if;

  select present, session_id, clases_restantes, resultado into v_present, v_ret_sess, v_saldo, v_resultado
    from public.toggle_pase(c_prev, f_pre);
  if v_present is not true then raise exception 'RULE FAIL(v3): pre-window tap did not mark present'; end if;
  -- no attribution happened: the return names no class, because the desk row IS the whole act.
  if v_ret_sess is not null then raise exception 'RULE FAIL(v3): a pre-window tap attributed to session % (expected none)', v_ret_sess; end if;
  -- #245: a pre-window arrival is a SEPARATE visit that charges — 'descontada', never 'reserva'. The
  -- member's booking is still held; nothing was captured here.
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(v3): resultado % (expected descontada)', v_resultado; end if;

  -- The written row: a class-less ACCESO LIBRE visit that PAID. perdonada=false — it is neither a
  -- cooldown duplicate nor a pardon of any kind.
  select consumio, origen, perdonada, class_session_id into v_consumio, v_origen, v_perdonada, v_sess
    from public.asistencias where cliente_id = c_prev and fecha = f_pre and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(v3): libre row consumio % (expected true — a pre-window arrival is a separate visit and it charges)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v3): libre row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(v3): libre row perdonada % (expected false)', v_perdonada; end if;
  if v_sess is not null then raise exception 'RULE FAIL(v3): the desk row carries a class_session_id (%)', v_sess; end if;
  -- The balance moved by exactly one (4 -> 3), and the RETURN says so.
  select clases_restantes into v_clases from public.clientes where id = c_prev;
  if v_clases <> 3 then raise exception 'RULE FAIL(v3): expected a real consume to 3, got % — the pre-window arm pardoned a visit', v_clases; end if;
  if v_saldo is distinct from 3 then raise exception 'RULE FAIL(v3): returned clases_restantes % (expected the fresh 3)', v_saldo; end if;

  -- The BOOKING is untouched: the member still holds their seat in a class that has not started.
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_prev and class_session_id = s_pre;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(v3): the desk tap moved the booking to % (expected reservada)', v_status; end if;
  if v_checked is not null then raise exception 'RULE FAIL(v3): the desk tap stamped checked_at on a class that has not started'; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_prev and class_session_id is not null and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(v3): the pre-window tap wrote % session-linked rows (expected 0)', v_n; end if;
end $$;

-- ── (v4) CLOSED WINDOW = THE FORFEIT (#233/#245 replaces the Luis pardon) ────────────────────────
-- The member booked the 18:00, did not come, and walks in at 21:00. Until 20260804150000 the door
-- recorded that visit FREE, on the theory that the booking had already taken the one class the Terms
-- allow. The owner's hold/capture/forfeit ruling splits those into two facts that were never the same
-- one: the HOLD their booking took is FORFEITED (they no-showed — and forfeiture is the ABSENCE of any
-- write: the booking stays reservada, checked_at stays null, `no_show` DERIVES from it at read, no
-- status is written and no sweep exists), while the visit they are making NOW is an ordinary ACCESO
-- LIBRE arrival that pays for itself. Same money as before in total; the difference is that the class
-- they missed is gone and the visit they made is charged, instead of one paying for the other.
--
-- Arm (b) is the ONE live consequence of deleting that pardon, pinned here so it can never be an
-- accident: the pardon sat ABOVE the C9 vence gate, so an EXPIRED member holding a missed booking used
-- to walk in free. They are now refused with 'Paquete vencido' — the same answer every other expired
-- member gets at the door, and nothing about having missed a booking buys an exemption.
do $$
declare
  c_cerr    uuid := current_setting('t.c_cerr', true)::uuid;
  c_expcerr uuid := current_setting('t.c_expcerr', true)::uuid;
  s_cls     uuid := current_setting('t.s_cls', true)::uuid;
  f_cls     date := current_setting('t.f_cls', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_status text;
  v_perdonada boolean; v_ret_sess uuid; v_saldo int; v_checked timestamptz; v_vence date; v_n int;
  v_raised boolean; v_resultado text;
begin
  -- ── (a) valid package: the door visit CHARGES, and the missed booking is left held ──────────
  select present, session_id, clases_restantes, resultado into v_present, v_ret_sess, v_saldo, v_resultado
    from public.toggle_pase(c_cerr, f_cls);
  if v_present is not true then raise exception 'RULE FAIL(v4a): closed-window tap did not mark present'; end if;
  if v_ret_sess is not null then raise exception 'RULE FAIL(v4a): a closed-window tap attributed to session % (expected none — the class is over)', v_ret_sess; end if;
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(v4a): resultado % (expected descontada — the pardon is deleted, this visit pays)', v_resultado; end if;

  -- `class_session_id is null` pins the read to the DESK row, exactly as its four siblings in this
  -- suite do. Without it a future step that adds a class row on this fecha would let `select … into`
  -- silently grab whichever row sorted first and assert the wrong one's consumio.
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_cerr and fecha = f_cls and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(v4a): libre row consumio % (expected true — a missed booking no longer buys a free door visit)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v4a): libre row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(v4a): libre row perdonada % (expected false — this is a real, single, charged visit)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_cerr;
  if v_clases <> 3 then raise exception 'RULE FAIL(v4a): balance % (expected a charge to 3)', v_clases; end if;
  if v_saldo is distinct from 3 then raise exception 'RULE FAIL(v4a): returned clases_restantes % (expected the fresh 3)', v_saldo; end if;
  -- THE FORFEIT, asserted as the ABSENCE of writes it is: the booking is untouched, so it still reads
  -- reservada on a class that is over — which is exactly what `no_show` derives from. A slice that
  -- "fixed" this by stamping a status here would be re-introducing the sweep the 2026-07-29 ruling
  -- forbids, and this assertion is what would fail.
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_cerr and class_session_id = s_cls;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(v4a): the missed booking moved to % — the hold must stay HELD and derive to no_show, with zero writes', v_status; end if;
  if v_checked is not null then raise exception 'RULE FAIL(v4a): front desk stamped checked_at on the missed booking'; end if;
  -- OFF refunds exactly the one the door took (4 -> 3 -> 4), and still does not touch the booking.
  select present, resultado into v_present, v_resultado from public.toggle_pase(c_cerr, f_cls);
  if v_present is not false then raise exception 'RULE FAIL(v4a OFF): still present'; end if;
  if v_resultado is not null then raise exception 'RULE FAIL(v4a OFF): resultado % (expected NULL on an un-mark)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_cerr;
  if v_clases <> 4 then raise exception 'RULE FAIL(v4a OFF): expected the refund to 4, got %', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_cerr and class_session_id = s_cls;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(v4a OFF): the undo moved the missed booking to %', v_status; end if;

  -- ── (b) EXPIRED package + a missed booking: REFUSED at the door, nothing written ──────────────
  select vence into v_vence from public.clientes where id = c_expcerr;
  if v_vence >= f_cls then raise exception 'SEED FAIL(v4b): vence % is not before the closed session day %', v_vence, f_cls; end if;

  v_raised := false;
  begin
    perform public.toggle_pase(c_expcerr, f_cls);
  exception when others then
    v_raised := true;
    if sqlerrm not like 'Paquete vencido%' then raise exception 'RULE FAIL(v4b): wrong raise for an expired closed-window tap: %', sqlerrm; end if;
  end;
  if not v_raised then raise exception 'RULE FAIL(v4b): an EXPIRED member was admitted because they held a missed booking — the deleted pardon is back above the C9 gate'; end if;
  -- Nothing survives the refusal: no row, no balance move, and the forfeited booking still stands.
  select clases_restantes into v_clases from public.clientes where id = c_expcerr;
  if v_clases <> 4 then raise exception 'RULE FAIL(v4b): the refused tap moved the balance to % (expected an untouched 4)', v_clases; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_expcerr and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(v4b): the refused tap wrote % attendance rows (expected 0)', v_n; end if;
  select status into v_status from public.reservation where member_id = c_expcerr and class_session_id = s_cls;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(v4b): the refused tap moved the missed booking to %', v_status; end if;
end $$;

-- ── (v5) THE COOLDOWN PARDON IS THE ONLY perdonada WRITER — and the visit count skips it (#169) ──
-- One arrival, recorded twice: the member is marked present in a class (walk-in branch, 5 -> 4) and the
-- operator taps them at the desk minutes later. The 15-minute cooldown records the second row free —
-- and now STAMPS it, because that is the one shape a count of VISITS must not count twice.
--
-- This vector also pins the `is_walk_in = false` filter on attribution: c_pard's reservation on the
-- in-window session is an operator-minted WALK-IN, so it is invisible to both the attribution select and
-- the already-marked no-op, and the tap correctly reaches the cooldown instead of raising.
--
-- The tail is the aggregate: asistencias_mes_por_cliente must return 1 for this member off TWO active
-- rows. `count(*)` alone would say 2 (one arrival counted twice); `count(distinct fecha)` — what it said
-- before this slice — would say 1 here but also 1 for two real classes in a day, which is the trade the
-- stamp exists to end.
do $$
declare
  c_pard uuid := current_setting('t.c_pard', true)::uuid;
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  f_win  date := current_setting('t.f_win', true)::date;
  v_gym  uuid := current_setting('t.gym', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_origen text; v_perdonada boolean;
  v_ret_sess uuid; v_n int; v_resultado text;
begin
  -- Arrange: the CLASS mark (walk-in branch — no booking) consumes one, 5 -> 4, and is NOT pardoned.
  select present into v_present from public.pasar_lista_sesion(s_id, c_pard);
  if v_present is not true then raise exception 'SEED FAIL(v5): class mark did not take'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_pard;
  if v_clases <> 4 then raise exception 'SEED FAIL(v5): expected 4 after the class mark, got %', v_clases; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c_pard and class_session_id = s_id and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(v5): class row consumio % (expected true)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'SEED FAIL(v5): the PAYING row was stamped perdonada %', v_perdonada; end if;

  -- Act: the desk tap on the same fecha, inside the cooldown. The member's only reservation on the
  -- in-window session is an operator walk-in, so attribution ignores it (is_walk_in = false) and no
  -- 'Ya marcada' raise fires — the tap falls through to the cooldown, which is the point.
  select present, session_id, resultado into v_present, v_ret_sess, v_resultado from public.toggle_pase(c_pard, f_win);
  if v_present is not true then raise exception 'RULE FAIL(v5): the desk tap was refused'; end if;
  if v_ret_sess is not null then raise exception 'RULE FAIL(v5): the tap attributed to session % — a WALK-IN row is not a booking', v_ret_sess; end if;
  -- #245: pardoned = admitted with no charge = 'gratis'. NOT 'reserva' — nothing was captured here;
  -- this is the second record of one arrival whose sibling row already paid.
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(v5): resultado % (expected gratis)', v_resultado; end if;

  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_pard and fecha = f_win and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v5): libre row consumio % (expected false — inside the cooldown)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v5): libre row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(v5): the cooldown-pardoned row was NOT stamped perdonada (%) — a visit count will double-count this arrival', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_pard;
  if v_clases <> 4 then raise exception 'RULE FAIL(v5): DOUBLE CONSUME — balance % (expected 4)', v_clases; end if;

  -- ── the aggregate: TWO active rows, ONE visit ─────────────────────────────────
  select count(*) into v_n from public.asistencias where cliente_id = c_pard and deleted_at is null;
  if v_n <> 2 then raise exception 'RULE FAIL(v5): expected 2 active rows (the arrival recorded twice), got %', v_n; end if;
  select n into v_n from public.asistencias_mes_por_cliente(v_gym, f_win) where cliente_id = c_pard;
  if v_n is distinct from 1 then raise exception 'RULE FAIL(v5 aggregate): asistencias_mes_por_cliente returned % for a member with two rows and one pardon (expected 1 VISIT)', v_n; end if;
end $$;

-- ── (v6) ORDER SYMMETRY: one arrival costs the same whichever screen records it first (#245 §3) ──
-- The defect this vector was rewritten to catch. pasar_lista_sesion's cooldown used to carry a
-- CHAIN-BREAKER — "do not let a recent libre row pardon this class if the member holds a closed-window
-- `reservada` booking today" — which was a PROXY for "that recent row was free", exact only while
-- toggle_pase's closed-window arm existed to make such rows free. #245 deleted that arm, and the proxy
-- inverted: within the 15-minute horizon the row is now necessarily CHARGED, so the guard vetoed a
-- pardon it should have granted, and the cost of ONE arrival depended on the order it was recorded in:
--
--     door tap then class mark  → 1 (door) + 1 (class, veto) = 2 walk-in charges
--     class mark then door tap  → 1 (class) + 0 (door, pardoned) = 1 walk-in charge
--
-- Both members below missed the same class on the same day (hold forfeited, booking untouched) and
-- arrive once. Both must spend EXACTLY ONE walk-in charge on top of that forfeited hold — c_chain
-- door-first, c_orden class-first, identical fixtures otherwise, and the assertion is that their
-- balances land on the same number. Re-key the cooldown on booking existence again and c_chain ends at
-- 2 while c_orden ends at 3, which is the shape of the bug.
--
-- Both are proved on WRITTEN ROWS, not just balances: exactly one of the two rows charged, exactly the
-- other is stamped `perdonada`, and the row that charged is the one that came FIRST in each order.
do $$
declare
  c_chain uuid := current_setting('t.c_chain', true)::uuid;
  c_orden uuid := current_setting('t.c_orden', true)::uuid;
  s_cls   uuid := current_setting('t.s_cls', true)::uuid;
  s_cls2  uuid := current_setting('t.s_cls2', true)::uuid;
  f_cls   date := current_setting('t.f_cls', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_perdonada boolean; v_origen text;
  v_status text; v_n int; v_resultado text; v_chain_saldo int; v_orden_saldo int;
begin
  -- ── (i) DOOR then CLASS ────────────────────────────────────────────────────────
  -- Step 1: the missed booking's door tap. No closed-window pardon since #245, so it CHARGES 4 -> 3.
  select present, resultado into v_present, v_resultado from public.toggle_pase(c_chain, f_cls);
  if v_present is not true then raise exception 'SEED FAIL(v6i): the closed-window door tap was refused'; end if;
  if v_resultado is distinct from 'descontada' then raise exception 'SEED FAIL(v6i): door tap resultado % (expected descontada)', v_resultado; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c_chain and fecha = f_cls and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(v6i): libre row consumio % (expected true — the pardon is deleted)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'SEED FAIL(v6i): libre row perdonada % (expected false — it paid, it is not a duplicate)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_chain;
  if v_clases is distinct from 3 then raise exception 'SEED FAIL(v6i): balance % (expected a charge to 3)', v_clases; end if;

  -- Step 2: minutes later (the same frozen instant), a class on the SAME date. The cooldown sees a
  -- recent libre row THAT PAID, so this second record of one arrival is PARDONED — balance stays 3.
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_cls2, c_chain);
  if v_present is not true then raise exception 'RULE FAIL(v6i): the class mark was refused'; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(v6i): class mark resultado % (expected gratis — the door row paid for this arrival)', v_resultado; end if;
  select clases_restantes into v_chain_saldo from public.clientes where id = c_chain;
  if v_chain_saldo is distinct from 3 then raise exception 'RULE FAIL(v6i): DOUBLE CHARGE — balance % (expected an untouched 3; at 2 the deleted chain-breaker is back and one arrival cost two credits)', v_chain_saldo; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_chain and class_session_id = s_cls2 and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v6i): class row consumio % (expected false — pardoned)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(v6i): class row origen % (expected clase)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(v6i): the pardoned class row was NOT stamped perdonada (%) — the arrival would count twice', v_perdonada; end if;

  -- ── (ii) CLASS then DOOR — the same member, the other way round ────────────────
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_cls2, c_orden);
  if v_present is not true then raise exception 'SEED FAIL(v6ii): the class mark was refused'; end if;
  if v_resultado is distinct from 'descontada' then raise exception 'SEED FAIL(v6ii): class mark resultado % (expected descontada — nothing has paid for this arrival yet)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_orden;
  if v_clases is distinct from 3 then raise exception 'SEED FAIL(v6ii): balance % (expected a charge to 3)', v_clases; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c_orden and class_session_id = s_cls2 and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(v6ii): class row consumio % (expected true)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'SEED FAIL(v6ii): the PAYING class row was stamped perdonada %', v_perdonada; end if;

  select present, resultado into v_present, v_resultado from public.toggle_pase(c_orden, f_cls);
  if v_present is not true then raise exception 'RULE FAIL(v6ii): the door tap was refused'; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(v6ii): door tap resultado % (expected gratis)', v_resultado; end if;
  select clases_restantes into v_orden_saldo from public.clientes where id = c_orden;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_orden and fecha = f_cls and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v6ii): libre row consumio % (expected false — pardoned)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v6ii): libre row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(v6ii): the pardoned libre row was NOT stamped perdonada (%)', v_perdonada; end if;

  -- ── THE SYMMETRY ITSELF ───────────────────────────────────────────────────────
  -- Two identically-seeded members, one arrival each, opposite recording orders. Same balance, or the
  -- cost of a visit depends on which screen the operator happened to reach for.
  if v_chain_saldo is distinct from v_orden_saldo then
    raise exception 'RULE FAIL(v6): ORDER-DEPENDENT CHARGE — door-first left % and class-first left % for the same arrival', v_chain_saldo, v_orden_saldo;
  end if;

  -- Both forfeited holds are still held (untouched bookings), and each member has exactly two active
  -- rows — one paying, one pardoned — so a visit count reads ONE arrival for each of them.
  select status into v_status from public.reservation where member_id = c_chain and class_session_id = s_cls;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(v6i): the missed booking moved to % (expected reservada — the hold is forfeited by ABSENCE of writes)', v_status; end if;
  select status into v_status from public.reservation where member_id = c_orden and class_session_id = s_cls;
  if v_status is distinct from 'reservada' then raise exception 'RULE FAIL(v6ii): the missed booking moved to % (expected reservada)', v_status; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_chain and deleted_at is null;
  if v_n is distinct from 2 then raise exception 'RULE FAIL(v6i): active rows % (expected 2 — one arrival recorded twice)', v_n; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_orden and deleted_at is null;
  if v_n is distinct from 2 then raise exception 'RULE FAIL(v6ii): active rows % (expected 2)', v_n; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_chain and deleted_at is null and perdonada;
  if v_n is distinct from 1 then raise exception 'RULE FAIL(v6i): % pardoned row(s) (expected exactly 1 — the second record of the arrival)', v_n; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_orden and deleted_at is null and perdonada;
  if v_n is distinct from 1 then raise exception 'RULE FAIL(v6ii): % pardoned row(s) (expected exactly 1)', v_n; end if;
end $$;

-- ── (v7) FREE and DUPLICATE are independent facts, and one row carries both ──────────────────────
-- The dual-surface arrival, which is the NORMAL shape at a gym that runs a door check-in AND class
-- rosters: the member is marked into a class, then tapped at the desk minutes later — while also
-- holding a booking they missed earlier that day.
--
-- #245 changed the MECHANISM and left the WRITTEN ROWS identical, which is the whole reason this suite
-- asserts rows rather than branches. Before, the closed-window pardon decided the money (free) and the
-- cooldown decided the count (second record of one arrival). That pardon is deleted, so now the
-- COOLDOWN decides both: a recent CLASS row on this fecha forces consumio=false AND stamps perdonada.
-- Same row, same balance, same month count of 1 — and if a future edit dropped the perdonada stamp,
-- both rows would read false and one arrival would count as two visits, which is the overcount this
-- vector has always existed to catch.
do $$
declare
  c_dual uuid := current_setting('t.c_dual', true)::uuid;
  s_cls  uuid := current_setting('t.s_cls', true)::uuid;
  s_cls2 uuid := current_setting('t.s_cls2', true)::uuid;
  f_cls  date := current_setting('t.f_cls', true)::date;
  v_gym  uuid := current_setting('t.gym', true)::uuid;
  v_present boolean; v_clases int; v_consumio boolean; v_perdonada boolean; v_origen text;
  v_ret_sess uuid; v_status text; v_n int; v_resultado text;
begin
  -- Step 1 — the class mark (walk-in branch: the member's booking is on the OTHER session): 5 -> 4.
  select present into v_present from public.pasar_lista_sesion(s_cls2, c_dual);
  if v_present is not true then raise exception 'SEED FAIL(v7): the class mark was refused'; end if;
  select clases_restantes into v_clases from public.clientes where id = c_dual;
  if v_clases <> 4 then raise exception 'SEED FAIL(v7): expected a charge to 4, got %', v_clases; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c_dual and class_session_id = s_cls2 and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'SEED FAIL(v7): class row consumio % (expected true)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'SEED FAIL(v7): the FIRST record of the arrival was stamped perdonada %', v_perdonada; end if;

  -- Step 2 — the door tap on the same fecha: pardoned AND stamped by the COOLDOWN (a class row minutes
  -- old, of the OTHER kind). Free AND duplicate, in one row — now from one mechanism.
  select present, session_id, resultado into v_present, v_ret_sess, v_resultado from public.toggle_pase(c_dual, f_cls);
  if v_present is not true then raise exception 'RULE FAIL(v7): the door tap was refused'; end if;
  if v_ret_sess is not null then raise exception 'RULE FAIL(v7): the tap attributed to session % (expected none — every candidate class is over)', v_ret_sess; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(v7): resultado % (expected gratis)', v_resultado; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_dual and fecha = f_cls and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v7): libre row consumio % (expected false — the sibling class row minutes ago already paid for this arrival)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v7): libre row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(v7): the free row was NOT stamped perdonada (%) — one arrival will count as two visits', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_dual;
  if v_clases <> 4 then raise exception 'RULE FAIL(v7): the door tap charged — balance % (expected 4)', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_dual and class_session_id = s_cls;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(v7): the missed booking moved to % (expected reservada — its hold is forfeited, not written)', v_status; end if;

  -- The count: two active rows, one arrival, ONE visit.
  select count(*) into v_n from public.asistencias where cliente_id = c_dual and deleted_at is null;
  if v_n <> 2 then raise exception 'RULE FAIL(v7): expected 2 active rows, got %', v_n; end if;
  select n into v_n from public.asistencias_mes_por_cliente(v_gym, f_cls) where cliente_id = c_dual;
  if v_n is distinct from 1 then raise exception 'RULE FAIL(v7 aggregate): returned % for one dual-surface arrival (expected 1 VISIT)', v_n; end if;
end $$;

-- ── (v8) THE ATTRIBUTION FILTERS, each pinned by a fixture that only it refuses ──────────────────
-- TWO predicates that a reader could mistake for belt-and-braces. Each arm below is a state where
-- deleting exactly one of them changes the written rows, so neither can be "simplified" silently.
-- (A third arm lived here until #245: `r.is_walk_in = false` on the closed-window pardon, which that
-- migration deleted along with the pardon itself. The two surviving copies of that filter — the
-- attribution select and the already-marked no-op — are pinned by (v5), whose fixture holds an
-- in-window WALK-IN row that must be invisible to both.)
do $$
declare
  c_back uuid := current_setting('t.c_back', true)::uuid;
  c_can  uuid := current_setting('t.c_can', true)::uuid;
  s_id   uuid := current_setting('t.s_id', true)::uuid;
  s_can  uuid := current_setting('t.s_can', true)::uuid;
  f_win  date := current_setting('t.f_win', true)::date;
  v_back date := current_setting('t.f_win', true)::date - 3;
  v_present boolean; v_clases int; v_consumio boolean; v_perdonada boolean; v_origen text;
  v_status text; v_ret_sess uuid; v_checked timestamptz; v_n int;
begin
  -- ── (a) `(cs.starts_at at time zone tz)::date = p_fecha` — the BACKDATE guard ──
  -- The operator is entering last week's door check while the member happens to be booked into a class
  -- starting in 30 minutes. now() sits inside that booking's window, so without the date equality the
  -- tap would attribute a THREE-DAY-OLD visit to today's class — marking a class the member has not
  -- attended yet and swallowing the charge. The row must land on the fecha the operator typed, charged.
  select present, session_id into v_present, v_ret_sess from public.toggle_pase(c_back, v_back);
  if v_present is not true then raise exception 'RULE FAIL(v8a): the back-entry was refused'; end if;
  if v_ret_sess is not null then raise exception 'RULE FAIL(v8a): a BACKDATED tap attributed to session % — the p_fecha equality is gone', v_ret_sess; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_back and fecha = v_back and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(v8a): back-entry row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v8a): back-entry row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(v8a): back-entry row perdonada % (expected false)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_back;
  if v_clases <> 3 then raise exception 'RULE FAIL(v8a): expected a charge to 3, got %', v_clases; end if;
  select status, checked_at into v_status, v_checked from public.reservation where member_id = c_back and class_session_id = s_id;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(v8a): the back-entry marked TODAY''S booking as % ', v_status; end if;
  if v_checked is not null then raise exception 'RULE FAIL(v8a): the back-entry stamped checked_at on a class that has not started'; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_back and class_session_id is not null and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(v8a): the back-entry wrote % session-linked rows (expected 0)', v_n; end if;

  -- ── (b) `cs.cancelled_at is null` — a cancelled class attributes nothing ──
  -- The gym cancelled the class; the member comes in anyway, inside what WOULD have been its window.
  -- There is no class to be present at, so the tap is an ordinary door visit and it charges. (#245
  -- removed the second half of this note: the closed-window pardon that deliberately carried no
  -- cancelled filter — the compensation a gym-cancelled booking had until #172 — is deleted, because
  -- cancel_class_session now releases every hold outright. This fixture's booking is seeded directly,
  -- so no release ran on it and the reservada row below is still the right expectation.)
  select present, session_id into v_present, v_ret_sess from public.toggle_pase(c_can, f_win);
  if v_present is not true then raise exception 'RULE FAIL(v8b): the tap was refused'; end if;
  if v_ret_sess is not null then raise exception 'RULE FAIL(v8b): the tap attributed to a CANCELLED class (%) — the cancelled_at filter is gone', v_ret_sess; end if;
  select consumio, origen into v_consumio, v_origen
    from public.asistencias where cliente_id = c_can and fecha = f_win and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(v8b): libre row consumio % (expected true — there is no class to be present at)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v8b): libre row origen % (expected libre)', v_origen; end if;
  select clases_restantes into v_clases from public.clientes where id = c_can;
  if v_clases <> 3 then raise exception 'RULE FAIL(v8b): expected a charge to 3, got %', v_clases; end if;
  select status into v_status from public.reservation where member_id = c_can and class_session_id = s_can;
  if v_status <> 'reservada' then raise exception 'RULE FAIL(v8b): the cancelled class''s booking was flipped to %', v_status; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_can and class_session_id is not null and deleted_at is null;
  if v_n <> 0 then raise exception 'RULE FAIL(v8b): % session-linked rows written for a cancelled class (expected 0)', v_n; end if;

end $$;

-- ── (v9) A HOLD PARDONS; A FREE RIDE DOES NOT — the two edges of the payment key (#245 §3) ──────
-- The cooldown's new key is the recent row's own `perdonada`: a visit pardons the one in front of it
-- iff it was not ITSELF pardoned. That single predicate has to get two opposite cases right, and
-- neither is reachable from the vectors above, so each gets an arm here.
--
--   (a) A CAPTURED BOOKING PARDONS. c_cap's booking is marked on the roster after the class — the
--       BOOKED branch, `resultado = 'reserva'`, consumio=false because the HOLD already paid at
--       booking time. That row paid; it is not a free ride; so the door tap minutes later must come
--       back free. Total cost of the arrival: the one hold, and nothing else. A predicate that keyed
--       on `consumio = true` instead of `not perdonada` would charge here — the capture row's
--       consumio is false — and bill a member twice for a class they booked and attended.
--       (The closed session is load-bearing: on an in-window class the desk tap would hit the
--       already-marked NO-OP instead of ever reaching the cooldown.)
--
--   (b) A PARDONED ROW PARDONS NOTHING — the free-rider hole, which the deleted chain-breaker
--       addressed only by accident and only for members holding a missed booking. c_free holds NO
--       booking at all: it is marked into one class (charged), tapped at the door (pardoned, free),
--       and then marked into a SECOND class. That second class must CHARGE — two classes are two
--       credits (R1) — and the only thing standing between it and a free ride is the pardoned libre
--       row being excluded. Before #245 this member's second class came back free.
do $$
declare
  c_cap  uuid := current_setting('t.c_cap', true)::uuid;
  c_free uuid := current_setting('t.c_free', true)::uuid;
  s_cls  uuid := current_setting('t.s_cls', true)::uuid;
  s_cls2 uuid := current_setting('t.s_cls2', true)::uuid;
  f_cls  date := current_setting('t.f_cls', true)::date;
  v_present boolean; v_clases int; v_consumio boolean; v_perdonada boolean; v_origen text;
  v_status text; v_n int; v_resultado text;
begin
  -- ── (a) capture, then door: total = the hold, nothing more ────────────────────
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_cls, c_cap);
  if v_present is not true then raise exception 'SEED FAIL(v9a): the roster capture was refused'; end if;
  if v_resultado is distinct from 'reserva' then raise exception 'SEED FAIL(v9a): resultado % (expected reserva — a hold was captured)', v_resultado; end if;
  select status into v_status from public.reservation where member_id = c_cap and class_session_id = s_cls;
  if v_status is distinct from 'asistida' then raise exception 'SEED FAIL(v9a): reservation status % (expected asistida)', v_status; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c_cap and class_session_id = s_cls and deleted_at is null;
  if v_consumio is distinct from false then raise exception 'SEED FAIL(v9a): capture row consumio % (expected false — the hold paid)', v_consumio; end if;
  if v_perdonada is distinct from false then raise exception 'SEED FAIL(v9a): the capture row was stamped perdonada % — it is one visit, not a duplicate', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_cap;
  if v_clases is distinct from 4 then raise exception 'SEED FAIL(v9a): balance % (expected an untouched 4 — the hold was taken at booking)', v_clases; end if;

  select present, resultado into v_present, v_resultado from public.toggle_pase(c_cap, f_cls);
  if v_present is not true then raise exception 'RULE FAIL(v9a): the door tap was refused'; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'RULE FAIL(v9a): door tap resultado % (expected gratis — the captured hold already paid for this arrival)', v_resultado; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_cap and fecha = f_cls and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'RULE FAIL(v9a): libre row consumio % (expected false — a captured booking PAID and therefore pardons)', v_consumio; end if;
  if v_origen is distinct from 'libre' then raise exception 'RULE FAIL(v9a): libre row origen % (expected libre)', v_origen; end if;
  if v_perdonada is distinct from true then raise exception 'RULE FAIL(v9a): the pardoned libre row was NOT stamped perdonada (%)', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_cap;
  if v_clases is distinct from 4 then raise exception 'RULE FAIL(v9a): DOUBLE CHARGE — balance % (expected an untouched 4: the booking was the whole cost of this visit)', v_clases; end if;

  -- ── (b) the free rider: a pardoned row pardons nothing ────────────────────────
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_cls, c_free);
  if v_present is not true then raise exception 'SEED FAIL(v9b): the first class mark was refused'; end if;
  if v_resultado is distinct from 'descontada' then raise exception 'SEED FAIL(v9b): first class resultado % (expected descontada)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_free;
  if v_clases is distinct from 4 then raise exception 'SEED FAIL(v9b): balance % (expected a charge to 4)', v_clases; end if;

  select present, resultado into v_present, v_resultado from public.toggle_pase(c_free, f_cls);
  if v_present is not true then raise exception 'SEED FAIL(v9b): the door tap was refused'; end if;
  if v_resultado is distinct from 'gratis' then raise exception 'SEED FAIL(v9b): door tap resultado % (expected gratis)', v_resultado; end if;
  select consumio, perdonada into v_consumio, v_perdonada
    from public.asistencias where cliente_id = c_free and fecha = f_cls and deleted_at is null and class_session_id is null;
  if v_consumio is distinct from false then raise exception 'SEED FAIL(v9b): libre row consumio % (expected false)', v_consumio; end if;
  if v_perdonada is distinct from true then raise exception 'SEED FAIL(v9b): the free libre row is not stamped perdonada (%) — the fixture is not a free rider', v_perdonada; end if;
  select clases_restantes into v_clases from public.clientes where id = c_free;
  if v_clases is distinct from 4 then raise exception 'SEED FAIL(v9b): the door tap charged (balance %)', v_clases; end if;

  -- THE ASSERTION: a SECOND class, minutes later. The only recent libre row is the pardoned one, which
  -- paid nothing — so it pardons nothing, and R1 charges for the second class.
  select present, resultado into v_present, v_resultado from public.pasar_lista_sesion(s_cls2, c_free);
  if v_present is not true then raise exception 'RULE FAIL(v9b): the second class mark was refused'; end if;
  if v_resultado is distinct from 'descontada' then raise exception 'RULE FAIL(v9b): second class resultado % (expected descontada — a free ride pardons nothing)', v_resultado; end if;
  select clases_restantes into v_clases from public.clientes where id = c_free;
  if v_clases is distinct from 3 then raise exception 'RULE FAIL(v9b): FREE SECOND CLASS — balance % (expected 3; at 4 a row that paid NOTHING pardoned a class, so one paid visit bought two)', v_clases; end if;
  select consumio, origen, perdonada into v_consumio, v_origen, v_perdonada
    from public.asistencias where cliente_id = c_free and class_session_id = s_cls2 and deleted_at is null;
  if v_consumio is distinct from true then raise exception 'RULE FAIL(v9b): second class row consumio % (expected true)', v_consumio; end if;
  if v_origen is distinct from 'clase' then raise exception 'RULE FAIL(v9b): second class row origen % (expected clase)', v_origen; end if;
  if v_perdonada is distinct from false then raise exception 'RULE FAIL(v9b): a CHARGED class row was stamped perdonada %', v_perdonada; end if;
  -- Three active rows, two classes paid, one door visit free: two visits, and the count skips only the
  -- row that is genuinely the second record of one arrival.
  select count(*) into v_n from public.asistencias where cliente_id = c_free and deleted_at is null;
  if v_n is distinct from 3 then raise exception 'RULE FAIL(v9b): active rows % (expected 3)', v_n; end if;
  select count(*) into v_n from public.asistencias where cliente_id = c_free and deleted_at is null and perdonada;
  if v_n is distinct from 1 then raise exception 'RULE FAIL(v9b): % pardoned row(s) (expected exactly 1 — the door tap)', v_n; end if;
end $$;

reset role;

select 'toggle_pase rules: OK' as result;
rollback;
