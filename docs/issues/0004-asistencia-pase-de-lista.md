# Issue 4 — Asistencia (pase de lista)

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`
> **Status:** ✅ Done — branch `feat/supabase-infra-perfil` @ `9a597c3` (2026-05-29). Gates green; RLS verified. Full mark/undo/back-entry is the operator's in-browser check.

## What to build

Mark attendance for real. Create the `asistencias` table — one row per attendance, an
absolute America/Chihuahua calendar date, plus a soft-delete column — with RLS.
`togglePase` is a thin Server Action that inserts (or soft-deletes) an asistencia row
with a real check-in timestamp and calls the domain `consumirClase` to decrement the
cliente's **saldo**: **Ilimitado** never decrements, and undo restores the class.
Back-dated bulk entry (a whole week from a paper list) is supported because rows carry
absolute dates, not offsets from a demo "today".

## Acceptance criteria

- [ ] `asistencias` table created (cliente_id, absolute Chihuahua date, hora/timestamp, `deleted_at` soft-delete, created_at) with RLS keyed to `(select auth.uid())`; advisors clean.
- [ ] `togglePase` Server Action: re-auth → Zod validate → insert asistencia row + `consumirClase`; toggling off soft-deletes the row and restores the class.
- [ ] Same-day duplicate attendance consumes a class each time (no dedup); Ilimitado clients never lose a class.
- [ ] Recorded check-in time is a real Chihuahua-local timestamp, surfaced in the toast/UI (no fabricated `07:`+id math).
- [ ] Back-dated entry works: attendance can be recorded for prior dates; a week can be entered in one sitting.
- [ ] The offset-grid pase reads are replaced by date-keyed asistencia queries on the pase screen.
- [ ] Integration-verified against a branch: consume + restore correctness; RLS scoping.
- [ ] `pnpm lint` + `pnpm test` + `pnpm build` green.

## Blocked by

#3 — consumes classes from the saldo created by the ventas slice.
