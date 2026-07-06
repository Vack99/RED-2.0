-- Slice #60 (Phase-6 S3 close): asistencias becomes the asistida projection of a reservation
-- (ADR-0010 §5 — "It writes the existing asistencias, which gains a class_session_id (and
-- reservation_id) FK"). Expand-only, idempotent (add-column-if-not-exists + create-index-if-not-exists),
-- so safe on a fresh scratch AND out-of-order on live.
--
-- Both columns are NULLABLE: the front-desk date-based Pasar lista (toggle_pase) keeps writing them NULL
-- and is untouched by this slice; only the session-scoped pasar_lista_sesion RPC (next migration) sets
-- them. No backfill — historical front-desk asistencias have no session/reservation and stay NULL.
--
-- on delete cascade matches the reservation table's own FKs (gym/session/member all cascade there): if a
-- session or reservation were ever hard-deleted its attendance rows follow. In practice neither is hard-
-- deleted (sessions soft-cancel via cancelled_at; reservation cancels via status), so this is inert
-- belt-and-suspenders consistent with §5's "bridge, not a parallel truth".

alter table public.asistencias
  add column if not exists class_session_id uuid references public.class_session (id) on delete cascade;
alter table public.asistencias
  add column if not exists reservation_id uuid references public.reservation (id) on delete cascade;

-- The roster presence read is "active asistencia for (session, cliente)" — a partial index on the active
-- subset keyed by session+cliente is the exact match and stays small (soft-deleted rows excluded). Its
-- leading class_session_id also covers that FK.
create index if not exists asistencias_session_cliente_active_idx
  on public.asistencias (class_session_id, cliente_id)
  where deleted_at is null;

-- Cover the reservation_id FK too (ADR-0013 §5 — every FK column indexed; the base reservation table
-- indexes all of its own). Backs the cascade path and any lookup by reservation.
create index if not exists asistencias_reservation_id_idx
  on public.asistencias (reservation_id);
