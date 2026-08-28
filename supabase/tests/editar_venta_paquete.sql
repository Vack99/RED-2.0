-- editar_venta PAQUETE-SWAP written-row suite — owner ruling 2026-08-27 (AS-IF-ORIGINAL, migration
-- 20260828110000), on top of #269's correction pair and the 2026-08-15 swap rulings it replaces.
--
-- The 10-arg `editar_venta` is the ONLY door for changing WHAT a registered sale sold. It does not
-- touch only the sale row: it REBUILDS the member's balance and vigencia from the corrected sale's own
-- terms, in ONE transaction. So its contract spans BOTH tables, and every vector below re-SELECTs
-- `ventas` AND `clientes` after the call and asserts the PERSISTED columns — never a return value
-- (AGENTS.md, "an RPC's return value is not its contract; the rows it writes are" — #78/#80).
-- `editar_venta_rules.sql` keeps the monto/metodo/fecha-bound vectors; this file owns the package, the
-- charge count and the saldo.
--
-- THE RULE THIS FILE PINS (spec docs/superpowers/plans/2026-08-27-slice2-saldo-detalle.md §D0/§D5):
--
--     clases_restantes := null                       if the corrected package is ilimitado
--                      := greatest(0, grant − cargadas)  otherwise
--     vence            := fecha_corregida + (30 if 'mes' else vigencia_dias)
--
-- where `cargadas` is `conteo_cargable(cliente, THE SALE'S OWN created_at).usadas + .apartadas` — the
-- §D0 charge count, on two legs: active unpardoned asistencias whose reservation did not itself carry
-- the charge (consumio=false rows INCLUDED), plus consuming, non-cancelled reservations. The stored
-- `clases_restantes` / `vence` are read NOWHERE. Two whole families of old behaviour are therefore
-- gone, and several vectors below exist specifically to keep them gone:
--   * the CLAWBACK (`stored − clases_old + clases_new`) — it stacked, and it inherited every drift the
--     stored counter carried (holds, forfeits, the ilimitado sweep hole, the pre-reset era).
--   * the CARRIED BASE (`vence − dias_old` recovered as an anchor, 20260815120000/20260815130000) —
--     a corrected sale runs its own días from its own day, full stop. S14a is the vector that used to
--     assert the opposite and now asserts this.
--
-- Vectors:
--   S1 — SWAP TO A REGISTRADO PAQUETE. A cliente stored on 10 clases / vence +40 whose sale granted 8
--        clases over 20 días — and who has trained not once since — is swapped onto a 12-clase 'mes'
--        package. The sale row takes the package's facts from the DB (never from the caller), and the
--        saldo lands on the corrected sale's own terms: 12 clases, vence = the sold day + 30. The old
--        clawback wrote 14 (10 − 8 + 12) and +50 here; both are the stacking the ruling killed.
--        folio / created_at / cliente_id / gym_id are proven unmoved by name AND by a whole-row jsonb
--        diff, so a column added to `ventas` later cannot start moving unnoticed.
--   S2 — SWAP TO PERSONALIZADO, twice on the same sale: first to a finite custom package, then to an
--        ILIMITADO one. Proves the custom branch writes `personalizado = true` / `vigencia_tipo =
--        'dias'`, that an ilimitado package writes a NULL balance rather than 0 (the FINITE→ILIMITADO
--        vector), and that consecutive edits do NOT compose: the second recomputes from the sale's
--        own facts rather than carrying the first swap's días forward.
--   S3 — GRANT MINUS CONSUMED, off the LEDGER and not off the counter. A 12-clase sale, three real
--        asistencias since it was registered, and a stored counter deliberately DRIFTED to 7 (two
--        below what the events explain — the exact shape slice 1/slice 2 exist for). Swapped onto an
--        8-clase package the answer is 8 − 3 = 5. A body that read the stored counter would write
--        7 − 12 + 8 = 3 and propagate the drift straight through the correction. This is AC2's first
--        half, and the load-bearing decision of migration 20260828110000.
--   S4 — THE CLAMP AT ZERO, and the counter is not a shortcut. A 12-clase sale with NINE charges since
--        registration, on a counter drifted all the way up to 12 (it says nothing was ever used).
--        Swapped down to a 4-clase package: greatest(0, 4 − 9) = 0. A counter-reading body writes
--        12 − 12 + 4 = 4 — four classes gifted on top of nine already trained. Never negative, never
--        "the new package's count". AC2's second half.
--   S5a — FECHA-ONLY RECOMPUTE, with charges. A fecha-only correction runs the identical core: the
--        sale grants 8, two charges land after it was registered, so the balance is 6 and the vigencia
--        is the NEW sold day + 20. The stored 10 / +40 is silently HEALED — a consequence the ruling
--        names and calls correct. Note the anchor did NOT move: `created_at` is what the count runs
--        from, so moving the paper day re-attributes nothing.
--   S5b — THE COUNTER IS NOT READ. A stored state registrar could never have written (6 clases, vence
--        +2 against a 20-día sale sold yesterday — a polluted row of the shape the pre-ruling
--        attribution-only fecha edits left behind) with ZERO charge events. The fecha edit rebuilds it
--        to the sale's own 8 clases and its own 20 días from the new day. If any part of the body
--        still read `clases_restantes`, this vector would come back 6.
--   S6 — IDEMPOTENCE, and the fixed point is the LEDGER. The identical swap payload posted twice, with
--        a real visit in between (an asistencia row AND the matching counter decrement — which is what
--        toggle_pase actually writes, not a bare counter change). The replay must leave the decrement
--        standing, and it does for a reason worth stating: as-if-original is a fixed point over EVENTS,
--        so fire 2 re-counts the same visit and lands on the same number. A body keyed on the counter
--        would hand the class back. Also pins one-row / no-refolio.
--   S7 — THE WINDOW COVERS THE RE-DERIVE, NOT JUST THE PACKAGE. A sale registered 31 days ago refuses a
--        swap with 'Ya pasaron 30 días: esta venta ya no se puede recalcular', and refuses a FECHA-only
--        edit with the same message. Both refusals write NOTHING (both rows byte-identical). The SAME
--        sale then ACCEPTS a monto/metodo-only edit, with the cliente row byte-identical: the window
--        covers the RECALCULATION, and attribution stays any-age (#266.3).
--   S8 — CROSS-TENANT, both directions: gym B staff on gym A's venta gets 'Venta no encontrada'; gym A
--        staff passing a gym-B `p_paquete_id` gets 'Paquete no encontrado' — the paquete lookup is
--        tenant-scoped, so another gym's catalog is a refusal and not a leak. Nothing written either time.
--   S9 — ARGUMENT REFUSALS, each with both rows asserted unchanged: both sources at once, a 2-char
--        custom nombre, días 0 and días 366, and `ilimitado` sent together with `clases`. The messages
--        are lifted verbatim from registrar_venta, so a reworded raise is a failure here.
--   S10 — THE CHEAP PATH / METADATA-ONLY. monto/metodo only — no p_fecha, no package arguments — and the
--        WHOLE clientes row is byte-identical afterwards. Without the change-detection guard this very
--        payload would re-derive and move a balance nobody asked to move (here it would write 8 over
--        the stored 9, since the sale grants 8 and nothing has been charged).
--   S11 — RENAME-ONLY. A swap onto a package with identical clases/vigencia but a different nombre:
--        both `ventas.paquete_nombre` and the cliente's display label follow, while clases_restantes
--        and vence stay byte-identical — a rename is not a re-derive. Same discriminator as S10: a
--        broken short circuit would write 8 / sold-day+20 here.
--   S12 — ONLY THE TOP OF THE STACK CAN RE-DERIVE. Under as-if-original the precondition is load-bearing
--        for a sharper reason than the old linear inverse needed: the re-derive writes the WHOLE balance
--        from this sale's grant, so a later sale's grant would simply be erased — and the §D0 count
--        could not tell which of the two sales owns each event either. The fixture is the lapsed chain:
--        V1 (8 clases / 20 días) sold 25 days ago and long expired, then V2 (the same package) sold 2
--        days ago. Editing V1 is REFUSED with 'Solo la venta más reciente puede cambiar de paquete o
--        fecha' through BOTH doors (package and fecha) and both rows stay byte-identical; the same
--        non-latest sale then ACCEPTS a monto/metodo edit, because attribution moves no saldo.
--   S13 — A FRESH SALE'S VENCE FOLLOWS ITS FECHA. One 12-clase / 30-día sale, no prior vigencia, moved
--        back 3 days: vence must land on `fecha_nueva + 30`. This was the live repro that produced the
--        20260815130000 anchor test; as-if-original reaches the same answer with no anchor at all,
--        because it never carries a base in the first place. Kept as the regression it always was.
--   S14 — A GENUINELY STACKED SALE DOES NOT KEEP ITS CARRY. The member's PRIOR package ended on
--        B = hoy−3 carrying 2 clases; this sale (8 clases / 20 días) was bought 6 days ago while that
--        base was still live, so registrar wrote B + 20 = hoy+17 and 2 + 8 = 10 clases. (a) A fecha
--        edit to hoy−5 now writes 8 clases and hoy+15 — the carried 2 clases and the carried days are
--        BOTH dropped, because the corrected sale is re-derived from its own terms. This vector
--        asserted the exact opposite before 2026-08-27; it is the clearest statement in the file that
--        the base carry is gone. (b) Moving on to hoy−1 writes 8 / hoy+19: the same rule, no branch.
--   S15 — ILIMITADO → FINITE, WITH CLASSES ATTENDED WHILE ILIMITADO. The sale granted an ilimitado
--        pack and the member trained four times under it, so those asistencias carry `consumio = false`
--        (an ilimitado plan never decrements). Corrected onto a 12-clase package the answer is
--        12 − 4 = 8: as-if-original asks what these terms WOULD have charged, and they would have
--        charged all four. An implementation that counted only `consumio = true` rows returns 12 and
--        hands back every class already trained; the old clawback returned 12 too (a NULL stored
--        balance short-circuited straight to the package's own count). This vector kills both.
--   S16 — THE RESERVATION LEG: booked-then-attended counts ONCE, a future hold counts, a gym-cancelled
--        session counts NOTHING. One cliente, three bookings that all carry `consumio = true`:
--        (i) a past ENDED session, attended — the reservation carries the charge and the linked
--        asistencia is deferred to it, so it is ONE charge and not two; (ii) a FUTURE session still
--        held — already debited at booking time (#233), so a correction that ignored it would hand
--        back a class the member is still holding a seat with; (iii) a session the GYM cancelled —
--        `cancel_class_session` refunds and flips the status but leaves `consumio` standing, so only
--        the status filter can tell the truth here and it must cost nothing. Total 2 charges against a
--        12-clase correction ⇒ 10.
--   S17 — THE BERENICE FIXTURE: a mark EARLIER THE SAME GYM DAY belongs to the OLD pack, and the
--        comparison is GYM-LOCAL. The sale was registered at 20:53 gym-local yesterday; one mark at
--        18:12 that evening (BEFORE the sale — the previous pack paid for it) and one at 21:30 (after).
--        Only the second is charged, so a 6-clase sale corrected onto an 8-clase package lands on 7.
--        Both halves are traps: counting the 18:12 mark gives 6 (the "why does it say 1 used" seam the
--        owner hit on 2026-08-27), and reading the 21:30 mark in the SESSION's calendar instead of the
--        gym's gives 8 — 21:30 in a UTC−6 gym is already tomorrow in UTC, so a naive `::date` or an
--        unconverted `fecha + hora` drops it. A vector that passes for eighteen hours a day is worse
--        than no vector, which is why both marks sit after 18:00 local.
--   S18 — PERDONADA AND SOFT-DELETED ARE NOT CHARGES. Three marks since the sale: one ordinary, one
--        `perdonada` (the cooldown's second record of ONE arrival, #169) and one soft-deleted (an
--        undone toggle). Only the first is charged, so a 12-clase correction lands on 11. Counting all
--        three would write 9 — the member billed twice for one arrival and once for a visit that was
--        taken back.
--
-- Fixtures are 100% transaction-local (fresh gen_random_uuid gym/auth.users/gym_membership/clientes/
-- paquetes/ventas/class_session/reservation/asistencias rows, zero prod UUIDs — a live-gym lookup
-- 22P02s in staff_gym() on a fresh scratch project), and EVERY fixture write happens as postgres
-- BEFORE the first `set local role authenticated`, which silently no-ops writes that need postgres.
-- Assertions likewise run after `reset role`, so they read ground truth rather than an RLS-filtered
-- view (S8 asserts on a row its caller cannot even select). Each vector owns its own cliente, so a
-- failure names one vector.
--
-- The gym timezone is a REAL IANA zone (America/Chihuahua, UTC-6 year-round), never UTC. EVERY vence
-- expectation in this file is written in GYM-tz days, because under as-if-original the sold day never
-- cancels out of the arithmetic: `vence = fecha_dia + días` and `fecha_dia` is a gym-tz date. A
-- `current_date` expectation would pass or fail depending on the hour the suite runs. S17 goes further
-- and seeds wall-clock instants on both sides of the gym's evening boundary.
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN: `node supabase/tests/run-denial-suite.mjs` (== `pnpm test:denial`) — wired into SUITE —
-- or ad hoc via psql against the local docker stack.

begin;

-- ── Fixtures (transaction-local; zero prod UUIDs; written as postgres, before any role switch) ────
do $$
declare
  gym_a     uuid := gen_random_uuid();
  gym_b     uuid := gen_random_uuid();
  op_a      uuid := gen_random_uuid();
  op_b      uuid := gen_random_uuid();
  v_tz      constant text := 'America/Chihuahua';
  pk_mes    uuid;  -- gym A: 12 clases, vigencia_tipo 'mes'
  pk_4      uuid;  -- gym A: 4 clases / 10 días
  pk_8      uuid;  -- gym A: 8 clases / 20 días (the correction target for S3 / S17)
  pk_igual  uuid;  -- gym A: same grant as the fixture sale, different nombre (S11)
  pk_b      uuid;  -- gym B: the cross-tenant paquete id (S8)
  c1  uuid; c2  uuid; c3  uuid; c4  uuid; c5  uuid; c6  uuid;
  c7  uuid; c8  uuid; c9  uuid; c10 uuid; c11 uuid; c12 uuid; c13 uuid;
  v1  uuid; v2  uuid; v3  uuid; v4  uuid; v5  uuid; v6  uuid;
  v7  uuid; v8  uuid; v9  uuid; v10 uuid; v11 uuid; v12 uuid;
  v13 uuid; v14 uuid;   -- S12: the lapsed chain — v13 sold 25 days ago, v14 stacked on top 2 days ago
  c_fresca  uuid; v_fresca  uuid;   -- S13: a fresh sale, no prior vigencia
  c_apilada uuid; v_apilada uuid;   -- S14: a genuinely stacked sale, prior base ended on its own day
  c15 uuid; v15 uuid;               -- S15: ilimitado sale + four consumio=false marks under it
  c16 uuid; v16 uuid;               -- S16: the reservation leg
  c17 uuid; v17 uuid;               -- S17: the Berenice same-evening pair
  c18 uuid; v18 uuid;               -- S18: perdonada + soft-deleted
  ct        uuid;                   -- one class_type, shared by every session below
  s_pasada  uuid; s_futura uuid; s_cancel uuid;   -- S16's three sessions
  s_tarde   uuid;                   -- S17's 21:30 class
  r_pas     uuid; r_fut   uuid; r_can   uuid;     -- S16's three bookings
  -- The GYM's today. Every vence expectation in this file is a gym-tz day, so the fixtures speak the
  -- same calendar as the assertions do.
  v_hoy_gym date := (now() at time zone 'America/Chihuahua')::date;
begin
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id) values
    (gym_a, 'editar-venta-paquete-gym-a', 'Editar Venta Paquete A', v_tz, 'forge'),
    (gym_b, 'editar-venta-paquete-gym-b', 'Editar Venta Paquete B', v_tz, 'forge');

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', op_a, 'authenticated', 'authenticated', 'op-a@editar-venta-paquete.local', now(), '{}'),
    ('00000000-0000-0000-0000-000000000000', op_b, 'authenticated', 'authenticated', 'op-b@editar-venta-paquete.local', now(), '{}');

  -- staff_gym() resolves the caller's gym from this (user_id, role in ('owner','operator')) row.
  insert into public.gym_membership (user_id, gym_id, role) values
    (op_a, gym_a, 'operator'),
    (op_b, gym_b, 'operator');

  -- ── The catalog. Package facts come from these rows, never from the caller (C13). ───────────────
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_a, 'MENSUAL 12',   12,   'mes',  null, 1200) returning id into pk_mes;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_a, 'PAQUETE 4',     4,   'dias',   10,  400) returning id into pk_4;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_a, 'PAQUETE 8',     8,   'dias',   20,  800) returning id into pk_8;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_a, 'NUEVO NOMBRE',  8,   'dias',   20,  800) returning id into pk_igual;
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio) values
    (gym_b, 'AJENO 5',       5,   'dias',   10,  500) returning id into pk_b;

  -- One class_type for every session this file needs (S16's three, S17's one).
  insert into public.class_type (gym_id, name) values (gym_a, 'EVP Metcon') returning id into ct;

  -- ── S1: stored 10 clases / vence +40; the sale granted 8 clases over 20 días, three days ago ────
  -- The member has trained ZERO times since, so the corrected sale's answer is its own grant.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Swap', '0000000021', 10, v_hoy_gym + 40, '8 CLASES', gym_a) returning id into c1;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c1, 7201, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '3 days', now() - interval '3 days')
    returning id into v1;

  -- ── S2: same shape; swapped twice, to a finite custom package and then to an ilimitado one ──────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Personalizado', '0000000022', 10, v_hoy_gym + 40, '8 CLASES', gym_a) returning id into c2;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c2, 7202, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v2;

  -- ── S3: GRANT − CONSUMED. A 12-clase sale, THREE real marks since it was registered, and a stored
  -- counter drifted two BELOW what those events explain (7 instead of 9) — the everyday state of the
  -- roster this slice exists for. The correction must read the ledger, not the counter.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Consumidas', '0000000023', 7, v_hoy_gym + 20, 'MENSUAL 12', gym_a) returning id into c3;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c3, 7203, 'MENSUAL 12', 12, 'dias', 30, 1200, 'efectivo', now() - interval '10 days', now() - interval '10 days')
    returning id into v3;
  -- One mark per day (the (cliente, fecha) uniqueness on class-less visits), all comfortably after the
  -- sale's registration instant, each with an explicit gym-local `hora` so the charge moment is exact.
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen)
    select gym_a, c3, v_hoy_gym - g.d, time '10:00', true, 'libre' from generate_series(1, 3) as g(d);

  -- ── S4: THE CLAMP. The same 12-clase sale with NINE charges, on a counter drifted all the way UP to
  -- 12 (it claims nothing was ever used). Swapped DOWN to a 4-clase package.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Piso', '0000000024', 12, v_hoy_gym + 20, 'MENSUAL 12', gym_a) returning id into c4;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c4, 7204, 'MENSUAL 12', 12, 'dias', 30, 1200, 'efectivo', now() - interval '10 days', now() - interval '10 days')
    returning id into v4;
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen)
    select gym_a, c4, v_hoy_gym - g.d, time '10:00', true, 'libre' from generate_series(1, 9) as g(d);

  -- ── S5a: fecha-only recompute WITH charges. Two marks after the sale was registered. ────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Fecha Recalculo', '0000000025', 10, v_hoy_gym + 40, '8 CLASES', gym_a) returning id into c5;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c5, 7205, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '10 days', now() - interval '10 days')
    returning id into v5;
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen) values
    (gym_a, c5, v_hoy_gym - 2, time '10:00', true, 'libre'),
    (gym_a, c5, v_hoy_gym - 4, time '10:00', true, 'libre');

  -- ── S5b: a POLLUTED stored state (6 clases, vence +2 against a 20-día sale sold yesterday) that
  -- registrar could never have written, and ZERO charge events. The rebuild must ignore all of it.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Contador Ignorado', '0000000026', 6, v_hoy_gym + 2, '8 CLASES', gym_a) returning id into c6;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c6, 7206, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '1 day', now() - interval '1 day')
    returning id into v6;

  -- ── S6: the replay target ──────────────────────────────────────────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Replay', '0000000027', 10, v_hoy_gym + 40, '8 CLASES', gym_a) returning id into c7;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c7, 7207, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '3 days', now() - interval '3 days')
    returning id into v7;

  -- ── S7: registered 31 days ago — one day past the recalculation window ─────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Ventana', '0000000028', 5, v_hoy_gym + 30, 'FUERA DE VENTANA', gym_a) returning id into c8;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c8, 7208, 'FUERA DE VENTANA', 8, 'mes', null, 900, 'efectivo', now() - interval '31 days', now() - interval '31 days')
    returning id into v8;

  -- ── S8: well inside the window, so only tenancy can refuse it ──────────────────────────────────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Ajeno', '0000000029', 7, v_hoy_gym + 35, 'AJENO', gym_a) returning id into c9;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c9, 7209, 'AJENO', 8, 'mes', null, 950, 'efectivo', now() - interval '4 days', now() - interval '4 days')
    returning id into v9;

  -- ── S9: the argument-refusal target; fully entitled caller, so only the bound can refuse ───────
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Argumentos', '0000000030', 9, v_hoy_gym + 20, '8 CLASES', gym_a) returning id into c10;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c10, 7210, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v10;

  -- ── S10: the cheap path. Stored 9 against a sale that grants 8 and zero charges, so a body that
  -- re-derived on a metadata-only call would visibly write 8 here.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Barato', '0000000031', 9, v_hoy_gym + 20, '8 CLASES', gym_a) returning id into c11;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c11, 7211, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v11;

  -- ── S11: rename-only. The sale's grant is byte-identical to pk_igual's; only the label differs. ─
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Renombre', '0000000032', 10, v_hoy_gym + 40, 'VIEJO NOMBRE', gym_a) returning id into c12;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c12, 7212, 'VIEJO NOMBRE', 8, 'dias', 20, 800, 'efectivo', now() - interval '3 days', now() - interval '3 days')
    returning id into v12;

  -- ── S12: the LAPSED CHAIN. v13 (8 clases / 20 días) was sold 25 days ago and expired on day −5;
  -- v14, the same package sold 2 days ago, restarted the member on its own grant: 8 clases, vence +18.
  -- v13 is INSIDE the 30-day window, so only the top-of-stack precondition can refuse an edit of it.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Pila', '0000000033', 8, v_hoy_gym + 18, '8 CLASES', gym_a) returning id into c13;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c13, 7213, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '25 days', now() - interval '25 days')
    returning id into v13;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c13, 7214, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '2 days', now() - interval '2 days')
    returning id into v14;

  -- ── S13: a FRESH sale — the member had no vigencia at all when they bought — of 12 clases / 30
  -- días, sold YESTERDAY (gym-tz): registrar wrote `fecha + 30` = hoy+29 and the package's own 12.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Fresca', '0000000034', 12, v_hoy_gym + 29, 'MENSUAL 12', gym_a) returning id into c_fresca;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c_fresca, 7215, 'MENSUAL 12', 12, 'dias', 30, 1200, 'efectivo',
            ((v_hoy_gym - 1)::timestamp + interval '12 hours') at time zone v_tz, now() - interval '1 day')
    returning id into v_fresca;

  -- ── S14: a GENUINELY STACKED sale. The member's PRIOR package ended on B = hoy−3 carrying 2 clases;
  -- this sale (8 clases / 20 días) was bought 6 days ago while that base was still live, so registrar
  -- wrote max(B, fecha) + 20 = hoy+17 and 2 + 8 = 10 clases. Both carries die on the first correction.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Apilada', '0000000035', 10, v_hoy_gym + 17, '8 CLASES', gym_a) returning id into c_apilada;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c_apilada, 7216, '8 CLASES', 8, 'dias', 20, 750, 'efectivo',
            ((v_hoy_gym - 6)::timestamp + interval '12 hours') at time zone v_tz, now() - interval '6 days')
    returning id into v_apilada;

  -- ── S15: an ILIMITADO sale (clases NULL, the ADR-0004 marker) with FOUR marks under it. An
  -- ilimitado plan never decrements, so every one of those rows carries consumio = false — which is
  -- exactly why the §D0 asistencia leg must not filter on consumio. The stored vence is deliberately
  -- NOT the value the rebuild produces, so "recomputed" is distinguishable from "left alone".
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Ilimitado', '0000000036', null, v_hoy_gym + 5, 'ILIMITADO 30', gym_a) returning id into c15;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at, personalizado)
    values (gym_a, c15, 7217, 'ILIMITADO 30', null, 'dias', 30, 1500, 'efectivo',
            now() - interval '10 days', now() - interval '10 days', true)
    returning id into v15;
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen)
    select gym_a, c15, v_hoy_gym - g.d, time '10:00', false, 'libre' from generate_series(1, 4) as g(d);

  -- ── S16: the reservation leg. Three sessions at three distinct instants (one uncancelled class per
  -- gym per instant, 20260823120100) and three bookings that ALL carry consumio = true.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct, now() - interval '2 days', 60, 20) returning id into s_pasada;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct, now() + interval '2 days', 60, 20) returning id into s_futura;
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity, cancelled_at)
    values (gym_a, ct, now() - interval '3 days', 60, 20, now()) returning id into s_cancel;

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Reservas', '0000000037', 4, v_hoy_gym + 3, 'RESERVAS 10', gym_a) returning id into c16;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c16, 7218, 'RESERVAS 10', 10, 'dias', 30, 1000, 'efectivo', now() - interval '10 days', now() - interval '10 days')
    returning id into v16;

  -- (i) booked, charged at booking, then attended: the asistencia is the SAME charge, not a second one.
  insert into public.reservation (gym_id, class_session_id, member_id, status, consumio, checked_at)
    values (gym_a, s_pasada, c16, 'asistida', true, now() - interval '2 days') returning id into r_pas;
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen, class_session_id, reservation_id)
    values (gym_a, c16, v_hoy_gym - 2, time '10:00', false, 'clase', s_pasada, r_pas);
  -- (ii) a live hold on a class that has not run yet — already debited at booking time (#233).
  insert into public.reservation (gym_id, class_session_id, member_id, status, consumio)
    values (gym_a, s_futura, c16, 'reservada', true) returning id into r_fut;
  -- (iii) the GYM cancelled the class: refunded, status flipped, `consumio` left standing (stale).
  insert into public.reservation (gym_id, class_session_id, member_id, status, consumio, cancelled_at)
    values (gym_a, s_cancel, c16, 'cancelada', true, now()) returning id into r_can;

  -- ── S17: the BERENICE pair. The sale was registered at 20:53 GYM-local yesterday; one mark at 18:12
  -- that evening (the OLD pack paid for it) and one at 21:30 (this pack's). Both are after 18:00 local,
  -- so in UTC−6 they straddle the UTC date boundary — a session-calendar reading gets 21:30 wrong.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Berenice', '0000000038', 5, v_hoy_gym + 3, '6 CLASES', gym_a) returning id into c17;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c17, 7219, '6 CLASES', 6, 'dias', 20, 600, 'efectivo',
            ((v_hoy_gym - 1)::timestamp + interval '20 hours 53 minutes') at time zone v_tz,
            ((v_hoy_gym - 1)::timestamp + interval '20 hours 53 minutes') at time zone v_tz)
    returning id into v17;
  -- 18:12 — BEFORE the sale was registered. A class-less (libre) row, so it does not collide with the
  -- 21:30 one under the (cliente, fecha) uniqueness on class-less visits.
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen)
    values (gym_a, c17, v_hoy_gym - 1, time '18:12', true, 'libre');
  -- 21:30 — AFTER it, same gym day, already tomorrow in UTC. A real class mark, on its own session.
  insert into public.class_session (gym_id, class_type_id, starts_at, duration_min, capacity)
    values (gym_a, ct, ((v_hoy_gym - 1)::timestamp + interval '21 hours 30 minutes') at time zone v_tz, 60, 20)
    returning id into s_tarde;
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen, class_session_id)
    values (gym_a, c17, v_hoy_gym - 1, time '21:30', true, 'clase', s_tarde);

  -- ── S18: one ordinary mark, one perdonada (the cooldown's second record of ONE arrival) and one
  -- soft-deleted (an undone toggle). Only the first is a charge.
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values ('EVP Perdonadas', '0000000039', 2, v_hoy_gym + 3, '8 CLASES', gym_a) returning id into c18;
  insert into public.ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
    values (gym_a, c18, 7220, '8 CLASES', 8, 'dias', 20, 750, 'efectivo', now() - interval '10 days', now() - interval '10 days')
    returning id into v18;
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen, perdonada, deleted_at) values
    (gym_a, c18, v_hoy_gym - 1, time '10:00', true,  'libre', false, null),
    (gym_a, c18, v_hoy_gym - 2, time '10:00', false, 'libre', true,  null),
    (gym_a, c18, v_hoy_gym - 3, time '10:00', true,  'libre', false, now());

  perform set_config('t.gym_a',    gym_a::text,    true);
  perform set_config('t.gym_b',    gym_b::text,    true);
  perform set_config('t.op_a',     op_a::text,     true);
  perform set_config('t.op_b',     op_b::text,     true);
  perform set_config('t.tz',       v_tz,           true);
  perform set_config('t.pk_mes',   pk_mes::text,   true);
  perform set_config('t.pk_4',     pk_4::text,     true);
  perform set_config('t.pk_8',     pk_8::text,     true);
  perform set_config('t.pk_igual', pk_igual::text, true);
  perform set_config('t.pk_b',     pk_b::text,     true);
  perform set_config('t.c1',  c1::text,  true); perform set_config('t.v1',  v1::text,  true);
  perform set_config('t.c2',  c2::text,  true); perform set_config('t.v2',  v2::text,  true);
  perform set_config('t.c3',  c3::text,  true); perform set_config('t.v3',  v3::text,  true);
  perform set_config('t.c4',  c4::text,  true); perform set_config('t.v4',  v4::text,  true);
  perform set_config('t.c5',  c5::text,  true); perform set_config('t.v5',  v5::text,  true);
  perform set_config('t.c6',  c6::text,  true); perform set_config('t.v6',  v6::text,  true);
  perform set_config('t.c7',  c7::text,  true); perform set_config('t.v7',  v7::text,  true);
  perform set_config('t.c8',  c8::text,  true); perform set_config('t.v8',  v8::text,  true);
  perform set_config('t.c9',  c9::text,  true); perform set_config('t.v9',  v9::text,  true);
  perform set_config('t.c10', c10::text, true); perform set_config('t.v10', v10::text, true);
  perform set_config('t.c11', c11::text, true); perform set_config('t.v11', v11::text, true);
  perform set_config('t.c12', c12::text, true); perform set_config('t.v12', v12::text, true);
  perform set_config('t.c13', c13::text, true); perform set_config('t.v13', v13::text, true);
                                                perform set_config('t.v14', v14::text, true);
  perform set_config('t.c15', c15::text, true); perform set_config('t.v15', v15::text, true);
  perform set_config('t.c16', c16::text, true); perform set_config('t.v16', v16::text, true);
  perform set_config('t.c17', c17::text, true); perform set_config('t.v17', v17::text, true);
  perform set_config('t.c18', c18::text, true); perform set_config('t.v18', v18::text, true);
  perform set_config('t.c_fresca',  c_fresca::text,  true);
  perform set_config('t.v_fresca',  v_fresca::text,  true);
  perform set_config('t.c_apilada', c_apilada::text, true);
  perform set_config('t.v_apilada', v_apilada::text, true);

  -- S1's whole-row snapshot MINUS the eight columns the swap may write. The assertion re-computes it
  -- and demands jsonb equality: a column this suite never names by hand still cannot move unnoticed.
  perform set_config('t.v1_rest',
    (select (to_jsonb(v.*) - 'monto' - 'metodo' - 'fecha' - 'paquete_nombre' - 'clases'
                          - 'vigencia_tipo' - 'vigencia_dias' - 'personalizado')::text
       from public.ventas v where v.id = v1), true);
  -- S7/S8/S9's "nothing was written" baselines: the FULL row on both tables.
  perform set_config('t.v8_all',  (select to_jsonb(v.*)::text from public.ventas   v where v.id = v8),  true);
  perform set_config('t.c8_all',  (select to_jsonb(c.*)::text from public.clientes c where c.id = c8),  true);
  perform set_config('t.v9_all',  (select to_jsonb(v.*)::text from public.ventas   v where v.id = v9),  true);
  perform set_config('t.c9_all',  (select to_jsonb(c.*)::text from public.clientes c where c.id = c9),  true);
  perform set_config('t.v10_all', (select to_jsonb(v.*)::text from public.ventas   v where v.id = v10), true);
  perform set_config('t.c10_all', (select to_jsonb(c.*)::text from public.clientes c where c.id = c10), true);
  perform set_config('t.c11_all', (select to_jsonb(c.*)::text from public.clientes c where c.id = c11), true);
  perform set_config('t.v13_all', (select to_jsonb(v.*)::text from public.ventas   v where v.id = v13), true);
  perform set_config('t.c13_all', (select to_jsonb(c.*)::text from public.clientes c where c.id = c13), true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);

-- ══ S1 — SWAP TO A REGISTRADO PAQUETE: the sale takes the catalog's facts, the saldo is REBUILT ═════
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v1', true)::uuid, 1200, 'transferencia',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare
  rec     record;
  cli     record;
  v_hoy   date := (now() at time zone current_setting('t.tz', true))::date;
  v_rest  jsonb := current_setting('t.v1_rest', true)::jsonb;
  v_after jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.v1', true)::uuid;
  if rec.id is null then raise exception 'S1 FAIL: the venta row vanished — a swap rewrites it, never deletes it'; end if;

  if rec.paquete_nombre is distinct from 'MENSUAL 12' then
    raise exception 'S1 FAIL: paquete_nombre = % (expected MENSUAL 12 — the swapped-in catalog name)', rec.paquete_nombre;
  end if;
  if rec.clases is distinct from 12 then
    raise exception 'S1 FAIL: clases = % (expected 12 — the sale now records what the NEW package grants)', rec.clases;
  end if;
  if rec.vigencia_tipo is distinct from 'mes' then
    raise exception 'S1 FAIL: vigencia_tipo = % (expected mes — taken from the paquete row, not from the caller)', rec.vigencia_tipo;
  end if;
  if rec.vigencia_dias is not null then
    raise exception 'S1 FAIL: vigencia_dias = % (expected NULL — a mes package carries no día count, paquetes_vigencia_ck)', rec.vigencia_dias;
  end if;
  if rec.personalizado is distinct from false then
    raise exception 'S1 FAIL: personalizado = % (expected false — this arm swapped onto a REGISTERED paquete)', rec.personalizado;
  end if;
  if rec.monto is distinct from 1200 then
    raise exception 'S1 FAIL: monto = % (expected 1200 — the amount is the caller''s, reseeded from the package in the sheet)', rec.monto;
  end if;
  if rec.metodo is distinct from 'transferencia' then
    raise exception 'S1 FAIL: metodo = % (expected transferencia)', rec.metodo;
  end if;
  if rec.folio is distinct from 7201 then
    raise exception 'S1 FAIL: folio = % (expected 7201 — a swap never re-folios the sale; the folio is the paper ticket)', rec.folio;
  end if;
  if rec.cliente_id is distinct from current_setting('t.c1', true)::uuid then
    raise exception 'S1 FAIL: cliente_id = % (expected the fixture cliente — a swap never re-assigns the sale)', rec.cliente_id;
  end if;
  if rec.gym_id is distinct from current_setting('t.gym_a', true)::uuid then
    raise exception 'S1 FAIL: gym_id = % (expected gym A — the tenant stamp must survive a swap)', rec.gym_id;
  end if;

  -- the catch-all: every column except the eight the swap may write, byte-for-byte (created_at, the
  -- window anchor AND the §D0 count anchor, is inside it)
  select to_jsonb(v.*) - 'monto' - 'metodo' - 'fecha' - 'paquete_nombre' - 'clases'
                       - 'vigencia_tipo' - 'vigencia_dias' - 'personalizado'
    into v_after from public.ventas v where v.id = rec.id;
  if v_after is distinct from v_rest then
    raise exception 'S1 FAIL: a column outside the swap''s write set changed. before = % / after = %', v_rest, v_after;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c1', true)::uuid;
  if cli.clases_restantes is distinct from 12 then
    raise exception 'S1 FAIL: clases_restantes = % (expected 12 — the corrected package''s own grant, nothing charged against it yet. 14 is the old clawback, 10 − 8 + 12, stacking the leftovers back on)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 27 then
    raise exception 'S1 FAIL: vence = % (expected % — the sold day (hoy−3) plus the flat 30 a mes package contributes, with NO base carried. current_date + 50 is the old carry)', cli.vence, v_hoy + 27;
  end if;
  if cli.paquete_nombre is distinct from 'MENSUAL 12' then
    raise exception 'S1 FAIL: cliente paquete_nombre = % (expected MENSUAL 12 — the swapped sale is the latest, so the display label follows it)', cli.paquete_nombre;
  end if;
end $$;

-- ══ S2 — SWAP TO PERSONALIZADO, then again to an ILIMITADO one ══════════════════════════════════════
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v2', true)::uuid, 999, 'efectivo',
                              p_custom_nombre := 'PASE ESPECIAL',
                              p_custom_clases := 5,
                              p_custom_dias   := 10);
end $$;
reset role;
do $$
declare
  rec   record;
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into rec from public.ventas where id = current_setting('t.v2', true)::uuid;
  if rec.personalizado is distinct from true then
    raise exception 'S2a FAIL: personalizado = % (expected true — the custom branch must flag the sale)', rec.personalizado;
  end if;
  if rec.vigencia_tipo is distinct from 'dias' then
    raise exception 'S2a FAIL: vigencia_tipo = % (expected dias — a personalizado package is always dias)', rec.vigencia_tipo;
  end if;
  if rec.vigencia_dias is distinct from 10 then
    raise exception 'S2a FAIL: vigencia_dias = % (expected 10 — the typed vigencia)', rec.vigencia_dias;
  end if;
  if rec.clases is distinct from 5 then
    raise exception 'S2a FAIL: clases = % (expected 5 — the typed class count)', rec.clases;
  end if;
  if rec.paquete_nombre is distinct from 'PASE ESPECIAL' then
    raise exception 'S2a FAIL: paquete_nombre = % (expected PASE ESPECIAL — trimmed, from the caller)', rec.paquete_nombre;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c2', true)::uuid;
  if cli.clases_restantes is distinct from 5 then
    raise exception 'S2a FAIL: clases_restantes = % (expected 5 — the custom package''s own count, nothing charged. 7 is the old clawback, 10 − 8 + 5)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 8 then
    raise exception 'S2a FAIL: vence = % (expected % — the sold day (hoy−2) plus the custom 10 días)', cli.vence, v_hoy + 8;
  end if;
  if cli.paquete_nombre is distinct from 'PASE ESPECIAL' then
    raise exception 'S2a FAIL: cliente paquete_nombre = % (expected PASE ESPECIAL)', cli.paquete_nombre;
  end if;
end $$;

set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v2', true)::uuid, 1500, 'efectivo',
                              p_custom_nombre    := 'ILIMITADO MES',
                              p_custom_dias      := 15,
                              p_custom_ilimitado := true);
end $$;
reset role;
do $$
declare
  rec   record;
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into rec from public.ventas where id = current_setting('t.v2', true)::uuid;
  if rec.clases is not null then
    raise exception 'S2b FAIL: clases = % (expected NULL — null IS the ilimitado marker, ADR-0004, and p_custom_ilimitado is how the caller says so)', rec.clases;
  end if;
  if rec.vigencia_dias is distinct from 15 then
    raise exception 'S2b FAIL: vigencia_dias = % (expected 15)', rec.vigencia_dias;
  end if;
  if rec.personalizado is distinct from true then
    raise exception 'S2b FAIL: personalizado = % (expected true)', rec.personalizado;
  end if;
  if rec.paquete_nombre is distinct from 'ILIMITADO MES' then
    raise exception 'S2b FAIL: paquete_nombre = % (expected ILIMITADO MES)', rec.paquete_nombre;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c2', true)::uuid;
  if cli.clases_restantes is not null then
    raise exception 'S2b FAIL: clases_restantes = % (expected NULL — an ilimitado package makes the balance ilimitado, never 0. FINITE → ILIMITADO)', cli.clases_restantes;
  end if;
  -- Consecutive edits do NOT compose: this one re-derives from the sale's own (now ilimitado/15-día)
  -- facts at the sale's own day, rather than carrying the previous swap's 10 días forward.
  if cli.vence is distinct from v_hoy + 13 then
    raise exception 'S2b FAIL: vence = % (expected % — the sold day (hoy−2) plus the new 15 días. hoy+35 would mean the second edit carried the first one''s días forward instead of re-deriving)', cli.vence, v_hoy + 13;
  end if;
end $$;

-- ══ S3 — GRANT − CONSUMED, from the LEDGER: 12-clase sale, 3 charges, corrected to an 8-clase pack ══
-- AC2's first half. The stored counter says 7 (two below what the three marks explain — real drift, the
-- state slice 2 exists for). As-if-original never looks at it: the answer is 8 − 3 = 5. A body that
-- clawed the stored grant back would write 7 − 12 + 8 = 3 and carry the drift through the correction.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v3', true)::uuid, 800, 'efectivo',
                              p_paquete_id := current_setting('t.pk_8', true)::uuid);
end $$;
reset role;
do $$
declare
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into cli from public.clientes where id = current_setting('t.c3', true)::uuid;
  if cli.clases_restantes is distinct from 5 then
    raise exception 'S3 FAIL: clases_restantes = % (expected 5 — the corrected 8-clase grant minus the 3 charges since the sale was registered. 3 means the body read the stored counter (7 − 12 + 8); 8 means the charges were not counted at all)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 10 then
    raise exception 'S3 FAIL: vence = % (expected % — the sold day (hoy−10) plus the corrected package''s 20 días)', cli.vence, v_hoy + 10;
  end if;
  if cli.paquete_nombre is distinct from 'PAQUETE 8' then
    raise exception 'S3 FAIL: cliente paquete_nombre = % (expected PAQUETE 8)', cli.paquete_nombre;
  end if;
end $$;

-- ══ S4 — THE CLAMP AT ZERO: 9 charges against a corrected 4-clase pack ⇒ exactly 0, never negative ══
-- AC2's second half. The counter is drifted all the way up to 12 — it claims nothing was ever used —
-- so a counter-reading body writes 12 − 12 + 4 = 4: four classes gifted on top of nine already trained.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v4', true)::uuid, 400, 'efectivo',
                              p_paquete_id := current_setting('t.pk_4', true)::uuid);
end $$;
reset role;
do $$
declare
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into cli from public.clientes where id = current_setting('t.c4', true)::uuid;
  if cli.clases_restantes is distinct from 0 then
    raise exception 'S4 FAIL: clases_restantes = % (expected 0 — greatest(0, 4 − 9). 4 means the stored counter was read instead of the ledger; a negative means no clamp at all)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy then
    raise exception 'S4 FAIL: vence = % (expected % — the sold day (hoy−10) plus the new package''s 10 días)', cli.vence, v_hoy;
  end if;
  if cli.paquete_nombre is distinct from 'PAQUETE 4' then
    raise exception 'S4 FAIL: cliente paquete_nombre = % (expected PAQUETE 4)', cli.paquete_nombre;
  end if;
end $$;

-- ══ S5a — FECHA-ONLY RECOMPUTE, with charges: the same core, reached through the other argument ═════
-- Two marks landed after this sale was registered, so the corrected sale leaves 8 − 2 = 6 — and the
-- stored 10 / +40 is silently HEALED, a consequence the ruling names and calls correct. The ANCHOR does
-- not move with the paper day: the count still runs from `created_at`, ten days back, so both marks
-- stay attributed here.
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.v5', true)::uuid, 800, 'efectivo', p_fecha := v_hoy - 5);
end $$;
reset role;
do $$
declare
  rec        record;
  cli        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  v_esperado timestamptz := ((v_hoy - 5)::timestamp + interval '12 hours')
                            at time zone current_setting('t.tz', true);
begin
  select * into rec from public.ventas where id = current_setting('t.v5', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'S5a FAIL: fecha = % (expected % — midday gym-tz on the requested day, registrar_venta''s write convention)', rec.fecha, v_esperado;
  end if;
  if rec.clases is distinct from 8 or rec.vigencia_dias is distinct from 20 or rec.paquete_nombre is distinct from '8 CLASES' then
    raise exception 'S5a FAIL: the package facts moved on a fecha-only call (clases=%, dias=%, nombre=%)', rec.clases, rec.vigencia_dias, rec.paquete_nombre;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c5', true)::uuid;
  if cli.clases_restantes is distinct from 6 then
    raise exception 'S5a FAIL: clases_restantes = % (expected 6 — the sale''s own 8 minus the 2 charges since it was registered. 10 means the drifted counter was kept; 8 means the charges were not counted)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 15 then
    raise exception 'S5a FAIL: vence = % (expected % — the NEW sold day plus the sale''s own 20 días. current_date + 40 means a base was carried)', cli.vence, v_hoy + 15;
  end if;
  if cli.paquete_nombre is distinct from '8 CLASES' then
    raise exception 'S5a FAIL: cliente paquete_nombre = % (expected 8 CLASES — the re-stamp resolves to the same sale''s own name)', cli.paquete_nombre;
  end if;
end $$;

-- ══ S5b — THE STORED COUNTER IS NOT READ: a polluted row is rebuilt from the sale's own terms ═══════
-- 6 clases with vence +2 against a 20-día sale sold yesterday is a state registrar could never have
-- written — the shape the pre-ruling attribution-only fecha edits left behind. There are no charge
-- events at all, so the rebuild is the sale's own 8 clases and its own 20 días from the new day. If any
-- part of the body still read `clases_restantes`, this vector comes back 6.
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.v6', true)::uuid, 700, 'efectivo', p_fecha := v_hoy - 3);
end $$;
reset role;
do $$
declare
  rec        record;
  cli        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  v_esperado timestamptz := ((v_hoy - 3)::timestamp + interval '12 hours')
                            at time zone current_setting('t.tz', true);
begin
  select * into rec from public.ventas where id = current_setting('t.v6', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'S5b FAIL: fecha = % (expected % — midday gym-tz on the requested day)', rec.fecha, v_esperado;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c6', true)::uuid;
  if cli.clases_restantes is distinct from 8 then
    raise exception 'S5b FAIL: clases_restantes = % (expected 8 — the sale''s own grant, nothing charged. 6 means the stored counter leaked into the answer)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 17 then
    raise exception 'S5b FAIL: vence = % (expected % — the new start day plus the sale''s own 20 días)', cli.vence, v_hoy + 17;
  end if;
end $$;

-- ══ S6 — IDEMPOTENCE: the identical swap twice, with a REAL visit in between ════════════════════════
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v7', true)::uuid, 1200, 'transferencia',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare
  c     jsonb;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select to_jsonb(x.*) into c from public.clientes x where x.id = current_setting('t.c7', true)::uuid;
  if (c ->> 'clases_restantes')::int is distinct from 12 then
    raise exception 'S6 FAIL: the first call did not land (clases_restantes = %, expected 12)', c ->> 'clases_restantes';
  end if;

  -- The member TRAINS between the two fires — as toggle_pase writes it: an asistencia row AND the
  -- matching counter decrement, not a bare counter change. A replay is not a fresh transaction in a
  -- frozen world, and the balance the replay must not touch is the DECREMENTED one.
  insert into public.asistencias (gym_id, cliente_id, fecha, hora, consumio, origen)
    values (current_setting('t.gym_a', true)::uuid, current_setting('t.c7', true)::uuid,
            v_hoy - 1, time '10:00', true, 'libre');
  update public.clientes set clases_restantes = clases_restantes - 1
    where id = current_setting('t.c7', true)::uuid;

  -- The baseline is taken AFTER the visit, so the jsonb catch-all below pins the consumed balance.
  select to_jsonb(x.*) into c from public.clientes x where x.id = current_setting('t.c7', true)::uuid;
  perform set_config('t.c7_after1', c::text, true);
end $$;

set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v7', true)::uuid, 1200, 'transferencia',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare
  v_after1 jsonb := current_setting('t.c7_after1', true)::jsonb;
  v_after2 jsonb;
  rec      record;
  n        int;
begin
  select to_jsonb(x.*) into v_after2 from public.clientes x where x.id = current_setting('t.c7', true)::uuid;
  if v_after2 is distinct from v_after1 then
    raise exception 'S6 FAIL: the replay moved the saldo again. after 1 = % / after 2 = %', v_after1, v_after2;
  end if;
  if (v_after2 ->> 'clases_restantes')::int is distinct from 11 then
    raise exception 'S6 FAIL: clases_restantes = % (expected 11 — the class consumed between the two fires must survive the replay. As-if-original is a fixed point over EVENTS: fire 2 re-counts the same visit, 12 − 1. A body keyed on the counter would hand the class back)', v_after2 ->> 'clases_restantes';
  end if;

  select count(*) into n from public.ventas where cliente_id = current_setting('t.c7', true)::uuid;
  if n <> 1 then
    raise exception 'S6 FAIL: % ventas row(s) for the cliente (expected 1 — editar_venta UPDATEs a row named by id, it never INSERTs, which is why it needs no idempotency key)', n;
  end if;
  select * into rec from public.ventas where id = current_setting('t.v7', true)::uuid;
  if rec.folio is distinct from 7207 then
    raise exception 'S6 FAIL: folio = % (expected 7207 — a replay must not re-folio)', rec.folio;
  end if;
end $$;

-- ══ S7 — THE WINDOW COVERS THE RE-DERIVE: swap AND fecha refused past 30 days; attribution accepted ══
-- The sale is 31 days old and is the cliente's only one, so the top-of-stack precondition (S12) cannot
-- be what refuses these calls — the window is. The guard is written over the predicate that TRIGGERS
-- the re-derive: a fecha-only edit rebuilds exactly as much as a swap does. What stays any-age is what
-- moves no saldo — monto and metodo (#266.3).
set local role authenticated;
do $$
declare
  v_msg text;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v8', true)::uuid, 1200, 'efectivo',
                                p_paquete_id := current_setting('t.pk_mes', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Ya pasaron 30 días: esta venta ya no se puede recalcular' then
    raise exception 'S7 FAIL (swap): got % (expected Ya pasaron 30 días: esta venta ya no se puede recalcular — ruling 4''s window, anchored on created_at like the delete''s)', coalesce(v_msg, '<no error raised>');
  end if;

  -- The same window, reached through the OTHER argument: a fecha-only correction of a 31-day-old sale.
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v8', true)::uuid, 900, 'efectivo', p_fecha := v_hoy - 2);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Ya pasaron 30 días: esta venta ya no se puede recalcular' then
    raise exception 'S7 FAIL (fecha): got % (expected Ya pasaron 30 días: esta venta ya no se puede recalcular — windowing the swap but not the fecha that drives the same rebuild would leave the door open under a different argument name)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v8_all', true)::jsonb;
  c_all jsonb := current_setting('t.c8_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v8', true)::uuid;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c8', true)::uuid;
  if v_now is distinct from v_all then
    raise exception 'S7 FAIL: a refused call still wrote the venta. before = % / after = %', v_all, v_now;
  end if;
  if c_now is distinct from c_all then
    raise exception 'S7 FAIL: a refused call still moved the saldo. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- …and the SAME 31-day-old sale still accepts a monto/metodo edit: attribution is any-age (#266.3).
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v8', true)::uuid, 999, 'tarjeta');
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v8_all', true)::jsonb;
  c_all jsonb := current_setting('t.c8_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas v where v.id = current_setting('t.v8', true)::uuid;
  if (v_now ->> 'monto')::int is distinct from 999 or v_now ->> 'metodo' is distinct from 'tarjeta' then
    raise exception 'S7 FAIL: the any-age monto/metodo edit was refused too (monto=%, metodo=% — the window must cover the RECALCULATION only, #266.3)', v_now ->> 'monto', v_now ->> 'metodo';
  end if;
  -- Everything except the two attribution columns is byte-identical: the fecha the refused call asked
  -- for did not sneak in, and no package fact moved on a package-less call.
  if (v_now - 'monto' - 'metodo') is distinct from (v_all - 'monto' - 'metodo') then
    raise exception 'S7 FAIL: the monto/metodo edit moved something else on the venta. before = % / after = %', v_all, v_now;
  end if;

  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c8', true)::uuid;
  if c_now is distinct from c_all then
    raise exception 'S7 FAIL: a monto/metodo-only edit touched the cliente. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S8 — CROSS-TENANT, both directions: another gym's venta, and another gym's paquete ══════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v9', true)::uuid, 1200, 'efectivo',
                                p_paquete_id := current_setting('t.pk_b', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Venta no encontrada' then
    raise exception 'S8 FAIL: gym B staff got % (expected Venta no encontrada — a refusal, not a silent no-op, and the same message a non-existent id gets)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;

-- Gym A's own staff, gym B's paquete id: the paquete lookup is tenant-scoped, so this is a refusal too.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v9', true)::uuid, 1200, 'efectivo',
                                p_paquete_id := current_setting('t.pk_b', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Paquete no encontrado' then
    raise exception 'S8 FAIL: got % on a cross-gym paquete id (expected Paquete no encontrado — the catalog read carries the tenant gate, so another gym''s package is a refusal, never a silently applied grant)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v9_all', true)::jsonb;
  c_all jsonb := current_setting('t.c9_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v9', true)::uuid;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c9', true)::uuid;
  if v_now is distinct from v_all then
    raise exception 'S8 FAIL: a cross-tenant call wrote gym A''s venta. before = % / after = %', v_all, v_now;
  end if;
  if c_now is distinct from c_all then
    raise exception 'S8 FAIL: a cross-tenant call moved gym A''s saldo. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S9 — ARGUMENT REFUSALS: registrar_venta's messages, verbatim, and nothing written ═══════════════
-- The caller is gym A's own staff and the sale is 2 days old, so the ONLY thing that can refuse any of
-- these calls is the bound itself.
set local role authenticated;
do $$
declare v_msg text;
begin
  -- both sources at once. NOTE the difference from registrar_venta's XOR: here NEITHER is also legal,
  -- and means "keep the current package" (S5/S7/S10 exercise that arm).
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_paquete_id    := current_setting('t.pk_mes', true)::uuid,
                                p_custom_nombre := 'PASE ESPECIAL',
                                p_custom_clases := 5,
                                p_custom_dias   := 10);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Venta inválida: elige un paquete o define uno personalizado' then
    raise exception 'S9 FAIL (ambos): got % (expected Venta inválida: elige un paquete o define uno personalizado)', coalesce(v_msg, '<no error raised>');
  end if;

  -- a 2-char nombre: below registrar's 3..40 bound
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_custom_nombre := 'AB', p_custom_clases := 5, p_custom_dias := 10);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Nombre del paquete personalizado inválido' then
    raise exception 'S9 FAIL (nombre): got % (expected Nombre del paquete personalizado inválido)', coalesce(v_msg, '<no error raised>');
  end if;

  -- días 0 and días 366: the 1..365 bound, both edges
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_custom_nombre := 'PASE PRUEBA', p_custom_clases := 5, p_custom_dias := 0);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Vigencia personalizada inválida' then
    raise exception 'S9 FAIL (dias 0): got % (expected Vigencia personalizada inválida)', coalesce(v_msg, '<no error raised>');
  end if;

  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_custom_nombre := 'PASE PRUEBA', p_custom_clases := 5, p_custom_dias := 366);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Vigencia personalizada inválida' then
    raise exception 'S9 FAIL (dias 366): got % (expected Vigencia personalizada inválida)', coalesce(v_msg, '<no error raised>');
  end if;

  -- ilimitado AND a class count: incoherent, because null IS the ilimitado value
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v10', true)::uuid, 500, 'efectivo',
                                p_custom_nombre    := 'PASE PRUEBA', p_custom_dias := 10,
                                p_custom_clases    := 5,
                                p_custom_ilimitado := true);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Clases personalizadas inválidas' then
    raise exception 'S9 FAIL (ilimitado + clases): got % (expected Clases personalizadas inválidas)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v10_all', true)::jsonb;
  c_all jsonb := current_setting('t.c10_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v10', true)::uuid;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c10', true)::uuid;
  if v_now is distinct from v_all then
    raise exception 'S9 FAIL: a refused call still wrote the venta. before = % / after = %', v_all, v_now;
  end if;
  if c_now is distinct from c_all then
    raise exception 'S9 FAIL: a refused call still moved the saldo. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S10 — THE CHEAP PATH: monto/metodo only ⇒ the clientes row is byte-identical ════════════════════
-- The metadata-only contract. The re-derive is triggered by a CHANGE (grant or day), never by the call:
-- without that guard this very payload would rebuild and write 8 (the sale's grant, nothing charged)
-- over the stored 9, plus a vence nobody asked to move.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v11', true)::uuid, 1111, 'tarjeta');
end $$;
reset role;
do $$
declare
  rec   record;
  c_all jsonb := current_setting('t.c11_all', true)::jsonb;
  c_now jsonb;
begin
  select * into rec from public.ventas where id = current_setting('t.v11', true)::uuid;
  if rec.monto is distinct from 1111 or rec.metodo is distinct from 'tarjeta' then
    raise exception 'S10 FAIL: the edit itself did not land (monto=%, metodo=%)', rec.monto, rec.metodo;
  end if;
  if rec.paquete_nombre is distinct from '8 CLASES' or rec.clases is distinct from 8
     or rec.vigencia_tipo is distinct from 'dias' or rec.vigencia_dias is distinct from 20
     or rec.personalizado is distinct from false then
    raise exception 'S10 FAIL: a package-less call rewrote the package facts (nombre=%, clases=%, tipo=%, dias=%, person=%)',
      rec.paquete_nombre, rec.clases, rec.vigencia_tipo, rec.vigencia_dias, rec.personalizado;
  end if;

  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c11', true)::uuid;
  if c_now is distinct from c_all then
    raise exception 'S10 FAIL: a monto/metodo-only edit touched the cliente. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S11 — RENAME-ONLY: the label follows, the saldo does not move ═══════════════════════════════════
-- pk_igual grants exactly what the sale already granted (8 clases / 20 días), so v_cambio_grant is
-- false and the cheap path runs — but the display label still has to follow, and it is re-stamped from
-- the latest REMAINING sale rather than from the swapped-in name, which is what makes renaming a
-- NON-latest sale leave the label alone. Same discriminator as S10: a broken short circuit would write
-- 8 clases and a vence of hoy−3 + 20 here.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v12', true)::uuid, 800, 'efectivo',
                              p_paquete_id := current_setting('t.pk_igual', true)::uuid);
end $$;
reset role;
do $$
declare
  rec   record;
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into rec from public.ventas where id = current_setting('t.v12', true)::uuid;
  if rec.paquete_nombre is distinct from 'NUEVO NOMBRE' then
    raise exception 'S11 FAIL: ventas paquete_nombre = % (expected NUEVO NOMBRE — a same-grant swap still rewrites the label)', rec.paquete_nombre;
  end if;
  if rec.clases is distinct from 8 or rec.vigencia_dias is distinct from 20 then
    raise exception 'S11 FAIL: the grant moved (clases=%, dias=% — expected 8 / 20, byte-identical)', rec.clases, rec.vigencia_dias;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c12', true)::uuid;
  if cli.paquete_nombre is distinct from 'NUEVO NOMBRE' then
    raise exception 'S11 FAIL: cliente paquete_nombre = % (expected NUEVO NOMBRE — the swapped sale is the latest, so the label follows it)', cli.paquete_nombre;
  end if;
  if cli.clases_restantes is distinct from 10 then
    raise exception 'S11 FAIL: clases_restantes = % (expected 10, byte-identical — a rename is not a re-derive)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 40 then
    raise exception 'S11 FAIL: vence = % (expected %, byte-identical — a rename is not a re-derive)', cli.vence, v_hoy + 40;
  end if;
end $$;

-- ══ S12 — ONLY THE TOP OF THE STACK CAN RE-DERIVE: the lapsed chain ═════════════════════════════════
-- v13 (8 clases / 20 días) was sold 25 days ago and expired on day −5; v14, the same package sold 2 days
-- ago, restarted the member on ITS grant alone — 8 clases, vence +18. Editing v13 would write the whole
-- balance from v13's grant, erasing v14's outright, and the §D0 count could not tell which of the two
-- sales owns each event either. v13 is INSIDE the 30-day window, so nothing else can refuse this; only
-- the top-of-stack precondition can.
set local role authenticated;
do $$
declare v_msg text;
begin
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v13', true)::uuid, 1200, 'efectivo',
                                p_paquete_id := current_setting('t.pk_mes', true)::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Solo la venta más reciente puede cambiar de paquete o fecha' then
    raise exception 'S12 FAIL (swap): got % (expected Solo la venta más reciente puede cambiar de paquete o fecha — a later sale of the same cliente owns the saldo and part of the ledger)', coalesce(v_msg, '<no error raised>');
  end if;

  -- The same refusal through the fecha door: it runs the identical rebuild.
  v_msg := null;
  begin
    perform public.editar_venta(current_setting('t.v13', true)::uuid, 750, 'efectivo',
                                p_fecha := (now() at time zone current_setting('t.tz', true))::date - 20);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Solo la venta más reciente puede cambiar de paquete o fecha' then
    raise exception 'S12 FAIL (fecha): got % (expected Solo la venta más reciente puede cambiar de paquete o fecha)', coalesce(v_msg, '<no error raised>');
  end if;
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v13_all', true)::jsonb;
  c_all jsonb := current_setting('t.c13_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas   v where v.id = current_setting('t.v13', true)::uuid;
  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c13', true)::uuid;
  if v_now is distinct from v_all then
    raise exception 'S12 FAIL: the refused re-derive still wrote the venta. before = % / after = %', v_all, v_now;
  end if;
  if c_now is distinct from c_all then
    raise exception 'S12 FAIL: the refused re-derive still moved the saldo — v14''s grant would have been the casualty. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- …and the SAME non-latest sale accepts a monto/metodo edit: attribution moves no saldo, so an older
-- sale's amount and payment method stay correctable forever.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v13', true)::uuid, 640, 'tarjeta');
end $$;
reset role;
do $$
declare
  v_all jsonb := current_setting('t.v13_all', true)::jsonb;
  c_all jsonb := current_setting('t.c13_all', true)::jsonb;
  v_now jsonb;
  c_now jsonb;
begin
  select to_jsonb(v.*) into v_now from public.ventas v where v.id = current_setting('t.v13', true)::uuid;
  if (v_now ->> 'monto')::int is distinct from 640 or v_now ->> 'metodo' is distinct from 'tarjeta' then
    raise exception 'S12 FAIL: a monto/metodo edit of a NON-latest sale was refused (monto=%, metodo=% — the precondition governs the re-derive, not attribution)', v_now ->> 'monto', v_now ->> 'metodo';
  end if;
  if (v_now - 'monto' - 'metodo') is distinct from (v_all - 'monto' - 'metodo') then
    raise exception 'S12 FAIL: the monto/metodo edit moved something else on the venta. before = % / after = %', v_all, v_now;
  end if;

  select to_jsonb(c.*) into c_now from public.clientes c where c.id = current_setting('t.c13', true)::uuid;
  if c_now is distinct from c_all then
    raise exception 'S12 FAIL: a monto/metodo-only edit of a non-latest sale touched the cliente. before = % / after = %', c_all, c_now;
  end if;
end $$;

-- ══ S13 — A FRESH SALE'S VENCE FOLLOWS ITS FECHA ════════════════════════════════════════════════════
-- The shape the owner hit on live in August: ONE sale, 12 clases / 30 días, sold yesterday to a member
-- with no prior vigencia, so registrar wrote vence = (hoy−1) + 30 = hoy+29. Moving the sold day back 3
-- days must move the vigencia with it, to (hoy−4) + 30 = hoy+26. The body that failed this read
-- `vence − días` as a carried base and cancelled the new fecha straight back out; as-if-original
-- reaches the same answer with no anchor at all, because it never carries a base in the first place.
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.v_fresca', true)::uuid, 1200, 'efectivo',
                              p_fecha := v_hoy - 4);
end $$;
reset role;
do $$
declare
  rec        record;
  cli        record;
  v_hoy      date := (now() at time zone current_setting('t.tz', true))::date;
  v_esperado timestamptz := ((v_hoy - 4)::timestamp + interval '12 hours')
                            at time zone current_setting('t.tz', true);
begin
  select * into rec from public.ventas where id = current_setting('t.v_fresca', true)::uuid;
  if rec.fecha is distinct from v_esperado then
    raise exception 'S13 FAIL: fecha = % (expected % — midday gym-tz on the requested day)', rec.fecha, v_esperado;
  end if;
  if rec.clases is distinct from 12 or rec.vigencia_dias is distinct from 30 then
    raise exception 'S13 FAIL: the package facts moved on a fecha-only call (clases=%, dias=%)', rec.clases, rec.vigencia_dias;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c_fresca', true)::uuid;
  if cli.vence is distinct from v_hoy + 26 then
    raise exception 'S13 FAIL: vence = % (expected % — the new sold day + the sale''s own 30 días. % means the vigencia did not follow the fecha at all)',
      cli.vence, v_hoy + 26, v_hoy + 29;
  end if;
  if cli.clases_restantes is distinct from 12 then
    raise exception 'S13 FAIL: clases_restantes = % (expected 12 — the sale''s own grant, nothing charged)', cli.clases_restantes;
  end if;
end $$;

-- ══ S14 — A GENUINELY STACKED SALE DOES NOT KEEP ITS CARRY ══════════════════════════════════════════
-- The member's PRIOR package ended on B = hoy−3 carrying 2 clases; this sale (8 clases / 20 días) was
-- bought 6 days ago while that base was still live, so registrar wrote max(B, hoy−6) + 20 = hoy+17 and
-- 2 + 8 = 10 clases.
--
-- (a) A fecha edit to hoy−5 now writes 8 clases and (hoy−5) + 20 = hoy+15: BOTH carries are dropped.
--     This vector asserted the exact opposite before 2026-08-27 (10 / hoy+17, "the carry ends at B
--     whatever day the member paid") and is the clearest statement in the file that the base is gone.
--     The corrected sale is worth exactly what it sold, from the day it says it sold it.
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.v_apilada', true)::uuid, 750, 'efectivo',
                              p_fecha := v_hoy - 5);
end $$;
reset role;
do $$
declare
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into cli from public.clientes where id = current_setting('t.c_apilada', true)::uuid;
  if cli.vence is distinct from v_hoy + 15 then
    raise exception 'S14a FAIL: vence = % (expected % — the corrected sold day plus the sale''s own 20 días. % would mean the prior package''s end day was carried forward as a base)', cli.vence, v_hoy + 15, v_hoy + 17;
  end if;
  if cli.clases_restantes is distinct from 8 then
    raise exception 'S14a FAIL: clases_restantes = % (expected 8 — the sale''s own grant, nothing charged. 10 would mean the prior package''s 2 leftover clases were carried in)', cli.clases_restantes;
  end if;
end $$;

-- (b) Moving on to hoy−1: the same rule with no second branch — (hoy−1) + 20 = hoy+19, balance 8.
set local role authenticated;
do $$
declare v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  perform public.editar_venta(current_setting('t.v_apilada', true)::uuid, 750, 'efectivo',
                              p_fecha := v_hoy - 1);
end $$;
reset role;
do $$
declare
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into cli from public.clientes where id = current_setting('t.c_apilada', true)::uuid;
  if cli.vence is distinct from v_hoy + 19 then
    raise exception 'S14b FAIL: vence = % (expected % — the sold day again plus the sale''s own 20 días; there is no branch, only the one rule)', cli.vence, v_hoy + 19;
  end if;
  if cli.clases_restantes is distinct from 8 then
    raise exception 'S14b FAIL: clases_restantes = % (expected 8)', cli.clases_restantes;
  end if;
end $$;

-- ══ S15 — ILIMITADO → FINITE, counting the classes attended WHILE ilimitado ═════════════════════════
-- The sale granted an ilimitado pack and the member trained four times under it. An ilimitado plan never
-- decrements, so all four asistencias carry consumio = false — which is precisely why the §D0 asistencia
-- leg must NOT filter on consumio. As-if-original asks what the CORRECTED terms would have charged, and
-- a 12-clase pack would have charged all four: 12 − 4 = 8.
--
-- Two wrong bodies both return 12 here: one that counts only consumio = true rows, and the old clawback
-- (a NULL stored balance short-circuited straight to the new package's own count). This vector kills both.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v15', true)::uuid, 1200, 'efectivo',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare
  rec   record;
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into rec from public.ventas where id = current_setting('t.v15', true)::uuid;
  if rec.clases is distinct from 12 then
    raise exception 'S15 FAIL: ventas clases = % (expected 12 — the sale now records the finite package it really sold)', rec.clases;
  end if;
  if rec.personalizado is distinct from false then
    raise exception 'S15 FAIL: personalizado = % (expected false — the correction swapped onto a REGISTERED paquete)', rec.personalizado;
  end if;

  select * into cli from public.clientes where id = current_setting('t.c15', true)::uuid;
  if cli.clases_restantes is distinct from 8 then
    raise exception 'S15 FAIL: clases_restantes = % (expected 8 — 12 minus the 4 classes attended while the pack read ilimitado. 12 means consumio=false marks were skipped, which hands the member back every class they already trained)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 20 then
    raise exception 'S15 FAIL: vence = % (expected % — the sold day (hoy−10) plus the flat 30 a mes package contributes)', cli.vence, v_hoy + 20;
  end if;
end $$;

-- ══ S16 — THE RESERVATION LEG: attended-after-booking once, a hold counts, a gym cancel costs nothing ═
-- Three bookings, ALL carrying consumio = true:
--   (i)   a past ENDED session, attended — the reservation carries the charge and the linked asistencia
--         is deferred to it, so it is ONE charge, not two.
--   (ii)  a FUTURE session still held — already debited at booking time (#233), so it must be charged.
--   (iii) a session the GYM cancelled — refunded, status flipped to cancelada, consumio left STANDING.
--         Only the status filter can tell the truth here, and it must cost nothing.
-- Two charges against a corrected 12-clase pack ⇒ 10. (9 = the attended booking counted twice OR the
-- gym-cancelled one counted; 11 = the live hold ignored; 6 = the stored counter read, 4 − 10 + 12.)
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v16', true)::uuid, 1200, 'efectivo',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into cli from public.clientes where id = current_setting('t.c16', true)::uuid;
  if cli.clases_restantes is distinct from 10 then
    raise exception 'S16 FAIL: clases_restantes = % (expected 10 — 12 minus ONE attended booking and ONE live hold. 9 = the attended booking double-counted or the gym-cancelled one charged; 11 = the live hold ignored; 6 = the stored counter read)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 20 then
    raise exception 'S16 FAIL: vence = % (expected % — the sold day (hoy−10) plus the flat 30)', cli.vence, v_hoy + 20;
  end if;
end $$;

-- ══ S17 — THE BERENICE FIXTURE: same gym evening, one mark before the sale and one after ════════════
-- The sale was registered at 20:53 GYM-local yesterday. The 18:12 mark that evening belongs to the
-- PREVIOUS pack — the sale had not happened yet — and the 21:30 one belongs to this one. Only the second
-- is charged, so a 6-clase sale corrected onto an 8-clase package lands on 8 − 1 = 7.
--
-- Both marks sit after 18:00 local on purpose. In a UTC−6 gym, 21:30 local is already TOMORROW in UTC,
-- so a body that compares in the session's calendar (a naive `::date`, or an unconverted `fecha + hora`)
-- drops it and answers 8. A body that ignores the time of day altogether and only compares days counts
-- the 18:12 mark too and answers 6 — the "why does it say 1 used" seam the owner hit on 2026-08-27.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v17', true)::uuid, 800, 'efectivo',
                              p_paquete_id := current_setting('t.pk_8', true)::uuid);
end $$;
reset role;
do $$
declare
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into cli from public.clientes where id = current_setting('t.c17', true)::uuid;
  if cli.clases_restantes is distinct from 7 then
    raise exception 'S17 FAIL: clases_restantes = % (expected 7 — the corrected 8-clase grant minus ONLY the 21:30 mark. 6 means the 18:12 mark, which this sale had not been registered for yet, was charged to it; 8 means the 21:30 mark was read in the session''s calendar instead of the gym''s and fell outside the window)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 19 then
    raise exception 'S17 FAIL: vence = % (expected % — the sold day (hoy−1) plus the corrected package''s 20 días)', cli.vence, v_hoy + 19;
  end if;
end $$;

-- ══ S18 — PERDONADA AND SOFT-DELETED ARE NOT CHARGES ════════════════════════════════════════════════
-- Three marks since the sale: one ordinary, one `perdonada` (the cooldown's second record of ONE
-- arrival, #169) and one soft-deleted (an undone toggle). Only the first is a charge, so a 12-clase
-- correction lands on 11. Counting all three writes 9 — the member billed twice for one arrival and
-- once for a visit that was taken back.
set local role authenticated;
do $$
begin
  perform public.editar_venta(current_setting('t.v18', true)::uuid, 1200, 'efectivo',
                              p_paquete_id := current_setting('t.pk_mes', true)::uuid);
end $$;
reset role;
do $$
declare
  cli   record;
  v_hoy date := (now() at time zone current_setting('t.tz', true))::date;
begin
  select * into cli from public.clientes where id = current_setting('t.c18', true)::uuid;
  if cli.clases_restantes is distinct from 11 then
    raise exception 'S18 FAIL: clases_restantes = % (expected 11 — 12 minus the ONE real mark. 10 means either the pardoned or the soft-deleted row was charged; 9 means both were)', cli.clases_restantes;
  end if;
  if cli.vence is distinct from v_hoy + 20 then
    raise exception 'S18 FAIL: vence = % (expected % — the sold day (hoy−10) plus the flat 30)', cli.vence, v_hoy + 20;
  end if;
end $$;

select 'editar_venta paquete rules: OK' as result;
rollback;
