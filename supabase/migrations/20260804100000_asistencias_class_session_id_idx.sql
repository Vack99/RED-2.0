-- D3 — a plain index on asistencias.class_session_id (epic #203 slice-4 follow-up).
--
-- THE GAP: 20260803130000 flipped asistencias.class_session_id's FK from ON DELETE CASCADE to
-- ON DELETE RESTRICT (attendance-retention ruling, owner 2026-08-03). RESTRICT still has to run
-- the referential probe on every class_session delete attempt — "does any row in asistencias
-- reference this id" — and that probe is now a live query path, not dead weight the old CASCADE
-- action skipped past.
--
-- The only existing index touching this column, asistencias_sesion_cliente_activa_uq
-- (20260728120000:67-69), is PARTIAL — `where deleted_at is null and class_session_id is not
-- null` — and 20260728120000's own header (lines 60-66) already says a partial index cannot
-- serve the RESTRICT probe, which has to find referencing rows regardless of deleted_at. That
-- was inert under CASCADE (sessions never hard-delete in practice); it is live under RESTRICT.
--
-- A plain, non-partial, non-unique index — every asistencias row with a class_session_id, soft-
-- deleted or not. Pure schema, no RPC change: `create index if not exists` is idempotent and
-- safe out-of-order on live.
create index if not exists asistencias_class_session_id_idx
  on public.asistencias (class_session_id);
