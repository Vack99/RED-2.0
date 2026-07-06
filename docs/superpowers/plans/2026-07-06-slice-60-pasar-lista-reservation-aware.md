# Slice #60 — Pasar lista becomes reservation-aware (Phase-6, money path)

Base: `origin/slice-57-booking-core`. Closes #60. ADR-0010 §4/§5; ADR-0004; ADR-0005; ADR-0013.

## The loop being closed
A booked member consumed their class at booking (`reservar_clase`, #57). Admin-side
Pasar lista must mark them `asistida` + write attendance WITHOUT a second consume. A
walk-in (no reservation) gets an `is_walk_in` reservation created at the door and
consumes exactly as today's `toggle_pase`. Untoggle reverses each path symmetrically.

## Changes (files only — live is read-only; scratch-verified)

### DB
1. `migrations/20260706180000_asistencias_reservation_link.sql` — expand-only: add
   nullable `class_session_id` + `reservation_id` FKs to `asistencias` (ADR-0010 §5,
   "asistencias gains a class_session_id (and reservation_id) FK"). Partial index on
   `(class_session_id, cliente_id) where deleted_at is null` for the roster presence read.
   Front-desk `toggle_pase` keeps writing them NULL — untouched.
2. `migrations/20260706180100_pasar_lista_sesion.sql` — new RPC
   `pasar_lista_sesion(p_session_id, p_cliente_id) returns (present, hora)`. SECURITY
   INVOKER + `search_path=''` (toggle_pase posture; staff RLS is the boundary), authenticated-only.
   Advisory xact lock on `(cliente,session)` for race safety. Toggle:
   - OFF (active asistencia exists): soft-delete it; refund iff `consumio and finite`;
     revert reservation — booked → `reservada`, walk-in → `cancelada`.
   - ON booked (reservation `reservada`/`asistida`): flip to `asistida`+`checked_at`,
     write asistencia `consumio=false` — NO consume (already consumed at booking).
   - ON walk-in (no active reservation): create/reuse `is_walk_in` `asistida` reservation,
     write asistencia + guarded `-1` decrement — byte-for-byte toggle_pase ON.
   `hora` stamped only when the session's date == gym-today (toggle_pase rule).

### DAL (`packages/data/src/server/agenda.ts`)
- `getRosterSesion(sessionId)` — booked members (active reservations) joined to clientes,
  `present` = status `asistida`, `isWalkIn` flag. DTOs only (ADR-0001).
- `pasarListaSesion({sessionId, clienteId})` — Zod + requireOperator + RPC; `AgendaResultado`.
- Regenerate `packages/data/src/database.types.ts` from scratch schema.

### UI (admin agenda)
- `agenda/actions.ts`: `rosterSesionAction`, `pasarListaSesionAction`.
- `QuickGlanceSheet` (`packages/ui/src/forge/agenda/quick-glance-sheet.tsx`): add optional
  roster section — booked list with a per-member present toggle (Pasar lista) + a walk-in
  "Agregar" picker over gym clientes not already listed. Token-only, admin design system.
- `agenda.tsx`: lazy-load roster on glance open; optimistic toggle; `router.refresh()` after
  walk-in (occupancy shifts). Page passes the gym clientes for the walk-in picker.

## TDD (RED first) — `supabase/tests/pasar_lista_sesion_rules.sql`, added to run-denial SUITE
- book→pasar-lista = ONE consume (finite): balance stays at booked value across the pase.
- ilimitado booked: pase writes attendance, balance stays NULL.
- walk-in parity: finite walk-in consumes exactly one + creates `is_walk_in`/`asistida` row;
  attendance row identical shape to toggle_pase (consumio, hora-today).
- untoggle symmetry: booked untoggle → reservation `reservada`, NO refund; walk-in untoggle →
  reservation `cancelada`, refund exactly one (finite).
- hora-today-only stamp.

## Verify
Scratch: apply base stack + these two migrations; `get_advisors`; run the new SQL test +
the full denial suite green. `pnpm lint/typecheck/test`. Delete scratch before handoff.
