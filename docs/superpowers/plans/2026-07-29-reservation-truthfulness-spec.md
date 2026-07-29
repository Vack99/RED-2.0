# Reservation-truthfulness slice — implementation spec (#162 + #164 + #165 + #169)

2026-07-29. Implements the FINAL rulings in
`docs/superpowers/handoffs/2026-07-29-cross-examine-reservation-truthfulness.md` (read its
"Final rulings" section first; the ranked findings explain every WHY below). Work happens in the
worktree `.claude/worktrees/reservation-truthfulness`. Current RPC truth to diff against:
`supabase/migrations/20260728121000_cooldown_unifies_surfaces.sql`.

NOT in this slice: no `no_show` writer of any kind (derived display only), no `barrer_*` RPC,
no waitlist/strike policy (#171), no gym-cancel refund (#172), no mi_membresia change (#173).

## 1. The window (one concept, two homes, cross-referenced)

A booking's **arrival window** = `[starts_at − 90 min, starts_at + duration_min + 15 min)`.
"Closed" = `upper(window) <= now()`. T = the close.

- SQL home: `public.ventana_arribo(p_starts_at timestamptz, p_duration_min int) returns tstzrange`,
  `language sql immutable security invoker set search_path to ''`:
  `select tstzrange(p_starts_at - interval '90 minutes', p_starts_at + make_interval(mins => p_duration_min) + interval '15 minutes')`.
  Comment must state: 90 mirrors the desk pill's `VENTANA_CERCANA_MIN` (`marcadas.ts:72`) so the
  screen and the server agree on "around class time"; 15 is the arrival-grace at close, a sibling of
  (not shared with) the cooldown's 15 (`visita_reciente`). Pure reader → must NOT appear in
  `rpc-coverage.json` (the no-pure-reader guard fails if it does). Revoke public/anon, grant authenticated.
- TS home: `packages/domain/src/rules.ts` exports `VENTANA_ARRIBO_PREVIA_MIN = 90` and
  `VENTANA_ARRIBO_GRACIA_MIN = 15` + a pure helper `ventanaArribo(startsAt: Date, duracionMin: number): { desde: Date; hasta: Date }`
  (and/or `esNoAsistio(status, startsAt, duracionMin, ahora)`). Comment cross-refs the SQL twin.

## 2. Migration A — `20260729T1_reservation_truthfulness.sql` (pick real timestamp names, two files OK if cleaner: DDL+functions may live in one)

Idempotent/re-runnable in the house style (drop-function-if-exists both signatures, add-column-if-
not-exists, create-or-replace). Expand-only relative to deployed TS EXCEPT the return-type change —
see §7 ship order.

### 2a. `asistencias.perdonada`
`alter table public.asistencias add column if not exists perdonada boolean not null default false;`
Semantics comment: TRUE ⇔ this row was recorded free because the 15-min cooldown found the OTHER
kind within the window — i.e. the second record of ONE arrival. It is NOT set by the closed-window
booking pardon (that is a real separate visit, and it counts). Historical rows: false is accurate
(no cooldown existed; pairs measured zero live 2026-07-29).

### 2b. Return-type change — DROP + CREATE **both** functions
New shape for BOTH (42P13 forbids CREATE OR REPLACE; the delegation `return query select * from
pasar_lista_sesion(...)` requires identical arity — red-team R9):
`returns table(present boolean, hora text, session_id uuid, clases_restantes int)`
- `pasar_lista_sesion`: `session_id := p_session_id` always; `clases_restantes` := the cliente's
  balance AFTER the write (re-select or track).
- `toggle_pase` LIBRE path: `session_id := null`; delegated path: passthrough.
- Drop both old signatures first (`toggle_pase(uuid,date)`, `toggle_pase(uuid,date,uuid)`,
  `pasar_lista_sesion(uuid,uuid)`), re-issue the EXECUTE lockdown for both (revoke public+anon,
  grant authenticated) — the 20260728121000 header explains why.

### 2c. `toggle_pase` — the 2-arg (LIBRE) path, replacing the C15 branch
Keep: auth guard, advisory lock position (`'pase:'||cliente` BEFORE all decision reads), clientes
read, tz read, active-libre-row lookup, toggle-OFF branch (refund iff consumio & finite), hora rule,
guarded decrement, origen='libre'.

After the lock + reads, BEFORE the active-libre-row toggle logic — **attribution candidate select**:
```
select cs.id, public.ventana_arribo(cs.starts_at, cs.duration_min) @> now()
  into v_booked, v_en_ventana
  from public.reservation r
  join public.class_session cs on cs.id = r.class_session_id
 where r.member_id = p_cliente_id
   and r.status = 'reservada'                -- ARM-ONLY: asistida never re-enters here
   and r.is_walk_in = false                  -- money guard: walk-in rows must never delegate
   and cs.cancelled_at is null
   and (cs.starts_at at time zone v_tz)::date = p_fecha   -- the cooldown's own backdate guard
   and upper(public.ventana_arribo(cs.starts_at, cs.duration_min)) > now()  -- not yet closed
 order by abs(extract(epoch from (cs.starts_at - now()))) asc  -- the pill's own metric
 limit 1;
```
- `v_en_ventana` true → **delegate**: `return query select * from public.pasar_lista_sesion(v_booked, p_cliente_id); return;`
  (reservada ⇒ no active clase row ⇒ lands in TOGGLE-ON booked branch: asistida, consumio=false,
  free. Arm-only holds by construction.)
- Candidate exists but pre-window (found row, `v_en_ventana` false) → do NOT delegate, do NOT
  pardon: fall through to the normal walk-in ON path below (C9 + cooldown + charge) — the Ana
  ruling. (The pre-window candidate is only reachable when no in-window one exists — the
  `upper > now()` filter keeps both kinds; order by distance can surface either. Simplest correct
  form: run the select twice conceptually — filter `@> now()` for delegation; a candidate that is
  only pre-window falls through.) Implementation may instead select only `@> now()` candidates for
  delegation and not fetch pre-window ones at all — equivalent and simpler; choose that.
- **Already-marked no-op** (arm-only's second half): if NO reservada candidate delegated, check
  `exists(select 1 from reservation r join class_session cs ... where r.member_id = p_cliente_id
  and r.status = 'asistida' and r.is_walk_in = false and cs.cancelled_at is null and (date)=p_fecha
  and ventana_arribo(...) @> now())` → `raise exception 'Ya marcada en la clase de %',
  to_char(cs.starts_at at time zone v_tz, 'HH24:MI')` (fetch the hora; the desk shows res.message
  in its warning toast and rolls back the optimistic flip — that IS the no-op UX). This check runs
  only on the ON path (an active libre row still toggles OFF normally first — the OFF branch stays
  above and unchanged).
- **Closed-window pardon** (the Luis ruling), where C15 stood, BEFORE the C9 vence gate:
  `if exists(select 1 ... r.status = 'reservada' and r.is_walk_in = false and (date)=p_fecha and
  upper(ventana_arribo(...)) <= now()) then v_consumio := false;` — cancelled sessions NOT excluded
  here (a gym-cancelled booking's pardon is the accidental compensation we keep until #172).
  perdonada stays false on this row (real visit).
- Else: walk-in path exactly as today: C9 vence, `visita_reciente(p_cliente_id, p_fecha, true)` →
  `v_consumio := false` AND `v_perdonada := true`; else consume-if-finite-positive.
- INSERT gains `perdonada` (v_perdonada, default false elsewhere). Return fresh
  `clases_restantes` (NULL for ilimitado — the column value post-write).

### 2d. `pasar_lista_sesion`
Byte-for-byte today's body EXCEPT: new return shape (session_id, fresh clases_restantes appended);
walk-in cooldown pardon stamps `v_perdonada := true`; INSERT gains perdonada. Booked branch
unchanged (`v_status in ('reservada','asistida')` — NO no_show widening; the state never exists).

### 2e. `reservar_clase` — the #165 gate
Re-emit (CREATE OR REPLACE, grants preserved) with one addition after the session lookup /
cancelled check: `if v_starts <= now() then raise exception 'La clase ya comenzó'; end if;`
(same message as cancelar_reserva's precedent — one vocabulary).

### 2f. `asistencias_mes_por_cliente`
CREATE OR REPLACE (ACL preserved — 20260728120000:100-101 precedent):
`select cliente_id, count(*)::int as n from public.asistencias where gym_id = p_gym_id and
deleted_at is null and fecha >= p_desde and not perdonada group by cliente_id;`
Header comment: unit = VISITS per the 2026-07-29 ruling (#169); the distinct-fecha era and why it
changed; pardoned rows are the second record of one arrival and do not count.

## 3. TS — packages + admin

- `packages/data/src/database.types.ts`: hand-edit — `asistencias` Row/Insert/Update gain
  `perdonada: boolean` (Insert optional), both RPC returns gain `session_id: string | null;
  clases_restantes: number | null`. Live regen check happens post-apply (§7).
- `packages/domain/src/rules.ts`: constants + helper (§1). Unit tests for the window edges
  (pure function — vitest CAN cover this one).
- `packages/data/src/server/asistencia.ts` (`togglePase` DAL + action): pass through the two new
  fields. `packages/data/src/server/agenda.ts` (`pasarListaSesion` path + `getSesionRoster`):
  same; `getSesionRoster` row DTO gains `noAsistio: boolean` derived via the domain helper from the
  session's starts/duration it already has (status reservada + window closed). NO filter changes
  anywhere — reservada rows already flow.
- `packages/ui/src/forge/agenda/session-roster.tsx`: third visual state for `noAsistio` rows —
  keep it quiet (dimmed row + small "NO ASISTIÓ" caption in the sub-line, NOT a red badge; the
  roster is glanced at in class). `rosterResumen` unchanged (total = rows.length, presentes =
  present count). Tap on a noAsistio row = the same onToggle (marks asistida, free — booked branch).
- Desk `apps/admin/src/app/(app)/asistencia/_components/asistencia.tsx` + `marcadas.ts`:
  1. RESERVA chip: on the LIBRE tab, a row whose member holds a booking today (from the `reservas`
     prop already in memory) renders a small gold `RESERVA HH:MM` chip (hora from `sesiones`; for a
     past-day view no chip — reservas is today-only).
  2. Reconcile: `togglePaseAction` result now carries `sessionId` — when present and ≠ ctxSel,
     apply the visita into ctx `sessionId` (not ctxSel) so the row renders as marked-elsewhere
     (gold stamp) and the class pill's dot lights; toast: `"Asistencia registrada · {nombre} ·
     CLASE {hora}"` when redirected, today's copy otherwise.
  3. Fresh balance: patch the tapped row's `clasesLabel` from `clases_restantes` in the result
     (derivarPaseCliente shape — recompute the label client-side).
  4. In-flight guard: key on `${selIso}:${c.id}` (drop ctx from the key).
  5. Error toasts already show `res.message` — 'Ya marcada en la clase de 18:00' flows free.
- Ficha `cliente-detalle.tsx`: result's `sessionId` present → do NOT `setPresent(true)` on the
  libre checkbox; toast names the class ("Marcada en la clase de 18:00"); `router.refresh()`
  already re-derives. presentHoy stays libre-row-only (correct — the checkbox is the libre toggle).
- `packages/data/src/server/resumen.ts`: select adds `perdonada`; drop the (cliente_id, fecha)
  dedupe; skip `perdonada` rows. Update the comment: unit = visits (ruling 2026-07-29); the day
  strip keeps `count(distinct cliente_id)` (people) on purpose.
- Existing vitest mocks referencing the RPC result shapes gain the two fields.

## 4. Terms/copy rider (apps/client)

Five surfaces claim a 2-hour free-cancel deadline; the DB allows free cancel until start
(`20260710123000:186-188`). Reword to "hasta el inicio de la clase":
`legal/page.tsx:52-54`, `reservar/_components/reservar-semana.tsx:555`, `reservar/loading.tsx:66`,
`clase/[sessionId]/_components/clase-detalle.tsx:321`,
`confirmada/[sessionId]/_components/confirmada-vista.tsx:51`. Keep the owner's voice; minimal edit
("hasta 2 horas antes del inicio" → "hasta el inicio de la clase"). The no-show sentence ("la clase
se descuenta") stays — it is now exactly true.

## 5. Suites (supabase/tests) — written-row assertions, never return values

Frozen-`now()` house pattern: book against FUTURE sessions, then backdate `class_session.starts_at`
via privileged UPDATE between `reset role` / `set local role authenticated`
(`cancelar_reserva_rules.sql:224-233`). The #165 gate makes book-then-backdate MANDATORY ordering.

- `toggle_pase_rules.sql`: REWORK the C15 vector (:36-37 area) into the three-arm truth:
  (v1) in-window reservada + 2-arg tap → assert `reservation.status='asistida'`, `checked_at` set,
  `is_walk_in=false`, asistencias row has `class_session_id`, `origen='clase'`, `consumio=false`,
  `perdonada=false`, NO libre row, balance unchanged, returned `session_id` = the session (returned
  value asserted only as a bonus — rows are the contract).
  (v2) already-asistida in-window + 2-arg tap → raises 'Ya marcada%', NO new rows, reservation
  untouched (arm-only).
  (v3) pre-window (>90 early) reservada + tap → libre row `consumio=true`, `perdonada=false`,
  balance −1, reservation stays reservada (Ana).
  (v4) closed-window reservada + tap → libre row `consumio=false`, `perdonada=false`, balance
  unchanged, reservation stays reservada (Luis) — and expired-vence variant still admitted (the C9
  exemption now lives on the pardon arm).
  (v5) cooldown pardon stamps `perdonada=true` (recent clase row, then libre tap) — the ONLY
  perdonada writer on this surface.
  Keep/adapt all money vectors (refund symmetry, gym_id, hora, delegation, C9-through-delegation).
- `pasar_lista_sesion_rules.sql`: existing vectors adapt to the new result arity (they select by
  column name — verify); add: walk-in cooldown pardon row has `perdonada=true`; booked-branch row
  `perdonada=false`; returned clases_restantes matches the clientes row after write (row-assert the
  clientes row).
- `reservar_clase_rules.sql`: (v) started session → raises 'La clase ya comenzó', zero rows written
  (create session at now()+1h, book OK; second session backdated to now()−1m, booking raises).
- `asistencias` aggregate: extend whichever suite already covers reads or add assertions inside
  toggle_pase_rules: after v5, `asistencias_mes_por_cliente` returns n=1 for the member (two rows,
  one pardoned).
- `rpc-coverage.json`: NO new entries (no new writer; `ventana_arribo` must stay OUT). Existing
  suite lists unchanged. `QUARANTINE` stays `[]`.

## 6. What the guards will catch (self-check before handing back)

`pnpm lint && pnpm typecheck && pnpm test` green in the worktree (pre-commit runs them). The
rpc-write-coverage guard re-derives writers from migrations — toggle_pase/pasar_lista_sesion/
reservar_clase keep their entries; the drift guard demands any NEW .sql test file be wired into
`SUITE` (none planned — we extend existing files).

## 7. Ship order (unchanged rule, one new caution)

1. Suites green on scratch `gyyujeguycxxoaqgdnjp` (sync new migrations via Management API
   `database/query` + stamp `schema_migrations` — TARGET_REF does not provision).
2. Migrations to LIVE via `apply_migration` (executable statements).
   **Caution (critic #5):** the return-type change is NOT expand-only for the deployed apps — the
   deployed desk destructures `{present, hora}` from `.single()`; extra columns are tolerated by
   PostgREST/supabase-js (verified pattern R9), so apply is safe, but the SEMANTIC changes (pre-
   window charge, no-op raise) go live at apply time. Apply and push should therefore happen in the
   same sitting — get the owner's push consent BEFORE applying to live.
3. Fast-forward main from the worktree branch; push ONLY on explicit owner consent (deploys both
   apps).
4. Post-apply: regen database.types from live and diff against the hand-edit (must be identical).
5. Owner walk (red-demo has bookings): LIBRE tap on a booked member → chip, redirect toast, roster
   shows the mark; tap again → 'Ya marcada' warning, nothing changes; past class roster shows NO
   ASISTIÓ on unmarked rows; month counts move per visit.
