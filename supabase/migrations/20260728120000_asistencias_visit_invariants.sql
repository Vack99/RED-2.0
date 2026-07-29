-- #89 slice 1, part (a) — asistencias becomes a VISIT ledger with real invariants.
--
-- FORWARD-ONLY, and there is nothing to migrate: live prod was queried 2026-07-28 and ZERO rows
-- violate either new unique index (class-context duplicates: 0; same-day class-less duplicates: 0).
-- Retroactivity was therefore moot and never asked (design handoff §5, open question 3).
--
-- NO BACKFILL of `origen`, deliberately: pre-#89 rows with class_session_id IS NULL keep
-- `origen IS NULL` = provenance UNKNOWN. Forge's 268 historical front-desk rows may well be
-- classes nobody recorded on the Agenda — stamping them 'libre' would invent data. `origen` states
-- a kind only for rows written from 20260728121000 onward; readers must treat NULL as "unknown",
-- never as "libre".
--
-- WHAT CHANGES, and why it is the substance of #89:
--   * ACCESO LIBRE stops being "class_session_id IS NULL" (which means *unknown*) and becomes a
--     STATED kind. Every product that offers class-less access models it as a first-class object
--     (Mindbody Arrivals, PushPress Open Gym, TeamUp Check In); modelling it as the absence of a
--     class was our anomaly, and it is why "did open gym" and "did a class nobody recorded" were
--     the same row.
--   * Uniqueness re-keys from the DAY to the CONTEXT. The unit of a visit is the class instance
--     (owner ruling R1), so "one visit per (member, class)" is the real invariant; class-less
--     visits get their own bound, "one per (member, day)", per the owner's slice-1 deferral (#168
--     carries same-context repeats). Both were previously hand-written `exists` guards and an
--     `order by created_at desc limit 1` convention inside toggle_pase (20260710124000:69-74).
--     They are database guarantees now, so the RPC no longer has to be the only thing standing
--     between the ledger and a double row.
--
-- Expand-only and idempotent (add-column-if-not-exists, drop-constraint-if-exists before add,
-- create-index-if-not-exists, create-or-replace-function), so it is safe on a fresh scratch AND
-- out-of-order on live, and re-applies cleanly end to end.

-- ── (1) origen — the stated visit kind ──────────────────────────────────────────
-- Nullable, no default (see the header). Writers, both in the sibling migration 20260728121000:
-- toggle_pase writes 'libre', pasar_lista_sesion writes 'clase'.
alter table public.asistencias
  add column if not exists origen text;

alter table public.asistencias drop constraint if exists asistencias_origen_ck;
alter table public.asistencias
  add constraint asistencias_origen_ck check (origen in ('libre', 'clase'));

-- ── (2) origen ⇔ class_session_id coherence ─────────────────────────────────────
-- The kind and the context cannot disagree: 'clase' REQUIRES a session, 'libre' FORBIDS one.
-- Without this, `origen` would be a decorative label a future writer could contradict — the exact
-- failure mode the column exists to end. NULL origen is exempt (unknown provenance, see header).
alter table public.asistencias drop constraint if exists asistencias_origen_kind_ck;
alter table public.asistencias
  add constraint asistencias_origen_kind_ck
  check (origen is null or ((origen = 'clase') = (class_session_id is not null)));

-- ── (3) one active visit per (member, class) ────────────────────────────────────
-- The exact sibling of reservation_member_session_uq (20260706170000:62), applied to attendance.
-- Partial on `deleted_at is null` so an untoggled (soft-deleted) row never blocks a re-mark, and on
-- `class_session_id is not null` so class-less rows fall to index (4) instead.
--
-- Column order is class_session_id-leading ON PURPOSE: it makes this unique index a drop-in
-- superset of the non-unique asistencias_session_cliente_active_idx (20260706175900:23-25) it
-- replaces, so the roster's "active asistencia for (session, cliente)" read keeps its index and this
-- step is index-count-neutral (one created, one dropped). Order is irrelevant to the uniqueness itself.
--
-- What it does NOT do is cover the class_session_id FK. Both this index and the one it replaces are
-- PARTIAL on `deleted_at is null`, and a partial index cannot serve the ON DELETE CASCADE referential
-- probe, which has to find referencing rows regardless of deleted_at. That was never true of the old
-- index either — 20260706175900:22's "its leading class_session_id also covers that FK" was wrong when
-- it was written, so nothing regresses here. It stays inert in practice for the reason that migration
-- gives for the cascade itself (20260706175900:10-13): class_session rows soft-cancel via cancelled_at
-- and are never hard-deleted, so the probe never runs.
create unique index if not exists asistencias_sesion_cliente_activa_uq
  on public.asistencias (class_session_id, cliente_id)
  where deleted_at is null and class_session_id is not null;

drop index if exists public.asistencias_session_cliente_active_idx;

-- ── (4) one active ACCESO LIBRE visit per (member, day) ─────────────────────────
-- The bound of the deferral ruling: slice 1 allows at most one class-less visit per member per
-- day; tap-again stays undo. #168 revisits appending a second same-context visit beyond the
-- cooldown. Until then this is a guarantee, not a convention.
create unique index if not exists asistencias_cliente_fecha_libre_uq
  on public.asistencias (cliente_id, fecha)
  where deleted_at is null and class_session_id is null;

-- ── (5) the aggregate-reader sweep ──────────────────────────────────────────────
-- A member may now hold TWO active rows on one day (one 'clase' + one 'libre' — the cooldown in
-- 20260728121000 RECORDS the second arrival instead of refusing it). So a row count is no longer a
-- count of people, or of days, and every aggregate reader over asistencias had to be re-checked.
-- The whole sweep, and its verdict:
--   * marcadas_presencia (20260714100000:37) — already `count(distinct cliente_id)`. The day strip and
--     the calendar therefore already mean "distinct members present". UNTOUCHED.
--   * marcadas_por_gym   (20260714090000:35) — already `array_agg(distinct cliente_id)`. UNTOUCHED.
--   * asistencias_mes_por_cliente (20260714070000:26-37) — `count(*)`, the one hole: the cooldown pair
--     (one arrival, two rows) would have shown as 2 on the clientes roster. RE-EMITTED below.
--   * getResumenMes / respaldo (packages/data/src/server/resumen.ts, respaldo.ts) — row readers that
--     ship the ledger itself rather than aggregate it; handled TS-side in this same change.
--
-- The re-emission counts DISTINCT fecha — days attended this month. For the one shape that was
-- previously countable twice (two same-day rows) this is a CHANGE, not a preservation: pre-#89
-- `count(*)` would have said 2 for a two-class day. Chosen because the cooldown pair (one arrival,
-- two rows) must not read as 2; the cost is that two REAL classes in one day also read as 1 while
-- the ledger charges 2. Reports counting member-days while the ledger charges per class is a
-- product decision the owner still has to make — tracked as its own issue, not decided here.
-- CREATE OR REPLACE preserves the function's ACL, so the whole grant history stands and nothing is
-- re-issued: authenticated-only EXECUTE (20260714070000:40-42) plus the anon revoke (20260715080000:14).
create or replace function public.asistencias_mes_por_cliente(p_gym_id uuid, p_desde date)
returns table (cliente_id uuid, n int)
language sql
stable
security invoker
set search_path to ''
as $$
  select cliente_id, count(distinct fecha)::int as n
  from public.asistencias
  where gym_id = p_gym_id and deleted_at is null and fecha >= p_desde
  group by cliente_id;
$$;
