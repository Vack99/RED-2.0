-- Respaldo base (spec 2026-07-13 §1.9, issue #92): composite (gym_id, fecha)
-- indexes for the two ledgers every gym-scoped read now selects on (§1.1).
-- Turns the month window into O(month) instead of O(gym lifetime), lets the
-- fecha DESC order come off the index (backward scan), and makes the picker's
-- earliest-activity lookup a single-row index probe. Built now, while the
-- tables are 41 / 268 rows — not on a 650M-row table during an incident.
-- Index-only: changes no RPC's written rows → no new denial assertions
-- (one green scratch run of the existing suite is the gate).

create index if not exists ventas_gym_fecha_idx
  on public.ventas (gym_id, fecha);

create index if not exists asistencias_gym_fecha_idx
  on public.asistencias (gym_id, fecha)
  where deleted_at is null;
