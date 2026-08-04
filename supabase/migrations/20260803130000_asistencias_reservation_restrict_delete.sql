-- Attendance-retention CASCADE fix — epic #203 slice 4 (owner ruling 2026-08-03).
--
-- THE DEFECT (verified 2026-08-03): all three FKs guarding attendance are ON DELETE CASCADE —
--   reservation.class_session_id  -> class_session(id)  (20260706170000:49, reservation_class_session_id_fkey)
--   asistencias.class_session_id  -> class_session(id)  (20260706175900:16, asistencias_class_session_id_fkey)
--   asistencias.reservation_id    -> reservation(id)    (20260706175900:18, asistencias_reservation_id_fkey)
-- Deleting a class_session cascade-deletes the ATTENDANCE ROWS themselves — the visit records, not
-- just the link. 20260706175900's own header called this "inert belt-and-suspenders" on the
-- assumption sessions never hard-delete (they soft-cancel via cancelled_at). That assumption was
-- wrong: supabase/seeds/red-demo/2026-07-14-demo-teardown.sql hard-deletes class_session rows in
-- LIVE red-demo, and its own step-5 check reported success (`-- 0`) after the cascade silently
-- destroyed real, RPC-written attendance that happened to reference a torn-down demo session — see
-- that file's own fix, committed alongside this migration, for the mechanism and the corrected check.
--
-- RULING (owner, 2026-08-03): complete member attendance history must be RETAINED (target horizon
-- 1-2 years, feeding a planned analytics page) — ON DELETE RESTRICT on all three FKs. SET NULL was
-- considered and rejected as WORSE than the status quo: `asistencias_origen_kind_ck` (20260728120000)
-- requires `(origen = 'clase') = (class_session_id is not null)` — nulling class_session_id on a
-- post-#89 row (origen='clase') would ERROR outright, and on an older NULL-origen row would silently
-- corrupt provenance (it would now read "libre-shaped" with nothing left to say it wasn't). RESTRICT
-- is the only action that neither destroys nor corrupts: a class_session or reservation that still
-- has attendance simply cannot be hard-deleted — the caller must decide (soft-cancel the session,
-- or explicitly move/remove the attendance first) rather than the database silently choosing for them.
--
-- PRE-VALIDATION (informational — run before applying on LIVE, mirroring 20260728120000's live-check
-- posture; nothing here can fail this migration, since ON DELETE RESTRICT only changes behaviour on a
-- FUTURE delete and adding the FK back re-validates parent-row existence, not delete safety). Rows
-- returned are class_session ids a delete would now refuse:
--
--   select cs.id, cs.gym_id, cs.starts_at,
--          count(distinct a.id) filter (where a.deleted_at is null) as asistencias_activas,
--          count(distinct a.id)                                    as asistencias_total,
--          count(distinct r.id)                                    as reservas
--     from public.class_session cs
--     left join public.asistencias a on a.class_session_id = cs.id
--     left join public.reservation r on r.class_session_id = cs.id
--    group by cs.id, cs.gym_id, cs.starts_at
--   having count(a.id) > 0 or count(r.id) > 0;
--
-- Forward-only, idempotent (drop-constraint-if-exists before add), so safe on a fresh scratch AND
-- out-of-order on live.

-- ── reservation.class_session_id ────────────────────────────────────────────────
alter table public.reservation drop constraint if exists reservation_class_session_id_fkey;
alter table public.reservation
  add constraint reservation_class_session_id_fkey
  foreign key (class_session_id) references public.class_session (id) on delete restrict;

-- ── asistencias.class_session_id ────────────────────────────────────────────────
alter table public.asistencias drop constraint if exists asistencias_class_session_id_fkey;
alter table public.asistencias
  add constraint asistencias_class_session_id_fkey
  foreign key (class_session_id) references public.class_session (id) on delete restrict;

-- ── asistencias.reservation_id ──────────────────────────────────────────────────
alter table public.asistencias drop constraint if exists asistencias_reservation_id_fkey;
alter table public.asistencias
  add constraint asistencias_reservation_id_fkey
  foreign key (reservation_id) references public.reservation (id) on delete restrict;
