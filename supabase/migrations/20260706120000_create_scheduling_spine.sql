-- Scheduling schema spine, slice #42 (PRD #36 S1; data-model §4/§5; ADR-0010; ADR-0013 curated/showcased class).
--
-- Four gym-scoped tables that realize the ADR-0010 invariants AS constraints (not as convention):
--   * schedule_template       — the "Se repite" generator: weekday 0–5 (Lun–Sáb), wall-clock start_time,
--                              duration/capacity (mirroring the session CHECKs, since a template feeds
--                              sessions), is_active. Recurrence lives HERE, never as a session column (§5.3).
--   * class_session           — a scheduled class at an ABSOLUTE instant (starts_at timestamptz, §5.3),
--                              never weekday+string. duration_min CHECK ∈ {30,45,60,75,90}, capacity
--                              CHECK 4–40 (data-model §4 business rules). is_special/special_name = the
--                              one-off clase especial. template_id? = provenance (nullable; a one-off
--                              carries none). room_id? nullable (§6 single-room default).
--                              *** NO spots/occupancy/quedan column — EVER (§5.1: occupancy is DERIVED). ***
--   * class_session_coach     — multi-coach join (§5.4: no single coach column anywhere). gym_id
--                              denormalized so the RLS predicate is one column, no join (ADR-0013 §2).
--   * schedule_template_coach — the template's default coaches, seeding class_session_coach on materialize.
--
-- Tables are ordered so every FK target precedes its referrer (schedule_template before class_session's
-- template_id FK). unique (template_id, starts_at) on class_session is the idempotency guard the
-- materialization RPC relies on: re-running materialization for a week inserts ON CONFLICT DO NOTHING, so
-- no duplicate sessions. NULL template_id (one-off sessions) never collides — Postgres treats NULLs as
-- distinct in a unique index.
--
-- Sessions are INDEPENDENT rows once written: a template edit never reaches an existing session (the
-- template only governs sessions materialized AFTER it), enforced by the RPC never fanning an edit out.
-- template_id / room_id are ON DELETE SET NULL so removing a template/room orphans provenance but keeps
-- the dated sessions on the calendar.
--
-- Expand-only (new tables only), fully idempotent (create-if-not-exists + drop-policy-if-exists), so safe
-- on a fresh scratch project AND out-of-order on the live project. RLS mirrors the #37 catalog spine
-- byte-for-byte (curated/showcased, ADR-0013 §3): is_member_of(gym_id) select, is_staff_of(gym_id)
-- insert+update, NO delete policy, NO anon grant (PRD #36 decision b: anon read is Phase 6). Every gym_id
-- + every FK column indexed (ADR-0013 §2/§5; unindexed-FK advisor). Every helper call wrapped in the
-- (select ...) initplan idiom (ADR-0001/ADR-0013 §2).

-- ── schedule_template (recurrence generator; weekday 0–5 = Lun–Sáb) ─────────────
create table if not exists public.schedule_template (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gym (id) on delete cascade,
  class_type_id  uuid not null references public.class_type (id),
  weekday        int not null check (weekday between 0 and 5),
  start_time     time not null,
  duration_min   int not null check (duration_min in (30, 45, 60, 75, 90)),
  capacity       int not null check (capacity between 4 and 40),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table public.schedule_template enable row level security;
create index if not exists schedule_template_gym_id_idx on public.schedule_template (gym_id);
create index if not exists schedule_template_class_type_id_idx on public.schedule_template (class_type_id);

-- ── class_session (absolute instant; NO occupancy column) ───────────────────────
create table if not exists public.class_session (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gym (id) on delete cascade,
  class_type_id  uuid not null references public.class_type (id),
  starts_at      timestamptz not null,
  duration_min   int not null check (duration_min in (30, 45, 60, 75, 90)),
  capacity       int not null check (capacity between 4 and 40),
  is_special     boolean not null default false,
  special_name   text,
  template_id    uuid references public.schedule_template (id) on delete set null,
  room_id        uuid references public.room (id) on delete set null,
  -- Cancel is a durable SOFT flag, not a row delete: a template-derived session that was hard-deleted
  -- would be RESURRECTED by the next materialization pass (its (template_id, starts_at) guard row is
  -- gone). Keeping the tombstoned row makes the ON CONFLICT DO NOTHING guard skip it, so a cancelled
  -- recurring instance stays cancelled (the ADR-0010 holiday-move case). This is NOT occupancy (§5.1
  -- forbids only stored occupancy) — it is an event timestamp, mirroring asistencias.deleted_at. Reads
  -- (S5) filter cancelled_at IS NULL.
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  constraint class_session_template_starts_uq unique (template_id, starts_at)
);
alter table public.class_session enable row level security;
create index if not exists class_session_gym_id_idx on public.class_session (gym_id);
create index if not exists class_session_class_type_id_idx on public.class_session (class_type_id);
create index if not exists class_session_room_id_idx on public.class_session (room_id);
-- Agenda day/week reads scan (gym_id, starts_at); the unique index already covers template_id lookups.
create index if not exists class_session_gym_starts_idx on public.class_session (gym_id, starts_at);

-- ── class_session_coach (multi-coach join; no single coach column) ──────────────
create table if not exists public.class_session_coach (
  gym_id      uuid not null references public.gym (id) on delete cascade,
  session_id  uuid not null references public.class_session (id) on delete cascade,
  coach_id    uuid not null references public.coach (id) on delete cascade,
  primary key (session_id, coach_id)
);
alter table public.class_session_coach enable row level security;
create index if not exists class_session_coach_gym_id_idx on public.class_session_coach (gym_id);
create index if not exists class_session_coach_coach_id_idx on public.class_session_coach (coach_id);

-- ── schedule_template_coach (default coaches; seed the session join on materialize) ──
create table if not exists public.schedule_template_coach (
  gym_id       uuid not null references public.gym (id) on delete cascade,
  template_id  uuid not null references public.schedule_template (id) on delete cascade,
  coach_id     uuid not null references public.coach (id) on delete cascade,
  primary key (template_id, coach_id)
);
alter table public.schedule_template_coach enable row level security;
create index if not exists schedule_template_coach_gym_id_idx on public.schedule_template_coach (gym_id);
create index if not exists schedule_template_coach_coach_id_idx on public.schedule_template_coach (coach_id);

-- ── RLS: curated/showcased class on all four tables ─────────────────────────────
drop policy if exists "schedule_template_member_select" on public.schedule_template;
create policy "schedule_template_member_select" on public.schedule_template for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "schedule_template_staff_insert" on public.schedule_template;
create policy "schedule_template_staff_insert" on public.schedule_template for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "schedule_template_staff_update" on public.schedule_template;
create policy "schedule_template_staff_update" on public.schedule_template for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

drop policy if exists "class_session_member_select" on public.class_session;
create policy "class_session_member_select" on public.class_session for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "class_session_staff_insert" on public.class_session;
create policy "class_session_staff_insert" on public.class_session for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "class_session_staff_update" on public.class_session;
create policy "class_session_staff_update" on public.class_session for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

drop policy if exists "class_session_coach_member_select" on public.class_session_coach;
create policy "class_session_coach_member_select" on public.class_session_coach for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "class_session_coach_staff_insert" on public.class_session_coach;
create policy "class_session_coach_staff_insert" on public.class_session_coach for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "class_session_coach_staff_update" on public.class_session_coach;
create policy "class_session_coach_staff_update" on public.class_session_coach for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
-- Staff DELETE (named present need, diverges from the pure #37 no-delete pattern): edit_class_session
-- replaces a session's coach set by delete-then-insert, which requires removing the superseded join rows.
-- No parent table gets a delete policy — a session is cancelled via cancelled_at, never deleted.
drop policy if exists "class_session_coach_staff_delete" on public.class_session_coach;
create policy "class_session_coach_staff_delete" on public.class_session_coach for delete to authenticated
  using ((select public.is_staff_of(gym_id)));

drop policy if exists "schedule_template_coach_member_select" on public.schedule_template_coach;
create policy "schedule_template_coach_member_select" on public.schedule_template_coach for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "schedule_template_coach_staff_insert" on public.schedule_template_coach;
create policy "schedule_template_coach_staff_insert" on public.schedule_template_coach for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "schedule_template_coach_staff_update" on public.schedule_template_coach;
create policy "schedule_template_coach_staff_update" on public.schedule_template_coach for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
