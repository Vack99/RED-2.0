-- Catalog schema spine, slice #37 (PRD #36 S0; data-model §3/§4; ADR-0013 curated/showcased class).
--
-- Five gym-scoped tables every later Phase-5 slice FKs onto: coach, class_type (+ its two ordered
-- display-list children class_type_workblock/class_type_bring_item), room. Expand-only (new tables
-- only, no ALTER of any existing table), fully idempotent (create-if-not-exists + drop-policy-if-
-- exists), so safe on a fresh preview branch AND out-of-order on the live project.
--
-- RLS shape mirrors the existing curated/showcased class byte-for-byte (paquetes/perfil/plantillas,
-- 20260702173309): select via is_member_of(gym_id) to authenticated, insert+update via
-- is_staff_of(gym_id) to authenticated, NO delete policy (matches paquetes — soft-remove via
-- coach.is_active; class_type/room have no removal path yet, a later slice's job if ever needed),
-- NO anon grant anywhere (PRD #36 decision b: anon read is Phase 6, riding the client marketing
-- pages that consume it). Every gym_id is indexed (ADR-0013 §2/§5); the two child tables also index
-- their class_type_id FK (schema-foreign-key-indexes) and denormalize gym_id onto themselves rather
-- than joining through class_type in every policy (ADR-0013 §2: one predicate per class, no join).
-- Every helper call wrapped in the (select ...) initplan idiom (ADR-0001/ADR-0013 §2).

-- ── coach ──────────────────────────────────────────────────────────────────────
create table if not exists public.coach (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gym (id) on delete cascade,
  name        text not null,
  initials    text not null,
  role        text not null,
  specialty   text,
  bio         text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.coach enable row level security;
create index if not exists coach_gym_id_idx on public.coach (gym_id);

-- ── class_type (operator-extensible; name unique per gym) ──────────────────────
create table if not exists public.class_type (
  id                     uuid primary key default gen_random_uuid(),
  gym_id                 uuid not null references public.gym (id) on delete cascade,
  name                   text not null,
  sala                   text,
  level                  text,
  description            text,
  default_duration_min   int,
  created_at             timestamptz not null default now(),
  constraint class_type_name_gym_uq unique (gym_id, name)
);
alter table public.class_type enable row level security;
create index if not exists class_type_gym_id_idx on public.class_type (gym_id);

-- ── class_type_workblock (ordered display list; e.g. "Calentamiento", "AMRAP") ──
create table if not exists public.class_type_workblock (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gym (id) on delete cascade,
  class_type_id  uuid not null references public.class_type (id) on delete cascade,
  label          text not null,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);
alter table public.class_type_workblock enable row level security;
create index if not exists class_type_workblock_gym_id_idx on public.class_type_workblock (gym_id);
create index if not exists class_type_workblock_class_type_id_idx on public.class_type_workblock (class_type_id);

-- ── class_type_bring_item (ordered display list; e.g. "Toalla", "Botella de agua") ──
create table if not exists public.class_type_bring_item (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gym (id) on delete cascade,
  class_type_id  uuid not null references public.class_type (id) on delete cascade,
  label          text not null,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);
alter table public.class_type_bring_item enable row level security;
create index if not exists class_type_bring_item_gym_id_idx on public.class_type_bring_item (gym_id);
create index if not exists class_type_bring_item_class_type_id_idx on public.class_type_bring_item (class_type_id);

-- ── room (§6 parked default: single room, nullable class_session.room_id; no authoring UI) ──
create table if not exists public.room (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gym (id) on delete cascade,
  name        text not null,
  capacity    int,
  created_at  timestamptz not null default now()
);
alter table public.room enable row level security;
create index if not exists room_gym_id_idx on public.room (gym_id);

-- ── RLS: curated/showcased class on all five tables ─────────────────────────────
drop policy if exists "coach_member_select" on public.coach;
create policy "coach_member_select" on public.coach for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "coach_staff_insert" on public.coach;
create policy "coach_staff_insert" on public.coach for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "coach_staff_update" on public.coach;
create policy "coach_staff_update" on public.coach for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

drop policy if exists "class_type_member_select" on public.class_type;
create policy "class_type_member_select" on public.class_type for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "class_type_staff_insert" on public.class_type;
create policy "class_type_staff_insert" on public.class_type for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "class_type_staff_update" on public.class_type;
create policy "class_type_staff_update" on public.class_type for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

drop policy if exists "class_type_workblock_member_select" on public.class_type_workblock;
create policy "class_type_workblock_member_select" on public.class_type_workblock for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "class_type_workblock_staff_insert" on public.class_type_workblock;
create policy "class_type_workblock_staff_insert" on public.class_type_workblock for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "class_type_workblock_staff_update" on public.class_type_workblock;
create policy "class_type_workblock_staff_update" on public.class_type_workblock for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

drop policy if exists "class_type_bring_item_member_select" on public.class_type_bring_item;
create policy "class_type_bring_item_member_select" on public.class_type_bring_item for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "class_type_bring_item_staff_insert" on public.class_type_bring_item;
create policy "class_type_bring_item_staff_insert" on public.class_type_bring_item for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "class_type_bring_item_staff_update" on public.class_type_bring_item;
create policy "class_type_bring_item_staff_update" on public.class_type_bring_item for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

drop policy if exists "room_member_select" on public.room;
create policy "room_member_select" on public.room for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "room_staff_insert" on public.room;
create policy "room_staff_insert" on public.room for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "room_staff_update" on public.room;
create policy "room_staff_update" on public.room for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
