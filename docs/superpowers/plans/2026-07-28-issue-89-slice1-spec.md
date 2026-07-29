# #89 slice 1 — implementation spec (2026-07-28)

Derives from `docs/superpowers/handoffs/2026-07-28-issue-89-design-locked.md` (design LOCKED — do
not re-open) plus two owner rulings taken today:

- **Cooldown = 15 minutes, fixed constant.** Not per-gym configurable (that's a later sale).
- **Same-context repeats deferred** (#168): slice 1 enforces at most one visit per
  (member, context) per day. Tap-again stays undo.

Live prod pre-validated 2026-07-28: **0 rows violate either new unique index** (class-context
duplicates: 0; same-day class-less duplicates: 0). Forward-only; nothing to migrate.

## The model in one paragraph

Attendance stays one row per visit in `asistencias` (the table is already visit-shaped). The
*context* of a visit is `class_session_id` (a class) or NULL (ACCESO LIBRE — now a stated kind via
`origen`, no longer "unknown"). Uniqueness re-keys from the day to the context, enforced by two
partial unique indexes. The three 2026-07-10 cross-surface guards (C15 mistap RAISE, FD-existence
mirror, and the day-keyed thinking behind them) are replaced by ONE mechanism: a **15-minute
cooldown** — a mark whose member has an active row *of the other kind* on the *same fecha* created
within the last 15 minutes records the visit with `consumio=false` instead of charging. Beyond the
window, R1 applies: one class attended = one class spent. The cooldown pairs only
**libre↔clase**: a recent row for a *different class* never suppresses a class consume
(two classes = two credits, always), and libre↔libre cannot occur (unique index + toggle).

## W1 — SQL (two migrations + suites)

### Migration A — `..._asistencias_visit_invariants.sql`

Header comment: forward-only (zero same-day double-marks exist platform-wide, verified live
2026-07-28); pre-#89 NULL-session rows keep `origen IS NULL` = provenance unknown (Forge's
historical desk rows may be unrecorded classes — do not claim them as libre).

1. `alter table public.asistencias add column origen text
   check (origen in ('libre','clase'))` — nullable, no default, no backfill.
2. Coherence check:
   `alter table public.asistencias add constraint asistencias_origen_kind_ck
   check (origen is null or ((origen = 'clase') = (class_session_id is not null)))`.
3. `create unique index asistencias_sesion_cliente_activa_uq on public.asistencias
   (class_session_id, cliente_id) where deleted_at is null and class_session_id is not null;`
   then `drop index public.asistencias_session_cliente_active_idx;` — the unique index keeps the
   session-leading column order of the index it supersedes (20260706175900:23-25), so session-roster
   scans keep their index and the total index count is unchanged. (Handoff wrote `(cliente_id,
   class_session_id)`; order is irrelevant to uniqueness, this order lets the old index drop.)
4. `create unique index asistencias_cliente_fecha_libre_uq on public.asistencias
   (cliente_id, fecha) where deleted_at is null and class_session_id is null;` — the deferred
   ruling's bound: one libre visit per member per day. Replaces the `limit 1` convention
   (20260710124000:69-74) as a real guarantee.
5. Check `20260714100000_marcadas_presencia.sql` and the surviving `marcadas_por_gym`
   (20260714090000): if either counts rows rather than **distinct** `cliente_id` per day, re-emit
   with `count(distinct ...)` / distinct ids in this migration (day-strip semantics must stay
   "distinct members present"). If both are already distinct, touch nothing and say so.

### Migration B — `..._cooldown_unifies_surfaces.sql`

1. **Helper** — the single home of the 15-minute constant:
   ```sql
   create function public.visita_reciente(p_cliente_id uuid, p_fecha date, p_clase boolean)
   returns boolean language sql stable set search_path to '' as $$
     select exists (
       select 1 from public.asistencias
        where cliente_id = p_cliente_id and fecha = p_fecha and deleted_at is null
          and (class_session_id is not null) = p_clase
          and created_at >= now() - interval '15 minutes'
     );
   $$;
   ```
   Revoke from public/anon, grant execute to authenticated. `p_fecha` equality is what stops a
   backdated mark from pairing with a today-mark. Read-only ⇒ no rpc-coverage obligation.

2. **`toggle_pase`** — DROP the 2-arg function, CREATE
   `toggle_pase(p_cliente_id uuid, p_fecha date, p_session_id uuid default null)`
   (CREATE OR REPLACE with a new arg would leave the 2-arg overload behind and make 2-arg calls
   ambiguous — must be drop+create, then re-issue `revoke from public, anon` +
   `grant execute to authenticated`). Body vs 20260710124000:
   - **New first branch — delegation:** `if p_session_id is not null then return query select *
     from public.pasar_lista_sesion(p_session_id, p_cliente_id); return; end if;` The desk in a
     class context and the Agenda roster are the SAME act; one write path, one semantics
     (reservation flip included — a desk tap on a CON RESERVA member marks their booking asistida,
     and desk undo reverts it, keeping D's booking-keyed grouping coherent).
   - **Advisory lock** (the §7-item-1 fix, ships with #89): after the cliente lookup, before the
     active-row select: `perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pase:' ||
     p_cliente_id::text));` Per-member, not per-(member,day) — the cooldown decision reads across
     the member's other rows, so all attendance writes for one member must serialize.
   - **DELETE the C15 mistap RAISE** (old lines 91-97) entirely.
   - **KEEP** the active-`reservada`-booking check (consumio=false — the booking genuinely paid)
     and the C9 vence gate, both verbatim.
   - **Walk-in consume decision becomes:** after the vence gate,
     `if public.visita_reciente(p_cliente_id, p_fecha, true) then v_consumio := false;
     else v_consumio := (v_clases is not null and v_clases > 0); end if;`
     (`p_clase => true`: only a recent CLASS row pardons a libre mark.)
   - **Insert gains `origen`:** `'libre'` (and nothing else changes in the insert).
   - OFF path, hora stamping, return contract: unchanged.
3. **`pasar_lista_sesion`** — CREATE OR REPLACE (same signature). Body vs 20260710132000:
   - **Advisory lock key changes** from `hashtext(cliente || ':' || session)` to
     `pg_catalog.hashtext('pase:' || p_cliente_id::text)` — same key as toggle_pase, so the two
     surfaces serialize against each other (the old key let a desk tap and an Agenda tap interleave
     and both charge).
   - **DELETE the FD-existence mirror** (old lines 118-124). In its place, same position in the
     walk-in branch: `if public.visita_reciente(p_cliente_id, v_fecha, false) then
     v_consumio := false; end if;` (`p_clase => false`: only a recent LIBRE row pardons a class
     mark — a recent *other-class* row must NOT, that's R1.)
   - **Insert gains `origen`:** `'clase'`.
   - The walk-in branch also gains the C9 vence gate (inclusive, vs the session's own gym-local
     date, booked exempt) — added at review: the 3-arg delegation makes a class pill the desk's
     default path, so without it an expired member is admitted and charged on the untouched screen.
     This deliberately closes #163's asymmetry. Everything else — booked branch, refund symmetry,
     reservation flips — byte-identical.

### Suites (AGENTS.md rule: assert WRITTEN ROWS — consumio, clases_restantes, origen,
reservation.status, gym_id — never just return values)

- **New file `asistencias_unicidad.sql`** (add to `SUITE` in run-denial-suite.mjs, keep QUARANTINE
  empty): privileged direct INSERTs proving both indexes raise `23505` on the duplicate shapes
  (second active row same (cliente, session); second active libre row same (cliente, fecha)), that
  a soft-deleted row does NOT block a re-insert (partial index honors deleted_at), and the
  `asistencias_origen_kind_ck` rejection shapes (origen='clase' with NULL session, origen='libre'
  with a session).
- **`pasar_lista_sesion_rules.sql`** — vectors 4–5 currently assert the OLD semantics; rewrite:
  - **(4) becomes:** session mark (consume 5→4) → desk tap same member = present=true, a NEW libre
    row with `consumio=false, origen='libre'`, balance still 4, session row + reservation
    untouched; desk untoggle = no refund, session mark intact. (The RAISE is gone; in-transaction
    `created_at` = transaction now(), so the pair is inside the cooldown by construction.)
  - **(5) becomes:** desk mark (5→4) → Agenda mark same member = present, `consumio=false,
    origen='clase'`, walk-in reservation asistida, balance 4; untoggle symmetry as today. Same
    outcomes as the old vector, now via cooldown.
  - **(6) NEW — beyond the window:** desk mark (5→4), then privileged
    `update ... set created_at = created_at - interval '20 minutes'` on that row, then Agenda mark
    → **consumes** (4→3), `consumio=true`. The cooldown is a window, not a day.
  - **(7) NEW — the #89 headline:** two DIFFERENT classes, second mark within 15 min of the first
    (no created_at backdating): both consume (5→3), both rows `origen='clase', consumio=true` —
    proves a recent *class* row never pardons another class (R1).
- **`toggle_pase_rules.sql`** — extend, don't rewrite: add `origen='libre'` to the existing
  written-row assertions; add a delegation vector (3-arg call on a booked member ⇒ identical
  written rows to calling pasar_lista_sesion: reservation asistida, session-linked row
  origen='clase' consumio=false; 3-arg undo reverts the reservation); existing C9/C15-reservation
  vectors keep passing unchanged.
- **`toggle_pase_gym2_timezone.sql`** — should pass untouched (2-arg calls resolve to the 3-arg
  default); verify, don't edit.
- **`rpc-coverage.json`** — add `toggle_pase_rules.sql` and `toggle_pase_gym2_timezone.sql` to the
  `toggle_pase` entry (they exist and exercise it; the map should say so).

## W2 — admin read contract + the D screen

1. **`togglePase` DAL** (`packages/data/src/server/asistencia.ts:225-243`): schema gains optional
   `sessionId` (`togglePaseSchema` + pass `p_session_id`). Both action wrappers
   (`asistencia/actions.ts:22-24`, `clientes/[id]/actions.ts:19-20`) stay pass-throughs; the ficha
   call site (`cliente-detalle.tsx:81`) stays 2-arg.
2. **`getMarcadas` contract**: keep `presencia` exactly as is (strip/calendar counts). Replace
   `marcadasDelDia` (today's id set) with today's per-visit rows
   `visitasHoy: { id, clienteId: string; sessionId: string | null; hora: string | null }[]` via a
   **direct table select** (`.from("asistencias").select("id, cliente_id, class_session_id, hora")`
   scoped gym + hoy + `deleted_at is null`) — the `getAsistenciasHoy` pattern
   (asistencia.ts:266-308); no new RPC. `getMarcadasDeMes`/`getMarcadasDelDia` (past-day lazy
   loads) unchanged.
3. **Sessions + bookings for today**: sessions via `getAgendaDia` (its `ensure_week_materialized`
   write is idempotent and intended in production — the prototype's plain read existed only so a
   throwaway page wouldn't mutate the schedule; do NOT port `prototype-sesiones.ts`). Bookings
   (CON RESERVA grouping): reuse an existing admin-side reservation read if one fits, else one
   small server read in `packages/data` returning `Record<sessionId, clienteId[]>` for status in
   ('reservada','asistida') on today's sessions.
4. **The screen** (`_components/asistencia.tsx`): rewrite the TODAY view as variant D
   (`prototype/variant-d-puerta.tsx` is the reference — same pill row/sesionCercana default, CON
   RESERVA leads, one number, gold other-context stamps, tap-again undo; rewrite, don't promote).
   State: `visitas: Visita[]` for today (optimistic append/remove reconciled against
   `togglePaseAction` results), `presencia` map unchanged. **Past days keep today's production
   behavior** (simple LIBRE list, id-set state, 2-arg toggle) — the class-aware surface is
   today-only in slice 1; a past selected day renders no pill row. Keep the `DIAS_TIRA_INICIAL`
   constant name/format intact or update `asistencia-lockstep.test.ts` in the same change.
5. **Delete prototype code**: variants A/B/C, `variant-d-puerta.tsx`, `shared.tsx` (the synthetic
   `reservasPorSesion` fallback must not survive in any form), `switcher.tsx`,
   `prototype-sesiones.ts`, and the `?variant=` branch in `page.tsx`. Keep `prototype/NOTES.md`
   (decision record, prose only).
6. **Types**: hand-patch `database.types.ts` to what regeneration will produce (asistencias Row/
   Insert/Update + `origen`; `toggle_pase` Args + optional `p_session_id`; add `visita_reciente`).
7. **Vitest**: update `asistencia.test.ts` (getMarcadas new shape via the fake client's `.from`
   path; togglePase sessionId passthrough); keep/adjust `marcadas.test.ts` (setMarcada survives
   for past days).

## W3 — client R3 note

`reservar-semana.tsx`: compute in `ReservarSemana` (which holds `dia = semana.dias[sel]`)
`otroHoy = dia.sesiones.some(s => s.miReserva && s.id !== sesion.id)` for the sheet's session, pass
one boolean prop into `SummarySheet`, and add ONE nota branch — first in the chain, before
`casi_lleno` (charge-consent copy outranks urgency copy), gated
`otroHoy && !saldo.ilimitado && !sesion.miReserva`:
`Ya tienes una clase hoy — esta usará otra de tus {saldo.clasesRestantes} clases.`
Ilimitado sees nothing. No modal, no block, no change to `reservar_clase`, SummarySheet only (not
`clase-detalle.tsx`).

## Out of scope (filed)

#162 stranded reservation on LIBRE-context desk mark of a booked member · #164 no_show writers ·
#165 past-session booking gate · #166 late-mark package attribution · #167 entitlement ledger ·
#168 same-context repeats. (#163 — vence on the Agenda path — was pulled INTO this slice at
review; see the pasar_lista_sesion section above.)
